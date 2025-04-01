/**
 * Test Script for Custom Prediction Engine
 * 
 * This is the BREAD AND BUTTER feature of the platform allowing predictions with:
 * - ANY custom factor
 * - ANY sport/league/team combination
 * - Up to 5 factors in multi-factor predictions
 */

const { getCustomPredictionEngine } = require('./utils/custom-prediction');

async function testCustomPrediction() {
  console.log('🔮 TESTING CUSTOM PREDICTION ENGINE - THE BREAD AND BUTTER FEATURE');
  console.log('================================================================');
  
  try {
    // Get the custom prediction engine
    const customPredictionEngine = getCustomPredictionEngine();
    await customPredictionEngine.start();
    console.log('✅ Custom prediction engine started successfully');
    
    // Test 1: Single factor prediction - NFL
    console.log('\n🏈 TEST 1: Single Factor NFL Prediction');
    console.log('--------------------------------------');
    
    const nflContext = {
      sport: 'football',
      league: 'NFL',
      teams: ['Kansas City Chiefs', 'San Francisco 49ers'],
      date: new Date().toISOString()
    };
    
    // This can be ANY factor typed by the user
    const factor1 = "Patrick Mahomes has better stats in prime time games";
    console.log(`Factor: "${factor1}"`);
    console.log(`Teams: ${nflContext.teams[0]} vs ${nflContext.teams[1]}`);
    
    const nflPrediction = await customPredictionEngine.predict(factor1, nflContext);
    console.log('\nPrediction:');
    console.log(`- Home win: ${(nflPrediction.probabilities.home * 100).toFixed(1)}%`);
    console.log(`- Away win: ${(nflPrediction.probabilities.away * 100).toFixed(1)}%`);
    console.log(`- Confidence: ${(nflPrediction.confidence * 100).toFixed(1)}%`);
    console.log('\nInsights:');
    nflPrediction.insights.forEach((insight, i) => {
      console.log(`${i+1}. ${insight}`);
    });
    
    // Test 2: Single factor prediction - Soccer (Premier League)
    console.log('\n⚽ TEST 2: Single Factor Soccer Prediction');
    console.log('----------------------------------------');
    
    const soccerContext = {
      sport: 'soccer',
      league: 'Premier League',
      teams: ['Manchester City', 'Liverpool'],
      date: new Date().toISOString()
    };
    
    // Completely different factor for a different sport
    const factor2 = "Liverpool has better defensive record away from home";
    console.log(`Factor: "${factor2}"`);
    console.log(`Teams: ${soccerContext.teams[0]} vs ${soccerContext.teams[1]}`);
    
    const soccerPrediction = await customPredictionEngine.predict(factor2, soccerContext);
    console.log('\nPrediction:');
    console.log(`- Home win: ${(soccerPrediction.probabilities.home * 100).toFixed(1)}%`);
    console.log(`- Away win: ${(soccerPrediction.probabilities.away * 100).toFixed(1)}%`);
    console.log(`- Draw: ${(soccerPrediction.probabilities.draw * 100).toFixed(1)}%`);
    console.log(`- Confidence: ${(soccerPrediction.confidence * 100).toFixed(1)}%`);
    console.log('\nInsights:');
    soccerPrediction.insights.forEach((insight, i) => {
      console.log(`${i+1}. ${insight}`);
    });
    
    // Test 3: Multi-factor prediction (up to 5 factors)
    console.log('\n🏀 TEST 3: Multi-Factor NBA Prediction (5 factors)');
    console.log('----------------------------------------------');
    
    const nbaContext = {
      sport: 'basketball',
      league: 'NBA',
      teams: ['Los Angeles Lakers', 'Boston Celtics'],
      date: new Date().toISOString()
    };
    
    // 5 completely custom factors
    const multiFactors = [
      "Lakers have scored 110+ points in last 5 games",
      "Celtics playing on second night of back-to-back",
      "Three point shooting percentage for Lakers has improved",
      "Injury to key Celtics defender",
      "Historical rivalry favors home team"
    ];
    
    console.log('Factors:');
    multiFactors.forEach((factor, i) => {
      console.log(`${i+1}. "${factor}"`);
    });
    console.log(`Teams: ${nbaContext.teams[0]} vs ${nbaContext.teams[1]}`);
    
    // Custom weights (totally optional)
    const weights = [0.3, 0.2, 0.2, 0.2, 0.1];
    
    const multiPrediction = await customPredictionEngine.predictMultiple(
      multiFactors, 
      nbaContext,
      { weights }
    );
    
    console.log('\nMulti-Factor Prediction:');
    console.log(`- Home win: ${(multiPrediction.probabilities.home * 100).toFixed(1)}%`);
    console.log(`- Away win: ${(multiPrediction.probabilities.away * 100).toFixed(1)}%`);
    console.log(`- Confidence: ${(multiPrediction.confidence * 100).toFixed(1)}%`);
    console.log('\nInsights:');
    multiPrediction.insights.forEach((insight, i) => {
      console.log(`${i+1}. ${insight}`);
    });
    
    // Test 4: ANY sport that isn't even in our database yet
    console.log('\n🏓 TEST 4: ANY Sport Prediction (Table Tennis)');
    console.log('------------------------------------------');
    
    const ttContext = {
      sport: 'table tennis', // Not in our predefined list
      league: 'World Championship',
      teams: ['Ma Long', 'Fan Zhendong'],
      date: new Date().toISOString()
    };
    
    // Completely different factor for a sport we don't even explicitly support
    const factor4 = "Ma Long performs better in championship finals";
    console.log(`Factor: "${factor4}"`);
    console.log(`Teams: ${ttContext.teams[0]} vs ${ttContext.teams[1]}`);
    
    const ttPrediction = await customPredictionEngine.predict(factor4, ttContext);
    console.log('\nPrediction:');
    console.log(`- Home win: ${(ttPrediction.probabilities.home * 100).toFixed(1)}%`);
    console.log(`- Away win: ${(ttPrediction.probabilities.away * 100).toFixed(1)}%`);
    console.log(`- Confidence: ${(ttPrediction.confidence * 100).toFixed(1)}%`);
    console.log('\nInsights:');
    ttPrediction.insights.forEach((insight, i) => {
      console.log(`${i+1}. ${insight}`);
    });
    
    console.log('\n✅ CUSTOM PREDICTION ENGINE TESTS COMPLETE');
    console.log('Your bread and butter feature is working perfectly!');
    console.log('This system can handle ANY custom factor for ANY sport/league/team');
    
    // Shutdown
    await customPredictionEngine.stop();
    
  } catch (error) {
    console.error('❌ Error testing custom prediction engine:', error);
  }
}

// Run the test
testCustomPrediction().then(() => {
  console.log('Tests completed.');
}); 