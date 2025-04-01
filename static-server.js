// Simple static file server to serve the dashboard
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from the public directory
app.use(express.static('public'));

// Add CORS headers to allow API requests
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Serve dashboard.html as the default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all route to serve dashboard for any other route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/dashboard.html to view the dashboard`);
}); 