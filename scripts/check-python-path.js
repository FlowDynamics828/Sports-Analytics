// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');// scripts/check-python-path.js
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Checking Python installation...');

// Check common Python paths
const commonPaths = [
  'C:\\Python39\\python.exe',
  'C:\\Python310\\python.exe',
  'C:\\Python311\\python.exe',
  'C:\\Program Files\\Python39\\python.exe',
  'C:\\Program Files\\Python310\\python.exe',
  'C:\\Program Files\\Python311\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
  'C:\\Users\\d07ch\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
];

// Check if paths exist
console.log('Checking common Python paths:');
commonPaths.forEach(path => {
  if (fs.existsSync(path)) {
    console.log(`✓ Found Python at: ${path}`);
  } else {
    console.log(`✗ Not found: ${path}`);
  }
});

// Try to get Python path from system
try {
  console.log('\nChecking system Python:');
  const pythonPath = execSync('where python', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`System Python path: ${pythonPath}`);
  
  // Test if Python works
  const pythonVersion = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python version: ${pythonVersion}`);
} catch (error) {
  console.error('Error finding Python in system PATH:', error.message);
}

// Check Python3 specifically
try {
  console.log('\nChecking for Python3:');
  const python3Path = execSync('where python3', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python3 path: ${python3Path}`);
  
  // Test if Python3 works
  const python3Version = execSync(`"${python3Path}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python3 version: ${python3Version}`);
} catch (error) {
  console.error('Python3 not found in system PATH:', error.message);
}

console.log('\nChecking Python launcher (py):');
try {
  const pyPath = execSync('where py', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`Python launcher path: ${pyPath}`);
  
  // Test if Python launcher works
  const pyVersion = execSync(`"${pyPath}" --version`, { encoding: 'utf8' }).trim();
  console.log(`Python launcher version: ${pyVersion}`);
} catch (error) {
  console.error('Python launcher not found in system PATH:', error.message);
}

console.log('\nPython path check complete.');