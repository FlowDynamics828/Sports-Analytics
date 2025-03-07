// Advanced Cryptographic Service Provider
// Production Version 4.1
// Last Updated: 2024-02-02

import { KeyManager } from './keyManager.js';

class CryptoService {
    static instance = null;
    static VERSION = '4.1.0';
    
    #keyManager;
    #subtle;
    #initialized = false;
    #algorithmConfigs;

    constructor() {
        if (CryptoService.instance) {
            return CryptoService.instance;
        }
        CryptoService.instance = this;
        this.#initialize();
    }

    static async getInstance() {
        if (!CryptoService.instance) {
            CryptoService.instance = new CryptoService();
            await CryptoService.instance.#initialize();
        }
        return CryptoService.instance;
    }

    async #initialize() {
        if (this.#initialized) return;

        try {
            this.#subtle = window.crypto.subtle;
            this.#keyManager = await KeyManager.getInstance();
            
            this.#algorithmConfigs = {
                aes: {
                    name: 'AES-GCM',
                    length: 256,
                    tagLength: 128
                },
                hmac: {
                    name: 'HMAC',
                    hash: 'SHA-512'
                },
                kdf: {
                    name: 'PBKDF2',
                    hash: 'SHA-512',
                    iterations: 310000,
                    length: 256
                },
                rsa: {
                    name: 'RSA-OAEP',
                    modulusLength: 4096,
                    publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                    hash: 'SHA-512'
                }
            };

            await this.#validateCryptoCapabilities();
            this.#initialized = true;
        } catch (error) {
            throw new CryptoError('Crypto service initialization failed', error);
        }
    }

    async encryptData(data, key = null) {
        this.#checkInitialization();
        
        try {
            const encryptionKey = key || await this.#keyManager.getEncryptionKey();
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encodedData = new TextEncoder().encode(data);

            const encryptedData = await this.#subtle.encrypt(
                {
                    name: this.#algorithmConfigs.aes.name,
                    iv: iv,
                    tagLength: this.#algorithmConfigs.aes.tagLength
                },
                encryptionKey,
                encodedData
            );

            const result = new Uint8Array(iv.length + encryptedData.byteLength);
            result.set(iv);
            result.set(new Uint8Array(encryptedData), iv.length);

            return this.#arrayBufferToBase64(result);
        } catch (error) {
            throw new CryptoError('Encryption failed', error);
        }
    }

    async decryptData(encryptedData, key = null) {
        this.#checkInitialization();
        
        try {
            const encryptedBytes = this.#base64ToArrayBuffer(encryptedData);
            const iv = encryptedBytes.slice(0, 12);
            const data = encryptedBytes.slice(12);
            const decryptionKey = key || await this.#keyManager.getEncryptionKey();

            const decryptedData = await this.#subtle.decrypt(
                {
                    name: this.#algorithmConfigs.aes.name,
                    iv: iv,
                    tagLength: this.#algorithmConfigs.aes.tagLength
                },
                decryptionKey,
                data
            );

            return new TextDecoder().decode(decryptedData);
        } catch (error) {
            throw new CryptoError('Decryption failed', error);
        }
    }

    async generateHMAC(data, key = null) {
        this.#checkInitialization();
        
        try {
            const signingKey = key || await this.#keyManager.getSigningKey();
            const encodedData = new TextEncoder().encode(data);

            const signature = await this.#subtle.sign(
                this.#algorithmConfigs.hmac.name,
                signingKey,
                encodedData
            );

            return this.#arrayBufferToBase64(signature);
        } catch (error) {
            throw new CryptoError('HMAC generation failed', error);
        }
    }

    async verifyHMAC(data, signature, key = null) {
        this.#checkInitialization();
        
        try {
            const signingKey = key || await this.#keyManager.getSigningKey();
            const encodedData = new TextEncoder().encode(data);
            const signatureBuffer = this.#base64ToArrayBuffer(signature);

            return await this.#subtle.verify(
                this.#algorithmConfigs.hmac.name,
                signingKey,
                signatureBuffer,
                encodedData
            );
        } catch (error) {
            throw new CryptoError('HMAC verification failed', error);
        }
    }

    async deriveKey(password, salt, options = {}) {
        this.#checkInitialization();
        
        try {
            const encodedPassword = new TextEncoder().encode(password);
            const baseKey = await this.#subtle.importKey(
                'raw',
                encodedPassword,
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const derivedKey = await this.#subtle.deriveKey(
                {
                    name: this.#algorithmConfigs.kdf.name,
                    salt: new TextEncoder().encode(salt),
                    iterations: options.iterations || this.#algorithmConfigs.kdf.iterations,
                    hash: options.hash || this.#algorithmConfigs.kdf.hash
                },
                baseKey,
                {
                    name: this.#algorithmConfigs.aes.name,
                    length: options.length || this.#algorithmConfigs.kdf.length
                },
                true,
                ['encrypt', 'decrypt']
            );

            const exportedKey = await this.#subtle.exportKey('raw', derivedKey);
            return this.#arrayBufferToBase64(exportedKey);
        } catch (error) {
            throw new CryptoError('Key derivation failed', error);
        }
    }
         
       async generateKey(algorithm = 'aes') {
        this.#checkInitialization();

        try {
            const config = this.#algorithmConfigs[algorithm.toLowerCase()];
            if (!config) {
                throw new CryptoError(`Unsupported algorithm: ${algorithm}`);
            }

            const key = await this.#subtle.generateKey(
                {
                    name: config.name,
                    length: config.length
                },
                true,
                ['encrypt', 'decrypt']
            );

            return key;
        } catch (error) {
            throw new CryptoError('Key generation failed', error);
        }
    }

    async generateNonce(length = 32) {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return this.#arrayBufferToBase64(array);
    }

    async generateUUID() {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        
        array[6] = (array[6] & 0x0f) | 0x40;  // Version 4
        array[8] = (array[8] & 0x3f) | 0x80;  // Variant

        const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    async hash(data, algorithm = 'SHA-512') {
        this.#checkInitialization();
        
        try {
            const encodedData = new TextEncoder().encode(data);
            const hashBuffer = await this.#subtle.digest(algorithm, encodedData);
            return this.#arrayBufferToBase64(hashBuffer);
        } catch (error) {
            throw new CryptoError('Hash generation failed', error);
        }
    }

    async generateSalt(length = 32) {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return this.#arrayBufferToBase64(array);
    }

    async decodeJWT(token) {
        try {
            const [headerB64, payloadB64] = token.split('.');
            const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
            return payload;
        } catch (error) {
            throw new CryptoError('JWT decoding failed', error);
        }
    }

    // Private utility methods
    #arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    #base64ToArrayBuffer(base64) {
        const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async #validateCryptoCapabilities() {
        if (!window.crypto || !window.crypto.subtle) {
            throw new CryptoError('Cryptographic capabilities not available');
        }

        const requiredAlgorithms = ['AES-GCM', 'HMAC', 'PBKDF2', 'RSA-OAEP', 'SHA-512'];
        for (const algorithm of requiredAlgorithms) {
            try {
                await this.#testAlgorithm(algorithm);
            } catch (error) {
                throw new CryptoError(`Required algorithm ${algorithm} not supported`);
            }
        }
    }

    async #testAlgorithm(algorithm) {
        switch (algorithm) {
            case 'AES-GCM':
                await this.generateKey('aes');
                break;
            case 'HMAC':
                await this.#subtle.generateKey(
                    { name: 'HMAC', hash: 'SHA-512' },
                    true,
                    ['sign', 'verify']
                );
                break;
            // Add other algorithm tests as needed
        }
    }

    #checkInitialization() {
        if (!this.#initialized) {
            throw new CryptoError('CryptoService not initialized');
        }
    }
}

class CryptoError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'CryptoError';
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
}

export default CryptoService;