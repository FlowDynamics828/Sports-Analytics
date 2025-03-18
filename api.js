// api.js

// Load environment variables
require('dotenv').config();

// Import required modules
const EventEmitter = require('events');
const path = require('path');
const winston = require('winston');
const { format } = winston;
const { MongoClient, ServerApiVersion } = require('mongodb');
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
const { DatabaseManager } = require('./utils/db');

// Helper function to format MongoDB URI
function getFormattedMongoURI() {
    const mongoUriEnv = process.env.MONGODB_URI;
    if (!mongoUriEnv) {
        console.error('MONGODB_URI environment variable is not set');
        return 'mongodb://localhost:27017/sports-analytics'; // Fallback URI
    }
    try {
        if (mongoUriEnv.includes('mongodb+srv://')) {
            const [prefix, rest] = mongoUriEnv.split('mongodb+srv://');
            const colonIndex = rest.indexOf(':');
            const atIndex = rest.indexOf('@');
            if (colonIndex === -1 || atIndex === -1) {
                console.error('Invalid MongoDB connection string format');
                return mongoUriEnv;
            }
            const username = rest.substring(0, colonIndex);
            const password = rest.substring(colonIndex + 1, atIndex);
            const hostAndParams = rest.substring(atIndex + 1);
            if (password.includes('@')) {
                const encodedPassword = password.replace('@', '%40');
                return `mongodb+srv://${username}:${encodedPassword}@${hostAndParams}`;
            }
        }
        return mongoUriEnv;
    } catch (error) {
        console.error('Error formatting MongoDB URI:', error);
        return mongoUriEnv;
    }
}

// Initialize global metrics
global.prometheusMetrics = global.prometheusMetrics || {};

// Lazy load PythonBridge to handle potential loading issues
let PythonBridge = null;
try {
    const fs = require('fs');
    const scriptPath = path.join(__dirname, 'scripts', 'predictive_model.py');
    const pythonEnabled = process.env.PYTHON_ENABLED !== 'false';

    if (!pythonEnabled) {
        console.warn('Python is disabled by configuration. Using fallback implementation.');
        throw new Error('Python is disabled by configuration');
    }

    if (!fs.existsSync(scriptPath)) {
        console.error(`Critical: Python script not found at expected path: ${scriptPath}`);
        try {
            const scriptsDir = path.dirname(scriptPath);
            if (!fs.existsSync(scriptsDir)) {
                fs.mkdirSync(scriptsDir, { recursive: true });
            }

            const basicScript = `# predictive_model.py - Basic implementation
import sys
import json
import time
from datetime import datetime

def main():
    """Main function to process input and generate predictions"""
    try:
        input_data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
        result = {
            "prediction": 0.75,
            "confidence": 0.85,
            "factors": ["historical_performance", "recent_form"],
            "timestamp": datetime.now().isoformat(),
            "league": input_data.get('league', 'unknown'),
            "type": input_data.get('prediction_type', 'unknown')
        }
        print(json.dumps(result))
    except Exception as e:
        error_result = {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()
`;
            fs.writeFileSync(scriptPath, basicScript);
            console.log(`Created basic Python script at: ${scriptPath}`);
        } catch (writeError) {
            console.error(`Failed to create Python script: ${writeError.message}`);
            throw new Error(`Failed to create Python script: ${writeError.message}`);
        }
    }

    PythonBridge = require('./utils/pythonBridge');
    console.log('PythonBridge module loaded successfully');
    console.log(`Python script verified at: ${scriptPath}`);
} catch (error) {
    console.error('Failed to load PythonBridge module:', error);
    PythonBridge = {
        runPrediction: async (data) => {
            console.warn('Using fallback PythonBridge implementation');
            const league = data.league || 'unknown';
            const predictionType = data.prediction_type || 'unknown';
            const mockPrediction = {
                prediction: Math.random() * 0.3 + 0.5,
                confidence: Math.random() * 0.2 + 0.7,
                factors: ["historical_performance", "recent_form", "team_strength"],
                timestamp: new Date().toISOString(),
                league: league,
                type: predictionType,
                fallback: true,
                message: 'Using fallback prediction (Python unavailable)'
            };
            return mockPrediction;
        },
        shutdown: async () => {
            console.log('Fallback PythonBridge shutdown called');
            return true;
        }
    };
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
            maxsize: 10000000,
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

if (!process.env.THESPORTSDB_API_KEY) {
    process.env.THESPORTSDB_API_KEY = '447279';
    logger.info('Using default TheSportsDB API key from configuration', {
        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
    });
}

// Initialize Prometheus metrics with detailed labels
const prometheusMetrics = {
    predictionLatency: new prometheus.Histogram({
        name: 'prediction_latency_seconds',
        help: 'Time spent processing predictions',
        labelNames: ['league', 'type']
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
        labelNames: ['type', 'reason']
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
    }),
    networkTraffic: new prometheus.Counter({
        name: 'network_traffic_bytes',
        help: 'Network traffic in bytes',
        labelNames: ['direction']
    })
};

// Memory monitoring class with optimization and detailed reporting
class MemoryMonitor {
    constructor(threshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80) {
        this.threshold = threshold;
        this.interval = null;
        this.history = [];
        this.lastCleanupTime = Date.now();
        this.consecutiveHighUsage = 0;
        this.isRunning = false;
        this.lastGcTime = 0;
        this.gcInterval = 60000;

        if (global.gc) {
            global.gc();
            this.lastGcTime = Date.now();
            logger.info('Initial garbage collection performed during startup');
        }
    }

    start(checkInterval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10) || 60000) {
        if (this.interval || this.isRunning) {
            this.stop();
        }

        this.isRunning = true;
        logger.info(`Starting memory monitor with threshold ${this.threshold * 100}% and interval ${checkInterval/1000} seconds`);

        this.checkMemory();
        this.interval = setInterval(() => this.checkMemory(), checkInterval);
        return this;
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        return this;
    }

    checkMemory() {
        if (!this.isRunning) {
            return 0;
        }

        try {
            const memoryUsage = process.memoryUsage();
            const usedHeapPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
            const usedHeapMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
            const totalHeapMB = Math.round(memoryUsage.heapTotal / (1024 * 1024));
            const percentageFormatted = Math.round(usedHeapPercentage * 100);
            const rssMB = Math.round(memoryUsage.rss / (1024 * 1024));

            logger.info(`Memory usage: ${percentageFormatted}% (${usedHeapMB}MB / ${totalHeapMB}MB), RSS: ${rssMB}MB`);

            this.history.push({
                timestamp: new Date().toISOString(),
                heapUsed: usedHeapMB,
                heapTotal: totalHeapMB,
                rss: rssMB,
                percentage: percentageFormatted
            });

            if (this.history.length > 10) {
                this.history = this.history.slice(-10);
            }

            const now = Date.now();
            if (global.gc && (now - this.lastGcTime > this.gcInterval)) {
                global.gc();
                this.lastGcTime = now;
                logger.info('Periodic garbage collection performed');
            }

            if (usedHeapPercentage > this.threshold) {
                this.consecutiveHighUsage++;
                const message = `High memory usage detected: ${percentageFormatted}% of heap used (occurrence ${this.consecutiveHighUsage})`;
                logger.warn(message, {
                    heapUsed: usedHeapMB + 'MB',
                    heapTotal: totalHeapMB + 'MB',
                    rss: rssMB + 'MB',
                    metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
                });

                if (usedHeapPercentage > 0.85) {
                    this._performCriticalCleanup(usedHeapPercentage);
                } else if (this.consecutiveHighUsage > 2 || usedHeapPercentage > 0.8) {
                    this._performAggressiveCleanup(usedHeapPercentage);
                } else {
                    this._performStandardCleanup(usedHeapPercentage);
                }
            } else {
                if (this.consecutiveHighUsage > 0) {
                    this.consecutiveHighUsage = 0;
                }
            }

            if (prometheusMetrics && prometheusMetrics.memoryUsage) {
                prometheusMetrics.memoryUsage.set(memoryUsage.heapUsed);
            }

            return usedHeapPercentage;
        } catch (error) {
            logger.error('Error in memory check:', {
                error: error.message,
                stack: error.stack,
                metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
            });
            return 0;
        }
    }

    _performStandardCleanup(usagePercentage) {
        logger.info('Performing standard memory cleanup', {
            usagePercentage: Math.round(usagePercentage * 100) + '%',
            metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
        });

        this.history = this.history.slice(-5);
        if (global.gc) {
            global.gc();
            this.lastGcTime = Date.now();
        }
    }

    _performAggressiveCleanup(usagePercentage) {
        logger.warn('Performing aggressive memory cleanup', {
            usagePercentage: Math.round(usagePercentage * 100) + '%',
            metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
        });

        this.history = [];
        try {
            const moduleCache = require.cache;
            const essentialModules = [
                'fs', 'path', 'os', 'util', 'events', 'stream',
                'http', 'https', 'net', 'crypto', 'zlib', 'buffer',
                'querystring', 'url', 'domain', 'dns', 'dgram',
                'child_process', 'cluster', 'module', 'process',
                'readline', 'repl', 'tty', 'string_decoder', 'timers',
                'tls', 'vm'
            ];
            const pythonModules = ['pythonBridge'];

            let clearedCount = 0;
            for (const moduleId in moduleCache) {
                if (essentialModules.some(name => moduleId.includes(`/node_modules/${name}/`)) ||
                    pythonModules.some(name => moduleId.includes(name))) {
                    continue;
                }
                if (!moduleId.includes('node_modules') && !moduleId.includes(process.cwd())) {
                    continue;
                }
                delete moduleCache[moduleId];
                clearedCount++;
            }
            if (clearedCount > 0) {
                logger.info(`Cleared ${clearedCount} modules from cache during aggressive cleanup`);
            }
        } catch (error) {
            logger.warn(`Error clearing module cache: ${error.message}`);
        }

        if (global.gc) {
            global.gc();
            this.lastGcTime = Date.now();
            setTimeout(() => {
                if (global.gc) {
                    global.gc();
                    logger.info('Second garbage collection completed');
                }
            }, 1000);
        }
        this.consecutiveHighUsage = 0;
    }

    _performCriticalCleanup(usagePercentage) {
        logger.error('Performing critical memory cleanup', {
            usagePercentage: Math.round(usagePercentage * 100) + '%',
            metadata: { service: 'memory-monitor', timestamp: new Date().toISOString() }
        });

        if (global.cache && typeof global.cache.clear === 'function') {
            global.cache.clear();
            logger.info('Cleared global cache');
        }
        this.history = [];

        try {
            const moduleCache = require.cache;
            const criticalModules = [
                'fs', 'path', 'os', 'http', 'https', 'net', 'events'
            ];
            const pythonModules = ['pythonBridge'];
            let clearedCount = 0;

            for (const moduleId in moduleCache) {
                if (criticalModules.some(name => moduleId.includes(`/node_modules/${name}/`)) ||
                    pythonModules.some(name => moduleId.includes(name))) {
                    continue;
                }
                delete moduleCache[moduleId];
                clearedCount++;
            }
            if (clearedCount > 0) {
                logger.info(`Cleared ${clearedCount} modules from cache during critical cleanup`);
            }
        } catch (error) {
            logger.warn(`Error clearing module cache: ${error.message}`);
        }

        if (global.gc) {
            global.gc();
            setTimeout(() => {
                if (global.gc) {
                    global.gc();
                    setTimeout(() => {
                        if (global.gc) {
                            global.gc();
                            logger.info('Third garbage collection completed');
                        }
                    }, 1000);
                }
            }, 1000);
        }
        this.consecutiveHighUsage = 0;

        setTimeout(() => {
            try {
                const memoryUsage = process.memoryUsage();
                const usedHeapMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
                const totalHeapMB = Math.round(memoryUsage.heapTotal / (1024 * 1024));
                const percentageFormatted = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
                logger.info(`Memory after critical cleanup: ${percentageFormatted}% (${usedHeapMB}MB / ${totalHeapMB}MB)`);
            } catch (error) {
                logger.error(`Error getting memory stats after cleanup: ${error.message}`);
            }
        }, 3000);
    }

    getHistory() {
        return [...this.history];
    }
}

// CPU monitoring class with detailed metrics
class CPUMonitor {
    constructor(threshold = parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80) {
        this.threshold = threshold;
        this.interval = null;
        this.history = [];
    }

    start(checkInterval = 300000) {
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
        this.history.push({ 
            timestamp: new Date().toISOString(), 
            load: totalLoad 
        });

        if (this.history.length > 100) {
            this.history.shift();
        }

        if (totalLoad > this.threshold) {
            logger.warn(`High CPU load detected: ${totalLoad * 100}%`, {
                history: this.history.slice(-5),
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
        }
        if (prometheusMetrics.cpuLoad) {
            prometheusMetrics.cpuLoad.set(totalLoad * 100);
        }
        return totalLoad;
    }

    getHistory() {
        return this.history;
    }
}

// Connection pool manager with detailed tracking
class ConnectionPoolManager {
    constructor() {
        this.connections = new Map();
        this.history = [];
    }

    getConnection(id) {
        return this.connections.get(id);
    }

    addConnection(id, connection) {
        this.connections.set(id, { connection, lastUsed: Date.now() });
        this.history.push({ 
            timestamp: new Date().toISOString(), 
            action: 'add', 
            id 
        });
        if (this.history.length > 100) {
            this.history.shift();
        }
    }

    removeConnection(id) {
        this.connections.delete(id);
        this.history.push({ 
            timestamp: new Date().toISOString(), 
            action: 'remove', 
            id 
        });
        if (this.history.length > 100) {
            this.history.shift();
        }
    }

    cleanup(maxIdleTime = 3600000) {
        const now = Date.now();
        for (const [id, info] of this.connections) {
            if (now - info.lastUsed > maxIdleTime) this.removeConnection(id);
        }
    }

    getHistory() {
        return this.history;
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
            modelUpdateInterval: parseInt(process.env.MODEL_UPDATE_INTERVAL, 10) || 1209600000,
            websocket: {
                port: parseInt(process.env.WS_PORT, 10) || 5150
            },
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT, 10) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true',
                retryStrategy: function(times) {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                connectionName: 'predictive-model',
                connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
                showFriendlyErrorStack: true,
                maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3
            },
            cache: {
                ttl: parseInt(process.env.CACHE_TTL, 10) || 1800,
                max: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 500,
                checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 300
            },
            circuitBreaker: {
                timeout: parseInt(process.env.PREDICTION_TIMEOUT, 10) || 45000,
                errorThresholdPercentage: 50,
                resetTimeout: 30000,
                rollingCountTimeout: 10000
            },
            rateLimit: {
                windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
                max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 50
            },
            streaming: {
                batchSize: 50,
                interval: 5000,
                maxQueueSize: 500
            },
            monitoring: {
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 300000,
                metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 300000
            },
            alertThresholds: {
                memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80,
                cpuLoad: parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80,
                networkTraffic: parseInt(process.env.NETWORK_TRAFFIC_THRESHOLD, 10) || 52428800
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

        this.metrics = null;
        this.initializeMetrics().catch(error => {
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
        });

        const memoryThreshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || this.config.alertThresholds.memoryUsage || 0.65;
        const cpuThreshold = parseFloat(process.env.CPU_LOAD_THRESHOLD) || this.config.alertThresholds.cpuLoad || 0.95;
        const memoryCheckInterval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10) || 60000;

        this.memoryMonitor = new MemoryMonitor(memoryThreshold);
        this.cpuMonitor = new CPUMonitor(cpuThreshold);

        if (process.env.ENABLE_AGGRESSIVE_GC === 'true') {
            logger.info(`Starting memory monitor with threshold ${memoryThreshold * 100}% and interval ${memoryCheckInterval/1000} seconds`);
            this.memoryMonitor.start(memoryCheckInterval);
            this.cpuMonitor.start(memoryCheckInterval);
        } else {
            logger.info('Aggressive GC is disabled, memory and CPU monitors will not be started');
        }

        this.connectionPool = new ConnectionPoolManager();
        this.intervals = [];
        this.cache = new CacheManager({
            stdTTL: this.config.cache.ttl,
            checkperiod: this.config.cache.checkPeriod,
            maxKeys: this.config.cache.max
        });

        const combinedCleanupInterval = setInterval(() => {
            this.connectionPool.cleanup();
            this.cache.clear().catch(error => logger.warn('Cache cleanup failed:', {
                error: error.message,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            }));
        }, 15 * 60 * 1000);
        this.intervals.push(combinedCleanupInterval);

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
            this.cleanup().finally(() => process.exit(1));
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', { 
                error: error.message, 
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            this.cleanup().finally(() => process.exit(1));
        });
    }

    async initializeMetrics() {
        if (!this.metrics) {
            this.metrics = await MetricsManager.getInstance({
                logLevel: this.config.logLevel,
                alertThresholds: this.config.alertThresholds
            });
        }
        return this.metrics;
    }

    _handleError(error) {
        logger.error('Error handled:', { 
            error: error.message, 
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, 
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
        });
        if (prometheusMetrics.predictionErrors) {
            prometheusMetrics.predictionErrors.inc({ type: 'general_error', reason: error.name || 'unknown' });
        }
        this.emit('error:handled', error);
    }

    async _initializeComponents() {
        try {
            let redisInitialized = false;
            if (!global.redisClient) {
                try {
                    const redisPort = this.config.redis.port;
                    const redisHost = this.config.redis.host;
                    logger.info(`Attempting to connect to Redis at ${redisHost}:${redisPort}`, {
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });

                    global.redisClient = new Redis({
                        host: redisHost,
                        port: redisPort,
                        password: this.config.redis.password,
                        enableOfflineQueue: this.config.redis.enableOfflineQueue,
                        retryStrategy: function(times) {
                            const delay = Math.min(times * 50, 2000);
                            return delay;
                        },
                        connectionName: this.config.redis.connectionName,
                        connectTimeout: this.config.redis.connectTimeout,
                        showFriendlyErrorStack: this.config.redis.showFriendlyErrorStack,
                        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
                        disconnectTimeout: 5000
                    });

                    global.redisClient.on('connect', () => {
                        logger.info('Redis connection established', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        redisInitialized = true;
                    });

                    global.redisClient.on('error', (error) => {
                        logger.error('Redis connection error:', {
                            error: error.message,
                            stack: error.stack,
                            connectionState: global.redisClient.status || 'unknown',
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        this._handleError(error);
                        if (this.metrics && typeof this.metrics.recordEvent === 'function') {
                            try {
                                this.metrics.recordEvent({
                                    type: 'redis',
                                    name: 'connection_error',
                                    value: {
                                        message: error.message,
                                        connectionState: global.redisClient.status || 'unknown'
                                    },
                                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                                });
                            } catch (metricsError) {
                                logger.debug('Failed to record Redis error metrics:', {
                                    error: metricsError.message,
                                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                                });
                            }
                        }
                    });

                    global.redisClient.on('close', () => {
                        logger.warn('Redis connection closed unexpectedly', {
                            connectionState: global.redisClient.status || 'unknown',
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        if (!this.isShuttingDown && global.redisClient) {
                            logger.info('Attempting to reconnect to Redis after unexpected close', {
                                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                            });
                            if (global.redisClient.status !== 'reconnecting') {
                                try {
                                    global.redisClient.connect().catch(error => {
                                        logger.warn('Redis reconnection attempt failed:', {
                                            error: error.message,
                                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                                        });
                                    });
                                } catch (error) {
                                    logger.warn('Error initiating Redis reconnection:', {
                                        error: error.message,
                                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                                    });
                                }
                            }
                        }
                    });

                    global.redisClient.on('ready', () => {
                        logger.info('Redis connection ready', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                    });

                    global.redisClient.on('reconnecting', () => {
                        logger.info('Redis attempting to reconnect', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                    });

                    global.redisClient.on('end', () => {
                        logger.info('Redis connection ended', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                    });

                    await Promise.race([
                        new Promise(resolve => global.redisClient.once('ready', resolve)),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Redis connection timeout')),
                            this.config.redis.connectTimeout || 10000)
                        )
                    ]);
                } catch (redisError) {
                    logger.error('Failed to initialize Redis client:', {
                        error: redisError.message,
                        stack: redisError.stack,
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                    if (global.redisClient) {
                        try {
                            global.redisClient.disconnect();
                        } catch (disconnectError) {
                            logger.warn('Error disconnecting Redis client:', {
                                error: disconnectError.message,
                                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                            });
                        }
                        global.redisClient = null;
                    }
                }
            } else {
                if (global.redisClient.status === 'ready') {
                    redisInitialized = true;
                } else {
                    logger.warn(`Existing Redis client in ${global.redisClient.status} state`, {
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                }
            }

            this.redis = global.redisClient;
            if (!redisInitialized) {
                logger.warn('Redis initialization failed, system will operate with limited functionality', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
            }

            try {
                await this.cache.initialize(this.redis);
                logger.info('Cache system initialized successfully', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
            } catch (cacheError) {
                logger.warn('Cache initialization failed, using minimal in-memory cache:', {
                    error: cacheError.message,
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                if (!this.cache.initialized) {
                    await this.cache.initialize(null);
                }
            }

            const uri = "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

            this.dbManager = new DatabaseManager({
                uri: getFormattedMongoURI(),
                name: this.config.dbName,
                options: {
                    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
                    minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 10,
                    connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
                    socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
                    serverSelectionTimeoutMS: 5000,
                    heartbeatFrequencyMS: 30000,
                    maxIdleTimeMS: 60000,
                    retryWrites: true,
                    retryReads: true,
                    serverApi: { version: '1', strict: true, deprecationErrors: true }
                }
            });

            const maxDbRetries = 3;
            let dbInitialized = false;
            for (let attempt = 1; attempt <= maxDbRetries; attempt++) {
                try {
                    if (!this.dbManager) {
                        throw new Error('Database manager is not properly initialized');
                    }
                    await this.dbManager.initialize();
                    if (!this.dbManager.client) {
                        throw new Error('Database client is null after initialization');
                    }
                    this.client = this.dbManager.client;
                    this.db = this.dbManager.client.db(this.config.dbName);
                    if (!this.db) {
                        throw new Error('Database reference is null after initialization');
                    }
                    await this.db.command({ ping: 1 });
                    logger.info('MongoDB connection established and verified with retry', {
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString(), attempt }
                    });
                    dbInitialized = true;
                    break;
                } catch (error) {
                    logger.warn(`Database initialization attempt ${attempt} failed, retrying...`, {
                        error: error.message,
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                    if (this.client) {
                        try {
                            await this.client.close();
                        } catch (closeError) {
                            logger.warn('Error closing partial database connection:', {
                                error: closeError.message,
                                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                            });
                        }
                        this.client = null;
                        this.db = null;
                    }
                    if (attempt === maxDbRetries) {
                        logger.error('Failed to initialize database after retries:', {
                            error: error.message,
                            stack: error.stack,
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        logger.info('Setting up in-memory fallback for database operations', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        this._handleError(error);
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                    }
                }
            }

            if (!dbInitialized) {
                logger.warn('Using in-memory fallbacks for database operations', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                this._setupInMemoryFallbacks();
            }

            // Fix 1: WebSocket Initialization Fix - Create HTTP server and attach WebSocket server properly
            const app = express();
            app.use(express.json({ limit: '25mb' }));
            app.use(express.urlencoded({ extended: true, limit: '25mb' }));
            const server = http.createServer(app);

            const port = parseInt(process.env.PORT, 10) || 5050;
            const wsServer = new WebSocket.Server({ server }); // Attach WebSocket server to HTTP server
            this.wsServer = wsServer;

            // Initialize WebSocketManager first
            const WebSocketManager = require('./utils/websocketManager');
            this.websocketManager = new WebSocketManager(wsServer);
            await this.websocketManager.initialize();
            logger.info('WebSocket server initialized successfully', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            // Set up CORS and other middleware
            app.use((req, res, next) => {
                const origin = req.headers.origin;
                if (origin === process.env.CORS_ORIGIN || process.env.NODE_ENV === 'development') {
                    res.header('Access-Control-Allow-Origin', origin);
                    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
                    res.header('Access-Control-Allow-Credentials', 'true');
                }
                next();
            });

            // Fix 2: Static File Serving Fix - Serve static files and handle frontend routing
            const publicPath = path.join(__dirname, 'public'); // Or your build directory
            app.use(express.static(publicPath));
            // API routes (assuming apiRoutes is defined elsewhere, add if needed)
            // app.use('/api', apiRoutes);
            // Handle all other requests by serving the main frontend page
            app.get('*', (req, res) => {
                res.sendFile(path.join(publicPath, 'index.html'));
            });

            const serverListening = new Promise((resolve, reject) => {
                server.listen(port, () => {
                    logger.info(`Server listening on port ${port}`, {
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                    resolve();
                });
                
                server.on('error', (error) => {
                    logger.error('Server failed to start:', {
                        error: error.message,
                        stack: error.stack,
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                    reject(error);
                });
            });

            try {
                await serverListening;
                logger.info(`Server initialized successfully on port ${port}`, {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });

                this.config.port = port;
                this.httpServer = server;

                try {
                    const rateLimiterModule = require('./utils/rateLimiter');
                    if (!rateLimiterModule || typeof rateLimiterModule.checkLimit !== 'function') {
                        logger.error('Rate limiter module is invalid or missing checkLimit, using in-memory fallback', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        this.rateLimiter = {
                            checkLimit: async (key) => {
                                const now = Date.now();
                                const userLimits = (this.rateLimiter.limits || new Map()).get(key) || [];
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
                            const userLimits = (this.rateLimiter.limits || new Map()).get(key) || [];
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
            if (this.dbManager && this.dbManager.client) {
                return;
            }
            throw new Error('Database not initialized via DatabaseManager');
        } catch (error) {
            logger.error('Database initialization failed:', { 
                error: error.message, 
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'database_init', reason: error.name || 'unknown' });
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

        if (process.env.ENABLE_AGGRESSIVE_GC !== 'true') {
            const memoryMonitoringInterval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10) || 900000;
            setInterval(() => {
                try {
                    const usage = process.memoryUsage();
                    if (prometheusMetrics && prometheusMetrics.memoryUsage) {
                        prometheusMetrics.memoryUsage.set(usage.heapUsed);
                    }
                    const memoryRatio = usage.heapUsed / usage.heapTotal;
                    const usedHeapMB = Math.round(usage.heapUsed / (1024 * 1024));
                    const totalHeapMB = Math.round(usage.heapTotal / (1024 * 1024));
                    const percentageFormatted = Math.round(memoryRatio * 100);
                    logger.debug(`Memory usage: ${percentageFormatted}% (${usedHeapMB}MB / ${totalHeapMB}MB)`);
                    const memoryThreshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.95;
                    if (memoryRatio > memoryThreshold) {
                        logger.warn('Critical memory usage detected:', {
                            usage: {
                                heapUsed: usedHeapMB + ' MB',
                                heapTotal: totalHeapMB + ' MB',
                                percentage: percentageFormatted + '%'
                            },
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        if (global.gc) {
                            global.gc();
                            logger.info('Garbage collection triggered due to critical memory usage', {
                                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                            });
                        }
                    }
                    if (this.metrics) {
                        this.metrics.recordMemoryUsage();
                    }
                } catch (error) {
                    logger.error('Memory monitoring error:', { 
                        error: error.message, 
                        stack: error.stack, 
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
                    });
                    this._handleError(error);
                }
            }, memoryMonitoringInterval);
            logger.info(`Simple memory monitoring initialized with interval ${memoryMonitoringInterval/1000} seconds`);
        }
    }

    _collectMetrics() {
        try {
            const prometheusMetrics = global.prometheusMetrics || {};
            for (const league of this.SUPPORTED_LEAGUES) {
                const leagueMetrics = this.modelMetrics.get(league);
                if (leagueMetrics && prometheusMetrics.modelAccuracy) {
                    prometheusMetrics.modelAccuracy.set({ league }, leagueMetrics.accuracy || 0);
                }
            }

            if (prometheusMetrics.activeConnections && this.websocketManager && this.websocketManager.server) {
                prometheusMetrics.activeConnections.set(this.websocketManager.server.clients.size);
            }

            if (prometheusMetrics.memoryUsage) {
                const memUsage = process.memoryUsage();
                prometheusMetrics.memoryUsage.set(memUsage.heapUsed);
            }

            if (prometheusMetrics.cpuLoad && this.cpuMonitor) {
                const cpuLoad = this.cpuMonitor.checkCPU();
                prometheusMetrics.cpuLoad.set(cpuLoad * 100);
            }

            if (prometheusMetrics.networkTraffic) {
                const networkStats = os.networkInterfaces();
                Object.values(networkStats).forEach(iface => {
                    iface.forEach(stat => {
                        if (stat.traffic) {
                            prometheusMetrics.networkTraffic.inc({ direction: 'in' }, stat.traffic.in);
                            prometheusMetrics.networkTraffic.inc({ direction: 'out' }, stat.traffic.out);
                        }
                    });
                });
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

            this._validatePredictionRequest(predictionRequest);
            const cacheKey = this._generateCacheKey(predictionRequest);
            const cachedResult = await this.cache.get(cacheKey);
            if (cachedResult) {
                return cachedResult;
            }
            const lastPrediction = await this.redis.get(`lastPrediction:${clientId}`);
            if (lastPrediction && (Date.now() - parseInt(lastPrediction)) < 1000) {
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

            await this.redis.set(`lastPrediction:${clientId}`, Date.now(), 'EX', 10);
            await this.cache.set(cacheKey, result, this.config.cache.ttl);
            this._storePredictionHistory(predictionRequest.league, result);

            const duration = (performance.now() - startTime) / 1000;
            if (prometheusMetrics.predictionLatency) {
                prometheusMetrics.predictionLatency.observe({ league: predictionRequest.league, type: predictionRequest.predictionType }, duration);
            }
            if (prometheusMetrics.predictionsTotal) {
                prometheusMetrics.predictionsTotal.inc({
                    league: predictionRequest.league,
                    type: predictionRequest.predictionType
                });
            }

            if (this.metrics) {
                this.metrics.recordAnalyticsMetrics({
                    type: 'prediction',
                    accuracy: result.accuracy || 0,
                    confidence: result.confidenceScore || 0,
                    duration,
                    modelId: predictionRequest.league
                });
            }
            return result;
        } catch (error) {
            logger.error('Prediction failed:', { 
                error: error.message, 
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'prediction', reason: error.name || 'unknown' });
            }
            this._handleError(error);
            throw this._formatError(error);
        }
    }

    async _executePythonWithCircuitBreaker(data) {
        try {
            return await this.breaker.fire(async () => {
                return await this._executePython(data);
            });
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
        if (history.length > 500) {
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
                prometheusMetrics.predictionErrors.inc({ type: 'batch_processing', reason: error.name || 'unknown' });
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

            if (this.websocketManager) {
                if (typeof this.websocketManager.broadcast === 'function') {
                    this.websocketManager.broadcast(league, result);
                } else if (this.websocketManager.server && this.websocketManager.server.clients) {
                    logger.info(`Using fallback broadcast for league ${league}`, {
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                    const message = JSON.stringify({
                        type: 'broadcast',
                        channel: league,
                        data: result,
                        timestamp: Date.now()
                    });
                    this.websocketManager.server.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN &&
                            (!client.subscribedLeagues || client.subscribedLeagues.includes(league))) {
                            client.send(message);
                        }
                    });
                } else {
                    logger.warn(`Cannot broadcast results for league ${league}: websocketManager.broadcast not available`, {
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                }
            } else {
                logger.warn(`Cannot broadcast results for league ${league}: websocketManager not available`, {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
            }
            return result;
        } catch (error) {
            logger.error(`League batch processing error for ${league}:`, { 
                error: error.message, 
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'batch_process', reason: error.name || 'unknown' });
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
                    uptime: process.uptime(),
                    cpuLoad: this.cpuMonitor.checkCPU(),
                    memoryHistory: this.memoryMonitor.getHistory(),
                    cpuHistory: this.cpuMonitor.getHistory(),
                    connectionHistory: this.connectionPool.getHistory()
                }
            };

            health.status = Object.values(health.components).every(
                status => status === 'healthy'
            ) ? 'healthy' : 'degraded';

            if (this.metrics) {
                this.metrics.recordHealthStatus(health);
            }
            return health;
        } catch (error) {
            logger.error('Health check failed:', { 
                error: error.message, 
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            this._handleError(error);
            return { 
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    async _checkDatabaseHealth() {
        try {
            if (!this.dbManager) return 'unhealthy';
            const health = await this.dbManager.healthCheck();
            return health.status;
        } catch (error) {
            logger.error('Database health check failed:', { 
                error: error.message, 
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'database_health', reason: error.name || 'unknown' });
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
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'redis_health', reason: error.name || 'unknown' });
            }
            this._handleError(error);
            return 'unhealthy';
        }
    }

    async _checkPythonHealth() {
        try {
            try {
                const fs = require('fs');
                const pythonScriptPath = path.resolve(process.cwd(), 'scripts', this.config.pythonScript);
                if (!fs.existsSync(pythonScriptPath)) {
                    logger.warn(`Python script not found at ${pythonScriptPath}`, {
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                    return 'unhealthy';
                }

                const { spawn } = require('child_process');
                const pythonProcess = spawn(process.env.PYTHON_PATH || 'python', ['-c', 'print("healthy")']);
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
            }

            const healthCheckData = {
                type: 'health_check',
                timestamp: new Date().toISOString(),
                data: {
                    command: 'status'
                }
            };

            if (this.breaker && this.breaker.opened) {
                logger.warn('Circuit breaker is open, Python health check failed', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                return 'unhealthy';
            }

            try {
                const result = await this._executePythonWithCircuitBreaker(healthCheckData);
                return result && result.status === 'ok' ? 'healthy' : 'unhealthy';
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
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'python_health', reason: error.name || 'unknown' });
            }
            this._handleError(error);
            return 'unhealthy';
        }
    }

    _checkWebSocketHealth() {
        try {
            if (this.websocketManager && this.websocketManager.server) {
                const clientCount = this.websocketManager.server.clients.size;
                logger.debug(`WebSocket server is running with ${clientCount} clients`, {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                return 'healthy';
            }
            logger.warn('WebSocket server not initialized', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            return 'unhealthy';
        } catch (error) {
            logger.error('WebSocket health check failed:', {
                error: error.message,
                stack: error.stack,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'websocket_health', reason: error.name || 'unknown' });
            }
            this._handleError(error);
            return 'unhealthy';
        }
    }

    async _checkCacheHealth() {
        try {
            if (!this.cache || !this.cache.initialized) {
                return 'unhealthy';
            }
            const testKey = `healthcheck:${Date.now()}`;
            await this.cache.set(testKey, { status: 'ok' }, 10);
            const result = await this.cache.get(testKey);
            return result && result.status === 'ok' ? 'healthy' : 'unhealthy';
        } catch (error) {
            logger.error('Cache health check failed:', {
                error: error.message,
                stack: error.stack,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'cache_health', reason: error.name || 'unknown' });
            }
            this._handleError(error);
            return 'unhealthy';
        }
    }

    _setupInMemoryFallbacks() {
        this.db = {
            collection: () => ({
                find: () => ({
                    toArray: async () => [],
                }),
                insertOne: async () => ({ insertedId: 'mocked-id' }),
                updateOne: async () => ({ modifiedCount: 1 }),
                deleteOne: async () => ({ deletedCount: 1 }),
            }),
        };
        this.client = {
            close: async () => true,
        };
        logger.info('In-memory database fallbacks set up', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
    }

    _setupEventHandlers() {
        if (this.websocketManager && this.websocketManager.server) {
            this.websocketManager.server.on('connection', (ws, req) => {
                const clientId = req.headers['client-id'] || 'anonymous';
                ws.clientId = clientId;
                this.connectionPool.addConnection(clientId, ws);
                if (prometheusMetrics.activeConnections) {
                    prometheusMetrics.activeConnections.inc();
                }
                if (this.metrics && this.metrics.activeConnections) {
                    this.metrics.activeConnections.inc();
                }

                ws.on('message', async (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        if (data.type === 'subscribe') {
                            ws.subscribedLeagues = data.leagues || [];
                            logger.info(`Client ${clientId} subscribed to leagues: ${ws.subscribedLeagues.join(', ')}`, {
                                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                            });
                        } else if (data.type === 'prediction') {
                            const predictionRequest = {
                                league: data.league,
                                predictionType: data.predictionType,
                                input_data: data.input_data,
                                factors: data.factors,
                                clientId,
                            };
                            const result = await this.predict(predictionRequest);
                            ws.send(JSON.stringify({ type: 'prediction_result', data: result }));
                        }
                    } catch (error) {
                        logger.error('WebSocket message processing error:', {
                            error: error.message,
                            stack: error.stack,
                            clientId,
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        if (prometheusMetrics.predictionErrors) {
                            prometheusMetrics.predictionErrors.inc({ type: 'websocket_message', reason: error.name || 'unknown' });
                        }
                        this._handleError(error);
                        ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    }
                });

                ws.on('close', () => {
                    this.connectionPool.removeConnection(clientId);
                    if (prometheusMetrics.activeConnections) {
                        prometheusMetrics.activeConnections.dec();
                    }
                    if (this.metrics && this.metrics.activeConnections) {
                        this.metrics.activeConnections.dec();
                    }
                });

                ws.on('error', (error) => {
                    logger.error('WebSocket client error:', {
                        error: error.message,
                        stack: error.stack,
                        clientId,
                        metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                    });
                    if (prometheusMetrics.predictionErrors) {
                        prometheusMetrics.predictionErrors.inc({ type: 'websocket_client', reason: error.name || 'unknown' });
                    }
                    this._handleError(error);
                });
            });

            this.websocketManager.server.on('error', (error) => {
                logger.error('WebSocket server error:', {
                    error: error.message,
                    stack: error.stack,
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                if (prometheusMetrics.predictionErrors) {
                    prometheusMetrics.predictionErrors.inc({ type: 'websocket_server', reason: error.name || 'unknown' });
                }
                this._handleError(error);
            });
        }
    }

    _formatError(error) {
        return {
            message: error.message || 'An unexpected error occurred',
            code: error.code || 'UNKNOWN_ERROR',
            timestamp: new Date().toISOString(),
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        };
    }

    async cleanupRedis() {
        try {
            if (this.redis) {
                this.redis.removeAllListeners();
                await this.redis.quit();
            }
            logger.info('Redis cleanup completed successfully', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
        } catch (error) {
            logger.error('Redis cleanup failed:', {
                error: error.message,
                stack: error.stack,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            this._handleError(error);
            try {
                if (this.redis) {
                    await this.redis.disconnect();
                }
                logger.info('Forced Redis disconnect after cleanup failure', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
            } catch (disconnectError) {
                logger.warn('Failed to force disconnect Redis:', {
                    error: disconnectError.message,
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
            }
        } finally {
            this.redis = null;
            global.redisClient = null;
        }
    }

    async cleanup() {
        this.isShuttingDown = true;
        logger.info('Initiating cleanup process', {
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });

        try {
            this.intervals.forEach(interval => clearInterval(interval));
            this.intervals = [];
            logger.info('Cleared all intervals', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            if (this.memoryMonitor) this.memoryMonitor.stop();
            if (this.cpuMonitor) this.cpuMonitor.stop();
            logger.info('Stopped memory and CPU monitors', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            if (this.websocketManager && this.websocketManager.server) {
                await new Promise(resolve => {
                    this.websocketManager.server.close(() => {
                        logger.info('WebSocket server closed', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        resolve();
                    });
                });
            }

            if (this.httpServer) {
                await new Promise(resolve => {
                    this.httpServer.close(() => {
                        logger.info('HTTP server closed', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        resolve();
                    });
                });
            }

            if (this.wsServer) {
                await new Promise(resolve => {
                    this.wsServer.close(() => {
                        logger.info('WebSocket-specific server closed', {
                            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                        });
                        resolve();
                    });
                });
            }

            await this.cleanupRedis();

            if (this.dbManager && this.dbManager.client) {
                await this.dbManager.shutdown();
                logger.info('MongoDB connection closed', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
            }

            if (PythonBridge && typeof PythonBridge.shutdown === 'function') {
                await PythonBridge.shutdown();
                logger.info('Python bridge shutdown completed', {
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
            this.xgbModels.clear();
            this.lgbModels.clear();

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
        } finally {
            this.isShuttingDown = false;
        }
    }

    async trainModel(league, trainingData) {
        try {
            if (!this.SUPPORTED_LEAGUES.includes(league)) {
                throw new Error(`Unsupported league: ${league}`);
            }
            if (!trainingData || !Array.isArray(trainingData) || trainingData.length === 0) {
                throw new Error('Invalid training data');
            }

            const result = await this._executePythonWithCircuitBreaker({
                type: 'train_model',
                league,
                training_data: trainingData
            });

            this.modelCache.set(league, result.model);
            this.lastTrainingTime.set(league, Date.now());
            this.modelMetrics.set(league, {
                accuracy: result.accuracy || 0,
                lastUpdated: new Date().toISOString()
            });
            if (prometheusMetrics.modelAccuracy) {
                prometheusMetrics.modelAccuracy.set({ league }, result.accuracy || 0);
            }

            logger.info(`Model trained successfully for ${league}`, {
                accuracy: result.accuracy,
                league,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });

            return result;
        } catch (error) {
            logger.error('Model training failed:', {
                error: error.message,
                stack: error.stack,
                league,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'training', reason: error.name || 'unknown' });
            }
            this._handleError(error);
            throw this._formatError(error);
        }
    }

    addToStreamingQueue(data) {
        if (this.isShuttingDown) {
            logger.warn('Cannot add to streaming queue during shutdown', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            return false;
        }

        if (this.streamingQueue.length >= this.config.streaming.maxQueueSize) {
            logger.warn('Streaming queue full, dropping data', {
                queueSize: this.streamingQueue.length,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            return false;
        }

        this.streamingQueue.push(data);
        logger.debug('Added to streaming queue', {
            queueSize: this.streamingQueue.length,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
        return true;
    }

    // Adding the missing _executePython method
    async _executePython(data) {
        try {
            if (!PythonBridge || typeof PythonBridge.runPrediction !== 'function') {
                throw new Error('PythonBridge is not properly initialized');
            }
            const result = await PythonBridge.runPrediction(data);
            if (!result || typeof result !== 'object') {
                throw new Error('Invalid response from Python script');
            }
            return result;
        } catch (error) {
            logger.error('Python execution failed:', { 
                error: error.message, 
                stack: error.stack, 
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() } 
            });
            if (prometheusMetrics.predictionErrors) {
                prometheusMetrics.predictionErrors.inc({ type: 'python_execution', reason: error.name || 'unknown' });
            }
            this._handleError(error);
            throw error;
        }
    }

    // Adding the missing _initializeCircuitBreaker method
    _initializeCircuitBreaker() {
        const breakerOptions = {
            timeout: this.config.circuitBreaker.timeout,
            errorThresholdPercentage: this.config.circuitBreaker.errorThresholdPercentage,
            resetTimeout: this.config.circuitBreaker.resetTimeout,
            rollingCountTimeout: this.config.circuitBreaker.rollingCountTimeout
        };
        this.breaker = new CircuitBreaker(async (data) => await this._executePython(data), breakerOptions);

        this.breaker.on('open', () => {
            logger.warn('Circuit breaker opened due to excessive failures', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            this.emit('circuit:open');
        });

        this.breaker.on('close', () => {
            logger.info('Circuit breaker closed, system recovered', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            this.emit('circuit:close');
        });

        this.breaker.on('halfOpen', () => {
            logger.info('Circuit breaker in half-open state, testing recovery', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            this.emit('circuit:halfOpen');
        });

        logger.info('Circuit breaker initialized', {
            options: breakerOptions,
            metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
        });
    }

    getPredictionHistory(league) {
        return this.predictionHistory.get(league) || [];
    }

    getModelMetrics(league) {
        return this.modelMetrics.get(league) || { accuracy: 0, lastUpdated: null };
    }
}

// Export the model class
module.exports = { TheAnalyzerPredictiveModel };

// Main execution block for standalone running
if (require.main === module) {
    (async () => {
        try {
            const model = new TheAnalyzerPredictiveModel();
            // Initialize the circuit breaker since it wasn’t explicitly called in _initializeComponents
            model._initializeCircuitBreaker();

            // Example usage
            process.on('SIGINT', async () => {
                logger.info('Received SIGINT, shutting down', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                await model.cleanup();
                process.exit(0);
            });

            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM, shutting down', {
                    metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
                });
                await model.cleanup();
                process.exit(0);
            });

            logger.info('Predictive model started successfully', {
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
        } catch (error) {
            logger.error('Failed to start predictive model:', {
                error: error.message,
                stack: error.stack,
                metadata: { service: 'predictive-model', timestamp: new Date().toISOString() }
            });
            process.exit(1);
        }
    })();
}