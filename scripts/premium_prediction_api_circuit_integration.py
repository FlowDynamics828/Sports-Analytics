"""
Circuit Breaker Integration for Premium Prediction API
This should be applied to the premium_prediction_api.py file to add circuit breaker functionality
"""

# Import the circuit breaker
from .circuit_breaker import CircuitBreaker, CircuitBreakerRegistry

# Create a registry for circuit breakers
circuit_registry = CircuitBreakerRegistry()

# Create circuit breakers for critical services
prediction_circuit = circuit_registry.get_or_create("prediction_engine", failure_threshold=5, reset_timeout=30)
redis_circuit = circuit_registry.get_or_create("redis", failure_threshold=3, reset_timeout=15)
database_circuit = circuit_registry.get_or_create("database", failure_threshold=3, reset_timeout=20)

# To use in the /predict/single endpoint, modify the code as follows:
# Replace:
# result = await prediction_engine.predict_custom_factor(request.factor)
#
# With:
# result = await prediction_circuit.execute(
#     prediction_engine.predict_custom_factor,
#     request.factor
# )

# To use in the /predict/multi endpoint, modify the code as follows:
# Replace:
# result = await prediction_engine.predict_multi_factors(request.factors)
#
# With:
# result = await prediction_circuit.execute(
#     prediction_engine.predict_multi_factors,
#     request.factors
# )

# To use with Redis operations, modify code as follows:
# Replace:
# redis_conn = await get_redis_conn()
# await redis_conn.setex(...)
#
# With:
# redis_conn = await get_redis_conn()
# await redis_circuit.execute(
#     redis_conn.setex,
#     key, ttl, json.dumps(data)
# )

# Add a new endpoint to monitor circuit breaker status
@app.get(
    "/system/circuit-status",
    tags=["System"],
    dependencies=[Depends(verify_api_key)]
)
async def get_circuit_status(
    user: UserData = Depends(verify_token)
):
    """Get circuit breaker status"""
    # Check if user has admin privileges
    if user.subscription_tier != SubscriptionTier.ENTERPRISE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    
    return {
        "status": "success",
        "data": circuit_registry.get_all_statuses(),
        "timestamp": datetime.utcnow().isoformat()
    }

# Add circuit breaker middleware for Redis operations
class RedisCircuitMiddleware:
    """Middleware to apply circuit breaker to Redis operations"""
    
    def __init__(self, redis_circuit):
        self.redis_circuit = redis_circuit
    
    async def get(self, redis_conn, key):
        """Get data from Redis with circuit breaker"""
        return await self.redis_circuit.execute(redis_conn.get, key)
    
    async def setex(self, redis_conn, key, ttl, value):
        """Set data in Redis with circuit breaker"""
        return await self.redis_circuit.execute(redis_conn.setex, key, ttl, value)
    
    async def delete(self, redis_conn, key):
        """Delete key from Redis with circuit breaker"""
        return await self.redis_circuit.execute(redis_conn.delete, key)

# Instantiate the Redis circuit middleware
redis_middleware = RedisCircuitMiddleware(redis_circuit)

# Modify the get_cache and set_cache functions to use the middleware
async def get_cache(key: str) -> Optional[Dict]:
    """Get data from cache with circuit breaker protection"""
    try:
        redis_conn = await get_redis_conn()
        data = await redis_middleware.get(redis_conn, key)
        if data:
            return json.loads(data)
        return None
    except RedisError as e:
        logger.warning(f"Failed to get from cache: {str(e)}")
        return None

async def set_cache(key: str, data: Dict, ttl: int) -> bool:
    """Set data in cache with circuit breaker protection"""
    try:
        redis_conn = await get_redis_conn()
        await redis_middleware.setex(redis_conn, key, ttl, json.dumps(data))
        return True
    except RedisError as e:
        logger.warning(f"Failed to set cache: {str(e)}")
        return False 