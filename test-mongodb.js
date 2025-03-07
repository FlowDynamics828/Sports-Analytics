const { MongoClient } = require('mongodb');
const { DatabaseManager } = require('./utils/db');

describe('MongoDB Connection Tests', () => {
  let connection;
  let db;
  let dbManager;

  beforeAll(async () => {
    // Setup test database connection
    const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics-test';
    connection = await MongoClient.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 50,
      connectTimeoutMS: 5000
    });
    
    db = connection.db();
    dbManager = new DatabaseManager();
  });

  afterAll(async () => {
    if (connection) {
      await connection.close();
    }
  });

  beforeEach(async () => {
    // Clean up collections before each test
    const collections = await db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  describe('Connection Tests', () => {
    it('should connect to MongoDB successfully', async () => {
      expect(connection).toBeDefined();
      expect(db).toBeDefined();
      
      const isConnected = connection.isConnected();
      expect(isConnected).toBeTruthy();
    });

    it('should handle connection errors gracefully', async () => {
      const badUrl = 'mongodb://nonexistent:27017';
      await expect(
        MongoClient.connect(badUrl, { serverSelectionTimeoutMS: 1000 })
      ).rejects.toThrow();
    });
  });

  describe('Database Operations', () => {
    it('should perform basic CRUD operations', async () => {
      const collection = db.collection('test');
      
      // Create
      const insertResult = await collection.insertOne({
        name: 'Test Document',
        value: 123
      });
      expect(insertResult.insertedId).toBeDefined();

      // Read
      const document = await collection.findOne({ name: 'Test Document' });
      expect(document).toBeDefined();
      expect(document.value).toBe(123);

      // Update
      const updateResult = await collection.updateOne(
        { name: 'Test Document' },
        { $set: { value: 456 } }
      );
      expect(updateResult.modifiedCount).toBe(1);

      // Delete
      const deleteResult = await collection.deleteOne({ name: 'Test Document' });
      expect(deleteResult.deletedCount).toBe(1);
    });
  });

  describe('Connection Pool Tests', () => {
    it('should handle multiple simultaneous connections', async () => {
      const operations = Array(20).fill(null).map(() =>
        db.collection('test').insertOne({ timestamp: new Date() })
      );

      const results = await Promise.all(operations);
      expect(results.length).toBe(20);
      expect(results.every(r => r.insertedId)).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate key errors', async () => {
      const collection = db.collection('test');
      await collection.createIndex({ uniqueField: 1 }, { unique: true });

      await collection.insertOne({ uniqueField: 'test' });
      
      await expect(
        collection.insertOne({ uniqueField: 'test' })
      ).rejects.toThrow();
    });

    it('should handle invalid queries', async () => {
      const collection = db.collection('test');
      
      await expect(
        collection.findOne({ $invalidOperator: 1 })
      ).rejects.toThrow();
    });
  });

  describe('Database Manager Tests', () => {
    it('should initialize database connection', async () => {
      const isConnected = await dbManager.connect();
      expect(isConnected).toBeTruthy();
    });

    it('should handle reconnection', async () => {
      await dbManager.disconnect();
      const isReconnected = await dbManager.connect();
      expect(isReconnected).toBeTruthy();
    });
  });
});