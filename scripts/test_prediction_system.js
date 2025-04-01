/**
 * Prediction System Test
 * 
 * Comprehensive test script for the enhanced prediction system including
 * accuracy tracking and factor correlation analysis.
 * 
 * @author Sports Analytics Platform Team
 * @version 1.0.0
 */

const PredictionAccuracyTracker = require('./prediction_accuracy_tracker');
const FactorCorrelationEngine = require('./factor_correlation_engine');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
require('dotenv').config();

// Test factors
const TEST_FACTORS = [
  {
    factor: "LeBron James scores more than 25 points",
    probability: 0.72,
    confidence: 0.85,
    league: "NBA",
    sport: "Basketball",
    entity_type: "player"
  },
  {
    factor: "Lakers win against the Warriors",
    probability: 0.58,
    confidence: 0.79,
    league: "NBA",
    sport: "Basketball",
    entity_type: "team"
  },
  {
    factor: "Lakers and Warriors combine for over 220 points",
    probability: 0.65,
    confidence: 0.83,
    league: "NBA",
    sport: "Basketball", 
    entity_type: "match"
  },
  {
    factor: "Chiefs beat the spread against the Raiders",
    probability: 0.63,
    confidence: 0.81,
    league: "NFL",
    sport: "American Football",
    entity_type: "team"
  },
  {
    factor: "Patrick Mahomes throws for 300+ yards",
    probability: 0.67,
    confidence: 0.84,
    league: "NFL",
    sport: "American Football",
    entity_type: "player"
  }
];

// Helper to generate random outcomes
function generateRandomOutcome(probability) {
  return Math.random() < probability;
}

// Main test function
async function runTests() {
  logger.info("Starting comprehensive prediction system test");
  
  try {
    // Initialize systems
    const accuracyTracker = new PredictionAccuracyTracker();
    const correlationEngine = new FactorCorrelationEngine();
    
    await accuracyTracker.initialize();
    await correlationEngine.initialize();
    
    logger.info("Systems initialized successfully");
    
    // 1. Test accuracy tracking
    logger.info("\n=== TESTING PREDICTION ACCURACY TRACKING ===");
    
    // Generate some predictions with tracking IDs
    const trackedPredictions = [];
    
    for (const testFactor of TEST_FACTORS) {
      logger.info(`Tracking prediction: "${testFactor.factor}"`);
      
      const trackedPrediction = await accuracyTracker.trackPrediction(testFactor);
      trackedPredictions.push(trackedPrediction);
      
      logger.info(`  Original confidence: ${testFactor.confidence.toFixed(2)}`);
      logger.info(`  Adjusted confidence: ${trackedPrediction.confidence.toFixed(2)}`);
      logger.info(`  Tracking ID: ${trackedPrediction.tracking_id}`);
    }
    
    // Record outcomes for the predictions
    logger.info("\n--- Recording Outcomes ---");
    
    for (const prediction of trackedPredictions) {
      // Generate a random outcome based on the predicted probability
      const isCorrect = generateRandomOutcome(prediction.probability);
      
      logger.info(`Recording outcome for "${prediction.factor}": ${isCorrect ? 'Correct' : 'Incorrect'}`);
      
      await accuracyTracker.recordOutcome({
        tracking_id: prediction.tracking_id,
        actual_result: isCorrect,
        details: {
          verification_source: 'system_test',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Calculate accuracy metrics
    logger.info("\n--- Accuracy Metrics ---");
    
    const nbaMetrics = await accuracyTracker.calculateAccuracy({
      league: "NBA"
    });
    
    logger.info(`NBA prediction accuracy: ${(nbaMetrics.accuracy * 100).toFixed(1)}%`);
    logger.info(`Total NBA predictions: ${nbaMetrics.total_predictions}`);
    logger.info(`Confidence calibration: ${(nbaMetrics.confidence_calibration * 100).toFixed(1)}%`);
    
    // 2. Test correlation engine
    logger.info("\n=== TESTING FACTOR CORRELATION ENGINE ===");
    
    // Build correlation matrix for NBA factors
    const nbaFactors = TEST_FACTORS.filter(f => f.league === "NBA").map(f => f.factor);
    
    logger.info(`Building correlation matrix for ${nbaFactors.length} NBA factors`);
    
    const correlationMatrix = await correlationEngine.getCorrelationMatrix(nbaFactors, {
      league: "NBA",
      sport: "Basketball",
      calculateIfMissing: true
    });
    
    logger.info("Correlation matrix generated:");
    logger.info(`  Dimensions: ${correlationMatrix.dimensions}x${correlationMatrix.dimensions}`);
    logger.info(`  Data quality: ${(correlationMatrix.dataQuality * 100).toFixed(1)}%`);
    
    // Log the actual matrix
    logger.info("  Matrix values:");
    for (let i = 0; i < correlationMatrix.matrix.length; i++) {
      const row = correlationMatrix.matrix[i].map(v => v.toFixed(2)).join(", ");
      logger.info(`    [${row}]`);
    }
    
    // 3. Test multi-factor probability calculation
    logger.info("\n=== TESTING MULTI-FACTOR PREDICTION ===");
    
    // Select the NBA factors
    const nbaFactorPredictions = TEST_FACTORS.filter(f => f.league === "NBA");
    
    logger.info(`Calculating joint probability for ${nbaFactorPredictions.length} NBA factors:`);
    for (const factor of nbaFactorPredictions) {
      logger.info(`  "${factor.factor}" - probability: ${(factor.probability * 100).toFixed(1)}%`);
    }
    
    const multiFactorResult = await correlationEngine.calculateMultiFactorProbability(
      nbaFactorPredictions,
      { league: "NBA", sport: "Basketball" }
    );
    
    logger.info("\nMulti-factor prediction results:");
    logger.info(`  Joint probability: ${(multiFactorResult.joint_probability * 100).toFixed(1)}%`);
    logger.info(`  Joint confidence: ${(multiFactorResult.joint_confidence * 100).toFixed(1)}%`);
    logger.info(`  Calculation method: ${multiFactorResult.calculation_method}`);
    
    // Log insights if any
    if (multiFactorResult.insights && multiFactorResult.insights.length > 0) {
      logger.info("\nCorrelation insights:");
      for (const insight of multiFactorResult.insights) {
        logger.info(`  ${insight.description}`);
        logger.info(`  Correlation: ${insight.correlation.toFixed(2)} between:`);
        logger.info(`    - "${insight.factor1}"`);
        logger.info(`    - "${insight.factor2}"`);
      }
    }
    
    // 4. Test model calibration
    logger.info("\n=== TESTING MODEL CALIBRATION ===");
    
    logger.info("Running model calibration...");
    const calibrationResult = await accuracyTracker.runFullModelCalibration();
    
    logger.info("Calibration complete:");
    logger.info(`  Models calibrated: ${calibrationResult.models_calibrated}`);
    logger.info(`  Average adjustment: ${calibrationResult.avg_adjustment.toFixed(3)}`);
    logger.info(`  Predictions analyzed: ${calibrationResult.total_predictions_analyzed}`);
    logger.info(`  Runtime: ${(calibrationResult.duration_seconds).toFixed(2)} seconds`);
    
    // 5. Cleanup
    logger.info("\n=== CLEANING UP ===");
    await accuracyTracker.shutdown();
    await correlationEngine.shutdown();
    
    logger.info("Test completed successfully.");
    
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    logger.error(error.stack);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 