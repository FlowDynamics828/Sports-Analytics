const mongoose = require('mongoose');
require('dotenv').config();

async function inspectSportsDatabase() {
  console.log("\n🔍 PRODUCTION DATABASE INSPECTION");
  console.log("=================================");
  
  try {
    // Connect to MongoDB with production credentials
    const dbUri = "mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/?retryWrites=true&w=majority";
    console.log(`Connecting to production MongoDB cluster...`);
    
    await mongoose.connect(dbUri, { dbName: "SportsAnalytics" });
    console.log("✅ Connected to production database\n");
    
    // Get list of all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`📊 DATABASE STRUCTURE: Found ${collections.length} collections`);
    
    // Categorize collections
    const sportCollections = collections.filter(c => 
      ['teams', 'players', 'leagues', 'matches', 'games', 'tournaments', 'statistics'].some(term => 
        c.name.toLowerCase().includes(term)
      )
    );
    
    const predictionCollections = collections.filter(c => 
      ['predictions', 'models', 'forecasts', 'analysis'].some(term => 
        c.name.toLowerCase().includes(term)
      )
    );
    
    const userCollections = collections.filter(c => 
      ['users', 'accounts', 'subscriptions', 'payments'].some(term => 
        c.name.toLowerCase().includes(term)
      )
    );
    
    const otherCollections = collections.filter(c => 
      !sportCollections.includes(c) && 
      !predictionCollections.includes(c) && 
      !userCollections.includes(c)
    );
    
    console.log(`\n🏆 SPORTS DATA COLLECTIONS: ${sportCollections.length}`);
    console.log(`📈 PREDICTION COLLECTIONS: ${predictionCollections.length}`);
    console.log(`👤 USER COLLECTIONS: ${userCollections.length}`);
    console.log(`🔧 OTHER COLLECTIONS: ${otherCollections.length}\n`);
    
    // Get detailed information about each collection
    console.log("📋 DETAILED COLLECTION ANALYSIS");
    console.log("==============================");
    
    // Process all collections
    const allCollections = [...sportCollections, ...predictionCollections, ...userCollections, ...otherCollections];
    
    for (const collection of allCollections) {
      const collectionName = collection.name;
      const collectionObj = mongoose.connection.db.collection(collectionName);
      
      // Get document count
      const count = await collectionObj.countDocuments();
      
      console.log(`\n📁 ${collectionName.toUpperCase()} - ${count} documents`);
      
      if (count > 0) {
        // Get sample documents
        const sampleSize = Math.min(3, count);
        const samples = await collectionObj.find().limit(sampleSize).toArray();
        
        // Check schema structure (first 3 keys only)
        const schemaKeys = Object.keys(samples[0]).filter(k => k !== '_id').slice(0, 6);
        console.log(`   Schema fields: ${schemaKeys.join(', ')}${schemaKeys.length < Object.keys(samples[0]).length - 1 ? '...' : ''}`);
        
        // Display filtered sample data
        if (collectionName.toLowerCase().includes('user') || collectionName.toLowerCase().includes('account')) {
          // Handle sensitive collections by showing limited info
          console.log(`   Sample data: ${sampleSize} user records (sensitive data not displayed)`);
        } else {
          // For sports data, show representative samples
          console.log(`   Sample items:`);
          
          for (const sample of samples) {
            // Pick representative fields based on collection type
            let displayStr = '';
            
            if (sample.name) displayStr += `name: "${sample.name}"`;
            if (sample.id || sample.team_id || sample.player_id) displayStr += `, id: "${sample.id || sample.team_id || sample.player_id}"`;
            if (sample.league) displayStr += `, league: "${sample.league}"`;
            if (sample.sport) displayStr += `, sport: "${sample.sport}"`;
            if (sample.date) displayStr += `, date: "${sample.date}"`;
            if (sample.probability) displayStr += `, probability: ${sample.probability}`;
            if (sample.confidence) displayStr += `, confidence: ${sample.confidence}`;
            
            // If we couldn't find good fields, show first 3 non-ID fields
            if (!displayStr) {
              const itemFields = Object.entries(sample)
                .filter(([key]) => key !== '_id')
                .slice(0, 3)
                .map(([key, val]) => {
                  const valStr = typeof val === 'object' ? JSON.stringify(val).substring(0, 30) : val;
                  return `${key}: "${valStr}"`;
                })
                .join(', ');
              displayStr = itemFields;
            }
            
            console.log(`   - ${displayStr}`);
          }
        }
        
        // Show indexes for collection
        const indexes = await collectionObj.indexes();
        if (indexes.length > 1) { // More than just the _id index
          const indexFields = indexes
            .filter(idx => idx.name !== '_id_')
            .map(idx => Object.keys(idx.key).join('+'));
          console.log(`   Indexes: ${indexFields.join(', ')}`);
        }
      } else {
        console.log(`   Empty collection`);
      }
    }
    
    // Sports data coverage assessment
    console.log("\n🌐 SPORTS COVERAGE ASSESSMENT");
    console.log("===========================");
    
    try {
      // Check leagues collection for sports coverage
      const leaguesCollection = mongoose.connection.db.collection('leagues');
      const leaguesCount = await leaguesCollection.countDocuments();
      
      if (leaguesCount > 0) {
        const leagues = await leaguesCollection.find().toArray();
        const sportTypes = new Set(leagues.map(l => l.sport || l.type).filter(Boolean));
        
        console.log(`Supported sports: ${Array.from(sportTypes).join(', ')}`);
        console.log(`Total leagues: ${leaguesCount}`);
        
        // List leagues by sport
        const leaguesBySport = {};
        for (const league of leagues) {
          const sport = league.sport || league.type || 'Unknown';
          if (!leaguesBySport[sport]) leaguesBySport[sport] = [];
          leaguesBySport[sport].push(league.name || league.id);
        }
        
        for (const [sport, sportLeagues] of Object.entries(leaguesBySport)) {
          console.log(`\n${sport}: ${sportLeagues.length} leagues`);
          console.log(`  - ${sportLeagues.join('\n  - ')}`);
        }
      } else {
        console.log(`No leagues found in database`);
      }
    } catch (error) {
      console.error(`Error analyzing sports coverage: ${error.message}`);
    }
    
    // Overall database stats
    console.log("\n📊 OVERALL DATABASE STATISTICS");
    console.log("=============================");
    const stats = await mongoose.connection.db.stats();
    console.log(`Storage size: ${(stats.storageSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Total documents: ${stats.objects}`);
    console.log(`Collections: ${stats.collections}`);
    console.log(`Indexes: ${stats.indexes}`);
    
    await mongoose.disconnect();
    console.log("\n✅ Database inspection complete\n");
    
  } catch (error) {
    console.error(`❌ Database inspection failed: ${error.message}`);
    
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

// Run the inspection
inspectSportsDatabase().catch(console.error); 