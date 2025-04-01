/**
 * Factor Correlation Rebuilder
 * 
 * Enterprise-level script for rebuilding correlation matrices between prediction factors.
 * This script analyzes historical data to identify relationships between different sports factors.
 * 
 * @author Sports Analytics Platform Team
 * @version 1.0.0
 */

const FactorCorrelationEngine = require('./factor_correlation_engine');
const logger = require('./utils/logger');
require('dotenv').config();

// Command line arguments processing
const args = process.argv.slice(2);
const isForced = args.includes('--force');
const isVerbose = args.includes('--verbose');
const specificLeague = args.find(arg => arg.startsWith('--league='))?.split('=')[1];
const specificSport = args.find(arg => arg.startsWith('--sport='))?.split('=')[1];
const minDataPoints = parseInt(args.find(arg => arg.startsWith('--min-data='))?.split('=')[1] || '30');

async function rebuildCorrelations() {
  logger.info(`Starting correlation matrix rebuild${isForced ? ' (FORCED)' : ''}`);
  if (specificLeague) logger.info(`Targeting specific league: ${specificLeague}`);
  if (specificSport) logger.info(`Targeting specific sport: ${specificSport}`);
  logger.info(`Minimum data points required: ${minDataPoints}`);
  
  const startTime = Date.now();
  let engine = null;
  
  try {
    // Initialize correlation engine
    engine = new FactorCorrelationEngine({
      // Pass any custom configuration
      minDataPoints: minDataPoints
    });
    
    await engine.initialize();
    
    // Run the rebuild with options
    const rebuildResult = await engine.rebuildCorrelationMatrices({
      league: specificLeague,
      sport: specificSport,
      verbose: isVerbose,
      force: isForced
    });
    
    // Log results
    const runtime = (Date.now() - startTime) / 1000;
    
    logger.info("=== Correlation Matrix Rebuild Complete ===");
    logger.info(`Factors analyzed: ${rebuildResult.total_factors}`);
    logger.info(`Correlations calculated: ${rebuildResult.total_correlations}`);
    logger.info(`Updated correlations: ${rebuildResult.updated_correlations}`);
    logger.info(`New correlations: ${rebuildResult.new_correlations}`);
    logger.info(`Leagues analyzed: ${rebuildResult.leagues_analyzed}`);
    logger.info(`Sports analyzed: ${rebuildResult.sports_analyzed}`);
    logger.info(`Runtime: ${runtime.toFixed(2)} seconds`);
    
    // Write results to status file for monitoring
    const fs = require('fs');
    const path = require('path');
    const statusDir = process.env.STATUS_DIR || 'status';
    
    // Ensure status directory exists
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }
    
    // Write correlation rebuild status to file
    const statusFile = path.join(statusDir, 'last_correlation_rebuild.json');
    fs.writeFileSync(
      statusFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        duration_seconds: runtime,
        ...rebuildResult
      }, null, 2)
    );
    
    logger.info(`Status written to ${statusFile}`);
    
    // If we have significant correlations, log them
    if (isVerbose && rebuildResult.top_correlations && rebuildResult.top_correlations.length > 0) {
      logger.info("\nTop factor correlations:");
      
      for (const corr of rebuildResult.top_correlations) {
        logger.info(`  ${corr.factor_a} <-> ${corr.factor_b}:`);
        logger.info(`    Correlation: ${corr.coefficient.toFixed(4)}`);
        logger.info(`    Data points: ${corr.data_points}`);
        logger.info(`    Sport/League: ${corr.sport}/${corr.league}`);
      }
    }
    
    return {
      success: true,
      ...rebuildResult
    };
  } catch (error) {
    logger.error(`Correlation rebuild failed: ${error.message}`);
    logger.error(error.stack);
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Ensure we clean up
    if (engine) {
      await engine.shutdown();
    }
  }
}

// Run if called directly
if (require.main === module) {
  rebuildCorrelations()
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

module.exports = { rebuildCorrelations }; 