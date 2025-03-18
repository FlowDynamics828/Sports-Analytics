const { body, validationResult, param, query } = require('express-validator');

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

const validateTeamId = () => [
    param('teamId').isString().trim().notEmpty()
];

const validateLeague = () => [
    query('league').optional().isString().trim()
];

const validatePredictionType = () => [
    param('type').isIn(['game', 'season', 'player', 'trend'])
];

module.exports = {
    validatePreferences,
    validateTeamId,
    validateLeague,
    validatePredictionType
};