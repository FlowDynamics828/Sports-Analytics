// Simple MongoDB connection test
const { MongoClient } = require('mongodb');

// Production-ready connection string
const url = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true';
console.log(`Attempting to connect to MongoDB Atlas...`);

const client = new MongoClient(url);

async function testConnection() {
  try {
    await client.connect();
    console.log('Successfully connected to MongoDB Atlas');
    const db = client.db('sports-analytics');
    const collections = await db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

testConnection(); 