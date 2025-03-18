// scripts/verify-python-env.js - Script to detect and fix Python path issues

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const readline = require('readline');
const { exec } = require('child_process');
const crossSpawn = require('cross-spawn');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Get workspace root
const workspaceRoot = process.cwd();

// Resolve Python paths
const pythonPath = path.resolve(workspaceRoot, 'venv', 'Scripts', 'python.exe');
const scriptPath = path.resolve(workspaceRoot, 'scripts', 'predictive_model.py');

console.log('Verifying Python environment...');
console.log('Python Path:', pythonPath);
console.log('Script Path:', scriptPath);

/**
 * Run a command and return its output
 * @param {string} command - The command to run
 * @param {string[]} [args=[]] - Command arguments
 * @returns {Promise<string>} Command output
 */
function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const cmd = Array.isArray(args) && args.length > 0 
      ? `${command} ${args.join(' ')}` 
      : command;
      
    exec(cmd, {
      timeout: parseInt(process.env.PYTHON_EXECUTION_TIMEOUT || '60000'),
      maxBuffer: 5 * 1024 * 1024 // Increase max buffer to 5MB
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout ? stdout : stderr);
      }
    });
  });
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to detect Python path
async function detectPythonPath() {
  console.log(`${colors.bright}Detecting Python Installation:${colors.reset}`);
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath) {
    console.log(`  Found Python path in environment variables: ${envPath}`);
    if (await testPythonPath(envPath)) {
      return envPath;
    }
    console.log(`  ${colors.yellow}Python path from environment variables is not valid.${colors.reset}`);
  }
  
  // Check common paths based on platform
  if (process.platform === 'win32') {
    const commonPaths = [
      'python',
      'python3',
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
      'C:\\Windows\\py.exe',
      // Add more common locations
      'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
      'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
      'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
      'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (pythonPath === 'python' || pythonPath === 'python3' || fs.existsSync(pythonPath)) {
          console.log(`  Found Python at: ${pythonPath}`);
          if (await testPythonPath(pythonPath)) {
            return pythonPath;
          }
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
    
    // Try using 'where' command on Windows
    try {
      const output = execSync('where python', { timeout: 10000 }).toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }

    // Try using 'py' command on Windows
    try {
      const output = execSync('where py', { timeout: 10000 }).toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python launcher at: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    const commonUnixPaths = ['python3', 'python'];
    
    for (const pythonPath of commonUnixPaths) {
      try {
        const result = await testPythonPath(pythonPath);
        if (result) {
          console.log(`  Found working Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    try {
      const output = execSync('which python3 || which python', { timeout: 10000 }).toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path automatically.${colors.reset}`);
  return null;
}

/**
 * Test if a Python path is valid
 * @param {string} pythonPath - Path to Python executable
 * @returns {Promise<boolean>} True if path is valid
 */
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      console.log(`  Testing Python path: ${pythonPath}...`);
      
      // Get timeout from env or use default
      const timeoutDuration = parseInt(process.env.PYTHON_VERIFICATION_TIMEOUT || '60000', 10);
      
      // Quote the Python path if it contains spaces
      const quotedPythonPath = pythonPath.includes(' ') ? `"${pythonPath}"` : pythonPath;
      
      // Create a more resilient python process
      const pythonProcess = spawn(quotedPythonPath, ['-c', 'import sys; print(f"Python {sys.version}")'], {
        detached: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true  // Use shell to handle paths with spaces
      });
      
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`  Python version: ${colors.green}${output.trim()}${colors.reset}`);
          resolve(true);
        } else {
          console.log(`  Python test failed: ${colors.red}${errorOutput}${colors.reset}`);
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (err) => {
        console.log(`  Python process error for: ${pythonPath}: ${err.message}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      const timeoutId = setTimeout(() => {
        try {
          // Check if process has exited already
          if (pythonProcess.exitCode === null) {
            // Try to kill the process gracefully first, then forcefully
            if (pythonProcess.pid) {
              process.kill(pythonProcess.pid, 'SIGTERM');
              
              // Force kill after 2 seconds if still running
              setTimeout(() => {
                try {
                  if (pythonProcess.exitCode === null && pythonProcess.pid) {
                    process.kill(pythonProcess.pid, 'SIGKILL');
                  }
                } catch (e) {
                  // Process might have already exited
                }
              }, 2000);
            }
            
            console.log(`  Python test timed out for: ${pythonPath} after ${timeoutDuration/1000} seconds`);
            console.log(`  This may be caused by anti-virus software or system resource constraints.`);
            console.log(`  Try temporarily disabling real-time scanning or adding Python to exclusions.`);
          }
        } catch (e) {
          // Process might have already exited
          const error = e instanceof Error ? e.message : String(e);
          console.log(`  Error killing timed-out process: ${error}`);
        }
        // Still resolve as false if the test timed out
        resolve(false);
      }, timeoutDuration);
      
      // Clear timeout if process ends before timeout
      pythonProcess.on('close', () => {
        clearTimeout(timeoutId);
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  Error testing Python path: ${errorMessage}`);
      resolve(false);
    }
  });
}

/**
 * Update .env file with Python path
 * @param {string} pythonPath - Path to Python executable
 * @returns {Promise<boolean>} True if file was updated
 */
async function updateEnvFile(pythonPath) {
  console.log(`\n${colors.bright}Updating .env File:${colors.reset}`);
  
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    // Check if .env file exists
    if (!fs.existsSync(envPath)) {
      console.log(`  ${colors.yellow}.env file not found. Creating new file.${colors.reset}`);
      fs.writeFileSync(envPath, `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`);
      console.log(`  ${colors.green}Created .env file with Python path.${colors.reset}`);
      return true;
    }
    
    // Read existing .env file
    let envContent = fs.readFileSync(envPath, 'utf8');
    let updated = false;
    
    // Update PYTHON_PATH
    const match = envContent.match(/PYTHON_PATH=(.*)(\r?\n|$)/);
    if (match) {
      const currentPath = match[1];
      if (currentPath !== pythonPath) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/, `PYTHON_PATH=${pythonPath}$1`);
        updated = true;
      }
    } else {
      envContent += `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`;
      updated = true;
    }
    
    if (updated) {
      fs.writeFileSync(envPath, envContent);
      console.log(`  ${colors.green}Updated .env file with Python path.${colors.reset}`);
    }
    
    return updated;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  Error updating .env file: ${errorMessage}`);
    return false;
  }
}

/**
 * Verifies Python installation by checking version
 * @returns {Promise<boolean>} True if verification succeeds
 */
async function verifyPython() {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(sys.version)']);

    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`Python version: ${output.trim()}`);
        resolve(true);
      } else {
        reject(new Error(`Python verification failed with code ${code}`));
      }
    });
  });
}

/**
 * Verifies required Python packages are installed
 * @returns {Promise<boolean>} True if verification succeeds
 */
async function verifyPackages() {
  return new Promise((resolve, reject) => {
    const checkScript = `
import pkg_resources
required = {'numpy', 'pandas', 'scikit-learn', 'xgboost', 'lightgbm', 'requests', 'pymongo', 'python-dotenv', 'redis', 'prometheus-client', 'psutil', 'cachetools', 'hyperopt'}
installed = {pkg.key for pkg in pkg_resources.working_set}
missing = required - installed
if missing:
    print(f"Missing packages: {missing}")
else:
    print("All required packages are installed")
    `;

    const pythonProcess = spawn(pythonPath, ['-c', checkScript]);

    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Package check stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(output.trim());
        resolve(true);
      } else {
        reject(new Error(`Package verification failed with code ${code}`));
      }
    });
  });
}

/**
 * Verifies Python script execution
 * @returns {Promise<boolean>} True if verification succeeds
 */
async function verifyScript() {
  return new Promise((resolve, reject) => {
    // Quote paths to handle spaces
    const quotedPythonPath = `"${pythonPath}"`;
    const quotedScriptPath = `"${scriptPath}"`;
    
    const pythonProcess = spawn(quotedPythonPath, [quotedScriptPath, JSON.stringify({ type: 'health_check' })], {
      shell: true  // Use shell to handle paths with spaces
    });

    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Script execution stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          console.log('Script execution successful:', result);
          resolve(true);
        } catch (error) {
          reject(new Error(`Failed to parse script output: ${error instanceof Error ? error.message : String(error)}`));
        }
      } else {
        reject(new Error(`Script execution failed with code ${code}`));
      }
    });
  });
}

/**
 * Main verification function
 * @returns {Promise<void>}
 */
async function main() {
  try {
    console.log('\nStep 1: Verifying Python installation...');
    await verifyPython();

    console.log('\nStep 2: Verifying Python packages...');
    await verifyPackages();

    console.log('\nStep 3: Verifying script execution...');
    await verifyScript();

    console.log('\nAll verifications passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\nVerification failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the verification
main();