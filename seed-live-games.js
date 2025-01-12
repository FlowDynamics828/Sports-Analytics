require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics';

async function seedLiveGames() {
    const client = await MongoClient.connect(MONGODB_URI);
    try {
        const db = client.db('sports-analytics');
        
        // Clear existing live games
        await db.collection('games').deleteMany({ status: 'live' });

        // Insert new live games
        await db.collection('games').insertMany([
            {
                league: 'NBA',
                status: 'live',
                date: new Date(),
                homeTeam: {
                    id: 'lakers',
                    name: 'Los Angeles Lakers',
                    score: 87
                },
                awayTeam: {
                    id: 'warriors',
                    name: 'Golden State Warriors',
                    score: 82
                }
            },
            {
                league: 'NBA',
                status: 'live',
                date: new Date(),
                homeTeam: {
                    id: 'celtics',
                    name: 'Boston Celtics',
                    score: 92
                },
                awayTeam: {
                    id: 'nets',
                    name: 'Brooklyn Nets',
                    score: 88
                }
            },
            // Add games for other leagues
            {
                league: 'NFL',
                status: 'live',
                date: new Date(),
                homeTeam: {
                    id: 'chiefs',
                    name: 'Kansas City Chiefs',
                    score: 24
                },
                awayTeam: {
                    id: 'raiders',
                    name: 'Las Vegas Raiders',
                    score: 21
                }
            }
        ]);

        console.log('Live games seeded successfully');
    } catch (error) {
        console.error('Error seeding live games:', error);
    } finally {
        await client.close();
    }
}

seedLiveGames();