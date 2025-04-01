/**
 * Sports Analytics Platform - Simple Express Server
 * Enterprise-ready server with basic settings for direct execution
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const helmet = require('helmet');
const apiRouter = require('./routes/api');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false
}));

// Enable CORS
app.use(cors());

// Request logging
app.use(morgan('combined'));

// Compress responses
app.use(compression());

// Body parsers
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: true, limit: '16mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRouter);

// Default route - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res, next) => {
  try {
    // First check if a 404.html exists
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } catch (err) {
    // Fallback to JSON response
    res.status(404).json({
      status: 'error',
      message: 'Not found'
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
  console.log(`🌐 Web interface available at http://localhost:${PORT}`);
}); 