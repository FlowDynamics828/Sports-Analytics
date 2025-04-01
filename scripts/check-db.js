const { MongoClient } = require('mongodb');

async function checkData() {
  try {
    console.log("Connecting to MongoDB...");
    const client = await MongoClient.connect('mongodb://127.0.0.1:27017');
    console.log("Connected to MongoDB");
    
    const db = client.db('sports-analytics');
    const collections = ['games', 'teams', 'players', 'statistics'];
    
    for (const collection of collections) {
      try {
        const count = await db.collection(collection).countDocuments();
        console.log(`Collection ${collection}: ${count} documents`);
        
        const leagueData = await db.collection(collection).aggregate([
          { $group: { _id: "$league", count: { $sum: 1 } } }
        ]).toArray();
        
        console.log(`Breakdown by league:`);
        leagueData.forEach(item => console.log(`- ${item._id || 'No league'}: ${item.count}`));
        console.log();
      } catch (err) {
        console.log(`Error processing collection ${collection}:`, err instanceof Error ? err.message : String(err));
      }
    }
    
    await client.close();
    console.log("MongoDB connection closed");
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

checkData(); 