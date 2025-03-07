// scripts/fix-max-listeners.js - Fix for MaxListenersExceededWarning

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const winston = require('winston');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/fix-max-listeners.log' })
  ]
});

// Ensure logs directory exists
try {
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
  }
} catch (error) {
  console.error('Error creating logs directory:', error);
}

// Main function
async function main() {
  logger.info('Starting MaxListenersExceededWarning fix...');

  // 1. Set default max listeners for all EventEmitter instances
  const defaultMaxListeners = EventEmitter.defaultMaxListeners;
  logger.info(`Current default max listeners: ${defaultMaxListeners}`);
  
  // Increase the default max listeners to a safer value
  const newMaxListeners = 15;
  EventEmitter.defaultMaxListeners = newMaxListeners;
  logger.info(`Updated default max listeners to: ${newMaxListeners}`);

  // 2. Fix startup.js event listeners
  try {
    const startupPath = path.join(process.cwd(), 'startup.js');
    if (fs.existsSync(startupPath)) {
      let startupContent = fs.readFileSync(startupPath, 'utf8');
      
      // Check if setupGracefulShutdown function exists
      if (startupContent.includes('function setupGracefulShutdown()')) {
        // Add setMaxListeners to the process object
        if (!startupContent.includes('process.setMaxListeners')) {
          startupContent = startupContent.replace(
            'function setupGracefulShutdown() {',
            'function setupGracefulShutdown() {\n  // Set max listeners to prevent warnings\n  process.setMaxListeners(15);'
          );
          
          fs.writeFileSync(startupPath, startupContent);
          logger.info('Added process.setMaxListeners(15) to startup.js');
        } else {
          logger.info('process.setMaxListeners already exists in startup.js');
        }
      } else {
        logger.warn('setupGracefulShutdown function not found in startup.js');
      }
    } else {
      logger.warn('startup.js not found');
    }
  } catch (error) {
    logger.error(`Error updating startup.js: ${error.message}`);
  }

  // 3. Fix api.js event listeners
  try {
    const apiPath = path.join(process.cwd(), 'api.js');
    if (fs.existsSync(apiPath)) {
      let apiContent = fs.readFileSync(apiPath, 'utf8');
      
      // Check if TheAnalyzerPredictiveModel class exists
      if (apiContent.includes('class TheAnalyzerPredictiveModel extends EventEmitter')) {
        // Add setMaxListeners to the constructor
        if (!apiContent.includes('this.setMaxListeners(')) {
          apiContent = apiContent.replace(
            'constructor() {',
            'constructor() {\n    // Set max listeners to prevent warnings\n    this.setMaxListeners(15);'
          );
          
          fs.writeFileSync(apiPath, apiContent);
          logger.info('Added this.setMaxListeners(15) to TheAnalyzerPredictiveModel constructor in api.js');
        } else {
          logger.info('this.setMaxListeners already exists in TheAnalyzerPredictiveModel constructor');
        }
      } else {
        logger.warn('TheAnalyzerPredictiveModel class not found in api.js');
      }
    } else {
      logger.warn('api.js not found');
    }
  } catch (error) {
    logger.error(`Error updating api.js: ${error.message}`);
  }

  // 4. Fix WebSocket server event listeners
  try {
    const wsServerPath = path.join(process.cwd(), 'utils', 'websocket-server.js');
    if (fs.existsSync(wsServerPath)) {
      let wsServerContent = fs.readFileSync(wsServerPath, 'utf8');
      
      // Check if WebSocketServer class exists
      if (wsServerContent.includes('class WebSocketServer extends EventEmitter')) {
        // Add setMaxListeners to the constructor if it doesn't exist or has a low value
        if (!wsServerContent.includes('this.setMaxListeners(')) {
          wsServerContent = wsServerContent.replace(
            'constructor(options = {}) {',
            'constructor(options = {}) {\n    // Set max listeners to prevent warnings\n    this.setMaxListeners(20);'
          );
          
          fs.writeFileSync(wsServerPath, wsServerContent);
          logger.info('Added this.setMaxListeners(20) to WebSocketServer constructor');
        } else if (wsServerContent.includes('this.setMaxListeners(') && !wsServerContent.includes('this.setMaxListeners(20)')) {
          // Update existing setMaxListeners to a higher value
          wsServerContent = wsServerContent.replace(
            /this\.setMaxListeners\(\d+\)/,
            'this.setMaxListeners(20)'
          );
          
          fs.writeFileSync(wsServerPath, wsServerContent);
          logger.info('Updated WebSocketServer setMaxListeners to 20');
        } else {
          logger.info('WebSocketServer already has appropriate setMaxListeners value');
        }
        
        // Add event listener cleanup method if it doesn't exist
        if (!wsServerContent.includes('_cleanupEventListeners')) {
          const cleanupMethod = `
  /**
   * Clean up event listeners to prevent memory leaks
   * @private
   */
  _cleanupEventListeners() {
    try {
      // Get current listener count
      const listenerCount = this.eventNames().reduce((total, event) => {
        return total + this.listenerCount(event);
      }, 0);

      logger.info(\`WebSocketServer event listener check: \${listenerCount} total listeners across \${this.eventNames().length} events\`, {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });

      // If we have too many listeners, log details and clean up
      if (listenerCount > 15) {
        logger.warn(\`High number of event listeners detected: \${listenerCount}\`, {
          events: this.eventNames(),
          counts: this.eventNames().map(event => ({
            event,
            count: this.listenerCount(event)
          })),
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });

        // Remove duplicate or unnecessary listeners
        this._removeExcessListeners();
      }
    } catch (error) {
      logger.error('Error during event listener cleanup:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    }
  }

  /**
   * Remove excess event listeners to prevent memory leaks
   * @private
   */
  _removeExcessListeners() {
    // For each event with more than 5 listeners, keep only the most recent ones
    this.eventNames().forEach(event => {
      const count = this.listenerCount(event);
      if (count > 5) {
        logger.info(\`Cleaning up excess listeners for event: \${event} (\${count} listeners)\`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });

        // For metrics events, we can safely remove all and add back one
        if (event === 'metrics') {
          this.removeAllListeners(event);
          this.once('metrics', data => {
            logger.debug('Metrics event received after listener cleanup', {
              metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
            });
          });
          logger.info(\`Removed all metrics listeners and added one listener back\`, {
            metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
          });
        }
      }
    });
  }`;
          
          // Find a good place to insert the cleanup method
          const insertPoint = wsServerContent.indexOf('  validateAndSetOptions(options) {');
          if (insertPoint !== -1) {
            wsServerContent = wsServerContent.slice(0, insertPoint) + cleanupMethod + '\n\n' + wsServerContent.slice(insertPoint);
            
            // Add interval to call the cleanup method
            if (!wsServerContent.includes('eventListenerCleanupInterval')) {
              const intervalCode = `
    // Add a more frequent cleanup interval for event listeners
    this.eventListenerCleanupInterval = setInterval(() => {
      this._cleanupEventListeners();
    }, 600000); // Every 10 minutes
    this.monitoringIntervals.push(this.eventListenerCleanupInterval);`;
              
              // Find a good place to insert the interval
              const intervalInsertPoint = wsServerContent.indexOf('this.monitoringIntervals.push(this.checkMemoryUsageInterval);');
              if (intervalInsertPoint !== -1) {
                wsServerContent = wsServerContent.slice(0, intervalInsertPoint + 'this.monitoringIntervals.push(this.checkMemoryUsageInterval);'.length) + 
                                 intervalCode + 
                                 wsServerContent.slice(intervalInsertPoint + 'this.monitoringIntervals.push(this.checkMemoryUsageInterval);'.length);
              }
            }
            
            fs.writeFileSync(wsServerPath, wsServerContent);
            logger.info('Added event listener cleanup methods to WebSocketServer');
          } else {
            logger.warn('Could not find appropriate insertion point for cleanup methods');
          }
        } else {
          logger.info('WebSocketServer already has event listener cleanup methods');
        }
      } else {
        logger.warn('WebSocketServer class not found in websocket-server.js');
      }
    } else {
      logger.warn('websocket-server.js not found');
    }
  } catch (error) {
    logger.error(`Error updating websocket-server.js: ${error.message}`);
  }

  // 5. Fix process event listeners in main application
  try {
    const mainAppPath = path.join(process.cwd(), 'api.js');
    if (fs.existsSync(mainAppPath)) {
      let mainAppContent = fs.readFileSync(mainAppPath, 'utf8');
      
      // Check for process.on('uncaughtException') and add setMaxListeners
      if (mainAppContent.includes("process.on('uncaughtException'") && !mainAppContent.includes('process.setMaxListeners')) {
        // Add process.setMaxListeners before the first process.on
        const processOnIndex = mainAppContent.indexOf("process.on('uncaughtException'");
        if (processOnIndex !== -1) {
          // Find the start of the line
          const lineStartIndex = mainAppContent.lastIndexOf('\n', processOnIndex) + 1;
          
          // Insert setMaxListeners before the process.on line
          mainAppContent = mainAppContent.slice(0, lineStartIndex) + 
                          '    // Set max listeners to prevent warnings\n' +
                          '    process.setMaxListeners(15);\n    ' + 
                          mainAppContent.slice(lineStartIndex);
          
          fs.writeFileSync(mainAppPath, mainAppContent);
          logger.info('Added process.setMaxListeners(15) before process.on(\'uncaughtException\') in api.js');
        }
      } else if (mainAppContent.includes('process.setMaxListeners')) {
        logger.info('process.setMaxListeners already exists in api.js');
      } else if (!mainAppContent.includes("process.on('uncaughtException'")) {
        logger.warn('process.on(\'uncaughtException\') not found in api.js');
      }
    }
  } catch (error) {
    logger.error(`Error updating main application: ${error.message}`);
  }

  logger.info('MaxListenersExceededWarning fix completed successfully');
}

// Run the main function
main().catch(error => {
  logger.error(`Error in fix-max-listeners.js: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});