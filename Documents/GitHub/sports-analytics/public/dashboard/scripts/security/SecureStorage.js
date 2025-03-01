// Secure Storage System
// Production Version 4.1
// Last Updated: 2024-02-02

import { CryptoService } from './cryptoService.js';

class SecureStorage {
    static VERSION = '4.1.0';
    static DB_NAME = 'secure_storage';
    static STORE_NAME = 'encrypted_store';
    
    #db = null;
    #crypto = null;
    #initialized = false;
    #encryptionKey = null;

    constructor() {
        if (SecureStorage.instance) {
            return SecureStorage.instance;
        }
        SecureStorage.instance = this;
    }

    async initialize() {
        if (this.#initialized) return;

        try {
            this.#crypto = await CryptoService.getInstance();
            this.#encryptionKey = await this.#getStorageKey();
            this.#db = await this.#initializeDatabase();
            this.#initialized = true;
        } catch (error) {
            throw new SecureStorageError('Storage initialization failed', error);
        }
    }

    async setItem(key, value) {
        await this.#ensureInitialized();
        
        try {
            const encryptedData = await this.#encryptData(value);
            const metadata = {
                timestamp: Date.now(),
                version: SecureStorage.VERSION,
                hash: await this.#generateHash(value)
            };

            await this.#performDatabaseOperation('put', {
                key,
                data: encryptedData,
                metadata
            });
        } catch (error) {
            throw new SecureStorageError(`Failed to set item: ${key}`, error);
        }
    }

    async getItem(key) {
        await this.#ensureInitialized();
        
        try {
            const record = await this.#performDatabaseOperation('get', key);
            if (!record) return null;

            const decryptedData = await this.#decryptData(record.data);
            const currentHash = await this.#generateHash(decryptedData);

            if (currentHash !== record.metadata.hash) {
                throw new SecureStorageError('Data integrity check failed');
            }

            return decryptedData;
        } catch (error) {
            throw new SecureStorageError(`Failed to get item: ${key}`, error);
        }
    }

    async removeItem(key) {
        await this.#ensureInitialized();
        
        try {
            await this.#performDatabaseOperation('delete', key);
        } catch (error) {
            throw new SecureStorageError(`Failed to remove item: ${key}`, error);
        }
    }

    async getAll() {
        await this.#ensureInitialized();
        
        try {
            const store = await this.#getObjectStore('readonly');
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onerror = () => reject(new SecureStorageError('Failed to get all items'));
                request.onsuccess = async () => {
                    const results = {};
                    for (const record of request.result) {
                        try {
                            results[record.key] = await this.#decryptData(record.data);
                        } catch (error) {
                            console.error(`Failed to decrypt item: ${record.key}`, error);
                        }
                    }
                    resolve(results);
                };
            });
        } catch (error) {
            throw new SecureStorageError('Failed to get all items', error);
        }
    }

    async clear() {
        await this.#ensureInitialized();
        
        try {
            const store = await this.#getObjectStore('readwrite');
            await new Promise((resolve, reject) => {
                const request = store.clear();
                request.onerror = () => reject(new SecureStorageError('Failed to clear storage'));
                request.onsuccess = () => resolve();
            });
        } catch (error) {
            throw new SecureStorageError('Failed to clear storage', error);
        }
    }

    // Private methods
    async #initializeDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(SecureStorage.DB_NAME, 1);

            request.onerror = () => reject(new SecureStorageError('Database initialization failed'));
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(SecureStorage.STORE_NAME)) {
                    db.createObjectStore(SecureStorage.STORE_NAME, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => resolve(request.result);
        });
    }

    async #getStorageKey() {
        try {
            let key = await this.#crypto.getEncryptionKey();
            if (!key) {
                key = await this.#crypto.generateKey();
                await this.#crypto.setEncryptionKey(key);
            }
            return key;
        } catch (error) {
            throw new SecureStorageError('Failed to get storage key', error);
        }
    }

    async #encryptData(data) {
        const serialized = JSON.stringify(data);
        return this.#crypto.encryptData(serialized, this.#encryptionKey);
    }

    async #decryptData(encryptedData) {
        const decrypted = await this.#crypto.decryptData(encryptedData, this.#encryptionKey);
        return JSON.parse(decrypted);
    }

    async #generateHash(data) {
        return this.#crypto.hash(JSON.stringify(data));
    }

    async #getObjectStore(mode = 'readonly') {
        if (!this.#db) {
            throw new SecureStorageError('Database not initialized');
        }

        const transaction = this.#db.transaction([SecureStorage.STORE_NAME], mode);
        return transaction.objectStore(SecureStorage.STORE_NAME);
    }

    async #performDatabaseOperation(operation, data) {
        const store = await this.#getObjectStore(
            ['put', 'delete'].includes(operation) ? 'readwrite' : 'readonly'
        );

        return new Promise((resolve, reject) => {
            const request = store[operation](data);
            request.onerror = () => reject(new SecureStorageError(`Database operation failed: ${operation}`));
            request.onsuccess = () => resolve(request.result);
        });
    }

    async #ensureInitialized() {
        if (!this.#initialized) {
            await this.initialize();
        }
    }

    // Maintenance and cleanup
    async compact() {
        await this.#ensureInitialized();
        
        try {
            const store = await this.#getObjectStore('readwrite');
            const oldItems = await this.#performDatabaseOperation('getAll');
            
            // Remove items older than 30 days
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            for (const item of oldItems) {
                if (item.metadata.timestamp < thirtyDaysAgo) {
                    await this.#performDatabaseOperation('delete', item.key);
                }
            }
        } catch (error) {
            throw new SecureStorageError('Storage compaction failed', error);
        }
    }
}

class SecureStorageError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'SecureStorageError';
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
}

export default SecureStorage;