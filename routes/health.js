// routes/health.js - Health check endpoints

const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');

// Basic health check endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Detailed health check with system information
router.get('/detailed', (req, res) => {
  const memoryUsage = process.memoryUsage();
  
  // Get system information
  const systemInfo = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024)) + 'MB',
    freeMemory: Math.round(os.freemem() / (1024 * 1024)) + 'MB',
    uptime: Math.round(os.uptime() / 60) + ' minutes'
  };
  
  // Get process information
  const processInfo = {
    pid: process.pid,
    uptime: Math.round(process.uptime() / 60) + ' minutes',
    memoryUsage: {
      rss: Math.round(memoryUsage.rss / (1024 * 1024)) + 'MB',
      heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)) + 'MB',
      heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)) + 'MB',
      external: Math.round(memoryUsage.external / (1024 * 1024)) + 'MB',
      percentUsed: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) + '%'
    }
  };
  
  // Check if Python is available
  let pythonStatus = 'unknown';
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
    if (fs.existsSync(scriptPath)) {
      pythonStatus = 'script_found';
    } else {
      pythonStatus = 'script_missing';
    }
  } catch (error) {
    pythonStatus = 'error: ' + error.message;
  }
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    system: systemInfo,
    process: processInfo,
    python: {
      status: pythonStatus,
      enabled: process.env.PYTHON_ENABLED !== 'false'
    }
  });
});

// Memory usage endpoint
router.get('/memory', (req, res) => {
  const memoryUsage = process.memoryUsage();
  
  // Get memory history if available
  let memoryHistory = [];
  if (global.memoryMonitor && typeof global.memoryMonitor.getHistory === 'function') {
    memoryHistory = global.memoryMonitor.getHistory();
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    current: {
      rss: Math.round(memoryUsage.rss / (1024 * 1024)) + 'MB',
      heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)) + 'MB',
      heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)) + 'MB',
      external: Math.round(memoryUsage.external / (1024 * 1024)) + 'MB',
      percentUsed: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) + '%'
    },
    system: {
      totalMemory: Math.round(os.totalmem() / (1024 * 1024)) + 'MB',
      freeMemory: Math.round(os.freemem() / (1024 * 1024)) + 'MB',
      percentUsed: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100) + '%'
    },
    history: memoryHistory
  });
});

// Force garbage collection (if available)
router.post('/gc', (req, res) => {
  if (global.gc) {
    global.gc();
    res.json({
      status: 'ok',
      message: 'Garbage collection triggered',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(400).json({
      status: 'error',
      message: 'Garbage collection not available. Run with --expose-gc flag.',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;