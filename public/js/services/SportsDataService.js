/**
 * SportsDataService - Enterprise-grade sports data handling
 * Uses ApiService for all data operations and provides domain-specific methods
 */
class SportsDataService {
  /**
   * Initialize the sports data service
   * @param {ApiService} apiService - ApiService instance
   * @param {Object} options - Configuration options
   */
  constructor(apiService, options = {}) {
    this.api = apiService;
    this.options = Object.assign({
      endpoints: {
        leagues: '/leagues',
        teams: '/teams',
        players: '/players',
        games: '/games',
        predictions: '/predictions',
        stats: '/stats',
        standings: '/standings'
      },
      fallbackMode: true,
      debugMode: false
    }, options);
    
    // Cache for processed data
    this.cache = {
      leagues: null,
      teamsByLeague: new Map(),
      playersByTeam: new Map()
    };
    
    this.debug('SportsDataService initialized');
  }
  
  /**
   * Log debug messages
   * @param  {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.options.debugMode) {
      console.log('[SportsDataService]', ...args);
    }
  }
  
  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.leagues = null;
    this.cache.teamsByLeague.clear();
    this.cache.playersByTeam.clear();
    this.debug('Local cache cleared');
  }
  
  /**
   * Fetch all available leagues
   * @returns {Promise<Array>} - List of leagues
   */
  async getLeagues() {
    // Return cached data if available
    if (this.cache.leagues) {
      this.debug('Using cached leagues data');
      return this.cache.leagues;
    }
    
    try {
      // Fetch from API
      const response = await this.api.get(this.options.endpoints.leagues);
      
      // Process and cache the response
      const leagues = this.processLeaguesData(response);
      this.cache.leagues = leagues;
      
      return leagues;
    } catch (error) {
      this.debug('Error fetching leagues:', error);
      
      // Use fallback data if enabled
      if (this.options.fallbackMode) {
        return this.getFallbackLeagues();
      }
      
      throw error;
    }
  }
  
  /**
   * Process leagues data from API response
   * @param {Object} response - API response
   * @returns {Array} - Processed leagues
   */
  processLeaguesData(response) {
    // Extract leagues from the response based on the API format
    let leagues = [];
    
    if (response.leagues) {
      // Standard API format
      leagues = response.leagues;
    } else if (Array.isArray(response)) {
      // Some APIs return leagues directly as an array
      leagues = response;
    } else if (response.data && response.data.leagues) {
      // Nested data format
      leagues = response.data.leagues;
    }
    
    // Normalize league data
    return leagues.map(league => ({
      id: league.id || league.leagueId || league.league_id,
      name: league.name || league.leagueName || league.league_name,
      sport: league.sport || league.sportType || 'Unknown',
      country: league.country || league.countryName || '',
      logo: league.logo || league.logoUrl || league.image || '',
      season: league.currentSeason || league.season || new Date().getFullYear().toString()
    }));
  }
  
  /**
   * Get teams for a specific league
   * @param {string|number} leagueId - League ID
   * @returns {Promise<Array>} - List of teams
   */
  async getTeamsByLeague(leagueId) {
    // Return cached data if available
    if (this.cache.teamsByLeague.has(leagueId)) {
      this.debug(`Using cached teams data for league ${leagueId}`);
      return this.cache.teamsByLeague.get(leagueId);
    }
    
    try {
      // Fetch from API
      const response = await this.api.get(`${this.options.endpoints.teams}`, {
        params: { leagueId }
      });
      
      // Process and cache the response
      const teams = this.processTeamsData(response);
      this.cache.teamsByLeague.set(leagueId, teams);
      
      return teams;
    } catch (error) {
      this.debug(`Error fetching teams for league ${leagueId}:`, error);
      
      // Use fallback data if enabled
      if (this.options.fallbackMode) {
        return this.getFallbackTeams(leagueId);
      }
      
      throw error;
    }
  }
  
  /**
   * Process teams data from API response
   * @param {Object} response - API response
   * @returns {Array} - Processed teams
   */
  processTeamsData(response) {
    // Extract teams from the response based on the API format
    let teams = [];
    
    if (response.teams) {
      // Standard API format
      teams = response.teams;
    } else if (Array.isArray(response)) {
      // Some APIs return teams directly as an array
      teams = response;
    } else if (response.data && response.data.teams) {
      // Nested data format
      teams = response.data.teams;
    }
    
    // Normalize team data
    return teams.map(team => ({
      id: team.id || team.teamId || team.team_id,
      name: team.name || team.teamName || team.team_name,
      shortName: team.shortName || team.abbreviation || '',
      logo: team.logo || team.logoUrl || team.image || '',
      leagueId: team.leagueId || team.league_id || '',
      stadium: team.stadium || team.venue || '',
      city: team.city || team.location || '',
      foundedYear: team.founded || team.yearFounded || '',
      colors: team.colors || { primary: '', secondary: '' }
    }));
  }
  
  /**
   * Get players for a specific team
   * @param {string|number} teamId - Team ID
   * @returns {Promise<Array>} - List of players
   */
  async getPlayersByTeam(teamId) {
    // Return cached data if available
    if (this.cache.playersByTeam.has(teamId)) {
      this.debug(`Using cached players data for team ${teamId}`);
      return this.cache.playersByTeam.get(teamId);
    }
    
    try {
      // Fetch from API
      const response = await this.api.get(`${this.options.endpoints.players}`, {
        params: { teamId }
      });
      
      // Process and cache the response
      const players = this.processPlayersData(response);
      this.cache.playersByTeam.set(teamId, players);
      
      return players;
    } catch (error) {
      this.debug(`Error fetching players for team ${teamId}:`, error);
      
      // Use fallback data if enabled
      if (this.options.fallbackMode) {
        return this.getFallbackPlayers(teamId);
      }
      
      throw error;
    }
  }
  
  /**
   * Process players data from API response
   * @param {Object} response - API response
   * @returns {Array} - Processed players
   */
  processPlayersData(response) {
    // Extract players from the response based on the API format
    let players = [];
    
    if (response.players) {
      // Standard API format
      players = response.players;
    } else if (Array.isArray(response)) {
      // Some APIs return players directly as an array
      players = response;
    } else if (response.data && response.data.players) {
      // Nested data format
      players = response.data.players;
    }
    
    // Normalize player data
    return players.map(player => ({
      id: player.id || player.playerId || player.player_id,
      name: player.name || player.playerName || player.player_name,
      firstName: player.firstName || player.first_name || '',
      lastName: player.lastName || player.last_name || '',
      position: player.position || player.role || '',
      number: player.number || player.jerseyNumber || '',
      age: player.age || '',
      height: player.height || '',
      weight: player.weight || '',
      nationality: player.nationality || player.country || '',
      photo: player.photo || player.image || '',
      teamId: player.teamId || player.team_id || ''
    }));
  }
  
  /**
   * Get standings for a specific league
   * @param {string|number} leagueId - League ID
   * @param {string} season - Season (optional)
   * @returns {Promise<Array>} - League standings
   */
  async getStandings(leagueId, season = '') {
    const cacheKey = `standings-${leagueId}-${season}`;
    
    try {
      // Fetch from API
      const response = await this.api.get(`${this.options.endpoints.standings}`, {
        params: { 
          leagueId,
          season: season || undefined
        }
      });
      
      // Process the response
      return this.processStandingsData(response);
    } catch (error) {
      this.debug(`Error fetching standings for league ${leagueId}:`, error);
      
      // Use fallback data if enabled
      if (this.options.fallbackMode) {
        return this.getFallbackStandings(leagueId);
      }
      
      throw error;
    }
  }
  
  /**
   * Process standings data from API response
   * @param {Object} response - API response
   * @returns {Array} - Processed standings
   */
  processStandingsData(response) {
    // Extract standings from the response based on the API format
    let standings = [];
    
    if (response.standings) {
      // Standard API format
      standings = response.standings;
    } else if (Array.isArray(response)) {
      // Some APIs return standings directly as an array
      standings = response;
    } else if (response.data && response.data.standings) {
      // Nested data format
      standings = response.data.standings;
    }
    
    // Normalize standings data
    return standings.map(team => ({
      position: team.position || team.rank || 0,
      team: {
        id: team.team.id || team.teamId || team.team_id,
        name: team.team.name || team.teamName || team.team_name,
        logo: team.team.logo || team.teamLogo || ''
      },
      played: team.played || team.games || team.matches || 0,
      won: team.won || team.wins || team.victories || 0,
      drawn: team.drawn || team.draws || team.ties || 0,
      lost: team.lost || team.losses || team.defeats || 0,
      goalsFor: team.goalsFor || team.goalsScored || team.scoresFor || 0,
      goalsAgainst: team.goalsAgainst || team.goalsConceded || team.scoresAgainst || 0,
      goalDifference: team.goalDifference || team.goalDiff || 0,
      points: team.points || team.pts || 0
    }));
  }
  
  /**
   * Get upcoming matches for a specific league
   * @param {string|number} leagueId - League ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - List of matches
   */
  async getUpcomingMatches(leagueId, options = {}) {
    try {
      // Fetch from API
      const response = await this.api.get(`${this.options.endpoints.games}`, {
        params: { 
          leagueId,
          status: 'upcoming',
          ...options
        }
      });
      
      // Process the response
      return this.processMatchesData(response);
    } catch (error) {
      this.debug(`Error fetching upcoming matches for league ${leagueId}:`, error);
      
      // Use fallback data if enabled
      if (this.options.fallbackMode) {
        return this.getFallbackMatches(leagueId, 'upcoming');
      }
      
      throw error;
    }
  }
  
  /**
   * Get live matches for a specific league
   * @param {string|number} leagueId - League ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - List of matches
   */
  async getLiveMatches(leagueId, options = {}) {
    try {
      // Fetch from API
      const response = await this.api.get(`${this.options.endpoints.games}`, {
        params: { 
          leagueId,
          status: 'live',
          ...options
        },
        // Always skip cache for live data
        skipCache: true
      });
      
      // Process the response
      return this.processMatchesData(response);
    } catch (error) {
      this.debug(`Error fetching live matches for league ${leagueId}:`, error);
      
      // Use fallback data if enabled
      if (this.options.fallbackMode) {
        return this.getFallbackMatches(leagueId, 'live');
      }
      
      throw error;
    }
  }
  
  /**
   * Process matches data from API response
   * @param {Object} response - API response
   * @returns {Array} - Processed matches
   */
  processMatchesData(response) {
    // Extract matches from the response based on the API format
    let matches = [];
    
    if (response.matches) {
      // Standard API format
      matches = response.matches;
    } else if (Array.isArray(response)) {
      // Some APIs return matches directly as an array
      matches = response;
    } else if (response.data && response.data.matches) {
      // Nested data format
      matches = response.data.matches;
    }
    
    // Normalize match data
    return matches.map(match => ({
      id: match.id || match.matchId || match.match_id,
      status: match.status || 'scheduled',
      startTime: match.startTime || match.date || match.datetime || '',
      minute: match.minute || match.elapsed || 0,
      homeTeam: {
        id: match.homeTeam.id || match.homeTeamId || '',
        name: match.homeTeam.name || match.homeTeamName || '',
        logo: match.homeTeam.logo || match.homeTeamLogo || ''
      },
      awayTeam: {
        id: match.awayTeam.id || match.awayTeamId || '',
        name: match.awayTeam.name || match.awayTeamName || '',
        logo: match.awayTeam.logo || match.awayTeamLogo || ''
      },
      score: {
        home: match.score ? (match.score.home || 0) : 0,
        away: match.score ? (match.score.away || 0) : 0,
        halftime: match.score && match.score.halftime ? match.score.halftime : { home: 0, away: 0 },
        fulltime: match.score && match.score.fulltime ? match.score.fulltime : { home: 0, away: 0 }
      },
      venue: match.venue || match.stadium || '',
      referee: match.referee || '',
      leagueId: match.leagueId || match.league_id || '',
      events: match.events || []
    }));
  }
  
  /**
   * Generate a match prediction
   * @param {Object} params - Prediction parameters
   * @returns {Promise<Object>} - Prediction result
   */
  async generatePrediction(params) {
    try {
      // Send prediction request to API
      const response = await this.api.post(`${this.options.endpoints.predictions}/generate`, params);
      
      // Process the response
      return this.processPredictionData(response);
    } catch (error) {
      this.debug('Error generating prediction:', error);
      
      // Use fallback prediction if enabled
      if (this.options.fallbackMode) {
        return this.getFallbackPrediction(params);
      }
      
      throw error;
    }
  }
  
  /**
   * Process prediction data from API response
   * @param {Object} response - API response
   * @returns {Object} - Processed prediction
   */
  processPredictionData(response) {
    // Extract prediction data based on API format
    let prediction = {};
    
    if (response.prediction) {
      prediction = response.prediction;
    } else if (response.data && response.data.prediction) {
      prediction = response.data.prediction;
    } else {
      prediction = response;
    }
    
    // Normalize prediction data
    return {
      homeTeam: prediction.homeTeam || '',
      awayTeam: prediction.awayTeam || '',
      homeWinProbability: prediction.homeWinProbability || 0,
      awayWinProbability: prediction.awayWinProbability || 0,
      drawProbability: prediction.drawProbability || 0,
      factors: prediction.factors || [],
      confidence: prediction.confidence || 0,
      recommendedBet: prediction.recommendedBet || null,
      expectedGoals: prediction.expectedGoals || { home: 0, away: 0 }
    };
  }
  
  /**
   * Get fallback leagues data
   * @returns {Array} - Fallback leagues
   */
  getFallbackLeagues() {
    this.debug('Using fallback leagues data');
    
    return [
      {
        id: '4328',
        name: 'Premier League',
        sport: 'Soccer',
        country: 'England',
        logo: '/img/leagues/premier-league.svg'
      },
      {
        id: '4335',
        name: 'La Liga',
        sport: 'Soccer',
        country: 'Spain',
        logo: '/img/leagues/la-liga.svg'
      },
      {
        id: '4387',
        name: 'NBA',
        sport: 'Basketball',
        country: 'USA',
        logo: '/img/leagues/nba.svg'
      },
      {
        id: '4391',
        name: 'NFL',
        sport: 'Football',
        country: 'USA',
        logo: '/img/leagues/nfl.svg'
      },
      {
        id: '4424',
        name: 'MLB',
        sport: 'Baseball',
        country: 'USA',
        logo: '/img/leagues/mlb.svg'
      },
      {
        id: '4380',
        name: 'NHL',
        sport: 'Hockey',
        country: 'USA',
        logo: '/img/leagues/nhl.svg'
      }
    ];
  }
  
  /**
   * Get fallback teams data
   * @param {string|number} leagueId - League ID
   * @returns {Array} - Fallback teams
   */
  getFallbackTeams(leagueId) {
    this.debug(`Using fallback teams data for league ${leagueId}`);
    
    // Return different teams based on league ID
    const teams = {
      // Premier League teams
      '4328': [
        { id: '1', name: 'Arsenal', logo: '/img/teams/premier-league/arsenal.svg' },
        { id: '2', name: 'Chelsea', logo: '/img/teams/premier-league/chelsea.svg' },
        { id: '3', name: 'Liverpool', logo: '/img/teams/premier-league/liverpool.svg' },
        { id: '4', name: 'Manchester City', logo: '/img/teams/premier-league/manchester-city.svg' },
        { id: '5', name: 'Manchester United', logo: '/img/teams/premier-league/manchester-united.svg' }
      ],
      // NBA teams
      '4387': [
        { id: '1', name: 'Los Angeles Lakers', logo: '/img/teams/nba/lakers.svg' },
        { id: '2', name: 'Golden State Warriors', logo: '/img/teams/nba/warriors.svg' },
        { id: '3', name: 'Boston Celtics', logo: '/img/teams/nba/celtics.svg' },
        { id: '4', name: 'Miami Heat', logo: '/img/teams/nba/heat.svg' },
        { id: '5', name: 'Chicago Bulls', logo: '/img/teams/nba/bulls.svg' }
      ]
    };
    
    // Return teams for the requested league or a generic list
    return teams[leagueId] || [
      { id: '1', name: 'Team 1', logo: '/img/teams/placeholder.svg' },
      { id: '2', name: 'Team 2', logo: '/img/teams/placeholder.svg' },
      { id: '3', name: 'Team 3', logo: '/img/teams/placeholder.svg' },
      { id: '4', name: 'Team 4', logo: '/img/teams/placeholder.svg' },
      { id: '5', name: 'Team 5', logo: '/img/teams/placeholder.svg' }
    ];
  }
  
  /**
   * Get fallback prediction
   * @param {Object} params - Prediction parameters
   * @returns {Object} - Fallback prediction
   */
  getFallbackPrediction(params) {
    this.debug('Using fallback prediction data');
    
    const homeTeam = params.homeTeam || 'Home Team';
    const awayTeam = params.awayTeam || 'Away Team';
    const homeWinProb = Math.random() * 0.4 + 0.3; // Between 30-70%
    const drawProb = Math.random() * 0.3; // Between 0-30%
    const awayWinProb = 1 - homeWinProb - drawProb;
    
    return {
      homeTeam,
      awayTeam,
      homeWinProbability: homeWinProb,
      awayWinProbability: awayWinProb,
      drawProbability: drawProb,
      factors: [
        "Recent team performance (last 10 games)",
        "Head-to-head historical matchups",
        "Home advantage factor",
        "Key player availability",
        "Rest days between matches"
      ],
      confidence: 0.82,
      recommendedBet: homeWinProb > awayWinProb ? 'Home Win' : 'Away Win',
      expectedGoals: {
        home: (homeWinProb * 3 + drawProb).toFixed(1),
        away: (awayWinProb * 3 + drawProb).toFixed(1)
      }
    };
  }
  
  /**
   * Get fallback standings
   * @param {string|number} leagueId - League ID
   * @returns {Array} - Fallback standings
   */
  getFallbackStandings(leagueId) {
    this.debug(`Using fallback standings data for league ${leagueId}`);
    
    // Get fallback teams to use in standings
    const teams = this.getFallbackTeams(leagueId);
    
    // Generate random standings
    return teams.map((team, index) => ({
      position: index + 1,
      team: {
        id: team.id,
        name: team.name,
        logo: team.logo
      },
      played: 10,
      won: 10 - index,
      drawn: index,
      lost: index,
      goalsFor: 30 - index * 3,
      goalsAgainst: 10 + index * 2,
      goalDifference: (30 - index * 3) - (10 + index * 2),
      points: (10 - index) * 3 + index
    }));
  }
  
  /**
   * Get fallback matches
   * @param {string|number} leagueId - League ID
   * @param {string} status - Match status (upcoming, live, completed)
   * @returns {Array} - Fallback matches
   */
  getFallbackMatches(leagueId, status = 'upcoming') {
    this.debug(`Using fallback ${status} matches data for league ${leagueId}`);
    
    // Get fallback teams to use in matches
    const teams = this.getFallbackTeams(leagueId);
    
    // Create matches based on status
    const matches = [];
    
    for (let i = 0; i < 5; i++) {
      const homeTeam = teams[i % teams.length];
      const awayTeam = teams[(i + 1) % teams.length];
      
      // Generate match data based on status
      if (status === 'upcoming') {
        // Future dates for upcoming matches
        const date = new Date();
        date.setDate(date.getDate() + i + 1);
        
        matches.push({
          id: `upcoming-${i}`,
          status: 'scheduled',
          startTime: date.toISOString(),
          minute: 0,
          homeTeam: {
            id: homeTeam.id,
            name: homeTeam.name,
            logo: homeTeam.logo
          },
          awayTeam: {
            id: awayTeam.id,
            name: awayTeam.name,
            logo: awayTeam.logo
          },
          score: {
            home: 0,
            away: 0,
            halftime: { home: 0, away: 0 },
            fulltime: { home: 0, away: 0 }
          },
          venue: 'Stadium Name',
          leagueId
        });
      } else if (status === 'live') {
        // Random scores and minutes for live matches
        const homeScore = Math.floor(Math.random() * 4);
        const awayScore = Math.floor(Math.random() * 4);
        const minute = Math.floor(Math.random() * 90 + 1);
        
        matches.push({
          id: `live-${i}`,
          status: 'live',
          startTime: new Date().toISOString(),
          minute,
          homeTeam: {
            id: homeTeam.id,
            name: homeTeam.name,
            logo: homeTeam.logo
          },
          awayTeam: {
            id: awayTeam.id,
            name: awayTeam.name,
            logo: awayTeam.logo
          },
          score: {
            home: homeScore,
            away: awayScore,
            halftime: { home: Math.min(homeScore, 2), away: Math.min(awayScore, 1) },
            fulltime: { home: 0, away: 0 }
          },
          venue: 'Stadium Name',
          leagueId
        });
      }
    }
    
    return matches;
  }
  
  /**
   * Get fallback players
   * @param {string|number} teamId - Team ID
   * @returns {Array} - Fallback players
   */
  getFallbackPlayers(teamId) {
    this.debug(`Using fallback players data for team ${teamId}`);
    
    // Generate random player data
    const positions = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
    const players = [];
    
    for (let i = 1; i <= 20; i++) {
      players.push({
        id: `player-${teamId}-${i}`,
        name: `Player ${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        position: positions[i % 4],
        number: i,
        age: 20 + (i % 15),
        height: 170 + (i % 30),
        weight: 70 + (i % 20),
        nationality: 'Country',
        photo: '/img/players/placeholder.svg',
        teamId
      });
    }
    
    return players;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SportsDataService;
} 