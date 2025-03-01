require('dotenv').config();
const { MongoClient } = require('mongodb');
const leagues = require('../utils/leagues.js'); 

const MONGODB_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics';

async function seedGames() {
    const client = await MongoClient.connect(MONGODB_URI);
    try {
        const db = client.db('sports-analytics');
        
        // Clear existing games
        await db.collection('games').deleteMany({});
        
        const games = [];
        const leagueKeys = Object.keys(leagues);
        
        for (const league of leagueKeys) {
            const teams = leagues[league].teams;
            // Generate last 30 days of games
            for (let i = 0; i < 30; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                
                // Generate 3-5 games per day
                const numGames = Math.floor(Math.random() * 3) + 3;
                for (let j = 0; j < numGames; j++) {
                    // Random team selection
                    const homeTeamIndex = Math.floor(Math.random() * teams.length);
                    let awayTeamIndex;
                    do {
                        awayTeamIndex = Math.floor(Math.random() * teams.length);
                    } while (awayTeamIndex === homeTeamIndex);

                    const homeTeam = teams[homeTeamIndex];
                    const awayTeam = teams[awayTeamIndex];

                    // Generate scores based on league
                    const homeScore = generateScore(league);
                    const awayScore = generateScore(league);

                    games.push({
                        league: league.toUpperCase(),
                        date: date,
                        homeTeam: {
                            id: homeTeam.id,
                            name: homeTeam.name,
                            score: homeScore
                        },
                        awayTeam: {
                            id: awayTeam.id,
                            name: awayTeam.name,
                            score: awayScore
                        },
                        status: 'completed',
                        stats: generateStats(league),
                        venue: `${homeTeam.name} Stadium`,
                        attendance: Math.floor(Math.random() * 20000) + 10000
                    });
                }
            }

            // Add some live games
            const numLiveGames = Math.floor(Math.random() * 2) + 1;
            for (let i = 0; i < numLiveGames; i++) {
                const homeTeamIndex = Math.floor(Math.random() * teams.length);
                let awayTeamIndex;
                do {
                    awayTeamIndex = Math.floor(Math.random() * teams.length);
                } while (awayTeamIndex === homeTeamIndex);

                games.push({
                    league: league.toUpperCase(),
                    date: new Date(),
                    homeTeam: {
                        id: teams[homeTeamIndex].id,
                        name: teams[homeTeamIndex].name,
                        score: Math.floor(Math.random() * 50)
                    },
                    awayTeam: {
                        id: teams[awayTeamIndex].id,
                        name: teams[awayTeamIndex].name,
                        score: Math.floor(Math.random() * 50)
                    },
                    status: 'live',
                    stats: generateStats(league),
                    venue: `${teams[homeTeamIndex].name} Stadium`,
                    attendance: Math.floor(Math.random() * 20000) + 10000
                });
            }
        }

        // Insert all games
        await db.collection('games').insertMany(games);
        console.log(`Seeded ${games.length} games`);

    } catch (error) {
        console.error('Error seeding games:', error);
    } finally {
        await client.close();
    }
}

function generateScore(league) {
    switch(league.toLowerCase()) {
        case 'nba':
            return Math.floor(Math.random() * 40) + 80;
        case 'nhl':
            return Math.floor(Math.random() * 6) + 1;
        case 'mlb':
            return Math.floor(Math.random() * 10) + 1;
        case 'nfl':
            return Math.floor(Math.random() * 35) + 7;
        default:
            return Math.floor(Math.random() * 5) + 1;
    }
}

function generateStats(league) {
    switch(league.toLowerCase()) {
        case 'nba':
            return {
                home: {
                    fgPercentage: Math.floor(Math.random() * 20) + 40,
                    rebounds: Math.floor(Math.random() * 30) + 30,
                    assists: Math.floor(Math.random() * 20) + 15,
                    steals: Math.floor(Math.random() * 10) + 5
                },
                away: {
                    fgPercentage: Math.floor(Math.random() * 20) + 40,
                    rebounds: Math.floor(Math.random() * 30) + 30,
                    assists: Math.floor(Math.random() * 20) + 15,
                    steals: Math.floor(Math.random() * 10) + 5
                }
            };
        case 'nfl':
            return {
                home: {
                    passingYards: Math.floor(Math.random() * 300) + 100,
                    rushingYards: Math.floor(Math.random() * 200) + 50,
                    turnovers: Math.floor(Math.random() * 4)
                },
                away: {
                    passingYards: Math.floor(Math.random() * 300) + 100,
                    rushingYards: Math.floor(Math.random() * 200) + 50,
                    turnovers: Math.floor(Math.random() * 4)
                }
            };
        default:
            return {
                home: {
                    shotsOnGoal: Math.floor(Math.random() * 20) + 10,
                    possession: Math.floor(Math.random() * 30) + 35
                },
                away: {
                    shotsOnGoal: Math.floor(Math.random() * 20) + 10,
                    possession: Math.floor(Math.random() * 30) + 35
                }
            };
    }
}

seedGames().then(() => {
    console.log('Seeding completed');
    process.exit(0);
}).catch(error => {
    console.error('Seeding failed:', error);
    process.exit(1);
});