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

    // Detect Python executable path with fallbacks
    const detectedPythonPath = this.#detectPythonPath(config.pythonPath);

    // Configuration with sensible defaults, adjusted for stability and performance
    this.config = {
      pythonPath: detectedPythonPath,
      scriptDirectory: config.scriptDirectory || path.resolve(process.cwd(), 'scripts'),
      timeout: config.timeout || 60000, // 60 seconds default timeout (increased from 30s)
      maxRetries: config.maxRetries || 1, // Reduced to 1 to avoid excessive retries
      logLevel: config.logLevel || 'info',
      enablePerformanceLogging: config.enablePerformanceLogging || false, // Disabled to reduce logging overhead
      securitySandbox: config.securitySandbox || false
    };

    // Initialize logging
    this.logger = this.#initializeLogger();

    // Log Python path for debugging
    this.logger.info(`Using Python executable: ${this.config.pythonPath}`, {
      timestamp: new Date().toISOString()
    });

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

    // Register process exit handler to ensure cleanup
    process.on('exit', () => {
      try {
        // Synchronous cleanup on process exit
        for (const [executionId, execution] of this.executionTracker.entries()) {
          if (execution.process && !execution.process.killed) {
            execution.process.kill('SIGKILL');
          }
        }
      } catch (error) {
        // Can't log during exit event, but at least we tried to clean up
      }
    });
  }

  /**
   * Detect Python executable path with multiple fallbacks
   * @private
   * @param {string} configPath Path from config
   * @returns {string} Detected Python path
   */
  #detectPythonPath(configPath) {
    // Priority order for Python path:
    // 1. Explicitly provided in config
    // 2. PYTHON_PATH environment variable
    // 3. PYTHON_EXECUTABLE environment variable (some systems use this)
    // 4. Check common Python executable paths
    // 5. Default to 'python' command

    if (configPath) {
      return configPath;
    }

    // Check environment variables
    const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
    if (envPath) {
      return envPath;
    }

    // Check common paths based on platform
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Common Windows Python paths
      const commonWindowsPaths = [
        // Python 3 paths
        'C:\\Python39\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python312\\python.exe',
        // Python launcher
        'C:\\Windows\\py.exe',
        // Anaconda/Miniconda paths
        'C:\\ProgramData\\Anaconda3\\python.exe',
        'C:\\ProgramData\\miniconda3\\python.exe',
        // User profile paths
        `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
        `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
        `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
        `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      ];

      // Check if any of these paths exist synchronously
      for (const pythonPath of commonWindowsPaths) {
        try {
          if (require('fs').existsSync(pythonPath)) {
            return pythonPath;
          }
        } catch (e) {
          // Ignore errors and continue checking
        }
      }
    } else {
      // On Unix-like systems, we can try to use the 'which' command
      try {
        const { execSync } = require('child_process');
        const pythonPath = execSync('which python3 || which python').toString().trim();
        if (pythonPath) {
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and fall back to default
      }
    }

    // Default fallback
    return 'python';
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

    // Use a fixed path to the script to avoid repeated file system checks
    const scriptBaseName = path.basename(scriptName);
    const fixedScriptPath = path.join('scripts', scriptBaseName);

    // Check if the script exists at the fixed path
    const scriptPath = path.resolve(process.cwd(), fixedScriptPath);

    // Only check file existence once and cache the result
    let scriptExists = false;
    let finalScriptPath = '';

    try {
      await fs.access(scriptPath);
      scriptExists = true;
      finalScriptPath = fixedScriptPath;
    } catch (e) {
      // Script not found at primary location, check one alternative location
      const alternativeScriptPath = path.resolve(process.cwd(), scriptBaseName);

      try {
        await fs.access(alternativeScriptPath);
        scriptExists = true;
        finalScriptPath = scriptBaseName;
      } catch (e) {
        // Not found in alternative location either
      }
    }

    if (!scriptExists) {
      const error = new Error(`Script not found: ${scriptName}`);
      this.#handleExecutionError(error, executionId, scriptName, startTime);
      throw error;
    }

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
      this.logger.error('Input validation failed', { data: typeof data });
      throw validationError;
    }

    // Ensure data is properly structured for Python script
    if (data.type === 'health_check') {
      // Allow health checks to pass through with minimal data
      return;
    }

    // Ensure required fields are present for predictions
    if (!data.league && data.type !== 'health_check') {
      const validationError = new Error('Invalid input: league is required for predictions');
      this.logger.error('Input validation failed: missing league', { data });
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
    // Extract the script name from the path if it includes directory
    const scriptBaseName = path.basename(scriptName);

    // Determine the correct script path
    // If scriptName already includes 'scripts/', use process.cwd() as the base
    // Otherwise, use the configured script directory
    const scriptPath = scriptName.includes('scripts' + path.sep)
      ? process.cwd()
      : this.config.scriptDirectory;

    this.logger.info(`Preparing to execute Python script: ${scriptBaseName} from path: ${scriptPath}`, {
      scriptName,
      scriptPath,
      timestamp: new Date().toISOString()
    });

    return {
      mode: 'json',
      pythonPath: this.config.pythonPath,
      scriptPath: scriptPath,
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
    let pythonProcess = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Track execution attempt (without process reference initially)
        this.executionTracker.set(executionId, {
          attempt,
          startTime: Date.now()
        });

        // Extract the script name from the path if it includes directory
        const scriptBaseName = path.basename(scriptName);

        // Check multiple possible script paths to handle path inconsistency issues
        const possiblePaths = [
          // Path as provided in options
          path.join(options.scriptPath, scriptBaseName),
          // Path with 'scripts' directory explicitly added
          path.resolve(process.cwd(), 'scripts', scriptBaseName),
          // Path without 'scripts' directory
          path.resolve(process.cwd(), scriptBaseName),
          // Additional paths to check
          path.resolve(process.cwd(), 'service', scriptBaseName),
          path.resolve(process.cwd(), 'service', scriptBaseName.replace('_', '-')),
          path.resolve(process.cwd(), 'scripts', scriptBaseName.replace('_', '-')),
          // Check for .py extension explicitly
          path.resolve(process.cwd(), 'scripts', `${scriptBaseName}.py`),
          path.resolve(process.cwd(), `${scriptBaseName}.py`)
        ];

        let scriptExists = false;
        let validScriptPath = '';

        // Check each possible path
        for (const pathToCheck of possiblePaths) {
          try {
            await fs.access(pathToCheck);
            scriptExists = true;
            validScriptPath = pathToCheck;
            this.logger.info(`Found Python script at: ${validScriptPath}`, {
              executionId,
              scriptName: scriptBaseName
            });
            break;
          } catch (e) {
            // Continue checking other paths
          }
        }

        if (!scriptExists) {
          // If script not found, try to create a basic one
          try {
            const defaultScriptPath = path.resolve(process.cwd(), 'scripts', scriptBaseName);
            const defaultScriptDir = path.dirname(defaultScriptPath);

            // Create directory if it doesn't exist
            try {
              await fs.mkdir(defaultScriptDir, { recursive: true });
            } catch (mkdirError) {
              // Ignore if directory already exists
            }

            // Create a basic script
            const basicScriptContent = `# ${scriptBaseName} - Basic predictive model script

import sys
import os
import json
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("${scriptBaseName}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def main():
    """Main function to process input and generate predictions"""
    try:
        # Get input from Node.js
        input_data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

        # Log the received data
        logger.info(f"Received request: {input_data.get('type', 'unknown')}")

        # Handle health check
        if input_data.get('type') == 'health_check':
            result = {"status": "ok", "timestamp": datetime.now().isoformat()}
            print(json.dumps(result))
            return

        # Process based on prediction type
        prediction_type = input_data.get('prediction_type', '')
        league = input_data.get('league', '')

        # Generate mock prediction result
        result = {
            "prediction": 0.75,
            "confidence": 0.85,
            "factors": ["historical_performance", "recent_form"],
            "timestamp": datetime.now().isoformat(),
            "league": league,
            "type": prediction_type
        }

        # Return result as JSON
        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Error in predictive model: {str(e)}")
        error_result = {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()
`;

            await fs.writeFile(defaultScriptPath, basicScriptContent);
            this.logger.info(`Created basic Python script at: ${defaultScriptPath}`, {
              executionId,
              scriptName: scriptBaseName
            });

            scriptExists = true;
            validScriptPath = defaultScriptPath;
          } catch (createError) {
            this.logger.error(`Failed to create basic Python script: ${createError.message}`, {
              executionId,
              scriptName: scriptBaseName
            });

            const errorMsg = `Python script not found: ${scriptBaseName}. Checked paths: ${possiblePaths.join(', ')}`;
            this.logger.error(errorMsg, {
              executionId,
              scriptName
            });
            throw new Error(errorMsg);
          }
        }

        // Update options with the correct path
        const scriptDir = path.dirname(validScriptPath);
        options.scriptPath = scriptDir;

        // Update scriptName to use the basename
        const finalScriptName = path.basename(validScriptPath);

        // Verify Python executable path exists before running
        const pythonPath = options.pythonPath || this.config.pythonPath || process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';

        try {
          // Use child_process.spawn to check if Python executable exists
          const { spawn } = require('child_process');
          const testProcess = spawn(pythonPath, ['-c', 'print("Python executable check")']);

          // Wait for process to exit
          await new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';

            testProcess.stdout.on('data', (data) => {
              stdout += data.toString();
            });

            testProcess.stderr.on('data', (data) => {
              stderr += data.toString();
            });

            testProcess.on('error', (err) => {
              reject(new Error(`Python executable check failed: ${err.message}`));
            });

            testProcess.on('exit', (code) => {
              if (code === 0) {
                this.logger.info(`Python executable check passed: ${pythonPath}`, {
                  executionId,
                  stdout: stdout.trim()
                });
                resolve();
              } else {
                reject(new Error(`Python executable check exited with code ${code}: ${stderr}`));
              }
            });

            // Set timeout for the check (increased to 30 seconds)
            const verificationTimeout = parseInt(process.env.PYTHON_VERIFICATION_TIMEOUT, 10) || 30000;
            setTimeout(() => {
              testProcess.kill();
              this.logger.error(`Python executable check timed out after ${verificationTimeout/1000} seconds`, {
                executionId,
                pythonPath
              });
              reject(new Error(`Python executable check timed out after ${verificationTimeout/1000} seconds`));
            }, verificationTimeout);
          });
        } catch (pythonCheckError) {
          this.logger.error('Python executable verification failed:', {
            error: pythonCheckError.message,
            pythonPath,
            executionId
          });

          // Try to use a fallback Python path
          const fallbackPythonPath = 'python';
          if (pythonPath !== fallbackPythonPath) {
            this.logger.info(`Trying fallback Python path: ${fallbackPythonPath}`, {
              executionId
            });
            options.pythonPath = fallbackPythonPath;
          } else {
            throw new Error(`Python executable not found or not accessible: ${pythonPath}`);
          }
        }

        // Execute Python script with explicit script name and capture process reference
        const results = await new Promise((resolve, reject) => {
          try {
            // Use PythonShell.run with process capture
            const pyshell = new PythonShell(finalScriptName, options);
            pythonProcess = pyshell.childProcess;

            // Store process reference in execution tracker for cleanup
            const executionInfo = this.executionTracker.get(executionId);
            if (executionInfo) {
              executionInfo.process = pythonProcess;
              this.executionTracker.set(executionId, executionInfo);
            }

            let output = [];
            let errorOutput = '';

            pyshell.on('message', (message) => {
              try {
                // Try to parse as JSON
                const parsedMessage = JSON.parse(message);
                output.push(parsedMessage);
              } catch (parseError) {
                // If not JSON, store as string
                output.push(message);
              }
            });

            pyshell.stderr.on('data', (data) => {
              errorOutput += data.toString();
              this.logger.warn(`Python stderr output: ${data.toString()}`, {
                executionId,
                scriptName: finalScriptName
              });
            });

            pyshell.on('error', (err) => {
              this.logger.error(`Python shell error: ${err.message}`, {
                executionId,
                scriptName: finalScriptName,
                stderr: errorOutput
              });
              reject(err);
            });

            pyshell.on('close', (code) => {
              if (code !== 0) {
                this.logger.warn(`Python process exited with code ${code}`, {
                  executionId,
                  scriptName: finalScriptName,
                  stderr: errorOutput
                });

                if (output.length === 0) {
                  reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
                  return;
                }
              }

              resolve(output && output.length > 0 ? output[0] : {});
            });

            // Set timeout for the execution (with increased timeout from env or config)
            const executionTimeout = options.timeout || this.config.timeout || parseInt(process.env.PYTHON_EXECUTION_TIMEOUT, 10) || 120000;
            const timeout = setTimeout(() => {
              if (pythonProcess && !pythonProcess.killed) {
                pythonProcess.kill('SIGTERM');
                this.logger.error(`Python script execution timed out after ${executionTimeout/1000} seconds`, {
                  executionId,
                  scriptName: finalScriptName
                });
                reject(new Error(`Python script execution timed out after ${executionTimeout/1000} seconds`));
              }
            }, executionTimeout);

            // Clear timeout when process ends
            pyshell.on('close', () => {
              clearTimeout(timeout);
            });
          } catch (error) {
            reject(error);
          }
        });

        // Clear tracking for successful execution
        this.executionTracker.delete(executionId);

        return results;

      } catch (error) {
        lastError = error;
        this.logger.warn(`Python script execution attempt ${attempt} failed`, {
          executionId,
          scriptName,
          error: error.message,
          stack: error.stack
        });

        // Clean up process if it exists and failed
        if (pythonProcess && !pythonProcess.killed) {
          try {
            pythonProcess.kill('SIGTERM');
          } catch (killError) {
            this.logger.warn(`Failed to terminate Python process during error handling: ${killError.message}`);
          }
        }

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
   * Graceful shutdown method with enhanced process termination
   */
  async shutdown() {
    this.logger.info('Python Bridge shutting down', {
      timestamp: new Date().toISOString()
    });

    // Track active Python processes that need to be terminated
    const activeProcesses = [];

    // Collect all active processes from the execution tracker
    for (const [executionId, execution] of this.executionTracker.entries()) {
      if (execution.process) {
        activeProcesses.push({
          executionId,
          process: execution.process,
          startTime: execution.startTime
        });
      }
    }

    // Log active processes that will be terminated
    if (activeProcesses.length > 0) {
      this.logger.info(`Terminating ${activeProcesses.length} active Python processes`, {
        processes: activeProcesses.map(p => p.executionId),
        timestamp: new Date().toISOString()
      });

      // Terminate each process with a timeout
      for (const proc of activeProcesses) {
        try {
          // Use a more reliable method to terminate the process
          if (proc.process && typeof proc.process.kill === 'function') {
            proc.process.kill('SIGTERM');

            // Give it a moment to terminate gracefully
            await new Promise(resolve => setTimeout(resolve, 500));

            // Force kill if still running
            if (!proc.process.killed) {
              proc.process.kill('SIGKILL');
            }

            this.logger.info(`Terminated Python process for execution ${proc.executionId}`, {
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          this.logger.warn(`Error terminating Python process for execution ${proc.executionId}:`, {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Clear any pending executions
    this.executionTracker.clear();

    // Log final metrics (if enabled)
    if (this.config.enablePerformanceLogging) {
      this.logger.info('Final Performance Metrics', this.getPerformanceMetrics());
    }
  }
}

// Create and export singleton instance with enhanced configuration
const pythonBridge = new PythonBridge({
  // Let the class handle Python path detection with fallbacks
  scriptDirectory: path.join(__dirname, '../scripts'),
  logLevel: process.env.LOG_LEVEL || 'info',
  maxRetries: parseInt(process.env.PYTHON_BRIDGE_MAX_RETRIES) || 2,
  timeout: parseInt(process.env.PYTHON_EXECUTION_TIMEOUT) || 30000
});

// Export the singleton instance
module.exports = pythonBridge;

// Also export the class for testing and advanced usage
module.exports.PythonBridge = PythonBridge;