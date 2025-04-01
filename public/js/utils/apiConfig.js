/**
 * API Configuration
 * Centralized configuration for all API endpoints
 */

const API_BASE_URL = process.env.API_BASE_URL || '/api';
const AUTH_TOKEN_KEY = 'sports_analytics_auth_token';
const API_KEY_HEADER = 'X-API-Key';

const API_CONFIG = {
  // Authentication endpoints
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
    REFRESH: `${API_BASE_URL}/auth/refresh`,
    VERIFY: `${API_BASE_URL}/auth/verify`,
    FORGOT_PASSWORD: `${API_BASE_URL}/auth/forgot-password`,
    RESET_PASSWORD: `${API_BASE_URL}/auth/reset-password`,
    CHANGE_PASSWORD: `${API_BASE_URL}/auth/change-password`,
    LOGOUT: `${API_BASE_URL}/auth/logout`,
  },
  
  // User endpoints
  USER: {
    PROFILE: `${API_BASE_URL}/user/profile`,
    UPDATE_PROFILE: `${API_BASE_URL}/user/profile`,
    PREFERENCES: `${API_BASE_URL}/user/preferences`,
    UPDATE_PREFERENCES: `${API_BASE_URL}/user/preferences`,
    SUBSCRIPTION: `${API_BASE_URL}/user/subscription`,
    UPDATE_SUBSCRIPTION: `${API_BASE_URL}/user/subscription`,
  },
  
  // Prediction endpoints
  PREDICTIONS: {
    CUSTOM_SINGLE: `${API_BASE_URL}/predictions/custom/single`,
    CUSTOM_MULTI: `${API_BASE_URL}/predictions/custom/multi`,
    BULK: `${API_BASE_URL}/predictions/custom/bulk`,
    BULK_STATUS: (jobId) => `${API_BASE_URL}/predictions/custom/bulk/${jobId}`,
    PARSE_FACTOR: `${API_BASE_URL}/tools/parse-factor`,
  },
  
  // League endpoints
  LEAGUES: {
    ALL: `${API_BASE_URL}/info/leagues`,
    TEAMS: (leagueId) => `${API_BASE_URL}/leagues/${leagueId}/teams`,
    PLAYERS: (leagueId) => `${API_BASE_URL}/leagues/${leagueId}/players`,
    STANDINGS: (leagueId) => `${API_BASE_URL}/leagues/${leagueId}/standings`,
    SCHEDULE: (leagueId) => `${API_BASE_URL}/leagues/${leagueId}/schedule`,
  },
  
  // Team endpoints
  TEAMS: {
    DETAILS: (teamId) => `${API_BASE_URL}/teams/${teamId}`,
    ROSTER: (teamId) => `${API_BASE_URL}/teams/${teamId}/roster`,
    STATS: (teamId) => `${API_BASE_URL}/teams/${teamId}/stats`,
    SCHEDULE: (teamId) => `${API_BASE_URL}/teams/${teamId}/schedule`,
    RESULTS: (teamId) => `${API_BASE_URL}/teams/${teamId}/results`,
  },
  
  // Player endpoints
  PLAYERS: {
    DETAILS: (playerId) => `${API_BASE_URL}/players/${playerId}`,
    STATS: (playerId) => `${API_BASE_URL}/players/${playerId}/stats`,
    GAME_LOG: (playerId) => `${API_BASE_URL}/players/${playerId}/game-log`,
    SPLITS: (playerId) => `${API_BASE_URL}/players/${playerId}/splits`,
  },
  
  // Game endpoints
  GAMES: {
    LIVE: `${API_BASE_URL}/games/live`,
    DETAILS: (gameId) => `${API_BASE_URL}/games/${gameId}`,
    BOXSCORE: (gameId) => `${API_BASE_URL}/games/${gameId}/boxscore`,
    PLAY_BY_PLAY: (gameId) => `${API_BASE_URL}/games/${gameId}/play-by-play`,
  },
  
  // Analytics endpoints
  ANALYTICS: {
    DASHBOARD: `${API_BASE_URL}/analytics/dashboard`,
    INSIGHTS: `${API_BASE_URL}/analytics/insights`,
    TRENDS: `${API_BASE_URL}/analytics/trends`,
    CUSTOM: `${API_BASE_URL}/analytics/custom`,
  },
  
  // GraphQL endpoint
  GRAPHQL: `${API_BASE_URL}/graphql`,
  
  // WebSocket endpoints
  WEBSOCKETS: {
    LIVE_UPDATES: process.env.WS_URL || 'ws://localhost:8000/ws',
    NOTIFICATIONS: process.env.WS_NOTIFICATIONS_URL || 'ws://localhost:8000/ws/notifications',
  }
};

// API client configuration
const API_CLIENT_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
};

// Helper functions
function getStoredToken() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }
  return null;
}

function setAuthToken(token) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

function removeAuthToken() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

// Export configuration
export {
  API_CONFIG,
  API_CLIENT_CONFIG,
  API_BASE_URL,
  AUTH_TOKEN_KEY,
  API_KEY_HEADER,
  getStoredToken,
  setAuthToken,
  removeAuthToken,
}; 