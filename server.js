/**
 * Sports Analytics Platform - Main Server
 * 
 * This is the main server file that serves both the API and web interface.
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cluster = require('cluster');
const os = require('os');
const http = require('http');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// Import routes
const apiRouter = require('./routes/api');

// Import utilities
const { getLiveGamesManager } = require('./utils/live-games-manager');

// Performance optimization settings
const ENABLE_CLUSTERING = process.env.ENABLE_CLUSTERING === 'true';
const NUM_WORKERS = process.env.NUM_WORKERS || Math.max(1, Math.min(os.cpus().length - 1, 4));
const ENABLE_MEMORY_MONITORING = process.env.ENABLE_MEMORY_MONITORING !== 'false';
const GC_INTERVAL = process.env.GC_INTERVAL || 300000; // 5 minutes

// Initialize clustering if enabled
if (ENABLE_CLUSTERING && cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  console.log(`Starting ${NUM_WORKERS} workers...`);
  
  // Fork workers
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }
  
  // Handle worker events
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Initialize Express app
  const app = express();
  const PORT = process.env.PORT || 8000;

  // Initialize memory monitor if enabled
  if (ENABLE_MEMORY_MONITORING) {
    try {
      const { MemoryMonitor } = require('./utils/memory_monitor');
      const memoryMonitor = new MemoryMonitor({ 
        gcInterval: GC_INTERVAL,
        threshold: 0.7,
        logLevel: 'warn'
      });
      memoryMonitor.start();
    } catch (error) {
      console.warn(`Memory monitoring not available: ${error.message}`);
    }
  }

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for development, enable in production
  }));

  // Enable CORS
  app.use(cors());

  // Request logging - use 'combined' in production, 'dev' in development
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Compression middleware - optimize for speed
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  // Body parsing middleware with limits
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

  // Cache control for static assets
  const setCache = (req, res, next) => {
    // Static assets cache: 1 day
    const period = 60 * 60 * 24;
    
    if (req.method === 'GET') {
      res.set('Cache-Control', `public, max-age=${period}`);
    } else {
      // No caching for non-GET requests
      res.set('Cache-Control', 'no-store');
    }
    next();
  };

  // Serve static files with caching
  app.use('/static', setCache, express.static(path.join(__dirname, 'public'), {
    maxAge: '1d'
  }));

  // Serve other static files
  app.use(express.static(path.join(__dirname, 'public')));

  // API response timeout
  app.use((req, res, next) => {
    res.setTimeout(30000, () => {
      res.status(408).json({ error: 'Request timeout' });
    });
    next();
  });

  // API routes
  app.use('/api', apiRouter);

  // Serve main HTML page
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Dashboard route
  app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  });

  // Player stats route
  app.get('/player/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
  });

  // Team page route
  app.get('/team/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'team.html'));
  });

  // Matches route
  app.get('/matches', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'matches.html'));
  });

  // Predictions page
  app.get('/predictions', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'predictions.html'));
  });

  // Catch 404 and forward to error handler
  app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });

  // Create HTTP server
  const server = http.createServer(app);

  // Function to use an existing server handle (for cluster mode)
  function useHandle(handle) {
    if (!handle) {
      console.error('No server handle provided');
      return;
    }
    
    server.listen({ fd: handle._handle.fd }, () => {
      console.log(`🚀 Worker using shared handle on port ${PORT}`);
      console.log(`📊 API available at http://localhost:${PORT}/api`);
      console.log(`🌐 Web interface available at http://localhost:${PORT}`);
      console.log(`🧠 Memory optimization: ${ENABLE_MEMORY_MONITORING ? 'enabled' : 'disabled'}`);
      
      // Only log worker ID when in cluster mode
      if (process.env.CLUSTER_WORKER_ID) {
        console.log(`🔢 Worker: #${process.env.CLUSTER_WORKER_ID}`);
      }
    });
  }

  // MongoDB connection with enhanced error handling and retry mechanism
  let dbConnectionAttempts = 0;
  const MAX_DB_CONNECTION_ATTEMPTS = 5;
  const DB_CONNECTION_RETRY_DELAY = 5000;

  async function connectToDatabase() {
    // Hardcoded Atlas URI to guarantee we connect to the correct database
    // This ensures we never fall back to localhost connections
    const MONGO_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true';
    const DB_NAME = 'sports-analytics';
    
    // CRITICAL: Force log of actual connection string to verify we're using Atlas
    console.log(`ACTUAL MongoDB connection string being used: ${MONGO_URI.substring(0, 40)}...`);
    
    dbConnectionAttempts++;
    
    try {
      console.log(`Connecting to MongoDB Atlas (attempt ${dbConnectionAttempts}/${MAX_DB_CONNECTION_ATTEMPTS})...`);
      
      const client = await MongoClient.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true
        },
        maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '50'),
        minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '5'),
        connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT || '30000'),
        socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT || '45000')
      });
      
      const db = client.db(DB_NAME);
      console.log('Connected to MongoDB successfully');
      
      // Verify TheSportsDB API key is configured
      const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || process.env.SPORTS_DB_API_KEY || '447279';
      console.log(`Using TheSportsDB API Key: ${THESPORTSDB_API_KEY.substring(0, 3)}...`);
      
      // Reset connection attempts counter on success
      dbConnectionAttempts = 0;
      return db;
    } catch (error) {
      console.error(`MongoDB connection error: ${error.message}`);
      
      if (dbConnectionAttempts < MAX_DB_CONNECTION_ATTEMPTS) {
        console.log(`Retrying in ${DB_CONNECTION_RETRY_DELAY/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, DB_CONNECTION_RETRY_DELAY));
        return connectToDatabase();
      } else {
        console.error(`Failed to connect to MongoDB after ${MAX_DB_CONNECTION_ATTEMPTS} attempts`);
        throw new Error(`Database connection failed: ${error.message}`);
      }
    }
  }

  // Server startup sequence
  async function startServer() {
    try {
      // Connect to MongoDB first
      const db = await connectToDatabase();
      console.log('Database connection established');
      
      // Start Live Games Manager
      const liveGamesManager = getLiveGamesManager();
      liveGamesManager.start();
      console.log('Live Games Manager started');
      
      // Make live games manager available throughout the app
      app.locals.liveGamesManager = liveGamesManager;
      
      // Listen for live games updates
      liveGamesManager.on('allLeaguesUpdated', (games) => {
        const totalGames = Object.values(games).reduce((sum, leagueGames) => sum + leagueGames.length, 0);
        console.log(`Live games updated: ${totalGames} games across ${Object.keys(games).length} leagues`);
      });
      
      // Initialize revolutionary analytics engines
      const { getPredictionEngine } = require('./utils/prediction-engine');
      const { getPlayerImpactEngine } = require('./utils/player-impact');
      const { getNarrativeEngine } = require('./utils/narrative-analytics');
      
      // Start prediction engine
      const predictionEngine = getPredictionEngine();
      predictionEngine.on('predictions-updated', (predictions) => {
        console.log(`[REVOLUTIONARY] Updated predictions for ${Object.keys(predictions).length} leagues`);
      });
      
      // Start player impact engine
      const playerImpactEngine = getPlayerImpactEngine();
      playerImpactEngine.on('impacts-updated', (impacts) => {
        console.log(`[REVOLUTIONARY] Updated impact metrics for ${impacts.length} players`);
      });
      
      // Start narrative engine
      const narrativeEngine = getNarrativeEngine();
      narrativeEngine.on('narratives-updated', (narratives) => {
        console.log(`[REVOLUTIONARY] Generated ${narratives.length} match narratives`);
      });
      
      // Initialize CUSTOM prediction engine - THE BREAD AND BUTTER FEATURE
      const { getCustomPredictionEngine } = require('./utils/custom-prediction');
      
      // Start custom prediction engine
      const customPredictionEngine = getCustomPredictionEngine();
      customPredictionEngine.on('started', () => {
        console.log(`[REVOLUTIONARY] Custom prediction engine ready - ANY factor for ANY sport/league/team`);
      });
      
      // Add to the initialization sequence
      app.on('ready', async () => {
        console.log('Starting revolutionary analytics engines...');
        
        try {
          await predictionEngine.start();
          await playerImpactEngine.start();
          await narrativeEngine.start();
          await customPredictionEngine.start(); // Start the custom prediction engine
          
          console.log('All revolutionary analytics engines started successfully!');
          console.log('CUSTOM PREDICTION ENGINE READY - Your bread and butter feature is operational!');
        } catch (error) {
          console.error('Error starting revolutionary analytics engines:', error);
        }
      });
      
      // Start the server after successful database connection
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 API available at http://localhost:${PORT}/api`);
        console.log(`🌐 Web interface available at http://localhost:${PORT}`);
        console.log(`🏆 Live games API at http://localhost:${PORT}/api/live-games`);
      });
      
      return { app, db, liveGamesManager };
    } catch (error) {
      console.error('Failed to start server:', error.message);
      process.exit(1);
    }
  }

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
    // Don't exit the process, but log the error
  });

  // Start server if not in test mode
  if (process.env.NODE_ENV !== 'test') {
    startServer().catch(error => {
      console.error('Server startup failed:', error);
      process.exit(1);
    });
  }

  // Set timeouts
  server.timeout = 30000; // 30 seconds
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  // Export server and helper function
  module.exports = {
    app,
    server,
    useHandle
  };
}