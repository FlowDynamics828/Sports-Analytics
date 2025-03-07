// utils/SecurityManager.js

const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');

class SecurityManager {
    constructor(config) {
        if (!config) {
            throw new Error('Security configuration is required');
        }
        
        this.config = config;
        this.mongoClient = null;
        this.pepper = process.env.SECURITY_PEPPER;
        this.jwtSecret = process.env.JWT_SECRET;
        
        // Database configuration using environment variables
        this.dbConfig = {
            uri: process.env.MONGODB_URI,
            dbName: process.env.MONGODB_NAME || 'sports-analytics',
            options: {
                serverApi: ServerApiVersion.v1
            }
        };
    }

    async initialize() {
        try {
            // Initialize MongoDB connection
            this.mongoClient = new MongoClient(this.dbConfig.uri, this.dbConfig.options);
            await this.mongoClient.connect();
            
            // Verify database connection
            await this.mongoClient.db(this.dbConfig.dbName).command({ ping: 1 });
            
            // Initialize security components
            await this.initializeSecurityComponents();
            
            return true;
        } catch (error) {
            throw new Error(`Failed to initialize security manager: ${error.message}`);
        }
    }

    async initializeSecurityComponents() {
        try {
            // Initialize collections
            const db = this.mongoClient.db(this.dbConfig.dbName);
            this.securityCollection = db.collection('security');
            this.tokensCollection = db.collection('tokens');
            
            // Create indexes
            await this.securityCollection.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 86400 });
            await this.tokensCollection.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to initialize security components: ${error.message}`);
        }
    }

    async cleanup() {
        try {
            if (this.mongoClient) {
                await this.mongoClient.close();
            }
            return true;
        } catch (error) {
            throw new Error(`Failed to cleanup security manager: ${error.message}`);
        }
    }

    // JWT Token Management
    async generateToken(payload, expiresIn = '24h') {
        try {
            const token = jwt.sign(payload, this.jwtSecret, { expiresIn });
            
            // Store token in database
            await this.tokensCollection.insertOne({
                token,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                userId: payload.userId
            });
            
            return token;
        } catch (error) {
            throw new Error(`Failed to generate token: ${error.message}`);
        }
    }

    async verifyToken(token) {
        try {
            // Verify token exists in database
            const tokenDoc = await this.tokensCollection.findOne({ token });
            if (!tokenDoc) {
                throw new Error('Token not found');
            }
            
            // Verify JWT
            const decoded = jwt.verify(token, this.jwtSecret);
            return decoded;
        } catch (error) {
            throw new Error(`Failed to verify token: ${error.message}`);
        }
    }

    // Password Hashing
    async hashPassword(password) {
        try {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.pbkdf2Sync(
                password + this.pepper,
                salt,
                10000,
                64,
                'sha512'
            ).toString('hex');
            
            return { hash, salt };
        } catch (error) {
            throw new Error(`Failed to hash password: ${error.message}`);
        }
    }

    async verifyPassword(password, hash, salt) {
        try {
            const verifyHash = crypto.pbkdf2Sync(
                password + this.pepper,
                salt,
                10000,
                64,
                'sha512'
            ).toString('hex');
            
            return hash === verifyHash;
        } catch (error) {
            throw new Error(`Failed to verify password: ${error.message}`);
        }
    }

    // Data Encryption
    async encryptData(data) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.pepper, 'hex'), iv);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            throw new Error(`Failed to encrypt data: ${error.message}`);
        }
    }

    async decryptData(encryptedData) {
        try {
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                Buffer.from(this.pepper, 'hex'),
                Buffer.from(encryptedData.iv, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error(`Failed to decrypt data: ${error.message}`);
        }
    }

    // Security Checks
    async healthCheck() {
        try {
            const status = {
                database: await this.checkDatabaseConnection(),
                jwt: this.jwtSecret !== undefined,
                pepper: this.pepper !== undefined,
                environment: process.env.NODE_ENV
            };
            
            return {
                status: Object.values(status).every(s => s) ? 'healthy' : 'degraded',
                components: status,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async checkDatabaseConnection() {
        try {
            await this.mongoClient.db(this.dbConfig.dbName).command({ ping: 1 });
            return true;
        } catch (error) {
            return false;
        }
    }

    // Rate Limiting
    async checkRateLimit(userId, action, limit = 100, windowMs = 900000) {
        try {
            const now = Date.now();
            const windowStart = now - windowMs;
            
            const count = await this.securityCollection.countDocuments({
                userId,
                action,
                createdAt: { $gte: new Date(windowStart) }
            });
            
            if (count >= limit) {
                throw new Error('Rate limit exceeded');
            }
            
            await this.securityCollection.insertOne({
                userId,
                action,
                createdAt: new Date()
            });
            
            return true;
        } catch (error) {
            throw new Error(`Rate limit check failed: ${error.message}`);
        }
    }
}

// Export the SecurityManager class
module.exports = { SecurityManager };
