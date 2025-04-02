/**
 * Sports Analytics Pro - Environment Configuration
 * This file contains environment-specific configuration values
 * It's loaded before all other JavaScript files
 */

// Global environment configuration
window.ENV_CONFIG = {
  // API Configuration
  API_BASE_URL: 'http://localhost:5000/api',
  API_TIMEOUT: 30000, // 30 seconds
  API_VERSION: 'v1',
  
  // Feature Flags
  ENABLE_LIVE_SCORES: true,
  ENABLE_AI_INSIGHTS: true,
  ENABLE_PREDICTIONS: true,
  ENABLE_ANALYTICS: true,
  
  // App Configuration
  APP_VERSION: '1.0.0',
  DEBUG_MODE: true,
  
  // Authentication
  AUTH_ENABLED: false,
  AUTH_PROVIDER: 'local', // 'local', 'oauth', 'jwt'
  
  // External Service API Keys (use environment variables in production)
  SERVICES: {
    SPORTS_DATA_API_KEY: '447279', // TheSportsDB API key - production key
    WEATHER_API_KEY: 'demo_weather_key',
    ANALYTICS_TRACKING_ID: 'UA-DEMO-ID'
  },
  
  // Default Sport Settings
  DEFAULT_SPORT: 'soccer',
  DEFAULT_LEAGUE: '4328', // Premier League
  
  // Content Settings
  REFRESH_INTERVALS: {
    LIVE_MATCHES: 60000,  // 60 seconds
    STANDINGS: 300000,    // 5 minutes
    AI_INSIGHTS: 300000   // 5 minutes
  }
};

// Initialize analytics if enabled
if (window.ENV_CONFIG.ENABLE_ANALYTICS) {
  // In production, replace with actual analytics code
  window.analytics = {
    track: (event, properties) => {
      if (window.ENV_CONFIG.DEBUG_MODE) {
        console.log('[Analytics]', event, properties);
      }
    },
    identify: (userId, traits) => {
      if (window.ENV_CONFIG.DEBUG_MODE) {
        console.log('[Analytics] Identify', userId, traits);
      }
    },
    page: (name, properties) => {
      if (window.ENV_CONFIG.DEBUG_MODE) {
        console.log('[Analytics] Page', name, properties);
      }
    }
  };
}

// Set debug mode based on URL parameter (for easier testing)
if (window.location.search.includes('debug=true')) {
  window.ENV_CONFIG.DEBUG_MODE = true;
  console.log('Debug mode enabled');
  console.log('Environment Configuration:', window.ENV_CONFIG);
}

// Log the API URL when loading
console.log('API Base URL configured as:', window.ENV_CONFIG.API_BASE_URL); 