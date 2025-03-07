const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics';

async function createTestUsers() {
    let client;
    try {
        client = await MongoClient.connect(MONGODB_URI);
        const db = client.db('sports-analytics');
        
        // Delete existing test users
        await db.collection('users').deleteMany({ 
            email: { 
                $in: ['test@example.com', 'admin@sportsanalytics.com'] 
            } 
        });

        // Create regular test user
        const testUserPassword = await bcrypt.hash('test123', 10);
        const testUser = await db.collection('users').insertOne({
            email: 'test@example.com',
            password: testUserPassword,
            roles: ['user'],
            subscription: 'PRO',
            createdAt: new Date(),
            updatedAt: new Date(),
            active: true,
            verified: true
        });

        // Create admin test user
        const adminPassword = await bcrypt.hash('admin123', 10);
        const adminUser = await db.collection('users').insertOne({
            email: 'admin@sportsanalytics.com',
            password: adminPassword,
            roles: ['admin', 'user'],
            subscription: 'ENTERPRISE',
            createdAt: new Date(),
            updatedAt: new Date(),
            active: true,
            verified: true
        });

        // Create subscription records
        await db.collection('subscriptions').deleteMany({
            userId: { $in: [testUser.insertedId, adminUser.insertedId] }
        });

        await db.collection('subscriptions').insertMany([
            {
                userId: testUser.insertedId,
                tier: 'PRO',
                startDate: new Date(),
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                status: 'active',
                features: ['SINGLE_FACTOR', 'MULTI_FACTOR', 'PLAYER_STATS'],
                createdAt: new Date()
            },
            {
                userId: adminUser.insertedId,
                tier: 'ENTERPRISE',
                startDate: new Date(),
                expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
                status: 'active',
                features: ['SINGLE_FACTOR', 'MULTI_FACTOR', 'PLAYER_STATS', 'TEAM_PERFORMANCE', 'GAME_OUTCOME'],
                createdAt: new Date()
            }
        ]);
        
        console.log('Test users created successfully');
        console.log('Regular User - Email: test@example.com, Password: test123');
        console.log('Admin User - Email: admin@sportsanalytics.com, Password: admin123');
    } catch (error) {
        console.error('Error creating test users:', error);
    } finally {
        if (client) await client.close();
    }
}

createTestUsers().then(() => process.exit(0));