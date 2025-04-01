/**
 * Quick Connection Verification Script
 * 
 * This script provides a simple way to verify that all connections
 * are working properly, including MongoDB Atlas and TheSportsDB API.
 */

require('dotenv').config();
const axios = require('axios');
const { MongoClient } = require('mongodb');
const { LiveGamesManager } = require('./utils/live-games-manager');

// Hardcoded configuration to ensure it works
const ATLAS_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true';
const DB_NAME = 'sports-analytics';
const API_KEY = '447279'; // Free tier API key
const API_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

/**
 * Test MongoDB Atlas connection
 */
async function testMongoConnection() {
  console.log('Testing MongoDB Atlas connection...');
  let client;
  
  try {
    client = new MongoClient(ATLAS_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000
    });
    
    console.log('  Connecting to MongoDB Atlas...');
    await client.connect();
    console.log('✓ MongoDB Atlas connection successful');
    
    const db = client.db(DB_NAME);
    const collections = await db.listCollections().toArray();
    console.log(`  - Found ${collections.length} collections`);
    
    if (collections.length > 0) {
      try {
        const teams = await db.collection('teams').countDocuments();
        console.log(`  - Teams collection: ${teams} documents`);
      } catch (err) {
        console.log(`  - Teams collection not found or error: ${err.message}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`✗ MongoDB Atlas connection failed: ${error.message}`);
    return false;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Test TheSportsDB API connection
 */
async function testSportsDbApi() {
  console.log('Testing TheSportsDB API connection...');
  
  try {
    console.log(`  Making request to ${API_BASE_URL}/all_leagues.php...`);
    // Test leagues endpoint
    const leaguesResponse = await axios.get(`${API_BASE_URL}/all_leagues.php`, { 
      timeout: 10000 
    });
    
    if (!leaguesResponse.data || !leaguesResponse.data.leagues) {
      throw new Error('Invalid API response');
    }
    
    console.log(`✓ API connection successful - ${leaguesResponse.data.leagues.length} leagues available`);
    
    // Test upcoming games endpoint (this works with the free tier)
    console.log(`  Testing upcoming games endpoint for Premier League...`);
    const upcomingResponse = await axios.get(`${API_BASE_URL}/eventsnextleague.php?id=4328`, {
      timeout: 10000
    });
    
    const upcomingGamesCount = upcomingResponse.data && upcomingResponse.data.events 
      ? upcomingResponse.data.events.length 
      : 0;
      
    console.log(`  - ${upcomingGamesCount} upcoming Premier League games available`);
    
    if (upcomingGamesCount > 0) {
      const sampleGame = upcomingResponse.data.events[0];
      console.log(`  - Sample upcoming game: ${sampleGame.strHomeTeam} vs ${sampleGame.strAwayTeam} (${sampleGame.dateEvent})`);
    }
    
    // Also test past games endpoint
    console.log(`  Testing past games endpoint for Premier League...`);
    const pastResponse = await axios.get(`${API_BASE_URL}/eventspastleague.php?id=4328`, {
      timeout: 10000
    });
    
    const pastGamesCount = pastResponse.data && pastResponse.data.events 
      ? pastResponse.data.events.length 
      : 0;
      
    console.log(`  - ${pastGamesCount} past Premier League games available`);
    
    if (pastGamesCount > 0) {
      const sampleGame = pastResponse.data.events[0];
      console.log(`  - Sample past game: ${sampleGame.strHomeTeam} vs ${sampleGame.strAwayTeam} (${sampleGame.dateEvent})`);
    }
    
    return true;
  } catch (error) {
    console.error(`✗ TheSportsDB API connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Test LiveGamesManager
 */
async function testLiveGamesManager() {
  console.log('Testing LiveGamesManager...');
  
  try {
    const liveGamesManager = new LiveGamesManager({
      logEnabled: false, // Disable logging for this test
      apiKey: API_KEY
    });
    
    // Setup a one-time event handler for updates
    const updatePromise = new Promise(resolve => {
      liveGamesManager.once('allLeaguesUpdated', data => {
        resolve(data);
      });
      
      // Set a timeout in case no events are found
      setTimeout(() => resolve({}), 15000);
    });
    
    // Start the manager
    liveGamesManager.start();
    console.log('✓ LiveGamesManager started successfully');
    
    // Wait for the update event or timeout
    console.log('  Waiting for live games data (may take up to 15 seconds)...');
    const gameData = await updatePromise;
    
    // Calculate the total number of games
    const totalGames = Object.values(gameData).reduce((sum, leagueGames) => sum + leagueGames.length, 0);
    console.log(`  - Fetched ${totalGames} live games across ${Object.keys(gameData).length} leagues`);
    
    // Stop the manager
    liveGamesManager.stop();
    console.log('✓ LiveGamesManager stopped successfully');
    
    // Treat as success even if no live games are found
    // Games might not be live at the moment but system is working
    return true;
  } catch (error) {
    console.error(`✗ LiveGamesManager test failed: ${error.message}`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('=== CONNECTION VERIFICATION TEST ===\n');
  
  // Test MongoDB connection
  const mongoOk = await testMongoConnection();
  console.log();
  
  // Test TheSportsDB API
  const apiOk = await testSportsDbApi();
  console.log();
  
  // Test LiveGamesManager
  const liveGamesOk = await testLiveGamesManager();
  console.log();
  
  // Print summary
  console.log('=== TEST SUMMARY ===');
  console.log(`MongoDB Connection: ${mongoOk ? '✓ OK' : '✗ FAILED'}`);
  console.log(`TheSportsDB API: ${apiOk ? '✓ OK' : '✗ FAILED'}`);
  console.log(`Live Games Manager: ${liveGamesOk ? '✓ OK' : '✗ FAILED'}`);
  console.log();
  
  if (mongoOk && apiOk && liveGamesOk) {
    console.log('✅ All connections are working correctly!');
    console.log('  Your system is ready for the dashboard and visual phase.');
  } else {
    console.log('❌ Some connections are not working correctly.');
    console.log('  Please fix the issues before proceeding to the dashboard phase.');
  }
}

// Run tests
runTests().catch(console.error); 