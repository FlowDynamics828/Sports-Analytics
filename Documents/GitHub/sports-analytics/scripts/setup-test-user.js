require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function setupTestUser() {
    let client;
    try {
        client = await MongoClient.connect('mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics');
        const db = client.db('sports-analytics');
        
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
    } finally {
        if (client) await client.close();
    }
}

setupTestUser().then(() => process.exit(0));