// Create a file called scripts/fix-redis-cluster.js:

const fs = require('fs');
const path = require('path');

console.log('Sports Analytics - Redis Cluster Fix Tool');
console.log('========================================\n');

// Find and modify the Redis client initialization
const apiPath = path.join(process.cwd(), 'api.js');
if (fs.existsSync(apiPath)) {
  let content = fs.readFileSync(apiPath, 'utf8');
  
  // Check if ioredis is being imported
  if (content.includes('require("ioredis")') || content.includes("require('ioredis')")) {
    console.log('Found ioredis import in api.js');
    
    // Update Redis configuration to use single node mode instead of cluster
    if (content.includes('Redis.Cluster')) {
      console.log('Detected Redis Cluster configuration, converting to single-node...');
      
      // Replace Cluster configuration with single-node
      content = content.replace(
        /new\s+Redis\.Cluster\(\s*\[\s*{\s*host:.*?,\s*port:.*?\s*}\s*\]\s*,/g,
        'new Redis({'
      );
      
      fs.writeFileSync(apiPath, content);
      console.log('✅ Updated Redis configuration to use single-node mode');
    } else {
      console.log('Redis is already configured in single-node mode');
    }
    
    // Update retry strategy for better resilience
    if (content.includes('retryStrategy')) {
      console.log('Found retryStrategy, updating for better resilience...');
      
      // Replace retry strategy with more resilient one
      content = content.replace(
        /retryStrategy:.*?\},/gs,
        `retryStrategy: function(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },`
      );
      
      fs.writeFileSync(apiPath, content);
      console.log('✅ Updated Redis retry strategy for better resilience');
    }
  } else {
    console.log('⚠️ ioredis import not found in api.js');
  }
} else {
  console.log('❌ api.js not found');
}

// Update .env file with correct Redis configuration
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Make sure Redis is configured properly
  const redisSettings = `
# Redis Configuration - Single Node
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
USE_REDIS=true
USE_REDIS_CLUSTER=false
`;
  
  if (envContent.includes('# Redis Configuration')) {
    const redisStart = envContent.indexOf('# Redis Configuration');
    let redisEnd = envContent.indexOf('#', redisStart + 1);
    if (redisEnd === -1) redisEnd = envContent.length;
    
    envContent = envContent.slice(0, redisStart) + redisSettings + envContent.slice(redisEnd);
  } else {
    envContent += redisSettings;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Updated .env with correct Redis configuration');
}

console.log('\n🔄 Redis configuration has been updated.');
console.log('Next steps:');
console.log('1. Make sure Redis is installed and running on localhost:6379');
console.log('2. Run your application with: npm run start:optimized');