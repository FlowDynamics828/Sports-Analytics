const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth/authMiddleware');
const { StatsCalculator } = require('../utils/statsCalculator');
const predictiveModel = require('../scripts/predictive_model');
const asyncHandler = require('express-async-handler');
const _ = require('lodash');
const NodeCache = require('node-cache');
const { param, query, validationResult } = require('express-validator');

// Initialize cache with longer TTL for predictions
const statsCache = new NodeCache({
  stdTTL: 600, // 10 minutes for regular stats
  checkperiod: 120
});

const predictionsCache = new NodeCache({
  stdTTL: 3600, // 1 hour for predictions
  checkperiod: 300
});

// Validation middleware
const validateTeamRequest = () => [
  param('teamId').isString().trim().notEmpty(),
  query('league').optional().isString().trim(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

const validateLeagueRequest = () => [
  param('leagueId').isString().trim().notEmpty(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

const validatePredictionRequest = () => [
  param('type').isIn(['game', 'season', 'player', 'trend']),
  query('league').isString().trim().notEmpty(),
  query('factors').optional().isArray(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Team Advanced Stats
router.get('/team/:teamId/advanced', validateTeamRequest(), authenticate, asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { league } = req.query;
  const cacheKey = `advanced_stats:${teamId}:${league}`;

  let advancedStats = statsCache.get(cacheKey);
  if (!advancedStats) {
    const db = req.app.locals.db;
    const games = await db.collection('games')
      .find({
        $or: [{ 'homeTeam.id': teamId }, { 'awayTeam.id': teamId }],
        league: league.toUpperCase(),
        status: 'completed'
      })
      .sort({ date: -1 })
      .limit(100)
      .toArray();

    advancedStats = await StatsCalculator.calculateAdvancedStats(games, teamId);
    statsCache.set(cacheKey, advancedStats);
  }

  res.json({
    success: true,
    data: advancedStats,
    metadata: { timestamp: new Date().toISOString() }
  });
}));

// Real-time Game Stats
router.get('/game/:gameId/live', authenticate, asyncHandler(async (req, res) => {
  const { gameId } = req.params;
  const db = req.app.locals.db;

  const game = await db.collection('games').findOne({
    _id: gameId,
    status: 'live'
  });

  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Live game not found'
    });
  }

  const liveStats = await StatsCalculator.calculateLiveGameStats(game);
  res.json({
    success: true,
    data: liveStats,
    metadata: { timestamp: new Date().toISOString() }
  });
}));

// Predictive Analytics
router.get('/predictions/:type', validatePredictionRequest(), authenticate, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { league, factors = [], teamId } = req.query;
  const cacheKey = `prediction:${type}:${league}:${teamId}:${JSON.stringify(factors)}`;

  let prediction = predictionsCache.get(cacheKey);
  if (!prediction) {
    prediction = await predictiveModel.predict({
      league,
      predictionType: type.toUpperCase(),
      factors,
      teamId,
      inputData: {
        timestamp: new Date(),
        factors
      }
    });
    predictionsCache.set(cacheKey, prediction);
  }

  res.json({
    success: true,
    data: prediction,
    metadata: { timestamp: new Date().toISOString() }
  });
}));

// Historical Analysis & Trends
router.get('/trends/:teamId', validateTeamRequest(), authenticate, asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { league, timeframe = 30 } = req.query;
  const db = req.app.locals.db;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(timeframe));

  const games = await db.collection('games')
    .find({
      $or: [{ 'homeTeam.id': teamId }, { 'awayTeam.id': teamId }],
      league: league.toUpperCase(),
      date: { $gte: startDate },
      status: 'completed'
    })
    .sort({ date: 1 })
    .toArray();

  const trends = await StatsCalculator.analyzeTrends(games, teamId);

  res.json({
    success: true,
    data: trends,
    metadata: {
      timeframe,
      gamesAnalyzed: games.length,
      timestamp: new Date().toISOString()
    }
  });
}));

// League Advanced Analytics
router.get('/league/:leagueId/advanced', validateLeagueRequest(), authenticate, asyncHandler(async (req, res) => {
  const { leagueId } = req.params;
  const cacheKey = `league_advanced:${leagueId}`;

  let advancedStats = statsCache.get(cacheKey);
  if (!advancedStats) {
    const db = req.app.locals.db;
    const games = await db.collection('games')
      .find({
        league: leagueId.toUpperCase(),
        status: 'completed'
      })
      .sort({ date: -1 })
      .toArray();

    advancedStats = {
      leagueMetrics: await StatsCalculator.calculateLeagueMetrics(games),
      teamComparisons: await StatsCalculator.compareTeams(games),
      performanceInsights: await StatsCalculator.generateLeagueInsights(games),
      predictions: await predictiveModel.predict({
        league: leagueId,
        predictionType: 'LEAGUE_TRENDS',
        inputData: { games }
      })
    };

    statsCache.set(cacheKey, advancedStats);
  }

  res.json({
    success: true,
    data: advancedStats,
    metadata: { timestamp: new Date().toISOString() }
  });
}));

// Comparative Analytics
router.get('/compare/teams', authenticate, asyncHandler(async (req, res) => {
  const { teamIds, league, metrics } = req.query;

  if (!teamIds || !Array.isArray(teamIds) || teamIds.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'At least two team IDs required for comparison'
    });
  }

  const db = req.app.locals.db;
  const games = await db.collection('games')
    .find({
      $or: teamIds.map(id => ({ $or: [{ 'homeTeam.id': id }, { 'awayTeam.id': id }] })),
      league: league.toUpperCase(),
      status: 'completed'
    })
    .toArray();

  const comparison = await StatsCalculator.compareTeamMetrics(games, teamIds, metrics);

  res.json({
    success: true,
    data: comparison,
    metadata: {
      teamsCompared: teamIds.length,
      metricsAnalyzed: metrics?.length || 'all',
      timestamp: new Date().toISOString()
    }
  });
}));

// Player Performance Analytics
router.get('/player/:playerId/stats', authenticate, asyncHandler(async (req, res) => {
  const { playerId } = req.params;
  const { league, timeframe } = req.query;

  const db = req.app.locals.db;
  const playerStats = await db.collection('player_stats')
    .find({
      playerId,
      league: league.toUpperCase()
    })
    .sort({ date: -1 })
    .limit(parseInt(timeframe) || 10)
    .toArray();

  const analysis = await StatsCalculator.analyzePlayerPerformance(playerStats);
  const predictions = await predictiveModel.predict({
    league,
    predictionType: 'PLAYER_PERFORMANCE',
    inputData: { playerStats }
  });

  res.json({
    success: true,
    data: {
      stats: analysis,
      predictions,
      trends: await StatsCalculator.analyzePlayerTrends(playerStats)
    },
    metadata: {
      gamesAnalyzed: playerStats.length,
      timestamp: new Date().toISOString()
    }
  });
}));

// Error handler
router.use((err, req, res, next) => {
  console.error('Stats route error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;