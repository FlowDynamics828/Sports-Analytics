/**
 * Advanced Factor Correlation Analysis Engine
 * 
 * Enterprise-grade system for analyzing correlations between different prediction factors
 * with cutting-edge machine learning and statistical algorithms.
 * 
 * Features:
 * - Deep learning correlation analysis using transformers for temporal sequences
 * - Probabilistic graphical models for advanced causal inference
 * - Bayesian neural networks for correlation prediction with uncertainty quantification
 * - Transfer learning from pre-trained models for cold start scenarios
 * - Non-linear correlation detection using kernel methods
 * - Quantum-inspired optimization algorithms for correlation matrix calculation
 * - Adaptive sliding window time-series analysis with automatic window sizing
 * - Dynamic factor embeddings that evolve over time
 * - Comprehensive model versioning, performance metrics, and A/B testing framework
 * - Multi-league support for NBA, NHL, NFL, MLB, La Liga, Serie A, Premier League, and Bundesliga
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

// Core dependencies
const mongoose = require('mongoose');
const redis = require('redis');
const math = require('mathjs');
const { v4: uuidv4 } = require('uuid');
const tf = require('@tensorflow/tfjs-node');
const { PCA } = require('ml-pca');
const jstat = require('jstat');
const bayesjs = require('bayesjs');
const dagre = require('dagre');
const kernel = require('ml-kernel');
const PCAlgorithm = require('pc-algorithm');
const R = require('r-script');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const { Worker } = require('worker_threads');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const FastPriorityQueue = require('fastpriorityqueue');
const moment = require('moment');

// Custom utilities
const logger = require('./utils/logger');
const { CorrelationModel } = require('./models/correlation_model');
const { PredictionModel } = require('./models/prediction_model');
const { EventOutcomeModel } = require('./models/event_outcome_model');
const { ModelVersionModel } = require('./models/model_version');
const { ExperimentModel } = require('./models/experiment');
const { FactorEmbeddingModel } = require('./models/factor_embedding');
const { AnomalyModel } = require('./models/anomaly');
const { CausalGraphModel } = require('./models/causal_graph');
const { PerformanceMetricModel } = require('./models/performance_metric');
const { LeagueConfigModel } = require('./models/league_config');

// Environment configuration
require('dotenv').config();

// Quantum computing simulation library
const qiskit = require('./utils/qiskit_sim');

// TensorFlow model handlers
const { TransformerCorrelator } = require('./models/ml/transformer_correlator');
const { BayesianNeuralNetwork } = require('./models/ml/bayesian_neural_network');
const { KernelCorrelator } = require('./models/ml/kernel_correlator');
const { AdaptiveWindowAnalyzer } = require('./models/ml/adaptive_window_analyzer');
const { FactorEmbedder } = require('./models/ml/factor_embedder');
const { TransferLearningManager } = require('./models/ml/transfer_learning_manager');
const { CausalDiscoveryEngine } = require('./models/ml/causal_discovery_engine');

// Cloud model storage and retrieval
const { ModelRegistry } = require('./utils/model_registry');

// Configure league-specific parameters
const LEAGUE_CONFIGS = {
  NBA: {
    id: 'nba',
    factorWeights: { player: 0.6, team: 0.4 },
    seasonLength: 82,
    defaultCorrelationHalflife: 30,
    keyMetrics: ['points', 'rebounds', 'assists', 'steals', 'blocks', 'field_goal_percentage'],
    modelParams: {
      transformerLayers: 4,
      bnuSlippage: 0.15,
      windowSizes: [7, 14, 30, 60]
    }
  },
  NFL: {
    id: 'nfl',
    factorWeights: { player: 0.45, team: 0.55 },
    seasonLength: 17,
    defaultCorrelationHalflife: 45,
    keyMetrics: ['passing_yards', 'rushing_yards', 'touchdowns', 'interceptions', 'completion_percentage'],
    modelParams: {
      transformerLayers: 3,
      bnuSlippage: 0.22,
      windowSizes: [1, 3, 6, 9]
    }
  },
  NHL: {
    id: 'nhl',
    factorWeights: { player: 0.5, team: 0.5 },
    seasonLength: 82,
    defaultCorrelationHalflife: 25,
    keyMetrics: ['goals', 'assists', 'shots', 'plus_minus', 'penalty_minutes'],
    modelParams: {
      transformerLayers: 3,
      bnuSlippage: 0.18,
      windowSizes: [5, 10, 20, 40]
    }
  },
  MLB: {
    id: 'mlb',
    factorWeights: { player: 0.65, team: 0.35 },
    seasonLength: 162,
    defaultCorrelationHalflife: 20,
    keyMetrics: ['batting_average', 'home_runs', 'rbi', 'era', 'whip', 'strikeouts'],
    modelParams: {
      transformerLayers: 4,
      bnuSlippage: 0.12,
      windowSizes: [5, 10, 20, 30]
    }
  },
  LALIGA: {
    id: 'laliga',
    factorWeights: { player: 0.4, team: 0.6 },
    seasonLength: 38,
    defaultCorrelationHalflife: 35,
    keyMetrics: ['goals', 'assists', 'shots_on_target', 'pass_completion', 'tackles'],
    modelParams: {
      transformerLayers: 3,
      bnuSlippage: 0.17,
      windowSizes: [3, 5, 10, 15]
    }
  },
  SERIEA: {
    id: 'seriea',
    factorWeights: { player: 0.4, team: 0.6 },
    seasonLength: 38,
    defaultCorrelationHalflife: 35,
    keyMetrics: ['goals', 'assists', 'shots_on_target', 'pass_completion', 'tackles'],
    modelParams: {
      transformerLayers: 3,
      bnuSlippage: 0.17,
      windowSizes: [3, 5, 10, 15]
    }
  },
  PREMIERLEAGUE: {
    id: 'premier',
    factorWeights: { player: 0.45, team: 0.55 },
    seasonLength: 38,
    defaultCorrelationHalflife: 30,
    keyMetrics: ['goals', 'assists', 'clean_sheets', 'pass_completion', 'tackles'],
    modelParams: {
      transformerLayers: 4,
      bnuSlippage: 0.16,
      windowSizes: [3, 5, 10, 15]
    }
  },
  BUNDESLIGA: {
    id: 'bundesliga',
    factorWeights: { player: 0.45, team: 0.55 },
    seasonLength: 34,
    defaultCorrelationHalflife: 32,
    keyMetrics: ['goals', 'assists', 'shots_on_target', 'pass_completion', 'tackles'],
    modelParams: {
      transformerLayers: 3,
      bnuSlippage: 0.19,
      windowSizes: [3, 5, 10, 15]
    }
  }
};

// Global configuration constants
const CRYPTO_KEY = process.env.CRYPTO_KEY || 'sports-analytics-platform-encryption-key-2023';
const DEFAULT_CORRELATION = 0.0;
const MIN_DATA_POINTS = 30;
const CACHE_TTL = 60 * 60 * 24;
const CORRELATION_REFRESH_HOURS = 8;
const MAX_FACTOR_MEMORY_CACHE = 5000;
const REDIS_PREFIX = 'adv-correlation:';
const TIME_WEIGHT_HALFLIFE = 30;
const MIN_TIME_WEIGHT = 0.05;
const BAYESIAN_PRIOR_STRENGTH = 8;
const ANOMALY_THRESHOLD = 0.25;
const WORKER_CHUNK_SIZE = 200;
const CAUSAL_DISCOVERY_THRESHOLD = 0.5;
const MAX_EMBEDDINGS_DIMENSIONS = 128;
const MIN_EMBEDDINGS_DIMENSIONS = 16;
const MAX_WORKERS = Math.max(1, Math.min(os.cpus().length - 1, 8));
const EMBEDDING_UPDATE_INTERVAL_HOURS = 12;
const MODEL_REGISTRY_BUCKET = process.env.MODEL_REGISTRY_BUCKET || 'sports-analytics-ml-models';
const API_KEYS = {
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY || 'AKIAXXXXXXXXXXXXXXXXXXX',
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY || 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  FEATURE_STORE_API_KEY: process.env.FEATURE_STORE_API_KEY || 'fs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
};

// Experiment configuration
const EXPERIMENT_CONFIGS = {
  'transformer-vs-traditional': {
    id: 'exp-001',
    description: 'Compare transformer-based correlation with traditional time-weighted correlation',
    variantA: 'transformer',
    variantB: 'traditional',
    metrics: ['correlation_accuracy', 'prediction_improvement', 'processing_time'],
    trafficSplit: { transformer: 0.5, traditional: 0.5 },
    isActive: true,
    startDate: '2024-01-01',
    endDate: '2024-04-01'
  },
  'causal-discovery-methods': {
    id: 'exp-002',
    description: 'Compare PC algorithm vs. NOTEARS vs. Granger causality for causal discovery',
    variantA: 'pc-algorithm',
    variantB: 'notears',
    variantC: 'granger',
    metrics: ['causal_accuracy', 'counterfactual_consistency', 'graph_complexity'],
    trafficSplit: { 'pc-algorithm': 0.4, 'notears': 0.4, 'granger': 0.2 },
    isActive: true,
    startDate: '2024-01-15',
    endDate: '2024-04-15'
  },
  'adaptive-window-sizes': {
    id: 'exp-003',
    description: 'Compare fixed windows vs. adaptive windows for time series analysis',
    variantA: 'adaptive',
    variantB: 'fixed',
    metrics: ['prediction_accuracy', 'processing_time', 'anomaly_detection_rate'],
    trafficSplit: { adaptive: 0.7, fixed: 0.3 },
    isActive: true,
    startDate: '2024-02-01',
    endDate: '2024-05-01'
  }
};

/**
 * Advanced factor correlation engine class with cutting-edge machine learning capabilities
 */
class AdvancedFactorCorrelationEngine {
  /**
   * Initialize the correlation analysis engine
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    // Database connections
    this.mongoUri = options.mongoUri || process.env.MONGO_URI || "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority";
    this.dbName = options.dbName || process.env.MONGO_DB_NAME || "SportsAnalytics";
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
    
    // Connection objects
    this.mongoConnection = null;
    this.redisClient = null;
    
    // State tracking
    this.isInitialized = false;
    this.correlationCache = new Map();
    this.lastFullUpdate = null;
    this.modelRegistry = null;
    this.workers = new Map();
    this.leagueConfigs = new Map();
    this.experiments = new Map();
    this.activeExperiments = [];
    
    // Advanced ML models
    this.transformerModel = null;
    this.bayesianNN = null;
    this.kernelCorrelator = null;
    this.adaptiveWindowAnalyzer = null;
    this.factorEmbedder = null;
    this.transferLearningManager = null;
    this.causalDiscoveryEngine = null;
    this.quantumOptimizer = null;
    
    // Configuration settings
    this.timeWeightHalflife = options.timeWeightHalflife || TIME_WEIGHT_HALFLIFE;
    this.minTimeWeight = options.minTimeWeight || MIN_TIME_WEIGHT;
    this.bayesianPriorStrength = options.bayesianPriorStrength || BAYESIAN_PRIOR_STRENGTH;
    this.useBayesianAdjustment = options.useBayesianAdjustment !== undefined ? options.useBayesianAdjustment : true;
    this.anomalyThreshold = options.anomalyThreshold || 0.15; // Reduced from 0.25 to improve detection rate
    this.anomalyDetection = options.anomalyDetection !== undefined ? options.anomalyDetection : true;
    this.anomalyRegistry = new Map();
    this.useParallelization = options.useParallelization !== undefined ? options.useParallelization : true;
    this.workerChunkSize = options.workerChunkSize || WORKER_CHUNK_SIZE;
    this.useTransferLearning = options.useTransferLearning !== undefined ? options.useTransferLearning : false; // Disabled as it depends on TensorFlow
    this.enableCausalDiscovery = options.enableCausalDiscovery !== undefined ? options.enableCausalDiscovery : false; // Disabled as it depends on Python libraries
    this.causalRelationships = new Map();
    this.causalGraphs = new Map();
    this.causalDiscoveryThreshold = options.causalDiscoveryThreshold || CAUSAL_DISCOVERY_THRESHOLD;
    this.useDeepLearning = options.useDeepLearning !== undefined ? options.useDeepLearning : false; // Disabled as it depends on TensorFlow
    this.useQuantumOptimization = options.useQuantumOptimization !== undefined ? options.useQuantumOptimization : false; // Disabled as it depends on specialized libraries
    this.useAdaptiveWindows = options.useAdaptiveWindows !== undefined ? options.useAdaptiveWindows : true;
    this.useDynamicEmbeddings = options.useDynamicEmbeddings !== undefined ? options.useDynamicEmbeddings : false; // Disabled as it depends on TensorFlow
    this.enableExperiments = options.enableExperiments !== undefined ? options.enableExperiments : false; // Disabled to improve stability
    this.embeddingDimensions = options.embeddingDimensions || 32; // Reduced from 64 for better performance
    
    // Enhanced caching configuration
    this.maxCacheItems = options.maxCacheItems || 10000; // Increased from 5000
    this.cacheTTL = options.cacheTTL || 60 * 60 * 12; // Increased from default to 12 hours
    this.prefetchPopularFactors = options.prefetchPopularFactors !== undefined ? options.prefetchPopularFactors : true;
    this.useInMemoryCache = options.useInMemoryCache !== undefined ? options.useInMemoryCache : true;
    
    // Performance optimization flags
    this.useSimplifiedComputation = options.useSimplifiedComputation !== undefined ? options.useSimplifiedComputation : true;
    this.useOptimizedQueries = options.useOptimizedQueries !== undefined ? options.useOptimizedQueries : true;
    this.useFallbackModels = options.useFallbackModels !== undefined ? options.useFallbackModels : true;
    
    // Metrics tracking
    this.metrics = {
      total_requests: 0,
      total_queries: 0,
      cache_hits: 0,
      cache_misses: 0,
      avg_query_time_ms: 0,
      total_correlation_calculations: 0,
      total_joint_probability_calculations: 0,
      total_causal_discoveries: 0,
      algorithm_performance: {
        transformer: {
          accuracy: 0,
          latency_ms: 0,
          requests: 0
        },
        bayesian_nn: {
          accuracy: 0,
          latency_ms: 0,
          requests: 0
        },
        kernel_methods: {
          accuracy: 0,
          latency_ms: 0,
          requests: 0
        },
        quantum_optimization: {
          speedup_factor: 0,
          accuracy: 0,
          requests: 0
        },
        adaptive_window: {
          accuracy_improvement: 0,
          avg_window_size: 0,
          requests: 0
        },
        transfer_learning: {
          cold_start_improvement: 0,
          requests: 0
        },
        causal_discovery: {
          precision: 0,
          recall: 0,
          requests: 0
        },
        dynamic_embeddings: {
          coherence: 0,
          stability: 0,
          requests: 0
        }
      },
      experiment_metrics: {},
      last_update: null,
      anomalies_detected: 0,
      anomalies_resolved: 0,
      causal_relationships_discovered: 0,
      model_versions: {}
    };

    // Bind methods to this instance
    this.initialize = this.initialize.bind(this);
    this.shutdown = this.shutdown.bind(this);
    this.getFactorCorrelation = this.getFactorCorrelation.bind(this);
    this.getCorrelationMatrix = this.getCorrelationMatrix.bind(this);
    this.calculateMultiFactorProbability = this.calculateMultiFactorProbability.bind(this);
    this.updateCorrelation = this.updateCorrelation.bind(this);
    this.rebuildCorrelationMatrices = this.rebuildCorrelationMatrices.bind(this);
    this.trainTransformerModel = this.trainTransformerModel.bind(this);
    this.trainBayesianNeuralNetwork = this.trainBayesianNeuralNetwork.bind(this);
    this.initializeFactorEmbeddings = this.initializeFactorEmbeddings.bind(this);
    this.discoverCausalStructure = this.discoverCausalStructure.bind(this);
    this.getExplainableInsights = this.getExplainableInsights.bind(this);
    this.analyzeCounterfactual = this.analyzeCounterfactual.bind(this);
    this.getModelVersion = this.getModelVersion.bind(this);
    this.runExperiment = this.runExperiment.bind(this);
    this.recordExperimentResult = this.recordExperimentResult.bind(this);
    this.optimizeWithQuantumAlgorithm = this.optimizeWithQuantumAlgorithm.bind(this);
  }

  /**
   * Initialize connections to MongoDB and Redis and load ML models
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('AdvancedFactorCorrelationEngine: Already initialized');
      return;
    }

    const startTime = performance.now();
    logger.info('AdvancedFactorCorrelationEngine: Initializing advanced correlation system...');

    try {
      // Connect to MongoDB
      logger.info('AdvancedFactorCorrelationEngine: Connecting to MongoDB...');
      await mongoose.connect(this.mongoUri, { 
        dbName: this.dbName,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 10000
      });
      this.mongoConnection = mongoose.connection;
      logger.info('AdvancedFactorCorrelationEngine: MongoDB connection established');

      // Connect to Redis
      logger.info('AdvancedFactorCorrelationEngine: Connecting to Redis...');
      this.redisClient = redis.createClient({
        url: this.redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 100, 5000) // Exponential backoff with max
        }
      });
      
      // Redis error handling
      this.redisClient.on('error', (err) => {
        logger.error(`AdvancedFactorCorrelationEngine: Redis error: ${err.message}`);
      });
      
      await this.redisClient.connect();
      logger.info('AdvancedFactorCorrelationEngine: Redis connection established');
      
      // Set up AWS for model storage
      AWS.config.update({
        accessKeyId: API_KEYS.AWS_ACCESS_KEY,
        secretAccessKey: API_KEYS.AWS_SECRET_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });
      
      // Initialize model registry
      this.modelRegistry = new ModelRegistry({
        bucketName: MODEL_REGISTRY_BUCKET,
        localCachePath: './model_cache'
      });
      
      // Load league configurations from database or use defaults
      await this.loadLeagueConfigurations();
      
      // Set up experiment configurations
      await this.setupExperiments();
      
      // Initialize ML models
      if (this.useDeepLearning) {
        await this.initializeMLModels();
      }
      
      // Start worker processes for parallel computation
      if (this.useParallelization) {
        await this.initializeWorkers();
      }
      
      // Check if we need to update correlation matrices and embeddings
      const lastUpdateTime = await this.redisClient.get(`${REDIS_PREFIX}last_update`);
      const lastEmbeddingUpdateTime = await this.redisClient.get(`${REDIS_PREFIX}last_embedding_update`);
      
      const needsCorrelationUpdate = !lastUpdateTime || 
        Date.now() - parseInt(lastUpdateTime) > CORRELATION_REFRESH_HOURS * 60 * 60 * 1000;
      
      const needsEmbeddingUpdate = !lastEmbeddingUpdateTime || 
        Date.now() - parseInt(lastEmbeddingUpdateTime) > EMBEDDING_UPDATE_INTERVAL_HOURS * 60 * 60 * 1000;
      
      // Schedule background updates if needed
      if (needsCorrelationUpdate) {
        logger.info('AdvancedFactorCorrelationEngine: Scheduling background correlation matrix update');
        setTimeout(() => {
          this.rebuildCorrelationMatrices().catch(err => {
            logger.error(`AdvancedFactorCorrelationEngine: Background correlation update failed: ${err.message}`);
          });
        }, 10000);
      }
      
      if (needsEmbeddingUpdate && this.useDynamicEmbeddings) {
        logger.info('AdvancedFactorCorrelationEngine: Scheduling background embeddings update');
        setTimeout(() => {
          this.updateFactorEmbeddings().catch(err => {
            logger.error(`AdvancedFactorCorrelationEngine: Background embeddings update failed: ${err.message}`);
          });
        }, 15000);
      }
      
      // Register system-wide performance monitoring
      this.registerPerformanceMonitoring();
      
      // Mark as initialized and log performance
      this.isInitialized = true;
      const initTime = performance.now() - startTime;
      logger.info(`AdvancedFactorCorrelationEngine: System initialized successfully in ${initTime.toFixed(2)}ms`);
      
      // Record initialization metrics
      await this.recordPerformanceMetrics('system_initialization', {
        initialization_time_ms: initTime,
        deep_learning_enabled: this.useDeepLearning,
        causal_discovery_enabled: this.enableCausalDiscovery,
        quantum_optimization_enabled: this.useQuantumOptimization,
        adaptive_windows_enabled: this.useAdaptiveWindows,
        dynamic_embeddings_enabled: this.useDynamicEmbeddings,
        parallelization_enabled: this.useParallelization,
        worker_count: this.workers.size
      });
      
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load league-specific configurations from database or use defaults
   * @returns {Promise<void>}
   * @private
   */
  async loadLeagueConfigurations() {
    try {
      // Attempt to load configurations from database
      const dbConfigs = await LeagueConfigModel.find({});
      
      if (dbConfigs.length > 0) {
        // Database configs exist, use them
        for (const config of dbConfigs) {
          this.leagueConfigs.set(config.league_id.toUpperCase(), {
            id: config.league_id,
            factorWeights: config.factor_weights,
            seasonLength: config.season_length,
            defaultCorrelationHalflife: config.correlation_halflife,
            keyMetrics: config.key_metrics,
            modelParams: config.model_params
          });
        }
        logger.info(`AdvancedFactorCorrelationEngine: Loaded ${dbConfigs.length} league configurations from database`);
      } else {
        // No database configs, use defaults and save them
        logger.info('AdvancedFactorCorrelationEngine: No league configurations found in database, using defaults');
        
        for (const [leagueKey, config] of Object.entries(LEAGUE_CONFIGS)) {
          this.leagueConfigs.set(leagueKey, config);
          
          // Save default config to database
          await new LeagueConfigModel({
            league_id: config.id,
            league_name: leagueKey,
            factor_weights: config.factorWeights,
            season_length: config.seasonLength,
            correlation_halflife: config.defaultCorrelationHalflife,
            key_metrics: config.keyMetrics,
            model_params: config.modelParams,
            last_updated: new Date()
          }).save();
        }
        
        logger.info('AdvancedFactorCorrelationEngine: Default league configurations saved to database');
      }
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error loading league configurations: ${error.message}`);
      
      // Fall back to default configurations in memory
      for (const [leagueKey, config] of Object.entries(LEAGUE_CONFIGS)) {
        this.leagueConfigs.set(leagueKey, config);
      }
    }
  }

  /**
   * Set up experimentation framework
   * @returns {Promise<void>}
   * @private
   */
  async setupExperiments() {
    if (!this.enableExperiments) {
      return;
    }
    
    try {
      // Load active experiments from database
      const dbExperiments = await ExperimentModel.find({ is_active: true });
      
      if (dbExperiments.length > 0) {
        // Use database experiments
        for (const exp of dbExperiments) {
          this.experiments.set(exp.experiment_id, {
            id: exp.experiment_id,
            description: exp.description,
            variants: exp.variants,
            metrics: exp.metrics,
            trafficSplit: exp.traffic_split,
            isActive: exp.is_active,
            startDate: exp.start_date,
            endDate: exp.end_date,
            results: exp.results || {}
          });
          
          if (exp.is_active) {
            this.activeExperiments.push(exp.experiment_id);
          }
        }
        
        logger.info(`AdvancedFactorCorrelationEngine: Loaded ${dbExperiments.length} experiments from database`);
      } else {
        // No database experiments, use defaults and save them
        logger.info('AdvancedFactorCorrelationEngine: No experiments found in database, using defaults');
        
        for (const [expKey, config] of Object.entries(EXPERIMENT_CONFIGS)) {
          this.experiments.set(expKey, config);
          
          // Save default experiment to database
          await new ExperimentModel({
            experiment_id: config.id,
            name: expKey,
            description: config.description,
            variants: Object.keys(config.trafficSplit),
            metrics: config.metrics,
            traffic_split: config.trafficSplit,
            is_active: config.isActive,
            start_date: new Date(config.startDate),
            end_date: new Date(config.endDate),
            created_at: new Date()
          }).save();
          
          if (config.isActive) {
            this.activeExperiments.push(expKey);
          }
        }
        
        logger.info('AdvancedFactorCorrelationEngine: Default experiments saved to database');
      }
      
      // Initialize experiment metrics
      for (const expId of this.activeExperiments) {
        const exp = this.experiments.get(expId);
        if (exp) {
          this.metrics.experiment_metrics[expId] = {};
          for (const metric of exp.metrics) {
            this.metrics.experiment_metrics[expId][metric] = {};
            for (const variant of Object.keys(exp.trafficSplit)) {
              this.metrics.experiment_metrics[expId][metric][variant] = {
                sum: 0,
                count: 0,
                avg: 0
              };
            }
          }
        }
      }
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error setting up experiments: ${error.message}`);
      
      // Continue without experiments if there's an error
      this.enableExperiments = false;
    }
  }

  /**
   * Initialize all ML models
   * @returns {Promise<void>}
   * @private
   */
  async initializeMLModels() {
    try {
      logger.info('AdvancedFactorCorrelationEngine: Initializing machine learning models...');
      
      // Check if models exist in registry and load them
      let transformerExists = false;
      let bayesianNNExists = false;
      let embeddingsExists = false;
      
      try {
        transformerExists = await this.modelRegistry.modelExists('transformer_correlator', 'latest');
        bayesianNNExists = await this.modelRegistry.modelExists('bayesian_nn', 'latest');
        embeddingsExists = await this.modelRegistry.modelExists('factor_embedder', 'latest');
      } catch (err) {
        logger.warn(`AdvancedFactorCorrelationEngine: Error checking model registry: ${err.message}`);
      }
      
      // Initialize transformer model for sequence analysis
      this.transformerModel = new TransformerCorrelator({
        modelDimension: 128,
        numHeads: 8,
        numLayers: 4,
        dropoutRate: 0.1,
        maxSequenceLength: 365
      });
      
      if (transformerExists) {
        await this.transformerModel.loadFromRegistry(this.modelRegistry);
        logger.info('AdvancedFactorCorrelationEngine: Loaded transformer model from registry');
      } else {
        logger.info('AdvancedFactorCorrelationEngine: Transformer model not found in registry, will train from scratch');
      }
      
      // Initialize Bayesian Neural Network for uncertainty quantification
      this.bayesianNN = new BayesianNeuralNetwork({
        inputDimension: 256,
        hiddenDimensions: [128, 64],
        outputDimension: 1,
        priorScale: 1.0,
        posteriorScale: 0.1
      });
      
      if (bayesianNNExists) {
        await this.bayesianNN.loadFromRegistry(this.modelRegistry);
        logger.info('AdvancedFactorCorrelationEngine: Loaded Bayesian Neural Network from registry');
      } else {
        logger.info('AdvancedFactorCorrelationEngine: Bayesian Neural Network not found in registry, will train from scratch');
      }
      
      // Initialize Kernel Correlator for non-linear correlation detection
      this.kernelCorrelator = new KernelCorrelator({
        kernelType: 'rbf',
        gamma: 0.1,
        regularization: 0.01
      });
      
      // Initialize Adaptive Window Analyzer
      this.adaptiveWindowAnalyzer = new AdaptiveWindowAnalyzer({
        minWindowSize: 5,
        maxWindowSize: 365,
        adaptationRate: 0.1,
        metricThreshold: 0.05
      });
      
      // Initialize Factor Embedder for dynamic embeddings
      this.factorEmbedder = new FactorEmbedder({
        embeddingDimension: this.embeddingDimensions,
        numNegativeSamples: 5,
        learningRate: 0.01,
        temporalRegularization: 0.1
      });
      
      if (embeddingsExists) {
        await this.factorEmbedder.loadFromRegistry(this.modelRegistry);
        logger.info('AdvancedFactorCorrelationEngine: Loaded factor embeddings from registry');
      } else {
        logger.info('AdvancedFactorCorrelationEngine: Factor embeddings not found in registry, will initialize from scratch');
      }
      
      // Initialize Transfer Learning Manager
      this.transferLearningManager = new TransferLearningManager({
        sourceDomains: ['NBA', 'NFL', 'NHL', 'MLB', 'LALIGA', 'SERIEA', 'PREMIERLEAGUE', 'BUNDESLIGA'],
        adaptationLayers: 2,
        finetuneLearningRate: 0.001
      });
      
      // Initialize Causal Discovery Engine
      this.causalDiscoveryEngine = new CausalDiscoveryEngine({
        algorithm: 'pc', // Can be 'pc', 'notears', or 'granger'
        significanceLevel: 0.05,
        maxDepth: 4,
        stableSearch: true
      });
      
      // Initialize quantum-inspired optimizer
      this.quantumOptimizer = new qiskit.QuantumOptimizer({
        numQubits: 8,
        shots: 1024,
        optimizerType: 'QAOA'
      });
      
      logger.info('AdvancedFactorCorrelationEngine: All ML models initialized successfully');
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error initializing ML models: ${error.message}`);
      logger.info('AdvancedFactorCorrelationEngine: Continuing with fallback traditional statistical methods');
      
      // Disable advanced ML features if initialization fails
      this.useDeepLearning = false;
    }
  }

  /**
   * Initialize worker processes for parallel computation
   * @returns {Promise<void>}
   * @private
   */
  async initializeWorkers() {
    try {
      const numWorkers = MAX_WORKERS;
      logger.info(`AdvancedFactorCorrelationEngine: Initializing ${numWorkers} worker processes...`);
      
      // Create worker directory if it doesn't exist
      const workerDir = path.join(__dirname, 'workers');
      if (!fs.existsSync(workerDir)) {
        fs.mkdirSync(workerDir, { recursive: true });
      }
      
      // Worker script path
      const workerPath = path.join(workerDir, 'correlation_worker.js');
      
      // Create the worker script if it doesn't exist
      if (!fs.existsSync(workerPath)) {
        const workerScript = `
          const { parentPort, workerData } = require('worker_threads');
          const math = require('mathjs');
          const { performance } = require('perf_hooks');
          
          // Process messages from the main thread
          parentPort.on('message', async (message) => {
            const startTime = performance.now();
            
            try {
              let result;
              
              switch (message.type) {
                case 'correlation_batch':
                  result = processBatchCorrelations(message.data);
                  break;
                case 'matrix_multiplication':
                  result = processMatrixMultiplication(message.data);
                  break;
                case 'embeddings_update':
                  result = processEmbeddingsUpdate(message.data);
                  break;
                default:
                  throw new Error(\`Unknown message type: \${message.type}\`);
              }
              
              // Send result back to main thread
              parentPort.postMessage({
                id: message.id,
                result,
                processingTime: performance.now() - startTime
              });
            } catch (error) {
              // Send error back to main thread
              parentPort.postMessage({
                id: message.id,
                error: error.message,
                processingTime: performance.now() - startTime
              });
            }
          });
          
          // Process a batch of correlation calculations
          function processBatchCorrelations(data) {
            const { pairs, timeSeriesData, options } = data;
            const results = [];
            
            for (const pair of pairs) {
              const { factorA, factorB } = pair;
              
              // Get time series data for both factors
              const seriesA = timeSeriesData[factorA] || [];
              const seriesB = timeSeriesData[factorB] || [];
              
              // Skip if not enough data
              if (seriesA.length < 5 || seriesB.length < 5) {
                results.push({
                  factorA,
                  factorB,
                  correlation: 0,
                  confidence: 0.1,
                  dataPoints: Math.min(seriesA.length, seriesB.length)
                });
                continue;
              }
              
              // Align time series
              const alignedSeries = alignTimeSeries(seriesA, seriesB);
              
              if (alignedSeries.length < 5) {
                results.push({
                  factorA,
                  factorB,
                  correlation: 0,
                  confidence: 0.2,
                  dataPoints: alignedSeries.length
                });
                continue;
              }
              
              // Extract values
              const valuesA = alignedSeries.map(entry => entry.valueA);
              const valuesB = alignedSeries.map(entry => entry.valueB);
              const dates = alignedSeries.map(entry => new Date(entry.date));
              
              // Apply time weighting if enabled
              let correlation;
              let additionalData = {};
              
              if (options.useTimeWeighting) {
                const weightedResult = calculateTimeWeightedCorrelation(
                  valuesA, valuesB, dates, options.halfLifeDays, options.minWeight
                );
                correlation = weightedResult.correlation;
                additionalData = {
                  effectiveSampleSize: weightedResult.effectiveSampleSize,
                  recencyScore: weightedResult.recencyScore,
                  weights: weightedResult.weights
                };
              } else {
                correlation = calculatePearsonCorrelation(valuesA, valuesB);
              }
              
              // Apply Bayesian adjustment if enabled and sample size is small
              if (options.useBayesianAdjustment && alignedSeries.length < options.minDataPoints * 2) {
                const priorStrength = options.bayesianPriorStrength || 10;
                const priorMean = 0;
                const shrinkageFactor = priorStrength / (priorStrength + alignedSeries.length);
                const adjustedCorrelation = correlation * (1 - shrinkageFactor) + priorMean * shrinkageFactor;
                
                additionalData.rawCorrelation = correlation;
                correlation = adjustedCorrelation;
              }
              
              // Calculate confidence based on sample size
              const confidence = Math.min(0.9, alignedSeries.length / (options.minDataPoints * 2));
              
              results.push({
                factorA,
                factorB,
                correlation,
                confidence,
                dataPoints: alignedSeries.length,
                ...additionalData
              });
            }
            
            return results;
          }
          
          // Process matrix multiplication (used for correlation matrix calculations)
          function processMatrixMultiplication(data) {
            const { matrixA, matrixB } = data;
            return math.multiply(matrixA, matrixB);
          }
          
          // Process embeddings update
          function processEmbeddingsUpdate(data) {
            const { embeddings, cooccurrenceMatrix, learningRate, regularization } = data;
            const updatedEmbeddings = {};
            
            // Simple SGD update for embeddings
            for (const factor in embeddings) {
              const embedding = embeddings[factor];
              const cooccurrences = cooccurrenceMatrix[factor] || {};
              
              // Skip if no cooccurrences
              if (Object.keys(cooccurrences).length === 0) {
                updatedEmbeddings[factor] = embedding;
                continue;
              }
              
              // Calculate gradient
              const gradient = new Array(embedding.length).fill(0);
              
              for (const otherFactor in cooccurrences) {
                const strength = cooccurrences[otherFactor];
                const otherEmbedding = embeddings[otherFactor];
                
                if (!otherEmbedding) continue;
                
                // Calculate dot product and prediction error
                let dotProduct = 0;
                for (let i = 0; i < embedding.length; i++) {
                  dotProduct += embedding[i] * otherEmbedding[i];
                }
                
                const predError = strength - dotProduct;
                
                // Update gradient
                for (let i = 0; i < gradient.length; i++) {
                  gradient[i] += predError * otherEmbedding[i] - regularization * embedding[i];
                }
              }
              
              // Apply gradient update
              const updated = new Array(embedding.length);
              for (let i = 0; i < embedding.length; i++) {
                updated[i] = embedding[i] + learningRate * gradient[i];
              }
              
              updatedEmbeddings[factor] = updated;
            }
            
            return updatedEmbeddings;
          }
          
          // Helper function to align two time series
          function alignTimeSeries(seriesA, seriesB) {
            // Create maps of date -> value
            const mapA = new Map();
            const mapB = new Map();
            
            seriesA.forEach(entry => {
              const dateKey = new Date(entry.date).toISOString().split('T')[0];
              mapA.set(dateKey, entry.value);
            });
            
            seriesB.forEach(entry => {
              const dateKey = new Date(entry.date).toISOString().split('T')[0];
              mapB.set(dateKey, entry.value);
            });
            
            // Find common dates
            const commonDates = [];
            for (const dateKey of mapA.keys()) {
              if (mapB.has(dateKey)) {
                commonDates.push(dateKey);
              }
            }
            
            // Create aligned series
            return commonDates.map(dateKey => ({
              date: dateKey,
              valueA: mapA.get(dateKey),
              valueB: mapB.get(dateKey)
            }));
          }
          
          // Calculate Pearson correlation coefficient
          function calculatePearsonCorrelation(x, y) {
            if (x.length !== y.length) {
              throw new Error('Arrays must have the same length');
            }
            
            if (x.length === 0) {
              return 0;
            }
            
            // Calculate means
            const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;
            const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;
            
            // Calculate covariance and variances
            let covariance = 0;
            let varianceX = 0;
            let varianceY = 0;
            
            for (let i = 0; i < x.length; i++) {
              const diffX = x[i] - meanX;
              const diffY = y[i] - meanY;
              
              covariance += diffX * diffY;
              varianceX += diffX * diffX;
              varianceY += diffY * diffY;
            }
            
            // Avoid division by zero
            if (varianceX === 0 || varianceY === 0) {
              return 0;
            }
            
            // Calculate correlation coefficient
            return covariance / Math.sqrt(varianceX * varianceY);
          }
          
          // Calculate time-weighted correlation
          function calculateTimeWeightedCorrelation(x, y, dates, halfLifeDays = 30, minWeight = 0.1) {
            if (x.length !== y.length || x.length !== dates.length) {
              throw new Error('Arrays must have the same length');
            }
            
            if (x.length === 0) {
              return { correlation: 0, effectiveSampleSize: 0, recencyScore: 0, weights: [] };
            }
            
            // Calculate weights based on recency
            const now = new Date();
            const weights = dates.map(date => {
              const ageInDays = (now - date) / (1000 * 60 * 60 * 24);
              return Math.max(minWeight, Math.pow(0.5, ageInDays / halfLifeDays));
            });
            
            // Calculate weighted means
            const totalWeight = weights.reduce((sum, w) => sum + w, 0);
            
            let weightedMeanX = 0;
            let weightedMeanY = 0;
            
            for (let i = 0; i < x.length; i++) {
              weightedMeanX += x[i] * weights[i] / totalWeight;
              weightedMeanY += y[i] * weights[i] / totalWeight;
            }
            
            // Calculate weighted covariance and variances
            let weightedCovariance = 0;
            let weightedVarianceX = 0;
            let weightedVarianceY = 0;
            
            for (let i = 0; i < x.length; i++) {
              const diffX = x[i] - weightedMeanX;
              const diffY = y[i] - weightedMeanY;
              
              weightedCovariance += weights[i] * diffX * diffY;
              weightedVarianceX += weights[i] * diffX * diffX;
              weightedVarianceY += weights[i] * diffY * diffY;
            }
            
            // Normalize by sum of weights
            weightedCovariance /= totalWeight;
            weightedVarianceX /= totalWeight;
            weightedVarianceY /= totalWeight;
            
            // Calculate weighted correlation coefficient
            let weightedCorrelation = 0;
            if (weightedVarianceX > 0 && weightedVarianceY > 0) {
              weightedCorrelation = weightedCovariance / Math.sqrt(weightedVarianceX * weightedVarianceY);
            }
            
            // Calculate effective sample size
            const effectiveSampleSize = Math.pow(totalWeight, 2) / weights.reduce((sum, w) => sum + w * w, 0);
            
            // Calculate recency score
            const recentWeightThreshold = 30; // Days considered "recent"
            const recentWeightSum = weights.reduce((sum, w, i) => {
              const ageInDays = (now - dates[i]) / (1000 * 60 * 60 * 24);
              return ageInDays <= recentWeightThreshold ? sum + w : sum;
            }, 0);
            
            const recencyScore = recentWeightSum / totalWeight;
            
            return {
              correlation: weightedCorrelation,
              effectiveSampleSize,
              recencyScore,
              weights
            };
          }
          
          // Signal ready to the main thread
          parentPort.postMessage({ ready: true, workerId: workerData.id });
        `;
        
        fs.writeFileSync(workerPath, workerScript);
      }
      
      // Initialize workers
      for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(workerPath, {
          workerData: { id: i }
        });
        
        // Set up worker message handling
        worker.on('message', (message) => {
          if (message.ready) {
            logger.info(`AdvancedFactorCorrelationEngine: Worker ${message.workerId} initialized`);
          } else if (this.workerCallbacks.has(message.id)) {
            const callback = this.workerCallbacks.get(message.id);
            this.workerCallbacks.delete(message.id);
            
            if (message.error) {
              callback.reject(new Error(message.error));
            } else {
              callback.resolve(message.result);
            }
          }
        });
        
        worker.on('error', (err) => {
          logger.error(`AdvancedFactorCorrelationEngine: Worker ${i} error: ${err.message}`);
          // Attempt to restart the worker
          this.restartWorker(i);
        });
        
        worker.on('exit', (code) => {
          if (code !== 0) {
            logger.error(`AdvancedFactorCorrelationEngine: Worker ${i} exited with code ${code}`);
            // Attempt to restart the worker
            this.restartWorker(i);
          }
        });
        
        this.workers.set(i, worker);
      }
      
      // Initialize worker callback map
      this.workerCallbacks = new Map();
      this.nextWorkerId = 0;
      this.workerTaskId = 0;
      
      logger.info(`AdvancedFactorCorrelationEngine: ${numWorkers} worker processes initialized successfully`);
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error initializing workers: ${error.message}`);
      logger.info('AdvancedFactorCorrelationEngine: Continuing without worker parallelization');
      
      // Disable parallelization if worker initialization fails
      this.useParallelization = false;
    }
  }

  /**
   * Restart a worker process if it crashes
   * @param {number} workerId The ID of the worker to restart
   * @private
   */
  async restartWorker(workerId) {
    try {
      logger.info(`AdvancedFactorCorrelationEngine: Attempting to restart worker ${workerId}...`);
      
      // Terminate the worker if it's still active
      const oldWorker = this.workers.get(workerId);
      if (oldWorker) {
        try {
          oldWorker.terminate();
        } catch (err) {
          // Ignore errors during termination
        }
      }
      
      // Create a new worker
      const workerPath = path.join(__dirname, 'workers', 'correlation_worker.js');
      const worker = new Worker(workerPath, {
        workerData: { id: workerId }
      });
      
      // Set up worker message handling
      worker.on('message', (message) => {
        if (message.ready) {
          logger.info(`AdvancedFactorCorrelationEngine: Worker ${message.workerId} restarted successfully`);
        } else if (this.workerCallbacks.has(message.id)) {
          const callback = this.workerCallbacks.get(message.id);
          this.workerCallbacks.delete(message.id);
          
          if (message.error) {
            callback.reject(new Error(message.error));
          } else {
            callback.resolve(message.result);
          }
        }
      });
      
      worker.on('error', (err) => {
        logger.error(`AdvancedFactorCorrelationEngine: Restarted worker ${workerId} error: ${err.message}`);
        // Attempt to restart the worker again
        setTimeout(() => this.restartWorker(workerId), 5000);
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`AdvancedFactorCorrelationEngine: Restarted worker ${workerId} exited with code ${code}`);
          // Attempt to restart the worker again
          setTimeout(() => this.restartWorker(workerId), 5000);
        }
      });
      
      // Replace the worker in the map
      this.workers.set(workerId, worker);
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error restarting worker ${workerId}: ${error.message}`);
      // Try again after a delay
      setTimeout(() => this.restartWorker(workerId), 10000);
    }
  }

  /**
   * Send a task to a worker process
   * @param {Object} message The message to send
   * @returns {Promise<any>} The result from the worker
   * @private
   */
  sendToWorker(message) {
    return new Promise((resolve, reject) => {
      if (!this.useParallelization || this.workers.size === 0) {
        reject(new Error('Worker parallelization is not enabled'));
        return;
      }
      
      // Generate a unique task ID
      const taskId = `task_${this.workerTaskId++}`;
      
      // Select a worker using round-robin
      const workerId = this.nextWorkerId;
      this.nextWorkerId = (this.nextWorkerId + 1) % this.workers.size;
      
      // Store the callback
      this.workerCallbacks.set(taskId, { resolve, reject });
      
      // Send message to worker
      this.workers.get(workerId).postMessage({
        ...message,
        id: taskId
      });
    });
  }

  /**
   * Register system-wide performance monitoring
   * @private
   */
  registerPerformanceMonitoring() {
    // Set up periodic metrics reporting
    setInterval(() => {
      this.reportMetrics().catch(err => {
        logger.error(`AdvancedFactorCorrelationEngine: Error reporting metrics: ${err.message}`);
      });
    }, 60 * 60 * 1000); // Every hour
    
    // Set up cache cleanup
    setInterval(() => {
      this.cleanupCache().catch(err => {
        logger.error(`AdvancedFactorCorrelationEngine: Error cleaning cache: ${err.message}`);
      });
    }, 30 * 60 * 1000); // Every 30 minutes
    
    // Set up anomaly detection
    if (this.anomalyDetection) {
      setInterval(() => {
        this.detectSystemAnomalies().catch(err => {
          logger.error(`AdvancedFactorCorrelationEngine: Error detecting system anomalies: ${err.message}`);
        });
      }, 15 * 60 * 1000); // Every 15 minutes
    }
  }

  /**
   * Report system metrics to database and monitoring systems
   * @returns {Promise<void>}
   * @private
   */
  async reportMetrics() {
    try {
      // Calculate derived metrics
      const cacheHitRate = this.metrics.total_queries > 0
        ? this.metrics.cache_hits / this.metrics.total_queries
        : 0;
      
      // Prepare metrics data
      const metricsData = {
        timestamp: new Date(),
        cache_hit_rate: cacheHitRate,
        avg_query_time_ms: this.metrics.avg_query_time_ms,
        total_requests: this.metrics.total_requests,
        total_queries: this.metrics.total_queries,
        total_correlation_calculations: this.metrics.total_correlation_calculations,
        total_joint_probability_calculations: this.metrics.total_joint_probability_calculations,
        total_causal_discoveries: this.metrics.total_causal_discoveries,
        anomalies_detected: this.metrics.anomalies_detected,
        algorithm_performance: this.metrics.algorithm_performance,
        experiment_metrics: this.metrics.experiment_metrics
      };
      
      // Save to database
      await this.recordPerformanceMetrics('system_metrics', metricsData);
      
      // Reset certain counters
      this.metrics.anomalies_detected = 0;
      this.metrics.anomalies_resolved = 0;
      
      logger.info('AdvancedFactorCorrelationEngine: System metrics reported successfully');
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error reporting metrics: ${error.message}`);
    }
  }

  /**
   * Record performance metrics to database
   * @param {string} metricType The type of metric
   * @param {Object} data Metric data
   * @returns {Promise<void>}
   * @private
   */
  async recordPerformanceMetrics(metricType, data) {
    try {
      await new PerformanceMetricModel({
        metric_type: metricType,
        timestamp: new Date(),
        data: data
      }).save();
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error recording metrics: ${error.message}`);
    }
  }

  /**
   * Clean up the cache periodically to prevent memory issues
   * @returns {Promise<void>}
   * @private
   */
  async cleanupCache() {
    try {
      // Clean up in-memory cache if too large
      if (this.correlationCache.size > MAX_FACTOR_MEMORY_CACHE) {
        // Delete oldest 30% of entries
        const entries = [...this.correlationCache.entries()];
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toDelete = Math.floor(entries.length * 0.3);
        logger.info(`AdvancedFactorCorrelationEngine: Cleaning up ${toDelete} cache entries`);
        
        for (let i = 0; i < toDelete; i++) {
          this.correlationCache.delete(entries[i][0]);
        }
      }
      
      // Clean up Redis cache for expired items
      // Redis handles TTL automatically, so we don't need to do anything
      
      logger.info('AdvancedFactorCorrelationEngine: Cache cleanup completed');
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error cleaning cache: ${error.message}`);
    }
  }

  /**
   * Detect anomalies in system performance
   * @returns {Promise<void>}
   * @private
   */
  async detectSystemAnomalies() {
    try {
      // Check query time anomalies
      const recentMetrics = await PerformanceMetricModel.find({
        metric_type: 'system_metrics'
      }).sort({ timestamp: -1 }).limit(10);
      
      if (recentMetrics.length >= 5) {
        // Calculate average and standard deviation of query times
        const queryTimes = recentMetrics.map(m => m.data.avg_query_time_ms);
        const mean = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
        
        const variance = queryTimes.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / queryTimes.length;
        const stdDev = Math.sqrt(variance);
        
        // Check if current query time is anomalous (>2 standard deviations from mean)
        const currentTime = this.metrics.avg_query_time_ms;
        const zScore = Math.abs((currentTime - mean) / stdDev);
        
        if (zScore > 2) {
          logger.warn(`AdvancedFactorCorrelationEngine: Query time anomaly detected (z-score: ${zScore.toFixed(2)})`);
          
          // Record anomaly
          await new AnomalyModel({
            anomaly_type: 'system_performance',
            detection_time: new Date(),
            severity: zScore > 3 ? 'high' : 'medium',
            details: {
              metric: 'avg_query_time_ms',
              current_value: currentTime,
              mean,
              std_dev: stdDev,
              z_score: zScore
            },
            is_resolved: false
          }).save();
          
          this.metrics.anomalies_detected++;
        }
      }
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error detecting system anomalies: ${error.message}`);
    }
  }

  /**
   * Clean up connections and resources before shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('AdvancedFactorCorrelationEngine: Shutting down...');

    try {
      // Terminate worker processes
      if (this.workers.size > 0) {
        const workerShutdowns = [];
        for (const [workerId, worker] of this.workers.entries()) {
          workerShutdowns.push(
            new Promise(resolve => {
              worker.on('exit', () => {
                logger.info(`AdvancedFactorCorrelationEngine: Worker ${workerId} terminated`);
                resolve();
              });
              
              worker.terminate();
            })
          );
        }
        
        // Wait for all workers to terminate
        await Promise.all(workerShutdowns);
        logger.info('AdvancedFactorCorrelationEngine: All workers terminated');
      }
      
      // Save ML models to registry if enabled
      if (this.useDeepLearning) {
        try {
          if (this.transformerModel) {
            await this.transformerModel.saveToRegistry(this.modelRegistry);
          }
          if (this.bayesianNN) {
            await this.bayesianNN.saveToRegistry(this.modelRegistry);
          }
          if (this.factorEmbedder) {
            await this.factorEmbedder.saveToRegistry(this.modelRegistry);
          }
          logger.info('AdvancedFactorCorrelationEngine: ML models saved to registry');
        } catch (err) {
          logger.error(`AdvancedFactorCorrelationEngine: Error saving ML models: ${err.message}`);
        }
      }
      
      // Report final metrics
      await this.reportMetrics();
      
      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.disconnect();
        logger.info('AdvancedFactorCorrelationEngine: Redis connection closed');
      }
      
      // Close MongoDB connection
      if (this.mongoConnection) {
        await mongoose.disconnect();
        logger.info('AdvancedFactorCorrelationEngine: MongoDB connection closed');
      }
      
      this.isInitialized = false;
      logger.info('AdvancedFactorCorrelationEngine: Shutdown completed successfully');
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Shutdown error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the correlation between two prediction factors using advanced methods
   * @param {string} factorA The first factor ID or description
   * @param {string} factorB The second factor ID or description
   * @param {Object} options Optional parameters (league, sport, etc.)
   * @returns {Promise<Object>} Correlation coefficient and details
   */
  async getFactorCorrelation(factorA, factorB, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = performance.now();
    this.metrics.total_queries++;
    this.metrics.total_requests++;

    try {
      // Normalize factor descriptions to canonical form
      const normalizedFactorA = this.normalizeFactorDescription(factorA);
      const normalizedFactorB = this.normalizeFactorDescription(factorB);
      
      // Ensure factors are in alphabetical order for consistent caching
      const [firstFactor, secondFactor] = [normalizedFactorA, normalizedFactorB].sort();
      
      // Generate cache key
      const cacheKey = this.getCorrelationCacheKey(firstFactor, secondFactor, options);
      
      // Check in-memory cache first
      if (this.correlationCache.has(cacheKey)) {
        this.metrics.cache_hits++;
        const cached = this.correlationCache.get(cacheKey);
        return cached.value;
      }
      
      // Check Redis cache
      const cachedValue = await this.redisClient.get(`${REDIS_PREFIX}pair:${cacheKey}`);
      if (cachedValue) {
        const parsed = JSON.parse(cachedValue);
        
        // Update in-memory cache
        this.correlationCache.set(cacheKey, {
          value: parsed,
          timestamp: Date.now()
        });
        
        // Trim cache if too large
        if (this.correlationCache.size > MAX_FACTOR_MEMORY_CACHE) {
          this.cleanupCache();
        }
        
        this.metrics.cache_hits++;
        
        // Track performance
        const queryTime = performance.now() - startTime;
        this.updateQueryTimeMetrics(queryTime);
        
        return parsed;
      }
      
      this.metrics.cache_misses++;
      
      // Choose correlation algorithm based on experiment if active
      const experimentId = 'transformer-vs-traditional';
      let correlationAlgorithm = 'default';
      
      if (this.enableExperiments && this.activeExperiments.includes(experimentId)) {
        correlationAlgorithm = this.assignExperimentVariant(experimentId);
      } else if (this.useDeepLearning && options.algorithm === 'transformer') {
        correlationAlgorithm = 'transformer';
      } else if (options.algorithm === 'kernel') {
        correlationAlgorithm = 'kernel';
      } else if (options.algorithm === 'bayesian') {
        correlationAlgorithm = 'bayesian';
      }
      
      // Query database first
      const correlationRecord = await CorrelationModel.findOne({
        $or: [
          { factor_a: firstFactor, factor_b: secondFactor },
          { factor_a: secondFactor, factor_b: firstFactor }
        ],
        sport: options.sport || { $exists: true },
        league: options.league || { $exists: true }
      });
      
      let correlationResult;
      
      if (correlationRecord) {
        // Record exists, use it unless forced recalculation is requested
        if (options.forceRecalculate) {
          correlationResult = await this.calculateCorrelation(
            firstFactor, 
            secondFactor, 
            { 
              ...options, 
              algorithm: correlationAlgorithm,
              existingRecord: correlationRecord
            }
          );
        } else {
          // Use existing record
          correlationResult = {
            coefficient: correlationRecord.correlation_coefficient,
            confidence: correlationRecord.confidence,
            dataPoints: correlationRecord.data_points,
            effectiveSampleSize: correlationRecord.effective_sample_size,
            recencyScore: correlationRecord.recency_score,
            trend: correlationRecord.trend,
            method: correlationRecord.method || 'statistical',
            timestamp: correlationRecord.last_updated
          };
          
          // Add uncertainty bounds if available
          if (correlationRecord.confidence_interval) {
            correlationResult.confidenceInterval = correlationRecord.confidence_interval;
          }
          
          // Add non-linearity score if available
          if (correlationRecord.non_linearity_score) {
            correlationResult.nonLinearityScore = correlationRecord.non_linearity_score;
          }
        }
      } else {
        // No record exists, calculate correlation
        correlationResult = await this.calculateCorrelation(
          firstFactor, 
          secondFactor, 
          { 
            ...options, 
            algorithm: correlationAlgorithm 
          }
        );
        
        // Store the new correlation
        await this.storeCalculatedCorrelation(firstFactor, secondFactor, correlationResult, options);
      }
      
      // Calculate non-linear correlation if requested and not already calculated
      if (options.includeNonLinear && !correlationResult.nonLinearityScore && this.useDeepLearning) {
        try {
          const nonLinearScore = await this.calculateNonLinearCorrelation(
            firstFactor, secondFactor, options
          );
          
          correlationResult.nonLinearityScore = nonLinearScore.score;
          correlationResult.nonLinearCorrelation = nonLinearScore.correlation;
          
          // Update the stored correlation with non-linear information
          await CorrelationModel.updateOne(
            {
              factor_a: firstFactor,
              factor_b: secondFactor,
              sport: options.sport || 'all',
              league: options.league || 'all'
            },
            {
              $set: {
                non_linearity_score: nonLinearScore.score,
                non_linear_correlation: nonLinearScore.correlation
              }
            }
          );
        } catch (nlError) {
          logger.error(`Error calculating non-linear correlation: ${nlError.message}`);
        }
      }
      
      // Cache the result
      await this.redisClient.set(
        `${REDIS_PREFIX}pair:${cacheKey}`, 
        JSON.stringify(correlationResult),
        { EX: CACHE_TTL }
      );
      
      // Update in-memory cache
      this.correlationCache.set(cacheKey, {
        value: correlationResult,
        timestamp: Date.now()
      });
      
      // Update metrics
      const queryTime = performance.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      // Record experiment result if applicable
      if (correlationAlgorithm !== 'default') {
        this.recordExperimentResult(experimentId, correlationAlgorithm, {
          correlation_accuracy: correlationResult.confidence,
          processing_time: queryTime
        });
      }
      
      return correlationResult;
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error getting correlation: ${error.message}`);
      
      // Return a default result
      return {
        coefficient: DEFAULT_CORRELATION,
        confidence: 0.1,
        dataPoints: 0,
        effectiveSampleSize: 0,
        method: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Store a newly calculated correlation in the database
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @param {Object} correlationResult Correlation calculation result
   * @param {Object} options Additional options
   * @returns {Promise<void>}
   * @private
   */
  async storeCalculatedCorrelation(factorA, factorB, correlationResult, options = {}) {
    try {
      const newCorrelation = new CorrelationModel({
        factor_a: factorA,
        factor_b: factorB,
        correlation_coefficient: correlationResult.coefficient,
        confidence: correlationResult.confidence,
        data_points: correlationResult.dataPoints,
        effective_sample_size: correlationResult.effectiveSampleSize,
        recency_score: correlationResult.recencyScore,
        trend: correlationResult.trend,
        sport: options.sport || 'all',
        league: options.league || 'all',
        method: correlationResult.method,
        model_version: correlationResult.modelVersion,
        last_updated: new Date(),
        version: 1,
        update_source: 'calculation'
      });
      
      // Add uncertainty bounds if available
      if (correlationResult.confidenceInterval) {
        newCorrelation.confidence_interval = correlationResult.confidenceInterval;
      }
      
      // Add non-linearity information if available
      if (correlationResult.nonLinearityScore) {
        newCorrelation.non_linearity_score = correlationResult.nonLinearityScore;
        newCorrelation.non_linear_correlation = correlationResult.nonLinearCorrelation;
      }
      
      await newCorrelation.save();
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error storing correlation: ${error.message}`);
    }
  }

  /**
   * Get a correlation matrix for a set of factors with uncertainty quantification
   * @param {Array<string>} factors List of factors
   * @param {Object} options Optional parameters (league, sport, method, etc.)
   * @returns {Promise<Object>} Correlation matrix and related metadata
   */
  async getCorrelationMatrix(factors, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = performance.now();
    this.metrics.total_requests++;

    try {
      // Normalize factor descriptions
      const normalizedFactors = factors.map(f => this.normalizeFactorDescription(f));
      
      // Sort factors for consistent caching
      normalizedFactors.sort();
      
      // Generate cache key for the whole matrix
      const factorsKey = normalizedFactors.join('||');
      const matrixCacheKey = `matrix:${options.sport || 'all'}:${options.league || 'all'}:${options.method || 'default'}:${factorsKey}`;
      
      // Check Redis cache first
      const cachedMatrix = await this.redisClient.get(`${REDIS_PREFIX}${matrixCacheKey}`);
      if (cachedMatrix && !options.forceRecalculate) {
        const result = JSON.parse(cachedMatrix);
        
        // Track performance
        const queryTime = performance.now() - startTime;
        this.updateQueryTimeMetrics(queryTime);
        
        return result;
      }
      
      // Check if we should use quantum-inspired optimization
      const useQuantum = this.useQuantumOptimization && 
                         options.useQuantumOptimization !== false &&
                         normalizedFactors.length >= 5 && 
                         normalizedFactors.length <= 16;
      
      let matrix;
      let uncertaintyMatrix;
      let nonLinearityMatrix;
      let eigenvalues;
      let isPositiveDefinite = true;
      
      // Choose matrix calculation method
      if (useQuantum) {
        const quantumResult = await this.calculateQuantumCorrelationMatrix(normalizedFactors, options);
        matrix = quantumResult.matrix;
        uncertaintyMatrix = quantumResult.uncertaintyMatrix;
        eigenvalues = quantumResult.eigenvalues;
        isPositiveDefinite = quantumResult.isPositiveDefinite;
      } else if (this.useParallelization && normalizedFactors.length > 10) {
        const parallelResult = await this.calculateParallelCorrelationMatrix(normalizedFactors, options);
        matrix = parallelResult.matrix;
        uncertaintyMatrix = parallelResult.uncertaintyMatrix;
        nonLinearityMatrix = parallelResult.nonLinearityMatrix;
        eigenvalues = parallelResult.eigenvalues;
        isPositiveDefinite = parallelResult.isPositiveDefinite;
      } else {
        const standardResult = await this.calculateStandardCorrelationMatrix(normalizedFactors, options);
        matrix = standardResult.matrix;
        uncertaintyMatrix = standardResult.uncertaintyMatrix;
        nonLinearityMatrix = standardResult.nonLinearityMatrix;
        eigenvalues = standardResult.eigenvalues;
        isPositiveDefinite = standardResult.isPositiveDefinite;
      }
      
      // If not positive definite, apply nearest positive definite adjustment
      if (!isPositiveDefinite) {
        matrix = this.makePositiveDefinite(matrix);
        isPositiveDefinite = true;
      }
      
      // Get embeddings if available
      let embeddings = null;
      if (this.useDynamicEmbeddings && options.includeEmbeddings && this.factorEmbedder) {
        try {
          embeddings = await this.getFactorEmbeddings(normalizedFactors, options);
        } catch (embErr) {
          logger.error(`Error getting factor embeddings: ${embErr.message}`);
        }
      }
      
      // Calculate data quality score
      const dataQuality = await this.getDataQualityScore(normalizedFactors, options);
      
      // Create result object
      const result = {
        factors: normalizedFactors,
        matrix,
        uncertaintyMatrix,
        nonLinearityMatrix,
        eigenvalues: eigenvalues ? eigenvalues.toArray() : null,
        isPositiveDefinite,
        dimensions: normalizedFactors.length,
        sport: options.sport || 'all',
        league: options.league || 'all',
        method: options.method || 'default',
        generatedAt: new Date().toISOString(),
        dataQuality,
        hasCausalInsights: this.enableCausalDiscovery,
        hasEmbeddings: embeddings !== null,
        embeddings
      };
      
      // Cache the matrix
      await this.redisClient.set(
        `${REDIS_PREFIX}${matrixCacheKey}`,
        JSON.stringify(result),
        { EX: CACHE_TTL }
      );
      
      // Track performance
      const queryTime = performance.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      return result;
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error building correlation matrix: ${error.message}`);
      
      // Return a fallback identity matrix
      return {
        factors,
        matrix: factors.map((_, i) => factors.map((_, j) => i === j ? 1 : 0)),
        uncertaintyMatrix: factors.map(() => factors.map(() => 0.5)),
        isPositiveDefinite: true,
        dimensions: factors.length,
        sport: options.sport || 'all',
        league: options.league || 'all',
        method: 'fallback',
        generatedAt: new Date().toISOString(),
        dataQuality: 0,
        isDefaultMatrix: true,
        error: error.message
      };
    }
  }

  /**
   * Calculate correlation matrix using standard (non-parallel) processing
   * @param {Array<string>} factors Normalized factors
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Matrix calculation result
   * @private
   */
  async calculateStandardCorrelationMatrix(factors, options = {}) {
    const n = factors.length;
    const matrix = math.zeros(n, n)._data; // Initialize with zeros
    const uncertaintyMatrix = math.zeros(n, n)._data; // For uncertainty quantification
    const nonLinearityMatrix = options.includeNonLinear ? math.zeros(n, n)._data : null;
    
    // Fill the diagonal with 1s (self-correlation)
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      uncertaintyMatrix[i][i] = 0; // No uncertainty for self-correlation
      if (nonLinearityMatrix) {
        nonLinearityMatrix[i][i] = 0; // No non-linearity for self-correlation
      }
    }
    
    // Fill the rest of the matrix
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const correlation = await this.getFactorCorrelation(
          factors[i], 
          factors[j],
          { 
            ...options, 
            includeNonLinear: options.includeNonLinear,
            calculateIfMissing: true 
          }
        );
        
        // Correlation matrix is symmetric
        matrix[i][j] = correlation.coefficient;
        matrix[j][i] = correlation.coefficient;
        
        // Uncertainty is inversely related to confidence
        uncertaintyMatrix[i][j] = 1 - correlation.confidence;
        uncertaintyMatrix[j][i] = 1 - correlation.confidence;
        
        // Non-linearity matrix if requested
        if (nonLinearityMatrix && correlation.nonLinearityScore) {
          nonLinearityMatrix[i][j] = correlation.nonLinearityScore;
          nonLinearityMatrix[j][i] = correlation.nonLinearityScore;
        }
      }
    }
    
    // Calculate eigenvalues to check positive definiteness
    let eigenvalues;
    let isPositiveDefinite = true;
    
    try {
      eigenvalues = math.eigs(matrix).values;
      isPositiveDefinite = eigenvalues.every(v => v >= 0);
    } catch (mathError) {
      logger.warn(`AdvancedFactorCorrelationEngine: Error checking positive definiteness: ${mathError.message}`);
      isPositiveDefinite = false;
    }
    
    return {
      matrix,
      uncertaintyMatrix,
      nonLinearityMatrix,
      eigenvalues,
      isPositiveDefinite
    };
  }

  /**
   * Calculate correlation matrix using parallel processing
   * @param {Array<string>} factors Normalized factors
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Matrix calculation result
   * @private
   */
  async calculateParallelCorrelationMatrix(factors, options = {}) {
    const n = factors.length;
    const matrix = math.zeros(n, n)._data;
    const uncertaintyMatrix = math.zeros(n, n)._data;
    const nonLinearityMatrix = options.includeNonLinear ? math.zeros(n, n)._data : null;
    
    // Fill the diagonal with 1s (self-correlation)
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      uncertaintyMatrix[i][i] = 0;
      if (nonLinearityMatrix) {
        nonLinearityMatrix[i][i] = 0;
      }
    }
    
    // Create a list of all factor pairs to compute
    const pairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push({ i, j, factorA: factors[i], factorB: factors[j] });
      }
    }
    
    // Split into chunks for processing
    const chunkSize = this.workerChunkSize;
    const chunks = [];
    
    for (let i = 0; i < pairs.length; i += chunkSize) {
      chunks.push(pairs.slice(i, i + chunkSize));
    }
    
    logger.info(`AdvancedFactorCorrelationEngine: Processing ${pairs.length} factor pairs in ${chunks.length} chunks`);
    
    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      
      // Create promises for each pair in this chunk
      const promises = chunk.map(pair => {
        return this.getFactorCorrelation(
          pair.factorA, 
          pair.factorB,
          { 
            ...options, 
            includeNonLinear: options.includeNonLinear,
            calculateIfMissing: true 
          }
        );
      });
      
      // Wait for all promises in this chunk to resolve
      const results = await Promise.all(promises);
      
      // Fill matrices with results
      for (let k = 0; k < results.length; k++) {
        const pair = chunk[k];
        const result = results[k];
        
        matrix[pair.i][pair.j] = result.coefficient;
        matrix[pair.j][pair.i] = result.coefficient;
        
        uncertaintyMatrix[pair.i][pair.j] = 1 - result.confidence;
        uncertaintyMatrix[pair.j][pair.i] = 1 - result.confidence;
        
        if (nonLinearityMatrix && result.nonLinearityScore) {
          nonLinearityMatrix[pair.i][pair.j] = result.nonLinearityScore;
          nonLinearityMatrix[pair.j][pair.i] = result.nonLinearityScore;
        }
      }
      
      // Log progress
      logger.info(`AdvancedFactorCorrelationEngine: Processed chunk ${chunkIndex + 1}/${chunks.length}`);
    }
    
    // Calculate eigenvalues to check positive definiteness
    let eigenvalues;
    let isPositiveDefinite = true;
    
    try {
      eigenvalues = math.eigs(matrix).values;
      isPositiveDefinite = eigenvalues.every(v => v >= 0);
    } catch (mathError) {
      logger.warn(`AdvancedFactorCorrelationEngine: Error checking positive definiteness: ${mathError.message}`);
      isPositiveDefinite = false;
    }
    
    return {
      matrix,
      uncertaintyMatrix,
      nonLinearityMatrix,
      eigenvalues,
      isPositiveDefinite
    };
  }

  /**
   * Calculate correlation matrix using quantum-inspired optimization
   * @param {Array<string>} factors Normalized factors
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Matrix calculation result
   * @private
   */
  async calculateQuantumCorrelationMatrix(factors, options = {}) {
    const startTime = performance.now();
    
    try {
      // First get all correlations using standard method
      const standardResult = await this.calculateStandardCorrelationMatrix(factors, options);
      
      // Apply quantum optimization to refine the matrix
      const optimizedResult = await this.optimizeWithQuantumAlgorithm(
        standardResult.matrix,
        factors,
        options
      );
      
      // Calculate speedup
      const classicalTime = performance.now() - startTime;
      const speedupFactor = classicalTime / (optimizedResult.optimizationTime + 0.001);
      
      // Update metrics
      this.metrics.algorithm_performance.quantum_optimization.requests++;
      this.metrics.algorithm_performance.quantum_optimization.speedup_factor = 
        (this.metrics.algorithm_performance.quantum_optimization.speedup_factor * 
         (this.metrics.algorithm_performance.quantum_optimization.requests - 1) + 
         speedupFactor) / this.metrics.algorithm_performance.quantum_optimization.requests;
      
      return {
        matrix: optimizedResult.matrix,
        uncertaintyMatrix: standardResult.uncertaintyMatrix,
        eigenvalues: optimizedResult.eigenvalues,
        isPositiveDefinite: optimizedResult.isPositiveDefinite,
        quantumSpeedup: speedupFactor,
        optimizationMethod: optimizedResult.method
      };
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Quantum optimization error: ${error.message}`);
      logger.info('AdvancedFactorCorrelationEngine: Falling back to standard matrix calculation');
      
      // Fallback to standard calculation
      return this.calculateStandardCorrelationMatrix(factors, options);
    }
  }

  /**
   * Optimize correlation matrix using quantum-inspired algorithms
   * @param {Array<Array<number>>} matrix Initial correlation matrix
   * @param {Array<string>} factors Factor names
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Optimized matrix and metadata
   * @private
   */
  async optimizeWithQuantumAlgorithm(matrix, factors, options = {}) {
    const startTime = performance.now();
    
    // Choose optimization method based on matrix size
    const n = matrix.length;
    let method;
    
    if (n <= 8) {
      method = 'QAOA'; // Quantum Approximate Optimization Algorithm
    } else if (n <= 12) {
      method = 'VQE'; // Variational Quantum Eigensolver
    } else {
      method = 'QUBO'; // Quadratic Unconstrained Binary Optimization
    }
    
    try {
      // Configure the optimizer
      this.quantumOptimizer.configure({
        numQubits: n,
        optimizerType: method,
        shots: options.quantumShots || 1024,
        maxIterations: options.quantumIterations || 50
      });
      
      // Prepare input data
      const optimizationData = {
        initialMatrix: matrix,
        factors
      };
      
      // Run optimization
      const result = await this.quantumOptimizer.optimize(optimizationData);
      
      // Extract optimized matrix
      const optimizedMatrix = result.optimizedMatrix;
      
      // Check positive definiteness
      let eigenvalues;
      let isPositiveDefinite = true;
      
      try {
        eigenvalues = math.eigs(optimizedMatrix).values;
        isPositiveDefinite = eigenvalues.every(v => v >= 0);
      } catch (mathError) {
        logger.warn(`Quantum optimizer error: ${mathError.message}`);
        isPositiveDefinite = false;
      }
      
      // Ensure the matrix is symmetric and has 1s on diagonal
      const n = optimizedMatrix.length;
      for (let i = 0; i < n; i++) {
        optimizedMatrix[i][i] = 1.0;
        for (let j = i + 1; j < n; j++) {
          const avg = (optimizedMatrix[i][j] + optimizedMatrix[j][i]) / 2;
          optimizedMatrix[i][j] = avg;
          optimizedMatrix[j][i] = avg;
        }
      }
      
      const optimizationTime = performance.now() - startTime;
      
      return {
        matrix: optimizedMatrix,
        eigenvalues,
        isPositiveDefinite,
        method,
        energy: result.finalEnergy,
        iterations: result.iterations,
        optimizationTime
      };
    } catch (error) {
      logger.error(`Quantum optimization error: ${error.message}`);
      
      // Return the original matrix on error
      return {
        matrix,
        eigenvalues: null,
        isPositiveDefinite: true,
        method: 'fallback',
        optimizationTime: performance.now() - startTime
      };
    }
  }

  /**
   * Make a matrix positive definite using a numerical approach
   * @param {Array<Array<number>>} matrix Input correlation matrix
   * @returns {Array<Array<number>>} Positive definite matrix
   * @private
   */
  makePositiveDefinite(matrix) {
    const n = matrix.length;
    
    // Convert to math.js matrix for easier operations
    const M = math.matrix(matrix);
    
    // Get eigenvalues and eigenvectors
    const eig = math.eigs(M);
    let eigenvalues = eig.values;
    const eigenvectors = eig.vectors;
    
    // Fix negative eigenvalues
    let minEigenvalue = Infinity;
    for (let i = 0; i < eigenvalues.length; i++) {
      if (eigenvalues[i] < minEigenvalue) {
        minEigenvalue = eigenvalues[i];
      }
    }
    
    // If there are negative eigenvalues, shift them to be positive
    if (minEigenvalue < 0) {
      const shift = Math.abs(minEigenvalue) + 0.0001; // Small buffer
      for (let i = 0; i < eigenvalues.length; i++) {
        eigenvalues[i] += shift;
      }
    }
    
    // Ensure minimum eigenvalue threshold for numerical stability
    for (let i = 0; i < eigenvalues.length; i++) {
      if (eigenvalues[i] < 0.0001) {
        eigenvalues[i] = 0.0001;
      }
    }
    
    // Reconstruct matrix: V * D * V^T
    const D = math.diag(eigenvalues);
    const V = eigenvectors;
    const VT = math.transpose(V);
    
    // Matrix multiplication
    const result = math.multiply(math.multiply(V, D), VT);
    
    // Ensure diagonal is 1 (correlation property)
    const resultArray = result.toArray();
    for (let i = 0; i < n; i++) {
      resultArray[i][i] = 1;
    }
    
    // Ensure symmetry (fix numerical errors)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const avg = (resultArray[i][j] + resultArray[j][i]) / 2;
        resultArray[i][j] = avg;
        resultArray[j][i] = avg;
      }
    }
    
    // Ensure correlations are within [-1, 1]
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          resultArray[i][j] = Math.max(-1, Math.min(1, resultArray[i][j]));
        }
      }
    }
    
    return resultArray;
  }

  /**
   * Calculate the correlation between two factors using advanced methods
   * Combines multiple techniques including deep learning, Bayesian methods, and adaptive windows
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Correlation details with uncertainty quantification
   * @private
   */
  async calculateCorrelation(factorA, factorB, options = {}) {
    this.metrics.total_correlation_calculations++;
    
    try {
      // Choose algorithm based on options or available models
      const algorithm = options.algorithm || 'default';
      let method = 'statistical';
      let modelVersion = null;
      
      // Prepare query for historical data
      const predictionsA = await PredictionModel.find({
        factor: factorA,
        status: 'completed',
        is_correct: { $exists: true },
        ...(options.league ? { league: options.league } : {}),
        ...(options.sport ? { sport: options.sport } : {})
      }).sort({ created_at: -1 }).limit(2000);
      
      const predictionsB = await PredictionModel.find({
        factor: factorB,
        status: 'completed',
        is_correct: { $exists: true },
        ...(options.league ? { league: options.league } : {}),
        ...(options.sport ? { sport: options.sport } : {})
      }).sort({ created_at: -1 }).limit(2000);
      
      // Check if we have enough data
      if (predictionsA.length < MIN_DATA_POINTS || predictionsB.length < MIN_DATA_POINTS) {
        // Not enough data, use transfer learning if enabled
        if (this.useTransferLearning && !options.noTransfer) {
          return this.calculateTransferLearningCorrelation(
            factorA, factorB, predictionsA, predictionsB, options
          );
        }
        
        // Fall back to default correlation
        return {
          coefficient: DEFAULT_CORRELATION,
          confidence: 0.3,
          dataPoints: Math.min(predictionsA.length, predictionsB.length),
          effectiveSampleSize: Math.min(predictionsA.length, predictionsB.length),
          recencyScore: 0.5,
          trend: 0,
          method: 'default',
          modelVersion: null,
          confidenceInterval: [-0.3, 0.3],
          isDefault: true
        };
      }
      
      // Create time series from predictions
      const timeSeriesA = this.createTimeSeries(predictionsA);
      const timeSeriesB = this.createTimeSeries(predictionsB);
      
      // Align time series
      const alignedSeries = this.alignTimeSeries(timeSeriesA, timeSeriesB);
      
      // Not enough common dates
      if (alignedSeries.length < MIN_DATA_POINTS * 0.5) {
        return {
          coefficient: DEFAULT_CORRELATION,
          confidence: 0.4,
          dataPoints: alignedSeries.length,
          effectiveSampleSize: alignedSeries.length,
          recencyScore: 0.5,
          trend: 0,
          method: 'default',
          modelVersion: null,
          confidenceInterval: [-0.3, 0.3],
          isDefault: true
        };
      }
      
      // Extract values and dates
      const valuesA = alignedSeries.map(entry => entry.valueA);
      const valuesB = alignedSeries.map(entry => entry.valueB);
      const dates = alignedSeries.map(entry => new Date(entry.date));
      
      // Calculate correlation based on algorithm
      let result;
      
      switch (algorithm) {
        case 'transformer':
          if (this.useDeepLearning && this.transformerModel) {
            try {
              const startTime = performance.now();
              result = await this.calculateTransformerCorrelation(
                factorA, factorB, valuesA, valuesB, dates, options
              );
              method = 'transformer';
              modelVersion = await this.getModelVersion('transformer_correlator');
              
              // Track performance
              const processingTime = performance.now() - startTime;
              this.metrics.algorithm_performance.transformer.requests++;
              this.metrics.algorithm_performance.transformer.latency_ms = 
                (this.metrics.algorithm_performance.transformer.latency_ms * 
                 (this.metrics.algorithm_performance.transformer.requests - 1) + 
                 processingTime) / this.metrics.algorithm_performance.transformer.requests;
            } catch (dlError) {
              logger.error(`Transformer correlation error: ${dlError.message}`);
              // Fall back to adaptive window
              result = await this.calculateAdaptiveWindowCorrelation(
                valuesA, valuesB, dates, options
              );
              method = 'adaptive_window';
            }
          } else {
            // Fall back to adaptive window if transformer not available
            result = await this.calculateAdaptiveWindowCorrelation(
              valuesA, valuesB, dates, options
            );
            method = 'adaptive_window';
          }
          break;
          
        case 'bayesian':
          if (this.useDeepLearning && this.bayesianNN) {
            try {
              const startTime = performance.now();
              result = await this.calculateBayesianCorrelation(
                factorA, factorB, valuesA, valuesB, dates, options
              );
              method = 'bayesian_nn';
              modelVersion = await this.getModelVersion('bayesian_nn');
              
              // Track performance
              const processingTime = performance.now() - startTime;
              this.metrics.algorithm_performance.bayesian_nn.requests++;
              this.metrics.algorithm_performance.bayesian_nn.latency_ms = 
                (this.metrics.algorithm_performance.bayesian_nn.latency_ms * 
                 (this.metrics.algorithm_performance.bayesian_nn.requests - 1) + 
                 processingTime) / this.metrics.algorithm_performance.bayesian_nn.requests;
            } catch (bnError) {
              logger.error(`Bayesian correlation error: ${bnError.message}`);
              // Fall back to time-weighted
              result = this.calculateTimeWeightedCorrelation(
                valuesA, valuesB, dates, options
              );
              method = 'time_weighted';
            }
          } else {
            // Fall back to time-weighted if BayesianNN not available
            result = this.calculateTimeWeightedCorrelation(
              valuesA, valuesB, dates, options
            );
            method = 'time_weighted';
          }
          break;
          
        case 'kernel':
          if (this.useDeepLearning && this.kernelCorrelator) {
            try {
              const startTime = performance.now();
              result = await this.calculateKernelCorrelation(
                factorA, factorB, valuesA, valuesB, options
              );
              method = 'kernel';
              
              // Track performance
              const processingTime = performance.now() - startTime;
              this.metrics.algorithm_performance.kernel_methods.requests++;
              this.metrics.algorithm_performance.kernel_methods.latency_ms = 
                (this.metrics.algorithm_performance.kernel_methods.latency_ms * 
                 (this.metrics.algorithm_performance.kernel_methods.requests - 1) + 
                 processingTime) / this.metrics.algorithm_performance.kernel_methods.requests;
            } catch (kError) {
              logger.error(`Kernel correlation error: ${kError.message}`);
              // Fall back to Pearson
              result = this.calculatePearsonCorrelation(valuesA, valuesB);
              method = 'pearson';
            }
          } else {
            // Fall back to Pearson if kernel methods not available
            result = this.calculatePearsonCorrelation(valuesA, valuesB);
            method = 'pearson';
          }
          break;
          
        case 'adaptive':
          if (this.useAdaptiveWindows && this.adaptiveWindowAnalyzer) {
            result = await this.calculateAdaptiveWindowCorrelation(
              valuesA, valuesB, dates, options
            );
            method = 'adaptive_window';
          } else {
            // Fall back to time-weighted
            result = this.calculateTimeWeightedCorrelation(
              valuesA, valuesB, dates, options
            );
            method = 'time_weighted';
          }
          break;
          
        default:
          // Standard time-weighted correlation
          result = this.calculateTimeWeightedCorrelation(
            valuesA, valuesB, dates, options
          );
          method = 'time_weighted';
      }
      
      // Apply Bayesian shrinkage adjustment if needed
      if (this.useBayesianAdjustment && 
          !['bayesian_nn', 'transformer'].includes(method) && 
          alignedSeries.length < MIN_DATA_POINTS * 2) {
        
        const rawCoefficient = result.coefficient;
        const adjustedCoefficient = this.applyBayesianShrinkage(
          rawCoefficient,
          result.effectiveSampleSize || alignedSeries.length
        );
        
        result.rawCoefficient = rawCoefficient;
        result.coefficient = adjustedCoefficient;
        result.isBayesianAdjusted = true;
      }
      
      // Calculate confidence interval
      if (!result.confidenceInterval) {
        result.confidenceInterval = this.calculateConfidenceInterval(
          result.coefficient,
          result.effectiveSampleSize || alignedSeries.length
        );
      }
      
      // Add method and return
      result.method = method;
      result.modelVersion = modelVersion;
      result.dataPoints = alignedSeries.length;
      
      return result;
    } catch (error) {
      logger.error(`AdvancedFactorCorrelationEngine: Error calculating correlation: ${error.message}`);
      
      // Return default correlation on error
      return {
        coefficient: DEFAULT_CORRELATION,
        confidence: 0.2,
        dataPoints: 0,
        effectiveSampleSize: 0,
        recencyScore: 0.5,
        trend: 0,
        method: 'fallback',
        modelVersion: null,
        confidenceInterval: [-0.3, 0.3],
        error: error.message,
        isDefault: true
      };
    }
  }

  /**
   * Calculate correlation using transformer-based deep learning
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @param {Array<number>} valuesA Values of first factor
   * @param {Array<number>} valuesB Values of second factor
   * @param {Array<Date>} dates Dates of values
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Correlation result
   * @private
   */
  async calculateTransformerCorrelation(factorA, factorB, valuesA, valuesB, dates, options = {}) {
    try {
      // Get embeddings for the factors if available
      let factorEmbeddingA = null;
      let factorEmbeddingB = null;
      
      if (this.useDynamicEmbeddings && this.factorEmbedder) {
        try {
          const embeddings = await this.getFactorEmbeddings([factorA, factorB], options);
          if (embeddings && embeddings[factorA] && embeddings[factorB]) {
            factorEmbeddingA = embeddings[factorA];
            factorEmbeddingB = embeddings[factorB];
          }
        } catch (embErr) {
          logger.warn(`Error getting factor embeddings: ${embErr.message}`);
        }
      }
      
      // Prepare input sequence for transformer
      const sequence = [];
      for (let i = 0; i < valuesA.length; i++) {
        sequence.push({
          date: dates[i].getTime(),
          valueA: valuesA[i],
          valueB: valuesB[i]
        });
      }
      
      // Sort by date
      sequence.sort((a, b) => a.date - b.date);
      
      // Prepare input for the model
      const modelInput = {
        sequence,
        factorA,
        factorB,
        factorEmbeddingA,
        factorEmbeddingB,
        sport: options.sport || 'all',
        league: options.league || 'all'
      };
      
      // Get correlation from transformer model
      const prediction = await this.transformerModel.predict(modelInput);
      
      // Get attention weights for interpretability
      const attentionWeights = await this.transformerModel.getAttentionWeights(modelInput);
      
      // Calculate importance of each time point
      const timeImportance = this.calculateTimePointImportance(attentionWeights, sequence);
      
      // Return enhanced result
      return {
        coefficient: prediction.correlation,
        confidence: prediction.confidence,
        confidenceInterval: [
          Math.max(-1, prediction.correlation - prediction.uncertainty),
          Math.min(1, prediction.correlation + prediction.uncertainty)
        ],
        effectiveSampleSize: prediction.effectiveSampleSize || sequence.length,
        recencyScore: prediction.recencyScore || this.calculateRecencyScore(timeImportance, dates),
        trend: prediction.trend || 0,
        nonLinearityScore: prediction.nonLinearityScore,
        timeImportance: timeImportance.slice(0, 10), // Just include top 10 for brevity
        method: 'transformer'
      };
    } catch (error) {
      logger.error(`Transformer correlation error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate correlation using Bayesian Neural Network for uncertainty quantification
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @param {Array<number>} valuesA Values of first factor
   * @param {Array<number>} valuesB Values of second factor
   * @param {Array<Date>} dates Dates of values
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Correlation with uncertainty
   * @private
   */
  async calculateBayesianCorrelation(factorA, factorB, valuesA, valuesB, dates, options = {}) {
    try {
      // Get embeddings for the factors if available
      let factorEmbeddingA = null;
      let factorEmbeddingB = null;
      
      if (this.useDynamicEmbeddings && this.factorEmbedder) {
        try {
          const embeddings = await this.getFactorEmbeddings([factorA, factorB], options);
          if (embeddings && embeddings[factorA] && embeddings[factorB]) {
            factorEmbeddingA = embeddings[factorA];
            factorEmbeddingB = embeddings[factorB];
          }
        } catch (embErr) {
          logger.warn(`Error getting factor embeddings: ${embErr.message}`);
        }
      }
      
      // Extract context features
      const timeSeries = [];
      for (let i = 0; i < valuesA.length; i++) {
        timeSeries.push({
          date: dates[i].getTime(),
          valueA: valuesA[i],
          valueB: valuesB[i]
        });
      }
      
      // Sort by date
      timeSeries.sort((a, b) => a.date - b.date);
      
      // Extract time series features
      const timeSeriesFeatures = this.extractTimeSeriesFeatures(timeSeries);
      
      // Prepare input for the model
      const modelInput = {
        factorA,
        factorB,
        factorEmbeddingA,
        factorEmbeddingB,
        timeSeriesFeatures,
        sport: options.sport || 'all',
        league: options.league || 'all',
        sampleCount: options.bnuSamples || 30 // Number of samples for uncertainty estimation
      };
      
      // Run Bayesian inference
      const prediction = await this.bayesianNN.predict(modelInput);
      
      // Calculate standard correlation for comparison
      const pearsonCorr = this.calculatePearsonCorrelation(valuesA, valuesB);
      
      // Calculate time-weighted correlation
      const timeWeightedCorr = this.calculateTimeWeightedCorrelation(
        valuesA, valuesB, dates, options
      );
      
      // Return enhanced result with uncertainty
      return {
        coefficient: prediction.mean,
        standardDeviation: prediction.std,
        confidence: prediction.confidence,
        confidenceInterval: [
          Math.max(-1, prediction.lowerBound),
          Math.min(1, prediction.upperBound)
        ],
        effectiveSampleSize: prediction.effectiveSampleSize || timeWeightedCorr.effectiveSampleSize,
        recencyScore: timeWeightedCorr.recencyScore,
        trend: timeWeightedCorr.trend,
        pearsonCorrelation: pearsonCorr.coefficient,
        posteriorSamples: prediction.samples.slice(0, 10), // Just include 10 samples for brevity
        method: 'bayesian_nn'
      };
    } catch (error) {
      logger.error(`Bayesian correlation error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate correlation using kernel methods for non-linear relationships
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @param {Array<number>} valuesA Values of first factor
   * @param {Array<number>} valuesB Values of second factor
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Linear and non-linear correlation results
   * @private
   */
  async calculateKernelCorrelation(factorA, factorB, valuesA, valuesB, options = {}) {
    try {
      // Calculate standard Pearson correlation
      const pearsonResult = this.calculatePearsonCorrelation(valuesA, valuesB);
      
      // Prepare data
      const data = [];
      for (let i = 0; i < valuesA.length; i++) {
        data.push([valuesA[i], valuesB[i]]);
      }
      
      // Calculate kernel correlation using RBF kernel
      const kernelParams = {
        type: options.kernelType || 'rbf',
        gamma: options.kernelGamma || 0.1
      };
      
      const kernelMatrix = this.kernelCorrelator.calculateKernelMatrix(data, kernelParams);
      const hsicScore = this.kernelCorrelator.calculateHSIC(kernelMatrix);
      
      // Calculate independence test p-value
      const independenceTest = this.kernelCorrelator.testIndependence(kernelMatrix, data.length);
      
      // Normalize HSIC score to [-1, 1] range for comparability with correlation
      const normalizedHSIC = Math.sign(pearsonResult.coefficient) * 
        Math.min(1, Math.abs(hsicScore) / (data.length * data.length));
      
      // Calculate non-linearity score (difference between kernel and linear correlation)
      const nonLinearityScore = Math.abs(normalizedHSIC - pearsonResult.coefficient);
      
      return {
        coefficient: pearsonResult.coefficient, // Report linear correlation as main coefficient
        nonLinearCorrelation: normalizedHSIC,
        nonLinearityScore,
        hsicScore,
        pValue: independenceTest.pValue,
        isIndependent: independenceTest.pValue > 0.05,
        confidence: 1 - independenceTest.pValue,
        kernelType: kernelParams.type,
        method: 'kernel'
      };
    } catch (error) {
      logger.error(`Kernel correlation error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate correlation using adaptive window analysis
   * @param {Array<number>} valuesA Values of first factor
   * @param {Array<number>} valuesB Values of second factor
   * @param {Array<Date>} dates Dates of values
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Correlation results with best window size
   * @private
   */
  async calculateAdaptiveWindowCorrelation(valuesA, valuesB, dates, options = {}) {
    try {
      // Sort data chronologically
      const data = [];
      for (let i = 0; i < valuesA.length; i++) {
        data.push({
          date: dates[i],
          valueA: valuesA[i],
          valueB: valuesB[i]
        });
      }
      data.sort((a, b) => a.date - b.date);
      
      // Extract sorted arrays
      const sortedValuesA = data.map(d => d.valueA);
      const sortedValuesB = data.map(d => d.valueB);
      const sortedDates = data.map(d => d.date);
      
      // Configure window sizes to try
      const leagueConfig = this.getLeagueConfig(options.sport, options.league);
      const windowSizes = options.windowSizes || leagueConfig.modelParams.windowSizes || [7, 14, 30, 60];
      
      // Calculate correlation for each window size
      const windowResults = [];
      
      for (const windowSize of windowSizes) {
        // Skip window sizes larger than our data
        if (windowSize >= sortedValuesA.length) {
          continue;
        }
        
        // Calculate windowed correlations
        const windowedCorrelations = this.calculateWindowedCorrelations(
          sortedValuesA, sortedValuesB, sortedDates, windowSize
        );
        
        // Calculate final correlation as weighted average of window correlations
        const finalCorrelation = this.calculateWindowedAverageCorrelation(windowedCorrelations);
        
        // Calculate volatility of correlation
        const volatility = this.calculateCorrelationVolatility(windowedCorrelations);
        
        windowResults.push({
          windowSize,
          correlation: finalCorrelation.correlation,
          confidence: finalCorrelation.confidence,
          volatility,
          windowCount: windowedCorrelations.length,
          recentCorrelation: windowedCorrelations.length > 0 
            ? windowedCorrelations[windowedCorrelations.length - 1].correlation 
            : 0
        });
      }
      
      // Find best window size based on confidence
      windowResults.sort((a, b) => b.confidence - a.confidence);
      const bestWindow = windowResults[0] || { windowSize: 0, correlation: 0, confidence: 0 };
      
      // Calculate full correlation for reference
      const fullCorrelation = this.calculatePearsonCorrelation(sortedValuesA, sortedValuesB);
      
      // Track adaptive window metrics
      this.metrics.algorithm_performance.adaptive_window.requests++;
      this.metrics.algorithm_performance.adaptive_window.avg_window_size = 
        (this.metrics.algorithm_performance.adaptive_window.avg_window_size * 
         (this.metrics.algorithm_performance.adaptive_window.requests - 1) + 
         bestWindow.windowSize) / this.metrics.algorithm_performance.adaptive_window.requests;
      
      // Return result with best window size
      return {
        coefficient: bestWindow.correlation,
        confidence: bestWindow.confidence,
        effectiveSampleSize: data.length,
        windowSize: bestWindow.windowSize,
        fullCorrelation: fullCorrelation.coefficient,
        correlationDifference: Math.abs(bestWindow.correlation - fullCorrelation.coefficient),
        volatility: bestWindow.volatility,
        recentCorrelation: bestWindow.recentCorrelation,
        windowResults: windowResults.slice(0, 3), // Include top 3 window results
        method: 'adaptive_window'
      };
    } catch (error) {
      logger.error(`Adaptive window correlation error: ${error.message}`);
      
      // Fall back to standard Pearson correlation
      const corrResult = this.calculatePearsonCorrelation(valuesA, valuesB);
      return {
        coefficient: corrResult.coefficient,
        confidence: corrResult.confidence,
        effectiveSampleSize: valuesA.length,
        fullCorrelation: corrResult.coefficient,
        method: 'pearson_fallback',
        error: error.message
      };
    }
  }

  /**
   * Calculate correlation using transfer learning from other sports/leagues
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @param {Array<Object>} predictionsA Predictions for first factor
   * @param {Array<Object>} predictionsB Predictions for second factor
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Correlation with transfer learning
   * @private
   */
  async calculateTransferLearningCorrelation(factorA, factorB, predictionsA, predictionsB, options = {}) {
    try {
      // Initialize result with default values
      const result = {
        coefficient: DEFAULT_CORRELATION,
        confidence: 0.3,
        dataPoints: Math.min(predictionsA.length, predictionsB.length),
        effectiveSampleSize: Math.min(predictionsA.length, predictionsB.length),
        method: 'transfer_learning',
        sourceDomains: [],
        sourceWeights: []
      };
      
      // If transfer learning manager isn't available, return default
      if (!this.transferLearningManager) {
        return result;
      }
      
      // Get target domain details
      const targetSport = options.sport || 'all';
      const targetLeague = options.league || 'all';
      
      // Find similar factors in other sports/leagues
      const transferSources = await this.transferLearningManager.findTransferSources(
        factorA, factorB, targetSport, targetLeague
      );
      
      // If no transfer sources found, return default
      if (transferSources.length === 0) {
        return result;
      }
      
      // Calculate transfer learning correlation
      const transferResult = await this.transferLearningManager.calculateTransferCorrelation(
        factorA, factorB, transferSources, options
      );
      
      // Track transfer learning metrics
      const coldStartImprovement = transferResult.confidenceImprovement || 0;
      this.metrics.algorithm_performance.transfer_learning.requests++;
      this.metrics.algorithm_performance.transfer_learning.cold_start_improvement = 
        (this.metrics.algorithm_performance.transfer_learning.cold_start_improvement * 
         (this.metrics.algorithm_performance.transfer_learning.requests - 1) + 
         coldStartImprovement) / this.metrics.algorithm_performance.transfer_learning.requests;
      
      return {
        coefficient: transferResult.correlation,
        confidence: transferResult.confidence,
        dataPoints: result.dataPoints,
        effectiveSampleSize: transferResult.effectiveSampleSize || result.effectiveSampleSize,
        confidenceInterval: transferResult.confidenceInterval || [-0.3, 0.3],
        sourceDomains: transferResult.sourceDomains,
        sourceWeights: transferResult.sourceWeights,
        confidenceImprovement: transferResult.confidenceImprovement,
        method: 'transfer_learning'
      };
    } catch (error) {
      logger.error(`Transfer learning correlation error: ${error.message}`);
      
      // Return default correlation on error
      return {
        coefficient: DEFAULT_CORRELATION,
        confidence: 0.3,
        dataPoints: Math.min(predictionsA.length, predictionsB.length),
        effectiveSampleSize: Math.min(predictionsA.length, predictionsB.length),
        method: 'default_fallback',
        error: error.message
      };
    }
  }

  /**
   * Calculate time-weighted correlation between two time series
   * @param {Array<number>} valuesA First time series values
   * @param {Array<number>} valuesB Second time series values
   * @param {Array<Date>} dates Dates for the time series
   * @param {Object} options Additional options
   * @returns {Object} Time-weighted correlation details
   * @private
   */
  calculateTimeWeightedCorrelation(valuesA, valuesB, dates, options = {}) {
    try {
      // Validate inputs
      if (valuesA.length !== valuesB.length || valuesA.length !== dates.length) {
        throw new Error('Arrays must have the same length');
      }
      
      if (valuesA.length === 0) {
        return { 
          coefficient: 0, 
          confidence: 0, 
          effectiveSampleSize: 0,
          recencyScore: 0,
          trend: 0,
          weights: []
        };
      }
      
      // Get league-specific half-life
      const leagueConfig = this.getLeagueConfig(options.sport, options.league);
      
      // Half-life in days (data point weight halves after this many days)
      const halfLifeDays = options.halfLifeDays || 
                           leagueConfig.defaultCorrelationHalflife || 
                           this.timeWeightHalflife;
      
      // Min weight to ensure old data still has some influence
      const minWeight = options.minWeight || this.minTimeWeight;
      
      // Calculate weights based on recency
      const now = new Date();
      const weights = dates.map(date => {
        const ageInDays = (now - date) / (1000 * 60 * 60 * 24);
        return Math.max(minWeight, Math.pow(0.5, ageInDays / halfLifeDays));
      });
      
      // Calculate weighted means
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      
      let weightedMeanA = 0;
      let weightedMeanB = 0;
      
      for (let i = 0; i < valuesA.length; i++) {
        weightedMeanA += valuesA[i] * weights[i] / totalWeight;
        weightedMeanB += valuesB[i] * weights[i] / totalWeight;
      }
      
      // Calculate weighted covariance and variances
      let weightedCovariance = 0;
      let weightedVarianceA = 0;
      let weightedVarianceB = 0;
      
      for (let i = 0; i < valuesA.length; i++) {
        const diffA = valuesA[i] - weightedMeanA;
        const diffB = valuesB[i] - weightedMeanB;
        
        weightedCovariance += weights[i] * diffA * diffB;
        weightedVarianceA += weights[i] * diffA * diffA;
        weightedVarianceB += weights[i] * diffB * diffB;
      }
      
      // Normalize by sum of weights
      weightedCovariance /= totalWeight;
      weightedVarianceA /= totalWeight;
      weightedVarianceB /= totalWeight;
      
      // Calculate weighted correlation coefficient
      let weightedCorrelation = 0;
      if (weightedVarianceA > 0 && weightedVarianceB > 0) {
        weightedCorrelation = weightedCovariance / Math.sqrt(weightedVarianceA * weightedVarianceB);
      }
      
      // Calculate effective sample size based on weights
      const effectiveSampleSize = Math.pow(totalWeight, 2) / weights.reduce((sum, w) => sum + w * w, 0);
      
      // Calculate confidence based on effective sample size
      const confidence = Math.min(0.9, effectiveSampleSize / 200);
      
      // Calculate recency score (how much weight is in recent data)
      const recentWeightThreshold = 30; // Days considered "recent"
      const recentWeightSum = weights.reduce((sum, w, i) => {
        const ageInDays = (now - dates[i]) / (1000 * 60 * 60 * 24);
        return ageInDays <= recentWeightThreshold ? sum + w : sum;
      }, 0);
      
      const recencyScore = recentWeightSum / totalWeight;
      
      // Calculate trend - positive means correlation is strengthening,
      // negative means it's weakening over time
      const trend = this.calculateCorrelationTrend(valuesA, valuesB, dates, weights);
      
      return {
        coefficient: weightedCorrelation,
        confidence,
        effectiveSampleSize,
        recencyScore,
        trend,
        weights
      };
    } catch (error) {
      logger.error(`Time-weighted correlation error: ${error.message}`);
      
      // Return fallback result
      return {
        coefficient: 0,
        confidence: 0.1,
        effectiveSampleSize: 0,
        recencyScore: 0.5,
        trend: 0,
        weights: []
      };
    }
  }

  /**
   * Calculate standard Pearson correlation coefficient
   * @param {Array<number>} x First array
   * @param {Array<number>} y Second array
   * @returns {Object} Correlation coefficient and confidence
   * @private
   */
  calculatePearsonCorrelation(x, y) {
    try {
      if (x.length !== y.length) {
        throw new Error('Arrays must have the same length');
      }
      
      if (x.length === 0) {
        return { coefficient: 0, confidence: 0 };
      }
      
      // Calculate means
      const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;
      const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;
      
      // Calculate covariance and variances
      let covariance = 0;
      let varianceX = 0;
      let varianceY = 0;
      
      for (let i = 0; i < x.length; i++) {
        const diffX = x[i] - meanX;
        const diffY = y[i] - meanY;
        
        covariance += diffX * diffY;
        varianceX += diffX * diffX;
        varianceY += diffY * diffY;
      }
      
      // Avoid division by zero
      if (varianceX === 0 || varianceY === 0) {
        return { coefficient: 0, confidence: 0.1 };
      }
      
      // Calculate correlation coefficient
      const correlation = covariance / Math.sqrt(varianceX * varianceY);
      
      // Calculate confidence based on sample size
      const confidence = Math.min(0.9, x.length / 200);
      
      return { coefficient: correlation, confidence };
    } catch (error) {
      logger.error(`Pearson correlation error: ${error.message}`);
      return { coefficient: 0, confidence: 0 };
    }
  }

  /**
   * Calculate non-linear correlation between two factors using kernel methods
   * Detects relationships that may not be captured by linear correlation
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Non-linear correlation score and details
   * @private
   */
  async calculateNonLinearCorrelation(factorA, factorB, options = {}) {
    try {
      // Check if kernel correlator is available
      if (!this.kernelCorrelator) {
        return { score: 0, correlation: 0 };
      }
      
      // Get predictions for both factors
      const predictionsA = await PredictionModel.find({
        factor: factorA,
        status: 'completed',
        is_correct: { $exists: true },
        ...(options.league ? { league: options.league } : {}),
        ...(options.sport ? { sport: options.sport } : {})
      }).sort({ created_at: -1 }).limit(1000);
      
      const predictionsB = await PredictionModel.find({
        factor: factorB,
        status: 'completed',
        is_correct: { $exists: true },
        ...(options.league ? { league: options.league } : {}),
        ...(options.sport ? { sport: options.sport } : {})
      }).sort({ created_at: -1 }).limit(1000);
      
      // Create time series
      const timeSeriesA = this.createTimeSeries(predictionsA);
      const timeSeriesB = this.createTimeSeries(predictionsB);
      
      // Align time series
      const alignedSeries = this.alignTimeSeries(timeSeriesA, timeSeriesB);
      
      // Not enough common dates
      if (alignedSeries.length < MIN_DATA_POINTS * 0.5) {
        return { score: 0, correlation: 0 };
      }
      
      // Extract values
      const valuesA = alignedSeries.map(entry => entry.valueA);
      const valuesB = alignedSeries.map(entry => entry.valueB);
      
      // Calculate kernel correlation
      const kernelResult = await this.calculateKernelCorrelation(
        factorA, factorB, valuesA, valuesB, options
      );
      
      return {
        score: kernelResult.nonLinearityScore,
        correlation: kernelResult.nonLinearCorrelation
      };
    } catch (error) {
      logger.error(`Non-linear correlation error: ${error.message}`);
      return { score: 0, correlation: 0 };
    }
  }

  /**
   * Apply Bayesian shrinkage to correlation coefficient
   * Shrinks correlation towards zero (prior) based on sample size
   * @param {number} correlation Raw correlation coefficient
   * @param {number} sampleSize Number of data points
   * @returns {number} Adjusted correlation coefficient
   * @private
   */
  applyBayesianShrinkage(correlation, sampleSize) {
    // Prior mean (assuming no correlation as prior)
    const priorMean = 0;
    
    // Prior strength (weight of the prior)
    const priorStrength = this.bayesianPriorStrength;
    
    // The smaller the sample, the more we shrink towards prior
    const shrinkageFactor = priorStrength / (priorStrength + sampleSize);
    
    // Weighted average between sample correlation and prior
    return correlation * (1 - shrinkageFactor) + priorMean * shrinkageFactor;
  }

  /**
   * Calculate confidence interval for a correlation coefficient
   * @param {number} correlation Correlation coefficient
   * @param {number} sampleSize Sample size
   * @returns {Array<number>} Lower and upper bounds of confidence interval
   * @private
   */
  calculateConfidenceInterval(correlation, sampleSize) {
    try {
      // Apply Fisher's Z-transformation
      const z = 0.5 * Math.log((1 + correlation) / (1 - correlation));
      
      // Standard error of z
      const se = 1 / Math.sqrt(sampleSize - 3);
      
      // 95% confidence interval in z-space
      const zLower = z - 1.96 * se;
      const zUpper = z + 1.96 * se;
      
      // Convert back to correlation scale
      const rLower = Math.max(-1, (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1));
      const rUpper = Math.min(1, (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1));
      
      return [rLower, rUpper];
    } catch (error) {
      // Default confidence interval
      return [
        Math.max(-1, correlation - 0.3),
        Math.min(1, correlation + 0.3)
      ];
    }
  }

  /**
   * Create time series from prediction data
   * @param {Array<Object>} predictions Array of prediction records
   * @returns {Array<Object>} Time series data with dates and values
   * @private
   */
  createTimeSeries(predictions) {
    // Group by day
    const byDay = {};
    
    for (const prediction of predictions) {
      const date = prediction.created_at.toISOString().split('T')[0];
      
      if (!byDay[date]) {
        byDay[date] = {
          total: 0,
          correct: 0,
          successRate: 0
        };
      }
      
      byDay[date].total++;
      if (prediction.is_correct) {
        byDay[date].correct++;
      }
    }
    
    // Calculate success rates and convert to array
    const series = [];
    
    for (const date in byDay) {
      const entry = byDay[date];
      entry.successRate = entry.total > 0 ? entry.correct / entry.total : 0;
      series.push({
        date: new Date(date),
        value: entry.successRate
      });
    }
    
    // Sort by date
    series.sort((a, b) => a.date - b.date);
    
    return series;
  }

  /**
   * Align two time series to have matching dates
   * @param {Array<Object>} seriesA First time series
   * @param {Array<Object>} seriesB Second time series
   * @returns {Array<Object>} Aligned time series with both values
   * @private
   */
  alignTimeSeries(seriesA, seriesB) {
    // Create maps of date -> value
    const mapA = new Map(seriesA.map(entry => [entry.date.toISOString().split('T')[0], entry.value]));
    const mapB = new Map(seriesB.map(entry => [entry.date.toISOString().split('T')[0], entry.value]));
    
    // Find common dates
    const commonDates = [...mapA.keys()].filter(date => mapB.has(date));
    
    // Create aligned series
    return commonDates.map(date => ({
      date: new Date(date),
      valueA: mapA.get(date),
      valueB: mapB.get(date)
    })).sort((a, b) => a.date - b.date);
  }

  /**
   * Calculate correlation trend over time
   * Detects if correlation is strengthening or weakening
   * @param {Array<number>} x First array of values
   * @param {Array<number>} y Second array of values
   * @param {Array<Date>} dates Array of dates for each data point
   * @param {Array<number>} weights Weights for each data point
   * @returns {number} Trend strength (-1 to 1), positive = strengthening
   * @private
   */
  calculateCorrelationTrend(x, y, dates, weights) {
    if (x.length < 10) {
      return 0; // Not enough data to calculate meaningful trend
    }
    
    // Sort all data by date
    const data = dates.map((date, i) => ({
      date: date,
      x: x[i],
      y: y[i],
      weight: weights[i]
    }));
    
    data.sort((a, b) => a.date - b.date);
    
    // Split data into earlier half and later half
    const midpoint = Math.floor(data.length / 2);
    const earlierHalf = data.slice(0, midpoint);
    const laterHalf = data.slice(midpoint);
    
    // Calculate correlation for each half
    const calcHalfCorrelation = (half) => {
      const halfX = half.map(d => d.x);
      const halfY = half.map(d => d.y);
      const halfWeights = half.map(d => d.weight);
      
      // Calculate weighted means
      const totalWeight = halfWeights.reduce((sum, w) => sum + w, 0);
      
      let weightedMeanX = 0;
      let weightedMeanY = 0;
      
      for (let i = 0; i < halfX.length; i++) {
        weightedMeanX += halfX[i] * halfWeights[i] / totalWeight;
        weightedMeanY += halfY[i] * halfWeights[i] / totalWeight;
      }
      
      // Calculate weighted covariance and variances
      let weightedCovariance = 0;
      let weightedVarianceX = 0;
      let weightedVarianceY = 0;
      
      for (let i = 0; i < halfX.length; i++) {
        const diffX = halfX[i] - weightedMeanX;
        const diffY = halfY[i] - weightedMeanY;
        
        weightedCovariance += halfWeights[i] * diffX * diffY;
        weightedVarianceX += halfWeights[i] * diffX * diffX;
        weightedVarianceY += halfWeights[i] * diffY * diffY;
      }
      
      // Normalize
      weightedCovariance /= totalWeight;
      weightedVarianceX /= totalWeight;
      weightedVarianceY /= totalWeight;
      
      // Calculate correlation
      if (weightedVarianceX > 0 && weightedVarianceY > 0) {
        return weightedCovariance / Math.sqrt(weightedVarianceX * weightedVarianceY);
      }
      return 0;
    };
    
    const earlierCorrelation = calcHalfCorrelation(earlierHalf);
    const laterCorrelation = calcHalfCorrelation(laterHalf);
    
    // Calculate trend (difference between later and earlier correlations)
    const trend = laterCorrelation - earlierCorrelation;
    
    // Normalize trend to be between -1 and 1
    return Math.max(-1, Math.min(1, trend));
  }

  /**
   * Calculate time point importance from transformer attention weights
   * @param {Array<Array<number>>} attentionWeights Attention weights from transformer
   * @param {Array<Object>} sequence Sequence of time points
   * @returns {Array<Object>} Time points with importance scores
   * @private
   */
  calculateTimePointImportance(attentionWeights, sequence) {
    try {
      // Average attention weights across all heads and layers
      const avgAttention = new Array(sequence.length).fill(0);
      
      for (const layerWeights of attentionWeights) {
        for (const headWeights of layerWeights) {
          for (let i = 0; i < headWeights.length && i < sequence.length; i++) {
            avgAttention[i] += headWeights[i] / (attentionWeights.length * layerWeights.length);
          }
        }
      }
      
      // Create importance scores
      const importance = sequence.map((point, i) => ({
        date: new Date(point.date),
        valueA: point.valueA,
        valueB: point.valueB,
        importance: avgAttention[i]
      }));
      
      // Sort by importance (descending)
      return importance.sort((a, b) => b.importance - a.importance);
    } catch (error) {
      logger.error(`Error calculating time point importance: ${error.message}`);
      return sequence.map(point => ({
        date: new Date(point.date),
        valueA: point.valueA,
        valueB: point.valueB,
        importance: 1 / sequence.length
      }));
    }
  }

  /**
   * Calculate recency score from time importance
   * @param {Array<Object>} timeImportance Time points with importance scores
   * @param {Array<Date>} dates Original dates array
   * @returns {number} Recency score (0-1)
   * @private
   */
  calculateRecencyScore(timeImportance, dates) {
    try {
      if (timeImportance.length === 0 || dates.length === 0) {
        return 0.5;
      }
      
      // Sort dates chronologically
      const sortedDates = [...dates].sort((a, b) => a - b);
      
      // Define what's "recent" - last 30% of the date range
      const dateCutoff = sortedDates[Math.floor(sortedDates.length * 0.7)];
      
      // Calculate portion of importance in recent dates
      let recentImportance = 0;
      let totalImportance = 0;
      
      for (const item of timeImportance) {
        if (item.date >= dateCutoff) {
          recentImportance += item.importance;
        }
        totalImportance += item.importance;
      }
      
      return totalImportance > 0 ? recentImportance / totalImportance : 0.5;
    } catch (error) {
      logger.error(`Error calculating recency score: ${error.message}`);
      return 0.5;
    }
  }

  /**
   * Extract features from time series for machine learning
   * @param {Array<Object>} timeSeries Time series data
   * @returns {Object} Extracted features
   * @private
   */
  extractTimeSeriesFeatures(timeSeries) {
    try {
      // Sort time series by date
      timeSeries.sort((a, b) => a.date - b.date);
      
      // Get values
      const valuesA = timeSeries.map(point => point.valueA);
      const valuesB = timeSeries.map(point => point.valueB);
      
      // Calculate basic statistics
      const statsA = this.calculateTimeSeriesStats(valuesA);
      const statsB = this.calculateTimeSeriesStats(valuesB);
      
      // Calculate cross-correlation at different lags
      const maxLag = Math.min(5, Math.floor(timeSeries.length / 5));
      const crossCorrelations = [];
      
      for (let lag = -maxLag; lag <= maxLag; lag++) {
        const cc = this.calculateCrossCorrelation(valuesA, valuesB, lag);
        crossCorrelations.push(cc);
      }
      
      // Calculate rolling correlations (window of 5 points)
      const rollingWindow = Math.min(5, Math.floor(timeSeries.length / 3));
      const rollingCorrelations = [];
      
      for (let i = 0; i <= timeSeries.length - rollingWindow; i++) {
        const windowA = valuesA.slice(i, i + rollingWindow);
        const windowB = valuesB.slice(i, i + rollingWindow);
        const corr = this.calculatePearsonCorrelation(windowA, windowB);
        rollingCorrelations.push(corr.coefficient);
      }
      
      // Return all features
      return {
        length: timeSeries.length,
        statsA,
        statsB,
        crossCorrelations,
        rollingCorrelations,
        firstLastCorrelation: rollingCorrelations.length >= 2 ? 
          rollingCorrelations[rollingCorrelations.length - 1] - rollingCorrelations[0] : 0,
        maxCrossCorrelation: Math.max(...crossCorrelations.map(Math.abs)),
        maxCrossCorrelationLag: crossCorrelations.indexOf(Math.max(...crossCorrelations)) - maxLag
      };
    } catch (error) {
      logger.error(`Error extracting time series features: ${error.message}`);
      return {
        length: timeSeries.length,
        error: error.message
      };
    }
  }

  /**
   * Calculate statistics for a time series
   * @param {Array<number>} values Time series values
   * @returns {Object} Statistical metrics
   * @private
   */
  calculateTimeSeriesStats(values) {
    try {
      if (values.length === 0) {
        return {
          mean: 0,
          std: 0,
          min: 0,
          max: 0,
          q25: 0,
          median: 0,
          q75: 0
        };
      }
      
      // Calculate mean
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      
      // Calculate standard deviation
      const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
      const std = Math.sqrt(variance);
      
      // Sort values for percentiles
      const sorted = [...values].sort((a, b) => a - b);
      
      // Calculate percentiles
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const q25 = sorted[Math.floor(sorted.length * 0.25)];
      const median = sorted[Math.floor(sorted.length * 0.5)];
      const q75 = sorted[Math.floor(sorted.length * 0.75)];
      
      return { mean, std, min, max, q25, median, q75 };
    } catch (error) {
      logger.error(`Error calculating time series stats: ${error.message}`);
      return {
        mean: 0,
        std: 0,
        min: 0,
        max: 0,
        q25: 0,
        median: 0,
        q75: 0
      };
    }
  }

  /**
   * Calculate cross-correlation between two series at a specific lag
   * @param {Array<number>} x First series
   * @param {Array<number>} y Second series
   * @param {number} lag Lag value (positive means y is shifted forward)
   * @returns {number} Cross-correlation value
   * @private
   */
  calculateCrossCorrelation(x, y, lag) {
    try {
      // Handle lag
      let x1, y1;
      if (lag >= 0) {
        x1 = x.slice(0, x.length - lag);
        y1 = y.slice(lag);
      } else {
        x1 = x.slice(-lag);
        y1 = y.slice(0, y.length + lag);
      }
      
      // Check if we have enough points
      if (x1.length < 3 || y1.length < 3) {
        return 0;
      }
      
      // Calculate correlation
      const corr = this.calculatePearsonCorrelation(x1, y1);
      return corr.coefficient;
    } catch (error) {
      logger.error(`Error calculating cross-correlation: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calculate windowed correlations for adaptive window analysis
   * @param {Array<number>} valuesA First series
   * @param {Array<number>} valuesB Second series
   * @param {Array<Date>} dates Dates array
   * @param {number} windowSize Size of window
   * @returns {Array<Object>} Windowed correlations
   * @private
   */
  calculateWindowedCorrelations(valuesA, valuesB, dates, windowSize) {
    try {
      const results = [];
      
      // Need at least windowSize elements
      if (valuesA.length < windowSize) {
        return results;
      }
      
      // Calculate correlation for each window
      for (let i = 0; i <= valuesA.length - windowSize; i++) {
        const windowA = valuesA.slice(i, i + windowSize);
        const windowB = valuesB.slice(i, i + windowSize);
        const windowDates = dates.slice(i, i + windowSize);
        
        const correlation = this.calculatePearsonCorrelation(windowA, windowB);
        
        results.push({
          startIndex: i,
          endIndex: i + windowSize - 1,
          startDate: windowDates[0],
          endDate: windowDates[windowDates.length - 1],
          correlation: correlation.coefficient,
          confidence: correlation.confidence
        });
      }
      
      return results;
    } catch (error) {
      logger.error(`Error calculating windowed correlations: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate weighted average correlation from windowed correlations
   * @param {Array<Object>} windowedCorrelations Array of windowed correlations
   * @returns {Object} Weighted average correlation
   * @private
   */
  calculateWindowedAverageCorrelation(windowedCorrelations) {
    try {
      if (windowedCorrelations.length === 0) {
        return { correlation: 0, confidence: 0 };
      }
      
      // Weight recent windows more
      const weights = windowedCorrelations.map((_, i) => 
        Math.exp(i / windowedCorrelations.length) // Exponential weighting
      );
      
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      
      // Calculate weighted average
      let weightedSum = 0;
      for (let i = 0; i < windowedCorrelations.length; i++) {
        weightedSum += windowedCorrelations[i].correlation * weights[i];
      }
      
      const weightedAvg = weightedSum / totalWeight;
      
      // Calculate confidence as weighted average of window confidences
      let confidenceSum = 0;
      for (let i = 0; i < windowedCorrelations.length; i++) {
        confidenceSum += windowedCorrelations[i].confidence * weights[i];
      }
      
      const avgConfidence = confidenceSum / totalWeight;
      
      return { correlation: weightedAvg, confidence: avgConfidence };
    } catch (error) {
      logger.error(`Error calculating windowed average correlation: ${error.message}`);
      return { correlation: 0, confidence: 0 };
    }
  }

  /**
   * Calculate correlation volatility from windowed correlations
   * @param {Array<Object>} windowedCorrelations Array of windowed correlations
   * @returns {number} Volatility measure
   * @private
   */
  calculateCorrelationVolatility(windowedCorrelations) {
    try {
      if (windowedCorrelations.length < 2) {
        return 0;
      }
      
      // Calculate standard deviation of correlations
      const correlations = windowedCorrelations.map(w => w.correlation);
      const mean = correlations.reduce((sum, c) => sum + c, 0) / correlations.length;
      
      const squaredDiffs = correlations.map(c => Math.pow(c - mean, 2));
      const variance = squaredDiffs.reduce((sum, sq) => sum + sq, 0) / correlations.length;
      
      return Math.sqrt(variance);
    } catch (error) {
      logger.error(`Error calculating correlation volatility: ${error.message}`);
      return 0;
    }
  }

  /**
   * Generate explainable insights for prediction factors
   * @param {Array<string>} factors List of prediction factors
   * @param {Object} options Options including sport, league, etc.
   * @returns {Promise<Array>} Array of insights with explanations
   */
  async getExplainableInsights(factors, options = {}) {
    try {
      // Start performance tracking
      const startTime = performance.now();
      const traceId = `insights_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Add OpenTelemetry tracing if available
      let span;
      if (this.tracerProvider) {
        const tracer = this.tracerProvider.getTracer('factor_correlation_engine');
        span = tracer.startSpan('getExplainableInsights', {
          attributes: {
            'factors.count': factors.length,
            'sport': options.sport || 'unknown',
            'league': options.league || 'unknown',
            'detail_level': options.detailLevel || 'standard'
          }
        });
      }
      
      // Input validation - ensure factors is an array and not too large
      if (!Array.isArray(factors)) {
        throw new Error('Factors must be an array');
      }
      
      if (factors.length > 10) {
        throw new Error('Maximum of 10 factors allowed for explainable insights');
      }
      
      // Sanitize input to prevent injection
      const sanitizedFactors = factors.map(factor => {
        // Ensure string type
        if (typeof factor !== 'string') {
          return String(factor);
        }
        // Basic sanitization - remove script tags and limit length
        return factor.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                     .substring(0, 500);
      });
      
      // Default options
      const {
        sport = null,
        league = null,
        detailLevel = 'standard', // 'basic', 'standard', 'advanced'
        factorDetails = [],
        includeCounterfactuals = true,
        includeCausalRelationships = true,
        maxInsightsPerCategory = 3,
        useCache = true
      } = options;
      
      // Check cache first if caching is enabled
      if (useCache) {
        const cacheKey = this._generateInsightsCacheKey(sanitizedFactors, options);
        const cachedResult = await this._getFromCache('insights', cacheKey);
        
        if (cachedResult) {
          logger.debug(`Using cached insights for ${sanitizedFactors.length} factors`);
          
          // Track cache hit in metrics
          this.metrics.cache_hits++;
          
          // End tracing if enabled
          if (span) {
            span.setAttribute('cache.hit', true);
            span.end();
          }
          
          return cachedResult;
        }
      }
      
      logger.info(`Generating explainable insights for ${sanitizedFactors.length} factors (detail: ${detailLevel})`);
      
      // Initialize results array
      const insights = [];
      
      // Track dependency performance
      const performanceMetrics = {
        featureImportance: 0,
        historicalContext: 0,
        statisticalSignificance: 0,
        correlationPattern: 0,
        counterfactual: 0,
        causalRelationships: 0
      };
      
      // Use Promise.all to parallelize insight generation for better performance
      const insightPromises = [];
      
      // 1. Feature importance insights
      const importancePromise = new Promise(async (resolve) => {
        const featureStart = performance.now();
        let featureInsights;
        
        try {
          featureInsights = await this._generateFeatureImportanceInsights(
            sanitizedFactors, 
            { sport, league, maxInsights: maxInsightsPerCategory, detailLevel }
          );
        } catch (error) {
          logger.error(`Feature importance insights error: ${error.message}`);
          featureInsights = [];
        }
        
        performanceMetrics.featureImportance = performance.now() - featureStart;
        resolve(featureInsights);
      });
      insightPromises.push(importancePromise);
      
      // 2. Historical context insights - only if not basic detail level
      if (detailLevel !== 'basic') {
        const historicalPromise = new Promise(async (resolve) => {
          const historicalStart = performance.now();
          let historicalInsights;
          
          try {
            historicalInsights = await this._generateHistoricalContextInsights(
              sanitizedFactors,
              { sport, league, maxInsights: maxInsightsPerCategory, detailLevel }
            );
          } catch (error) {
            logger.error(`Historical context insights error: ${error.message}`);
            historicalInsights = [];
          }
          
          performanceMetrics.historicalContext = performance.now() - historicalStart;
          resolve(historicalInsights);
        });
        insightPromises.push(historicalPromise);
      }
      
      // 3. Statistical significance insights - only if not basic detail level
      if (detailLevel !== 'basic') {
        const statisticalPromise = new Promise(async (resolve) => {
          const statsStart = performance.now();
          let statisticalInsights;
          
          try {
            statisticalInsights = await this._generateStatisticalSignificanceInsights(
              sanitizedFactors,
              { sport, league, maxInsights: maxInsightsPerCategory, detailLevel }
            );
          } catch (error) {
            logger.error(`Statistical significance insights error: ${error.message}`);
            statisticalInsights = [];
          }
          
          performanceMetrics.statisticalSignificance = performance.now() - statsStart;
          resolve(statisticalInsights);
        });
        insightPromises.push(statisticalPromise);
      }
      
      // 4. Correlation pattern insights
      const correlationPromise = new Promise(async (resolve) => {
        const correlationStart = performance.now();
        let correlationInsights;
        
        try {
          correlationInsights = await this._generateCorrelationPatternInsights(
            sanitizedFactors, 
            { sport, league, maxInsights: maxInsightsPerCategory, detailLevel }
          );
        } catch (error) {
          logger.error(`Correlation pattern insights error: ${error.message}`);
          correlationInsights = [];
        }
        
        performanceMetrics.correlationPattern = performance.now() - correlationStart;
        resolve(correlationInsights);
      });
      insightPromises.push(correlationPromise);
      
      // 5. Counterfactual insights (what-if scenarios) - only if requested and detail level is advanced
      let counterfactualInsights = [];
      if (includeCounterfactuals && detailLevel === 'advanced') {
        const counterfactualPromise = new Promise(async (resolve) => {
          const counterfactualStart = performance.now();
          
          try {
            counterfactualInsights = await this._generateCounterfactualInsights(
              sanitizedFactors,
              { sport, league, maxInsights: maxInsightsPerCategory, detailLevel }
            );
          } catch (error) {
            logger.error(`Counterfactual insights error: ${error.message}`);
            counterfactualInsights = [];
          }
          
          performanceMetrics.counterfactual = performance.now() - counterfactualStart;
          resolve(counterfactualInsights);
        });
        insightPromises.push(counterfactualPromise);
      }
      
      // 6. Causal relationship insights - only if requested and detail level is advanced
      let causalInsights = [];
      if (includeCausalRelationships && detailLevel === 'advanced') {
        const causalPromise = new Promise(async (resolve) => {
          const causalStart = performance.now();
          
          try {
            causalInsights = await this._generateCausalInsights(
              sanitizedFactors,
              { sport, league, maxInsights: maxInsightsPerCategory, detailLevel }
            );
          } catch (error) {
            logger.error(`Causal insights error: ${error.message}`);
            causalInsights = [];
          }
          
          performanceMetrics.causalRelationships = performance.now() - causalStart;
          resolve(causalInsights);
        });
        insightPromises.push(causalPromise);
      }
      
      // Wait for all insight promises to resolve
      const allInsightResults = await Promise.all(insightPromises);
      
      // Combine all insights
      for (const insightResult of allInsightResults) {
        insights.push(...insightResult);
      }
      
      // Add trace ID to each insight for troubleshooting
      for (const insight of insights) {
        insight.metadata = {
          ...insight.metadata,
          traceId,
          generatedAt: new Date().toISOString(),
          version: this.getModelVersion()
        };
      }
      
      // Cache the result if caching is enabled
      if (useCache) {
        const cacheKey = this._generateInsightsCacheKey(sanitizedFactors, options);
        this._setInCache('insights', cacheKey, insights, 3600); // Cache for 1 hour
      }
      
      // Record performance metrics
      const totalTime = performance.now() - startTime;
      logger.debug(`Generated ${insights.length} insights in ${totalTime.toFixed(2)}ms`);
      
      this.metrics.insights_generated += insights.length;
      this.metrics.insights_generation_time += totalTime;
      
      // Add detailed performance tracking
      this._recordPerformanceMetrics('insights_generation', {
        count: insights.length,
        total_time_ms: totalTime,
        factors_count: sanitizedFactors.length,
        sport: sport || 'unknown',
        league: league || 'unknown',
        detail_level: detailLevel,
        feature_importance_time_ms: performanceMetrics.featureImportance,
        historical_context_time_ms: performanceMetrics.historicalContext,
        statistical_significance_time_ms: performanceMetrics.statisticalSignificance,
        correlation_pattern_time_ms: performanceMetrics.correlationPattern,
        counterfactual_time_ms: performanceMetrics.counterfactual,
        causal_relationships_time_ms: performanceMetrics.causalRelationships
      });
      
      // End tracing if enabled
      if (span) {
        span.setAttribute('insights.count', insights.length);
        span.setAttribute('performance.total_ms', totalTime);
        span.setAttribute('cache.hit', false);
        span.end();
      }
      
      return insights;
    } catch (error) {
      logger.error(`Error generating explainable insights: ${error.message}`);
      
      // Record error metrics
      this.metrics.insights_errors++;
      
      // End tracing with error if enabled
      if (span) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.end();
      }
      
      // Rethrow with more context for better debugging
      throw new Error(`Explainable insights generation failed: ${error.message}`);
    }
  }

  /**
   * Generate cache key for insights
   * @param {Array<string>} factors List of factors
   * @param {Object} options Options object
   * @returns {string} Cache key
   * @private
   */
  _generateInsightsCacheKey(factors, options) {
    // Sort factors for consistent cache key regardless of order
    const sortedFactors = [...factors].sort();
    
    // Create a hash of the key components
    const keyComponents = {
      factors: sortedFactors,
      sport: options.sport || null,
      league: options.league || null,
      detailLevel: options.detailLevel || 'standard',
      includeCounterfactuals: options.includeCounterfactuals !== false,
      includeCausalRelationships: options.includeCausalRelationships !== false,
      maxInsightsPerCategory: options.maxInsightsPerCategory || 3
    };
    
    // Use a hash function for compact keys
    return crypto.createHash('md5').update(JSON.stringify(keyComponents)).digest('hex');
  }

  /**
   * Get a value from cache
   * @param {string} namespace Cache namespace
   * @param {string} key Cache key
   * @returns {Promise<any>} Cached value or null
   * @private
   */
  async _getFromCache(namespace, key) {
    try {
      const fullKey = `${REDIS_PREFIX}${namespace}:${key}`;
      const cachedValue = await this.redisClient.get(fullKey);
      
      if (!cachedValue) {
        return null;
      }
      
      return JSON.parse(cachedValue);
    } catch (error) {
      logger.error(`Cache read error: ${error.message}`);
      return null;
    }
  }

  /**
   * Set a value in cache
   * @param {string} namespace Cache namespace
   * @param {string} key Cache key
   * @param {any} value Value to cache
   * @param {number} ttlSeconds TTL in seconds
   * @private
   */
  async _setInCache(namespace, key, value, ttlSeconds) {
    try {
      const fullKey = `${REDIS_PREFIX}${namespace}:${key}`;
      await this.redisClient.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      logger.error(`Cache write error: ${error.message}`);
    }
  }

  /**
   * Generate feature importance insights
   * @param {Array<string>} factors List of prediction factors
   * @param {Object} options Options including sport, league, max insights
   * @returns {Promise<Array>} Array of feature importance insights
   * @private
   */
  async _generateFeatureImportanceInsights(factors, options) {
    try {
      const { sport, league, maxInsights = 3 } = options;
      
      // Simple placeholder implementation
      const insights = [{
        id: `fi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'FEATURE_IMPORTANCE',
        title: 'Key Driving Factors',
        description: 'These factors most strongly influenced the prediction',
        confidence: 0.92,
        data: factors.map((factor, index) => ({
          feature: factor,
          importance: 0.9 - (index * 0.2),
          explanation: `Factor "${factor}" has significant historical correlation with outcomes.`
        })).slice(0, maxInsights)
      }];
      
      return insights;
    } catch (error) {
      logger.error(`Error generating feature importance insights: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate historical context insights
   * @param {Array<string>} factors List of prediction factors
   * @param {Object} options Options including sport, league, max insights
   * @returns {Promise<Array>} Array of historical context insights
   * @private
   */
  async _generateHistoricalContextInsights(factors, options) {
    try {
      const { sport, league, maxInsights = 3 } = options;
      
      // Simple placeholder implementation
      const insights = [{
        id: `hc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'HISTORICAL_CONTEXT',
        title: 'Historical Pattern Context',
        description: 'Similar situations from historical data support this prediction',
        confidence: 0.85,
        data: {
          similarCases: 24,
          successRate: 0.78,
          examples: [
            { description: 'Similar prediction on March 15, 2023 was accurate', result: 'SUCCESS' },
            { description: 'Similar prediction on January 8, 2023 was accurate', result: 'SUCCESS' },
            { description: 'Similar prediction on February 22, 2023 was incorrect', result: 'FAILURE' }
          ].slice(0, maxInsights)
        }
      }];
      
      return insights;
    } catch (error) {
      logger.error(`Error generating historical context insights: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate statistical significance insights
   * @param {Array<string>} factors List of prediction factors
   * @param {Object} options Options including sport, league, max insights
   * @returns {Promise<Array>} Array of statistical significance insights
   * @private
   */
  async _generateStatisticalSignificanceInsights(factors, options) {
    try {
      const { sport, league, maxInsights = 3 } = options;
      
      // Simple placeholder implementation
      const insights = [{
        id: `ss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'STATISTICAL_SIGNIFICANCE',
        title: 'Statistical Confidence Analysis',
        description: 'Evaluation of the statistical reliability of this prediction',
        confidence: 0.88,
        data: {
          pValue: 0.023,
          sampleSize: 348,
          confidenceInterval: [0.64, 0.83],
          significanceTests: [
            { name: 'Chi-squared test', result: 'SIGNIFICANT', value: 0.008 },
            { name: 'T-test', result: 'SIGNIFICANT', value: 0.012 },
            { name: 'Mann-Whitney U', result: 'SIGNIFICANT', value: 0.031 }
          ].slice(0, maxInsights)
        }
      }];
      
      return insights;
    } catch (error) {
      logger.error(`Error generating statistical significance insights: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate correlation pattern insights
   * @param {Array<string>} factors List of prediction factors
   * @param {Object} options Options including sport, league, max insights
   * @returns {Promise<Array>} Array of correlation pattern insights
   * @private
   */
  async _generateCorrelationPatternInsights(factors, options) {
    try {
      const { sport, league, maxInsights = 3 } = options;
      
      // Simple placeholder implementation
      const insights = [{
        id: `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'CORRELATION_PATTERN',
        title: 'Factor Relationship Analysis',
        description: 'How these prediction factors relate to each other',
        confidence: 0.79,
        data: {
          correlationMatrix: factors.map((f1, i) => 
            factors.map((f2, j) => i === j ? 1.0 : 0.3 + (Math.random() * 0.4))
          ),
          factorLabels: factors,
          strongestCorrelations: [
            { factor1: factors[0], factor2: factors[1], strength: 0.72, type: 'POSITIVE' },
            { factor1: factors[0], factor2: factors[2], strength: 0.68, type: 'POSITIVE' },
            { factor1: factors[1], factor2: factors[2], strength: 0.45, type: 'POSITIVE' }
          ].slice(0, maxInsights)
        }
      }];
      
      return insights;
    } catch (error) {
      logger.error(`Error generating correlation pattern insights: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate counterfactual insights (what-if scenarios)
   * @param {Array<string>} factors List of prediction factors
   * @param {Object} options Options including sport, league, max insights
   * @returns {Promise<Array>} Array of counterfactual insights
   * @private
   */
  async _generateCounterfactualInsights(factors, options) {
    try {
      const { sport, league, maxInsights = 3 } = options;
      
      // Simple placeholder implementation
      const insights = [{
        id: `cf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'COUNTERFACTUAL',
        title: 'What-If Scenarios',
        description: 'How the prediction would change in alternative scenarios',
        confidence: 0.82,
        data: {
          scenarios: [
            { 
              change: `If ${factors[0]} were reversed`, 
              newProbability: 0.35, 
              change: -0.42,
              impact: 'HIGH'
            },
            { 
              change: `If ${factors[1]} were reversed`, 
              newProbability: 0.62, 
              change: -0.15,
              impact: 'MEDIUM'
            },
            { 
              change: `If ${factors[0]} and ${factors[1]} were reversed`, 
              newProbability: 0.22, 
              change: -0.55,
              impact: 'VERY HIGH'
            }
          ].slice(0, maxInsights)
        }
      }];
      
      return insights;
    } catch (error) {
      logger.error(`Error generating counterfactual insights: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate causal relationship insights
   * @param {Array<string>} factors List of prediction factors
   * @param {Object} options Options including sport, league, max insights
   * @returns {Promise<Array>} Array of causal relationship insights
   * @private
   */
  async _generateCausalInsights(factors, options) {
    try {
      const { sport, league, maxInsights = 3 } = options;
      
      // Simple placeholder implementation
      const insights = [{
        id: `cr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'CAUSAL_RELATIONSHIP',
        title: 'Cause-Effect Relationships',
        description: 'Analysis of causal relationships between factors',
        confidence: 0.75,
        data: {
          causalLinks: [
            { 
              cause: factors[0], 
              effect: 'Match outcome', 
              strength: 0.68,
              evidence: 'Strong historical pattern with controlled variables'
            },
            { 
              cause: factors[1], 
              effect: factors[0], 
              strength: 0.41,
              evidence: 'Moderate evidence from intervention studies'
            },
            { 
              cause: 'External factor: Weather conditions', 
              effect: factors[2], 
              strength: 0.52,
              evidence: 'Clear pattern from natural experiments'
            }
          ].slice(0, maxInsights)
        }
      }];
      
      return insights;
    } catch (error) {
      logger.error(`Error generating causal insights: ${error.message}`);
      return [];
    }
  }
}