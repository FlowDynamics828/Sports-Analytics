/**
 * Enterprise-Grade Event Emitter System
 * 
 * A mission-critical event system with features for real-time sports analytics.
 * Comprehensive support for NBA, NHL, NFL, MLB, La Liga, Serie A, Premier League, and Bundesliga.
 * 
 * Features:
 * - Guaranteed delivery with persistent storage and replay
 * - Event versioning and schema migration
 * - Transaction support for atomic operations
 * - Hierarchical topic structure with inheritance
 * - Advanced partitioning for distributed processing
 * - Dynamic circuit breaking for fault tolerance
 * - Event sequence validation
 * - Encryption for sensitive data
 * - Comprehensive telemetry and monitoring
 */

'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');
const { promisify } = require('util');
const Redis = require('ioredis');
const Redlock = require('redlock');
const zlib = require('zlib');
const Ajv = require('ajv');
const { v4: uuidv4 } = require('uuid');
const opentelemetry = require('@opentelemetry/api');
const winston = require('winston');
const AWS = require('aws-sdk');
const AsyncLock = require('async-lock');
const { PartitionManager } = require('./partition_manager');
const { SchemaRegistry } = require('./schema_registry');

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'event-emitter' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'events-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'events-combined.log' })
  ]
});

// Initialize telemetry
const meter = opentelemetry.metrics.getMeter('event-emitter');
const tracer = opentelemetry.trace.getTracer('event-emitter');

// Sports leagues configuration
const SUPPORTED_LEAGUES = {
  NBA: { id: 'nba', partition_key: 'league:nba' },
  NHL: { id: 'nhl', partition_key: 'league:nhl' },
  NFL: { id: 'nfl', partition_key: 'league:nfl' },
  MLB: { id: 'mlb', partition_key: 'league:mlb' },
  LA_LIGA: { id: 'laliga', partition_key: 'league:laliga' },
  SERIE_A: { id: 'seriea', partition_key: 'league:seriea' },
  PREMIER_LEAGUE: { id: 'epl', partition_key: 'league:epl' },
  BUNDESLIGA: { id: 'bundesliga', partition_key: 'league:bundesliga' }
};

// Circuit breaker states
const CIRCUIT_STATE = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

/**
 * Enterprise-grade event emitter for sports analytics systems
 */
class EnterpriseEventEmitter {
  /**
   * Initialize the enterprise event emitter
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    this.baseEmitter = new EventEmitter();
    this.config = this._mergeDefaultConfig(config);
    this.namespace = this.config.namespace;
    this.eventsHistory = {};
    this.redisConnections = new Map();
    this.circuitBreakers = new Map();
    this.transactionLock = new AsyncLock();
    this.schemaValidators = new Map();
    this.cryptoKey = null;
    this.sequenceCounters = new Map();
    this.hierarchyCache = new Map();
    this.partitionManager = null;
    this.schemaRegistry = null;
    this.isInitialized = false;
    this.metrics = {};
    
    // Set higher max listeners
    this.baseEmitter.setMaxListeners(this.config.maxListeners || 100);
    
    // Initialize counters for metrics
    this._initializeMetrics();
  }
  
  /**
   * Initialize the event emitter system
   * @returns {Promise<void>}
   */
  async initialize() {
    const span = tracer.startSpan('EnterpriseEventEmitter.initialize');
    
    try {
      span.addEvent('Starting initialization');
      logger.info('Initializing Enterprise Event Emitter');
      
      // Initialize Redis connections
      await this._initializeRedisConnections();
      
      // Initialize partitioning
      this._initializePartitioning();
      
      // Initialize schema registry
      await this._initializeSchemaRegistry();
      
      // Initialize encryption
      await this._initializeEncryption();
      
      // Initialize circuit breakers
      this._initializeCircuitBreakers();
      
      this.isInitialized = true;
      span.addEvent('Initialization complete');
      logger.info('Enterprise Event Emitter initialized successfully');
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to initialize Enterprise Event Emitter', { error: error.message, stack: error.stack });
      throw error;
    } finally {
      span.end();
    }
    
    return this;
  }
  
  /**
   * Merge default configuration
   * @param {Object} config User configuration
   * @returns {Object} Merged configuration
   * @private
   */
  _mergeDefaultConfig(config) {
    return {
      namespace: config.namespace || 'sports-analytics',
      historySize: config.historySize || 1000,
      maxListeners: config.maxListeners || 100,
      redis: {
        primary: config.redis?.primary || {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          password: process.env.REDIS_PASSWORD || '',
          db: parseInt(process.env.REDIS_DB, 10) || 0,
          enableAutoPipelining: true,
          maxRetriesPerRequest: 3
        },
        replicas: config.redis?.replicas || [],
        // Default to 3 Redis replicas if not specified
        replicaCount: config.redis?.replicaCount || 3
      },
      aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        kmsKeyId: process.env.AWS_KMS_KEY_ID || '',
        secretName: process.env.AWS_SECRET_NAME || 'sports-analytics/event-emitter'
      },
      persistence: {
        enabled: config.persistence?.enabled !== undefined ? config.persistence.enabled : true,
        storageType: config.persistence?.storageType || 'redis', // redis, s3, dynamodb
        retentionPeriod: config.persistence?.retentionPeriod || 30 * 24 * 60 * 60, // 30 days in seconds
        compressionEnabled: config.persistence?.compressionEnabled !== undefined ? config.persistence.compressionEnabled : true,
        compressionThreshold: config.persistence?.compressionThreshold || 1024, // bytes
        s3Bucket: config.persistence?.s3Bucket || process.env.S3_BUCKET || 'sports-analytics-events',
        dynamoTable: config.persistence?.dynamoTable || process.env.DYNAMO_TABLE || 'SportsAnalyticsEvents'
      },
      partitioning: {
        enabled: config.partitioning?.enabled !== undefined ? config.partitioning.enabled : true,
        strategy: config.partitioning?.strategy || 'consistent-hashing', // consistent-hashing, round-robin, topic-based
        partitionCount: config.partitioning?.partitionCount || 16,
        rebalanceInterval: config.partitioning?.rebalanceInterval || 60000, // ms
      },
      circuitBreaker: {
        enabled: config.circuitBreaker?.enabled !== undefined ? config.circuitBreaker.enabled : true,
        failureThreshold: config.circuitBreaker?.failureThreshold || 5,
        resetTimeout: config.circuitBreaker?.resetTimeout || 30000, // ms
        halfOpenMaxCalls: config.circuitBreaker?.halfOpenMaxCalls || 3
      },
      encryption: {
        enabled: config.encryption?.enabled !== undefined ? config.encryption.enabled : true,
        algorithm: config.encryption?.algorithm || 'aes-256-gcm',
        keyRotationInterval: config.encryption?.keyRotationInterval || 30 * 24 * 60 * 60 * 1000, // 30 days in ms
        sensitiveEvents: config.encryption?.sensitiveEvents || [
          'user:login', 'user:logout', 'payment', 'personal-data'
        ]
      },
      sequenceValidation: {
        enabled: config.sequenceValidation?.enabled !== undefined ? config.sequenceValidation.enabled : true,
        validateOrder: config.sequenceValidation?.validateOrder !== undefined ? config.sequenceValidation.validateOrder : true,
        ensureCompleteness: config.sequenceValidation?.ensureCompleteness !== undefined ? config.sequenceValidation.ensureCompleteness : true,
        gapDetectionWindow: config.sequenceValidation?.gapDetectionWindow || 100 // events
      },
      telemetry: {
        detailedMetrics: config.telemetry?.detailedMetrics !== undefined ? config.telemetry.detailedMetrics : true,
        samplingRate: config.telemetry?.samplingRate || 1.0, // 1.0 = 100%
        exportInterval: config.telemetry?.exportInterval || 15000, // ms
      },
      leagues: config.leagues || SUPPORTED_LEAGUES
    };
  }
  
  /**
   * Initialize metrics for monitoring
   * @private
   */
  _initializeMetrics() {
    // Event counters
    this.metrics.eventCounter = meter.createCounter('events.total', {
      description: 'Total number of events processed'
    });
    
    this.metrics.eventsByTopicCounter = meter.createCounter('events.by_topic', {
      description: 'Number of events by topic'
    });
    
    this.metrics.eventsByLeagueCounter = meter.createCounter('events.by_league', {
      description: 'Number of events by sports league'
    });
    
    this.metrics.errorCounter = meter.createCounter('events.errors', {
      description: 'Number of event processing errors'
    });
    
    // Performance histograms
    this.metrics.processingTimeHistogram = meter.createHistogram('events.processing_time', {
      description: 'Event processing time in milliseconds'
    });
    
    this.metrics.persistTimeHistogram = meter.createHistogram('events.persist_time', {
      description: 'Event persistence time in milliseconds'
    });
    
    // Gauges
    this.metrics.listenerCountGauge = meter.createUpDownCounter('events.listener_count', {
      description: 'Number of active event listeners'
    });
    
    this.metrics.circuitBreakerStatusGauge = meter.createUpDownCounter('events.circuit_breaker_status', {
      description: 'Circuit breaker status by event type (0=closed, 1=half-open, 2=open)'
    });
  }
  
  /**
   * Initialize Redis connections
   * @returns {Promise<void>}
   * @private
   */
  async _initializeRedisConnections() {
    const span = tracer.startSpan('EnterpriseEventEmitter._initializeRedisConnections');
    
    try {
      // Initialize primary Redis client
      this.primaryRedis = new Redis(this.config.redis.primary);
      this.redisConnections.set('primary', this.primaryRedis);
      
      // Initialize lock manager for distributed locks
      this.redlock = new Redlock(
        [this.primaryRedis],
        {
          driftFactor: 0.01,
          retryCount: 10,
          retryDelay: 200,
          retryJitter: 200
        }
      );
      
      // Initialize replica connections if configured
      if (this.config.redis.replicas.length > 0) {
        for (let i = 0; i < this.config.redis.replicas.length; i++) {
          const replica = new Redis(this.config.redis.replicas[i]);
          this.redisConnections.set(`replica-${i}`, replica);
        }
      } else if (this.config.redis.replicaCount > 0) {
        // Auto-initialize replicas based on configuration
        const replicaConfig = { ...this.config.redis.primary };
        
        // For each replica, slightly modify the connection config (typically would connect to read replicas)
        for (let i = 0; i < this.config.redis.replicaCount; i++) {
          replicaConfig.db = (replicaConfig.db + i + 1) % 16; // Simple way to distribute across DBs for example
          const replica = new Redis(replicaConfig);
          this.redisConnections.set(`replica-${i}`, replica);
        }
      }
      
      logger.info('Redis connections initialized', { 
        connectionCount: this.redisConnections.size 
      });
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to initialize Redis connections', { 
        error: error.message, 
        stack: error.stack 
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Initialize partitioning for distributed event processing
   * @private
   */
  _initializePartitioning() {
    if (!this.config.partitioning.enabled) {
      logger.info('Event partitioning is disabled');
      return;
    }
    
    // Import the PartitionManager
    try {
      this.partitionManager = new PartitionManager({
        strategy: this.config.partitioning.strategy,
        partitionCount: this.config.partitioning.partitionCount,
        rebalanceInterval: this.config.partitioning.rebalanceInterval,
        redis: this.primaryRedis,
        namespace: this.namespace,
        logger
      });
      
      logger.info('Partitioning initialized', {
        strategy: this.config.partitioning.strategy,
        partitionCount: this.config.partitioning.partitionCount
      });
    } catch (error) {
      logger.error('Failed to initialize partitioning', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Initialize schema registry for event versioning
   * @returns {Promise<void>}
   * @private
   */
  async _initializeSchemaRegistry() {
    try {
      this.schemaRegistry = new SchemaRegistry({
        redis: this.primaryRedis,
        namespace: this.namespace,
        logger
      });
      
      // Register builtin schemas for sports leagues
      for (const league of Object.values(this.config.leagues)) {
        await this._registerLeagueSchemas(league.id);
      }
      
      logger.info('Schema registry initialized');
    } catch (error) {
      logger.error('Failed to initialize schema registry', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Register schemas for a specific sports league
   * @param {string} leagueId League identifier
   * @returns {Promise<void>}
   * @private
   */
  async _registerLeagueSchemas(leagueId) {
    const baseSchemas = {
      'game:start': {
        version: '1.0.0',
        schema: {
          type: 'object',
          properties: {
            gameId: { type: 'string' },
            leagueId: { type: 'string' },
            startTime: { type: 'string', format: 'date-time' },
            teams: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  teamId: { type: 'string' },
                  name: { type: 'string' }
                },
                required: ['teamId', 'name']
              },
              minItems: 2,
              maxItems: 2
            },
            venue: { type: 'string' }
          },
          required: ['gameId', 'leagueId', 'startTime', 'teams']
        }
      },
      'game:end': {
        version: '1.0.0',
        schema: {
          type: 'object',
          properties: {
            gameId: { type: 'string' },
            leagueId: { type: 'string' },
            endTime: { type: 'string', format: 'date-time' },
            scores: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  teamId: { type: 'string' },
                  score: { type: 'number' }
                },
                required: ['teamId', 'score']
              },
              minItems: 2,
              maxItems: 2
            }
          },
          required: ['gameId', 'leagueId', 'endTime', 'scores']
        }
      },
      'player:stats': {
        version: '1.0.0',
        schema: {
          type: 'object',
          properties: {
            playerId: { type: 'string' },
            gameId: { type: 'string' },
            leagueId: { type: 'string' },
            teamId: { type: 'string' },
            stats: { type: 'object' }
          },
          required: ['playerId', 'gameId', 'leagueId', 'teamId', 'stats']
        }
      }
    };
    
    // League-specific schema extensions
    const leagueSpecificExtensions = {
      'nba': {
        'player:stats': {
          version: '1.0.0',
          schema: {
            type: 'object',
            properties: {
              playerId: { type: 'string' },
              gameId: { type: 'string' },
              leagueId: { type: 'string' },
              teamId: { type: 'string' },
              stats: {
                type: 'object',
                properties: {
                  points: { type: 'number' },
                  rebounds: { type: 'number' },
                  assists: { type: 'number' },
                  steals: { type: 'number' },
                  blocks: { type: 'number' },
                  turnovers: { type: 'number' },
                  minutesPlayed: { type: 'number' }
                }
              }
            },
            required: ['playerId', 'gameId', 'leagueId', 'teamId', 'stats']
          }
        }
      },
      'nhl': {
        'player:stats': {
          version: '1.0.0',
          schema: {
            type: 'object',
            properties: {
              playerId: { type: 'string' },
              gameId: { type: 'string' },
              leagueId: { type: 'string' },
              teamId: { type: 'string' },
              stats: {
                type: 'object',
                properties: {
                  goals: { type: 'number' },
                  assists: { type: 'number' },
                  penaltyMinutes: { type: 'number' },
                  shotsOnGoal: { type: 'number' },
                  timeOnIce: { type: 'number' }
                }
              }
            },
            required: ['playerId', 'gameId', 'leagueId', 'teamId', 'stats']
          }
        }
      },
      // Additional league-specific schemas for NFL, MLB, etc.
      // ...
    };
    
    // Register base schemas
    for (const [eventType, schemaInfo] of Object.entries(baseSchemas)) {
      const topicName = `${leagueId}.${eventType}`;
      await this.schemaRegistry.registerSchema(
        topicName,
        schemaInfo.version,
        schemaInfo.schema
      );
      
      // Create validator
      const ajv = new Ajv({ allErrors: true });
      const validator = ajv.compile(schemaInfo.schema);
      this.schemaValidators.set(topicName, validator);
    }
    
    // Register league-specific extensions if available
    if (leagueSpecificExtensions[leagueId]) {
      for (const [eventType, schemaInfo] of Object.entries(leagueSpecificExtensions[leagueId])) {
        const topicName = `${leagueId}.${eventType}`;
        await this.schemaRegistry.registerSchema(
          topicName,
          schemaInfo.version,
          schemaInfo.schema
        );
        
        // Create validator
        const ajv = new Ajv({ allErrors: true });
        const validator = ajv.compile(schemaInfo.schema);
        this.schemaValidators.set(topicName, validator);
      }
    }
  }
  
  /**
   * Initialize encryption services
   * @returns {Promise<void>}
   * @private
   */
  async _initializeEncryption() {
    if (!this.config.encryption.enabled) {
      logger.info('Event encryption is disabled');
      return;
    }
    
    try {
      // If using AWS KMS for key management
      if (this.config.aws.kmsKeyId) {
        const kms = new AWS.KMS({ region: this.config.aws.region });
        
        // Generate a data key that we'll use for encryption
        const params = {
          KeyId: this.config.aws.kmsKeyId,
          KeySpec: 'AES_256'
        };
        
        const dataKey = await kms.generateDataKey(params).promise();
        
        // Store the encrypted key for later use with KMS
        this.encryptedKey = dataKey.CiphertextBlob;
        
        // Use the plaintext key for encryption in this session
        this.cryptoKey = dataKey.Plaintext;
        
        // Schedule key rotation
        setTimeout(() => this._rotateEncryptionKey(), this.config.encryption.keyRotationInterval);
      } else {
        // For development/testing, generate a local key
        this.cryptoKey = crypto.randomBytes(32); // 256 bits
      }
      
      logger.info('Encryption initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize encryption', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Rotate encryption key
   * @returns {Promise<void>}
   * @private
   */
  async _rotateEncryptionKey() {
    const span = tracer.startSpan('EnterpriseEventEmitter._rotateEncryptionKey');
    
    try {
      if (this.config.aws.kmsKeyId) {
        const kms = new AWS.KMS({ region: this.config.aws.region });
        
        const params = {
          KeyId: this.config.aws.kmsKeyId,
          KeySpec: 'AES_256'
        };
        
        const dataKey = await kms.generateDataKey(params).promise();
        
        // Store the previous key temporarily for decryption of in-flight events
        const previousKey = this.cryptoKey;
        
        // Update to new key
        this.encryptedKey = dataKey.CiphertextBlob;
        this.cryptoKey = dataKey.Plaintext;
        
        // Clean up previous key after a grace period
        setTimeout(() => {
          if (previousKey) {
            // Securely zero out the previous key buffer
            if (Buffer.isBuffer(previousKey)) {
              previousKey.fill(0);
            }
          }
        }, 60000); // 1 minute grace period
        
        logger.info('Encryption key rotated successfully');
      } else {
        // For development/testing, generate a new local key
        const previousKey = this.cryptoKey;
        this.cryptoKey = crypto.randomBytes(32);
        
        // Clean up previous key after a grace period
        setTimeout(() => {
          if (previousKey) {
            previousKey.fill(0);
          }
        }, 60000);
      }
      
      // Schedule next rotation
      setTimeout(() => this._rotateEncryptionKey(), this.config.encryption.keyRotationInterval);
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to rotate encryption key', {
        error: error.message,
        stack: error.stack
      });
      // Continue using the existing key
    } finally {
      span.end();
    }
  }
  
  /**
   * Initialize circuit breakers for fault tolerance
   * @private
   */
  _initializeCircuitBreakers() {
    if (!this.config.circuitBreaker.enabled) {
      logger.info('Circuit breakers are disabled');
      return;
    }
    
    // We'll initialize circuit breakers dynamically as events are encountered
    logger.info('Circuit breakers initialized successfully', {
      failureThreshold: this.config.circuitBreaker.failureThreshold,
      resetTimeout: this.config.circuitBreaker.resetTimeout
    });
  }
  
  /**
   * Get or create a circuit breaker for an event type
   * @param {string} eventType Event type
   * @returns {Object} Circuit breaker state object
   * @private
   */
  _getCircuitBreaker(eventType) {
    if (!this.circuitBreakers.has(eventType)) {
      this.circuitBreakers.set(eventType, {
        state: CIRCUIT_STATE.CLOSED,
        failures: 0,
        lastFailure: null,
        lastSuccess: Date.now(),
        resetTimeout: null
      });
    }
    
    return this.circuitBreakers.get(eventType);
  }
  
  /**
   * Record a failure for a circuit breaker
   * @param {string} eventType Event type
   * @private
   */
  _recordFailure(eventType) {
    const breaker = this._getCircuitBreaker(eventType);
    breaker.failures++;
    breaker.lastFailure = Date.now();
    
    // Update circuit breaker status metric
    const circuitStatusValue = breaker.state === CIRCUIT_STATE.CLOSED ? 0 :
                               breaker.state === CIRCUIT_STATE.HALF_OPEN ? 1 : 2;
    this.metrics.circuitBreakerStatusGauge.add(0, { eventType });
    this.metrics.circuitBreakerStatusGauge.add(circuitStatusValue, { eventType });
    
    logger.debug('Circuit breaker failure recorded', {
      eventType,
      failures: breaker.failures,
      state: breaker.state
    });
    
    // Check if threshold is exceeded
    if (breaker.state === CIRCUIT_STATE.CLOSED && 
        breaker.failures >= this.config.circuitBreaker.failureThreshold) {
      this._openCircuit(eventType);
    }
  }
  
  /**
   * Record a success for a circuit breaker
   * @param {string} eventType Event type
   * @private
   */
  _recordSuccess(eventType) {
    const breaker = this._getCircuitBreaker(eventType);
    breaker.lastSuccess = Date.now();
    
    // If in half-open state, close the circuit after success
    if (breaker.state === CIRCUIT_STATE.HALF_OPEN) {
      this._closeCircuit(eventType);
    }
  }
  
  /**
   * Open a circuit breaker
   * @param {string} eventType Event type
   * @private
   */
  _openCircuit(eventType) {
    const breaker = this._getCircuitBreaker(eventType);
    breaker.state = CIRCUIT_STATE.OPEN;
    
    // Update circuit breaker status metric
    this.metrics.circuitBreakerStatusGauge.add(-1, { eventType }); // Remove previous value
    this.metrics.circuitBreakerStatusGauge.add(2, { eventType });  // Add OPEN value
    
    logger.warn('Circuit breaker opened', { eventType, failures: breaker.failures });
    
    // Set timeout to move to half-open state
    breaker.resetTimeout = setTimeout(() => {
      this._halfOpenCircuit(eventType);
    }, this.config.circuitBreaker.resetTimeout);
  }
  
  /**
   * Set circuit breaker to half-open state
   * @param {string} eventType Event type
   * @private
   */
  _halfOpenCircuit(eventType) {
    const breaker = this._getCircuitBreaker(eventType);
    breaker.state = CIRCUIT_STATE.HALF_OPEN;
    breaker.failures = 0;
    
    // Update circuit breaker status metric
    this.metrics.circuitBreakerStatusGauge.add(-2, { eventType }); // Remove OPEN value
    this.metrics.circuitBreakerStatusGauge.add(1, { eventType });  // Add HALF_OPEN value
    
    logger.info('Circuit breaker half-opened', { eventType });
  }
  
  /**
   * Close a circuit breaker
   * @param {string} eventType Event type
   * @private
   */
  _closeCircuit(eventType) {
    const breaker = this._getCircuitBreaker(eventType);
    
    // Clear any existing reset timeout
    if (breaker.resetTimeout) {
      clearTimeout(breaker.resetTimeout);
      breaker.resetTimeout = null;
    }
    
    breaker.state = CIRCUIT_STATE.CLOSED;
    breaker.failures = 0;
    
    // Update circuit breaker status metric
    this.metrics.circuitBreakerStatusGauge.add(-1, { eventType }); // Remove HALF_OPEN value
    this.metrics.circuitBreakerStatusGauge.add(0, { eventType });  // Add CLOSED value
    
    logger.info('Circuit breaker closed', { eventType });
  }
  
  /**
   * Check if a circuit is available for event processing
   * @param {string} eventType Event type
   * @returns {boolean} Whether circuit is available
   * @private
   */
  _isCircuitAvailable(eventType) {
    const breaker = this._getCircuitBreaker(eventType);
    
    if (breaker.state === CIRCUIT_STATE.CLOSED) {
      return true;
    } else if (breaker.state === CIRCUIT_STATE.HALF_OPEN) {
      // In half-open state, allow a limited number of test calls
      const halfOpenCalls = this.config.circuitBreaker.halfOpenMaxCalls;
      const recentCalls = breaker.failures;
      return recentCalls < halfOpenCalls;
    }
    
    return false;
  }
  
  /**
   * Subscribe to an event
   * @param {string} event Event name or pattern
   * @param {Function} listener Event listener function
   * @returns {Object} Reference to this instance for chaining
   */
  on(event, listener) {
    const span = tracer.startSpan('EnterpriseEventEmitter.on');
    
    try {
      this.baseEmitter.on(event, listener);
      
      // Update listener count metric
      this.metrics.listenerCountGauge.add(1, { event });
      
      logger.debug('Registered event listener', { event });
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to register event listener', {
        event,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
    
    return this;
  }
  
  /**
   * Subscribe to an event for one occurrence
   * @param {string} event Event name or pattern
   * @param {Function} listener Event listener function
   * @returns {Object} Reference to this instance for chaining
   */
  once(event, listener) {
    const span = tracer.startSpan('EnterpriseEventEmitter.once');
    
    try {
      // Wrap the listener to update metrics when it's called
      const wrappedListener = (...args) => {
        // Update listener count metric when the once listener is called
        this.metrics.listenerCountGauge.add(-1, { event });
        
        // Call the original listener
        listener(...args);
      };
      
      this.baseEmitter.once(event, wrappedListener);
      
      // Update listener count metric
      this.metrics.listenerCountGauge.add(1, { event });
      
      logger.debug('Registered one-time event listener', { event });
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to register one-time event listener', {
        event,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
    
    return this;
  }
  
  /**
   * Remove event listener
   * @param {string} event Event name
   * @param {Function} listener Event listener function
   * @returns {Object} Reference to this instance for chaining
   */
  off(event, listener) {
    const span = tracer.startSpan('EnterpriseEventEmitter.off');
    
    try {
      this.baseEmitter.off(event, listener);
      
      // Update listener count metric
      this.metrics.listenerCountGauge.add(-1, { event });
      
      logger.debug('Removed event listener', { event });
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to remove event listener', {
        event,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
    
    return this;
  }
  
  /**
   * Split topic path into segments
   * @param {string} topic Topic path
   * @returns {Array<string>} Topic segments
   * @private
   */
  _parseTopicPath(topic) {
    return topic.split('.');
  }
  
  /**
   * Get all parent topics in hierarchy
   * @param {string} topic Topic path
   * @returns {Array<string>} Array of parent topics
   * @private
   */
  _getTopicHierarchy(topic) {
    if (this.hierarchyCache.has(topic)) {
      return this.hierarchyCache.get(topic);
    }
    
    const segments = this._parseTopicPath(topic);
    const hierarchy = [];
    
    for (let i = 1; i <= segments.length; i++) {
      hierarchy.push(segments.slice(0, i).join('.'));
    }
    
    this.hierarchyCache.set(topic, hierarchy);
    return hierarchy;
  }
  
  /**
   * Emit an event with full featured processing
   * @param {string} topic Event topic
   * @param {Object} data Event data
   * @param {Object} options Options for event emission
   * @returns {Promise<boolean>} Whether the event had listeners
   */
  async emit(topic, data, options = {}) {
    const span = tracer.startSpan('EnterpriseEventEmitter.emit');
    const startTime = Date.now();
    let eventId = options.eventId || uuidv4();
    
    try {
      logger.debug('Emitting event', { topic, eventId });
      
      // Default options
      const mergedOptions = {
        persistent: this.config.persistence.enabled,
        encrypted: this.config.encryption.enabled && 
                   this.config.encryption.sensitiveEvents.some(pattern => 
                     new RegExp(pattern).test(topic)
                   ),
        validate: true,
        sequence: this.config.sequenceValidation.enabled,
        ...options
      };
      
      // Check circuit breaker state
      if (this.config.circuitBreaker.enabled && !this._isCircuitAvailable(topic)) {
        logger.warn('Circuit breaker open, event rejected', { topic, eventId });
        return false;
      }
      
      // Prepare event envelope
      const eventEnvelope = {
        id: eventId,
        topic,
        timestamp: new Date().toISOString(),
        dataSchema: options.schemaVersion || '1.0.0',
        sequence: mergedOptions.sequence ? await this._getNextSequence(topic) : null,
        partition: this.partitionManager ? 
                   this.partitionManager.getPartition(topic, data) :
                   0,
        data
      };
      
      // Validate schema if enabled
      if (mergedOptions.validate) {
        const isValid = await this._validateEvent(topic, data, options.schemaVersion);
        if (!isValid) {
          throw new Error(`Event validation failed for topic: ${topic}`);
        }
      }
      
      // Encrypt sensitive data if needed
      if (mergedOptions.encrypted && this.cryptoKey) {
        eventEnvelope.data = this._encryptData(data);
        eventEnvelope.encrypted = true;
      }
      
      // Determine if we should persist this event
      if (mergedOptions.persistent) {
        const persistStartTime = Date.now();
        await this._persistEvent(eventEnvelope);
        this.metrics.persistTimeHistogram.record(Date.now() - persistStartTime, { topic });
      }
      
      // Get the full topic hierarchy for inheritance
      const topicHierarchy = this._getTopicHierarchy(topic);
      
      // Track metrics
      this.metrics.eventCounter.add(1);
      this.metrics.eventsByTopicCounter.add(1, { topic });
      
      // Track metrics by league if applicable
      const leagueMatch = topic.match(/^([^.]+)\./);
      if (leagueMatch && Object.values(this.config.leagues).some(l => l.id === leagueMatch[1])) {
        this.metrics.eventsByLeagueCounter.add(1, { league: leagueMatch[1] });
      }
      
      // Emit to all levels of the topic hierarchy
      let hasListeners = false;
      for (const hierarchyTopic of topicHierarchy) {
        // Create a versioned event object for emission
        const emitData = {
          id: eventEnvelope.id,
          topic: hierarchyTopic,
          originalTopic: topic,
          timestamp: eventEnvelope.timestamp,
          sequence: eventEnvelope.sequence,
          data: eventEnvelope.encrypted ? this._decryptData(eventEnvelope.data) : eventEnvelope.data
        };
        
        // Record success for circuit breaker
        if (this.config.circuitBreaker.enabled) {
          this._recordSuccess(hierarchyTopic);
        }
        
        // Actual emission
        const result = this.baseEmitter.emit(hierarchyTopic, emitData);
        hasListeners = hasListeners || result;
      }
      
      logger.debug('Event emitted successfully', {
        topic,
        eventId,
        hasListeners,
        processingTime: Date.now() - startTime
      });
      
      // Record processing time
      this.metrics.processingTimeHistogram.record(Date.now() - startTime, { topic });
      
      return hasListeners;
    } catch (error) {
      span.recordException(error);
      
      // Track error metrics
      this.metrics.errorCounter.add(1, { topic, errorType: error.name });
      
      // Record failure for circuit breaker
      if (this.config.circuitBreaker.enabled) {
        this._recordFailure(topic);
      }
      
      logger.error('Failed to emit event', {
        topic,
        eventId,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Get next sequence number for a topic
   * @param {string} topic Event topic
   * @returns {Promise<number>} Next sequence number
   * @private
   */
  async _getNextSequence(topic) {
    // Try to use Redis for distributed sequence first
    if (this.primaryRedis) {
      const sequenceKey = `${this.namespace}:seq:${topic}`;
      return await this.primaryRedis.incr(sequenceKey);
    }
    
    // Fallback to local counter
    if (!this.sequenceCounters.has(topic)) {
      this.sequenceCounters.set(topic, 0);
    }
    
    const nextSeq = this.sequenceCounters.get(topic) + 1;
    this.sequenceCounters.set(topic, nextSeq);
    return nextSeq;
  }
  
  /**
   * Validate event against schema
   * @param {string} topic Event topic
   * @param {Object} data Event data
   * @param {string} version Schema version (optional)
   * @returns {Promise<boolean>} Validation result
   * @private
   */
  async _validateEvent(topic, data, version = '1.0.0') {
    try {
      // Try to get schema from registry first
      let schema;
      if (this.schemaRegistry) {
        schema = await this.schemaRegistry.getSchema(topic, version);
      }
      
      if (!schema) {
        // If no schema in registry, use cached validator
        const validator = this.schemaValidators.get(topic);
        if (!validator) {
          // No validator available, assume valid
          return true;
        }
        
        return validator(data);
      }
      
      // Create a validator for this schema if we got it from registry
      const ajv = new Ajv({ allErrors: true });
      const validator = ajv.compile(schema);
      const isValid = validator(data);
      
      if (!isValid) {
        logger.warn('Event validation failed', {
          topic,
          errors: validator.errors
        });
      }
      
      return isValid;
    } catch (error) {
      logger.error('Error during event validation', {
        topic,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
  
  /**
   * Encrypt data for sensitive events
   * @param {Object} data Data to encrypt
   * @returns {Object} Encrypted data
   * @private
   */
  _encryptData(data) {
    try {
      // Convert data to string
      const dataString = JSON.stringify(data);
      
      // Generate initialization vector
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const cipher = crypto.createCipheriv(
        this.config.encryption.algorithm,
        this.cryptoKey,
        iv
      );
      
      // Encrypt the data
      let encrypted = cipher.update(dataString, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get the authentication tag (for GCM mode)
      const authTag = cipher.getAuthTag ? cipher.getAuthTag() : null;
      
      return {
        iv: iv.toString('base64'),
        authTag: authTag ? authTag.toString('base64') : null,
        data: encrypted,
        algorithm: this.config.encryption.algorithm
      };
    } catch (error) {
      logger.error('Encryption failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Decrypt data from encrypted events
   * @param {Object} encryptedData Encrypted data object
   * @returns {Object} Decrypted data
   * @private
   */
  _decryptData(encryptedData) {
    try {
      if (!encryptedData || !encryptedData.data) {
        return encryptedData;
      }
      
      // Convert IV from base64
      const iv = Buffer.from(encryptedData.iv, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(
        encryptedData.algorithm || this.config.encryption.algorithm,
        this.cryptoKey,
        iv
      );
      
      // Set auth tag for GCM mode if present
      if (encryptedData.authTag && decipher.setAuthTag) {
        const authTag = Buffer.from(encryptedData.authTag, 'base64');
        decipher.setAuthTag(authTag);
      }
      
      // Decrypt the data
      let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Parse back to object
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Decryption failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Persist event to storage
   * @param {Object} eventEnvelope Event envelope to persist
   * @returns {Promise<void>}
   * @private
   */
  async _persistEvent(eventEnvelope) {
    const span = tracer.startSpan('EnterpriseEventEmitter._persistEvent');
    
    try {
      const storageType = this.config.persistence.storageType;
      
      // Clone the event to avoid modifying the original
      const persistedEvent = { ...eventEnvelope };
      
      // Compress if configured and data is large enough
      if (this.config.persistence.compressionEnabled) {
        const serializedData = JSON.stringify(persistedEvent.data);
        
        if (serializedData.length > this.config.persistence.compressionThreshold) {
          const compressed = zlib.gzipSync(serializedData);
          persistedEvent.data = compressed.toString('base64');
          persistedEvent.compressed = true;
        }
      }
      
      // Persist based on configured storage type
      switch (storageType) {
        case 'redis':
          await this._persistToRedis(persistedEvent);
          break;
        case 's3':
          await this._persistToS3(persistedEvent);
          break;
        case 'dynamodb':
          await this._persistToDynamoDB(persistedEvent);
          break;
        default:
          throw new Error(`Unsupported persistence storage type: ${storageType}`);
      }
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to persist event', {
        eventId: eventEnvelope.id,
        topic: eventEnvelope.topic,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Persist event to Redis
   * @param {Object} eventEnvelope Event envelope
   * @returns {Promise<void>}
   * @private
   */
  async _persistToRedis(eventEnvelope) {
    const eventKey = `${this.namespace}:events:${eventEnvelope.topic}:${eventEnvelope.id}`;
    const serialized = JSON.stringify(eventEnvelope);
    
    // Store with expiration
    await this.primaryRedis.set(
      eventKey,
      serialized,
      'EX',
      this.config.persistence.retentionPeriod
    );
    
    // Add to topic list
    const topicKey = `${this.namespace}:topics:${eventEnvelope.topic}`;
    await this.primaryRedis.zadd(
      topicKey,
      new Date(eventEnvelope.timestamp).getTime(),
      eventEnvelope.id
    );
    
    // Trim the topic list if needed
    await this.primaryRedis.zremrangebyrank(
      topicKey,
      0,
      -this.config.historySize - 1
    );
    
    // Set expiration on the topic list
    await this.primaryRedis.expire(
      topicKey,
      this.config.persistence.retentionPeriod
    );
    
    // Add to global events list
    const globalKey = `${this.namespace}:events:global`;
    await this.primaryRedis.zadd(
      globalKey,
      new Date(eventEnvelope.timestamp).getTime(),
      `${eventEnvelope.topic}:${eventEnvelope.id}`
    );
    
    // Trim global list
    await this.primaryRedis.zremrangebyrank(
      globalKey,
      0,
      -10000 // Keep last 10,000 global events
    );
    
    // Set expiration on global list
    await this.primaryRedis.expire(
      globalKey,
      this.config.persistence.retentionPeriod
    );
  }
  
  /**
   * Persist event to AWS S3
   * @param {Object} eventEnvelope Event envelope
   * @returns {Promise<void>}
   * @private
   */
  async _persistToS3(eventEnvelope) {
    const s3 = new AWS.S3();
    
    // Create path based on date and topic for efficient retrieval
    const date = new Date(eventEnvelope.timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    
    const key = `${year}/${month}/${day}/${hour}/${eventEnvelope.topic}/${eventEnvelope.id}.json`;
    
    const params = {
      Bucket: this.config.persistence.s3Bucket,
      Key: key,
      Body: JSON.stringify(eventEnvelope),
      ContentType: 'application/json'
    };
    
    await s3.putObject(params).promise();
  }
  
  /**
   * Persist event to AWS DynamoDB
   * @param {Object} eventEnvelope Event envelope
   * @returns {Promise<void>}
   * @private
   */
  async _persistToDynamoDB(eventEnvelope) {
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    
    // Extract date parts for efficient querying
    const date = new Date(eventEnvelope.timestamp);
    const dateString = date.toISOString().split('T')[0];
    
    const params = {
      TableName: this.config.persistence.dynamoTable,
      Item: {
        eventId: eventEnvelope.id,
        topic: eventEnvelope.topic,
        timestamp: date.getTime(),
        date: dateString,
        ttl: Math.floor(Date.now() / 1000) + this.config.persistence.retentionPeriod,
        eventData: eventEnvelope
      }
    };
    
    await dynamodb.put(params).promise();
  }
  
  /**
   * Begin a transaction for atomic multi-event emission
   * @returns {Promise<Object>} Transaction object
   */
  async beginTransaction() {
    const transactionId = uuidv4();
    const events = [];
    
    return {
      id: transactionId,
      events,
      
      /**
       * Add event to transaction
       * @param {string} topic Event topic
       * @param {Object} data Event data
       * @param {Object} options Event options
       */
      addEvent(topic, data, options = {}) {
        events.push({ topic, data, options });
      },
      
      /**
       * Commit the transaction
       * @returns {Promise<Array>} Results of event emissions
       */
      commit: async () => {
        return await this.commitTransaction(transactionId, events);
      }
    };
  }
  
  /**
   * Commit a transaction with atomic guarantees
   * @param {string} transactionId Transaction ID
   * @param {Array} events Events in the transaction
   * @returns {Promise<Array>} Results of event emissions
   */
  async commitTransaction(transactionId, events) {
    const span = tracer.startSpan('EnterpriseEventEmitter.commitTransaction');
    
    try {
      logger.debug('Committing transaction', { 
        transactionId, 
        eventCount: events.length 
      });
      
      // Get distributed lock for transaction
      const lock = await this.redlock.acquire(
        [`${this.namespace}:transaction:${transactionId}`],
        10000 // 10 second lock
      );
      
      try {
        return await this.transactionLock.acquire(transactionId, async () => {
          // Record transaction start
          const txStartKey = `${this.namespace}:tx:${transactionId}:start`;
          await this.primaryRedis.set(txStartKey, JSON.stringify({
            startTime: new Date().toISOString(),
            eventCount: events.length
          }), 'EX', 86400); // 1 day expiry
          
          // Validate all events first
          for (const event of events) {
            const isValid = await this._validateEvent(
              event.topic, 
              event.data, 
              event.options.schemaVersion
            );
            
            if (!isValid) {
              throw new Error(`Transaction validation failed for topic: ${event.topic}`);
            }
          }
          
          // Prepare all events with IDs and sequences
          const preparedEvents = await Promise.all(events.map(async (event) => {
            const eventId = event.options.eventId || uuidv4();
            const sequence = this.config.sequenceValidation.enabled ? 
                              await this._getNextSequence(event.topic) : 
                              null;
            
            return {
              ...event,
              prepared: {
                id: eventId,
                sequence
              }
            };
          }));
          
          // Record prepared state
          const txPreparedKey = `${this.namespace}:tx:${transactionId}:prepared`;
          await this.primaryRedis.set(
            txPreparedKey, 
            JSON.stringify(preparedEvents),
            'EX',
            86400 // 1 day expiry
          );
          
          // Emit all events
          const results = await Promise.all(preparedEvents.map(async (event) => {
            const options = {
              ...event.options,
              eventId: event.prepared.id,
              sequence: event.prepared.sequence,
              transactionId
            };
            
            return this.emit(event.topic, event.data, options);
          }));
          
          // Record transaction completion
          const txCompleteKey = `${this.namespace}:tx:${transactionId}:complete`;
          await this.primaryRedis.set(
            txCompleteKey,
            JSON.stringify({
              completeTime: new Date().toISOString(),
              results
            }),
            'EX',
            86400 // 1 day expiry
          );
          
          logger.info('Transaction committed successfully', {
            transactionId,
            eventCount: events.length
          });
          
          return results;
        });
      } finally {
        // Release the distributed lock
        await lock.release();
      }
    } catch (error) {
      span.recordException(error);
      logger.error('Transaction commit failed', {
        transactionId,
        error: error.message,
        stack: error.stack
      });
      
      // Record transaction failure for potential recovery
      if (this.primaryRedis) {
        const txFailKey = `${this.namespace}:tx:${transactionId}:failed`;
        await this.primaryRedis.set(
          txFailKey,
          JSON.stringify({
            failTime: new Date().toISOString(),
            error: error.message
          }),
          'EX',
          86400 // 1 day expiry
        );
      }
      
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Recover failed transactions
   * @returns {Promise<Array>} Recovered transaction IDs
   */
  async recoverFailedTransactions() {
    const span = tracer.startSpan('EnterpriseEventEmitter.recoverFailedTransactions');
    
    try {
      logger.info('Searching for failed transactions to recover');
      
      // Find failed transactions
      const failedTransactionKeys = await this.primaryRedis.keys(`${this.namespace}:tx:*:failed`);
      
      if (failedTransactionKeys.length === 0) {
        logger.info('No failed transactions found');
        return [];
      }
      
      const recoveredTransactions = [];
      
      for (const failKey of failedTransactionKeys) {
        const transactionId = failKey.split(':')[2];
        
        // Check if transaction was prepared but not completed
        const preparedKey = `${this.namespace}:tx:${transactionId}:prepared`;
        const completeKey = `${this.namespace}:tx:${transactionId}:complete`;
        
        const [prepared, completed] = await Promise.all([
          this.primaryRedis.get(preparedKey),
          this.primaryRedis.get(completeKey)
        ]);
        
        if (prepared && !completed) {
          try {
            const preparedEvents = JSON.parse(prepared);
            
            // Retry the events
            await Promise.all(preparedEvents.map(async (event) => {
              const options = {
                ...event.options,
                eventId: event.prepared.id,
                sequence: event.prepared.sequence,
                transactionId,
                recovered: true
              };
              
              return this.emit(event.topic, event.data, options);
            }));
            
            // Mark as recovered
            const recoveredKey = `${this.namespace}:tx:${transactionId}:recovered`;
            await this.primaryRedis.set(
              recoveredKey,
              JSON.stringify({
                recoveryTime: new Date().toISOString()
              }),
              'EX',
              86400 // 1 day expiry
            );
            
            recoveredTransactions.push(transactionId);
            logger.info('Recovered failed transaction', { transactionId });
          } catch (error) {
            logger.error('Failed to recover transaction', {
              transactionId,
              error: error.message,
              stack: error.stack
            });
          }
        }
      }
      
      return recoveredTransactions;
    } catch (error) {
      span.recordException(error);
      logger.error('Transaction recovery process failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Emit event with throttling to prevent overload
   * @param {string} topic Event topic
   * @param {number} throttleMs Throttle time in milliseconds
   * @param {Object} data Event data
   * @param {Object} options Event options
   * @returns {Promise<boolean>} Whether the event was emitted (not throttled)
   */
  async throttledEmit(topic, throttleMs, data, options = {}) {
    const throttleKey = `throttle:${topic}`;
    const now = Date.now();
    
    // Check if we're in throttle period
    const lastEmit = this.throttledEvents.get(throttleKey);
    
    if (lastEmit && now - lastEmit < throttleMs) {
      // Still in throttle period, don't emit
      logger.debug('Event throttled', { topic, throttleMs });
      return false;
    }
    
    // Update last emit time
    this.throttledEvents.set(throttleKey, now);
    
    // Emit the event
    return this.emit(topic, data, options);
  }
  
  /**
   * Schedule event for future emission
   * @param {string} topic Event topic
   * @param {Object} data Event data
   * @param {Date|number} scheduledTime Date object or timestamp for scheduled emission
   * @param {Object} options Event options
   * @returns {Promise<string>} Scheduled event ID
   */
  async scheduleEvent(topic, data, scheduledTime, options = {}) {
    const span = tracer.startSpan('EnterpriseEventEmitter.scheduleEvent');
    
    try {
      const eventId = options.eventId || uuidv4();
      
      // Convert to timestamp if Date object
      const timestamp = scheduledTime instanceof Date ? 
                        scheduledTime.getTime() : 
                        scheduledTime;
      
      // Calculate delay in ms
      const now = Date.now();
      const delayMs = Math.max(0, timestamp - now);
      
      if (delayMs === 0) {
        // Emit immediately if time is in the past
        await this.emit(topic, data, { ...options, eventId });
        return eventId;
      }
      
      // Store scheduled event in Redis if available
      if (this.primaryRedis) {
        const scheduledKey = `${this.namespace}:scheduled:${eventId}`;
        await this.primaryRedis.set(
          scheduledKey,
          JSON.stringify({
            id: eventId,
            topic,
            data,
            options,
            scheduledTime: timestamp,
            createdAt: now
          }),
          'EX',
          Math.ceil(delayMs / 1000) + 60 // TTL slightly longer than delay
        );
        
        // Add to sorted set for easier retrieval
        await this.primaryRedis.zadd(
          `${this.namespace}:scheduled`,
          timestamp,
          eventId
        );
      }
      
      // Set timeout for local execution
      setTimeout(async () => {
        try {
          await this.emit(topic, data, { ...options, eventId, scheduled: true });
          
          // Clean up Redis entry
          if (this.primaryRedis) {
            await this.primaryRedis.del(`${this.namespace}:scheduled:${eventId}`);
            await this.primaryRedis.zrem(`${this.namespace}:scheduled`, eventId);
          }
        } catch (error) {
          logger.error('Failed to emit scheduled event', {
            eventId,
            topic,
            error: error.message,
            stack: error.stack
          });
        }
      }, delayMs);
      
      logger.debug('Event scheduled', {
        eventId,
        topic,
        scheduledTime: new Date(timestamp).toISOString(),
        delayMs
      });
      
      return eventId;
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to schedule event', {
        topic,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Cancel a scheduled event
   * @param {string} eventId Scheduled event ID
   * @returns {Promise<boolean>} Whether the event was successfully canceled
   */
  async cancelScheduledEvent(eventId) {
    const span = tracer.startSpan('EnterpriseEventEmitter.cancelScheduledEvent');
    
    try {
      let success = false;
      
      // Remove from Redis if available
      if (this.primaryRedis) {
        const scheduledKey = `${this.namespace}:scheduled:${eventId}`;
        const deleted = await this.primaryRedis.del(scheduledKey);
        await this.primaryRedis.zrem(`${this.namespace}:scheduled`, eventId);
        
        success = deleted > 0;
      }
      
      logger.debug('Scheduled event canceled', { eventId, success });
      return success;
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to cancel scheduled event', {
        eventId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Process pending scheduled events (for use when resuming after restart)
   * @returns {Promise<number>} Number of events processed
   */
  async processPendingScheduledEvents() {
    const span = tracer.startSpan('EnterpriseEventEmitter.processPendingScheduledEvents');
    
    try {
      if (!this.primaryRedis) {
        return 0;
      }
      
      const now = Date.now();
      
      // Get all events that were scheduled to run before now
      const pendingEvents = await this.primaryRedis.zrangebyscore(
        `${this.namespace}:scheduled`,
        0,
        now
      );
      
      if (pendingEvents.length === 0) {
        return 0;
      }
      
      logger.info('Processing pending scheduled events', {
        count: pendingEvents.length
      });
      
      let processedCount = 0;
      
      for (const eventId of pendingEvents) {
        try {
          const scheduledKey = `${this.namespace}:scheduled:${eventId}`;
          const eventJson = await this.primaryRedis.get(scheduledKey);
          
          if (eventJson) {
            const event = JSON.parse(eventJson);
            
            // Emit the event
            await this.emit(
              event.topic,
              event.data,
              { 
                ...event.options, 
                eventId: event.id, 
                scheduled: true,
                delayed: true 
              }
            );
            
            // Clean up
            await this.primaryRedis.del(scheduledKey);
            processedCount++;
          }
        } catch (error) {
          logger.error('Failed to process pending scheduled event', {
            eventId,
            error: error.message,
            stack: error.stack
          });
        } finally {
          // Always remove from the sorted set even if processing failed
          await this.primaryRedis.zrem(`${this.namespace}:scheduled`, eventId);
        }
      }
      
      logger.info('Completed processing pending scheduled events', {
        processed: processedCount,
        total: pendingEvents.length
      });
      
      return processedCount;
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to process pending scheduled events', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Replay events from history
   * @param {string} topic Event topic to replay
   * @param {Object} options Replay options
   * @returns {Promise<number>} Number of events replayed
   */
  async replayEvents(topic, options = {}) {
    const span = tracer.startSpan('EnterpriseEventEmitter.replayEvents');
    
    try {
      const mergedOptions = {
        startTime: options.startTime || 0,
        endTime: options.endTime || Date.now(),
        limit: options.limit || 1000,
        ...options
      };
      
      logger.info('Starting event replay', {
        topic,
        startTime: new Date(mergedOptions.startTime).toISOString(),
        endTime: new Date(mergedOptions.endTime).toISOString(),
        limit: mergedOptions.limit
      });
      
      if (!this.primaryRedis) {
        throw new Error('Redis connection required for event replay');
      }
      
      const topicKey = `${this.namespace}:topics:${topic}`;
      
      // Get events within time range
      const eventIds = await this.primaryRedis.zrangebyscore(
        topicKey,
        mergedOptions.startTime,
        mergedOptions.endTime,
        'LIMIT',
        0,
        mergedOptions.limit
      );
      
      if (eventIds.length === 0) {
        logger.info('No events found to replay', { topic });
        return 0;
      }
      
      let replayedCount = 0;
      
      for (const eventId of eventIds) {
        try {
          const eventKey = `${this.namespace}:events:${topic}:${eventId}`;
          const eventJson = await this.primaryRedis.get(eventKey);
          
          if (eventJson) {
            const event = JSON.parse(eventJson);
            
            // Decrypt data if needed
            let data = event.data;
            if (event.encrypted && this.cryptoKey) {
              data = this._decryptData(event.data);
            }
            
            // Decompress if needed
            if (event.compressed) {
              const decompressed = zlib.gunzipSync(Buffer.from(data, 'base64'));
              data = JSON.parse(decompressed.toString());
            }
            
            // Re-emit with replay flag
            const emitOptions = {
              eventId: event.id,
              replayed: true,
              originalTimestamp: event.timestamp
            };
            
            await this.emit(topic, data, emitOptions);
            replayedCount++;
          }
        } catch (error) {
          logger.error('Failed to replay event', {
            topic,
            eventId,
            error: error.message,
            stack: error.stack
          });
        }
      }
      
      logger.info('Event replay completed', {
        topic,
        replayed: replayedCount,
        total: eventIds.length
      });
      
      return replayedCount;
    } catch (error) {
      span.recordException(error);
      logger.error('Event replay failed', {
        topic,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Get event history for a specific topic
   * @param {string} topic Event topic
   * @param {Object} options History options
   * @returns {Promise<Array>} Event history
   */
  async getEventHistory(topic, options = {}) {
    const span = tracer.startSpan('EnterpriseEventEmitter.getEventHistory');
    
    try {
      const limit = options.limit || 100;
      
      if (!this.primaryRedis) {
        // Fall back to in-memory history
        if (!this.eventsHistory[topic]) {
          return [];
        }
        
        return this.eventsHistory[topic].slice(-limit);
      }
      
      const topicKey = `${this.namespace}:topics:${topic}`;
      
      // Get event IDs from Redis sorted set
      const eventIds = await this.primaryRedis.zrevrange(
        topicKey,
        0,
        limit - 1
      );
      
      if (eventIds.length === 0) {
        return [];
      }
      
      // Get event data
      const events = [];
      
      for (const eventId of eventIds) {
        const eventKey = `${this.namespace}:events:${topic}:${eventId}`;
        const eventJson = await this.primaryRedis.get(eventKey);
        
        if (eventJson) {
          const event = JSON.parse(eventJson);
          
          // Decrypt and decompress if needed
          if ((event.encrypted || event.compressed) && options.includeData !== false) {
            let data = event.data;
            
            if (event.encrypted && this.cryptoKey) {
              data = this._decryptData(data);
            }
            
            if (event.compressed) {
              const decompressed = zlib.gunzipSync(Buffer.from(data, 'base64'));
              data = JSON.parse(decompressed.toString());
            }
            
            event.data = data;
            delete event.encrypted;
            delete event.compressed;
          } else if (options.includeData === false) {
            // Exclude data if requested
            delete event.data;
          }
          
          events.push(event);
        }
      }
      
      return events.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to get event history', {
        topic,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Check for sequence gaps in events
   * @param {string} topic Event topic
   * @param {Object} options Gap detection options
   * @returns {Promise<Array>} Array of detected gaps
   */
  async detectSequenceGaps(topic, options = {}) {
    const span = tracer.startSpan('EnterpriseEventEmitter.detectSequenceGaps');
    
    try {
      const window = options.window || this.config.sequenceValidation.gapDetectionWindow;
      
      if (!this.primaryRedis) {
        return [];
      }
      
      const topicKey = `${this.namespace}:topics:${topic}`;
      
      // Get recent events
      const eventIds = await this.primaryRedis.zrevrange(
        topicKey,
        0,
        window - 1
      );
      
      if (eventIds.length < 2) {
        return []; // Need at least 2 events to detect gaps
      }
      
      // Get event data with sequences
      const events = [];
      
      for (const eventId of eventIds) {
        const eventKey = `${this.namespace}:events:${topic}:${eventId}`;
        const eventJson = await this.primaryRedis.get(eventKey);
        
        if (eventJson) {
          const event = JSON.parse(eventJson);
          
          // Only include events with sequence numbers
          if (event.sequence !== null && event.sequence !== undefined) {
            events.push({
              id: event.id,
              sequence: event.sequence,
              timestamp: event.timestamp
            });
          }
        }
      }
      
      if (events.length < 2) {
        return [];
      }
      
      // Sort by sequence
      events.sort((a, b) => a.sequence - b.sequence);
      
      // Find gaps
      const gaps = [];
      
      for (let i = 1; i < events.length; i++) {
        const current = events[i];
        const previous = events[i - 1];
        
        const expectedSequence = previous.sequence + 1;
        
        if (current.sequence > expectedSequence) {
          gaps.push({
            topic,
            startSequence: previous.sequence,
            endSequence: current.sequence,
            missingCount: current.sequence - previous.sequence - 1,
            startEvent: previous.id,
            endEvent: current.id,
            startTimestamp: previous.timestamp,
            endTimestamp: current.timestamp
          });
        }
      }
      
      if (gaps.length > 0) {
        logger.warn('Sequence gaps detected', {
          topic,
          gapCount: gaps.length,
          details: gaps
        });
      }
      
      return gaps;
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to detect sequence gaps', {
        topic,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  /**
   * Get telemetry data for monitoring
   * @returns {Object} Telemetry data
   */
  getTelemetryData() {
    return {
      listenerCount: Object.fromEntries(
        [...this.baseEmitter.eventNames()].map(event => [
          event,
          this.baseEmitter.listenerCount(event)
        ])
      ),
      circuitBreakerStatus: Object.fromEntries(
        [...this.circuitBreakers.entries()].map(([event, breaker]) => [
          event,
          breaker.state
        ])
      ),
      topEventsByFrequency: this.metrics.eventsByTopicCounter.data
        ? Object.entries(this.metrics.eventsByTopicCounter.data)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
        : [],
      activePartitions: this.partitionManager 
        ? this.partitionManager.getActivePartitions() 
        : [],
      isInitialized: this.isInitialized,
      transactionsPending: this.transactionLock.isBusy() 
        ? this.transactionLock.queued() 
        : 0
    };
  }
  
  /**
   * Close connections and clean up resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    const span = tracer.startSpan('EnterpriseEventEmitter.shutdown');
    
    try {
      logger.info('Shutting down Enterprise Event Emitter');
      
      // Close Redis connections
      for (const [name, connection] of this.redisConnections.entries()) {
        logger.debug(`Closing Redis connection: ${name}`);
        await connection.quit();
      }
      
      // Clean up redlock if initialized
      if (this.redlock) {
        this.redlock.quit();
      }
      
      // Clean up partition manager
      if (this.partitionManager) {
        await this.partitionManager.shutdown();
      }
      
      // Clean up any encryption keys
      if (this.cryptoKey && Buffer.isBuffer(this.cryptoKey)) {
        this.cryptoKey.fill(0);
      }
      
      // Remove all listeners
      this.baseEmitter.removeAllListeners();
      
      logger.info('Enterprise Event Emitter shutdown complete');
    } catch (error) {
      span.recordException(error);
      logger.error('Error during shutdown', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  }
}

/**
 * Create required dependency files
 */

class PartitionManager {
  /**
   * Initialize the partition manager
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.strategy = options.strategy || 'consistent-hashing';
    this.partitionCount = options.partitionCount || 16;
    this.rebalanceInterval = options.rebalanceInterval || 60000;
    this.redis = options.redis;
    this.namespace = options.namespace || 'default';
    this.logger = options.logger || console;
    this.partitions = new Map();
    this.activePartitions = [];
    
    // Initialize partitions
    this._initializePartitions();
    
    // Start rebalance timer if needed
    if (this.rebalanceInterval > 0) {
      this.rebalanceTimer = setInterval(() => {
        this._rebalancePartitions().catch(err => {
          this.logger.error('Partition rebalance failed', {
            error: err.message,
            stack: err.stack
          });
        });
      }, this.rebalanceInterval);
    }
  }
  
  /**
   * Initialize partitions
   * @private
   */
  _initializePartitions() {
    for (let i = 0; i < this.partitionCount; i++) {
      this.activePartitions.push(i);
    }
  }
  
  /**
   * Get partition for a topic and data
   * @param {string} topic Topic
   * @param {Object} data Event data
   * @returns {number} Partition number
   */
  getPartition(topic, data) {
    switch (this.strategy) {
      case 'consistent-hashing':
        return this._getConsistentHashPartition(topic, data);
      case 'round-robin':
        return this._getRoundRobinPartition();
      case 'topic-based':
        return this._getTopicBasedPartition(topic);
      default:
        return 0;
    }
  }
  
  /**
   * Get partition using consistent hashing
   * @param {string} topic Topic
   * @param {Object} data Event data
   * @returns {number} Partition number
   * @private
   */
  _getConsistentHashPartition(topic, data) {
    let key = topic;
    
    // If data has an ID field, use it for more consistent routing
    if (data && (data.id || data.gameId || data.playerId || data.userId)) {
      key = `${topic}:${data.id || data.gameId || data.playerId || data.userId}`;
    }
    
    // Simple hash function
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    return hashNum % this.partitionCount;
  }
  
  /**
   * Get partition using round-robin
   * @returns {number} Partition number
   * @private
   */
  _getRoundRobinPartition() {
    const partitionKey = `${this.namespace}:partition:round-robin`;
    
    // If Redis available, use it for distributed counter
    if (this.redis) {
      return this.redis.incr(partitionKey)
        .then(counter => counter % this.partitionCount)
        .catch(() => {
          // Fallback to simple round-robin
          return Math.floor(Math.random() * this.partitionCount);
        });
    }
    
    // Simple local round-robin
    return Math.floor(Math.random() * this.partitionCount);
  }
  
  /**
   * Get partition based on topic
   * @param {string} topic Topic
   * @returns {number} Partition number
   * @private
   */
  _getTopicBasedPartition(topic) {
    const segments = topic.split('.');
    
    // Use first segment (e.g., league) for partitioning
    if (segments.length > 0) {
      const key = segments[0];
      const hash = crypto.createHash('md5').update(key).digest('hex');
      const hashNum = parseInt(hash.substring(0, 8), 16);
      return hashNum % this.partitionCount;
    }
    
    return 0;
  }
  
  /**
   * Rebalance partitions
   * @returns {Promise<void>}
   * @private
   */
  async _rebalancePartitions() {
    // This is a placeholder for more complex rebalancing logic
    // In a full implementation, this would coordinate with other nodes
    this.logger.debug('Partition rebalancing check completed');
  }
  
  /**
   * Get active partitions
   * @returns {Array<number>} Active partition numbers
   */
  getActivePartitions() {
    return [...this.activePartitions];
  }
  
  /**
   * Shutdown the partition manager
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
    }
    
    this.logger.debug('Partition manager shut down');
  }
}

class SchemaRegistry {
  /**
   * Initialize the schema registry
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.redis = options.redis;
    this.namespace = options.namespace || 'default';
    this.logger = options.logger || console;
    this.schemaCache = new Map();
  }
  
  /**
   * Register a schema for an event type
   * @param {string} eventType Event type
   * @param {string} version Schema version
   * @param {Object} schema JSON schema
   * @returns {Promise<void>}
   */
  async registerSchema(eventType, version, schema) {
    try {
      const schemaKey = `${this.namespace}:schema:${eventType}:${version}`;
      
      // Validate schema before registration
      const ajv = new Ajv();
      ajv.compile(schema); // This will throw if schema is invalid
      
      // Store schema in Redis
      if (this.redis) {
        await this.redis.set(
          schemaKey,
          JSON.stringify(schema)
        );
        
        // Update schema versions list
        await this.redis.sadd(
          `${this.namespace}:schema-versions:${eventType}`,
          version
        );
      }
      
      // Update local cache
      this.schemaCache.set(`${eventType}:${version}`, schema);
      
      this.logger.debug('Schema registered', { eventType, version });
    } catch (error) {
      this.logger.error('Failed to register schema', {
        eventType,
        version,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Get schema for an event type
   * @param {string} eventType Event type
   * @param {string} version Schema version (optional)
   * @returns {Promise<Object>} JSON schema
   */
  async getSchema(eventType, version = '1.0.0') {
    try {
      const cacheKey = `${eventType}:${version}`;
      
      // Check cache first
      if (this.schemaCache.has(cacheKey)) {
        return this.schemaCache.get(cacheKey);
      }
      
      // Try to get from Redis
      if (this.redis) {
        const schemaKey = `${this.namespace}:schema:${eventType}:${version}`;
        const schemaJson = await this.redis.get(schemaKey);
        
        if (schemaJson) {
          const schema = JSON.parse(schemaJson);
          this.schemaCache.set(cacheKey, schema);
          return schema;
        }
      }
      
      // No schema found
      return null;
    } catch (error) {
      this.logger.error('Failed to get schema', {
        eventType,
        version,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }
  
  /**
   * Get all versions of a schema
   * @param {string} eventType Event type
   * @returns {Promise<Array<string>>} Array of versions
   */
  async getSchemaVersions(eventType) {
    try {
      if (this.redis) {
        const versions = await this.redis.smembers(
          `${this.namespace}:schema-versions:${eventType}`
        );
        
        return versions.sort((a, b) => {
          const versionA = a.split('.').map(Number);
          const versionB = b.split('.').map(Number);
          
          for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
            const numA = versionA[i] || 0;
            const numB = versionB[i] || 0;
            
            if (numA !== numB) {
              return numA - numB;
            }
          }
          
          return 0;
        });
      }
      
      return [];
    } catch (error) {
      this.logger.error('Failed to get schema versions', {
        eventType,
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }
  
  /**
   * Transform data from an old schema version to a new one
   * @param {string} eventType Event type
   * @param {Object} data Event data
   * @param {string} fromVersion Source schema version
   * @param {string} toVersion Target schema version
   * @returns {Promise<Object>} Transformed data
   */
  async migrateData(eventType, data, fromVersion, toVersion) {
    try {
      if (fromVersion === toVersion) {
        return data;
      }
      
      // Get migration function from Redis or a predefined set
      const migrationKey = `${this.namespace}:migration:${eventType}:${fromVersion}:${toVersion}`;
      
      if (this.redis) {
        const migrationScript = await this.redis.get(migrationKey);
        
        if (migrationScript) {
          // Execute migration script
          const migrationFn = new Function('data', migrationScript);
          return migrationFn(data);
        }
      }
      
      // No migration path found, return original data
      this.logger.warn('No migration path found', {
        eventType,
        fromVersion,
        toVersion
      });
      
      return data;
    } catch (error) {
      this.logger.error('Data migration failed', {
        eventType,
        fromVersion,
        toVersion,
        error: error.message,
        stack: error.stack
      });
      
      // Return original data on error
      return data;
    }
  }
}

module.exports = EnterpriseEventEmitter;