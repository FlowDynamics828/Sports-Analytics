require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority';

// Sample game data
const sampleGames = {
    NBA: [
        {
            league: 'NBA',
            date: new Date('2024-01-31'),
            homeTeam: { id: 'lakers', name: 'Los Angeles Lakers', score: 115 },
            awayTeam: { id: 'warriors', name: 'Golden State Warriors', score: 108 }
        },
        {
            league: 'NBA',
            date: new Date('2024-01-30'),
            homeTeam: { id: 'celtics', name: 'Boston Celtics', score: 129 },
            awayTeam: { id: 'pacers', name: 'Indiana Pacers', score: 124 }
        }
    ],
    NFL: [
        {
            league: 'NFL',
            date: new Date('2024-01-28'),
            homeTeam: { id: 'ravens', name: 'Baltimore Ravens', score: 24 },
            awayTeam: { id: 'chiefs', name: 'Kansas City Chiefs', score: 17 }
        }
    ]
};

async function seedDatabase() {
    let client;
    try {
        client = await MongoClient.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const db = client.db('sports-analytics');
        const gamesCollection = db.collection('games');

        // Clear existing games
        await gamesCollection.deleteMany({});
        console.log('Cleared existing games');

        // Insert NBA games
        await gamesCollection.insertMany(sampleGames.NBA);
        console.log('Inserted NBA games');

        // Insert NFL games
        await gamesCollection.insertMany(sampleGames.NFL);
        console.log('Inserted NFL games');

        console.log('Database seeded successfully');
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        if (client) {
            await client.close();
            console.log('Database connection closed');
        }
    }
}

// Run the seeder
seedDatabase().catch(console.error);