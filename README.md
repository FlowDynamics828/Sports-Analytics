# Sports Analytics Platform

Enterprise-Grade Professional Sports Analytics Platform with Machine Learning Integration

## Prerequisites

Before running the application, ensure you have the following installed:

1. **Node.js** (v22.12.0 or higher)
2. **npm** (v11.1.0 or higher)
3. **Python** (v3.8 or higher)
4. **MongoDB** (v4.4 or higher)
5. **Redis** (v6.0 or higher, optional but recommended)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/FlowDynamics828/Sports-Analytics.git
cd Sports-Analytics
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Install Python dependencies

#### Windows:
```bash
install_python_deps.bat
```

#### macOS/Linux:
```bash
pip install numpy pandas scikit-learn==1.0.2 matplotlib==3.5.2 xgboost==1.6.1 lightgbm==3.3.2 hyperopt==0.2.7 pymongo==4.1.1 python-dotenv==0.20.0 redis==4.3.4 prometheus-client==0.14.1 psutil==5.9.1 cachetools
```

### 4. Configure environment variables

Create a `.env` file in the root directory with the following variables (or run the application once to generate a default file):

```
# Python Configuration
PYTHON_PATH=python
PYTHON_EXECUTABLE=python
PYTHON_BRIDGE_MAX_RETRIES=3
PYTHON_EXECUTION_TIMEOUT=60000

# Server Configuration
PORT=5000
HOST=localhost
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sports-analytics
MONGODB_DB_NAME=sports-analytics

# Redis Configuration (if available)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run prod
```

### Production Mode with Clustering

```bash
npm run prod:cluster
```

## Verifying the Python Environment

To verify that your Python environment is correctly set up:

```bash
npm run verify:python
```

This will:
1. Detect your Python executable path
2. Verify the Python version
3. Check for required packages
4. Update your `.env` file with the correct Python path
5. Install any missing packages

## Troubleshooting

### Python Integration Issues

If you encounter issues with Python integration:

1. Verify your Python installation:
   ```bash
   python --version
   ```

2. Check if the required Python packages are installed:
   ```bash
   pip list
   ```

3. Run the Python environment verification:
   ```bash
   npm run verify:python
   ```

4. Check the logs in the `logs` directory for more detailed error information.

### Database Connection Issues

1. Ensure MongoDB is running:
   ```bash
   mongod --version
   ```

2. Check your MongoDB connection string in the `.env` file.

3. Test the MongoDB connection:
   ```bash
   node test-mongodb.js
   ```

### Redis Connection Issues

1. Ensure Redis is running:
   ```bash
   redis-cli ping
   ```

2. Check your Redis configuration in the `.env` file.

## API Documentation

API documentation is available at:
```
http://localhost:5000/api-docs
```

## License

This project is licensed under the UNLICENSED license.

## Author

FlowDynamics828