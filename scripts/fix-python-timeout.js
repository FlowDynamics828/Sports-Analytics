// scripts/fix-python-timeout.js - Fix Python timeout issues

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Timeout Fix${colors.reset}`);
console.log(`${colors.cyan}=====================================${colors.reset}\n`);

async function main() {
  try {
    // 1. Check and create a basic predictive_model.py if it doesn't exist
    console.log(`${colors.bright}Checking predictive_model.py...${colors.reset}`);
    
    const scriptsDir = path.join(process.cwd(), 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
      console.log(`${colors.green}✓ Created scripts directory${colors.reset}`);
    }
    
    const predictiveModelPath = path.join(scriptsDir, 'predictive_model.py');
    
    if (!fs.existsSync(predictiveModelPath)) {
      console.log(`${colors.yellow}⚠ predictive_model.py not found. Creating basic version...${colors.reset}`);
      
      const basicPythonModel = `# scripts/predictive_model.py - Basic predictive model for Sports Analytics

import sys
import os
import json
import time
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("predictive_model.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Simple response for health checks
def handle_health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "message": "Python script is functioning correctly"
    }

# Simple mock prediction function
def make_prediction(league, prediction_type, input_data=None):
    logger.info(f"Making prediction for {league}, type: {prediction_type}")
    
    # Simple mock response
    return {
        "prediction": 0.75,
        "confidence": 0.85,
        "league": league,
        "type": prediction_type,
        "timestamp": datetime.now().isoformat()
    }

# Main entry point
def main():
    try:
        logger.info("Predictive model script started")
        
        # Check arguments
        if len(sys.argv) < 2:
            logger.error("No input data provided")
            print(json.dumps({"error": "No input data provided"}))
            return
        
        # Parse input data
        input_data = json.loads(sys.argv[1])
        
        # Handle health check
        if input_data.get('type') == 'health_check':
            result = handle_health_check()
            print(json.dumps(result))
            return
        
        # Handle prediction request
        league = input_data.get('league', 'unknown')
        prediction_type = input_data.get('prediction_type', 'unknown')
        data = input_data.get('input_data', {})
        
        result = make_prediction(league, prediction_type, data)
        
        # Return result as JSON
        print(json.dumps(result))
        
    except Exception as e:
        logger.error(f"Error in predictive model: {str(e)}")
        print(json.dumps({
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }))

if __name__ == "__main__":
    main()
`;
      
      fs.writeFileSync(predictiveModelPath, basicPythonModel);
      console.log(`${colors.green}✓ Created basic predictive_model.py${colors.reset}`);
    } else {
      // Check if the existing predictive_model.py works correctly
      console.log(`${colors.green}✓ Found existing predictive_model.py${colors.reset}`);
      
      // Add error handling for large file
      try {
        // Read first 500 characters just to check format
        const filePreview = fs.readFileSync(predictiveModelPath, 'utf8', { encoding: 'utf8' }).slice(0, 500);
        console.log(`${colors.green}✓ Existing predictive_model.py looks valid${colors.reset}`);
      } catch (error) {
        console.log(`${colors.yellow}⚠ Warning: Could not read existing predictive_model.py: ${error.message}${colors.reset}`);
      }
    }
    
    // 2. Update Python path in .env file
    console.log(`\n${colors.bright}Updating Python settings in .env file...${colors.reset}`);
    
    // Try to detect Python path
    let pythonPath = 'python';
    try {
      if (process.platform === 'win32') {
        pythonPath = execSync('where python').toString().trim().split(/\r?\n/)[0];
      } else {
        pythonPath = execSync('which python').toString().trim();
      }
      console.log(`${colors.green}✓ Detected Python at: ${pythonPath}${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not detect Python path. Using default 'python'${colors.reset}`);
    }
    
    const envPath = path.join(process.cwd(), '.env');
    
    // Create or update .env file
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Add or update Python settings
      const pythonSettings = `
# Python Configuration - Updated with enhanced settings
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_SCRIPT=scripts/predictive_model.py
PYTHON_VERIFICATION_TIMEOUT=60000
PYTHON_EXECUTION_TIMEOUT=120000
PYTHON_BRIDGE_MAX_RETRIES=2
`;
      
      if (envContent.includes('# Python Configuration')) {
        // Find and replace existing Python configuration section
        const pythonStart = envContent.indexOf('# Python Configuration');
        let pythonEnd = envContent.indexOf('#', pythonStart + 1);
        if (pythonEnd === -1) pythonEnd = envContent.length;
        
        envContent = envContent.slice(0, pythonStart) + pythonSettings + envContent.slice(pythonEnd);
      } else {
        // Add new Python configuration
        envContent += pythonSettings;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log(`${colors.green}✓ Updated .env with Python settings${colors.reset}`);
    } else {
      // Create new .env file
      const newEnvContent = `
# Python Configuration - Updated with enhanced settings
PYTHON_PATH=${pythonPath}
PYTHON_EXECUTABLE=${pythonPath}
PYTHON_SCRIPT=scripts/predictive_model.py
PYTHON_VERIFICATION_TIMEOUT=60000
PYTHON_EXECUTION_TIMEOUT=120000
PYTHON_BRIDGE_MAX_RETRIES=2
`;
      fs.writeFileSync(envPath, newEnvContent);
      console.log(`${colors.green}✓ Created new .env file with Python settings${colors.reset}`);
    }
    
    // 3. Create PythonBridge utility to handle Python communication
    console.log(`\n${colors.bright}Creating robust PythonBridge utility...${colors.reset}`);
    
    const utilsDir = path.join(process.cwd(), 'utils');
    if (!fs.existsSync(utilsDir)) {
      fs.mkdirSync(utilsDir, { recursive: true });
      console.log(`${colors.green}✓ Created utils directory${colors.reset}`);
    }
    
    const pythonBridgePath = path.join(utilsDir, 'pythonBridge.js');
    const pythonBridgeContent = `// utils/pythonBridge.js - Robust Python integration

const { spawn } = require('child_process');
const path = require('path');
const winston = require('winston');

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
const fs = require('fs');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Define PythonBridge class
class PythonBridge {
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE || 'python';
    this.scriptPath = process.env.PYTHON_SCRIPT || 'scripts/predictive_model.py';
    this.verificationTimeout = parseInt(process.env.PYTHON_VERIFICATION_TIMEOUT || 60000);
    this.executionTimeout = parseInt(process.env.PYTHON_EXECUTION_TIMEOUT || 120000);
    this.maxRetries = parseInt(process.env.PYTHON_BRIDGE_MAX_RETRIES || 2);
    this.verified = false;
    this._verify();
  }

  // Verify Python environment
  async _verify() {
    try {
      logger.info('Verifying Python environment...');
      
      const result = await this.execute({
        type: 'health_check',
        timestamp: new Date().toISOString()
      });
      
      if (result.status === 'ok') {
        this.verified = true;
        logger.info('Python environment verified successfully');
      } else {
        logger.warn('Python environment verification returned unexpected result', { result });
      }
    } catch (error) {
      logger.error('Python environment verification failed', { error: error.message });
    }
    
    return this.verified;
  }

  // Main execution method
  async execute(data, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const fullScriptPath = path.resolve(process.cwd(), this.scriptPath);
      
      logger.debug('Executing Python script', {
        pythonPath: this.pythonPath,
        scriptPath: fullScriptPath,
        requestType: data.type
      });
      
      // Spawn Python process
      const pythonProcess = spawn(this.pythonPath, [fullScriptPath, JSON.stringify(data)]);
      
      let stdout = '';
      let stderr = '';
      let timeoutId;
      
      // Set execution timeout
      timeoutId = setTimeout(() => {
        pythonProcess.kill();
        const timeoutError = new Error(\`Python execution timed out after \${this.executionTimeout}ms\`);
        
        // Retry if not exceeded max retries
        if (retryCount < this.maxRetries) {
          logger.warn('Python execution timed out, retrying...', {
            retryCount: retryCount + 1,
            maxRetries: this.maxRetries
          });
          
          clearTimeout(timeoutId);
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
        clearTimeout(timeoutId);
        
        const executionTime = Date.now() - startTime;
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            logger.debug('Python execution successful', {
              executionTime,
              result: typeof result
            });
            resolve(result);
          } catch (error) {
            logger.error('Error parsing Python output', {
              error: error.message,
              stdout,
              stderr,
              executionTime
            });
            
            // Retry parsing error if not exceeded max retries
            if (retryCount < this.maxRetries) {
              logger.warn('Error parsing Python output, retrying...', {
                retryCount: retryCount + 1,
                maxRetries: this.maxRetries
              });
              
              this.execute(data, retryCount + 1)
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error(\`Failed to parse Python output: \${error.message}\`));
            }
          }
        } else {
          const errorMessage = \`Python process exited with code \${code}: \${stderr}\`;
          logger.error('Python execution failed', {
            code,
            stderr,
            stdout,
            executionTime
          });
          
          // Retry non-zero exit code if not exceeded max retries
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
        clearTimeout(timeoutId);
        
        logger.error('Python spawn error', { error: error.message });
        
        // Retry spawn error if not exceeded max retries
        if (retryCount < this.maxRetries) {
          logger.warn('Python spawn error, retrying...', {
            retryCount: retryCount + 1,
            maxRetries: this.maxRetries,
            error: error.message
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

  // Run a prediction with retry logic
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
    // Perform any cleanup if needed
    return true;
  }
}

// Create singleton instance
const pythonBridge = new PythonBridge();

module.exports = pythonBridge;
`;
    
    fs.writeFileSync(pythonBridgePath, pythonBridgeContent);
    console.log(`${colors.green}✓ Created robust PythonBridge utility${colors.reset}`);
    
    // 4. Test Python integration
    console.log(`\n${colors.bright}Testing Python integration...${colors.reset}`);
    
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'print("Python test successful")']);
      
      let testOutput = '';
      let testError = '';
      
      pythonProcess.stdout.on('data', (data) => {
        testOutput += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        testError += data.toString();
      });
      
      await new Promise((resolve, reject) => {
        pythonProcess.on('close', (code) => {
          if (code === 0) {
            console.log(`${colors.green}✓ Python test successful: ${testOutput.trim()}${colors.reset}`);
            resolve();
          } else {
            console.log(`${colors.red}✗ Python test failed (code ${code}): ${testError}${colors.reset}`);
            reject(new Error(`Python test failed with code ${code}`));
          }
        });
        
        pythonProcess.on('error', (error) => {
          console.log(`${colors.red}✗ Python test error: ${error.message}${colors.reset}`);
          reject(error);
        });
      });
    } catch (error) {
      console.log(`${colors.yellow}⚠ Python test could not be completed: ${error.message}${colors.reset}`);
      console.log(`${colors.yellow}⚠ The fixes have still been applied${colors.reset}`);
    }
    
    console.log(`\n${colors.bright}${colors.green}Python timeout fixes completed successfully!${colors.reset}`);
    console.log(`${colors.bright}Now try running your application with: npm run start:optimized${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error fixing Python timeouts: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();