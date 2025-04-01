/**
 * Sports Analytics Platform - Optimized Startup Script
 * Enterprise-grade cluster management with advanced features
 */

const cluster = require('cluster');
const os = require('os');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Configuration
const ENABLE_CLUSTERING = true;
const ENABLE_MEMORY_MONITORING = true;
const GC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MEMORY_LIMIT = 8 * 1024; // 8GB in MB
const NODE_OPTIONS = [
  '--expose-gc',
  '--max-http-header-size=16384',
  '--no-warnings',
  '--trace-warnings',
  '--async-stack-traces',
  `--max-old-space-size=${MEMORY_LIMIT}`
];

// Determine number of workers - use 75% of available CPUs, min 1, max 4
const numCPUs = os.cpus().length;
const workerCount = Math.max(1, Math.min(4, Math.round(numCPUs * 0.75)));

// Server path
const serverPath = path.join(__dirname, 'server.js');

// Check if server file exists
if (!fs.existsSync(serverPath)) {
  console.error(`❌ Server file not found at: ${serverPath}`);
  process.exit(1);
}

console.log(`🚀 Starting application with optimized settings:
   • Clustering: ${ENABLE_CLUSTERING ? `Enabled (${workerCount} workers)` : 'Disabled'}
   • Memory monitoring: ${ENABLE_MEMORY_MONITORING ? 'Enabled' : 'Disabled'}
   • GC interval: ${GC_INTERVAL}ms
   • Memory limit: ${MEMORY_LIMIT}MB
   • Response compression: Enabled
   • Logging format: combined
   • Caching: Enabled
   • Environment: ${process.env.NODE_ENV || 'development'}
   • Node options: ${NODE_OPTIONS.join(' ')}
`);

// For enterprise cluster management
let listeningWorkers = 0;
let isStartingUp = true;
const PORT = process.env.PORT || 8000;

// Main cluster implementation
if (ENABLE_CLUSTERING) {
  if (cluster.isPrimary) {
    console.log(`🚀 Master process starting with ${workerCount} workers...`);
    
    // Create the listening handle for all workers to share
    const server = net.createServer();
    server.listen(PORT, () => {
      console.log(`Primary process listening on port ${PORT} - distributing connections to workers`);
    });
    
    // Start memory monitoring in a separate process if enabled
    if (ENABLE_MEMORY_MONITORING) {
      console.log('🧠 Memory optimization: enabled');
      try {
        const memoryMonitorPath = path.join(__dirname, 'scripts', 'memory-monitor.js');
        if (fs.existsSync(memoryMonitorPath)) {
          const memoryMonitor = spawn('node', [memoryMonitorPath]);
          memoryMonitor.stdout.on('data', (data) => {
            console.log(`Memory Monitor: ${data.toString().trim()}`);
          });
          
          memoryMonitor.stderr.on('data', (data) => {
            console.error(`Memory Monitor Error: ${data.toString().trim()}`);
          });
        } else {
          console.warn(`⚠️ Memory monitor script not found at: ${memoryMonitorPath}`);
        }
      } catch (err) {
        console.error('Error starting memory monitor:', err);
      }
    }
    
    // Fork workers
    for (let i = 0; i < workerCount; i++) {
      // Add environment variables for worker identification
      const env = { ...process.env };
      env.CLUSTER_WORKER_ID = i + 1;
      
      // Fork a worker with environment
      const worker = cluster.fork(env);
      
      // Listen for worker messages
      worker.on('message', (msg) => {
        if (msg.cmd === 'ready') {
          listeningWorkers++;
          console.log(`Worker #${worker.id} is ready (${listeningWorkers}/${workerCount})`);
          
          // When all workers are ready, send them the server handle
          if (listeningWorkers === workerCount) {
            console.log('All workers ready, sending server handle');
            Object.values(cluster.workers).forEach(worker => {
              worker.send({ cmd: 'server' }, server);
            });
          }
        }
      });
    }
    
    // If a worker dies, create a new one
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      
      // Decrease the listening count
      listeningWorkers--;
      
      // Fork a new worker with the same ID
      const env = { ...process.env };
      env.CLUSTER_WORKER_ID = worker.id;
      const newWorker = cluster.fork(env);
      
      // Wait for it to be ready then send the server handle
      newWorker.on('message', (msg) => {
        if (msg.cmd === 'ready') {
          listeningWorkers++;
          console.log(`Replacement worker #${newWorker.id} is ready`);
          newWorker.send({ cmd: 'server' }, server);
        }
      });
    });
  } else {
    // This code runs in the worker processes
    
    // Tell the master we're ready to receive the server handle
    process.send({ cmd: 'ready' });
    
    // Wait for the master to send us the server handle
    process.on('message', (message, serverHandle) => {
      if (message.cmd === 'server') {
        console.log(`Worker ${process.env.CLUSTER_WORKER_ID} received server handle`);
        
        // Initialize the server with the shared handle
        try {
          // Override environment variable to avoid port conflicts
          process.env.USE_SHARED_HANDLE = 'true';
          
          // Start the server module using the shared handle
          require('./server.js').useHandle(serverHandle);
          
          console.log(`Worker ${process.env.CLUSTER_WORKER_ID} is now processing requests`);
        } catch (error) {
          console.error(`Worker ${process.env.CLUSTER_WORKER_ID} failed to start:`, error);
          process.exit(1);
        }
      }
    });
  }
} else {
  // Run in single process mode
  console.log('Running in single process mode');
  const nodeProcess = spawn('node', [...NODE_OPTIONS, serverPath], {
    stdio: 'inherit',
    env: process.env
  });
  
  nodeProcess.on('error', (err) => {
    console.error(`❌ Failed to start application: ${err.message}`);
    process.exit(1);
  });
  
  nodeProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ Application exited with code ${code}`);
      process.exit(code);
    }
  });
}

// Handle signals
process.on('SIGINT', () => {
  console.log('👋 Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('👋 Received SIGTERM, shutting down...');
  process.exit(0);
}); 