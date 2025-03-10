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
from sklearn.base import BaseEstimator, TransformerMixin, clone
from sklearn.exceptions import NotFittedError
from sklearn.linear_model import SGDClassifier
import requests
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
        maxBytes=5*1024*1024,  # 5MB to save disk space
        backupCount=3
    )
    file_handler.setFormatter(log_formatter)
    
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

logger = setup_logging()

# Metrics setup (matching Node.js Prometheus metrics in api.js)
PREDICTION_LATENCY = Histogram('prediction_latency_seconds', 'Time spent processing predictions')
MODEL_ACCURACY = Gauge('model_accuracy', 'Model accuracy by league', ['league'])
PREDICTION_COUNTER = Counter('predictions_total', 'Total number of predictions', ['league', 'type'])
ERROR_COUNTER = Counter('prediction_errors_total', 'Total number of prediction errors', ['type'])

# Custom streaming classifier with partial_predict capability
class StreamingClassifier(SGDClassifier):
    """Extended SGDClassifier with partial_predict method for streaming predictions"""

    def partial_fit(self, X, y, classes=None, sample_weight=None):
        """Wrapper around SGDClassifier's partial_fit"""
        return super().partial_fit(X, y, classes=classes, sample_weight=sample_weight)

    def partial_predict(self, X):
        """Make predictions on streaming data"""
        try:
            return self.predict(X)
        except NotFittedError:
            # Return default predictions if model is not fitted yet
            return np.zeros(len(X))

# Custom pipeline with partial_fit and partial_predict capabilities
class StreamingPipeline(Pipeline):
    """Extended Pipeline with streaming capabilities"""

    def partial_fit(self, X, y, classes=None, sample_weight=None):
        """Implement partial_fit for the pipeline"""
        Xt = X
        for name, transform in self.steps[:-1]:
            if hasattr(transform, "fit_transform"):
                Xt = transform.fit_transform(Xt)
            else:
                Xt = transform.fit(Xt).transform(Xt)

        final_step_name = self.steps[-1][0]
        final_estimator = self.steps[-1][1]

        if hasattr(final_estimator, "partial_fit"):
            final_estimator.partial_fit(Xt, y, classes, sample_weight)
        else:
            final_estimator.fit(Xt, y, sample_weight)

        return self

    def partial_predict(self, X):
        """Implement partial_predict for the pipeline"""
        Xt = X
        for name, transform in self.steps[:-1]:
            if transform is not None:
                Xt = transform.transform(Xt)

        final_step_name = self.steps[-1][0]
        final_estimator = self.steps[-1][1]

        if hasattr(final_estimator, "partial_predict"):
            return final_estimator.partial_predict(Xt)
        else:
            try:
                return final_estimator.predict(Xt)
            except NotFittedError:
                return np.zeros(len(X))

@dataclass
class PredictionRequest:
    league: str
    prediction_type: str
    input_data: Dict
    factors: Optional[List[Dict]] = None

class MemoryMonitor:
    def __init__(self, threshold_mb: int = 800):
        self.threshold_mb = threshold_mb
        self.process = psutil.Process()
        self.consecutive_checks = 0
        self.last_check_time = time.time()
        self.check_interval = 60
        self.last_gc_time = 0
        self.gc_interval = 300

        # Initialize with a garbage collection
        gc.collect()
        logger.info(f"Initial garbage collection performed during startup")

    def check_memory(self) -> bool:
        current_time = time.time()
        if current_time - self.last_check_time < self.check_interval:
            return False

        self.last_check_time = current_time

        try:
            memory_info = self.process.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)

            logger.debug(f"Memory usage: {memory_mb:.1f}MB (threshold: {self.threshold_mb}MB)")

            if memory_mb > self.threshold_mb:
                self.consecutive_checks += 1

                if current_time - self.last_gc_time > self.gc_interval:
                    gc.collect(2)
                    self.last_gc_time = current_time
                    self._clear_caches()
                    logger.warning(f'High memory usage detected ({memory_mb:.1f}MB), triggered garbage collection')
                    self.consecutive_checks = 0

                if memory_mb > self.threshold_mb * 1.5:
                    logger.error(f'Critical memory usage detected ({memory_mb:.1f}MB), performing emergency cleanup')
                    gc.collect(2)
                    self._clear_caches()
                    for module_name in list(sys.modules.keys()):
                        if module_name not in ('os', 'sys', 'gc', 'time', 'logging', 'psutil'):
                            if module_name in sys.modules:
                                try:
                                    del sys.modules[module_name]
                                except:
                                    pass

                return True
            else:
                self.consecutive_checks = 0
            return False
        except Exception as e:
            logger.error(f"Memory check failed: {str(e)}")
            return False

    def _clear_caches(self):
        if hasattr(pd, '_libs') and hasattr(pd._libs, 'hashtable'):
            if hasattr(pd._libs.hashtable, '_clear_caches'):
                pd._libs.hashtable._clear_caches()

        if hasattr(np, 'core') and hasattr(np.core, '_multiarray_umath'):
            if hasattr(np.core._multiarray_umath, '_clear_caches'):
                np.core._multiarray_umath._clear_caches()

        for name in list(globals().keys()):
            if name.startswith('_cache_') or name.endswith('_cache'):
                globals()[name] = None

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, reset_timeout: int = 120):
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
        self.cache = TTLCache(maxsize=50, ttl=int(os.getenv('CACHE_TTL', 1800)))
        self.prediction_cache = LRUCache(maxsize=500)
    
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
        self.LEAGUE_IDS = {
            'NFL': '4391',
            'NBA': '4387',
            'MLB': '4424',
            'NHL': '4380',
            'PREMIER_LEAGUE': '4328',
            'LA_LIGA': '4335',
            'BUNDESLIGA': '4331',
            'SERIE_A': '4332'
        }
        self.SPORT_MAPPING = {
            'NFL': 'Football',
            'NBA': 'Basketball',
            'MLB': 'Baseball',
            'NHL': 'Hockey',
            'PREMIER_LEAGUE': 'Soccer',
            'LA_LIGA': 'Soccer',
            'BUNDESLIGA': 'Soccer',
            'SERIE_A': 'Soccer'
        }

        # Initialize models and caches
        self.models = {}
        self.streaming_models = {}
        self.ensemble_models = {}
        self.feature_importance = {}
        self.model_versions = {}
        self.performance_history = {}
        self.last_training_time = {}
        self.training_frequency = {
            league: {
                'base_days': 14,
                'performance_threshold': 0.85,
                'min_days': 7,
                'max_days': 30
            } for league in self.SUPPORTED_LEAGUES
        }
        self.xgb_models = {}
        self.lgb_models = {}
        self.model_cache = ModelCache()
        self.streaming_queue = None
        self.executor = ThreadPoolExecutor(max_workers=2)
        self.circuit_breaker = CircuitBreaker(failure_threshold=3, reset_timeout=120)
        self.memory_monitor = MemoryMonitor(threshold_mb=800)

        # MongoDB connection
        mongodb_uri = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sports-analytics')
        self.client = pymongo.MongoClient(mongodb_uri,
                                         maxPoolSize=int(os.getenv('DB_MAX_POOL_SIZE', 10)),
                                         minPoolSize=int(os.getenv('DB_MIN_POOL_SIZE', 1)),
                                         connectTimeoutMS=int(os.getenv('CONNECT_TIMEOUT_MS', 5000)),
                                         socketTimeoutMS=int(os.getenv('SOCKET_TIMEOUT_MS', 10000)),
                                         serverSelectionTimeoutMS=5000,
                                         waitQueueTimeoutMS=1000,
                                         retryWrites=True,
                                         w=1)
        self.db = self.client[os.getenv('MONGODB_DB_NAME', 'sports-analytics')]
        self._verify_mongodb_connection()

        # Redis connection
        try:
            redis_host = os.getenv('REDIS_HOST', 'localhost')
            redis_port = int(os.getenv('REDIS_PORT', 6379))
            redis_password = os.getenv('REDIS_PASSWORD', '')

            use_redis = os.getenv('USE_REDIS', 'true').lower() == 'true'

            if use_redis:
                self.redis_client = redis.Redis(
                    host=redis_host,
                    port=redis_port,
                    password=redis_password,
                    decode_responses=True,
                    socket_timeout=int(os.getenv('REDIS_CONNECT_TIMEOUT', 3000)),
                    socket_connect_timeout=2000,
                    retry_on_timeout=True,
                    health_check_interval=30,
                    max_connections=5,
                    client_name='predictive_model_py'
                )
                self.redis_client.ping()
                logger.info("Redis connection successful")
            else:
                logger.info("Redis disabled by configuration. Using in-memory cache.")
                self.redis_client = None
        except (redis.ConnectionError, redis.TimeoutError) as e:
            logger.warning(f"Redis connection failed: {str(e)}. Using in-memory cache.")
            self.redis_client = None
        except Exception as e:
            logger.error(f"Error initializing Redis: {str(e)}")
            self.redis_client = None

        # Initialize monitoring
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
            time.sleep(300)  # Wait 5 minutes before first check
            while True:
                try:
                    self.memory_monitor.check_memory()
                    time.sleep(1800)  # Check every 30 minutes
                except Exception as e:
                    logger.error(f"Error in memory monitoring thread: {str(e)}")
                    time.sleep(300)

        import threading
        monitor_thread = threading.Thread(target=monitor_resources, daemon=True)
        monitor_thread.name = "MemoryMonitorThread"
        monitor_thread.start()
        logger.info("Memory monitoring started with 30-minute interval")

    def _verify_python_environment(self):
        """Verify Python environment and required components"""
        try:
            python_version = sys.version_info
            if (python_version.major < 3 or 
                (python_version.major == 3 and python_version.minor < 8)):
                return {"status": "error", "message": f"Python 3.8+ required, found {python_version.major}.{python_version.minor}"}
            
            required_libs = {
                'numpy': np, 'pandas': pd, 'sklearn': None, 'xgboost': xgb,
                'lightgbm': lgb, 'pymongo': pymongo, 'requests': requests
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

  # Around line 644-675 in the fetch_sportsdb_data method
def fetch_sportsdb_data(self, endpoint, use_v2=True, params=None):
    api_key = os.getenv('THESPORTSDB_API_KEY', '447279')  # Added default from screenshot
    if not api_key:
        raise ValueError("TheSportsDB API key not found in environment variables")

    try:
        if use_v2:
            url = f"https://www.thesportsdb.com/api/v2/json/{endpoint}"
            headers = {'X-API-KEY': api_key}
            response = requests.get(url, headers=headers, params=params, timeout=10)
        else:
            params = params or {}
            url = f"https://www.thesportsdb.com/api/v1/json/{api_key}/{endpoint}"
            response = requests.get(url, params=params, timeout=10)

        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Error fetching SportsDB data: {str(e)}")
        ERROR_COUNTER.labels(type='api_fetch').inc()
        raise

    def fetch_historical_events(self, league, season="2023-2024"):
        try:
            league_id = self.LEAGUE_IDS.get(league)
            if not league_id:
                raise ValueError(f"Unsupported league: {league}")

            endpoint = "eventsseason.php"
            params = {'id': league_id, 's': season}
            data = self.fetch_sportsdb_data(endpoint, use_v2=False, params=params)
            events = data.get('events', [])
            logger.info(f"Fetched {len(events)} historical events for league {league} ({league_id}), season {season}")

            if events:
                collection_name = f"{league.lower()}_games"
                self.db[collection_name].insert_many(events, ordered=False)
                logger.info(f"Stored {len(events)} events in MongoDB collection {collection_name}")

            return events
        except Exception as e:
            logger.error(f"Error fetching historical events for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='api_fetch').inc()
            raise

    def fetch_live_scores(self, sport):
        try:
            endpoint = f"livescore/{sport}"
            data = self.fetch_sportsdb_data(endpoint, use_v2=True)
            events = data.get('events', [])
            logger.info(f"Fetched {len(events)} live {sport} events")

            if events:
                self.db['live_scores'].insert_many(events, ordered=False)
                logger.info(f"Stored {len(events)} live {sport} events in MongoDB")

            return events
        except Exception as e:
            logger.error(f"Error fetching live scores for {sport}: {str(e)}")
            ERROR_COUNTER.labels(type='api_fetch').inc()
            raise

    def predict(self, prediction_request_json: str):
        """Enhanced prediction with comprehensive output, handling JSON input from Node.js"""
        try:
            prediction_request = json.loads(prediction_request_json)
            request = PredictionRequest(
                league=prediction_request.get('league', ''),
                prediction_type=prediction_request.get('prediction_type', ''),
                input_data=prediction_request.get('input_data', {}),
                factors=prediction_request.get('factors', None)
            )

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

            if not self.circuit_breaker.can_execute():
                raise Exception("Circuit breaker is open")
            
            cache_key = self._generate_cache_key(request)
            cached_result = self.model_cache.get_prediction(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for prediction: {cache_key}")
                PREDICTION_COUNTER.labels(league=request.league, type=request.prediction_type).inc()
                return cached_result

            if self.redis_client:
                last_prediction = self.redis_client.get(f"lastPrediction:{request.league}")
                if last_prediction and (datetime.now() - datetime.fromtimestamp(float(last_prediction))).seconds < 5:
                    raise ValueError("Prediction rate limit exceeded")

            result = self._process_prediction(request)
            
            PREDICTION_COUNTER.labels(league=request.league, type=request.prediction_type).inc()
            self.model_cache.set_prediction(cache_key, result)
            if self.redis_client:
                self.redis_client.set(f"lastPrediction:{request.league}", datetime.now().timestamp(), ex=300)

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
        """Process prediction request with enhanced features"""
        try:
            if request.prediction_type == 'health_check':
                return self._verify_python_environment()
            elif request.prediction_type == self.PREDICTION_TYPES['SINGLE_FACTOR']:
                return self._single_factor_prediction(request.league, request.input_data)
            elif request.prediction_type == self.PREDICTION_TYPES['MULTI_FACTOR']:
                return self._multi_factor_prediction(request.league, request.factors)
            elif request.prediction_type == self.PREDICTION_TYPES['REAL_TIME']:
                return self._real_time_prediction(request.league, request.input_data)
            elif request.prediction_type == self.PREDICTION_TYPES['PLAYER_STATS']:
                return self._player_stats_prediction(request.league, request.input_data)
            elif request.prediction_type == self.PREDICTION_TYPES['TEAM_PERFORMANCE']:
                return self._team_performance_prediction(request.league, request.input_data)
            elif request.prediction_type == self.PREDICTION_TYPES['GAME_OUTCOME']:
                return self._game_outcome_prediction(request.league, request.input_data)
            else:
                return self._advanced_prediction(request.league, request.input_data)
        except Exception as e:
            logger.error(f"Prediction processing error: {str(e)}")
            raise

    def _single_factor_prediction(self, league, input_data):
        """Perform single factor prediction with enhanced features"""
        try:
            model = self.models.get(league)
            if not model:
                if not self._needs_training(league, force=False):
                    return self.model_cache.get_prediction(self._generate_cache_key(PredictionRequest(league, 'SINGLE_FACTOR', input_data, None))) or {}
                model = self._train_model(league)

            df = pd.DataFrame([input_data])
            prediction = model.predict(df)[0]
            probabilities = model.predict_proba(df)[0] if hasattr(model, 'predict_proba') else [0.5, 0.5]
            
            result = {
                'mainPrediction': int(prediction),
                'confidenceScore': float(max(probabilities) * 100),
                'insights': self._generate_insights(league, input_data),
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'modelVersion': self.model_versions.get(league, '1.0.0'),
                    'dataPoints': len(input_data)
                }
            }

            PREDICTION_LATENCY.observe(min(1.0, (datetime.now() - datetime.fromtimestamp(0)).total_seconds()))
            return result

        except Exception as e:
            logger.error(f"Single factor prediction error for {league}: {str(e)}")
            raise

    def _multi_factor_prediction(self, league, factors):
        """Perform multi-factor prediction with enhanced features"""
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

            PREDICTION_LATENCY.observe(min(1.0, (datetime.now() - datetime.fromtimestamp(0)).total_seconds()))
            return result

        except Exception as e:
            logger.error(f"Multi-factor prediction error for {league}: {str(e)}")
            raise

    def _real_time_prediction(self, league, input_data):
        """Perform real-time prediction with streaming data using live scores"""
        try:
            if self.streaming_queue is None:
                self.streaming_queue = []

            # Fetch recent live scores for the sport
            sport = self.SPORT_MAPPING.get(league)
            if not sport:
                raise ValueError(f"No sport mapping for league {league}")

            # Check MongoDB for recent live scores
            live_events = list(self.db['live_scores'].find(
                {'strSport': sport},
                sort=[('timestamp', -1)],
                limit=10
            ))

            # If no recent live scores, fetch them
            if not live_events:
                live_events = self.fetch_live_scores(sport)

            # Process live events into streaming queue
            for event in live_events:
                if len(self.streaming_queue) < 1000:
                    self.streaming_queue.append({
                        'league': league,
                        'data': event,
                        'timestamp': datetime.now().isoformat()
                    })

            # Process batch if queue size exceeds batchSize
            if len(self.streaming_queue) >= 50 and (datetime.now() - datetime.fromtimestamp(float(self.redis_client.get(f"lastStreamingBatch:{league}") or 0))).seconds >= 10:
                self._process_streaming_batch(league, self.streaming_queue[:50])
                self.streaming_queue = self.streaming_queue[50:]
                if self.redis_client:
                    self.redis_client.set(f"lastStreamingBatch:{league}", datetime.now().timestamp(), ex=600)

            # Get streaming model prediction
            if league in self.streaming_models:
                df = pd.DataFrame([input_data])
                prediction = self.streaming_models[league].partial_predict(df)[0]
                return {
                    'prediction': int(prediction),
                    'type': 'real-time',
                    'timestamp': datetime.now().isoformat(),
                    'liveEventsProcessed': len(live_events)
                }
            else:
                return self._single_factor_prediction(league, input_data)

        except Exception as e:
            logger.error(f"Real-time prediction error for {league}: {str(e)}")
            raise

    def _player_stats_prediction(self, league, input_data):
        """Predict based on player statistics"""
        try:
            player_id = input_data.get('playerId')
            if not player_id:
                raise ValueError("playerId is required for player_stats prediction")

            features = self._prepare_player_stats_data(player_id, league)
            model = self.models.get(league)
            if not model:
                model = self._train_model(league)

            df = pd.DataFrame([features])
            prediction = model.predict(df)[0]
            probabilities = model.predict_proba(df)[0] if hasattr(model, 'predict_proba') else [0.5, 0.5]

            return {
                'prediction': int(prediction),
                'confidenceScore': float(max(probabilities) * 100),
                'type': 'player_stats',
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'playerId': player_id
                }
            }
        except Exception as e:
            logger.error(f"Player stats prediction error for {league}: {str(e)}")
            raise

    def _team_performance_prediction(self, league, input_data):
        """Predict team performance based on recent games"""
        try:
            team = input_data.get('team')
            if not team:
                raise ValueError("team is required for team_performance prediction")

            collection = self.db[f"{league.lower()}_games"]
            recent_games = list(collection.find(
                {'$or': [{'strHomeTeam': team}, {'strAwayTeam': team}]},
                sort=[('dateEvent', -1)],
                limit=10
            ))

            if not recent_games:
                raise ValueError(f"No recent games found for team {team} in league {league}")

            features = self._extract_team_features(pd.DataFrame(recent_games), league)
            model = self.models.get(league)
            if not model:
                model = self._train_model(league)

            df = pd.DataFrame([features])
            prediction = model.predict(df)[0]
            probabilities = model.predict_proba(df)[0] if hasattr(model, 'predict_proba') else [0.5, 0.5]

            return {
                'prediction': int(prediction),
                'confidenceScore': float(max(probabilities) * 100),
                'type': 'team_performance',
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'team': team,
                    'gamesAnalyzed': len(recent_games)
                }
            }
        except Exception as e:
            logger.error(f"Team performance prediction error for {league}: {str(e)}")
            raise

    def _game_outcome_prediction(self, league, input_data):
        """Predict the outcome of a specific game"""
        try:
            event_id = input_data.get('eventId')
            if not event_id:
                raise ValueError("eventId is required for game_outcome prediction")

            collection = self.db[f"{league.lower()}_games"]
            event = collection.find_one({'idEvent': event_id})
            if not event:
                raise ValueError(f"Event {event_id} not found in league {league}")

            features = self._extract_game_features(event, league)
            model = self.models.get(league)
            if not model:
                model = self._train_model(league)

            df = pd.DataFrame([features])
            prediction = model.predict(df)[0]
            probabilities = model.predict_proba(df)[0] if hasattr(model, 'predict_proba') else [0.5, 0.5]

            return {
                'prediction': int(prediction),  # 1 for home win, 0 for away win/draw
                'confidenceScore': float(max(probabilities) * 100),
                'type': 'game_outcome',
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'eventId': event_id,
                    'teams': f"{event.get('strHomeTeam')} vs {event.get('strAwayTeam')}"
                }
            }
        except Exception as e:
            logger.error(f"Game outcome prediction error for {league}: {str(e)}")
            raise

    def _advanced_prediction(self, league, input_data):
        """Perform advanced prediction with ensemble methods"""
        try:
            predictions = [
                self._get_base_prediction(league, input_data),
                self._get_ensemble_prediction(league, input_data),
                self._get_streaming_prediction(league, input_data)
            ]

            valid_predictions = [p for p in predictions if p]
            if not valid_predictions:
                raise ValueError("No valid predictions from models")

            weights = [0.4, 0.4, 0.2]
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
        """Get prediction from base model"""
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
        """Get prediction from ensemble model"""
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
        """Get prediction from streaming model"""
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

        predictions_array = np.array([p['prediction'] for p in valid_predictions])
        std_dev = np.std(predictions_array)
        mean_pred = np.mean(predictions_array)
        
        confidence = 100 * (1 - min(std_dev / (mean_pred + 1e-10), 1.0))
        return float(confidence)

    def _generate_insights(self, league, input_data):
        """Generate advanced insights from prediction data"""
        try:
            insights = []
            
            if league in self.feature_importance:
                important_features = self._get_important_features(league, input_data)
                insights.append({
                    'type': 'feature_importance',
                    'data': important_features
                })

            historical_trend = self._analyze_historical_trend(league, input_data)
            if historical_trend:
                insights.append({
                    'type': 'historical_trend',
                    'data': historical_trend
                })

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
        """Analyze historical trends for prediction"""
        try:
            team = input_data.get('team') or input_data.get('strHomeTeam') or input_data.get('strAwayTeam')
            if not team:
                return None

            collection = self.db[f"{league.lower()}_games"]
            recent_games = list(collection.find(
                {'$or': [{'strHomeTeam': team}, {'strAwayTeam': team}]},
                sort=[('dateEvent', -1)],
                limit=5
            ))

            if not recent_games:
                return None

            return {
                'games_analyzed': len(recent_games),
                'trend': self._calculate_trend(recent_games),
                'period': '5 games'
            }

        except Exception as e:
            logger.error(f"Error analyzing historical trend for {league}: {str(e)}")
            return None

    def _calculate_trend(self, games):
        """Calculate trend from recent games"""
        if not games:
            return None

        scores = []
        for game in games:
            score = game.get('intHomeScore', 0) if game.get('strHomeTeam') == game.get('team') else game.get('intAwayScore', 0)
            scores.append(int(score) if score else 0)

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

        recent_metrics = history[-3:]
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

    def _needs_training(self, league, force=False):
        """Determine if the model needs retraining"""
        if force:
            return True

        if league not in self.last_training_time:
            return True

        last_train = self.last_training_time[league]
        frequency = self.training_frequency[league]
        days_since_last_train = (datetime.now() - last_train).days

        if days_since_last_train < frequency['min_days']:
            return False

        if days_since_last_train > frequency['max_days']:
            return True

        performance = self.performance_history.get(league, [])
        if not performance:
            return True

        recent_performance = performance[-1]['accuracy'] if performance else 1.0
        if recent_performance < frequency['performance_threshold']:
            return True

        return days_since_last_train >= frequency['base_days']

    def _prepare_training_data(self, league, limit=500):
        """Prepare training data for a specific league using TheSportsDB data"""
        try:
            collection_name = f"{league.lower()}_games"
            collection = self.db[collection_name]
            
            games = list(collection.find(
                {'strStatus': 'Match Finished'},
                sort=[('dateEvent', -1)],
                limit=limit
            ))

            if not games:
                logger.info(f"No games found for {league}, fetching historical data")
                self.fetch_historical_events(league, '2023-2024')
                games = list(self.db[collection_name].find(
                    {'strStatus': 'Match Finished'},
                    sort=[('dateEvent', -1)],
                    limit=limit
                ))

            if not games:
                raise ValueError(f"No completed games found for {league} after fetching")

            df = pd.DataFrame(games)
            features = self._extract_features(df, league)
            target = self._prepare_target(df, league)
            
            return features, target
        
        except Exception as e:
            logger.error(f"Error preparing training data for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='data_preparation').inc()
            raise

    def _prepare_player_stats_data(self, player_id, league):
        """Prepare player statistics data for models"""
        try:
            collection_name = f"{league.lower()}_player_stats"
            collection = self.db[collection_name]

            player_games = list(collection.find(
                {'playerId': player_id},
                sort=[('date', -1)],
                limit=20
            ))

            if not player_games:
                raise ValueError(f"No statistics found for player {player_id}")

            df = pd.DataFrame(player_games)
            features = self._extract_player_features(df, league)
            return features

        except Exception as e:
            logger.error(f"Error preparing player stats: {str(e)}")
            raise

    def _extract_features(self, df, league):
        """Extract features from the DataFrame tailored to the sport"""
        try:
            sport = self.SPORT_MAPPING.get(league)
            features = {}

            if sport == 'Soccer':
                features = {
                    'home_goals': df['intHomeScore'].astype(int),
                    'away_goals': df['intAwayScore'].astype(int),
                    'home_shots': df['intHomeShots'].fillna(0).astype(int),
                    'away_shots': df['intAwayShots'].fillna(0).astype(int),
                    'home_possession': df['strHomePossession'].str.rstrip('%').astype(float).fillna(50.0),
                    'away_possession': df['strAwayPossession'].str.rstrip('%').astype(float).fillna(50.0)
                }
            elif sport == 'Basketball':
                features = {
                    'home_points': df['intHomeScore'].astype(int),
                    'away_points': df['intAwayScore'].astype(int),
                    'home_rebounds': df.get('intHomeRebounds', 0).fillna(0).astype(int),
                    'away_rebounds': df.get('intAwayRebounds', 0).fillna(0).astype(int),
                    'home_assists': df.get('intHomeAssists', 0).fillna(0).astype(int),
                    'away_assists': df.get('intAwayAssists', 0).fillna(0).astype(int)
                }
            elif sport == 'Football':
                features = {
                    'home_yards': df.get('intHomeYards', 0).fillna(0).astype(int),
                    'away_yards': df.get('intAwayYards', 0).fillna(0).astype(int),
                    'home_touchdowns': df.get('intHomeTouchdowns', 0).fillna(0).astype(int),
                    'away_touchdowns': df.get('intAwayTouchdowns', 0).fillna(0).astype(int)
                }
            elif sport == 'Baseball':
                features = {
                    'home_runs': df['intHomeScore'].astype(int),
                    'away_runs': df['intAwayScore'].astype(int),
                    'home_hits': df.get('intHomeHits', 0).fillna(0).astype(int),
                    'away_hits': df.get('intAwayHits', 0).fillna(0).astype(int)
                }
            elif sport == 'Hockey':
                features = {
                    'home_goals': df['intHomeScore'].astype(int),
                    'away_goals': df['intAwayScore'].astype(int),
                    'home_shots': df.get('intHomeShots', 0).fillna(0).astype(int),
                    'away_shots': df.get('intAwayShots', 0).fillna(0).astype(int)
                }

            feature_df = pd.DataFrame(features)
            numeric_features = feature_df.select_dtypes(include=['int64', 'float64']).columns.tolist()[:10]
            categorical_features = feature_df.select_dtypes(include=['object', 'category']).columns.tolist()[:5]
            
            preprocessor = ColumnTransformer(
                transformers=[
                    ('num', StandardScaler(), numeric_features),
                    ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), categorical_features)
                ])
            
            X = preprocessor.fit_transform(feature_df)
            return X
        except Exception as e:
            logger.error(f"Error extracting features for {league}: {str(e)}")
            raise

    def _extract_player_features(self, df, league):
        """Extract player features based on the sport"""
        sport = self.SPORT_MAPPING.get(league)
        features = {}

        if sport == 'Soccer':
            features = {
                'goals': df['goals'].mean(),
                'assists': df['assists'].mean(),
                'shots': df['shots'].mean(),
                'minutes_played': df['minutesPlayed'].mean()
            }
        elif sport == 'Basketball':
            features = {
                'points': df['points'].mean(),
                'rebounds': df['rebounds'].mean(),
                'assists': df['assists'].mean(),
                'minutes_played': df['minutesPlayed'].mean()
            }
        elif sport == 'Football':
            features = {
                'yards': df['yards'].mean(),
                'touchdowns': df['touchdowns'].mean(),
                'carries': df.get('carries', 0).mean(),
                'receptions': df.get('receptions', 0).mean()
            }
        elif sport == 'Baseball':
            features = {
                'hits': df['hits'].mean(),
                'home_runs': df['homeRuns'].mean(),
                'rbis': df.get('rbis', 0).mean(),
                'batting_average': df.get('battingAverage', 0).mean()
            }
        elif sport == 'Hockey':
            features = {
                'goals': df['goals'].mean(),
                'assists': df['assists'].mean(),
                'shots': df['shots'].mean(),
                'ice_time': df.get('iceTime', 0).mean()
            }

        return features

    def _extract_team_features(self, df, league):
        """Extract team features based on recent games"""
        sport = self.SPORT_MAPPING.get(league)
        features = {}

        if sport == 'Soccer':
            home_goals = df[df['strHomeTeam'] == df['team']]['intHomeScore'].astype(int).mean()
            away_goals = df[df['strAwayTeam'] == df['team']]['intAwayScore'].astype(int).mean()
            features = {
                'avg_goals': (home_goals + away_goals) / 2,
                'avg_shots': (df['intHomeShots'].fillna(0).astype(int).mean() + df['intAwayShots'].fillna(0).astype(int).mean()) / 2,
                'avg_possession': (df['strHomePossession'].str.rstrip('%').astype(float).fillna(50.0).mean() + 
                                 df['strAwayPossession'].str.rstrip('%').astype(float).fillna(50.0).mean()) / 2
            }
        elif sport == 'Basketball':
            home_points = df[df['strHomeTeam'] == df['team']]['intHomeScore'].astype(int).mean()
            away_points = df[df['strAwayTeam'] == df['team']]['intAwayScore'].astype(int).mean()
            features = {
                'avg_points': (home_points + away_points) / 2,
                'avg_rebounds': (df.get('intHomeRebounds', 0).fillna(0).astype(int).mean() + 
                               df.get('intAwayRebounds', 0).fillna(0).astype(int).mean()) / 2,
                'avg_assists': (df.get('intHomeAssists', 0).fillna(0).astype(int).mean() + 
                              df.get('intAwayAssists', 0).fillna(0).astype(int).mean()) / 2
            }
        elif sport == 'Football':
            home_yards = df[df['strHomeTeam'] == df['team']].get('intHomeYards', 0).fillna(0).astype(int).mean()
            away_yards = df[df['strAwayTeam'] == df['team']].get('intAwayYards', 0).fillna(0).astype(int).mean()
            features = {
                'avg_yards': (home_yards + away_yards) / 2,
                'avg_touchdowns': (df.get('intHomeTouchdowns', 0).fillna(0).astype(int).mean() + 
                                 df.get('intAwayTouchdowns', 0).fillna(0).astype(int).mean()) / 2
            }
        elif sport == 'Baseball':
            home_runs = df[df['strHomeTeam'] == df['team']]['intHomeScore'].astype(int).mean()
            away_runs = df[df['strAwayTeam'] == df['team']]['intAwayScore'].astype(int).mean()
            features = {
                'avg_runs': (home_runs + away_runs) / 2,
                'avg_hits': (df.get('intHomeHits', 0).fillna(0).astype(int).mean() + 
                           df.get('intAwayHits', 0).fillna(0).astype(int).mean()) / 2
            }
        elif sport == 'Hockey':
            home_goals = df[df['strHomeTeam'] == df['team']]['intHomeScore'].astype(int).mean()
            away_goals = df[df['strAwayTeam'] == df['team']]['intAwayScore'].astype(int).mean()
            features = {
                'avg_goals': (home_goals + away_goals) / 2,
                'avg_shots': (df.get('intHomeShots', 0).fillna(0).astype(int).mean() + 
                            df.get('intAwayShots', 0).fillna(0).astype(int).mean()) / 2
            }

        return features

    def _extract_game_features(self, event, league):
        """Extract features for a specific game"""
        sport = self.SPORT_MAPPING.get(league)
        features = {}

        if sport == 'Soccer':
            features = {
                'home_goals_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeScore'),
                'away_goals_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayScore'),
                'home_shots_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeShots'),
                'away_shots_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayShots'),
                'home_possession_avg': self._get_team_possession_avg(league, event['strHomeTeam'], 'strHomePossession'),
                'away_possession_avg': self._get_team_possession_avg(league, event['strAwayTeam'], 'strAwayPossession')
            }
        elif sport == 'Basketball':
            features = {
                'home_points_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeScore'),
                'away_points_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayScore'),
                'home_rebounds_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeRebounds'),
                'away_rebounds_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayRebounds'),
                'home_assists_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeAssists'),
                'away_assists_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayAssists')
            }
        elif sport == 'Football':
            features = {
                'home_yards_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeYards'),
                'away_yards_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayYards'),
                'home_touchdowns_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeTouchdowns'),
                'away_touchdowns_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayTouchdowns')
            }
        elif sport == 'Baseball':
            features = {
                'home_runs_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeScore'),
                'away_runs_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayScore'),
                'home_hits_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeHits'),
                'away_hits_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayHits')
            }
        elif sport == 'Hockey':
            features = {
                'home_goals_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeScore'),
                'away_goals_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayScore'),
                'home_shots_avg': self._get_team_avg(league, event['strHomeTeam'], 'intHomeShots'),
                'away_shots_avg': self._get_team_avg(league, event['strAwayTeam'], 'intAwayShots')
            }

        return features

    def _get_team_avg(self, league, team, field):
        """Calculate average for a team field"""
        collection = self.db[f"{league.lower()}_games"]
        games = list(collection.find(
            {'$or': [{'strHomeTeam': team}, {'strAwayTeam': team}]},
            sort=[('dateEvent', -1)],
            limit=10
        ))
        if not games:
            return 0

        values = []
        for game in games:
            if game.get(field):
                value = int(game[field]) if game[field].isdigit() else 0
                values.append(value)
        return np.mean(values) if values else 0

    def _get_team_possession_avg(self, league, team, field):
        """Calculate average possession for a team"""
        collection = self.db[f"{league.lower()}_games"]
        games = list(collection.find(
            {'$or': [{'strHomeTeam': team}, {'strAwayTeam': team}]},
            sort=[('dateEvent', -1)],
            limit=10
        ))
        if not games:
            return 50.0

        values = []
        for game in games:
            if game.get(field):
                value = float(game[field].rstrip('%')) if game[field] and game[field].rstrip('%').replace('.', '').isdigit() else 50.0
                values.append(value)
        return np.mean(values) if values else 50.0

    def _prepare_target(self, df, league):
        """Prepare target variable for training"""
        try:
            sport = self.SPORT_MAPPING.get(league)
            if sport in ['Soccer', 'Basketball', 'Hockey', 'Baseball', 'Football']:
                # Target: 1 if home team wins, 0 otherwise
                df['target'] = df.apply(
                    lambda row: 1 if int(row['intHomeScore'] or 0) > int(row['intAwayScore'] or 0) else 0,
                    axis=1
                )
                return df['target']
            else:
                raise ValueError(f"No target preparation defined for sport {sport}")
        except Exception as e:
            logger.error(f"Error preparing target variable for {league}: {str(e)}")
            raise

    def _create_advanced_pipeline(self, league):
        """Create an advanced machine learning pipeline"""
        try:
            base_estimator = RandomForestClassifier(
                n_estimators=50,
                max_depth=3,
                random_state=42
            )
            
            feature_selector = SelectFromModel(
                GradientBoostingRegressor(n_estimators=50, random_state=42)
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
        """Optimize hyperparameters using Hyperopt"""
        try:
            space = {
                'classifier__n_estimators': hp.quniform('n_estimators', 20, 100, 10),
                'classifier__max_depth': hp.quniform('max_depth', 2, 5, 1),
                'classifier__min_samples_split': hp.quniform('min_samples_split', 2, 5, 1),
                'classifier__min_samples_leaf': hp.quniform('min_samples_leaf', 1, 3, 1)
            }
            
            def objective(params):
                pipeline.set_params(
                    classifier__n_estimators=int(params['n_estimators']),
                    classifier__max_depth=int(params['max_depth']),
                    classifier__min_samples_split=int(params['min_samples_split']),
                    classifier__min_samples_leaf=int(params['min_samples_leaf'])
                )
                
                scores = cross_val_score(pipeline, X, y, cv=3)
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
        """Calculate and return feature importance"""
        try:
            estimator = pipeline.named_steps['classifier']
            
            if hasattr(estimator, 'feature_importances_'):
                importances = estimator.feature_importances_
            elif hasattr(estimator, 'coef_'):
                importances = np.abs(estimator.coef_[0])
            else:
                return {}
            
            feature_importance = dict(zip(feature_names[:10], importances[:10]))
            sorted_importance = dict(
                sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
            )
            
            return sorted_importance
        
        except Exception as e:
            logger.error(f"Feature importance calculation error: {str(e)}")
            return {}

    def _track_model_performance(self, league, model, X, y):
        """Track and log model performance metrics"""
        try:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.1, random_state=42)
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
            
            if len(self.performance_history[league]) > 3:
                self.performance_history[league] = self.performance_history[league][-3:]
            
            MODEL_ACCURACY.labels(league=league).set(performance['accuracy'])
            logger.info(f"Tracked performance for {league}: {performance}")
            
            return performance
        
        except Exception as e:
            logger.error(f"Model performance tracking error for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='performance_tracking').inc()
            return {}

    def _train_model(self, league):
        """Train the model for a specific league"""
        try:
            X, y = self._prepare_training_data(league)
            pipeline = self._create_advanced_pipeline(league)
            best_params = self._optimize_hyperparameters(pipeline, X, y)
            pipeline.set_params(**best_params)
            
            pipeline.fit(X, y)
            
            feature_names = [f"feature_{i}" for i in range(X.shape[1])]
            self.feature_importance[league] = self._calculate_feature_importance(pipeline, feature_names)
            self._track_model_performance(league, pipeline, X, y)
            
            self.models[league] = pipeline
            self.model_versions[league] = '1.0.0'
            self.last_training_time[league] = datetime.now()
            
            # Train streaming model
            self._update_streaming_model(league, X, y)
            
            # Train ensemble model
            self._train_ensemble_model(league, X, y)
            
            logger.info(f"Model trained successfully for {league}")
            return pipeline
        
        except Exception as e:
            logger.error(f"Error training model for {league}: {str(e)}")
            raise

    def _update_streaming_model(self, league, X, y):
        """Update streaming model with new data"""
        try:
            if league not in self.streaming_models:
                self.streaming_models[league] = self._create_streaming_model()
            
            batch_size = 50
            for i in range(0, len(X), batch_size):
                self.streaming_models[league].partial_fit(X[i:i + batch_size], y[i:i + batch_size], classes=np.unique(y))
            logger.info(f"Updated streaming model for {league}")
        
        except Exception as e:
            logger.error(f"Error updating streaming model for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='streaming_update').inc()

    def _train_ensemble_model(self, league, X, y):
        """Train an ensemble model"""
        try:
            rf = RandomForestClassifier(n_estimators=30, max_depth=3, random_state=42)
            gb = GradientBoostingRegressor(n_estimators=30, random_state=42)
            ensemble = VotingClassifier(estimators=[
                ('rf', rf),
                ('gb', Pipeline([('gb', gb)]))
            ], voting='soft')
            
            ensemble.fit(X, y)
            self.ensemble_models[league] = ensemble
            logger.info(f"Ensemble model trained for {league}")
        
        except Exception as e:
            logger.error(f"Error training ensemble model for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='ensemble_training').inc()

    def _create_streaming_model(self):
        """Create a model suitable for streaming data"""
        try:
            return StreamingPipeline([
                ('scaler', StandardScaler()),
                ('classifier', StreamingClassifier(
                    loss='log_loss',
                    learning_rate='adaptive',
                    max_iter=500,
                    tol=1e-2,
                    random_state=42
                ))
            ])
        except Exception as e:
            logger.error(f"Error creating streaming model: {str(e)}")
            raise

    def _process_streaming_batch(self, league, data):
        """Process a batch of streaming data"""
        try:
            if len(data) > 50:
                data = data[:50]
            
            df = pd.DataFrame([d['data'] for d in data])
            if league in self.streaming_models:
                X = self._extract_features(df, league)
                predictions = self.streaming_models[league].partial_predict(X)
                for pred, item in zip(predictions, data):
                    if self.redis_client:
                        self.redis_client.set(
                            f"{os.getenv('REDIS_CACHE_PREFIX', 'sportanalytics:')}streaming:{league}:{item['timestamp']}",
                            json.dumps(int(pred)),
                            ex=300
                        )
                        logger.debug(f"Streaming prediction cached for {league} at {item['timestamp']}")
        except Exception as e:
            logger.error(f"Streaming batch processing error for {league}: {str(e)}")
            ERROR_COUNTER.labels(type='streaming_batch').inc()

    def cleanup(self):
        """Comprehensive cleanup of resources"""
        try:
            if hasattr(self, 'client'):
                self.client.close()
                logger.info("MongoDB connection closed")

            if hasattr(self, 'redis_client') and self.redis_client:
                self.redis_client.close()
                logger.info("Redis connection closed")

            self.model_cache.cache.clear()
            self.model_cache.prediction_cache.clear()
            logger.info("Model and prediction caches cleared")

            if self.streaming_queue is not None:
                self.streaming_queue = []
                logger.info("Streaming queue cleared")

            self.executor.shutdown(wait=True, cancel_futures=True)
            logger.info("Thread pool executor shut down")

            gc.collect()
            logger.info("Garbage collection completed")

            logger.info("Cleanup completed successfully")

        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")
            raise

# Main execution block for direct script execution (e.g., testing)
if __name__ == "__main__":
    try:
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}")
            if 'model' in locals():
                model.cleanup()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        model = TheAnalyzerPredictiveModel()

        if len(sys.argv) > 1:
            try:
                input_data = json.loads(sys.argv[1])

                if input_data.get('type') == 'environment_check':
                    result = model._verify_python_environment()
                    print(json.dumps(result))
                else:
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

# Remove duplicate Redis connection code