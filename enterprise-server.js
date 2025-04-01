/**
 * Sports Analytics Enterprise Server
 * Main entry point for the application
 */

// Import the API server
const apiServer = require('./api');

// Log server startup information
console.log('==================================');
console.log('Sports Analytics Enterprise Server');
console.log('==================================');
console.log('Starting server...');
console.log('For production use on enterprise deployments');
console.log('Copyright © 2023 Sports Analytics Pro');
console.log('==================================');

// No need to start the server again since it's started in api.js
// This file serves as the main entry point for the application 