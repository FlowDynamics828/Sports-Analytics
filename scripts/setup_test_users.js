/**
 * Test User Setup Script
 * 
 * Creates test user accounts with appropriate roles and permissions
 * for the sports analytics platform beta testing.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const crypto = require('crypto');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports_analytics';

// User Schema definition
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'], default: 'FAN_BASIC' },
  apiKey: { type: String, unique: true },
  tier: { type: String, enum: ['BASIC', 'PREMIUM', 'ULTRA_PREMIUM', 'ENTERPRISE'], default: 'BASIC' },
  preferences: {
    favoriteTeams: [String],
    favoriteLeagues: [String],
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    }
  },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  active: { type: Boolean, default: true },
  verified: { type: Boolean, default: false }
});

// API Key Schema definition
const apiKeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  permissions: [String],
  createdAt: { type: Date, default: Date.now },
  lastUsed: Date,
  rateLimit: { type: Number, default: 100 },
  active: { type: Boolean, default: true }
});

// Test User Definitions
const testUsers = [
  // Analyst Users
  {
    username: 'analyst1',
    email: 'analyst1@example.com',
    password: 'AnalystTest123!',
    role: 'ANALYST',
    tier: 'ENTERPRISE',
    preferences: {
      favoriteLeagues: ['NBA', 'NFL', 'MLB'],
      favoriteTeams: ['Lakers', 'Chiefs', 'Yankees']
    }
  },
  {
    username: 'analyst2',
    email: 'analyst2@example.com',
    password: 'AnalystTest123!',
    role: 'ANALYST',
    tier: 'ENTERPRISE',
    preferences: {
      favoriteLeagues: ['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA'],
      favoriteTeams: ['Manchester City', 'Barcelona', 'Bayern Munich']
    }
  },
  
  // Coach Users
  {
    username: 'coach1',
    email: 'coach1@example.com',
    password: 'CoachTest123!',
    role: 'COACH',
    tier: 'ULTRA_PREMIUM',
    preferences: {
      favoriteLeagues: ['NBA'],
      favoriteTeams: ['Celtics']
    }
  },
  {
    username: 'coach2',
    email: 'coach2@example.com',
    password: 'CoachTest123!',
    role: 'COACH',
    tier: 'ULTRA_PREMIUM',
    preferences: {
      favoriteLeagues: ['NFL'],
      favoriteTeams: ['Eagles']
    }
  },
  
  // Professional Gambler Users
  {
    username: 'gambler1',
    email: 'gambler1@example.com',
    password: 'GamblerTest123!',
    role: 'FAN_PREMIUM',
    tier: 'PREMIUM',
    preferences: {
      favoriteLeagues: ['NBA', 'NFL', 'MLB', 'NHL'],
      favoriteTeams: []
    }
  },
  {
    username: 'gambler2',
    email: 'gambler2@example.com',
    password: 'GamblerTest123!',
    role: 'FAN_PREMIUM',
    tier: 'PREMIUM',
    preferences: {
      favoriteLeagues: ['PREMIER_LEAGUE', 'LA_LIGA', 'SERIE_A', 'BUNDESLIGA'],
      favoriteTeams: []
    }
  },
  
  // Casual Fan Users
  {
    username: 'fan1',
    email: 'fan1@example.com',
    password: 'FanTest123!',
    role: 'FAN_BASIC',
    tier: 'BASIC',
    preferences: {
      favoriteLeagues: ['NBA'],
      favoriteTeams: ['Warriors']
    }
  },
  {
    username: 'fan2',
    email: 'fan2@example.com',
    password: 'FanTest123!',
    role: 'FAN_BASIC',
    tier: 'BASIC',
    preferences: {
      favoriteLeagues: ['NFL'],
      favoriteTeams: ['Cowboys']
    }
  },
  
  // Developer Users
  {
    username: 'developer1',
    email: 'developer1@example.com',
    password: 'DevTest123!',
    role: 'ADMIN',
    tier: 'ENTERPRISE',
    preferences: {
      favoriteLeagues: [],
      favoriteTeams: []
    }
  },
  {
    username: 'developer2',
    email: 'developer2@example.com',
    password: 'DevTest123!',
    role: 'ADMIN',
    tier: 'ENTERPRISE',
    preferences: {
      favoriteLeagues: [],
      favoriteTeams: []
    }
  }
];

// Generate API Key function
function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

// Main function to create test users
async function createTestUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB successfully!');
    
    // Register User Model
    const User = mongoose.model('User', userSchema);
    const ApiKey = mongoose.model('ApiKey', apiKeySchema);
    
    // Drop existing collections if in testing environment
    if (process.env.NODE_ENV === 'test' || process.env.TESTING_MODE === 'true') {
      console.log('Test environment detected. Dropping existing user and API key collections...');
      await User.collection.drop().catch(err => {
        if (err.codeName === 'NamespaceNotFound') {
          console.log('Users collection does not exist, skipping drop');
        } else {
          throw err;
        }
      });
      
      await ApiKey.collection.drop().catch(err => {
        if (err.codeName === 'NamespaceNotFound') {
          console.log('API Keys collection does not exist, skipping drop');
        } else {
          throw err;
        }
      });
    }
    
    console.log('Creating test users...');
    
    // Store user credentials for output file
    const userCredentials = [];
    const apiKeys = [];
    
    // Create each test user
    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      
      if (existingUser) {
        console.log(`User ${userData.email} already exists, skipping...`);
        userCredentials.push({
          username: existingUser.username,
          email: existingUser.email,
          password: '**********', // Don't output existing password
          role: existingUser.role,
          tier: existingUser.tier
        });
        continue;
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      // Generate API key
      const apiKey = generateApiKey();
      
      // Create and save user
      const user = new User({
        ...userData,
        password: hashedPassword,
        apiKey,
        verified: true // Test users are pre-verified
      });
      
      await user.save();
      
      // Create API key document
      const apiKeyDoc = new ApiKey({
        userId: user._id,
        key: apiKey,
        name: `Test API Key for ${userData.username}`,
        permissions: ['read', 'predict'],
        rateLimit: user.role === 'ADMIN' ? 1000 : (user.role === 'ANALYST' || user.role === 'COACH' ? 500 : 100),
        active: true
      });
      
      await apiKeyDoc.save();
      
      // Add to credentials list
      userCredentials.push({
        username: userData.username,
        email: userData.email,
        password: userData.password, // Include plaintext password for test users
        role: userData.role,
        tier: userData.tier
      });
      
      apiKeys.push({
        username: userData.username,
        apiKey: apiKey
      });
      
      console.log(`Created user: ${userData.username} (${userData.role})`);
    }
    
    // Write credentials to file
    const outputDir = path.join(__dirname, '../test_results');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write credentials to JSON file
    const credentialsFile = path.join(outputDir, 'test_user_credentials.json');
    await writeFileAsync(credentialsFile, JSON.stringify({
      users: userCredentials,
      apiKeys: apiKeys,
      generated: new Date().toISOString()
    }, null, 2));
    
    console.log(`Test users created successfully!`);
    console.log(`User credentials saved to: ${credentialsFile}`);
    
    // Create a user guide markdown file
    const userGuideFile = path.join(outputDir, 'TEST_USER_GUIDE.md');
    
    const userGuideContent = `# Test User Guide

## Available Test Users

### Analyst Users
| Username | Email | Password | Role | Tier |
|----------|-------|----------|------|------|
${userCredentials.filter(u => u.role === 'ANALYST').map(u => `| ${u.username} | ${u.email} | ${u.password} | ${u.role} | ${u.tier} |`).join('\n')}

### Coach Users
| Username | Email | Password | Role | Tier |
|----------|-------|----------|------|------|
${userCredentials.filter(u => u.role === 'COACH').map(u => `| ${u.username} | ${u.email} | ${u.password} | ${u.role} | ${u.tier} |`).join('\n')}

### Premium Fan Users (Professional Gamblers)
| Username | Email | Password | Role | Tier |
|----------|-------|----------|------|------|
${userCredentials.filter(u => u.role === 'FAN_PREMIUM').map(u => `| ${u.username} | ${u.email} | ${u.password} | ${u.role} | ${u.tier} |`).join('\n')}

### Basic Fan Users
| Username | Email | Password | Role | Tier |
|----------|-------|----------|------|------|
${userCredentials.filter(u => u.role === 'FAN_BASIC').map(u => `| ${u.username} | ${u.email} | ${u.password} | ${u.role} | ${u.tier} |`).join('\n')}

### Developer Users
| Username | Email | Password | Role | Tier |
|----------|-------|----------|------|------|
${userCredentials.filter(u => u.role === 'ADMIN').map(u => `| ${u.username} | ${u.email} | ${u.password} | ${u.role} | ${u.tier} |`).join('\n')}

## API Keys

| Username | API Key |
|----------|---------|
${apiKeys.map(k => `| ${k.username} | ${k.apiKey} |`).join('\n')}

## Feature Access by Role

### ADMIN
- Full access to all features
- System configuration
- User management
- Analytics dashboard
- All prediction features

### ANALYST
- Advanced analytics
- Custom prediction models
- Historical data analysis
- API access with high rate limits
- Explainable AI features

### COACH
- Team-specific analytics
- Player performance predictions
- Game strategy insights
- Medium API rate limits

### FAN_PREMIUM (Professional Gamblers)
- Multi-factor correlations
- Advanced prediction features
- Real-time updates
- Medium API rate limits

### FAN_BASIC
- Basic predictions
- Limited historical data
- No API access

## Testing Instructions

1. Login with your assigned test user credentials
2. Follow the testing scenarios in the test plan
3. Document any issues or feedback
4. Try to break the system (in a constructive way)

## Important URLs

- Main Dashboard: http://localhost:3000/dashboard
- API Documentation: http://localhost:3000/api-docs
- GraphQL Playground: http://localhost:3000/graphql

## Support

If you encounter any issues during testing, please contact:
- Technical Support: support@sports-analytics.com
- Test Coordinator: testing@sports-analytics.com
`;

    await writeFileAsync(userGuideFile, userGuideContent);
    console.log(`Test user guide created at: ${userGuideFile}`);
    
  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the script if invoked directly
if (require.main === module) {
  createTestUsers()
    .then(() => {
      console.log('Test user setup completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error in test user setup:', err);
      process.exit(1);
    });
}

module.exports = { createTestUsers }; 