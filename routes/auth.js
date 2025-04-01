const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { authenticate } = require('../auth/authMiddleware');
const { LogManager } = require('../utils/logger');
const { MongoClient } = require('mongodb');

// Initialize logger
const logger = new LogManager().logger;

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 */

/**
 * Register a new user
 * @route POST /auth/register
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} User object and JWT token
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                error: 'Email already registered' 
            });
        }

        // Create new user
        const user = new User({ email, password });
        await user.save();

        // Generate token
        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET environment variable not defined');
            throw new Error('JWT_SECRET is not defined');
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Log successful registration
        logger.info(`User registered successfully: ${email}`);

        res.status(201).json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                roles: user.roles || ['user']
            },
            token
        });
    } catch (error) {
        logger.error(`Registration error: ${error.message}`, { stack: error.stack });
        res.status(500).json({ 
            success: false,
            error: 'Error registering user',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Login user
 * @route POST /auth/login
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} User object and JWT token
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required' 
            });
        }

        // Log login attempt
        logger.info(`Login attempt for user: ${email}`);

        // Direct MongoDB connection rather than using Mongoose due to timeouts
        const client = await MongoClient.connect(process.env.MONGODB_URI, {
            // Increased timeouts to prevent timeout errors
            connectTimeoutMS: 15000,
            socketTimeoutMS: 30000,
            serverSelectionTimeoutMS: 15000
        });
        
        const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
        const usersCollection = db.collection('users');
        
        // Find user with direct MongoDB query
        const user = await usersCollection.findOne({ email });
        
        // Close client connection
        await client.close();
        
        if (!user) {
            logger.warn(`User not found: ${email}`);
            return res.status(401).json({ 
                success: false,
                error: 'Invalid login credentials' 
            });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logger.warn(`Failed login attempt (password mismatch) for user: ${email}`);
            return res.status(401).json({ 
                success: false,
                error: 'Invalid login credentials' 
            });
        }

        // Generate token
        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET environment variable not defined');
            throw new Error('JWT_SECRET is not defined');
        }

        const token = jwt.sign(
            { 
                userId: user._id.toString(), 
                email: user.email,
                roles: user.roles || ['user'] 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Log successful login
        logger.info(`User logged in successfully: ${email}`);

        res.json({
            success: true,
            user: {
                id: user._id.toString(),
                email: user.email,
                roles: user.roles || ['user']
            },
            token
        });
    } catch (error) {
        logger.error(`Login error: ${error.message}`, { stack: error.stack });
        
        // Send more specific error message for better debugging
        let errorMessage = 'Error logging in';
        if (error.name === 'MongoServerSelectionError') {
            errorMessage = 'Database connection error. Please try again later.';
        } else if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            errorMessage = 'Database operation timed out. Please try again.';
        }
        
        res.status(500).json({ 
            success: false,
            error: errorMessage,
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Get current user profile
 * @route GET /auth/me
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} User object
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        /** @type {any} */
        const userInfo = req.user;
        
        if (!userInfo || !userInfo.userId) {
            return res.status(401).json({ 
                success: false,
                error: 'Authentication invalid' 
            });
        }

        const user = await User.findById(userInfo.userId)
            .select('-password -__v'); // Exclude sensitive fields

        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                roles: user.roles || ['user'],
                profile: user.profile || {},
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        logger.error(`Error fetching user profile: ${error.message}`, { stack: error.stack });
        res.status(500).json({ 
            success: false,
            error: 'Error fetching user profile',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Logout user
 * @route POST /auth/logout
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} Success message
 */
router.post('/logout', authenticate, (req, res) => {
    try {
        /** @type {any} */
        const userInfo = req.user;
        
        // Log user logout
        if (userInfo && userInfo.email) {
            logger.info(`User logged out: ${userInfo.email}`);
        }

        res.json({ 
            success: true,
            message: 'Logged out successfully' 
        });
    } catch (error) {
        logger.error(`Logout error: ${error.message}`, { stack: error.stack });
        res.status(500).json({ 
            success: false,
            error: 'Error during logout',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Handle any auth-related errors
 */
router.use((err, req, res, next) => {
    logger.error(`Authentication error: ${err.message}`, { stack: err.stack });
    res.status(500).json({
        success: false,
        error: 'Authentication error occurred',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = router;