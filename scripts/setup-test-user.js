require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function setupTestUser() {
    let client;
    try {
        console.log('Connecting to MongoDB...');
        client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics', {
            connectTimeoutMS: 15000,
            socketTimeoutMS: 30000,
            serverSelectionTimeoutMS: 15000
        });
        
        const dbName = process.env.MONGODB_DB_NAME || 'sports-analytics';
        const db = client.db(dbName);
        
        console.log('Connected to MongoDB. Setting up test user...');
        
        // Delete existing user first
        await db.collection('users').deleteOne({ email: 'test@example.com' });
        
        // Create new test user
        const hashedPassword = await bcrypt.hash('test123', 10);
        const result = await db.collection('users').insertOne({
            email: 'test@example.com',
            password: hashedPassword,
            subscription: 'premium',
            createdAt: new Date(),
            updatedAt: new Date(),
            active: true,
            verified: true
        });
        
        console.log('Test user created successfully:', result.insertedId);
    } catch (error) {
        console.error('Error setting up test user:', error);
        process.exit(1);
    } finally {
        if (client) await client.close();
    }
}

setupTestUser().then(() => process.exit(0));