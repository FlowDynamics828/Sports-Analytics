// WebSocket Client for Real-time Sports Analytics Updates
// Version 3.1.0

document.addEventListener('DOMContentLoaded', () => {
    if (!isPublicPage()) {
        const wsClient = new WebSocketClient();
        wsClient.connect().catch(error => {
            console.error('WebSocket connection failed:', error);
        });
    }
});

function isPublicPage() {
    const publicPaths = ['/login', '/signup', '/forgot-password', '/', '/index.html'];
    const currentPath = window.location.pathname;
    return publicPaths.includes(currentPath);
}

/**
 * WebSocket Client for real-time sports analytics updates
 * Handles connection management, subscription, and message routing
 */
class WebSocketClient {
    /**
     * Initialize WebSocket client
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.socket = null;
        this.status = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 3000; // Base delay: 3 seconds
        this.subscribedLeagues = [];
        this.messageHandlers = [];
        this.onMessage = null;
        this.onStatusChange = null;
        this.lastPingTime = Date.now();
        this.pingInterval = null;
        this.reconnectTimeout = null;
        this.connectionTimeout = null;
        
        // Bind methods to ensure 'this' refers to the correct context
        this.connect = this.connect.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.send = this.send.bind(this);
        this.subscribe = this.subscribe.bind(this);
        this.unsubscribe = this.unsubscribe.bind(this);
    }

    /**
     * Connect to WebSocket server
     * @returns {Promise<void>} Resolves when connected
     */
    async connect() {
        return new Promise((resolve, reject) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.hostname}:5150/ws`;
            this.connectionTimeout = setTimeout(() => {
                console.warn('WebSocket connection timeout');
                reject(new Error('WebSocket connection timeout'));
            }, 10000); // 10 second timeout

            console.log('Connecting to WebSocket server...');
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                console.log('WebSocket connected');
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
                this.status = 'connected';
                this.reconnectAttempts = 0;
                this.startPingInterval();
                this.updateStatus('connected');
                
                // Resubscribe to previously subscribed leagues
                this.resubscribe();
                
                resolve();
            };

            this.socket.onclose = (event) => {
                console.log(`WebSocket closed: ${event.code} ${event.reason}`);
                this.status = 'disconnected';
                this.updateStatus('disconnected');
                
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }
                
                // Only attempt reconnect if not a normal closure
                // and not a token auth issue (4001)
                if (event.code !== 1000 && event.code !== 4001) {
                    this.scheduleReconnect();
                } else if (event.code === 4001) {
                    // Authentication issue - redirect to login
                    console.warn('WebSocket auth failed - token likely expired');
                    localStorage.removeItem('token');
                    window.location.href = '/login';
                }
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.socket.close();
            };

            this.socket.onmessage = this.handleMessage;
        });
    }

    /**
     * Handle incoming WebSocket messages
     * @param {MessageEvent} event - WebSocket message event
     */
    handleMessage(event) {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        if (this.onMessage) {
            this.onMessage(message);
        }

        this.messageHandlers.forEach(handler => handler(message));
    }

    /**
     * Send a message to the WebSocket server
     * @param {Object} data - Message data to send
     * @returns {boolean} True if message was sent successfully
     */
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    /**
     * Subscribe to updates for a specific league
     * @param {string} league - League identifier
     * @returns {boolean} True if subscription request was sent
     */
    subscribe(league) {
        if (this.subscribedLeagues.includes(league)) {
            return false;
        }

        const success = this.send({ type: 'subscribe', league });
        if (success) {
            this.subscribedLeagues.push(league);
        }
        return success;
    }

    /**
     * Unsubscribe from updates for a specific league
     * @param {string} league - League identifier
     * @returns {boolean} True if unsubscription request was sent
     */
    unsubscribe(league) {
        const index = this.subscribedLeagues.indexOf(league);
        if (index === -1) {
            return false;
        }

        const success = this.send({ type: 'unsubscribe', league });
        if (success) {
            this.subscribedLeagues.splice(index, 1);
        }
        return success;
    }

    /**
     * Resubscribe to all previously subscribed leagues
     */
    resubscribe() {
        const leagues = [...this.subscribedLeagues];
        if (leagues.length === 0) {
            console.log('No leagues to resubscribe to');
            return;
        }
        
        console.log(`Resubscribing to leagues: ${leagues.join(', ')}`);
        leagues.forEach(league => {
            this.send({
                type: 'subscribe',
                league: league
            });
        });
    }

    /**
     * Unsubscribe from all leagues
     */
    unsubscribeAll() {
        console.log('Unsubscribing from all leagues');
        const leagues = [...this.subscribedLeagues];
        leagues.forEach(league => this.unsubscribe(league));
    }

    /**
     * Schedule a reconnect attempt
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        console.log(`Reconnecting in ${delay / 1000} seconds...`);

        this.reconnectTimeout = setTimeout(() => {
            this.connect().catch(error => {
                console.error('Reconnect failed:', error);
                this.scheduleReconnect();
            });
        }, delay);
    }

    /**
     * Start the ping interval to keep the connection alive
     */
    startPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        this.pingInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.send({ type: 'ping' });
                this.lastPingTime = Date.now();
            }
        }, 30000); // Ping every 30 seconds
    }

    /**
     * Update the connection status
     * @param {string} status - New status
     */
    updateStatus(status) {
        this.status = status;
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        this.status = 'disconnected';
        this.updateStatus('disconnected');
    }
}

export default WebSocketClient;