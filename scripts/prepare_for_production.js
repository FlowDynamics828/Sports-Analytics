#!/usr/bin/env node

/**
 * Production Preparation Script
 * This script helps prepare the sports analytics platform for production deployment
 * by checking and installing necessary dependencies, creating required directories,
 * and configuring the system
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config();

// Configuration
const requiredDirs = [
  'data',
  'data/embeddings',
  'models',
  'models/nlp',
  'logs',
  'cache',
  'data/feedback'
];

const requiredPythonPackages = [
  'spacy',
  'transformers',
  'nltk',
  'fastapi',
  'uvicorn',
  'torch',
  'scikit-learn',
  'pandas',
  'numpy'
];

// Node dependencies already in package.json will be installed with npm install

async function main() {
  console.log("\n🔧 Preparing Sports Analytics Platform for Production 🔧");

  // Step 1: Create required directories
  console.log("\n📁 Creating required directories...");
  for (const dir of requiredDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      } else {
        console.log(`✅ Directory already exists: ${dir}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create directory ${dir}:`, error.message);
    }
  }

  // Step 2: Install Node.js dependencies
  console.log("\n📦 Installing Node.js dependencies...");
  try {
    const { stdout, stderr } = await execPromise('npm install --production');
    console.log("✅ Node.js dependencies installed");
  } catch (error) {
    console.error("❌ Failed to install Node.js dependencies:", error.message);
  }

  // Step 3: Install Python dependencies
  console.log("\n🐍 Installing Python dependencies...");
  
  try {
    // Check if Python is installed and its version
    const { stdout } = await execPromise('python --version');
    console.log(`✅ ${stdout.trim()} detected`);
    
    // Install each Python package
    for (const pkg of requiredPythonPackages) {
      console.log(`   Installing ${pkg}...`);
      try {
        const { stdout, stderr } = await execPromise(`pip install ${pkg}`);
        console.log(`   ✅ ${pkg} installed`);
      } catch (error) {
        console.error(`   ❌ Failed to install ${pkg}:`, error.message);
      }
    }
    
    // Install spaCy models
    console.log("   Installing spaCy English model...");
    try {
      const { stdout, stderr } = await execPromise('python -m spacy download en_core_web_md');
      console.log("   ✅ spaCy English model installed");
    } catch (error) {
      console.error("   ❌ Failed to install spaCy model:", error.message);
    }
    
    // Download NLTK data
    console.log("   Downloading NLTK data...");
    try {
      const nltk_cmd = `python -c "import nltk; nltk.download('punkt'); nltk.download('wordnet'); nltk.download('stopwords');"`;
      const { stdout, stderr } = await execPromise(nltk_cmd);
      console.log("   ✅ NLTK data downloaded");
    } catch (error) {
      console.error("   ❌ Failed to download NLTK data:", error.message);
    }
    
  } catch (error) {
    console.error("❌ Python not found or error checking version:", error.message);
    console.log("ℹ️ Please install Python 3.8+ to use all features of the platform");
  }

  // Step 4: Verify MongoDB is installed
  console.log("\n🗄️ Checking database requirements...");
  
  try {
    const { stdout, stderr } = await execPromise('mongod --version');
    console.log(`✅ MongoDB detected: ${stdout.split('\n')[0]}`);
  } catch (error) {
    console.error("❌ MongoDB not found:", error.message);
    console.log("ℹ️ Please install MongoDB to use all features of the platform");
    console.log("   Instructions: https://docs.mongodb.com/manual/installation/");
  }
  
  // Step 5: Verify Redis is installed
  try {
    const { stdout, stderr } = await execPromise('redis-cli --version');
    console.log(`✅ Redis detected: ${stdout.trim()}`);
  } catch (error) {
    console.error("❌ Redis not found:", error.message);
    console.log("ℹ️ Please install Redis to use all features of the platform");
    console.log("   Instructions: https://redis.io/download");
  }

  // Step 6: Check .env file is properly configured
  console.log("\n🔐 Checking environment configuration...");
  
  if (fs.existsSync('.env')) {
    console.log("✅ .env file exists");
    
    // Check for required environment variables
    const requiredEnvVars = [
      "JWT_SECRET", "PREMIUM_API_KEY", "WEBHOOK_SECRET", 
      "MONGO_URI", "MONGO_DB_NAME", "REDIS_URL",
      "SPORTS_API_ENDPOINT", "ODDS_API_ENDPOINT"
    ];
    
    let missingVars = [];
    for (const varName of requiredEnvVars) {
      if (!process.env[varName]) {
        missingVars.push(varName);
      }
    }
    
    if (missingVars.length > 0) {
      console.log(`⚠️ Missing environment variables: ${missingVars.join(', ')}`);
      console.log("   Please update your .env file with these variables");
    } else {
      console.log("✅ All required environment variables are set");
    }
  } else {
    console.error("❌ .env file not found");
    console.log("ℹ️ Please create a .env file based on .env.example");
    
    // Copy example env if it exists
    if (fs.existsSync('.env.example')) {
      fs.copyFileSync('.env.example', '.env');
      console.log("✅ Created .env file from .env.example");
      console.log("   Please update the .env file with your configuration");
    }
  }

  // Step 7: Final suggestions
  console.log("\n🚀 Production Preparation Summary");
  console.log("--------------------------------");
  console.log("✅ Directory structure verified/created");
  console.log("✅ Dependencies installation attempted");
  console.log("✅ Configuration files checked");
  
  console.log("\n📋 Next Steps:");
  console.log("1. Run 'node scripts/verify_connections.js' to verify all connections");
  console.log("2. Make sure MongoDB and Redis servers are running");
  console.log("3. Update any missing environment variables in .env file");
  console.log("4. Run 'npm run build:prod' to build production assets");
  console.log("5. Start the server with 'npm run start:prod'");
  
  console.log("\n🔒 Security Reminders:");
  console.log("1. Replace placeholder API keys with actual keys");
  console.log("2. Set strong JWT_SECRET and API keys");
  console.log("3. Enable HTTPS in production");
  console.log("4. Configure proper access controls");
  
  console.log("\n✨ Good luck with your revolutionary sports analytics platform! ✨");
}

// Run the script
main().catch(console.error); 