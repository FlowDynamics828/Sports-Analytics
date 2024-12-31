require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createTestUser() {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    try {
        const db = client.db('sports-analytics');
        const hashedPassword = await bcrypt.hash('TestPass123!', 10);
        
        await db.collection('users').insertOne({
            email: 'test@example.com',
            password: hashedPassword,
            subscription: 'basic'
        });
        
        console.log('Test user created successfully');
    } catch (error) {
        console.error('Error creating test user:', error);
    } finally {
        await client.close();
    }
}

createTestUser();