// utils/PythonBridge.js

// Load environment variables
require('dotenv').config();
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const winston = require('winston');
const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');

/**
 * Enterprise-Grade Python Bridge for Machine Learning Integration
 * Provides robust, secure, and performant Python script execution
 */
class PythonBridge extends EventEmitter {
  constructor(config = {}) {
    super();

    // Configuration with sensible defaults, adjusted for stability and performance
    this.config = {
      pythonPath: config.pythonPath || process.env.PYTHON_PATH || 'python',
      scriptDirectory: config.scriptDirectory || path.join(__dirname, '../scripts'),
      timeout: config.timeout || 30000, // 30 seconds default timeout
      maxRetries: config.maxRetries || 2, // Reduced to lower resource usage
      logLevel: config.logLevel || 'info',
      enablePerformanceLogging: config.enablePerformanceLogging || false, // Disabled to reduce logging overhead
      securitySandbox: config.securitySandbox || false
    };

    // Initialize logging
    this.logger = this.#initializeLogger();

    // Performance tracking with limits
    this.performanceMetrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      executionTimestamps: []
    };

    // Security and tracking
    this.executionTracker = new Map();
  }

  /**
   * Initialize enterprise-grade logging
   * @private
   * @returns {winston.Logger} Configured logger
   */
  #initializeLogger() {
    return winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({ 
          filename: 'logs/python-bridge-error.log', 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: 'logs/python-bridge.log' 
        })
      ]
    });
  }

  /**
   * Run Python script with comprehensive error handling and performance tracking
   * @param {Object} data Input data for Python script
   * @param {string} scriptName Specific script name (required)
   * @returns {Promise<Object>} Parsed script output
   */
  async runPrediction(data, scriptName = 'predictive_model.py') {
    if (!scriptName || typeof scriptName !== 'string') {
      throw new Error('scriptName is required and must be a string');
    }

    const executionId = crypto.randomBytes(16).toString('hex');
    const startTime = performance.now();

    // Validate input
    this.#validateInput(data);

    // Prepare execution options
    const options = this.#prepareExecutionOptions(data, scriptName);

    try {
      // Execute Python script with retry mechanism
      const results = await this.#executeWithRetry(options, executionId, scriptName);

      // Update performance metrics (limited to reduce overhead)
      if (this.config.enablePerformanceLogging) {
        this.#updatePerformanceMetrics(startTime);
      }

      // Log successful execution (limited to reduce logging overhead)
      if (this.config.logLevel === 'debug') {
        this.logger.info('Python script execution successful', {
          executionId,
          scriptName,
          duration: performance.now() - startTime
        });
      }

      return results;

    } catch (error) {
      // Handle and log execution errors
      this.#handleExecutionError(error, executionId, scriptName, startTime);
      throw error;
    }
  }

  /**
   * Validate input data before script execution
   * @private
   * @param {Object} data Input data to validate
   * @throws {Error} If input is invalid
   */
  #validateInput(data) {
    if (!data || typeof data !== 'object') {
      const validationError = new Error('Invalid input: data must be a non-null object');
      this.logger.error('Input validation failed', { data });
      throw validationError;
    }
  }

  /**
   * Prepare execution options for PythonShell
   * @private
   * @param {Object} data Input data
   * @param {string} scriptName Script to execute
   * @returns {Object} Execution options
   */
  #prepareExecutionOptions(data, scriptName) {
    return {
      mode: 'json',
      pythonPath: this.config.pythonPath,
      scriptPath: this.config.scriptDirectory,
      args: [JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        executionEnvironment: 'enterprise'
      })],
      timeout: this.config.timeout
    };
  }

  /**
   * Execute Python script with retry mechanism
   * @private
   * @param {Object} options Execution options
   * @param {string} executionId Unique execution identifier
   * @param {string} scriptName Script name
   * @returns {Promise<Array>} Script execution results
   */
  async #executeWithRetry(options, executionId, scriptName) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Track execution attempt
        this.executionTracker.set(executionId, {
          attempt,
          startTime: Date.now()
        });

        // Execute Python script with explicit script name
        const fullScriptPath = path.join(options.scriptPath, scriptName);
        const results = await new Promise((resolve, reject) => {
          PythonShell.run(fullScriptPath, options, (err, results) => {
            if (err) {
              reject(err);
            } else {
              resolve(results && results.length > 0 ? results[0] : {});
            }
          });
        });

        // Clear tracking for successful execution
        this.executionTracker.delete(executionId);

        return results;

      } catch (error) {
        lastError = error;
        this.logger.warn(`Python script execution attempt ${attempt} failed`, {
          executionId,
          scriptName,
          error: error.message
        });

        // Wait before retrying (exponential backoff)
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, attempt - 1))
        );
      }
    }

    // Throw final error after max retries
    throw lastError;
  }

  /**
   * Update performance metrics after script execution (limited to reduce overhead)
   * @private
   * @param {number} startTime Execution start time
   */
  #updatePerformanceMetrics(startTime) {
    const executionTime = performance.now() - startTime;
    const metrics = this.performanceMetrics;

    metrics.totalExecutions++;
    metrics.successfulExecutions++;
    
    // Rolling average calculation
    metrics.averageExecutionTime = 
      (metrics.averageExecutionTime * (metrics.successfulExecutions - 1) + executionTime) 
      / metrics.successfulExecutions;

    // Store recent execution timestamps (limited to 10 entries)
    metrics.executionTimestamps.push({
      timestamp: Date.now(),
      duration: executionTime
    });

    if (metrics.executionTimestamps.length > 10) {
      metrics.executionTimestamps.shift();
    }
  }

  /**
   * Comprehensive error handling for script execution
   * @private
   * @param {Error} error Execution error
   * @param {string} executionId Unique execution identifier
   * @param {string} scriptName Script name
   * @param {number} startTime Execution start time
   */
  #handleExecutionError(error, executionId, scriptName, startTime) {
    const metrics = this.performanceMetrics;
    metrics.failedExecutions++;

    this.logger.error('Python script execution failed', {
      executionId,
      scriptName,
      error: error.message,
      stack: error.stack,
      duration: performance.now() - startTime
    });

    // Emit error event for external handling
    this.emit('execution:error', {
      executionId,
      scriptName,
      error: error.message
    });
  }

  /**
   * Get current performance metrics
   * @returns {Object} Performance metrics snapshot
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      timestamp: Date.now()
    };
  }

  /**
   * Health check for Python bridge
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      // Verify Python installation
      const pythonVersion = await this.#checkPythonVersion();

      // Check script directory
      const scriptsExist = await this.#checkScriptDirectory();

      return {
        status: 'healthy',
        pythonVersion,
        scriptsAvailable: scriptsExist,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check Python version
   * @private
   * @returns {Promise<string>} Python version
   */
  async #checkPythonVersion() {
    return new Promise((resolve, reject) => {
      PythonShell.runString('import sys; print(sys.version)', {
        pythonPath: this.config.pythonPath
      }, (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || 'Python not found');
      });
    });
  }

  /**
   * Verify script directory exists
   * @private
   * @returns {Promise<boolean>} Scripts availability
   */
  async #checkScriptDirectory() {
    try {
      const scripts = await fs.readdir(this.config.scriptDirectory);
      return scripts.some(script => script.endsWith('.py'));
    } catch (error) {
      this.logger.error('Script directory check failed', { error });
      return false;
    }
  }

  /**
   * Graceful shutdown method
   */
  async shutdown() {
    this.logger.info('Python Bridge shutting down', {
      timestamp: new Date().toISOString()
    });

    // Clear any pending executions
    this.executionTracker.clear();

    // Log final metrics (if enabled)
    if (this.config.enablePerformanceLogging) {
      this.logger.info('Final Performance Metrics', this.getPerformanceMetrics());
    }
  }
}

// Export singleton instance
module.exports = new PythonBridge({
  pythonPath: process.env.PYTHON_PATH || 'python',
  scriptDirectory: path.join(__dirname, '../scripts'),
  logLevel: process.env.LOG_LEVEL || 'info',
  maxRetries: parseInt(process.env.PYTHON_BRIDGE_MAX_RETRIES) || 2
});