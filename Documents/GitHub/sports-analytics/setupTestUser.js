require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function setupTestUser() {
    // Use your existing MongoDB connection string from .env
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    try {
        console.log('Connecting to database...');
        const db = client.db('sports-analytics');
        
        // Create test user
        const hashedPassword = await bcrypt.hash('test123', 10);
        
        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ email: 'test@example.com' });
        
        if (existingUser) {
            console.log('Test user already exists, updating password...');
            await db.collection('users').updateOne(
                { email: 'test@example.com' },
                { 
                    $set: { 
                        password: hashedPassword,
                        subscription: 'premium',
                        updatedAt: new Date()
                    } 
                }
            );
        } else {
            console.log('Creating new test user...');
            await db.collection('users').insertOne({
                email: 'test@example.com',
                password: hashedPassword,
                subscription: 'premium',
                createdAt: new Date(),
                preferences: {}
            });
        }
        
        console.log('=================================');
        console.log('Test user setup complete!');
        console.log('Use these credentials to login:');
        console.log('Email: test@example.com');
        console.log('Password: test123');
        console.log('=================================');
    } catch (error) {
        console.error('Error setting up test user:', error);
    } finally {
        await client.close();
    }
}

setupTestUser();