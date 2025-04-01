const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const winston = require('winston');

/**
 * Enhanced CircuitBreaker with advanced features for enterprise applications
 * - Health metrics tracking
 * - Response time monitoring
 * - Configurable thresholds
 * - Half-open state handling
 * - Detailed event logging
 * - Request volume threshold
 */
class CircuitBreaker extends EventEmitter {
    /**
     * @param {Object} options Configuration options
     * @param {number} options.failureThreshold Number of failures before opening circuit
     * @param {number} options.resetTimeout Time in ms to wait before attempting reset (half-open)
     * @param {number} options.requestVolumeThreshold Minimum requests before calculating error rates
     * @param {number} options.rollingWindow Time window in ms for tracking metrics
     * @param {number} options.timeout Request timeout in ms
     * @param {number} options.halfOpenSuccessThreshold Successes needed in half-open state to close
     * @param {winston.Logger} options.logger Custom logger
     */
    constructor(options = {}) {
        super();
        
        // Core settings
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 60 seconds
        this.requestVolumeThreshold = options.requestVolumeThreshold || 5;
        this.rollingWindow = options.rollingWindow || 120000; // 2 minutes
        this.timeout = options.timeout || 30000; // 30 seconds
        this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold || 2;
        
        // Initialize breakers map
        this.breakers = new Map();
        
        // Setup logger
        this.logger = options.logger || winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            defaultMeta: { service: 'circuit-breaker' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
        
        // Metrics cleanup interval
        this._cleanupInterval = setInterval(() => this._cleanupMetrics(), this.rollingWindow);
    }

    /**
     * Execute an operation with circuit breaker protection
     * @param {string} key Circuit identifier
     * @param {Function} operation Async function to execute
     * @param {Object} options Runtime options
     * @returns {Promise<any>} Operation result
     */
    async execute(key, operation, options = {}) {
        const breaker = this._getBreaker(key);
        const timeout = options.timeout || this.timeout;
        const startTime = performance.now();
        
        // Record attempt
        this._recordAttempt(breaker);
        
        // Check if circuit is open
        if (breaker.state === 'open') {
            if (Date.now() - breaker.lastFailure > this.resetTimeout) {
                this._setHalfOpen(key, breaker);
            } else {
                const error = new CircuitBreakerOpenError(`Circuit '${key}' is open`);
                this._recordFastFail(breaker, startTime);
                this.emit('rejected', { key, error });
                this.logger.warn(`Circuit '${key}' rejected execution - circuit open`, {
                    state: breaker.state,
                    failures: breaker.failures,
                    lastFailure: new Date(breaker.lastFailure).toISOString()
                });
                throw error;
            }
        }
        
        // For half-open state, only allow limited requests
        if (breaker.state === 'half-open' && breaker.halfOpenAllowedRequests <= 0) {
            const error = new CircuitBreakerOpenError(`Circuit '${key}' is half-open and at capacity`);
            this._recordFastFail(breaker, startTime);
            this.emit('rejected', { key, error });
            throw error;
        }
        
        try {
            // Create a timeout race if timeout is set
            let result;
            if (timeout) {
                result = await Promise.race([
                    operation(),
                    new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new CircuitBreakerTimeoutError(`Operation timeout after ${timeout}ms`));
                        }, timeout);
                    })
                ]);
            } else {
                result = await operation();
            }
            
            // Record success
            const executionTime = performance.now() - startTime;
            this._recordSuccess(key, breaker, executionTime);
            return result;
        } catch (error) {
            // Record failure
            const executionTime = performance.now() - startTime;
            this._recordFailure(key, breaker, error, executionTime);
            throw error;
        }
    }
    
    /**
     * Fire-and-forget version of execute
     * @param {Function} fn Function to execute
     * @returns {Promise<any>} Operation result
     */
    async fire(fn) {
        return this.execute('default', fn);
    }

    /**
     * Get circuit breaker state
     * @param {string} key Circuit identifier
     * @returns {Object} Breaker state
     */
    getState(key) {
        const breaker = this.breakers.get(key);
        if (!breaker) return { state: 'closed', metrics: { success: 0, failure: 0, rejected: 0, latency: 0 } };
        
        const metrics = this._calculateMetrics(breaker);
        return {
            state: breaker.state,
            failures: breaker.failures,
            lastFailure: breaker.lastFailure ? new Date(breaker.lastFailure) : null,
            metrics
        };
    }
    
    /**
     * Get all circuit breaker states
     * @returns {Object} All breaker states
     */
    getAllStates() {
        const states = {};
        for (const [key, breaker] of this.breakers.entries()) {
            states[key] = {
                state: breaker.state,
                failures: breaker.failures,
                lastFailure: breaker.lastFailure ? new Date(breaker.lastFailure) : null,
                metrics: this._calculateMetrics(breaker)
            };
        }
        return states;
    }
    
    /**
     * Force a circuit to open
     * @param {string} key Circuit identifier
     */
    forceOpen(key) {
        const breaker = this._getBreaker(key);
        breaker.state = 'open';
        breaker.lastFailure = Date.now();
        this.emit('forced-open', { key });
        this.logger.info(`Circuit '${key}' forced open`);
    }
    
    /**
     * Force a circuit to close
     * @param {string} key Circuit identifier
     */
    forceClose(key) {
        const breaker = this._getBreaker(key);
        breaker.state = 'closed';
        breaker.failures = 0;
        this.emit('forced-closed', { key });
        this.logger.info(`Circuit '${key}' forced closed`);
    }
    
    /**
     * Reset a circuit to initial state
     * @param {string} key Circuit identifier
     */
    reset(key) {
        const breaker = this._getBreaker(key);
        breaker.state = 'closed';
        breaker.failures = 0;
        breaker.lastFailure = null;
        breaker.successes = 0;
        breaker.requests = [];
        breaker.metrics = {
            success: [],
            failure: [],
            rejected: [],
            latency: []
        };
        this.emit('reset', { key });
        this.logger.info(`Circuit '${key}' reset to initial state`);
    }
    
    /**
     * Dispose the circuit breaker
     */
    dispose() {
        clearInterval(this._cleanupInterval);
        this.breakers.clear();
        this.emit('disposed');
        this.logger.info('Circuit breaker disposed');
    }
    
    // ===== Private methods =====
    
    /**
     * Get or create a breaker
     * @private
     */
    _getBreaker(key) {
        if (!this.breakers.has(key)) {
            this.breakers.set(key, {
                state: 'closed',
                failures: 0,
                successes: 0,
                lastFailure: null,
                halfOpenAllowedRequests: this.halfOpenSuccessThreshold,
                requests: [],
                metrics: {
                    success: [],
                    failure: [],
                    rejected: [],
                    latency: []
                }
            });
        }
        return this.breakers.get(key);
    }
    
    /**
     * Record a request attempt
     * @private
     */
    _recordAttempt(breaker) {
        breaker.requests.push({
            timestamp: Date.now()
        });
    }
    
    /**
     * Record a fast-fail (rejection due to open circuit)
     * @private
     */
    _recordFastFail(breaker, startTime) {
        const executionTime = performance.now() - startTime;
        breaker.metrics.rejected.push({
            timestamp: Date.now(),
            duration: executionTime
        });
    }
    
    /**
     * Record a successful execution
     * @private
     */
    _recordSuccess(key, breaker, executionTime) {
        breaker.metrics.success.push({
            timestamp: Date.now(),
            duration: executionTime
        });
        
        breaker.metrics.latency.push({
            timestamp: Date.now(),
            duration: executionTime
        });
        
        // Handle half-open state success
        if (breaker.state === 'half-open') {
            breaker.successes++;
            breaker.halfOpenAllowedRequests--;
            
            if (breaker.successes >= this.halfOpenSuccessThreshold) {
                this._setClosed(key, breaker);
            }
        } else {
            // Reset failures in closed state
            breaker.failures = 0;
        }
        
        this.emit('success', { 
            key, 
            executionTime,
            state: breaker.state 
        });
    }
    
    /**
     * Record a failed execution
     * @private
     */
    _recordFailure(key, breaker, error, executionTime) {
        breaker.failures++;
        breaker.lastFailure = Date.now();
        
        breaker.metrics.failure.push({
            timestamp: Date.now(),
            duration: executionTime,
            error: error.message
        });
        
        breaker.metrics.latency.push({
            timestamp: Date.now(),
            duration: executionTime
        });
        
        // Check if we should open the circuit
        const metrics = this._calculateMetrics(breaker);
        
        // Handle half-open state failure
        if (breaker.state === 'half-open') {
            this._setOpen(key, breaker);
            return;
        }
        
        // Check if we have enough requests to calculate error rate
        if (metrics.totalRequests >= this.requestVolumeThreshold) {
            const errorRate = metrics.failures / metrics.totalRequests;
            
            // Open circuit if error rate exceeds threshold percentage
            if (breaker.failures >= this.failureThreshold) {
                this._setOpen(key, breaker);
            }
        }
        
        this.emit('failure', { 
            key, 
            error: error.message, 
            executionTime,
            state: breaker.state,
            failures: breaker.failures 
        });
    }
    
    /**
     * Set circuit to open state
     * @private
     */
    _setOpen(key, breaker) {
        const previousState = breaker.state;
        breaker.state = 'open';
        breaker.successes = 0;
        if (previousState !== 'open') {
            this.emit('open', { key, failures: breaker.failures });
            this.logger.warn(`Circuit '${key}' opened after ${breaker.failures} failures`);
        }
    }
    
    /**
     * Set circuit to half-open state
     * @private
     */
    _setHalfOpen(key, breaker) {
        const previousState = breaker.state;
        breaker.state = 'half-open';
        breaker.successes = 0;
        breaker.halfOpenAllowedRequests = this.halfOpenSuccessThreshold;
        if (previousState !== 'half-open') {
            this.emit('half-open', { key });
            this.logger.info(`Circuit '${key}' half-open, allowing test requests`);
        }
    }
    
    /**
     * Set circuit to closed state
     * @private
     */
    _setClosed(key, breaker) {
        const previousState = breaker.state;
        breaker.state = 'closed';
        breaker.failures = 0;
        breaker.successes = 0;
        if (previousState !== 'closed') {
            this.emit('close', { key });
            this.logger.info(`Circuit '${key}' closed after successful tests`);
        }
    }
    
    /**
     * Calculate metrics for a breaker
     * @private
     */
    _calculateMetrics(breaker) {
        const now = Date.now();
        const window = now - this.rollingWindow;
        
        // Filter metrics within rolling window
        const recentRequests = breaker.requests.filter(r => r.timestamp > window);
        const successes = breaker.metrics.success.filter(s => s.timestamp > window);
        const failures = breaker.metrics.failure.filter(f => f.timestamp > window);
        const rejections = breaker.metrics.rejected.filter(r => r.timestamp > window);
        const latencies = breaker.metrics.latency.filter(l => l.timestamp > window);
        
        // Calculate latency statistics
        let avgLatency = 0;
        let maxLatency = 0;
        let p95Latency = 0;
        let p99Latency = 0;
        
        if (latencies.length > 0) {
            // Sort latencies for percentile calculation
            const sortedLatencies = [...latencies].sort((a, b) => a.duration - b.duration);
            avgLatency = latencies.reduce((sum, l) => sum + l.duration, 0) / latencies.length;
            maxLatency = sortedLatencies[sortedLatencies.length - 1].duration;
            
            // Calculate percentiles
            const p95Index = Math.floor(sortedLatencies.length * 0.95);
            const p99Index = Math.floor(sortedLatencies.length * 0.99);
            p95Latency = sortedLatencies[Math.min(p95Index, sortedLatencies.length - 1)].duration;
            p99Latency = sortedLatencies[Math.min(p99Index, sortedLatencies.length - 1)].duration;
        }
        
        return {
            totalRequests: recentRequests.length,
            successes: successes.length,
            failures: failures.length,
            rejections: rejections.length,
            errorRate: recentRequests.length > 0 ? failures.length / recentRequests.length : 0,
            latency: {
                avg: avgLatency,
                max: maxLatency,
                p95: p95Latency,
                p99: p99Latency
            }
        };
    }
    
    /**
     * Clean up old metrics
     * @private
     */
    _cleanupMetrics() {
        const now = Date.now();
        const window = now - this.rollingWindow;
        
        for (const breaker of this.breakers.values()) {
            // Clean up old metrics
            breaker.requests = breaker.requests.filter(r => r.timestamp > window);
            breaker.metrics.success = breaker.metrics.success.filter(s => s.timestamp > window);
            breaker.metrics.failure = breaker.metrics.failure.filter(f => f.timestamp > window);
            breaker.metrics.rejected = breaker.metrics.rejected.filter(r => r.timestamp > window);
            breaker.metrics.latency = breaker.metrics.latency.filter(l => l.timestamp > window);
        }
    }
}

// Custom errors
class CircuitBreakerOpenError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
    }
}

class CircuitBreakerTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CircuitBreakerTimeoutError';
    }
}

// Create and export singleton instance to maintain backward compatibility
const circuitBreakerInstance = new CircuitBreaker();

// Export everything as a module
module.exports = circuitBreakerInstance;
module.exports.CircuitBreaker = CircuitBreaker;
module.exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
module.exports.CircuitBreakerTimeoutError = CircuitBreakerTimeoutError;