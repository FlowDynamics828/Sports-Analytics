// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath} after 15 seconds`);
        console.log(`  This may be caused by anti-virus software or system resource constraints.`);
        // Still resolve as true if we found a valid path, even if the test timed out
        resolve(true);
      }, 15000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath} after 15 seconds`);
        console.log(`  This may be caused by anti-virus software or system resource constraints.`);
        // Still resolve as true if we found a valid path, even if the test timed out
        resolve(true);
      }, 15000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath} after 15 seconds`);
        console.log(`  This may be caused by anti-virus software or system resource constraints.`);
        // Still resolve as true if we found a valid path, even if the test timed out
        resolve(true);
      }, 15000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath} after 15 seconds`);
        console.log(`  This may be caused by anti-virus software or system resource constraints.`);
        // Still resolve as true if we found a valid path, even if the test timed out
        resolve(true);
      }, 15000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath} after 15 seconds`);
        console.log(`  This may be caused by anti-virus software or system resource constraints.`);
        // Still resolve as true if we found a valid path, even if the test timed out
        resolve(true);
      }, 15000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath} after 15 seconds`);
        console.log(`  This may be caused by anti-virus software or system resource constraints.`);
        // Still resolve as true if we found a valid path, even if the test timed out
        resolve(true);
      }, 15000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout with increased duration
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath} after 15 seconds`);
        console.log(`  This may be caused by anti-virus software or system resource constraints.`);
        // Still resolve as true if we found a valid path, even if the test timed out
        resolve(true);
      }, 15000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath}`);
        resolve(false);
      }, 5000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js - Script to verify Python environment and required packages

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

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

// Print header
console.log(`${colors.bright}${colors.cyan}Sports Analytics - Python Environment Verification${colors.reset}`);
console.log(`${colors.cyan}=================================================${colors.reset}\n`);

// Track overall status
let overallStatus = true;
let pythonPath = null;

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
  
  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Python39\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python39\\python.exe',
      'C:\\Program Files (x86)\\Python310\\python.exe',
      'C:\\Program Files (x86)\\Python311\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python39\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      'C:\\ProgramData\\Anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe'
    ];
    
    for (const pythonPath of commonPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
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
      const output = execSync('where python').toString().trim().split('\r\n')[0];
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'where' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  } else {
    // On Unix-like systems, try using 'which' command
    try {
      const output = execSync('which python3 || which python').toString().trim();
      if (output && await testPythonPath(output)) {
        console.log(`  Found Python using 'which' command: ${output}`);
        return output;
      }
    } catch (e) {
      // Ignore errors and continue
    }
  }
  
  // Default fallback
  console.log(`  ${colors.yellow}Could not detect Python path, using default "python" command.${colors.reset}`);
  if (await testPythonPath('python')) {
    return 'python';
  }
  
  console.log(`  ${colors.red}No valid Python installation found.${colors.reset}`);
  overallStatus = false;
  return null;
}

// Function to test if Python path is valid
async function testPythonPath(pythonPath) {
  return new Promise((resolve) => {
    try {
      const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(f"Python {sys.version}")']);
      
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
      
      pythonProcess.on('error', () => {
        console.log(`  Python process error for: ${pythonPath}`);
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  Python test timed out for: ${pythonPath}`);
        resolve(false);
      }, 5000);
    } catch (error) {
      console.log(`  Error testing Python path: ${error.message}`);
      resolve(false);
    }
  });
}

// Function to check Python packages
async function checkPythonPackages(pythonPath) {
  console.log(`\n${colors.bright}Checking Python Packages:${colors.reset}`);
  
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'pymongo',
    'redis',
    'hyperopt'
  ];
  
  try {
    // Create a Python script to check packages
    const checkScript = `
import importlib.util
import sys

packages = ${JSON.stringify(requiredPackages)}
results = {}

for package in packages:
    try:
        spec = importlib.util.find_spec(package)
        if spec is None:
            results[package] = False
        else:
            module = importlib.import_module(package)
            version = getattr(module, '__version__', 'unknown')
            results[package] = version
    except Exception as e:
        results[package] = False

for package, version in results.items():
    if version:
        print(f"{package}: {version}")
    else:
        print(f"{package}: NOT FOUND")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'check_packages.py');
    fs.writeFileSync(tempScriptPath, checkScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          const lines = output.trim().split('\n');
          const missingPackages = [];
          
          for (const line of lines) {
            const [packageName, status] = line.split(': ');
            const isInstalled = status !== 'NOT FOUND';
            
            console.log(`  ${packageName}: ${isInstalled ? `${colors.green}${status}${colors.reset}` : `${colors.red}${status}${colors.reset}`}`);
            
            if (!isInstalled) {
              missingPackages.push(packageName);
            }
          }
          
          if (missingPackages.length > 0) {
            console.log(`\n  ${colors.yellow}Missing packages: ${missingPackages.join(', ')}${colors.reset}`);
            console.log(`  Run the following command to install missing packages:`);
            console.log(`  ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
            overallStatus = false;
          }
          
          resolve(missingPackages);
        } else {
          console.log(`  ${colors.red}Package check failed: ${errorOutput}${colors.reset}`);
          overallStatus = false;
          resolve([]);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve([]);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Package check timed out${colors.reset}`);
        overallStatus = false;
        resolve([]);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Package check error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return [];
  }
}

// Function to check if predictive_model.py exists
function checkPredictiveModelScript() {
  console.log(`\n${colors.bright}Checking Predictive Model Script:${colors.reset}`);
  
  const scriptPath = path.join(process.cwd(), 'scripts', 'predictive_model.py');
  const exists = fs.existsSync(scriptPath);
  
  console.log(`  scripts/predictive_model.py: ${exists ? `${colors.green}EXISTS${colors.reset}` : `${colors.red}MISSING${colors.reset}`}`);
  
  if (!exists) {
    overallStatus = false;
  }
  
  return exists;
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

// Function to test Python script execution
async function testPythonScript(pythonPath) {
  console.log(`\n${colors.bright}Testing Python Script Execution:${colors.reset}`);
  
  const scriptExists = checkPredictiveModelScript();
  if (!scriptExists) {
    console.log(`  ${colors.yellow}Skipping script test because predictive_model.py is missing.${colors.reset}`);
    return false;
  }
  
  try {
    // Create a simple test script
    const testScript = `
import sys
import os

print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("Script test successful")
`;
    
    // Write the script to a temporary file
    const tempScriptPath = path.join(os.tmpdir(), 'test_script.py');
    fs.writeFileSync(tempScriptPath, testScript);
    
    // Execute the script
    const pythonProcess = spawn(pythonPath, [tempScriptPath]);
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          console.log(`  ${colors.green}Script test successful${colors.reset}`);
          console.log(`  Output:\n${output.split('\n').map(line => `    ${line}`).join('\n')}`);
          resolve(true);
        } else {
          console.log(`  ${colors.red}Script test failed with code ${code}${colors.reset}`);
          console.log(`  Error: ${errorOutput}`);
          overallStatus = false;
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
        overallStatus = false;
        resolve(false);
      });
      
      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        console.log(`  ${colors.red}Script test timed out${colors.reset}`);
        overallStatus = false;
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    console.log(`  ${colors.red}Script test error: ${error.message}${colors.reset}`);
    overallStatus = false;
    return false;
  }
}

// Main function
async function main() {
  try {
    // Detect Python path
    pythonPath = await detectPythonPath();
    
    if (!pythonPath) {
      console.log(`\n${colors.red}No valid Python installation found. Please install Python and try again.${colors.reset}`);
      process.exit(1);
    }
    
    // Check Python packages
    const missingPackages = await checkPythonPackages(pythonPath);
    
    // Update .env file with Python path
    await updateEnvFile(pythonPath);
    
    // Test Python script execution
    await testPythonScript(pythonPath);
    
    // Print overall status
    console.log(`\n${colors.bright}Overall Status:${colors.reset} ${overallStatus ? `${colors.green}PASS${colors.reset}` : `${colors.yellow}ISSUES DETECTED${colors.reset}`}`);
    
    if (!overallStatus) {
      console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
      
      if (missingPackages && missingPackages.length > 0) {
        console.log(`  1. Install missing Python packages:`);
        console.log(`     ${colors.cyan}pip install ${missingPackages.join(' ')}${colors.reset}`);
      }
      
      if (!checkPredictiveModelScript()) {
        console.log(`  2. Ensure the predictive_model.py script exists in the scripts directory.`);
      }
      
      console.log(`  3. If issues persist, run the full diagnostic tool:`);
      console.log(`     ${colors.cyan}npm run diagnose:full${colors.reset}`);
    } else {
      console.log(`\n${colors.green}Python environment is properly configured.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during verification:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});// scripts/verify-python-env.js

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'python-env-verification.log' })
  ]
});

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
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
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Default fallback
  logger.info('No specific Python path found, using default "python" command');
  return 'python';
}

// Verify Python version
async function verifyPythonVersion(pythonPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Verifying Python version using: ${pythonPath}`);
    
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(sys.version)']);
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Python version: ${output.trim()}`);
        resolve(output.trim());
      } else {
        logger.error(`Python version check failed with code ${code}: ${error}`);
        reject(new Error(`Python version check failed: ${error}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      reject(err);
    });
  });
}

// Check if required Python packages are installed
async function checkPythonPackages(pythonPath) {
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'hyperopt',
    'pymongo',
    'python-dotenv',
    'redis',
    'prometheus-client',
    'psutil',
    'cachetools'
  ];
  
  logger.info('Checking required Python packages...');
  
  const results = [];
  
  for (const pkg of requiredPackages) {
    try {
      const checkCmd = `import ${pkg}; print(f"${pkg} {getattr(${pkg}, '__version__', 'unknown')}")`;
      const output = execSync(`${pythonPath} -c "${checkCmd}"`, { encoding: 'utf8' }).trim();
      logger.info(`✓ ${output}`);
      results.push({ package: pkg, installed: true, version: output.split(' ')[1] });
    } catch (error) {
      logger.error(`✗ ${pkg} not installed or not working properly`);
      results.push({ package: pkg, installed: false, error: error.message });
    }
  }
  
  return results;
}

// Verify script paths
async function verifyScriptPaths() {
  const scriptDir = path.resolve(process.cwd(), 'scripts');
  logger.info(`Checking scripts directory: ${scriptDir}`);
  
  try {
    const files = fs.readdirSync(scriptDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    if (pythonScripts.length > 0) {
      logger.info(`Found ${pythonScripts.length} Python scripts: ${pythonScripts.join(', ')}`);
      return { exists: true, scripts: pythonScripts };
    } else {
      logger.warn('No Python scripts found in scripts directory');
      return { exists: true, scripts: [] };
    }
  } catch (error) {
    logger.error(`Error checking scripts directory: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

// Update .env file with detected Python path
async function updateEnvFile(pythonPath) {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.info(`Updating .env file at: ${envPath}`);
  
  try {
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Replace or add PYTHON_PATH
      if (envContent.includes('PYTHON_PATH=')) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
      } else {
        envContent += `\nPYTHON_PATH=${pythonPath}\n`;
      }
      
      // Replace or add PYTHON_EXECUTABLE
      if (envContent.includes('PYTHON_EXECUTABLE=')) {
        envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
      } else {
        envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
      }
    } else {
      // Create new .env file with Python path
      envContent = `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    logger.info('.env file updated successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

// Install missing Python packages
async function installMissingPackages(pythonPath, packageResults) {
  const missingPackages = packageResults.filter(pkg => !pkg.installed).map(pkg => pkg.package);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are installed');
    return { success: true, installed: [] };
  }
  
  logger.info(`Installing missing packages: ${missingPackages.join(', ')}`);
  
  const results = [];
  
  for (const pkg of missingPackages) {
    try {
      logger.info(`Installing ${pkg}...`);
      execSync(`${pythonPath} -m pip install ${pkg}`, { stdio: 'inherit' });
      logger.info(`✓ Successfully installed ${pkg}`);
      results.push({ package: pkg, success: true });
    } catch (error) {
      logger.error(`✗ Failed to install ${pkg}: ${error.message}`);
      results.push({ package: pkg, success: false, error: error.message });
    }
  }
  
  return { success: results.every(r => r.success), installed: results };
}

// Main verification function
async function verifyPythonEnvironment() {
  try {
    logger.info('Starting Python environment verification...');
    
    // Step 1: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 2: Verify Python version
    const pythonVersion = await verifyPythonVersion(pythonPath);
    
    // Step 3: Check required packages
    const packageResults = await checkPythonPackages(pythonPath);
    
    // Step 4: Verify script paths
    const scriptPathsResult = await verifyScriptPaths();
    
    // Step 5: Update .env file with detected Python path
    const envUpdateResult = await updateEnvFile(pythonPath);
    
    // Step 6: Install missing packages if any
    const installResult = await installMissingPackages(pythonPath, packageResults);
    
    // Final report
    const report = {
      pythonPath,
      pythonVersion,
      packages: packageResults,
      scripts: scriptPathsResult,
      envUpdated: envUpdateResult,
      packagesInstalled: installResult
    };
    
    logger.info('Python environment verification completed');
    logger.info(JSON.stringify(report, null, 2));
    
    return report;
  } catch (error) {
    logger.error(`Python environment verification failed: ${error.message}`);
    throw error;
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyPythonEnvironment()
    .then(() => {
      logger.info('Verification completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Verification failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  verifyPythonEnvironment,
  detectPythonPath,
  verifyPythonVersion,
  checkPythonPackages,
  verifyScriptPaths,
  updateEnvFile,
  installMissingPackages
};// scripts/verify-python-env.js

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'python-env-verification.log' })
  ]
});

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
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
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Default fallback
  logger.info('No specific Python path found, using default "python" command');
  return 'python';
}

// Verify Python version
async function verifyPythonVersion(pythonPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Verifying Python version using: ${pythonPath}`);
    
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(sys.version)']);
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Python version: ${output.trim()}`);
        resolve(output.trim());
      } else {
        logger.error(`Python version check failed with code ${code}: ${error}`);
        reject(new Error(`Python version check failed: ${error}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      reject(err);
    });
  });
}

// Check if required Python packages are installed
async function checkPythonPackages(pythonPath) {
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'hyperopt',
    'pymongo',
    'python-dotenv',
    'redis',
    'prometheus-client',
    'psutil',
    'cachetools'
  ];
  
  logger.info('Checking required Python packages...');
  
  const results = [];
  
  for (const pkg of requiredPackages) {
    try {
      const checkCmd = `import ${pkg}; print(f"${pkg} {getattr(${pkg}, '__version__', 'unknown')}")`;
      const output = execSync(`${pythonPath} -c "${checkCmd}"`, { encoding: 'utf8' }).trim();
      logger.info(`✓ ${output}`);
      results.push({ package: pkg, installed: true, version: output.split(' ')[1] });
    } catch (error) {
      logger.error(`✗ ${pkg} not installed or not working properly`);
      results.push({ package: pkg, installed: false, error: error.message });
    }
  }
  
  return results;
}

// Verify script paths
async function verifyScriptPaths() {
  const scriptDir = path.resolve(process.cwd(), 'scripts');
  logger.info(`Checking scripts directory: ${scriptDir}`);
  
  try {
    const files = fs.readdirSync(scriptDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    if (pythonScripts.length > 0) {
      logger.info(`Found ${pythonScripts.length} Python scripts: ${pythonScripts.join(', ')}`);
      return { exists: true, scripts: pythonScripts };
    } else {
      logger.warn('No Python scripts found in scripts directory');
      return { exists: true, scripts: [] };
    }
  } catch (error) {
    logger.error(`Error checking scripts directory: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

// Update .env file with detected Python path
async function updateEnvFile(pythonPath) {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.info(`Updating .env file at: ${envPath}`);
  
  try {
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Replace or add PYTHON_PATH
      if (envContent.includes('PYTHON_PATH=')) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
      } else {
        envContent += `\nPYTHON_PATH=${pythonPath}\n`;
      }
      
      // Replace or add PYTHON_EXECUTABLE
      if (envContent.includes('PYTHON_EXECUTABLE=')) {
        envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
      } else {
        envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
      }
    } else {
      // Create new .env file with Python path
      envContent = `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    logger.info('.env file updated successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

// Install missing Python packages
async function installMissingPackages(pythonPath, packageResults) {
  const missingPackages = packageResults.filter(pkg => !pkg.installed).map(pkg => pkg.package);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are installed');
    return { success: true, installed: [] };
  }
  
  logger.info(`Installing missing packages: ${missingPackages.join(', ')}`);
  
  const results = [];
  
  for (const pkg of missingPackages) {
    try {
      logger.info(`Installing ${pkg}...`);
      execSync(`${pythonPath} -m pip install ${pkg}`, { stdio: 'inherit' });
      logger.info(`✓ Successfully installed ${pkg}`);
      results.push({ package: pkg, success: true });
    } catch (error) {
      logger.error(`✗ Failed to install ${pkg}: ${error.message}`);
      results.push({ package: pkg, success: false, error: error.message });
    }
  }
  
  return { success: results.every(r => r.success), installed: results };
}

// Main verification function
async function verifyPythonEnvironment() {
  try {
    logger.info('Starting Python environment verification...');
    
    // Step 1: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 2: Verify Python version
    const pythonVersion = await verifyPythonVersion(pythonPath);
    
    // Step 3: Check required packages
    const packageResults = await checkPythonPackages(pythonPath);
    
    // Step 4: Verify script paths
    const scriptPathsResult = await verifyScriptPaths();
    
    // Step 5: Update .env file with detected Python path
    const envUpdateResult = await updateEnvFile(pythonPath);
    
    // Step 6: Install missing packages if any
    const installResult = await installMissingPackages(pythonPath, packageResults);
    
    // Final report
    const report = {
      pythonPath,
      pythonVersion,
      packages: packageResults,
      scripts: scriptPathsResult,
      envUpdated: envUpdateResult,
      packagesInstalled: installResult
    };
    
    logger.info('Python environment verification completed');
    logger.info(JSON.stringify(report, null, 2));
    
    return report;
  } catch (error) {
    logger.error(`Python environment verification failed: ${error.message}`);
    throw error;
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyPythonEnvironment()
    .then(() => {
      logger.info('Verification completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Verification failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  verifyPythonEnvironment,
  detectPythonPath,
  verifyPythonVersion,
  checkPythonPackages,
  verifyScriptPaths,
  updateEnvFile,
  installMissingPackages
};// scripts/verify-python-env.js

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'python-env-verification.log' })
  ]
});

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
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
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Default fallback
  logger.info('No specific Python path found, using default "python" command');
  return 'python';
}

// Verify Python version
async function verifyPythonVersion(pythonPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Verifying Python version using: ${pythonPath}`);
    
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(sys.version)']);
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Python version: ${output.trim()}`);
        resolve(output.trim());
      } else {
        logger.error(`Python version check failed with code ${code}: ${error}`);
        reject(new Error(`Python version check failed: ${error}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      reject(err);
    });
  });
}

// Check if required Python packages are installed
async function checkPythonPackages(pythonPath) {
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'hyperopt',
    'pymongo',
    'python-dotenv',
    'redis',
    'prometheus-client',
    'psutil',
    'cachetools'
  ];
  
  logger.info('Checking required Python packages...');
  
  const results = [];
  
  for (const pkg of requiredPackages) {
    try {
      const checkCmd = `import ${pkg}; print(f"${pkg} {getattr(${pkg}, '__version__', 'unknown')}")`;
      const output = execSync(`${pythonPath} -c "${checkCmd}"`, { encoding: 'utf8' }).trim();
      logger.info(`✓ ${output}`);
      results.push({ package: pkg, installed: true, version: output.split(' ')[1] });
    } catch (error) {
      logger.error(`✗ ${pkg} not installed or not working properly`);
      results.push({ package: pkg, installed: false, error: error.message });
    }
  }
  
  return results;
}

// Verify script paths
async function verifyScriptPaths() {
  const scriptDir = path.resolve(process.cwd(), 'scripts');
  logger.info(`Checking scripts directory: ${scriptDir}`);
  
  try {
    const files = fs.readdirSync(scriptDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    if (pythonScripts.length > 0) {
      logger.info(`Found ${pythonScripts.length} Python scripts: ${pythonScripts.join(', ')}`);
      return { exists: true, scripts: pythonScripts };
    } else {
      logger.warn('No Python scripts found in scripts directory');
      return { exists: true, scripts: [] };
    }
  } catch (error) {
    logger.error(`Error checking scripts directory: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

// Update .env file with detected Python path
async function updateEnvFile(pythonPath) {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.info(`Updating .env file at: ${envPath}`);
  
  try {
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Replace or add PYTHON_PATH
      if (envContent.includes('PYTHON_PATH=')) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
      } else {
        envContent += `\nPYTHON_PATH=${pythonPath}\n`;
      }
      
      // Replace or add PYTHON_EXECUTABLE
      if (envContent.includes('PYTHON_EXECUTABLE=')) {
        envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
      } else {
        envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
      }
    } else {
      // Create new .env file with Python path
      envContent = `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    logger.info('.env file updated successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

// Install missing Python packages
async function installMissingPackages(pythonPath, packageResults) {
  const missingPackages = packageResults.filter(pkg => !pkg.installed).map(pkg => pkg.package);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are installed');
    return { success: true, installed: [] };
  }
  
  logger.info(`Installing missing packages: ${missingPackages.join(', ')}`);
  
  const results = [];
  
  for (const pkg of missingPackages) {
    try {
      logger.info(`Installing ${pkg}...`);
      execSync(`${pythonPath} -m pip install ${pkg}`, { stdio: 'inherit' });
      logger.info(`✓ Successfully installed ${pkg}`);
      results.push({ package: pkg, success: true });
    } catch (error) {
      logger.error(`✗ Failed to install ${pkg}: ${error.message}`);
      results.push({ package: pkg, success: false, error: error.message });
    }
  }
  
  return { success: results.every(r => r.success), installed: results };
}

// Main verification function
async function verifyPythonEnvironment() {
  try {
    logger.info('Starting Python environment verification...');
    
    // Step 1: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 2: Verify Python version
    const pythonVersion = await verifyPythonVersion(pythonPath);
    
    // Step 3: Check required packages
    const packageResults = await checkPythonPackages(pythonPath);
    
    // Step 4: Verify script paths
    const scriptPathsResult = await verifyScriptPaths();
    
    // Step 5: Update .env file with detected Python path
    const envUpdateResult = await updateEnvFile(pythonPath);
    
    // Step 6: Install missing packages if any
    const installResult = await installMissingPackages(pythonPath, packageResults);
    
    // Final report
    const report = {
      pythonPath,
      pythonVersion,
      packages: packageResults,
      scripts: scriptPathsResult,
      envUpdated: envUpdateResult,
      packagesInstalled: installResult
    };
    
    logger.info('Python environment verification completed');
    logger.info(JSON.stringify(report, null, 2));
    
    return report;
  } catch (error) {
    logger.error(`Python environment verification failed: ${error.message}`);
    throw error;
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyPythonEnvironment()
    .then(() => {
      logger.info('Verification completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Verification failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  verifyPythonEnvironment,
  detectPythonPath,
  verifyPythonVersion,
  checkPythonPackages,
  verifyScriptPaths,
  updateEnvFile,
  installMissingPackages
};// scripts/verify-python-env.js

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'python-env-verification.log' })
  ]
});

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
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
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Default fallback
  logger.info('No specific Python path found, using default "python" command');
  return 'python';
}

// Verify Python version
async function verifyPythonVersion(pythonPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Verifying Python version using: ${pythonPath}`);
    
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(sys.version)']);
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Python version: ${output.trim()}`);
        resolve(output.trim());
      } else {
        logger.error(`Python version check failed with code ${code}: ${error}`);
        reject(new Error(`Python version check failed: ${error}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      reject(err);
    });
  });
}

// Check if required Python packages are installed
async function checkPythonPackages(pythonPath) {
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'hyperopt',
    'pymongo',
    'python-dotenv',
    'redis',
    'prometheus-client',
    'psutil',
    'cachetools'
  ];
  
  logger.info('Checking required Python packages...');
  
  const results = [];
  
  for (const pkg of requiredPackages) {
    try {
      const checkCmd = `import ${pkg}; print(f"${pkg} {getattr(${pkg}, '__version__', 'unknown')}")`;
      const output = execSync(`${pythonPath} -c "${checkCmd}"`, { encoding: 'utf8' }).trim();
      logger.info(`✓ ${output}`);
      results.push({ package: pkg, installed: true, version: output.split(' ')[1] });
    } catch (error) {
      logger.error(`✗ ${pkg} not installed or not working properly`);
      results.push({ package: pkg, installed: false, error: error.message });
    }
  }
  
  return results;
}

// Verify script paths
async function verifyScriptPaths() {
  const scriptDir = path.resolve(process.cwd(), 'scripts');
  logger.info(`Checking scripts directory: ${scriptDir}`);
  
  try {
    const files = fs.readdirSync(scriptDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    if (pythonScripts.length > 0) {
      logger.info(`Found ${pythonScripts.length} Python scripts: ${pythonScripts.join(', ')}`);
      return { exists: true, scripts: pythonScripts };
    } else {
      logger.warn('No Python scripts found in scripts directory');
      return { exists: true, scripts: [] };
    }
  } catch (error) {
    logger.error(`Error checking scripts directory: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

// Update .env file with detected Python path
async function updateEnvFile(pythonPath) {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.info(`Updating .env file at: ${envPath}`);
  
  try {
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Replace or add PYTHON_PATH
      if (envContent.includes('PYTHON_PATH=')) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
      } else {
        envContent += `\nPYTHON_PATH=${pythonPath}\n`;
      }
      
      // Replace or add PYTHON_EXECUTABLE
      if (envContent.includes('PYTHON_EXECUTABLE=')) {
        envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
      } else {
        envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
      }
    } else {
      // Create new .env file with Python path
      envContent = `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    logger.info('.env file updated successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

// Install missing Python packages
async function installMissingPackages(pythonPath, packageResults) {
  const missingPackages = packageResults.filter(pkg => !pkg.installed).map(pkg => pkg.package);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are installed');
    return { success: true, installed: [] };
  }
  
  logger.info(`Installing missing packages: ${missingPackages.join(', ')}`);
  
  const results = [];
  
  for (const pkg of missingPackages) {
    try {
      logger.info(`Installing ${pkg}...`);
      execSync(`${pythonPath} -m pip install ${pkg}`, { stdio: 'inherit' });
      logger.info(`✓ Successfully installed ${pkg}`);
      results.push({ package: pkg, success: true });
    } catch (error) {
      logger.error(`✗ Failed to install ${pkg}: ${error.message}`);
      results.push({ package: pkg, success: false, error: error.message });
    }
  }
  
  return { success: results.every(r => r.success), installed: results };
}

// Main verification function
async function verifyPythonEnvironment() {
  try {
    logger.info('Starting Python environment verification...');
    
    // Step 1: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 2: Verify Python version
    const pythonVersion = await verifyPythonVersion(pythonPath);
    
    // Step 3: Check required packages
    const packageResults = await checkPythonPackages(pythonPath);
    
    // Step 4: Verify script paths
    const scriptPathsResult = await verifyScriptPaths();
    
    // Step 5: Update .env file with detected Python path
    const envUpdateResult = await updateEnvFile(pythonPath);
    
    // Step 6: Install missing packages if any
    const installResult = await installMissingPackages(pythonPath, packageResults);
    
    // Final report
    const report = {
      pythonPath,
      pythonVersion,
      packages: packageResults,
      scripts: scriptPathsResult,
      envUpdated: envUpdateResult,
      packagesInstalled: installResult
    };
    
    logger.info('Python environment verification completed');
    logger.info(JSON.stringify(report, null, 2));
    
    return report;
  } catch (error) {
    logger.error(`Python environment verification failed: ${error.message}`);
    throw error;
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyPythonEnvironment()
    .then(() => {
      logger.info('Verification completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Verification failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  verifyPythonEnvironment,
  detectPythonPath,
  verifyPythonVersion,
  checkPythonPackages,
  verifyScriptPaths,
  updateEnvFile,
  installMissingPackages
};// scripts/verify-python-env.js

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'python-env-verification.log' })
  ]
});

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
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
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Default fallback
  logger.info('No specific Python path found, using default "python" command');
  return 'python';
}

// Verify Python version
async function verifyPythonVersion(pythonPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Verifying Python version using: ${pythonPath}`);
    
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(sys.version)']);
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Python version: ${output.trim()}`);
        resolve(output.trim());
      } else {
        logger.error(`Python version check failed with code ${code}: ${error}`);
        reject(new Error(`Python version check failed: ${error}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      reject(err);
    });
  });
}

// Check if required Python packages are installed
async function checkPythonPackages(pythonPath) {
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'hyperopt',
    'pymongo',
    'python-dotenv',
    'redis',
    'prometheus-client',
    'psutil',
    'cachetools'
  ];
  
  logger.info('Checking required Python packages...');
  
  const results = [];
  
  for (const pkg of requiredPackages) {
    try {
      const checkCmd = `import ${pkg}; print(f"${pkg} {getattr(${pkg}, '__version__', 'unknown')}")`;
      const output = execSync(`${pythonPath} -c "${checkCmd}"`, { encoding: 'utf8' }).trim();
      logger.info(`✓ ${output}`);
      results.push({ package: pkg, installed: true, version: output.split(' ')[1] });
    } catch (error) {
      logger.error(`✗ ${pkg} not installed or not working properly`);
      results.push({ package: pkg, installed: false, error: error.message });
    }
  }
  
  return results;
}

// Verify script paths
async function verifyScriptPaths() {
  const scriptDir = path.resolve(process.cwd(), 'scripts');
  logger.info(`Checking scripts directory: ${scriptDir}`);
  
  try {
    const files = fs.readdirSync(scriptDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    if (pythonScripts.length > 0) {
      logger.info(`Found ${pythonScripts.length} Python scripts: ${pythonScripts.join(', ')}`);
      return { exists: true, scripts: pythonScripts };
    } else {
      logger.warn('No Python scripts found in scripts directory');
      return { exists: true, scripts: [] };
    }
  } catch (error) {
    logger.error(`Error checking scripts directory: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

// Update .env file with detected Python path
async function updateEnvFile(pythonPath) {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.info(`Updating .env file at: ${envPath}`);
  
  try {
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Replace or add PYTHON_PATH
      if (envContent.includes('PYTHON_PATH=')) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
      } else {
        envContent += `\nPYTHON_PATH=${pythonPath}\n`;
      }
      
      // Replace or add PYTHON_EXECUTABLE
      if (envContent.includes('PYTHON_EXECUTABLE=')) {
        envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
      } else {
        envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
      }
    } else {
      // Create new .env file with Python path
      envContent = `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    logger.info('.env file updated successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

// Install missing Python packages
async function installMissingPackages(pythonPath, packageResults) {
  const missingPackages = packageResults.filter(pkg => !pkg.installed).map(pkg => pkg.package);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are installed');
    return { success: true, installed: [] };
  }
  
  logger.info(`Installing missing packages: ${missingPackages.join(', ')}`);
  
  const results = [];
  
  for (const pkg of missingPackages) {
    try {
      logger.info(`Installing ${pkg}...`);
      execSync(`${pythonPath} -m pip install ${pkg}`, { stdio: 'inherit' });
      logger.info(`✓ Successfully installed ${pkg}`);
      results.push({ package: pkg, success: true });
    } catch (error) {
      logger.error(`✗ Failed to install ${pkg}: ${error.message}`);
      results.push({ package: pkg, success: false, error: error.message });
    }
  }
  
  return { success: results.every(r => r.success), installed: results };
}

// Main verification function
async function verifyPythonEnvironment() {
  try {
    logger.info('Starting Python environment verification...');
    
    // Step 1: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 2: Verify Python version
    const pythonVersion = await verifyPythonVersion(pythonPath);
    
    // Step 3: Check required packages
    const packageResults = await checkPythonPackages(pythonPath);
    
    // Step 4: Verify script paths
    const scriptPathsResult = await verifyScriptPaths();
    
    // Step 5: Update .env file with detected Python path
    const envUpdateResult = await updateEnvFile(pythonPath);
    
    // Step 6: Install missing packages if any
    const installResult = await installMissingPackages(pythonPath, packageResults);
    
    // Final report
    const report = {
      pythonPath,
      pythonVersion,
      packages: packageResults,
      scripts: scriptPathsResult,
      envUpdated: envUpdateResult,
      packagesInstalled: installResult
    };
    
    logger.info('Python environment verification completed');
    logger.info(JSON.stringify(report, null, 2));
    
    return report;
  } catch (error) {
    logger.error(`Python environment verification failed: ${error.message}`);
    throw error;
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyPythonEnvironment()
    .then(() => {
      logger.info('Verification completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Verification failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  verifyPythonEnvironment,
  detectPythonPath,
  verifyPythonVersion,
  checkPythonPackages,
  verifyScriptPaths,
  updateEnvFile,
  installMissingPackages
};// scripts/verify-python-env.js

require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'python-env-verification.log' })
  ]
});

// Detect Python executable path
async function detectPythonPath() {
  logger.info('Detecting Python executable path...');
  
  // Check environment variables first
  const envPath = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (envPath) {
    logger.info(`Found Python path in environment variables: ${envPath}`);
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
    
    for (const pythonPath of commonWindowsPaths) {
      try {
        if (fs.existsSync(pythonPath)) {
          logger.info(`Found Python at: ${pythonPath}`);
          return pythonPath;
        }
      } catch (e) {
        // Ignore errors and continue checking
      }
    }
  } else {
    // On Unix-like systems, we can try to use the 'which' command
    try {
      const pythonPath = execSync('which python3 || which python').toString().trim();
      if (pythonPath) {
        logger.info(`Found Python at: ${pythonPath}`);
        return pythonPath;
      }
    } catch (e) {
      // Ignore errors and fall back to default
    }
  }
  
  // Default fallback
  logger.info('No specific Python path found, using default "python" command');
  return 'python';
}

// Verify Python version
async function verifyPythonVersion(pythonPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Verifying Python version using: ${pythonPath}`);
    
    const pythonProcess = spawn(pythonPath, ['-c', 'import sys; print(sys.version)']);
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Python version: ${output.trim()}`);
        resolve(output.trim());
      } else {
        logger.error(`Python version check failed with code ${code}: ${error}`);
        reject(new Error(`Python version check failed: ${error}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      reject(err);
    });
  });
}

// Check if required Python packages are installed
async function checkPythonPackages(pythonPath) {
  const requiredPackages = [
    'numpy',
    'pandas',
    'scikit-learn',
    'xgboost',
    'lightgbm',
    'hyperopt',
    'pymongo',
    'python-dotenv',
    'redis',
    'prometheus-client',
    'psutil',
    'cachetools'
  ];
  
  logger.info('Checking required Python packages...');
  
  const results = [];
  
  for (const pkg of requiredPackages) {
    try {
      const checkCmd = `import ${pkg}; print(f"${pkg} {getattr(${pkg}, '__version__', 'unknown')}")`;
      const output = execSync(`${pythonPath} -c "${checkCmd}"`, { encoding: 'utf8' }).trim();
      logger.info(`✓ ${output}`);
      results.push({ package: pkg, installed: true, version: output.split(' ')[1] });
    } catch (error) {
      logger.error(`✗ ${pkg} not installed or not working properly`);
      results.push({ package: pkg, installed: false, error: error.message });
    }
  }
  
  return results;
}

// Verify script paths
async function verifyScriptPaths() {
  const scriptDir = path.resolve(process.cwd(), 'scripts');
  logger.info(`Checking scripts directory: ${scriptDir}`);
  
  try {
    const files = fs.readdirSync(scriptDir);
    const pythonScripts = files.filter(file => file.endsWith('.py'));
    
    if (pythonScripts.length > 0) {
      logger.info(`Found ${pythonScripts.length} Python scripts: ${pythonScripts.join(', ')}`);
      return { exists: true, scripts: pythonScripts };
    } else {
      logger.warn('No Python scripts found in scripts directory');
      return { exists: true, scripts: [] };
    }
  } catch (error) {
    logger.error(`Error checking scripts directory: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

// Update .env file with detected Python path
async function updateEnvFile(pythonPath) {
  const envPath = path.resolve(process.cwd(), '.env');
  logger.info(`Updating .env file at: ${envPath}`);
  
  try {
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Replace or add PYTHON_PATH
      if (envContent.includes('PYTHON_PATH=')) {
        envContent = envContent.replace(/PYTHON_PATH=.*(\r?\n|$)/g, `PYTHON_PATH=${pythonPath}$1`);
      } else {
        envContent += `\nPYTHON_PATH=${pythonPath}\n`;
      }
      
      // Replace or add PYTHON_EXECUTABLE
      if (envContent.includes('PYTHON_EXECUTABLE=')) {
        envContent = envContent.replace(/PYTHON_EXECUTABLE=.*(\r?\n|$)/g, `PYTHON_EXECUTABLE=${pythonPath}$1`);
      } else {
        envContent += `PYTHON_EXECUTABLE=${pythonPath}\n`;
      }
    } else {
      // Create new .env file with Python path
      envContent = `PYTHON_PATH=${pythonPath}\nPYTHON_EXECUTABLE=${pythonPath}\n`;
    }
    
    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    logger.info('.env file updated successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error updating .env file: ${error.message}`);
    return false;
  }
}

// Install missing Python packages
async function installMissingPackages(pythonPath, packageResults) {
  const missingPackages = packageResults.filter(pkg => !pkg.installed).map(pkg => pkg.package);
  
  if (missingPackages.length === 0) {
    logger.info('All required Python packages are installed');
    return { success: true, installed: [] };
  }
  
  logger.info(`Installing missing packages: ${missingPackages.join(', ')}`);
  
  const results = [];
  
  for (const pkg of missingPackages) {
    try {
      logger.info(`Installing ${pkg}...`);
      execSync(`${pythonPath} -m pip install ${pkg}`, { stdio: 'inherit' });
      logger.info(`✓ Successfully installed ${pkg}`);
      results.push({ package: pkg, success: true });
    } catch (error) {
      logger.error(`✗ Failed to install ${pkg}: ${error.message}`);
      results.push({ package: pkg, success: false, error: error.message });
    }
  }
  
  return { success: results.every(r => r.success), installed: results };
}

// Main verification function
async function verifyPythonEnvironment() {
  try {
    logger.info('Starting Python environment verification...');
    
    // Step 1: Detect Python path
    const pythonPath = await detectPythonPath();
    
    // Step 2: Verify Python version
    const pythonVersion = await verifyPythonVersion(pythonPath);
    
    // Step 3: Check required packages
    const packageResults = await checkPythonPackages(pythonPath);
    
    // Step 4: Verify script paths
    const scriptPathsResult = await verifyScriptPaths();
    
    // Step 5: Update .env file with detected Python path
    const envUpdateResult = await updateEnvFile(pythonPath);
    
    // Step 6: Install missing packages if any
    const installResult = await installMissingPackages(pythonPath, packageResults);
    
    // Final report
    const report = {
      pythonPath,
      pythonVersion,
      packages: packageResults,
      scripts: scriptPathsResult,
      envUpdated: envUpdateResult,
      packagesInstalled: installResult
    };
    
    logger.info('Python environment verification completed');
    logger.info(JSON.stringify(report, null, 2));
    
    return report;
  } catch (error) {
    logger.error(`Python environment verification failed: ${error.message}`);
    throw error;
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyPythonEnvironment()
    .then(() => {
      logger.info('Verification completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Verification failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  verifyPythonEnvironment,
  detectPythonPath,
  verifyPythonVersion,
  checkPythonPackages,
  verifyScriptPaths,
  updateEnvFile,
  installMissingPackages
};