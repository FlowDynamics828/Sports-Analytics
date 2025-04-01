// Simple debug script to run the API directly
require('dotenv').config();

try {
  console.log('Starting debug script...');
  const api = require('./api');
  
  console.log('API module loaded successfully, initializing...');
  
  // Initialize the app
  api.initializeApp().then(server => {
    console.log('API server initialized successfully');
  }).catch(error => {
    console.error('Error initializing API server:', error);
  });
} catch (error) {
  console.error('Error loading API module:', error);
}

// Keep process alive
process.stdin.resume();
console.log('Debug script running. Press Ctrl+C to exit.');