const { body, validationResult } = require('express-validator');

const validatePreferences = [
    body('notifications').isObject(),
    body('displaySettings').isObject(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

module.exports = { validatePreferences };