require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics';

async function resetTestUser() {
    let client;
    try {
        client = await MongoClient.connect(MONGODB_URI);
        const db = client.db('sports-analytics');
        
        // Delete existing test user
        await db.collection('users').deleteOne({ email: 'test@example.com' });
        console.log('Deleted existing test user');

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
        console.error('Error resetting test user:', error);
    } finally {
        if (client) await client.close();
    }
}

resetTestUser().then(() => process.exit(0));