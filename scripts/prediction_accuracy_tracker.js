/**
 * Prediction Accuracy Tracking System - Enhanced with Time-Weighted Learning
 * 
 * Enterprise-grade system for tracking prediction accuracy, pairing predictions with actual outcomes,
 * and dynamically adjusting prediction models to improve accuracy over time. Now with advanced 
 * time-weighted learning that gives higher importance to recent outcomes.
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const mongoose = require('mongoose');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const { PredictionModel } = require('./models/prediction_model');
const { EventOutcomeModel } = require('./models/event_outcome_model'); 
const { ModelPerformanceModel } = require('./models/model_performance');
require('dotenv').config();

// Configuration constants
const CONFIDENCE_ADJUSTMENT_RATE = 0.05;  // Rate at which confidence is adjusted based on accuracy
const LEARNING_DECAY_RATE = 0.98;         // Weight decay for older predictions
const RECALIBRATION_THRESHOLD = 100;      // Predictions before full model recalibration
const CACHE_TTL = 60 * 60 * 2;            // 2 hour cache lifetime for common prediction patterns
const BATCH_SIZE = 100;                   // Batch size for processing historical predictions
const REDIS_PREFIX = 'accuracy:tracking:'; // Redis cache prefix

// Time-weighted learning constants
const TIME_WEIGHT_HALFLIFE = 30;          // Days after which a prediction's weight is halved
const TIME_WEIGHT_MIN = 0.1;              // Minimum weight for very old predictions
const TIME_WINDOW_RECENT = 7;             // Days for "recent" window
const TIME_WINDOW_MEDIUM = 30;            // Days for "medium term" window
const TIME_WINDOW_SEASON = 180;           // Days for "season" window

/**
 * Calculate weight of a prediction based on its age
 * @param {Date} predictionDate - Date of the prediction
 * @param {Object} options - Configuration options
 * @returns {number} - Weight factor between 0.1 and 1.0
 */
function calculateTimeWeight(predictionDate, options = {}) {
  const now = new Date();
  const ageInDays = (now - predictionDate) / (1000 * 60 * 60 * 24);
  const halflife = options.halflife || TIME_WEIGHT_HALFLIFE;
  const minWeight = options.minWeight || TIME_WEIGHT_MIN;
  
  // Exponential decay based on half-life
  const weight = Math.max(minWeight, Math.pow(0.5, ageInDays / halflife));
  return weight;
}

/**
 * Main accuracy tracking system class - Enhanced with time-weighted learning
 */
class PredictionAccuracyTracker {
  /**
   * Initialize the accuracy tracking system
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.mongoUri = options.mongoUri || process.env.MONGO_URI || "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority";
    this.dbName = options.dbName || process.env.MONGO_DB_NAME || "SportsAnalytics";
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
    
    // Learning parameters - now configurable
    this.adjustmentRate = options.adjustmentRate || CONFIDENCE_ADJUSTMENT_RATE;
    this.decayRate = options.decayRate || LEARNING_DECAY_RATE;
    this.recalibrationThreshold = options.recalibrationThreshold || RECALIBRATION_THRESHOLD;
    
    // Time-weighted learning parameters
    this.timeWeightHalflife = options.timeWeightHalflife || TIME_WEIGHT_HALFLIFE;
    this.timeWeightMin = options.timeWeightMin || TIME_WEIGHT_MIN;
    this.enableTimeWeighting = options.enableTimeWeighting !== false; // Enabled by default
    
    // Window configurations for different time periods
    this.timeWindows = {
      recent: options.recentWindow || TIME_WINDOW_RECENT,
      medium: options.mediumWindow || TIME_WINDOW_MEDIUM,
      season: options.seasonWindow || TIME_WINDOW_SEASON
    };
    
    this.mongoConnection = null;
    this.redisClient = null;
    
    this.isInitialized = false;
    this.modelsCache = new Map();
    
    // Performance metrics - enhanced with time window metrics
    this.metrics = {
      totalPredictions: 0,
      totalOutcomes: 0,
      totalAdjustments: 0,
      avgAccuracy: 0,
      latestCalibration: null,
      timeWindows: {
        recent: { predictions: 0, correct: 0, accuracy: 0 },
        medium: { predictions: 0, correct: 0, accuracy: 0 },
        season: { predictions: 0, correct: 0, accuracy: 0 }
      }
    };

    // Bind methods to this instance
    this.initialize = this.initialize.bind(this);
    this.shutdown = this.shutdown.bind(this);
    this.trackPrediction = this.trackPrediction.bind(this);
    this.recordOutcome = this.recordOutcome.bind(this);
    this.calculateAccuracy = this.calculateAccuracy.bind(this);
    this.calculateWindowedAccuracy = this.calculateWindowedAccuracy.bind(this);
    this.adjustModelConfidence = this.adjustModelConfidence.bind(this);
    this.getPredictionConfidenceMultiplier = this.getPredictionConfidenceMultiplier.bind(this);
    this.runFullModelCalibration = this.runFullModelCalibration.bind(this);
  }

  /**
   * Initialize connections to MongoDB and Redis
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('PredictionAccuracyTracker: Already initialized');
      return;
    }

    try {
      // Connect to MongoDB
      logger.info('PredictionAccuracyTracker: Connecting to MongoDB...');
      await mongoose.connect(this.mongoUri, { 
        dbName: this.dbName,
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      this.mongoConnection = mongoose.connection;
      logger.info('PredictionAccuracyTracker: MongoDB connection established');

      // Connect to Redis
      logger.info('PredictionAccuracyTracker: Connecting to Redis...');
      this.redisClient = redis.createClient({
        url: this.redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 3000) // Exponential backoff
        }
      });
      
      // Redis error handling
      this.redisClient.on('error', (err) => {
        logger.error(`PredictionAccuracyTracker: Redis error: ${err.message}`);
      });
      
      await this.redisClient.connect();
      logger.info('PredictionAccuracyTracker: Redis connection established');

      // Load performance metrics
      await this.loadMetrics();
      
      // Initialize time-windowed accuracy metrics
      await this.initializeWindowedMetrics();
      
      // Mark as initialized
      this.isInitialized = true;
      logger.info('PredictionAccuracyTracker: System initialized successfully');
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up connections before shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      if (this.redisClient) {
        await this.redisClient.disconnect();
        logger.info('PredictionAccuracyTracker: Redis connection closed');
      }
      
      if (this.mongoConnection) {
        await mongoose.disconnect();
        logger.info('PredictionAccuracyTracker: MongoDB connection closed');
      }
      
      this.isInitialized = false;
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Shutdown error: ${error.message}`);
    }
  }

  /**
   * Track a new prediction in the system
   * @param {Object} prediction The prediction to track
   * @returns {Promise<Object>} The prediction with tracking ID
   */
  async trackPrediction(prediction) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Generate unique tracking ID
      const trackingId = uuidv4();
      
      // Apply confidence adjustment based on historical model performance
      const adjustedPrediction = { ...prediction };
      
      // Apply model-specific confidence adjustment
      const confidenceMultiplier = await this.getPredictionConfidenceMultiplier(prediction);
      adjustedPrediction.confidence = Math.min(
        Math.max(prediction.confidence * confidenceMultiplier, 0.1), 
        0.99
      );
      
      // Record the original and adjusted confidence for learning
      adjustedPrediction.original_confidence = prediction.confidence;
      adjustedPrediction.tracking_id = trackingId;
      adjustedPrediction.created_at = new Date();
      adjustedPrediction.status = 'pending';

      // Store in MongoDB
      const predictionRecord = new PredictionModel(adjustedPrediction);
      await predictionRecord.save();
      
      // Update metrics
      this.metrics.totalPredictions++;
      
      // Cache for high-performance lookups for repeated predictions
      const cacheKey = this.getCacheKey(prediction);
      if (cacheKey) {
        await this.redisClient.set(
          `${REDIS_PREFIX}pred:${cacheKey}`,
          JSON.stringify({ 
            prediction_id: predictionRecord._id,
            confidence: adjustedPrediction.confidence,
            timestamp: Date.now()
          }),
          { EX: CACHE_TTL }
        );
      }

      logger.debug(`PredictionAccuracyTracker: Tracked prediction ${trackingId}`);
      return adjustedPrediction;
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error tracking prediction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record the actual outcome of a tracked prediction
   * @param {Object} outcome The actual outcome data
   * @returns {Promise<Object>} The updated prediction with outcome
   */
  async recordOutcome(outcome) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Validate required fields
      if (!outcome.tracking_id && !outcome.prediction_id) {
        throw new Error('Either tracking_id or prediction_id is required');
      }

      // Find the prediction record
      let predictionRecord;
      if (outcome.tracking_id) {
        predictionRecord = await PredictionModel.findOne({ tracking_id: outcome.tracking_id });
      } else {
        predictionRecord = await PredictionModel.findById(outcome.prediction_id);
      }

      if (!predictionRecord) {
        throw new Error('Prediction not found');
      }

      // Record the outcome
      const outcomeRecord = new EventOutcomeModel({
        prediction_id: predictionRecord._id,
        tracking_id: predictionRecord.tracking_id,
        actual_result: outcome.actual_result,
        result_details: outcome.details || {},
        recorded_at: new Date()
      });
      await outcomeRecord.save();

      // Update prediction status
      predictionRecord.status = 'completed';
      predictionRecord.is_correct = outcome.actual_result === true; // Assuming boolean outcomes
      predictionRecord.outcome_recorded_at = new Date();
      await predictionRecord.save();

      // Update model accuracy based on this outcome, now with time-weighting
      await this.adjustModelConfidence(predictionRecord, outcomeRecord);
      
      // Update windowed metrics
      await this.updateWindowedMetrics(predictionRecord);

      // Update metrics
      this.metrics.totalOutcomes++;
      this.saveMetrics();

      // Check if we need to run a full model calibration
      if (this.metrics.totalOutcomes % this.recalibrationThreshold === 0) {
        // Run calibration in background to not block the response
        this.runFullModelCalibration().catch(err => {
          logger.error(`PredictionAccuracyTracker: Calibration error: ${err.message}`);
        });
      }

      logger.debug(`PredictionAccuracyTracker: Recorded outcome for prediction ${predictionRecord.tracking_id}`);
      return { prediction: predictionRecord, outcome: outcomeRecord };
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error recording outcome: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate overall accuracy for a specific model or factor type
   * @param {Object} filter Criteria to filter predictions and calculate accuracy for
   * @returns {Promise<Object>} Accuracy metrics
   */
  async calculateAccuracy(filter = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Build the query based on filter criteria
      const query = { status: 'completed' };
      
      if (filter.league) query.league = filter.league;
      if (filter.sport) query.sport = filter.sport;
      if (filter.entity_type) query.entity_type = filter.entity_type;
      if (filter.model_id) query.model_id = filter.model_id;
      if (filter.factor_type) query.factor_type = filter.factor_type;
      if (filter.date_range) {
        query.created_at = {
          $gte: filter.date_range.start,
          $lte: filter.date_range.end
        };
      }

      // Aggregate to calculate accuracy metrics
      const results = await PredictionModel.aggregate([
        { $match: query },
        { $group: {
            _id: null,
            total_predictions: { $sum: 1 },
            correct_predictions: { $sum: { $cond: ["$is_correct", 1, 0] } },
            avg_confidence: { $avg: "$confidence" },
            avg_original_confidence: { $avg: "$original_confidence" }
          }
        }
      ]);

      if (results.length === 0) {
        return {
          accuracy: 0,
          total_predictions: 0,
          confidence_calibration: 0,
          improvement_factor: 0
        };
      }

      const metrics = results[0];
      const accuracy = metrics.correct_predictions / metrics.total_predictions;
      const confidenceCalibration = Math.abs(accuracy - metrics.avg_confidence);
      const improvementFactor = metrics.avg_confidence / metrics.avg_original_confidence;

      // Get time-windowed metrics if available
      const windowedMetrics = await this.calculateWindowedAccuracy(filter);

      return {
        accuracy,
        total_predictions: metrics.total_predictions,
        correct_predictions: metrics.correct_predictions,
        avg_confidence: metrics.avg_confidence,
        confidence_calibration: 1 - confidenceCalibration, // Higher is better
        improvement_factor: improvementFactor,
        time_windows: windowedMetrics
      };
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error calculating accuracy: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate accuracy metrics for different time windows
   * @param {Object} filter Criteria to filter predictions
   * @returns {Promise<Object>} Accuracy metrics for different time windows
   */
  async calculateWindowedAccuracy(filter = {}) {
    try {
      const now = new Date();
      const windows = {};
      
      // Calculate for each time window
      for (const [windowName, days] of Object.entries(this.timeWindows)) {
        const windowStart = new Date(now);
        windowStart.setDate(windowStart.getDate() - days);
        
        // Build the query based on filter criteria and time window
        const query = { 
          status: 'completed',
          created_at: { $gte: windowStart }
        };
        
        if (filter.league) query.league = filter.league;
        if (filter.sport) query.sport = filter.sport;
        if (filter.entity_type) query.entity_type = filter.entity_type;
        if (filter.model_id) query.model_id = filter.model_id;
        if (filter.factor_type) query.factor_type = filter.factor_type;
        
        // Aggregate to calculate time-windowed accuracy metrics
        const results = await PredictionModel.aggregate([
          { $match: query },
          { $group: {
              _id: null,
              total_predictions: { $sum: 1 },
              correct_predictions: { $sum: { $cond: ["$is_correct", 1, 0] } },
              avg_confidence: { $avg: "$confidence" }
            }
          }
        ]);
        
        if (results.length > 0) {
          const metrics = results[0];
          const accuracy = metrics.correct_predictions / metrics.total_predictions;
          windows[windowName] = {
            accuracy,
            total_predictions: metrics.total_predictions,
            correct_predictions: metrics.correct_predictions,
            avg_confidence: metrics.avg_confidence,
            start_date: windowStart,
            days: days
          };
        } else {
          windows[windowName] = {
            accuracy: 0,
            total_predictions: 0,
            correct_predictions: 0,
            avg_confidence: 0,
            start_date: windowStart,
            days: days
          };
        }
      }
      
      return windows;
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error calculating windowed accuracy: ${error.message}`);
      return {};
    }
  }

  /**
   * Initialize time-windowed metrics
   * @private
   */
  async initializeWindowedMetrics() {
    try {
      // Calculate initial values for each time window
      const windowMetrics = await this.calculateWindowedAccuracy();
      
      // Update in-memory metrics
      for (const [windowName, metrics] of Object.entries(windowMetrics)) {
        if (this.metrics.timeWindows[windowName]) {
          this.metrics.timeWindows[windowName] = {
            predictions: metrics.total_predictions,
            correct: metrics.correct_predictions,
            accuracy: metrics.accuracy || 0
          };
        }
      }
      
      logger.debug('PredictionAccuracyTracker: Time-windowed metrics initialized');
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error initializing windowed metrics: ${error.message}`);
    }
  }
  
  /**
   * Update time-windowed metrics after recording an outcome
   * @param {Object} prediction The prediction record with outcome
   * @private
   */
  async updateWindowedMetrics(prediction) {
    try {
      const predictionDate = new Date(prediction.created_at);
      const now = new Date();
      const correct = prediction.is_correct ? 1 : 0;
      
      // Update each time window if the prediction falls within it
      for (const [windowName, days] of Object.entries(this.timeWindows)) {
        const windowStart = new Date(now);
        windowStart.setDate(windowStart.getDate() - days);
        
        // Check if prediction is within this time window
        if (predictionDate >= windowStart) {
          const window = this.metrics.timeWindows[windowName];
          
          // Update window metrics
          window.predictions += 1;
          window.correct += correct;
          window.accuracy = window.predictions > 0 ? 
            window.correct / window.predictions : 0;
        }
      }
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error updating windowed metrics: ${error.message}`);
    }
  }

  /**
   * Adjust model confidence based on prediction outcome - now with time-weighting
   * @param {Object} prediction The prediction record
   * @param {Object} outcome The outcome record
   * @returns {Promise<void>}
   * @private
   */
  async adjustModelConfidence(prediction, outcome) {
    try {
      // Get the performance record for this specific model/factor combination
      const performanceKey = this.getPerformanceKey(prediction);
      
      let performanceRecord = await ModelPerformanceModel.findOne({ performance_key: performanceKey });
      
      if (!performanceRecord) {
        // Create new performance record if it doesn't exist
        performanceRecord = new ModelPerformanceModel({
          performance_key: performanceKey,
          model_type: prediction.model_type || 'custom',
          entity_type: prediction.entity_type,
          league: prediction.league,
          sport: prediction.sport,
          factor_type: prediction.factor_type,
          total_predictions: 0,
          correct_predictions: 0,
          confidence_adjustment: 1.0, // Start neutral
          weighted_accuracy: 0,
          weighted_total: 0,
          last_updated: new Date()
        });
      }

      // Calculate time-based weight for this prediction
      const timeWeight = this.enableTimeWeighting ? 
        calculateTimeWeight(prediction.created_at, {
          halflife: this.timeWeightHalflife,
          minWeight: this.timeWeightMin
        }) : 1.0;
      
      // Update performance metrics with time-weighting
      performanceRecord.total_predictions += 1;
      performanceRecord.weighted_total += timeWeight;
      
      if (prediction.is_correct) {
        performanceRecord.correct_predictions += 1;
        performanceRecord.weighted_accuracy += timeWeight;
      }

      // Calculate current accuracy - now using weighted values if enabled
      let accuracy;
      if (this.enableTimeWeighting && performanceRecord.weighted_total > 0) {
        accuracy = performanceRecord.weighted_accuracy / performanceRecord.weighted_total;
      } else {
        accuracy = performanceRecord.correct_predictions / performanceRecord.total_predictions;
      }

      // Calculate confidence error (difference between confidence and accuracy)
      const confidenceError = accuracy - prediction.original_confidence;

      // Apply adjustment with learning rate, decay, and time weight
      const adjustmentFactor = timeWeight * this.adjustmentRate;
      performanceRecord.confidence_adjustment += (confidenceError * adjustmentFactor);

      // Ensure adjustment stays within reasonable bounds (0.5 to 1.5)
      performanceRecord.confidence_adjustment = Math.max(0.5, Math.min(1.5, performanceRecord.confidence_adjustment));
      performanceRecord.last_updated = new Date();
      
      // Add time-weighted metrics to the performance record
      performanceRecord.time_weighted_enabled = this.enableTimeWeighting;
      performanceRecord.recent_accuracy = this.metrics.timeWindows.recent.accuracy;
      performanceRecord.medium_term_accuracy = this.metrics.timeWindows.medium.accuracy;
      
      // Store trending direction (improving, stable, declining)
      if (performanceRecord.recent_accuracy > performanceRecord.medium_term_accuracy + 0.05) {
        performanceRecord.trending_direction = 1; // Improving
      } else if (performanceRecord.recent_accuracy < performanceRecord.medium_term_accuracy - 0.05) {
        performanceRecord.trending_direction = -1; // Declining
      } else {
        performanceRecord.trending_direction = 0; // Stable
      }

      // Save the updated performance record
      await performanceRecord.save();

      // Update metrics
      this.metrics.totalAdjustments++;
      this.metrics.avgAccuracy = (this.metrics.avgAccuracy * (this.metrics.totalOutcomes - 1) + 
                                (prediction.is_correct ? 1 : 0)) / this.metrics.totalOutcomes;

      // Clear cache for this prediction type
      const cacheKey = this.getCacheKey(prediction);
      if (cacheKey) {
        await this.redisClient.del(`${REDIS_PREFIX}pred:${cacheKey}`);
      }

      logger.debug(`PredictionAccuracyTracker: Adjusted confidence for ${performanceKey} to ${performanceRecord.confidence_adjustment.toFixed(4)} with time weight ${timeWeight.toFixed(2)}`);
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error adjusting model confidence: ${error.message}`);
      // Don't throw - we don't want to break the outcome recording if adjustment fails
    }
  }

  /**
   * Get confidence multiplier for a prediction based on historical model performance
   * @param {Object} prediction The prediction to adjust
   * @returns {Promise<number>} Confidence multiplier
   * @private
   */
  async getPredictionConfidenceMultiplier(prediction) {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(prediction);
      if (cacheKey) {
        const cachedResult = await this.redisClient.get(`${REDIS_PREFIX}adj:${cacheKey}`);
        if (cachedResult) {
          const parsedResult = JSON.parse(cachedResult);
          // Only use cache if it's fresh (less than 6 hours old)
          if (Date.now() - parsedResult.timestamp < 6 * 60 * 60 * 1000) {
            return parsedResult.multiplier;
          }
        }
      }

      // Get from database if not in cache
      const performanceKey = this.getPerformanceKey(prediction);
      
      // Check in-memory cache first for performance
      if (this.modelsCache.has(performanceKey)) {
        return this.modelsCache.get(performanceKey);
      }
      
      // Query database
      const performanceRecord = await ModelPerformanceModel.findOne({ performance_key: performanceKey });
      
      if (!performanceRecord) {
        return 1.0; // Default neutral adjustment for new models
      }
      
      // Apply a blend of overall and recent accuracy for more adaptive adjustments
      let multiplier = performanceRecord.confidence_adjustment;
      
      // If we have recent accuracy data, blend it with the overall adjustment
      if (this.enableTimeWeighting && performanceRecord.recent_accuracy) {
        // Calculate how much recent data should influence the multiplier (0.3 = 30%)
        const recentInfluence = 0.3;
        
        // Calculate recent performance relative to expectation 
        const recentPerformanceFactor = performanceRecord.recent_accuracy / 
          (performanceRecord.medium_term_accuracy || performanceRecord.accuracy || 0.5);
            
        // Blend the stored adjustment with recent performance
        multiplier = (multiplier * (1 - recentInfluence)) + 
                     (recentPerformanceFactor * recentInfluence);
                     
        // Ensure it stays within bounds
        multiplier = Math.max(0.5, Math.min(1.5, multiplier));
      }

      // Store in cache
      if (cacheKey) {
        await this.redisClient.set(
          `${REDIS_PREFIX}adj:${cacheKey}`,
          JSON.stringify({ 
            multiplier: multiplier,
            timestamp: Date.now()
          }),
          { EX: CACHE_TTL }
        );
      }
      
      // Store in memory cache
      this.modelsCache.set(performanceKey, multiplier);
      
      return multiplier;
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error getting confidence multiplier: ${error.message}`);
      return 1.0; // Default to no adjustment on error
    }
  }

  /**
   * Run a comprehensive model calibration across all prediction types - now with time-weighted learning
   * @param {Object} options Calibration options
   * @returns {Promise<Object>} Calibration results
   */
  async runFullModelCalibration(options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    logger.info('PredictionAccuracyTracker: Starting full model calibration...');
    const startTime = Date.now();
    
    try {
      // Apply filters if specified
      const filter = {};
      if (options.league) filter.league = options.league;
      if (options.sport) filter.sport = options.sport;
      
      // Get all model performance records
      const query = {};
      if (options.league) query.league = options.league;
      if (options.sport) query.sport = options.sport;
      
      const performanceRecords = await ModelPerformanceModel.find(query);
      
      // Temporarily store results for reporting
      const calibrationResults = {
        models_calibrated: 0,
        avg_adjustment: 0,
        total_predictions_analyzed: 0,
        significant_adjustments: []
      };
      
      for (const record of performanceRecords) {
        // Get latest predictions for this model type with filters
        const predictionQuery = {
          model_type: record.model_type,
          entity_type: record.entity_type,
          league: record.league,
          sport: record.sport,
          factor_type: record.factor_type,
          status: 'completed'
        };
        
        const recentPredictions = await PredictionModel.find(predictionQuery)
          .sort({ created_at: -1 })
          .limit(1000);
        
        if (recentPredictions.length < 10) {
          // Not enough data for reliable calibration
          continue;
        }
        
        // Store previous adjustment for comparison
        const previousAdjustment = record.confidence_adjustment;
        
        // Calculate time-weighted accuracy if enabled
        let weightedCorrect = 0;
        let weightedTotal = 0;
        let unweightedCorrect = 0;
        
        for (const prediction of recentPredictions) {
          const timeWeight = this.enableTimeWeighting ? 
            calculateTimeWeight(prediction.created_at, {
              halflife: this.timeWeightHalflife,
              minWeight: this.timeWeightMin
            }) : 1.0;
          
          weightedTotal += timeWeight;
          if (prediction.is_correct) {
            weightedCorrect += timeWeight;
            unweightedCorrect++;
          }
        }
        
        // Calculate actual accuracy - weighted and unweighted
        const accuracy = unweightedCorrect / recentPredictions.length;
        const weightedAccuracy = this.enableTimeWeighting ? 
          weightedCorrect / weightedTotal : accuracy;
        
        // Calculate average confidence (original predictions, not adjusted)
        const avgConfidence = recentPredictions.reduce((sum, p) => sum + p.original_confidence, 0) / recentPredictions.length;
        
        // Calculate optimal adjustment based on time-weighted accuracy
        const optimalAdjustment = weightedAccuracy / (avgConfidence || 0.5);
        
        // Apply smoothing with existing adjustment (70% new, 30% old)
        const newAdjustment = (optimalAdjustment * 0.7) + (record.confidence_adjustment * 0.3);
        record.confidence_adjustment = Math.max(0.5, Math.min(1.5, newAdjustment));
        
        // Update time-weighted metrics
        record.weighted_accuracy = weightedCorrect;
        record.weighted_total = weightedTotal;
        record.accuracy = accuracy;
        
        // Update windowed accuracy from metrics
        record.recent_accuracy = this.metrics.timeWindows.recent.accuracy;
        record.medium_term_accuracy = this.metrics.timeWindows.medium.accuracy;
        
        // Trend analysis
        if (record.recent_accuracy > record.medium_term_accuracy + 0.05) {
          record.trending_direction = 1; // Improving
        } else if (record.recent_accuracy < record.medium_term_accuracy - 0.05) {
          record.trending_direction = -1; // Declining
        } else {
          record.trending_direction = 0; // Stable
        }
        
        // Update stats
        record.last_calibration = new Date();
        record.reliability_score = 1 - Math.abs(accuracy - avgConfidence);
        
        // Save updated record
        await record.save();
        
        // Clear cache for this model
        await this.redisClient.del(`${REDIS_PREFIX}adj:${record.performance_key}`);
        
        // Update in-memory cache
        this.modelsCache.set(record.performance_key, record.confidence_adjustment);
        
        // Update calibration results
        calibrationResults.models_calibrated++;
        calibrationResults.avg_adjustment += record.confidence_adjustment;
        calibrationResults.total_predictions_analyzed += recentPredictions.length;
        
        // Track significant adjustments (more than 5% change)
        const adjustmentChange = Math.abs(record.confidence_adjustment - previousAdjustment);
        if (adjustmentChange > 0.05) {
          calibrationResults.significant_adjustments.push({
            performance_key: record.performance_key,
            entity_type: record.entity_type,
            sport: record.sport,
            league: record.league,
            previous: previousAdjustment,
            new: record.confidence_adjustment,
            change: adjustmentChange
          });
        }
      }
      
      // Calculate average adjustment
      if (calibrationResults.models_calibrated > 0) {
        calibrationResults.avg_adjustment /= calibrationResults.models_calibrated;
      }
      
      // Update metrics
      this.metrics.latestCalibration = new Date();
      await this.saveMetrics();
      
      const duration = (Date.now() - startTime) / 1000;
      logger.info(`PredictionAccuracyTracker: Calibration complete in ${duration}s. Calibrated ${calibrationResults.models_calibrated} models.`);
      
      return {
        ...calibrationResults,
        duration_seconds: duration,
        time_weighted_enabled: this.enableTimeWeighting
      };
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Calibration failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a standardized key for storing/retrieving model performance data
   * @param {Object} prediction The prediction object
   * @returns {string} A unique key for this prediction type
   * @private
   */
  getPerformanceKey(prediction) {
    const modelType = prediction.model_type || 'custom';
    const entityType = prediction.entity_type || 'unknown';
    const league = prediction.league || 'all';
    const sport = prediction.sport || 'all';
    const factorType = prediction.factor_type || 'generic';
    
    return `${modelType}:${entityType}:${sport}:${league}:${factorType}`;
  }

  /**
   * Generate a cache key for a prediction
   * @param {Object} prediction The prediction object
   * @returns {string|null} Cache key or null if uncacheable
   * @private
   */
  getCacheKey(prediction) {
    // Only cache predictions with enough details
    if (!prediction.factor || !prediction.entity_type) {
      return null;
    }
    
    const factor = prediction.factor.toLowerCase().replace(/\s+/g, '_').substring(0, 40);
    const entityType = prediction.entity_type;
    const league = prediction.league || 'all';
    
    return `${entityType}:${league}:${factor}`;
  }

  /**
   * Load metrics from storage
   * @private
   */
  async loadMetrics() {
    try {
      const cachedMetrics = await this.redisClient.get(`${REDIS_PREFIX}metrics`);
      if (cachedMetrics) {
        this.metrics = JSON.parse(cachedMetrics);
      } else {
        // Query MongoDB for metrics if not in Redis
        const totalPredictions = await PredictionModel.countDocuments();
        const totalOutcomes = await PredictionModel.countDocuments({ status: 'completed' });
        const accuracyResult = await PredictionModel.aggregate([
          { $match: { status: 'completed' } },
          { $group: {
              _id: null,
              correct: { $sum: { $cond: ["$is_correct", 1, 0] } },
              total: { $sum: 1 }
            }
          }
        ]);
        
        let avgAccuracy = 0;
        if (accuracyResult.length > 0 && accuracyResult[0].total > 0) {
          avgAccuracy = accuracyResult[0].correct / accuracyResult[0].total;
        }
        
        this.metrics = {
          totalPredictions,
          totalOutcomes,
          totalAdjustments: await ModelPerformanceModel.countDocuments(),
          avgAccuracy,
          latestCalibration: null,
          timeWindows: {
            recent: { predictions: 0, correct: 0, accuracy: 0 },
            medium: { predictions: 0, correct: 0, accuracy: 0 },
            season: { predictions: 0, correct: 0, accuracy: 0 }
          }
        };
        
        // Cache metrics
        await this.saveMetrics();
      }
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error loading metrics: ${error.message}`);
      // Initialize with defaults if load fails
      this.metrics = {
        totalPredictions: 0,
        totalOutcomes: 0,
        totalAdjustments: 0,
        avgAccuracy: 0,
        latestCalibration: null,
        timeWindows: {
          recent: { predictions: 0, correct: 0, accuracy: 0 },
          medium: { predictions: 0, correct: 0, accuracy: 0 },
          season: { predictions: 0, correct: 0, accuracy: 0 }
        }
      };
    }
  }

  /**
   * Save metrics to Redis
   * @private
   */
  async saveMetrics() {
    try {
      await this.redisClient.set(
        `${REDIS_PREFIX}metrics`,
        JSON.stringify(this.metrics),
        { EX: 3600 } // 1 hour expiry
      );
    } catch (error) {
      logger.error(`PredictionAccuracyTracker: Error saving metrics: ${error.message}`);
    }
  }
}

module.exports = PredictionAccuracyTracker; 