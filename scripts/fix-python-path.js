// scripts/fix-python-path.js - Script to detect and fix Python path issues

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const readline = require('readline');
const { exec } = require('child_process');

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

// Function to run a command and return a promise
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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Path Fix Tool${colors.reset}`);
console.log(`${colors.cyan}=========================================${colors.reset}\n`);

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

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      console.log(`  Testing Python path: ${pythonPath}...`);
      
      // Get timeout from env or use default
      const timeoutDuration = parseInt(process.env.PYTHON_VERIFICATION_TIMEOUT, 10) || 60000; // Increased to 60 seconds
      
      // Create a more resilient python process
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")'], {
        detached: true, // Detach process to make it less susceptible to interference
        windowsHide: true, // Hide window on Windows
        stdio: ['ignore', 'pipe', 'pipe'] // Redirect standard I/O
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
            process.kill(pythonProcess.pid, 'SIGTERM');
            
            // Force kill after 2 seconds if still running
            setTimeout(() => {
              try {
                if (pythonProcess.exitCode === null) {
                  process.kill(pythonProcess.pid, 'SIGKILL');
                }
              } catch (e) {
                // Process might have already exited
              }
            }, 2000);
            
            console.log(`  Python test timed out for: ${pythonPath} after ${timeoutDuration/1000} seconds`);
            console.log(`  This may be caused by anti-virus software or system resource constraints.`);
            console.log(`  Try temporarily disabling real-time scanning or adding Python to exclusions.`);
          }
        } catch (e) {
          // Process might have already exited
          console.log(`  Error killing timed-out process: ${e.message}`);
        }
        // Still resolve as false if the test timed out
        resolve(false);
      }, timeoutDuration);
      
      // Clear timeout if process ends before timeout
      pythonProcess.on('close', () => {
        clearTimeout(timeoutId);
      });
      
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to update .env file with Python path
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
    if (envContent.includes('PYTHON_PATH=')) {
      const currentPath = envContent.match(/PYTHON_PATH=(.*)(\r?\n|$)/)[1];
      if (currentPath !== pythonPath) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/, `PYTHON_PATH=${pythonPath}$1`);
        updated = true;
      }
    } else {
      envContent += `\nPYTHON_PATH=${pythonPath}`;
      updated = true;
    }
    
    // Update PYTHON_EXECUTABLE
    if (envContent.includes('PYTHON_EXECUTABLE=')) {
      const currentPath = envContent.match(/PYTHON_EXECUTABLE=(.*)(\r?\n|$)/)[1];
      if (currentPath !== pythonPath) {
        envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/, `PYTHON_EXECUTABLE=${pythonPath}$1`);
        updated = true;
      }
    } else {
      envContent += `\nPYTHON_EXECUTABLE=${pythonPath}`;
      updated = true;
    }
    
    // Update PYTHON_VERIFICATION_TIMEOUT
    if (envContent.includes('PYTHON_VERIFICATION_TIMEOUT=')) {
      const currentTimeout = envContent.match(/PYTHON_VERIFICATION_TIMEOUT=(\d+)(\r?\n|$)/)[1];
      if (parseInt(currentTimeout, 10) < 60000) { // Increase timeout if less than 60s
        envContent = envContent.replace(/PYTHON_VERIFICATION_TIMEOUT=\d+(\r?\n|$)/, `PYTHON_VERIFICATION_TIMEOUT=60000$1`);
        updated = true;
      }
    } else {
      envContent += `\nPYTHON_VERIFICATION_TIMEOUT=60000`;
      updated = true;
    }
    
    // Add Python bridge settings if they don't exist
    if (!envContent.includes('PYTHON_BRIDGE_MAX_RETRIES=')) {
      envContent += `\nPYTHON_BRIDGE_MAX_RETRIES=3`;
      updated = true;
    }
    
    if (!envContent.includes('PYTHON_EXECUTION_TIMEOUT=')) {
      envContent += `\nPYTHON_EXECUTION_TIMEOUT=60000`;
      updated = true;
    }
    
    if (!envContent.includes('PYTHON_PROCESS_TERMINATION_TIMEOUT=')) {
      envContent += `\nPYTHON_PROCESS_TERMINATION_TIMEOUT=10000`;
      updated = true;
    }
    
    // Write updated content back to .env file if changes were made
    if (updated) {
      fs.writeFileSync(envPath, envContent);
      console.log(`  ${colors.green}Updated .env file with Python path: ${pythonPath}${colors.reset}`);
    } else {
      console.log(`  ${colors.green}.env file already contains correct Python path.${colors.reset}`);
    }
    
    return true;
  } catch (error) {
    console.log(`  ${colors.red}Error updating .env file: ${error.message}${colors.reset}`);
    return false;
  }
}

// Function to ask for manual Python path input
function askForPythonPath() {
  return new Promise((resolve) => {
    rl.question(`\n${colors.yellow}Please enter the path to your Python executable (or press Enter to use 'python'):\n${colors.reset}`, (input) => {
      const pythonPath = input.trim() || 'python';
      resolve(pythonPath);
    });
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  // Modified script with try/except to be more resilient
  const checkScript = `
try:
    import pkg_resources
    required = {'numpy', 'pandas', 'scikit-learn'}
    installed = {pkg.key for pkg in pkg_resources.working_set}
    missing = required - installed
    if missing:
        print(f"Missing packages: {missing}")
    else:
        print("All required packages are installed")
except Exception as e:
    print(f"Error checking packages: {str(e)}")
    import sys
    # Always print something so we know Python runs
    print(f"Python version: {sys.version}")
  `;
  
  try {
    // Use spawn instead of exec for better control
    const pythonProcess = spawn(pythonPath, ['-c', checkScript]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    const result = await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Process exited with code ${code}: ${errorOutput}`));
        }
      });
      
      pythonProcess.on('error', (err) => {
        reject(new Error(`Process error: ${err.message}`));
      });
      
      // Timeout for package check - 30 seconds
      setTimeout(() => {
        try {
          pythonProcess.kill();
        } catch (e) {
          // Process might have already exited
        }
        reject(new Error('Package check timed out after 30 seconds'));
      }, 30000);
    });
    
    console.log(`  ${colors.green}${result.trim()}${colors.reset}`);
    return true;
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    console.log(`  This is often not critical - will continue with installation.`);
    return false;
  }
}

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  
  // Check if script exists first
  if (!fs.existsSync(scriptPath)) {
    console.log(`  ${colors.yellow}Script not found at: ${scriptPath}${colors.reset}`);
    console.log(`  Looking for script in alternative locations...`);
    
    // Try to find the script in other locations
    const possiblePaths = [
      path.join(process.cwd(), 'predictive_model.py'),
      path.join(process.cwd(), 'model', 'predictive_model.py'),
      path.join(process.cwd(), 'models', 'predictive_model.py'),
      path.join(process.cwd(), 'src', 'scripts', 'predictive_model.py'),
      path.join(process.cwd(), 'src', 'predictive_model.py')
    ];
    
    for (const altPath of possiblePaths) {
      if (fs.existsSync(altPath)) {
        console.log(`  ${colors.green}Found script at alternative location: ${altPath}${colors.reset}`);
        scriptPath = altPath;
        break;
      }
    }
    
    if (!fs.existsSync(scriptPath)) {
      console.log(`  ${colors.red}Could not find predictive_model.py script${colors.reset}`);
      return false;
    }
  }
  
  const testData = JSON.stringify({
    type: 'health_check'
  });
  
  try {
    console.log(`  Testing Python script execution: ${scriptPath}`);
    const pythonProcess = spawn(pythonPath, [scriptPath, testData]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    const result = await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output || 'No output but script executed successfully');
        } else {
          reject(new Error(`Script exited with code ${code}: ${errorOutput}`));
        }
      });
      
      pythonProcess.on('error', (err) => {
        reject(new Error(`Script error: ${err.message}`));
      });
      
      // Timeout for script execution - 60 seconds
      setTimeout(() => {
        try {
          pythonProcess.kill();
        } catch (e) {
          // Process might have already exited
        }
        reject(new Error('Script execution timed out after 60 seconds'));
      }, 60000);
    });
    
    console.log(`  ${colors.green}✓ Python script executed successfully: ${result.trim()}${colors.reset}`);
    return true;
  } catch (error) {
    console.log(`  ${colors.red}✗ Python script execution failed: ${error.message}${colors.reset}`);
    return false;
  }
}

// Main function
async function main() {
  let overallStatus = true;
  try {
    console.log(`${colors.yellow}Note: If you experience timeouts, consider adding Python to your antivirus exclusions${colors.reset}`);
    console.log(`${colors.yellow}or temporarily disabling real-time scanning during this setup.${colors.reset}\n`);
    
    let pythonPath = await detectPythonPath();
    if (!pythonPath) {
      pythonPath = await askForPythonPath();
    }
    
    const updated = await updateEnvFile(pythonPath);
    if (updated) {
      console.log(`\n${colors.green}Python path updated successfully.${colors.reset}`);
    } else {
      console.log(`\n${colors.red}Failed to update Python path.${colors.reset}`);
      overallStatus = false;
    }
    
    const packagesOk = await checkPythonPackages(pythonPath);
    if (!packagesOk) {
      console.log(`\n${colors.yellow}Warning: Could not verify all Python packages.${colors.reset}`);
      overallStatus = false;
    }
    
    const scriptOk = await testPythonScript(pythonPath);
    if (!scriptOk) {
      console.log(`\n${colors.yellow}Warning: Could not verify Python script execution.${colors.reset}`);
      overallStatus = false;
    }
    
    if (overallStatus) {
      console.log(`\n${colors.green}Python setup completed successfully!${colors.reset}`);
    } else {
      console.log(`\n${colors.yellow}Python setup completed with warnings.${colors.reset}`);
      console.log(`${colors.yellow}You may still be able to use the system, but some features might not work as expected.${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}Error:${colors.reset} ${error.message}`);
    if (error.stack) {
      console.error(`\n${colors.dim}${error.stack}${colors.reset}`);
    }
  } finally {
    rl.close();
  }
}

main();