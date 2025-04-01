/**
 * Model Calibration Runner
 * 
 * Enterprise-level script for scheduled calibration of prediction models.
 * This script is designed to run as a cron job to maintain optimal prediction accuracy.
 * 
 * @author Sports Analytics Platform Team
 * @version 1.0.0
 */

const PredictionAccuracyTracker = require('./prediction_accuracy_tracker');
const logger = require('./utils/logger');
require('dotenv').config();

// Command line arguments processing
const args = process.argv.slice(2);
const isForced = args.includes('--force');
const isVerbose = args.includes('--verbose');
const specificLeague = args.find(arg => arg.startsWith('--league='))?.split('=')[1];
const specificSport = args.find(arg => arg.startsWith('--sport='))?.split('=')[1];

async function runCalibration() {
  logger.info(`Starting model calibration${isForced ? ' (FORCED)' : ''}`);
  if (specificLeague) logger.info(`Targeting specific league: ${specificLeague}`);
  if (specificSport) logger.info(`Targeting specific sport: ${specificSport}`);
  
  const startTime = Date.now();
  let tracker = null;
  
  try {
    // Initialize prediction accuracy tracker
    tracker = new PredictionAccuracyTracker({
      // Pass any custom configuration
      adjustmentRate: process.env.CONFIDENCE_ADJUSTMENT_RATE || 0.05,
      recalibrationThreshold: isForced ? 0 : (process.env.RECALIBRATION_THRESHOLD || 100)
    });
    
    await tracker.initialize();
    
    // Run the calibration
    const calibrationResult = await tracker.runFullModelCalibration({
      league: specificLeague,
      sport: specificSport,
      verbose: isVerbose
    });
    
    // Log results
    const runtime = (Date.now() - startTime) / 1000;
    
    logger.info("=== Model Calibration Complete ===");
    logger.info(`Models calibrated: ${calibrationResult.models_calibrated}`);
    logger.info(`Average adjustment factor: ${calibrationResult.avg_adjustment.toFixed(4)}`);
    logger.info(`Total predictions analyzed: ${calibrationResult.total_predictions_analyzed}`);
    logger.info(`Runtime: ${runtime.toFixed(2)} seconds`);
    
    // If any models had significant adjustments, log them
    if (calibrationResult.significant_adjustments && calibrationResult.significant_adjustments.length > 0) {
      logger.info("\nSignificant model adjustments:");
      
      for (const adjustment of calibrationResult.significant_adjustments) {
        logger.info(`  ${adjustment.performance_key}:`);
        logger.info(`    Previous adjustment: ${adjustment.previous.toFixed(4)}`);
        logger.info(`    New adjustment: ${adjustment.new.toFixed(4)}`);
        logger.info(`    Change: ${((adjustment.new - adjustment.previous) * 100).toFixed(1)}%`);
      }
    }
    
    // Write results to status file for monitoring
    const fs = require('fs');
    const path = require('path');
    const statusDir = process.env.STATUS_DIR || 'status';
    
    // Ensure status directory exists
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }
    
    // Write calibration status to file
    const statusFile = path.join(statusDir, 'last_calibration.json');
    fs.writeFileSync(
      statusFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        duration_seconds: runtime,
        ...calibrationResult
      }, null, 2)
    );
    
    logger.info(`Status written to ${statusFile}`);
    
    return {
      success: true,
      ...calibrationResult
    };
  } catch (error) {
    logger.error(`Model calibration failed: ${error.message}`);
    logger.error(error.stack);
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Ensure we clean up
    if (tracker) {
      await tracker.shutdown();
    }
  }
}

// Run if called directly
if (require.main === module) {
  runCalibration()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(err => {
      logger.error(`Unhandled error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { runCalibration }; 