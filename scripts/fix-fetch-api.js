// scripts/fix-fetch-api.js - Fix for TheSportsDB API fetch issues
const fs = require('fs');
const path = require('path');

console.log('Sports Analytics - TheSportsDB API Fix');
console.log('====================================');

const predictiveModelPath = path.join(process.cwd(), 'scripts', 'predictive_model.js');

if (fs.existsSync(predictiveModelPath)) {
  console.log(`Found predictive_model.js at ${predictiveModelPath}`);
  let content = fs.readFileSync(predictiveModelPath, 'utf8');
  
  // Check if we need to make changes
  const needsFetch = content.includes('fetch is not a function') || 
                    content.includes('const fetch = require(\'node-fetch\')');
  
  // Add node-fetch import fix
  if (needsFetch) {
    console.log('Fixing fetch API issue...');
    
    // 1. Update the imports section to properly import node-fetch
    if (content.includes('const fetch = require(\'node-fetch\')')) {
      content = content.replace(
        'const fetch = require(\'node-fetch\')',
        `// Import node-fetch with proper compatibility
const nodeFetch = require('node-fetch');
const fetch = (...args) => {
  return nodeFetch.default(...args);
};`
      );
    } else {
      // Add node-fetch import if not present
      const importSection = content.match(/^const.*require.*$/m);
      if (importSection) {
        const importPos = content.indexOf(importSection[0]) + importSection[0].length;
        content = content.slice(0, importPos) + `
const nodeFetch = require('node-fetch');
const fetch = (...args) => {
  return nodeFetch.default(...args);
};` + content.slice(importPos);
      }
    }
    
    fs.writeFileSync(predictiveModelPath, content);
    console.log('✅ Successfully fixed fetch API issue in predictive_model.js');
  } else {
    console.log('No fetch API issues found in predictive_model.js');
  }
} else {
  console.log('❌ Could not find predictive_model.js at expected location');
}

console.log('\nFetch API fix complete. Try running npm run start:optimized again.');