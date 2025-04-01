require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const { exec } = require('child_process');

async function testConnection() {
  console.log('SPORTS ANALYTICS PLATFORM - CONNECTION TEST');
  console.log('===========================================');
  
  // Check if MongoDB is running
  console.log('\nChecking if MongoDB is installed and running...');
  try {
    await new Promise((resolve, reject) => {
      exec('mongod --version', (error, stdout, stderr) => {
        if (error) {
          console.log('⚠️ MongoDB might not be installed or in PATH');
          resolve(false);
        } else {
          console.log('✅ MongoDB is installed:');
          console.log(stdout.split('\n')[0]);
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error('Error checking MongoDB installation:', error);
  }
  
  // 1. Test MongoDB Connection
  console.log('\n[1] Testing MongoDB connection...');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sportsdb';
  const DB_NAME = process.env.MONGO_DB_NAME || 'sports_analytics';
  
  let client;
  try {
    client = new MongoClient(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
    await client.connect();
    
    console.log('✅ MongoDB connection successful');
    
    // Check database and collections
    const db = client.db(DB_NAME);
    console.log(`Connected to database: ${DB_NAME}`);
    
    const collections = await db.listCollections().toArray();
    console.log(`Available collections: ${collections.map(c => c.name).join(', ') || 'none'}`);
    
    // Check if data exists
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      console.log(`Collection ${collection.name}: ${count} documents`);
    }
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log(`
TROUBLESHOOTING TIPS:
1. Make sure MongoDB is installed and running
2. Check if MongoDB service is started
3. Verify MongoDB connection string in .env file
4. Make sure your MongoDB port is correct and not blocked by firewall`);
    }
  }
  
  // 2. Test TheSportsDB API connection
  console.log('\n[2] Testing TheSportsDB API connection...');
  const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || process.env.SPORTS_DB_API_KEY || '447279';
  const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}`;
  
  try {
    console.log(`Testing API with key: ${THESPORTSDB_API_KEY}`);
    
    // Test leagues endpoint
    console.log(`Fetching leagues from ${BASE_URL}/all_leagues.php...`);
    const leaguesResponse = await axios.get(`${BASE_URL}/all_leagues.php`);
    
    if (leaguesResponse.status !== 200) {
      throw new Error(`API request failed with status ${leaguesResponse.status}`);
    }
    
    const leaguesData = leaguesResponse.data;
    if (!leaguesData || !leaguesData.leagues) {
      throw new Error('Invalid API response format');
    }
    
    console.log(`✅ API connection successful - Retrieved ${leaguesData.leagues.length} leagues`);
    
    // Test teams from a specific league (NBA)
    const NBA_ID = 4387;
    console.log(`Testing teams retrieval for NBA (ID: ${NBA_ID})...`);
    
    const teamsResponse = await axios.get(`${BASE_URL}/lookup_all_teams.php?id=${NBA_ID}`);
    
    if (teamsResponse.status !== 200) {
      throw new Error(`Teams API request failed with status ${teamsResponse.status}`);
    }
    
    const teamsData = teamsResponse.data;
    if (!teamsData || !teamsData.teams) {
      throw new Error('Invalid teams API response format');
    }
    
    console.log(`✅ Successfully retrieved ${teamsData.teams.length} NBA teams`);
    
    // Show sample team data
    if (teamsData.teams.length > 0) {
      const sampleTeam = teamsData.teams[0];
      console.log('\nSample team data:');
      console.log(`- Team ID: ${sampleTeam.idTeam}`);
      console.log(`- Name: ${sampleTeam.strTeam}`);
      console.log(`- League: ${sampleTeam.strLeague}`);
      console.log(`- Stadium: ${sampleTeam.strStadium}`);
      console.log(`- Badge URL: ${sampleTeam.strTeamBadge}`);
    }
    
    // Also verify we can get some players 
    const sampleTeamId = teamsData.teams[0].idTeam;
    console.log(`\nTesting players retrieval for team ID: ${sampleTeamId}...`);
    
    const playersResponse = await axios.get(`${BASE_URL}/lookup_all_players.php?id=${sampleTeamId}`);
    
    if (playersResponse.status !== 200) {
      throw new Error(`Players API request failed with status ${playersResponse.status}`);
    }
    
    const playersData = playersResponse.data;
    if (!playersData || !playersData.player) {
      console.log('⚠️ No players found or invalid player data format');
    } else {
      console.log(`✅ Successfully retrieved ${playersData.player.length} players`);
      
      // Show sample player data
      if (playersData.player.length > 0) {
        const samplePlayer = playersData.player[0];
        console.log('\nSample player data:');
        console.log(`- Player ID: ${samplePlayer.idPlayer}`);
        console.log(`- Name: ${samplePlayer.strPlayer}`);
        console.log(`- Position: ${samplePlayer.strPosition}`);
        console.log(`- Thumbnail: ${samplePlayer.strThumb || 'N/A'}`);
      }
    }
  } catch (error) {
    console.error('❌ TheSportsDB API connection failed:', error.message);
    console.log('API Error details:', error.response?.data || 'No detailed error information');
  }
  
  // 3. Test end-to-end data flow
  console.log('\n[3] Testing data flow from API to database...');
  
  try {
    if (!client || !client.topology || !client.topology.isConnected()) {
      console.log('⚠️ MongoDB connection not established, skipping data flow test');
      return;
    }
    
    const db = client.db(DB_NAME);
    
    // Check if teams collection exists and has data
    const teamsCollection = db.collection('teams');
    const teamsCount = await teamsCollection.countDocuments();
    
    if (teamsCount === 0) {
      console.log('⚠️ Teams collection is empty. Initializing with sample data...');
      
      // Fetch NBA teams from API and store them
      const NBA_ID = 4387;
      
      try {
        const teamsResponse = await axios.get(`${BASE_URL}/lookup_all_teams.php?id=${NBA_ID}`);
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
          
          const insertResult = await teamsCollection.insertMany(formattedTeams);
          console.log(`✅ Successfully imported ${insertResult.insertedCount} NBA teams to database`);
        }
      } catch (error) {
        console.error('❌ Failed to import teams:', error.message);
      }
    } else {
      console.log(`✅ Teams collection already has ${teamsCount} teams`);
      
      // Show sample team from database
      const sampleTeam = await teamsCollection.findOne({});
      if (sampleTeam) {
        console.log('\nSample team from database:');
        console.log(JSON.stringify(sampleTeam, null, 2));
      }
    }
  } catch (error) {
    console.error('❌ Data flow test failed:', error.message);
  } finally {
    // Close MongoDB connection
    if (client && client.topology && client.topology.isConnected()) {
      await client.close();
      console.log('\nMongoDB connection closed');
    }
  }
  
  console.log('\nConnection test completed');
}

// Run the test
testConnection().catch(console.error); 