// Advanced Key Management System
// Production Version 4.1
// Last Updated: 2024-02-02

class KeyManager {
    static instance = null;
    static VERSION = '4.1.0';

    #keys = new Map();
    #keyStore = null;
    #initialized = false;
    #masterKey = null;
    #keyRotationInterval = 24 * 60 * 60 * 1000; // 24 hours
    #lastRotation = null;

    constructor() {
        if (KeyManager.instance) {
            return KeyManager.instance;
        }
        KeyManager.instance = this;
    }

    static async getInstance() {
        if (!KeyManager.instance) {
            KeyManager.instance = new KeyManager();
            await KeyManager.instance.#initialize();
        }
        return KeyManager.instance;
    }

    async #initialize() {
        if (this.#initialized) return;

        try {
            this.#keyStore = await this.#initializeKeyStore();
            this.#masterKey = await this.#deriveMasterKey();
            await this.#loadKeys();
            this.#setupKeyRotation();
            this.#initialized = true;
        } catch (error) {
            throw new KeyManagerError('Key manager initialization failed', error);
        }
    }

    async getEncryptionKey() {
        this.#checkInitialization();
        return this.#getKey('encryption');
    }

    async getSigningKey() {
        this.#checkInitialization();
        return this.#getKey('signing');
    }

    async rotateKeys() {
        this.#checkInitialization();
        
        try {
            const newKeys = {
                encryption: await this.#generateKey('encryption'),
                signing: await this.#generateKey('signing')
            };

            await this.#validateKeys(newKeys);
            await this.#backupCurrentKeys();
            await this.#updateKeys(newKeys);
            
            this.#lastRotation = Date.now();
            await this.#persistKeyMetadata();
        } catch (error) {
            throw new KeyManagerError('Key rotation failed', error);
        }
    }

       async #generateKey(type) {
        const subtle = window.crypto.subtle;
        const config = this.#getKeyConfig(type);

        try {
            return await subtle.generateKey(
                config.algorithm,
                true,
                config.usages
            );
        } catch (error) {
            throw new KeyManagerError(`Failed to generate ${type} key`, error);
        }
    }

    async #persistKey(type, key) {
        try {
            const exportedKey = await window.crypto.subtle.exportKey('raw', key);
            const encryptedKey = await this.#encryptWithMasterKey(exportedKey);
            
            await this.#keyStore.setItem(
                `${type}_key_${Date.now()}`,
                {
                    key: encryptedKey,
                    type,
                    version: KeyManager.VERSION,
                    created: Date.now()
                }
            );
        } catch (error) {
            throw new KeyManagerError(`Failed to persist ${type} key`, error);
        }
    }

    async #loadKeys() {
        try {
            const storedKeys = await this.#keyStore.getAll();
            
            for (const [id, keyData] of Object.entries(storedKeys)) {
                if (this.#isValidKeyData(keyData)) {
                    const decryptedKey = await this.#decryptWithMasterKey(keyData.key);
                    const importedKey = await this.#importKey(keyData.type, decryptedKey);
                    this.#keys.set(keyData.type, {
                        key: importedKey,
                        metadata: {
                            created: keyData.created,
                            version: keyData.version,
                            id
                        }
                    });
                }
            }

            // Generate missing keys
            for (const type of ['encryption', 'signing']) {
                if (!this.#keys.has(type)) {
                    const newKey = await this.#generateKey(type);
                    await this.#persistKey(type, newKey);
                    this.#keys.set(type, {
                        key: newKey,
                        metadata: {
                            created: Date.now(),
                            version: KeyManager.VERSION,
                            id: crypto.randomUUID()
                        }
                    });
                }
            }
        } catch (error) {
            throw new KeyManagerError('Failed to load keys', error);
        }
    }

    async #deriveMasterKey() {
        try {
            const secret = await this.#getOrGenerateSecret();
            const salt = await this.#getOrGenerateSalt();
            
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(secret),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            return await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: new TextEncoder().encode(salt),
                    iterations: 310000,
                    hash: 'SHA-512'
                },
                keyMaterial,
                {
                    name: 'AES-GCM',
                    length: 256
                },
                false,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            throw new KeyManagerError('Failed to derive master key', error);
        }
    }

    async #encryptWithMasterKey(data) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        try {
            const encryptedData = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv
                },
                this.#masterKey,
                data
            );

            const result = new Uint8Array(iv.length + encryptedData.byteLength);
            result.set(iv);
            result.set(new Uint8Array(encryptedData), iv.length);
            
            return this.#arrayBufferToBase64(result);
        } catch (error) {
            throw new KeyManagerError('Failed to encrypt with master key', error);
        }
    }

    async #decryptWithMasterKey(encryptedData) {
        const data = this.#base64ToArrayBuffer(encryptedData);
        const iv = data.slice(0, 12);
        const encryptedContent = data.slice(12);

        try {
            return await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv
                },
                this.#masterKey,
                encryptedContent
            );
        } catch (error) {
            throw new KeyManagerError('Failed to decrypt with master key', error);
        }
    }

    #setupKeyRotation() {
        setInterval(() => {
            if (this.#shouldRotateKeys()) {
                this.rotateKeys().catch(error => {
                    console.error('Key rotation failed:', error);
                });
            }
        }, 60 * 60 * 1000); // Check every hour
    }

    #shouldRotateKeys() {
        if (!this.#lastRotation) return true;
        return (Date.now() - this.#lastRotation) >= this.#keyRotationInterval;
    }

    #getKeyConfig(type) {
        const configs = {
            encryption: {
                algorithm: {
                    name: 'AES-GCM',
                    length: 256
                },
                usages: ['encrypt', 'decrypt']
            },
            signing: {
                algorithm: {
                    name: 'HMAC',
                    hash: 'SHA-512',
                    length: 512
                },
                usages: ['sign', 'verify']
            }
        };

        const config = configs[type];
        if (!config) {
            throw new KeyManagerError(`Invalid key type: ${type}`);
        }
        return config;
    }

    async #importKey(type, keyData) {
        const config = this.#getKeyConfig(type);
        return await window.crypto.subtle.importKey(
            'raw',
            keyData,
            config.algorithm,
            true,
            config.usages
        );
    }

    async #backupCurrentKeys() {
        const backup = {
            keys: Array.from(this.#keys.entries()),
            timestamp: Date.now(),
            version: KeyManager.VERSION
        };

        try {
            const encrypted = await this.#encryptWithMasterKey(
                new TextEncoder().encode(JSON.stringify(backup))
            );
            await this.#keyStore.setItem('key_backup', encrypted);
        } catch (error) {
            throw new KeyManagerError('Failed to backup keys', error);
        }
    }

    async #initializeKeyStore() {
        // Implementation would depend on your storage strategy
        // This could be IndexedDB, localStorage with encryption, etc.
        return new SecureStorage();
    }

    #checkInitialization() {
        if (!this.#initialized) {
            throw new KeyManagerError('KeyManager not initialized');
        }
    }

    // Utility methods
    #arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    #base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
}

class KeyManagerError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'KeyManagerError';
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
}

// SecureStorage class implementation would go here
// This would handle the actual storage of encrypted keys

export default KeyManager;