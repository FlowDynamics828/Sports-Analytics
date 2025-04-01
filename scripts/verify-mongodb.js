require('dotenv').config();
const { MongoClient } = require('mongodb');

async function verifyMongoDB() {
  console.log('Verifying MongoDB connection...');
  
  const start = Date.now();
  let client;
  
  try {
    // Connect with improved timeout settings
    client = await MongoClient.connect(process.env.MONGODB_URI, {
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 15000
    });
    
    const connDuration = Date.now() - start;
    console.log(`Connected to MongoDB in ${connDuration}ms`);
    
    const db = client.db(process.env.MONGODB_DB_NAME || 'sports-analytics');
    
    // Test ping command
    const pingStart = Date.now();
    await db.command({ ping: 1 });
    const pingDuration = Date.now() - pingStart;
    console.log(`Ping successful in ${pingDuration}ms`);
    
    // Test users query
    const queryStart = Date.now();
    const user = await db.collection('users').findOne({ email: 'test@example.com' });
    const queryDuration = Date.now() - queryStart;
    
    if (user) {
      console.log(`Found test user in ${queryDuration}ms`);
      console.log(`User ID: ${user._id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Has password: ${!!user.password}`);
    } else {
      console.log(`Test user not found after ${queryDuration}ms`);
    }
    
    console.log('MongoDB verification complete!');
    return true;
  } catch (error) {
    console.error('MongoDB verification failed:', error);
    return false;
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the verification
verifyMongoDB()
  .then(success => {
    console.log(`MongoDB verification ${success ? 'passed' : 'failed'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error during verification:', error);
    process.exit(1);
  }); 