require('dotenv').config();
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration from environment or defaults
const LOCAL_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sportsdb';
const ATLAS_MONGO_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true';
const DB_NAME = process.env.MONGO_DB_NAME || 'sportsanalytics';
const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || process.env.SPORTS_DB_API_KEY || '447279';
const API_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}`;
const LOCAL_API_URL = 'http://localhost:8000/api';

// Test results
const testResults = {
  mongoLocal: { status: 'not tested', details: null },
  mongoAtlas: { status: 'not tested', details: null },
  sportsDbApi: { status: 'not tested', details: null },
  dataPopulation: { status: 'not tested', details: null },
  apiEndpoints: { status: 'not tested', details: null }
};

// Create logs directory if it doesn't exist
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

// Configure logging
const logFile = fs.createWriteStream(path.join('logs', 'data-verification.log'), { flags: 'a' });
const logTime = () => new Date().toISOString();

// Log function that outputs to console and file
function log(message, level = 'INFO') {
  const formattedMessage = `[${logTime()}] [${level}] ${message}`;
  console.log(formattedMessage);
  logFile.write(formattedMessage + '\n');
}

/**
 * Test local MongoDB connection
 */
async function testLocalMongoConnection() {
  log('Testing local MongoDB connection...');
  let client;
  
  try {
    log(`Connecting to MongoDB at ${LOCAL_MONGO_URI}...`);
    client = new MongoClient(LOCAL_MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    await client.connect();
    log('✅ Local MongoDB connection successful');
    
    // Check database and collections
    const db = client.db(DB_NAME);
    log(`Connected to database: ${DB_NAME}`);
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name).join(', ');
    log(`Available collections: ${collectionNames || 'none'}`);
    
    testResults.mongoLocal = { 
      status: 'success', 
      details: {
        collections: collections.map(c => c.name),
        uri: LOCAL_MONGO_URI.replace(/\/\/([^:]+):[^@]+@/, '//***:***@') // Hide credentials
      }
    };
    
    // Check if collections have data
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      log(`Collection ${collection.name}: ${count} documents`);
      
      if (!testResults.mongoLocal.details.data) {
        testResults.mongoLocal.details.data = {};
      }
      testResults.mongoLocal.details.data[collection.name] = count;
    }
    
    return true;
  } catch (error) {
    log(`❌ Local MongoDB connection failed: ${error.message}`, 'ERROR');
    testResults.mongoLocal = { status: 'failed', details: { error: error.message } };
    return false;
  } finally {
    if (client) {
      await client.close();
      log('Local MongoDB connection closed');
    }
  }
}

/**
 * Test MongoDB Atlas connection
 */
async function testMongoAtlasConnection() {
  log('Testing MongoDB Atlas connection...');
  let client;
  
  try {
    log(`Connecting to MongoDB Atlas...`);
    client = new MongoClient(ATLAS_MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    await client.connect();
    log('✅ MongoDB Atlas connection successful');
    
    // Get database and list collections
    const db = client.db('sports-analytics');
    log(`Connected to Atlas database: sports-analytics`);
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name).join(', ');
    log(`Available Atlas collections: ${collectionNames || 'none'}`);
    
    testResults.mongoAtlas = { 
      status: 'success', 
      details: {
        collections: collections.map(c => c.name)
      }
    };
    
    // Check if collections have data
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      log(`Atlas collection ${collection.name}: ${count} documents`);
      
      if (!testResults.mongoAtlas.details.data) {
        testResults.mongoAtlas.details.data = {};
      }
      testResults.mongoAtlas.details.data[collection.name] = count;
    }
    
    return true;
  } catch (error) {
    log(`❌ MongoDB Atlas connection failed: ${error.message}`, 'ERROR');
    testResults.mongoAtlas = { status: 'failed', details: { error: error.message } };
    return false;
  } finally {
    if (client) {
      await client.close();
      log('MongoDB Atlas connection closed');
    }
  }
}

/**
 * Test TheSportsDB API connection
 */
async function testSportsDbConnection() {
  log('Testing TheSportsDB API connection...');
  
  try {
    log(`Testing API with key: ${THESPORTSDB_API_KEY}`);
    
    // Test leagues endpoint
    log(`Fetching leagues from ${API_BASE_URL}/all_leagues.php...`);
    const leaguesResponse = await axios.get(`${API_BASE_URL}/all_leagues.php`);
    
    if (leaguesResponse.status !== 200) {
      throw new Error(`API request failed with status ${leaguesResponse.status}`);
    }
    
    const leaguesData = leaguesResponse.data;
    if (!leaguesData || !leaguesData.leagues) {
      throw new Error('Invalid API response format');
    }
    
    log(`✅ TheSportsDB API connection successful - Retrieved ${leaguesData.leagues.length} leagues`);
    
    // Test teams from a specific league (NBA)
    const NBA_ID = 4387;
    log(`Testing teams retrieval for NBA (ID: ${NBA_ID})...`);
    
    const teamsResponse = await axios.get(`${API_BASE_URL}/lookup_all_teams.php?id=${NBA_ID}`);
    
    if (teamsResponse.status !== 200) {
      throw new Error(`Teams API request failed with status ${teamsResponse.status}`);
    }
    
    const teamsData = teamsResponse.data;
    if (!teamsData || !teamsData.teams) {
      throw new Error('Invalid teams API response format');
    }
    
    log(`✅ Successfully retrieved ${teamsData.teams.length} NBA teams`);
    
    // Also verify we can get some players
    const sampleTeamId = teamsData.teams[0].idTeam;
    log(`Testing players retrieval for team ID: ${sampleTeamId}...`);
    
    const playersResponse = await axios.get(`${API_BASE_URL}/lookup_all_players.php?id=${sampleTeamId}`);
    
    if (playersResponse.status !== 200) {
      throw new Error(`Players API request failed with status ${playersResponse.status}`);
    }
    
    const playersData = playersResponse.data;
    if (!playersData || !playersData.player) {
      log('⚠️ No players found or invalid player data format', 'WARN');
      testResults.sportsDbApi = { 
        status: 'partial',
        details: {
          leagues: leaguesData.leagues.length,
          teams: teamsData.teams.length,
          players: 0
        }
      };
    } else {
      log(`✅ Successfully retrieved ${playersData.player.length} players`);
      testResults.sportsDbApi = { 
        status: 'success',
        details: {
          leagues: leaguesData.leagues.length,
          teams: teamsData.teams.length,
          players: playersData.player.length
        }
      };
    }
    
    return true;
  } catch (error) {
    log(`❌ TheSportsDB API connection failed: ${error.message}`, 'ERROR');
    testResults.sportsDbApi = { status: 'failed', details: { error: error.message } };
    return false;
  }
}

/**
 * Test data population from TheSportsDB to MongoDB
 */
async function testDataPopulation() {
  log('Testing data population from TheSportsDB to MongoDB...');
  let client;
  
  try {
    log(`Connecting to MongoDB to check data population...`);
    client = new MongoClient(LOCAL_MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000
    });
    
    await client.connect();
    const db = client.db(DB_NAME);
    
    // Check if teams collection exists and has data
    const collections = await db.listCollections().toArray();
    const hasTeams = collections.some(c => c.name === 'teams');
    
    if (!hasTeams) {
      log('⚠️ Teams collection does not exist', 'WARN');
      testResults.dataPopulation = { status: 'failed', details: { error: 'Teams collection does not exist' } };
      return false;
    }
    
    const teamsCount = await db.collection('teams').countDocuments();
    
    if (teamsCount === 0) {
      log('⚠️ Teams collection is empty', 'WARN');
      
      // Try to populate with sample data from TheSportsDB
      log('Initializing with sample data...');
      
      // Fetch NBA teams from API
      const NBA_ID = 4387;
      const teamsResponse = await axios.get(`${API_BASE_URL}/lookup_all_teams.php?id=${NBA_ID}`);
      const teamsData = teamsResponse.data;
      
      if (teamsData && teamsData.teams && teamsData.teams.length > 0) {
        // Transform and insert teams
        const formattedTeams = teamsData.teams.map(team => ({
          teamId: team.idTeam,
          name: team.strTeam,
          league: 'NBA',
          leagueId: NBA_ID.toString(),
          logo: team.strTeamBadge,
          country: team.strCountry,
          createdAt: new Date(),
          updatedAt: new Date()
        }));
        
        const insertResult = await db.collection('teams').insertMany(formattedTeams);
        log(`✅ Successfully imported ${insertResult.insertedCount} NBA teams to database`);
        
        testResults.dataPopulation = { 
          status: 'success', 
          details: { 
            imported: insertResult.insertedCount,
            source: 'newly imported during test'
          } 
        };
      } else {
        testResults.dataPopulation = { status: 'failed', details: { error: 'Could not retrieve teams from TheSportsDB' } };
        return false;
      }
    } else {
      log(`✅ Teams collection already has ${teamsCount} teams`);
      
      // Show sample team from database
      const sampleTeam = await db.collection('teams').findOne({});
      if (sampleTeam) {
        log('Sample team from database:');
        log(JSON.stringify(sampleTeam, null, 2));
      }
      
      testResults.dataPopulation = { 
        status: 'success', 
        details: { 
          existingTeams: teamsCount,
          sampleTeam: sampleTeam ? sampleTeam.name : null
        } 
      };
    }
    
    return true;
  } catch (error) {
    log(`❌ Data population test failed: ${error.message}`, 'ERROR');
    testResults.dataPopulation = { status: 'failed', details: { error: error.message } };
    return false;
  } finally {
    if (client) {
      await client.close();
      log('MongoDB connection closed');
    }
  }
}

/**
 * Test local API endpoints (requires server to be running)
 */
async function testApiEndpoints() {
  log('Testing local API endpoints...');
  
  try {
    // Test health endpoint
    log(`Testing health endpoint at ${LOCAL_API_URL}/health...`);
    const healthResponse = await axios.get(`${LOCAL_API_URL}/health`, { timeout: 5000 });
    
    if (healthResponse.status !== 200) {
      throw new Error(`Health endpoint returned status ${healthResponse.status}`);
    }
    
    log('✅ Health endpoint successful');
    
    // Test leagues endpoint
    log(`Testing leagues endpoint at ${LOCAL_API_URL}/leagues...`);
    const leaguesResponse = await axios.get(`${LOCAL_API_URL}/leagues`, { timeout: 5000 });
    
    if (leaguesResponse.status !== 200) {
      throw new Error(`Leagues endpoint returned status ${leaguesResponse.status}`);
    }
    
    if (!leaguesResponse.data || (leaguesResponse.data.data && leaguesResponse.data.data.length === 0)) {
      log('⚠️ Leagues endpoint returned no data', 'WARN');
    } else {
      const leagues = leaguesResponse.data.data || leaguesResponse.data;
      log(`✅ Successfully retrieved ${leagues.length} leagues`);
    }
    
    // Test teams endpoint
    log(`Testing teams endpoint at ${LOCAL_API_URL}/teams...`);
    const teamsResponse = await axios.get(`${LOCAL_API_URL}/teams`, { timeout: 5000 });
    
    if (teamsResponse.status !== 200) {
      throw new Error(`Teams endpoint returned status ${teamsResponse.status}`);
    }
    
    if (!teamsResponse.data || (teamsResponse.data.data && teamsResponse.data.data.length === 0)) {
      log('⚠️ Teams endpoint returned no data', 'WARN');
    } else {
      const teams = teamsResponse.data.data || teamsResponse.data;
      log(`✅ Successfully retrieved ${teams.length} teams`);
    }
    
    testResults.apiEndpoints = { 
      status: 'success', 
      details: {
        health: healthResponse.status,
        leagues: leaguesResponse.data.data ? leaguesResponse.data.data.length : 0,
        teams: teamsResponse.data.data ? teamsResponse.data.data.length : 0
      } 
    };
    
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log(`❌ API endpoint testing failed: Server not running`, 'ERROR');
      testResults.apiEndpoints = { 
        status: 'failed', 
        details: { error: 'Server not running. Please start the server first.' } 
      };
    } else {
      log(`❌ API endpoint testing failed: ${error.message}`, 'ERROR');
      testResults.apiEndpoints = { status: 'failed', details: { error: error.message } };
    }
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  log('====== SPORTS ANALYTICS PLATFORM - COMPREHENSIVE DATA VERIFICATION ======');
  log('Starting comprehensive data verification...');
  
  try {
    // Check if server is running
    log('Checking if server is running...');
    try {
      await axios.get(`${LOCAL_API_URL}/health`, { timeout: 2000 });
      log('✅ Server is running');
    } catch (error) {
      log('⚠️ Server is not running. Will not test API endpoints.', 'WARN');
    }
    
    // Run tests
    log('\n1. Testing local MongoDB connection...');
    await testLocalMongoConnection();
    
    log('\n2. Testing MongoDB Atlas connection...');
    await testMongoAtlasConnection();
    
    log('\n3. Testing TheSportsDB API connection...');
    await testSportsDbConnection();
    
    log('\n4. Testing data population...');
    await testDataPopulation();
    
    try {
      log('\n5. Testing API endpoints...');
      await testApiEndpoints();
    } catch (error) {
      log(`Skipping API endpoint tests: ${error.message}`, 'WARN');
    }
    
    // Output summary
    log('\n====== TEST SUMMARY ======');
    log(`Local MongoDB: ${testResults.mongoLocal.status}`);
    log(`MongoDB Atlas: ${testResults.mongoAtlas.status}`);
    log(`TheSportsDB API: ${testResults.sportsDbApi.status}`);
    log(`Data Population: ${testResults.dataPopulation.status}`);
    log(`API Endpoints: ${testResults.apiEndpoints.status}`);
    
    // Save results to file
    const resultPath = path.join('logs', 'verification-results.json');
    fs.writeFileSync(resultPath, JSON.stringify(testResults, null, 2));
    log(`\nDetailed results saved to ${resultPath}`);
    
    log('\nVerification complete.');
  } catch (error) {
    log(`Error during verification: ${error.message}`, 'ERROR');
  } finally {
    logFile.end();
  }
}

// Run tests
runAllTests().catch(console.error); 