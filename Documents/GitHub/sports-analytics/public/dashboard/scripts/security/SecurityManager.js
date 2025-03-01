// Security Management System
// Production Version 4.1
// Last Updated: 2024-02-02

import { CryptoService } from './cryptoService.js';
import { KeyManager } from './keyManager.js';

class SecurityManager {
    #cryptoService;
    #keyManager;
    #sessionKeys;
    #deviceId;
    #initialized = false;

    constructor() {
        if (SecurityManager.instance) {
            return SecurityManager.instance;
        }
        SecurityManager.instance = this;
        
        this.#initialize();
    }

    static VERSION = '4.1.0';
    static KEY_VERSION = '2';
    static STORAGE_PREFIX = 'secure_';
    
    async #initialize() {
        if (this.#initialized) return;
        
        try {
            this.#cryptoService = await CryptoService.getInstance();
            this.#keyManager = await KeyManager.getInstance();
            
            // Initialize secure session keys
            this.#sessionKeys = await this.#generateSessionKeys();
            
            // Generate or retrieve device identifier
            this.#deviceId = await this.#initializeDeviceId();
            
            this.#initialized = true;
        } catch (error) {
            console.error('Security initialization failed:', error);
            throw new SecurityError('Security system initialization failed');
        }
    }

    async initializeEncryption() {
        if (!this.#initialized) {
            await this.#initialize();
        }
        await this.#validateSecurityContext();
    }

    async encryptToken(token) {
        this.#checkInitialization();
        return this.#cryptoService.encryptData(token, this.#sessionKeys.encryptionKey);
    }

    async decryptToken(encryptedToken) {
        this.#checkInitialization();
        return this.#cryptoService.decryptData(encryptedToken, this.#sessionKeys.encryptionKey);
    }

    async generateNonce() {
        return this.#cryptoService.generateNonce(32);
    }

    async generateRefreshToken(token) {
        this.#checkInitialization();
        const timestamp = Date.now();
        const deviceInfo = await this.getDeviceInfo();
        
        const tokenData = {
            token: token,
            timestamp: timestamp,
            deviceId: this.#deviceId,
            deviceInfo: deviceInfo
        };

        return this.#cryptoService.generateHMAC(JSON.stringify(tokenData), this.#sessionKeys.signingKey);
    }

    async hashPassword(password, salt) {
        const customSalt = salt || await this.#cryptoService.generateSalt(32);
        return this.#cryptoService.deriveKey(password, customSalt, {
            iterations: 100000,
            hash: 'SHA-512'
        });
    }

    async encryptData(data) {
        this.#checkInitialization();
        return this.#cryptoService.encryptData(
            typeof data === 'string' ? data : JSON.stringify(data),
            this.#sessionKeys.encryptionKey
        );
    }

    async decryptData(encryptedData) {
        this.#checkInitialization();
        const decrypted = await this.#cryptoService.decryptData(
            encryptedData,
            this.#sessionKeys.encryptionKey
        );
        try {
            return JSON.parse(decrypted);
        } catch {
            return decrypted;
        }
    }

    async setSecureItem(key, value) {
        this.#checkInitialization();
        const encryptedValue = await this.encryptData(value);
        const signature = await this.#generateStorageSignature(key, encryptedValue);
        
        localStorage.setItem(`${SecurityManager.STORAGE_PREFIX}${key}`, encryptedValue);
        localStorage.setItem(`${SecurityManager.STORAGE_PREFIX}${key}_sig`, signature);
    }

    async getSecureItem(key) {
        this.#checkInitialization();
        const encryptedValue = localStorage.getItem(`${SecurityManager.STORAGE_PREFIX}${key}`);
        const signature = localStorage.getItem(`${SecurityManager.STORAGE_PREFIX}${key}_sig`);

        if (!encryptedValue || !signature) return null;

        const isValid = await this.#verifyStorageSignature(key, encryptedValue, signature);
        if (!isValid) {
            throw new SecurityError('Storage tampering detected');
        }

        return this.decryptData(encryptedValue);
    }

    async clearSecureStorage() {
        const secureKeys = Object.keys(localStorage).filter(key => 
            key.startsWith(SecurityManager.STORAGE_PREFIX)
        );
        
        secureKeys.forEach(key => localStorage.removeItem(key));
        this.#sessionKeys = await this.#generateSessionKeys();
    }

    async getDeviceFingerprint() {
        const components = await this.getDeviceInfo();
        const fingerprint = await this.#cryptoService.hash(JSON.stringify(components));
        return fingerprint;
    }

    async getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            deviceId: this.#deviceId,
            version: SecurityManager.VERSION
        };
    }

    async updateSessionMetadata(metadata) {
        this.#checkInitialization();
        await this.setSecureItem('session_metadata', {
            ...metadata,
            lastUpdated: Date.now(),
            deviceId: this.#deviceId
        });
    }

    async prepareRequestOptions(options) {
        this.#checkInitialization();
        const timestamp = Date.now();
        const nonce = await this.generateNonce();

        const headers = {
            ...options.headers,
            'Content-Type': 'application/json',
            'X-Request-Timestamp': timestamp,
            'X-Request-Nonce': nonce,
            'X-Device-ID': this.#deviceId,
            'X-Security-Version': SecurityManager.VERSION
        };

        const signature = await this.#generateRequestSignature({
            url: options.url,
            method: options.method,
            body: options.body,
            timestamp,
            nonce
        });

        return {
            ...options,
            headers: {
                ...headers,
                'X-Signature': signature
            }
        };
    }

    async verifyResponseSignature(data) {
        if (!data.signature) return false;
        
        const payload = {
            ...data,
            signature: undefined
        };

        const computedSignature = await this.#cryptoService.generateHMAC(
            JSON.stringify(payload),
            this.#sessionKeys.signingKey
        );

        return computedSignature === data.signature;
    }

    async shouldRefreshToken(token) {
        if (!token) return false;
        
        try {
            const decoded = await this.#cryptoService.decodeJWT(token);
            const expiryTime = decoded.exp * 1000;
            const currentTime = Date.now();
            
            // Refresh if token is within 20% of its lifetime
            return (expiryTime - currentTime) / (expiryTime - (decoded.iat * 1000)) <= 0.2;
        } catch {
            return true;
        }
    }

    // Private helper methods
    async #generateSessionKeys() {
        return {
            encryptionKey: await this.#cryptoService.generateKey(),
            signingKey: await this.#cryptoService.generateKey()
        };
    }

    async #initializeDeviceId() {
        let deviceId = await this.getSecureItem('device_id');
        if (!deviceId) {
            deviceId = await this.#cryptoService.generateUUID();
            await this.setSecureItem('device_id', deviceId);
        }
        return deviceId;
    }

    async #generateStorageSignature(key, value) {
        return this.#cryptoService.generateHMAC(
            `${key}:${value}`,
            this.#sessionKeys.signingKey
        );
    }

    async #verifyStorageSignature(key, value, signature) {
        const computedSignature = await this.#generateStorageSignature(key, value);
        return computedSignature === signature;
    }

    async #generateRequestSignature(request) {
        const signaturePayload = {
            url: request.url,
            method: request.method,
            body: request.body,
            timestamp: request.timestamp,
            nonce: request.nonce,
            deviceId: this.#deviceId
        };

        return this.#cryptoService.generateHMAC(
            JSON.stringify(signaturePayload),
            this.#sessionKeys.signingKey
        );
    }

    #checkInitialization() {
        if (!this.#initialized) {
            throw new SecurityError('Security manager not initialized');
        }
    }

    async #validateSecurityContext() {
        const context = await this.getSecureItem('security_context');
        if (!context || context.version !== SecurityManager.VERSION) {
            await this.clearSecureStorage();
            throw new SecurityError('Invalid security context');
        }
    }
}

class SecurityError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SecurityError';
        this.timestamp = new Date().toISOString();
    }
}

export default SecurityManager;