# Sports Analytics Custom Prediction System

## Overview

The Sports Analytics Custom Prediction System is an enterprise-grade platform that allows users to create predictions using natural language inputs. The system parses these inputs, extracts relevant entities and conditions, and generates probability estimates using advanced machine learning models.

## Architecture Components

1. **Factor Parser** (`scripts/factor_parser.py`)
   - Parses natural language inputs into structured prediction factors
   - Extracts entities (players, teams), conditions, and comparison operators
   - Handles complex queries with compound conditions, negation, and time frames
   - Uses advanced NLP techniques including transformers and dependency parsing

2. **Custom Prediction Model** (`scripts/custom_prediction_model.py`)
   - Generates predictions based on parsed factors
   - Supports both single-factor and multi-factor predictions
   - Applies Bayesian and ensemble techniques for accurate probability estimates
   - Includes uncertainty quantification and confidence scoring

3. **Premium Prediction API** (`scripts/premium_prediction_api.py`)
   - Enterprise-grade FastAPI service with GraphQL and REST endpoints
   - Secured with JWT authentication and API keys
   - Includes rate limiting, caching, and comprehensive error handling
   - Circuit breaker pattern for resilience against failures

4. **Frontend Component** (`public/js/features/custom_predictions.js`)
   - User interface for entering prediction factors
   - Real-time prediction results with visualizations
   - Offline mode support with IndexedDB storage
   - Support for real-time updates via WebSockets

## Installation

### Prerequisites

- Python 3.8+
- Node.js 14+
- MongoDB
- Redis
- Required Python packages (see `requirements.txt`)
- Required Node.js packages (see `package.json`)

### Setup

1. **Clone the repository:**
   ```
   git clone https://github.com/your-org/sports-analytics.git
   cd sports-analytics
   ```

2. **Install dependencies:**
   ```
   npm install
   python -m pip install -r requirements.txt
   ```

3. **Set up environment variables:**
   Create a `.env` file based on the `.env.template` file.

4. **Download required models:**
   ```
   python -m spacy download en_core_web_sm
   python -m nltk.downloader punkt stopwords
   ```

5. **Run the deployment script:**
   - On Windows: `.\deploy.ps1`
   - On Linux/MacOS: `./deploy.sh`

## Running the System

### Start the System

```
node scripts/start_prediction_system.js
```

This script will:
- Check and create required directories
- Verify Redis and MongoDB connections
- Start the prediction API

### Verification

To verify the system is working correctly:

```
node scripts/verify_connections.js
```

This will check all connections and dependencies, reporting any issues.

## API Documentation

### REST API Endpoints

- **Single Factor Prediction**: `POST /predict/single`
  - Request body: `{ "factor": "LeBron James scores more than 25 points" }`
  - Response: Prediction with probability and supporting data

- **Multi-Factor Prediction**: `POST /predict/multi`
  - Request body: `{ "factors": ["Lakers win", "LeBron scores 25+ points"] }`
  - Response: Individual and combined probabilities with correlation analysis

- **Bulk Prediction**: `POST /predict/bulk`
  - For batch processing of multiple prediction requests
  - Asynchronous with webhook notifications

- **Factor Parsing**: `POST /tools/parse-factor`
  - For debugging factor parsing without generating predictions

### GraphQL API

GraphQL endpoint available at `/graphql` with equivalent functionality to the REST API.

## Integration Points

### 1. Authentication System Integration

- JWT authentication system using `JWT_SECRET` environment variable
- API key verification with `X-API-Key` header
- User subscription tier validation

### 2. Redis Dependency

- Required for caching, rate limiting, and job processing
- Configure using `REDIS_URL` environment variable
- Connection pooling for performance

### 3. OpenTelemetry Integration

- Tracer provider setup for monitoring and performance tracking
- Batch span processor for telemetry data collection

### 4. Custom Module Dependencies

- Factor parser integration with `get_parser()` function
- Prediction engine integration with `get_prediction_engine()` function
- Circuit breaker pattern for resilience

### 5. Environment Variables

- `JWT_SECRET` and `API_KEY` for authentication
- `REDIS_URL` for caching and rate limiting
- Support for configuration through dotenv

### 6. Webhook Systems

- Webhook notifications with HMAC signature verification
- Callback URLs for asynchronous processing results

## Troubleshooting

### Common Issues

1. **Connection Issues**
   - Ensure Redis and MongoDB services are running
   - Check environment variables for correct URLs
   - Verify network configuration allows required connections

2. **Authentication Failures**
   - Ensure JWT token is valid and not expired
   - Verify API key is correct and included in headers
   - Check user subscription tier has necessary permissions

3. **Performance Problems**
   - Monitor Redis memory usage
   - Check circuit breaker status at `/system/circuit-status`
   - Review logs for bottlenecks or errors

### Support

For additional support, contact the development team or refer to the detailed technical documentation.

## Enterprise Deployment Considerations

### Scaling

- Multiple instances behind load balancer
- Redis cluster for distributed caching
- Separate services for factor parsing and prediction generation

### Monitoring

- OpenTelemetry integration for tracing
- Prometheus metrics endpoint at `/metrics`
- Health check endpoint at `/health`

### Security

- JWT authentication with short-lived tokens
- API key rotation policies
- Rate limiting by user tier
- Request validation and sanitization

### Disaster Recovery

- Request logging for replay capability
- Circuit breaker pattern to prevent cascading failures
- Graceful degradation with fallback mechanisms 