// Direct API runner script
require('dotenv').config();

// Import the api module
console.log('Loading API module...');
const api = require('./api');

// Initialize the API server
console.log('Initializing API server...');
api.initializeApp()
  .then(server => {
    console.log('API server initialized and running on port', process.env.PORT || 5050);
    
    // Graceful shutdown
    const shutdown = () => {
      console.log('Shutting down API server...');
      server.close(() => {
        console.log('API server shut down successfully');
        process.exit(0);
      });
    };
    
    // Handle termination signals
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch(error => {
    console.error('Error initializing API server:', error);
    process.exit(1);
  }); 