// debug.js - Put this in your root directory
require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function debugAuth() {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    try {
        console.log('Checking database connection...');
        const db = client.db('sports-analytics');
        
        // Check for test user
        const user = await db.collection('users').findOne({ email: 'test@example.com' });
        console.log('\nTest user status:');
        console.log('------------------');
        if (user) {
            console.log('✓ Test user exists');
            console.log('Email:', user.email);
            console.log('Subscription:', user.subscription);
            console.log('Created:', user.createdAt);
        } else {
            console.log('✗ Test user not found');
            
            // Create test user if not exists
            console.log('\nCreating test user...');
            const hashedPassword = await bcrypt.hash('test123', 10);
            await db.collection('users').insertOne({
                email: 'test@example.com',
                password: hashedPassword,
                subscription: 'premium',
                createdAt: new Date(),
                preferences: {}
            });
            console.log('✓ Test user created');
        }

        console.log('\nLogin credentials:');
        console.log('------------------');
        console.log('Email: test@example.com');
        console.log('Password: test123');
        
    } catch (error) {
        console.error('Debug error:', error);
    } finally {
        await client.close();
    }
}

debugAuth();