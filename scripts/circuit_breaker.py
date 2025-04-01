"""
Circuit Breaker Module
Provides circuit breaker pattern implementation for API resilience
"""
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Callable, Any, Dict, Optional
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

class CircuitBreaker:
    """Circuit breaker pattern implementation for API resilience"""
    
    # Circuit states
    STATE_CLOSED = "CLOSED"       # Normal operation, requests pass through
    STATE_OPEN = "OPEN"           # Circuit is open, requests fail fast
    STATE_HALF_OPEN = "HALF_OPEN" # Testing if service is healthy again
    
    def __init__(
        self, 
        name: str, 
        failure_threshold: int = 5, 
        reset_timeout: int = 30,
        half_open_max_calls: int = 3,
        monitoring_window: int = 60
    ):
        """Initialize the circuit breaker
        
        Args:
            name: Unique name for this circuit breaker
            failure_threshold: Number of failures before circuit opens
            reset_timeout: Seconds to wait before trying half-open state
            half_open_max_calls: Max calls allowed in half-open state
            monitoring_window: Time window in seconds to track failures
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.half_open_max_calls = half_open_max_calls
        self.monitoring_window = monitoring_window
        
        # Internal state
        self.state = self.STATE_CLOSED
        self.failures = 0
        self.success_count = 0
        self.last_failure_time = None
        self.last_state_change = datetime.now()
        self.half_open_calls = 0
        
        # Metrics
        self.metrics = {
            "total_failures": 0,
            "total_successes": 0,
            "total_timeouts": 0,
            "open_circuits": 0,
            "state_changes": 0,
            "last_failure": None,
            "last_success": None
        }
        
        logger.info(f"Circuit breaker '{name}' initialized with failure threshold {failure_threshold}")
        
    def _change_state(self, new_state: str) -> None:
        """Change the state of the circuit breaker"""
        if self.state != new_state:
            old_state = self.state
            self.state = new_state
            self.last_state_change = datetime.now()
            self.metrics["state_changes"] += 1
            
            if new_state == self.STATE_OPEN:
                self.metrics["open_circuits"] += 1
                
            logger.info(f"Circuit '{self.name}' state changed: {old_state} -> {new_state}")
                
    async def execute(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection"""
        # Check if circuit is OPEN
        if self.state == self.STATE_OPEN:
            # Check if timeout has elapsed to allow retry
            if self.last_failure_time and (datetime.now() - self.last_failure_time).total_seconds() >= self.reset_timeout:
                logger.info(f"Circuit '{self.name}' trying to recover (HALF-OPEN)")
                self._change_state(self.STATE_HALF_OPEN)
                self.half_open_calls = 0
            else:
                # Fast fail while circuit is open
                logger.warning(f"Circuit '{self.name}' is OPEN - fast failing request")
                self.metrics["total_failures"] += 1
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Service temporarily unavailable ({self.name}). Retry in {self.reset_timeout} seconds."
                )
                
        # In HALF-OPEN state, limit the number of calls
        if self.state == self.STATE_HALF_OPEN:
            if self.half_open_calls >= self.half_open_max_calls:
                logger.warning(f"Circuit '{self.name}' exceeded max test calls in HALF-OPEN state")
                self.metrics["total_failures"] += 1
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Service temporarily unavailable ({self.name}). Too many recovery attempts."
                )
            self.half_open_calls += 1
                
        try:
            # Execute the function
            start_time = time.time()
            result = await func(*args, **kwargs)
            execution_time = time.time() - start_time
            
            # On success, update metrics and possibly change state
            self.metrics["total_successes"] += 1
            self.metrics["last_success"] = datetime.now()
            self.success_count += 1
            
            # If in HALF-OPEN state and successful, close the circuit
            if self.state == self.STATE_HALF_OPEN:
                logger.info(f"Circuit '{self.name}' recovered successfully (CLOSED)")
                self._change_state(self.STATE_CLOSED)
                self.failures = 0
                
            return result
            
        except Exception as e:
            # On failure, update metrics and possibly change state
            self.failures += 1
            self.last_failure_time = datetime.now()
            self.metrics["total_failures"] += 1
            self.metrics["last_failure"] = self.last_failure_time
            
            if isinstance(e, asyncio.TimeoutError):
                self.metrics["total_timeouts"] += 1
            
            logger.error(f"Circuit '{self.name}' recorded failure: {str(e)}")
            
            # If threshold reached in CLOSED state, open the circuit
            if self.state == self.STATE_CLOSED and self.failures >= self.failure_threshold:
                logger.warning(f"Circuit '{self.name}' tripped to OPEN state after {self.failures} failures")
                self._change_state(self.STATE_OPEN)
                
            # If failure in HALF-OPEN state, go back to OPEN
            elif self.state == self.STATE_HALF_OPEN:
                logger.warning(f"Circuit '{self.name}' returned to OPEN state after test failure")
                self._change_state(self.STATE_OPEN)
                
            # Re-raise the original exception
            raise e
            
    def get_status(self) -> Dict:
        """Get the current status of this circuit breaker"""
        return {
            "name": self.name,
            "state": self.state,
            "failures": self.failures,
            "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "last_state_change": self.last_state_change.isoformat(),
            "metrics": self.metrics
        }

class CircuitBreakerRegistry:
    """Registry to manage multiple circuit breakers"""
    
    def __init__(self):
        """Initialize the circuit breaker registry"""
        self.circuit_breakers = {}
        
    def get_or_create(
        self, 
        name: str, 
        failure_threshold: int = 5, 
        reset_timeout: int = 30,
        half_open_max_calls: int = 3,
        monitoring_window: int = 60
    ) -> CircuitBreaker:
        """Get an existing circuit breaker or create a new one"""
        if name not in self.circuit_breakers:
            self.circuit_breakers[name] = CircuitBreaker(
                name=name,
                failure_threshold=failure_threshold,
                reset_timeout=reset_timeout,
                half_open_max_calls=half_open_max_calls,
                monitoring_window=monitoring_window
            )
        return self.circuit_breakers[name]
        
    def get_all_statuses(self) -> Dict[str, Dict]:
        """Get status of all circuit breakers"""
        return {name: cb.get_status() for name, cb in self.circuit_breakers.items()} 