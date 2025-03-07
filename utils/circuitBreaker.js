const EventEmitter = require('events');
const logger = require('./logger');

class CircuitBreaker extends EventEmitter {
    constructor(options = {}) {
        super();
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.breakers = new Map();
    }

    async execute(key, operation) {
        const breaker = this.getBreaker(key);
        
        if (breaker.state === 'open') {
            if (Date.now() - breaker.lastFailure > this.resetTimeout) {
                breaker.state = 'half-open';
            } else {
                throw new Error('Circuit breaker is open');
            }
        }

        try {
            const result = await operation();
            this.onSuccess(key);
            return result;
        } catch (error) {
            this.onFailure(key);
            throw error;
        }
    }

    getBreaker(key) {
        if (!this.breakers.has(key)) {
            this.breakers.set(key, {
                state: 'closed',
                failures: 0,
                lastFailure: null
            });
        }
        return this.breakers.get(key);
    }

    onSuccess(key) {
        const breaker = this.getBreaker(key);
        breaker.failures = 0;
        breaker.state = 'closed';
        this.emit('success', key);
    }

    onFailure(key) {
        const breaker = this.getBreaker(key);
        breaker.failures++;
        breaker.lastFailure = Date.now();

        if (breaker.failures >= this.failureThreshold) {
            breaker.state = 'open';
            this.emit('open', key);
            logger.warn('Circuit breaker opened for:', key);
        }
    }
}

module.exports = new CircuitBreaker();