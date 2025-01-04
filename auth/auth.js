const jwt = require('jsonwebtoken');

// Generate tokens for authenticated users
function generateToken(user) {
    return jwt.sign(
        { 
            id: user._id, 
            email: user.email,
            subscription: user.subscription 
        },
        process.env.JWT_SECRET || 'default-secret-key',
        { expiresIn: '24h' }
    );
}

// Middleware to protect routes
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // Instead of returning JSON, redirect to login
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect('/login');
        }
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key', (err, user) => {
        if (err) {
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                return res.redirect('/login');
            }
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

module.exports = { generateToken, authenticateToken };