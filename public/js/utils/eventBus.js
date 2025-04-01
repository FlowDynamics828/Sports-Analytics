/**
 * EventBus utility - Implements publish/subscribe pattern for application events
 */
class EventBus {
    constructor() {
        this.subscribers = {};
        this.debug = false;
    }

    /**
     * Enable or disable debug logging for published events
     * @param {boolean} enabled - Whether debug mode should be enabled
     */
    setDebug(enabled) {
        this.debug = enabled;
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name to subscribe to
     * @param {Function} callback - Function to call when event is published
     * @returns {Function} Unsubscribe function
     */
    subscribe(event, callback) {
        if (!this.subscribers[event]) {
            this.subscribers[event] = [];
        }
        
        this.subscribers[event].push(callback);
        
        // Return unsubscribe function
        return () => {
            this.subscribers[event] = this.subscribers[event].filter(cb => cb !== callback);
        };
    }

    /**
     * Publish an event
     * @param {string} event - Event name to publish
     * @param {*} data - Data to pass to subscribers
     */
    publish(event, data) {
        if (this.debug) {
            console.log(`[EventBus] Event published: ${event}`, data);
        }
        
        if (!this.subscribers[event]) {
            return;
        }
        
        this.subscribers[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error in subscriber callback for event ${event}:`, error);
            }
        });
    }

    /**
     * Subscribe to an event and automatically unsubscribe after first invocation
     * @param {string} event - Event name to subscribe to
     * @param {Function} callback - Function to call when event is published
     */
    once(event, callback) {
        const unsubscribe = this.subscribe(event, (data) => {
            callback(data);
            unsubscribe();
        });
        
        return unsubscribe;
    }

    /**
     * Unsubscribe all callbacks for a specific event or all events
     * @param {string} [event] - Event name to unsubscribe from (all events if omitted)
     */
    unsubscribeAll(event) {
        if (event) {
            this.subscribers[event] = [];
        } else {
            this.subscribers = {};
        }
    }

    /**
     * Get the number of subscribers for a given event
     * @param {string} event - Event name
     * @returns {number} Number of subscribers
     */
    getSubscriberCount(event) {
        return this.subscribers[event] ? this.subscribers[event].length : 0;
    }
}

// Export singleton instance
export const eventBus = new EventBus();
export default eventBus; 