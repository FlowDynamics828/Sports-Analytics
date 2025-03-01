// expose-gc-api.js

// Import required Node.js modules
const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const winston = require('winston');
const { format } = winston;
const fs = require('fs').promises;
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const prometheus = require('prom-client');
const cluster = require('cluster');
const os = require('os');
const AsyncLock = require('async-lock');
const CircuitBreaker = require('opossum');
const WebSocket = require('ws');

// Configure advanced logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
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

// Initialize Prometheus metrics
const prometheusMetrics = {
  predictionLatency: new prometheus.Histogram({
    name: 'prediction_latency_seconds',
    help: 'Time spent processing predictions'
  }),
  modelAccuracy: new prometheus.Gauge({
    name: 'model_accuracy',
    help: 'Model accuracy by league',
    labelNames: ['league']
  }),
  predictionsTotal: new prometheus.Counter({
    name: 'predictions_total',
    help: 'Total number of predictions',
    labelNames: ['league', 'type']
  }),
  predictionErrors: new prometheus.Counter({
    name: 'prediction_errors_total',
    help: 'Total number of prediction errors',
    labelNames: ['type']
  })
};

// Memory monitoring class
class MemoryMonitor {
  constructor(threshold = 0.85) {
    this.threshold = threshold;
    this.interval = null;
  }

  start(checkInterval = 60000) {
    this.interval = setInterval(() => {
      this.checkMemory();
    }, checkInterval);
    return this;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return this;
  }

  checkMemory() {
    const memoryUsage = process.memoryUsage();
    const usedHeapPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;

    if (usedHeapPercentage > this.threshold) {
      logger.warn(`High memory usage detected: ${Math.round(usedHeapPercentage * 100)}% of heap used`);
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered');
      }
    }
    return usedHeapPercentage;
  }
}

// Connection pool manager
class ConnectionPoolManager {
  constructor() {
    this.connections = new Map();
  }

  getConnection(id) {
    return this.connections.get(id);
  }

  addConnection(id, connection) {
    this.connections.set(id, {
      connection,
      lastUsed: Date.now()
    });
  }

  removeConnection(id) {
    this.connections.delete(id);
  }

  cleanup(maxIdleTime = 3600000) {
    const now = Date.now();
    for (const [id, info] of this.connections.entries()) {
      if (now - info.lastUsed > maxIdleTime) {
        this.removeConnection(id);
      }
    }
  }
}

// Predictive model class
class TheAnalyzerPredictiveModel extends EventEmitter {
  constructor() {
    super();

    this.config = {
      mongoUri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME || 'sports-analytics',
      pythonPath: process.env.PYTHON_PATH || 'python',
      pythonScript: path.join(__dirname, 'predictive_model.py'),
      port: 5050,
      modelUpdateInterval: 1000 * 60 * 60 * 24, // 24 hours
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || '',
        enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.info(`Redis connection retry attempt ${times} after ${delay}ms`);
          return delay;
        },
        connectionName: 'predictive-model',
        connectTimeout: 10000,
        showFriendlyErrorStack: true,
        maxRetriesPerRequest: 3
      },
      cache: {
        ttl: 3600, // 1 hour
        max: 1000,
        checkPeriod: 60
      },
      circuitBreaker: {
        timeout: 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        rollingCountTimeout: 10000
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      },
      streaming: {
        batchSize: 100,
        interval: 1000, // 1 second
        maxQueueSize: 10000
      },
      monitoring: {
        healthCheckInterval: 30000, // 30 seconds
        metricsInterval: 10000 // 10 seconds
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

    this.memoryMonitor = new MemoryMonitor();
    this.memoryMonitor.start();

    this.connectionPool = new ConnectionPoolManager();

    this.intervals = [];
    const cleanupInterval = setInterval(() => {
      this.connectionPool.cleanup();
    }, 15 * 60 * 1000); // Every 15 minutes
    this.intervals.push(cleanupInterval);

    this._initializeComponents().catch(error => {
      logger.error('Critical: Failed to initialize components:', error);
      process.exit(1);
    });
  }

  async _initializeComponents() {
    try {
      await this._initializeDatabase();
      logger.info('MongoDB connection established');

      this.redis = new Redis({
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

      this.redis.on('connect', () => {
        logger.info('Redis connection established');
      });

      this.redis.on('error', (error) => {
        logger.error('Redis connection error:', error);
      });

      this.cache = await this._initializeCache();

      this.lock = new AsyncLock({
        timeout: 5000,
        maxPending: 1000
      });

      this.breaker = new CircuitBreaker(this._executePython.bind(this), {
        ...this.config.circuitBreaker,
        errorFilter: (error) => error.type === 'ValidationError'
      });

      this.rateLimiter = {
        async consume(clientId) {
          const key = `ratelimit:${clientId}`;
          const limit = this.config.rateLimit.max;
          const window = this.config.rateLimit.windowMs;

          const current = await this.redis.incr(key);
          if (current === 1) {
            await this.redis.expire(key, Math.floor(window / 1000));
          }

          if (current > limit) {
            throw new Error('Rate limit exceeded');
          }
          return { remaining: limit - current };
        }
      };

      this._initializeWebSocket();
      this._initializeMonitoring();
      await this._initializeStreaming();
      this._setupEventHandlers();

      logger.info('All components initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize components:', error);
      throw error;
    }
  }

  async _initializeDatabase() {
    try {
      this.client = new MongoClient(this.config.mongoUri, {
        maxPoolSize: 50,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 10000
      });

      await this.client.connect();
      this.db = this.client.db(this.config.dbName);

      await this.db.command({ ping: 1 });
      logger.info('MongoDB connection established');

      this.client.on('serverHeartbeatFailed', (event) => {
        logger.error('MongoDB heartbeat failed:', event);
        prometheusMetrics.predictionErrors.inc({ type: 'database_heartbeat' });
      });
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async _initializeCache() {
    const cacheManager = require('cache-manager');
    const redisStore = require('cache-manager-ioredis');

    return cacheManager.caching({
      store: redisStore,
      ...this.config.redis,
      ...this.config.cache
    });
  }

  _initializeWebSocket() {
    this.wss = new WebSocket.Server({
      noServer: true,
      clientTracking: true,
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        concurrencyLimit: 10,
        threshold: 1024
      }
    });

    this.wss.on('connection', this._handleWebSocketConnection.bind(this));
    this.wss.on('error', this._handleWebSocketError.bind(this));

    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(() => {});
      });
    }, 30000);
  }

  _handleWebSocketConnection(ws, req) {
    if (prometheusMetrics.activeConnections) {
      prometheusMetrics.activeConnections.inc();
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
        logger.error('WebSocket message handling error:', error);
        ws.send(JSON.stringify({
          error: 'Invalid message format',
          timestamp: new Date().toISOString()
        }));
      }
    });

    ws.on('close', () => {
      if (prometheusMetrics.activeConnections) {
        prometheusMetrics.activeConnections.dec();
      }
    });

    ws.on('error', (error) => {
      logger.error('WebSocket client error:', error);
      prometheusMetrics.predictionErrors.inc({ type: 'websocket_client' });
    });
  }

  _handleWebSocketError(error) {
    logger.error('WebSocket server error:', error);
    prometheusMetrics.predictionErrors.inc({ type: 'websocket_server' });
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
      logger.error('Streaming data handling error:', error);
      ws.send(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  }

  _initializeMonitoring() {
    setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (health.status !== 'healthy') {
          logger.warn('Health check failed:', health);
          this.emit('health:degraded', health);
        }
      } catch (error) {
        logger.error('Health check error:', error);
      }
    }, this.config.monitoring.healthCheckInterval);

    setInterval(() => {
      try {
        this._collectMetrics();
      } catch (error) {
        logger.error('Metrics collection error:', error);
      }
    }, this.config.monitoring.metricsInterval);

    setInterval(() => {
      try {
        const usage = process.memoryUsage();
        if (prometheusMetrics.memoryUsage) {
          prometheusMetrics.memoryUsage.set(usage.heapUsed);
        }

        if (usage.heapUsed / usage.heapTotal > 0.9) {
          logger.warn('High memory usage detected:', usage);
          if (global.gc) {
            global.gc();
            logger.info('Garbage collection triggered');
          }
        }
      } catch (error) {
        logger.error('Memory monitoring error:', error);
      }
    }, 60000);
  }

  _collectMetrics() {
    try {
      for (const league of this.SUPPORTED_LEAGUES) {
        const leagueMetrics = this.modelMetrics.get(league);
        if (leagueMetrics && prometheusMetrics.modelAccuracy) {
          prometheusMetrics.modelAccuracy.set({ league }, leagueMetrics.accuracy || 0);
        }
      }

      if (prometheusMetrics.activeConnections && this.wss) {
        prometheusMetrics.activeConnections.set(this.wss.clients.size);
      }

      if (prometheusMetrics.memoryUsage) {
        const memUsage = process.memoryUsage();
        prometheusMetrics.memoryUsage.set(memUsage.heapUsed);
      }
    } catch (error) {
      logger.error('Metrics collection error:', error);
    }
  }

  async predict(predictionRequest) {
    const startTime = process.hrtime();

    try {
      this._validatePredictionRequest(predictionRequest);
      await this.rateLimiter.consume(predictionRequest.clientId);

      const cacheKey = this._generateCacheKey(predictionRequest);
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      const result = await this.breaker.fire({
        type: 'prediction',
        data: predictionRequest
      });

      await this.cache.set(cacheKey, result);
      this._storePredictionHistory(predictionRequest.league, result);

      const [seconds, nanoseconds] = process.hrtime(startTime);
      if (prometheusMetrics.predictionLatency) {
        prometheusMetrics.predictionLatency.observe(seconds + nanoseconds / 1e9);
      }
      if (prometheusMetrics.predictionsTotal) {
        prometheusMetrics.predictionsTotal.inc({
          league: predictionRequest.league,
          type: predictionRequest.predictionType
        });
      }

      return result;
    } catch (error) {
      logger.error('Prediction failed:', error);
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'prediction' });
      }
      throw this._formatError(error);
    }
  }

  async _executePython(data) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.config.pythonPath, [
        this.config.pythonScript,
        JSON.stringify({
          ...data,
          port: this.config.port,
          timestamp: new Date().toISOString(),
          includeXGBoost: true,
          includeLightGBM: true
        })
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          logger.error('Python process error:', stderr);
          prometheusMetrics.predictionErrors.inc({ type: 'python_process' });
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (e) {
            prometheusMetrics.predictionErrors.inc({ type: 'parse_error' });
            reject(new Error(`Failed to parse Python output: ${e.message}`));
          }
        }
      });

      pythonProcess.on('error', (error) => {
        logger.error('Python process spawn error:', error);
        prometheusMetrics.predictionErrors.inc({ type: 'spawn_error' });
        reject(error);
      });

      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Python process timeout'));
      }, this.config.circuitBreaker.timeout);
    });
  }

  _validatePredictionRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid prediction request format');
    }

    if (!this.SUPPORTED_LEAGUES.includes(request.league)) {
      throw new Error(`Unsupported league: ${request.league}`);
    }

    if (!Object.values(this.PREDICTION_TYPES).includes(request.predictionType)) {
      throw new Error(`Unsupported prediction type: ${request.predictionType}`);
    }

    if (!request.clientId) {
      throw new Error('Client ID is required');
    }
  }

  _generateCacheKey(predictionRequest) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(JSON.stringify(predictionRequest)).digest('hex');
    return `pred:${predictionRequest.league}:${predictionRequest.predictionType}:${hash}`;
  }

  _storePredictionHistory(league, prediction) {
    if (!this.predictionHistory.has(league)) {
      this.predictionHistory.set(league, []);
    }

    const history = this.predictionHistory.get(league);
    history.push({
      timestamp: new Date(),
      prediction
    });

    if (history.length > 1000) {
      history.shift();
    }
  }

  async _processStreamingBatch() {
    if (this.streamingQueue.length === 0) return;

    try {
      const batch = this.streamingQueue.splice(0, this.config.streaming.batchSize);
      const leagueGroups = new Map();

      for (const item of batch) {
        if (!leagueGroups.has(item.league)) {
          leagueGroups.set(item.league, []);
        }
        leagueGroups.get(item.league).push(item);
      }

      const promises = [];
      for (const [league, data] of leagueGroups) {
        promises.push(this._processBatchForLeague(league, data));
      }

      await Promise.all(promises);
    } catch (error) {
      logger.error('Batch processing error:', error);
      prometheusMetrics.predictionErrors.inc({ type: 'batch_processing' });
    }
  }

  async _processBatchForLeague(league, data) {
    try {
      const result = await this._executePython({
        type: 'batch_process',
        league,
        data
      });

      this._broadcastResults(league, result);
      return result;
    } catch (error) {
      logger.error(`League batch processing error for ${league}:`, error);
      throw error;
    }
  }

  _broadcastResults(league, results) {
    if (!this.wss) return;

    const message = JSON.stringify({
      type: 'batch_results',
      league,
      results,
      timestamp: new Date().toISOString()
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.subscribedLeagues?.includes(league)) {
        client.send(message);
      }
    });
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
          python: await this._checkPythonHealth(),
          websocket: this._checkWebSocketHealth(),
          cache: await this._checkCacheHealth()
        },
        metrics: {
          activeConnections: this.wss?.clients.size || 0,
          queueSize: this.streamingQueue.length,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        }
      };

      health.status = Object.values(health.components).every(
        status => status === 'healthy'
      ) ? 'healthy' : 'degraded';

      return health;
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async _checkDatabaseHealth() {
    try {
      await this.client.db().admin().ping();
      return 'healthy';
    } catch (error) {
      logger.error('Database health check failed:', error);
      return 'unhealthy';
    }
  }

  async _checkRedisHealth() {
    try {
      await this.redis.ping();
      return 'healthy';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return 'unhealthy';
    }
  }

  async _checkPythonHealth() {
    try {
      const result = await this._executePython({ type: 'health_check' });
      return result && result.status === 'ok' ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('Python health check failed:', error);
      return 'unhealthy';
    }
  }

  _checkWebSocketHealth() {
    return this.wss && !this.isShuttingDown ? 'healthy' : 'unhealthy';
  }

  async _checkCacheHealth() {
    try {
      await this.cache.set('health_check', 'ok');
      const result = await this.cache.get('health_check');
      return result === 'ok' ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('Cache health check failed:', error);
      return 'unhealthy';
    }
  }

  async _initializeStreaming() {
    try {
      this.streamProcessor = setInterval(() => {
        if (this.streamingQueue.length > 0) {
          this._processStreamingBatch().catch(error => {
            logger.error('Streaming batch processing error:', error);
          });
        }
      }, this.config.streaming.interval);

      this.intervals.push(this.streamProcessor);

      logger.info('Streaming initialization completed');
      return true;
    } catch (error) {
      logger.error('Failed to initialize streaming:', error);
      throw error;
    }
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

  async cleanup() {
    try {
      this.isShuttingDown = true;
      logger.info('Starting graceful shutdown...');

      if (this.wss) {
        for (const client of this.wss.clients) {
          client.close(1000, 'Server shutting down');
        }
        this.wss.close();
      }

      if (this.client) {
        await this.client.close(true);
        logger.info('MongoDB connection closed');
      }

      if (this.redis) {
        await this.redis.quit();
        logger.info('Redis connection closed');
      }

      if (this.cache) {
        await this.cache.reset();
        logger.info('Cache cleared');
      }

      this.streamingQueue = [];

      for (const interval of this.intervals) {
        clearInterval(interval);
      }

      if (global.gc) {
        global.gc();
      }

      logger.info('Cleanup completed successfully');
    } catch (error) {
      logger.error('Cleanup failed:', error);
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

  _setupEventHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      prometheusMetrics.predictionErrors.inc({ type: 'unhandled_rejection' });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      prometheusMetrics.predictionErrors.inc({ type: 'uncaught_exception' });
      this.cleanup().finally(() => process.exit(1));
    });

    ['SIGTERM', 'SIGINT', 'SIGUSR2'].forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal} signal`);
        try {
          await this.cleanup();
          process.exit(0);
        } catch (error) {
          logger.error(`Error during ${signal} cleanup:`, error);
          process.exit(1);
        }
      });
    });
  }
}

// Create singleton instance
const predictiveModel = new TheAnalyzerPredictiveModel();

// Handle cluster mode for production
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  const numWorkers = process.env.CLUSTER_WORKERS || os.cpus().length;

  logger.info(`Master cluster setting up ${numWorkers} workers`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`);
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`);
    logger.info('Starting a new worker');
    cluster.fork();
  });
} else {
  predictiveModel._initializeComponents().catch(error => {
    logger.error('Failed to initialize worker:', error);
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