# Troubleshooting Guide for Sports Analytics Project
...
## Redis Connection Issues

### Issue: Redis Initialization Failures

**Solutions:**

1. **Verify Redis Installation**

   ```bash
   # Check if Redis is installed and running
   redis-cli ping
   ```

2. **Start Redis if Not Running**

   ```bash
   # Windows (if using Redis Windows port)
   redis-server
   
   # macOS
   brew services start redis
   
   # Linux
   sudo systemctl start redis
   ```

3. **Configure Redis Connection**

   Update your `.env` file with the correct Redis configuration:
   ```
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_CONNECT_TIMEOUT=10000
   ```

4. **Use In-Memory Fallback**

   If Redis is not available, enable the in-memory fallback:
   ```
   USE_IN_MEMORY_CACHE=true
   ```

   ...
