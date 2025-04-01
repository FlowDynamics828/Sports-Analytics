/**
 * Script to analyze database collections and provide detailed information
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const logger = require('../utils/logger');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';

async function analyzeDatabaseCollections() {
  const client = new MongoClient(uri);
  
  try {
    console.log('🔄 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB successfully');
    
    const db = client.db();
    
    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log(`\n📊 Found ${collections.length} collections in the database\n`);
    
    // Analyze each collection
    for (const collection of collections) {
      const collName = collection.name;
      const coll = db.collection(collName);
      
      // Get count
      const count = await coll.countDocuments();
      console.log(`\n=== Collection: ${collName} (${count} documents) ===`);
      
      if (count === 0) {
        console.log('   ⚠️ Collection is empty');
        continue;
      }
      
      // Sample a document
      const sampleDoc = await coll.findOne({});
      
      // Get fields breakdown
      console.log('\n🔑 Document structure:');
      analyzeDocument(sampleDoc);
      
      // Get specific analysis based on collection type
      if (collName === 'teams') {
        await analyzeTeams(coll);
      } else if (collName === 'players') {
        await analyzePlayers(coll);
      } else if (collName === 'games') {
        await analyzeGames(coll);
      }
      
      console.log('\n' + '-'.repeat(50));
    }
    
  } catch (error) {
    console.error('❌ Error analyzing database:', error);
  } finally {
    await client.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

function analyzeDocument(doc, prefix = '   ', depth = 0) {
  if (depth > 2) return; // Limit nesting depth
  
  for (const [key, value] of Object.entries(doc)) {
    const type = Array.isArray(value) ? 'array' : typeof value;
    
    if (value === null) {
      console.log(`${prefix}${key}: null`);
    } else if (type === 'object' && !(value instanceof Date)) {
      console.log(`${prefix}${key}: {object}`);
      analyzeDocument(value, prefix + '   ', depth + 1);
    } else if (type === 'array') {
      console.log(`${prefix}${key}: [array] (${value.length} items)`);
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        analyzeDocument(value[0], prefix + '   ', depth + 1);
      }
    } else {
      let displayValue = value;
      if (value instanceof Date) {
        displayValue = 'Date: ' + value.toISOString();
      } else if (typeof value === 'string' && value.length > 50) {
        displayValue = value.substring(0, 47) + '...';
      }
      console.log(`${prefix}${key}: ${displayValue} (${type})`);
    }
  }
}

async function analyzeTeams(collection) {
  // Get leagues breakdown
  const leagueBreakdown = await collection.aggregate([
    { $group: { _id: '$league', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('\n🏆 Teams by League:');
  leagueBreakdown.forEach(league => {
    console.log(`   ${league._id || 'undefined'}: ${league.count} teams`);
  });
  
  // Get teams with most players
  console.log('\n👥 Sample team data:');
  const sampleTeams = await collection.find({})
    .limit(3)
    .toArray();
  
  sampleTeams.forEach(team => {
    console.log(`   - ${team.name || 'Unnamed'} (${team.league || 'No league'}, ID: ${team.teamId || 'No ID'})`);
  });
}

async function analyzePlayers(collection) {
  // Get players by league
  const leagueBreakdown = await collection.aggregate([
    { $group: { _id: '$league', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('\n⚽ Players by League:');
  leagueBreakdown.forEach(league => {
    console.log(`   ${league._id || 'undefined'}: ${league.count} players`);
  });
  
  // Get position breakdown if available
  const positionBreakdown = await collection.aggregate([
    { $group: { _id: '$position', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]).toArray();
  
  if (positionBreakdown.length > 0) {
    console.log('\n🏃 Top Positions:');
    positionBreakdown.forEach(pos => {
      console.log(`   ${pos._id || 'undefined'}: ${pos.count} players`);
    });
  }
  
  // Check if statistics are populated
  const playersWithStats = await collection.countDocuments({
    'statistics.current': { $exists: true, $ne: {} }
  });
  
  console.log(`\n📈 Players with statistics: ${playersWithStats}`);
  
  // Sample players
  console.log('\n👤 Sample player data:');
  const samplePlayers = await collection.find({})
    .limit(2)
    .toArray();
  
  samplePlayers.forEach(player => {
    console.log(`   - ${player.name || 'Unnamed'} (${player.position || 'No position'}, Team: ${player.teamId || 'No team'})`);
  });
}

async function analyzeGames(collection) {
  // Games by status
  const statusBreakdown = await collection.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('\n🎮 Games by Status:');
  statusBreakdown.forEach(status => {
    console.log(`   ${status._id || 'undefined'}: ${status.count} games`);
  });
  
  // Games by league
  const leagueBreakdown = await collection.aggregate([
    { $group: { _id: '$league', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('\n🌍 Games by League:');
  leagueBreakdown.forEach(league => {
    console.log(`   ${league._id || 'undefined'}: ${league.count} games`);
  });
  
  // Get upcoming games count
  const today = new Date();
  const upcomingGames = await collection.countDocuments({
    gameDate: { $gt: today },
    status: 'scheduled'
  });
  
  console.log(`\n📅 Upcoming games: ${upcomingGames}`);
  
  // Sample games
  console.log('\n🏁 Sample game data:');
  const sampleGames = await collection.find({})
    .limit(2)
    .toArray();
  
  sampleGames.forEach(game => {
    const gameInfo = `${game.homeTeamName || 'Home'} vs ${game.awayTeamName || 'Away'}`;
    const dateInfo = game.gameDate ? `on ${new Date(game.gameDate).toLocaleDateString()}` : 'no date';
    console.log(`   - ${gameInfo} (${dateInfo}, Status: ${game.status || 'unknown'})`);
  });
}

// Run the analysis
analyzeDatabaseCollections()
  .then(() => {
    console.log('\n✅ Database analysis complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Analysis failed:', err);
    process.exit(1);
  }); 