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

// Configure logging with .env settings
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
      maxsize: 10000000, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 10000000,
      maxFiles: 5,
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
 * Version: 3.0.0
 */
class TheAnalyzerPredictiveModel extends EventEmitter {
  constructor() {
    super();

    this.config = {
      mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics',
      dbName: process.env.MONGODB_DB_NAME || 'sports-analytics',
      pythonScript: process.env.PYTHON_SCRIPT || 'predictive_model.py',
      port: parseInt(process.env.PORT, 10) || 5050,
      modelUpdateInterval: parseInt(process.env.MODEL_UPDATE_INTERVAL, 10) || 1209600000, // 14 days from .env
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
        retryStrategy: (times) => {
          const maxDelay = parseInt(process.env.REDIS_RETRY_STRATEGY_MAX_DELAY, 10) || 2000;
          const delay = Math.min(times * 50, maxDelay);
          logger.info(`Redis connection retry attempt ${times} after ${delay}ms`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          return delay;
        },
        connectionName: 'predictive-model',
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
        showFriendlyErrorStack: true,
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3
      },
      cache: {
        ttl: parseInt(process.env.CACHE_TTL, 10) || 1800, // 30 minutes from .env
        max: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 500,
        checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 300 // 5 minutes from .env
      },
      circuitBreaker: {
        timeout: parseInt(process.env.PREDICTION_TIMEOUT, 10) || 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        rollingCountTimeout: 10000
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes from .env
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 50
      },
      streaming: {
        batchSize: 50,
        interval: 5000, // 5 seconds
        maxQueueSize: 500
      },
      monitoring: {
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 300000, // 5 minutes from .env
        metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 300000 // 5 minutes from .env
      },
      alertThresholds: {
        memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80,
        cpuLoad: parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80,
        networkTraffic: parseInt(process.env.NETWORK_TRAFFIC_THRESHOLD, 10) || 52428800 // 50MB from .env
      }
    };

    this.SUPPORTED_LEAGUES = [
      'NFL', 'NBA', 'MLB', 'NHL',
      'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
    ];

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

    // Initialize MetricsManager for monitoring
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

    this.rateLimiter = rateLimiter; // Direct import to avoid initialization issues
    this._initializeComponents().catch(error => {
      logger.error('Critical: Failed to initialize components:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      process.exit(1);
    });

    // Set up unhandled rejection handler
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
    try {
      // Use global Redis singleton to prevent duplication and circular dependencies
      if (!global.redisClient) {
        global.redisClient = new Redis({
          host: this.config.redis.host,
          port: this.config.redis.port,
          password: this.config.redis.password,
          enableOfflineQueue: this.config.redis.enableOfflineQueue,
          retryStrategy: this.config.redis.retryStrategy,
          connectionName: this.config.redis.connectionName,
          connectTimeout: this.config.redis.connectTimeout,
          showFriendlyErrorStack: this.config.redis.showFriendlyErrorStack,
          maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest
        });

        global.redisClient.on('connect', () => {
          logger.info('Redis connection established', { 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
        });

        global.redisClient.on('error', (error) => {
          logger.error('Redis connection error:', { 
            error: error.message, 
            stack: error.stack, 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
        });
      }
      this.redis = global.redisClient;

      this.client = new MongoClient(this.config.mongoUri, {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 10,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 30000, // Reduced for quicker detection
        maxIdleTimeMS: 60000, // 1 minute idle timeout
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
        timeout: 5000,
        maxPending: 1000
      });

      // Define _executePython method if it doesn't exist
      if (!this._executePython) {
        this._executePython = async (data) => {
          // Validate input to prevent 'data must be a non-null object' errors
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid input: data must be a non-null object');
          }

          // Ensure we have the required PythonBridge
          if (!global.PythonBridge || typeof global.PythonBridge.runPrediction !== 'function') {
            logger.error('PythonBridge not available or missing runPrediction method', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            throw new Error('Python bridge not available');
          }

          // Add timestamp if not present
          if (!data.timestamp) {
            data.timestamp = new Date().toISOString();
          }

          return global.PythonBridge.runPrediction(data, this.config.pythonScript);
        };
      }

      // Configure circuit breaker with improved error handling
      this.breaker = new CircuitBreaker(async (data) => await this._executePython(data), {
        timeout: this.config.circuitBreaker.timeout,
        errorThresholdPercentage: this.config.circuitBreaker.errorThresholdPercentage,
        resetTimeout: this.config.circuitBreaker.resetTimeout,
        rollingCountTimeout: this.config.circuitBreaker.rollingCountTimeout,
        // Improved error filter to handle validation errors
        errorFilter: (error) => {
          // Don't trip the breaker for validation errors
          if (error.message && error.message.includes('Invalid input')) {
            logger.warn('Validation error filtered from circuit breaker:', {
              error: error.message,
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            return true;
          }
          // Don't trip the breaker for health checks
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

      // Get the global HTTP server from api.js if available
      let server = null;
      try {
        // Try to get the server from the global scope
        if (global.httpServer && typeof global.httpServer.on === 'function') {
          server = global.httpServer;
          logger.info('Using existing global HTTP server for WebSocket', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        } else {
          // Create a new HTTP server if needed
          const http = require('http');
          const express = require('express');
          const app = express();

          // Create HTTP server with noServer option to avoid port binding
          server = http.createServer(app);

          // Store server reference globally for reuse
          global.httpServer = server;

          // Only listen if we're creating a new server
          // Use a different port to avoid conflicts with the main API server
          const wsPort = parseInt(process.env.WS_PORT, 10) || (this.config.port + 100);
          server.listen(wsPort, () => {
            logger.info(`Created new HTTP server for WebSocket on port ${wsPort}`, {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          });
        }
      } catch (error) {
        logger.error('Failed to get or create HTTP server for WebSocket:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        throw error;
      }

      // Store server reference for cleanup
      this.httpServer = server;

      // Create WebSocket server on the HTTP server
      this.websocketManager = new WebSocket.Server({
        server: server, // Use the server we got or created
        path: process.env.WS_PATH || '/ws',
        maxPayload: parseInt(process.env.WS_MAX_PAYLOAD, 10) || 52428800, // 50MB from .env
        clientTracking: true,
        perMessageDeflate: {
          zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: parseInt(process.env.COMPRESSION_LEVEL, 10) || 6
          },
          zlibInflateOptions: {
            chunkSize: 10 * 1024
          },
          threshold: parseInt(process.env.COMPRESSION_THRESHOLD, 10) || 1024
        }
      });

      // No need to start the HTTP server here as it's either already started
      // or was started in the server creation block above
      this.websocketManager.on('connection', this._handleWebSocketConnection.bind(this));
      this.websocketManager.on('error', this._handleWebSocketError.bind(this));
      logger.info('WebSocket server initialized', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });

      this._initializeStreaming();
      this._initializeMonitoring();
      this._setupEventHandlers();

      logger.info('All components initialized successfully', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Failed to initialize components:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }

  _handleWebSocketConnection(ws) {
    if (this.metrics && this.metrics.activeConnections) {
      this.metrics.activeConnections.inc();
    }
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message) => {
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
  }

  _handleWebSocketError(error) {
    logger.error('WebSocket server error:', { 
      error: error.message, 
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
    });
    if (this.metrics && this.metrics.predictionErrors) {
      this.metrics.predictionErrors.inc({ type: 'websocket_server' });
    }
  }

  async _handleStreamingData(data, ws) {
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
    }
  }

  _initializeStreaming() {
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

      this.intervals = this.intervals || [];
      this.intervals.push(this.streamProcessor);

      logger.info('Streaming initialization completed', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Failed to initialize streaming:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }

  _initializeMonitoring() {
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

    // Memory monitoring with safeguards
    this.memoryMonitorInterval = setInterval(() => {
      try {
        const usage = process.memoryUsage();

        // Record metrics if available
        if (this.metrics) {
          // Check if memoryUsage.set exists
          if (this.metrics.memoryUsage && typeof this.metrics.memoryUsage.set === 'function') {
            this.metrics.memoryUsage.set(usage.heapUsed);
          }

          // Check if recordMemoryUsage exists
          if (typeof this.metrics.recordMemoryUsage === 'function') {
            this.metrics.recordMemoryUsage();
          } else {
            // If the method doesn't exist, don't try to call it
            logger.debug('metrics.recordMemoryUsage is not a function, skipping', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          }
        }

        // Check for high memory usage
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

          // Perform memory optimization
          this._optimizeMemory(currentUsage);
        }
      } catch (error) {
        logger.error('Memory monitoring error:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }
    }, 300000); // 5 minutes, matching .env

    // Add to intervals array for cleanup
    this.intervals = this.intervals || [];
    this.intervals.push(this.memoryMonitorInterval);
  }

  _collectMetrics() {
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
    }
  }

  async _processStreamingBatch() {
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
    }
  }

  async _processBatchForLeague(league, data) {
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
        this.metrics.predictionErrors.inc({ type: 'batch_process' });
      }
      throw error;
    }
  }

  _broadcastResults(league, results) {
    if (!this.websocketManager) return;

    const message = JSON.stringify({
      type: 'batch_results',
      league,
      results,
      timestamp: new Date().toISOString()
    });

    this.websocketManager.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.subscribedLeagues?.includes(league)) {
        client.send(message);
      }
    });
  }

  _validateStreamingData(data) {
    return !!(
      data &&
      data.league &&
      this.SUPPORTED_LEAGUES.includes(data.league) &&
      data.type &&
      Object.values(this.PREDICTION_TYPES).includes(data.type)
    );
  }

  async healthCheck() {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        port: this.config.port,
        components: {
          database: await this._checkDatabaseHealth(),
          redis: await this._checkRedisHealth(),
          websocket: this._checkWebSocketHealth(),
          cache: await this._checkCacheHealth(),
          python: await this._checkPythonHealth()
        },
        metrics: {
          activeConnections: this.websocketManager?.clients.size || 0,
          queueSize: this.streamingQueue.length,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        }
      };

      health.status = Object.values(health.components).every(
        status => status === 'healthy'
      ) ? 'healthy' : 'degraded';

      // Safely call recordHealthStatus if it exists
      if (this.metrics && typeof this.metrics.recordHealthStatus === 'function') {
        try {
          this.metrics.recordHealthStatus(health);
        } catch (error) {
          logger.warn('Error recording health status metrics:', {
            error: error.message,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        }
      }
      return health;
    } catch (error) {
      logger.error('Health check failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async _checkDatabaseHealth() {
    try {
      if (!this.client) return 'unhealthy';
      await this.client.db().admin().ping();
      return 'healthy';
    } catch (error) {
      logger.error('Database health check failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'database_health' });
      }
      return 'unhealthy';
    }
  }

  async _checkRedisHealth() {
    try {
      if (!this.redis) return 'unhealthy';
      await this.redis.ping();
      return 'healthy';
    } catch (error) {
      logger.error('Redis health check failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'redis_health' });
      }
      return 'unhealthy';
    }
  }

  async _checkWebSocketHealth() {
    try {
      return this.websocketManager && !this.isShuttingDown ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('WebSocket health check failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'websocket_health' });
      }
      return 'unhealthy';
    }
  }

  async _checkCacheHealth() {
    try {
      if (!this.cache || !this.cache.has || !this.cache.set || !this.cache.get) {
        logger.error('Cache object is invalid or missing required methods', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return 'unhealthy';
      }
      await this.cache.set('_health_check_', 'ok', 5); // 5 seconds TTL
      const result = await this.cache.get('_health_check_');
      return result === 'ok' ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('Cache health check failed:', {
        error: error.message,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'cache_health' });
      }
      return 'unhealthy';
    }
  }

  /**
   * Check Python component health
   * @returns {Promise<string>} Health status: 'healthy' or 'unhealthy'
   */
  async _checkPythonHealth() {
    try {
      // First, try a direct Python check using child_process
      // This bypasses PythonBridge and its validation
      try {
        const fs = require('fs');
        const pythonScriptPath = path.resolve(process.cwd(), this.config.pythonScript);

        // Check if Python script exists
        if (!fs.existsSync(pythonScriptPath)) {
          logger.warn(`Python script not found at ${pythonScriptPath}`, {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          return 'unhealthy';
        }

        // Simple health check command
        const { spawn } = require('child_process');
        const pythonProcess = spawn('python', ['-c', 'print("healthy")']);

        const result = await new Promise((resolve, reject) => {
          let output = '';
          let error = '';

          pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
          });

          pythonProcess.stderr.on('data', (data) => {
            error += data.toString();
          });

          pythonProcess.on('close', (code) => {
            if (code === 0) {
              resolve(output.trim());
            } else {
              reject(new Error(`Python process exited with code ${code}: ${error}`));
            }
          });

          // Set timeout
          setTimeout(() => {
            pythonProcess.kill();
            reject(new Error('Python health check timed out'));
          }, 5000);
        });

        if (result === 'healthy') {
          return 'healthy';
        }
      } catch (directError) {
        logger.debug('Direct Python health check failed, trying PythonBridge:', {
          error: directError.message,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        // Continue to PythonBridge approach
      }

      // If direct check fails, try with PythonBridge
      // Create a proper health check object that will pass validation
      const healthCheckData = {
        type: 'health_check',
        timestamp: new Date().toISOString(),
        data: {
          command: 'status'
        }
      };

      // Check if the circuit breaker is open
      if (this.breaker && this.breaker.opened) {
        logger.warn('Circuit breaker is open, Python health check failed', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return 'unhealthy';
      }

      // Try to execute Python health check through PythonBridge
      try {
        // Use _executePython directly to bypass circuit breaker
        if (typeof this._executePython === 'function') {
          const result = await this._executePython(healthCheckData);
          return result && result.status === 'ok' ? 'healthy' : 'unhealthy';
        } else {
          logger.warn('_executePython method not available', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          return 'unhealthy';
        }
      } catch (error) {
        logger.error('PythonBridge health check failed:', {
          error: error.message,
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return 'unhealthy';
      }
    } catch (error) {
      logger.error('Python health check failed:', {
        error: error.message,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'python_health' });
      }
      return 'unhealthy';
    }
  }

  async cleanup() {
    try {
      this.isShuttingDown = true;
      logger.info('Starting graceful shutdown...', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });

      // Close WebSocket connections
      if (this.websocketManager) {
        for (const client of this.websocketManager.clients) {
          client.close(1000, 'Server shutting down');
        }
        this.websocketManager.close();
        logger.info('WebSocket connections closed', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // Close HTTP server if it exists
      if (this.httpServer) {
        await new Promise(resolve => {
          this.httpServer.close(resolve);
        });
        logger.info('WebSocket HTTP server closed', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      if (this.client) {
        await this.client.close(true);
        logger.info('MongoDB connection closed', { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
      }

      // Safely close Redis connection with error handling
      if (this.redis) {
        try {
          // Check if Redis is still connected before quitting
          if (this.redis.status === 'ready' || this.redis.status === 'connect') {
            // Use quit() for graceful shutdown
            await this.redis.quit().catch(err => {
              logger.warn('Redis quit error (non-fatal):', {
                error: err.message,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
              });
            });
          } else if (this.redis.status === 'end' || this.redis.status === 'close') {
            logger.info('Redis connection already closed', {
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
          } else {
            // Force disconnect if quit fails or status is unknown
            this.redis.disconnect();
          }

          // Clear the reference
          this.redis = null;
          global.redisClient = null;

          logger.info('Redis connection closed', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
        } catch (redisError) {
          logger.warn('Error during Redis shutdown (continuing cleanup):', {
            error: redisError.message,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
          });
          // Force null the reference even if there was an error
          this.redis = null;
          global.redisClient = null;
        }
      }

      if (this.cache) {
        await this.cache.clear();
        logger.info('Cache cleared', { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
      }

      this.streamingQueue = [];

      if (this.intervals) {
        for (const interval of this.intervals) {
          clearInterval(interval);
        }
      }

      if (global.gc) global.gc();

      if (this.metrics && typeof this.metrics.cleanup === 'function') {
        this.metrics.cleanup();
      }

      logger.info('Cleanup completed successfully', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Cleanup failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }

  _formatError(error) {
    return {
      message: error.message,
      type: error.constructor.name,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }

  /**
   * Optimize memory usage when it exceeds thresholds
   * @param {number} currentUsage - Current memory usage ratio
   * @private
   */
  async _optimizeMemory(currentUsage) {
    try {
      logger.info('Starting memory optimization', {
        currentUsage: Math.round(currentUsage * 100) + '%',
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

      // 1. Clear non-essential caches
      this.modelCache.clear();
      this.predictionHistory.clear();

      // 2. Trim streaming queue if it's large
      if (this.streamingQueue.length > 100) {
        const removed = this.streamingQueue.length - 100;
        this.streamingQueue = this.streamingQueue.slice(-100);
        logger.info(`Removed ${removed} items from streaming queue`, {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // 3. Clear model metrics that aren't being used
      for (const [league, metrics] of this.modelMetrics.entries()) {
        // Keep only essential metrics
        if (metrics && typeof metrics === 'object') {
          Object.keys(metrics).forEach(key => {
            if (key !== 'accuracy' && key !== 'lastUpdated') {
              delete metrics[key];
            }
          });
        }
      }

      // 4. Trigger cache optimization if available
      if (this.cache && typeof this.cache.performMemoryOptimization === 'function') {
        await this.cache.performMemoryOptimization(currentUsage, this.config.alertThresholds.memoryUsage);
      }

      // 5. Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered during memory optimization', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }

      // 6. Log memory usage after optimization
      const newUsage = process.memoryUsage();
      const newRatio = newUsage.heapUsed / newUsage.heapTotal;

      logger.info('Memory optimization complete', {
        before: Math.round(currentUsage * 100) + '%',
        after: Math.round(newRatio * 100) + '%',
        reduction: Math.round((currentUsage - newRatio) * 100) + '%',
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });

    } catch (error) {
      logger.error('Error during memory optimization:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    }
  }

  _setupEventHandlers() {
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

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (this.metrics && this.metrics.predictionErrors) {
        this.metrics.predictionErrors.inc({ type: 'uncaught_exception' });
      }
      this.cleanup().finally(() => process.exit(1));
    });

    ['SIGTERM', 'SIGINT', 'SIGUSR2'].forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal} signal`, { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        try {
          await this.cleanup();
          process.exit(0);
        } catch (error) {
          logger.error(`Error during ${signal} cleanup:`, { 
            error: error.message, 
            stack: error.stack, 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
          process.exit(1);
        }
      });
    });
  }
}

// Create singleton instance for Redis
if (!global.redisClient) {
  global.redisClient = null;
}

// Create singleton instance
const predictiveModel = new TheAnalyzerPredictiveModel();

// Handle cluster mode for production
if (process.env.NODE_ENV === 'production' && cluster && typeof cluster.isMaster === 'boolean' && cluster.isMaster) {
  const numWorkers = parseInt(process.env.NODE_CLUSTER_WORKERS, 10) || 2; // 2 workers from .env

  logger.info(`Master cluster setting up ${numWorkers} workers`, {
    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
  });

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`, {
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`, {
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
    logger.info('Starting a new worker', {
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
    cluster.fork();
  });
} else {
  predictiveModel._initializeComponents().catch(error => {
    logger.error('Failed to initialize worker:', {
      error: error.message,
      stack: error.stack,
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
    process.exit(1);
  });
}

// Export singleton instance and types
module.exports = predictiveModel;

module.exports.PredictionTypes = Object.freeze({
  SINGLE_FACTOR: 'single_factor',
  MULTI_FACTOR: 'multi_factor',
  PLAYER_STATS: 'player_stats',
  TEAM_PERFORMANCE: 'team_performance',
  GAME_OUTCOME: 'game_outcome',
  REAL_TIME: 'real_time',
  ADVANCED_ANALYTICS: 'advanced_analytics'
});

module.exports.SupportedLeagues = Object.freeze([
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
]);

// Export Redis client for use in other modules
module.exports.redisClient = global.redisClient;