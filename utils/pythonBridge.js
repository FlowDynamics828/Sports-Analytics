// utils/pythonBridge.js - Robust Python integration

const { spawn } = require('child_process');
const path = require('path');
const winston = require('winston');
const fs = require('fs');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'python-bridge' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/python-bridge.log' })
  ]
});

// Create logs directory if it doesn't exist
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Define PythonBridge class
class PythonBridge {
  constructor() {
    const useRelativePaths = process.env.PYTHON_USE_RELATIVE_PATHS === 'true';
    const rootDir = process.cwd();

    // Resolve Python executable path
    const venvPython = path.join(rootDir, 'venv', 'Scripts', 'python.exe');
    this.pythonPath = useRelativePaths ? 
      path.relative(rootDir, venvPython) :
      fs.existsSync(venvPython) ? venvPython : (process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python');

    // Resolve script path
    const scriptPath = path.join(rootDir, 'scripts', 'predictive_model.py');
    this.scriptPath = useRelativePaths ?
      path.relative(rootDir, scriptPath) :
      scriptPath;

    // Configuration
    this.verificationTimeout = Number(process.env.PYTHON_VERIFICATION_TIMEOUT || 60000);
    this.executionTimeout = Number(process.env.PYTHON_EXECUTION_TIMEOUT || 120000);
    this.maxRetries = Number(process.env.PYTHON_BRIDGE_MAX_RETRIES || 3);
    this.useShellMode = process.env.PYTHON_BRIDGE_SHELL_MODE === 'true';
    this.verified = false;

    // Initialize
    this._verify();
  }

  // Verify Python environment
  async _verify() {
    try {
      logger.info('Verifying Python environment...', {
        pythonPath: this.pythonPath,
        scriptPath: this.scriptPath,
        useShellMode: this.useShellMode
      });
      
      const result = await this.execute({
        type: 'health_check',
        timestamp: new Date().toISOString()
      });
      
      if (result && result.status === 'ok') {
        this.verified = true;
        logger.info('Python environment verified successfully');
      } else {
        logger.warn('Python environment verification returned unexpected result', { result });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Python environment verification failed', { error: errorMessage });
    }
    
    return this.verified;
  }

  /**
   * Execute Python script with the provided data
   * @param {Object} data - The data to pass to the Python script
   * @param {string} data.type - The type of operation
   * @param {string} [data.timestamp] - Optional timestamp
   * @param {number} [retryCount=0] - Number of retries attempted
   * @returns {Promise<any>} The result from the Python script
   */
  async execute(data, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      logger.debug('Executing Python script', {
        pythonPath: this.pythonPath,
        scriptPath: this.scriptPath,
        requestType: data.type,
        useShellMode: this.useShellMode
      });

      // Prepare spawn options with proper path quoting
      const spawnOptions = {
        env: {
          ...process.env,
          PYTHONPATH: process.cwd(),
          PYTHONUNBUFFERED: '1'
        },
        shell: true,  // Set shell to true to handle paths with spaces
        windowsHide: true
      };
      
      // Quote paths to handle spaces correctly
      const quotedPythonPath = `"${this.pythonPath}"`;
      const quotedScriptPath = `"${this.scriptPath}"`;
      
      // Spawn Python process with properly quoted paths
      const pythonProcess = spawn(
        quotedPythonPath,
        [quotedScriptPath, JSON.stringify(data)],
        spawnOptions
      );
      
      let stdout = '';
      let stderr = '';
      let timeoutId = null;
      
      // Set execution timeout
      timeoutId = setTimeout(() => {
        try {
          pythonProcess.kill('SIGTERM');
          
          // Force kill after termination timeout
          setTimeout(() => {
            try {
              if (pythonProcess.exitCode === null) {
                pythonProcess.kill('SIGKILL');
              }
            } catch (e) {
              // Process might have already exited
            }
          }, Number(process.env.PYTHON_PROCESS_TERMINATION_TIMEOUT || 10000));

          const timeoutError = new Error(`Python execution timed out after ${this.executionTimeout}ms`);
          
          if (retryCount < this.maxRetries) {
            logger.warn('Python execution timed out, retrying...', {
              retryCount: retryCount + 1,
              maxRetries: this.maxRetries
            });
            
            this.execute(data, retryCount + 1)
              .then(resolve)
              .catch(reject);
          } else {
            logger.error('Python execution timed out, max retries exceeded', {
              error: timeoutError.message,
              stdout,
              stderr
            });
            reject(timeoutError);
          }
        } catch (e) {
          logger.error('Error during timeout handling', { error: e instanceof Error ? e.message : String(e) });
        }
      }, this.executionTimeout);
      
      // Collect stdout
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      // Collect stderr
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Handle process close
      pythonProcess.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        const executionTime = Date.now() - startTime;
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            logger.debug('Python execution successful', {
              executionTime,
              resultType: typeof result
            });
            resolve(result);
          } catch (error) {
            const parseError = error instanceof Error ? error.message : String(error);
            logger.error('Error parsing Python output', {
              error: parseError,
              stdout,
              stderr,
              executionTime
            });
            
            if (retryCount < this.maxRetries) {
              logger.warn('Error parsing Python output, retrying...', {
                retryCount: retryCount + 1,
                maxRetries: this.maxRetries
              });
              
              this.execute(data, retryCount + 1)
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error(`Failed to parse Python output: ${parseError}`));
            }
          }
        } else {
          const errorMessage = `Python process exited with code ${code}: ${stderr}`;
          logger.error('Python execution failed', {
            code,
            stderr,
            stdout,
            executionTime
          });
          
          if (retryCount < this.maxRetries) {
            logger.warn('Python execution failed, retrying...', {
              retryCount: retryCount + 1,
              maxRetries: this.maxRetries,
              code
            });
            
            this.execute(data, retryCount + 1)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(errorMessage));
          }
        }
      });
      
      // Handle spawn error
      pythonProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        const spawnError = error instanceof Error ? error.message : String(error);
        logger.error('Python spawn error', { error: spawnError });
        
        if (retryCount < this.maxRetries) {
          logger.warn('Python spawn error, retrying...', {
            retryCount: retryCount + 1,
            maxRetries: this.maxRetries,
            error: spawnError
          });
          
          this.execute(data, retryCount + 1)
            .then(resolve)
            .catch(reject);
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Run a prediction with retry logic
   * @param {Object} data - The prediction data
   * @param {string} data.type - The type of prediction
   * @param {string|null} [scriptOverride=null] - Optional script path override
   * @returns {Promise<any>} The prediction result
   */
  async runPrediction(data, scriptOverride = null) {
    if (scriptOverride) {
      const originalScript = this.scriptPath;
      this.scriptPath = scriptOverride;
      
      try {
        return await this.execute(data);
      } finally {
        this.scriptPath = originalScript;
      }
    } else {
      return await this.execute(data);
    }
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('Shutting down PythonBridge');
    return true;
  }
}

// Create singleton instance
const pythonBridge = new PythonBridge();

module.exports = pythonBridge;
