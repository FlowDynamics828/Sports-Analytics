// utils/metricsManager.js

const { EventEmitter } = require('events');
const os = require('os');
const { performance } = require('perf_hooks');
const v8 = require('v8');
const crypto = require('crypto');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Enterprise-Grade Metrics Management System for Sports Analytics
class MetricsManager extends EventEmitter {
  // Singleton instance management
  static #instance = null;

  // Private fields
  #config = {
    logLevel: process.env.LOG_LEVEL || 'info',
    metricsRetentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
    alertThresholds: {
      memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80, // 80% from .env
      cpuLoad: parseFloat(process.env.CPU_LOAD_THRESHOLD) || 0.80,        // 80% from .env
      networkTraffic: parseInt(process.env.NETWORK_TRAFFIC_THRESHOLD) || (50 * 1024 * 1024) // 50MB from .env
    }
  };

  #logger = null;
  #collectors = new Map();
  #historicalData = new Map();
  #realtimeMetrics = new Map();
  #alertThresholds = new Map();
  #performanceMetrics = {
    cpu: [],
    memory: [],
    eventLoop: [],
    network: []
  };
  #sportMetrics = {
    predictionAccuracy: new Map(),
    analysisLatency: [],
    realtimeUpdates: { success: 0, failed: 0, latency: [] },
    dataProcessing: { batchSize: [], processingTime: [], errorRate: [] }
  };
  #anomalyLog = [];
  #performanceAlerts = [];
  #instanceId = crypto.randomBytes(16).toString('hex');
  #enhancedCollectors = new Map();
  #intervals = [];

  /**
   * Private constructor to enforce singleton pattern
   * @param {Object} config - Configuration options for metrics manager
   */
  constructor(config = {}) {
    if (MetricsManager.#instance) {
      return MetricsManager.#instance;
    }

    super();

    // Merge provided config with defaults and .env values
    this.#config = {
      ...this.#config,
      ...config,
      alertThresholds: { ...this.#config.alertThresholds, ...config.alertThresholds }
    };

    try {
      // Initialize logging with error handling
      this.#logger = this.#initializeLogger();
      this.#logger.info(`MetricsManager initializing with instance ID: ${this.#instanceId}`, {
        pid: process.pid,
        metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      console.error('Failed to initialize logger:', error);
      this.#logger = console; // Fallback to console if winston fails
    }

    // Initialize collectors
    this.#collectors = this.initializeCollectors();

    // Initialize enhanced collectors
    this.#initializeEnhancedCollectors();

    // Set up monitoring and cleanup
    this.#setupAdvancedMonitoring();
    this.#setupErrorTracking();
    this.setupMetricsCleanup();
    this.setupRealtimeMonitoring();
    this.setupAnomalyDetection();

    // Add memory usage check in constructor
    this.checkMemoryUsage = () => {
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed / memoryUsage.heapTotal > this.#config.alertThresholds.memoryUsage) {
        this.#logger.warn(`High memory usage detected in MetricsManager: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}% of heap used`, {
          instanceId: this.#instanceId,
          timestamp: new Date().toISOString(),
          metadata: { service: 'metrics-manager' }
        });
      }
    };
    setInterval(this.checkMemoryUsage, 300000); // Check every 5 minutes

    // Store instance
    MetricsManager.#instance = this;

    return this;
  }

  /**
   * Get singleton instance of MetricsManager
   * @returns {MetricsManager} Singleton instance
   */
  static getInstance(config = {}) {
    if (!this.#instance) {
      this.#instance = new MetricsManager(config);
    }
    return this.#instance;
  }

  /**
   * Initialize comprehensive metric collectors
   * @returns {Map} Initialized collectors
   */
  initializeCollectors() {
    const collectors = new Map();

    collectors.set('system', {
      cpu: { usage: [], load: [], processes: [] },
      memory: { heap: [], rss: [], external: [], arrayBuffers: [] },
      eventLoop: { lag: [], utilization: [] },
      gc: { collections: 0, duration: [], type: {} }
    });

    collectors.set('http', {
      requests: { total: 0, active: 0, completed: 0, failed: 0 },
      methods: {},
      statusCodes: {},
      latency: { values: [], p95: 0, p99: 0, average: 0 },
      bandwidth: { in: 0, out: 0 },
      rateLimit: { exceeded: 0, remaining: {} }
    });

    collectors.set('database', {
      queries: { total: 0, active: 0, slow: 0, errors: 0 },
      connections: { active: 0, idle: 0, max: 0 },
      latency: { query: [], transaction: [] },
      indexes: { usage: {}, scans: {} },
      cache: { hits: 0, misses: 0, size: 0 }
    });

    collectors.set('analytics', {
      predictions: { total: 0, accurate: 0, confidence: [], processingTime: [] },
      realtime: { updates: 0, latency: [], accuracy: [] },
      models: { performance: {}, accuracy: {}, trainingTime: [] },
      data: { processed: 0, errors: 0, sourceLatency: {} }
    });

    return collectors;
  }

  /**
   * Initialize enhanced collectors with performance tracking
   * @private
   */
  #initializeEnhancedCollectors() {
    this.#collectors.forEach((collector, key) => {
      const enhancedCollector = {
        original: collector,
        metadata: {
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          updateCount: 0,
          performanceProfile: { averageUpdateTime: 0, updateTimestamps: [] }
        },
        track: (updateFn) => {
          try {
            const startTime = performance.now();
            const result = updateFn(collector);
            const endTime = performance.now();

            const updateTime = endTime - startTime;
            const metadata = enhancedCollector.metadata;

            metadata.lastUpdated = Date.now();
            metadata.updateCount++;
            metadata.performanceProfile.updateTimestamps.push({ timestamp: Date.now(), duration: updateTime });

            // Calculate rolling average update time
            const updates = metadata.performanceProfile.updateTimestamps;
            metadata.performanceProfile.averageUpdateTime = updates.reduce((sum, u) => sum + u.duration, 0) / updates.length || 0;

            return result;
          } catch (error) {
            this.#logger.error(`Error tracking ${key} collector:`, { 
              error: error.message, 
              stack: error.stack, 
              metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() } 
            });
            return null;
          }
        }
      };

      this.#enhancedCollectors.set(key, enhancedCollector);
    });
  }

  /**
   * Set up advanced system monitoring
   * @private
   */
  #setupAdvancedMonitoring() {
    const systemMonitorInterval = setInterval(() => {
      try {
        const cpuUsage = process.cpuUsage();
        const memoryUsage = process.memoryUsage();
        const v8Heap = v8.getHeapStatistics();

        const systemSnapshot = {
          timestamp: Date.now(),
          cpu: {
            user: cpuUsage.system / 1000000,
            system: cpuUsage.user / 1000000,
            total: (cpuUsage.system + cpuUsage.user) / 1000000
          },
          memory: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
            heapPercentage: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2)
          },
          v8Heap: {
            totalHeapSize: v8Heap.total_heap_size,
            usedHeapSize: v8Heap.used_heap_size,
            heapSizeLimit: v8Heap.heap_size_limit
          }
        };

        this.#historicalData.set(`system_${Date.now()}`, systemSnapshot);
        this.#checkResourceThresholds(systemSnapshot);
      } catch (error) {
        this.#logger.error('Advanced system monitoring error:', { 
          error: error.message, 
          stack: error.stack, 
          metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() } 
        });
      }
    }, parseInt(process.env.METRICS_INTERVAL) || 10000); // Every 10 seconds (default from .env)

    systemMonitorInterval.unref();
    this.#intervals.push(systemMonitorInterval);
  }

  /**
   * Check resource thresholds for alerts
   * @private
   * @param {Object} systemSnapshot Current system metrics
   */
  #checkResourceThresholds(systemSnapshot) {
    const { memory, cpu } = systemSnapshot;

    if (memory.heapPercentage > this.#config.alertThresholds.memoryUsage * 100) {
      this.#logger.warn('High memory usage detected', {
        currentUsage: memory.heapPercentage,
        threshold: this.#config.alertThresholds.memoryUsage * 100,
        metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() }
      });
      this.emit('alert:memory', memory);
    }

    if (cpu.total > this.#config.alertThresholds.cpuLoad) {
      this.#logger.warn('High CPU load detected', {
        currentLoad: cpu.total,
        threshold: this.#config.alertThresholds.cpuLoad,
        metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() }
      });
      this.emit('alert:cpu', cpu);
    }
  }

  /**
   * Set up error tracking
   * @private
   */
  #setupErrorTracking() {
    process.on('uncaughtException', (error) => {
      this.#logger.error('Uncaught Exception', { 
        error: error.message, 
        stack: error.stack, 
        metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() } 
      });
      this.#anomalyLog.push({ 
        type: 'uncaught_exception', 
        timestamp: Date.now(), 
        error: error.message, 
        stack: error.stack 
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.#logger.error('Unhandled Rejection', { 
        reason: reason.toString(), 
        metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() } 
      });
      this.#anomalyLog.push({ 
        type: 'unhandled_rejection', 
        timestamp: Date.now(), 
        reason: reason.toString() 
      });
    });
  }

  /**
   * Initialize logging with winston
   * @private
   * @returns {winston.Logger} Configured logger
   */
  #initializeLogger() {
    try {
      return winston.createLogger({
        level: this.#config.logLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.splat(),
          winston.format.json()
        ),
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          }),
          new DailyRotateFile({
            filename: 'logs/metrics-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
          }),
          new winston.transports.File({ filename: 'logs/metrics-error.log', level: 'error' })
        ]
      });
    } catch (error) {
      console.error('Failed to initialize winston logger, falling back to console:', error);
      return console;
    }
  }

  /**
   * Record comprehensive HTTP request metrics
   * @param {Object} params Request parameters
   */
  recordHttpRequest({ method, path, status, duration, size = 0 }) {
    const http = this.#collectors.get('http');
    const timestamp = Date.now();

    http.requests.total++;
    http.methods[method] = (http.methods[method] || 0) + 1;
    http.statusCodes[status] = (http.statusCodes[status] || 0) + 1;

    http.latency.values.push({ duration, timestamp });
    this.updateLatencyStats(http.latency);

    http.bandwidth.out += size;

    this.analyzeRequestPatterns(method, path, status, duration);

    this.emit('metric:http', {
      method,
      path,
      status,
      duration,
      timestamp,
      metadata: { service: 'metrics-manager' }
    });

    this.detectAnomalies('http', { duration, status, method, path });
  }

  /**
   * Record advanced system metrics
   */
  recordSystemMetrics() {
    const system = this.#collectors.get('system');
    const timestamp = Date.now();

    const cpuUsage = os.cpus().map(cpu => {
      const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0);
      const idle = cpu.times.idle;
      return 1 - (idle / total);
    });

    system.cpu.usage.push({
      timestamp,
      average: cpuUsage.reduce((acc, usage) => acc + usage, 0) / cpuUsage.length,
      perCore: cpuUsage
    });

    const memory = process.memoryUsage();
    system.memory.heap.push({
      timestamp,
      used: memory.heapUsed,
      total: memory.heapTotal,
      percentage: (memory.heapUsed / memory.heapTotal) * 100
    });

    this.measureEventLoopLag().then(lag => {
      system.eventLoop.lag.push({ timestamp, duration: lag });
    });

    this.cleanupOldMetrics(system);

    this.emit('metric:system', {
      cpu: system.cpu.usage[system.cpu.usage.length - 1],
      memory: system.memory.heap[system.memory.heap.length - 1],
      timestamp,
      metadata: { service: 'metrics-manager' }
    });
  }

  /**
   * Record sports analytics specific metrics
   * @param {Object} params Analytics parameters
   */
  recordAnalyticsMetrics({ type, accuracy, confidence, duration, modelId }) {
    const analytics = this.#collectors.get('analytics');
    const timestamp = Date.now();

    if (type === 'prediction') {
      analytics.predictions.total++;
      analytics.predictions.confidence.push(confidence || 0);
      analytics.predictions.processingTime.push(duration || 0);

      if (accuracy !== undefined) {
        analytics.predictions.accurate += accuracy ? 1 : 0;
      }

      if (modelId) {
        if (!analytics.models.performance[modelId]) {
          analytics.models.performance[modelId] = {
            predictions: 0,
            accurate: 0,
            confidence: [],
            duration: []
          };
        }

        const model = analytics.models.performance[modelId];
        model.predictions++;
        model.accurate += accuracy ? 1 : 0;
        model.confidence.push(confidence || 0);
        model.duration.push(duration || 0);
      }
    }

    this.emit('metric:analytics', {
      type,
      accuracy: accuracy || 0,
      confidence: confidence || 0,
      duration: duration || 0,
      modelId,
      timestamp,
      metadata: { service: 'metrics-manager' }
    });

    this.analyzePredictionPatterns(analytics);
  }

  /**
   * Measure event loop lag
   * @returns {Promise<number>} Lag in milliseconds
   */
  async measureEventLoopLag() {
    const start = performance.now();
    return new Promise(resolve => {
      setImmediate(() => {
        const lag = performance.now() - start;
        resolve(lag);
      });
    });
  }

  /**
   * Update latency statistics
   * @param {Object} latencyData Latency metrics object
   */
  updateLatencyStats(latencyData) {
    if (latencyData.values.length === 0) return;

    const values = latencyData.values.map(v => v.duration);
    latencyData.average = values.reduce((acc, val) => acc + val, 0) / values.length;

    const sorted = [...values].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    latencyData.p95 = sorted[p95Index] || 0;
    latencyData.p99 = sorted[p99Index] || 0;
  }

  /**
   * Analyze request patterns for anomalies and optimization opportunities
   * @param {string} method HTTP method
   * @param {string} path Request path
   * @param {number} status Status code
   * @param {number} duration Request duration
   */
  analyzeRequestPatterns(method, path, status, duration) {
    const patterns = this.getRequestPatterns();
    const key = `${method}:${path}`;

    if (!patterns[key]) {
      patterns[key] = {
        count: 0,
        durations: [],
        statuses: {},
        lastAccessed: Date.now()
      };
    }

    const pattern = patterns[key];
    pattern.count++;
    pattern.durations.push(duration);
    pattern.statuses[status] = (pattern.statuses[status] || 0) + 1;
    pattern.lastAccessed = Date.now();

    if (duration > (pattern.durations.reduce((acc, val) => acc + val, 0) / pattern.durations.length * 2) || 0) {
      this.emit('pattern:slowRequest', {
        method,
        path,
        duration,
        average: pattern.durations.reduce((acc, val) => acc + val, 0) / pattern.durations.length || 0,
        metadata: { service: 'metrics-manager' }
      });
    }
  }

  /**
   * Analyze prediction patterns for model optimization
   * @param {Object} analytics Analytics metrics
   */
  analyzePredictionPatterns(analytics) {
    const predictions = analytics.predictions;
    const accuracy = predictions.total > 0 ? predictions.accurate / predictions.total : 0;

    const recentPredictions = predictions.confidence.slice(-100);
    const recentAccuracy = recentPredictions.length > 0 ? recentPredictions.reduce((acc, val) => acc + val, 0) / recentPredictions.length : 0;

    if (recentAccuracy < accuracy * 0.9 && accuracy > 0) {
      this.emit('pattern:accuracyDegradation', {
        overall: accuracy,
        recent: recentAccuracy,
        samples: recentPredictions.length,
        metadata: { service: 'metrics-manager' }
      });
    }
  }

  /**
   * Get comprehensive metrics summary
   * @returns {Object} Metrics summary
   */
  getMetricsSummary() {
    return {
      timestamp: Date.now(),
      system: this.getSystemMetrics(),
      http: this.getHttpMetrics(),
      database: this.getDatabaseMetrics(),
      analytics: this.getAnalyticsMetrics(),
      patterns: this.getRequestPatterns(),
      metadata: { service: 'metrics-manager' }
    };
  }

  /**
   * Get detailed system metrics
   * @returns {Object} System metrics
   */
  getSystemMetrics() {
    const system = this.#collectors.get('system');
    return {
      cpu: {
        current: system.cpu.usage[system.cpu.usage.length - 1] || { average: 0, perCore: [] },
        history: system.cpu.usage.slice(-60) // Last 60 readings
      },
      memory: {
        current: system.memory.heap[system.memory.heap.length - 1] || { used: 0, total: 0, percentage: 0 },
        history: system.memory.heap.slice(-60)
      },
      eventLoop: {
        current: system.eventLoop.lag[system.eventLoop.lag.length - 1] || { duration: 0 },
        history: system.eventLoop.lag.slice(-60)
      }
    };
  }

  /**
   * Get detailed HTTP metrics
   * @returns {Object} HTTP metrics
   */
  getHttpMetrics() {
    const http = this.#collectors.get('http');
    return {
      requests: http.requests,
      latency: {
        current: http.latency.average || 0,
        p95: http.latency.p95 || 0,
        p99: http.latency.p99 || 0
      },
      methods: http.methods,
      statusCodes: http.statusCodes,
      bandwidth: http.bandwidth
    };
  }

  /**
   * Get detailed database metrics
   * @returns {Object} Database metrics
   */
  getDatabaseMetrics() {
    const db = this.#collectors.get('database');
    return {
      queries: db.queries,
      connections: db.connections,
      latency: {
        average: this.calculateAverage(db.latency.query) || 0,
        p95: this.calculatePercentile(db.latency.query, 95) || 0
      },
      cache: db.cache
    };
  }

  /**
   * Get detailed analytics metrics
   * @returns {Object} Analytics metrics
   */
  getAnalyticsMetrics() {
    const analytics = this.#collectors.get('analytics');
    return {
      predictions: {
        total: analytics.predictions.total,
        accuracy: analytics.predictions.total > 0 ? analytics.predictions.accurate / analytics.predictions.total : 0,
        averageConfidence: this.calculateAverage(analytics.predictions.confidence) || 0,
        averageProcessingTime: this.calculateAverage(analytics.predictions.processingTime) || 0
      },
      models: Object.entries(analytics.models.performance).map(([id, data]) => ({
        id,
        accuracy: data.predictions > 0 ? data.accurate / data.predictions : 0,
        predictions: data.predictions,
        averageConfidence: this.calculateAverage(data.confidence) || 0,
        averageDuration: this.calculateAverage(data.duration) || 0
      }))
    };
  }

  /**
   * Calculate average of an array
   * @param {Array<number>} array Number array
   * @returns {number} Average value
   */
  calculateAverage(array) {
    return array.length > 0 ? array.reduce((acc, val) => acc + val, 0) / array.length : 0;
  }

  /**
   * Calculate percentile of an array
   * @param {Array<number>} array Number array
   * @param {number} percentile Percentile to calculate
   * @returns {number} Percentile value
   */
  calculatePercentile(array, percentile) {
    if (array.length === 0) return 0;
    const sorted = [...array].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Clean up old metrics data
   * @param {Object} metrics Metrics object to clean
   */
  cleanupOldMetrics(metrics) {
    const ONE_HOUR = 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();

    if (Array.isArray(metrics)) {
      return metrics.filter(entry => 
        entry.timestamp && (now - entry.timestamp) <= ONE_HOUR
      );
    }

    if (typeof metrics === 'object' && metrics !== null) {
      Object.keys(metrics).forEach(key => {
        if (Array.isArray(metrics[key])) {
          metrics[key] = metrics[key].filter(entry =>
            !entry.timestamp || (now - entry.timestamp) <= ONE_HOUR
          );
        } else if (typeof metrics[key] === 'object' && metrics[key] !== null) {
          metrics[key] = this.cleanupOldMetrics(metrics[key]);
        }
      });
    }

    return metrics;
  }

  /**
   * Set up automatic metrics cleanup
   */
  setupMetricsCleanup() {
    const cleanupInterval = setInterval(() => {
      this.#collectors.forEach(collector => {
        this.cleanupOldMetrics(collector);
      });
      this.emit('metrics:cleanup', { 
        timestamp: Date.now(), 
        status: 'completed', 
        metadata: { service: 'metrics-manager' } 
      });
    }, this.#config.metricsRetentionPeriod); // Use retention period from config

    cleanupInterval.unref();
    this.#intervals.push(cleanupInterval);
  }

  /**
   * Set up real-time monitoring
   */
  setupRealtimeMonitoring() {
    const systemMonitorInterval = setInterval(() => {
      this.recordSystemMetrics();
    }, parseInt(process.env.METRICS_INTERVAL) || 10000);

    systemMonitorInterval.unref();
    this.#intervals.push(systemMonitorInterval);
  }

  /**
   * Set up anomaly detection
   */
  setupAnomalyDetection() {
    this.#alertThresholds.set('httpLatency', { warning: 1000, critical: 3000 });
    this.#alertThresholds.set('errorRate', { warning: 0.05, critical: 0.10 });
    this.#alertThresholds.set('memoryUsage', { warning: this.#config.alertThresholds.memoryUsage, critical: 0.95 });
  }

  /**
   * Detect anomalies in metrics
   * @param {string} type Metric type
   * @param {Object} data Metric data
   */
  detectAnomalies(type, data) {
    switch (type) {
      case 'http':
        this.detectHttpAnomalies(data);
        break;
      case 'system':
        this.detectSystemAnomalies(data);
        break;
      case 'analytics':
        this.detectAnalyticsAnomalies(data);
        break;
    }
  }

  /**
   * Detect HTTP anomalies
   * @param {Object} data HTTP request data
   */
  detectHttpAnomalies(data) {
    const httpLatencyThresholds = this.#alertThresholds.get('httpLatency');
    
    if (data.duration > httpLatencyThresholds.critical) {
      this.emit('anomaly:http:critical', {
        type: 'high_latency',
        duration: data.duration,
        method: data.method,
        path: data.path,
        metadata: { service: 'metrics-manager' }
      });
    } else if (data.duration > httpLatencyThresholds.warning) {
      this.emit('anomaly:http:warning', {
        type: 'moderate_latency',
        duration: data.duration,
        method: data.method,
        path: data.path,
        metadata: { service: 'metrics-manager' }
      });
    }
  }

  /**
   * Detect system anomalies
   * @param {Object} data System metrics
   */
  detectSystemAnomalies(data) {
    const memoryThresholds = this.#alertThresholds.get('memoryUsage');
    
    if (data.memory?.heapPercentage > memoryThresholds.critical) {
      this.emit('anomaly:system:critical', {
        type: 'high_memory_usage',
        usage: data.memory.heapPercentage,
        metadata: { service: 'metrics-manager' }
      });
    } else if (data.memory?.heapPercentage > memoryThresholds.warning) {
      this.emit('anomaly:system:warning', {
        type: 'moderate_memory_usage',
        usage: data.memory.heapPercentage,
        metadata: { service: 'metrics-manager' }
      });
    }
  }

  /**
   * Detect analytics anomalies
   * @param {Object} data Analytics metrics
   */
  detectAnalyticsAnomalies(data) {
    const errorRateThresholds = this.#alertThresholds.get('errorRate');
    const errorRate = data.total > 0 ? 1 - (data.accurate / data.total) : 0;
    
    if (errorRate > errorRateThresholds.critical) {
      this.emit('anomaly:analytics:critical', {
        type: 'high_error_rate',
        errorRate,
        metadata: { service: 'metrics-manager' }
      });
    } else if (errorRate > errorRateThresholds.warning) {
      this.emit('anomaly:analytics:warning', {
        type: 'moderate_error_rate',
        errorRate,
        metadata: { service: 'metrics-manager' }
      });
    }
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage() {
    const memory = process.memoryUsage();
    this.#performanceMetrics.memory.push({
      timestamp: Date.now(),
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      percentage: (memory.heapUsed / memory.heapTotal) * 100
    });

    // Clean up old memory metrics
    this.cleanupOldMetrics(this.#performanceMetrics.memory);

    // Check memory thresholds
    if (memory.heapUsed / memory.heapTotal > this.#config.alertThresholds.memoryUsage) {
      this.#logger.warn('High memory usage detected:', {
        currentUsage: (memory.heapUsed / memory.heapTotal) * 100,
        threshold: this.#config.alertThresholds.memoryUsage * 100,
        metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() }
      });
      this.emit('alert:memory', memory);
    }
  }

  /**
   * Record health status
   * @param {Object} health Health check data
   */
  recordHealthStatus(health) {
    this.#realtimeMetrics.set('health', {
      timestamp: Date.now(),
      status: health.status,
      components: health.components,
      metrics: health.metrics,
      metadata: { service: 'metrics-manager' }
    });
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.#collectors.forEach(collector => {
      if (Array.isArray(collector)) {
        collector.length = 0;
      } else if (typeof collector === 'object') {
        Object.keys(collector).forEach(key => {
          if (Array.isArray(collector[key])) {
            collector[key].length = 0;
          } else if (typeof collector[key] === 'number') {
            collector[key] = 0;
          }
        });
      }
    });

    this.emit('metrics:reset', { 
      timestamp: Date.now(), 
      metadata: { service: 'metrics-manager' } 
    });
  }

  /**
   * Cleanup resources on shutdown
   */
  cleanup() {
    try {
      this.#intervals.forEach(interval => clearInterval(interval));
      this.#collectors.clear();
      this.#historicalData.clear();
      this.#realtimeMetrics.clear();
      this.#anomalyLog.length = 0;
      this.#performanceAlerts.length = 0;
      if (this.#logger !== console) {
        this.#logger.info('MetricsManager cleanup completed', { 
          instanceId: this.#instanceId, 
          metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() } 
        });
      }
    } catch (error) {
      if (this.#logger !== console) {
        this.#logger.error('Error during MetricsManager cleanup:', { 
          error: error.message, 
          stack: error.stack, 
          metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() } 
        });
      } else {
        console.error('Error during MetricsManager cleanup:', error);
      }
    }
  }
}

// Freeze the prototype to prevent modifications
Object.freeze(MetricsManager.prototype);

// Export the class
module.exports = MetricsManager;