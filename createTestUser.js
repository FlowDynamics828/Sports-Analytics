require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createTestUser() {
    const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    try {
        const db = client.db('sports-analytics');
        const hashedPassword = await bcrypt.hash('test123', 10);
        
        await db.collection('users').insertOne({
            email: 'test@example.com',
            password: hashedPassword,
            subscription: 'premium',
            createdAt: new Date(),
            preferences: {}
        });
        
        console.log('Test user created successfully');
    } catch (error) {
        console.error('Error creating test user:', error);
    } finally {
        await client.close();
    }
}

createTestUser();