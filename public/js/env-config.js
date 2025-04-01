/**
 * Sports Analytics Pro - Environment Configuration
 * This file sets up environment variables and API keys for the application.
 */

// Create a global ENV object to store environment variables
window.ENV = window.ENV || {};

// API Keys
window.ENV.THESPORTSDB_API_KEY = '447279';  // TheSportsDB API key

// API Endpoints
window.ENV.API_ENDPOINTS = {
    THESPORTSDB_URL: 'https://www.thesportsdb.com/api/v1/json',
    BACKEND_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5050/api' 
        : 'https://api.sportsanalyticspro.com/api'
};

// Feature Flags
window.ENV.FEATURES = {
    USE_REAL_DATA: true,           // Prefer real API data over mock data
    ENABLE_CACHING: true,          // Enable data caching for better performance
    ENABLE_ERROR_REPORTING: true,  // Enable error reporting
    ENABLE_ANALYTICS: true         // Enable analytics tracking
};

// Configure cache settings
window.ENV.CACHE_CONFIG = {
    DEFAULT_TTL: 3600000,  // Default cache time-to-live in milliseconds (1 hour)
    LEAGUE_DATA_TTL: 86400000,  // League data cache TTL (24 hours)
    TEAM_DATA_TTL: 3600000,  // Team data cache TTL (1 hour)
    PLAYER_DATA_TTL: 3600000  // Player data cache TTL (1 hour)
};

// Log configuration
console.log('Environment configuration loaded');
console.log('API configuration:', {
    theSportsDbUrl: window.ENV.API_ENDPOINTS.THESPORTSDB_URL,
    backendUrl: window.ENV.API_ENDPOINTS.BACKEND_URL,
    useRealData: window.ENV.FEATURES.USE_REAL_DATA
}); 