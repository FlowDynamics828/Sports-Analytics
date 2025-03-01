// scripts/clean-db.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const readline = require('readline');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function confirmCleanup() {
    return new Promise((resolve) => {
        rl.question(`Are you sure you want to clean the database '${DB_NAME}'? This cannot be undone! (yes/no) `, answer => {
            resolve(answer.toLowerCase() === 'yes');
            rl.close();
        });
    });
}

async function cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
        const confirmed = await confirmCleanup();
        if (!confirmed) {
            console.log('Database cleanup cancelled');
            process.exit(0);
        }
    }

    let client;
    try {
        client = await MongoClient.connect(MONGODB_URI);
        const db = client.db(DB_NAME);
        
        // Drop collections if they exist
        const collections = [
            'users', 
            'games', 
            'teams', 
            'predictions', 
            'stats', 
            'errorLogs',
            'subscriptions',
            'analytics'
        ];

        for (const collection of collections) {
            try {
                await db.collection(collection).drop();
                console.log(`Dropped collection: ${collection}`);
            } catch (error) {
                if (error.code !== 26) { // 26 is collection doesn't exist
                    console.error(`Error dropping ${collection}:`, error);
                }
            }
        }
        
        // Recreate collections with indexes
        await db.createCollection('users');
        await db.collection('users').createIndex(
            { email: 1 }, 
            { unique: true }
        );

        await db.createCollection('games');
        await db.collection('games').createIndex(
            { date: 1, league: 1 }
        );

        await db.createCollection('predictions');
        await db.collection('predictions').createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days TTL
        );

        console.log('Database cleaned and reinitialized successfully');
    } catch (error) {
        console.error('Error cleaning database:', error);
        process.exit(1);
    } finally {
        if (client) await client.close();
    }
}

cleanDatabase().then(() => process.exit(0));