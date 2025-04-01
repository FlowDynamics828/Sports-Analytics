/**
 * Test script for revolutionary sports analytics features
 * 
 * This script loads and tests each of our revolutionary features without starting the full server
 */

// Import revolutionary engines
const { getPredictionEngine } = require('./utils/prediction-engine');
const { getPlayerImpactEngine } = require('./utils/player-impact');
const { getNarrativeEngine } = require('./utils/narrative-analytics');

// Test function to verify all features
async function testRevolutionaryFeatures() {
  console.log('💡 Starting test of revolutionary sports analytics features...');
  console.log('===============================================================');

  try {
    // Test Prediction Engine
    console.log('\n🔮 Testing Multi-Factor Prediction System');
    console.log('----------------------------------------');
    const predictionEngine = getPredictionEngine({
      // Use short interval for testing
      updateInterval: 5000,
      // Reduce factors for testing
      factorWeights: {
        headToHead: 0.35,
        recentForm: 0.30,
        homeAdvantage: 0.20,
        momentum: 0.15
      }
    });
    
    predictionEngine.on('predictions-updated', (predictions) => {
      const predictionCount = Object.values(predictions).reduce((sum, leaguePreds) => sum + leaguePreds.length, 0);
      console.log(`✅ Prediction Engine updated ${predictionCount} predictions across ${Object.keys(predictions).length} leagues`);
      
      // Show a sample prediction if available
      if (predictionCount > 0) {
        const sampleLeague = Object.keys(predictions)[0];
        const samplePrediction = predictions[sampleLeague][0];
        console.log(`\n📊 Sample Prediction: ${samplePrediction.homeTeam.name} vs ${samplePrediction.awayTeam.name}`);
        console.log(`   Home Win: ${(samplePrediction.probabilities.homeWin * 100).toFixed(1)}%`);
        console.log(`   Draw: ${(samplePrediction.probabilities.draw * 100).toFixed(1)}%`);
        console.log(`   Away Win: ${(samplePrediction.probabilities.awayWin * 100).toFixed(1)}%`);
        console.log(`   Confidence: ${(samplePrediction.metrics.confidence * 100).toFixed(1)}%`);
        console.log(`   Upset Potential: ${(samplePrediction.metrics.upsetPotential * 100).toFixed(1)}%`);
        console.log(`   Key Insight: ${samplePrediction.insights[0]}`);
      }
    });
    
    // Start the prediction engine
    await predictionEngine.start();
    console.log('✅ Prediction Engine started successfully');
    
    // Test Player Impact
    console.log('\n🏆 Testing Player Impact Modeling');
    console.log('----------------------------------');
    const playerImpactEngine = getPlayerImpactEngine({
      // Use short interval for testing
      updateInterval: 5000
    });
    
    playerImpactEngine.on('impacts-updated', (impacts) => {
      console.log(`✅ Player Impact Engine calculated metrics for ${impacts.length} players`);
      
      // Show a sample player impact if available
      if (impacts.length > 0) {
        const sampleImpact = impacts[0];
        console.log(`\n👤 Sample Player Impact: ${sampleImpact.playerName}`);
        console.log(`   Win Probability Added: ${(sampleImpact.metrics.winProbabilityAdded * 100).toFixed(1)}%`);
        console.log(`   Clutch Performance: ${(sampleImpact.metrics.clutchPerformance * 100).toFixed(1)}%`);
        console.log(`   Team Compatibility: ${(sampleImpact.metrics.teamCompatibility * 100).toFixed(1)}%`);
        console.log(`   Overall Impact: ${(sampleImpact.metrics.overallImpact * 100).toFixed(1)}%`);
        console.log(`   Key Insight: ${sampleImpact.insights[0]}`);
      }
    });
    
    // Start the player impact engine
    await playerImpactEngine.start();
    console.log('✅ Player Impact Engine started successfully');
    
    // Test Narrative Analytics
    console.log('\n📝 Testing Narrative-Driven Analytics');
    console.log('-------------------------------------');
    const narrativeEngine = getNarrativeEngine({
      // Use short interval for testing
      updateInterval: 5000
    });
    
    narrativeEngine.on('narratives-updated', (narratives) => {
      console.log(`✅ Narrative Engine generated ${narratives.length} match narratives`);
      
      // Show a sample narrative if available
      if (narratives.length > 0) {
        const sampleNarrative = narratives[0];
        console.log(`\n📊 Sample Narrative: ${sampleNarrative.title}`);
        console.log(`   Main Storyline: ${sampleNarrative.storylines.main}`);
        console.log(`   Key Matchup: ${sampleNarrative.storylines.keyMatchups[0]}`);
        console.log(`   Upset Potential: ${(sampleNarrative.metrics.upsetPotential * 100).toFixed(1)}%`);
        console.log(`   Game-Changing Factor: ${sampleNarrative.metrics.gameChangingFactors[0].name} (Importance: ${(sampleNarrative.metrics.gameChangingFactors[0].importance * 100).toFixed(1)}%)`);
      }
    });
    
    // Start the narrative engine
    await narrativeEngine.start();
    console.log('✅ Narrative Engine started successfully');
    
    // Keep script running for 30 seconds to observe updates
    console.log('\n⏱️ Waiting for updates (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Graceful shutdown
    console.log('\n🛑 Shutting down engines...');
    await predictionEngine.stop();
    await playerImpactEngine.stop();
    await narrativeEngine.stop();
    
    console.log('\n✅ All revolutionary features tested successfully!');
    
  } catch (error) {
    console.error('❌ Error testing revolutionary features:', error);
  }
}

// Run the test
testRevolutionaryFeatures().then(() => {
  console.log('Test completed.');
}).catch(error => {
  console.error('Test failed with error:', error);
}); 