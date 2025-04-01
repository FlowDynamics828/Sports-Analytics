/**
 * In-Memory Sports Analytics Server
 * 
 * This server uses in-memory storage instead of MongoDB
 * but connects to the real TheSportsDB API
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const fs = require('fs');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 8000;

// In-memory database
const memDB = {
  leagues: [],
  teams: {},
  players: {},
  matches: [],
  predictions: []
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// TheSportsDB API configuration
const THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || process.env.SPORTS_DB_API_KEY || '447279';
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_API_KEY}`;

// Supported leagues
const SUPPORTED_LEAGUES = [
  { id: '4387', name: 'NBA', sportType: 'basketball' },
  { id: '4391', name: 'NFL', sportType: 'football' },
  { id: '4424', name: 'MLB', sportType: 'baseball' },
  { id: '4380', name: 'NHL', sportType: 'hockey' },
  { id: '4328', name: 'Premier League', sportType: 'soccer' },
  { id: '4335', name: 'La Liga', sportType: 'soccer' },
  { id: '4331', name: 'Bundesliga', sportType: 'soccer' },
  { id: '4332', name: 'Serie A', sportType: 'soccer' }
];

// API Router
const apiRouter = express.Router();

// Initialize the system
async function initializeSystem() {
  console.log('Initializing in-memory sports analytics system...');
  try {
    // Load supported leagues into memory
    for (const league of SUPPORTED_LEAGUES) {
      memDB.leagues.push(league);
      await loadTeamsForLeague(league.id, league.name);
    }
    
    console.log('System initialized successfully!');
    console.log(`Loaded ${memDB.leagues.length} leagues`);
    console.log(`Loaded teams for ${Object.keys(memDB.teams).length} leagues`);
    return true;
  } catch (error) {
    console.error('Error initializing system:', error.message);
    return false;
  }
}

// Helper function to load teams for a league
async function loadTeamsForLeague(leagueId, leagueName) {
  try {
    console.log(`Loading teams for ${leagueName} (${leagueId})...`);
    const response = await axios.get(`${BASE_URL}/lookup_all_teams.php?id=${leagueId}`);
    
    if (response.status !== 200) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = response.data;
    if (!data || !data.teams) {
      console.log(`No teams found for league ${leagueName}`);
      memDB.teams[leagueId] = [];
      return;
    }
    
    const teams = data.teams.map(team => ({
      id: team.idTeam,
      name: team.strTeam,
      league: leagueName,
      leagueId: leagueId,
      sport: team.strSport,
      country: team.strCountry,
      logo: team.strTeamBadge || `/img/placeholder.svg`,
      stadium: team.strStadium,
      website: team.strWebsite,
      description: team.strDescriptionEN || '',
      formed: team.intFormedYear
    }));
    
    memDB.teams[leagueId] = teams;
    console.log(`Loaded ${teams.length} teams for ${leagueName}`);
  } catch (error) {
    console.error(`Error loading teams for league ${leagueId}:`, error.message);
    // Create an empty array for this league to avoid further errors
    memDB.teams[leagueId] = [];
  }
}

// API Endpoints

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'In-memory sports analytics server is running',
    timestamp: new Date().toISOString()
  });
});

// Get all leagues
apiRouter.get('/leagues', (req, res) => {
  res.json({
    status: 'success',
    data: memDB.leagues
  });
});

// Get teams by league
apiRouter.get('/teams', (req, res) => {
  const { league } = req.query;
  
  if (!league) {
    return res.status(400).json({
      status: 'error',
      message: 'League ID is required'
    });
  }
  
  const teams = memDB.teams[league] || [];
  
  res.json({
    status: 'success',
    data: teams
  });
});

// Get team details
apiRouter.get('/teams/:id', async (req, res) => {
  const teamId = req.params.id;
  
  // Check if we already have this team's details
  let team = null;
  for (const leagueId in memDB.teams) {
    const foundTeam = memDB.teams[leagueId].find(t => t.id === teamId);
    if (foundTeam) {
      team = foundTeam;
      break;
    }
  }
  
  if (!team) {
    // If not found in memory, fetch from API
    try {
      const response = await axios.get(`${BASE_URL}/lookupteam.php?id=${teamId}`);
      
      if (!response.data || !response.data.teams || !response.data.teams.length) {
        return res.status(404).json({
          status: 'error',
          message: 'Team not found'
        });
      }
      
      const teamData = response.data.teams[0];
      team = {
        id: teamData.idTeam,
        name: teamData.strTeam,
        league: teamData.strLeague,
        leagueId: teamData.idLeague,
        sport: teamData.strSport,
        country: teamData.strCountry,
        logo: teamData.strTeamBadge || `/img/placeholder.svg`,
        stadium: teamData.strStadium,
        website: teamData.strWebsite,
        description: teamData.strDescriptionEN || '',
        formed: teamData.intFormedYear
      };
      
      // Add to memory for future requests
      if (!memDB.teams[teamData.idLeague]) {
        memDB.teams[teamData.idLeague] = [];
      }
      memDB.teams[teamData.idLeague].push(team);
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: `Failed to fetch team: ${error.message}`
      });
    }
  }
  
  res.json({
    status: 'success',
    data: team
  });
});

// Get players for a team
apiRouter.get('/players', async (req, res) => {
  const { team } = req.query;
  
  if (!team) {
    return res.status(400).json({
      status: 'error',
      message: 'Team ID is required'
    });
  }
  
  // Check if we already have players for this team
  if (memDB.players[team]) {
    return res.json({
      status: 'success',
      data: memDB.players[team]
    });
  }
  
  // If not in memory, fetch from API
  try {
    const response = await axios.get(`${BASE_URL}/lookup_all_players.php?id=${team}`);
    
    if (!response.data || !response.data.player) {
      memDB.players[team] = []; // Cache empty results
      return res.json({
        status: 'success',
        data: []
      });
    }
    
    const players = response.data.player.map(player => ({
      id: player.idPlayer,
      name: player.strPlayer,
      teamId: player.idTeam,
      teamName: player.strTeam,
      nationality: player.strNationality,
      position: player.strPosition || 'Unknown',
      thumbnail: player.strThumb || player.strCutout || null,
      height: player.strHeight,
      weight: player.strWeight,
      description: player.strDescriptionEN || '',
      birthdate: player.dateBorn
    }));
    
    // Save to memory for future requests
    memDB.players[team] = players;
    
    res.json({
      status: 'success',
      data: players
    });
  } catch (error) {
    console.error(`Error fetching players for team ${team}:`, error);
    return res.status(500).json({
      status: 'error',
      message: `Failed to fetch players: ${error.message}`
    });
  }
});

// Simplified prediction endpoint for testing
apiRouter.post('/predict', (req, res) => {
  const { factor, league } = req.body;
  
  if (!factor) {
    return res.status(400).json({
      status: 'error',
      message: 'Prediction factor is required'
    });
  }
  
  // Generate a simple prediction
  const prediction = {
    id: Date.now().toString(),
    factor,
    league: league || null,
    probability: Math.random().toFixed(2),
    confidence: (0.7 + Math.random() * 0.25).toFixed(2),
    createdAt: new Date().toISOString()
  };
  
  // Store prediction in memory
  memDB.predictions.push(prediction);
  
  res.json({
    status: 'success',
    data: prediction
  });
});

// Mount the API router
app.use('/api', apiRouter);

// Default route handler
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Something went wrong!'
  });
});

// Start the server
async function startServer() {
  const initialized = await initializeSystem();
  
  if (!initialized) {
    console.error('Failed to initialize system. Exiting...');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    console.log(`In-memory sports analytics server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Dashboard available at http://localhost:${PORT}/dashboard`);
  });
}

startServer().catch(console.error); 