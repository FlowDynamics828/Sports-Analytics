# Sports Analytics Enterprise Platform v2.1

## Installation and Configuration Guide

This document provides detailed instructions for installing, configuring, and running the Sports Analytics Enterprise Platform.

## System Requirements

- **Node.js**: v16.x or later
- **Python**: v3.8 or later
- **Database**: MongoDB (local or remote)
- **OS**: Windows 10/11, macOS, or Linux
- **Recommended Hardware**: 4+ CPU cores, 8GB+ RAM

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/sports-analytics.git
cd sports-analytics
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Install Python Dependencies

```bash
pip install nltk numpy pandas scikit-learn
```

### 4. Configure Environment

Create or modify the `.env` file in the root directory with the following settings:

```
# Server Configuration
PORT=8000
NODE_ENV=production  # Change to 'development' for development mode

# Clustering
ENABLE_CLUSTERING=true
NUM_WORKERS=4  # Adjust based on your CPU cores

# Memory Monitoring
ENABLE_MEMORY_MONITORING=true
GC_INTERVAL=300000

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/sportsdb  # Update with your MongoDB connection string
MONGO_DB_NAME=sportsanalytics
MONGO_CONNECT_TIMEOUT=5000
MONGO_SOCKET_TIMEOUT=30000
MONGO_MAX_POOL_SIZE=50
MONGO_MIN_POOL_SIZE=5

# API Configuration
API_RATE_LIMIT=100
API_RATE_WINDOW=900000

# Prediction Engine
USE_ADVANCED_MODEL=true
PREDICTION_CACHE_TTL=3600
```

### 5. Create Required Directories

Ensure these directories exist:

```bash
mkdir -p data/prediction_cache
mkdir -p logs
mkdir -p models/ml
mkdir -p models/nlp
mkdir -p data/embeddings
```

## Running the Platform

### Direct Mode (Single Process)

For development or testing, use the direct mode:

```bash
.\start-direct.cmd  # Windows
```

Or directly:

```bash
node server-direct.js
```

### Clustered Mode (Production)

For production environments with multi-core scaling:

```bash
.\launch-enterprise.cmd  # Windows
```

Or directly:

```bash
node start-optimized.js
```

## Accessing the Platform

- **Web Interface**: http://localhost:8000
- **API**: http://localhost:8000/api
- **Dashboard**: http://localhost:8000/dashboard

## API Endpoints

### Prediction Endpoints

- **Single Prediction**: 
  - URL: `/api/predict/single`
  - Method: POST
  - Body: 
    ```json
    {
      "factor": "LeBron James scores more than 30 points",
      "league": "NBA",
      "use_advanced_model": true
    }
    ```

- **Multi-factor Prediction**: 
  - URL: `/api/predict/multi`
  - Method: POST
  - Body: 
    ```json
    {
      "factors": [
        "LeBron James scores more than 30 points",
        "Lakers win the game"
      ],
      "league": "NBA"
    }
    ```

### Data Endpoints

- **Leagues**: GET `/api/leagues`
- **Teams**: GET `/api/teams?league={leagueId}`
- **Matches**: GET `/api/matches?league={leagueId}&status={status}`
- **Players**: GET `/api/players?team={teamId}`

## Troubleshooting

### Common Issues

1. **Port Already in Use**: 
   - Error: `EADDRINUSE`
   - Solution: Change the PORT in .env or kill the existing process

2. **MongoDB Connection Issues**:
   - The platform includes a fallback mechanism for MongoDB failures
   - Check your MongoDB connection string in .env

3. **Python Prediction Errors**:
   - Ensure all Python dependencies are installed
   - Check the logs in `logs/basic_prediction.log` and `logs/advanced_prediction.log`

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in .env
2. Configure proper MongoDB credentials
3. Adjust worker count based on server capabilities
4. Consider setting up a process manager like PM2
5. Implement proper monitoring and logging solutions

## SportsData.io Integration

When ready to migrate to SportsData.io:

1. Obtain API keys from SportsData.io
2. Add the API key to .env as SPORTSDATA_API_KEY
3. Uncomment the relevant code in routes/api.js

---

For additional support, contact the development team or refer to the internal documentation. 