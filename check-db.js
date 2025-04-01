const { MongoClient } = require('mongodb');
const { DatabaseManager } = require('./utils/db');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(info => {
          const { timestamp, level, message, metadata } = info;
          return `${level}: ${message} ${metadata ? JSON.stringify(metadata) : ''}`;
        })
      )
    })
  ]
});

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'sports-analytics';

async function checkDatabase() {
  try {
    logger.info('Connecting to MongoDB...');
    
    // Connect to MongoDB
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    logger.info('MongoDB connection established successfully');
    
    const db = client.db(DB_NAME);
    
    // Get collection stats
    const collections = await db.listCollections().toArray();
    logger.info(`Database collections: ${collections.map(c => c.name).join(', ')}`);
    
    // Count documents in each collection
    const teamCount = await db.collection('teams').countDocuments();
    logger.info(`Teams collection: ${teamCount} documents`);
    
    const playerCount = await db.collection('players').countDocuments();
    logger.info(`Players collection: ${playerCount} documents`);
    
    const gamesCount = await db.collection('games').countDocuments();
    logger.info(`Games collection: ${gamesCount} documents`);
    
    // Get some sample documents
    if (teamCount > 0) {
      const teams = await db.collection('teams').find().limit(3).toArray();
      logger.info('Sample teams:', { metadata: { teams } });
    }
    
    if (playerCount > 0) {
      const players = await db.collection('players').find().limit(3).toArray();
      logger.info('Sample players:', { metadata: { players } });
    }
    
    await client.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error checking database:', { metadata: { error: error.message, stack: error.stack } });
  }
}

checkDatabase(); 