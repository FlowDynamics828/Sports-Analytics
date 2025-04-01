/**
 * Script to populate the database with sample data for testing
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const logger = console;

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';

// List of all supported leagues
const LEAGUES = [
  'NFL', 
  'NBA', 
  'MLB', 
  'NHL', 
  'PREMIER_LEAGUE', 
  'LA_LIGA', 
  'SERIE_A', 
  'BUNDESLIGA'
];

// Generate sample data for a specific league
async function generateSampleDataForLeague(db, league) {
  try {
    // Generate sample teams
    const teamCount = league === 'NFL' ? 32 : 
                     league === 'NBA' ? 30 : 
                     league === 'MLB' ? 30 : 
                     league === 'NHL' ? 32 : 
                     ['PREMIER_LEAGUE', 'LA_LIGA', 'SERIE_A'].includes(league) ? 20 : 
                     league === 'BUNDESLIGA' ? 18 : 20;
    
    logger.log(`Generating ${teamCount} teams for ${league}...`);
    
    const teams = [];
    for (let i = 1; i <= teamCount; i++) {
        teams.push({
            teamId: `${league.toLowerCase()}_team_${i}`,
            name: `${league} Team ${i}`,
            league: league,
            city: `City ${i}`,
            venue: `${league} Stadium ${i}`,
            logo: `/assets/logos/${league.toLowerCase()}/${i}.png`,
            founded: 1900 + Math.floor(Math.random() * 123),
            stats: {
                wins: Math.floor(Math.random() * 60),
                losses: Math.floor(Math.random() * 40),
                ties: league === 'NFL' ? Math.floor(Math.random() * 5) : 0,
                rank: Math.floor(Math.random() * teamCount) + 1,
                points: Math.floor(Math.random() * 120),
                homeRecord: `${Math.floor(Math.random() * 30)}-${Math.floor(Math.random() * 20)}`,
                awayRecord: `${Math.floor(Math.random() * 30)}-${Math.floor(Math.random() * 20)}`
            }
        });
    }
    
    // Insert teams
    await db.collection('teams').insertMany(teams);
    logger.log(`✅ ${teams.length} teams inserted for ${league}`);
    
    // Generate players for each team
    const playerCount = league === 'NFL' ? 53 : 
                       league === 'NBA' ? 15 : 
                       league === 'MLB' ? 26 : 
                       league === 'NHL' ? 23 : 25;
    
    const positions = {
        'NFL': ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DT', 'DE', 'LB', 'CB', 'S', 'K', 'P'],
        'NBA': ['PG', 'SG', 'SF', 'PF', 'C'],
        'MLB': ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
        'NHL': ['G', 'D', 'LW', 'C', 'RW'],
        'PREMIER_LEAGUE': ['GK', 'DF', 'MF', 'FW'],
        'LA_LIGA': ['GK', 'DF', 'MF', 'FW'],
        'SERIE_A': ['GK', 'DF', 'MF', 'FW'],
        'BUNDESLIGA': ['GK', 'DF', 'MF', 'FW']
    };
    
    logger.log(`Generating ${playerCount} players for each team in ${league}...`);
    
    const allPlayers = [];
    
    for (const team of teams) {
        for (let i = 1; i <= playerCount; i++) {
            const position = positions[league][Math.floor(Math.random() * positions[league].length)];
            
            const player = {
                playerId: `${team.teamId}_player_${i}`,
                teamId: team.teamId,
                name: `Player ${i} ${team.name}`,
                league: league,
                position: position,
                jersey: Math.floor(Math.random() * 99) + 1,
                nationality: ['USA', 'Canada', 'UK', 'France', 'Germany', 'Spain', 'Italy'][Math.floor(Math.random() * 7)],
                birthDate: new Date(1980 + Math.floor(Math.random() * 20), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
                height: 170 + Math.floor(Math.random() * 30),
                weight: 70 + Math.floor(Math.random() * 40),
                photo: `/assets/players/${league.toLowerCase()}/${Math.floor(Math.random() * 10) + 1}.jpg`,
                statistics: {
                    // Add statistics based on position and league
                    current: generatePlayerStats(league, position),
                    career: generatePlayerStats(league, position, true)
                }
            };
            
            allPlayers.push(player);
        }
    }
    
    // Insert players in batches to avoid MongoDB document size limits
    const batchSize = 100;
    for (let i = 0; i < allPlayers.length; i += batchSize) {
        const batch = allPlayers.slice(i, i + batchSize);
        await db.collection('players').insertMany(batch);
        logger.log(`  Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allPlayers.length/batchSize)} for ${league} players`);
    }
    
    logger.log(`✅ ${allPlayers.length} players inserted for ${league}`);
    
    // Generate games
    const games = [];
    const now = new Date();
    
    logger.log(`Generating past and upcoming games for ${league}...`);
    
    // Past games
    for (let i = 0; i < 50; i++) {
        const gameDate = new Date(now);
        gameDate.setDate(gameDate.getDate() - Math.floor(Math.random() * 60) - 1);
        
        // Select two random teams
        const teamIndices = [];
        while (teamIndices.length < 2) {
            const index = Math.floor(Math.random() * teams.length);
            if (!teamIndices.includes(index)) {
                teamIndices.push(index);
            }
        }
        
        const homeTeam = teams[teamIndices[0]];
        const awayTeam = teams[teamIndices[1]];
        
        // Generate scores based on league
        let homeScore, awayScore;
        if (league === 'NBA') {
            homeScore = Math.floor(Math.random() * 40) + 80;
            awayScore = Math.floor(Math.random() * 40) + 80;
        } else if (league === 'NFL') {
            homeScore = Math.floor(Math.random() * 35) + 10;
            awayScore = Math.floor(Math.random() * 35) + 10;
        } else if (league === 'MLB') {
            homeScore = Math.floor(Math.random() * 10);
            awayScore = Math.floor(Math.random() * 10);
        } else if (league === 'NHL') {
            homeScore = Math.floor(Math.random() * 6);
            awayScore = Math.floor(Math.random() * 6);
        } else {
            // Soccer leagues
            homeScore = Math.floor(Math.random() * 4);
            awayScore = Math.floor(Math.random() * 4);
        }
        
        games.push({
            gameId: `${league.toLowerCase()}_game_${i}`,
            league: league,
            gameDate: gameDate,
            homeTeamId: homeTeam.teamId,
            homeTeamName: homeTeam.name,
            awayTeamId: awayTeam.teamId,
            awayTeamName: awayTeam.name,
            venue: homeTeam.venue,
            status: 'completed',
            homeScore: homeScore,
            awayScore: awayScore,
            winner: homeScore > awayScore ? homeTeam.teamId : (awayScore > homeScore ? awayTeam.teamId : 'draw'),
            attendance: Math.floor(Math.random() * 20000) + 10000
        });
    }
    
    // Upcoming games
    for (let i = 0; i < 20; i++) {
        const gameDate = new Date(now);
        gameDate.setDate(gameDate.getDate() + Math.floor(Math.random() * 30) + 1);
        
        // Select two random teams
        const teamIndices = [];
        while (teamIndices.length < 2) {
            const index = Math.floor(Math.random() * teams.length);
            if (!teamIndices.includes(index)) {
                teamIndices.push(index);
            }
        }
        
        const homeTeam = teams[teamIndices[0]];
        const awayTeam = teams[teamIndices[1]];
        
        games.push({
            gameId: `${league.toLowerCase()}_upcoming_${i}`,
            league: league,
            gameDate: gameDate,
            homeTeamId: homeTeam.teamId,
            homeTeamName: homeTeam.name,
            awayTeamId: awayTeam.teamId,
            awayTeamName: awayTeam.name,
            venue: homeTeam.venue,
            status: 'scheduled',
            broadcast: ['ESPN', 'FOX', 'NBC', 'CBS', 'ABC'][Math.floor(Math.random() * 5)]
        });
    }
    
    // Insert games
    await db.collection('games').insertMany(games);
    logger.log(`✅ ${games.length} games inserted for ${league}`);
    
    return {
        teams: teams.length,
        players: allPlayers.length,
        games: games.length
    };
  } catch (error) {
    logger.error(`Error generating data for ${league}:`, error);
    throw error;
  }
}

// Generate random statistics based on position and league
function generatePlayerStats(league, position, isCareer = false) {
  const multiplier = isCareer ? Math.floor(Math.random() * 5) + 3 : 1;

  // Common stats for all leagues
  const commonStats = {
    gamesPlayed: Math.floor(Math.random() * 50 * multiplier) + 10,
    gamesStarted: Math.floor(Math.random() * 40 * multiplier) + 5,
  };

  // League-specific stats
  if (league === 'NFL') {
    if (['QB'].includes(position)) {
      return {
        ...commonStats,
        passingYards: Math.floor(Math.random() * 3000 * multiplier) + 500,
        passingTouchdowns: Math.floor(Math.random() * 25 * multiplier) + 5,
        interceptions: Math.floor(Math.random() * 12 * multiplier) + 1,
        completions: Math.floor(Math.random() * 300 * multiplier) + 100,
        attempts: Math.floor(Math.random() * 450 * multiplier) + 150,
        rushingYards: Math.floor(Math.random() * 300 * multiplier) + 50,
        rushingTouchdowns: Math.floor(Math.random() * 3 * multiplier),
      };
    } else if (['RB'].includes(position)) {
      return {
        ...commonStats,
        rushingYards: Math.floor(Math.random() * 1000 * multiplier) + 200,
        rushingTouchdowns: Math.floor(Math.random() * 10 * multiplier) + 2,
        receptions: Math.floor(Math.random() * 30 * multiplier) + 10,
        receivingYards: Math.floor(Math.random() * 300 * multiplier) + 50,
        receivingTouchdowns: Math.floor(Math.random() * 3 * multiplier),
      };
    } else if (['WR', 'TE'].includes(position)) {
      return {
        ...commonStats,
        receptions: Math.floor(Math.random() * 70 * multiplier) + 20,
        receivingYards: Math.floor(Math.random() * 900 * multiplier) + 200,
        receivingTouchdowns: Math.floor(Math.random() * 8 * multiplier) + 1,
      };
    } else if (['DT', 'DE', 'LB', 'CB', 'S'].includes(position)) {
      return {
        ...commonStats,
        tackles: Math.floor(Math.random() * 60 * multiplier) + 20,
        sacks: Math.floor(Math.random() * 8 * multiplier) + 1,
        interceptions: Math.floor(Math.random() * 3 * multiplier),
        forcedFumbles: Math.floor(Math.random() * 2 * multiplier),
      };
    } else if (['K', 'P'].includes(position)) {
      return {
        ...commonStats,
        fieldGoals: Math.floor(Math.random() * 25 * multiplier) + 10,
        fieldGoalAttempts: Math.floor(Math.random() * 30 * multiplier) + 15,
        punts: Math.floor(Math.random() * 40 * multiplier) + 20,
        puntYards: Math.floor(Math.random() * 1800 * multiplier) + 1000,
      };
    } else {
      return commonStats;
    }
  } else if (league === 'NBA') {
    return {
      ...commonStats,
      points: Math.floor(Math.random() * 15 * multiplier) + 5,
      rebounds: Math.floor(Math.random() * 7 * multiplier) + 2,
      assists: Math.floor(Math.random() * 5 * multiplier) + 1,
      steals: Math.floor(Math.random() * 2 * multiplier),
      blocks: Math.floor(Math.random() * 1.5 * multiplier),
      fieldGoalPercentage: (Math.random() * 0.2 + 0.4).toFixed(3),
      threePointPercentage: (Math.random() * 0.15 + 0.3).toFixed(3),
      freeThrowPercentage: (Math.random() * 0.2 + 0.7).toFixed(3),
      minutesPerGame: Math.floor(Math.random() * 20) + 10,
    };
  } else if (league === 'MLB') {
    if (position === 'P') {
      return {
        ...commonStats,
        wins: Math.floor(Math.random() * 12 * multiplier) + 3,
        losses: Math.floor(Math.random() * 10 * multiplier) + 2,
        era: (Math.random() * 4 + 2).toFixed(2),
        inningsPitched: Math.floor(Math.random() * 160 * multiplier) + 40,
        strikeouts: Math.floor(Math.random() * 180 * multiplier) + 30,
        walks: Math.floor(Math.random() * 60 * multiplier) + 15,
        whip: (Math.random() + 0.8).toFixed(2),
      };
    } else {
      return {
        ...commonStats,
        battingAverage: (Math.random() * 0.15 + 0.2).toFixed(3),
        homeRuns: Math.floor(Math.random() * 25 * multiplier) + 5,
        rbi: Math.floor(Math.random() * 70 * multiplier) + 20,
        obp: (Math.random() * 0.1 + 0.3).toFixed(3),
        slg: (Math.random() * 0.2 + 0.4).toFixed(3),
        ops: (Math.random() * 0.3 + 0.7).toFixed(3),
        atBats: Math.floor(Math.random() * 400 * multiplier) + 100,
        hits: Math.floor(Math.random() * 140 * multiplier) + 30,
      };
    }
  } else if (league === 'NHL') {
    return {
      ...commonStats,
      goals: Math.floor(Math.random() * 20 * multiplier) + 5,
      assists: Math.floor(Math.random() * 30 * multiplier) + 10,
      points: Math.floor(Math.random() * 45 * multiplier) + 15,
      plusMinus: Math.floor(Math.random() * 20 * multiplier) - 10,
      penaltyMinutes: Math.floor(Math.random() * 40 * multiplier) + 10,
      timeOnIce: Math.floor(Math.random() * 1200 * multiplier) + 500,
      shots: Math.floor(Math.random() * 150 * multiplier) + 50,
    };
  } else {
    // Soccer leagues
    if (position === 'GK') {
      return {
        ...commonStats,
        saves: Math.floor(Math.random() * 60 * multiplier) + 20,
        cleanSheets: Math.floor(Math.random() * 8 * multiplier) + 2,
        goalsConceded: Math.floor(Math.random() * 30 * multiplier) + 10,
        savePercentage: (Math.random() * 0.2 + 0.7).toFixed(2),
      };
    } else if (position === 'DF') {
      return {
        ...commonStats,
        tackles: Math.floor(Math.random() * 50 * multiplier) + 20,
        interceptions: Math.floor(Math.random() * 40 * multiplier) + 15,
        clearances: Math.floor(Math.random() * 70 * multiplier) + 30,
        blocks: Math.floor(Math.random() * 20 * multiplier) + 10,
        goals: Math.floor(Math.random() * 3 * multiplier),
        assists: Math.floor(Math.random() * 5 * multiplier) + 1,
      };
    } else if (position === 'MF') {
      return {
        ...commonStats,
        goals: Math.floor(Math.random() * 7 * multiplier) + 2,
        assists: Math.floor(Math.random() * 10 * multiplier) + 3,
        passAccuracy: (Math.random() * 0.15 + 0.7).toFixed(2),
        chancesCreated: Math.floor(Math.random() * 30 * multiplier) + 10,
        tackles: Math.floor(Math.random() * 40 * multiplier) + 15,
      };
    } else if (position === 'FW') {
      return {
        ...commonStats,
        goals: Math.floor(Math.random() * 15 * multiplier) + 5,
        assists: Math.floor(Math.random() * 8 * multiplier) + 2,
        shots: Math.floor(Math.random() * 70 * multiplier) + 30,
        shotsOnTarget: Math.floor(Math.random() * 40 * multiplier) + 15,
        chancesCreated: Math.floor(Math.random() * 25 * multiplier) + 10,
      };
    } else {
      return commonStats;
    }
  }
}

async function populateSampleData() {
  const client = new MongoClient(uri);
  
  try {
    console.log('🔄 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB successfully');
    
    const db = client.db();
    
    // Check if collections exist and create them
    const collections = ['teams', 'players', 'games'];
    const existingCollections = await db.listCollections().toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);
    
    for (const collection of collections) {
      if (!existingCollectionNames.includes(collection)) {
        await db.createCollection(collection);
        console.log(`Created collection: ${collection}`);
      }
    }
    
    // Clear existing data
    for (const collection of collections) {
      await db.collection(collection).deleteMany({});
      console.log(`Cleared collection: ${collection}`);
    }
    
    // Generate data for all leagues
    const totalCounts = {
      teams: 0,
      players: 0,
      games: 0
    };
    
    for (const league of LEAGUES) {
      console.log(`\n📊 Generating data for ${league}...`);
      const counts = await generateSampleDataForLeague(db, league);
      
      // Update totals
      totalCounts.teams += counts.teams;
      totalCounts.players += counts.players;
      totalCounts.games += counts.games;
      
      console.log(`✅ Completed data generation for ${league}`);
    }
    
    console.log('\n📈 Sample Data Generation Summary:');
    console.log(`Total teams inserted: ${totalCounts.teams}`);
    console.log(`Total players inserted: ${totalCounts.players}`);
    console.log(`Total games inserted: ${totalCounts.games}`);
    
  } catch (error) {
    console.error('❌ Error populating database:', error);
  } finally {
    await client.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the population
populateSampleData()
  .then(() => {
    console.log('\n✅ Database population complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Population failed:', err);
    process.exit(1);
  }); 