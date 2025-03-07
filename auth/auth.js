const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { promisify } = require('util');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('./authMiddleware');
const { SecurityManager } = require('../utils/SecurityManager');
const { LogManager } = require('../utils/logger');
const { CacheManager } = require('../utils/cache');
const { NotificationManager } = require('../utils/notifications');
const { RateLimiterCluster } = require('../utils/rateLimiter');
const { CircuitBreaker } = require('../utils/circuitBreaker');

// Initialize managers and services
const logger = new LogManager().logger;
const securityManager = new SecurityManager();
const cache = new CacheManager();
const notifications = new NotificationManager();
const rateLimiter = new RateLimiterCluster();
const breaker = new CircuitBreaker();

// Configure rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 failed attempts
    message: 'Too many login attempts, please try again after 15 minutes'
});

const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registration attempts
    message: 'Too many registration attempts, please try again after an hour'
});

// Validation schemas
const registerValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password')
        .isLength({ min: 12 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain uppercase, lowercase, number, and special character'),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty()
];

const loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
];

// Token generation and management
const generateTokens = async (user) => {
    const accessToken = jwt.sign(
        { 
            userId: user._id,
            email: user.email,
            roles: user.roles 
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await securityManager.storeRefreshToken(user._id, hashedRefreshToken);

    return {
        accessToken,
        refreshToken
    };
};

// Registration route with advanced security
router.post('/register',
    registrationLimiter,
    registerValidation,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password, firstName, lastName } = req.body;

            // Check for breached passwords
            const isBreached = await securityManager.checkBreachedPassword(password);
            if (isBreached) {
                return res.status(400).json({
                    error: 'This password has been found in data breaches. Please choose a different one.'
                });
            }

            // Check if email exists
            const existingUser = await req.app.locals.db.collection('users')
                .findOne({ email: email.toLowerCase() });

            if (existingUser) {
                return res.status(409).json({
                    error: 'Email already registered'
                });
            }

            // Generate verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = await bcrypt.hash(verificationToken, 10);

            // Create user with enhanced security
            const user = {
                email: email.toLowerCase(),
                password: await securityManager.hashPassword(password),
                firstName,
                lastName,
                verificationToken: hashedToken,
                verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                roles: ['user'],
                status: 'pending',
                securityQuestions: [],
                failedLoginAttempts: 0,
                lastLogin: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deviceHistory: [],
                ipHistory: [],
                twoFactorEnabled: false,
                passwordHistory: [],
                accountLocked: false
            };

            const result = await req.app.locals.db.collection('users').insertOne(user);

            // Send verification email
            await notifications.sendVerificationEmail(email, verificationToken);

            // Create audit log
            await securityManager.createAuditLog({
                userId: result.insertedId,
                action: 'REGISTER',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: {
                    email,
                    firstName,
                    lastName
                }
            });

            res.status(201).json({
                success: true,
                message: 'Registration successful. Please check your email to verify your account.'
            });

        } catch (error) {
            logger.error('Registration error:', error);
            res.status(500).json({
                error: 'Registration failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// Login route with advanced security features
router.post('/login',
    loginLimiter,
    loginValidation,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            // Get user with rate limiting and circuit breaker
            const user = await breaker.fire(async () => {
                return await req.app.locals.db.collection('users')
                    .findOne({ email: email.toLowerCase() });
            });

            if (!user) {
                return res.status(401).json({
                    error: 'Invalid credentials'
                });
            }

            // Check account status
            if (user.status !== 'active' || user.accountLocked) {
                return res.status(403).json({
                    error: 'Account is not active or is locked'
                });
            }

            // Verify password with timing attack protection
            const isValid = await securityManager.verifyPassword(password, user.password);
            if (!isValid) {
                // Increment failed login attempts
                await req.app.locals.db.collection('users').updateOne(
                    { _id: user._id },
                    { 
                        $inc: { failedLoginAttempts: 1 },
                        $set: { lastFailedLogin: new Date() }
                    }
                );

                // Check if account should be locked
                if (user.failedLoginAttempts >= 4) {
                    await securityManager.lockAccount(user._id);
                    return res.status(403).json({
                        error: 'Account locked due to too many failed attempts'
                    });
                }

                return res.status(401).json({
                    error: 'Invalid credentials'
                });
            }

            // Check if 2FA is required
            if (user.twoFactorEnabled) {
                const twoFactorToken = await securityManager.generate2FAToken(user._id);
                await notifications.send2FACode(user.email, twoFactorToken);

                return res.json({
                    success: true,
                    requiresTwoFactor: true,
                    message: '2FA code sent to your email'
                });
            }

            // Generate tokens
            const tokens = await generateTokens(user);

            // Update user login info
            await req.app.locals.db.collection('users').updateOne(
                { _id: user._id },
                {
                    $set: {
                        lastLogin: new Date(),
                        lastLoginIP: req.ip,
                        failedLoginAttempts: 0
                    },
                    $push: {
                        deviceHistory: {
                            userAgent: req.headers['user-agent'],
                            ip: req.ip,
                            timestamp: new Date()
                        }
                    }
                }
            );

            // Create audit log
            await securityManager.createAuditLog({
                userId: user._id,
                action: 'LOGIN',
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });

            // Set secure HTTP-only cookie
            res.cookie('refreshToken', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            res.json({
                success: true,
                accessToken: tokens.accessToken,
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    roles: user.roles
                }
            });

        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json({
                error: 'Login failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// 2FA verification route
router.post('/verify-2fa', async (req, res) => {
    try {
        const { email, code } = req.body;

        const isValid = await securityManager.verify2FAToken(email, code);
        if (!isValid) {
            return res.status(401).json({
                error: 'Invalid or expired 2FA code'
            });
        }

        const user = await req.app.locals.db.collection('users')
            .findOne({ email: email.toLowerCase() });

        const tokens = await generateTokens(user);

        // Update login info and create audit log
        await Promise.all([
            req.app.locals.db.collection('users').updateOne(
                { _id: user._id },
                {
                    $set: {
                        lastLogin: new Date(),
                        lastLoginIP: req.ip,
                        failedLoginAttempts: 0
                    }
                }
            ),
            securityManager.createAuditLog({
                userId: user._id,
                action: 'TWO_FACTOR_AUTH',
                ip: req.ip,
                userAgent: req.headers['user-agent']
            })
        ]);

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            accessToken: tokens.accessToken,
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                roles: user.roles
            }
        });

    } catch (error) {
        logger.error('2FA verification error:', error);
        res.status(500).json({
            error: '2FA verification failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Password reset request route
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await req.app.locals.db.collection('users')
            .findOne({ email: email.toLowerCase() });

        if (!user) {
            // Return same response even if user doesn't exist for security
            return res.json({
                success: true,
                message: 'If your email is registered, you will receive password reset instructions'
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = await bcrypt.hash(resetToken, 10);

        await req.app.locals.db.collection('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    resetPasswordToken: hashedToken,
                    resetPasswordExpires: new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour
                }
            }
        );

        await notifications.sendPasswordResetEmail(email, resetToken);

        await securityManager.createAuditLog({
            userId: user._id,
            action: 'PASSWORD_RESET_REQUEST',
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            message: 'If your email is registered, you will receive password reset instructions'
        });

    } catch (error) {
        logger.error('Password reset request error:', error);
        res.status(500).json({
            error: 'Password reset request failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Reset password route
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        // Find user with valid reset token
        const user = await req.app.locals.db.collection('users').findOne({
            resetPasswordToken: { $exists: true },
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                error: 'Invalid or expired password reset token'
            });
        }

        // Verify token
        const isValid = await bcrypt.compare(token, user.resetPasswordToken);
        if (!isValid) {
            return res.status(400).json({
                error: 'Invalid password reset token'
            });
        }

        // Check for breached password
        const isBreached = await securityManager.checkBreachedPassword(password);
        if (isBreached) {
            return res.status(400).json({
                error: 'This password has been found in data breaches. Please choose a different one.'
            });
        }

        // Check password history
        const hashedPassword = await securityManager.hashPassword(password);
        const isReused = await securityManager.checkPasswordHistory(user._id, password);
        if (isReused) {
            return res.status(400).json({
                error: 'Cannot reuse any of your last 5 passwords'
            });
        }

        // Update password and clear reset token
        await req.app.locals.db.collection('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashedPassword,
                    updatedAt: new Date()
                },
                $unset: {
                    resetPasswordToken: "",
                    resetPasswordExpires: ""
                },
                $push: {
                    passwordHistory: {
                        $each: [hashedPassword],
                        $slice: -5 // Keep only last 5 passwords
                    }
                }
            }
        );

        // Invalidate all existing sessions
        await securityManager.invalidateAllSessions(user._id);

        // Create audit log
        await securityManager.createAuditLog({
            userId: user._id,
            action: 'PASSWORD_RESET',
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send notification
        await notifications.sendPasswordChangeNotification(user.email);

        res.json({
            success: true,
            message: 'Password has been reset successfully'
        });

    } catch (error) {
        logger.error('Password reset error:', error);
        res.status(500).json({
            error: 'Password reset failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Refresh token route
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.cookies;

        if (!refreshToken) {
            return res.status(401).json({
                error: 'Refresh token required'
            });
        }

        // Verify refresh token
        const userId = await securityManager.verifyRefreshToken(refreshToken);
        if (!userId) {
            return res.status(401).json({
                error: 'Invalid refresh token'
            });
        }

        const user = await req.app.locals.db.collection('users').findOne({ _id: userId });
        if (!user) {
            return res.status(401).json({
                error: 'User not found'
            });
        }

        // Generate new tokens
        const tokens = await generateTokens(user);

        // Update refresh token in database
        await securityManager.updateRefreshToken(userId, tokens.refreshToken);

        // Set new refresh token cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            accessToken: tokens.accessToken
        });

    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Token refresh failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Logout route
router.post('/logout', authenticate, async (req, res) => {
    try {
        const { refreshToken } = req.cookies;

        // Remove refresh token from database
        if (refreshToken) {
            await securityManager.revokeRefreshToken(refreshToken);
        }

        // Clear refresh token cookie
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        // Create audit log
        await securityManager.createAuditLog({
            userId: req.user.id,
            action: 'LOGOUT',
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            error: 'Logout failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Change password route (authenticated)
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await req.app.locals.db.collection('users').findOne({ _id: req.user.id });

        // Verify current password
        const isValid = await securityManager.verifyPassword(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({
                error: 'Current password is incorrect'
            });
        }

        // Check password strength and history
        const isBreached = await securityManager.checkBreachedPassword(newPassword);
        if (isBreached) {
            return res.status(400).json({
                error: 'This password has been found in data breaches. Please choose a different one.'
            });
        }

        const isReused = await securityManager.checkPasswordHistory(user._id, newPassword);
        if (isReused) {
            return res.status(400).json({
                error: 'Cannot reuse any of your last 5 passwords'
            });
        }

        // Update password
        const hashedPassword = await securityManager.hashPassword(newPassword);
        await req.app.locals.db.collection('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashedPassword,
                    updatedAt: new Date()
                },
                $push: {
                    passwordHistory: {
                        $each: [hashedPassword],
                        $slice: -5
                    }
                }
            }
        );

        // Invalidate all sessions except current
        await securityManager.invalidateOtherSessions(user._id, req.sessionID);

        // Create audit log
        await securityManager.createAuditLog({
            userId: user._id,
            action: 'PASSWORD_CHANGE',
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send notification
        await notifications.sendPasswordChangeNotification(user.email);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        logger.error('Password change error:', error);
        res.status(500).json({
            error: 'Password change failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Toggle 2FA route
router.post('/toggle-2fa', authenticate, async (req, res) => {
    try {
        const user = await req.app.locals.db.collection('users').findOne({ _id: req.user.id });

        const newState = !user.twoFactorEnabled;
        await req.app.locals.db.collection('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    twoFactorEnabled: newState,
                    updatedAt: new Date()
                }
            }
        );

        // Create audit log
        await securityManager.createAuditLog({
            userId: user._id,
            action: newState ? 'ENABLE_2FA' : 'DISABLE_2FA',
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            message: `Two-factor authentication ${newState ? 'enabled' : 'disabled'} successfully`
        });

    } catch (error) {
        logger.error('2FA toggle error:', error);
        res.status(500).json({
            error: '2FA toggle failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get security settings route
router.get('/security-settings', authenticate, async (req, res) => {
    try {
        const user = await req.app.locals.db.collection('users').findOne(
            { _id: req.user.id },
            { projection: { password: 0, passwordHistory: 0 } }
        );

        const activeSessions = await securityManager.getActiveSessions(user._id);
        const loginHistory = await securityManager.getLoginHistory(user._id);

        res.json({
            success: true,
            data: {
                twoFactorEnabled: user.twoFactorEnabled,
                activeSessions,
                loginHistory,
                deviceHistory: user.deviceHistory,
                securityQuestions: user.securityQuestions?.length || 0
            }
        });

    } catch (error) {
        logger.error('Security settings fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch security settings',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Error handler
router.use((err, req, res, next) => {
    logger.error('Auth route error:', err);
    res.status(500).json({
        error: 'Authentication error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = router;