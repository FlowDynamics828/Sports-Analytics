// API configuration
const API_CONFIG = {
  NBA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4387
  },
  NFL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4391
  },
  MLB: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4424
  },
  NHL: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4380
  },
  PREMIER_LEAGUE: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4328
  },
  LA_LIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4335
  },
  BUNDESLIGA: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4331
  },
  SERIE_A: {
    url: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.THESPORTSDB_API_KEY || '3',
    teamsEndpoint: '/lookup_all_teams.php',
    playerEndpoint: '/lookup_all_players.php',
    competitionId: 4332
  }
}; 