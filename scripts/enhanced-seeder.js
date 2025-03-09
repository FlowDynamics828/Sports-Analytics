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

        // Add player stats generation
        await seedPlayerStats();

    } catch (error) {
        console.error('Error seeding games:', error);
    } finally {
        await client.close();
    }
}

async function seedPlayerStats() {
    const client = await MongoClient.connect(MONGODB_URI);
    try {
        const db = client.db('sports-analytics');
        
        for (const league of Object.keys(leagues)) {
            const leagueKey = league.toLowerCase();
            const collectionName = `${leagueKey}_player_stats`;
            
            // Get games for this league
            const games = await db.collection('games')
                .find({ league: leagueKey })
                .toArray();
                
            // Generate player stats for each game
            const playerStats = [];
            
            for (const game of games) {
                // Get players for home and away teams
                const homeTeamPlayers = await getTeamPlayers(game.homeTeam.id);
                const awayTeamPlayers = await getTeamPlayers(game.awayTeam.id);
                
                // Generate stats for each player
                homeTeamPlayers.forEach(player => {
                    playerStats.push(generatePlayerStats(player, game, true));
                });
                
                awayTeamPlayers.forEach(player => {
                    playerStats.push(generatePlayerStats(player, game, false));
                });
            }
            
            // Insert player stats
            if (playerStats.length > 0) {
                await db.collection(collectionName).insertMany(playerStats);
                console.log(`Seeded ${playerStats.length} player stats for ${league}`);
            }
        }
    } catch (error) {
        console.error('Error seeding player stats:', error);
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

async function getTeamPlayers(teamId) {
    // Mock function to return a list of players for a team
    // In a real scenario, this would fetch from a database
    const players = [];
    const numPlayers = Math.floor(Math.random() * 5) + 10; // 10-15 players per team
    
    for (let i = 0; i < numPlayers; i++) {
        players.push({
            id: `player_${teamId}_${i}`,
            name: `Player ${i} of Team ${teamId}`,
            position: getRandomPosition(),
            teamId: teamId
        });
    }
    
    return players;
}

function getRandomPosition() {
    const positions = ['PG', 'SG', 'SF', 'PF', 'C', 'QB', 'RB', 'WR', 'TE', 'LW', 'RW', 'C', 'D', 'G'];
    return positions[Math.floor(Math.random() * positions.length)];
}

function generatePlayerStats(player, game, isHome) {
    // Get appropriate stat generator based on league
    const statGenerator = getStatGenerator(game.league);
    
    return {
        playerId: player.id,
        playerName: player.name,
        teamId: isHome ? game.homeTeam.id : game.awayTeam.id,
        gameId: game._id,
        league: game.league,
        date: game.date,
        season: getCurrentSeason(game.date),
        stats: statGenerator(player, game, isHome),
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

function getStatGenerator(league) {
    switch(league.toLowerCase()) {
        case 'nba':
            return (player, game, isHome) => ({
                minutes: Math.floor(Math.random() * 30) + 10,
                points: Math.floor(Math.random() * 25) + 2,
                rebounds: Math.floor(Math.random() * 10) + 1,
                assists: Math.floor(Math.random() * 8) + 1,
                steals: Math.floor(Math.random() * 3),
                blocks: Math.floor(Math.random() * 2),
                fgMade: Math.floor(Math.random() * 10) + 1,
                fgAttempted: Math.floor(Math.random() * 15) + 10,
                threePtMade: Math.floor(Math.random() * 5),
                threePtAttempted: Math.floor(Math.random() * 8) + 1,
                ftMade: Math.floor(Math.random() * 5),
                ftAttempted: Math.floor(Math.random() * 6) + 1,
                turnovers: Math.floor(Math.random() * 4)
            });
        case 'nfl':
            return (player, game, isHome) => {
                // Different stats based on position
                if (player.position === 'QB') {
                    return {
                        passAttempts: Math.floor(Math.random() * 30) + 10,
                        passCompletions: Math.floor(Math.random() * 20) + 5,
                        passYards: Math.floor(Math.random() * 300) + 100,
                        passTouchdowns: Math.floor(Math.random() * 3),
                        interceptions: Math.floor(Math.random() * 2),
                        rushAttempts: Math.floor(Math.random() * 5),
                        rushYards: Math.floor(Math.random() * 30),
                        rushTouchdowns: Math.floor(Math.random() * 1)
                    };
                } else if (['RB', 'WR', 'TE'].includes(player.position)) {
                    return {
                        rushAttempts: player.position === 'RB' ? Math.floor(Math.random() * 20) + 5 : Math.floor(Math.random() * 2),
                        rushYards: player.position === 'RB' ? Math.floor(Math.random() * 100) + 20 : Math.floor(Math.random() * 10),
                        rushTouchdowns: Math.floor(Math.random() * 2),
                        receptions: player.position === 'RB' ? Math.floor(Math.random() * 5) : Math.floor(Math.random() * 8) + 1,
                        receivingYards: player.position === 'RB' ? Math.floor(Math.random() * 50) : Math.floor(Math.random() * 100) + 10,
                        receivingTouchdowns: Math.floor(Math.random() * 2)
                    };
                } else {
                    return {
                        tackles: Math.floor(Math.random() * 8) + 1,
                        sacks: Math.floor(Math.random() * 2),
                        interceptions: Math.floor(Math.random() * 1),
                        forcedFumbles: Math.floor(Math.random() * 1)
                    };
                }
            };
        case 'mlb':
            return (player, game, isHome) => ({
                atBats: Math.floor(Math.random() * 5) + 1,
                runs: Math.floor(Math.random() * 2),
                hits: Math.floor(Math.random() * 3),
                doubles: Math.floor(Math.random() * 2),
                triples: Math.floor(Math.random() * 1),
                homeRuns: Math.floor(Math.random() * 1),
                rbi: Math.floor(Math.random() * 3),
                strikeouts: Math.floor(Math.random() * 3),
                walks: Math.floor(Math.random() * 2),
                stolenBases: Math.floor(Math.random() * 1)
            });
        case 'nhl':
            return (player, game, isHome) => {
                if (player.position === 'G') {
                    return {
                        saves: Math.floor(Math.random() * 30) + 10,
                        shotsAgainst: Math.floor(Math.random() * 35) + 15,
                        goalsAgainst: isHome ? game.awayTeam.score : game.homeTeam.score,
                        shutout: (isHome && game.awayTeam.score === 0) || (!isHome && game.homeTeam.score === 0) ? 1 : 0
                    };
                } else {
                    return {
                        goals: Math.floor(Math.random() * 2),
                        assists: Math.floor(Math.random() * 2),
                        shots: Math.floor(Math.random() * 5) + 1,
                        hits: Math.floor(Math.random() * 3),
                        blocks: Math.floor(Math.random() * 2),
                        plusMinus: Math.floor(Math.random() * 5) - 2,
                        penaltyMinutes: Math.floor(Math.random() * 4)
                    };
                }
            };
        default: // Soccer leagues (Premier League, La Liga, etc.)
            return (player, game, isHome) => {
                if (player.position === 'G') {
                    return {
                        saves: Math.floor(Math.random() * 6) + 1,
                        goalsAgainst: isHome ? game.awayTeam.score : game.homeTeam.score,
                        cleanSheet: (isHome && game.awayTeam.score === 0) || (!isHome && game.homeTeam.score === 0) ? 1 : 0
                    };
                } else {
                    return {
                        goals: Math.floor(Math.random() * 2),
                        assists: Math.floor(Math.random() * 2),
                        shots: Math.floor(Math.random() * 3),
                        shotsOnTarget: Math.floor(Math.random() * 2),
                        passes: Math.floor(Math.random() * 50) + 20,
                        tackles: Math.floor(Math.random() * 5),
                        interceptions: Math.floor(Math.random() * 4),
                        fouls: Math.floor(Math.random() * 3),
                        yellowCards: Math.random() < 0.1 ? 1 : 0,
                        redCards: Math.random() < 0.02 ? 1 : 0
                    };
                }
            };
    }
}

function getCurrentSeason(gameDate) {
    const year = gameDate.getFullYear();
    const month = gameDate.getMonth();
    
    // Different sports have different season spans
    // For simplicity, using a general approach
    return month >= 8 ? `${year}-${year+1}` : `${year-1}-${year}`;
}

seedGames().then(() => {
    console.log('Seeding completed');
    process.exit(0);
}).catch(error => {
    console.error('Seeding failed:', error);
    process.exit(1);
});