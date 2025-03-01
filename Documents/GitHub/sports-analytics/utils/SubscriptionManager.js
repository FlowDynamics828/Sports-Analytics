const { LogManager } = require('./logger');
const EventEmitter = require('events');

class SubscriptionManager extends EventEmitter {
    constructor() {
        super();
        const logManager = new LogManager();
        this.logger = logManager.logger;
        this.subscriptions = new Map();
        this.initialize();
    }

    initialize() {
        this.logger.info('SubscriptionManager initialized');
    }

    async subscribe(userId, eventType, callback) {
        if (!this.subscriptions.has(eventType)) {
            this.subscriptions.set(eventType, new Map());
        }
        
        const eventSubscribers = this.subscriptions.get(eventType);
        eventSubscribers.set(userId, callback);
        
        this.logger.info('New subscription added', {
            userId,
            eventType
        });
    }

    async unsubscribe(userId, eventType) {
        if (this.subscriptions.has(eventType)) {
            const eventSubscribers = this.subscriptions.get(eventType);
            eventSubscribers.delete(userId);
            
            this.logger.info('Subscription removed', {
                userId,
                eventType
            });
        }
    }

    async notify(eventType, data) {
        if (this.subscriptions.has(eventType)) {
            const eventSubscribers = this.subscriptions.get(eventType);
            
            for (const [userId, callback] of eventSubscribers) {
                try {
                    await callback(data);
                    this.logger.info('Notification sent', {
                        userId,
                        eventType
                    });
                } catch (error) {
                    this.logger.error('Failed to send notification', {
                        userId,
                        eventType,
                        error: error.message
                    });
                }
            }
        }
    }

    // Implement the singleton pattern
    static getInstance() {
        if (!SubscriptionManager.instance) {
            SubscriptionManager.instance = new SubscriptionManager();
        }
        return SubscriptionManager.instance;
    }

    // Cleanup method for graceful shutdown
    async cleanup() {
        this.subscriptions.clear();
        this.logger.info('SubscriptionManager cleaned up');
    }
}

// Export the singleton instance
module.exports = {
    SubscriptionManager
};