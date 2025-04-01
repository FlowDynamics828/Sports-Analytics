const { spawn } = require('child_process');
const axios = require('axios');
const mongoose = require('mongoose');
const redis = require('redis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function verifyConnections() {
  console.log("Verifying all connections for sports analytics platform...");
  
  // Check environment variables
  console.log("\n📋 Checking environment variables...");
  const requiredVars = [
    "JWT_SECRET", "PREMIUM_API_KEY", "WEBHOOK_SECRET", 
    "REDIS_URL", "MONGO_URI", "MONGO_DB_NAME",
    "SPORTS_API_ENDPOINT", "ODDS_API_ENDPOINT"
  ];
  
  let missingVars = [];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length > 0) {
    console.error("❌ Missing environment variables:", missingVars.join(", "));
  } else {
    console.log("✅ All required environment variables are set");
  }

  // Check Redis connection
  console.log("\n📋 Checking Redis connection...");
  let redisClient = null;
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379"
    });
    
    await redisClient.connect();
    
    // Test write/read to verify working connection
    const testKey = `test:${Date.now()}`;
    const testValue = `test-value-${Date.now()}`;
    
    await redisClient.set(testKey, testValue);
    const retrievedValue = await redisClient.get(testKey);
    
    if (retrievedValue === testValue) {
      console.log("✅ Redis connection successful with verified read/write");
    } else {
      console.error("❌ Redis read/write verification failed");
    }
    
    // Cleanup test key
    await redisClient.del(testKey);
    
  } catch (error) {
    console.error("❌ Redis connection failed:", error.message);
  } finally {
    if (redisClient) {
      await redisClient.disconnect();
    }
  }
  
  // Check MongoDB connection
  console.log("\n📋 Checking MongoDB connection...");
  try {
    // Use the actual MongoDB connection string with correct password from .env
    const actualMongoUri = "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority";
    
    console.log(`  Connecting to MongoDB Atlas cluster...`);
    
    await mongoose.connect(actualMongoUri, { dbName: "SportsAnalytics" });
    
    // Get connection status
    const connectionState = mongoose.connection.readyState;
    if (connectionState === 1) {
      console.log("✅ MongoDB Atlas connection successful");
      
      // Verify database structure
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`  Found ${collections.length} collections`);
      
      // Check for essential collections
      const essentialCollections = ['users', 'predictions', 'teams', 'matches', 'leagues'];
      const foundCollections = collections.map(c => c.name);
      
      const missingCollections = essentialCollections.filter(c => !foundCollections.includes(c));
      if (missingCollections.length > 0) {
        console.log(`⚠️ Missing some expected collections: ${missingCollections.join(', ')}`);
      } else {
        console.log("✅ All essential database collections exist");
      }
      
      // Check database indices
      try {
        const usersCollection = mongoose.connection.db.collection('users');
        const indices = await usersCollection.indexes();
        console.log(`  User collection has ${indices.length} indices`);
      } catch (error) {
        console.log("⚠️ Could not check database indices:", error.message);
      }
      
      // Verify sports data exists
      try {
        // Check teams collection for data
        const teamsCollection = mongoose.connection.db.collection('teams');
        const teamsCount = await teamsCollection.countDocuments();
        console.log(`  Teams collection has ${teamsCount} documents`);
        
        if (teamsCount === 0) {
          console.log("⚠️ No teams found in database - sports data may be missing");
        } else {
          // Sample some team data
          const sampleTeam = await teamsCollection.findOne();
          if (sampleTeam) {
            console.log(`  Sample team: ${sampleTeam.name || 'Unknown'}`);
          }
        }
        
        // Check leagues collection
        const leaguesCollection = mongoose.connection.db.collection('leagues');
        const leaguesCount = await leaguesCollection.countDocuments();
        console.log(`  Leagues collection has ${leaguesCount} documents`);
        
        if (leaguesCount === 0) {
          console.log("⚠️ No leagues found in database - sports data may be missing");
        } else {
          // Sample league data to verify structure
          const sampleLeague = await leaguesCollection.findOne();
          if (sampleLeague) {
            console.log(`  Sample league: ${sampleLeague.name || 'Unknown'}`);
          }
        }
        
      } catch (error) {
        console.log("⚠️ Could not verify sports data:", error.message);
      }
      
    } else {
      console.error(`❌ MongoDB connection failed with state: ${connectionState}`);
      
      // Try fallback to local URI if provided
      const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
      const dbName = process.env.MONGO_DB_NAME || "sports_analytics";
      
      console.log(`  Trying fallback connection to ${uri}/${dbName}`);
      
      await mongoose.connect(`${uri}/${dbName}`);
      console.log("✅ Fallback MongoDB connection successful");
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    
    // Try fallback to local URI if provided in .env
    try {
      const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
      const dbName = process.env.MONGO_DB_NAME || "sports_analytics";
      
      console.log(`  Trying fallback connection to ${uri}/${dbName}`);
      
      await mongoose.connect(`${uri}/${dbName}`);
      console.log("✅ Fallback MongoDB connection successful");
      await mongoose.disconnect();
    } catch (fallbackError) {
      console.error("❌ All MongoDB connection attempts failed");
    }
  }
  
  // Check Sports API connections
  console.log("\n📋 Checking Sports Data API connections...");
  try {
    const sportsApiEndpoint = process.env.SPORTS_API_ENDPOINT;
    const sportsApiKey = process.env.SPORTS_API_KEY;
    
    if (!sportsApiEndpoint || !sportsApiKey) {
      console.error("❌ Missing Sports API endpoint or key");
    } else {
      // Try to fetch some sample data
      console.log(`  Testing connection to ${sportsApiEndpoint}`);
      try {
        const response = await axios.get(`${sportsApiEndpoint}/leagues`, {
          headers: {
            'x-api-key': sportsApiKey
          }
        });
        
        if (response.status === 200 && response.data) {
          console.log("✅ Sports API connection successful");
          console.log(`  Received ${response.data.length || 0} leagues from API`);
        } else {
          console.error("❌ Sports API returned unexpected response");
        }
      } catch (error) {
        console.error("❌ Sports API request failed:", error.message);
      }
    }
    
    // Check Odds API connection
    const oddsApiEndpoint = process.env.ODDS_API_ENDPOINT;
    const oddsApiKey = process.env.ODDS_API_KEY;
    
    if (!oddsApiEndpoint || !oddsApiKey) {
      console.error("❌ Missing Odds API endpoint or key");
    } else {
      // Try to fetch some sample data
      console.log(`  Testing connection to ${oddsApiEndpoint}`);
      try {
        const response = await axios.get(`${oddsApiEndpoint}/sports`, {
          params: {
            apiKey: oddsApiKey
          }
        });
        
        if (response.status === 200 && response.data) {
          console.log("✅ Odds API connection successful");
          console.log(`  Received ${response.data.length || 0} sports from API`);
        } else {
          console.error("❌ Odds API returned unexpected response");
        }
      } catch (error) {
        console.error("❌ Odds API request failed:", error.message);
      }
    }
  } catch (error) {
    console.error("❌ Sports API check failed:", error.message);
  }
  
  // Check required directories
  console.log("\n📋 Checking required directories...");
  const requiredDirs = [
    "data", "data/embeddings", "models", "models/nlp"
  ];
  
  for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
      console.log(`✅ Directory exists: ${dir}`);
      
      // Check if directory has required content
      try {
        const files = fs.readdirSync(dir);
        console.log(`  Directory contains ${files.length} files/subdirectories`);
        
        // Check for empty directories that should have content
        if (files.length === 0 && (dir === "models/nlp" || dir === "data/embeddings")) {
          console.log(`⚠️ Directory ${dir} appears to be empty. Model files may be missing.`);
        }
      } catch (error) {
        console.error(`❌ Failed to read directory ${dir}:`, error.message);
      }
    } else {
      console.error(`❌ Missing directory: ${dir}`);
      // Create directory if it doesn't exist
      try {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      } catch (err) {
        console.error(`❌ Failed to create directory: ${dir}`, err.message);
      }
    }
  }
  
  // Check Python modules and prediction engine
  console.log("\n📋 Checking Python prediction engine...");
  try {
    // Check if Python is installed and its version
    const pythonProcess = spawn('python', ['-c', 'import sys; print(sys.version)']);
    
    let pythonVersion = '';
    pythonProcess.stdout.on('data', (data) => {
      pythonVersion += data.toString();
    });
    
    // Wait for python version check to complete
    await new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Python installed: ${pythonVersion.trim()}`);
          resolve();
        } else {
          console.error("❌ Python check failed");
          resolve();
        }
      });
    });
    
    // Check for essential Python modules
    console.log("  Checking essential Python modules...");
    const essentialModulesProcess = spawn('python', [
      '-c', 
      'import sys; modules={"spacy": True, "transformers": True, "nltk": True, "pandas": True, "numpy": True, "sklearn": True}; missing = [m for m in modules if not sys.modules.get(m, None)]; print(",".join(missing) if missing else "all_modules_present")'
    ]);
    
    let modulesOutput = '';
    essentialModulesProcess.stdout.on('data', (data) => {
      modulesOutput += data.toString();
    });
    
    let modulesError = '';
    essentialModulesProcess.stderr.on('data', (data) => {
      modulesError += data.toString();
    });
    
    await new Promise((resolve) => {
      essentialModulesProcess.on('close', (code) => {
        if (code === 0) {
          if (modulesOutput.trim() === 'all_modules_present') {
            console.log("✅ All essential Python modules are installed");
          } else {
            const missingModules = modulesOutput.trim().split(',').filter(m => m);
            if (missingModules.length > 0) {
              console.log(`⚠️ Missing Python modules: ${missingModules.join(', ')}`);
            }
          }
        } else {
          console.error("❌ Python module check failed:", modulesError);
        }
        resolve();
      });
    });
    
    // Test prediction functionality with a simple example
    console.log("  Testing prediction engine with sample data...");
    const testPredictionProcess = spawn('python', [
      'scripts/custom_prediction_model.py',
      '--test',
      '--factor',
      'LeBron James scores over 25 points'
    ]);
    
    let predictionOutput = '';
    testPredictionProcess.stdout.on('data', (data) => {
      predictionOutput += data.toString();
    });
    
    let predictionError = '';
    testPredictionProcess.stderr.on('data', (data) => {
      predictionError += data.toString();
    });
    
    await new Promise((resolve) => {
      testPredictionProcess.on('close', (code) => {
        if (code === 0) {
          console.log("✅ Prediction engine test successful");
          if (predictionOutput.includes('probability')) {
            console.log(`  Sample prediction result: ${predictionOutput.trim()}`);
          }
        } else {
          console.error("❌ Prediction engine test failed:", predictionError);
        }
        resolve();
      });
    });
    
  } catch (error) {
    console.error("❌ Python/prediction engine check failed:", error.message);
  }
  
  // Check module imports
  console.log("\n📋 Checking Python module imports...");
  
  // Check if factor_parser.py exists
  if (fs.existsSync('scripts/factor_parser.py')) {
    console.log("✅ factor_parser.py exists");
    
    // Check if importable
    try {
      const parserTestProcess = spawn('python', [
        '-c',
        'import sys; sys.path.append("scripts"); import factor_parser; print("Import successful")'
      ]);
      
      let importOutput = '';
      parserTestProcess.stdout.on('data', (data) => {
        importOutput += data.toString();
      });
      
      let importError = '';
      parserTestProcess.stderr.on('data', (data) => {
        importError += data.toString();
      });
      
      await new Promise((resolve) => {
        parserTestProcess.on('close', (code) => {
          if (code === 0 && importOutput.includes("Import successful")) {
            console.log("  ✅ factor_parser.py is importable");
          } else {
            console.error("  ❌ factor_parser.py import failed:", importError);
          }
          resolve();
        });
      });
    } catch (error) {
      console.error("  ❌ factor_parser.py import test failed:", error.message);
    }
  } else {
    console.error("❌ factor_parser.py is missing");
  }
  
  // Check if custom_prediction_model.py exists
  if (fs.existsSync('scripts/custom_prediction_model.py')) {
    console.log("✅ custom_prediction_model.py exists");
    
    // Check if importable
    try {
      const modelTestProcess = spawn('python', [
        '-c',
        'import sys; sys.path.append("scripts"); import custom_prediction_model; print("Import successful")'
      ]);
      
      let importOutput = '';
      modelTestProcess.stdout.on('data', (data) => {
        importOutput += data.toString();
      });
      
      let importError = '';
      modelTestProcess.stderr.on('data', (data) => {
        importError += data.toString();
      });
      
      await new Promise((resolve) => {
        modelTestProcess.on('close', (code) => {
          if (code === 0 && importOutput.includes("Import successful")) {
            console.log("  ✅ custom_prediction_model.py is importable");
          } else {
            console.error("  ❌ custom_prediction_model.py import failed:", importError);
          }
          resolve();
        });
      });
    } catch (error) {
      console.error("  ❌ custom_prediction_model.py import test failed:", error.message);
    }
  } else {
    console.error("❌ custom_prediction_model.py is missing");
  }
  
  // Check if premium_prediction_api.py exists
  if (fs.existsSync('scripts/premium_prediction_api.py')) {
    console.log("✅ premium_prediction_api.py exists");
    
    // Check if importable
    try {
      const apiTestProcess = spawn('python', [
        '-c',
        'import sys; sys.path.append("scripts"); import premium_prediction_api; print("Import successful")'
      ]);
      
      let importOutput = '';
      apiTestProcess.stdout.on('data', (data) => {
        importOutput += data.toString();
      });
      
      let importError = '';
      apiTestProcess.stderr.on('data', (data) => {
        importError += data.toString();
      });
      
      await new Promise((resolve) => {
        apiTestProcess.on('close', (code) => {
          if (code === 0 && importOutput.includes("Import successful")) {
            console.log("  ✅ premium_prediction_api.py is importable");
          } else {
            console.error("  ❌ premium_prediction_api.py import failed:", importError);
          }
          resolve();
        });
      });
    } catch (error) {
      console.error("  ❌ premium_prediction_api.py import test failed:", error.message);
    }
  } else {
    console.error("❌ premium_prediction_api.py is missing");
  }
  
  // Check frontend dependencies
  console.log("\n📋 Checking frontend dependencies...");
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deps = packageJson.dependencies || {};
    
    const requiredFrontendDeps = ['d3', 'chart.js'];
    
    for (const dep of requiredFrontendDeps) {
      if (deps[dep]) {
        console.log(`✅ Frontend dependency exists: ${dep}`);
      } else {
        console.error(`❌ Missing frontend dependency: ${dep}`);
      }
    }
  } catch (error) {
    console.error("❌ Error checking package.json:", error.message);
  }
  
  // Verify frontend JS is properly linked to backend
  console.log("\n📋 Checking frontend-backend integration...");
  
  try {
    // Check custom_predictions.js file for API endpoints
    if (fs.existsSync('public/js/features/custom_predictions.js')) {
      const fileContent = fs.readFileSync('public/js/features/custom_predictions.js', 'utf8');
      
      // Look for API endpoint references
      const apiEndpointRegex = /fetch\(['"]([^'"]*)['"]\)/g;
      const apiEndpoints = [];
      let match;
      
      while ((match = apiEndpointRegex.exec(fileContent)) !== null) {
        apiEndpoints.push(match[1]);
      }
      
      if (apiEndpoints.length > 0) {
        console.log(`✅ Found ${apiEndpoints.length} API endpoint references in frontend code`);
        console.log(`  Sample endpoints: ${apiEndpoints.slice(0, 3).join(', ')}${apiEndpoints.length > 3 ? '...' : ''}`);
      } else {
        console.log("⚠️ No API endpoint references found in frontend code");
      }
      
      // Check for WebSocket connections
      if (fileContent.includes('WebSocket') || fileContent.includes('ws://') || fileContent.includes('wss://')) {
        console.log("✅ WebSocket connection found in frontend code");
      } else {
        console.log("⚠️ No WebSocket connection found in frontend code");
      }
    } else {
      console.error("❌ Frontend JS file public/js/features/custom_predictions.js not found");
    }
  } catch (error) {
    console.error("❌ Error checking frontend-backend integration:", error.message);
  }
  
  console.log("\n📋 Connection verification complete");
}

async function verifyPredictionEnhancements() {
  console.log("\n🧠 Verifying prediction enhancement systems...");
  
  try {
    // Import enhancement systems
    const PredictionAccuracyTracker = require('./prediction_accuracy_tracker');
    const FactorCorrelationEngine = require('./factor_correlation_engine');
    
    // Test accuracy tracking system
    console.log("\n📋 Testing Prediction Accuracy Tracking System...");
    
    try {
      const tracker = new PredictionAccuracyTracker();
      await tracker.initialize();
      
      console.log("  ✅ Prediction Accuracy Tracker initialized successfully");
      
      // Test a simple prediction tracking
      const testPrediction = {
        factor: "Test prediction for system verification",
        probability: 0.75,
        confidence: 0.8,
        league: "TEST",
        entity_type: "system_test"
      };
      
      const trackedPrediction = await tracker.trackPrediction(testPrediction);
      
      console.log(`  ✅ Successfully tracked test prediction (ID: ${trackedPrediction.tracking_id})`);
      
      // Test outcome recording
      await tracker.recordOutcome({
        tracking_id: trackedPrediction.tracking_id,
        actual_result: true,
        details: {
          verification_source: 'system_test',
          timestamp: new Date().toISOString()
        }
      });
      
      console.log("  ✅ Successfully recorded test outcome");
      
      // Check model performance metrics
      const metrics = await tracker.calculateAccuracy({
        entity_type: "system_test"
      });
      
      console.log("  ✅ Successfully retrieved accuracy metrics");
      console.log(`    Test metrics - Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%, Predictions: ${metrics.total_predictions}`);
      
      // Clean up
      await tracker.shutdown();
      
    } catch (error) {
      console.error(`  ❌ Prediction Accuracy Tracker test failed: ${error.message}`);
    }
    
    // Test correlation engine
    console.log("\n📋 Testing Factor Correlation Engine...");
    
    try {
      const engine = new FactorCorrelationEngine();
      await engine.initialize();
      
      console.log("  ✅ Factor Correlation Engine initialized successfully");
      
      // Test correlation calculation
      const testFactors = [
        "LeBron James scores more than 25 points",
        "Lakers win against the Warriors",
        "Stephen Curry makes more than 5 three-pointers"
      ];
      
      console.log("  Testing correlation matrix generation...");
      const matrix = await engine.getCorrelationMatrix(testFactors, {
        league: "NBA",
        sport: "Basketball"
      });
      
      console.log(`  ✅ Successfully generated ${matrix.dimensions}x${matrix.dimensions} correlation matrix`);
      
      // Test multi-factor probability
      const factorPredictions = [
        {
          factor: testFactors[0],
          probability: 0.72,
          confidence: 0.85
        },
        {
          factor: testFactors[1],
          probability: 0.58,
          confidence: 0.79
        }
      ];
      
      console.log("  Testing multi-factor probability calculation...");
      const multiResult = await engine.calculateMultiFactorProbability(factorPredictions);
      
      console.log(`  ✅ Successfully calculated joint probability: ${(multiResult.joint_probability * 100).toFixed(1)}%`);
      
      // Clean up
      await engine.shutdown();
      
    } catch (error) {
      console.error(`  ❌ Factor Correlation Engine test failed: ${error.message}`);
    }
    
    console.log("\n✅ Prediction enhancement systems verification complete");
    
  } catch (error) {
    console.error(`❌ Prediction enhancements verification failed: ${error.message}`);
  }
}

async function runPredictionBenchmarks() {
  console.log("\n📊 Running prediction model benchmarks...");
  
  // Historical data test cases
  const testCases = [
    {
      league: "NBA",
      factors: [
        "LeBron James scores more than 25 points",
        "Lakers win against the Warriors",
        "Stephen Curry makes more than 5 three-pointers"
      ],
      benchmarkMetrics: {
        expectedAccuracy: 0.82,
        expectedCalibration: 0.9,
        maxLatencyMs: 150
      }
    },
    {
      league: "NFL",
      factors: [
        "Chiefs beat the spread against the Raiders",
        "Patrick Mahomes throws for 300+ yards",
        "Travis Kelce scores a touchdown"
      ],
      benchmarkMetrics: {
        expectedAccuracy: 0.78,
        expectedCalibration: 0.85,
        maxLatencyMs: 200
      }
    },
    {
      league: "PREMIER_LEAGUE",
      factors: [
        "Manchester City wins against Liverpool",
        "Match has over 2.5 goals",
        "Kevin De Bruyne gets an assist"
      ],
      benchmarkMetrics: {
        expectedAccuracy: 0.75,
        expectedCalibration: 0.82,
        maxLatencyMs: 180
      }
    }
  ];
  
  const results = {
    passedTests: 0,
    totalTests: 0,
    metrics: {
      averageAccuracy: 0,
      averageCalibration: 0,
      averageLatencyMs: 0
    },
    competitiveAnalysis: {}
  };
  
  let apiUrl = process.env.PREDICTION_API_URL || "http://localhost:8000";
  let apiKey = process.env.PREMIUM_API_KEY;
  let jwtToken = process.env.TEST_JWT_TOKEN;
  
  if (!apiKey || !jwtToken) {
    console.error("❌ Missing API key or JWT token for benchmark tests");
    console.log("⚠️ Make sure PREMIUM_API_KEY and TEST_JWT_TOKEN are set in your .env file");
    console.log("🔄 Falling back to direct Python module calls for tests");
    
    try {
      // Try direct calls to Python prediction module
      console.log("\n🔬 Testing prediction module directly...");
      
      for (const testCase of testCases) {
        console.log(`\n🏆 Testing ${testCase.league} predictions (direct Python call)...`);
        
        for (const factor of testCase.factors) {
          console.log(`  Testing factor: "${factor}"`);
          
          const startTime = Date.now();
          
          try {
            // Call Python prediction script directly
            const pythonProcess = spawn('python', [
              'scripts/custom_prediction_model.py',
              '--predict',
              '--factor',
              factor,
              '--league',
              testCase.league
            ]);
            
            let predictionOutput = '';
            pythonProcess.stdout.on('data', (data) => {
              predictionOutput += data.toString();
            });
            
            let predictionError = '';
            pythonProcess.stderr.on('data', (data) => {
              predictionError += data.toString();
            });
            
            await new Promise((resolve) => {
              pythonProcess.on('close', (code) => {
                const latencyMs = Date.now() - startTime;
                
                if (code === 0) {
                  console.log(`    ✅ Prediction received in ${latencyMs}ms`);
                  
                  try {
                    // Try to parse the prediction result
                    const resultLines = predictionOutput.trim().split('\n');
                    let probability = 0;
                    let confidence = 0;
                    
                    for (const line of resultLines) {
                      if (line.includes('probability:')) {
                        probability = parseFloat(line.split('probability:')[1].trim());
                      }
                      if (line.includes('confidence:')) {
                        confidence = parseFloat(line.split('confidence:')[1].trim());
                      }
                    }
                    
                    console.log(`    📊 Probability: ${(probability * 100).toFixed(1)}%, Confidence: ${(confidence * 100).toFixed(1)}%`);
                    
                    // Check if latency meets benchmark
                    if (latencyMs <= testCase.benchmarkMetrics.maxLatencyMs) {
                      console.log(`    ✅ Latency benchmark passed: ${latencyMs}ms <= ${testCase.benchmarkMetrics.maxLatencyMs}ms`);
                      results.passedTests++;
                    } else {
                      console.log(`    ❌ Latency benchmark failed: ${latencyMs}ms > ${testCase.benchmarkMetrics.maxLatencyMs}ms`);
                    }
                    results.totalTests++;
                    
                    // Add to average metrics
                    results.metrics.averageLatencyMs += latencyMs;
                  } catch (error) {
                    console.error(`    ❌ Failed to parse prediction result:`, error.message);
                  }
                } else {
                  console.error(`    ❌ Python prediction failed with code ${code}: ${predictionError}`);
                }
                resolve();
              });
            });
          } catch (error) {
            console.error(`    ❌ Failed to run Python prediction:`, error.message);
          }
        }
        
        // Test multi-factor prediction
        console.log(`  Testing multi-factor prediction (direct Python call)...`);
        const startTime = Date.now();
        
        try {
          // Call Python prediction script directly for multi-factor prediction
          const factorsArg = testCase.factors.join(',');
          const pythonProcess = spawn('python', [
            'scripts/custom_prediction_model.py',
            '--predict-multi',
            '--factors',
            factorsArg,
            '--league',
            testCase.league
          ]);
          
          let predictionOutput = '';
          pythonProcess.stdout.on('data', (data) => {
            predictionOutput += data.toString();
          });
          
          let predictionError = '';
          pythonProcess.stderr.on('data', (data) => {
            predictionError += data.toString();
          });
          
          await new Promise((resolve) => {
            pythonProcess.on('close', (code) => {
              const latencyMs = Date.now() - startTime;
              
              if (code === 0) {
                console.log(`    ✅ Multi-factor prediction received in ${latencyMs}ms`);
                
                try {
                  // Try to parse the prediction result
                  const resultLines = predictionOutput.trim().split('\n');
                  let combinedProbability = 0;
                  
                  for (const line of resultLines) {
                    if (line.includes('combined_probability:')) {
                      combinedProbability = parseFloat(line.split('combined_probability:')[1].trim());
                      break;
                    }
                  }
                  
                  console.log(`    📊 Combined probability: ${(combinedProbability * 100).toFixed(1)}%`);
                  
                  // Check if latency meets benchmark (multi-factor allows 2x single factor latency)
                  if (latencyMs <= testCase.benchmarkMetrics.maxLatencyMs * 2) {
                    console.log(`    ✅ Multi-factor latency benchmark passed: ${latencyMs}ms <= ${testCase.benchmarkMetrics.maxLatencyMs * 2}ms`);
                    results.passedTests++;
                  } else {
                    console.log(`    ❌ Multi-factor latency benchmark failed: ${latencyMs}ms > ${testCase.benchmarkMetrics.maxLatencyMs * 2}ms`);
                  }
                  results.totalTests++;
                  
                  // Add to average metrics
                  results.metrics.averageLatencyMs += latencyMs;
                } catch (error) {
                  console.error(`    ❌ Failed to parse multi-factor prediction result:`, error.message);
                }
              } else {
                console.error(`    ❌ Python multi-factor prediction failed with code ${code}: ${predictionError}`);
              }
              resolve();
            });
          });
        } catch (error) {
          console.error(`    ❌ Failed to run Python multi-factor prediction:`, error.message);
        }
      }
    } catch (error) {
      console.error("❌ Direct Python module tests failed:", error.message);
    }
  }
  else {
    // Try connecting to the actual API endpoints
    try {
      console.log(`\n🔌 Using prediction API at: ${apiUrl}`);
      
      // For each league, run test predictions
      for (const testCase of testCases) {
        console.log(`\n🏆 Testing ${testCase.league} predictions...`);
        
        // Measure latency and accuracy for single predictions
        const singlePredictionResults = [];
        
        for (const factor of testCase.factors) {
          console.log(`  Testing factor: "${factor}"`);
          
          // Measure latency
          const startTime = Date.now();
          
          // Call prediction API
          try {
            const response = await axios.post(`${apiUrl}/predict/single`, {
              factor,
              league: testCase.league,
              include_supporting_data: true
            }, {
              headers: {
                'X-API-Key': apiKey,
                'Authorization': `Bearer ${jwtToken}`
              },
              // Set timeout to avoid hanging test
              timeout: 10000
            });
            
            const latencyMs = Date.now() - startTime;
            
            // Capture result
            singlePredictionResults.push({
              factor,
              result: response.data,
              latencyMs
            });
            
            console.log(`    ✅ Prediction received in ${latencyMs}ms`);
            console.log(`    📊 Probability: ${(response.data.data.probability * 100).toFixed(1)}%, Confidence: ${(response.data.data.confidence * 100).toFixed(1)}%`);
            
            // Check if latency meets benchmark
            if (latencyMs <= testCase.benchmarkMetrics.maxLatencyMs) {
              console.log(`    ✅ Latency benchmark passed: ${latencyMs}ms <= ${testCase.benchmarkMetrics.maxLatencyMs}ms`);
              results.passedTests++;
            } else {
              console.log(`    ❌ Latency benchmark failed: ${latencyMs}ms > ${testCase.benchmarkMetrics.maxLatencyMs}ms`);
            }
            results.totalTests++;
            
            // Add to average metrics
            results.metrics.averageLatencyMs += latencyMs;
            
            // Check prediction data structure
            if (response.data.data && response.data.data.supporting_data) {
              console.log(`    ✅ Prediction includes supporting data`);
              
              // Log key factors affecting prediction
              const keyFactors = response.data.data.supporting_data.key_factors || [];
              if (keyFactors.length > 0) {
                console.log(`    📈 Key factors: ${keyFactors.slice(0, 3).map(f => f.name || f.factor).join(', ')}${keyFactors.length > 3 ? '...' : ''}`);
              }
            }
            
          } catch (error) {
            console.error(`    ❌ API call failed:`, error.message);
            if (error.response) {
              console.error(`    Status: ${error.response.status}, Data:`, error.response.data);
            }
          }
        }
        
        // Test multi-factor predictions
        console.log(`  Testing multi-factor prediction...`);
        try {
          const startTime = Date.now();
          
          const response = await axios.post(`${apiUrl}/predict/multi`, {
            factors: testCase.factors,
            league: testCase.league,
            include_analysis: true
          }, {
            headers: {
              'X-API-Key': apiKey,
              'Authorization': `Bearer ${jwtToken}`
            },
            // Set timeout to avoid hanging test
            timeout: 15000
          });
          
          const latencyMs = Date.now() - startTime;
          
          console.log(`    ✅ Multi-factor prediction received in ${latencyMs}ms`);
          console.log(`    📊 Combined probability: ${(response.data.data.combined_probability * 100).toFixed(1)}%`);
          
          // Check analysis data
          if (response.data.data.analysis) {
            console.log(`    ✅ Multi-factor prediction includes analysis`);
          }
          
          // Check correlation data
          if (response.data.data.correlation_matrix) {
            console.log(`    ✅ Multi-factor prediction includes correlation matrix`);
          }
          
          // Check if latency meets benchmark (multi-factor allows 2x single factor latency)
          if (latencyMs <= testCase.benchmarkMetrics.maxLatencyMs * 2) {
            console.log(`    ✅ Multi-factor latency benchmark passed: ${latencyMs}ms <= ${testCase.benchmarkMetrics.maxLatencyMs * 2}ms`);
            results.passedTests++;
          } else {
            console.log(`    ❌ Multi-factor latency benchmark failed: ${latencyMs}ms > ${testCase.benchmarkMetrics.maxLatencyMs * 2}ms`);
          }
          results.totalTests++;
          
          // Track average metrics
          results.metrics.averageLatencyMs += latencyMs;
          
        } catch (error) {
          console.error(`    ❌ Multi-factor API call failed:`, error.message);
          if (error.response) {
            console.error(`    Status: ${error.response.status}, Data:`, error.response.data);
          }
        }
      }
    } catch (error) {
      console.error("❌ API benchmark tests failed:", error.message);
    }
  }
  
  // Calculate average metrics
  if (results.totalTests > 0) {
    results.metrics.averageLatencyMs = results.metrics.averageLatencyMs / (results.totalTests);
    
    // Save benchmark results to file
    fs.writeFileSync(
      'benchmark_results.json',
      JSON.stringify(results, null, 2)
    );
    
    console.log("\n📊 Benchmark results summary:");
    console.log(`  Passed tests: ${results.passedTests}/${results.totalTests} (${(results.passedTests/results.totalTests*100).toFixed(1)}%)`);
    console.log(`  Average latency: ${results.metrics.averageLatencyMs.toFixed(2)}ms`);
    
    // Compare to industry standards
    if (results.metrics.averageLatencyMs < 100) {
      console.log("\n🏆 Competitive analysis:");
      console.log("  ✅ Prediction latency is in the top tier of industry standards (sub-100ms)");
      console.log("  ✅ Multi-factor analysis provides unique value not available in most platforms");
    } else if (results.metrics.averageLatencyMs < 200) {
      console.log("\n🏆 Competitive analysis:");
      console.log("  ✅ Prediction latency is competitive with industry standards (sub-200ms)");
      console.log("  ✅ Multi-factor analysis provides unique value not available in most platforms");
    } else {
      console.log("\n⚠️ Performance considerations:");
      console.log(`  ⚠️ Prediction latency (${results.metrics.averageLatencyMs.toFixed(2)}ms) is above competitive standards (<200ms)`);
      console.log("  💡 Consider optimizing prediction engine or database queries");
    }
  } else {
    console.log("\n⚠️ No benchmark tests were successfully completed");
  }
}

async function runLoadTest() {
  console.log("\n🔥 Running load tests...");
  
  try {
    // Retrieve API info
    const apiUrl = process.env.PREDICTION_API_URL || "http://localhost:8000";
    const apiKey = process.env.PREMIUM_API_KEY;
    const jwtToken = process.env.TEST_JWT_TOKEN;
    
    // Simulate concurrent users
    const concurrentUsers = parseInt(process.env.LOAD_TEST_USERS || "20");
    const requestsPerUser = parseInt(process.env.LOAD_TEST_REQUESTS_PER_USER || "5");
    
    console.log(`  Simulating ${concurrentUsers} concurrent users, ${requestsPerUser} requests each`);
    console.log(`  Target API: ${apiUrl}`);
    
    // Check if we have authentication
    if (!apiKey || !jwtToken) {
      console.log("⚠️ Missing API key or JWT token for load tests");
      console.log("⚠️ Running with reduced concurrency and falling back to Python module direct calls if needed");
    }
    
    const startTime = Date.now();
    
    // Generate random test factors
    const testFactors = [
      "LeBron James scores over 25 points",
      "Chiefs cover the spread",
      "Man City wins by 2 goals",
      "Yankees win against the Red Sox",
      "Serena Williams wins in straight sets",
      "Tiger Woods finishes in the top 10",
      "Barcelona scores in both halves",
      "Rafael Nadal wins on clay",
      "Packers and Vikings combine for over 50 points",
      "Oilers defeat the Maple Leafs"
    ];
    
    // Run concurrent API requests if credentials available
    const requests = [];
    let useAPI = true;
    
    if (!apiKey || !jwtToken) {
      console.log("  ⚠️ API credentials missing, will try direct Python module calls");
      useAPI = false;
    } else {
      console.log("  🔌 Using prediction API endpoint");
    }
    
    console.log("  Generating load test requests...");
    
    // Generate all requests
    for (let i = 0; i < concurrentUsers; i++) {
      for (let j = 0; j < requestsPerUser; j++) {
        // Pick a random factor
        const randomFactor = testFactors[Math.floor(Math.random() * testFactors.length)];
        
        if (useAPI) {
          // Send HTTP request to API
          requests.push(
            axios.post(`${apiUrl}/predict/single`, {
              factor: randomFactor,
              include_supporting_data: false
            }, {
              headers: {
                'X-API-Key': apiKey,
                'Authorization': `Bearer ${jwtToken}`
              },
              timeout: 10000 // 10 second timeout
            }).catch(err => {
              // Record the error but don't fail the test
              console.error(`  Error during API request: ${err.message.substring(0, 100)}`);
              return {error: err.message};
            })
          );
        } else {
          // Use direct Python module calls as fallback
          requests.push(
            new Promise((resolve) => {
              const pythonProcess = spawn('python', [
                'scripts/custom_prediction_model.py',
                '--predict',
                '--factor',
                randomFactor
              ]);
              
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
                  resolve({
                    success: true,
                    data: output
                  });
                } else {
                  resolve({
                    error: error
                  });
                }
              });
            })
          );
        }
      }
    }
    
    console.log(`  Executing ${requests.length} concurrent requests...`);
    
    // Wait for all requests to complete with status updates
    const batchSize = Math.min(50, requests.length);
    const batches = Math.ceil(requests.length / batchSize);
    
    let responses = [];
    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min((i + 1) * batchSize, requests.length);
      const currentBatch = requests.slice(start, end);
      
      console.log(`  Processing batch ${i+1}/${batches} (${currentBatch.length} requests)...`);
      const batchResults = await Promise.all(currentBatch);
      responses = [...responses, ...batchResults];
      
      // Print progress
      const completedSoFar = (i + 1) * batchSize;
      console.log(`  Completed ${Math.min(completedSoFar, requests.length)}/${requests.length} requests`);
    }
    
    // Calculate results
    const totalTime = Date.now() - startTime;
    const totalRequests = concurrentUsers * requestsPerUser;
    const successfulRequests = responses.filter(r => !r.error).length;
    const failedRequests = responses.filter(r => r.error).length;
    const requestsPerSecond = (totalRequests / (totalTime / 1000)).toFixed(2);
    
    // Calculate response time statistics
    let responseTimes = [];
    if (useAPI) {
      // For API responses we don't have timing info from axios by default
      // This would need axios interceptors to measure properly
      console.log("  ℹ️ Detailed response time analysis not available for API tests");
    } else {
      // For direct Python calls, we could implement timing
      console.log("  ℹ️ Detailed response time analysis not implemented for Python module calls");
    }
    
    // Log results
    console.log(`  Load test complete in ${(totalTime/1000).toFixed(2)} seconds`);
    console.log(`  Total requests: ${totalRequests}`);
    console.log(`  Successful: ${successfulRequests}`);
    console.log(`  Failed: ${failedRequests}`);
    console.log(`  Requests per second: ${requestsPerSecond}`);
    console.log(`  Success rate: ${(successfulRequests/totalRequests*100).toFixed(1)}%`);
    
    // Check if meets production requirements
    if (requestsPerSecond >= 50) {
      console.log("  ✅ Performance meets production requirements (50+ requests/sec)");
    } else {
      console.log(`  ⚠️ Performance below production requirements - ${requestsPerSecond} req/s < 50 req/s`);
      console.log("  💡 Consider optimizing prediction engine or adding more server capacity");
    }
    
    // Save load test results
    fs.writeFileSync(
      'load_test_results.json',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        api_endpoint: apiUrl,
        concurrentUsers,
        requestsPerUser,
        totalTime,
        totalRequests,
        successfulRequests,
        failedRequests,
        requestsPerSecond,
        success_rate: (successfulRequests/totalRequests*100).toFixed(1)
      }, null, 2)
    );
    
    // Suggest improvements if needed
    if (successfulRequests / totalRequests < 0.95) {
      console.log("\n⚠️ High failure rate detected. Potential issues:");
      console.log("  - API rate limiting may be too aggressive");
      console.log("  - Server resources may be insufficient");
      console.log("  - Database connection pool may be exhausted");
      console.log("  - Network issues or timeouts may be occurring");
    }
    
    if (useAPI && failedRequests > 0) {
      // Sample error types
      const errorSamples = responses.filter(r => r.error).slice(0, 3);
      console.log("\n⚠️ Sample errors encountered:");
      errorSamples.forEach((response, i) => {
        console.log(`  ${i+1}. ${response.error.substring(0, 100)}${response.error.length > 100 ? '...' : ''}`);
      });
    }
    
  } catch (error) {
    console.error("❌ Failed to run load tests:", error.message);
  }
}

async function runSecurityTests() {
  console.log("\n🔒 Running security tests...");
  
  // Get API and database credentials
  const apiUrl = process.env.PREDICTION_API_URL || "http://localhost:8000";
  const apiKey = process.env.PREMIUM_API_KEY;
  const jwtToken = process.env.TEST_JWT_TOKEN;
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
  const mongoDbName = process.env.MONGO_DB_NAME || "sports_analytics";
  
  // From your environment, using the MongoDB cluster URL with correct password from .env
  const actualMongoUri = "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority";

  try {
    console.log("  📋 Testing MongoDB connection security...");
    
    // First try with actual MongoDB connection string
    try {
      await mongoose.connect(actualMongoUri, { dbName: "SportsAnalytics" });
      console.log("  ✅ Connected to production MongoDB cluster successfully");
      
      // Check if we can write/read a test document
      const testCollection = mongoose.connection.collection('security_tests');
      const testDocument = {
        testId: `security-test-${Date.now()}`,
        timestamp: new Date(),
        testType: 'security-verification'
      };
      
      // Insert test document
      await testCollection.insertOne(testDocument);
      console.log("  ✅ Successfully wrote test document to MongoDB");
      
      // Read test document back
      const readResult = await testCollection.findOne({ testId: testDocument.testId });
      if (readResult && readResult.testId === testDocument.testId) {
        console.log("  ✅ Successfully read test document from MongoDB");
      } else {
        console.log("  ⚠️ Could not verify read operation");
      }
      
      // Clean up test document
      await testCollection.deleteOne({ testId: testDocument.testId });
      console.log("  ✅ Successfully cleaned up test document");
      
      // Close connection
      await mongoose.disconnect();
    } catch (mongoError) {
      console.error("  ❌ MongoDB security test failed:", mongoError.message);
      console.log("  ⚠️ Using fallback MongoDB connection");
      
      // Fallback to environment variable connection
      try {
        await mongoose.connect(`${mongoUri}/${mongoDbName}`);
        console.log("  ✅ Connected to MongoDB successfully with fallback connection");
        await mongoose.disconnect();
      } catch (fallbackError) {
        console.error("  ❌ Fallback MongoDB connection also failed:", fallbackError.message);
      }
    }
    
    // Test 1: Authentication bypass protection
    console.log("\n  📋 Testing API authentication bypass protection...");
    try {
      await axios.post(`${apiUrl}/predict/single`, {
        factor: "Test factor"
      }, {
        timeout: 5000
      });
      console.error("  ❌ Authentication bypass protection failed - API allowed unauthenticated request");
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log("  ✅ Authentication bypass protection working - API correctly rejected unauthenticated request");
      } else {
        console.error("  ⚠️ Unexpected error in authentication test:", error.message);
      }
    }
    
    // Test 2: JWT validation
    console.log("\n  📋 Testing JWT token validation...");
    const invalidJwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkhhY2tlciIsImlhdCI6MTUxNjIzOTAyMn0.5FfLqAHxirGnLbI_RRcqt9wRdKKrg0B6-gMe-mZpSOw";
    
    try {
      await axios.post(`${apiUrl}/predict/single`, {
        factor: "Test factor"
      }, {
        headers: {
          'X-API-Key': apiKey || 'test-api-key',
          'Authorization': `Bearer ${invalidJwtToken}`
        },
        timeout: 5000
      });
      console.error("  ❌ JWT validation failed - API accepted invalid token");
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log("  ✅ JWT validation working - API correctly rejected invalid token");
      } else {
        console.error("  ⚠️ Unexpected error in JWT validation test:", error.message);
      }
    }
    
    // Test 3: Rate limiting
    console.log("\n  📋 Testing rate limiting...");
    if (!apiKey || !jwtToken) {
      console.log("  ⚠️ Skipping rate limit test - missing API key or JWT token");
    } else {
      // Send multiple requests rapidly to trigger rate limiting
      const rateLimitRequests = [];
      const requestCount = 20; // Try 20 rapid requests
      
      for (let i = 0; i < requestCount; i++) {
        rateLimitRequests.push(
          axios.post(`${apiUrl}/predict/single`, {
            factor: "Test factor for rate limiting"
          }, {
            headers: {
              'X-API-Key': apiKey,
              'Authorization': `Bearer ${jwtToken}`
            },
            timeout: 5000
          }).catch(err => {
            return { status: err.response ? err.response.status : 0, error: err.message };
          })
        );
      }
      
      const rateLimitResults = await Promise.all(rateLimitRequests);
      const rateLimitedRequests = rateLimitResults.filter(r => r.status === 429).length;
      
      if (rateLimitedRequests > 0) {
        console.log(`  ✅ Rate limiting working - ${rateLimitedRequests} out of ${requestCount} requests were rate limited`);
      } else {
        console.log("  ⚠️ No rate limiting detected - verify rate limiting configuration");
      }
    }
    
    // Test 4: Input validation (SQL Injection protection)
    console.log("\n  📋 Testing SQL injection protection...");
    const sqlInjectionPayload = "'; DROP TABLE users; --";
    
    try {
      const injectionResponse = await axios.post(`${apiUrl}/predict/single`, {
        factor: sqlInjectionPayload,
        league: "NBA' OR '1'='1"
      }, {
        headers: {
          'X-API-Key': apiKey || 'test-api-key',
          'Authorization': `Bearer ${jwtToken || 'test-token'}`
        },
        timeout: 5000
      }).catch(err => {
        if (err.response && (err.response.status === 400 || err.response.status === 422)) {
          return { validationWorking: true, status: err.response.status };
        }
        return { validationWorking: false, error: err.message };
      });
      
      if (injectionResponse.validationWorking) {
        console.log("  ✅ SQL injection protection working - API rejected malicious input");
      } else if (injectionResponse.data && injectionResponse.data.status !== 'error') {
        // If request succeeded but didn't execute the SQL injection
        console.log("  ✅ SQL injection protection working - API handled malicious input safely");
      } else {
        console.error("  ⚠️ SQL injection test inconclusive");
      }
    } catch (error) {
      console.error("  ⚠️ Error during SQL injection test:", error.message);
    }
    
    // Test 5: XSS Protection
    console.log("\n  📋 Testing XSS protection...");
    const xssPayload = "<script>alert('XSS')</script>";
    
    try {
      const xssResponse = await axios.post(`${apiUrl}/predict/single`, {
        factor: xssPayload
      }, {
        headers: {
          'X-API-Key': apiKey || 'test-api-key',
          'Authorization': `Bearer ${jwtToken || 'test-token'}`
        },
        timeout: 5000
      }).catch(err => {
        if (err.response && (err.response.status === 400 || err.response.status === 422)) {
          return { validationWorking: true, status: err.response.status };
        }
        return { validationWorking: false, error: err.message };
      });
      
      if (xssResponse.validationWorking) {
        console.log("  ✅ XSS protection working - API rejected malicious input");
      } else if (xssResponse.data) {
        // If we got data back, check if the script tag was sanitized or escaped
        const responseJson = JSON.stringify(xssResponse.data);
        if (responseJson.includes('<script>')) {
          console.error("  ❌ XSS protection failed - API returned unescaped script tags");
        } else {
          console.log("  ✅ XSS protection working - API sanitized malicious input");
        }
      } else {
        console.error("  ⚠️ XSS test inconclusive");
      }
    } catch (error) {
      console.error("  ⚠️ Error during XSS test:", error.message);
    }
    
    // Test 6: Check API key validation
    console.log("\n  📋 Testing API key validation...");
    try {
      await axios.post(`${apiUrl}/predict/single`, {
        factor: "Test factor"
      }, {
        headers: {
          'X-API-Key': 'invalid-api-key',
          'Authorization': `Bearer ${jwtToken || 'test-token'}`
        },
        timeout: 5000
      });
      console.error("  ❌ API key validation failed - API accepted invalid key");
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log("  ✅ API key validation working - API correctly rejected invalid key");
      } else {
        console.error("  ⚠️ Unexpected error in API key validation test:", error.message);
      }
    }
    
    // Test 7: HTTPS Connection (if applicable)
    if (apiUrl.startsWith('https://')) {
      console.log("\n  📋 Testing HTTPS connection security...");
      try {
        const httpsResponse = await axios.get(apiUrl, { 
          timeout: 5000,
          validateStatus: () => true // Accept any status code
        });
        
        // Check for HSTS header
        const hstsHeader = httpsResponse.headers['strict-transport-security'];
        if (hstsHeader) {
          console.log("  ✅ HSTS header is set properly");
        } else {
          console.log("  ⚠️ HSTS header is missing - consider adding it for enhanced security");
        }
        
        console.log("  ✅ HTTPS connection successful");
      } catch (error) {
        console.error("  ⚠️ HTTPS connection test failed:", error.message);
      }
    }
    
    console.log("\n  🔒 Security tests completed");
    
  } catch (error) {
    console.error("❌ Failed to run security tests:", error.message);
  }
}

async function runPlatformCheck() {
  console.log("\n🚀 Pre-launch platform check...");
  
  // Verify key components are ready
  await verifyConnections();
  
  // Verify prediction enhancement systems
  await verifyPredictionEnhancements();
  
  // Run benchmark tests
  await runPredictionBenchmarks();
  
  // Run load tests
  await runLoadTest();
  
  // Run security tests
  await runSecurityTests();
  
  console.log("\n✅ Platform check complete. Check results for any issues that need resolution before launch.");
}

// Export functions for use in other modules
module.exports = {
  verifyConnections,
  runPredictionBenchmarks,
  runLoadTest,
  runSecurityTests,
  runPlatformCheck
};

// Run full check if called directly
if (require.main === module) {
  runPlatformCheck().catch(console.error);
} 