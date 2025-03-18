const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { MongoClient, ObjectId } = require('mongodb');

class SecurityManager {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.saltRounds = 12;
        this.keyLength = 32;
        this.ivLength = 16;
        this.authTagLength = 16;
        this.pepper = process.env.SECURITY_PEPPER || crypto.randomBytes(32).toString('hex');
        this.tokenSecret = process.env.JWT_SECRET;
        this.tokenExpiry = '24h';
        this.mongoClient = new MongoClient(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        this.mongoClient.connect().then(() => {
            this.db = this.mongoClient.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
        }).catch(error => {
            console.error('MongoDB connection error:', error);
        });
    }

    async hashPassword(password) {
        try {
            // Add pepper before hashing
            const pepperedPassword = this.addPepper(password);
            const salt = await bcrypt.genSalt(this.saltRounds);
            return await bcrypt.hash(pepperedPassword, salt);
        } catch (error) {
            console.error('Password hashing error:', error);
            throw new Error('Password processing failed');
        }
    }

    async verifyPassword(password, hashedPassword) {
        try {
            const pepperedPassword = this.addPepper(password);
            return await bcrypt.compare(pepperedPassword, hashedPassword);
        } catch (error) {
            console.error('Password verification error:', error);
            throw new Error('Password verification failed');
        }
    }

    generateToken(payload, options = {}) {
        try {
            const tokenOptions = {
                expiresIn: this.tokenExpiry,
                algorithm: 'HS256',
                ...options
            };
            return jwt.sign(payload, this.tokenSecret, tokenOptions);
        } catch (error) {
            console.error('Token generation error:', error);
            throw new Error('Token generation failed');
        }
    }

    async verifyToken(token) {
        try {
            const decoded = await promisify(jwt.verify)(token, this.tokenSecret);
            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token has expired');
            }
            throw new Error('Invalid token');
        }
    }

    async encrypt(data) {
        try {
            const iv = crypto.randomBytes(this.ivLength);
            const key = crypto.scryptSync(this.tokenSecret, 'salt', this.keyLength);
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            const encrypted = Buffer.concat([
                cipher.update(typeof data === 'string' ? data : JSON.stringify(data), 'utf8'),
                cipher.final()
            ]);

            const authTag = cipher.getAuthTag();

            return {
                iv: iv.toString('hex'),
                encrypted: encrypted.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Data encryption failed');
        }
    }

    async decrypt(encryptedData) {
        try {
            const { iv, encrypted, authTag } = encryptedData;
            const key = crypto.scryptSync(this.tokenSecret, 'salt', this.keyLength);
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                key,
                Buffer.from(iv, 'hex')
            );

            decipher.setAuthTag(Buffer.from(authTag, 'hex'));

            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(encrypted, 'hex')),
                decipher.final()
            ]);

            return decrypted.toString('utf8');
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Data decryption failed');
        }
    }

    generateSecureId(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    addPepper(data) {
        return crypto
            .createHmac('sha256', this.pepper)
            .update(data)
            .digest('hex');
    }

    async generateApiKey() {
        const apiKey = crypto.randomBytes(32).toString('base64');
        const hashedKey = await this.hashPassword(apiKey);
        return { apiKey, hashedKey };
    }

    validatePassword(password) {
        const requirements = {
            minLength: 8,
            hasUpperCase: /[A-Z]/,
            hasLowerCase: /[a-z]/,
            hasNumbers: /\d/,
            hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/
        };

        const checks = {
            length: password.length >= requirements.minLength,
            upperCase: requirements.hasUpperCase.test(password),
            lowerCase: requirements.hasLowerCase.test(password),
            numbers: requirements.hasNumbers.test(password),
            specialChar: requirements.hasSpecialChar.test(password)
        };

        return {
            isValid: Object.values(checks).every(check => check),
            checks
        };
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/[&<>"']/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char]))
            .trim();
    }

    rateLimit(maxAttempts = 5, timeWindow = 15 * 60 * 1000) {
        const attempts = new Map();
        
        return (identifier) => {
            const now = Date.now();
            const userAttempts = attempts.get(identifier) || [];
            
            // Clean up old attempts
            const recentAttempts = userAttempts.filter(time => now - time < timeWindow);
            
            if (recentAttempts.length >= maxAttempts) {
                return false;
            }
            
            recentAttempts.push(now);
            attempts.set(identifier, recentAttempts);
            return true;
        };
    }

    async storeRefreshToken(userId, refreshToken) {
        try {
            await this.db.collection('refreshTokens').insertOne({
                userId: new ObjectId(userId),
                token: refreshToken,
                createdAt: new Date()
            });
        } catch (error) {
            console.error('Error storing refresh token:', error);
            throw new Error('Failed to store refresh token');
        }
    }

    async verifyRefreshToken(refreshToken) {
        try {
            const tokenDoc = await this.db.collection('refreshTokens').findOne({ token: refreshToken });
            return tokenDoc ? tokenDoc.userId : null;
        } catch (error) {
            console.error('Error verifying refresh token:', error);
            throw new Error('Failed to verify refresh token');
        }
    }

    async revokeRefreshToken(refreshToken) {
        try {
            await this.db.collection('refreshTokens').deleteOne({ token: refreshToken });
        } catch (error) {
            console.error('Error revoking refresh token:', error);
            throw new Error('Failed to revoke refresh token');
        }
    }
}

module.exports = SecurityManager;