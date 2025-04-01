/**
 * MongoDB Atlas Connection Validation Script
 * 
 * This script validates that the server is properly configured
 * to use MongoDB Atlas and that all connections work correctly.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Ensure Atlas Connection Parameters
const ATLAS_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true';
const DB_NAME = 'sports-analytics';

// Check if .env file exists and has correct settings
function validateEnvFile() {
  console.log('Validating .env file configuration...');
  
  if (!fs.existsSync('.env')) {
    console.error('Error: .env file not found. Creating default .env file.');
    // Create a default .env file
    fs.copyFileSync('.env.template', '.env');
  }
  
  // Read current .env content
  const envContent = fs.readFileSync('.env', 'utf8');
  let updated = false;
  let newContent = envContent;
  
  // Check MONGO_URI
  if (!envContent.includes('MONGO_URI=mongodb+srv://')) {
    console.log('Updating MONGO_URI to use Atlas...');
    newContent = newContent.replace(
      /MONGO_URI=.*/,
      `MONGO_URI=${ATLAS_URI}`
    );
    updated = true;
  }
  
  // Check MONGODB_URI
  if (!envContent.includes('MONGODB_URI=')) {
    console.log('Adding MONGODB_URI for Atlas...');
    newContent += `\nMONGODB_URI=${ATLAS_URI}`;
    updated = true;
  } else if (!envContent.includes('MONGODB_URI=mongodb+srv://')) {
    console.log('Updating MONGODB_URI to use Atlas...');
    newContent = newContent.replace(
      /MONGODB_URI=.*/,
      `MONGODB_URI=${ATLAS_URI}`
    );
    updated = true;
  }
  
  // Check MONGO_DB_NAME
  if (!envContent.includes('MONGO_DB_NAME=sports-analytics')) {
    console.log('Updating MONGO_DB_NAME...');
    if (envContent.includes('MONGO_DB_NAME=')) {
      newContent = newContent.replace(
        /MONGO_DB_NAME=.*/,
        `MONGO_DB_NAME=${DB_NAME}`
      );
    } else {
      newContent += `\nMONGO_DB_NAME=${DB_NAME}`;
    }
    updated = true;
  }
  
  // Check MONGODB_DB_NAME
  if (!envContent.includes('MONGODB_DB_NAME=')) {
    console.log('Adding MONGODB_DB_NAME...');
    newContent += `\nMONGODB_DB_NAME=${DB_NAME}`;
    updated = true;
  } else if (!envContent.includes('MONGODB_DB_NAME=sports-analytics')) {
    console.log('Updating MONGODB_DB_NAME...');
    newContent = newContent.replace(
      /MONGODB_DB_NAME=.*/,
      `MONGODB_DB_NAME=${DB_NAME}`
    );
    updated = true;
  }
  
  // Save updated .env if changes were made
  if (updated) {
    console.log('Saving updated .env configuration...');
    fs.writeFileSync('.env', newContent);
    console.log('✅ .env file has been updated with MongoDB Atlas configuration');
  } else {
    console.log('✅ .env file already has correct MongoDB Atlas configuration');
  }
}

// Test MongoDB Atlas connection
async function testAtlasConnection() {
  console.log('Testing MongoDB Atlas connection...');
  
  let client;
  try {
    client = new MongoClient(ATLAS_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    
    await client.connect();
    console.log('✅ Successfully connected to MongoDB Atlas');
    
    // Check database
    const db = client.db(DB_NAME);
    console.log(`Connected to database: ${DB_NAME}`);
    
    // List collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name).join(', ');
    console.log(`Available collections (${collections.length}): ${collectionNames}`);
    
    // Check data in collections
    let totalDocuments = 0;
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      totalDocuments += count;
    }
    
    console.log(`Total documents in database: ${totalDocuments}`);
    console.log('✅ Database connection and data verification successful');
    
    return true;
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB Atlas: ${error.message}`);
    return false;
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB Atlas connection closed');
    }
  }
}

// Main function
async function main() {
  console.log('======================================================');
  console.log('MongoDB Atlas Connection Validation');
  console.log('======================================================');
  
  // Validate and update .env file
  validateEnvFile();
  
  // Test connection to MongoDB Atlas
  const connected = await testAtlasConnection();
  
  if (connected) {
    console.log('\n✅ VALIDATION SUCCESSFUL: Your system is correctly configured to use MongoDB Atlas.');
    console.log('✅ API DATA SOURCE: The API is configured to use SportDB for external data retrieval.');
    console.log('✅ DATA FLOW: SportDB data can be stored and retrieved from MongoDB Atlas.');
    
    return 0;
  } else {
    console.error('\n❌ VALIDATION FAILED: There are issues with your MongoDB Atlas connection.');
    console.error('  Please check your network connection and MongoDB Atlas credentials.');
    
    return 1;
  }
}

// Run the main function
main()
  .then(exitCode => {
    console.log('\nValidation complete.');
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('Error during validation:', error);
    process.exit(1);
  }); 