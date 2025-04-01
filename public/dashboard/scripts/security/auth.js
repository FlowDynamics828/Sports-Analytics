// Advanced Enterprise-grade Frontend Authentication System
// Production Version 5.0
// Last Updated: 2025-03-18

/**
 * This comprehensive authentication module provides enterprise-grade 
 * authentication functionality for the Sports Analytics Pro platform.
 * Features include:
 * - JWT token management with automatic refresh
 * - Secure storage with encryption
 * - Comprehensive error handling
 * - Permission-based access control
 * - Session management
 * - Device fingerprinting
 * - Detailed logging
 */

// Import necessary dependencies
import CryptoService from './cryptoService.js';
import { SecurityManager } from './securityManager.js';
import { StorageManager } from './storageManager.js';
import { EventBus } from '../eventBus.js';
import { LogManager } from '../logManager.js';
import { MetricsManager } from '../metricsManager.js';
import { CONFIG } from '../../config/constants.js';

// Constants
const TOKEN_REFRESH_THRESHOLD = 0.2; // Refresh at 20% of token lifetime remaining
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // ms
const AUTH_EVENTS = {
  LOGIN: 'auth:login',
  LOGOUT: 'auth:logout',
  REFRESH: 'auth:refresh',
  ERROR: 'auth:error',
  INITIALIZED: 'auth:initialized',
};

/**
 * Authentication Manager Class
 * Manages all auth-related functionality for the frontend application
 */
class AuthManager {
  // Private properties
  #token = null;
  #refreshToken = null;
  #user = null;
  #permissions = [];
  #tokenExpiryTime = null;
  #refreshTimer = null;
  #cryptoService = null;
  #securityManager = null;
  #storageManager = null;
  #eventBus = null;
  #initialized = false;
  #inProgress = {};
  #logger = null;
  #metrics = null;
  #sessionId = null;
  #deviceFingerprint = null;

  /**
   * Constructor - initializes dependencies
   */
  constructor() {
    // Singleton pattern
    if (AuthManager.instance) {
      return AuthManager.instance;
    }
    AuthManager.instance = this;

    // Initialize dependencies
    this.#logger = LogManager.getLogger('auth');
    this.#metrics = MetricsManager.getInstance();
    this.#eventBus = EventBus.getInstance();
    this.#sessionId = this.#generateSessionId();

    // Register event handlers
    this.#registerEventHandlers();
  }

  /**
   * Initialize the authentication system
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize() {
    if (this.#initialized) {
      return true;
    }

    try {
      this.#logger.info('Initializing authentication system');
      const startTime = performance.now();

      // Initialize dependencies
      this.#cryptoService = await CryptoService.getInstance();
      this.#securityManager = await SecurityManager.getInstance();
      this.#storageManager = StorageManager.getInstance();

      // Initialize device fingerprint
      this.#deviceFingerprint = await this.#securityManager.getDeviceFingerprint();

      // Check for existing auth data
      const authData = await this.#loadStoredAuthData();
      if (authData) {
        this.#logger.info('Found stored authentication data');
        
        // Set auth data
        this.#token = authData.token;
        this.#refreshToken = authData.refreshToken;
        this.#user = authData.user;
        this.#permissions = authData.permissions || [];

        // Validate token and set up refresh timer
        const isValid = await this.validateToken();
        if (isValid) {
          this.#logger.info('Stored token is valid');
          this.#setupTokenRefresh();
        } else {
          this.#logger.warn('Stored token is invalid, attempting to refresh');
          const refreshed = await this.refreshToken().catch(err => {
            this.#logger.error('Token refresh failed during initialization', { error: err.message });
            return false;
          });

          if (!refreshed) {
            this.#logger.warn('Token refresh failed, clearing auth data');
            await this.clearAuthData();
          }
        }
      }

      this.#initialized = true;
      const duration = performance.now() - startTime;
      this.#logger.info('Authentication system initialized', { durationMs: duration.toFixed(2) });
      this.#metrics.recordTiming('auth_initialization', duration);
      this.#eventBus.emit(AUTH_EVENTS.INITIALIZED);

      return true;
    } catch (error) {
      this.#logger.error('Authentication initialization failed', { 
        error: error.message,
        stack: error.stack
      });
      
      this.#metrics.incrementCounter('auth_initialization_errors');
      this.#eventBus.emit(AUTH_EVENTS.ERROR, { 
        context: 'initialization',
        error: error.message
      });
      
      return false;
    }
  }

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} - Authentication result
   */
  async login(email, password) {
    if (this.#inProgress.login) {
      return { success: false, error: 'Login already in progress' };
    }

    this.#inProgress.login = true;
    const startTime = performance.now();
    this.#metrics.incrementCounter('auth_login_attempts');

    try {
      this.#logger.info('Attempting login', { email });

      // Generate security parameters
      const nonce = await this.#cryptoService.generateNonce();
      const requestId = await this.#cryptoService.generateUUID();

      // Prepare request
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Nonce': nonce,
          'X-Device-Fingerprint': this.#deviceFingerprint,
          'X-Request-ID': requestId,
          'X-Session-ID': this.#sessionId
        },
        body: JSON.stringify({
          email,
          password,
          device: await this.#securityManager.getDeviceInfo()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        this.#logger.warn('Login failed', { 
          statusCode: response.status,
          error: data.error
        });
        
        this.#metrics.incrementCounter('auth_login_failures', {
          status: response.status,
          error: data.code || 'UNKNOWN_ERROR'
        });
        
        this.#eventBus.emit(AUTH_EVENTS.ERROR, {
          context: 'login',
          status: response.status,
          error: data.error
        });
        
        return { 
          success: false, 
          error: data.error || 'Login failed',
          code: data.code
        };
      }

      // Store authentication data
      this.#token = data.token;
      this.#refreshToken = data.refreshToken;
      this.#user = data.user;
      this.#permissions = data.user.permissions || [];

      // Save to secure storage
      await this.#saveAuthData();

      // Set up token refresh timer
      this.#setupTokenRefresh();

      const duration = performance.now() - startTime;
      this.#logger.info('Login successful', { 
        userId: data.user.id,
        durationMs: duration.toFixed(2)
      });
      
      this.#metrics.recordTiming('auth_login_successful', duration);
      this.#metrics.incrementCounter('auth_login_success');
      
      this.#eventBus.emit(AUTH_EVENTS.LOGIN, {
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.role
        }
      });

      return {
        success: true,
        user: data.user
      };
    } catch (error) {
      this.#logger.error('Login request failed', { 
        error: error.message,
        stack: error.stack
      });
      
      this.#metrics.incrementCounter('auth_login_errors');
      this.#eventBus.emit(AUTH_EVENTS.ERROR, {
        context: 'login',
        error: error.message
      });
      
      return {
        success: false,
        error: 'Connection error. Please try again.'
      };
    } finally {
      this.#inProgress.login = false;
    }
  }

  /**
   * Validate the current token
   * @returns {Promise<boolean>} - Whether the token is valid
   */
  async validateToken() {
    if (!this.#token) return false;
    if (this.#inProgress.validate) return false;

    this.#inProgress.validate = true;
    const startTime = performance.now();

    try {
      this.#logger.debug('Validating token');

      // Decode token to check expiry
      const tokenData = this.#parseJwt(this.#token);
      if (!tokenData || !tokenData.exp) {
        this.#logger.warn('Token is invalid or missing expiry');
        return false;
      }

      // Check if token is expired
      const expiryTime = tokenData.exp * 1000; // Convert to milliseconds
      this.#tokenExpiryTime = expiryTime;
      
      if (Date.now() >= expiryTime) {
        this.#logger.warn('Token is expired');
        return false;
      }

      // If close to expiry, don't validate but trigger refresh
      const timeRemaining = expiryTime - Date.now();
      const tokenLifetime = (expiryTime - (tokenData.iat * 1000));
      const percentRemaining = timeRemaining / tokenLifetime;

      if (percentRemaining <= TOKEN_REFRESH_THRESHOLD) {
        this.#logger.info('Token close to expiry, triggering refresh');
        this.refreshToken().catch(err => {
          this.#logger.error('Token refresh failed during validation', { error: err.message });
        });
        return true;
      }

      // Verify token with server (only if not recently verified)
      const lastVerified = this.#storageManager.get('auth_last_verified');
      const shouldVerifyServer = !lastVerified || (Date.now() - lastVerified > 5 * 60 * 1000); // 5 minutes

      if (shouldVerifyServer) {
        this.#logger.debug('Verifying token with server');
        
        const response = await fetch('/api/auth/verify', {
          headers: {
            'Authorization': `Bearer ${this.#token}`,
            'X-Device-Fingerprint': this.#deviceFingerprint,
            'X-Session-ID': this.#sessionId
          }
        });

        if (!response.ok) {
          this.#logger.warn('Token validation failed on server', { statusCode: response.status });
          return false;
        }

        const data = await response.json();
        
        // Update user data if needed
        if (data.user && JSON.stringify(this.#user) !== JSON.stringify(data.user)) {
          this.#logger.info('Updating user data from token validation');
          this.#user = data.user;
          this.#permissions = data.user.permissions || [];
          await this.#saveAuthData();
        }

        // Store last verification time
        this.#storageManager.set('auth_last_verified', Date.now());
      }

      const duration = performance.now() - startTime;
      this.#metrics.recordTiming('auth_token_validation', duration);
      return true;
    } catch (error) {
      this.#logger.error('Token validation failed', { 
        error: error.message,
        stack: error.stack
      });
      
      this.#metrics.incrementCounter('auth_validation_errors');
      return false;
    } finally {
      this.#inProgress.validate = false;
    }
  }

  /**
   * Refresh the authentication token
   * @returns {Promise<boolean>} - Whether refresh was successful
   */
  async refreshToken() {
    if (!this.#refreshToken) return false;
    if (this.#inProgress.refresh) return false;

    this.#inProgress.refresh = true;
    const startTime = performance.now();
    
    try {
      this.#logger.info('Refreshing authentication token');

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.#token}`,
          'X-Device-Fingerprint': this.#deviceFingerprint,
          'X-Session-ID': this.#sessionId
        },
        body: JSON.stringify({
          refreshToken: this.#refreshToken
        })
      });

      if (!response.ok) {
        this.#logger.warn('Token refresh failed', { statusCode: response.status });
        
        // If unauthorized, clear auth data
        if (response.status === 401) {
          this.#logger.info('Clearing invalid auth data after failed refresh');
          await this.clearAuthData();
        }
        
        return false;
      }

      const data = await response.json();
      
      // Update tokens
      this.#token = data.token;
      if (data.refreshToken) {
        this.#refreshToken = data.refreshToken;
      }
      
      // Update user if provided
      if (data.user) {
        this.#user = data.user;
        this.#permissions = data.user.permissions || [];
      }

      // Save updated auth data
      await this.#saveAuthData();
      
      // Reset token refresh timer
      this.#setupTokenRefresh();

      const duration = performance.now() - startTime;
      this.#logger.info('Token refresh successful', { durationMs: duration.toFixed(2) });
      this.#metrics.recordTiming('auth_token_refresh', duration);
      this.#eventBus.emit(AUTH_EVENTS.REFRESH);
      
      return true;
    } catch (error) {
      this.#logger.error('Token refresh request failed', { 
        error: error.message,
        stack: error.stack
      });
      
      this.#metrics.incrementCounter('auth_refresh_errors');
      this.#eventBus.emit(AUTH_EVENTS.ERROR, {
        context: 'refresh',
        error: error.message
      });
      
      return false;
    } finally {
      this.#inProgress.refresh = false;
    }
  }

  /**
   * Log out the current user
   * @param {Object} options - Logout options
   * @param {boolean} options.silent - Whether to skip server notification
   * @returns {Promise<boolean>} - Whether logout was successful
   */
  async logout(options = {}) {
    const silent = options.silent || false;
    
    try {
      this.#logger.info('Logging out user', { silent });
      
      // Clear refresh timer
      this.#clearRefreshTimer();
      
      // Notify server (unless silent)
      if (!silent && this.#token) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.#token}`,
              'X-Session-ID': this.#sessionId
            }
          });
          this.#logger.debug('Server notified of logout');
        } catch (error) {
          this.#logger.warn('Failed to notify server of logout', { error: error.message });
          // Continue with logout regardless of server notification
        }
      }
      
      // Clear auth data
      await this.clearAuthData();
      
      this.#logger.info('Logout successful');
      this.#metrics.incrementCounter('auth_logout');
      this.#eventBus.emit(AUTH_EVENTS.LOGOUT);
      
      return true;
    } catch (error) {
      this.#logger.error('Logout failed', { 
        error: error.message,
        stack: error.stack
      });
      
      this.#metrics.incrementCounter('auth_logout_errors');
      return false;
    }
  }

  /**
   * Clear all authentication data
   */
  async clearAuthData() {
    this.#token = null;
    this.#refreshToken = null;
    this.#user = null;
    this.#permissions = [];
    this.#tokenExpiryTime = null;
    this.#clearRefreshTimer();
    
    // Clear from storage
    await this.#storageManager.remove('auth_data');
    await this.#storageManager.remove('auth_last_verified');
    localStorage.removeItem('token'); // For backward compatibility
    
    this.#logger.debug('Auth data cleared');
  }

  /**
   * Get the current authentication token
   * @returns {string|null} - The current token or null if not authenticated
   */
  getToken() {
    return this.#token;
  }

  /**
   * Get the current user
   * @returns {Object|null} - The current user or null if not authenticated
   */
  getUser() {
    return this.#user ? { ...this.#user } : null;
  }

  /**
   * Check if the user is authenticated
   * @returns {boolean} - Whether the user is authenticated
   */
  isAuthenticated() {
    return !!this.#token && !!this.#user;
  }

  /**
   * Check if the user has the specified permission
   * @param {string} permission - The permission to check
   * @returns {boolean} - Whether the user has the permission
   */
  hasPermission(permission) {
    if (!this.#permissions || !this.#permissions.length) return false;
    return this.#permissions.includes(permission);
  }

  /**
   * Check if user has a role
   * @param {string|string[]} roles - Role or roles to check
   * @returns {boolean} - Whether user has any of the specified roles
   */
  hasRole(roles) {
    if (!this.#user || !this.#user.role) return false;
    
    if (Array.isArray(roles)) {
      return roles.includes(this.#user.role);
    }
    
    return this.#user.role === roles;
  }

  /**
   * Check authentication and redirect to login if not authenticated
   * @param {string} redirectUrl - URL to redirect to if not authenticated
   * @returns {boolean} - Whether user is authenticated
   */
  checkAuthAndRedirect(redirectUrl = '/login') {
    if (!this.isAuthenticated()) {
      this.#logger.info('User not authenticated, redirecting to login');
      
      // Add the current URL as a return_to parameter
      const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${redirectUrl}?return_to=${currentUrl}`;
      return false;
    }
    return true;
  }

  /**
   * Check if token is about to expire
   * @returns {boolean} - Whether token is about to expire
   */
  isTokenExpiringSoon() {
    if (!this.#tokenExpiryTime) return true;
    
    const timeRemaining = this.#tokenExpiryTime - Date.now();
    const tokenLifetime = this.#tokenExpiryTime - (this.#parseJwt(this.#token)?.iat * 1000 || 0);
    return (timeRemaining / tokenLifetime) <= TOKEN_REFRESH_THRESHOLD;
  }

  /**
   * Get authorization headers for API requests
   * @returns {Object} - Headers object with Authorization
   */
  getAuthHeaders() {
    if (!this.#token) return {};
    
    return {
      'Authorization': `Bearer ${this.#token}`,
      'X-Session-ID': this.#sessionId,
      'X-Device-Fingerprint': this.#deviceFingerprint
    };
  }

  // PRIVATE METHODS

  /**
   * Load stored authentication data from secure storage
   * @returns {Object|null} - Stored auth data or null if not found
   * @private
   */
  async #loadStoredAuthData() {
    try {
      // Try secure storage first
      const authData = await this.#storageManager.get('auth_data');
      if (authData) return authData;
      
      // Fall back to localStorage for backward compatibility
      const token = localStorage.getItem('token');
      if (!token) return null;
      
      this.#logger.info('Found token in localStorage, migrating to secure storage');
      
      // Try to get user data from localStorage for backward compatibility
      let user = null;
      const userEmail = localStorage.getItem('userEmail');
      const userSubscription = localStorage.getItem('userSubscription');
      
      if (userEmail) {
        user = { 
          email: userEmail,
          subscription: userSubscription || 'free'
        };
      }
      
      // Validate the token format
      const tokenData = this.#parseJwt(token);
      if (!tokenData) {
        this.#logger.warn('Invalid token format found in localStorage');
        return null;
      }
      
      // If user data missing from localStorage but present in token
      if (!user && tokenData.email) {
        user = { 
          email: tokenData.email,
          id: tokenData.sub,
          role: tokenData.role
        };
      }
      
      // Create minimal auth data
      const authDataFromLocalStorage = {
        token: token,
        refreshToken: null, // No refresh token in old format
        user: user
      };
      
      // Save to secure storage for future use
      await this.#saveAuthData(authDataFromLocalStorage);
      
      // Clear from localStorage after migration
      localStorage.removeItem('token');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userSubscription');
      
      return authDataFromLocalStorage;
    } catch (error) {
      this.#logger.error('Failed to load stored auth data', { error: error.message });
      return null;
    }
  }

  /**
   * Save authentication data to secure storage
   * @param {Object} data - Custom auth data to save (optional)
   * @private
   */
  async #saveAuthData(data = null) {
    try {
      const authData = data || {
        token: this.#token,
        refreshToken: this.#refreshToken,
        user: this.#user,
        permissions: this.#permissions,
        lastUpdated: Date.now()
      };
      
      await this.#storageManager.set('auth_data', authData);
      
      // Also store token in localStorage for backward compatibility with existing code
      if (authData.token) {
        localStorage.setItem('token', authData.token);
      }
      
      this.#logger.debug('Auth data saved to secure storage');
    } catch (error) {
      this.#logger.error('Failed to save auth data', { error: error.message });
      throw error;
    }
  }

  /**
   * Set up token refresh timer
   * @private
   */
  #setupTokenRefresh() {
    this.#clearRefreshTimer();
    
    try {
      const tokenData = this.#parseJwt(this.#token);
      if (!tokenData || !tokenData.exp) {
        this.#logger.warn('Cannot set up refresh timer: invalid token format');
        return;
      }
      
      const expiryTime = tokenData.exp * 1000; // Convert to milliseconds
      this.#tokenExpiryTime = expiryTime;
      
      const currentTime = Date.now();
      const timeToExpiry = Math.max(0, expiryTime - currentTime);
      
      if (timeToExpiry <= 0) {
        this.#logger.warn('Token already expired, triggering refresh immediately');
        this.refreshToken().catch(err => {
          this.#logger.error('Immediate token refresh failed', { error: err.message });
        });
        return;
      }
      
      // Calculate refresh time (80% of remaining time)
      const refreshTime = timeToExpiry * (1 - TOKEN_REFRESH_THRESHOLD);
      
      this.#logger.debug('Setting up token refresh timer', { 
        expiryTime: new Date(expiryTime).toISOString(),
        refreshIn: Math.round(refreshTime / 1000) + 's'
      });
      
      this.#refreshTimer = setTimeout(() => {
        this.#logger.info('Token refresh timer triggered');
        this.refreshToken().catch(err => {
          this.#logger.error('Scheduled token refresh failed', { error: err.message });
        });
      }, refreshTime);
    } catch (error) {
      this.#logger.error('Failed to set up token refresh', { error: error.message });
    }
  }

  /**
   * Clear token refresh timer
   * @private
   */
  #clearRefreshTimer() {
    if (this.#refreshTimer) {
      clearTimeout(this.#refreshTimer);
      this.#refreshTimer = null;
    }
  }

  /**
   * Parse JWT token
   * @param {string} token - JWT token to parse
   * @returns {Object|null} - Parsed token payload or null if invalid
   * @private
   */
  #parseJwt(token) {
    try {
      if (!token) return null;
      
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      
      return JSON.parse(jsonPayload);
    } catch (error) {
      this.#logger.error('Failed to parse JWT', { error: error.message });
      return null;
    }
  }

  /**
   * Generate unique session ID
   * @returns {string} - Unique session ID
   * @private
   */
  #generateSessionId() {
    return 'sess_' + Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Register event handlers
   * @private
   */
  #registerEventHandlers() {
    // Handle page visibility changes to check auth status
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isAuthenticated()) {
        this.validateToken().catch(err => {
          this.#logger.error('Token validation failed on visibility change', { 
            error: err.message 
          });
        });
      }
    });
    
    // Handle network status changes
    window.addEventListener('online', () => {
      if (this.isAuthenticated()) {
        this.#logger.info('Network connection restored, validating token');
        this.validateToken().catch(err => {
          this.#logger.error('Token validation failed after coming online', { 
            error: err.message 
          });
        });
      }
    });
    
    // Handle authentication errors
    this.#eventBus.on(AUTH_EVENTS.ERROR, (data) => {
      if (data.status === 401 || data.code === 'TOKEN_EXPIRED') {
        this.#logger.warn('Auth error: Unauthorized, clearing auth data', { 
          context: data.context 
        });
        this.clearAuthData();
      }
    });
  }
}

// Export singleton instance
const auth = new AuthManager();
export default auth;