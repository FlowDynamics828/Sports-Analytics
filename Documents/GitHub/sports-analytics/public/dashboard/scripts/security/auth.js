// Advanced Frontend Authentication Manager
// Production Version 4.1
// Last Updated: 2024-02-02

import { Toast } from '../toast.js';
import { LoadingState } from '../loadingstate.js';
import { SecurityManager } from './security.js';
import { AnalyticsTracker } from '../analytics.js';

class Auth {
    // Private fields using JavaScript private class fields syntax
    #token;
    #user;
    #refreshInterval;
    #tokenCheckInterval;
    #wsConnection;
    #securityManager;
    #analyticsTracker;
    #networkManager;
    #tokenExpiryTime;
    #lastActivity;
    #offlineQueue = [];
    #retryAttempts = 0;
    #sessionId;

    // Constants
    static #MAX_RETRY_ATTEMPTS = 3;
    static #REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes
    static #TOKEN_CHECK_INTERVAL = 30 * 1000; // 30 seconds
    static #INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    static #TOKEN_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours
    static #WEBSOCKET_TIMEOUT = 5000; // 5 seconds
    static #STORAGE_PREFIX = 'sports_analytics_';

    constructor() {
        if (Auth.#instance) {
            return Auth.#instance;
        }
        Auth.#instance = this;

        this.#initializeDependencies();
        this.#setupInitialState();
    }

    // Singleton pattern with secure instantiation
    static #instance = null;
    static getInstance() {
        if (!Auth.#instance) {
            Auth.#instance = new Auth();
        }
        return Auth.#instance;
    }

    #initializeDependencies() {
        this.#securityManager = new SecurityManager();
        this.#analyticsTracker = new AnalyticsTracker();
        this.#networkManager = new NetworkManager();
    }

    #setupInitialState() {
        this.#offlineQueue = [];
        this.#retryAttempts = 0;
        this.#sessionId = crypto.randomUUID();
    }

    async initialize() {
        try {
            LoadingState.show('authInit', 'Initializing secure session...');
            
            await Promise.all([
                this.#initializeSecurityContext(),
                this.#initializeSecureStorage(),
                this.#setupSecureConnection()
            ]);

            await this.#initializeUserSession();
            const sessionValid = await this.#validateCurrentSession();

            if (!sessionValid) {
                await this.#clearSecureSession();
                return false;
            }

            this.#setupSecurityListeners();
            this.#setupActivityMonitoring();

            return true;
        } catch (error) {
            this.#handleError(error, 'Initialization');
            return false;
        } finally {
            LoadingState.hide('authInit');
        }
    }

    async #initializeSecureStorage() {
        try {
            const [token, userData, tokenExpiry] = await Promise.all([
                this.#securityManager.getSecureItem(`${Auth.#STORAGE_PREFIX}auth_token`),
                this.#securityManager.getSecureItem(`${Auth.#STORAGE_PREFIX}user_data`),
                this.#securityManager.getSecureItem(`${Auth.#STORAGE_PREFIX}token_expiry`)
            ]);

            this.#token = token;
            this.#user = userData ? await this.#securityManager.decryptData(userData) : null;
            this.#tokenExpiryTime = tokenExpiry ? parseInt(tokenExpiry) : null;

            if (this.#token && !this.#isTokenExpired()) {
                await this.#validateTokenIntegrity();
            }
        } catch (error) {
            await this.#clearSecureSession();
            throw new AuthError('Storage initialization failed', 'STORAGE_INIT_ERROR');
        }
    }

    async #initializeSecurityContext() {
        try {
            await this.#securityManager.initializeEncryption();
            await this.#validateSecurityContext();
            await this.#setupCSRFProtection();
            await this.#initializeDeviceFingerprint();
        } catch (error) {
            throw new AuthError('Security context initialization failed', 'SECURITY_INIT_ERROR');
        }
    }

    async #setupSecureConnection() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        
        return new Promise((resolve, reject) => {
            this.#wsConnection = new WebSocket(wsUrl);
            
            this.#wsConnection.onopen = () => {
                this.#setupWebSocketSecurity();
                resolve();
            };
            
            this.#wsConnection.onerror = (error) => {
                reject(new AuthError('WebSocket connection failed', 'WS_CONNECTION_ERROR'));
            };

            this.#wsConnection.onmessage = this.#handleSecureWebSocketMessage.bind(this);
            this.#wsConnection.onclose = this.#handleConnectionClose.bind(this);

            // Set connection timeout
            setTimeout(() => reject(new AuthError('WebSocket connection timeout', 'WS_TIMEOUT')), 
                      Auth.#WEBSOCKET_TIMEOUT);
        });
    }

    async login(email, password) {
        try {
            LoadingState.show('login', 'Authenticating...');
            this.#analyticsTracker.trackEvent('auth_attempt', { email });

            // Generate session-specific security parameters
            const [nonce, deviceFingerprint] = await Promise.all([
                this.#securityManager.generateNonce(),
                this.#securityManager.getDeviceFingerprint()
            ]);
            
            // Hash password with unique salt
            const hashedPassword = await this.#securityManager.hashPassword(password, nonce);
            
            // Prepare encrypted request payload
            const encryptedPayload = await this.#securityManager.encryptRequestPayload({
                email,
                password: hashedPassword,
                deviceInfo: {
                    fingerprint: deviceFingerprint,
                    userAgent: navigator.userAgent,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    sessionId: this.#sessionId
                }
            });

            const response = await this.#makeSecureRequest('/api/auth/login', {
                method: 'POST',
                headers: {
                    'X-Request-Nonce': nonce,
                    'X-Device-Fingerprint': deviceFingerprint,
                    'X-Client-Version': process.env.APP_VERSION
                },
                body: encryptedPayload
            });

            if (!response.ok) {
                throw new AuthError(response.error || 'Login failed', response.code);
            }

            await this.#handleSuccessfulAuth(response.data);
            this.#analyticsTracker.trackEvent('auth_success', { email });
            
            return true;
        } catch (error) {
            this.#handleError(error, 'Login');
            return false;
        } finally {
            LoadingState.hide('login');
        }
    }
         async refreshToken() {
        if (!this.#token || this.#isTokenExpired()) {
            throw new AuthError('No valid token to refresh', 'TOKEN_INVALID');
        }

        try {
            const refreshToken = await this.#securityManager.generateRefreshToken(this.#token);
            const deviceFingerprint = await this.#securityManager.getDeviceFingerprint();

            const response = await this.#makeSecureRequest('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.#token}`,
                    'X-Refresh-Token': refreshToken,
                    'X-Device-Fingerprint': deviceFingerprint,
                    'X-Session-ID': this.#sessionId
                }
            });

            if (!response.ok) {
                throw new AuthError('Token refresh failed', 'REFRESH_FAILED');
            }

            await this.#updateSecureToken(response.data.token);
            await this.#updateSessionMetadata(response.data.metadata);
            this.#resetTokenRefreshTimer();
            
            return true;
        } catch (error) {
            this.#handleError(error, 'Token Refresh');
            return false;
        }
    }

    async #validateCurrentSession() {
        if (!this.#token || this.#isTokenExpired()) {
            return false;
        }

        try {
            const deviceFingerprint = await this.#securityManager.getDeviceFingerprint();
            const sessionVerifier = await this.#securityManager.generateSessionVerifier(this.#sessionId);

            const response = await this.#makeSecureRequest('/api/auth/validate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.#token}`,
                    'X-Session-Verify': sessionVerifier,
                    'X-Device-Fingerprint': deviceFingerprint,
                    'X-Session-ID': this.#sessionId
                }
            });

            if (!response.ok) {
                await this.#clearSecureSession();
                return false;
            }

            if (response.data?.sessionMetadata) {
                await this.#updateSessionMetadata(response.data.sessionMetadata);
            }

            return true;
        } catch (error) {
            console.error('Session validation failed:', error);
            await this.#clearSecureSession();
            return false;
        }
    }

    #setupSecurityListeners() {
        const events = {
            storage: this.#handleStorageEvent.bind(this),
            online: this.#handleOnline.bind(this),
            offline: this.#handleOffline.bind(this),
            visibilitychange: this.#handleVisibilityChange.bind(this)
        };

        Object.entries(events).forEach(([event, handler]) => {
            (event === 'visibilitychange' ? document : window)
                .addEventListener(event, handler);
        });
    }

    #setupActivityMonitoring() {
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        const updateActivity = () => {
            this.#lastActivity = Date.now();
            this.#securityManager.updateActivityTimestamp(this.#lastActivity);
        };

        activityEvents.forEach(event => {
            document.addEventListener(event, updateActivity, { passive: true });
        });

        setInterval(() => this.#checkInactivity(), 60000);
    }

    async #makeSecureRequest(url, options = {}) {
        const requestId = crypto.randomUUID();
        const timestamp = Date.now();
        let retries = 0;

        const makeAttempt = async () => {
            try {
                const secureOptions = await this.#securityManager.prepareRequestOptions(options);
                const response = await fetch(url, secureOptions);
                
                await this.#verifyResponseIntegrity(response);
                const data = await response.json();
                
                if (!this.#securityManager.verifyResponseSignature(data)) {
                    throw new AuthError('Invalid response signature', 'INVALID_SIGNATURE');
                }

                return data;
            } catch (error) {
                if (this.#shouldRetryRequest(error) && retries < Auth.#MAX_RETRY_ATTEMPTS) {
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                    return makeAttempt();
                }
                throw error;
            }
        };

        try {
            return await makeAttempt();
        } finally {
            this.#logRequestMetrics(requestId, timestamp);
        }
    }

    async #updateSecureToken(token) {
        const encryptedToken = await this.#securityManager.encryptToken(token);
        this.#token = token;
        this.#tokenExpiryTime = Date.now() + Auth.#TOKEN_LIFETIME;

        await Promise.all([
            this.#securityManager.setSecureItem(`${Auth.#STORAGE_PREFIX}auth_token`, encryptedToken),
            this.#securityManager.setSecureItem(`${Auth.#STORAGE_PREFIX}token_expiry`, 
                this.#tokenExpiryTime.toString())
        ]);
    }

    #isTokenExpired() {
        return !this.#tokenExpiryTime || Date.now() >= this.#tokenExpiryTime;
    }

    async #handleSuccessfulAuth(data) {
        const { token, user, sessionMetadata } = data;
        
        await Promise.all([
            this.#updateSecureToken(token),
            this.#securityManager.setSecureItem(
                `${Auth.#STORAGE_PREFIX}user_data`,
                await this.#securityManager.encryptData(user)
            )
        ]);

        this.#user = user;
        this.#setupAutomaticTokenRefresh();
        this.#updateSessionMetadata(sessionMetadata);
        this.#resetInactivityTimer();
    }

    #setupAutomaticTokenRefresh() {
        if (this.#refreshInterval) {
            clearInterval(this.#refreshInterval);
        }

        const refreshTime = Math.min(Auth.#TOKEN_LIFETIME * 0.8, Auth.#REFRESH_INTERVAL);
        
        this.#refreshInterval = setInterval(async () => {
            try {
                if (this.#token && !this.#isTokenExpired()) {
                    const shouldRefresh = await this.#securityManager.shouldRefreshToken(this.#token);
                    if (shouldRefresh) {
                        await this.refreshToken();
                    }
                }
            } catch (error) {
                this.#handleError(error, 'Token Auto-Refresh');
            }
        }, refreshTime);

        this.#tokenCheckInterval = setInterval(() => {
            if (this.#isTokenExpired()) {
                this.logout(true);
            }
        }, Auth.#TOKEN_CHECK_INTERVAL);
    }

  async #handleError(error, context) {
        console.error(`Auth error [${context}]:`, error);
        
        this.#analyticsTracker.trackError({
            error,
            context,
            sessionId: this.#sessionId,
            timestamp: Date.now(),
            user: this.#user?.id
        });

        // Determine if error requires session termination
        if (this.#isAuthenticationError(error)) {
            await this.logout(true);
        }

        const errorMessage = this.#getErrorMessage(error);
        Toast.show(errorMessage, 'error');
    }

    async #updateSessionMetadata(metadata) {
        try {
            await this.#securityManager.updateSessionMetadata({
                ...metadata,
                lastUpdated: Date.now(),
                sessionId: this.#sessionId
            });
        } catch (error) {
            console.error('Failed to update session metadata:', error);
        }
    }

    async logout(silent = false) {
        try {
            if (!silent) LoadingState.show('logout', 'Signing out...');

            if (this.#token) {
                await this.#makeSecureRequest('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.#token}`,
                        'X-Session-ID': this.#sessionId
                    }
                }).catch(error => console.error('Logout request failed:', error));
            }

            await this.#clearSecureSession();
            
            if (!silent) {
                Toast.show('Successfully signed out', 'success');
                window.location.href = '/login';
            }
        } catch (error) {
            this.#handleError(error, 'Logout');
            if (!silent) {
                window.location.href = '/login';
            }
        } finally {
            if (!silent) LoadingState.hide('logout');
        }
    }

    async #clearSecureSession() {
        try {
            this.#token = null;
            this.#user = null;
            this.#tokenExpiryTime = null;
            this.#sessionId = null;
            
            await Promise.all([
                this.#securityManager.clearSecureStorage(),
                this.clearIntervals(),
                new Promise(resolve => {
                    if (this.#wsConnection?.readyState === WebSocket.OPEN) {
                        this.#wsConnection.close(1000, 'User logout');
                    }
                    resolve();
                })
            ]);
        } catch (error) {
            console.error('Error clearing session:', error);
            throw error;
        }
    }

    // Permission and session management
    hasPermission(permission) {
        if (!this.#user?.permissions) return false;
        return this.#user.permissions.includes(permission);
    }

    async checkPermissionAndRedirect(permission, redirectUrl = '/dashboard') {
        if (!this.hasPermission(permission)) {
            Toast.show('Access denied. Please upgrade your subscription.', 'warning');
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }

    isAuthenticated() {
        return !!(this.#token && this.#user && !this.#isTokenExpired());
    }

    getUser() {
        return this.#user ? { ...this.#user } : null;
    }

    clearIntervals() {
        [this.#refreshInterval, this.#tokenCheckInterval].forEach(interval => {
            if (interval) clearInterval(interval);
        });
    }

    destroy() {
        try {
            this.clearIntervals();
            this.#wsConnection?.close(1000, 'Session terminated');
            this.#securityManager.clearSecureStorage();
            Auth.#instance = null;
        } catch (error) {
            console.error('Error during Auth destruction:', error);
        }
    }

    // Helper Methods
    #isAuthenticationError(error) {
        return error instanceof AuthError && 
               ['TOKEN_INVALID', 'SESSION_EXPIRED', 'AUTH_REQUIRED'].includes(error.code);
    }

    #getErrorMessage(error) {
        const errorMessages = {
            'TOKEN_INVALID': 'Your session has expired. Please log in again.',
            'AUTH_REQUIRED': 'Authentication required. Please log in.',
            'NETWORK_ERROR': 'Network connection issue. Please check your connection.',
            'SERVER_ERROR': 'Server error. Please try again later.',
            'INVALID_CREDENTIALS': 'Invalid email or password.',
            'ACCOUNT_LOCKED': 'Account locked. Please contact support.'
        };

        return errorMessages[error.code] || error.message || 'An unexpected error occurred';
    }
}

// Custom Error Classes
class AuthError extends Error {
    constructor(message, code = 'AUTH_ERROR') {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.timestamp = new Date().toISOString();
    }
}

// Export singleton instance
const auth = Auth.getInstance();
export default auth;