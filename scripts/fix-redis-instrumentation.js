// scripts/fix-redis-instrumentation.js
const fs = require('fs');
const path = require('path');

console.log('Sports Analytics - Redis Instrumentation Fix');
console.log('=============================================\n');

const predictiveModelPath = path.join(__dirname, '..', 'scripts', 'predictive_model.js');

if (fs.existsSync(predictiveModelPath)) {
  console.log(`Found predictive_model.js at ${predictiveModelPath}`);
  let content = fs.readFileSync(predictiveModelPath, 'utf8');
  
  // Comment out the Redis instrumentation import
  content = content.replace(
    /const\s*{\s*RedisInstrumentation\s*}\s*=\s*require\(['"]@opentelemetry\/instrumentation-ioredis['"]\)/g,
    '// const { RedisInstrumentation } = require(\'@opentelemetry/instrumentation-ioredis\')'
  );
  
  // Remove Redis instrumentation from the instrumentations array
  content = content.replace(
    /new\s+RedisInstrumentation\(\)/g,
    '// new RedisInstrumentation()'
  );
  
  fs.writeFileSync(predictiveModelPath, content);
  console.log('✓ Successfully fixed RedisInstrumentation in predictive_model.js');
} else {
  console.log('❌ Could not find predictive_model.js at expected location');
  // Try to find it in alternate locations
  const altPath1 = path.join(process.cwd(), 'scripts', 'predictive_model.js');
  const altPath2 = path.join(process.cwd(), 'predictive_model.js');
  
  if (fs.existsSync(altPath1)) {
    console.log(`Found at alternate location: ${altPath1}`);
    // Repeat the replacement logic for this file
  } else if (fs.existsSync(altPath2)) {
    console.log(`Found at alternate location: ${altPath2}`);
    // Repeat the replacement logic for this file
  } else {
    console.log('Could not find predictive_model.js in any expected location');
  }
}

console.log('\nRedis Instrumentation fix complete. Try running npm run start:optimized again.');