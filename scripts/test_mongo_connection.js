/**
 * MongoDB Connection Tester
 * 
 * This script attempts to connect to MongoDB with both connection strings
 * to determine which one works correctly.
 */

const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// The MongoDB connection string from user's code
const connectionString1 = "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Alternative connection string formatted as SRV
const connectionString2 = process.env.MONGO_URI;

// Alternative connection string formatted as standard connection
const connectionString3 = "mongodb://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net:27017/SportsAnalytics?retryWrites=true&w=majority";

// Test all connection strings
async function testConnection() {
  console.log('🔍 Testing MongoDB connections...');
  console.log('\nConnection String 1:');
  console.log(connectionString1);
  
  await tryConnect(connectionString1, "Connection String 1");
  
  console.log('\nConnection String 2 (from .env):');
  console.log(connectionString2);
  
  await tryConnect(connectionString2, "Connection String 2");
  
  console.log('\nConnection String 3:');
  console.log(connectionString3);
  
  await tryConnect(connectionString3, "Connection String 3");
}

async function tryConnect(uri, label) {
  let client = null;
  
  try {
    console.log(`\n🔄 Attempting to connect with ${label}...`);
    
    // Create MongoDB client
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      // Set longer timeout
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000
    });
    
    // Add listeners for connection events
    client.on('serverOpening', (event) => {
      console.log(`📢 Attempting to connect to server: ${event.address}`);
    });
    
    client.on('serverClosed', (event) => {
      console.log(`📢 Server connection closed: ${event.address}`);
    });
    
    client.on('error', (error) => {
      console.log(`📢 Connection error: ${error.message}`);
    });
    
    // Connect to MongoDB
    console.log('⏳ Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB successfully!');
    
    // Verify connection with ping
    console.log('⏳ Pinging server...');
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Pinged MongoDB deployment successfully!");
    
    // Get database
    const dbName = process.env.MONGO_DB_NAME || "SportsAnalytics";
    console.log(`⏳ Accessing database: ${dbName}...`);
    const db = client.db(dbName);
    
    // List collections
    console.log('⏳ Listing collections...');
    const collections = await db.listCollections().toArray();
    console.log(`✅ Found ${collections.length} collections`);
    
    if (collections.length > 0) {
      console.log(`📋 Collections: ${collections.map(c => c.name).join(', ')}`);
    } else {
      console.log('📋 No collections found');
    }
    
    console.log(`\n✅ ${label} SUCCESSFUL`);
    return true;
  } catch (error) {
    console.error(`❌ ${label} FAILED: ${error.message}`);
    console.error(`❌ Error name: ${error.name}`);
    console.error(`❌ Error code: ${error.code || 'N/A'}`);
    
    if (error.message.includes('getaddrinfo')) {
      console.log('❗ DNS resolution failed - host cannot be found');
    }
    
    if (error.message.includes('connect ETIMEDOUT')) {
      console.log('❗ Connection timed out - possible IP whitelist issue');
    }
    
    if (error.message.includes('authentication failed')) {
      console.log('❗ Authentication failed - check username/password');
    }
    
    console.log('\n💡 Troubleshooting suggestions:');
    console.log('1. Ensure your IP address is whitelisted in MongoDB Atlas');
    console.log('2. Verify username and password are correct');
    console.log('3. Check if the cluster name and URL are correct');
    console.log('4. Ensure your network allows outbound connections to MongoDB');
    
    return false;
  } finally {
    if (client) {
      console.log('⏳ Closing connection...');
      await client.close();
      console.log('👋 Connection closed');
    }
  }
}

// Run the test
testConnection()
  .then(() => {
    console.log('\n🏁 Testing completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
  }); 