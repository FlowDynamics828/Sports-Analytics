import cluster from 'cluster';
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { Express } from 'express';
import winston from 'winston';

// Import local modules
const { initializeWebSocketServer } = require('./utils/websocket');
const { app, initializeApp } = require('./app');

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  // ... rest of the logging config ...
});

// Type declarations
interface DataService {
  clearCache: () => void;
}

interface PredictiveModel {
  clearCache: () => void;
}

interface V8Engine {
  setFlagsFromString: (flags: string) => void;
}

declare global {
  namespace NodeJS {
    interface Global {
      dataService?: DataService;
      predictiveModel?: PredictiveModel;
      gc?: () => void;
      v8?: V8Engine;
    }
  }
}

// Memory management
const memoryMgmt = {
  threshold: 0.80,
  interval: 15000,
  maxHeapSize: 1024,
  gcInterval: 300000,
  lastGcTime: Date.now(),
  
  init: function() {
    if (process.env.NODE_ENV === 'production') {
      const maxHeapSizeBytes = this.maxHeapSize * 1024 * 1024;
      const v8Engine = (global as any).v8;
      if (v8Engine) {
        v8Engine.setFlagsFromString(`--max_old_space_size=${this.maxHeapSize}`);
        v8Engine.setFlagsFromString('--incremental-marking');
      }
    }

    const memUsage = process.memoryUsage();
    logger.info('Initial memory usage:', {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    });
    
    this.startMonitoring();
  },
  
  startMonitoring: function() {
    setInterval(() => {
      this.checkMemory();
    }, this.interval);

    const gc = (global as any).gc;
    if (gc) {
      setInterval(() => {
        const now = Date.now();
        if (now - this.lastGcTime >= this.gcInterval) {
          this.lastGcTime = now;
          gc();
          logger.info('Periodic garbage collection performed');
        }
      }, this.gcInterval);
    }
  },
  
  checkMemory: function() {
    const memUsage = process.memoryUsage();
    const usageRatio = memUsage.heapUsed / memUsage.heapTotal;
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    if (process.env.NODE_ENV === 'development' || usageRatio > 0.7) {
      logger.info('Memory usage:', {
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        usageRatio: `${(usageRatio * 100).toFixed(1)}%`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      });
    }
    
    if (usageRatio > this.threshold) {
      logger.warn(`High memory usage detected: ${(usageRatio * 100).toFixed(1)}%`, {
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${heapUsedMB}MB`
      });
      
      const dataService = (global as any).dataService;
      if (dataService?.clearCache) {
        dataService.clearCache();
        logger.info('Cleared data service cache');
      }
      
      const gc = (global as any).gc;
      if (gc) {
        logger.info('Forcing garbage collection');
        gc();
        
        const afterGC = process.memoryUsage();
        const gcSavings = heapUsedMB - Math.round(afterGC.heapUsed / 1024 / 1024);
        logger.info(`Memory after garbage collection (saved ${gcSavings}MB):`, {
          heapTotal: `${Math.round(afterGC.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(afterGC.heapUsed / 1024 / 1024)}MB`,
          gcSavings: `${gcSavings}MB`
        });

        if (afterGC.heapUsed / afterGC.heapTotal > 0.85) {
          logger.warn('Memory usage still high after GC, clearing additional caches');
          const predictiveModel = (global as any).predictiveModel;
          if (predictiveModel?.clearCache) {
            predictiveModel.clearCache();
          }
        }
      } else {
        logger.warn('Garbage collection not available. Start with --expose-gc flag to enable manual GC.');
      }
    }
  }
};

// Cluster setup
if (cluster.isPrimary) {
  const numCPUs = cpus().length;
  logger.info(`Primary ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Forking new worker...`);
    cluster.fork();
  });
} else {
  // Worker process
  initializeApp();
  initializeWebSocketServer(app);
  
  // Start server
  const port = process.env.PORT || 5050;
  app.listen(port, () => {
    logger.info(`Worker ${process.pid} started on port ${port}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received.');
  if (cluster.isPrimary) {
    logger.info('Primary process shutting down, killing workers...');
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.kill();
      }
    }
    process.exit(0);
  } else {
    logger.info('Worker process shutting down...');
    process.exit(0);
  }
}); 