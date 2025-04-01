const { MongoClient } = require('mongodb');

async function checkData() {
  try {
    console.log('Connecting to MongoDB...');
    const uri = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0';
    const client = await MongoClient.connect(uri);
    console.log('Connected to MongoDB');
    
    const db = client.db('sports-analytics');
    const collections = ['teams', 'players', 'games'];
    
    for (const collection of collections) {
      const count = await db.collection(collection).countDocuments();
      console.log(`Collection ${collection}: ${count} documents`);
      
      const pipeline = [
        { $group: { _id: "$league", count: { $sum: 1 } } }
      ];
      
      const leagueData = await db.collection(collection).aggregate(pipeline).toArray();
      console.log('Breakdown by league:');
      leagueData.forEach(item => console.log(`- ${item._id || 'No league'}: ${item.count}`));
      console.log();
    }
    
    await client.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

checkData(); 