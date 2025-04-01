/**
 * Enhanced Real-Time Decision Intelligence System
 * 
 * Revolutionary system that transforms correlation analysis into actionable intelligence
 * by monitoring shifts in correlation patterns in real-time and delivering time-critical insights.
 * 
 * Enterprise-Grade Features:
 * - Circuit breaker pattern to prevent cascading failures
 * - Automated recovery mechanisms after system failures
 * - Predictive maintenance using system health metrics
 * - Adaptive throttling based on system load
 * - Advanced fraud detection for betting opportunity manipulation
 * - Shadow mode for testing changes in production
 * - Self-tuning correlation thresholds based on historical accuracy
 * - Distributed locking for high-availability deployment
 * - Multi-region resilience and fallback mechanisms
 * - Comprehensive sports coverage (NBA, NHL, NFL, MLB, La Liga, Serie A, Premier League, Bundesliga)
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

// Core dependencies
const mongoose = require('mongoose');
const redis = require('redis');
const { promisify } = require('util');
const EventEmitter = require('events');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const CircuitBreaker = require('opossum');
const Redlock = require('redlock');
const cron = require('node-cron');
const Prometheus = require('prom-client');
const Winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { Kafka } = require('kafkajs');
const Datadog = require('datadog-metrics');
const AnomalyDetector = require('@aws-sdk/client-lookoutmetrics');
const OpenAI = require('openai');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const validator = require('validator');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { WebhookClient } = require('discord.js');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');

// Internal modules
const FactorCorrelationEngine = require('./factor_correlation_engine');
const AdvancedCorrelationAPI = require('./advanced_correlation_api');
const MLPredictionEngine = require('./ml_prediction_engine');
const SecurityManager = require('./security_manager');
const RateLimiter = require('./rate_limiter');
const CachingLayer = require('./caching_layer');
const DataPipeline = require('./data_pipeline');
const { PerformanceMonitor } = require('./utils/performance_monitor');
const { SystemHealthAnalyzer } = require('./utils/system_health_analyzer');
const { SportEventManager } = require('./sports/sport_event_manager');
const { BettingMarketIntegration } = require('./integrations/betting_market_integration');
const { FraudDetectionEngine } = require('./security/fraud_detection_engine');
const { WebSocketServer } = require('./communication/websocket_server');
const { NotificationManager } = require('./communication/notification_manager');
const { BacktestingEngine } = require('./analytics/backtesting_engine');
const { QueryOptimizer } = require('./database/query_optimizer');

// Config and environment variables
require('dotenv').config();

// Global constants
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = ENVIRONMENT === 'production';
const DEPLOYMENT_REGION = process.env.DEPLOYMENT_REGION || 'us-east-1';
const VERSION = '2.0.0';
const SERVICE_NAME = 'sports-analytics-intelligence-system';

// Alert priority levels
const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Alert types
const ALERT_TYPES = {
  CORRELATION_SHIFT: 'correlation_shift',
  CAUSAL_DISCOVERY: 'causal_discovery',
  BETTING_OPPORTUNITY: 'betting_opportunity',
  ANOMALY_DETECTED: 'anomaly_detected',
  PREDICTION_DRIFT: 'prediction_drift',
  SYSTEM_STATUS: 'system_status',
  FRAUD_DETECTED: 'fraud_detected',
  MARKET_INEFFICIENCY: 'market_inefficiency',
  SYSTEM_HEALTH: 'system_health',
  MAINTENANCE_REQUIRED: 'maintenance_required'
};

// Channel types
const CHANNELS = {
  WEB: 'web',
  MOBILE: 'mobile',
  EMAIL: 'email',
  SMS: 'sms',
  API: 'api',
  WEBHOOK: 'webhook',
  PUSH: 'push',
  DISCORD: 'discord',
  SLACK: 'slack'
};

// Sport leagues
const LEAGUES = {
  NBA: 'nba',
  NHL: 'nhl',
  NFL: 'nfl',
  MLB: 'mlb',
  LA_LIGA: 'la_liga',
  SERIE_A: 'serie_a',
  PREMIER_LEAGUE: 'premier_league',
  BUNDESLIGA: 'bundesliga'
};

// Sport types
const SPORTS = {
  BASKETBALL: 'basketball',
  HOCKEY: 'hockey',
  FOOTBALL: 'football',
  BASEBALL: 'baseball',
  SOCCER: 'soccer'
};

// Sport to leagues mapping
const SPORT_LEAGUES = {
  [SPORTS.BASKETBALL]: [LEAGUES.NBA],
  [SPORTS.HOCKEY]: [LEAGUES.NHL],
  [SPORTS.FOOTBALL]: [LEAGUES.NFL],
  [SPORTS.BASEBALL]: [LEAGUES.MLB],
  [SPORTS.SOCCER]: [LEAGUES.LA_LIGA, LEAGUES.SERIE_A, LEAGUES.PREMIER_LEAGUE, LEAGUES.BUNDESLIGA]
};

// System health states
const HEALTH_STATES = {
  OPTIMAL: 'optimal',
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  AT_RISK: 'at_risk',
  CRITICAL: 'critical'
};

// Circuit breaker states
const CIRCUIT_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

// Operation modes
const OPERATION_MODES = {
  NORMAL: 'normal',
  SHADOW: 'shadow',
  MAINTENANCE: 'maintenance',
  RECOVERY: 'recovery',
  DEGRADED: 'degraded',
  READ_ONLY: 'read_only'
};

/**
 * Configure logging system
 */
const configureLogger = () => {
  const logFormat = Winston.format.combine(
    Winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    Winston.format.errors({ stack: true }),
    Winston.format.splat(),
    Winston.format.json()
  );

  const consoleFormat = Winston.format.combine(
    Winston.format.colorize(),
    Winston.format.printf(
      ({ level, message, timestamp, service, ...metadata }) => {
        let msg = `${timestamp} [${service}] ${level}: ${message}`;
        if (Object.keys(metadata).length > 0 && metadata.stack !== undefined) {
          return `${msg}\n${metadata.stack}`;
        }
        return msg;
      }
    )
  );

  // Create the transports
  const transports = [
    new Winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug')
    })
  ];

  // Add file transport in production
  if (IS_PRODUCTION) {
    transports.push(
      new DailyRotateFile({
        filename: 'logs/%DATE%-application.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '100m',
        maxFiles: '14d',
        level: 'info'
      }),
      new DailyRotateFile({
        filename: 'logs/%DATE%-error.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '100m',
        maxFiles: '30d',
        level: 'error'
      })
    );
  }

  // Create the logger
  return Winston.createLogger({
    level: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug'),
    defaultMeta: { service: SERVICE_NAME, version: VERSION, environment: ENVIRONMENT },
    format: logFormat,
    transports
  });
};

// Initialize logger
const logger = configureLogger();

/**
 * Configure metrics collection and export
 */
const configureMetrics = () => {
  // Initialize Prometheus registry
  const registry = new Prometheus.Registry();
  
  // Add default metrics
  Prometheus.collectDefaultMetrics({ register: registry, prefix: `${SERVICE_NAME}_` });
  
  // Create custom metrics
  const metrics = {
    alertsGenerated: new Prometheus.Counter({
      name: `${SERVICE_NAME}_alerts_generated_total`,
      help: 'Total number of alerts generated',
      labelNames: ['type', 'priority', 'sport', 'league']
    }),
    alertsSent: new Prometheus.Counter({
      name: `${SERVICE_NAME}_alerts_sent_total`,
      help: 'Total number of alerts sent to users',
      labelNames: ['channel', 'priority']
    }),
    monitoringCycles: new Prometheus.Counter({
      name: `${SERVICE_NAME}_monitoring_cycles_total`,
      help: 'Total number of monitoring cycles run'
    }),
    opportunitiesDetected: new Prometheus.Counter({
      name: `${SERVICE_NAME}_opportunities_detected_total`,
      help: 'Total number of betting opportunities detected',
      labelNames: ['sport', 'league', 'value_range']
    }),
    cycleProcessingTime: new Prometheus.Histogram({
      name: `${SERVICE_NAME}_cycle_processing_time_seconds`,
      help: 'Processing time of monitoring cycles in seconds',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]
    }),
    apiLatency: new Prometheus.Histogram({
      name: `${SERVICE_NAME}_api_latency_seconds`,
      help: 'Latency of API calls in seconds',
      labelNames: ['endpoint', 'method', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    }),
    databaseOperationLatency: new Prometheus.Histogram({
      name: `${SERVICE_NAME}_database_operation_latency_seconds`,
      help: 'Latency of database operations in seconds',
      labelNames: ['operation', 'collection'],
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5]
    }),
    cacheHitRatio: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_cache_hit_ratio`,
      help: 'Cache hit ratio',
      labelNames: ['cache_name']
    }),
    circuitBreakerState: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_circuit_breaker_state`,
      help: 'Circuit breaker state (0=open, 1=half-open, 2=closed)',
      labelNames: ['breaker_name']
    }),
    systemHealth: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_system_health`,
      help: 'System health state (0=critical, 1=at_risk, 2=degraded, 3=healthy, 4=optimal)',
      labelNames: ['component']
    }),
    resourceUtilization: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_resource_utilization_percent`,
      help: 'Resource utilization percentage',
      labelNames: ['resource_type']
    }),
    activeFraudInvestigations: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_active_fraud_investigations`,
      help: 'Number of active fraud investigations'
    }),
    throttledRequests: new Prometheus.Counter({
      name: `${SERVICE_NAME}_throttled_requests_total`,
      help: 'Total number of throttled requests',
      labelNames: ['endpoint']
    }),
    activeUsers: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_active_users`,
      help: 'Number of active users',
      labelNames: ['subscription_tier']
    }),
    correlationAccuracy: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_correlation_accuracy_percent`,
      help: 'Accuracy of correlation predictions',
      labelNames: ['sport', 'league']
    }),
    maintenancePredictions: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_maintenance_prediction_hours`,
      help: 'Predicted hours until maintenance is required',
      labelNames: ['component']
    }),
    notificationDeliveryTime: new Prometheus.Histogram({
      name: `${SERVICE_NAME}_notification_delivery_time_seconds`,
      help: 'Time taken to deliver notifications',
      labelNames: ['channel', 'priority'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    }),
    anomalyScore: new Prometheus.Gauge({
      name: `${SERVICE_NAME}_anomaly_score`,
      help: 'Anomaly score for system behavior',
      labelNames: ['component']
    })
  };

  // Register all metrics
  Object.values(metrics).forEach(metric => registry.registerMetric(metric));

  // Initialize Datadog if in production
  if (IS_PRODUCTION) {
    Datadog.init({
      apiKey: process.env.DATADOG_API_KEY,
      appKey: process.env.DATADOG_APP_KEY,
      defaultTags: [`env:${ENVIRONMENT}`, `service:${SERVICE_NAME}`, `version:${VERSION}`, `region:${DEPLOYMENT_REGION}`],
      flushIntervalSeconds: 15
    });
  }

  return { registry, metrics };
};

// Initialize metrics
const { registry: metricsRegistry, metrics } = configureMetrics();

/**
 * Create circuit breaker for external service calls
 */
const createCircuitBreaker = (fn, options) => {
  const defaultOptions = {
    timeout: 10000, // Time in ms before a request times out
    errorThresholdPercentage: 50, // Error % at which to open the circuit
    resetTimeout: 30000, // Time in ms to wait before testing the circuit again
    rollingCountTimeout: 60000, // Time window in ms for error rate calculation
    rollingCountBuckets: 10, // Number of buckets for error rate calculation
    name: 'default-circuit' // Name of this circuit breaker
  };

  const breakerOptions = { ...defaultOptions, ...options };
  const breaker = new CircuitBreaker(fn, breakerOptions);
  
  // Event handlers for monitoring
  breaker.on('open', () => {
    logger.warn(`Circuit ${breakerOptions.name} opened`);
    metrics.circuitBreakerState.set({ breaker_name: breakerOptions.name }, 0);
  });
  
  breaker.on('halfOpen', () => {
    logger.info(`Circuit ${breakerOptions.name} half-open`);
    metrics.circuitBreakerState.set({ breaker_name: breakerOptions.name }, 1);
  });
  
  breaker.on('close', () => {
    logger.info(`Circuit ${breakerOptions.name} closed`);
    metrics.circuitBreakerState.set({ breaker_name: breakerOptions.name }, 2);
  });
  
  breaker.on('fallback', result => {
    logger.warn(`Circuit ${breakerOptions.name} fallback called`);
  });
  
  breaker.on('reject', () => {
    logger.warn(`Circuit ${breakerOptions.name} rejected a request`);
  });
  
  breaker.on('timeout', () => {
    logger.warn(`Circuit ${breakerOptions.name} timed out`);
  });
  
  return breaker;
};

/**
 * Main Real-Time Intelligence System class
 */
class RealTimeIntelligenceSystem {
  /**
   * Initialize the real-time intelligence system
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    // Core configuration
    this.environment = ENVIRONMENT;
    this.isProduction = IS_PRODUCTION;
    this.version = VERSION;
    this.serviceName = SERVICE_NAME;
    this.deploymentRegion = DEPLOYMENT_REGION;
    
    // Database configuration
    this.primaryMongoUri = options.primaryMongoUri || process.env.PRIMARY_MONGO_URI || 'mongodb+srv://sportsuser:HPr4dK9@4xGLpW@sports-analytics-primary.mongodb.net/?retryWrites=true&w=majority';
    this.fallbackMongoUri = options.fallbackMongoUri || process.env.FALLBACK_MONGO_URI || 'mongodb+srv://sportsuser:HPr4dK9@4xGLpW@sports-analytics-backup.mongodb.net/?retryWrites=true&w=majority';
    this.dbName = options.dbName || process.env.MONGO_DB_NAME || 'SportsAnalyticsPro';
    this.mongoConnectionOptions = {
      dbName: this.dbName,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 100,
      minPoolSize: 10,
      maxIdleTimeMS: 30000
    };
    
    // Redis configuration
    this.primaryRedisUrl = options.primaryRedisUrl || process.env.PRIMARY_REDIS_URL || 'redis://sports-redis-primary.example.com:6379';
    this.fallbackRedisUrl = options.fallbackRedisUrl || process.env.FALLBACK_REDIS_URL || 'redis://sports-redis-backup.example.com:6379';
    this.redisPassword = process.env.REDIS_PASSWORD || 'redisComplexPassword2025!';
    this.redisTls = process.env.REDIS_TLS === 'true';
    
    // Kafka configuration
    this.kafkaBrokers = options.kafkaBrokers || process.env.KAFKA_BROKERS?.split(',') || ['broker1.sports-kafka.example.com:9092', 'broker2.sports-kafka.example.com:9092', 'broker3.sports-kafka.example.com:9092'];
    this.kafkaClientId = options.kafkaClientId || process.env.KAFKA_CLIENT_ID || 'sports-analytics-intelligence-system';
    this.kafkaGroupId = options.kafkaGroupId || process.env.KAFKA_GROUP_ID || 'intelligence-system-group';
    
    // AWS configuration
    this.awsRegion = options.awsRegion || process.env.AWS_REGION || 'us-east-1';
    this.awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID || 'AKIA5EXAMPLE2KEYVALUE';
    this.awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || 'zEXAMPLEsecretKEYwithVALUEexampleSECRETvalue';
    this.sqsQueueUrl = process.env.SQS_QUEUE_URL || 'https://sqs.us-east-1.amazonaws.com/123456789012/sports-analytics-queue';
    this.s3BucketName = process.env.S3_BUCKET_NAME || 'sports-analytics-data-bucket';
    
    // API Keys
    this.datadogApiKey = process.env.DATADOG_API_KEY || '6f1a23b4c5d6e7f8g9h0j1k2l3m4n5o6';
    this.datadogAppKey = process.env.DATADOG_APP_KEY || '6f1a23b4c5d6e7f8g9h0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0';
    this.openaiApiKey = process.env.OPENAI_API_KEY || 'sk-1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0';
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/123456789012345678/EXAMPLE-webhook-token-very-long-string-here';
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';
    this.supabaseUrl = process.env.SUPABASE_URL || 'https://sports-analytics.supabase.co';
    this.supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.token';
    this.jwtSecret = process.env.JWT_SECRET || 'verySecureJWTSecret2025ForSportsAnalytics!';
    
    // System configuration
    this.monitoringInterval = options.monitoringInterval || parseInt(process.env.MONITORING_INTERVAL) || 30000; // 30 seconds default
    this.alertThrottleTime = options.alertThrottleTime || parseInt(process.env.ALERT_THROTTLE_TIME) || 1800000; // 30 minutes default
    this.maxConcurrentMonitoringJobs = options.maxConcurrentMonitoringJobs || parseInt(process.env.MAX_CONCURRENT_MONITORING_JOBS) || 5;
    this.maxAlertsPerUser = options.maxAlertsPerUser || parseInt(process.env.MAX_ALERTS_PER_USER) || 50;
    this.maxAlertsPerMinute = options.maxAlertsPerMinute || parseInt(process.env.MAX_ALERTS_PER_MINUTE) || 100;
    this.healthCheckInterval = options.healthCheckInterval || parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000; // 1 minute default
    this.automaticRecoveryEnabled = options.automaticRecoveryEnabled !== undefined ? options.automaticRecoveryEnabled : (process.env.AUTOMATIC_RECOVERY_ENABLED === 'true');
    this.shadowModeEnabled = options.shadowModeEnabled !== undefined ? options.shadowModeEnabled : (process.env.SHADOW_MODE_ENABLED === 'true');
    this.maintenancePredictionEnabled = options.maintenancePredictionEnabled !== undefined ? options.maintenancePredictionEnabled : (process.env.MAINTENANCE_PREDICTION_ENABLED === 'true');
    this.adaptiveThrottlingEnabled = options.adaptiveThrottlingEnabled !== undefined ? options.adaptiveThrottlingEnabled : (process.env.ADAPTIVE_THROTTLING_ENABLED === 'true');
    this.fraudDetectionEnabled = options.fraudDetectionEnabled !== undefined ? options.fraudDetectionEnabled : (process.env.FRAUD_DETECTION_ENABLED === 'true');
    this.selfTuningEnabled = options.selfTuningEnabled !== undefined ? options.selfTuningEnabled : (process.env.SELF_TUNING_ENABLED === 'true');
    this.distributedLockingEnabled = options.distributedLockingEnabled !== undefined ? options.distributedLockingEnabled : (process.env.DISTRIBUTED_LOCKING_ENABLED === 'true');
    
    // System state
    this.isInitialized = false;
    this.isMonitoring = false;
    this.operationMode = OPERATION_MODES.NORMAL;
    this.systemHealth = HEALTH_STATES.OPTIMAL;
    this.startTime = null;
    this.lastRestartTime = null;
    this.currentMonitoringJobs = 0;
    this.intervalHandles = new Map();
    this.sentAlerts = new Map();
    this.alertCounts = {
      total: 0,
      byType: {},
      byPriority: {},
      byLeague: {},
      bySport: {}
    };
    
    // Alerts rate limiting
    this.alertsInLastMinute = 0;
    this.lastAlertRateCheck = Date.now();
    
    // Dependencies
    this.logger = logger;
    this.metrics = metrics;
    this.metricsRegistry = metricsRegistry;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(50); // Increase from default 10
    
    // Initialize service connections as null
    this.mongoConnection = null;
    this.redisClient = null;
    this.redisPubSub = null;
    this.redlock = null;
    this.kafka = null;
    this.kafkaProducer = null;
    this.kafkaConsumer = null;
    this.emailTransport = null;
    this.sqsClient = null;
    this.cloudWatchClient = null;
    this.s3Client = null;
    this.openaiClient = null;
    this.supabaseClient = null;
    this.performanceMonitor = null;
    this.systemHealthAnalyzer = null;
    this.notificationManager = null;
    this.sportEventManager = null;
    this.webSocketServer = null;
    
    // Circuit breakers
    this.circuitBreakers = {};
    
    // User subscriptions
    this.userSubscriptions = new Map();
    
    // Core components
    this.correlationAPI = options.correlationAPI || new AdvancedCorrelationAPI();
    this.correlationEngine = options.correlationEngine || new FactorCorrelationEngine();
    this.predictionEngine = options.predictionEngine || new MLPredictionEngine();
    this.securityManager = options.securityManager || new SecurityManager();
    this.rateLimiter = options.rateLimiter || new RateLimiter();
    this.cachingLayer = options.cachingLayer || new CachingLayer();
    this.dataPipeline = options.dataPipeline || new DataPipeline();
    this.queryOptimizer = options.queryOptimizer || new QueryOptimizer();
    this.bettingMarketIntegration = options.bettingMarketIntegration || new BettingMarketIntegration();
    this.fraudDetectionEngine = options.fraudDetectionEngine || new FraudDetectionEngine();
    this.backtestingEngine = options.backtestingEngine || new BacktestingEngine();
    
    // Performance metrics
    this.metrics = {
      alertsGenerated: 0,
      alertsSent: 0,
      monitoringCycles: 0,
      opportunitiesDetected: 0,
      avgProcessingTime: 0,
      lastCycleTime: null,
      peakMemoryUsage: 0,
      totalErrors: 0,
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      correlationAccuracy: {},
      throttledRequests: 0,
      fraudDetections: 0,
      systemUptime: 0,
      shadowModeMatchRate: 100, // Percentage match between shadow and production
      adaptiveThrottleRate: 0, // Current throttle rate percentage
      currentConcurrency: 0,
      healthScore: 100, // Overall system health score 0-100
      predictionHitRate: {}
    };
    
    // Self-tuning parameters
    this.tuningParameters = {
      correlationThresholds: {
        default: 0.5,
        byLeague: {}
      },
      anomalyThresholds: {
        default: 3.0, // Standard deviations
        byLeague: {}
      },
      throttlingLevels: {
        low: 0.9,    // 90% of requests pass
        medium: 0.5,  // 50% of requests pass
        high: 0.1     // 10% of requests pass
      },
      scoringWeights: {
        recency: 0.6,
        magnitude: 0.3,
        consistency: 0.1
      },
      predictionTimeHorizons: {
        short: 86400000,    // 24 hours in ms
        medium: 604800000,  // 7 days in ms
        long: 2592000000    // 30 days in ms
      }
    };
    
    // Historical accuracy tracking for self-tuning
    this.accuracyHistory = {
      correlations: [],
      predictions: [],
      anomalies: []
    };
    
    // Shadow mode comparison results
    this.shadowResults = {
      matches: 0,
      mismatches: 0,
      totalComparisons: 0
    };

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.startMonitoring = this.startMonitoring.bind(this);
    this.stopMonitoring = this.stopMonitoring.bind(this);
    this.monitorCorrelationShifts = this.monitorCorrelationShifts.bind(this);
    this.generateAlerts = this.generateAlerts.bind(this);
    this.sendAlert = this.sendAlert.bind(this);
    this.shutdown = this.shutdown.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
    this.attemptRecovery = this.attemptRecovery.bind(this);
    this.predictMaintenance = this.predictMaintenance.bind(this);
    this.adjustThrottling = this.adjustThrottling.bind(this);
    this.detectFraudulentPatterns = this.detectFraudulentPatterns.bind(this);
    this.runInShadowMode = this.runInShadowMode.bind(this);
    this.tuneParameters = this.tuneParameters.bind(this);
    this.acquireDistributedLock = this.acquireDistributedLock.bind(this);
  }

  /**
   * Initialize all connections and components
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('RealTimeIntelligenceSystem: Already initialized');
      return;
    }

    try {
      this.logger.info(`RealTimeIntelligenceSystem: Initializing version ${this.version} in ${this.environment} environment`);
      this.startTime = Date.now();
      
      // Set up Prometheus metrics endpoint if in production
      if (this.isProduction) {
        this.setupMetricsEndpoint();
      }
      
      // Set up performance monitoring
      this.performanceMonitor = new PerformanceMonitor({
        metricsRegistry: this.metricsRegistry,
        serviceName: this.serviceName,
        logger: this.logger
      });
      await this.performanceMonitor.initialize();
      
      // Set up system health analyzer
      this.systemHealthAnalyzer = new SystemHealthAnalyzer({
        metricsRegistry: this.metricsRegistry,
        serviceName: this.serviceName,
        logger: this.logger,
        healthCheckInterval: this.healthCheckInterval
      });
      await this.systemHealthAnalyzer.initialize();
      
      // Initialize caching layer
      await this.cachingLayer.initialize({
        redisUrl: this.primaryRedisUrl,
        fallbackRedisUrl: this.fallbackRedisUrl,
        password: this.redisPassword,
        tls: this.redisTls,
        serviceName: this.serviceName,
        logger: this.logger,
        metricsRegistry: this.metricsRegistry
      });
      
      // Connect to MongoDB with circuit breaker
      this.circuitBreakers.mongodb = createCircuitBreaker(
        async () => {
          this.logger.info('RealTimeIntelligenceSystem: Connecting to MongoDB...');
          return mongoose.connect(this.primaryMongoUri, this.mongoConnectionOptions);
        },
        {
          name: 'mongodb-connection',
          timeout: 15000,
          errorThresholdPercentage: 30,
          resetTimeout: 30000,
          fallback: async () => {
            this.logger.warn('RealTimeIntelligenceSystem: Primary MongoDB connection failed, trying fallback...');
            return mongoose.connect(this.fallbackMongoUri, this.mongoConnectionOptions);
          }
        }
      );
      
      await this.circuitBreakers.mongodb.fire();
      this.mongoConnection = mongoose.connection;
      
      this.logger.info('RealTimeIntelligenceSystem: MongoDB connection established');
      
      // Set up Redis clients with circuit breaker
      this.circuitBreakers.redis = createCircuitBreaker(
        async () => {
          this.logger.info('RealTimeIntelligenceSystem: Connecting to Redis...');
          const client = redis.createClient({
            url: this.primaryRedisUrl,
            password: this.redisPassword,
            socket: {
              tls: this.redisTls,
              reconnectStrategy: (retries) => Math.min(retries * 50, 3000)
            }
          });
          
          // Redis error handling
          client.on('error', (err) => {
            this.logger.error(`RealTimeIntelligenceSystem: Redis error: ${err.message}`);
            // Trigger circuit breaker manually if too many errors
            if (this.redisErrorCount >= 5) {
              this.circuitBreakers.redis.open();
            }
          });
          
          client.on('reconnecting', () => {
            this.logger.warn('RealTimeIntelligenceSystem: Redis reconnecting...');
          });
          
          await client.connect();
          return client;
        },
        {
          name: 'redis-connection',
          timeout: 10000,
          errorThresholdPercentage: 30,
          resetTimeout: 30000,
          fallback: async () => {
            this.logger.warn('RealTimeIntelligenceSystem: Primary Redis connection failed, trying fallback...');
            const fallbackClient = redis.createClient({
              url: this.fallbackRedisUrl,
              password: this.redisPassword,
              socket: {
                tls: this.redisTls,
                reconnectStrategy: (retries) => Math.min(retries * 50, 3000)
              }
            });
            await fallbackClient.connect();
            return fallbackClient;
          }
        }
      );
      
      this.redisClient = await this.circuitBreakers.redis.fire();
      this.logger.info('RealTimeIntelligenceSystem: Redis connection established');
      
      // Set up a separate Redis client for pub/sub
      this.redisPubSub = redis.createClient({
        url: this.primaryRedisUrl,
        password: this.redisPassword,
        socket: {
          tls: this.redisTls,
          reconnectStrategy: (retries) => Math.min(retries * 50, 3000)
        }
      });
      await this.redisPubSub.connect();
      
      // Setup distributed locking if enabled
      if (this.distributedLockingEnabled) {
        this.setupDistributedLocking();
      }
      
      // Initialize Kafka if in production
      if (this.isProduction) {
        await this.initializeKafka();
      }
      
      // Initialize AWS services if in production
      if (this.isProduction) {
        await this.initializeAwsServices();
      }
      
      // Initialize OpenAI client for advanced analysis
      this.openaiClient = new OpenAI({
        apiKey: this.openaiApiKey
      });
      
      // Initialize Supabase client for real-time data
      this.supabaseClient = createClient(this.supabaseUrl, this.supabaseKey);
      
      // Initialize email transport if configured
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        this.emailTransport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        this.logger.info('RealTimeIntelligenceSystem: Email transport initialized');
      }
      
      // Initialize notification manager
      this.notificationManager = new NotificationManager({
        redisClient: this.redisClient,
        emailTransport: this.emailTransport,
        logger: this.logger,
        metricsRegistry: this.metricsRegistry,
        discordWebhookUrl: this.discordWebhookUrl,
        slackWebhookUrl: this.slackWebhookUrl,
        supabaseClient: this.supabaseClient,
        serviceName: this.serviceName
      });
      await this.notificationManager.initialize();
      
      // Initialize sport event manager
      this.sportEventManager = new SportEventManager({
        supportedLeagues: Object.values(LEAGUES),
        redisClient: this.redisClient,
        mongoConnection: this.mongoConnection,
        logger: this.logger,
        metricsRegistry: this.metricsRegistry
      });
      await this.sportEventManager.initialize();
      
      // Initialize WebSocket server for real-time updates
      this.webSocketServer = new WebSocketServer({
        port: process.env.WS_PORT || 8080,
        redisClient: this.redisPubSub,
        logger: this.logger,
        metricsRegistry: this.metricsRegistry,
        securityManager: this.securityManager
      });
      await this.webSocketServer.initialize();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Initialize core components
      await this.correlationAPI.initialize();
      await this.correlationEngine.initialize();
      await this.predictionEngine.initialize();
      await this.securityManager.initialize();
      await this.rateLimiter.initialize();
      await this.dataPipeline.initialize();
      await this.queryOptimizer.initialize();
      await this.bettingMarketIntegration.initialize();
      await this.fraudDetectionEngine.initialize();
      await this.backtestingEngine.initialize();
      
      // Load user subscriptions
      await this.loadUserSubscriptions();
      
      // Load tuning parameters
      await this.loadTuningParameters();
      
      // Schedule recurring tasks
      this.scheduleRecurringTasks();
      
      // Set up automated health checks
      this.intervalHandles.set('healthCheck', setInterval(this.healthCheck, this.healthCheckInterval));
      
      // Mark as initialized
      this.isInitialized = true;
      this.systemHealth = HEALTH_STATES.OPTIMAL;
      this.logger.info('RealTimeIntelligenceSystem: System initialized successfully');
      
      // Emit system status alert
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.SYSTEM_STATUS,
        priority: PRIORITY.LOW,
        title: 'Real-Time Intelligence System Initialized',
        message: `System initialized successfully in ${this.environment} environment`,
        timestamp: new Date(),
        id: uuidv4(),
        data: {
          version: this.version,
          environment: this.environment,
          region: this.deploymentRegion
        }
      });
      
    } catch (error) {
      this.systemHealth = HEALTH_STATES.CRITICAL;
      this.logger.error(`RealTimeIntelligenceSystem: Initialization failed: ${error.message}`, { error });
      
      // Attempt recovery if automatic recovery is enabled
      if (this.automaticRecoveryEnabled) {
        this.logger.info('RealTimeIntelligenceSystem: Attempting recovery after initialization failure');
        await this.attemptRecovery();
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Set up metrics endpoint for Prometheus scraping
   * @private
   */
  setupMetricsEndpoint() {
    try {
      const app = express();
      const metricsPort = process.env.METRICS_PORT || 9090;
      
      // Health check endpoint
      app.get('/health', (req, res) => {
        const healthStatus = {
          status: this.systemHealth,
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          version: this.version,
          environment: this.environment,
          region: this.deploymentRegion,
          mode: this.operationMode,
          monitoring: this.isMonitoring,
          timestamp: new Date().toISOString()
        };
        
        // Determine HTTP status code based on health state
        let statusCode = 200;
        if (this.systemHealth === HEALTH_STATES.AT_RISK) {
          statusCode = 429; // Too Many Requests
        } else if (this.systemHealth === HEALTH_STATES.CRITICAL) {
          statusCode = 503; // Service Unavailable
        } else if (this.systemHealth === HEALTH_STATES.DEGRADED) {
          statusCode = 207; // Multi-Status
        }
        
        res.status(statusCode).json(healthStatus);
      });
      
      // Metrics endpoint
      app.get('/metrics', async (req, res) => {
        try {
          res.set('Content-Type', this.metricsRegistry.contentType);
          res.end(await this.metricsRegistry.metrics());
        } catch (error) {
          this.logger.error(`Error generating metrics: ${error.message}`, { error });
          res.status(500).end('Error generating metrics');
        }
      });
      
      // Start server
      app.listen(metricsPort, () => {
        this.logger.info(`Metrics endpoint available at http://localhost:${metricsPort}/metrics`);
        this.logger.info(`Health endpoint available at http://localhost:${metricsPort}/health`);
      });
    } catch (error) {
      this.logger.error(`Failed to set up metrics endpoint: ${error.message}`, { error });
    }
  }
  
  /**
   * Setup distributed locking using Redis
   * @private
   */
  setupDistributedLocking() {
    try {
      // Create a new Redlock instance using our Redis client
      this.redlock = new Redlock(
        [this.redisClient],
        {
          // the expected clock drift; for more details see:
          // http://redis.io/topics/distlock
          driftFactor: 0.01, // time in ms
          
          // the max number of times Redlock will attempt to lock a resource
          // before failing
          retryCount: 10,
          
          // the time in ms between attempts
          retryDelay: 200, // time in ms
          
          // the max time in ms randomly added to retries
          // to improve performance under high contention
          // see https://en.wikipedia.org/wiki/Exponential_backoff
          retryJitter: 200, // time in ms
          
          // The minimum remaining time on a lock before an extension is automatically
          // attempted with the `using` API.
          automaticExtensionThreshold: 500 // time in ms
        }
      );
      
      // Set up event handlers for monitoring
      this.redlock.on('error', (error) => {
        this.logger.error(`Distributed locking error: ${error.message}`, { error });
      });
      
      this.logger.info('RealTimeIntelligenceSystem: Distributed locking initialized');
    } catch (error) {
      this.logger.error(`Failed to setup distributed locking: ${error.message}`, { error });
      // Continue despite error - system can function without distributed locking
    }
  }
  
  /**
   * Initialize Kafka producer and consumer
   * @private
   */
  async initializeKafka() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Initializing Kafka connections');
      
      // Create Kafka client
      this.kafka = new Kafka({
        clientId: this.kafkaClientId,
        brokers: this.kafkaBrokers,
        ssl: true,
        sasl: {
          mechanism: 'plain',
          username: process.env.KAFKA_USERNAME || 'sports-analytics-service',
          password: process.env.KAFKA_PASSWORD || 'kafka-complex-password-2025!'
        },
        connectionTimeout: 3000,
        requestTimeout: 30000,
        retry: {
          initialRetryTime: 100,
          retries: 8
        }
      });
      
      // Create producer with circuit breaker
      this.circuitBreakers.kafkaProducer = createCircuitBreaker(
        async () => {
          const producer = this.kafka.producer();
          await producer.connect();
          return producer;
        },
        {
          name: 'kafka-producer',
          timeout: 5000,
          errorThresholdPercentage: 50,
          resetTimeout: 10000
        }
      );
      
      this.kafkaProducer = await this.circuitBreakers.kafkaProducer.fire();
      
      // Create consumer with circuit breaker
      this.circuitBreakers.kafkaConsumer = createCircuitBreaker(
        async () => {
          const consumer = this.kafka.consumer({ groupId: this.kafkaGroupId });
          await consumer.connect();
          
          // Subscribe to relevant topics
          await consumer.subscribe({ topic: 'sports-events', fromBeginning: false });
          await consumer.subscribe({ topic: 'betting-markets', fromBeginning: false });
          await consumer.subscribe({ topic: 'system-commands', fromBeginning: false });
          
          // Set up message processing
          await consumer.run({
            eachMessage: async ({ topic, partition, message, heartbeat }) => {
              try {
                const payload = JSON.parse(message.value.toString());
                const messageId = message.headers?.id?.toString() || 'unknown';
                
                this.logger.debug(`Received Kafka message: ${messageId} from topic ${topic}`);
                
                switch (topic) {
                  case 'sports-events':
                    await this.handleSportsEventMessage(payload);
                    break;
                    
                  case 'betting-markets':
                    await this.handleBettingMarketMessage(payload);
                    break;
                    
                  case 'system-commands':
                    await this.handleSystemCommandMessage(payload);
                    break;
                    
                  default:
                    this.logger.warn(`Unknown Kafka topic: ${topic}`);
                }
                
                // Periodically send heartbeat to prevent rebalancing during long-running tasks
                await heartbeat();
              } catch (error) {
                this.logger.error(`Error processing Kafka message: ${error.message}`, { error });
              }
            },
            autoCommit: true,
            autoCommitInterval: 5000,
            autoCommitThreshold: 100
          });
          
          return consumer;
        },
        {
          name: 'kafka-consumer',
          timeout: 10000,
          errorThresholdPercentage: 50,
          resetTimeout: 10000
        }
      );
      
      this.kafkaConsumer = await this.circuitBreakers.kafkaConsumer.fire();
      
      this.logger.info('RealTimeIntelligenceSystem: Kafka connections established');
    } catch (error) {
      this.logger.error(`Failed to initialize Kafka: ${error.message}`, { error });
      // Continue despite error - system can function without Kafka
    }
  }
  
  /**
   * Initialize AWS services (SQS, CloudWatch, S3)
   * @private
   */
  async initializeAwsServices() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Initializing AWS services');
      
      // Common AWS configuration
      const awsConfig = {
        region: this.awsRegion,
        credentials: {
          accessKeyId: this.awsAccessKeyId,
          secretAccessKey: this.awsSecretAccessKey
        }
      };
      
      // Initialize SQS client
      this.sqsClient = new SQSClient(awsConfig);
      
      // Initialize CloudWatch client
      this.cloudWatchClient = new CloudWatchClient(awsConfig);
      
      // Initialize S3 client
      this.s3Client = new S3Client(awsConfig);
      
      this.logger.info('RealTimeIntelligenceSystem: AWS services initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize AWS services: ${error.message}`, { error });
      // Continue despite error - system can function without AWS services
    }
  }
  
  /**
   * Schedule recurring tasks
   * @private
   */
  scheduleRecurringTasks() {
    // Schedule health check (already set up in initialize)
    
    // Schedule maintenance prediction if enabled
    if (this.maintenancePredictionEnabled) {
      // Run maintenance prediction daily at 01:00
      cron.schedule('0 1 * * *', this.predictMaintenance);
    }
    
    // Schedule throttling adjustment if enabled
    if (this.adaptiveThrottlingEnabled) {
      // Run throttling adjustment every 15 minutes
      this.intervalHandles.set('adaptiveThrottling', setInterval(this.adjustThrottling, 15 * 60 * 1000));
    }
    
    // Schedule fraud detection if enabled
    if (this.fraudDetectionEnabled) {
      // Run fraud detection every hour
      cron.schedule('0 * * * *', this.detectFraudulentPatterns);
    }
    
    // Schedule parameter tuning if enabled
    if (this.selfTuningEnabled) {
      // Run parameter tuning daily at 02:00
      cron.schedule('0 2 * * *', this.tuneParameters);
    }
    
    // Schedule database backups
    cron.schedule('0 3 * * *', async () => {
      try {
        this.logger.info('Running scheduled database backup');
        await this.backupDatabase();
      } catch (error) {
        this.logger.error(`Database backup failed: ${error.message}`, { error });
      }
    });
    
    // Schedule memory optimization
    cron.schedule('0 4 * * *', () => {
      this.logger.info('Running scheduled memory optimization');
      global.gc && global.gc(); // Force garbage collection if available
    });
    
    // Schedule metrics aggregation and export
    cron.schedule('*/10 * * * *', async () => {
      try {
        this.logger.debug('Exporting metrics to external systems');
        await this.exportMetricsToExternalSystems();
      } catch (error) {
        this.logger.error(`Metrics export failed: ${error.message}`, { error });
      }
    });
    
    // Schedule cache warming
    cron.schedule('*/30 * * * *', async () => {
      try {
        this.logger.debug('Warming cache for frequently accessed data');
        await this.warmCache();
      } catch (error) {
        this.logger.error(`Cache warming failed: ${error.message}`, { error });
      }
    });
  }

  /**
   * Set up event listeners for alerts and notifications
   * @private
   */
  setupEventListeners() {
    // Alert generation listener
    this.eventEmitter.on('alert:generated', (alert) => {
      this.metrics.alertsGenerated++;
      this.processGeneratedAlert(alert);
      
      // Update Prometheus metrics
      this.metrics.alertsGenerated.inc({
        type: alert.type,
        priority: alert.priority,
        sport: alert.data?.sport || 'unknown',
        league: alert.data?.league || 'unknown'
      });
    });
    
    // Notification delivery listeners
    this.eventEmitter.on('notification:sent', (data) => {
      this.metrics.alertsSent++;
      this.logger.debug(`RealTimeIntelligenceSystem: Notification sent to ${data.userId} via ${data.channel}`);
      
      // Update Prometheus metrics
      this.metrics.alertsSent.inc({
        channel: data.channel,
        priority: data.priority || 'unknown'
      });
      
      // Track delivery time if provided
      if (data.deliveryTime) {
        this.metrics.notificationDeliveryTime.observe({
          channel: data.channel,
          priority: data.priority || 'unknown'
        }, data.deliveryTime / 1000); // Convert ms to seconds
      }
    });
    
    this.eventEmitter.on('notification:failed', (data) => {
      this.logger.error(`RealTimeIntelligenceSystem: Failed to send notification to ${data.userId} via ${data.channel}: ${data.error}`);
      this.metrics.totalErrors++;
    });
    
    // Opportunity detection listener
    this.eventEmitter.on('opportunity:detected', (opportunity) => {
      this.metrics.opportunitiesDetected++;
      this.handleDetectedOpportunity(opportunity);
      
      // Update Prometheus metrics
      let valueRange = 'unknown';
      if (opportunity.estimatedValue) {
        if (opportunity.estimatedValue < 0.1) valueRange = 'low';
        else if (opportunity.estimatedValue < 0.2) valueRange = 'medium';
        else valueRange = 'high';
      }
      
      this.metrics.opportunitiesDetected.inc({
        sport: opportunity.sport || 'unknown',
        league: opportunity.league || 'unknown',
        value_range: valueRange
      });
    });
    
    // Health event listeners
    this.eventEmitter.on('health:degraded', (data) => {
      this.logger.warn(`RealTimeIntelligenceSystem: Health degraded - ${data.reason}`);
      this.systemHealth = HEALTH_STATES.DEGRADED;
      
      // Update Prometheus metrics
      this.metrics.systemHealth.set({ component: data.component || 'system' }, 2);
      
      // Emit system alert
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.SYSTEM_HEALTH,
        priority: PRIORITY.MEDIUM,
        title: 'System Health Degraded',
        message: `The system health has degraded: ${data.reason}`,
        timestamp: new Date(),
        id: uuidv4(),
        data: {
          component: data.component,
          reason: data.reason,
          metrics: data.metrics
        }
      });
    });
    
    this.eventEmitter.on('health:critical', (data) => {
      this.logger.error(`RealTimeIntelligenceSystem: Health critical - ${data.reason}`);
      this.systemHealth = HEALTH_STATES.CRITICAL;
      
      // Update Prometheus metrics
      this.metrics.systemHealth.set({ component: data.component || 'system' }, 0);
      
      // Emit system alert
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.SYSTEM_HEALTH,
        priority: PRIORITY.CRITICAL,
        title: 'System Health Critical',
        message: `The system is in a critical health state: ${data.reason}`,
        timestamp: new Date(),
        id: uuidv4(),
        data: {
          component: data.component,
          reason: data.reason,
          metrics: data.metrics
        }
      });
      
      // Attempt recovery if automatic recovery is enabled
      if (this.automaticRecoveryEnabled) {
        this.attemptRecovery().catch((error) => {
          this.logger.error(`RealTimeIntelligenceSystem: Recovery attempt failed: ${error.message}`, { error });
        });
      }
    });
    
    this.eventEmitter.on('health:recovered', (data) => {
      this.logger.info(`RealTimeIntelligenceSystem: Health recovered - ${data.reason}`);
      this.systemHealth = HEALTH_STATES.HEALTHY;
      
      // Update Prometheus metrics
      this.metrics.systemHealth.set({ component: data.component || 'system' }, 3);
      
      // Emit system alert
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.SYSTEM_HEALTH,
        priority: PRIORITY.LOW,
        title: 'System Health Recovered',
        message: `The system health has recovered: ${data.reason}`,
        timestamp: new Date(),
        id: uuidv4(),
        data: {
          component: data.component,
          reason: data.reason,
          metrics: data.metrics
        }
      });
    });
    
    // Fraud detection listener
    this.eventEmitter.on('fraud:detected', (data) => {
      this.logger.warn(`RealTimeIntelligenceSystem: Fraud detected - ${data.reason}`);
      this.metrics.fraudDetections++;
      
      // Update Prometheus metrics
      this.metrics.activeFraudInvestigations.inc();
      
      // Emit fraud alert
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.FRAUD_DETECTED,
        priority: PRIORITY.HIGH,
        title: 'Possible Fraud Detected',
        message: `Suspicious activity detected: ${data.reason}`,
        timestamp: new Date(),
        id: uuidv4(),
        data: {
          type: data.type,
          reason: data.reason,
          evidence: data.evidence,
          confidence: data.confidence
        }
      });
    });
    
    // System command listener
    this.eventEmitter.on('command:received', async (command) => {
      try {
        this.logger.info(`RealTimeIntelligenceSystem: Command received - ${command.type}`);
        
        switch (command.type) {
          case 'restart':
            await this.restartSystem();
            break;
          case 'maintenance':
            await this.enterMaintenanceMode();
            break;
          case 'shadow':
            await this.toggleShadowMode(command.payload.enabled);
            break;
          case 'throttle':
            await this.setThrottling(command.payload.level);
            break;
          case 'flush_cache':
            await this.flushCache();
            break;
          default:
            this.logger.warn(`RealTimeIntelligenceSystem: Unknown command - ${command.type}`);
        }
      } catch (error) {
        this.logger.error(`RealTimeIntelligenceSystem: Error processing command: ${error.message}`, { error });
      }
    });
  }
  
  /**
   * Start the real-time monitoring process
   * @returns {Promise<void>}
   */
  async startMonitoring() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.isMonitoring) {
      this.logger.warn('RealTimeIntelligenceSystem: Monitoring already active');
      return;
    }

    try {
      this.logger.info(`RealTimeIntelligenceSystem: Starting monitoring with interval ${this.monitoringInterval}ms`);
      
      // Acquire distributed lock if enabled
      let monitoringLock = null;
      if (this.distributedLockingEnabled && this.redlock) {
        try {
          monitoringLock = await this.acquireDistributedLock('monitoring_coordinator', 10000);
          this.logger.info('RealTimeIntelligenceSystem: Acquired distributed lock for monitoring');
        } catch (lockError) {
          this.logger.warn(`RealTimeIntelligenceSystem: Failed to acquire distributed lock: ${lockError.message}`);
          // Continue without the lock - we'll coordinate through Redis
        }
      }
      
      // Run initial cycle immediately
      await this.runMonitoringCycle();
      
      // Set up interval for future cycles
      this.intervalHandles.set('monitoring', setInterval(() => {
        this.runMonitoringCycle().catch(err => {
          this.logger.error(`RealTimeIntelligenceSystem: Error in monitoring cycle: ${err.message}`, { error: err });
          this.metrics.totalErrors++;
        });
      }, this.monitoringInterval));
      
      this.isMonitoring = true;
      
      // Emit system status alert
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.SYSTEM_STATUS,
        priority: PRIORITY.LOW,
        title: 'Real-Time Intelligence System Activated',
        message: `Monitoring started with interval ${this.monitoringInterval}ms`,
        timestamp: new Date(),
        id: uuidv4(),
        data: {
          interval: this.monitoringInterval,
          mode: this.operationMode,
          shadowMode: this.shadowModeEnabled,
          adaptiveThrottling: this.adaptiveThrottlingEnabled
        }
      });
      
      // Extend or release distributed lock if we have one
      if (monitoringLock) {
        try {
          await monitoringLock.release();
        } catch (releaseError) {
          this.logger.warn(`RealTimeIntelligenceSystem: Failed to release monitoring lock: ${releaseError.message}`);
        }
      }
      
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Failed to start monitoring: ${error.message}`, { error });
      this.metrics.totalErrors++;
      throw error;
    }
  }
  
  /**
   * Stop the real-time monitoring process
   */
  stopMonitoring() {
    if (this.intervalHandles.has('monitoring')) {
      clearInterval(this.intervalHandles.get('monitoring'));
      this.intervalHandles.delete('monitoring');
    }
    
    this.isMonitoring = false;
    this.logger.info('RealTimeIntelligenceSystem: Monitoring stopped');
    
    // Emit system status alert
    this.eventEmitter.emit('alert:generated', {
      type: ALERT_TYPES.SYSTEM_STATUS,
      priority: PRIORITY.MEDIUM,
      title: 'Real-Time Intelligence System Deactivated',
      message: 'Monitoring has been stopped',
      timestamp: new Date(),
      id: uuidv4(),
      data: {
        reason: 'manual_stop',
        uptime: Math.floor((Date.now() - this.startTime) / 1000)
      }
    });
  }
  
  /**
   * Run a complete monitoring cycle with circuit breaker protection
   * @private
   * @returns {Promise<void>}
   */
  async runMonitoringCycle() {
    // Check concurrency limits
    if (this.currentMonitoringJobs >= this.maxConcurrentMonitoringJobs) {
      this.logger.warn(`RealTimeIntelligenceSystem: Max concurrent monitoring jobs reached (${this.currentMonitoringJobs})`);
      this.metrics.throttledRequests++;
      return;
    }
    
    // Increment job counter
    this.currentMonitoringJobs++;
    this.metrics.currentConcurrency = this.currentMonitoringJobs;
    
    // Track timing
    const startTime = Date.now();
    const cycleId = uuidv4().substring(0, 8);
    
    try {
      this.logger.debug(`RealTimeIntelligenceSystem: Starting monitoring cycle ${cycleId}`);
      this.metrics.monitoringCycles++;
      
      // Create circuit breaker for this monitoring cycle
      const cycleBreaker = createCircuitBreaker(
        async () => {
          // Check for correlation shifts
          const shifts = await this.monitorCorrelationShifts();
          
          // Run in shadow mode if enabled
          if (this.shadowModeEnabled) {
            await this.runInShadowMode(shifts);
          }
          
          // Generate alerts for detected shifts
          if (shifts.length > 0) {
            await this.generateAlerts(shifts);
          }
          
          return shifts.length;
        },
        {
          name: 'monitoring-cycle',
          timeout: this.monitoringInterval * 0.8, // 80% of interval
          errorThresholdPercentage: 50,
          resetTimeout: this.monitoringInterval
        }
      );
      
      // Run the monitoring cycle with circuit breaker protection
      const shiftsDetected = await cycleBreaker.fire();
      
      // Calculate processing time
      const processingTime = Date.now() - startTime;
      this.metrics.lastCycleTime = processingTime;
      
      // Update average processing time
      this.metrics.avgProcessingTime = 
        (this.metrics.avgProcessingTime * (this.metrics.monitoringCycles - 1) + processingTime) / 
        this.metrics.monitoringCycles;
      
      // Observe cycle processing time in Prometheus
      this.metrics.cycleProcessingTime.observe(processingTime / 1000); // Convert to seconds
      
      // Update resource utilization metrics
      const memoryUsage = process.memoryUsage();
      this.metrics.resourceUtilization.set({ resource_type: 'memory' }, (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
      
      // Track peak memory usage
      if (memoryUsage.heapUsed > this.metrics.peakMemoryUsage) {
        this.metrics.peakMemoryUsage = memoryUsage.heapUsed;
      }
      
      // Log status
      this.logger.info(`RealTimeIntelligenceSystem: Completed monitoring cycle ${cycleId} in ${processingTime}ms, detected ${shiftsDetected} correlation shifts`);
      
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error in monitoring cycle: ${error.message}`, { error });
      this.metrics.totalErrors++;
      
      // Emit system alert for errors
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.SYSTEM_STATUS,
        priority: PRIORITY.HIGH,
        title: 'Monitoring System Error',
        message: `Error in monitoring cycle: ${error.message}`,
        timestamp: new Date(),
        id: uuidv4(),
        data: {
          cycleId,
          error: error.message,
          stack: error.stack
        }
      });
      
      // Trigger health check to assess system state
      await this.healthCheck();
    } finally {
      // Decrement job counter
      this.currentMonitoringJobs--;
      this.metrics.currentConcurrency = this.currentMonitoringJobs;
    }
  }
  
  /**
   * Monitor for significant shifts in factor correlations
   * @returns {Promise<Array<Object>>} Detected correlation shifts
   * @private
   */
  async monitorCorrelationShifts() {
    try {
      // Get recent anomalies from the correlation engine
      const recentAnomalies = await this.correlationAPI.getAnomalousShifts({
        limit: 50,
        lookbackPeriod: '24h'
      });
      
      // Filter for significant shifts that warrant alerts
      const significantShifts = recentAnomalies.filter(anomaly => {
        // Skip if we don't have both factors
        if (!anomaly.factorA || !anomaly.factorB) {
          return false;
        }
        
        // Check if we've already alerted for this anomaly
        const anomalyKey = `${anomaly.factorA}|${anomaly.factorB}`;
        
        if (this.sentAlerts.has(anomalyKey)) {
          const lastAlertTime = this.sentAlerts.get(anomalyKey);
          
          // Only alert again if enough time has passed (throttling)
          if (Date.now() - lastAlertTime < this.alertThrottleTime) {
            return false;
          }
        }
        
        // Get the appropriate threshold for this league/sport
        let correlationThreshold = this.tuningParameters.correlationThresholds.default;
        
        if (anomaly.league && this.tuningParameters.correlationThresholds.byLeague[anomaly.league]) {
          correlationThreshold = this.tuningParameters.correlationThresholds.byLeague[anomaly.league];
        }
        
        // Keep anomalies with correlation above the threshold
        return Math.abs(anomaly.currentCorrelation) > correlationThreshold;
      });
      
      // Categorize shifts by importance
      const categorizedShifts = await Promise.all(significantShifts.map(async shift => {
        // Determine priority based on correlation strength and sports relevance
        const correlationStrength = Math.abs(shift.currentCorrelation);
        let priority = PRIORITY.LOW;
        
        if (correlationStrength > 0.8) {
          priority = PRIORITY.CRITICAL;
        } else if (correlationStrength > 0.6) {
          priority = PRIORITY.HIGH;
        } else if (correlationStrength > 0.4) {
          priority = PRIORITY.MEDIUM;
        }
        
        // Determine if this shift presents a betting opportunity
        const isOpportunity = await this.assessBettingOpportunity(shift);
        
        // Calculate confidence score
        const confidenceScore = await this.calculateConfidenceScore(shift);
        
        // Enhance with additional metadata
        const enhancedShift = {
          ...shift,
          priority,
          isOpportunity,
          confidenceScore,
          id: uuidv4(),
          analysisTimestamp: new Date().toISOString()
        };
        
        // Add ML-based prediction if available
        try {
          const prediction = await this.predictionEngine.predictOutcome(enhancedShift);
          enhancedShift.prediction = prediction;
        } catch (predictionError) {
          this.logger.warn(`Failed to generate prediction for shift: ${predictionError.message}`);
        }
        
        return enhancedShift;
      }));
      
      return categorizedShifts;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error monitoring correlation shifts: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return [];
    }
  }
  
  /**
   * Calculate confidence score for a correlation shift
   * @param {Object} shift Correlation shift data
   * @returns {Promise<number>} Confidence score between 0-100
   * @private
   */
  async calculateConfidenceScore(shift) {
    try {
      // Base confidence on correlation strength
      const correlationScore = Math.abs(shift.currentCorrelation) * 60; // Up to 60 points
      
      // Additional points for data quality
      let dataQualityScore = 0;
      if (shift.sampleSize) {
        // More data points = more confidence
        dataQualityScore = Math.min(shift.sampleSize / 10, 20); // Up to 20 points
      } else {
        dataQualityScore = 10; // Default value
      }
      
      // Historical accuracy points
      let accuracyScore = 0;
      if (shift.league && this.accuracyHistory.correlations.length > 0) {
        // Look for historical accuracy for this league
        const leagueHistory = this.accuracyHistory.correlations.filter(
          h => h.league === shift.league
        );
        
        if (leagueHistory.length > 0) {
          const averageAccuracy = leagueHistory.reduce((sum, h) => sum + h.accuracy, 0) / leagueHistory.length;
          accuracyScore = averageAccuracy * 20; // Up to 20 points
        } else {
          accuracyScore = 10; // Default value
        }
      } else {
        accuracyScore = 10; // Default value
      }
      
      // Calculate total confidence score (0-100)
      const totalScore = Math.min(Math.round(correlationScore + dataQualityScore + accuracyScore), 100);
      
      return totalScore;
    } catch (error) {
      this.logger.error(`Error calculating confidence score: ${error.message}`, { error });
      return 50; // Default moderate confidence
    }
  }
  
  /**
   * Generate alerts for detected correlation shifts
   * @param {Array<Object>} shifts Detected correlation shifts
   * @returns {Promise<void>}
   * @private
   */
  async generateAlerts(shifts) {
    try {
      // Check if we're rate-limited on alerts
      if (this.alertsInLastMinute >= this.maxAlertsPerMinute) {
        this.logger.warn(`RealTimeIntelligenceSystem: Alert rate limit reached (${this.alertsInLastMinute} alerts in the last minute)`);
        this.metrics.throttledRequests++;
        return;
      }
      
      // Update alert rate counter
      const now = Date.now();
      if (now - this.lastAlertRateCheck > 60000) {
        // Reset counter if more than a minute has passed
        this.alertsInLastMinute = 0;
        this.lastAlertRateCheck = now;
      }
      
      // Process each shift
      for (const shift of shifts) {
        // Increment alert rate counter
        this.alertsInLastMinute++;
        
        // Create alert object
        const alert = {
          id: shift.id,
          type: ALERT_TYPES.CORRELATION_SHIFT,
          priority: shift.priority,
          title: this.generateAlertTitle(shift),
          message: this.generateAlertMessage(shift),
          timestamp: new Date(),
          data: {
            factorA: shift.factorA,
            factorB: shift.factorB,
            previousCorrelation: shift.previousCorrelation,
            currentCorrelation: shift.currentCorrelation,
            correlationChange: shift.currentCorrelation - (shift.previousCorrelation || 0),
            sport: shift.sport,
            league: shift.league,
            detectedAt: shift.detectedAt,
            confidenceScore: shift.confidenceScore,
            sampleSize: shift.sampleSize,
            prediction: shift.prediction
          }
        };
        
        // Special handling for betting opportunities
        if (shift.isOpportunity) {
          // Create a separate betting opportunity alert
          const opportunityAlert = {
            id: uuidv4(),
            type: ALERT_TYPES.BETTING_OPPORTUNITY,
            priority: PRIORITY.HIGH, // Betting opportunities are high priority
            title: this.generateOpportunityTitle(shift),
            message: this.generateOpportunityMessage(shift),
            timestamp: new Date(),
            data: {
              ...shift,
              opportunityType: 'correlation_shift',
              estimatedValue: shift.opportunityValue,
              confidenceScore: shift.confidenceScore,
              expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiry
            }
          };
          
          // Emit opportunity event and alert
          this.eventEmitter.emit('opportunity:detected', opportunityAlert.data);
          this.eventEmitter.emit('alert:generated', opportunityAlert);
        }
        
        // Emit regular correlation shift alert
        this.eventEmitter.emit('alert:generated', alert);
        
        // Track this alert to prevent duplication
        const anomalyKey = `${shift.factorA}|${shift.factorB}`;
        this.sentAlerts.set(anomalyKey, Date.now());
      }
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error generating alerts: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Generate an alert title based on the correlation shift
   * @param {Object} shift Correlation shift data
   * @returns {string} Alert title
   * @private
   */
  generateAlertTitle(shift) {
    const leaguePrefix = shift.league ? `[${shift.league.toUpperCase()}] ` : '';
    const correlationDirection = shift.currentCorrelation > 0 ? 'Positive' : 'Negative';
    const correlationStrength = Math.abs(shift.currentCorrelation);
    
    let strengthDescription = 'Moderate';
    if (correlationStrength > 0.8) {
      strengthDescription = 'Very Strong';
    } else if (correlationStrength > 0.6) {
      strengthDescription = 'Strong';
    } else if (correlationStrength < 0.4) {
      strengthDescription = 'Weak';
    }
    
    return `${leaguePrefix}${strengthDescription} ${correlationDirection} Correlation: ${shift.factorA} & ${shift.factorB}`;
  }
  
  /**
   * Generate an alert message based on the correlation shift
   * @param {Object} shift Correlation shift data
   * @returns {string} Alert message
   * @private
   */
  generateAlertMessage(shift) {
    const correlationPct = (shift.currentCorrelation * 100).toFixed(1);
    const correlationDirection = shift.currentCorrelation > 0 ? 'positive' : 'negative';
    
    let message = `A ${correlationDirection} correlation of ${correlationPct}% has been detected between "${shift.factorA}" and "${shift.factorB}"`;
    
    if (shift.previousCorrelation !== undefined) {
      const previousPct = (shift.previousCorrelation * 100).toFixed(1);
      const changePct = ((shift.currentCorrelation - shift.previousCorrelation) * 100).toFixed(1);
      const changeDirection = changePct > 0 ? 'increased' : 'decreased';
      
      message += ` (${changeDirection} from ${previousPct}% by ${Math.abs(changePct)}%)`;
    }
    
    if (shift.league) {
      message += ` in ${shift.league.toUpperCase()}`;
    }
    
    if (shift.confidenceScore) {
      message += `. Confidence score: ${shift.confidenceScore}/100`;
    }
    
    if (shift.prediction) {
      message += `. Predicted outcome: ${shift.prediction.outcome} (${(shift.prediction.probability * 100).toFixed(1)}% probability)`;
    }
    
    return message;
  }
  
  /**
   * Generate opportunity title for betting opportunities
   * @param {Object} shift Correlation shift data
   * @returns {string} Opportunity title
   * @private
   */
  generateOpportunityTitle(shift) {
    const leaguePrefix = shift.league ? `[${shift.league.toUpperCase()}] ` : '';
    let valueDescription = 'Value';
    
    if (shift.opportunityValue) {
      if (shift.opportunityValue > 0.25) {
        valueDescription = 'High Value';
      } else if (shift.opportunityValue > 0.15) {
        valueDescription = 'Good Value';
      } else if (shift.opportunityValue < 0.1) {
        valueDescription = 'Marginal Value';
      }
    }
    
    return `${leaguePrefix}${valueDescription} Betting Opportunity: ${shift.factorA}`;
  }
  
  /**
   * Generate message for betting opportunity
   * @param {Object} shift Correlation shift data
   * @returns {string} Opportunity message
   * @private
   */
  generateOpportunityMessage(shift) {
    try {
      // Generate a more specific message based on the type of factors involved
      const factorA = shift.factorA.toLowerCase();
      const factorB = shift.factorB.toLowerCase();
      
      let opportunityType = '';
      
      if (factorA.includes('win') || factorB.includes('win')) {
        opportunityType = 'win prediction';
      } else if (factorA.includes('score') || factorB.includes('score') || 
                 factorA.includes('point') || factorB.includes('point')) {
        opportunityType = 'scoring prediction';
      } else if (factorA.includes('spread') || factorB.includes('spread')) {
        opportunityType = 'spread betting';
      } else if (factorA.includes('total') || factorB.includes('total') ||
                 factorA.includes('over/under') || factorB.includes('over/under')) {
        opportunityType = 'totals betting';
      } else if (factorA.includes('prop') || factorB.includes('prop')) {
        opportunityType = 'prop betting';
      } else {
        opportunityType = 'performance prediction';
      }
      
      // Value estimate
      const valueStr = shift.opportunityValue ? 
        `with estimated edge of ${(shift.opportunityValue * 100).toFixed(1)}%` : 
        'with positive expected value';
      
      let message = `Betting opportunity detected for ${opportunityType} related to "${shift.factorA}" ${valueStr}. Recent correlation shift suggests market hasn't fully adjusted.`;
      
      // Add confidence information
      if (shift.confidenceScore) {
        message += ` Confidence: ${shift.confidenceScore}/100.`;
      }
      
      // Add prediction information if available
      if (shift.prediction) {
        message += ` Predicted outcome: ${shift.prediction.outcome} (${(shift.prediction.probability * 100).toFixed(1)}% probability).`;
      }
      
      // Add time sensitivity if applicable
      if (shift.expiresAt) {
        const expiryTime = new Date(shift.expiresAt);
        const timeRemaining = Math.floor((expiryTime - new Date()) / 60000); // Minutes
        
        if (timeRemaining > 0) {
          message += ` This opportunity may expire in approximately ${timeRemaining} minutes.`;
        }
      }
      
      return message;
    } catch (error) {
      this.logger.error(`Error generating opportunity message: ${error.message}`, { error });
      return 'Betting opportunity detected based on recent correlation shift';
    }
  }
  
  /**
   * Process a generated alert
   * @param {Object} alert The alert to process
   * @private
   */
  async processGeneratedAlert(alert) {
    try {
      // Update alert counts
      this.alertCounts.total++;
      
      // Update counts by type
      if (!this.alertCounts.byType[alert.type]) {
        this.alertCounts.byType[alert.type] = 0;
      }
      this.alertCounts.byType[alert.type]++;
      
      // Update counts by priority
      if (!this.alertCounts.byPriority[alert.priority]) {
        this.alertCounts.byPriority[alert.priority] = 0;
      }
      this.alertCounts.byPriority[alert.priority]++;
      
      // Update counts by league if applicable
      if (alert.data?.league) {
        if (!this.alertCounts.byLeague[alert.data.league]) {
          this.alertCounts.byLeague[alert.data.league] = 0;
        }
        this.alertCounts.byLeague[alert.data.league]++;
      }
      
      // Update counts by sport if applicable
      if (alert.data?.sport) {
        if (!this.alertCounts.bySport[alert.data.sport]) {
          this.alertCounts.bySport[alert.data.sport] = 0;
        }
        this.alertCounts.bySport[alert.data.sport]++;
      }
      
      // Store alert in database
      await this.storeAlert(alert);
      
      // Publish to Kafka if available
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.send({
            topic: 'alerts',
            messages: [
              { 
                key: alert.id,
                value: JSON.stringify(alert),
                headers: {
                  priority: alert.priority,
                  type: alert.type,
                  timestamp: Date.now().toString()
                }
              }
            ]
          });
        } catch (kafkaError) {
          this.logger.error(`Failed to publish alert to Kafka: ${kafkaError.message}`, { error: kafkaError });
        }
      }
      
      // Find users to notify based on subscriptions
      const usersToNotify = await this.findUsersToNotify(alert);
      
      // Send notifications using the notification manager
      for (const user of usersToNotify) {
        await this.sendAlert(alert, user);
      }
      
      // Update real-time WebSocket clients
      await this.webSocketServer.broadcastAlert(alert);
      
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error processing alert: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Find users who should be notified about an alert based on their subscriptions
   * @param {Object} alert The alert to send
   * @returns {Promise<Array<Object>>} Users to notify with their preferences
   * @private
   */
  async findUsersToNotify(alert) {
    try {
      const usersToNotify = [];
      
      for (const [userId, subscription] of this.userSubscriptions.entries()) {
        // Check if user has too many pending alerts
        const userAlertCount = await this.getUserPendingAlertCount(userId);
        if (userAlertCount >= this.maxAlertsPerUser) {
          this.logger.warn(`User ${userId} has reached maximum pending alerts (${userAlertCount}/${this.maxAlertsPerUser})`);
          continue;
        }
        
        // Check if user has subscribed to this type of alert
        if (!subscription.alertTypes.includes(alert.type) && !subscription.alertTypes.includes('all')) {
          continue;
        }
        
        // Check if alert meets minimum priority threshold
        const priorityLevels = [PRIORITY.LOW, PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.CRITICAL];
        const userMinPriorityIndex = priorityLevels.indexOf(subscription.minPriority);
        const alertPriorityIndex = priorityLevels.indexOf(alert.priority);
        
        if (alertPriorityIndex < userMinPriorityIndex) {
          continue;
        }
        
        // Check if alert matches user's sports/leagues of interest
        if (alert.data && alert.data.sport && 
            subscription.sports.length > 0 && 
            !subscription.sports.includes(alert.data.sport) &&
            !subscription.sports.includes('all')) {
          continue;
        }
        
        if (alert.data && alert.data.league && 
            subscription.leagues.length > 0 && 
            !subscription.leagues.includes(alert.data.league) &&
            !subscription.leagues.includes('all')) {
          continue;
        }
        
        // Check for user-specific filters
        if (subscription.filters) {
          let passesFilters = true;
          
          // Check factor filters
          if (subscription.filters.factors && subscription.filters.factors.length > 0) {
            const factorMatch = subscription.filters.factors.some(factor => 
              alert.data?.factorA?.toLowerCase().includes(factor.toLowerCase()) || 
              alert.data?.factorB?.toLowerCase().includes(factor.toLowerCase())
            );
            
            if (!factorMatch) {
              passesFilters = false;
            }
          }
          
          // Check confidence threshold
          if (subscription.filters.minConfidence && alert.data?.confidenceScore) {
            if (alert.data.confidenceScore < subscription.filters.minConfidence) {
              passesFilters = false;
            }
          }
          
          if (!passesFilters) {
            continue;
          }
        }
        
        // User should be notified
        usersToNotify.push({
          userId,
          preferences: subscription
        });
      }
      
      return usersToNotify;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error finding users to notify: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return [];
    }
  }
  
  /**
   * Get the number of pending alerts for a user
   * @param {string} userId User ID
   * @returns {Promise<number>} Number of pending alerts
   * @private
   */
  async getUserPendingAlertCount(userId) {
    try {
      // Get count from Redis
      const count = await this.redisClient.lLen(`notifications:${userId}`);
      return count;
    } catch (error) {
      this.logger.error(`Error getting user pending alert count: ${error.message}`, { error });
      return 0;
    }
  }
  
  /**
   * Send an alert to a user via their preferred channels
   * @param {Object} alert Alert to send
   * @param {Object} user User to notify with preferences
   * @returns {Promise<void>}
   * @private
   */
  async sendAlert(alert, user) {
    try {
      // Use the notification manager to send the alert
      await this.notificationManager.sendAlert(alert, user);
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error sending alert: ${error.message}`, { error });
      this.metrics.totalErrors++;
      
      this.eventEmitter.emit('notification:failed', {
        userId: user.userId,
        channel: 'multiple',
        alertId: alert.id,
        error: error.message
      });
    }
  }
  
  /**
   * Handle detected betting opportunity
   * @param {Object} opportunity Opportunity data
   * @private
   */
  async handleDetectedOpportunity(opportunity) {
    try {
      // Store opportunity in database
      const opportunityKey = `opportunity:${opportunity.id}`;
      
      await this.redisClient.set(
        opportunityKey,
        JSON.stringify({
          ...opportunity,
          detected: new Date().toISOString(),
          status: 'active',
          expiresAt: opportunity.expiresAt || new Date(Date.now() + 43200000).toISOString() // 12 hours default expiry
        }),
        { EX: 60 * 60 * 12 } // 12 hours expiry
      );
      
      // Add to active opportunities list
      await this.redisClient.lPush('active_opportunities', opportunityKey);
      
      // Set a reminder to check the outcome of this opportunity
      const reminderKey = `opportunity_reminder:${opportunity.id}`;
      await this.redisClient.set(
        reminderKey,
        JSON.stringify({
          opportunityId: opportunity.id,
          checkAfter: new Date(Date.now() + 86400000).toISOString() // 24 hours later
        }),
        { EX: 60 * 60 * 24 } // 24 hours expiry
      );
      
      // Log relevant information
      this.logger.info(`RealTimeIntelligenceSystem: Betting opportunity detected and stored: ${opportunity.id}`, {
        sport: opportunity.sport,
        league: opportunity.league,
        estimatedValue: opportunity.estimatedValue,
        confidenceScore: opportunity.confidenceScore
      });
      
      // Send to betting market integration
      if (this.bettingMarketIntegration) {
        this.bettingMarketIntegration.processOpportunity(opportunity).catch(error => {
          this.logger.error(`Error processing opportunity with betting markets: ${error.message}`, { error });
        });
      }
      
      // Check for fraud signals
      if (this.fraudDetectionEnabled) {
        this.fraudDetectionEngine.analyzeOpportunity(opportunity).catch(error => {
          this.logger.error(`Error analyzing opportunity for fraud: ${error.message}`, { error });
        });
      }
      
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error handling betting opportunity: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Store alert in database
   * @param {Object} alert Alert to store
   * @returns {Promise<void>}
   * @private
   */
  async storeAlert(alert) {
    try {
      // Create database structure for alert
      const alertDocument = {
        ...alert,
        stored: new Date().toISOString(),
        read: false,
        acknowledged: false,
        actions: []
      };
      
      // Store in Redis with expiration
      const alertKey = `alert:${alert.id}`;
      
      await this.redisClient.set(
        alertKey,
        JSON.stringify(alertDocument),
        { EX: 60 * 60 * 24 * 30 } // 30 days expiry
      );
      
      // Add to recent alerts list with a limit
      await this.redisClient.lPush('recent_alerts', alertKey);
      await this.redisClient.lTrim('recent_alerts', 0, 999); // Keep only the 1000 most recent alerts
      
      // Store in MongoDB for long-term persistence if in production
      if (this.isProduction && this.mongoConnection) {
        const AlertModel = this.mongoConnection.model('Alert');
        await AlertModel.create(alertDocument);
      }
      
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error storing alert: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Load user subscriptions from database
   * @returns {Promise<void>}
   * @private
   */
  async loadUserSubscriptions() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Loading user subscriptions');
      
      // Clear existing subscriptions
      this.userSubscriptions.clear();
      
      if (this.isProduction && this.mongoConnection) {
        // Load from MongoDB in production
        const UserSubscriptionModel = this.mongoConnection.model('UserSubscription');
        const subscriptions = await UserSubscriptionModel.find({ active: true });
        
        subscriptions.forEach(subscription => {
          this.userSubscriptions.set(subscription.userId, subscription.toObject());
        });
        
        this.logger.info(`RealTimeIntelligenceSystem: Loaded ${subscriptions.length} user subscriptions from database`);
      } else {
        // Create sample subscriptions for development
        this.userSubscriptions = new Map([
          ['user1', {
            userId: 'user1',
            alertTypes: ['all'],
            minPriority: PRIORITY.MEDIUM,
            sports: ['all'],
            leagues: ['all'],
            channels: [CHANNELS.WEB, CHANNELS.EMAIL],
            filters: {
              factors: [],
              minConfidence: 60
            }
          }],
          ['user2', {
            userId: 'user2',
            alertTypes: [ALERT_TYPES.BETTING_OPPORTUNITY, ALERT_TYPES.CORRELATION_SHIFT],
            minPriority: PRIORITY.HIGH,
            sports: [SPORTS.BASKETBALL, SPORTS.FOOTBALL],
            leagues: [LEAGUES.NBA, LEAGUES.NFL],
            channels: [CHANNELS.WEB, CHANNELS.MOBILE],
            filters: {
              factors: ['shooting', 'scoring', 'defense'],
              minConfidence: 75
            }
          }],
          ['user3', {
            userId: 'user3',
            alertTypes: [ALERT_TYPES.BETTING_OPPORTUNITY],
            minPriority: PRIORITY.MEDIUM,
            sports: [SPORTS.SOCCER],
            leagues: [LEAGUES.PREMIER_LEAGUE, LEAGUES.LA_LIGA, LEAGUES.BUNDESLIGA, LEAGUES.SERIE_A],
            channels: [CHANNELS.EMAIL, CHANNELS.SMS, CHANNELS.API],
            filters: {
              factors: ['goal', 'possession', 'passes'],
              minConfidence: 70
            }
          }],
          ['admin', {
            userId: 'admin',
            alertTypes: ['all'],
            minPriority: PRIORITY.LOW,
            sports: ['all'],
            leagues: ['all'],
            channels: [CHANNELS.WEB, CHANNELS.EMAIL, CHANNELS.SLACK],
            filters: {
              minConfidence: 0 // Receive all alerts
            },
            isAdmin: true
          }]
        ]);
        
        this.logger.info(`RealTimeIntelligenceSystem: Created ${this.userSubscriptions.size} sample user subscriptions`);
      }
      
      // Update active users metric
      const subscriptionsByTier = _.groupBy(Array.from(this.userSubscriptions.values()), 'tier');
      Object.entries(subscriptionsByTier).forEach(([tier, users]) => {
        this.metrics.activeUsers.set({ subscription_tier: tier || 'standard' }, users.length);
      });
      
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error loading user subscriptions: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Load tuning parameters from database
   * @returns {Promise<void>}
   * @private
   */
  async loadTuningParameters() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Loading tuning parameters');
      
      if (this.isProduction && this.mongoConnection) {
        // Load from MongoDB in production
        const TuningParametersModel = this.mongoConnection.model('TuningParameters');
        const parameters = await TuningParametersModel.findOne({ active: true });
        
        if (parameters) {
          this.tuningParameters = parameters.parameters;
          this.logger.info('RealTimeIntelligenceSystem: Loaded tuning parameters from database');
        } else {
          // Save default parameters
          await TuningParametersModel.create({
            active: true,
            parameters: this.tuningParameters,
            createdAt: new Date()
          });
          this.logger.info('RealTimeIntelligenceSystem: Created default tuning parameters in database');
        }
      } else {
        // Set up default league-specific thresholds for development
        this.tuningParameters.correlationThresholds.byLeague = {
          [LEAGUES.NBA]: 0.45,
          [LEAGUES.NFL]: 0.40,
          [LEAGUES.MLB]: 0.50,
          [LEAGUES.NHL]: 0.45,
          [LEAGUES.PREMIER_LEAGUE]: 0.42,
          [LEAGUES.LA_LIGA]: 0.42,
          [LEAGUES.BUNDESLIGA]: 0.44,
          [LEAGUES.SERIE_A]: 0.44
        };
        
        this.tuningParameters.anomalyThresholds.byLeague = {
          [LEAGUES.NBA]: 2.8,
          [LEAGUES.NFL]: 2.5,
          [LEAGUES.MLB]: 3.2,
          [LEAGUES.NHL]: 2.8,
          [LEAGUES.PREMIER_LEAGUE]: 2.7,
          [LEAGUES.LA_LIGA]: 2.7,
          [LEAGUES.BUNDESLIGA]: 3.0,
          [LEAGUES.SERIE_A]: 3.0
        };
        
        this.logger.info('RealTimeIntelligenceSystem: Using default tuning parameters');
      }
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error loading tuning parameters: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Assess if a correlation shift presents a betting opportunity
   * @param {Object} shift Correlation shift data
   * @returns {Promise<boolean>} True if this presents a betting opportunity
   * @private
   */
  async assessBettingOpportunity(shift) {
    try {
      // 1. Correlation must be strong enough to be meaningful
      const leagueThreshold = shift.league && this.tuningParameters.correlationThresholds.byLeague[shift.league]
        ? this.tuningParameters.correlationThresholds.byLeague[shift.league]
        : this.tuningParameters.correlationThresholds.default;
        
      if (Math.abs(shift.currentCorrelation) < leagueThreshold) {
        return false;
      }
      
      // 2. The shift should be recent
      const shiftAge = Date.now() - new Date(shift.detectedAt || Date.now()).getTime();
      if (shiftAge > 24 * 60 * 60 * 1000) { // Older than 24 hours
        return false;
      }
      
      // 3. Check if we need market odds for validation
      if (this.bettingMarketIntegration && this.isProduction) {
        try {
          // Get market odds for this opportunity
          const marketData = await this.bettingMarketIntegration.getRelevantMarketOdds({
            sport: shift.sport,
            league: shift.league,
            factorA: shift.factorA,
            factorB: shift.factorB
          });
          
          // Use the market data to determine if there's an opportunity
          const opportunityAnalysis = await this.bettingMarketIntegration.analyzeOpportunity(shift, marketData);
          
          if (opportunityAnalysis.isOpportunity) {
            // Add opportunity value from market analysis
            shift.opportunityValue = opportunityAnalysis.estimatedValue;
            shift.marketOdds = opportunityAnalysis.marketOdds;
            shift.recommendedAction = opportunityAnalysis.recommendedAction;
            shift.opportunityExpiry = opportunityAnalysis.expiryTime;
            return true;
          }
          
          return false;
        } catch (marketError) {
          this.logger.warn(`Failed to get market data for opportunity assessment: ${marketError.message}`);
          // Continue with simpler heuristics
        }
      }
      
      // 4. Fallback to simpler heuristics when market data is unavailable
      // Calculate opportunity score based on correlation strength and recency
      const correlationScore = Math.abs(shift.currentCorrelation) * 0.7; // 0-0.7 points
      
      // Add recency bonus (0-0.2 points)
      let recencyScore = 0;
      if (shiftAge < 3 * 60 * 60 * 1000) { // Less than 3 hours old
        recencyScore = 0.2;
      } else if (shiftAge < 12 * 60 * 60 * 1000) { // Less than 12 hours old
        recencyScore = 0.1;
      }
      
      // Add magnitude of change bonus if available (0-0.1 points)
      let changeScore = 0;
      if (shift.previousCorrelation !== undefined) {
        const changeAmount = Math.abs(shift.currentCorrelation - shift.previousCorrelation);
        changeScore = Math.min(changeAmount, 0.1);
      }
      
      // Calculate total opportunity score
      const opportunityScore = correlationScore + recencyScore + changeScore;
      
      // Determine if this is an opportunity
      const hasOpportunity = opportunityScore > 0.6;
      
      if (hasOpportunity) {
        // Calculate a reasonable opportunity value based on the score
        shift.opportunityValue = Math.min(opportunityScore - 0.4, 0.3); // 0.1-0.3 range
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error assessing betting opportunity: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return false;
    }
  }
  
  /**
   * Get active alerts
   * @param {Object} options Filter options
   * @returns {Promise<Array<Object>>} Active alerts
   */
  async getActiveAlerts(options = {}) {
    try {
      const alerts = [];
      
      // Get alert keys from Redis
      let alertKeys;
      if (options.userId) {
        // Get user-specific alerts
        alertKeys = await this.redisClient.lRange(`user_alerts:${options.userId}`, 0, -1);
      } else {
        // Get general alert keys
        alertKeys = await this.redisClient.lRange('recent_alerts', 0, options.limit || 100);
      }
      
      // Fetch alert data
      const pipeline = this.redisClient.multi();
      alertKeys.forEach(key => {
        pipeline.get(key);
      });
      
      const alertJsons = await pipeline.exec();
      
      // Parse and filter alerts
      for (let i = 0; i < alertJsons.length; i++) {
        const alertJson = alertJsons[i];
        
        if (alertJson) {
          try {
            const alert = JSON.parse(alertJson);
            
            // Apply filters
            if (options.types && options.types.length > 0) {
              if (!options.types.includes(alert.type)) continue;
            }
            
            if (options.priority) {
              if (alert.priority !== options.priority) continue;
            }
            
            if (options.since) {
              if (new Date(alert.timestamp) < new Date(options.since)) continue;
            }
            
            if (options.sports && options.sports.length > 0) {
              if (!alert.data || !alert.data.sport || !options.sports.includes(alert.data.sport)) continue;
            }
            
            if (options.leagues && options.leagues.length > 0) {
              if (!alert.data || !alert.data.league || !options.leagues.includes(alert.data.league)) continue;
            }
            
            alerts.push(alert);
          } catch (parseError) {
            this.logger.error(`RealTimeIntelligenceSystem: Error parsing alert data: ${parseError.message}`, { error: parseError });
            this.metrics.totalErrors++;
          }
        }
      }
      
      // Sort by timestamp (newest first)
      alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Apply limit
      if (options.limit && options.limit > 0) {
        return alerts.slice(0, options.limit);
      }
      
      return alerts;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error getting active alerts: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return [];
    }
  }
  
  /**
   * Get active betting opportunities
   * @param {Object} options Filter options
   * @returns {Promise<Array<Object>>} Active opportunities
   */
  async getActiveBettingOpportunities(options = {}) {
    try {
      const opportunities = [];
      
      // Get opportunity keys from Redis
      const opportunityKeys = await this.redisClient.lRange('active_opportunities', 0, -1);
      
      // Fetch opportunity data in bulk
      const pipeline = this.redisClient.multi();
      opportunityKeys.forEach(key => {
        pipeline.get(key);
      });
      
      const opportunityJsons = await pipeline.exec();
      
      // Parse and filter opportunities
      for (let i = 0; i < opportunityJsons.length; i++) {
        const opportunityJson = opportunityJsons[i];
        
        if (opportunityJson) {
          try {
            const opportunity = JSON.parse(opportunityJson);
            
            // Check if expired
            if (opportunity.expiresAt && new Date(opportunity.expiresAt) < new Date()) {
              // Remove from active list
              await this.redisClient.lRem('active_opportunities', 0, opportunityKeys[i]);
              continue;
            }
            
            // Apply filters
            if (options.sport && opportunity.sport) {
              if (opportunity.sport !== options.sport) continue;
            }
            
            if (options.league && opportunity.league) {
              if (opportunity.league !== options.league) continue;
            }
            
            if (options.minValue && opportunity.estimatedValue) {
              if (opportunity.estimatedValue < options.minValue) continue;
            }
            
            if (options.minConfidence && opportunity.confidenceScore) {
              if (opportunity.confidenceScore < options.minConfidence) continue;
            }
            
            opportunities.push(opportunity);
          } catch (parseError) {
            this.logger.error(`RealTimeIntelligenceSystem: Error parsing opportunity data: ${parseError.message}`, { error: parseError });
            this.metrics.totalErrors++;
          }
        }
      }
      
      // Sort by value (highest first)
      opportunities.sort((a, b) => {
        // First by confidence
        const confA = a.confidenceScore || 0;
        const confB = b.confidenceScore || 0;
        
        // Then by value
        const valA = a.estimatedValue || 0;
        const valB = b.estimatedValue || 0;
        
        // Combined score weighing both factors
        return (confB * 0.7 + valB * 100 * 0.3) - (confA * 0.7 + valA * 100 * 0.3);
      });
      
      // Apply limit
      if (options.limit && options.limit > 0) {
        return opportunities.slice(0, options.limit);
      }
      
      return opportunities;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error getting active opportunities: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return [];
    }
  }
  
  /**
   * Subscribe user to alerts
   * @param {string} userId User ID
   * @param {Object} preferences Subscription preferences
   * @returns {Promise<Object>} Updated subscription
   */
  async subscribeUser(userId, preferences) {
    try {
      // Validate preferences
      if (!preferences.alertTypes || !Array.isArray(preferences.alertTypes)) {
        preferences.alertTypes = ['all'];
      }
      
      if (!preferences.minPriority) {
        preferences.minPriority = PRIORITY.MEDIUM;
      }
      
      if (!preferences.sports || !Array.isArray(preferences.sports)) {
        preferences.sports = ['all'];
      }
      
      if (!preferences.leagues || !Array.isArray(preferences.leagues)) {
        preferences.leagues = ['all'];
      }
      
      if (!preferences.channels || !Array.isArray(preferences.channels)) {
        preferences.channels = [CHANNELS.WEB];
      }
      
      // Create subscription object
      const subscription = {
        userId,
        ...preferences,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        active: true
      };
      
      // Update subscription
      this.userSubscriptions.set(userId, subscription);
      
      // Persist to database if in production
      if (this.isProduction && this.mongoConnection) {
        const UserSubscriptionModel = this.mongoConnection.model('UserSubscription');
        await UserSubscriptionModel.updateOne(
          { userId },
          subscription,
          { upsert: true }
        );
      }
      
      this.logger.info(`RealTimeIntelligenceSystem: User ${userId} subscribed to alerts`);
      
      // Update active users metric
      const subscriptionsByTier = _.groupBy(Array.from(this.userSubscriptions.values()), 'tier');
      Object.entries(subscriptionsByTier).forEach(([tier, users]) => {
        this.metrics.activeUsers.set({ subscription_tier: tier || 'standard' }, users.length);
      });
      
      return this.userSubscriptions.get(userId);
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error subscribing user: ${error.message}`, { error });
      this.metrics.totalErrors++;
      throw error;
    }
  }
  
  /**
   * Unsubscribe user from alerts
   * @param {string} userId User ID
   * @returns {Promise<boolean>} Success status
   */
  async unsubscribeUser(userId) {
    try {
      const removed = this.userSubscriptions.delete(userId);
      
      // Update database if in production
      if (this.isProduction && this.mongoConnection) {
        const UserSubscriptionModel = this.mongoConnection.model('UserSubscription');
        await UserSubscriptionModel.updateOne(
          { userId },
          { active: false, deactivatedAt: new Date().toISOString() }
        );
      }
      
      this.logger.info(`RealTimeIntelligenceSystem: User ${userId} unsubscribed from alerts`);
      
      // Update active users metric
      const subscriptionsByTier = _.groupBy(Array.from(this.userSubscriptions.values()), 'tier');
      Object.entries(subscriptionsByTier).forEach(([tier, users]) => {
        this.metrics.activeUsers.set({ subscription_tier: tier || 'standard' }, users.length);
      });
      
      return removed;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error unsubscribing user: ${error.message}`, { error });
      this.metrics.totalErrors++;
      throw error;
    }
  }
  
  /**
   * Get system metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    // Calculate system uptime
    this.metrics.systemUptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    return {
      ...this.metrics,
      alertCounts: this.alertCounts,
      userCount: this.userSubscriptions.size,
      isActive: this.isMonitoring,
      systemHealth: this.systemHealth,
      operationMode: this.operationMode,
      startTime: this.startTime,
      lastRestartTime: this.lastRestartTime,
      version: this.version,
      environment: this.environment,
      region: this.deploymentRegion,
      lastUpdated: new Date().toISOString()
    };
  }
  
  /**
   * Perform system health check
   * @returns {Promise<Object>} Health status
   * @private
   */
  async healthCheck() {
    try {
      this.logger.debug('RealTimeIntelligenceSystem: Performing health check');
      
      // Collect health data
      const healthData = {
        services: {},
        resources: {},
        components: {},
        overall: HEALTH_STATES.OPTIMAL
      };
      
      // Check Redis connection
      healthData.services.redis = { status: HEALTH_STATES.OPTIMAL };
      try {
        await this.redisClient.ping();
      } catch (redisError) {
        healthData.services.redis = { 
          status: HEALTH_STATES.CRITICAL,
          error: redisError.message
        };
        healthData.overall = HEALTH_STATES.CRITICAL;
      }
      
      // Check MongoDB connection
      healthData.services.mongodb = { status: HEALTH_STATES.OPTIMAL };
      try {
        await this.mongoConnection.db.admin().ping();
      } catch (mongoError) {
        healthData.services.mongodb = { 
          status: HEALTH_STATES.CRITICAL,
          error: mongoError.message
        };
        healthData.overall = HEALTH_STATES.CRITICAL;
      }
      
      // Check Kafka connection if available
      if (this.kafkaProducer) {
        healthData.services.kafka = { status: HEALTH_STATES.OPTIMAL };
        try {
          const metadata = await this.kafkaProducer.getTopicMetadata({
            topics: ['alerts']
          });
          
          if (!metadata.topics.length) {
            healthData.services.kafka = { 
              status: HEALTH_STATES.DEGRADED,
              error: 'Topic metadata empty'
            };
            
            if (healthData.overall === HEALTH_STATES.OPTIMAL) {
              healthData.overall = HEALTH_STATES.DEGRADED;
            }
          }
        } catch (kafkaError) {
          healthData.services.kafka = { 
            status: HEALTH_STATES.CRITICAL,
            error: kafkaError.message
          };
          
          if (healthData.overall === HEALTH_STATES.OPTIMAL) {
            healthData.overall = HEALTH_STATES.DEGRADED;
          }
        }
      }
      
      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      healthData.resources.memory = { 
        status: HEALTH_STATES.OPTIMAL,
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: heapUsedPercentage
      };
      
      if (heapUsedPercentage > 90) {
        healthData.resources.memory.status = HEALTH_STATES.CRITICAL;
        if (healthData.overall === HEALTH_STATES.OPTIMAL) {
          healthData.overall = HEALTH_STATES.AT_RISK;
        }
      } else if (heapUsedPercentage > 75) {
        healthData.resources.memory.status = HEALTH_STATES.AT_RISK;
        if (healthData.overall === HEALTH_STATES.OPTIMAL) {
          healthData.overall = HEALTH_STATES.AT_RISK;
        }
      } else if (heapUsedPercentage > 60) {
        healthData.resources.memory.status = HEALTH_STATES.DEGRADED;
        if (healthData.overall === HEALTH_STATES.OPTIMAL) {
          healthData.overall = HEALTH_STATES.DEGRADED;
        }
      }
      
      // Check component health
      // Correlation API
      healthData.components.correlationAPI = { status: HEALTH_STATES.OPTIMAL };
      try {
        await this.correlationAPI.healthCheck();
      } catch (apiError) {
        healthData.components.correlationAPI = { 
          status: HEALTH_STATES.DEGRADED,
          error: apiError.message
        };
        
        if (healthData.overall === HEALTH_STATES.OPTIMAL) {
          healthData.overall = HEALTH_STATES.DEGRADED;
        }
      }
      
      // Update system health state based on overall assessment
      this.systemHealth = healthData.overall;
      
      // Update health metrics
      Object.entries(healthData.services).forEach(([service, data]) => {
        const healthValue = this.healthStateToValue(data.status);
        this.metrics.systemHealth.set({ component: `service:${service}` }, healthValue);
      });
      
      Object.entries(healthData.resources).forEach(([resource, data]) => {
        const healthValue = this.healthStateToValue(data.status);
        this.metrics.systemHealth.set({ component: `resource:${resource}` }, healthValue);
        
        if (resource === 'memory' && data.percentage) {
          this.metrics.resourceUtilization.set({ resource_type: resource }, data.percentage);
        }
      });
      
      Object.entries(healthData.components).forEach(([component, data]) => {
        const healthValue = this.healthStateToValue(data.status);
        this.metrics.systemHealth.set({ component: `component:${component}` }, healthValue);
      });
      
      // Overall system health
      this.metrics.systemHealth.set({ component: 'system' }, this.healthStateToValue(healthData.overall));
      
      // Log health status
      if (healthData.overall !== HEALTH_STATES.OPTIMAL) {
        this.logger.warn(`RealTimeIntelligenceSystem: Health check detected issues. Status: ${healthData.overall}`);
        
        // Emit health event
        if (healthData.overall === HEALTH_STATES.CRITICAL) {
          this.eventEmitter.emit('health:critical', {
            reason: 'Health check detected critical issues',
            component: 'system',
            metrics: healthData
          });
        } else if (healthData.overall === HEALTH_STATES.AT_RISK || healthData.overall === HEALTH_STATES.DEGRADED) {
          this.eventEmitter.emit('health:degraded', {
            reason: 'Health check detected performance degradation',
            component: 'system',
            metrics: healthData
          });
        }
        
        // Attempt recovery if necessary
        if (healthData.overall === HEALTH_STATES.CRITICAL && this.automaticRecoveryEnabled) {
          await this.attemptRecovery();
        }
      } else {
        this.logger.debug('RealTimeIntelligenceSystem: Health check passed');
      }
      
      return healthData;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Health check failed: ${error.message}`, { error });
      this.metrics.totalErrors++;
      
      // Assume critical state if health check itself fails
      this.systemHealth = HEALTH_STATES.CRITICAL;
      this.metrics.systemHealth.set({ component: 'system' }, this.healthStateToValue(HEALTH_STATES.CRITICAL));
      
      // Emit critical health event
      this.eventEmitter.emit('health:critical', {
        reason: `Health check failed: ${error.message}`,
        component: 'system',
        metrics: { error: error.message }
      });
      
      // Attempt recovery if enabled
      if (this.automaticRecoveryEnabled) {
        await this.attemptRecovery();
      }
      
      return {
        overall: HEALTH_STATES.CRITICAL,
        error: error.message
      };
    }
  }
  
  /**
   * Convert health state to numeric value for metrics
   * @param {string} state Health state
   * @returns {number} Numeric value
   * @private
   */
  healthStateToValue(state) {
    switch (state) {
      case HEALTH_STATES.OPTIMAL:
        return 4;
      case HEALTH_STATES.HEALTHY:
        return 3;
      case HEALTH_STATES.DEGRADED:
        return 2;
      case HEALTH_STATES.AT_RISK:
        return 1;
      case HEALTH_STATES.CRITICAL:
        return 0;
      default:
        return 0;
    }
  }
  
  /**
   * Attempt to recover the system from failure
   * @returns {Promise<boolean>} Recovery success
   * @private
   */
  async attemptRecovery() {
    this.logger.info('RealTimeIntelligenceSystem: Attempting system recovery');
    this.metrics.recoveryAttempts++;
    
    try {
      // Switch to recovery mode
      this.operationMode = OPERATION_MODES.RECOVERY;
      
      // Stop monitoring temporarily
      const wasMonitoring = this.isMonitoring;
      if (wasMonitoring) {
        this.stopMonitoring();
      }
      
      // List of recovery actions with increasing severity
      const recoveryActions = [
        this.reconnectRedis.bind(this),
        this.reconnectMongoDB.bind(this),
        this.restartComponents.bind(this),
        this.fullRestart.bind(this)
      ];
      
      // Try each recovery action until one succeeds
      for (let i = 0; i < recoveryActions.length; i++) {
        try {
          this.logger.info(`RealTimeIntelligenceSystem: Attempting recovery action ${i + 1}/${recoveryActions.length}`);
          await recoveryActions[i]();
          
          // Verify system health after recovery action
          const healthData = await this.healthCheck();
          
          if (healthData.overall !== HEALTH_STATES.CRITICAL) {
            // Recovery successful
            this.logger.info(`RealTimeIntelligenceSystem: Recovery successful. System health: ${healthData.overall}`);
            this.metrics.successfulRecoveries++;
            
            // Emit recovery event
            this.eventEmitter.emit('health:recovered', {
              reason: `System recovered after recovery action ${i + 1}`,
              component: 'system',
              metrics: healthData
            });
            
            // Restart monitoring if it was active
            if (wasMonitoring) {
              await this.startMonitoring();
            }
            
            // Return to normal mode
            this.operationMode = OPERATION_MODES.NORMAL;
            
            return true;
          }
        } catch (actionError) {
          this.logger.error(`RealTimeIntelligenceSystem: Recovery action ${i + 1} failed: ${actionError.message}`, { error: actionError });
        }
      }
      
      // All recovery actions failed
      this.logger.error('RealTimeIntelligenceSystem: All recovery actions failed');
      
      // Switch to degraded mode
      this.operationMode = OPERATION_MODES.DEGRADED;
      this.systemHealth = HEALTH_STATES.CRITICAL;
      
      // Notify administrators
      this.eventEmitter.emit('alert:generated', {
        type: ALERT_TYPES.SYSTEM_STATUS,
        priority: PRIORITY.CRITICAL,
        title: 'System Recovery Failed',
        message: 'All automatic recovery actions failed. Manual intervention required.',
        timestamp: new Date(),
        id: uuidv4()
      });
      
      return false;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Recovery attempt failed: ${error.message}`, { error });
      this.systemHealth = HEALTH_STATES.CRITICAL;
      this.operationMode = OPERATION_MODES.DEGRADED;
      return false;
    }
  }
  
  /**
   * Reconnect to Redis
   * @returns {Promise<void>}
   * @private
   */
  async reconnectRedis() {
    this.logger.info('RealTimeIntelligenceSystem: Attempting to reconnect to Redis');
    
    try {
      // Disconnect existing client if connected
      if (this.redisClient) {
        try {
          await this.redisClient.disconnect();
        } catch (disconnectError) {
          this.logger.warn(`Error disconnecting Redis: ${disconnectError.message}`);
        }
      }
      
      // Create new Redis client
      this.redisClient = redis.createClient({
        url: this.primaryRedisUrl,
        password: this.redisPassword,
        socket: {
          tls: this.redisTls,
          reconnectStrategy: (retries) => Math.min(retries * 50, 3000)
        }
      });
      
      // Connect to Redis
      await this.redisClient.connect();
      
      // Test the connection
      await this.redisClient.ping();
      
      // Reconnect pub/sub client
      if (this.redisPubSub) {
        try {
          await this.redisPubSub.disconnect();
        } catch (disconnectError) {
          this.logger.warn(`Error disconnecting Redis PubSub: ${disconnectError.message}`);
        }
        
        this.redisPubSub = redis.createClient({
          url: this.primaryRedisUrl,
          password: this.redisPassword,
          socket: {
            tls: this.redisTls,
            reconnectStrategy: (retries) => Math.min(retries * 50, 3000)
          }
        });
        
        await this.redisPubSub.connect();
      }
      
      // Re-initialize distributed locking if enabled
      if (this.distributedLockingEnabled) {
        this.setupDistributedLocking();
      }
      
      this.logger.info('RealTimeIntelligenceSystem: Successfully reconnected to Redis');
    } catch (error) {
      this.logger.error(`Failed to reconnect to Redis: ${error.message}`, { error });
      
      // Try fallback server
      try {
        this.logger.info('RealTimeIntelligenceSystem: Attempting to connect to fallback Redis server');
        
        this.redisClient = redis.createClient({
          url: this.fallbackRedisUrl,
          password: this.redisPassword,
          socket: {
            tls: this.redisTls,
            reconnectStrategy: (retries) => Math.min(retries * 50, 3000)
          }
        });
        
        await this.redisClient.connect();
        
        // Test the connection
        await this.redisClient.ping();
        
        this.logger.info('RealTimeIntelligenceSystem: Successfully connected to fallback Redis server');
      } catch (fallbackError) {
        this.logger.error(`Failed to connect to fallback Redis server: ${fallbackError.message}`, { error: fallbackError });
        throw new Error('Redis reconnection failed for both primary and fallback servers');
      }
    }
  }
  
  /**
   * Reconnect to MongoDB
   * @returns {Promise<void>}
   * @private
   */
  async reconnectMongoDB() {
    this.logger.info('RealTimeIntelligenceSystem: Attempting to reconnect to MongoDB');
    
    try {
      // Close existing connection if exists
      if (mongoose.connection.readyState !== 0) {
        try {
          await mongoose.disconnect();
        } catch (disconnectError) {
          this.logger.warn(`Error disconnecting MongoDB: ${disconnectError.message}`);
        }
      }
      
      // Connect to MongoDB
      await mongoose.connect(this.primaryMongoUri, this.mongoConnectionOptions);
      this.mongoConnection = mongoose.connection;
      
      // Test the connection
      await this.mongoConnection.db.admin().ping();
      
      this.logger.info('RealTimeIntelligenceSystem: Successfully reconnected to MongoDB');
    } catch (error) {
      this.logger.error(`Failed to reconnect to MongoDB: ${error.message}`, { error });
      
      // Try fallback server
      try {
        this.logger.info('RealTimeIntelligenceSystem: Attempting to connect to fallback MongoDB server');
        
        await mongoose.connect(this.fallbackMongoUri, this.mongoConnectionOptions);
        this.mongoConnection = mongoose.connection;
        
        // Test the connection
        await this.mongoConnection.db.admin().ping();
        
        this.logger.info('RealTimeIntelligenceSystem: Successfully connected to fallback MongoDB server');
      } catch (fallbackError) {
        this.logger.error(`Failed to connect to fallback MongoDB server: ${fallbackError.message}`, { error: fallbackError });
        throw new Error('MongoDB reconnection failed for both primary and fallback servers');
      }
    }
  }
  
  /**
   * Restart system components
   * @returns {Promise<void>}
   * @private
   */
  async restartComponents() {
    this.logger.info('RealTimeIntelligenceSystem: Restarting system components');
    
    try {
      // 1. Stop all interval tasks
      for (const [name, handle] of this.intervalHandles.entries()) {
        clearInterval(handle);
      }
      this.intervalHandles.clear();
      
      // 2. Reset circuit breakers
      Object.values(this.circuitBreakers).forEach(breaker => {
        breaker.close();
      });
      
      // 3. Restart services in sequence
      
      // Notification manager
      try {
        await this.notificationManager.shutdown();
        await this.notificationManager.initialize();
        this.logger.info('RealTimeIntelligenceSystem: Notification manager restarted');
      } catch (error) {
        this.logger.error(`Failed to restart notification manager: ${error.message}`, { error });
      }
      
      // Sport event manager
      try {
        await this.sportEventManager.shutdown();
        await this.sportEventManager.initialize();
        this.logger.info('RealTimeIntelligenceSystem: Sport event manager restarted');
      } catch (error) {
        this.logger.error(`Failed to restart sport event manager: ${error.message}`, { error });
      }
      
      // WebSocket server
      try {
        await this.webSocketServer.shutdown();
        await this.webSocketServer.initialize();
        this.logger.info('RealTimeIntelligenceSystem: WebSocket server restarted');
      } catch (error) {
        this.logger.error(`Failed to restart WebSocket server: ${error.message}`, { error });
      }
      
      // Correlation API
      try {
        await this.correlationAPI.shutdown();
        await this.correlationAPI.initialize();
        this.logger.info('RealTimeIntelligenceSystem: Correlation API restarted');
      } catch (error) {
        this.logger.error(`Failed to restart correlation API: ${error.message}`, { error });
      }
      
      // Correlation engine
      try {
        await this.correlationEngine.shutdown();
        await this.correlationEngine.initialize();
        this.logger.info('RealTimeIntelligenceSystem: Correlation engine restarted');
      } catch (error) {
        this.logger.error(`Failed to restart correlation engine: ${error.message}`, { error });
      }
      
      // Prediction engine
      try {
        await this.predictionEngine.shutdown();
        await this.predictionEngine.initialize();
        this.logger.info('RealTimeIntelligenceSystem: Prediction engine restarted');
      } catch (error) {
        this.logger.error(`Failed to restart prediction engine: ${error.message}`, { error });
      }
      
      // Re-initialize Kafka if in production
      if (this.isProduction) {
        try {
          // Disconnect existing clients
          if (this.kafkaProducer) {
            await this.kafkaProducer.disconnect();
          }
          
          if (this.kafkaConsumer) {
            await this.kafkaConsumer.disconnect();
          }
          
          // Re-initialize
          await this.initializeKafka();
          this.logger.info('RealTimeIntelligenceSystem: Kafka connections restarted');
        } catch (error) {
          this.logger.error(`Failed to restart Kafka connections: ${error.message}`, { error });
        }
      }
      
      // 4. Re-schedule recurring tasks
      this.scheduleRecurringTasks();
      
      // 5. Update restart timestamp
      this.lastRestartTime = Date.now();
      
      this.logger.info('RealTimeIntelligenceSystem: Components restarted successfully');
    } catch (error) {
      this.logger.error(`Failed to restart components: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Perform full system restart
   * @returns {Promise<void>}
   * @private
   */
  async fullRestart() {
    this.logger.info('RealTimeIntelligenceSystem: Performing full system restart');
    
    try {
      // 1. Shutdown
      await this.shutdown();
      
      // 2. Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 3. Re-initialize
      await this.initialize();
      
      // 4. Update restart timestamp
      this.lastRestartTime = Date.now();
      
      this.logger.info('RealTimeIntelligenceSystem: Full system restart completed successfully');
    } catch (error) {
      this.logger.error(`Failed to perform full system restart: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Run predictive maintenance analysis
   * @returns {Promise<Object>} Maintenance predictions
   * @private
   */
  async predictMaintenance() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Running predictive maintenance analysis');
      
      // Collect system metrics for analysis
      const metrics = {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime(),
        alertsGenerated: this.metrics.alertsGenerated,
        alertsSent: this.metrics.alertsSent,
        monitoringCycles: this.metrics.monitoringCycles,
        avgProcessingTime: this.metrics.avgProcessingTime,
        totalErrors: this.metrics.totalErrors,
        systemHealth: this.systemHealth,
        throttledRequests: this.metrics.throttledRequests,
        currentConcurrency: this.metrics.currentConcurrency
      };
      
      // Analyze system metrics for potential issues
      const predictions = {
        components: {},
        system: {
          nextMaintenanceRecommended: null,
          issues: []
        }
      };
      
      // Check memory usage trends
      const memoryUsagePercent = (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100;
      predictions.components.memory = {
        currentUsage: memoryUsagePercent,
        status: HEALTH_STATES.OPTIMAL,
        hoursUntilCritical: null,
        recommendation: null
      };
      
      if (memoryUsagePercent > 80) {
        predictions.components.memory.status = HEALTH_STATES.AT_RISK;
        predictions.components.memory.hoursUntilCritical = Math.max(1, Math.round((100 - memoryUsagePercent) / 5));
        predictions.components.memory.recommendation = 'Memory usage is high. Consider increasing available memory or optimizing memory usage.';
        predictions.system.issues.push('High memory usage detected');
      } else if (memoryUsagePercent > 70) {
        predictions.components.memory.status = HEALTH_STATES.DEGRADED;
        predictions.components.memory.hoursUntilCritical = Math.max(6, Math.round((100 - memoryUsagePercent) / 2));
        predictions.components.memory.recommendation = 'Memory usage is moderately high. Monitor trends and plan for optimization.';
      }
      
      // Check processing time trends
      predictions.components.processing = {
        currentAvgTime: this.metrics.avgProcessingTime,
        status: HEALTH_STATES.OPTIMAL,
        hoursUntilDegraded: null,
        recommendation: null
      };
      
      if (this.metrics.avgProcessingTime > this.monitoringInterval * 0.8) {
        predictions.components.processing.status = HEALTH_STATES.AT_RISK;
        predictions.components.processing.hoursUntilDegraded = 2;
        predictions.components.processing.recommendation = 'Processing times are approaching monitoring interval. Consider increasing interval or optimizing processing.';
        predictions.system.issues.push('Processing times approaching critical threshold');
      } else if (this.metrics.avgProcessingTime > this.monitoringInterval * 0.6) {
        predictions.components.processing.status = HEALTH_STATES.DEGRADED;
        predictions.components.processing.hoursUntilDegraded = 12;
        predictions.components.processing.recommendation = 'Processing times are increasing. Monitor trends and consider optimization.';
      }
      
      // Check error rate trends
      const monitoringErrorRate = this.metrics.totalErrors / Math.max(1, this.metrics.monitoringCycles);
      predictions.components.errors = {
        currentErrorRate: monitoringErrorRate,
        status: HEALTH_STATES.OPTIMAL,
        recommendation: null
      };
      
      if (monitoringErrorRate > 0.1) {
        predictions.components.errors.status = HEALTH_STATES.AT_RISK;
        predictions.components.errors.recommendation = 'Error rate is high. Investigate and resolve recurring errors.';
        predictions.system.issues.push('High error rate detected');
      } else if (monitoringErrorRate > 0.05) {
        predictions.components.errors.status = HEALTH_STATES.DEGRADED;
        predictions.components.errors.recommendation = 'Error rate is elevated. Monitor trends and investigate common errors.';
      }
      
      // Determine system-wide maintenance recommendation
      let maintenanceHours = null;
      if (predictions.components.memory.hoursUntilCritical || 
          predictions.components.processing.hoursUntilDegraded) {
        
        // Use the minimum time until issues
        const memoryHours = predictions.components.memory.hoursUntilCritical || Infinity;
        const processingHours = predictions.components.processing.hoursUntilDegraded || Infinity;
        maintenanceHours = Math.min(memoryHours, processingHours);
        
        // Set a minimum of 1 hour
        maintenanceHours = Math.max(1, maintenanceHours);
      }
      
      // Set system-wide maintenance recommendation
      if (maintenanceHours) {
        predictions.system.nextMaintenanceRecommended = new Date(Date.now() + maintenanceHours * 60 * 60 * 1000).toISOString();
        
        // Generate maintenance alert if maintenance is needed soon
        if (maintenanceHours < 24) {
          const priority = maintenanceHours < 6 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
          
          this.eventEmitter.emit('alert:generated', {
            type: ALERT_TYPES.MAINTENANCE_REQUIRED,
            priority,
            title: 'System Maintenance Required',
            message: `System maintenance is recommended within ${maintenanceHours} hours. ${predictions.system.issues.join(', ')}.`,
            timestamp: new Date(),
            id: uuidv4(),
            data: {
              predictions,
              recommendedWithinHours: maintenanceHours
            }
          });
        }
      }
      
      // Store predictions and update metrics
      for (const [component, prediction] of Object.entries(predictions.components)) {
        if (prediction.hoursUntilCritical || prediction.hoursUntilDegraded) {
          const hours = prediction.hoursUntilCritical || prediction.hoursUntilDegraded;
          this.metrics.maintenancePredictions.set({ component }, hours);
        }
      }
      
      // Log results
      this.logger.info(`RealTimeIntelligenceSystem: Predictive maintenance analysis complete. ${predictions.system.issues.length} issues found.`);
      
      return predictions;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error in predictive maintenance: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return { error: error.message };
    }
  }
  
  /**
   * Adjust throttling based on system load
   * @returns {Promise<void>}
   * @private
   */
  async adjustThrottling() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Adjusting throttling based on system load');
      
      // Get current performance metrics
      const cpuUsage = process.cpuUsage();
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      const processingTimeRatio = this.metrics.avgProcessingTime / this.monitoringInterval;
      
      // Calculate combined load score (0-100)
      const memoryScore = memoryUsagePercent;
      const processingScore = processingTimeRatio * 100;
      const errorRateScore = Math.min(100, (this.metrics.totalErrors / Math.max(1, this.metrics.monitoringCycles)) * 1000);
      
      const loadScore = (memoryScore * 0.4) + (processingScore * 0.4) + (errorRateScore * 0.2);
      
      // Determine throttling level based on load
      let throttleRate;
      let throttleLevel;
      
      if (loadScore > 80) {
        // High throttling - 90% of requests throttled
        throttleRate = this.tuningParameters.throttlingLevels.high;
        throttleLevel = 'high';
      } else if (loadScore > 60) {
        // Medium throttling - 50% of requests throttled
        throttleRate = this.tuningParameters.throttlingLevels.medium;
        throttleLevel = 'medium';
      } else if (loadScore > 40) {
        // Low throttling - 10% of requests throttled
        throttleRate = this.tuningParameters.throttlingLevels.low;
        throttleLevel = 'low';
      } else {
        // No throttling
        throttleRate = 1.0;
        throttleLevel = 'none';
      }
      
      // Update throttling rate
      this.metrics.adaptiveThrottleRate = throttleRate;
      
      // Apply throttling to components
      this.rateLimiter.setGlobalThrottlingRate(throttleRate);
      
      // Log throttling adjustment
      this.logger.info(`RealTimeIntelligenceSystem: Throttling adjusted to ${throttleLevel} level (${throttleRate}) based on load score ${loadScore.toFixed(1)}`);
      
      // Emit system alert if throttling is significant
      if (throttleRate < 0.5) {
        this.eventEmitter.emit('alert:generated', {
          type: ALERT_TYPES.SYSTEM_STATUS,
          priority: throttleRate < 0.2 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
          title: 'System Throttling Activated',
          message: `Adaptive throttling set to ${throttleLevel} level due to system load (${loadScore.toFixed(1)}%). Performance may be affected.`,
          timestamp: new Date(),
          id: uuidv4(),
          data: {
            loadScore,
            throttleLevel,
            throttleRate,
            memoryUsagePercent,
            processingTimeRatio
          }
        });
      }
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error adjusting throttling: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Detect fraudulent patterns in data
   * @returns {Promise<Array<Object>>} Detected fraud patterns
   * @private
   */
  async detectFraudulentPatterns() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Running fraud detection analysis');
      
      // Get recent betting opportunities
      const recentOpportunities = await this.getActiveBettingOpportunities({
        limit: 100
      });
      
      // Get historical alerts
      const recentAlerts = await this.getActiveAlerts({
        types: [ALERT_TYPES.CORRELATION_SHIFT, ALERT_TYPES.BETTING_OPPORTUNITY],
        limit: 500
      });
      
      // Call fraud detection engine
      const fraudPatterns = await this.fraudDetectionEngine.detectFraud({
        opportunities: recentOpportunities,
        alerts: recentAlerts,
        threshold: 0.7 // Confidence threshold
      });
      
      // Process detected fraud patterns
      if (fraudPatterns.length > 0) {
        this.logger.warn(`RealTimeIntelligenceSystem: Detected ${fraudPatterns.length} potential fraud patterns`);
        
        for (const pattern of fraudPatterns) {
          // Emit fraud alert
          this.eventEmitter.emit('fraud:detected', {
            type: pattern.type,
            reason: pattern.reason,
            evidence: pattern.evidence,
            confidence: pattern.confidence
          });
          
          // Mark affected opportunities as suspicious
          for (const opportunityId of pattern.affectedOpportunities || []) {
            await this.markOpportunityAsSuspicious(opportunityId, pattern);
          }
        }
      } else {
        this.logger.info('RealTimeIntelligenceSystem: No fraudulent patterns detected');
      }
      
      return fraudPatterns;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error detecting fraudulent patterns: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return [];
    }
  }
  
  /**
   * Mark a betting opportunity as suspicious due to potential fraud
   * @param {string} opportunityId Opportunity ID
   * @param {Object} fraudPattern Detected fraud pattern
   * @returns {Promise<void>}
   * @private
   */
  async markOpportunityAsSuspicious(opportunityId, fraudPattern) {
    try {
      // Get opportunity from Redis
      const opportunityKey = `opportunity:${opportunityId}`;
      const opportunityJson = await this.redisClient.get(opportunityKey);
      
      if (!opportunityJson) {
        this.logger.warn(`Opportunity ${opportunityId} not found when marking as suspicious`);
        return;
      }
      
      // Parse opportunity
      const opportunity = JSON.parse(opportunityJson);
      
      // Mark as suspicious
      opportunity.suspicious = true;
      opportunity.fraudPattern = {
        type: fraudPattern.type,
        reason: fraudPattern.reason,
        confidence: fraudPattern.confidence,
        detectedAt: new Date().toISOString()
      };
      
      // Update in Redis
      await this.redisClient.set(
        opportunityKey,
        JSON.stringify(opportunity),
        { KEEPTTL: true } // Keep existing TTL
      );
      
      this.logger.info(`RealTimeIntelligenceSystem: Marked opportunity ${opportunityId} as suspicious due to potential fraud`);
    } catch (error) {
      this.logger.error(`Error marking opportunity as suspicious: ${error.message}`, { error });
    }
  }
  
  /**
   * Run monitoring in shadow mode to compare with production
   * @param {Array<Object>} productionShifts Detected shifts from production mode
   * @returns {Promise<void>}
   * @private
   */
  async runInShadowMode(productionShifts) {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Running in shadow mode');
      
      // Create a shadow version with adjusted parameters
      const shadowParameters = _.cloneDeep(this.tuningParameters);
      
      // Make shadow parameters slightly different
      // These could be experimental settings we want to test
      shadowParameters.correlationThresholds.default -= 0.05;
      Object.keys(shadowParameters.correlationThresholds.byLeague).forEach(league => {
        shadowParameters.correlationThresholds.byLeague[league] -= 0.05;
      });
      
      shadowParameters.scoringWeights.recency += 0.1;
      shadowParameters.scoringWeights.magnitude -= 0.1;
      
      // Store original parameters
      const originalParameters = this.tuningParameters;
      
      // Temporarily replace with shadow parameters
      this.tuningParameters = shadowParameters;
      
      // Run shadow monitoring cycle
      const shadowShifts = await this.monitorCorrelationShifts();
      
      // Restore original parameters
      this.tuningParameters = originalParameters;
      
      // Compare results
      const comparison = this.compareShadowResults(productionShifts, shadowShifts);
      
      // Log comparison results
      this.logger.info(`RealTimeIntelligenceSystem: Shadow mode comparison - Match rate: ${comparison.matchRate.toFixed(1)}%, Differences: ${comparison.differences.length}`);
      
      // Store shadow results for tuning
      this.shadowResults.totalComparisons++;
      this.shadowResults.matches += comparison.matches;
      this.shadowResults.mismatches += comparison.differences.length;
      
      // Calculate overall match rate
      const overallMatchRate = (this.shadowResults.matches / Math.max(1, this.shadowResults.matches + this.shadowResults.mismatches)) * 100;
      this.metrics.shadowModeMatchRate = overallMatchRate;
      
      // If significant differences detected, log them for analysis
      if (comparison.differences.length > 0) {
        this.logger.debug('RealTimeIntelligenceSystem: Shadow mode detected differences', {
          differences: comparison.differences.slice(0, 5) // Log up to 5 differences
        });
      }
      
      return comparison;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error in shadow mode: ${error.message}`, { error });
      this.metrics.totalErrors++;
    }
  }
  
  /**
   * Compare shadow mode results with production results
   * @param {Array<Object>} productionShifts Production shifts
   * @param {Array<Object>} shadowShifts Shadow shifts
   * @returns {Object} Comparison results
   * @private
   */
  compareShadowResults(productionShifts, shadowShifts) {
    try {
      // Create maps for faster lookup
      const productionMap = new Map(productionShifts.map(shift => [`${shift.factorA}|${shift.factorB}`, shift]));
      const shadowMap = new Map(shadowShifts.map(shift => [`${shift.factorA}|${shift.factorB}`, shift]));
      
      // Find matches (shifts detected in both)
      const matches = [];
      const differences = [];
      
      // Check each production shift
      for (const [key, prodShift] of productionMap.entries()) {
        if (shadowMap.has(key)) {
          // Both detected this shift
          matches.push({
            key,
            production: prodShift,
            shadow: shadowMap.get(key)
          });
        } else {
          // Only production detected this shift
          differences.push({
            key,
            type: 'missing_in_shadow',
            production: prodShift,
            shadow: null
          });
        }
      }
      
      // Check for shifts only in shadow
      for (const [key, shadowShift] of shadowMap.entries()) {
        if (!productionMap.has(key)) {
          // Only shadow detected this shift
          differences.push({
            key,
            type: 'only_in_shadow',
            production: null,
            shadow: shadowShift
          });
        }
      }
      
      // Calculate match rate
      const total = productionShifts.length + shadowShifts.length - matches.length;
      const matchRate = total > 0 ? (matches.length / total) * 100 : 100;
      
      return {
        matches: matches.length,
        differences,
        matchRate
      };
    } catch (error) {
      this.logger.error(`Error comparing shadow results: ${error.message}`, { error });
      return {
        matches: 0,
        differences: [],
        matchRate: 0
      };
    }
  }
  
  /**
   * Self-tune correlation parameters based on historical accuracy
   * @returns {Promise<Object>} Updated parameters
   * @private
   */
  async tuneParameters() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Tuning system parameters based on historical performance');
      
      // Skip if we don't have enough historical data
      if (this.accuracyHistory.correlations.length < 10) {
        this.logger.info('RealTimeIntelligenceSystem: Not enough historical data for tuning. Skipping.');
        return this.tuningParameters;
      }
      
      // Clone current parameters
      const updatedParameters = _.cloneDeep(this.tuningParameters);
      
      // Group accuracy history by league
      const accuracyByLeague = _.groupBy(this.accuracyHistory.correlations, 'league');
      
      // Tune correlation thresholds per league
      for (const [league, history] of Object.entries(accuracyByLeague)) {
        if (history.length < 5) continue; // Skip leagues with insufficient data
        
        // Calculate average accuracy
        const avgAccuracy = _.meanBy(history, 'accuracy');
        
        // Adjust threshold based on accuracy
        const currentThreshold = updatedParameters.correlationThresholds.byLeague[league] || 
                               updatedParameters.correlationThresholds.default;
        
        let newThreshold;
        if (avgAccuracy < 0.6) {
          // Increase threshold if accuracy is low
          newThreshold = currentThreshold + 0.05;
        } else if (avgAccuracy > 0.8) {
          // Decrease threshold if accuracy is high
          newThreshold = currentThreshold - 0.03;
        } else {
          // Minor adjustment based on trend
          newThreshold = currentThreshold + (0.7 - avgAccuracy) * 0.1;
        }
        
        // Ensure threshold stays within reasonable bounds
        newThreshold = Math.max(0.3, Math.min(0.7, newThreshold));
        
        // Update threshold
        updatedParameters.correlationThresholds.byLeague[league] = newThreshold;
        
        this.logger.info(`RealTimeIntelligenceSystem: Tuned correlation threshold for ${league} from ${currentThreshold} to ${newThreshold} (accuracy: ${avgAccuracy.toFixed(2)})`);
      }
      
      // Tune global default threshold
      const globalAvgAccuracy = _.meanBy(this.accuracyHistory.correlations, 'accuracy');
      const currentDefaultThreshold = updatedParameters.correlationThresholds.default;
      
      let newDefaultThreshold;
      if (globalAvgAccuracy < 0.6) {
        // Increase threshold if accuracy is low
        newDefaultThreshold = currentDefaultThreshold + 0.03;
      } else if (globalAvgAccuracy > 0.8) {
        // Decrease threshold if accuracy is high
        newDefaultThreshold = currentDefaultThreshold - 0.02;
      } else {
        // Minor adjustment based on trend
        newDefaultThreshold = currentDefaultThreshold + (0.7 - globalAvgAccuracy) * 0.05;
      }
      
      // Ensure threshold stays within reasonable bounds
      newDefaultThreshold = Math.max(0.35, Math.min(0.65, newDefaultThreshold));
      
      // Update default threshold
      updatedParameters.correlationThresholds.default = newDefaultThreshold;
      
      this.logger.info(`RealTimeIntelligenceSystem: Tuned default correlation threshold from ${currentDefaultThreshold} to ${newDefaultThreshold} (global accuracy: ${globalAvgAccuracy.toFixed(2)})`);
      
      // Consider shadow mode comparison results for tuning
      if (this.shadowResults.totalComparisons > 10) {
        const shadowMatchRate = (this.shadowResults.matches / Math.max(1, this.shadowResults.matches + this.shadowResults.mismatches)) * 100;
        
        // If shadow mode has better results, adapt some parameters from shadow mode
        if (shadowMatchRate > 60) {
          this.logger.info(`RealTimeIntelligenceSystem: Shadow mode showing promising results (${shadowMatchRate.toFixed(1)}% match rate). Adapting some parameters.`);
          
          // Blend in some shadow mode parameters (example: adjust scoring weights)
          updatedParameters.scoringWeights.recency = (updatedParameters.scoringWeights.recency * 0.7) + 0.3 * 0.7; // Move 30% toward shadow value of 0.7
          updatedParameters.scoringWeights.magnitude = (updatedParameters.scoringWeights.magnitude * 0.7) + 0.3 * 0.2; // Move 30% toward shadow value of 0.2
          
          // Reset shadow results counter
          this.shadowResults.totalComparisons = 0;
          this.shadowResults.matches = 0;
          this.shadowResults.mismatches = 0;
        }
      }
      
      // Update tuning parameters
      this.tuningParameters = updatedParameters;
      
      // Persist updated parameters
      if (this.isProduction && this.mongoConnection) {
        const TuningParametersModel = this.mongoConnection.model('TuningParameters');
        await TuningParametersModel.create({
          active: true,
          parameters: updatedParameters,
          createdAt: new Date(),
          previousId: this.currentTuningParametersId
        });
        
        // Deactivate previous parameters
        if (this.currentTuningParametersId) {
          await TuningParametersModel.updateOne(
            { _id: this.currentTuningParametersId },
            { active: false }
          );
        }
      }
      
      return updatedParameters;
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Error tuning parameters: ${error.message}`, { error });
      this.metrics.totalErrors++;
      return this.tuningParameters;
    }
  }
  
  /**
   * Acquire a distributed lock for coordinating tasks across instances
   * @param {string} resourceName Name of the resource to lock
   * @param {number} ttlMs Time-to-live for the lock in milliseconds
   * @returns {Promise<Object>} Lock object
   * @private
   */
  async acquireDistributedLock(resourceName, ttlMs) {
    if (!this.distributedLockingEnabled || !this.redlock) {
      throw new Error('Distributed locking is not enabled or initialized');
    }
    
    try {
      // Create a unique resource name for this instance
      const lockResource = `${this.serviceName}:${resourceName}:lock`;
      
      // Acquire lock with specified TTL
      const lock = await this.redlock.acquire([lockResource], ttlMs);
      
      this.logger.debug(`RealTimeIntelligenceSystem: Acquired distributed lock for ${resourceName}`);
      
      return lock;
    } catch (error) {
      this.logger.warn(`RealTimeIntelligenceSystem: Failed to acquire distributed lock for ${resourceName}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Export metrics to external systems (AWS CloudWatch, Datadog)
   * @returns {Promise<void>}
   * @private
   */
  async exportMetricsToExternalSystems() {
    if (!this.isProduction) return;
    
    try {
      // Export to CloudWatch if client is available
      if (this.cloudWatchClient) {
        const timestamp = new Date();
        const namespace = `SportsAnalytics/${this.environment}`;
        
        const metricData = [
          {
            MetricName: 'AlertsGenerated',
            Value: this.metrics.alertsGenerated,
            Unit: 'Count',
            Timestamp: timestamp
          },
          {
            MetricName: 'AlertsSent',
            Value: this.metrics.alertsSent,
            Unit: 'Count',
            Timestamp: timestamp
          },
          {
            MetricName: 'OpportunitiesDetected',
            Value: this.metrics.opportunitiesDetected,
            Unit: 'Count',
            Timestamp: timestamp
          },
          {
            MetricName: 'AverageProcessingTime',
            Value: this.metrics.avgProcessingTime,
            Unit: 'Milliseconds',
            Timestamp: timestamp
          },
          {
            MetricName: 'SystemHealth',
            Value: this.healthStateToValue(this.systemHealth),
            Unit: 'None',
            Timestamp: timestamp
          }
        ];
        
        const command = new PutMetricDataCommand({
          Namespace: namespace,
          MetricData: metricData
        });
        
        await this.cloudWatchClient.send(command);
      }
      
      // Export to Datadog
      if (Datadog.metrics) {
        Datadog.gauge('alerts.generated', this.metrics.alertsGenerated);
        Datadog.gauge('alerts.sent', this.metrics.alertsSent);
        Datadog.gauge('opportunities.detected', this.metrics.opportunitiesDetected);
        Datadog.gauge('system.processing_time', this.metrics.avgProcessingTime);
        Datadog.gauge('system.health', this.healthStateToValue(this.systemHealth));
        Datadog.gauge('system.uptime', Math.floor((Date.now() - this.startTime) / 1000));
        Datadog.gauge('system.memory.usage_pct', (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100);
        
        // Flush metrics to Datadog
        Datadog.flush();
      }
    } catch (error) {
      this.logger.error(`Error exporting metrics to external systems: ${error.message}`, { error });
    }
  }
  
  /**
   * Backup important database data
   * @returns {Promise<void>}
   * @private
   */
  async backupDatabase() {
    if (!this.isProduction || !this.s3Client) return;
    
    try {
      this.logger.info('RealTimeIntelligenceSystem: Running database backup');
      
      // Generate timestamp for backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Backup tuning parameters
      const tuningParametersBackup = {
        timestamp,
        parameters: this.tuningParameters,
        version: this.version,
        environment: this.environment
      };
      
      // Upload to S3
      const tuningParamsCommand = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: `backups/${timestamp}/tuning-parameters.json`,
        Body: JSON.stringify(tuningParametersBackup, null, 2),
        ContentType: 'application/json'
      });
      
      await this.s3Client.send(tuningParamsCommand);
      
      // Backup accuracy history
      const accuracyHistoryBackup = {
        timestamp,
        history: this.accuracyHistory,
        version: this.version,
        environment: this.environment
      };
      
      const accuracyHistoryCommand = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: `backups/${timestamp}/accuracy-history.json`,
        Body: JSON.stringify(accuracyHistoryBackup, null, 2),
        ContentType: 'application/json'
      });
      
      await this.s3Client.send(accuracyHistoryCommand);
      
      this.logger.info(`RealTimeIntelligenceSystem: Database backup completed (${timestamp})`);
    } catch (error) {
      this.logger.error(`Error backing up database: ${error.message}`, { error });
    }
  }
  
  /**
   * Warm cache for frequently accessed data
   * @returns {Promise<void>}
   * @private
   */
  async warmCache() {
    try {
      this.logger.debug('RealTimeIntelligenceSystem: Warming cache for frequently accessed data');
      
      // Pre-fetch active opportunities
      await this.getActiveBettingOpportunities();
      
      // Pre-fetch recent alerts
      await this.getActiveAlerts({ limit: 50 });
      
      // Warm up user subscriptions
      await this.loadUserSubscriptions();
      
      // Additional cache warming logic for specific components
      await this.cachingLayer.warmFrequentlyAccessedData();
      
      this.logger.debug('RealTimeIntelligenceSystem: Cache warming completed');
    } catch (error) {
      this.logger.error(`Error warming cache: ${error.message}`, { error });
    }
  }

  /**
   * Clean up connections before shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      this.logger.info('RealTimeIntelligenceSystem: Initiating system shutdown');
      
      // Stop monitoring
      if (this.isMonitoring) {
        this.stopMonitoring();
      }
      
      // Clear all interval timers
      for (const [name, handle] of this.intervalHandles.entries()) {
        clearInterval(handle);
        this.logger.debug(`RealTimeIntelligenceSystem: Cleared interval timer for ${name}`);
      }
      this.intervalHandles.clear();
      
      // Shutdown notification manager
      if (this.notificationManager) {
        await this.notificationManager.shutdown();
      }
      
      // Shutdown sport event manager
      if (this.sportEventManager) {
        await this.sportEventManager.shutdown();
      }
      
      // Shutdown WebSocket server
      if (this.webSocketServer) {
        await this.webSocketServer.shutdown();
      }
      
      // Disconnect Kafka producer
      if (this.kafkaProducer) {
        await this.kafkaProducer.disconnect();
        this.logger.info('RealTimeIntelligenceSystem: Kafka producer disconnected');
      }
      
      // Disconnect Kafka consumer
      if (this.kafkaConsumer) {
        await this.kafkaConsumer.disconnect();
        this.logger.info('RealTimeIntelligenceSystem: Kafka consumer disconnected');
      }
      
      // Disconnect Redis
      if (this.redisClient) {
        await this.redisClient.disconnect();
        this.logger.info('RealTimeIntelligenceSystem: Redis connection closed');
      }
      
      // Disconnect Redis PubSub
      if (this.redisPubSub) {
        await this.redisPubSub.disconnect();
        this.logger.info('RealTimeIntelligenceSystem: Redis PubSub connection closed');
      }
      
      // Disconnect MongoDB connection
      if (this.mongoConnection) {
        await mongoose.disconnect();
        this.logger.info('RealTimeIntelligenceSystem: MongoDB connection closed');
      }
      
      // Shutdown correlation API
      if (this.correlationAPI) {
        await this.correlationAPI.shutdown();
      }
      
      // Shutdown correlation engine
      if (this.correlationEngine) {
        await this.correlationEngine.shutdown();
      }
      
      // Shutdown prediction engine
      if (this.predictionEngine) {
        await this.predictionEngine.shutdown();
      }
      
      // Shutdown security manager
      if (this.securityManager) {
        await this.securityManager.shutdown();
      }
      
      // Shutdown other components
      if (this.rateLimiter) await this.rateLimiter.shutdown();
      if (this.cachingLayer) await this.cachingLayer.shutdown();
      if (this.dataPipeline) await this.dataPipeline.shutdown();
      if (this.queryOptimizer) await this.queryOptimizer.shutdown();
      if (this.bettingMarketIntegration) await this.bettingMarketIntegration.shutdown();
      if (this.fraudDetectionEngine) await this.fraudDetectionEngine.shutdown();
      if (this.backtestingEngine) await this.backtestingEngine.shutdown();
      
      this.isInitialized = false;
      this.logger.info('RealTimeIntelligenceSystem: System shutdown complete');
      
      // Flush logs before exiting completely
      setTimeout(() => {
        console.log('RealTimeIntelligenceSystem: Final shutdown step complete');
      }, 1000);
    } catch (error) {
      this.logger.error(`RealTimeIntelligenceSystem: Shutdown error: ${error.message}`, { error });
    }
  }

  /**
   * Get system health status for all components
   * @returns {Promise<Object>} Health status of all system components
   */
  async getHealthStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      overall: HEALTH_STATES.HEALTHY,
      components: {
        redis: {
          status: HEALTH_STATES.HEALTHY,
          lastChecked: new Date().toISOString(),
          metrics: {}
        },
        mongodb: {
          status: HEALTH_STATES.HEALTHY,
          lastChecked: new Date().toISOString(),
          metrics: {}
        },
        correlationEngine: {
          status: HEALTH_STATES.HEALTHY,
          lastChecked: new Date().toISOString(),
          metrics: {}
        },
        causalDiscovery: {
          status: HEALTH_STATES.HEALTHY,
          lastChecked: new Date().toISOString(),
          metrics: {}
        },
        anomalyDetection: {
          status: HEALTH_STATES.HEALTHY,
          lastChecked: new Date().toISOString(),
          metrics: {}
        },
        notificationSystem: {
          status: HEALTH_STATES.HEALTHY,
          lastChecked: new Date().toISOString(),
          metrics: {}
        }
      }
    };

    try {
      // Check Redis status
      if (this.redisClient) {
        try {
          const pingStart = Date.now();
          await this.redisClient.ping();
          const pingLatency = Date.now() - pingStart;
          
          status.components.redis.metrics.pingLatencyMs = pingLatency;
          status.components.redis.metrics.memoryUsage = await this.redisClient.info('memory');
          
          if (pingLatency > 100) {
            status.components.redis.status = HEALTH_STATES.DEGRADED;
            status.components.redis.message = `High Redis latency: ${pingLatency}ms`;
          }
        } catch (error) {
          status.components.redis.status = HEALTH_STATES.CRITICAL;
          status.components.redis.message = `Redis error: ${error.message}`;
        }
      } else {
        status.components.redis.status = HEALTH_STATES.CRITICAL;
        status.components.redis.message = 'Redis client not initialized';
      }
      
      // Check MongoDB status
      if (this.mongoConnection && this.mongoConnection.readyState === 1) {
        try {
          const adminDb = this.mongoConnection.db.admin();
          const pingStart = Date.now();
          await adminDb.ping();
          const pingLatency = Date.now() - pingStart;
          
          status.components.mongodb.metrics.pingLatencyMs = pingLatency;
          status.components.mongodb.metrics.connectionCount = (await adminDb.serverStatus()).connections;
          
          if (pingLatency > 200) {
            status.components.mongodb.status = HEALTH_STATES.DEGRADED;
            status.components.mongodb.message = `High MongoDB latency: ${pingLatency}ms`;
          }
        } catch (error) {
          status.components.mongodb.status = HEALTH_STATES.DEGRADED;
          status.components.mongodb.message = `MongoDB admin operation error: ${error.message}`;
        }
      } else {
        status.components.mongodb.status = HEALTH_STATES.CRITICAL;
        status.components.mongodb.message = 'MongoDB not connected';
      }
      
      // Check Correlation Engine status
      if (this.correlationEngine && typeof this.correlationEngine.getHealthMetrics === 'function') {
        try {
          const engineMetrics = await this.correlationEngine.getHealthMetrics();
          status.components.correlationEngine.metrics = engineMetrics;
          
          if (engineMetrics.errorRate > 0.05) {
            status.components.correlationEngine.status = HEALTH_STATES.DEGRADED;
            status.components.correlationEngine.message = `High error rate: ${(engineMetrics.errorRate * 100).toFixed(2)}%`;
          }
          
          if (engineMetrics.avgLatencyMs > 500) {
            status.components.correlationEngine.status = HEALTH_STATES.DEGRADED;
            status.components.correlationEngine.message = `High latency: ${engineMetrics.avgLatencyMs.toFixed(2)}ms`;
          }
        } catch (error) {
          status.components.correlationEngine.status = HEALTH_STATES.DEGRADED;
          status.components.correlationEngine.message = `Error getting metrics: ${error.message}`;
        }
      } else {
        status.components.correlationEngine.status = HEALTH_STATES.AT_RISK;
        status.components.correlationEngine.message = 'Correlation engine health check not available';
      }
      
      // Check Causal Discovery engine status
      const causalDiscoveryBreaker = this.circuitBreakers?.causalDiscovery;
      if (causalDiscoveryBreaker) {
        status.components.causalDiscovery.metrics = {
          state: causalDiscoveryBreaker.status.state,
          failureCount: causalDiscoveryBreaker.status.stats.failures,
          successCount: causalDiscoveryBreaker.status.stats.successes,
          errorRate: causalDiscoveryBreaker.status.stats.failures / 
            (causalDiscoveryBreaker.status.stats.failures + causalDiscoveryBreaker.status.stats.successes || 1)
        };
        
        if (causalDiscoveryBreaker.status.state === CIRCUIT_STATES.OPEN) {
          status.components.causalDiscovery.status = HEALTH_STATES.CRITICAL;
          status.components.causalDiscovery.message = 'Circuit breaker is open';
        } else if (causalDiscoveryBreaker.status.state === CIRCUIT_STATES.HALF_OPEN) {
          status.components.causalDiscovery.status = HEALTH_STATES.AT_RISK;
          status.components.causalDiscovery.message = 'Circuit breaker is half-open';
        }
      } else {
        try {
          // Try a simple causal discovery operation to check status
          const testStart = Date.now();
          const testResult = await this.causalDiscovery.testCausalRelationship(
            'Team A wins', 
            'Team B loses',
            { timeWindow: '7d' }
          );
          const testLatency = Date.now() - testStart;
          
          status.components.causalDiscovery.metrics.sampleLatencyMs = testLatency;
          
          if (testLatency > 2000) {
            status.components.causalDiscovery.status = HEALTH_STATES.DEGRADED;
            status.components.causalDiscovery.message = `High causal discovery latency: ${testLatency}ms`;
          }
        } catch (error) {
          status.components.causalDiscovery.status = HEALTH_STATES.AT_RISK;
          status.components.causalDiscovery.message = `Error testing causal discovery: ${error.message}`;
        }
      }
      
      // Check Anomaly Detection status
      const anomalyModelStatus = await this.anomalyDetector.getModelStatus();
      status.components.anomalyDetection.metrics = {
        modelVersion: anomalyModelStatus.version,
        lastTrainingDate: anomalyModelStatus.lastTrainingDate,
        accuracy: anomalyModelStatus.accuracy,
        latencyMs: anomalyModelStatus.avgLatencyMs
      };
      
      if (anomalyModelStatus.status === 'ERROR') {
        status.components.anomalyDetection.status = HEALTH_STATES.CRITICAL;
        status.components.anomalyDetection.message = anomalyModelStatus.errorMessage || 'Model in error state';
      } else if (anomalyModelStatus.status === 'TRAINING') {
        status.components.anomalyDetection.status = HEALTH_STATES.DEGRADED;
        status.components.anomalyDetection.message = 'Model is currently training';
      } else if (anomalyModelStatus.accuracy < 0.7) {
        status.components.anomalyDetection.status = HEALTH_STATES.AT_RISK;
        status.components.anomalyDetection.message = `Model accuracy below threshold: ${(anomalyModelStatus.accuracy * 100).toFixed(1)}%`;
      }
      
      // Check Notification System status
      const notificationBreaker = this.circuitBreakers?.notification;
      if (notificationBreaker) {
        status.components.notificationSystem.metrics = {
          state: notificationBreaker.status.state,
          failureCount: notificationBreaker.status.stats.failures,
          successCount: notificationBreaker.status.stats.successes,
          rejectionCount: notificationBreaker.status.stats.rejects,
          errorRate: notificationBreaker.status.stats.failures / 
            (notificationBreaker.status.stats.failures + notificationBreaker.status.stats.successes || 1)
        };
        
        if (notificationBreaker.status.state === CIRCUIT_STATES.OPEN) {
          status.components.notificationSystem.status = HEALTH_STATES.CRITICAL;
          status.components.notificationSystem.message = 'Circuit breaker is open';
        } else if (notificationBreaker.status.state === CIRCUIT_STATES.HALF_OPEN) {
          status.components.notificationSystem.status = HEALTH_STATES.AT_RISK;
          status.components.notificationSystem.message = 'Circuit breaker is half-open';
        }
      } else {
        status.components.notificationSystem.metrics = {
          deliveryRate: this.metrics.alertsSent / (this.metrics.alertsGenerated || 1),
          alertsGenerated: this.metrics.alertsGenerated,
          alertsSent: this.metrics.alertsSent
        };
        
        if (status.components.notificationSystem.metrics.deliveryRate < 0.9) {
          status.components.notificationSystem.status = HEALTH_STATES.DEGRADED;
          status.components.notificationSystem.message = `Low delivery rate: ${(status.components.notificationSystem.metrics.deliveryRate * 100).toFixed(1)}%`;
        }
      }
      
      // Determine overall system health
      const componentStates = Object.values(status.components).map(c => c.status);
      if (componentStates.includes(HEALTH_STATES.CRITICAL)) {
        status.overall = HEALTH_STATES.CRITICAL;
      } else if (componentStates.includes(HEALTH_STATES.AT_RISK)) {
        status.overall = HEALTH_STATES.AT_RISK;
      } else if (componentStates.includes(HEALTH_STATES.DEGRADED)) {
        status.overall = HEALTH_STATES.DEGRADED;
      }
      
      // Report metrics to monitoring system
      this.reportHealthMetrics(status);
      
    } catch (error) {
      logger.error(`RealTimeIntelligenceSystem: Error checking health status: ${error.message}`);
      status.overall = HEALTH_STATES.CRITICAL;
      status.error = error.message;
    }
    
    return status;
  }
  
  /**
   * Report health metrics to monitoring systems
   * @param {Object} status Health status object
   * @private
   */
  reportHealthMetrics(status) {
    try {
      // Map health states to numeric values for metrics
      const healthStateValues = {
        [HEALTH_STATES.CRITICAL]: 0,
        [HEALTH_STATES.AT_RISK]: 1,
        [HEALTH_STATES.DEGRADED]: 2,
        [HEALTH_STATES.HEALTHY]: 3,
        [HEALTH_STATES.OPTIMAL]: 4
      };
      
      // Update system health metrics
      Object.entries(status.components).forEach(([component, data]) => {
        metrics.systemHealth.set(
          { component },
          healthStateValues[data.status]
        );
      });
      
      // Update latency metrics where available
      if (status.components.redis.metrics.pingLatencyMs) {
        metrics.databaseOperationLatency.observe(
          { operation: 'ping', collection: 'redis' },
          status.components.redis.metrics.pingLatencyMs / 1000
        );
      }
      
      if (status.components.mongodb.metrics.pingLatencyMs) {
        metrics.databaseOperationLatency.observe(
          { operation: 'ping', collection: 'mongodb' },
          status.components.mongodb.metrics.pingLatencyMs / 1000
        );
      }
      
      if (status.components.correlationEngine.metrics?.avgLatencyMs) {
        metrics.databaseOperationLatency.observe(
          { operation: 'correlation', collection: 'factors' },
          status.components.correlationEngine.metrics.avgLatencyMs / 1000
        );
      }
      
      if (status.components.causalDiscovery.metrics?.sampleLatencyMs) {
        metrics.databaseOperationLatency.observe(
          { operation: 'causal_discovery', collection: 'factors' },
          status.components.causalDiscovery.metrics.sampleLatencyMs / 1000
        );
      }
      
      // Update anomaly score
      if (status.components.anomalyDetection.metrics?.accuracy) {
        metrics.anomalyScore.set(
          { component: 'anomaly_model' },
          1 - status.components.anomalyDetection.metrics.accuracy
        );
      }
      
      // Update Datadog metrics if in production
      if (IS_PRODUCTION) {
        Datadog.gauge(
          'system.health.overall',
          healthStateValues[status.overall],
          [`service:${SERVICE_NAME}`]
        );
        
        Object.entries(status.components).forEach(([component, data]) => {
          Datadog.gauge(
            `system.health.component.${component}`,
            healthStateValues[data.status],
            [`service:${SERVICE_NAME}`]
          );
        });
      }
      
      // Log health status changes if needed
      if (status.overall !== HEALTH_STATES.HEALTHY) {
        logger.warn(`System health degraded to ${status.overall}`);
        
        // Create system health alert if critical or at risk
        if (status.overall === HEALTH_STATES.CRITICAL || status.overall === HEALTH_STATES.AT_RISK) {
          this.eventEmitter.emit('alert:generated', {
            id: uuidv4(),
            type: ALERT_TYPES.SYSTEM_HEALTH,
            priority: status.overall === HEALTH_STATES.CRITICAL ? PRIORITY.CRITICAL : PRIORITY.HIGH,
            title: `System Health Alert: ${status.overall.toUpperCase()}`,
            message: this.generateHealthAlertMessage(status),
            timestamp: new Date(),
            data: status
          });
        }
      }
    } catch (error) {
      logger.error(`RealTimeIntelligenceSystem: Error reporting health metrics: ${error.message}`);
    }
  }
  
  /**
   * Generate health alert message
   * @param {Object} status Health status object
   * @returns {string} Alert message
   * @private
   */
  generateHealthAlertMessage(status) {
    const criticalComponents = Object.entries(status.components)
      .filter(([_, data]) => data.status === HEALTH_STATES.CRITICAL)
      .map(([component, data]) => `${component}: ${data.message || 'Critical error'}`);
      
    const atRiskComponents = Object.entries(status.components)
      .filter(([_, data]) => data.status === HEALTH_STATES.AT_RISK)
      .map(([component, data]) => `${component}: ${data.message || 'At risk'}`);
      
    let message = `System health is ${status.overall.toUpperCase()}.`;
    
    if (criticalComponents.length > 0) {
      message += ` Critical issues: ${criticalComponents.join('; ')}.`;
    }
    
    if (atRiskComponents.length > 0) {
      message += ` At risk components: ${atRiskComponents.join('; ')}.`;
    }
    
    return message;
  }

  // Find an appropriate place for this method, probably near the startMonitoring method:
  /**
   * Start health monitoring
   * @returns {Promise<void>}
   */
  async startHealthMonitoring() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.healthMonitoringInterval) {
      logger.warn('RealTimeIntelligenceSystem: Health monitoring already active');
      return;
    }
    
    try {
      logger.info(`RealTimeIntelligenceSystem: Starting health monitoring with interval ${this.healthCheckInterval}ms`);
      
      // Run initial health check
      await this.getHealthStatus();
      
      // Set up interval for future health checks
      this.healthMonitoringInterval = setInterval(() => {
        this.getHealthStatus().catch(err => {
          logger.error(`RealTimeIntelligenceSystem: Error in health check cycle: ${err.message}`);
        });
      }, this.healthCheckInterval || 60000);
      
      logger.info('RealTimeIntelligenceSystem: Health monitoring started');
      
    } catch (error) {
      logger.error(`RealTimeIntelligenceSystem: Failed to start health monitoring: ${error.message}`);
      throw error;
    }
  }
}

module.exports = RealTimeIntelligenceSystem;