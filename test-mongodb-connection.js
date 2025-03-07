// test-mongodb-connection.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

async function testMongoDBConnection() {
  logger.info('Testing MongoDB connection...');
  
  const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
  logger.info(`Connecting to MongoDB at: ${url}`);
  
  let client;
  
  try {
    // Connect to MongoDB
    client = new MongoClient(url, {
      maxPoolSize: 10,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    
    await client.connect();
    logger.info('Successfully connected to MongoDB');
    
    // Get database reference
    const dbName = process.env.MONGODB_DB_NAME || 'sports-analytics';
    const db = client.db(dbName);
    logger.info(`Using database: ${dbName}`);
    
    // Verify connection with a ping command
    const pingResult = await db.command({ ping: 1 });
    logger.info(`Ping command result: ${JSON.stringify(pingResult)}`);
    
    // List collections
    const collections = await db.listCollections().toArray();
    logger.info(`Found ${collections.length} collections in the database`);
    collections.forEach((collection, index) => {
      logger.info(`${index + 1}. ${collection.name}`);
    });
    
    // Test a simple insert and find operation
    const testCollection = db.collection('connection_test');
    
    // Insert a test document
    const insertResult = await testCollection.insertOne({
      test: true,
      timestamp: new Date(),
      message: 'MongoDB connection test'
    });
    logger.info(`Inserted test document with ID: ${insertResult.insertedId}`);
    
    // Find the test document
    const foundDocument = await testCollection.findOne({ test: true });
    logger.info(`Found test document: ${JSON.stringify(foundDocument)}`);
    
    // Clean up - delete the test document
    const deleteResult = await testCollection.deleteOne({ _id: foundDocument._id });
    logger.info(`Deleted test document: ${deleteResult.deletedCount} document(s) removed`);
    
    logger.info('MongoDB connection test completed successfully');
    return true;
  } catch (error) {
    logger.error(`MongoDB connection test failed: ${error.message}`);
    logger.error(error.stack);
    return false;
  } finally {
    // Close the connection
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testMongoDBConnection()
    .then(success => {
      if (success) {
        logger.info('MongoDB connection test passed');
        process.exit(0);
      } else {
        logger.error('MongoDB connection test failed');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error(`Unexpected error: ${error.message}`);
      process.exit(1);
    });
}

module.exports = testMongoDBConnection;