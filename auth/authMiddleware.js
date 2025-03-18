const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { promisify } = require('util');
const { LogManager } = require('../utils/logger');
const { MetricsManager } = require('../utils/metricsManager');
const { CacheManager } = require('../utils/cache');
const { SecurityManager } = require('../utils/SecurityManager');
const { CircuitBreaker } = require('../utils/circuitBreaker');
const { RateLimiterCluster } = require('../utils/rateLimiter');
const { SubscriptionManager } = require('../utils/SubscriptionManager');

// Initialize core services
const logger = new LogManager().logger;
const cache = new CacheManager();
const metrics = MetricsManager.getInstance();
const breaker = new CircuitBreaker();
const rateLimiter = new RateLimiterCluster();
const subscriptionManager = SubscriptionManager.getInstance();
const securityManager = new SecurityManager(); // Ensure SecurityManager is initialized

// Comprehensive AuthMiddleware factory with enhanced security features
const AuthMiddlewareFactory = {
    // Class constants
    VERSION: '5.0.0',
    REQUIRED_NODE_VERSION: '>=20.0.0',

    // Security configuration
    AUTH_SETTINGS: {
        maxFailedAttempts: 5,
        lockoutDuration: 30 * 60 * 1000, // 30 minutes
        tokenRotationInterval: 12 * 60 * 1000, // 12 hours
        minPasswordLength: 12,
        bcryptRounds: 12,
        jwtExpiry: '1h',
        refreshTokenExpiry: '7d',
        mfaRequired: process.env.NODE_ENV === 'production'
    },

    // Cache configuration
    CACHE_SETTINGS: {
        tokenTTL: 3600,
        userTTL: 300,
        sessionTTL: 86400
    },

    // Rate limiting configuration
    RATE_LIMITS: {
        standard: {
            windowMs: 15 * 60 * 1000,
            max: 100
        },
        authenticated: {
            windowMs: 15 * 60 * 1000,
            max: 300
        },
        premium: {
            windowMs: 15 * 60 * 1000,
            max: 1000
        }
    },

    // Private properties
    _isInitialized: false,
    _mongoClient: null,
    _tokenBlacklist: new Set(),
    _securityMetrics: new Map(),
    _connectionPool: new Map(),
    _lastTokenRotation: null,
    _jwtSecret: null,
    _securityPepper: null,
    _managers: null,
    _db: null,

    // Initialize the auth system
    async initialize() {
        if (this._isInitialized) return;

        try {
            logger.info(`Initializing AuthMiddleware v${this.VERSION}`);

            // Initialize JWT and security keys
            this._jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
            this._securityPepper = process.env.SECURITY_PEPPER || crypto.randomBytes(32).toString('hex');

            // Initialize database connection
            await this._initializeDatabaseConnection();

            // Initialize collections and indexes
            await this._initializeCollections();

            // Set up security features
            await this._initializeSecurityFeatures();

            // Start background tasks
            this._startBackgroundTasks();

            this._isInitialized = true;
            logger.info('Auth middleware initialization complete');
            return true;

        } catch (error) {
            logger.error('Critical: Auth middleware initialization failed:', error);
            throw new AuthInitializationError('Failed to initialize auth system', error);
        }
    },

    async _initializeDatabaseConnection() {
        try {
            const client = await MongoClient.connect(process.env.MONGODB_URI, {
                maxPoolSize: 50,
                connectTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                serverApi: {
                    version: '1',
                    strict: true,
                    deprecationErrors: true
                }
            });

            this._mongoClient = client;
            this._db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
            logger.info('Database connection established successfully');

        } catch (error) {
            logger.error('Database connection failed:', error);
            throw new DatabaseConnectionError('Failed to connect to database', error);
        }
    },

    async _initializeCollections() {
        try {
            // Create required indexes
            await Promise.all([
                this._db.collection('users').createIndex({ email: 1 }, { unique: true }),
                this._db.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true }),
                this._db.collection('sessions').createIndex({ userId: 1 }),
                this._db.collection('sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }),
                this._db.collection('auth_logs').createIndex({ timestamp: 1 }),
                this._db.collection('auth_logs').createIndex({ userId: 1 }),
                this._db.collection('tokens').createIndex({ userId: 1 }),
                this._db.collection('tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
            ]);

            logger.info('Database collections initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize collections:', error);
            throw new DatabaseInitializationError('Failed to initialize collections', error);
        }
    },

    async _initializeSecurityFeatures() {
        try {
            // Set up token blacklist cleanup interval
            setInterval(() => {
                this._cleanupTokenBlacklist();
            }, 3600000); // Every hour

            // Set up token rotation
            this._lastTokenRotation = new Date();
            setInterval(() => {
                this._rotateJWTSecret();
            }, this.AUTH_SETTINGS.tokenRotationInterval);

            // Initialize security metrics
            this._securityMetrics.set('failedLogins', new Map());
            this._securityMetrics.set('suspiciousActivities', new Map());
            this._securityMetrics.set('blockedIPs', new Set());

            logger.info('Security features initialized');

        } catch (error) {
            logger.error('Failed to initialize security features:', error);
            throw error;
        }
    },

    _startBackgroundTasks() {
        // Set up metrics collection
        setInterval(() => {
            this._collectSecurityMetrics();
        }, 60000); // Every minute

        // Set up session cleanup
        setInterval(() => {
            this._cleanupExpiredSessions();
        }, 3600000); // Every hour

        logger.info('Background tasks started');
    },

    _cleanupTokenBlacklist() {
        try {
            const now = Date.now();
            let removedCount = 0;

            for (const entry of this._tokenBlacklist) {
                if (entry.expiresAt < now) {
                    this._tokenBlacklist.delete(entry);
                    removedCount++;
                }
            }

            logger.debug(`Removed ${removedCount} expired tokens from blacklist`);
        } catch (error) {
            logger.error('Token blacklist cleanup error:', error);
        }
    },

    async _rotateJWTSecret() {
        try {
            const newSecret = crypto.randomBytes(64).toString('hex');
            logger.info('Rotating JWT secret');

            // Store old secret temporarily for verification
            const oldSecret = this._jwtSecret;
            this._jwtSecret = newSecret;

            // Update last rotation time
            this._lastTokenRotation = new Date();

            // Save rotation event
            await this._db.collection('security_events').insertOne({
                type: 'JWT_ROTATION',
                timestamp: new Date(),
                details: {
                    rotationId: crypto.randomUUID()
                }
            });

            logger.info('JWT secret rotation completed');
        } catch (error) {
            logger.error('JWT secret rotation failed:', error);
        }
    },

    async _cleanupExpiredSessions() {
        try {
            const result = await this._db.collection('sessions').deleteMany({
                lastActivity: { $lt: new Date(Date.now() - 86400000) } // Older than 24 hours
            });

            logger.debug(`Removed ${result.deletedCount} expired sessions`);
        } catch (error) {
            logger.error('Session cleanup error:', error);
        }
    },

    _collectSecurityMetrics() {
        try {
            const metrics = {
                timestamp: new Date(),
                activeUsers: this._connectionPool.size,
                blacklistedTokens: this._tokenBlacklist.size,
                failedLogins: this._securityMetrics.get('failedLogins').size,
                suspiciousActivities: this._securityMetrics.get('suspiciousActivities').size,
                blockedIPs: this._securityMetrics.get('blockedIPs').size
            };

            this._db.collection('security_metrics').insertOne(metrics);
        } catch (error) {
            logger.error('Security metrics collection error:', error);
        }
    },

    // Authentication middleware implementation
    async _authenticate(req, res, next) {
        if (!this._isInitialized) {
            await this.initialize();
        }

        const requestId = crypto.randomUUID();
        req.requestId = requestId;

        try {
            // Extract and validate token with circuit breaker
            const tokenValidation = await breaker.execute('tokenValidation', 
                async () => this._validateToken(req)
            );

            if (!tokenValidation.valid) {
                return this._handleAuthenticationFailure(res, tokenValidation.error, requestId);
            }

            // Comprehensive security checks
            const securityCheck = await this._performSecurityChecks(req, tokenValidation.data);
            if (!securityCheck.passed) {
                await this._logSecurityViolation(req, securityCheck.reason);
                return this._handleSecurityViolation(res, securityCheck.reason, requestId);
            }

            // Load and verify user with caching
            const userDetails = await this._loadUserDetails(tokenValidation.data.userId);
            if (!userDetails.valid) {
                return this._handleInvalidUser(res, userDetails.reason, requestId);
            }

            // Session management
            const session = await this._manageSession(req, userDetails.user);

            // Enhance request context
            await this._enhanceRequestContext(req, userDetails.user, session);

            // Update metrics
            await this._updateAuthMetrics(req, userDetails.user);

            // Token rotation check
            if (this._shouldRotateToken(tokenValidation.data)) {
                await this._rotateToken(req, res, userDetails.user);
            }

            next();

        } catch (error) {
            await this._handleAuthError(error, req, res, requestId);
        }
    },

    async _validateToken(req) {
        const token = this._extractToken(req);
        if (!token) {
            return { valid: false, error: 'NO_TOKEN_PROVIDED' };
        }

        try {
            // Multi-layer token validation
            const decoded = jwt.verify(token, this._jwtSecret);
            
            // Enhanced security checks
            if (await this._isTokenBlacklisted(token)) {
                return { valid: false, error: 'TOKEN_REVOKED' };
            }

            if (await this._isTokenCompromised(token, decoded)) {
                await this._handleCompromisedToken(token, decoded.userId);
                return { valid: false, error: 'TOKEN_COMPROMISED' };
            }

            const tokenStatus = await this._validateTokenStatus(decoded);
            if (!tokenStatus.valid) {
                return { valid: false, error: tokenStatus.error };
            }

            return { valid: true, data: decoded };

        } catch (error) {
            logger.error('Token validation error:', error);
            return { valid: false, error: this._normalizeTokenError(error) };
        }
    },

    _extractToken(req) {
        // Try Authorization header first
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Try cookie next if allowed
        if (req.cookies && req.cookies.token) {
            return req.cookies.token;
        }

        // Try query parameter as a last resort
        if (req.query && req.query.token) {
            return req.query.token;
        }

        return null;
    },

    async _isTokenBlacklisted(token) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        return this._tokenBlacklist.has(tokenHash);
    },

    async _isTokenCompromised(token, decoded) {
        // Check token fingerprint against stored value
        const storedFingerprint = await cache.get(`token_fingerprint:${decoded.userId}`);
        if (storedFingerprint && storedFingerprint !== decoded.fingerprint) {
            return true;
        }

        // Check for unusual activity patterns
        const suspiciousActivity = await this._detectSuspiciousTokenUsage(token, decoded);
        return suspiciousActivity.isCompromised;
    },

    async _detectSuspiciousTokenUsage(token, decoded) {
        // Implement advanced token usage analysis
        // This is a placeholder implementation
        return { isCompromised: false };
    },

    async _validateTokenStatus(decoded) {
        // Check expiration time
        if (!decoded.exp || decoded.exp < Date.now() / 1000) {
            return { valid: false, error: 'TOKEN_EXPIRED' };
        }

        // Check if user account still exists and is active
        const userStatus = await this._checkUserStatus(decoded.userId);
        if (!userStatus.valid) {
            return { valid: false, error: userStatus.error };
        }

        // Check for token version mismatch
        const currentTokenVersion = await this._getCurrentTokenVersion(decoded.userId);
        if (decoded.version && decoded.version < currentTokenVersion) {
            return { valid: false, error: 'TOKEN_VERSION_MISMATCH' };
        }

        return { valid: true };
    },

    async _checkUserStatus(userId) {
        // Try cache first
        const cachedStatus = await cache.get(`user_status:${userId}`);
        if (cachedStatus) {
            return cachedStatus;
        }

        // Query database
        const user = await this._db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { status: 1, locked: 1, suspended: 1 } }
        );

        if (!user) {
            return { valid: false, error: 'USER_NOT_FOUND' };
        }

        if (user.locked) {
            return { valid: false, error: 'ACCOUNT_LOCKED' };
        }

        if (user.suspended) {
            return { valid: false, error: 'ACCOUNT_SUSPENDED' };
        }

        if (user.status !== 'active') {
            return { valid: false, error: 'ACCOUNT_INACTIVE' };
        }

        // Cache result
        const result = { valid: true };
        await cache.set(`user_status:${userId}`, result, this.CACHE_SETTINGS.userTTL);
        return result;
    },

    async _getCurrentTokenVersion(userId) {
        const cachedVersion = await cache.get(`token_version:${userId}`);
        if (cachedVersion !== undefined) {
            return cachedVersion;
        }

        const user = await this._db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { tokenVersion: 1 } }
        );

        const version = user?.tokenVersion || 0;
        await cache.set(`token_version:${userId}`, version, this.CACHE_SETTINGS.userTTL);
        return version;
    },

    _normalizeTokenError(error) {
        if (error.name === 'TokenExpiredError') {
            return 'TOKEN_EXPIRED';
        }
        if (error.name === 'JsonWebTokenError') {
            return 'INVALID_TOKEN';
        }
        if (error.name === 'NotBeforeError') {
            return 'TOKEN_NOT_ACTIVE';
        }
        return 'TOKEN_VALIDATION_FAILED';
    },

    async _performSecurityChecks(req, tokenData) {
        const checks = [
            this._validateDeviceFingerprint(req, tokenData),
            this._validateIPAddress(req, tokenData),
            this._validateUserAgent(req, tokenData),
            this._checkRateLimit(req, tokenData),
            this._detectSuspiciousActivity(req, tokenData),
            this._validateSession(req, tokenData),
            this._checkAccountStatus(tokenData.userId),
            this._validatePermissions(tokenData)
        ];

        try {
            const results = await Promise.all(checks);
            
            // Analyze check results
            const failedChecks = results.filter(check => !check.passed);
            if (failedChecks.length > 0) {
                return {
                    passed: false,
                    reason: this._aggregateSecurityFailures(failedChecks)
                };
            }

            return { passed: true };

        } catch (error) {
            logger.error('Security check error:', error);
            throw new SecurityCheckError('Failed to complete security checks', error);
        }
    },

    async _validateDeviceFingerprint(req, tokenData) {
        // Implementation depends on your fingerprinting approach
        // This is a placeholder implementation
        return { passed: true };
    },

    async _validateIPAddress(req, tokenData) {
        const ip = req.ip;
        
        // Check if IP is on blocklist
        if (this._securityMetrics.get('blockedIPs').has(ip)) {
            return { passed: false, reason: 'IP_BLOCKED' };
        }

        // Check for IP address change
        const cachedIP = await cache.get(`last_ip:${tokenData.userId}`);
        if (cachedIP && cachedIP !== ip) {
            // Log IP change but don't block - could be legitimate
            await this._logIPChange(tokenData.userId, cachedIP, ip);
            // Update cached IP
            await cache.set(`last_ip:${tokenData.userId}`, ip, this.CACHE_SETTINGS.sessionTTL);
        }

        return { passed: true };
    },

    async _logIPChange(userId, oldIP, newIP) {
        await this._db.collection('auth_logs').insertOne({
            type: 'IP_CHANGE',
            userId: new ObjectId(userId),
            oldIP,
            newIP,
            timestamp: new Date()
        });
    },

    async _validateUserAgent(req, tokenData) {
        const userAgent = req.headers['user-agent'];
        
        // Check for user agent change
        const cachedUserAgent = await cache.get(`last_ua:${tokenData.userId}`);
        if (cachedUserAgent && cachedUserAgent !== userAgent) {
            // Log user agent change but don't block
            await this._logUserAgentChange(tokenData.userId, cachedUserAgent, userAgent);
            // Update cached user agent
            await cache.set(`last_ua:${tokenData.userId}`, userAgent, this.CACHE_SETTINGS.sessionTTL);
        }

        return { passed: true };
    },

    async _logUserAgentChange(userId, oldUA, newUA) {
        await this._db.collection('auth_logs').insertOne({
            type: 'USER_AGENT_CHANGE',
            userId: new ObjectId(userId),
            oldUserAgent: oldUA,
            newUserAgent: newUA,
            timestamp: new Date()
        });
    },

    async _checkRateLimit(req, tokenData) {
        const ip = req.ip;
        const userId = tokenData.userId;
        
        try {
            // Apply rate limiting based on user's subscription level
            const userSubscription = await this._getUserSubscriptionTier(userId);
            const rateLimitKey = `${ip}:${userId}`;
            
            let limitResult;
            switch (userSubscription) {
                case 'premium':
                    limitResult = await rateLimiter.checkLimit(rateLimitKey, this.RATE_LIMITS.premium.max);
                    break;
                case 'pro':
                    limitResult = await rateLimiter.checkLimit(rateLimitKey, this.RATE_LIMITS.authenticated.max);
                    break;
                default:
                    limitResult = await rateLimiter.checkLimit(rateLimitKey, this.RATE_LIMITS.standard.max);
            }

            return { passed: limitResult };
        } catch (error) {
            logger.error('Rate limit check failed:', error);
            // Fail open to avoid blocking legitimate users
            return { passed: true };
        }
    },

    async _getUserSubscriptionTier(userId) {
        // Try cache first
        const cachedTier = await cache.get(`subscription:${userId}`);
        if (cachedTier) {
            return cachedTier;
        }

        try {
            // Get from subscription manager
            const subscription = await subscriptionManager.getUserSubscriptionDetails(userId);
            const tier = subscription?.tier || 'basic';
            
            // Cache result
            await cache.set(`subscription:${userId}`, tier, 3600); // 1 hour TTL
            return tier;
        } catch (error) {
            logger.error('Failed to get subscription tier:', error);
            return 'basic'; // Default to basic tier
        }
    },

    async _detectSuspiciousActivity(req, tokenData) {
        // Simple anomaly detection
        // A complete implementation would use machine learning or rules-based approaches
        const anomalyScore = await this._calculateAnomalyScore(req, tokenData);
        
        if (anomalyScore > 0.8) { // High risk
            await this._logSuspiciousActivity(tokenData.userId, req, 'HIGH_RISK_ACTIVITY', anomalyScore);
            return { passed: false, reason: 'SUSPICIOUS_ACTIVITY_DETECTED' };
        }
        
        if (anomalyScore > 0.5) { // Medium risk
            await this._logSuspiciousActivity(tokenData.userId, req, 'MEDIUM_RISK_ACTIVITY', anomalyScore);
            // Allow but log for review
        }

        return { passed: true };
    },

    async _calculateAnomalyScore(req, tokenData) {
        // Placeholder implementation - would integrate with actual anomaly detection system
        return 0.1; // Low risk by default
    },

    async _logSuspiciousActivity(userId, req, activityType, riskScore) {
        await this._db.collection('security_alerts').insertOne({
            userId: new ObjectId(userId),
            type: activityType,
            riskScore,
            timestamp: new Date(),
            details: {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                path: req.path,
                method: req.method
            }
        });
    },

    async _validateSession(req, tokenData) {
        // Check if session exists and is valid
        const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
        if (!sessionId) {
            return { passed: true }; // No session to validate
        }

        const session = await this._getSession(sessionId);
        if (!session) {
            return { passed: false, reason: 'INVALID_SESSION' };
        }

        if (session.userId.toString() !== tokenData.userId) {
            return { passed: false, reason: 'SESSION_USER_MISMATCH' };
        }

        // Update session last activity
        await this._updateSessionActivity(sessionId);
        return { passed: true };
    },

    async _getSession(sessionId) {
        // Try cache first
        const cachedSession = await cache.get(`session:${sessionId}`);
        if (cachedSession) {
            return cachedSession;
        }

        // Query database
        const session = await this._db.collection('sessions').findOne({ _id: new ObjectId(sessionId) });
        if (session) {
            await cache.set(`session:${sessionId}`, session, this.CACHE_SETTINGS.sessionTTL);
        }
        
        return session;
    },

    async _updateSessionActivity(sessionId) {
        await this._db.collection('sessions').updateOne(
            { _id: new ObjectId(sessionId) },
            { $set: { lastActivity: new Date() } }
        );
    },

    async _checkAccountStatus(userId) {
        // Already checked during token validation
        return { passed: true };
    },

    async _validatePermissions(tokenData) {
        // Check if user has required permissions for the request
        // This is a placeholder implementation
        return { passed: true };
    },

    _aggregateSecurityFailures(failedChecks) {
        // Prioritize most severe failure
        const priorities = {
            'ACCOUNT_LOCKED': 1,
            'ACCOUNT_SUSPENDED': 2,
            'SUSPICIOUS_ACTIVITY_DETECTED': 3,
            'IP_BLOCKED': 4,
            'SESSION_USER_MISMATCH': 5,
            'INVALID_SESSION': 6
        };

        return failedChecks.sort((a, b) => {
            const priorityA = priorities[a.reason] || 100;
            const priorityB = priorities[b.reason] || 100;
            return priorityA - priorityB;
        })[0].reason;
    },

    async _loadUserDetails(userId) {
        // Try cache first
        const cachedUser = await cache.get(`user:${userId}`);
        if (cachedUser) {
            return { valid: true, user: cachedUser };
        }

        // Query database
        try {
            const user = await this._db.collection('users').findOne({ _id: new ObjectId(userId) });
            
            if (!user) {
                return { valid: false, reason: 'USER_NOT_FOUND' };
            }

            if (user.status !== 'active') {
                return { valid: false, reason: 'ACCOUNT_INACTIVE' };
            }

            // Cache user data
            await cache.set(`user:${userId}`, user, this.CACHE_SETTINGS.userTTL);
            
            return { valid: true, user };
        } catch (error) {
            logger.error('Error loading user details:', error);
            throw new DatabaseError('Failed to load user details', error);
        }
    },

    async _manageSession(req, user) {
        const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
        
        // If existing session, validate and update
        if (sessionId) {
            const existingSession = await this._getSession(sessionId);
            if (existingSession && existingSession.userId.toString() === user._id.toString()) {
                await this._updateSessionActivity(sessionId);
                return existingSession;
            }
        }

        // Create new session
        const session = {
            userId: user._id,
            deviceId: req.headers['x-device-id'] || crypto.randomUUID(),
            userAgent: req.headers['user-agent'],
            ip: req.ip,
            createdAt: new Date(),
            lastActivity: new Date()
        };

        try {
            const result = await this._db.collection('sessions').insertOne(session);
            session._id = result.insertedId;
            
            // Cache session data
            await cache.set(
                `session:${session._id.toString()}`,
                session,
                this.CACHE_SETTINGS.sessionTTL
            );

            return session;

        } catch (error) {
            logger.error('Session management error:', error);
            throw new SessionError('Failed to manage session', error);
        }
    },

    async _enhanceRequestContext(req, user, session) {
        req.user = {
            id: user._id.toString(),
            email: user.email,
            roles: user.roles || [],
            permissions: await this._getUserPermissions(user),
            subscription: await this._getUserSubscription(user),
            session: {
                id: session._id.toString(),
                createdAt: session.createdAt,
                deviceId: session.deviceId
            }
        };

        // Add security context
        req.security = {
            deviceId: session.deviceId,
            fingerprint: req.headers['x-device-fingerprint'],
            riskScore: await this._calculateRiskScore(req, user),
            accessLevel: await this._determineAccessLevel(user)
        };
    },

    async _getUserPermissions(user) {
        // Calculate effective permissions based on roles
        // This is a placeholder implementation
        return {
            read: true,
            write: user.roles?.includes('admin') || user.roles?.includes('editor'),
            admin: user.roles?.includes('admin')
        };
    },

    async _getUserSubscription(user) {
        try {
            return await subscriptionManager.getUserSubscriptionDetails(user._id.toString());
        } catch (error) {
            logger.error('Error retrieving subscription:', error);
            return { tier: 'basic', status: 'unknown' };
        }
    },

    async _calculateRiskScore(req, user) {
        // Calculate user risk score based on behavioral patterns
        // This is a placeholder implementation
        return 0.1; // Low risk by default
    },

    async _determineAccessLevel(user) {
        if (user.roles?.includes('admin')) {
            return 'admin';
        }
        if (user.roles?.includes('premium')) {
            return 'premium';
        }
        return 'standard';
    },

    async _updateAuthMetrics(req, user) {
        try {
            await metrics.recordAuthSuccess({
                userId: user._id.toString(),
                ip: req.ip,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Error updating auth metrics:', error);
        }
    },

     _shouldRotateToken(tokenData) {
        // Check if token is approaching expiry
        const expiryTime = tokenData.exp * 1000;
        const now = Date.now();
        const timeRemaining = expiryTime - now;
        
        // Rotate if less than 25% of lifetime remains
        const totalLifetime = (tokenData.exp - tokenData.iat) * 1000;
        return timeRemaining < (totalLifetime * 0.25);
    },

    async _rotateToken(req, res, user) {
        try {
            // Generate new token
            const newToken = await this._generateToken(user);
            
            // Set token in response headers
            res.setHeader('X-New-Token', newToken);
            
            // Update cookie if using cookies
            if (req.cookies?.token) {
                res.cookie('token', newToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                });
            }
            
            logger.debug(`Rotated token for user ${user._id}`);
        } catch (error) {
            logger.error('Token rotation error:', error);
        }
    },

    async _generateToken(user) {
        const tokenData = {
            userId: user._id.toString(),
            email: user.email,
            roles: user.roles || [],
            fingerprint: this._generateFingerprint(user._id.toString()),
            version: user.tokenVersion || 0,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        };

        return jwt.sign(tokenData, this._jwtSecret);
    },

    _generateFingerprint(userId) {
        const uniqueValue = `${userId}:${this._securityPepper}:${Date.now()}`;
        return crypto.createHash('sha256').update(uniqueValue).digest('hex').substring(0, 16);
    },

    _handleAuthenticationFailure(res, errorCode, requestId) {
        const errors = {
            'NO_TOKEN_PROVIDED': { status: 401, message: 'Authentication token required' },
            'TOKEN_EXPIRED': { status: 401, message: 'Authentication token has expired' },
            'INVALID_TOKEN': { status: 401, message: 'Invalid authentication token' },
            'TOKEN_REVOKED': { status: 401, message: 'Authentication token has been revoked' },
            'TOKEN_COMPROMISED': { status: 401, message: 'Authentication token compromised' },
            'TOKEN_VERSION_MISMATCH': { status: 401, message: 'Authentication token version mismatch' }
        };

        const error = errors[errorCode] || { status: 401, message: 'Authentication failed' };
        
        return res.status(error.status).json({
            success: false,
            error: error.message,
            code: errorCode,
            errorId: requestId
        });
    },

    _handleSecurityViolation(res, reason, requestId) {
        const violations = {
            'SUSPICIOUS_ACTIVITY_DETECTED': { status: 403, message: 'Suspicious activity detected' },
            'IP_BLOCKED': { status: 403, message: 'Access denied from your location' },
            'INVALID_SESSION': { status: 401, message: 'Invalid session' },
            'SESSION_USER_MISMATCH': { status: 401, message: 'Session validation failed' }
        };

        const violation = violations[reason] || { status: 403, message: 'Security violation detected' };
        
        return res.status(violation.status).json({
            success: false,
            error: violation.message,
            code: reason,
            errorId: requestId
        });
    },

    _handleInvalidUser(res, reason, requestId) {
        const errors = {
            'USER_NOT_FOUND': { status: 401, message: 'User account not found' },
            'ACCOUNT_INACTIVE': { status: 403, message: 'Account is inactive' },
            'ACCOUNT_LOCKED': { status: 403, message: 'Account is locked' },
            'ACCOUNT_SUSPENDED': { status: 403, message: 'Account is suspended' }
        };

        const error = errors[reason] || { status: 401, message: 'User validation failed' };
        
        return res.status(error.status).json({
            success: false,
            error: error.message,
            code: reason,
            errorId: requestId
        });
    },

    async _handleAuthError(error, req, res, requestId) {
        const errorContext = {
            errorId: requestId,
            timestamp: new Date(),
            error: {
                name: error.name,
                message: error.message,
                code: error.code || 'UNKNOWN_ERROR',
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            request: {
                id: requestId,
                ip: req.ip,
                method: req.method,
                path: req.path,
                userAgent: req.get('User-Agent'),
                headers: this._sanitizeHeaders(req.headers)
            }
        };

        // Log error
        logger.error('Authentication error:', errorContext);

        // Update metrics
        await metrics.recordAuthFailure({
            type: error.code || 'UNKNOWN',
            context: errorContext
        });

        // Send sanitized response
        const clientError = this._sanitizeErrorForClient(error);
        res.status(401).json({
            error: clientError.message,
            code: clientError.code,
            errorId: requestId
        });
    },

    _sanitizeHeaders(headers) {
        // Clone headers and remove sensitive information
        const sanitized = { ...headers };
        
        // Remove authentication headers
        delete sanitized.authorization;
        delete sanitized.cookie;
        
        // Remove other potentially sensitive headers
        delete sanitized['x-api-key'];
        delete sanitized['x-session-id'];
        
        return sanitized;
    },

    _sanitizeErrorForClient(error) {
        // Return sanitized error information to client
        return {
            message: error.message,
            code: error.code || 'AUTHENTICATION_ERROR'
        };
    },

    async _logSecurityViolation(req, reason) {
        try {
            await this._db.collection('security_violations').insertOne({
                timestamp: new Date(),
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                path: req.path,
                method: req.method,
                reason,
                userId: req.user?.id,
                deviceId: req.headers['x-device-id']
            });
        } catch (error) {
            logger.error('Error logging security violation:', error);
        }
    },

    validateAdminAccess: async (user) => {
        if (!user || !user.roles) {
            return false;
        }
        return user.roles.includes('admin');
    },

    // Security Helper Methods
    validateTokenPermissions: async (token) => {
        // Implementation placeholder
        return true;
    },

    // Session Management
    invalidateSession: async (userId, deviceId) => {
        // Implementation placeholder
        return true;
    },

    // Metrics and Monitoring
    getMetrics: () => {
        // Implementation placeholder
        return {};
    },

    // Security Status
    getSecurityStatus: async () => {
        // Implementation placeholder
        return { status: 'healthy' };
    }
};

// Authentication middleware for protecting routes
const authenticate = (req, res, next) => {
    // Extract token from request headers
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication token required'
        });
    }
    
    try {
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
};

// Middleware to require authentication
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
    next();
};

// Middleware to require admin role
const requireAdmin = () => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        if (!req.user.roles || !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        next();
    };
};

// Custom Error Classes
class AuthError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

class SecurityViolationError extends AuthError {
    constructor(message, violation, details = {}) {
        super(message, 'SECURITY_VIOLATION', details);
        this.name = 'SecurityViolationError';
        this.violation = violation;
    }
}

class AuthInitializationError extends AuthError {
    constructor(message, originalError) {
        super(message, 'INIT_FAILED', { originalError });
        this.name = 'AuthInitializationError';
    }
}

class DatabaseConnectionError extends AuthError {
    constructor(message, originalError) {
        super(message, 'DATABASE_CONNECTION_ERROR', { originalError });
        this.name = 'DatabaseConnectionError';
    }
}

class DatabaseInitializationError extends AuthError {
    constructor(message, originalError) {
        super(message, 'DATABASE_INIT_ERROR', { originalError });
        this.name = 'DatabaseInitializationError';
    }
}

class SessionError extends AuthError {
    constructor(message, originalError) {
        super(message, 'SESSION_ERROR', { originalError });
        this.name = 'SessionError';
    }
}

class DatabaseError extends AuthError {
    constructor(message, originalError) {
        super(message, 'DATABASE_ERROR', { originalError });
        this.name = 'DatabaseError';
    }
}

class SecurityCheckError extends AuthError {
    constructor(message, originalError) {
        super(message, 'SECURITY_CHECK_ERROR', { originalError });
        this.name = 'SecurityCheckError';
    }
}

class AuthSystemError extends AuthError {
    constructor(message) {
        super(message, 'AUTH_SYSTEM_ERROR');
        this.name = 'AuthSystemError';
    }
}

// Export the middleware
module.exports = {
    authenticate,
    requireAuth,
    requireAdmin,
    AuthError,
    SecurityViolationError,
    AuthInitializationError,
    DatabaseConnectionError,
    DatabaseInitializationError,
    SessionError,
    DatabaseError,
    SecurityCheckError,
    AuthSystemError
};

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Close Redis connection
    try {
      await redisClient.quit();
      console.log('Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }

    // Close MongoDB connection
    try {
      await mongoClient.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }

    process.exit(0);
  });
});