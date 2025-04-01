// scripts/predictive_model.js

// Load environment variables
require('dotenv').config();

// Import required modules
const EventEmitter = require('events');
const path = require('path');
const winston = require('winston');
const { format } = winston;
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const WebSocket = require('ws');
const AsyncLock = require('async-lock');
const CircuitBreaker = require('opossum');
const cluster = require('cluster');
const os = require('os');
const MetricsManager = require('../utils/metricsManager');
const rateLimiter = require('../utils/rateLimiter');
const { CacheManager } = require('../utils/cache');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
// Import node-fetch with proper compatibility
const nodeFetch = require('node-fetch');
const { RateLimiter } = require('limiter');
const fetch = (...args) => {
  return nodeFetch.default ? nodeFetch.default(...args) : nodeFetch(...args);
};

// Configure logging with .env settings and encryption
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.metadata()
  ),
  defaultMeta: { service: 'predictive-model' },
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 20000000, // 20MB
      maxFiles: 10,
      tailable: true,
      transform: (info) => {
        info.message = crypto.createHash('sha256').update(info.message).digest('hex');
        return info;
      }
    }),
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 20000000,
      maxFiles: 10,
      tailable: true
    }),
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

/**
 * Predictive model class for sports analytics
 * Version: 3.1.0
 * @class TheAnalyzerPredictiveModel
 */
class TheAnalyzerPredictiveModel extends EventEmitter {
  constructor() {
    super();

    // Comment out OpenTelemetry setup
    /*this.tracerProvider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'sports-analytics-predictor',
      }),
    });*/

    this.config = {
      mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics?replicaSet=rs0',
      dbName: process.env.MONGODB_DB_NAME || 'sports-analytics',
      pythonScript: process.env.PYTHON_SCRIPT || 'predictive_model.py',
      port: parseInt(process.env.PORT, 10) || 5050,
      modelUpdateInterval: parseInt(process.env.MODEL_UPDATE_INTERVAL, 10) || 1209600000,
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
        retryStrategy: (times) => {
          const maxDelay = parseInt(process.env.REDIS_RETRY_STRATEGY_MAX_DELAY, 10) || 5000;
          const delay = Math.min(times * 100, maxDelay);
          logger.info(`Redis connection retry attempt ${times} after ${delay}ms`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          return delay;
        },
        connectionName: 'predictive-model',
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
        showFriendlyErrorStack: true,
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 5
      },
      cache: {
        ttl: parseInt(process.env.CACHE_TTL, 10) || 3600, // 1 hour
        max: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 1000,
        checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 300
      },
      circuitBreaker: {
        timeout: parseInt(process.env.PREDICTION_TIMEOUT, 10) || 60000,
        errorThresholdPercentage: 40,
        resetTimeout: 60000,
        rollingCountTimeout: 30000
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
      },
      streaming: {
        batchSize: 100,
        interval: 5000,
        maxQueueSize: 1000
      },
      monitoring: {
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 60000, // 1 minute
        metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 60000
      },
      alertThresholds: {
        memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.85,
        cpuLoad: parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.85,
        networkTraffic: parseInt(process.env.NETWORK_TRAFFIC_THRESHOLD, 10) || 104857600 // 100MB
      }
    };

    this.SUPPORTED_LEAGUES = [
      'NFL', 'NBA', 'MLB', 'NHL',
      'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
    ];

    this.LEAGUE_IDS = {
      'NFL': '4391',
      'NBA': '4387',
      'MLB': '4424',
      'NHL': '4380',
      'PREMIER_LEAGUE': '4328',
      'LA_LIGA': '4335',
      'BUNDESLIGA': '4331',
      'SERIE_A': '4332'
    };

    this.SPORT_MAPPING = {
      'NFL': 'Football',
      'NBA': 'Basketball',
      'MLB': 'Baseball',
      'NHL': 'Hockey',
      'PREMIER_LEAGUE': 'Soccer',
      'LA_LIGA': 'Soccer',
      'BUNDESLIGA': 'Soccer',
      'SERIE_A': 'Soccer'
    };

    this.PREDICTION_TYPES = {
      SINGLE_FACTOR: 'single_factor',
      MULTI_FACTOR: 'multi_factor',
      PLAYER_STATS: 'player_stats',
      TEAM_PERFORMANCE: 'team_performance',
      GAME_OUTCOME: 'game_outcome',
      REAL_TIME: 'real_time',
      ADVANCED_ANALYTICS: 'advanced_analytics'
    };

    this.modelCache = new Map();
    this.lastTrainingTime = new Map();
    this.predictionHistory = new Map();
    this.modelMetrics = new Map();
    this.streamingQueue = [];
    this.isShuttingDown = false;
    this.xgbModels = new Map();
    this.lgbModels = new Map();

    // Initialize OpenTelemetry
    /*const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'predictive-model',
        [SemanticResourceAttributes.SERVICE_VERSION]: '3.1.0'
      })
    });
    const exporter = new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces' });
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
    registerInstrumentations({
      instrumentations: [
        new MongoDBInstrumentation(),
        new ExpressInstrumentation(),
        new HttpInstrumentation()
      ]
    });
    this.tracer = provider.getTracer('predictive-model');*/

    // Initialize MetricsManager
    try {
      this.metrics = MetricsManager.getInstance({
        logLevel: this.config.logLevel,
        alertThresholds: this.config.alertThresholds
      });
    } catch (error) {
      logger.warn('Failed to initialize MetricsManager, using fallback metrics:', {
        error: error.message,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      this.metrics = {
        recordHttpRequest: () => {},
        recordEventLoopLag: () => {},
        recordMemoryUsage: () => {},
        recordAuthSuccess: () => {},
        recordAuthFailure: () => {},
        recordHealthStatus: () => {},
        recordStatCalculation: () => {},
        predictionDuration: { observe: () => {} },
        predictionErrors: { inc: () => {} },
        modelAccuracy: { set: () => {} },
        activeConnections: { inc: () => {}, dec: () => {}, set: () => {} },
        memoryUsage: { set: () => {} }
      };
    }

    this.rateLimiter = rateLimiter;
    this._initializeComponents().catch(error => {
      logger.error('Critical: Failed to initialize components:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason.message,
        stack: reason.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'unhandled_rejection' });
      }
    });
  }

  async _initializeComponents() {
    const span = this.tracer.startSpan('initialize_components');
    try {
      // Redis initialization with proper enterprise-level error handling
      if (process.env.USE_REDIS === 'true') {
        try {
          logger.info('Initializing Redis connection...', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          
          // Handle Redis initialization with proper error handling
          if (!global.redisClient) {
            // Use Cluster mode if enabled, otherwise regular Redis client
            if (process.env.USE_REDIS_CLUSTER === 'true') {
              global.redisClient = new Redis.Cluster([
                { host: this.config.redis.host, port: this.config.redis.port }
              ], {
                password: this.config.redis.password,
                enableOfflineQueue: this.config.redis.enableOfflineQueue,
                retryStrategy: this.config.redis.retryStrategy,
                connectionName: this.config.redis.connectionName,
                connectTimeout: this.config.redis.connectTimeout,
                maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest
              });
            } else {
              global.redisClient = new Redis({
                host: this.config.redis.host,
                port: this.config.redis.port,
                password: this.config.redis.password,
                enableOfflineQueue: this.config.redis.enableOfflineQueue,
                retryStrategy: this.config.redis.retryStrategy,
                connectionName: this.config.redis.connectionName,
                connectTimeout: this.config.redis.connectTimeout,
                maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest
              });
            }

            // Set up Redis event handlers
            global.redisClient.on('connect', () => {
              logger.info('Redis connection established', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
            });

            global.redisClient.on('error', (error) => {
              logger.error('Redis connection error:', {
                metadata: {
                  error: error.message,
                  service: 'predictive-model',
                  timestamp: new Date().toISOString()
                }
              });
              
              // Don't fallback - maintain enterprise-level reliability
              // Instead log detailed error information for monitoring systems
              logger.warn('Redis error detected - application continuing with degraded Redis functionality', {
                metadata: { 
                  service: 'predictive-model', 
                  errorCode: error.code || 'UNKNOWN',
                  timestamp: new Date().toISOString() 
                }
              });
            });
          }
        } catch (error) {
          logger.error('Failed to initialize Redis:', {
            error: error.message,
            stack: error.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          
          // Don't fallback automatically - enterprise systems need explicit control
          logger.warn('Redis initialization failed - using in-memory cache as temporary fallback. ALERT: REDUCED RELIABILITY', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          
          // For backward compatibility, maintain in-memory cache when Redis fails
          global.redisClient = null;
          process.env.USE_IN_MEMORY_CACHE = 'true';
        }
      } else {
        // Redis explicitly disabled, log for awareness
        logger.info('Redis explicitly disabled by configuration, using in-memory cache', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        global.redisClient = null;
        process.env.USE_IN_MEMORY_CACHE = 'true';
      }
      
      // Store Redis client reference
      this.redis = global.redisClient;

      // MongoDB with high availability
      this.client = new MongoClient(this.config.mongoUri, {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 100,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 20,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
        serverSelectionTimeoutMS: 10000,
        heartbeatFrequencyMS: 15000,
        maxIdleTimeMS: 30000,
        retryWrites: true,
        retryReads: true,
        serverApi: { version: '1', strict: true, deprecationErrors: true }
      });

      await this.client.connect();
      this.db = this.client.db(this.config.dbName);
      await this.db.command({ ping: 1 });
      logger.info('MongoDB connection established', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      this.client.on('serverHeartbeatFailed', (event) => {
        logger.warn('MongoDB heartbeat failed:', {
          metadata: { ...event, service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        if (this.metrics && this.metrics.predictionErrors) {
          this.metrics.predictionErrors.inc({ type: 'database_heartbeat' });
        }
      });

      this.cache = new CacheManager({
        stdTTL: this.config.cache.ttl,
        checkperiod: this.config.cache.checkPeriod,
        maxKeys: this.config.cache.max
      });
      await this.cache.initialize(this.redis);
      logger.info('Cache initialized', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      this.lock = new AsyncLock({
        timeout: 10000,
        maxPending: 5000
      });

      this._executePython = async (data) => {
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid input: data must be a non-null object');
        }
        if (!data.timestamp) {
          data.timestamp = new Date().toISOString();
        }
        data.request_id = uuidv4();  // Add request tracing
        const result = await this._executePythonTask(data);
        return result;
      };

      this.breaker = new CircuitBreaker(async (data) => await this._executePython(data), {
        timeout: this.config.circuitBreaker.timeout,
        errorThresholdPercentage: this.config.circuitBreaker.errorThresholdPercentage,
        resetTimeout: this.config.circuitBreaker.resetTimeout,
        rollingCountTimeout: this.config.circuitBreaker.rollingCountTimeout,
        errorFilter: (error) => {
          if (error.message && error.message.includes('Invalid input')) {
            logger.warn('Validation error filtered from circuit breaker:', {
              error: error.message,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            return true;
          }
          if (data && data.type === 'health_check') {
            logger.warn('Health check error filtered from circuit breaker:', {
              error: error.message,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            return true;
          }
          return error.type === 'ValidationError';
        }
      });

      // Secure HTTP server with Express
      let server = global.httpServer;
      if (!server || typeof server.on !== 'function') {
        const app = express();
        app.use(helmet());  // Security headers
        app.use(cors());  // CORS support
        app.use((req, res, next) => {
          if (!this._validateAuth(req.headers.authorization)) {
            return res.status(401).json({ error: 'Unauthorized' });
          }
          next();
        });
        server = http.createServer(app);
        global.httpServer = server;
        const wsPort = parseInt(process.env.WS_PORT, 10) || (this.config.port + 100);
        server.listen(wsPort, () => {
          logger.info(`Created new HTTP server for WebSocket on port ${wsPort}`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        });
      }
      this.httpServer = server;

      this.websocketManager = new WebSocket.Server({
        server: server,
        path: process.env.WS_PATH || '/ws',
        maxPayload: parseInt(process.env.WS_MAX_PAYLOAD, 10) || 104857600, // 100MB
        clientTracking: true,
        perMessageDeflate: {
          zlibDeflateOptions: {
            chunkSize: 2048,
            memLevel: 9,
            level: parseInt(process.env.COMPRESSION_LEVEL, 10) || 9
          },
          zlibInflateOptions: {
            chunkSize: 20 * 1024
          },
          threshold: parseInt(process.env.COMPRESSION_THRESHOLD, 10) || 1024
        }
      });

      this.websocketManager.on('connection', this._handleWebSocketConnection.bind(this));
      this.websocketManager.on('error', this._handleWebSocketError.bind(this));
      logger.info('WebSocket server initialized', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      this._initializeStreaming();
      this._initializeMonitoring();
      this._setupEventHandlers();

      // Fetch initial data for all supported leagues
      await this._fetchInitialData();

      logger.info('All components initialized successfully', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Failed to initialize components:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      span.setStatus({ code: 2, message: error.message });
      span.end();
      throw error;
    } finally {
      span.end();
    }
  }

  // Fetch data from TheSportsDB API (v1 or v2)
  async fetchSportsDBData(endpoint, useV2 = true, params = {}) {
    const span = this.tracer.startSpan('fetch_sportsdb_data');
    try {
      const apiKey = process.env.THESPORTSDB_API_KEY || '447279'; // Added default from screenshot
      if (!apiKey) {
        throw new Error('TheSportsDB API key not found in environment variables');
      }

      let url;
      if (useV2) {
        url = `https://www.thesportsdb.com/api/v2/json/${apiKey}/${endpoint}`;
        const response = await fetch(url, {
          headers: { 'X-API-KEY': apiKey },
          method: 'GET'
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
      } else {
        const queryString = new URLSearchParams(params).toString();
        url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/${endpoint}${queryString ? '?' + queryString : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
      }
    } catch (error) {
      logger.error(`Error fetching data from TheSportsDB (${endpoint}):`, {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'api_fetch' });
      }
      throw error;
    } finally {
      span.end();
    }
  }

  // Fetch historical events for a league
  async fetchHistoricalEvents(league, season = '2023-2024') {
    const span = this.tracer.startSpan('fetch_historical_events');
    try {
      const leagueId = this.LEAGUE_IDS[league];
      if (!leagueId) throw new Error(`Unsupported league: ${league}`);

      // Check if we already have recent data for this league and season
      const collectionName = `${league.toLowerCase()}_games`;
      const existingCount = await this.db.collection(collectionName)
        .countDocuments({ strSeason: season });
      
      if (existingCount > 0) {
        logger.info(`Using existing ${existingCount} events for ${league} (${season})`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return;
      }

      // Implement rate limiting
      await this.rateLimiter.removeTokens(1);
      
      const endpoint = 'eventsseason.php';
      const params = { id: leagueId, s: season };
      const data = await this.fetchSportsDBData(endpoint, false, params);
      const events = data.events || [];
      
      if (events.length === 0) {
        logger.warn(`No events found for ${league} (${season})`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return [];
      }

      // Process events in smaller batches to manage memory
      const batchSize = 100;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        await this.db.collection(collectionName).insertMany(batch, { 
          ordered: false,
          // Add TTL index to automatically remove old data
          expireAfterSeconds: 7 * 24 * 60 * 60 // 1 week
        });
        
        // Force garbage collection after each batch if memory usage is high
        const memUsage = process.memoryUsage();
        if (memUsage.heapUsed / memUsage.heapTotal > 0.85 && global.gc) {
          global.gc();
        }
      }

      logger.info(`Stored ${events.length} events in MongoDB for ${league}`, {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      return events;
    } catch (error) {
      if (error.message.includes('429')) {
        logger.warn(`Rate limit hit for ${league}, will retry later`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        // Add to retry queue
        this.retryQueue.push({
          type: 'historical',
          league,
          season,
          timestamp: new Date().toISOString()
        });
        return [];
      }
      
      logger.error(`Error fetching historical events for ${league}:`, {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      throw error;
    } finally {
      span.end();
    }
  }

  // Fetch live scores for a sport
  async fetchLiveScores(sport) {
    const span = this.tracer.startSpan('fetch_live_scores');
    try {
      const endpoint = `livescore/${sport}`;
      const data = await this.fetchSportsDBData(endpoint, true);
      const events = data.events || [];
      logger.info(`Fetched ${events.length} live ${sport} events`, {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      if (events.length > 0) {
        await this.db.collection('live_scores').insertMany(events, { ordered: false });
        logger.info(`Stored ${events.length} live ${sport} events in MongoDB`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });

        // Map events to their respective leagues and add to streaming queue
        for (const event of events) {
          const league = Object.keys(this.SPORT_MAPPING).find(
            (lg) => this.SPORT_MAPPING[lg] === sport && event.idLeague === this.LEAGUE_IDS[lg]
          );
          if (league) {
            this.streamingQueue.push({
              league,
              data: event,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      return events;
    } catch (error) {
      logger.error(`Error fetching live scores for ${sport}:`, {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'api_fetch' });
      }
      throw error;
    } finally {
      span.end();
    }
  }

  // Fetch initial data for all leagues during initialization
  async _fetchInitialData() {
    const span = this.tracer.startSpan('fetch_initial_data');
    try {
      // Initialize rate limiter (100 requests per 15 minutes = ~6.67 requests per minute)
      this.rateLimiter = new RateLimiter(6, 'minute');
      this.retryQueue = [];
      
      // Fetch historical data for leagues one at a time to manage memory
      for (const league of this.SUPPORTED_LEAGUES) {
        await this.fetchHistoricalEvents(league, '2023-2024');
        // Small delay between leagues to help with rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Process retry queue if any requests failed
      if (this.retryQueue.length > 0) {
        logger.info(`Processing ${this.retryQueue.length} retry requests`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        
        // Wait a bit before retrying to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        for (const retry of this.retryQueue) {
          if (retry.type === 'historical') {
            await this.fetchHistoricalEvents(retry.league, retry.season);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Fetch live scores for unique sports
      const sports = [...new Set(Object.values(this.SPORT_MAPPING))];
      for (const sport of sports) {
        await this.fetchLiveScores(sport);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('Initial data fetch completed for all leagues and sports', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Error fetching initial data:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } finally {
      span.end();
    }
  }

  _handleWebSocketConnection(ws) {
    const span = this.tracer.startSpan('websocket_connection');
    if (this.metrics && this.metrics.activeConnections) {
      this.metrics.activeConnections.inc();
    }
    ws.isAlive = true;
    ws.subscribedLeagues = [];

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message) => {
      const span = this.tracer.startSpan('websocket_message');
      try {
        const data = JSON.parse(message);
        await this._handleStreamingData(data, ws);
      } catch (error) {
        logger.error('WebSocket message handling error:', {
          error: error.message,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        ws.send(JSON.stringify({
          error: 'Invalid message format',
          timestamp: new Date().toISOString()
        }));
      } finally {
        span.end();
      }
    });

    ws.on('close', () => {
      if (this.metrics && this.metrics.activeConnections) {
        this.metrics.activeConnections.dec();
      }
    });

    ws.on('error', (error) => {
      logger.error('WebSocket client error:', {
        error: error.message,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'websocket_client' });
      }
    });
    span.end();
  }

  _handleWebSocketError(error) {
    const span = this.tracer.startSpan('websocket_error');
    logger.error('WebSocket server error:', {
      error: error.message,
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
    if (this.metrics && this.metrics.predictionErrors) {
      this.metrics.predictionErrors.inc({ type: 'websocket_server' });
    }
    span.end();
  }

  async _handleStreamingData(data, ws) {
    const span = this.tracer.startSpan('handle_streaming_data');
    try {
      if (!this._validateStreamingData(data)) {
        throw new Error('Invalid streaming data format');
      }
      if (this.streamingQueue.length >= this.config.streaming.maxQueueSize) {
        this.streamingQueue.shift();
      }
      this.streamingQueue.push({
        ...data,
        timestamp: new Date().toISOString()
      });
      if (this.streamingQueue.length >= this.config.streaming.batchSize) {
        await this._processStreamingBatch();
      }
      ws.send(JSON.stringify({
        status: 'received',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      logger.error('Streaming data handling error:', {
        error: error.message,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      ws.send(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    } finally {
      span.end();
    }
  }

  _initializeStreaming() {
    const span = this.tracer.startSpan('initialize_streaming');
    try {
      this.streamProcessor = setInterval(() => {
        if (this.streamingQueue.length > 0 && !this.isShuttingDown) {
          this._processStreamingBatch().catch(error => {
            logger.error('Streaming batch processing error:', {
              error: error.message,
              stack: error.stack,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          });
        }
      }, this.config.streaming.interval);

      // Add periodic live score fetching
      this.liveScoreProcessor = setInterval(async () => {
        try {
          const sports = [...new Set(Object.values(this.SPORT_MAPPING))];
          for (const sport of sports) {
            await this.fetchLiveScores(sport);
          }
        } catch (error) {
          logger.error('Periodic live score fetch error:', {
            error: error.message,
            stack: error.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      }, 120000); // Fetch every 2 minutes (matches 2-min delay of live scores)

      this.intervals = this.intervals || [];
      this.intervals.push(this.streamProcessor, this.liveScoreProcessor);
      logger.info('Streaming initialization completed', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Failed to initialize streaming:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      span.setStatus({ code: 2, message: error.message });
      span.end();
      throw error;
    } finally {
      span.end();
    }
  }

  _initializeMonitoring() {
    const span = this.tracer.startSpan('initialize_monitoring');
    setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (health.status !== 'healthy') {
          logger.warn('Health check failed:', {
            health,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          this.emit('health:degraded', health);
        }
      } catch (error) {
        logger.error('Health check error:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }
    }, this.config.monitoring.healthCheckInterval);

    setInterval(() => {
      try {
        this._collectMetrics();
      } catch (error) {
        logger.error('Metrics collection error:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }
    }, this.config.monitoring.metricsInterval);

    this.memoryMonitorInterval = setInterval(() => {
      try {
        const usage = process.memoryUsage();
        if (this.metrics) {
          if (this.metrics.memoryUsage && typeof this.metrics.memoryUsage.set === 'function') {
            this.metrics.memoryUsage.set(usage.heapUsed);
          }
          if (typeof this.metrics.recordMemoryUsage === 'function') {
            this.metrics.recordMemoryUsage();
          }
        }
        const memoryThreshold = this.config.alertThresholds.memoryUsage;
        const currentUsage = usage.heapUsed / usage.heapTotal;
        if (currentUsage > memoryThreshold) {
          logger.warn('High memory usage detected:', {
            usage: {
              heapUsed: Math.round(usage.heapUsed / (1024 * 1024)) + ' MB',
              heapTotal: Math.round(usage.heapTotal / (1024 * 1024)) + ' MB',
              percentage: Math.round(currentUsage * 100) + '%'
            },
            threshold: Math.round(memoryThreshold * 100) + '%',
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          this._optimizeMemory(currentUsage);
        }
      } catch (error) {
        logger.error('Memory monitoring error:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }
    }, 60000); // 1 minute
    this.intervals = this.intervals || [];
    this.intervals.push(this.memoryMonitorInterval);
    span.end();
  }

  _collectMetrics() {
    const span = this.tracer.startSpan('collect_metrics');
    try {
      for (const league of this.SUPPORTED_LEAGUES) {
        const leagueMetrics = this.modelMetrics.get(league);
        if (leagueMetrics && this.metrics && this.metrics.modelAccuracy) {
          this.metrics.modelAccuracy.set({ league }, leagueMetrics.accuracy || 0);
        }
      }
      if (this.metrics && this.metrics.activeConnections && this.websocketManager) {
        this.metrics.activeConnections.set(this.websocketManager.clients.size);
      }
      if (this.metrics && this.metrics.memoryUsage) {
        const memUsage = process.memoryUsage();
        this.metrics.memoryUsage.set(memUsage.heapUsed);
      }
    } catch (error) {
      logger.error('Metrics collection error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } finally {
      span.end();
    }
  }

  async _processStreamingBatch() {
    const span = this.tracer.startSpan('process_streaming_batch');
    if (this.streamingQueue.length === 0 || this.isShuttingDown) return;
    try {
      const batch = this.streamingQueue.splice(0, this.config.streaming.batchSize);
      const leagueGroups = new Map();
      for (const item of batch) {
        if (!leagueGroups.has(item.league)) leagueGroups.set(item.league, []);
        leagueGroups.get(item.league).push(item);
      }
      const promises = [];
      for (const [league, data] of leagueGroups) {
        promises.push(this._processBatchForLeague(league, data));
      }
      await Promise.all(promises);
    } catch (error) {
      logger.error('Batch processing error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'batch_processing' });
      }
    } finally {
      span.end();
    }
  }

  async _processBatchForLeague(league, data) {
    const span = this.tracer.startSpan('process_batch_for_league');
    try {
      const result = await this.breaker.fire(async () => await this._executePython({
        type: 'batch_process',
        league,
        data
      }));
      this._broadcastResults(league, result);
      return result;
    } catch (error) {
      logger.error(`League batch processing error for ${league}:`, {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'league_batch_processing' });
      }
      throw error;
    } finally {
      span.end();
    }
  }

  _broadcastResults(league, result) {
    const span = this.tracer.startSpan('broadcast_results');
    try {
      if (!this.websocketManager) return;
      this.websocketManager.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.subscribedLeagues.includes(league)) {
          client.send(JSON.stringify({
            league,
            result,
            timestamp: new Date().toISOString()
          }));
        }
      });
      logger.info(`Broadcasted results for ${league} to subscribed clients`, {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Broadcast error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } finally {
      span.end();
    }
  }

  _validateStreamingData(data) {
    const span = this.tracer.startSpan('validate_streaming_data');
    try {
      if (!data || typeof data !== 'object') return false;
      if (!data.league || !this.SUPPORTED_LEAGUES.includes(data.league)) return false;
      if (!data.data || typeof data.data !== 'object') return false;
      return true;
    } catch (error) {
      logger.error('Streaming data validation error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      return false;
    } finally {
      span.end();
    }
  }

  _setupEventHandlers() {
    const span = this.tracer.startSpan('setup_event_handlers');
    try {
      this.breaker.on('success', () => {
        logger.info('Circuit breaker success', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      });

      this.breaker.on('failure', (error) => {
        logger.error('Circuit breaker failure:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        if (this.metrics && this.metrics.predictionErrors) {
          this.metrics.predictionErrors.inc({ type: 'circuit_breaker_failure' });
        }
      });

      this.breaker.on('open', () => {
        logger.warn('Circuit breaker opened', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      });

      this.breaker.on('halfOpen', () => {
        logger.info('Circuit breaker half-open', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      });

      this.breaker.on('close', () => {
        logger.info('Circuit breaker closed', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      });

      process.on('SIGINT', this.cleanup.bind(this));
      process.on('SIGTERM', this.cleanup.bind(this));
    } catch (error) {
      logger.error('Failed to setup event handlers:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      span.setStatus({ code: 2, message: error.message });
      span.end();
      throw error;
    } finally {
      span.end();
    }
  }

  _validateAuth(authHeader) {
    const span = this.tracer.startSpan('validate_auth');
    try {
      if (!authHeader) {
        logger.warn('No authorization header provided', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        this.metrics.recordAuthFailure();
        return false;
      }
      const token = authHeader.replace('Bearer ', '');
      const secretKey = process.env.AUTH_SECRET_KEY;
      if (!secretKey) {
        logger.warn('No AUTH_SECRET_KEY set, authentication disabled', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return true;
      }
      try {
        const decipher = crypto.createDecipher('aes-256-cbc', secretKey);
        let decrypted = decipher.update(token, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        this.metrics.recordAuthSuccess();
        return true;
      } catch (error) {
        logger.error('Authentication failed:', {
          error: error.message,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        this.metrics.recordAuthFailure();
        return false;
      }
    } catch (error) {
      logger.error('Authentication validation error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      return false;
    } finally {
      span.end();
    }
  }

  async predict(predictionRequest) {
    const span = this.tracer.startSpan('predict');
    try {
      if (!this._validatePredictionRequest(predictionRequest)) {
        throw new Error('Invalid prediction request');
      }
      const cacheKey = this._generateCacheKey(predictionRequest);
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        logger.debug(`Cache hit for prediction: ${cacheKey}`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return cachedResult;
      }
      const result = await this.breaker.fire(async () => await this._executePython(predictionRequest));
      await this.cache.set(cacheKey, result);
      if (this.metrics && this.metrics.predictionDuration) {
        this.metrics.predictionDuration.observe({ league: predictionRequest.league, type: predictionRequest.prediction_type }, 0.1);
      }
      return result;
    } catch (error) {
      logger.error('Prediction error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'prediction' });
      }
      throw error;
    } finally {
      span.end();
    }
  }

  _validatePredictionRequest(predictionRequest) {
    const span = this.tracer.startSpan('validate_prediction_request');
    try {
      if (!predictionRequest || typeof predictionRequest !== 'object') return false;
      if (!predictionRequest.league || !this.SUPPORTED_LEAGUES.includes(predictionRequest.league)) return false;
      if (!predictionRequest.prediction_type || !Object.values(this.PREDICTION_TYPES).includes(predictionRequest.prediction_type)) return false;
      if (!predictionRequest.input_data || typeof predictionRequest.input_data !== 'object') return false;
      if (predictionRequest.prediction_type === this.PREDICTION_TYPES.MULTI_FACTOR) {
        if (!Array.isArray(predictionRequest.factors) || predictionRequest.factors.length > 5) return false;
        if (!predictionRequest.factors.every(factor => factor.inputData && typeof factor.inputData === 'object')) return false;
      }
      return true;
    } catch (error) {
      logger.error('Prediction request validation error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      return false;
    } finally {
      span.end();
    }
  }

  _generateCacheKey(predictionRequest) {
    const dataString = JSON.stringify(predictionRequest.input_data, Object.keys(predictionRequest.input_data).sort());
    return `${predictionRequest.league}:${crypto.createHash('sha256').update(dataString).digest('hex')}`;
  }

  async _executePythonTask(data) {
    const span = this.tracer.startSpan('execute_python_task');
    try {
      const { spawn } = require('child_process');
      const pythonPath = process.env.PYTHON_PATH || 'python3';
      const scriptPath = path.resolve(__dirname, this.config.pythonScript);
      const dataString = JSON.stringify(data);
      return new Promise((resolve, reject) => {
        const process = spawn(pythonPath, [scriptPath, dataString], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });

        process.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        process.on('error', (error) => {
          logger.error('Python process error:', {
            error: error.message,
            stack: error.stack,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          reject(error);
        });

        process.on('close', (code) => {
          if (code !== 0) {
            logger.error('Python process exited with error:', {
              code,
              stderr,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            const error = new Error(`Python process exited with code ${code}: ${stderr}`);
            error.stderr = stderr;
            reject(error);
            return;
          }
          try {
            const result = JSON.parse(stdout);
            if (result.error) {
              logger.error('Python execution error:', {
                error: result.error,
                type: result.type,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
              const error = new Error(result.error);
              error.type = result.type;
              reject(error);
            } else {
              resolve(result);
            }
          } catch (error) {
            logger.error('Python output parsing error:', {
              error: error.message,
              stdout,
              stderr,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            reject(error);
          }
        });
      });
    } catch (error) {
      logger.error('Execute Python task error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async healthCheck() {
    const span = this.tracer.startSpan('health_check');
    try {
      const checks = {};

      // Database Health
      try {
        await this.db.command({ ping: 1 });
        checks.database = 'healthy';
      } catch (error) {
        logger.error('Database health check failed:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        checks.database = 'unhealthy';
      }

      // Redis Health
      try {
        await this.redis.ping();
        checks.redis = 'healthy';
      } catch (error) {
        logger.error('Redis health check failed:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        checks.redis = 'unhealthy';
      }

      // WebSocket Health
      checks.websocket = this.websocketManager && this.websocketManager.clients ? 'healthy' : 'unhealthy';

      // Python Backend Health
      try {
        const result = await this._executePython({ type: 'environment_check' });
        checks.python = result.status === 'ok' ? 'healthy' : 'unhealthy';
      } catch (error) {
        logger.error('Python backend health check failed:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        checks.python = 'unhealthy';
      }

      // TheSportsDB API Health
      try {
        await this.fetchSportsDBData('livescore/Soccer', true);
        checks.sportsDB = 'healthy';
      } catch (error) {
        logger.error('TheSportsDB API health check failed:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        checks.sportsDB = 'unhealthy';
      }

      const overallStatus = Object.values(checks).every(status => status === 'healthy') ? 'healthy' : 'degraded';
      if (this.metrics && this.metrics.recordHealthStatus) {
        this.metrics.recordHealthStatus(overallStatus);
      }

      return {
        status: overallStatus,
        components: checks,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Health check error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    } finally {
      span.end();
    }
  }

  _optimizeMemory(currentUsage) {
    const span = this.tracer.startSpan('optimize_memory');
    try {
      logger.info('Optimizing memory usage...', {
        currentUsage: Math.round(currentUsage * 100) + '%',
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      if (this.modelCache) {
        this.modelCache.clear();
        logger.info('Cleared model cache', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      if (this.streamingQueue.length > this.config.streaming.maxQueueSize / 2) {
        this.streamingQueue.splice(0, this.streamingQueue.length - this.config.streaming.maxQueueSize / 2);
        logger.info('Trimmed streaming queue', {
          newSize: this.streamingQueue.length,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      } else {
        logger.warn('Garbage collection not exposed, consider running with --expose-gc', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      setTimeout(() => {
        const newUsage = process.memoryUsage();
        const newPercentage = newUsage.heapUsed / newUsage.heapTotal;
        logger.info('Memory usage after optimization:', {
          usage: {
            heapUsed: Math.round(newUsage.heapUsed / (1024 * 1024)) + ' MB',
            heapTotal: Math.round(newUsage.heapTotal / (1024 * 1024)) + ' MB',
            percentage: Math.round(newPercentage * 100) + '%'
          },
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }, 5000);
    } catch (error) {
      logger.error('Memory optimization error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } finally {
      span.end();
    }
  }

  async cleanup() {
    const span = this.tracer.startSpan('cleanup');
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...', {
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
    try {
      if (this.websocketManager) {
        this.websocketManager.close(() => {
          logger.info('WebSocket server closed', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        });
        this.websocketManager.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.close(1000, 'Server shutting down');
          }
        });
      }

      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info('HTTP server closed', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        });
      }

      if (this.client) {
        await this.client.close();
        logger.info('MongoDB connection closed', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      if (this.redis) {
        this.redis.removeAllListeners();
        await this.redis.quit();
        logger.info('Redis cleanup completed successfully');
      }
    } catch (error) {
      logger.error('Redis cleanup failed:', { error: error.message, stack: error.stack });
      try {
        if (this.redis) {
          await this.redis.disconnect();
        }
        logger.info('Forced Redis disconnect after cleanup failure');
      } catch (disconnectError) {
        logger.warn('Failed to force disconnect Redis:', { error: disconnectError.message });
      }
    } finally {
      this.redis = null;
      global.redisClient = null;
    }
    try {
      if (this.intervals) {
        this.intervals.forEach(interval => clearInterval(interval));
        logger.info('Cleared all intervals', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      if (this.cache) {
        await this.cache.clear();
        logger.info('Cache cleared', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      this.modelCache.clear();
      this.lastTrainingTime.clear();
      this.predictionHistory.clear();
      this.modelMetrics.clear();
      this.streamingQueue = [];
      logger.info('In-memory data structures cleared', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      if (global.gc) {
        global.gc();
        logger.info('Final garbage collection performed', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      logger.info('Shutdown completed successfully', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Shutdown error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    } finally {
      span.end();
      process.exit(0);
    }
  }
}

if (cluster.isMaster) {
  const numWorkers = parseInt(process.env.NODE_CLUSTER_WORKERS, 10) || os.cpus().length;
  logger.info(`Master process starting with ${numWorkers} workers`, {
    metadata: { metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }, service: 'predictive-model', timestamp: new Date().toISOString() }
  });

  // Skip Redis initialization
  // Redis is explicitly disabled through environment variables
  logger.info('Redis is explicitly disabled, using in-memory cache', {
    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
  });

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`, {
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
    if (!global.isShuttingDown) {
      logger.info('Spawning new worker', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      cluster.fork();
    }
  });
} else {
  const model = new TheAnalyzerPredictiveModel();
  logger.info(`Worker ${process.pid} started`, {
    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
  });
}

module.exports = TheAnalyzerPredictiveModel;