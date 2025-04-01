"""
Premium Prediction API for Ultra Premium Features
Enterprise-grade API with GraphQL and REST endpoints for sports analytics predictions
Supporting NBA, MLB, NHL, NFL, PREMIER LEAGUE, SERIE A, BUNDESLIGA, and LA LIGA
"""

import os
import time
import uuid
import gzip
import json
import asyncio
import logging
import secrets
import hashlib
from enum import Enum
from typing import List, Dict, Optional, Any, Union, Tuple
from datetime import datetime, timedelta
from functools import wraps

# FastAPI imports
from fastapi import FastAPI, HTTPException, Depends, Security, status, Body, Query, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, validator, root_validator, constr

# Authentication and security
import jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader

# GraphQL integration
import strawberry
from strawberry.fastapi import GraphQLRouter
from strawberry.types import Info

# Caching, rate limiting, and storage
import redis.asyncio as redis
from redis.exceptions import RedisError
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

# Telemetry and monitoring
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

# For webhook notifications
import aiohttp

# For background tasks
from fastapi.background import BackgroundTasks

# For environment variables
from dotenv import load_dotenv

# Import custom modules (placeholder - in real implementation these would be actual modules)
from .custom_prediction_model import (
    CustomPredictionEngine, 
    get_prediction_engine, 
    CustomPredictionResult, 
    MultiFactorPredictionResult
)
from .factor_parser import get_parser, ParsedFactor

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Constants
VERSION = "2.0.0"
SERVICE_NAME_VALUE = "sports-analytics-premium-api"

# Supported leagues
class League(str, Enum):
    NBA = "NBA"
    MLB = "MLB"
    NHL = "NHL"
    NFL = "NFL"
    PREMIER_LEAGUE = "PREMIER_LEAGUE"
    SERIE_A = "SERIE_A"
    BUNDESLIGA = "BUNDESLIGA"
    LA_LIGA = "LA_LIGA"
    
    @classmethod
    def list(cls):
        return [e.value for e in cls]

# API keys and secrets
JWT_SECRET = os.getenv("JWT_SECRET", "your-ultra-premium-jwt-secret-key-2023")
API_KEY = os.getenv("PREMIUM_API_KEY", "your-ultra-premium-api-key-2023")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "your-webhook-signing-secret-2023")

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_POOL_SIZE = int(os.getenv("REDIS_POOL_SIZE", "10"))

# Rate limits - requests per minute
RATE_LIMITS = {
    "basic": 10,
    "premium": 30,
    "ultra_premium": 100,
    "enterprise": 500,
}

# Cache TTL in seconds
CACHE_TTL = {
    "single_prediction": 300,  # 5 minutes
    "multi_prediction": 600,   # 10 minutes
    "bulk_prediction": 1800,   # 30 minutes
}

# User tier models
class SubscriptionTier(str, Enum):
    BASIC = "basic"
    PREMIUM = "premium" 
    ULTRA_PREMIUM = "ultra_premium"
    ENTERPRISE = "enterprise"

# Initialize TracerProvider
resource = Resource(attributes={SERVICE_NAME: SERVICE_NAME_VALUE})
trace_provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter())
trace_provider.add_span_processor(processor)
trace.set_tracer_provider(trace_provider)
tracer = trace.get_tracer(__name__)

# Initialize redis connection pool
redis_pool = None
prediction_engine = None

#################
# Model classes #
#################

class UserData(BaseModel):
    """User data extracted from JWT token"""
    user_id: str
    username: str
    email: Optional[str] = None
    subscription_tier: SubscriptionTier
    organizations: Optional[List[str]] = None
    exp: Optional[int] = None

class FactorRequest(BaseModel):
    """Request model for single factor prediction"""
    factor: str = Field(..., description="Natural language description of factor to predict", example="LeBron James scores more than 25 points")
    league: Optional[League] = Field(None, description="League context", example="NBA")
    include_supporting_data: bool = Field(True, description="Whether to include supporting data in response")
    cache_ttl: Optional[int] = Field(None, description="Custom cache TTL in seconds, overrides default if provided")
    
    @validator('factor')
    def factor_must_be_meaningful(cls, v):
        if len(v.strip()) < 10:
            raise ValueError("Factor description must be at least 10 characters")
        return v

class MultiFactorRequest(BaseModel):
    """Request model for multi-factor prediction"""
    factors: List[str] = Field(..., description="List of natural language factors to predict")
    league: Optional[League] = Field(None, description="League context")
    max_factors: int = Field(5, description="Maximum number of factors to process")
    include_analysis: bool = Field(True, description="Whether to include detailed analysis")
    cache_ttl: Optional[int] = Field(None, description="Custom cache TTL in seconds, overrides default if provided")
    
    @validator('factors')
    def factors_must_be_meaningful(cls, v):
        if not v:
            raise ValueError("At least one factor must be provided")
        if any(len(factor.strip()) < 10 for factor in v):
            raise ValueError("Each factor description must be at least 10 characters")
        return v
    
    @validator('max_factors')
    def max_factors_limit(cls, v):
        if v < 1:
            raise ValueError("max_factors must be at least 1")
        if v > 20:
            raise ValueError("max_factors cannot exceed 20")
        return v

class BulkPredictionRequest(BaseModel):
    """Request model for bulk predictions"""
    predictions: List[Union[FactorRequest, MultiFactorRequest]] = Field(..., description="List of prediction requests")
    callback_url: Optional[str] = Field(None, description="Webhook URL for notification when processing is complete")
    idempotency_key: Optional[str] = Field(None, description="Unique key to prevent duplicate processing")
    
    @validator('predictions')
    def validate_predictions(cls, v):
        if not v:
            raise ValueError("At least one prediction must be provided")
        if len(v) > 100:
            raise ValueError("Maximum of 100 predictions per bulk request")
        return v
    
    @validator('callback_url')
    def validate_callback_url(cls, v):
        if v is not None and not v.startswith(('http://', 'https://')):
            raise ValueError("callback_url must be a valid HTTP or HTTPS URL")
        return v

class FactorResponse(BaseModel):
    """Response model for single factor prediction"""
    status: str = Field("success", description="Response status")
    data: Dict = Field(..., description="Prediction data")
    timestamp: str = Field(..., description="Response timestamp")
    request_id: str = Field(..., description="Unique request ID")
    cache_hit: Optional[bool] = Field(None, description="Whether response was served from cache")
    
class MultiFactorResponse(BaseModel):
    """Response model for multi-factor prediction"""
    status: str = Field("success", description="Response status")
    data: Dict = Field(..., description="Prediction data")
    timestamp: str = Field(..., description="Response timestamp")
    request_id: str = Field(..., description="Unique request ID")
    cache_hit: Optional[bool] = Field(None, description="Whether response was served from cache")
    
class BulkPredictionResponse(BaseModel):
    """Response model for bulk prediction requests"""
    status: str = Field("accepted", description="Request acceptance status")
    job_id: str = Field(..., description="Job ID for tracking progress")
    timestamp: str = Field(..., description="Response timestamp")
    estimated_completion_time: Optional[str] = Field(None, description="Estimated completion time")
    
class BulkPredictionStatus(BaseModel):
    """Response model for bulk prediction status"""
    status: str = Field(..., description="Job status (pending, processing, completed, failed)")
    job_id: str = Field(..., description="Job ID")
    timestamp: str = Field(..., description="Response timestamp")
    progress: Optional[float] = Field(None, description="Progress percentage (0-100)")
    results: Optional[List[Dict]] = Field(None, description="Results if job is completed")
    error: Optional[str] = Field(None, description="Error message if job failed")
    
class WebhookNotification(BaseModel):
    """Model for webhook notifications"""
    event: str = Field(..., description="Event type (e.g., 'bulk_prediction.completed')")
    job_id: str = Field(..., description="Job ID")
    timestamp: str = Field(..., description="Notification timestamp")
    data: Dict = Field(..., description="Event data")
    signature: str = Field(..., description="HMAC signature for verification")

class ErrorResponse(BaseModel):
    """Response model for errors"""
    status: str = Field("error", description="Error status")
    code: str = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    request_id: Optional[str] = Field(None, description="Request ID if available")
    timestamp: str = Field(..., description="Error timestamp")
    details: Optional[Dict] = Field(None, description="Additional error details")

class RequestLog(BaseModel):
    """Model for request logging"""
    request_id: str
    endpoint: str
    method: str
    user_id: Optional[str]
    subscription_tier: Optional[str]
    payload: Dict
    timestamp: str
    ip_address: Optional[str]
    user_agent: Optional[str]

##################
# GraphQL Models #
##################

@strawberry.type
class PredictionResult:
    """GraphQL type for prediction results"""
    probability: float
    confidence: float
    prediction: str
    supporting_data: Optional[Dict] = None

@strawberry.type
class SingleFactorResult:
    """GraphQL type for single factor prediction result"""
    request_id: str
    timestamp: str
    factor: str
    result: PredictionResult
    cached: bool = False

@strawberry.type
class MultiFactorResult:
    """GraphQL type for multi-factor prediction result"""
    request_id: str
    timestamp: str
    factors: List[str]
    results: List[PredictionResult]
    combined_probability: float
    analysis: Optional[str] = None
    cached: bool = False

@strawberry.input
class FactorInput:
    """GraphQL input for single factor prediction"""
    factor: str
    league: Optional[str] = None
    include_supporting_data: bool = True

@strawberry.input
class MultiFactorInput:
    """GraphQL input for multi-factor prediction"""
    factors: List[str]
    league: Optional[str] = None
    max_factors: int = 5
    include_analysis: bool = True

####################
# Helper Functions #
####################

async def get_redis_conn():
    """Get Redis connection from pool"""
    global redis_pool
    if redis_pool is None:
        redis_pool = redis.ConnectionPool.from_url(
            REDIS_URL, 
            max_connections=REDIS_POOL_SIZE,
            decode_responses=True
        )
    
    return redis.Redis(connection_pool=redis_pool)

def generate_request_id():
    """Generate a unique request ID"""
    return f"{int(time.time())}-{uuid.uuid4().hex[:8]}"

def generate_cache_key(endpoint: str, payload: Dict) -> str:
    """Generate a cache key for a request"""
    # Sort the payload to ensure consistent keys for identical payloads
    payload_str = json.dumps(payload, sort_keys=True)
    # Create a hash of the endpoint and payload
    return f"cache:{endpoint}:{hashlib.md5(payload_str.encode()).hexdigest()}"

async def set_cache(key: str, data: Dict, ttl: int) -> bool:
    """Set data in cache with TTL"""
    try:
        redis_conn = await get_redis_conn()
        await redis_conn.setex(key, ttl, json.dumps(data))
        return True
    except RedisError as e:
        logger.warning(f"Failed to set cache: {str(e)}")
        return False

async def get_cache(key: str) -> Optional[Dict]:
    """Get data from cache"""
    try:
        redis_conn = await get_redis_conn()
        data = await redis_conn.get(key)
        if data:
            return json.loads(data)
        return None
    except RedisError as e:
        logger.warning(f"Failed to get from cache: {str(e)}")
        return None

async def log_request(log_data: RequestLog) -> bool:
    """Log request to Redis for replay capability"""
    try:
        redis_conn = await get_redis_conn()
        log_key = f"request_log:{log_data.request_id}"
        await redis_conn.setex(
            log_key,
            86400 * 30,  # Store for 30 days
            json.dumps(log_data.dict())
        )
        # Add to request log index
        await redis_conn.zadd(
            "request_log_index",
            {log_data.request_id: int(datetime.fromisoformat(log_data.timestamp).timestamp())}
        )
        return True
    except RedisError as e:
        logger.warning(f"Failed to log request: {str(e)}")
        return False

async def record_metric(metric_name: str, value: float = 1, tags: Dict = None) -> bool:
    """Record a metric to Redis for monitoring"""
    try:
        redis_conn = await get_redis_conn()
        timestamp = int(time.time())
        
        # Create a key with the current hour for aggregation
        hour_key = f"metrics:{metric_name}:{datetime.utcfromtimestamp(timestamp).strftime('%Y-%m-%d:%H')}"
        
        # Increment the counter for this hour
        await redis_conn.hincrby(hour_key, "count", 1)
        
        # If it's a timing metric, store the value for later percentile calculations
        if value != 1:
            # Add the value to a sorted set for percentile calculations
            timing_key = f"{hour_key}:timings"
            await redis_conn.zadd(timing_key, {str(uuid.uuid4()): value})
            # Set expiry to ensure we don't keep data too long
            await redis_conn.expire(timing_key, 86400 * 7)  # 7 days
        
        # Store any tags
        if tags:
            tag_key = f"{hour_key}:tags"
            for tag_name, tag_value in tags.items():
                await redis_conn.hincrby(tag_key, f"{tag_name}:{tag_value}", 1)
                
        # Set expiry to ensure we don't keep data too long
        await redis_conn.expire(hour_key, 86400 * 7)  # 7 days
        
        return True
    except RedisError as e:
        logger.warning(f"Failed to record metric: {str(e)}")
        return False

async def create_bulk_prediction_job(request: BulkPredictionRequest, user_id: str) -> str:
    """Create a bulk prediction job and store in Redis"""
    job_id = f"job_{uuid.uuid4().hex}"
    
    # Calculate estimated completion time
    # Assume 200ms per single prediction, 500ms per multi prediction
    total_predictions = len(request.predictions)
    single_count = sum(1 for p in request.predictions if isinstance(p, FactorRequest))
    multi_count = total_predictions - single_count
    
    # Estimated time in seconds
    estimated_seconds = (single_count * 0.2 + multi_count * 0.5) * 1.2  # Add 20% buffer
    
    # Round up to nearest second
    estimated_seconds = max(1, int(estimated_seconds + 0.5))
    
    # Create job data
    job_data = {
        "job_id": job_id,
        "user_id": user_id,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "predictions": [
            p.dict() for p in request.predictions
        ],
        "callback_url": request.callback_url,
        "progress": 0,
        "results": [],
        "errors": [],
        "estimated_completion_time": (datetime.utcnow() + timedelta(seconds=estimated_seconds)).isoformat(),
        "idempotency_key": request.idempotency_key
    }
    
    try:
        redis_conn = await get_redis_conn()
        
        # If idempotency key is provided, check for existing job
        if request.idempotency_key:
            existing_job_id = await redis_conn.get(f"idempotency:{request.idempotency_key}")
            if existing_job_id:
                return existing_job_id.decode('utf-8') if isinstance(existing_job_id, bytes) else existing_job_id
        
        # Store job data
        await redis_conn.setex(
            f"job:{job_id}",
            86400,  # Store for 24 hours
            json.dumps(job_data)
        )
        
        # Add to processing queue
        await redis_conn.lpush("prediction_job_queue", job_id)
        
        # If idempotency key is provided, store mapping
        if request.idempotency_key:
            await redis_conn.setex(
                f"idempotency:{request.idempotency_key}",
                86400,  # Store for 24 hours
                job_id
            )
        
        return job_id
    except RedisError as e:
        logger.error(f"Failed to create bulk prediction job: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create job due to storage error"
        )

async def get_job_status(job_id: str) -> Dict:
    """Get the status of a bulk prediction job"""
    try:
        redis_conn = await get_redis_conn()
        job_data = await redis_conn.get(f"job:{job_id}")
        
        if not job_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found"
            )
        
        return json.loads(job_data)
    except RedisError as e:
        logger.error(f"Failed to get job status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get job status due to storage error"
        )

async def generate_webhook_signature(payload: Dict) -> str:
    """Generate HMAC signature for webhook payload"""
    payload_bytes = json.dumps(payload, sort_keys=True).encode()
    signature = hashlib.hmac_sha256(WEBHOOK_SECRET.encode(), payload_bytes).hexdigest()
    return signature

async def send_webhook_notification(url: str, event: str, job_id: str, data: Dict) -> bool:
    """Send webhook notification to callback URL"""
    payload = {
        "event": event,
        "job_id": job_id,
        "timestamp": datetime.utcnow().isoformat(),
        "data": data
    }
    
    # Generate signature for security
    signature = await generate_webhook_signature(payload)
    payload["signature"] = signature
    
    try:
        async with aiohttp.ClientSession() as session:
            for attempt in range(3):  # Retry up to 3 times
                try:
                    async with session.post(
                        url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                        timeout=10
                    ) as response:
                        if response.status < 300:
                            logger.info(f"Webhook notification sent successfully to {url}")
                            return True
                        else:
                            logger.warning(f"Webhook notification failed, status: {response.status}")
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    logger.warning(f"Webhook notification attempt {attempt+1} failed: {str(e)}")
                    
                # Wait before retry (exponential backoff)
                if attempt < 2:  # Don't sleep after the last attempt
                    await asyncio.sleep(2 ** attempt)
        
        logger.error(f"Failed to send webhook notification to {url} after 3 attempts")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending webhook: {str(e)}")
        return False

async def process_bulk_prediction_job(job_id: str):
    """Process a bulk prediction job in the background"""
    try:
        redis_conn = await get_redis_conn()
        job_data = await redis_conn.get(f"job:{job_id}")
        
        if not job_data:
            logger.error(f"Job {job_id} not found for processing")
            return
        
        job = json.loads(job_data)
        
        # Update job status to processing
        job["status"] = "processing"
        job["updated_at"] = datetime.utcnow().isoformat()
        await redis_conn.setex(
            f"job:{job_id}",
            86400,  # Store for 24 hours
            json.dumps(job)
        )
        
        # Process each prediction
        results = []
        errors = []
        total_predictions = len(job["predictions"])
        
        for i, prediction in enumerate(job["predictions"]):
            try:
                # Determine if it's a single or multi factor prediction
                if "factor" in prediction:
                    # Single factor
                    request = FactorRequest(**prediction)
                    result = await prediction_engine.predict_custom_factor(request.factor)
                    results.append({
                        "type": "single",
                        "factor": request.factor,
                        "result": result.to_dict()
                    })
                else:
                    # Multi factor
                    request = MultiFactorRequest(**prediction)
                    result = await prediction_engine.predict_multi_factors(request.factors)
                    results.append({
                        "type": "multi",
                        "factors": request.factors,
                        "result": result.to_dict()
                    })
            except Exception as e:
                logger.error(f"Error processing prediction in job {job_id}: {str(e)}")
                errors.append({
                    "index": i,
                    "error": str(e),
                    "prediction": prediction
                })
            
            # Update progress
            progress = ((i + 1) / total_predictions) * 100
            job["progress"] = progress
            job["updated_at"] = datetime.utcnow().isoformat()
            await redis_conn.setex(
                f"job:{job_id}",
                86400,  # Store for 24 hours
                json.dumps(job)
            )
            
            # Brief pause to prevent overloading the system
            await asyncio.sleep(0.01)
        
        # Update job with results
        job["status"] = "completed"
        job["results"] = results
        job["errors"] = errors
        job["progress"] = 100
        job["updated_at"] = datetime.utcnow().isoformat()
        job["completed_at"] = datetime.utcnow().isoformat()
        
        await redis_conn.setex(
            f"job:{job_id}",
            86400,  # Store for 24 hours
            json.dumps(job)
        )
        
        # Send webhook notification if callback URL is provided
        if job.get("callback_url"):
            notification_data = {
                "results_count": len(results),
                "errors_count": len(errors),
                "completed_at": job["completed_at"]
            }
            
            await send_webhook_notification(
                job["callback_url"],
                "bulk_prediction.completed",
                job_id,
                notification_data
            )
        
        logger.info(f"Bulk prediction job {job_id} completed successfully")
    except Exception as e:
        logger.error(f"Error processing bulk prediction job {job_id}: {str(e)}")
        
        # Update job status to failed
        try:
            job["status"] = "failed"
            job["error"] = str(e)
            job["updated_at"] = datetime.utcnow().isoformat()
            
            await redis_conn.setex(
                f"job:{job_id}",
                86400,  # Store for 24 hours
                json.dumps(job)
            )
            
            # Send webhook notification about failure if callback URL is provided
            if job.get("callback_url"):
                notification_data = {
                    "error": str(e),
                    "failed_at": datetime.utcnow().isoformat()
                }
                
                await send_webhook_notification(
                    job["callback_url"],
                    "bulk_prediction.failed",
                    job_id,
                    notification_data
                )
        except Exception as inner_e:
            logger.error(f"Failed to update failed job status: {str(inner_e)}")

#######################
# Security Middleware #
#######################

# Define API key header
api_key_header = APIKeyHeader(name="X-API-Key")

async def verify_api_key(x_api_key: str = Depends(api_key_header)):
    """Verify API key for API endpoints"""
    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    
    return x_api_key

# OAuth2 scheme for JWT token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def verify_token(token: str = Depends(oauth2_scheme)) -> UserData:
    """Verify JWT token and return user data"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        # Extract user data from token
        user_data = UserData(
            user_id=payload.get("sub"),
            username=payload.get("username"),
            email=payload.get("email"),
            subscription_tier=payload.get("subscription_tier", "basic"),
            organizations=payload.get("organizations", []),
            exp=payload.get("exp")
        )
        
        # Check if token is expired
        if user_data.exp and datetime.utcnow().timestamp() > user_data.exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user_data
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_rate_limit_key(request: Request, user: UserData = Depends(verify_token)):
    """Generate rate limit key based on user ID and tier"""
    return f"ratelimit:{user.user_id}:{user.subscription_tier}"

def rate_limit_by_tier(tier: SubscriptionTier):
    """Apply rate limiting based on user subscription tier"""
    limit = RATE_LIMITS.get(tier, RATE_LIMITS["basic"])
    
    return RateLimiter(
        key_func=get_rate_limit_key,
        times=limit,
        seconds=60  # Per minute
    )

####################
# GraphQL Resolver #
####################

@strawberry.type
class Query:
    @strawberry.field
    async def predict_factor(
        self, 
        info: Info,
        input: FactorInput
    ) -> SingleFactorResult:
        """GraphQL resolver for single factor prediction"""
        # Extract user from context
        user = info.context["user"]
        
        # Apply rate limiting
        await FastAPILimiter.redis.incr(f"ratelimit:{user.user_id}:{user.subscription_tier}")
        
        # Convert to internal model
        request = FactorRequest(
            factor=input.factor,
            league=input.league,
            include_supporting_data=input.include_supporting_data
        )
        
        # Generate request ID
        request_id = generate_request_id()
        
        # Check cache
        cache_key = generate_cache_key("predict_single", request.dict())
        cached_result = await get_cache(cache_key)
        
        if cached_result:
            # Record cache hit metric
            await record_metric("cache_hit", tags={"endpoint": "predict_single"})
            
            # Return cached result
            result = CustomPredictionResult.from_dict(cached_result["data"])
            
            return SingleFactorResult(
                request_id=request_id,
                timestamp=datetime.utcnow().isoformat(),
                factor=request.factor,
                result=PredictionResult(
                    probability=result.probability,
                    confidence=result.confidence,
                    prediction=result.prediction,
                    supporting_data=result.supporting_data if request.include_supporting_data else None
                ),
                cached=True
            )
        
        # Record cache miss metric
        await record_metric("cache_miss", tags={"endpoint": "predict_single"})
        
        # Generate prediction
        span = tracer.start_span("predict_custom_factor")
        with trace.use_span(span):
            result = await prediction_engine.predict_custom_factor(request.factor)
        
        # Cache result
        ttl = request.cache_ttl or CACHE_TTL["single_prediction"]
        await set_cache(cache_key, {"data": result.to_dict()}, ttl)
        
        # Return result
        return SingleFactorResult(
            request_id=request_id,
            timestamp=datetime.utcnow().isoformat(),
            factor=request.factor,
            result=PredictionResult(
                probability=result.probability,
                confidence=result.confidence,
                prediction=result.prediction,
                supporting_data=result.supporting_data if request.include_supporting_data else None
            ),
            cached=False
        )
    
    @strawberry.field
    async def predict_multi_factors(
        self, 
        info: Info,
        input: MultiFactorInput
    ) -> MultiFactorResult:
        """GraphQL resolver for multi-factor prediction"""
        # Extract user from context
        user = info.context["user"]
        
        # Apply rate limiting
        await FastAPILimiter.redis.incr(f"ratelimit:{user.user_id}:{user.subscription_tier}")
        
        # Convert to internal model
        request = MultiFactorRequest(
            factors=input.factors,
            league=input.league,
            max_factors=input.max_factors,
            include_analysis=input.include_analysis
        )
        
        # Generate request ID
        request_id = generate_request_id()
        
        # Check cache
        cache_key = generate_cache_key("predict_multi", request.dict())
        cached_result = await get_cache(cache_key)
        
        if cached_result:
            # Record cache hit metric
            await record_metric("cache_hit", tags={"endpoint": "predict_multi"})
            
            # Return cached result
            result = MultiFactorPredictionResult.from_dict(cached_result["data"])
            
            return MultiFactorResult(
                request_id=request_id,
                timestamp=datetime.utcnow().isoformat(),
                factors=request.factors,
                results=[
                    PredictionResult(
                        probability=r.probability,
                        confidence=r.confidence,
                        prediction=r.prediction,
                        supporting_data=r.supporting_data if request.include_analysis else None
                    )
                    for r in result.factor_results
                ],
                combined_probability=result.combined_probability,
                analysis=result.analysis if request.include_analysis else None,
                cached=True
            )
        
        # Record cache miss metric
        await record_metric("cache_miss", tags={"endpoint": "predict_multi"})
        
        # Generate prediction
        span = tracer.start_span("predict_multi_factors")
        with trace.use_span(span):
            result = await prediction_engine.predict_multi_factors(request.factors)
        
        # Cache result
        ttl = request.cache_ttl or CACHE_TTL["multi_prediction"]
        await set_cache(cache_key, {"data": result.to_dict()}, ttl)
        
        # Return result
        return MultiFactorResult(
            request_id=request_id,
            timestamp=datetime.utcnow().isoformat(),
            factors=request.factors,
            results=[
                PredictionResult(
                    probability=r.probability,
                    confidence=r.confidence,
                    prediction=r.prediction,
                    supporting_data=r.supporting_data if request.include_analysis else None
                )
                for r in result.factor_results
            ],
            combined_probability=result.combined_probability,
            analysis=result.analysis if request.include_analysis else None,
            cached=False
        )

# Define GraphQL context
async def get_graphql_context(request: Request):
    """Create context for GraphQL resolvers"""
    # Extract authorization header
    authorization = request.headers.get("Authorization")
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify token
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication scheme",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user = await verify_token(token)
        
        # Return context with user data
        return {"user": user, "request": request}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

# Create GraphQL schema
schema = strawberry.Schema(query=Query)

# Create GraphQL router
graphql_router = GraphQLRouter(
    schema,
    context_getter=get_graphql_context,
)

##################
# FastAPI Setup  #
##################

# Initialize FastAPI app
app = FastAPI(
    title="Sports Analytics Ultra Premium Prediction API",
    description="Enterprise-grade API for custom single and multi-factor sports predictions",
    version=VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add middleware for compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add OpenTelemetry instrumentation
FastAPIInstrumentor.instrument_app(app)

# Add GraphQL endpoint
app.include_router(graphql_router, prefix="/graphql")

# Middleware to measure request duration
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Middleware to measure request processing time"""
    start_time = time.time()
    
    # Extract request details for logging
    path = request.url.path
    method = request.method
    
    # Process the request
    try:
        response = await call_next(request)
        
        # Calculate processing time
        process_time = time.time() - start_time
        
        # Add processing time header
        response.headers["X-Process-Time"] = str(process_time)
        
        # Record metric
        asyncio.create_task(
            record_metric(
                "request_duration",
                process_time,
                {
                    "path": path,
                    "method": method,
                    "status": response.status_code
                }
            )
        )
        
        return response
    except Exception as e:
        # Calculate processing time even for errors
        process_time = time.time() - start_time
        
        # Record error metric
        asyncio.create_task(
            record_metric(
                "request_error",
                1,
                {
                    "path": path,
                    "method": method,
                    "error": type(e).__name__
                }
            )
        )
        
        # Re-raise the exception
        raise

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Middleware to log requests for replay capability"""
    # Generate request ID
    request_id = generate_request_id()
    
    # Extract request details
    path = request.url.path
    method = request.method
    headers = dict(request.headers)
    
    # Extract user info if available
    user_id = None
    subscription_tier = None
    
    authorization = headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split()[1]
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("sub")
            subscription_tier = payload.get("subscription_tier")
        except:
            pass
    
    # Clone request body for logging
    body = None
    if request.method in ["POST", "PUT", "PATCH"]:
        try:
            # Read and restore body
            body_bytes = await request.body()
            
            # Restore request body
            async def receive():
                return {"type": "http.request", "body": body_bytes}
            
            request._receive = receive
            
            # Parse body
            if body_bytes:
                try:
                    body = json.loads(body_bytes)
                except:
                    body = {"raw": str(body_bytes)}
        except:
            body = {"error": "Could not parse request body"}
    
    # Add request ID header to response
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    
    # Log the request asynchronously (don't block response)
    if path not in ["/health", "/metrics", "/docs", "/redoc", "/openapi.json"]:
        log_data = RequestLog(
            request_id=request_id,
            endpoint=path,
            method=method,
            user_id=user_id,
            subscription_tier=subscription_tier,
            payload=body or {},
            timestamp=datetime.utcnow().isoformat(),
            ip_address=request.client.host if request.client else None,
            user_agent=headers.get("User-Agent")
        )
        
        asyncio.create_task(log_request(log_data))
    
    return response

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    global prediction_engine
    
    logger.info("Initializing Premium Prediction API")
    
    try:
        # Initialize Redis for rate limiting
        redis_conn = await get_redis_conn()
        await FastAPILimiter.init(redis_conn)
        
        # Initialize prediction engine
        prediction_engine = get_prediction_engine()
        await prediction_engine.initialize()
        
        logger.info("Premium Prediction API initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing API: {str(e)}")
        raise

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    logger.info("Shutting down Premium Prediction API")
    
    # Close Redis connections
    if redis_pool:
        await redis_pool.disconnect()

# Background task processor
async def process_job_queue():
    """Background task to process jobs from the queue"""
    while True:
        try:
            redis_conn = await get_redis_conn()
            
            # Pop job from queue
            job_id = await redis_conn.rpop("prediction_job_queue")
            
            if job_id:
                # Process the job
                job_id_str = job_id.decode('utf-8') if isinstance(job_id, bytes) else job_id
                logger.info(f"Processing job: {job_id_str}")
                
                # Process in background so we can continue checking the queue
                asyncio.create_task(process_bulk_prediction_job(job_id_str))
            else:
                # No jobs, sleep briefly
                await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Error in job queue processor: {str(e)}")
            await asyncio.sleep(1)  # Sleep longer on error

# Start background job processor
@app.on_event("startup")
async def start_background_tasks():
    """Start background tasks on startup"""
    # Start job queue processor
    asyncio.create_task(process_job_queue())

##############
# API Routes #
##############

# Health check endpoint
@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint"""
    # Check Redis connection
    redis_healthy = False
    try:
        redis_conn = await get_redis_conn()
        await redis_conn.ping()
        redis_healthy = True
    except Exception as e:
        logger.warning(f"Redis health check failed: {str(e)}")
    
    # Check prediction engine
    prediction_engine_healthy = prediction_engine is not None
    
    return {
        "status": "ok" if redis_healthy and prediction_engine_healthy else "degraded",
        "components": {
            "api": "ok",
            "redis": "ok" if redis_healthy else "error",
            "prediction_engine": "ok" if prediction_engine_healthy else "error"
        },
        "timestamp": datetime.utcnow().isoformat(),
        "version": VERSION
    }

# Metrics endpoint
@app.get("/metrics", tags=["System"])
async def get_metrics():
    """Get system metrics"""
    try:
        redis_conn = await get_redis_conn()
        
        # Get current hour for metrics
        current_hour = datetime.utcnow().strftime('%Y-%m-%d:%H')
        
        # Get metrics for the current hour
        all_metrics = {}
        
        # Scan for all metric keys
        cursor = 0
        pattern = f"metrics:*:{current_hour}"
        
        while True:
            cursor, keys = await redis_conn.scan(cursor, match=pattern, count=1000)
            
            for key in keys:
                # Extract metric name
                parts = key.split(":")
                if len(parts) >= 3:
                    metric_name = parts[1]
                    
                    # Get metric data
                    metric_data = await redis_conn.hgetall(key)
                    
                    # Add to metrics
                    if metric_name not in all_metrics:
                        all_metrics[metric_name] = {}
                    
                    all_metrics[metric_name][parts[2]] = metric_data
            
            if cursor == 0:
                break
        
        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": all_metrics
        }
    except Exception as e:
        logger.error(f"Error getting metrics: {str(e)}")
        return {
            "status": "error",
            "timestamp": datetime.utcnow().isoformat(),
            "message": str(e)
        }

# Single factor prediction endpoint
@app.post(
    "/predict/single", 
    response_model=FactorResponse,
    tags=["Predictions"],
    dependencies=[Depends(verify_api_key)]
)
async def predict_single_factor(
    request: FactorRequest,
    background_tasks: BackgroundTasks,
    user: UserData = Depends(verify_token),
    rate_limit: str = Depends(rate_limit_by_tier(SubscriptionTier.ULTRA_PREMIUM))
):
    """Generate prediction for a single custom factor"""
    request_id = generate_request_id()
    
    # Start tracing span
    span = tracer.start_span("predict_single_factor")
    span.set_attribute("request_id", request_id)
    span.set_attribute("user_id", user.user_id)
    span.set_attribute("factor", request.factor)
    
    with trace.use_span(span):
        try:
            # Check cache
            cache_key = generate_cache_key("predict_single", request.dict())
            cached_result = await get_cache(cache_key)
            
            if cached_result:
                # Record cache hit metric
                background_tasks.add_task(
                    record_metric,
                    "cache_hit",
                    tags={"endpoint": "predict_single"}
                )
                
                # Return cached result
                return {
                    "status": "success",
                    "data": cached_result["data"],
                    "timestamp": datetime.utcnow().isoformat(),
                    "request_id": request_id,
                    "cache_hit": True
                }
            
            # Record cache miss metric
            background_tasks.add_task(
                record_metric,
                "cache_miss",
                tags={"endpoint": "predict_single"}
            )
            
            # Check if prediction engine is initialized
            if prediction_engine is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Prediction engine is not initialized",
                )
            
            # Generate prediction
            span.add_event("generating_prediction")
            start_time = time.time()
            result = await prediction_engine.predict_custom_factor(request.factor)
            prediction_time = time.time() - start_time
            
            # Record prediction time metric
            background_tasks.add_task(
                record_metric,
                "prediction_time",
                prediction_time,
                {
                    "endpoint": "predict_single",
                    "league": request.league or "unknown"
                }
            )
            
            # Prepare response
            response_data = result.to_dict()
            
            # Remove supporting data if not requested
            if not request.include_supporting_data:
                response_data.pop("supporting_data", None)
            
            # Cache result
            ttl = request.cache_ttl or CACHE_TTL["single_prediction"]
            background_tasks.add_task(
                set_cache,
                cache_key,
                {"data": response_data},
                ttl
            )
            
            return {
                "status": "success",
                "data": response_data,
                "timestamp": datetime.utcnow().isoformat(),
                "request_id": request_id,
                "cache_hit": False
            }
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.StatusCode.ERROR, str(e))
            
            logger.error(f"Error in single factor prediction: {str(e)}")
            
            # Record error metric
            background_tasks.add_task(
                record_metric,
                "prediction_error",
                1,
                {
                    "endpoint": "predict_single",
                    "error": type(e).__name__
                }
            )
            
            # Return error response
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error generating prediction: {str(e)}",
            )

# Multi-factor prediction endpoint
@app.post(
    "/predict/multi", 
    response_model=MultiFactorResponse,
    tags=["Predictions"],
    dependencies=[Depends(verify_api_key)]
)
async def predict_multi_factors(
    request: MultiFactorRequest,
    background_tasks: BackgroundTasks,
    user: UserData = Depends(verify_token),
    rate_limit: str = Depends(rate_limit_by_tier(SubscriptionTier.ULTRA_PREMIUM))
):
    """Generate prediction for multiple custom factors"""
    request_id = generate_request_id()
    
    # Start tracing span
    span = tracer.start_span("predict_multi_factors")
    span.set_attribute("request_id", request_id)
    span.set_attribute("user_id", user.user_id)
    span.set_attribute("factors_count", len(request.factors))
    
    with trace.use_span(span):
        try:
            # Check cache
            cache_key = generate_cache_key("predict_multi", request.dict())
            cached_result = await get_cache(cache_key)
            
            if cached_result:
                # Record cache hit metric
                background_tasks.add_task(
                    record_metric,
                    "cache_hit",
                    tags={"endpoint": "predict_multi"}
                )
                
                # Return cached result
                return {
                    "status": "success",
                    "data": cached_result["data"],
                    "timestamp": datetime.utcnow().isoformat(),
                    "request_id": request_id,
                    "cache_hit": True
                }
            
            # Record cache miss metric
            background_tasks.add_task(
                record_metric,
                "cache_miss",
                tags={"endpoint": "predict_multi"}
            )
            
            # Check if prediction engine is initialized
            if prediction_engine is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Prediction engine is not initialized",
                )
            
            # Generate prediction
            span.add_event("generating_prediction")
            start_time = time.time()
            result = await prediction_engine.predict_multi_factors(request.factors)
            prediction_time = time.time() - start_time
            
            # Record prediction time metric
            background_tasks.add_task(
                record_metric,
                "prediction_time",
                prediction_time,
                {
                    "endpoint": "predict_multi",
                    "league": request.league or "unknown",
                    "factors_count": len(request.factors)
                }
            )
            
            # Prepare response
            response_data = result.to_dict()
            
            # Remove analysis if not requested
            if not request.include_analysis:
                response_data.pop("analysis", None)
            
            # Cache result
            ttl = request.cache_ttl or CACHE_TTL["multi_prediction"]
            background_tasks.add_task(
                set_cache,
                cache_key,
                {"data": response_data},
                ttl
            )
            
            return {
                "status": "success",
                "data": response_data,
                "timestamp": datetime.utcnow().isoformat(),
                "request_id": request_id,
                "cache_hit": False
            }
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.StatusCode.ERROR, str(e))
            
            logger.error(f"Error in multi-factor prediction: {str(e)}")
            
            # Record error metric
            background_tasks.add_task(
                record_metric,
                "prediction_error",
                1,
                {
                    "endpoint": "predict_multi",
                    "error": type(e).__name__
                }
            )
            
            # Return error response
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error generating prediction: {str(e)}",
            )

# Bulk prediction endpoint
@app.post(
    "/predict/bulk", 
    response_model=BulkPredictionResponse,
    tags=["Predictions"],
    dependencies=[Depends(verify_api_key)]
)
async def create_bulk_prediction(
    request: BulkPredictionRequest,
    background_tasks: BackgroundTasks,
    user: UserData = Depends(verify_token),
    rate_limit: str = Depends(rate_limit_by_tier(SubscriptionTier.ENTERPRISE))
):
    """Create bulk prediction job"""
    try:
        # Create job
        job_id = await create_bulk_prediction_job(request, user.user_id)
        
        # Get job data
        job_data = await get_job_status(job_id)
        
        # Process job asynchronously in background
        background_tasks.add_task(process_bulk_prediction_job, job_id)
        
        # Return response
        return {
            "status": "accepted",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "estimated_completion_time": job_data.get("estimated_completion_time")
        }
    except Exception as e:
        logger.error(f"Error creating bulk prediction job: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating bulk prediction job: {str(e)}",
        )

# Bulk prediction status endpoint
@app.get(
    "/predict/bulk/{job_id}", 
    response_model=BulkPredictionStatus,
    tags=["Predictions"],
    dependencies=[Depends(verify_api_key)]
)
async def get_bulk_prediction_status(
    job_id: str,
    user: UserData = Depends(verify_token)
):
    """Get bulk prediction job status"""
    try:
        # Get job data
        job_data = await get_job_status(job_id)
        
        # Check if user has access to this job
        if job_data.get("user_id") != user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this job"
            )
        
        # Return status
        return {
            "status": job_data.get("status", "unknown"),
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "progress": job_data.get("progress"),
            "results": job_data.get("results") if job_data.get("status") == "completed" else None,
            "error": job_data.get("error") if job_data.get("status") == "failed" else None
        }
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error getting bulk prediction status: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting job status: {str(e)}",
        )

# Factor parsing endpoint (for debugging)
@app.post(
    "/tools/parse-factor", 
    tags=["Tools"],
    dependencies=[Depends(verify_api_key)]
)
async def parse_factor(
    factor: str = Body(..., embed=True),
    user: UserData = Depends(verify_token)
):
    """Parse a factor without generating a prediction (for debugging)"""
    try:
        # Parse the factor
        parser = get_parser()
        parsed_factor = parser.parse_factor(factor)
        
        return {
            "status": "success",
            "data": parsed_factor.to_dict(),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error parsing factor: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error parsing factor: {str(e)}",
        )

# Replay request endpoint (for recovery)
@app.post(
    "/tools/replay-request/{request_id}", 
    tags=["Tools"],
    dependencies=[Depends(verify_api_key)]
)
async def replay_request(
    request_id: str,
    user: UserData = Depends(verify_token)
):
    """Replay a previous request (for disaster recovery)"""
    # Check if user is admin
    if user.subscription_tier != SubscriptionTier.ENTERPRISE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only enterprise users can replay requests"
        )
    
    try:
        # Get request log
        redis_conn = await get_redis_conn()
        log_data = await redis_conn.get(f"request_log:{request_id}")
        
        if not log_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Request {request_id} not found in logs"
            )
        
        # Parse log data
        log = json.loads(log_data)
        
        # Extract endpoint and payload
        endpoint = log.get("endpoint")
        payload = log.get("payload", {})
        
        # Replay request based on endpoint
        if endpoint == "/predict/single":
            # Replay single factor prediction
            request = FactorRequest(**payload)
            result = await prediction_engine.predict_custom_factor(request.factor)
            
            return {
                "status": "success",
                "original_request_id": request_id,
                "replay_timestamp": datetime.utcnow().isoformat(),
                "endpoint": endpoint,
                "result": result.to_dict()
            }
        elif endpoint == "/predict/multi":
            # Replay multi-factor prediction
            request = MultiFactorRequest(**payload)
            result = await prediction_engine.predict_multi_factors(request.factors)
            
            return {
                "status": "success",
                "original_request_id": request_id,
                "replay_timestamp": datetime.utcnow().isoformat(),
                "endpoint": endpoint,
                "result": result.to_dict()
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot replay requests to endpoint {endpoint}"
            )
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error replaying request: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error replaying request: {str(e)}",
        )

# Supported leagues endpoint
@app.get(
    "/info/leagues", 
    tags=["Info"]
)
async def get_leagues():
    """Get list of supported leagues"""
    return {
        "status": "success",
        "data": {
            "leagues": League.list()
        },
        "timestamp": datetime.utcnow().isoformat()
    }

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            status="error",
            code=f"HTTP_{exc.status_code}",
            message=exc.detail,
            timestamp=datetime.utcnow().isoformat(),
            request_id=request.headers.get("X-Request-ID")
        ).dict(),
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Handle generic exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            status="error",
            code="SERVER_ERROR",
            message="An unexpected error occurred",
            timestamp=datetime.utcnow().isoformat(),
            request_id=request.headers.get("X-Request-ID"),
            details={"error_type": type(exc).__name__}
        ).dict(),
    )

# Main function to run the API
if __name__ == "__main__":
    import uvicorn
    
    # Run the API server
    uvicorn.run(
        "premium_prediction_api:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Disable reload in production
        workers=4      # Use multiple workers
    )