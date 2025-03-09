// app.js - Express application setup

require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('winston');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Import routes
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const leaguesRoutes = require('./routes/leagues');
const paymentRoutes = require('./routes/payment');
const predictionsRoutes = require('./routes/predictions');
const statsRoutes = require('./routes/stats');
const healthRoutes = require('./routes/health');

// Create Express app
const app = express();

// Set up middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for development
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Set up routes
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/leagues', leaguesRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/health', healthRoutes);

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// Export the app
module.exports = app;