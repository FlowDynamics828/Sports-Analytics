/**
 * prediction_accuracy_validator.js
 * 
 * Enterprise-grade validation system for the prediction engine.
 * Tests prediction accuracy against historical outcomes with comprehensive metrics.
 */
const mongoose = require('mongoose');
const AdvancedCorrelationAPI = require('./advanced_correlation_api');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const logger = require('./utils/logger');
require('dotenv').config();

class PredictionAccuracyValidator {
  constructor(options = {}) {
    this.mongoUri = options.mongoUri || process.env.MONGO_URI || "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority";
    this.dbName = options.dbName || process.env.MONGO_DB_NAME || "SportsAnalytics";
    this.outputDir = options.outputDir || path.join(__dirname, '../validation_results');
    this.batchSize = options.batchSize || 50; // Process in batches to handle large datasets
    this.correlationAPI = null;
    this.isInitialized = false;
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Initialize the validator
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info("Initializing Prediction Accuracy Validator");
    
    try {
      // Connect to MongoDB
      await mongoose.connect(this.mongoUri, {
        dbName: this.dbName,
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      logger.info("Connected to MongoDB database");
      
      // Initialize Correlation API
      this.correlationAPI = new AdvancedCorrelationAPI();
      await this.correlationAPI.initialize();
      
      logger.info("Correlation API initialized");
      this.isInitialized = true;
    } catch (error) {
      logger.error(`Initialization failed: ${error.message}`);
      throw new Error(`Failed to initialize validator: ${error.message}`);
    }
  }

  /**
   * Run validation on historical predictions
   * @param {Object} options - Validation options
   * @returns {Object} Validation results
   */
  async runValidation(options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const startTime = performance.now();
    logger.info("Starting prediction accuracy validation");
    
    // Set default options
    const validationOptions = {
      startDate: options.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      endDate: options.endDate || new Date(),
      leagues: options.leagues || [], // Empty array means all leagues
      minSampleSize: options.minSampleSize || 10,
      testSampleSize: options.testSampleSize || 1000, // Max test cases to process
      ...options
    };
    
    logger.info(`Validation period: ${validationOptions.startDate.toISOString()} to ${validationOptions.endDate.toISOString()}`);
    
    try {
      // Load test cases
      const testCases = await this.loadHistoricalTestCases(validationOptions);
      
      if (testCases.length === 0) {
        logger.warn("No historical test cases found for the specified criteria");
        return {
          error: "No test cases found",
          options: validationOptions
        };
      }
      
      logger.info(`Loaded ${testCases.length} historical test cases`);
      
      // Initialize results structure
      const results = this.initializeResultsStructure();
      
      // Process test cases in batches
      const totalBatches = Math.ceil(testCases.length / this.batchSize);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * this.batchSize;
        const batchEnd = Math.min((batchIndex + 1) * this.batchSize, testCases.length);
        const batch = testCases.slice(batchStart, batchEnd);
        
        logger.info(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} cases)`);
        
        // Process each test case in the batch
        for (const testCase of batch) {
          await this.processTestCase(testCase, results);
        }
        
        // Log progress
        logger.info(`Completed ${Math.min((batchIndex + 1) * this.batchSize, testCases.length)}/${testCases.length} test cases`);
      }
      
      // Calculate final metrics
      this.calculateFinalMetrics(results);
      
      // Save results
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const resultsFile = path.join(this.outputDir, `validation_results_${timestamp}.json`);
      
      fs.writeFileSync(
        resultsFile,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          options: validationOptions,
          results,
          executionTimeMs: performance.now() - startTime
        }, null, 2)
      );
      
      logger.info(`Validation completed in ${((performance.now() - startTime) / 1000).toFixed(2)} seconds`);
      logger.info(`Results saved to ${resultsFile}`);
      
      return {
        totalCases: testCases.length,
        overallAccuracy: results.overallAccuracy,
        brier: results.brierScore,
        calibration: results.calibrationScore,
        resultsFile
      };
    } catch (error) {
      logger.error(`Validation failed: ${error.message}`);
      logger.error(error.stack);
      throw new Error(`Validation failed: ${error.message}`);
    } finally {
      // Cleanup if needed
    }
  }

  /**
   * Load historical test cases from database
   * @param {Object} options - Loading options
   * @returns {Array} Test cases
   */
  async loadHistoricalTestCases(options) {
    const query = {
      timestamp: {
        $gte: options.startDate,
        $lte: options.endDate
      },
      outcome: { $in: [true, false] } // Only get cases with known outcomes
    };
    
    // Add league filter if specified
    if (options.leagues && options.leagues.length > 0) {
      query.league = { $in: options.leagues };
    }
    
    // Find cases in historical predictions collection
    const collection = mongoose.connection.collection('historical_predictions');
    
    // Use limit to avoid overwhelming memory with huge datasets
    const testCases = await collection.find(query)
      .sort({ timestamp: -1 })
      .limit(options.testSampleSize)
      .toArray();
    
    return testCases.map(doc => ({
      id: doc._id.toString(),
      factors: doc.factors,
      league: doc.league,
      outcome: doc.outcome,
      timestamp: doc.timestamp,
      originalPrediction: doc.prediction || null
    }));
  }

  /**
   * Initialize results data structure
   * @returns {Object} Empty results structure
   */
  initializeResultsStructure() {
    return {
      totalCases: 0,
      correctPredictions: 0,
      incorrectPredictions: 0,
      sumSquaredError: 0, // For Brier score calculation
      accuracyByLeague: {},
      accuracyByFactorCount: {},
      calibrationBins: Array(10).fill(0).map(() => ({ 
        count: 0, 
        correct: 0,
        expectedProbability: 0,
        observedFrequency: 0
      })),
      leaguePerformance: {},
      timePerformance: {
        last7Days: { total: 0, correct: 0 },
        last30Days: { total: 0, correct: 0 },
        older: { total: 0, correct: 0 }
      },
      confusionMatrix: {
        truePositives: 0,
        falsePositives: 0,
        trueNegatives: 0,
        falseNegatives: 0
      },
      executionTimes: []
    };
  }

  /**
   * Process a single test case
   * @param {Object} testCase - Test case to process
   * @param {Object} results - Results object to update
   */
  async processTestCase(testCase, results) {
    const executionStart = performance.now();
    
    try {
      // Make prediction using our model
      const prediction = await this.correlationAPI.predictMultiFactorProbability(
        testCase.factors,
        { 
          includeAnalysis: false,
          league: testCase.league
        }
      );
      
      const executionTime = performance.now() - executionStart;
      results.executionTimes.push(executionTime);
      
      // Update total count
      results.totalCases++;
      
      // Determine if prediction was correct (threshold at 0.5)
      const predictedOutcome = prediction.probability > 0.5;
      const actualOutcome = testCase.outcome;
      const isCorrect = predictedOutcome === actualOutcome;
      
      // Update basic stats
      if (isCorrect) {
        results.correctPredictions++;
      } else {
        results.incorrectPredictions++;
      }
      
      // Update squared error for Brier score
      const error = prediction.probability - (actualOutcome ? 1 : 0);
      results.sumSquaredError += error * error;
      
      // Update confusion matrix
      if (actualOutcome && predictedOutcome) {
        results.confusionMatrix.truePositives++;
      } else if (!actualOutcome && predictedOutcome) {
        results.confusionMatrix.falsePositives++;
      } else if (!actualOutcome && !predictedOutcome) {
        results.confusionMatrix.trueNegatives++;
      } else if (actualOutcome && !predictedOutcome) {
        results.confusionMatrix.falseNegatives++;
      }
      
      // Update by league
      const league = testCase.league || 'unknown';
      if (!results.accuracyByLeague[league]) {
        results.accuracyByLeague[league] = { total: 0, correct: 0 };
      }
      results.accuracyByLeague[league].total++;
      if (isCorrect) results.accuracyByLeague[league].correct++;
      
      // Update by factor count
      const factorCount = testCase.factors.length;
      if (!results.accuracyByFactorCount[factorCount]) {
        results.accuracyByFactorCount[factorCount] = { total: 0, correct: 0 };
      }
      results.accuracyByFactorCount[factorCount].total++;
      if (isCorrect) results.accuracyByFactorCount[factorCount].correct++;
      
      // Update calibration bins
      const binIndex = Math.min(9, Math.floor(prediction.probability * 10));
      results.calibrationBins[binIndex].count++;
      if (actualOutcome) results.calibrationBins[binIndex].correct++;
      
      // Update by time period
      const now = new Date();
      const caseDate = new Date(testCase.timestamp);
      const daysDiff = Math.floor((now - caseDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff <= 7) {
        results.timePerformance.last7Days.total++;
        if (isCorrect) results.timePerformance.last7Days.correct++;
      } else if (daysDiff <= 30) {
        results.timePerformance.last30Days.total++;
        if (isCorrect) results.timePerformance.last30Days.correct++;
      } else {
        results.timePerformance.older.total++;
        if (isCorrect) results.timePerformance.older.correct++;
      }
      
      // Compare against original prediction if available
      if (testCase.originalPrediction !== null) {
        // Track model improvement over time
        const league = testCase.league || 'unknown';
        if (!results.leaguePerformance[league]) {
          results.leaguePerformance[league] = { 
            originalCorrect: 0, 
            currentCorrect: 0, 
            total: 0 
          };
        }
        
        results.leaguePerformance[league].total++;
        
        const originalPredictedOutcome = testCase.originalPrediction > 0.5;
        if (originalPredictedOutcome === actualOutcome) {
          results.leaguePerformance[league].originalCorrect++;
        }
        
        if (isCorrect) {
          results.leaguePerformance[league].currentCorrect++;
        }
      }
      
    } catch (error) {
      logger.error(`Error processing test case ${testCase.id}: ${error.message}`);
      // Continue processing other test cases
    }
  }

  /**
   * Calculate final metrics based on raw results
   * @param {Object} results - Results to update with calculated metrics
   */
  calculateFinalMetrics(results) {
    // Overall accuracy
    results.overallAccuracy = results.correctPredictions / results.totalCases;
    
    // Brier score (lower is better, 0 is perfect)
    results.brierScore = results.sumSquaredError / results.totalCases;
    
    // Accuracy by league
    for (const league in results.accuracyByLeague) {
      const leagueStats = results.accuracyByLeague[league];
      leagueStats.accuracy = leagueStats.correct / leagueStats.total;
    }
    
    // Accuracy by factor count
    for (const count in results.accuracyByFactorCount) {
      const countStats = results.accuracyByFactorCount[count];
      countStats.accuracy = countStats.correct / countStats.total;
    }
    
    // Calculate calibration metrics
    let calibrationError = 0;
    for (const bin of results.calibrationBins) {
      if (bin.count > 0) {
        bin.observedFrequency = bin.correct / bin.count;
        bin.expectedProbability = (parseInt(results.calibrationBins.indexOf(bin)) + 0.5) / 10;
        
        // Add to calibration error
        calibrationError += Math.abs(bin.observedFrequency - bin.expectedProbability) * (bin.count / results.totalCases);
      }
    }
    results.calibrationScore = 1 - calibrationError;
    
    // Precision, recall, F1 score
    const { truePositives, falsePositives, trueNegatives, falseNegatives } = results.confusionMatrix;
    
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    
    results.precisionRecallMetrics = {
      precision,
      recall,
      f1Score,
      specificity: trueNegatives / (trueNegatives + falsePositives) || 0
    };
    
    // Performance by time period
    for (const period in results.timePerformance) {
      const stats = results.timePerformance[period];
      stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    }
    
    // Model improvement over time
    for (const league in results.leaguePerformance) {
      const stats = results.leaguePerformance[league];
      stats.originalAccuracy = stats.total > 0 ? stats.originalCorrect / stats.total : 0;
      stats.currentAccuracy = stats.total > 0 ? stats.currentCorrect / stats.total : 0;
      stats.improvement = stats.currentAccuracy - stats.originalAccuracy;
    }
    
    // Performance metrics
    const executionTimes = results.executionTimes;
    results.performanceMetrics = {
      avgExecutionTimeMs: executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length,
      minExecutionTimeMs: Math.min(...executionTimes),
      maxExecutionTimeMs: Math.max(...executionTimes),
      p95ExecutionTimeMs: this.percentile(executionTimes, 95),
      p99ExecutionTimeMs: this.percentile(executionTimes, 99)
    };
  }

  /**
   * Calculate percentile value from an array
   * @param {Array} array - Input array
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} - Percentile value
   */
  percentile(array, percentile) {
    if (array.length === 0) return 0;
    array.sort((a, b) => a - b);
    const index = Math.ceil(array.length * percentile / 100) - 1;
    return array[index];
  }

  /**
   * Generate a human-readable report from validation results
   * @param {Object} results - Validation results
   * @returns {string} Formatted report
   */
  generateReport(results) {
    const report = [];
    
    report.push("# Prediction Model Validation Report");
    report.push(`Generated: ${new Date().toISOString()}\n`);
    
    report.push("## Overall Performance");
    report.push(`- Total test cases: ${results.totalCases}`);
    report.push(`- Accuracy: ${(results.overallAccuracy * 100).toFixed(2)}%`);
    report.push(`- Brier score: ${results.brierScore.toFixed(4)} (lower is better)`);
    report.push(`- Calibration score: ${(results.calibrationScore * 100).toFixed(2)}%`);
    report.push(`- F1 score: ${(results.precisionRecallMetrics.f1Score * 100).toFixed(2)}%`);
    
    report.push("\n## Performance by League");
    for (const [league, stats] of Object.entries(results.accuracyByLeague).sort((a, b) => b[1].total - a[1].total)) {
      report.push(`- ${league}: ${(stats.accuracy * 100).toFixed(2)}% (${stats.correct}/${stats.total} correct)`);
    }
    
    report.push("\n## Performance by Factor Count");
    for (const [count, stats] of Object.entries(results.accuracyByFactorCount).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
      report.push(`- ${count} factors: ${(stats.accuracy * 100).toFixed(2)}% (${stats.correct}/${stats.total} correct)`);
    }
    
    report.push("\n## Model Improvement Over Time");
    for (const [league, stats] of Object.entries(results.leaguePerformance).sort((a, b) => b[1].improvement - a[1].improvement)) {
      const improvementStr = stats.improvement >= 0 
        ? `+${(stats.improvement * 100).toFixed(2)}%` 
        : `${(stats.improvement * 100).toFixed(2)}%`;
      report.push(`- ${league}: ${improvementStr} improvement (${(stats.currentAccuracy * 100).toFixed(2)}% vs ${(stats.originalAccuracy * 100).toFixed(2)}%)`);
    }
    
    report.push("\n## Performance Metrics");
    report.push(`- Average execution time: ${results.performanceMetrics.avgExecutionTimeMs.toFixed(2)}ms`);
    report.push(`- 95th percentile: ${results.performanceMetrics.p95ExecutionTimeMs.toFixed(2)}ms`);
    report.push(`- 99th percentile: ${results.performanceMetrics.p99ExecutionTimeMs.toFixed(2)}ms`);
    
    return report.join('\n');
  }

  /**
   * Shutdown the validator and cleanup resources
   */
  async shutdown() {
    logger.info("Shutting down Prediction Accuracy Validator");
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info("MongoDB connection closed");
    }
    
    this.isInitialized = false;
  }
}

// Export the validator
module.exports = PredictionAccuracyValidator;

// Run validation if called directly
if (require.main === module) {
  const validator = new PredictionAccuracyValidator();
  
  validator.runValidation()
    .then(results => {
      logger.info(`Validation complete. Overall accuracy: ${(results.overallAccuracy * 100).toFixed(2)}%`);
      process.exit(0);
    })
    .catch(err => {
      logger.error("Validation failed:", err);
      process.exit(1);
    });
} 