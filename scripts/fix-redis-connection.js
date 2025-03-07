// scripts/fix-redis-connection.js - Enhanced Redis connection fix

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

console.log(`${colors.bright}${colors.cyan}Sports Analytics - Enhanced Redis Connection Fix${colors.reset}`);
console.log(`${colors.cyan}=====================================${colors.reset}\n`);

async function main() {
  try {
    console.log(`${colors.bright}Enabling in-memory cache fallback...${colors.reset}`);
    
    // 1. Update .env file with in-memory cache and Redis settings
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update Redis settings
      const redisSettings = `
# Redis Configuration - Updated with enhanced settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=60000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=5000
USE_IN_MEMORY_CACHE=true
`;
      
      if (envContent.includes('# Redis Configuration')) {
        // Find and replace existing Redis configuration section
        const redisStart = envContent.indexOf('# Redis Configuration');
        let redisEnd = envContent.indexOf('#', redisStart + 1);
        if (redisEnd === -1) redisEnd = envContent.length;
        
        envContent = envContent.slice(0, redisStart) + redisSettings + envContent.slice(redisEnd);
      } else {
        // Add new Redis configuration
        envContent += redisSettings;
      }
      
      // Explicitly set USE_IN_MEMORY_CACHE to true, regardless of if it exists
      if (envContent.includes('USE_IN_MEMORY_CACHE=')) {
        envContent = envContent.replace(/USE_IN_MEMORY_CACHE=.*(\r?\n|$)/, `USE_IN_MEMORY_CACHE=true$1`);
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log(`${colors.green}✓ Updated .env with Redis settings and enabled in-memory cache${colors.reset}`);
    } else {
      // Create new .env file if it doesn't exist
      const newEnvContent = `
# Redis Configuration - Updated with enhanced settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CONNECT_TIMEOUT=60000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_STRATEGY_MAX_DELAY=5000
USE_IN_MEMORY_CACHE=true
`;
      fs.writeFileSync(envPath, newEnvContent);
      console.log(`${colors.green}✓ Created new .env file with Redis settings and in-memory cache${colors.reset}`);
    }
    
    // 2. Create CacheManager fallback in utils directory
    console.log(`\n${colors.bright}Creating cache fallback utilities...${colors.reset}`);
    
    const utilsDir = path.join(process.cwd(), 'utils');
    if (!fs.existsSync(utilsDir)) {
      fs.mkdirSync(utilsDir, { recursive: true });
      console.log(`${colors.green}✓ Created utils directory${colors.reset}`);
    }
    
    const cacheManagerPath = path.join(utilsDir, 'cacheManager.js');
    const cacheManagerContent = `// utils/cacheManager.js - Memory/Redis cache fallback implementation

const NodeCache = require('node-cache');

class CacheManager {
  constructor(options = {}) {
    this.initialized = false;
    this.useRedis = !process.env.USE_IN_MEMORY_CACHE || process.env.USE_IN_MEMORY_CACHE !== 'true';
    this.options = {
      stdTTL: options.stdTTL || 600, // Default 10 minutes
      checkperiod: options.checkperiod || 120,
      maxKeys: options.maxKeys || 1000,
      ...options
    };
    
    // Initialize in-memory cache as fallback
    this.memoryCache = new NodeCache(this.options);
    
    // Log configuration
    console.log(\`CacheManager initialized with \${this.useRedis ? 'Redis + memory fallback' : 'memory-only'} mode\`);
  }

  async initialize(redisClient = null) {
    try {
      if (this.useRedis && redisClient) {
        this.redis = redisClient;
        // Test Redis connection
        try {
          await this.redis.ping();
          console.log('Redis connection successful for cache');
        } catch (error) {
          console.warn(\`Redis connection failed: \${error.message}. Falling back to in-memory cache\`);
          this.useRedis = false;
        }
      } else {
        this.useRedis = false;
        console.log('Using in-memory cache only (Redis disabled)');
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error(\`Cache initialization error: \${error.message}\`);
      this.useRedis = false;
      this.initialized = true;
      return false;
    }
  }

  async set(key, value, ttl = this.options.stdTTL) {
    try {
      // Always set in memory cache as fallback
      this.memoryCache.set(key, value, ttl);
      
      // If Redis is enabled, also set in Redis
      if (this.useRedis && this.redis) {
        try {
          await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
        } catch (error) {
          console.warn(\`Redis set error for key \${key}: \${error.message}\`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(\`Cache set error for key \${key}: \${error.message}\`);
      return false;
    }
  }

  async get(key) {
    try {
      // Try Redis first if enabled
      if (this.useRedis && this.redis) {
        try {
          const value = await this.redis.get(key);
          if (value) {
            return JSON.parse(value);
          }
        } catch (error) {
          console.warn(\`Redis get error for key \${key}: \${error.message}\`);
          // Fall back to memory cache if Redis fails
        }
      }
      
      // Try memory cache as fallback
      return this.memoryCache.get(key);
    } catch (error) {
      console.error(\`Cache get error for key \${key}: \${error.message}\`);
      return null;
    }
  }

  async has(key) {
    try {
      // Check memory cache first (faster)
      if (this.memoryCache.has(key)) {
        return true;
      }
      
      // Then check Redis if enabled
      if (this.useRedis && this.redis) {
        try {
          return await this.redis.exists(key) === 1;
        } catch (error) {
          console.warn(\`Redis exists error for key \${key}: \${error.message}\`);
        }
      }
      
      return false;
    } catch (error) {
      console.error(\`Cache has error for key \${key}: \${error.message}\`);
      return false;
    }
  }

  async delete(key) {
    try {
      // Delete from memory cache
      this.memoryCache.del(key);
      
      // Delete from Redis if enabled
      if (this.useRedis && this.redis) {
        try {
          await this.redis.del(key);
        } catch (error) {
          console.warn(\`Redis delete error for key \${key}: \${error.message}\`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(\`Cache delete error for key \${key}: \${error.message}\`);
      return false;
    }
  }

  async clear() {
    try {
      // Clear memory cache
      this.memoryCache.flushAll();
      
      // Clear Redis if enabled
      if (this.useRedis && this.redis) {
        try {
          await this.redis.flushDb();
        } catch (error) {
          console.warn(\`Redis flush error: \${error.message}\`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(\`Cache clear error: \${error.message}\`);
      return false;
    }
  }
}

module.exports = { CacheManager };
`;
    
    fs.writeFileSync(cacheManagerPath, cacheManagerContent);
    console.log(`${colors.green}✓ Created fallback CacheManager implementation${colors.reset}`);
    
    // 3. Fix api.js Redis cleanup
    console.log(`\n${colors.bright}Fixing Redis cleanup in api.js...${colors.reset}`);
    
    const apiPath = path.join(process.cwd(), 'api.js');
    if (fs.existsSync(apiPath)) {
      let apiContent = fs.readFileSync(apiPath, 'utf8');
      
      // Find redis cleanup section and replace it with a safer implementation
      const redisCleanupStart = apiContent.indexOf('// Redis connection cleanup');
      if (redisCleanupStart !== -1) {
        const redisCleanupEnd = apiContent.indexOf('if (this.cache)', redisCleanupStart);
        if (redisCleanupEnd !== -1) {
          // Improved Redis cleanup code with proper error handling
          const improvedCleanup = `      // Redis connection cleanup with improved error handling
      if (this.redis) {
        try {
          if (this.redis.status === 'ready' || this.redis.status === 'connect') {
            await Promise.race([
              this.redis.quit(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis quit timeout')), 5000)
              )
            ]).catch(error => {
              logger.warn(\`Redis quit failed: \${error.message}, forcing disconnect\`);
              this.redis.disconnect();
            });
          } else {
            this.redis.disconnect();
          }
          logger.info('Redis connection closed');
        } catch (error) {
          logger.warn(\`Redis cleanup error: \${error.message}\`);
        } finally {
          this.redis = null;
          if (global.redisClient) {
            global.redisClient = null;
          }
        }
      }

      `;
          
          apiContent = apiContent.slice(0, redisCleanupStart) + improvedCleanup + apiContent.slice(redisCleanupEnd);
          fs.writeFileSync(apiPath, apiContent);
          console.log(`${colors.green}✓ Fixed Redis cleanup in api.js${colors.reset}`);
        } else {
          console.log(`${colors.yellow}⚠ Could not find Redis cleanup end in api.js${colors.reset}`);
        }
      } else {
        console.log(`${colors.yellow}⚠ Could not find Redis cleanup section in api.js${colors.reset}`);
      }
    } else {
      console.log(`${colors.yellow}⚠ api.js not found${colors.reset}`);
    }
    
    console.log(`\n${colors.bright}${colors.green}Redis connection fixes completed successfully!${colors.reset}`);
    console.log(`${colors.bright}Now try running your application with: npm run start:optimized${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error fixing Redis connection:${colors.reset}`, error);
    process.exit(1);
  }
}

main();