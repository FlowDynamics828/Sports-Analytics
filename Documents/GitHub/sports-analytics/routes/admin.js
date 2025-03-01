// routes/admin.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth/authMiddleware');
const { AuthMiddleware } = require('../auth/authMiddleware');
const logger = require('../utils/logger');
const predictiveModel = require('../scripts/predictive_model');
const LiveGameUpdater = require('../scripts/live-game-updater');

/**
 * Admin authorization middleware
 */
const authorizeAdmin = async (req, res, next) => {
    try {
        if (!req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        next();
    } catch (error) {
        logger.error('Admin authorization error:', error);
        res.status(500).json({ error: 'Authorization failed' });
    }
};

/**
 * @route GET /api/admin/system/status
 * @description Get system status and metrics
 * @access Admin
 */
router.get('/system/status', authenticate, AuthMiddleware.requireAdmin, async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Collect system metrics
        const metrics = {
            database: await getDatabaseMetrics(db),
            predictiveModel: await predictiveModel.healthCheck(),
            liveGames: await getLiveGameMetrics(db),
            systemLoad: getSystemMetrics()
        };

        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        logger.error('System status error:', error);
        res.status(500).json({ error: 'Failed to fetch system status' });
    }
});

/**
 * @route POST /api/admin/games/seed
 * @description Seed game data for testing
 * @access Admin
 */
router.post('/games/seed', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const { leagues = [], days = 30 } = req.body;
        const db = req.app.locals.db;

        // Import the seeder dynamically
        const seeder = require('../scripts/enhanced-seeder');
        
        // Execute seeding
        await seeder.seedGames(db, leagues, days);

        res.json({
            success: true,
            message: 'Game data seeded successfully'
        });
    } catch (error) {
        logger.error('Game seeding error:', error);
        res.status(500).json({ error: 'Failed to seed game data' });
    }
});

/**
 * @route POST /api/admin/live-games/control
 * @description Control live game updates
 * @access Admin
 */
router.post('/live-games/control', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const { action, gameIds } = req.body;
        
        switch (action) {
            case 'start':
                await LiveGameUpdater.start(gameIds);
                break;
            case 'stop':
                await LiveGameUpdater.stop(gameIds);
                break;
            case 'pause':
                await LiveGameUpdater.pause(gameIds);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid action'
                });
        }

        res.json({
            success: true,
            message: `Live game updates ${action}ed successfully`
        });
    } catch (error) {
        logger.error('Live game control error:', error);
        res.status(500).json({ error: 'Failed to control live games' });
    }
});

/**
 * @route POST /api/admin/model/retrain
 * @description Retrain predictive models
 * @access Admin
 */
router.post('/model/retrain', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const { leagues } = req.body;
        
        for (const league of leagues) {
            await predictiveModel._updateModel(league, true);
        }

        res.json({
            success: true,
            message: 'Models retrained successfully'
        });
    } catch (error) {
        logger.error('Model retraining error:', error);
        res.status(500).json({ error: 'Failed to retrain models' });
    }
});

/**
 * @route GET /api/admin/logs
 * @description Get system logs
 * @access Admin
 */
router.get('/logs', authenticate, authorizeAdmin, async (req, res) => {
    try {
        const { level = 'error', limit = 100, startDate, endDate } = req.query;
        const db = req.app.locals.db;

        const query = {
            level: level.toLowerCase(),
            timestamp: {}
        };

        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);

        const logs = await db.collection('logs')
            .find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .toArray();

        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        logger.error('Log retrieval error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Helper Functions
async function getDatabaseMetrics(db) {
    const stats = await db.stats();
    const collections = await db.listCollections().toArray();
    
    return {
        status: 'healthy',
        collections: collections.length,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        avgObjSize: stats.avgObjSize
    };
}

async function getLiveGameMetrics(db) {
    const liveGames = await db.collection('games')
        .find({ status: 'live' })
        .toArray();

    return {
        count: liveGames.length,
        byLeague: liveGames.reduce((acc, game) => {
            acc[game.league] = (acc[game.league] || 0) + 1;
            return acc;
        }, {})
    };
}

function getSystemMetrics() {
    const os = require('os');
    return {
        cpuUsage: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        platform: os.platform(),
        nodeVersion: process.version
    };
}

module.exports = router;