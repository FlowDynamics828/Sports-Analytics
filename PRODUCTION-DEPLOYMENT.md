# Sports Analytics Platform Production Deployment Guide

This guide outlines the steps required to prepare, verify, and deploy the Sports Analytics platform to a production environment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Verification](#verification)
5. [Deployment](#deployment)
6. [Monitoring](#monitoring)
7. [Security Considerations](#security-considerations)
8. [Scaling](#scaling)
9. [Backup and Recovery](#backup-and-recovery)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

Ensure the following components are installed on your production server:

- Node.js 18.x or higher
- Python 3.8 or higher
- MongoDB 6.0 or higher
- Redis 7.0 or higher
- Nginx (for production deployments)
- SSL certificates (for HTTPS)

For distributed deployments, consider:
- Docker & Docker Compose
- Kubernetes (for large-scale deployments)
- Load balancer (e.g., HAProxy, Nginx, or a cloud provider's solution)

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-org/sports-analytics-pro.git
cd sports-analytics-pro
```

2. **Run the production preparation script**

```bash
npm run prepare:prod
```

This script will:
- Create required directories
- Install Node.js dependencies
- Install Python packages and models
- Verify MongoDB and Redis installations
- Check environment configuration

3. **Install additional dependencies if needed**

Follow any recommendations from the preparation script to install missing components.

## Configuration

1. **Set up environment variables**

Ensure all required environment variables are configured in your `.env` file:

```
# Core settings
PORT=8000
NODE_ENV=production

# Security
JWT_SECRET=<your-secure-jwt-secret>
PREMIUM_API_KEY=<your-api-key>
WEBHOOK_SECRET=<your-webhook-signing-secret>

# Database
MONGO_URI=mongodb://username:password@hostname:port
MONGO_DB_NAME=sports_analytics
REDIS_URL=redis://:password@hostname:port

# External APIs
SPORTS_API_ENDPOINT=https://api.sportsdata.io/v3
ODDS_API_ENDPOINT=https://api.the-odds-api.com/v4
SPORTS_API_KEY=<your-sports-api-key>
```

2. **Configure Nginx**

Create an Nginx configuration for your application:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # API Server
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket Server
    location /ws {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    # Static files
    location / {
        root /path/to/sports-analytics-pro/dist/public;
        try_files $uri $uri/ /index.html;
        expires 1d;
    }
}
```

# MongoDB Atlas Configuration

## IP Whitelisting in MongoDB Atlas

Before deploying to production, you need to whitelist your server IP addresses in MongoDB Atlas:

1. Log in to your MongoDB Atlas account
2. Navigate to your Cluster0
3. Click on the "Network Access" tab in the left sidebar
4. Click "Add IP Address"
5. Add your production server IP addresses or use "0.0.0.0/0" to allow all connections (not recommended for production)
6. Click "Confirm"

Note: The MongoDB connection string in the `.env` file is:
```
mongodb://SportAnalytics:passwordCluster0@cluster0-shard-00-00.6fe37.mongodb.net:27017,cluster0-shard-00-01.6fe37.mongodb.net:27017,cluster0-shard-00-02.6fe37.mongodb.net:27017/myFirstDatabase?authSource=admin&replicaSet=atlas-5c4cac-shard-0&readPreference=primary&ssl=true
```

## Database Collections Setup

Ensure the following collections exist in your MongoDB database:
- users
- predictions 
- teams
- matches
- leagues

If any collections are missing, the verification script will warn you, and you'll need to create them using the data initialization scripts.

## Verification

1. **Run the verification script**

```bash
npm run verify
```

This will check:
- Environment variables
- Database connections
- Required directories
- Module imports
- API endpoints
- Frontend dependencies

2. **Run benchmark tests**

```bash
node scripts/verify_connections.js
```

Ensure that all tests pass, including:
- Prediction accuracy tests
- Load tests
- Security tests

## Deployment

### Standard Deployment

1. **Build the production assets**

```bash
npm run build:prod
```

2. **Start the production server**

```bash
npm run start:prod
```

3. **Use a process manager**

For production, use PM2 or similar:

```bash
# Install PM2
npm install -g pm2

# Start the application
pm2 start ecosystem.config.js

# Ensure PM2 starts on system boot
pm2 startup
pm2 save
```

Example `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: "sports-analytics-api",
    script: "dist/api.js",
    instances: "max",
    exec_mode: "cluster",
    env_production: {
      NODE_ENV: "production",
      PORT: 8000
    },
    max_memory_restart: "1G"
  }, {
    name: "sports-analytics-ws",
    script: "dist/websocket.js",
    env_production: {
      NODE_ENV: "production",
      WS_PORT: 8081
    }
  }, {
    name: "live-game-updater",
    script: "dist/live_game_updater.js",
    env_production: {
      NODE_ENV: "production",
      LIVE_GAME_UPDATER_WS_PORT: 8082
    }
  }]
};
```

### Docker Deployment

1. **Build the Docker image**

```bash
npm run docker:build
```

2. **Run with Docker Compose**

```bash
npm run docker:compose
```

## Monitoring

1. **Set up application monitoring**

The platform includes built-in metrics that can be exposed to Prometheus. Configure your Prometheus server to scrape metrics from `http://your-server:9090/metrics`.

2. **Log management**

- Application logs are stored in the `logs` directory
- Consider using a log aggregation tool (ELK stack, Graylog, etc.)
- Set up log rotation to prevent disk space issues

3. **Alerts**

Configure alerts for:
- High error rates
- API latency spikes
- System resource usage (CPU, memory, disk)
- Prediction accuracy drift

## Security Considerations

1. **API Security**

- Ensure all API endpoints use JWT authentication
- Implement rate limiting for all endpoints
- Validate all input data

2. **Data Protection**

- Encrypt sensitive data at rest and in transit
- Implement proper access controls
- Regularly back up the database
- Consider data retention policies

3. **Dependency Security**

- Regularly update dependencies
- Run security audits: `npm run security-check`
- Subscribe to security advisories for your dependencies

## Scaling

For high-traffic scenarios, consider these scaling options:

1. **Vertical Scaling**
   - Increase server resources (CPU, RAM)
   - Optimize database queries and indexing

2. **Horizontal Scaling**
   - Deploy multiple API instances behind a load balancer
   - Shard the MongoDB database
   - Implement Redis cluster for caching
   - Use a CDN for static content

3. **Microservices Split**
   - Separate the prediction engine into its own service
   - Create dedicated services for high-traffic features

## Backup and Recovery

1. **Database Backups**

```bash
# MongoDB backup
mongodump --uri="mongodb://username:password@hostname:port/sports_analytics" --out=/backup/mongo/$(date +%Y-%m-%d)

# Redis backup
redis-cli -h hostname -p port -a password --rdb /backup/redis/dump-$(date +%Y-%m-%d).rdb
```

2. **Application Data Backups**

Regularly back up the following directories:
- `data/`
- `models/`
- `.env` file

3. **Disaster Recovery Plan**

Document the steps needed to recover the system in case of failure:
1. Restore database from backup
2. Deploy application code
3. Restore environment configuration
4. Verify system functionality

## Troubleshooting

### Common Issues

1. **Connection Failures**

If the verification script shows connection failures:
- Check MongoDB and Redis services are running
- Verify network connectivity and firewall rules
- Confirm environment variables are correctly set

2. **Performance Issues**

If experiencing slow response times:
- Check database indexes
- Monitor CPU and memory usage
- Review API logs for slow endpoints
- Consider optimizing prediction algorithms

3. **Prediction API Errors**

If prediction requests fail:
- Check Python environment is properly configured
- Verify model files exist in the correct locations
- Check for errors in the Python logs
- Ensure sufficient system resources for model processing

### Support Contacts

For enterprise support, contact:
- Email: support@sports-analytics.com
- Emergency: +1-555-123-4567

---

## Deployment Checklist

- [ ] Environment variables configured
- [ ] MongoDB and Redis installed and running
- [ ] Python dependencies installed
- [ ] Verification script passes all checks
- [ ] Production build completed
- [ ] HTTPS certificates installed
- [ ] Firewall rules configured
- [ ] Monitoring set up
- [ ] Backup procedures in place
- [ ] Load testing completed
- [ ] Security testing completed
- [ ] Documentation updated

Good luck with your revolutionary sports analytics platform! 