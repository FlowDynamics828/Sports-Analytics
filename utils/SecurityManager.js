// utils/SecurityManager.js

const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/security-error.log',
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: 'logs/security.log'
    })
  ]
});

// Ensure logs directory exists
const fs = require('fs');
const path = require('path');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

/**
 * Enterprise-grade security management with cryptographic operations,
 * token handling, and database integration.
 */
class SecurityManager {
    /**
     * Create a new SecurityManager instance
     * @param {Object} config - Configuration options (optional)
     */
    constructor(config = null) {
        // Default configuration that works without explicit config
        const defaultConfig = {
            pepper: process.env.SECURITY_PEPPER || crypto.randomBytes(32).toString('hex'),
            jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
            tokenExpiryTime: process.env.TOKEN_EXPIRY || '24h',
            enableAuditLogs: process.env.ENABLE_AUDIT_LOGS !== 'false',
            enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
            rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
            rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
            passwordHashIterations: parseInt(process.env.PASSWORD_HASH_ITERATIONS, 10) || 10000,
            securityLogRetention: parseInt(process.env.SECURITY_LOG_RETENTION, 10) || 86400
        };
        
        // Merge provided config with defaults
        this.config = { ...defaultConfig, ...(config || {}) };
        
        // Initialize class properties
        this.mongoClient = null;
        this.pepper = this.config.pepper;
        this.jwtSecret = this.config.jwtSecret;
        this.initialized = false;
        this.connectionStatus = 'disconnected';
        this.maxReconnectAttempts = 5;
        this.reconnectAttempts = 0;
        
        // Database configuration using environment variables
        this.dbConfig = {
            uri: process.env.MONGODB_URI,
            dbName: process.env.MONGODB_DB_NAME || 'sports-analytics',
            options: {
                serverApi: ServerApiVersion.v1,
                maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
                minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
                connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
                socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000
            }
        };
        
        // Memory cache for tokens when DB is unavailable
        this.tokenCache = new Map();
        this.rateLimitCache = new Map();
        
        // Health metrics
        this.metrics = {
            operations: {
                tokens: { generated: 0, verified: 0, invalid: 0 },
                passwords: { hashed: 0, verified: 0, failed: 0 },
                encryption: { encrypted: 0, decrypted: 0, failed: 0 },
                rateLimiting: { checked: 0, exceeded: 0 }
            },
            errors: 0,
            lastError: null,
            lastInitialized: null
        };
        
        // Log initialization
        logger.info('SecurityManager created with configuration', {
            enableAuditLogs: this.config.enableAuditLogs,
            enableRateLimiting: this.config.enableRateLimiting,
            tokenExpiryTime: this.config.tokenExpiryTime,
            // Don't log sensitive values like pepper and jwtSecret
        });
    }

    /**
     * Initialize the security manager and establish database connection
     * @returns {Promise<boolean>} Initialization success status
     */
    async initialize() {
        try {
            // Skip if already initialized
            if (this.initialized && this.mongoClient) {
                return true;
            }
            
            // Initialize MongoDB connection
            if (this.dbConfig.uri) {
                try {
                    this.mongoClient = new MongoClient(this.dbConfig.uri, this.dbConfig.options);
                    await this.mongoClient.connect();
                    
                    // Verify database connection
                    await this.mongoClient.db(this.dbConfig.dbName).command({ ping: 1 });
                    
                    // Initialize security components
                    await this.initializeSecurityComponents();
                    
                    this.connectionStatus = 'connected';
                    this.reconnectAttempts = 0;
                    logger.info('SecurityManager successfully connected to MongoDB');
                } catch (dbError) {
                    // Handle database connection failure gracefully
                    logger.error(`Failed to connect to MongoDB: ${dbError.message}`, { stack: dbError.stack });
                    this.connectionStatus = 'failed';
                    this.metrics.errors++;
                    this.metrics.lastError = {
                        message: dbError.message,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Continue with in-memory fallback
                    logger.info('SecurityManager continuing with in-memory fallback');
                }
            } else {
                logger.warn('No MongoDB URI provided, SecurityManager using in-memory storage only');
                this.connectionStatus = 'memory-only';
            }
            
            this.initialized = true;
            this.metrics.lastInitialized = new Date().toISOString();
            
            return true;
        } catch (error) {
            logger.error(`Failed to initialize security manager: ${error.message}`, { stack: error.stack });
            this.metrics.errors++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            
            // Still mark as initialized to prevent repeated failures
            this.initialized = true;
            return false;
        }
    }

    /**
     * Initialize security collections and indexes
     * @private
     * @returns {Promise<boolean>} Initialization success status
     */
    async initializeSecurityComponents() {
        if (!this.mongoClient) return false;
        
        try {
            // Initialize collections
            const db = this.mongoClient.db(this.dbConfig.dbName);
            this.securityCollection = db.collection('security');
            this.tokensCollection = db.collection('tokens');
            this.auditCollection = db.collection('audit_logs');
            
            // Create indexes
            await Promise.all([
                this.securityCollection.createIndex(
                    { "createdAt": 1 }, 
                    { expireAfterSeconds: this.config.securityLogRetention }
                ),
                this.tokensCollection.createIndex(
                    { "expiresAt": 1 }, 
                    { expireAfterSeconds: 0 }
                ),
                this.tokensCollection.createIndex(
                    { "userId": 1 }
                ),
                this.auditCollection.createIndex(
                    { "timestamp": 1 }
                ),
                this.auditCollection.createIndex(
                    { "userId": 1 }
                ),
                this.auditCollection.createIndex(
                    { "action": 1 }
                )
            ]);
            
            return true;
        } catch (error) {
            logger.error(`Failed to initialize security components: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Clean up resources and close connections
     * @returns {Promise<boolean>} Cleanup success status
     */
    async cleanup() {
        try {
            if (this.mongoClient) {
                await this.mongoClient.close();
                this.mongoClient = null;
            }
            
            // Clear caches
            this.tokenCache.clear();
            this.rateLimitCache.clear();
            
            this.initialized = false;
            this.connectionStatus = 'disconnected';
            
            logger.info('SecurityManager cleaned up successfully');
            return true;
        } catch (error) {
            logger.error(`Failed to cleanup security manager: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Generate a JWT token for a user
     * @param {Object} payload - Token payload (must include userId)
     * @param {string} [expiresIn] - Token expiration time
     * @returns {Promise<string>} Generated JWT token
     */
    async generateToken(payload, expiresIn = null) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            if (!payload || !payload.userId) {
                throw new Error('Token payload must include userId');
            }
            
            const tokenExpiry = expiresIn || this.config.tokenExpiryTime;
            const token = jwt.sign(payload, this.jwtSecret, { expiresIn: tokenExpiry });
            
            // Calculate expiry date
            const expiryMs = tokenExpiry.endsWith('h') 
                ? parseInt(tokenExpiry.replace('h', ''), 10) * 60 * 60 * 1000
                : tokenExpiry.endsWith('m')
                    ? parseInt(tokenExpiry.replace('m', ''), 10) * 60 * 1000
                    : parseInt(tokenExpiry, 10) * 1000;
                    
            const expiresAt = new Date(Date.now() + expiryMs);
            
            // Store token in database if connected
            if (this.mongoClient && this.connectionStatus === 'connected') {
                try {
                    await this.tokensCollection.insertOne({
                        token,
                        createdAt: new Date(),
                        expiresAt,
                        userId: payload.userId
                    });
                } catch (dbError) {
                    logger.warn(`Failed to store token in database: ${dbError.message}`, { 
                        userId: payload.userId 
                    });
                    
                    // Fall back to memory cache
                    this.tokenCache.set(token, {
                        expiresAt,
                        userId: payload.userId
                    });
                }
            } else {
                // Store in memory if no DB connection
                this.tokenCache.set(token, {
                    expiresAt,
                    userId: payload.userId
                });
            }
            
            // Update metrics
            this.metrics.operations.tokens.generated++;
            
            return token;
        } catch (error) {
            logger.error(`Failed to generate token: ${error.message}`, { stack: error.stack });
            this.metrics.errors++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            throw error;
        }
    }

    /**
     * Verify a JWT token
     * @param {string} token - JWT token to verify
     * @returns {Promise<Object>} Decoded token payload
     */
    async verifyToken(token) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            if (!token) {
                throw new Error('Token is required');
            }
            
            // Check token revocation
            let tokenValid = true;
            
            // Check database if connected
            if (this.mongoClient && this.connectionStatus === 'connected') {
                try {
                    const tokenDoc = await this.tokensCollection.findOne({ token });
                    tokenValid = !!tokenDoc;
                } catch (dbError) {
                    logger.warn(`Failed to check token in database: ${dbError.message}`);
                    // Fall back to memory cache
                    tokenValid = this.tokenCache.has(token);
                }
            } else {
                // Check memory cache if no DB connection
                tokenValid = this.tokenCache.has(token);
            }
            
            if (!tokenValid) {
                this.metrics.operations.tokens.invalid++;
                throw new Error('Token not found or revoked');
            }
            
            // Verify JWT
            const decoded = jwt.verify(token, this.jwtSecret);
            
            // Update metrics
            this.metrics.operations.tokens.verified++;
            
            return decoded;
        } catch (error) {
            logger.error(`Failed to verify token: ${error.message}`);
            this.metrics.errors++;
            this.metrics.operations.tokens.invalid++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            throw error;
        }
    }
    
    /**
     * Revoke a token
     * @param {string} token - JWT token to revoke
     * @returns {Promise<boolean>} Revocation success status
     */
    async revokeToken(token) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            if (!token) {
                throw new Error('Token is required');
            }
            
            // Remove from database if connected
            if (this.mongoClient && this.connectionStatus === 'connected') {
                try {
                    await this.tokensCollection.deleteOne({ token });
                } catch (dbError) {
                    logger.warn(`Failed to remove token from database: ${dbError.message}`);
                }
            }
            
            // Remove from memory cache
            this.tokenCache.delete(token);
            
            return true;
        } catch (error) {
            logger.error(`Failed to revoke token: ${error.message}`, { stack: error.stack });
            this.metrics.errors++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            return false;
        }
    }
    
    /**
     * Revoke all tokens for a user
     * @param {string} userId - User ID to revoke tokens for
     * @returns {Promise<boolean>} Revocation success status
     */
    async revokeAllUserTokens(userId) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            if (!userId) {
                throw new Error('User ID is required');
            }
            
            // Remove from database if connected
            if (this.mongoClient && this.connectionStatus === 'connected') {
                try {
                    await this.tokensCollection.deleteMany({ userId });
                } catch (dbError) {
                    logger.warn(`Failed to remove user tokens from database: ${dbError.message}`);
                }
            }
            
            // Remove from memory cache (less efficient but necessary)
            for (const [token, data] of this.tokenCache.entries()) {
                if (data.userId === userId) {
                    this.tokenCache.delete(token);
                }
            }
            
            return true;
        } catch (error) {
            logger.error(`Failed to revoke user tokens: ${error.message}`, { stack: error.stack });
            this.metrics.errors++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            return false;
        }
    }

    /**
     * Hash a password with salt and pepper
     * @param {string} password - Password to hash
     * @returns {Promise<Object>} Hash and salt
     */
    async hashPassword(password) {
        try {
            if (!password) {
                throw new Error('Password is required');
            }
            
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.pbkdf2Sync(
                password + this.pepper,
                salt,
                this.config.passwordHashIterations,
                64,
                'sha512'
            ).toString('hex');
            
            // Update metrics
            this.metrics.operations.passwords.hashed++;
            
            return { hash, salt };
        } catch (error) {
            logger.error(`Failed to hash password: ${error.message}`);
            this.metrics.errors++;
            this.metrics.operations.passwords.failed++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            throw error;
        }
    }

    /**
     * Verify a password against a hash and salt
     * @param {string} password - Password to verify
     * @param {string} hash - Stored hash
     * @param {string} salt - Stored salt
     * @returns {Promise<boolean>} Password verification result
     */
    async verifyPassword(password, hash, salt) {
        try {
            if (!password || !hash || !salt) {
                throw new Error('Password, hash, and salt are required');
            }
            
            const verifyHash = crypto.pbkdf2Sync(
                password + this.pepper,
                salt,
                this.config.passwordHashIterations,
                64,
                'sha512'
            ).toString('hex');
            
            const isValid = hash === verifyHash;
            
            // Update metrics
            if (isValid) {
                this.metrics.operations.passwords.verified++;
            } else {
                this.metrics.operations.passwords.failed++;
            }
            
            return isValid;
        } catch (error) {
            logger.error(`Failed to verify password: ${error.message}`);
            this.metrics.errors++;
            this.metrics.operations.passwords.failed++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            throw error;
        }
    }

    /**
     * Encrypt data using AES-256-GCM
     * @param {any} data - Data to encrypt
     * @returns {Promise<Object>} Encrypted data, IV, and auth tag
     */
    async encryptData(data) {
        try {
            if (data === undefined) {
                throw new Error('Data is required');
            }
            
            // Convert pepper to proper key format if needed
            const key = this.pepper.length === 64 ? Buffer.from(this.pepper, 'hex') : 
                       crypto.createHash('sha256').update(this.pepper).digest();
                       
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            // Update metrics
            this.metrics.operations.encryption.encrypted++;
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            logger.error(`Failed to encrypt data: ${error.message}`);
            this.metrics.errors++;
            this.metrics.operations.encryption.failed++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            throw error;
        }
    }

    /**
     * Decrypt data using AES-256-GCM
     * @param {Object} encryptedData - Data to decrypt
     * @returns {Promise<any>} Decrypted data
     */
    async decryptData(encryptedData) {
        try {
            if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
                throw new Error('Invalid encrypted data format');
            }
            
            // Convert pepper to proper key format if needed
            const key = this.pepper.length === 64 ? Buffer.from(this.pepper, 'hex') : 
                       crypto.createHash('sha256').update(this.pepper).digest();
            
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                key,
                Buffer.from(encryptedData.iv, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            // Update metrics
            this.metrics.operations.encryption.decrypted++;
            
            return JSON.parse(decrypted);
        } catch (error) {
            logger.error(`Failed to decrypt data: ${error.message}`);
            this.metrics.errors++;
            this.metrics.operations.encryption.failed++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            throw error;
        }
    }
    
    /**
     * Create a security audit log
     * @param {Object} logData - Audit log data
     * @returns {Promise<boolean>} Log creation success status
     */
    async createAuditLog(logData) {
        if (!this.config.enableAuditLogs) {
            return true; // Silently succeed if audit logs disabled
        }
        
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            const auditEntry = {
                ...logData,
                timestamp: new Date(),
                ipAddress: logData.ip || 'unknown',
                userAgent: logData.userAgent || 'unknown',
                userId: logData.userId || 'anonymous'
            };
            
            // Store in database if connected
            if (this.mongoClient && this.connectionStatus === 'connected') {
                try {
                    await this.auditCollection.insertOne(auditEntry);
                } catch (dbError) {
                    // Just log the error but don't fail the operation
                    logger.warn(`Failed to store audit log in database: ${dbError.message}`);
                }
            }
            
            // Always log to file as backup
            logger.info('Security audit event', { auditEntry });
            
            return true;
        } catch (error) {
            logger.error(`Failed to create audit log: ${error.message}`, { stack: error.stack });
            return false;
        }
    }

    /**
     * Check if an operation exceeds rate limit
     * @param {string} userId - User ID to check
     * @param {string} action - Action being performed
     * @param {number} [limit] - Maximum operations allowed
     * @param {number} [windowMs] - Time window in milliseconds
     * @returns {Promise<boolean>} True if within limit, false if exceeded
     */
    async checkRateLimit(userId, action, limit = null, windowMs = null) {
        if (!this.config.enableRateLimiting) {
            return true; // Silently succeed if rate limiting disabled
        }
        
        if (!this.initialized) {
            await this.initialize();
        }
        
        const actualLimit = limit || this.config.rateLimitMax;
        const actualWindow = windowMs || this.config.rateLimitWindow;
        
        try {
            // Update metrics
            this.metrics.operations.rateLimiting.checked++;
            
            const now = Date.now();
            const key = `${userId}:${action}`;
            const windowStart = now - actualWindow;
            
            // Try database if connected
            if (this.mongoClient && this.connectionStatus === 'connected') {
                try {
                    const count = await this.securityCollection.countDocuments({
                        userId,
                        action,
                        createdAt: { $gte: new Date(windowStart) }
                    });
                    
                    if (count >= actualLimit) {
                        this.metrics.operations.rateLimiting.exceeded++;
                        return false;
                    }
                    
                    // Record this attempt
                    await this.securityCollection.insertOne({
                        userId,
                        action,
                        createdAt: new Date()
                    });
                    
                    return true;
                } catch (dbError) {
                    logger.warn(`Failed to check rate limit in database: ${dbError.message}`);
                    // Fall back to memory cache
                }
            }
            
            // Use in-memory rate limiting if DB unavailable
            const cache = this.rateLimitCache.get(key) || [];
            const validAttempts = cache.filter(timestamp => timestamp > windowStart);
            
            if (validAttempts.length >= actualLimit) {
                this.metrics.operations.rateLimiting.exceeded++;
                return false;
            }
            
            // Add this attempt
            validAttempts.push(now);
            this.rateLimitCache.set(key, validAttempts);
            
            // Clean up old entries periodically
            if (Math.random() < 0.05) { // 5% chance to clean up
                this._cleanupRateLimitCache();
            }
            
            return true;
        } catch (error) {
            logger.error(`Rate limit check failed: ${error.message}`, { stack: error.stack });
            this.metrics.errors++;
            this.metrics.lastError = {
                message: error.message,
                timestamp: new Date().toISOString()
            };
            
            // In case of error, allow the operation to proceed
            return true;
        }
    }
    
    /**
     * Clean up expired rate limit entries from memory cache
     * @private
     */
    _cleanupRateLimitCache() {
        const now = Date.now();
        const oldestAllowed = now - this.config.rateLimitWindow;
        
        for (const [key, timestamps] of this.rateLimitCache.entries()) {
            const validTimestamps = timestamps.filter(ts => ts > oldestAllowed);
            if (validTimestamps.length === 0) {
                this.rateLimitCache.delete(key);
            } else if (validTimestamps.length !== timestamps.length) {
                this.rateLimitCache.set(key, validTimestamps);
            }
        }
    }

    /**
     * Check security service health
     * @returns {Promise<Object>} Security service health status
     */
    async healthCheck() {
        try {
            let databaseStatus = false;
            
            if (this.mongoClient) {
                try {
                    await this.mongoClient.db(this.dbConfig.dbName).command({ ping: 1 });
                    databaseStatus = true;
                } catch (dbError) {
                    logger.warn(`Database health check failed: ${dbError.message}`);
                    
                    // Try to reconnect if we've lost connection
                    if (this.connectionStatus === 'connected') {
                        this.connectionStatus = 'reconnecting';
                        this._scheduleReconnect();
                    }
                }
            } else {
                // No MongoDB client, using memory only
                databaseStatus = null;
            }
            
            const status = {
                database: databaseStatus,
                initialized: this.initialized,
                connectionStatus: this.connectionStatus,
                jwt: this.jwtSecret !== undefined,
                pepper: this.pepper !== undefined,
                environment: process.env.NODE_ENV,
                metrics: {
                    tokens: this.metrics.operations.tokens,
                    passwords: this.metrics.operations.passwords,
                    encryption: this.metrics.operations.encryption,
                    rateLimiting: this.metrics.operations.rateLimiting,
                    errors: this.metrics.errors
                }
            };
            
            return {
                status: databaseStatus !== false && this.initialized ? 'healthy' : 'degraded',
                components: status,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`Health check failed: ${error.message}`, { stack: error.stack });
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Schedule database reconnection attempt
     * @private
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error(`Maximum reconnection attempts (${this.maxReconnectAttempts}) exceeded`);
            this.connectionStatus = 'failed';
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        logger.info(`Scheduling database reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(async () => {
            try {
                if (this.mongoClient) {
                    try {
                        await this.mongoClient.close();
                    } catch (e) {
                        // Ignore errors during close
                    }
                }
                
                // Try to reconnect
                this.mongoClient = new MongoClient(this.dbConfig.uri, this.dbConfig.options);
                await this.mongoClient.connect();
                await this.mongoClient.db(this.dbConfig.dbName).command({ ping: 1 });
                
                // Reconnection successful
                this.connectionStatus = 'connected';
                this.reconnectAttempts = 0;
                logger.info('Database reconnection successful');
                
                // Reinitialize components
                await this.initializeSecurityComponents();
            } catch (error) {
                logger.error(`Database reconnection attempt ${this.reconnectAttempts} failed: ${error.message}`);
                this._scheduleReconnect();
            }
        }, delay);
    }

    /**
     * Static method to hash a password with SHA-256 (simple version)
     * @param {string} password - Password to hash
     * @returns {string} Hashed password
     */
    static hashPassword(password) {
        if (!password) {
            throw new Error('Password is required');
        }
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    /**
     * Static method to verify a password against a SHA-256 hash
     * @param {string} password - Password to verify
     * @param {string} hash - Hash to verify against
     * @returns {boolean} Verification result
     */
    static verifyPassword(password, hash) {
        if (!password || !hash) {
            throw new Error('Password and hash are required');
        }
        return SecurityManager.hashPassword(password) === hash;
    }

    /**
     * Static method to generate a random token
     * @param {number} [length=32] - Token length in bytes
     * @returns {string} Random hex token
     */
    static generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }
    
    /**
     * Static method to create a single instance of SecurityManager
     * @param {Object} config - Configuration options
     * @returns {SecurityManager} SecurityManager instance
     */
   static getInstance(config = null) {
        if (!SecurityManager._instance) {
            SecurityManager._instance = new SecurityManager(config);
            
            // Auto-initialize
            SecurityManager._instance.initialize().catch(error => {
                logger.error(`Failed to auto-initialize SecurityManager: ${error.message}`);
            });
        }
        return SecurityManager._instance;
    }
}

// Initialize singleton instance
SecurityManager._instance = null;

// Create and export a singleton instance for backward compatibility
const securityManager = new SecurityManager();

// Export both the class and a singleton instance
module.exports = securityManager;
module.exports.SecurityManager = SecurityManager;