// api.js

// Load environment variables
require('dotenv').config();

// Import required modules
const EventEmitter = require('events');
const path = require('path');
const winston = require('winston');
const { format } = winston;
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
const prometheus = require('prom-client');
const cluster = require('cluster');
const os = require('os');
const AsyncLock = require('async-lock');
const CircuitBreaker = require('opossum');
const WebSocket = require('ws');
const MetricsManager = require('./utils/metricsManager');
const { CacheManager } = require('./utils/cache');
const express = require('express');
const http = require('http');

// Lazy load PythonBridge to handle potential loading issues
let PythonBridge = null;
try {
  PythonBridge = require('./utils/PythonBridge');
} catch (error) {
  console.error('Failed to load PythonBridge module:', error);
  process.exit(1);
}

// Configure logging with .env settings
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
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
  }),
  activeConnections: new prometheus.Gauge({
    name: 'active_connections',
    help: 'Number of active connections'
  }),
  memoryUsage: new prometheus.Gauge({
    name: 'memory_usage_bytes',
    help: 'Memory usage in bytes'
  }),
  cpuLoad: new prometheus.Gauge({
    name: 'cpu_load',
    help: 'Current CPU load percentage'
  })
};

// Memory monitoring class with optimization
class MemoryMonitor {
  constructor(threshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80) {
    this.threshold = threshold;
    this.interval = null;
  }

  start(checkInterval = 300000) { // 5 minutes to reduce CPU usage
    this.interval = setInterval(() => this.checkMemory(), checkInterval);
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
      logger.warn(`High memory usage detected: ${Math.round(usedHeapPercentage * 100)}% of heap used`, {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
      }
    }
    if (prometheusMetrics.memoryUsage) {
      prometheusMetrics.memoryUsage.set(memoryUsage.heapUsed);
    }
    return usedHeapPercentage;
  }
}

// CPU monitoring class
class CPUMonitor {
  constructor(threshold = parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80) {
    this.threshold = threshold;
    this.interval = null;
  }

  start(checkInterval = 300000) { // 5 minutes to reduce CPU usage
    this.interval = setInterval(() => this.checkCPU(), checkInterval);
    return this;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return this;
  }

  checkCPU() {
    const cpus = os.cpus();
    const totalLoad = cpus.reduce((sum, cpu) => sum + (cpu.times.user + cpu.times.sys) / cpu.times.total, 0) / cpus.length;
    if (totalLoad > this.threshold) {
      logger.warn(`High CPU load detected: ${totalLoad * 100}%`, {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
      });
    }
    if (prometheusMetrics.cpuLoad) {
      prometheusMetrics.cpuLoad.set(totalLoad * 100); // Convert to percentage
    }
    return totalLoad;
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
    this.connections.set(id, { connection, lastUsed: Date.now() });
  }

  removeConnection(id) {
    this.connections.delete(id);
  }

  cleanup(maxIdleTime = 3600000) { // 1 hour
    const now = Date.now();
    for (const [id, info] of this.connections) {
      if (now - info.lastUsed > maxIdleTime) this.removeConnection(id);
    }
  }
}

// Predictive model class with rate limiting and optimization
class TheAnalyzerPredictiveModel extends EventEmitter {
  constructor() {
    super();

    this.config = {
      mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics',
      dbName: process.env.MONGODB_DB_NAME || 'sports-analytics',
      pythonScript: process.env.PYTHON_SCRIPT || 'predictive_model.py',
      port: parseInt(process.env.PORT, 10) || 5050,
      modelUpdateInterval: parseInt(process.env.MODEL_UPDATE_INTERVAL, 10) || (24 * 60 * 60 * 1000), // 24 hours
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
        showFriendlyErrorStack: true
      },
      cache: {
        ttl: parseInt(process.env.CACHE_TTL, 10) || 1800, // 30 minutes
        max: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 500,
        checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 300 // 5 minutes
      },
      circuitBreaker: {
        timeout: parseInt(process.env.PREDICTION_TIMEOUT, 10) || 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        rollingCountTimeout: 10000
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 50
      },
      streaming: {
        batchSize: 50,
        interval: 5000, // 5 seconds
        maxQueueSize: 500
      },
      monitoring: {
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 300000, // 5 minutes
        metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 300000 // 5 minutes
      },
      alertThresholds: {
        memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80,
        cpuLoad: parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80,
        networkTraffic: parseInt(process.env.NETWORK_TRAFFIC_THRESHOLD, 10) || (50 * 1024 * 1024) // 50MB
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

    this.memoryMonitor = new MemoryMonitor(this.config.alertThresholds.memoryUsage);
    this.cpuMonitor = new CPUMonitor(this.config.alertThresholds.cpuLoad);
    this.memoryMonitor.start(300000); // 5 minutes
    this.cpuMonitor.start(300000);   // 5 minutes

    this.connectionPool = new ConnectionPoolManager();

    this.cache = new CacheManager({
      stdTTL: this.config.cache.ttl,
      checkperiod: this.config.cache.checkPeriod,
      maxKeys: this.config.cache.max
    });

    this.intervals = [];
    const cleanupInterval = setInterval(() => {
      this.connectionPool.cleanup();
      this.cache.clear().catch(error => logger.warn('Cache cleanup failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      }));
    }, 15 * 60 * 1000); // Every 15 minutes
    this.intervals.push(cleanupInterval);

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
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'unhandled_rejection' });
      }
      this._handleError(reason);
    });
  }

  _handleError(error) {
    logger.error('Error handled:', { 
      error: error.message, 
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, 
      metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
    });
    if (prometheusMetrics.predictionErrors) {
      prometheusMetrics.predictionErrors.inc({ type: 'general_error' });
    }
    this.emit('error:handled', error);
  }

  async _initializeComponents() {
    try {
      // Create a single Redis client instance as a global singleton
      if (!global.redisClient) {
        global.redisClient = new Redis({
          host: this.config.redis.host,
          port: this.config.redis.port,
          password: this.config.redis.password,
          enableOfflineQueue: this.config.redis.enableOfflineQueue,
          retryStrategy: this.config.redis.retryStrategy,
          connectionName: this.config.redis.connectionName,
          connectTimeout: this.config.redis.connectTimeout,
          showFriendlyErrorStack: this.config.redis.showFriendlyErrorStack
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
          this._handleError(error);
        });
      }

      this.redis = global.redisClient; // Use the global singleton Redis client

      await this.cache.initialize(this.redis); // Pass the singleton Redis client to CacheManager
      await this._initializeDatabase();
      logger.info('MongoDB connection established', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });

      // Create Express app and HTTP server
      const app = express();
      const server = http.createServer(app);

      const { WebSocketServer } = require('./utils/websocket-server');
      this.websocketManager = new WebSocketServer({
        path: process.env.WS_PATH || '/ws',
        jwtSecret: process.env.JWT_SECRET,
        heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 60000,
        clientTimeout: parseInt(process.env.WS_CLIENT_TIMEOUT, 10) || 35000,
        maxPayload: parseInt(process.env.WS_MAX_PAYLOAD, 10) || (50 * 1024 * 1024),
        maxClients: 1000,
        compression: {
          enabled: true,
          level: parseInt(process.env.COMPRESSION_LEVEL, 10) || 6,
          threshold: parseInt(process.env.COMPRESSION_THRESHOLD, 10) || 1024
        },
        security: {
          rateLimiting: {
            enabled: true,
            maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_MAX, 10) * 4 || 200
          },
          maxConnectionsPerIP: parseInt(process.env.MAX_CONNECTIONS_PER_IP, 10) || 50
        },
        monitoring: {
          enabled: true,
          metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 300000
        }
      });

      await this.websocketManager.initialize(server); // Pass the HTTP server instance
      logger.info('WebSocket server initialized successfully', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });

      this.lock = new AsyncLock({
        timeout: 5000,
        maxPending: 1000
      });

      this.breaker = new CircuitBreaker(this._executePython.bind(this), {
        timeout: this.config.circuitBreaker.timeout,
        errorThresholdPercentage: this.config.circuitBreaker.errorThresholdPercentage,
        resetTimeout: this.config.circuitBreaker.resetTimeout,
        rollingCountTimeout: this.config.circuitBreaker.rollingCountTimeout,
        errorFilter: (error) => error.type === 'ValidationError'
      });

      // Import and initialize rateLimiter with detailed diagnostics
      try {
        const rateLimiterModule = require('./utils/rateLimiter');
        if (!rateLimiterModule || typeof rateLimiterModule.checkLimit !== 'function') {
          logger.error('Rate limiter module is invalid or missing checkLimit, using in-memory fallback', { 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
          this.rateLimiter = {
            checkLimit: async (key) => {
              const now = Date.now();
              const userLimits = this.rateLimiter.limits.get(key) || [];
              const validRequests = userLimits.filter(timestamp => now - timestamp < this.config.rateLimit.windowMs);

              if (validRequests.length >= this.config.rateLimit.max) {
                logger.warn('Rate limit exceeded (in-memory fallback):', { 
                  key, 
                  limit: this.config.rateLimit.max, 
                  timestamp: new Date().toISOString(), 
                  metadata: { service: 'predictive-model' } 
                });
                return false;
              }

              validRequests.push(now);
              this.rateLimiter.limits = this.rateLimiter.limits || new Map();
              this.rateLimiter.limits.set(key, validRequests);
              return true;
            },
            limits: new Map()
          };
        } else {
          this.rateLimiter = rateLimiterModule;
          logger.info('Rate limiter initialized successfully from module', { 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
        }
      } catch (error) {
        logger.error('Failed to load rate limiter module, using in-memory fallback:', { 
          error: error.message, 
          stack: error.stack, 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        this.rateLimiter = {
          checkLimit: async (key) => {
            const now = Date.now();
            const userLimits = this.rateLimiter.limits.get(key) || [];
            const validRequests = userLimits.filter(timestamp => now - timestamp < this.config.rateLimit.windowMs);

            if (validRequests.length >= this.config.rateLimit.max) {
              logger.warn('Rate limit exceeded (in-memory fallback):', { 
                key, 
                limit: this.config.rateLimit.max, 
                timestamp: new Date().toISOString(), 
                metadata: { service: 'predictive-model' } 
              });
              return false;
            }

            validRequests.push(now);
            this.rateLimiter.limits = this.rateLimiter.limits || new Map();
            this.rateLimiter.limits.set(key, validRequests);
            return true;
          },
          limits: new Map()
        };
      }

      this._initializeStreaming();
      this._initializeMonitoring();
      this._setupEventHandlers();

      // Start the HTTP server
      server.listen(this.config.port, () => {
        logger.info(`HTTP server listening on port ${this.config.port}`, { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
      });

      logger.info('All components initialized successfully', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Failed to initialize components:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      throw error;
    }
  }

  async _initializeDatabase() {
    try {
      if (!this.config.mongoUri || typeof this.config.mongoUri !== 'string') {
        throw new Error('MongoDB URI is not defined or invalid');
      }

      this.client = new MongoClient(this.config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 10,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 30000, // Reduced to 30 seconds for quicker detection
        maxIdleTimeMS: 60000, // 1 minute idle timeout
        retryWrites: true,
        retryReads: true
      });

      const connectWithRetry = async (attempt = 1, maxAttempts = 3) => {
        try {
          await this.client.connect();
          this.db = this.client.db(this.config.dbName);
          await this.db.command({ ping: 1 });
          logger.info('MongoDB connection established with retry', { 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString(), attempt } 
          });
          this.client.on('serverHeartbeatFailed', (event) => {
            logger.warn('MongoDB heartbeat failed:', { 
              metadata: { ...event, service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
              prometheusMetrics.predictionErrors.inc({ type: 'database_heartbeat' });
            }
          });
        } catch (error) {
          if (attempt < maxAttempts) {
            logger.warn(`MongoDB connection attempt ${attempt} failed, retrying in 5 seconds...`, { 
              error: error.message, 
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            await new Promise(resolve => setTimeout(resolve, 5000));
            return connectWithRetry(attempt + 1, maxAttempts);
          }
          throw new Error(`Failed to connect to MongoDB after ${maxAttempts} attempts: ${error.message}`);
        }
      };

      await connectWithRetry();
    } catch (error) {
      logger.error('Database initialization failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'database_init' });
      }
      this._handleError(error);
      throw error;
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
            this._handleError(error);
          });
        }
      }, this.config.streaming.interval);

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
      this._handleError(error);
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
        this._handleError(error);
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
        this._handleError(error);
      }
    }, this.config.monitoring.metricsInterval);

    setInterval(() => {
      try {
        const usage = process.memoryUsage();
        if (prometheusMetrics.memoryUsage) {
          prometheusMetrics.memoryUsage.set(usage.heapUsed);
        }

        if (usage.heapUsed / usage.heapTotal > this.config.alertThresholds.memoryUsage) {
          logger.warn('High memory usage detected:', { 
            usage, 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
          });
          if (global.gc) {
            global.gc();
            logger.info('Garbage collection triggered', { 
              metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
          }
        }
        this.metrics.recordMemoryUsage();
      } catch (error) {
        logger.error('Memory monitoring error:', { 
          error: error.message, 
          stack: error.stack, 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        this._handleError(error);
      }
    }, 300000); // 5 minutes
  }

  _collectMetrics() {
    try {
      for (const league of this.SUPPORTED_LEAGUES) {
        const leagueMetrics = this.modelMetrics.get(league);
        if (leagueMetrics && prometheusMetrics.modelAccuracy) {
          prometheusMetrics.modelAccuracy.set({ league }, leagueMetrics.accuracy || 0);
        }
      }

      if (prometheusMetrics.activeConnections && this.websocketManager.server) {
        prometheusMetrics.activeConnections.set(this.websocketManager.server.clients.size);
      }

      if (prometheusMetrics.memoryUsage) {
        const memUsage = process.memoryUsage();
        prometheusMetrics.memoryUsage.set(memUsage.heapUsed);
      }
    } catch (error) {
      logger.error('Metrics collection error:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
    }
  }

  async predict(predictionRequest) {
    const startTime = performance.now();

    try {
      if (!this.rateLimiter || typeof this.rateLimiter.checkLimit !== 'function') {
        throw new Error('Rate limiter is not properly initialized');
      }

      const clientId = predictionRequest.clientId || 'anonymous';
      const allowed = await this.rateLimiter.checkLimit(clientId);
      if (!allowed) {
        throw new Error('Prediction rate limit exceeded');
      }

      const cacheKey = this._generateCacheKey(predictionRequest);
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      const lastPrediction = await this.redis.get(`lastPrediction:${clientId}`);
      if (lastPrediction && (Date.now() - parseInt(lastPrediction)) < 1000) { // 1-second cooldown
        throw new Error('Prediction rate limit cooldown');
      }

      const result = await this._executePythonWithCircuitBreaker({
        type: 'prediction',
        league: predictionRequest.league,
        prediction_type: predictionRequest.predictionType,
        input_data: predictionRequest.input_data,
        factors: predictionRequest.factors,
        clientId
      });

      await this.redis.set(`lastPrediction:${clientId}`, Date.now(), 'EX', 10); // 10-second TTL
      await this.cache.set(cacheKey, result, this.config.cache.ttl);
      this._storePredictionHistory(predictionRequest.league, result);

      const duration = (performance.now() - startTime) / 1000;
      if (prometheusMetrics.predictionLatency) {
        prometheusMetrics.predictionLatency.observe(duration);
      }
      if (prometheusMetrics.predictionsTotal) {
        prometheusMetrics.predictionsTotal.inc({
          league: predictionRequest.league,
          type: predictionRequest.predictionType
        });
      }

      this.metrics.recordAnalyticsMetrics({
        type: 'prediction',
        accuracy: result.accuracy || 0,
        confidence: result.confidenceScore || 0,
        duration,
        modelId: predictionRequest.league
      });

      return result;
    } catch (error) {
      logger.error('Prediction failed:', { 
        error: error.message, 
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'prediction' });
      }
      this._handleError(error);
      throw this._formatError(error);
    }
  }

  async _executePythonWithCircuitBreaker(data) {
    try {
      return await this.breaker.fire(() => PythonBridge.runPrediction(data, this.config.pythonScript));
    } catch (error) {
      logger.error('Python execution failed via circuit breaker:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      throw error;
    }
  }

  _validatePredictionRequest(request) {
    try {
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
        request.clientId = 'anonymous';
      }
    } catch (error) {
      logger.error('Validation failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      throw error;
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
    history.push({ timestamp: new Date(), prediction });

    if (history.length > 500) { // Reduced for memory efficiency
      history.shift();
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
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'batch_processing' });
      }
      this._handleError(error);
    }
  }

  async _processBatchForLeague(league, data) {
    try {
      const result = await this._executePythonWithCircuitBreaker({
        type: 'batch_process',
        league,
        data
      });

      this.websocketManager.broadcast(league, result);
      return result;
    } catch (error) {
      logger.error(`League batch processing error for ${league}:`, { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'batch_process' });
      }
      this._handleError(error);
      throw error;
    }
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
          activeConnections: this.websocketManager.server?.clients.size || 0,
          queueSize: this.streamingQueue.length,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        }
      };

      health.status = Object.values(health.components).every(status => status === 'healthy') ? 'healthy' : 'degraded';
      this.metrics.recordHealthStatus(health);
      return health;
    } catch (error) {
      logger.error('Health check failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
      return { status: 'unhealthy', timestamp: new Date().toISOString(), error: error.message };
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
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'database_health' });
      }
      this._handleError(error);
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
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'redis_health' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  async _checkPythonHealth() {
    try {
      const result = await this._executePythonWithCircuitBreaker({ type: 'health_check' });
      return result.status === 'ok' ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('Python health check failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'python_health_check' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  _checkWebSocketHealth() {
    try {
      return this.websocketManager.server?.isInitialized && !this.isShuttingDown ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('WebSocket health check failed:', { 
        error: error.message, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'websocket_health' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  async _checkCacheHealth() {
    try {
      if (!this.cache || !this.cache.has || !this.cache.set || !this.cache.get) {
        logger.error('Cache object is invalid or missing required methods', {
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        this._handleError(new Error('Invalid cache object'));
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
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'cache_health' });
      }
      this._handleError(error);
      return 'unhealthy';
    }
  }

  async cleanup() {
    try {
      this.isShuttingDown = true;
      logger.info('Starting graceful shutdown...', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });

      if (this.websocketManager.server) {
        for (const client of this.websocketManager.server.clients) {
          client.close(1000, 'Server shutting down');
        }
        await new Promise(resolve => this.websocketManager.server.close(resolve));
      }

      if (this.client) {
        await this.client.close(true);
        logger.info('MongoDB connection closed', { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
      }

      if (this.redis) {
        await this.redis.quit();
        logger.info('Redis connection closed', { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
      }

      if (this.cache) {
        await this.cache.clear();
        logger.info('Cache cleared', { 
          metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
      }

      this.streamingQueue = [];

      for (const interval of this.intervals) {
        clearInterval(interval);
      }

      if (global.gc) global.gc();

      if (this.metrics && typeof this.metrics.cleanup === 'function') {
        this.metrics.cleanup();
      }

      if (PythonBridge && typeof PythonBridge.shutdown === 'function') {
        await PythonBridge.shutdown();
      }

      this.memoryMonitor.stop();
      this.cpuMonitor.stop();

      logger.info('Cleanup completed successfully', { 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
    } catch (error) {
      logger.error('Cleanup failed:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      this._handleError(error);
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
      logger.error('Unhandled Rejection at:', { 
        promise, 
        reason: reason.message, 
        stack: reason.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'unhandled_rejection' });
      }
      this._handleError(reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
      });
      if (prometheusMetrics.predictionErrors) {
        prometheusMetrics.predictionErrors.inc({ type: 'uncaught_exception' });
      }
      this._handleError(error);
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
          this._handleError(error);
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
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  const numWorkers = parseInt(process.env.NODE_CLUSTER_WORKERS, 10) || Math.min(os.cpus().length, 2); // Reduced to prevent overload

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