# Sports Analytics - Optimized Setup

This README provides instructions for running the Sports Analytics application with optimized performance settings.

## Performance Optimizations Applied

The following optimizations have been implemented to address memory issues and improve performance:

1. **Python Bridge Optimization**
   - Reduced file system checks
   - Improved error handling
   - Memory leak fixes

2. **Memory Management**
   - Reduced cache sizes and TTLs
   - Implemented aggressive garbage collection
   - Added memory monitoring and cleanup

3. **Database Connection Optimization**
   - Reduced connection pool sizes
   - Added connection timeouts
   - Implemented circuit breakers

4. **Frontend Optimization**
   - Replaced React with vanilla JavaScript
   - Optimized dashboard rendering
   - Implemented efficient data loading

5. **Configuration Improvements**
   - Added optimized .env settings
   - Reduced resource usage
   - Improved error handling

## Prerequisites

- Node.js (v14+)
- Python (v3.8+)
- MongoDB
- Redis (optional)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/sports-analytics.git
   cd sports-analytics
   ```

2. Install Node.js dependencies:
   ```
   npm install
   ```

3. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   - The `.env` file has been created with optimized settings
   - Modify database connection strings if needed

## Running the Application

### Using the start script (recommended)

```
chmod +x start.sh
./start.sh
```

### Manual startup

```
export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"
node startup.js
```

## Accessing the Application

- Web interface: http://localhost:5050
- Dashboard: http://localhost:5050/dashboard.html
- API: http://localhost:5050/api

## Troubleshooting

If you encounter memory issues:

1. Increase the `--max-old-space-size` value in `NODE_OPTIONS`
2. Reduce `CACHE_MAX_ITEMS` and `CACHE_TTL` in `.env`
3. Set `USE_IN_MEMORY_CACHE=true` and `USE_REDIS=false` in `.env`
4. Check MongoDB connection settings

## Monitoring

The application includes built-in memory monitoring. Check the logs for:

- Memory usage warnings
- Garbage collection events
- Connection issues

## License

[Your License]