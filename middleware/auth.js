const jwt = require('jsonwebtoken');

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
const auth = (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined');
        }

        /** @type {any} */
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        /** @type {any} */
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid authentication token' });
    }
};

/**
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
const authorizeAdmin = async (req, res, next) => {
    try {
        /** @type {any} */
        const user = req.user;
        if (!user?.roles?.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authorization failed' });
    }
};

module.exports = {
    auth,
    authorizeAdmin
}; 