const redis = require('./redisManager');
const { EventEmitter } = require('events');

class SubscriptionsManager extends EventEmitter {
    constructor() {
        super();
        this.subscriptions = new Map();
    }

    async getSubscription(userId) {
        try {
            const subscription = await redis.get(`subscription:${userId}`);
            return JSON.parse(subscription);
        } catch (error) {
            console.error('Failed to get subscription:', error);
            throw error;
        }
    }

    async setSubscription(userId, subscription) {
        try {
            await redis.set(`subscription:${userId}`, JSON.stringify(subscription));
        } catch (error) {
            console.error('Failed to set subscription:', error);
            throw error;
        }
    }

    addSubscription(id, subscription) {
        this.subscriptions.set(id, subscription);
        this.emit('subscriptionAdded', id, subscription);
    }

    removeSubscription(id) {
        this.subscriptions.delete(id);
        this.emit('subscriptionRemoved', id);
    }

    getSubscription(id) {
        return this.subscriptions.get(id);
    }

    getAllSubscriptions() {
        return Array.from(this.subscriptions.values());
    }
}

module.exports = new SubscriptionsManager();
