// scripts/fix-mongodb-connection.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { MongoClient } = require('mongodb');
const readline = require('readline');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

console.log(`${colors.bright}${colors.cyan}Sports Analytics - MongoDB Connection Fix${colors.reset}`);
console.log(`${colors.cyan}=======================================${colors.reset}\n`);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask a question and get answer
function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Default MongoDB URIs to try
const DEFAULT_URIS = [
  'mongodb://localhost:27017/sports-analytics',
  'mongodb://127.0.0.1:27017/sports-analytics',
  'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics'
];

/**
 * Test MongoDB connection with a given URI
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<Object>} Connection result and client
 */
async function testConnection(uri) {
  let client = null;
  try {
    console.log(`${colors.yellow}Testing connection to: ${uri}${colors.reset}`);

    // Create client with appropriate options
    client = new MongoClient(uri, {
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 1
    });

    // Connect to MongoDB
    await client.connect();
    
    // Verify connection with ping
    await client.db("admin").command({ ping: 1 });
    
    console.log(`${colors.green}✓ MongoDB connection successful${colors.reset}`);
    
    // Test query to sports-analytics database
    const db = client.db("sports-analytics");
    try {
      // Try to list collections
      const collections = await db.listCollections().toArray();
      console.log(`${colors.green}✓ Database access verified. Found ${collections.length} collections${colors.reset}`);
      
      return { success: true, client, collections };
    } catch (dbError) {
      console.log(`${colors.yellow}⚠ Connected to MongoDB server but couldn't access database: ${dbError.message}${colors.reset}`);
      return { success: true, warning: dbError.message, client };
    }
  } catch (error) {
    console.log(`${colors.red}✗ Connection failed: ${error.message}${colors.reset}`);
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    return { success: false, error: error.message };
  }
}

/**
 * Update MongoDB URI in .env file
 * @param {string} uri - Working MongoDB URI
 */
async function updateEnvFile(uri) {
  console.log(`\n${colors.bright}Updating .env file...${colors.reset}`);
  const envPath = path.join(process.cwd(), '.env');
  
  let envContent = '';
  let updated = false;
  
  // Check if .env file exists
  if (fs.existsSync(envPath)) {
    // Read and update existing file
    envContent = fs.readFileSync(envPath, 'utf8');
    
    if (envContent.includes('MONGODB_URI=')) {
      const currentUri = envContent.match(/MONGODB_URI=(.*)(\r?\n|$)/)[1];
      if (currentUri !== uri) {
        envContent = envContent.replace(/MONGODB_URI=.*(\r?\n|$)/, `MONGODB_URI=${uri}$1`);
        updated = true;
      }
    } else {
      envContent += `\nMONGODB_URI=${uri}`;
      updated = true;
    }
    
    // Add other MongoDB settings if they don't exist
    if (!envContent.includes('MONGODB_DB_NAME=')) {
      envContent += `\nMONGODB_DB_NAME=sports-analytics`;
      updated = true;
    }
    
    if (!envContent.includes('DB_MAX_POOL_SIZE=')) {
      envContent += `\nDB_MAX_POOL_SIZE=50`;
      updated = true;
    }
    
    if (!envContent.includes('DB_MIN_POOL_SIZE=')) {
      envContent += `\nDB_MIN_POOL_SIZE=5`;
      updated = true;
    }
    
    if (!envContent.includes('CONNECT_TIMEOUT_MS=')) {
      envContent += `\nCONNECT_TIMEOUT_MS=30000`;
      updated = true;
    }
    
    if (!envContent.includes('SOCKET_TIMEOUT_MS=')) {
      envContent += `\nSOCKET_TIMEOUT_MS=45000`;
      updated = true;
    }
  } else {
    // Create new .env file with MongoDB settings
    envContent = `# MongoDB Configuration
MONGODB_URI=${uri}
MONGODB_DB_NAME=sports-analytics
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=5
CONNECT_TIMEOUT_MS=30000
SOCKET_TIMEOUT_MS=45000
`;
    updated = true;
  }
  
  if (updated) {
    fs.writeFileSync(envPath, envContent);
    console.log(`${colors.green}✓ Updated .env file with working MongoDB URI and settings${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ .env file already contains the working MongoDB URI${colors.reset}`);
  }
}

/**
 * Create or fix MongoDB connection utility
 */
async function fixDbUtil() {
  console.log(`\n${colors.bright}Creating robust MongoDB connection utility...${colors.reset}`);
  
  const utilsDir = path.join(process.cwd(), 'utils');
  if (!fs.existsSync(utilsDir)) {
    fs.mkdirSync(utilsDir, { recursive: true });
  }
  
  const dbUtilPath = path.join(utilsDir, 'db.js');
  const dbUtilContent = `// utils/db.js - Robust MongoDB connection manager
const { MongoClient } = require('mongodb');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
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
      filename: 'logs/mongodb-error.log',
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: 'logs/mongodb.log'
    })
  ]
});

// Ensure logs directory exists
const fs = require('fs');
const path = require('path');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

/**
 * Enterprise-grade MongoDB connection manager with high availability features
 */
class DatabaseManager {
  constructor(config = {}) {
    this.config = {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics',
      name: process.env.MONGODB_DB_NAME || 'sports-analytics',
      options: {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
        connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
        socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000,
        serverSelectionTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        ...config.options
      },
      ...config
    };
    
    this.client = null;
    this.db = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.MAX_RECONNECT_ATTEMPTS = 10;
    this.RECONNECT_INTERVAL = 5000;
    this.reconnectTimer = null;
    
    // Bind event handlers
    this._handleConnectionClose = this._handleConnectionClose.bind(this);
    this._handleConnectionError = this._handleConnectionError.bind(this);
  }
  
  /**
   * Initialize database connection
   * @returns {Promise<boolean>} Connection success status
   */
  async initialize() {
    try {
      if (this.client && this.connected) {
        logger.info('Database already connected');
        return true;
      }
      
      // Create MongoDB client
      this.client = new MongoClient(this.config.uri, this.config.options);
      
      // Connect to MongoDB
      await this.client.connect();
      this.db = this.client.db(this.config.name);
      
      // Test connection
      await this.db.command({ ping: 1 });
      
      // Register event handlers
      this.client.on('close', this._handleConnectionClose);
      this.client.on('error', this._handleConnectionError);
      
      this.connected = true;
      this.reconnectAttempts = 0;
      
      logger.info('MongoDB connection established successfully');
      return true;
    } catch (error) {
      logger.error(\`MongoDB connection failed: \${error.message}\`);
      this.connected = false;
      
      // Initial connection failed, try to reconnect
      this._scheduleReconnect();
      return false;
    }
  }
  
  /**
   * Schedule reconnection attempt with exponential backoff
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error(\`Maximum reconnection attempts (\${this.MAX_RECONNECT_ATTEMPTS}) exceeded\`);
      return;
    }
    
    this.reconnecting = true;
    const delay = Math.min(this.RECONNECT_INTERVAL * Math.pow(1.5, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    
    logger.info(\`Scheduling reconnection attempt \${this.reconnectAttempts} in \${delay}ms\`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        logger.info(\`Attempting to reconnect (attempt \${this.reconnectAttempts})\`);
        await this.initialize();
      } catch (error) {
        logger.error(\`Reconnection attempt \${this.reconnectAttempts} failed: \${error.message}\`);
        this._scheduleReconnect();
      }
    }, delay);
  }
  
  /**
   * Handle connection close event
   * @private
   */
  _handleConnectionClose() {
    logger.warn('MongoDB connection closed unexpectedly');
    this.connected = false;
    if (!this.reconnecting) {
      this._scheduleReconnect();
    }
  }
  
  /**
   * Handle connection error event
   * @param {Error} error - Connection error
   * @private
   */
  _handleConnectionError(error) {
    logger.error(\`MongoDB connection error: \${error.message}\`);
    this.connected = false;
    if (!this.reconnecting) {
      this._scheduleReconnect();
    }
  }
  
  /**
   * Check if database is connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected && this.client !== null;
  }
  
  /**
   * Perform health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      if (!this.client || !this.connected) {
        return { status: 'disconnected' };
      }
      
      await this.db.command({ ping: 1 });
      const status = this.client.topology.s.state;
      
      return {
        status: 'connected',
        details: {
          state: status,
          poolSize: this.client.topology.s.pool ? this.client.topology.s.pool.size : 'N/A'
        }
      };
    } catch (error) {
      logger.error(\`Health check failed: \${error.message}\`);
      return { 
        status: 'error',
        error: error.message
      };
    }
  }
  
  /**
   * Get database instance
   * @returns {Object|null} MongoDB database instance 
   */
  getDb() {
    if (!this.connected || !this.db) {
      logger.warn('Attempted to get database instance while disconnected');
      return null;
    }
    
    return this.db;
  }
  
  /**
   * Close database connection
   * @returns {Promise<boolean>} Close success status
   */
  async close() {
    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
      }
      
      this.connected = false;
      this.reconnecting = false;
      
      logger.info('MongoDB connection closed successfully');
      return true;
    } catch (error) {
      logger.error(\`Error closing MongoDB connection: \${error.message}\`);
      return false;
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get DatabaseManager instance
 * @param {Object} config - Optional configuration
 * @returns {DatabaseManager} Database manager instance
 */
function getDatabaseManager(config = {}) {
  if (!instance) {
    instance = new DatabaseManager(config);
  }
  return instance;
}

module.exports = {
  DatabaseManager,
  getDatabaseManager
};
`;
  
  fs.writeFileSync(dbUtilPath, dbUtilContent);
  console.log(`${colors.green}✓ Created robust MongoDB connection utility at utils/db.js${colors.reset}`);
}

/**
 * Create test MongoDB connection script
 */
async function createConnectionTestScript() {
  console.log(`\n${colors.bright}Creating MongoDB connection test script...${colors.reset}`);
  
  const scriptContent = `// test-mongodb-connection.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

async function testConnection() {
  let client = null;
  
  try {
    console.log('Testing MongoDB connection...');
    
    // Create client with appropriate options
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 50,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 5,
      connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 30000,
      socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 45000
    });
    
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB server');
    
    // Test database access
    const db = client.db(DB_NAME);
    
    // Try to list collections
    const collections = await db.listCollections().toArray();
    console.log(\`Found \${collections.length} collections in the database\`);
    
    // Print collection names
    if (collections.length > 0) {
      console.log('Collections:');
      collections.forEach(collection => {
        console.log(\`- \${collection.name}\`);
      });
    }
    
    console.log('MongoDB connection test passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error(\`MongoDB connection test failed: \${error.message}\`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('Error: Could not connect to MongoDB server. Make sure MongoDB is running.');
    } else if (error.message.includes('Authentication failed')) {
      console.error('Error: Authentication failed. Check your MongoDB credentials.');
    } else if (error.message.includes('not authorized')) {
      console.error('Error: Not authorized to access the database. Check your MongoDB user permissions.');
    }
    
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run test
testConnection().catch(error => {
  console.error(\`Unhandled error: \${error.message}\`);
  process.exit(1);
});
`;
  
  const testScriptPath = path.join(process.cwd(), 'test-mongodb-connection.js');
  fs.writeFileSync(testScriptPath, scriptContent);
  console.log(`${colors.green}✓ Created MongoDB connection test script at test-mongodb-connection.js${colors.reset}`);
}

/**
 * Update MongoDB-related package scripts
 */
async function updatePackageScripts() {
  console.log(`\n${colors.bright}Updating package.json scripts...${colors.reset}`);
  
  const packagePath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packagePath)) {
    console.log(`${colors.yellow}⚠ package.json not found${colors.reset}`);
    return;
  }
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Ensure scripts section exists
    packageJson.scripts = packageJson.scripts || {};
    
    // Add new scripts for MongoDB
    packageJson.scripts['db:verify'] = 'node test-mongodb-connection.js';
    packageJson.scripts['db:fix'] = 'node scripts/fix-mongodb-connection.js';
    packageJson.scripts['fix:mongodb'] = 'node scripts/fix-mongodb-connection.js';
    
    // Update existing scripts if present
    if (packageJson.scripts['verify:all']) {
      packageJson.scripts['verify:all'] = 'node scripts/verify-python-env.js && node test-mongodb-connection.js && node scripts/quick-diagnose.js';
    }
    
    // Write updated package.json
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    console.log(`${colors.green}✓ Updated package.json with MongoDB scripts${colors.reset}`);
  } catch (error) {
    console.log(`${colors.red}✗ Failed to update package.json: ${error.message}${colors.reset}`);
  }
}

/**
 * Fix MongoDB connection in api.js
 */
async function fixApiFile() {
  console.log(`\n${colors.bright}Checking api.js for MongoDB connection...${colors.reset}`);
  
  const apiPath = path.join(process.cwd(), 'api.js');
  if (!fs.existsSync(apiPath)) {
    console.log(`${colors.yellow}⚠ api.js not found, skipping this step${colors.reset}`);
    return;
  }
  
  try {
    let apiContent = fs.readFileSync(apiPath, 'utf8');
    let updated = false;
    
    // Check if DatabaseManager is already imported
    if (!apiContent.includes('utils/db')) {
      // Look for MongoDB connection code
      if (apiContent.includes('MongoClient') || apiContent.includes('mongodb')) {
        // Find appropriate place to add import
        const importSection = apiContent.match(/const\s+.*require\(.*\).*\n/g);
        if (importSection && importSection.length > 0) {
          const lastImport = importSection[importSection.length - 1];
          const importPos = apiContent.lastIndexOf(lastImport) + lastImport.length;
          
          apiContent = apiContent.slice(0, importPos) + 
            `const { getDatabaseManager } = require('./utils/db');\n` + 
            apiContent.slice(importPos);
          
          updated = true;
        }
        
        // Find MongoDB connection code
        const mongoConnectPattern = /new\s+MongoClient\(.*\)|MongoClient\.connect\(.*\)/;
        if (mongoConnectPattern.test(apiContent)) {
          // Replace direct MongoDB connection with DatabaseManager
          apiContent = apiContent.replace(
            /(\s*)(const\s+client\s*=\s*new\s+MongoClient\(.*\)|await\s+MongoClient\.connect\(.*\))([\s\S]*?)(const\s+db\s*=\s*client\.db\(.*\))/g,
            `$1// Get database manager instance
$1const dbManager = getDatabaseManager();
$1await dbManager.initialize();
$1const client = dbManager.client;
$1const db = dbManager.getDb();`
          );
          
          updated = true;
        }
      }
    }
    
    if (updated) {
      fs.writeFileSync(apiPath, apiContent);
      console.log(`${colors.green}✓ Updated api.js with improved MongoDB connection handling${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ No updates needed for api.js${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Error updating api.js: ${error.message}${colors.reset}`);
  }
}

/**
 * Check if MongoDB is installed and running
 */
async function checkMongoDBInstallation() {
  console.log(`\n${colors.bright}Checking if MongoDB is installed and running...${colors.reset}`);
  
  // Check if MongoDB is running
  let isRunning = false;
  
  try {
    if (process.platform === 'win32') {
      // Windows: Check MongoDB service
      try {
        const output = execSync('sc query MongoDB', { timeout: 5000 }).toString();
        isRunning = output.includes('RUNNING');
        
        if (isRunning) {
          console.log(`${colors.green}✓ MongoDB service is running${colors.reset}`);
        } else {
          console.log(`${colors.yellow}⚠ MongoDB service is not running${colors.reset}`);
        }
      } catch (error) {
        // Try netstat approach instead
        try {
          const output = execSync('netstat -ano | findstr 27017', { timeout: 5000 }).toString();
          isRunning = output.includes('LISTENING');
          
          if (isRunning) {
            console.log(`${colors.green}✓ MongoDB server is running on port 27017${colors.reset}`);
          } else {
            console.log(`${colors.yellow}⚠ MongoDB server is not running on port 27017${colors.reset}`);
          }
        } catch (netstatError) {
          console.log(`${colors.yellow}⚠ Could not determine if MongoDB is running${colors.reset}`);
        }
      }
    } else {
      // Linux/Mac: Check MongoDB process
      try {
        const output = execSync('ps aux | grep mongod', { timeout: 5000 }).toString();
        isRunning = output.includes('mongod') && !output.includes('grep mongod');
        
        if (isRunning) {
          console.log(`${colors.green}✓ MongoDB server is running${colors.reset}`);
        } else {
          console.log(`${colors.yellow}⚠ MongoDB server is not running${colors.reset}`);
        }
      } catch (error) {
        console.log(`${colors.yellow}⚠ Could not determine if MongoDB is running${colors.reset}`);
      }
    }
  } catch (error) {
    console.log(`${colors.yellow}⚠ Error checking MongoDB status: ${error.message}${colors.reset}`);
  }
  
  // If MongoDB is not running, offer guidance
  if (!isRunning) {
    console.log(`${colors.yellow}ℹ You may need to start MongoDB service:${colors.reset}`);
    
    if (process.platform === 'win32') {
      console.log(`${colors.cyan}  - Run as Administrator: net start MongoDB${colors.reset}`);
      console.log(`${colors.cyan}  - Or start it from Services (services.msc)${colors.reset}`);
    } else {
      console.log(`${colors.cyan}  - Run: sudo systemctl start mongod${colors.reset}`);
      console.log(`${colors.cyan}  - Or: brew services start mongodb-community${colors.reset}`);
    }
    
    // Ask if user wants to use MongoDB Atlas instead
    const useAtlas = await askQuestion(`${colors.bright}Do you want to use MongoDB Atlas instead of a local MongoDB server? (y/n) ${colors.reset}`);
    
    if (useAtlas.toLowerCase() === 'y') {
      return false; // Will handle Atlas setup later
    }
  }
  
  return isRunning;
}

/**
 * Set up MongoDB Atlas
 */
async function setupMongoDBAtlas() {
  console.log(`\n${colors.bright}Setting up MongoDB Atlas connection...${colors.reset}`);
  
  console.log(`${colors.cyan}MongoDB Atlas is a cloud database service that doesn't require local installation.${colors.reset}`);
  
  const defaultAtlasUri = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics';
  
  console.log(`\n${colors.cyan}The default MongoDB Atlas URI in your project is:${colors.reset}`);
  console.log(`${defaultAtlasUri}\n`);
  
  // Check if the default URI works
  const result = await testConnection(defaultAtlasUri);
  
  if (result.success) {
    console.log(`${colors.green}✓ The default MongoDB Atlas URI works!${colors.reset}`);
    return defaultAtlasUri;
  } else {
    console.log(`${colors.yellow}⚠ The default MongoDB Atlas URI doesn't work.${colors.reset}`);
    
    const customUri = await askQuestion(`${colors.bright}Do you have a different MongoDB Atlas URI to use? (y/n) ${colors.reset}`);
    
    if (customUri.toLowerCase() === 'y') {
      const uri = await askQuestion(`${colors.cyan}Please enter your MongoDB Atlas URI: ${colors.reset}`);
      
      if (uri && uri.trim()) {
        const customResult = await testConnection(uri.trim());
        
        if (customResult.success) {
          console.log(`${colors.green}✓ Your MongoDB Atlas URI works!${colors.reset}`);
          return uri.trim();
        } else {
          console.log(`${colors.red}✗ Your MongoDB Atlas URI doesn't work.${colors.reset}`);
        }
      }
    }
    
    console.log(`${colors.cyan}You can sign up for a free MongoDB Atlas account at https://www.mongodb.com/cloud/atlas/register${colors.reset}`);
  }
  
  return null;
}

/**
 * Main function to fix MongoDB connection
 */
async function main() {
  try {
    console.log(`${colors.yellow}This script will fix MongoDB connection issues in your Sports Analytics project.${colors.reset}\n`);
    
    // Check MongoDB installation
    const isMongoDBRunning = await checkMongoDBInstallation();
    
    // Determine MongoDB URI to use
    let workingUri = null;
    
    if (isMongoDBRunning) {
      // Try local connection first
      for (const uri of DEFAULT_URIS.slice(0, 2)) {
        const result = await testConnection(uri);
        if (result.success) {
          workingUri = uri;
          if (result.client) {
            await result.client.close();
          }
          break;
        }
      }
    }
    
    // If local connection failed, try MongoDB Atlas
    if (!workingUri) {
      workingUri = await setupMongoDBAtlas();
    }
    
    // If still no working URI, try all remaining options
    if (!workingUri) {
      console.log(`\n${colors.bright}Trying all possible MongoDB URIs...${colors.reset}`);
      
      for (const uri of DEFAULT_URIS) {
        if (uri === DEFAULT_URIS[0] || uri === DEFAULT_URIS[1]) continue; // Skip already tested local URIs
        
        const result = await testConnection(uri);
        if (result.success) {
          workingUri = uri;
          if (result.client) {
            await result.client.close();
          }
          break;
        }
      }
    }
    
    // If still no working URI, ask user for custom URI
    if (!workingUri) {
      console.log(`\n${colors.yellow}⚠ No working MongoDB URI found.${colors.reset}`);
      
      const customUri = await askQuestion(`${colors.bright}Do you want to enter a custom MongoDB URI? (y/n) ${colors.reset}`);
      
      if (customUri.toLowerCase() === 'y') {
        const uri = await askQuestion(`${colors.cyan}Please enter your MongoDB URI: ${colors.reset}`);
        
        if (uri && uri.trim()) {
          const result = await testConnection(uri.trim());
          
          if (result.success) {
            workingUri = uri.trim();
            if (result.client) {
              await result.client.close();
            }
          }
        }
      }
    }
    
    if (!workingUri) {
      console.log(`\n${colors.red}✗ Unable to establish a working MongoDB connection.${colors.reset}`);
      console.log(`${colors.yellow}Please ensure MongoDB is installed and running, or use a valid MongoDB Atlas URI.${colors.reset}`);
      return;
    }
    
    // Update .env file with working URI
    await updateEnvFile(workingUri);
    
    // Create enhanced MongoDB utils
    await fixDbUtil();
    
    // Create connection test script
    await createConnectionTestScript();
    
    // Update package.json scripts
    await updatePackageScripts();
    
    // Fix API file if needed
    await fixApiFile();
    
    // Final verification test
    console.log(`\n${colors.bright}Running final MongoDB connection test...${colors.reset}`);
    const finalTest = await testConnection(workingUri);
    
    if (finalTest.success) {
      if (finalTest.client) {
        await finalTest.client.close();
      }
      
      console.log(`\n${colors.green}✓ MongoDB connection fix completed successfully!${colors.reset}`);
      console.log(`${colors.green}✓ You can now run your application with MongoDB support.${colors.reset}`);
      
      // Print helpful commands
      console.log(`\n${colors.bright}Helpful commands:${colors.reset}`);
      console.log(`${colors.cyan}• npm run db:verify${colors.reset} - Test MongoDB connection`);
      console.log(`${colors.cyan}• npm run start:optimized${colors.reset} - Start app with optimized settings`);
    } else {
      console.log(`\n${colors.yellow}⚠ Some issues may still exist with your MongoDB connection.${colors.reset}`);
      console.log(`${colors.yellow}Please check your MongoDB configuration and try running the fix script again.${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error:${colors.reset} ${error.message}`);
    if (error.stack) {
      console.error(`\n${colors.dim}${error.stack}${colors.reset}`);
    }
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run the main function
main();