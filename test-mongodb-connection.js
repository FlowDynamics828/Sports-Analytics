// test-mongodb-connection.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

async function testConnection() {
  let client = null;
  
  try {
    console.log('Testing MongoDB connection...');
    
    // Create client with appropriate options
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
      connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
      socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000
    });
    
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB server');
    
    // Test database access
    const db = client.db(DB_NAME);
    
    // Try to list collections
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections in the database`);
    
    // Print collection names
    if (collections.length > 0) {
      console.log('Collections:');
      collections.forEach(collection => {
        console.log(`- ${collection.name}`);
      });
    }
    
    console.log('MongoDB connection test passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error(`MongoDB connection test failed: ${error.message}`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('Error: Could not connect to MongoDB server. Make sure MongoDB is running.');
    } else if (error.message.includes('Authentication failed')) {
      console.error('Error: Authentication failed. Check your MongoDB credentials.');
    } else if (error.message.includes('not authorized')) {
      console.error('Error: Not authorized to access the database. Check your MongoDB user permissions.');
    }
    
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run test
testConnection().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});
