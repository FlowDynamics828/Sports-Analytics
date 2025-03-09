// scripts/enhanced-seed-player-stats.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

// League configurations - teams per league and players per team
const LEAGUE_CONFIG = {
  NFL: { teams: 32, playersPerTeam: 53 },  // NFL has 53-man rosters
  NBA: { teams: 30, playersPerTeam: 15 },  // NBA has 15-man rosters
  MLB: { teams: 30, playersPerTeam: 26 },  // MLB has 26-man rosters
  NHL: { teams: 32, playersPerTeam: 23 },  // NHL has 23-man rosters
  PREMIER_LEAGUE: { teams: 20, playersPerTeam: 25 }, // Premier League has ~25 players per team
  LA_LIGA: { teams: 20, playersPerTeam: 25 },        // La Liga has ~25 players per team
  BUNDESLIGA: { teams: 18, playersPerTeam: 25 },     // Bundesliga has ~25 players per team
  SERIE_A: { teams: 20, playersPerTeam: 25 }         // Serie A has ~25 players per team
};

// Common player positions by league
const POSITIONS = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C'],
  MLB: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
  NHL: ['C', 'RW', 'LW', 'D', 'G'],
  PREMIER_LEAGUE: ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST'],
  LA_LIGA: ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST'],
  BUNDESLIGA: ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST'],
  SERIE_A: ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST']
};

// Random team names per league for more realistic data
const TEAM_NAMES = {
  NFL: [
    'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
    'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
    'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
    'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
    'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
    'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants',
    'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
    'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders'
  ],
  NBA: [
    'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
    'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
    'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
    'Los Angeles Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat',
    'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans', 'New York Knicks',
    'Oklahoma City Thunder', 'Orlando Magic', 'Philadelphia 76ers', 'Phoenix Suns',
    'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs', 'Toronto Raptors',
    'Utah Jazz', 'Washington Wizards'
  ],
  MLB: [
    'Arizona Diamondbacks', 'Atlanta Braves', 'Baltimore Orioles', 'Boston Red Sox',
    'Chicago Cubs', 'Chicago White Sox', 'Cincinnati Reds', 'Cleveland Guardians',
    'Colorado Rockies', 'Detroit Tigers', 'Houston Astros', 'Kansas City Royals',
    'Los Angeles Angels', 'Los Angeles Dodgers', 'Miami Marlins', 'Milwaukee Brewers',
    'Minnesota Twins', 'New York Mets', 'New York Yankees', 'Oakland Athletics',
    'Philadelphia Phillies', 'Pittsburgh Pirates', 'San Diego Padres', 'San Francisco Giants',
    'Seattle Mariners', 'St. Louis Cardinals', 'Tampa Bay Rays', 'Texas Rangers',
    'Toronto Blue Jays', 'Washington Nationals'
  ],
  NHL: [
    'Anaheim Ducks', 'Arizona Coyotes', 'Boston Bruins', 'Buffalo Sabres',
    'Calgary Flames', 'Carolina Hurricanes', 'Chicago Blackhawks', 'Colorado Avalanche',
    'Columbus Blue Jackets', 'Dallas Stars', 'Detroit Red Wings', 'Edmonton Oilers',
    'Florida Panthers', 'Los Angeles Kings', 'Minnesota Wild', 'Montreal Canadiens',
    'Nashville Predators', 'New Jersey Devils', 'New York Islanders', 'New York Rangers',
    'Ottawa Senators', 'Philadelphia Flyers', 'Pittsburgh Penguins', 'San Jose Sharks',
    'Seattle Kraken', 'St. Louis Blues', 'Tampa Bay Lightning', 'Toronto Maple Leafs',
    'Vancouver Canucks', 'Vegas Golden Knights', 'Washington Capitals', 'Winnipeg Jets'
  ],
  PREMIER_LEAGUE: [
    'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton & Hove Albion',
    'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Liverpool',
    'Luton Town', 'Manchester City', 'Manchester United', 'Newcastle United', 'Nottingham Forest',
    'Sheffield United', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers', 'Ipswich Town'
  ],
  LA_LIGA: [
    'Athletic Bilbao', 'Atlético Madrid', 'Barcelona', 'Celta Vigo', 'Espanyol',
    'Getafe', 'Granada', 'Mallorca', 'Osasuna', 'Rayo Vallecano',
    'Real Betis', 'Real Madrid', 'Real Sociedad', 'Sevilla', 'Valencia',
    'Villarreal', 'Alavés', 'Las Palmas', 'Girona', 'Cádiz'
  ],
  BUNDESLIGA: [
    'Bayern Munich', 'Borussia Dortmund', 'Bayer Leverkusen', 'RB Leipzig', 'Union Berlin',
    'SC Freiburg', 'Eintracht Frankfurt', 'Wolfsburg', 'Mainz 05', 'Borussia Mönchengladbach',
    'FC Köln', 'Hoffenheim', 'Werder Bremen', 'VfL Bochum', 'FC Augsburg',
    'VfB Stuttgart', 'FC Heidenheim', 'Holstein Kiel'
  ],
  SERIE_A: [
    'AC Milan', 'Inter Milan', 'Juventus', 'Napoli', 'Roma',
    'Lazio', 'Fiorentina', 'Atalanta', 'Torino', 'Udinese',
    'Bologna', 'Empoli', 'Sassuolo', 'Spezia', 'Salernitana',
    'Lecce', 'Verona', 'Monza', 'Cremonese', 'Como'
  ]
};

async function seedPlayerStats() {
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(DB_NAME);
  
  for (const league of SUPPORTED_LEAGUES) {
    const collectionName = `${league.toLowerCase()}_player_stats`;
    const leagueConfig = LEAGUE_CONFIG[league];
    const teamCount = leagueConfig.teams;
    const playersPerTeam = leagueConfig.playersPerTeam;
    const teamNames = TEAM_NAMES[league];
    const positions = POSITIONS[league];
    
    console.log(`Seeding ${teamCount} teams with ${playersPerTeam} players each for ${league}...`);
    
    let totalInserted = 0;
    
    // Create 10 games for each league
    const games = [];
    for (let i = 1; i <= 10; i++) {
      games.push({
        gameId: `game_${league.toLowerCase()}_${i}`,
        date: new Date(2024, Math.floor(Math.random() * 11), Math.floor(Math.random() * 28) + 1) // Random date in 2024
      });
    }
    
    // Create players for each team
    for (let teamIndex = 0; teamIndex < teamCount; teamIndex++) {
      const teamId = `${league.toLowerCase()}_team_${teamIndex + 1}`;
      const teamName = teamNames[teamIndex % teamNames.length];
      
      const teamPlayers = [];
      
      // Create players for this team
      for (let playerIndex = 0; playerIndex < playersPerTeam; playerIndex++) {
        // Assign a random game to this player
        const randomGame = games[Math.floor(Math.random() * games.length)];
        
        // Assign a position based on the league
        const position = positions[Math.floor(Math.random() * positions.length)];
        
        // Determine if the player is a starter (first 5 players are typically starters)
        const isStarter = playerIndex < 5;
        
        // Create player with realistic minutes played based on starter status
        const minutesPlayed = isStarter ? 
          Math.floor(Math.random() * 15) + 25 : // Starters play 25-40 minutes
          Math.floor(Math.random() * 20) + 5;   // Bench players play 5-25 minutes
        
        teamPlayers.push({
          playerId: `${league.toLowerCase()}_${teamId}_player_${playerIndex + 1}`,
          playerName: `Player ${playerIndex + 1} (${teamName})`,
          teamId: teamId,
          teamName: teamName,
          gameId: randomGame.gameId,
          date: randomGame.date,
          league: league,
          season: '2024-2025',
          position: position,
          minutesPlayed: minutesPlayed,
          isStarter: isStarter,
          stats: generateStatsForLeague(league, position, minutesPlayed, isStarter),
          advancedMetrics: generateAdvancedMetrics(league, position),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // Insert team players in batches
      try {
        const result = await db.collection(collectionName).insertMany(teamPlayers);
        totalInserted += result.insertedCount;
        console.log(`Added ${result.insertedCount} players from ${teamName} to ${collectionName}`);
      } catch (error) {
        console.error(`Error adding ${teamName} players to ${collectionName}: ${error.message}`);
      }
    }
    
    console.log(`Completed seeding ${totalInserted} players for ${league}`);
  }
  
  console.log('All player stats seeding completed');
  await client.close();
}

function generateStatsForLeague(league, position, minutesPlayed, isStarter) {
  // Apply a performance multiplier for starters vs bench players
  const perfMultiplier = isStarter ? 1.5 : 0.8;
  
  // Adjust stats based on minutes played (more minutes = more stats)
  const minutesFactor = minutesPlayed / 30; // Normalize around 30 minutes
  
  // Position-specific adjustments
  const positionFactor = getPositionFactor(league, position);
  
  switch(league) {
    case 'NBA':
      return {
        points: Math.floor((Math.random() * 15 + 2) * perfMultiplier * minutesFactor * positionFactor.scoring),
        rebounds: Math.floor((Math.random() * 8 + 1) * perfMultiplier * minutesFactor * positionFactor.rebounding),
        assists: Math.floor((Math.random() * 6 + 1) * perfMultiplier * minutesFactor * positionFactor.playmaking),
        steals: Math.floor((Math.random() * 2) * perfMultiplier * minutesFactor),
        blocks: Math.floor((Math.random() * 1.5) * perfMultiplier * minutesFactor * positionFactor.defense),
        fieldGoalsMade: Math.floor((Math.random() * 6 + 1) * perfMultiplier * minutesFactor * positionFactor.scoring),
        fieldGoalsAttempted: Math.floor((Math.random() * 12 + 5) * perfMultiplier * minutesFactor * positionFactor.scoring),
        threePointersMade: Math.floor((Math.random() * 3) * perfMultiplier * minutesFactor * positionFactor.shooting),
        threePointersAttempted: Math.floor((Math.random() * 8) * perfMultiplier * minutesFactor * positionFactor.shooting),
        freeThrowsMade: Math.floor((Math.random() * 4) * perfMultiplier * minutesFactor),
        freeThrowsAttempted: Math.floor((Math.random() * 5) * perfMultiplier * minutesFactor),
        turnovers: Math.floor((Math.random() * 3) * perfMultiplier * minutesFactor),
        personalFouls: Math.floor((Math.random() * 4) * minutesFactor)
      };
    case 'NFL':
      return generateNFLStats(position, perfMultiplier);
    case 'MLB':
      return generateMLBStats(position, perfMultiplier);
    case 'NHL':
      return {
        goals: Math.floor((Math.random() * 1.5) * perfMultiplier * positionFactor.scoring),
        assists: Math.floor((Math.random() * 1.5) * perfMultiplier * positionFactor.playmaking),
        plusMinus: Math.floor((Math.random() * 4) - 2),
        penaltyMinutes: Math.floor(Math.random() * 4),
        shots: Math.floor((Math.random() * 3) * perfMultiplier * positionFactor.shooting),
        hits: Math.floor((Math.random() * 3) * perfMultiplier * positionFactor.physical),
        blockedShots: Math.floor((Math.random() * 2) * perfMultiplier * positionFactor.defense),
        faceoffWinPercentage: position === 'C' ? Math.floor(Math.random() * 30 + 40) : 0
      };
    default: // Soccer leagues
      return {
        goals: Math.floor((Math.random() * 1) * perfMultiplier * positionFactor.scoring),
        assists: Math.floor((Math.random() * 1) * perfMultiplier * positionFactor.playmaking),
        shots: Math.floor((Math.random() * 3) * perfMultiplier * positionFactor.shooting),
        shotsOnGoal: Math.floor((Math.random() * 2) * perfMultiplier * positionFactor.shooting),
        yellowCards: Math.random() < 0.1 ? 1 : 0,
        redCards: Math.random() < 0.01 ? 1 : 0,
        tackles: Math.floor((Math.random() * 5) * perfMultiplier * positionFactor.defense),
        passesCompleted: Math.floor((Math.random() * 30 + 10) * perfMultiplier * minutesFactor),
        passesAttempted: Math.floor((Math.random() * 40 + 15) * perfMultiplier * minutesFactor),
        interceptions: Math.floor((Math.random() * 2) * perfMultiplier * positionFactor.defense),
        foulsCommitted: Math.floor(Math.random() * 3),
        foulsDrawn: Math.floor(Math.random() * 2),
        dribbles: Math.floor((Math.random() * 4) * perfMultiplier * positionFactor.technique),
        duelsWon: Math.floor((Math.random() * 6) * perfMultiplier * positionFactor.physical)
      };
  }
}

function generateNFLStats(position, perfMultiplier) {
  switch(position) {
    case 'QB':
      return {
        passingYards: Math.floor((Math.random() * 250 + 50) * perfMultiplier),
        passingAttempts: Math.floor((Math.random() * 35 + 15) * perfMultiplier),
        passingCompletions: Math.floor((Math.random() * 25 + 10) * perfMultiplier),
        passingTouchdowns: Math.floor((Math.random() * 3) * perfMultiplier),
        passingInterceptions: Math.floor(Math.random() * 2),
        rushingYards: Math.floor(Math.random() * 30),
        rushingAttempts: Math.floor(Math.random() * 5),
        rushingTouchdowns: Math.random() < 0.15 ? 1 : 0,
        sacked: Math.floor(Math.random() * 3)
      };
    case 'RB':
      return {
        rushingYards: Math.floor((Math.random() * 80 + 20) * perfMultiplier),
        rushingAttempts: Math.floor((Math.random() * 20 + 5) * perfMultiplier),
        rushingTouchdowns: Math.floor((Math.random() * 1.5) * perfMultiplier),
        receivingYards: Math.floor(Math.random() * 40),
        receptions: Math.floor(Math.random() * 4),
        receivingTouchdowns: Math.random() < 0.1 ? 1 : 0,
        fumbles: Math.random() < 0.1 ? 1 : 0
      };
    case 'WR':
    case 'TE':
      const isTightEnd = position === 'TE';
      return {
        receivingYards: Math.floor((Math.random() * (isTightEnd ? 60 : 80) + 10) * perfMultiplier),
        receptions: Math.floor((Math.random() * (isTightEnd ? 6 : 8) + 1) * perfMultiplier),
        targets: Math.floor((Math.random() * (isTightEnd ? 8 : 10) + 2) * perfMultiplier),
        receivingTouchdowns: Math.floor((Math.random() * 1) * perfMultiplier),
        yardsAfterCatch: Math.floor(Math.random() * 40),
        rushingYards: Math.floor(Math.random() * 10),
        rushingAttempts: Math.random() < 0.2 ? 1 : 0,
        fumbles: Math.random() < 0.05 ? 1 : 0
      };
    case 'OT':
    case 'OG':
    case 'C':
      return {
        snapCount: Math.floor((Math.random() * 60 + 30) * perfMultiplier),
        penaltiesCommitted: Math.floor(Math.random() * 1.5),
        sacksAllowed: Math.floor(Math.random() * 1.5),
        pressuresAllowed: Math.floor(Math.random() * 3)
      };
    case 'DE':
    case 'DT':
    case 'LB':
      const isLineMan = position === 'DE' || position === 'DT';
      return {
        tackles: Math.floor((Math.random() * 6 + 1) * perfMultiplier),
        soloTackles: Math.floor((Math.random() * 4) * perfMultiplier),
        assistedTackles: Math.floor((Math.random() * 3) * perfMultiplier),
        sacks: Math.floor((Math.random() * (isLineMan ? 1.5 : 1)) * perfMultiplier),
        tacklesForLoss: Math.floor((Math.random() * 2) * perfMultiplier),
        qbHits: Math.floor((Math.random() * (isLineMan ? 3 : 1)) * perfMultiplier),
        passesDefended: Math.floor((Math.random() * (isLineMan ? 0.5 : 1.5)) * perfMultiplier),
        interceptions: Math.random() < (isLineMan ? 0.02 : 0.1) ? 1 : 0,
        forcedFumbles: Math.random() < 0.1 ? 1 : 0
      };
    case 'CB':
    case 'S':
      const isCornerback = position === 'CB';
      return {
        tackles: Math.floor((Math.random() * 5 + 1) * perfMultiplier),
        soloTackles: Math.floor((Math.random() * 4) * perfMultiplier),
        assistedTackles: Math.floor((Math.random() * 2) * perfMultiplier),
        passesDefended: Math.floor((Math.random() * (isCornerback ? 2.5 : 1.5)) * perfMultiplier),
        interceptions: Math.floor((Math.random() * 0.7) * perfMultiplier),
        interceptionYards: Math.floor(Math.random() * 20),
        tacklesForLoss: Math.floor((Math.random() * 1) * perfMultiplier),
        forcedFumbles: Math.random() < 0.08 ? 1 : 0
      };
    case 'K':
    case 'P':
      if (position === 'K') {
        return {
          fieldGoalsMade: Math.floor((Math.random() * 3) * perfMultiplier),
          fieldGoalsAttempted: Math.floor((Math.random() * 4) * perfMultiplier),
          extraPointsMade: Math.floor((Math.random() * 3) * perfMultiplier),
          extraPointsAttempted: Math.floor((Math.random() * 3) * perfMultiplier),
          touchbacks: Math.floor(Math.random() * 5)
        };
      } else {
        return {
          punts: Math.floor((Math.random() * 6) * perfMultiplier),
          puntYards: Math.floor((Math.random() * 250) * perfMultiplier),
          puntsInside20: Math.floor((Math.random() * 3) * perfMultiplier),
          touchbacks: Math.floor(Math.random() * 2)
        };
      }
    default:
      return {
        snaps: Math.floor((Math.random() * 50) * perfMultiplier)
      };
  }
}

function generateMLBStats(position, perfMultiplier) {
  if (position === 'P') {
    return {
      inningsPitched: (Math.random() * 6 + 1).toFixed(1) * perfMultiplier,
      earnedRuns: Math.floor((Math.random() * 4) * perfMultiplier),
      hits: Math.floor((Math.random() * 6) * perfMultiplier),
      strikeouts: Math.floor((Math.random() * 8) * perfMultiplier),
      walks: Math.floor((Math.random() * 3) * perfMultiplier),
      homeRuns: Math.floor(Math.random() * 2),
      pitchCount: Math.floor((Math.random() * 90 + 10) * perfMultiplier),
      wins: Math.random() < 0.2 ? 1 : 0,
      losses: Math.random() < 0.2 ? 1 : 0,
      saves: Math.random() < 0.1 ? 1 : 0,
      era: (Math.random() * 5 + 1).toFixed(2)
    };
  } else {
    // Position player stats
    const isCatcher = position === 'C';
    
    return {
      atBats: Math.floor((Math.random() * 4 + 1) * perfMultiplier),
      runs: Math.floor((Math.random() * 1.5) * perfMultiplier),
      hits: Math.floor((Math.random() * 2) * perfMultiplier),
      doubles: Math.floor(Math.random() * 1),
      triples: Math.random() < 0.05 ? 1 : 0,
      homeRuns: Math.floor(Math.random() * 0.7),
      runsBattedIn: Math.floor((Math.random() * 1.5) * perfMultiplier),
      stolenBases: Math.floor((Math.random() * (isCatcher ? 0.1 : 0.5)) * perfMultiplier),
      caughtStealing: Math.random() < 0.05 ? 1 : 0,
      walks: Math.floor(Math.random() * 1.5),
      strikeouts: Math.floor(Math.random() * 2),
      battingAverage: (Math.random() * 0.300 + 0.150).toFixed(3),
      onBasePercentage: (Math.random() * 0.350 + 0.200).toFixed(3),
      sluggingPercentage: (Math.random() * 0.450 + 0.250).toFixed(3),
      fielding: {
        putouts: Math.floor((Math.random() * 8) * perfMultiplier * (isCatcher ? 1.5 : 1)),
        assists: Math.floor((Math.random() * 2) * perfMultiplier),
        errors: Math.random() < 0.1 ? 1 : 0
      }
    };
  }
}

function generateAdvancedMetrics(league, position) {
  // Generate advanced analytics metrics based on league and position
  switch(league) {
    case 'NBA':
      return {
        playerEfficiencyRating: (Math.random() * 25 + 5).toFixed(1),
        trueShootingPercentage: (Math.random() * 0.2 + 0.45).toFixed(3),
        usageRate: (Math.random() * 15 + 10).toFixed(1),
        assistPercentage: (Math.random() * 20 + 5).toFixed(1),
        reboundPercentage: (Math.random() * 15 + 3).toFixed(1),
        defensiveRating: (Math.random() * 15 + 100).toFixed(1),
        offensiveRating: (Math.random() * 20 + 95).toFixed(1),
        winShares: (Math.random() * 5).toFixed(1)
      };
    case 'NFL':
      if (position === 'QB') {
        return {
          qbRating: (Math.random() * 50 + 70).toFixed(1),
          completionPercentage: (Math.random() * 20 + 55).toFixed(1),
          yardsPerAttempt: (Math.random() * 4 + 6).toFixed(1),
          touchdownPercentage: (Math.random() * 5 + 3).toFixed(1),
          interceptionPercentage: (Math.random() * 3 + 1).toFixed(1)
        };
      } else {
        return {
          yardsPerTouch: (Math.random() * 6 + 3).toFixed(1),
          successRate: (Math.random() * 30 + 40).toFixed(1),
          valueOverReplacement: (Math.random() * 10 - 2).toFixed(1)
        };
      }
    case 'MLB':
      if (position === 'P') {
        return {
          whip: (Math.random() * 1 + 0.8).toFixed(2),
          fieldingIndependentPitching: (Math.random() * 2 + 3).toFixed(2),
          strikeoutsPerNine: (Math.random() * 5 + 6).toFixed(1),
          walksPerNine: (Math.random() * 2 + 1).toFixed(1),
          groundBallPercentage: (Math.random() * 20 + 40).toFixed(1)
        };
      } else {
        return {
          woba: (Math.random() * 0.1 + 0.3).toFixed(3),
          ops: (Math.random() * 0.3 + 0.6).toFixed(3),
          wrc: Math.floor(Math.random() * 30 + 70),
          war: (Math.random() * 3).toFixed(1),
          babip: (Math.random() * 0.1 + 0.25).toFixed(3)
        };
      }
    case 'NHL':
      return {
        corsiPercentage: (Math.random() * 15 + 45).toFixed(1),
        faceoffWinPercentage: (Math.random() * 20 + 45).toFixed(1),
        goalsScoredPercentage: (Math.random() * 15 + 45).toFixed(1),
        pointsPerSixty: (Math.random() * 2).toFixed(2),
        goalsAgainstAverage: position === 'G' ? (Math.random() * 2 + 1.5).toFixed(2) : null,
        savePercentage: position === 'G' ? (Math.random() * 0.05 + 0.9).toFixed(3) : null
      };
    default: // Soccer
      if (position === 'GK') {
        return {
          savePercentage: (Math.random() * 15 + 65).toFixed(1),
          cleanSheetPercentage: (Math.random() * 30 + 20).toFixed(1),
          goalsAllowedPerMatch: (Math.random() * 1.5 + 0.5).toFixed(2)
        };
      } else {
        return {
          passCompletionRate: (Math.random() * 20 + 70).toFixed(1),
          keyPassesPerMatch: (Math.random() * 2).toFixed(1),
          successfulDribblesPerMatch: (Math.random() * 3).toFixed(1),
          aerialDuelsWonPercentage: (Math.random() * 30 + 40).toFixed(1),
          tacklesPerMatch: (Math.random() * 3).toFixed(1),
          expectedGoals: (Math.random() * 0.5).toFixed(2),
          expectedAssists: (Math.random() * 0.3).toFixed(2)
        };
      }
  }
}

function getPositionFactor(league, position) {
  // Default factors
  const defaults = {
    scoring: 1.0,
    rebounding: 1.0,
    playmaking: 1.0,
    defense: 1.0,
    physical: 1.0,
    shooting: 1.0,
    technique: 1.0
  };
  
  switch(league) {
    case 'NBA':
      if (position === 'PG') {
        return { ...defaults, playmaking: 1.8, scoring: 1.2, rebounding: 0.6, defense: 0.9 };
      } else if (position === 'SG') {
        return { ...defaults, scoring: 1.5, shooting: 1.4, playmaking: 1.0, rebounding: 0.7 };
      } else if (position === 'SF') {
        return { ...defaults, scoring: 1.3, rebounding: 1.1, defense: 1.1 };
      } else if (position === 'PF') {
        return { ...defaults, rebounding: 1.4, defense: 1.2, scoring: 1.1, shooting: 0.8 };
      } else if (position === 'C') {
        return { ...defaults, rebounding: 1.7, defense: 1.4, scoring: 1.0, shooting: 0.5, playmaking: 0.6 };
      }
      break;
      
    // For other leagues, return default factors
    default:
      return defaults;
      
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      if (position === 'GK') {
        return { ...defaults, defense: 2.0, scoring: 0.1, playmaking: 0.3, shooting: 0.1 };
      } else if (position === 'CB' || position === 'RB' || position === 'LB') {
        return { ...defaults, defense: 1.6, physical: 1.3, scoring: 0.3, playmaking: 0.8 };
      } else if (position === 'CDM') {
        return { ...defaults, defense: 1.4, physical: 1.2, playmaking: 1.0, technique: 1.0 };
      } else if (position === 'CM') {
        return { ...defaults, playmaking: 1.5, technique: 1.3, scoring: 0.7 };
      } else if (position === 'CAM') {
        return { ...defaults, playmaking: 1.6, technique: 1.5, scoring: 1.0, shooting: 1.0 };
      } else if (position === 'RW' || position === 'LW') {
        return { ...defaults, technique: 1.5, shooting: 1.3, scoring: 1.2, playmaking: 1.1 };
      } else if (position === 'ST') {
        return { ...defaults, scoring: 1.8, shooting: 1.6, physical: 1.2, technique: 1.0 };
      }
      break;
      
    case 'NHL':
      if (position === 'G') {
        return { ...defaults, defense: 2.0, scoring: 0.0, shooting: 0.0 };
      } else if (position === 'D') {
        return { ...defaults, defense: 1.7, physical: 1.3, scoring: 0.6, shooting: 0.7, playmaking: 1.0 };
      } else if (position === 'C') {
        return { ...defaults, scoring: 1.3, playmaking: 1.4, shooting: 1.2, physical: 1.1 };
      } else if (position === 'RW' || position === 'LW') {
        return { ...defaults, scoring: 1.4, shooting: 1.3, playmaking: 1.1, physical: 1.0 };
      }