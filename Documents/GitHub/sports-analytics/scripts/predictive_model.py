# predictive_model.py

# Standard library imports
import sys
import os
import json
import logging
import warnings
import traceback
import gc
import signal
import time
from datetime import datetime, timedelta
from typing import Dict, List, Union, Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
from logging.handlers import RotatingFileHandler

# Third-party imports
import numpy as np
import pandas as pd
import numpy.typing as npt
from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor, VotingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.feature_selection import SelectFromModel
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.exceptions import NotFittedError
import xgboost as xgb
import lightgbm as lgb
from hyperopt import fmin, tpe, hp, STATUS_OK, Trials
import pymongo
from pymongo.errors import ConnectionFailure, OperationFailure
from dotenv import load_dotenv
from sklearn import __version__ as sklearn_version
import redis
from prometheus_client import Counter, Histogram, Gauge
import psutil
from cachetools import TTLCache, LRUCache

# Suppress warnings
warnings.filterwarnings('ignore')

# Load environment variables from the .env file in the project root
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=dotenv_path)

# Configure advanced logging with reduced verbosity
def setup_logging():
    log_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
    )
    
    file_handler = RotatingFileHandler(
        'predictive_model.log',
        maxBytes=5*1024*1024,  # Reduced to 5MB to save disk space
        backupCount=3  # Reduced to 3 backups
    )
    file_handler.setFormatter(log_formatter)
    
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)  # Reduced to INFO to minimize logging overhead
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

logger = setup_logging()

# Metrics setup (matching Node.js Prometheus metrics in api.js)
PREDICTION_LATENCY = Histogram('prediction_latency_seconds', 'Time spent processing predictions')
MODEL_ACCURACY = Gauge('model_accuracy', 'Model accuracy by league', ['league'])
PREDICTION_COUNTER = Counter('predictions_total', 'Total number of predictions', ['league', 'type'])
ERROR_COUNTER = Counter('prediction_errors_total', 'Total number of prediction errors', ['type'])

@dataclass
class PredictionRequest:
    league: str
    prediction_type: str
    input_data: Dict
    factors: Optional[List[Dict]] = None

class MemoryMonitor:
    def __init__(self, threshold_mb: int = 800):  # Reduced to lower memory threshold
        self.threshold_mb = threshold_mb
        self.process = psutil.Process()
    
    def check_memory(self) -> bool:
        try:
            memory_info = self.process.memory_info()
            if memory_info.rss > self.threshold_mb * 1024 * 1024:
                gc.collect()
                logger.warning('High memory usage detected, triggering garbage collection')
                return True
            return False
        except Exception as e:
            logger.error(f"Memory check failed: {str(e)}")
            return False

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, reset_timeout: int = 120):  # Reduced failure threshold
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.failures = 0
        self.last_failure_time = None
        self.state = "CLOSED"

    def record_failure(self):
        self.failures += 1
        self.last_failure_time = datetime.now()
        if self.failures >= self.failure_threshold:
            self.state = "OPEN"
            logger.warning(f"Circuit breaker opened after {self.failures} failures")

    def record_success(self):
        self.failures = 0
        self.state = "CLOSED"
        logger.info("Circuit breaker closed after successful operation")

    def can_execute(self) -> bool:
        if self.state == "OPEN":
            if (datetime.now() - self.last_failure_time).seconds >= self.reset_timeout:
                self.state = "HALF_OPEN"
                logger.info("Circuit breaker transitioning to half-open state")
                return True
            logger.warning("Circuit breaker is open, operation blocked")
            return False
        return True

class ModelCache:
    def __init__(self):
        self.cache = TTLCache(maxsize=50, ttl=int(os.getenv('CACHE_TTL', 1800)))  # Reduced size and TTL to 30 minutes
        self.prediction_cache = LRUCache(maxsize=500)  # Reduced size
    
    def get_model(self, league: str):
        return self.cache.get(league)
    
    def set_model(self, league: str, model):
        self.cache[league] = model
    
    def get_prediction(self, key: str):
        return self.prediction_cache.get(key)
    
    def set_prediction(self, key: str, prediction):
        self.prediction_cache[key] = prediction

class TheAnalyzerPredictiveModel:
    """Initialize the enhanced predictive model with advanced ML capabilities and performance optimizations"""
    def __init__(self):
        self.SUPPORTED_LEAGUES = [
            'NFL', 'NBA', 'MLB', 'NHL',
            'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
        ]
        self.PREDICTION_TYPES = {
            'SINGLE_FACTOR': 'single_factor',
            'MULTI_FACTOR': 'multi_factor',
            'PLAYER_STATS': 'player_stats',
            'TEAM_PERFORMANCE': 'team_performance',
            'GAME_OUTCOME': 'game_outcome',
            'REAL_TIME': 'real_time',
            'ADVANCED_ANALYTICS': 'advanced_analytics'
        }

        # Initialize models and caches with reduced sizes
        self.models = {}
        self.streaming_models = {}
        self.ensemble_models = {}
        self.feature_importance = {}
        self.model_versions = {}
        self.performance_history = {}
        self.last_training_time = {}
        self.training_frequency = {
            league: {
                'base_days': 14,  # Increased to reduce frequency
                'performance_threshold': 0.85,
                'min_days': 7,  # Increased to reduce frequency
                'max_days': 30  # Increased to reduce frequency
            } for league in self.SUPPORTED_LEAGUES
        }
        self.xgb_models = {}
        self.lgb_models = {}
        self.model_cache = ModelCache()
        self.streaming_queue = None  # Initialize as None, set in predict if needed
        self.executor = ThreadPoolExecutor(max_workers=2)  # Reduced to lower CPU usage
        self.circuit_breaker = CircuitBreaker(failure_threshold=3, reset_timeout=120)  # Adjusted for stability
        self.memory_monitor = MemoryMonitor(threshold_mb=800)

        # MongoDB connection
        mongodb_uri = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sports-analytics')
        self.client = pymongo.MongoClient(mongodb_uri, 
                                         maxPoolSize=int(os.getenv('DB_MAX_POOL_SIZE', 50)),  # Reduced
                                         minPoolSize=int(os.getenv('DB_MIN_POOL_SIZE', 10)),  # Reduced
                                         connectTimeoutMS=int(os.getenv('CONNECT_TIMEOUT_MS', 30000)),
                                         socketTimeoutMS=int(os.getenv('SOCKET_TIMEOUT_MS', 45000)))
        self.db = self.client[os.getenv('MONGODB_DB_NAME', 'sports-analytics')]
        self._verify_mongodb_connection()

        # Redis connection
        redis_host = os.getenv('REDIS_HOST', 'localhost')
        redis_port = int(os.getenv('REDIS_PORT', 6379))
        redis_password = os.getenv('REDIS_PASSWORD', '')
        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_password,
            decode_responses=True,
            socket_timeout=int(os.getenv('REDIS_CONNECT_TIMEOUT', 10000)),
            retry_on_timeout=True,
            max_connections=10  # Reduced to lower resource usage
        )

        # Initialize monitoring with reduced frequency
        self._start_monitoring()

    def _verify_mongodb_connection(self):
        try:
            self.client.admin.command('ping')
            logger.info("MongoDB connection verified successfully")
        except ConnectionFailure as e:
            logger.error(f"MongoDB connection failed: {str(e)}")
            raise

    def _start_monitoring(self):
        def monitor_resources():
            while True:
                if self.memory_monitor.check_memory():
                    logger.warning("High memory usage detected, triggering garbage collection")
                time.sleep(300)  # Increased to 5 minutes to reduce CPU usage

        import threading
        threading.Thread(target=monitor_resources, daemon=True).start()

    def _verify_python_environment(self):
        """Verify Python environment and required components"""
        try:
            # Check Python version
            python_version = sys.version_info
            if python_version.major < 3 or (python_version.major == 3 and python_version.minor < 8):
                return {"status": "error", "message": f"Python 3.8+ required, found {python_version.major}.{python_version.minor}"}
            
            # Check required libraries
            required_libs = {
                'numpy': np, 'pandas': pd, 'sklearn': None, 'xgboost': xgb,
                'lightgbm': lgb, 'pymongo': pymongo
            }
            for lib, module in required_libs.items():
                try:
                    if module is None:
                        __import__(lib)
                    logger.debug(f"Verified {lib} is installed")
                except ImportError as e:
                    return {"status": "error", "message": f"Missing dependency: {lib} - {str(e)}"}
            
            return {"status": "ok"}
        except Exception as e:
            logger.error(f"Python environment verification failed: {str(e)}")
            return {"status": "error", "message": str(e)}

    def predict(self, prediction_request_json: str):
        """Enhanced prediction with comprehensive output, handling JSON input from Node.js"""
        try:
            # Parse JSON input from Node.js
            prediction_request = json.loads(prediction_request_json)
            request = PredictionRequest(
                league=prediction_request.get('league', ''),  # Default to empty string if not provided
                prediction_type=prediction_request.get('prediction_type', ''),
                input_data=prediction_request.get('input_data', {}),
                factors=prediction_request.get('factors', None)
            )

            # Validate request with more detailed logging and throttling
            try:
                self._validate_request(request)
            except ValueError as e:
                logger.error(f"Validation error: {str(e)} - Request: {prediction_request}")
                ERROR_COUNTER.labels(type='validation').inc()
                return {
                    "error": str(e),
                    "type": "ValidationError",
                    "metadata": {
                        "timestamp": datetime.now().isoformat(),
                        "input": prediction_request
                    }
                }

            # Check circuit breaker
            if not self.circuit_breaker.can_execute():
                raise Exception("Circuit breaker is open")
            
            # Check cache with throttling
            cache_key = self._generate_cache_key(request)
            cached_result = self.model_cache.get_prediction(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for prediction: {cache_key}")
                PREDICTION_COUNTER.labels(league=request.league, type=request.prediction_type).inc()
                return cached_result

            # Add prediction throttling
            last_prediction = self.redis_client.get(f"lastPrediction:{request.league}")
            if last_prediction and (datetime.now() - datetime.fromtimestamp(float(last_prediction))).seconds < 5:  # 5-second cooldown
                raise ValueError("Prediction rate limit exceeded")

            # Process prediction
            result = self._process_prediction(request)
            
            # Update metrics and cache
            PREDICTION_COUNTER.labels(league=request.league, type=request.prediction_type).inc()
            self.model_cache.set_prediction(cache_key, result)
            self.redis_client.set(f"lastPrediction:{request.league}", datetime.now().timestamp(), ex=300)  # 5-minute TTL

            self.circuit_breaker.record_success()
            return result
            
        except Exception as e:
            logger.error(f"Prediction error: {str(e)} - Input: {prediction_request_json}")
            ERROR_COUNTER.labels(type='prediction').inc()
            self.circuit_breaker.record_failure()
            return {
                "error": str(e),
                "type": type(e).__name__,
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "input": prediction_request_json
                }
            }

    def _validate_request(self, prediction_request):
        """Validate incoming prediction request"""
        if not prediction_request.league or not prediction_request.league.strip():
            raise ValueError("League is required and cannot be empty")
        
        if prediction_request.league not in self.SUPPORTED_LEAGUES:
            raise ValueError(f"Unsupported league: {prediction_request.league}")
        
        if not prediction_request.prediction_type or not prediction_request.prediction_type.strip():
            raise ValueError("Prediction type is required and cannot be empty")
        
        if prediction_request.prediction_type not in self.PREDICTION_TYPES.values():
            raise ValueError(f"Unsupported prediction type: {prediction_request.prediction_type}")

        if not prediction_request.input_data or not isinstance(prediction_request.input_data, dict):
            raise ValueError("Input data is required and must be a dictionary")

    def _generate_cache_key(self, prediction_request):
        """Generate a unique cache key for a prediction request"""
        return f"pred:{prediction_request.league}:{hash(str(prediction_request.input_data))}"

    def _process_prediction(self, request: PredictionRequest):
        """Process prediction request with enhanced features, synchronously"""
        try:
            if request.prediction_type == 'health_check':
                return self._verify_python_environment()
            elif request.prediction_type == self.PREDICTION_TYPES['SINGLE_FACTOR']:
                return self._single_factor_prediction(request.league, request.input_data)
            elif request.prediction_type == self.PREDICTION_TYPES['MULTI_FACTOR']:
                return self._multi_factor_prediction(request.league, request.factors)
            elif request.prediction_type == self.PREDICTION_TYPES['REAL_TIME']:
                return self._real_time_prediction(request.league, request.input_data)
            else:
                return self._advanced_prediction(request.league, request.input_data)
        except Exception as e:
            logger.error(f"Prediction processing error: {str(e)}")
            raise

    def _single_factor_prediction(self, league, input_data):
        """Perform single factor prediction with enhanced features, synchronously"""
        try:
            model = self.models.get(league)
            if not model:
                if not self._needs_training(league, force=False):  # Check before training
                    return self.model_cache.get_prediction(self._generate_cache_key(PredictionRequest(league, 'SINGLE_FACTOR', input_data, None))) or {}
                model = self._train_model(league)

            # Ensure input_data is a DataFrame
            df = pd.DataFrame([input_data])
            prediction = model.predict(df)[0]
            probabilities = model.predict_proba(df)[0]
            
            result = {
                'mainPrediction': prediction,
                'confidenceScore': float(max(probabilities) * 100),
                'insights': self._generate_insights(league, input_data),
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'modelVersion': self.model_versions.get(league, '1.0.0'),
                    'dataPoints': len(input_data)
                }
            }

            PREDICTION_LATENCY.observe(min(1.0, (datetime.now() - datetime.fromtimestamp(0)).total_seconds()))  # Cap latency metric
            return result

        except Exception as e:
            logger.error(f"Single factor prediction error for {league}: {str(e)}")
            raise

    def _multi_factor_prediction(self, league, factors):
        """Perform multi-factor prediction with enhanced features, synchronously"""
        try:
            predictions = []
            weights = []

            for factor in factors:
                try:
                    pred = self._single_factor_prediction(league, factor['inputData'])
                    predictions.append(pred)
                    weights.append(factor.get('weight', 1.0))
                except Exception as e:
                    logger.error(f"Factor prediction error for {league}: {str(e)}")
                    continue

            if not predictions:
                raise ValueError("No valid predictions could be made")

            # Weighted combination of predictions
            weighted_prob = np.average(
                [p['confidenceScore'] / 100 for p in predictions],
                weights=weights
            )

            result = {
                'mainPrediction': [p['mainPrediction'] for p in predictions],
                'combinedProbability': float(weighted_prob * 100),
                'individualPredictions': predictions,
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'factorsUsed': len(predictions),
                    'totalFactors': len(factors)
                }
            }

            PREDICTION_LATENCY.observe(min(1.0, (datetime.now() - datetime.fromtimestamp(0)).total_seconds()))  # Cap latency metric
            return result

        except Exception as e:
            logger.error(f"Multi-factor prediction error for {league}: {str(e)}")
            raise

    def _real_time_prediction(self, league, input_data):
        """Perform real-time prediction with streaming data, synchronously"""
        try:
            # Create streaming queue if not already initialized
            if self.streaming_queue is None:
                self.streaming_queue = []

            # Add to streaming queue synchronously with throttling
            if len(self.streaming_queue) < 1000:  # Limit queue size
                self.streaming_queue.append({
                    'league': league,
                    'data': input_data,
                    'timestamp': datetime.now().isoformat()
                })

            # Process batch if queue size exceeds batchSize, but only every 10 seconds
            if len(self.streaming_queue) >= 50 and (datetime.now() - datetime.fromtimestamp(self.redis_client.get(f"lastStreamingBatch:{league}") or 0)).seconds >= 10:
                self._process_streaming_batch(league, self.streaming_queue[:50])
                self.streaming_queue = self.streaming_queue[50:]
                self.redis_client.set(f"lastStreamingBatch:{league}", datetime.now().timestamp(), ex=600)  # 10-minute TTL

            # Get streaming model prediction
            if league in self.streaming_models:
                df = pd.DataFrame([input_data])
                prediction = self.streaming_models[league].partial_predict(df)[0]
                return {
                    'prediction': prediction,
                    'type': 'real-time',
                    'timestamp': datetime.now().isoformat()
                }
            else:
                # Fallback to regular prediction
                return self._single_factor_prediction(league, input_data)

        except Exception as e:
            logger.error(f"Real-time prediction error for {league}: {str(e)}")
            raise

    def _advanced_prediction(self, league, input_data):
        """Perform advanced prediction with ensemble methods, synchronously"""
        try:
            # Get predictions from multiple models synchronously with throttling
            predictions = [
                self._get_base_prediction(league, input_data),
                self._get_ensemble_prediction(league, input_data),
                self._get_streaming_prediction(league, input_data)
            ]

            # Filter out None values and combine with weighted voting
            valid_predictions = [p for p in predictions if p]
            if not valid_predictions:
                raise ValueError("No valid predictions from models")

            weights = [0.4, 0.4, 0.2]  # Base, Ensemble, Streaming weights
            final_prediction = np.average(
                [p['prediction'] for p in valid_predictions],
                weights=[w for w, p in zip(weights, predictions) if p]
            )

            return {
                'prediction': float(final_prediction),
                'confidence': self._calculate_confidence(valid_predictions),
                'components': valid_predictions,
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'modelTypes': [p['type'] for p in valid_predictions],
                    'dataPoints': len(input_data)
                }
            }

        except Exception as e:
            logger.error(f"Advanced prediction error for {league}: {str(e)}")
            raise

    def _get_base_prediction(self, league, input_data):
        """Get prediction from base model, synchronously"""
        try:
            model = self.models.get(league)
            if not model:
                return None

            df = pd.DataFrame([input_data])
            prediction = model.predict(df)[0]
            return {
                'type': 'base',
                'prediction': float(prediction),
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Base prediction error for {league}: {str(e)}")
            return None

    def _get_ensemble_prediction(self, league, input_data):
        """Get prediction from ensemble model, synchronously"""
        try:
            ensemble = self.ensemble_models.get(league)
            if not ensemble:
                return None

            df = pd.DataFrame([input_data])
            prediction = ensemble.predict(df)[0]
            return {
                'type': 'ensemble',
                'prediction': float(prediction),
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Ensemble prediction error for {league}: {str(e)}")
            return None

    def _get_streaming_prediction(self, league, input_data):
        """Get prediction from streaming model, synchronously"""
        try:
            streaming_model = self.streaming_models.get(league)
            if not streaming_model:
                return None

            df = pd.DataFrame([input_data])
            prediction = streaming_model.partial_predict(df)[0]
            return {
                'type': 'streaming',
                'prediction': float(prediction),
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Streaming prediction error for {league}: {str(e)}")
            return None

    def _calculate_confidence(self, predictions):
        """Calculate confidence score from multiple predictions"""
        valid_predictions = [p for p in predictions if p]
        if not valid_predictions:
            return 0.0

        # Calculate agreement between models
        predictions_array = np.array([p['prediction'] for p in valid_predictions])
        std_dev = np.std(predictions_array)
        mean_pred = np.mean(predictions_array)
        
        # Convert standard deviation to confidence score
        confidence = 100 * (1 - min(std_dev / (mean_pred + 1e-10), 1.0))  # Add small epsilon to avoid division by zero
        return float(confidence)

    def _generate_insights(self, league, input_data):
        """Generate advanced insights from prediction data, synchronously"""
        try:
            insights = []
            
            # Feature importance analysis
            if league in self.feature_importance:
                important_features = self._get_important_features(league, input_data)
                insights.append({
                    'type': 'feature_importance',
                    'data': important_features
                })

            # Historical trend analysis
            historical_trend = self._analyze_historical_trend(league, input_data)
            if historical_trend:
                insights.append({
                    'type': 'historical_trend',
                    'data': historical_trend
                })

            # Performance metrics
            if league in self.performance_history:
                performance = self._get_performance_metrics(league)
                insights.append({
                    'type': 'performance_metrics',
                    'data': performance
                })

            return insights

        except Exception as e:
            logger.error(f"Error generating insights for {league}: {str(e)}")
            return []

    def _get_important_features(self, league, input_data):
        """Get important features for prediction"""
        feature_importance = self.feature_importance.get(league, {})
        sorted_features = sorted(
            feature_importance.items(),
            key=lambda x: x[1],
            reverse=True
        )
        return [
            {
                'feature': feature,
                'importance': float(importance),
                'value': input_data.get(feature, None)
            }
            for feature, importance in sorted_features[:5]
        ]

    def _analyze_historical_trend(self, league, input_data):
        """Analyze historical trends for prediction, synchronously"""
        try:
            collection = self.db[f"{league.lower()}_games"]
            recent_games = list(collection.find(
                {'team': input_data.get('team')},
                sort=[('date', -1)],
                limit=5  # Reduced to lower memory and CPU usage
            ))

            if not recent_games:
                return None

            return {
                'games_analyzed': len(recent_games),
                'trend': self._calculate_trend(recent_games),
                'period': '5 games'  # Updated to reflect reduced limit
            }

        except Exception as e:
            logger.error(f"Error analyzing historical trend for {league}: {str(e)}")
            return None

    def _calculate_trend(self, games):
        """Calculate trend from recent games"""
        if not games:
            return None

        scores = [game.get('score', 0) for game in games]
        if not scores:
            return None

        trend = np.polyfit(range(len(scores)), scores, 1)[0]
        
        return {
            'direction': 'up' if trend > 0 else 'down',
            'strength': abs(float(trend)),
            'confidence': min(100, max(0, float(50 + trend * 10)))
        }
   
    def _get_performance_metrics(self, league):
        """Get model performance metrics"""
        history = self.performance_history.get(league, [])
        if not history:
            return None

        recent_metrics = history[-3:]  # Reduced to lower memory usage
        if not recent_metrics:
            return None

        return {
            'accuracy': float(np.mean([m['accuracy'] for m in recent_metrics])),
            'precision': float(np.mean([m['precision'] for m in recent_metrics])),
            'recall': float(np.mean([m['recall'] for m in recent_metrics])),
            'f1_score': float(np.mean([m['f1_score'] for m in recent_metrics])),
            'trend': self._calculate_metric_trend(recent_metrics)
        }

    def _calculate_metric_trend(self, metrics):
        """Calculate trend in model metrics"""
        if not metrics:
            return None

        accuracies = [m['accuracy'] for m in metrics]
        if not accuracies:
            return None

        trend = np.polyfit(range(len(accuracies)), accuracies, 1)[0]
        
        return {
            'direction': 'improving' if trend > 0 else 'declining',
            'magnitude': float(abs(trend)),
            'significant': abs(trend) > 0.01
        }

    def _train_model(self, league, force=False):
        """Train or update model with enhanced features, synchronously with performance optimization"""
        try:
            if not force and not self._needs_training(league, force=False):
                return self.models.get(league)

            # Get training data synchronously with reduced dataset size
            X, y = self._prepare_training_data(league, limit=500)  # Reduced limit to lower CPU/memory
            
            # Create and optimize model with fewer iterations
            pipeline = self._create_advanced_pipeline(league)
            best_params = self._optimize_hyperparameters(pipeline, X, y, max_evals=20)  # Reduced max_evals
            pipeline.set_params(**best_params)
            
            # Train base model
            pipeline.fit(X, y)
            
            # XGBoost Model with reduced parameters
            xgb_model = xgb.XGBRegressor(
                n_estimators=50,  # Reduced
                learning_rate=0.1, 
                max_depth=3,  # Reduced
                objective='reg:squarederror'
            )
            xgb_model.fit(X, y)
            
            # LightGBM Model with reduced parameters
            lgb_model = lgb.LGBMRegressor(
                n_estimators=50,  # Reduced
                learning_rate=0.1,
                max_depth=3,  # Reduced
                objective='regression'
            )
            lgb_model.fit(X, y)
            
            # Update model metadata
            self.feature_importance[league] = self._calculate_feature_importance(pipeline, X.columns)
            self.models[league] = pipeline
            self.xgb_models[league] = xgb_model
            self.lgb_models[league] = lgb_model
            
            self.last_training_time[league] = datetime.now()
            self.model_versions[league] = '1.0.0'  # Update version as needed
            
            # Track performance
            self._track_model_performance(league, pipeline, X, y)
            
            # Update streaming model
            self._update_streaming_model(league, X, y)
            
            logger.info(f"Model trained successfully for {league}")
            return pipeline
            
        except Exception as e:
            logger.error(f"Error training model for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='training').inc()
            raise

    def _needs_training(self, league, force=False):
        """Determine if a model needs retraining with reduced frequency"""
        if league not in self.last_training_time or force:
            return True
        
        training_config = self.training_frequency.get(league, {
            'base_days': 14,
            'performance_threshold': 0.85,
            'min_days': 7,
            'max_days': 30
        })
        
        days_since_training = (datetime.now() - self.last_training_time.get(league, datetime.min)).days
        
        if days_since_training >= training_config['base_days']:
            return True
        
        if league in self.performance_history:
            recent_performance = self.performance_history[league][-1]['accuracy'] if self.performance_history[league] else 0
            if recent_performance < training_config['performance_threshold']:
                return True
        
        return False

    def _prepare_training_data(self, league, limit=500):
        """Prepare training data for a specific league, synchronously with reduced dataset size"""
        try:
            collection = self.db[f"{league.lower()}_games"]
            
            games = list(collection.find(
                {'status': 'completed'},
                sort=[('date', -1)],
                limit=limit  # Reduced to lower memory and CPU usage
            ))

            if not games:
                raise ValueError(f"No training data available for {league}")
            
            df = pd.DataFrame(games)
            features = self._extract_features(df)
            target = self._prepare_target(df)
            
            return features, target
        
        except Exception as e:
            logger.error(f"Error preparing training data for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='data_preparation').inc()
            raise

    def _extract_features(self, df):
        """Extract features from the DataFrame with optimization"""
        try:
            features = df.drop(['target', '_id', 'date'], axis=1, errors='ignore')
            
            numeric_features = features.select_dtypes(include=['int64', 'float64']).columns.tolist()[:10]  # Limit to top 10 numeric features
            categorical_features = features.select_dtypes(include=['object', 'category']).columns.tolist()[:5]  # Limit to top 5 categorical features
            
            preprocessor = ColumnTransformer(
                transformers=[
                    ('num', StandardScaler(), numeric_features),
                    ('cat', OneHotEncoder(handle_unknown='ignore', sparse=False), categorical_features)
                ])
            
            X = preprocessor.fit_transform(features)
            return X
        except Exception as e:
            logger.error(f"Error extracting features: {str(e)}")
            raise

    def _prepare_target(self, df):
        """Prepare target variable for training"""
        try:
            if 'target' in df.columns:
                return df['target']
            elif 'score' in df.columns:
                return df['score']
            else:
                raise ValueError("No suitable target variable found")
        except Exception as e:
            logger.error(f"Error preparing target variable: {str(e)}")
            raise

    def _create_advanced_pipeline(self, league):
        """Create an advanced machine learning pipeline with reduced complexity"""
        try:
            base_estimator = RandomForestClassifier(
                n_estimators=50,  # Reduced
                max_depth=3,  # Reduced
                random_state=42
            )
            
            feature_selector = SelectFromModel(
                GradientBoostingRegressor(n_estimators=50, random_state=42)  # Reduced
            )
            
            pipeline = Pipeline([
                ('selector', feature_selector),
                ('classifier', base_estimator)
            ])
            
            return pipeline
        
        except Exception as e:
            logger.error(f"Error creating advanced pipeline for {league}: {str(e)}")
            raise

    def _optimize_hyperparameters(self, pipeline, X, y, max_evals=20):
        """Optimize hyperparameters using Hyperopt, synchronously with reduced iterations"""
        try:
            space = {
                'classifier__n_estimators': hp.quniform('n_estimators', 20, 100, 10),  # Reduced range
                'classifier__max_depth': hp.quniform('max_depth', 2, 5, 1),  # Reduced range
                'classifier__min_samples_split': hp.quniform('min_samples_split', 2, 5, 1),  # Reduced range
                'classifier__min_samples_leaf': hp.quniform('min_samples_leaf', 1, 3, 1)  # Reduced range
            }
            
            def objective(params):
                pipeline.set_params(
                    classifier__n_estimators=int(params['n_estimators']),
                    classifier__max_depth=int(params['max_depth']),
                    classifier__min_samples_split=int(params['min_samples_split']),
                    classifier__min_samples_leaf=int(params['min_samples_leaf'])
                )
                
                scores = cross_val_score(pipeline, X, y, cv=3)  # Reduced CV folds
                return {'loss': -scores.mean(), 'status': STATUS_OK}
            
            trials = Trials()
            best = fmin(
                fn=objective,
                space=space,
                algo=tpe.suggest,
                max_evals=max_evals,
                trials=trials
            )
            
            best_params = {
                'classifier__n_estimators': int(best['n_estimators']),
                'classifier__max_depth': int(best['max_depth']),
                'classifier__min_samples_split': int(best['min_samples_split']),
                'classifier__min_samples_leaf': int(best['min_samples_leaf'])
            }
            
            return best_params
        
        except Exception as e:
            logger.error(f"Hyperparameter optimization error: {str(e)}")
            return {
                'classifier__n_estimators': 50,
                'classifier__max_depth': 3,
                'classifier__min_samples_split': 2,
                'classifier__min_samples_leaf': 1
            }

    def _calculate_feature_importance(self, pipeline, feature_names):
        """Calculate and return feature importance with optimization"""
        try:
            estimator = pipeline.named_steps['classifier']
            
            if hasattr(estimator, 'feature_importances_'):
                importances = estimator.feature_importances_
            elif hasattr(estimator, 'coef_'):
                importances = np.abs(estimator.coef_[0])
            else:
                return {}
            
            feature_importance = dict(zip(feature_names[:10], importances[:10]))  # Limit to top 10 features
            sorted_importance = dict(
                sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
            )
            
            return sorted_importance
        
        except Exception as e:
            logger.error(f"Feature importance calculation error: {str(e)}")
            return {}

    def _track_model_performance(self, league, model, X, y):
        """Track and log model performance metrics, synchronously with reduced data"""
        try:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.1, random_state=42)  # Reduced test size
            y_pred = model.predict(X_test)
            
            performance = {
                'accuracy': accuracy_score(y_test, y_pred),
                'precision': precision_score(y_test, y_pred, average='weighted', zero_division=0),
                'recall': recall_score(y_test, y_pred, average='weighted', zero_division=0),
                'f1_score': f1_score(y_test, y_pred, average='weighted', zero_division=0),
                'confusion_matrix': confusion_matrix(y_test, y_pred).tolist(),
                'timestamp': datetime.now().isoformat()
            }
            
            if league not in self.performance_history:
                self.performance_history[league] = []
            
            self.performance_history[league].append(performance)
            
            if len(self.performance_history[league]) > 3:  # Reduced history size
                self.performance_history[league] = self.performance_history[league][-3:]
            
            MODEL_ACCURACY.labels(league=league).set(performance['accuracy'])
            logger.info(f"Tracked performance for {league}: {performance}")
            
            return performance
        
        except Exception as e:
            logger.error(f"Model performance tracking error for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='performance_tracking').inc()
            return {}

    def _update_streaming_model(self, league, X, y):
        """Update streaming model with new data, synchronously with optimization"""
        try:
            if league not in self.streaming_models:
                self.streaming_models[league] = self._create_streaming_model()
            
            # Partial fit with batching to reduce CPU usage
            batch_size = 50  # Reduced batch size
            for i in range(0, len(X), batch_size):
                self.streaming_models[league].partial_fit(X[i:i + batch_size], y[i:i + batch_size])
            logger.info(f"Updated streaming model for {league}")
        
        except Exception as e:
            logger.error(f"Error updating streaming model for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='streaming_update').inc()

    def _create_streaming_model(self):
        """Create a model suitable for streaming data with reduced complexity"""
        try:
            return Pipeline([
                ('scaler', StandardScaler()),
                ('classifier', SGDClassifier(
                    loss='log',
                    learning_rate='adaptive',
                    max_iter=500,  # Reduced
                    tol=1e-2,  # Increased tolerance for faster convergence
                    random_state=42
                ))
            ])
        except Exception as e:
            logger.error(f"Error creating streaming model: {str(e)}")
            raise

    def _process_streaming_batch(self, league, data):
        """Process a batch of streaming data, synchronously with optimization"""
        try:
            if len(data) > 50:  # Limit batch size
                data = data[:50]
            
            df = pd.DataFrame([d['data'] for d in data])
            if league in self.streaming_models:
                predictions = self.streaming_models[league].partial_predict(df)
                for pred, item in zip(predictions, data):
                    self.redis_client.set(f"{os.getenv('REDIS_CACHE_PREFIX', 'sportanalytics:')}streaming:{league}:{item['timestamp']}", json.dumps(pred), ex=300)  # 5-minute TTL
                    logger.debug(f"Streaming prediction cached for {league} at {item['timestamp']}")
        except Exception as e:
            logger.error(f"Streaming batch processing error for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='streaming_batch').inc()

    def cleanup(self):
        """Comprehensive cleanup of resources, synchronously with optimization"""
        try:
            # Close database connection
            if hasattr(self, 'client'):
                self.client.close()
                logger.info("MongoDB connection closed")

            # Close Redis connection
            if hasattr(self, 'redis_client'):
                self.redis_client.close()
                logger.info("Redis connection closed")

            # Clear caches
            self.model_cache.cache.clear()
            self.model_cache.prediction_cache.clear()
            logger.info("Model and prediction caches cleared")

            # Stop streaming (if queue exists)
            if self.streaming_queue is not None:
                self.streaming_queue = []
                logger.info("Streaming queue cleared")

            # Cleanup executor
            self.executor.shutdown(wait=True, cancel_futures=True)
            logger.info("Thread pool executor shut down")

            # Force garbage collection
            gc.collect()
            logger.info("Garbage collection completed")

            logger.info("Cleanup completed successfully")

        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")
            raise

# Main execution block for direct script execution (e.g., testing)
if __name__ == "__main__":
    try:
        # Initialize signal handlers for direct execution
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}")
            if 'model' in locals():
                model.cleanup()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        # Create model instance
        model = TheAnalyzerPredictiveModel()

        if len(sys.argv) > 1:
            try:
                input_data = json.loads(sys.argv[1])

                if input_data.get('type') == 'environment_check':
                    result = model._verify_python_environment()
                    print(json.dumps(result))
                else:
                    # Run prediction synchronously for direct execution
                    result = model.predict(json.dumps(input_data))
                    print(json.dumps(result))

            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON input: {str(e)}")
                print(json.dumps({
                    "error": "Invalid JSON input",
                    "type": "JSONDecodeError"
                }))
                sys.exit(1)
            except Exception as e:
                logger.error(f"Prediction error in main: {str(e)}")
                print(json.dumps({
                    "error": str(e),
                    "type": type(e).__name__
                }))
                sys.exit(1)
        else:
            logger.error("No input provided")
            print(json.dumps({
                "error": "No input provided",
                "type": "NoInputError"
            }))
            sys.exit(1)
    except Exception as e:
        logger.error(f"Error in main execution: {str(e)}")
        print(json.dumps({
            "error": str(e),
            "type": type(e).__name__
        }))
        sys.exit(1)