/**
 * Sports Analytics API Service
 * Enterprise-level API for the sports analytics dashboard
 * Version: 1.0.0
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import winston from 'winston';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// API Keys and Secrets
const SPORTS_DB_API_KEY = process.env.SPORTS_DB_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize Redis client for caching
const redisClient = createClient({
  url: REDIS_URL
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.connect().catch(console.error);

// Rate limiting configuration
const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://www.thesportsdb.com']
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(rateLimit(RATE_LIMIT));
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Request validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const predictionSchema = z.object({
  factor: z.string().min(1),
  confidence: z.number().min(0).max(1).optional()
});

// Authentication middleware
const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Helper function to fetch data from SportDB with improved error handling and caching
const fetchFromSportsDB = async (endpoint: string, params: Record<string, any> = {}, cacheKey?: string): Promise<any> => {
  if (!SPORTS_DB_API_KEY) {
    throw new Error('SportsDB API key not configured');
  }

  // Try to get from cache first
  if (cacheKey) {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
  }
  
  try {
    const url = `${SPORTS_DB_BASE_URL}/${SPORTS_DB_API_KEY}/${endpoint}`;
    const response = await axios.get(url, { 
      params,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SportsAnalytics-Pro/1.0.0'
      }
    });
    
    if (!response.data) {
      throw new Error('No data received from SportsDB');
    }

    // Cache the response if cacheKey is provided
    if (cacheKey) {
      await redisClient.setEx(cacheKey, 3600, JSON.stringify(response.data)); // Cache for 1 hour
    }
    
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      logger.error('SportsDB API error', {
        status: axiosError.response.status,
        message: axiosError.response.data?.message,
        endpoint,
        params
      });
      throw new Error(`SportsDB API error: ${axiosError.response.status} - ${axiosError.response.data?.message || 'Unknown error'}`);
    } else if (axiosError.request) {
      logger.error('No response from SportsDB API', { endpoint, params });
      throw new Error('No response received from SportsDB API');
    } else {
      logger.error('Error fetching from SportsDB', { error: axiosError.message, endpoint, params });
      throw new Error(`Error fetching data from SportDB: ${axiosError.message}`);
    }
  }
};

// Error handling middleware
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Login route with proper validation and security
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    // In production, this would validate against a database
    const user = {
      id: 1,
      username: 'demo_user',
      email: 'demo@sportsanalytics.com',
      role: 'premium'
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({
      success: true,
      token,
      user
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else {
      logger.error('Login error', { error });
      res.status(500).json({ error: 'Login failed' });
    }
  }
});

// Protected routes
app.use('/api', authenticateToken);

// API routes for leagues with caching
app.get('/api/leagues', async (req, res) => {
  try {
    const data = await fetchFromSportsDB('all_leagues.php', {}, 'leagues:all');
    const leagues = data.leagues || [];
    
    const transformedLeagues = leagues.map((league: any) => ({
      id: league.idLeague,
      name: league.strLeague,
      sport: league.strSport,
      country: league.strCountry,
      logo: league.strLogo || `assets/league-logos/${league.strLeague.toLowerCase()}.png`
    }));
    
    res.json({ success: true, data: transformedLeagues });
  } catch (err) {
    logger.error('Error fetching leagues', { error: err });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch leagues',
      details: err.message 
    });
  }
});

// API routes for teams by league
app.get('/api/teams/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const data = await fetchFromSportsDB('lookup_all_teams.php', { id: leagueId });
    const teams = data.teams || [];
    res.json(teams);
  } catch (error) {
    console.error(`Failed to fetch teams for league ${req.params.leagueId}:`, error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// API routes for players by team
app.get('/api/players/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const data = await fetchFromSportsDB('lookup_all_players.php', { id: teamId });
    const players = data.player || [];
    res.json(players);
  } catch (error) {
    console.error(`Failed to fetch players for team ${req.params.teamId}:`, error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// API routes for recent games
app.get('/api/games/recent', async (req, res) => {
  try {
    const { leagueId } = req.query;
    if (!leagueId) {
      return res.status(400).json({ error: 'League ID is required' });
    }
    
    const data = await fetchFromSportsDB('eventspastleague.php', { id: leagueId });
    const recentGames = data.events || [];
    res.json(recentGames);
  } catch (error) {
    console.error('Failed to fetch recent games:', error);
    res.status(500).json({ error: 'Failed to fetch recent games' });
  }
});

// API routes for upcoming games
app.get('/api/games/upcoming', async (req, res) => {
  try {
    const { leagueId } = req.query;
    if (!leagueId) {
      return res.status(400).json({ error: 'League ID is required' });
    }
    
    const data = await fetchFromSportsDB('eventsnextleague.php', { id: leagueId });
    const upcomingGames = data.events || [];
    res.json(upcomingGames);
  } catch (error) {
    console.error('Failed to fetch upcoming games:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming games' });
  }
});

// API route for custom single factor prediction
app.post('/api/predictions/single-factor', async (req, res) => {
  try {
    const { factor, confidence } = req.body;
    
    if (!factor) {
      return res.status(400).json({ error: 'Factor is required' });
    }
    
    // Process the prediction based on the provided factor
    // This would normally call your ML model
    const prediction = {
      factor,
      probability: Math.random() * 0.5 + 0.5, // Simulated probability between 0.5 and 1.0
      confidence: confidence || 0.8,
      timestamp: new Date().toISOString(),
      explanation: `Prediction based on factor: ${JSON.stringify(factor)}`,
    };
    
    res.json(prediction);
  } catch (error) {
    console.error('Failed to generate single factor prediction:', error);
    res.status(500).json({ error: 'Failed to generate prediction' });
  }
});

// API route for custom multi-factor prediction
app.post('/api/predictions/multi-factor', async (req, res) => {
  try {
    const { factors, weights } = req.body;
    
    if (!factors || !Array.isArray(factors) || factors.length < 2) {
      return res.status(400).json({ error: 'At least two factors are required' });
    }
    
    // Process the multi-factor prediction
    // This would normally call your ML model with multiple factors
    const prediction = {
      factors,
      weights: weights || factors.map(() => 1 / factors.length),
      compositeProbability: Math.random() * 0.5 + 0.3, // Simulated probability between 0.3 and 0.8
      confidence: Math.random() * 0.3 + 0.6, // Simulated confidence between 0.6 and 0.9
      timestamp: new Date().toISOString(),
      explanation: `Multi-factor prediction based on ${factors.length} factors`,
      breakdown: factors.map(factor => ({
        factor,
        contribution: Math.random() * 0.5 // Simulated contribution to the prediction
      }))
    };
    
    res.json(prediction);
  } catch (error) {
    console.error('Failed to generate multi-factor prediction:', error);
    res.status(500).json({ error: 'Failed to generate prediction' });
  }
});

// API route for user subscription
app.get('/api/user/subscription', (req, res) => {
  // In production, this would get the subscription info from a database
  const subscriptionInfo = {
    tier: 'ultra_premium', // 'free', 'premium', 'pro', or 'ultra_premium'
    expiresAt: '2023-12-31',
    features: {
      advancedStats: true,
      aiPredictions: true,
      liveUpdates: true,
      videoAnalysis: true,
      dataExport: true,
      customPredictions: true,
      multiFactorAnalysis: true
    }
  };
  
  res.json(subscriptionInfo);
});

// Catch-all route to return to dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Apply error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Closing HTTP server...');
  app.close(() => {
    logger.info('HTTP server closed');
    redisClient.quit().then(() => {
      logger.info('Redis connection closed');
      process.exit(0);
    });
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Dashboard available at http://localhost:${PORT}`);
});

export default app;