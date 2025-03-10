// WebSocket Client for Real-time Sports Analytics Updates
// Version 3.1.0

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
        try {
            // Clear any existing connection
            if (this.socket) {
                console.log('Closing existing socket connection');
                this.socket.close();
                this.socket = null;
            }

            // Clear existing intervals/timeouts
            this.clearTimers();

            // Get token from localStorage
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication token not found');
            }

            // Determine protocol
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;

            return new Promise((resolve, reject) => {
                // Create timeout for initial connection
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
                        window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
                    }
                };

                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.status = 'error';
                    this.updateStatus('error');
                    
                    // If we're still trying to connect for the first time, reject the promise
                    if (this.connectionTimeout) {
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                        reject(error);
                    }
                };

                this.socket.onmessage = this.handleMessage;
            });
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.status = 'error';
            this.updateStatus('error');
            throw error;
        }
    }

    /**
     * Start ping interval to keep connection alive
     */
    startPingInterval() {
        // Clear any existing ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        // Ping every 30 seconds to keep connection alive
        this.pingInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.send({ type: 'ping', timestamp: Date.now() });
                this.lastPingTime = Date.now();
                console.debug('Ping sent to server');
            }
        }, 30000); // 30 seconds
    }

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    scheduleReconnect() {
        // Clear any existing reconnect timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        // Check if we've hit the max reconnect attempts
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Maximum reconnection attempts reached. Giving up.');
            return;
        }

        this.reconnectAttempts++;
        
        // Exponential backoff with jitter
        const delay = Math.min(
            this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
            60000 // Max 1 minute delay
        ) * (0.9 + Math.random() * 0.2); // Add 10% jitter

        console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${Math.round(delay)}ms`);
        
        this.reconnectTimeout = setTimeout(() => {
            console.log(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            this.connect().catch(error => {
                console.error('Reconnection failed:', error);
            });
        }, delay);
    }

    /**
     * Clear all timers (intervals and timeouts)
     */
    clearTimers() {
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
    }

    /**
     * Handle incoming WebSocket messages
     * @param {MessageEvent} event - WebSocket message event
     */
    handleMessage(event) {
        try {
            // Parse message
            const message = JSON.parse(event.data);
            
            // Handle automatic pongs
            if (message.type === 'pong') {
                // Update latency metrics
                const latency = Date.now() - this.lastPingTime;
                console.debug(`WebSocket ping: ${latency}ms`);
                return;
            }
            
            console.log('WebSocket message received:', message);
            
            // Call the onMessage callback if it exists
            if (typeof this.onMessage === 'function') {
                this.onMessage(message);
            }
            
            // Call all registered message handlers
            this.messageHandlers.forEach(handler => {
                try {
                    handler(message);
                } catch (handlerError) {
                    console.error('Error in message handler:', handlerError);
                }
            });
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    /**
     * Send a message to the WebSocket server
     * @param {Object} data - Message data to send
     * @returns {boolean} True if message was sent successfully
     */
    send(data) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('Cannot send message: WebSocket not connected');
            return false;
        }
        
        try {
            this.socket.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }

    /**
     * Subscribe to updates for a specific league
     * @param {string} league - League identifier
     * @returns {boolean} True if subscription request was sent
     */
    subscribe(league) {
        if (!league) return false;
        
        const leagueStr = String(league).toLowerCase();
        
        // Check if already subscribed
        if (this.subscribedLeagues.includes(leagueStr)) {
            console.log(`Already subscribed to ${leagueStr}`);
            return true;
        }
        
        // Add to subscribed leagues
        this.subscribedLeagues.push(leagueStr);
        
        // Send subscription message
        console.log(`Subscribing to ${leagueStr} updates`);
        return this.send({
            type: 'subscribe',
            league: leagueStr
        });
    }

    /**
     * Unsubscribe from updates for a specific league
     * @param {string} league - League identifier
     * @returns {boolean} True if unsubscription request was sent
     */
    unsubscribe(league) {
        if (!league) return false;
        
        const leagueStr = String(league).toLowerCase();
        
        // Remove from subscribed leagues
        this.subscribedLeagues = this.subscribedLeagues.filter(l => l !== leagueStr);
        
        // Send unsubscription message
        console.log(`Unsubscribing from ${leagueStr} updates`);
        return this.send({
            type: 'unsubscribe',
            league: leagueStr
        });
    }

    /**
     * Resubscribe to all previously subscribed leagues
     */
    resubscribe() {
        // Resubscribe to all previously subscribed leagues
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
        // Unsubscribe from all leagues
        console.log('Unsubscribing from all leagues');
        const leagues = [...this.subscribedLeagues];
        leagues.forEach(league => this.unsubscribe(league));
    }

    /**
     * Add a message handler function
     * @param {Function} handler - Message handler function
     */
    addMessageHandler(handler) {
        if (typeof handler === 'function') {
            this.messageHandlers.push(handler);
        }
    }

    /**
     * Remove a message handler function
     * @param {Function} handler - Message handler function to remove
     */
    removeMessageHandler(handler) {
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    }

    /**
     * Update connection status and notify listeners
     * @param {string} status - New connection status
     */
    updateStatus(status) {
        if (this.onStatusChange && typeof this.onStatusChange === 'function') {
            this.onStatusChange(status);
        }
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        console.log('Disconnecting from WebSocket server');
        
        // Clear all timers first
        this.clearTimers();
        
        // Unsubscribe from all leagues
        this.unsubscribeAll();
        
        // Close the socket with normal closure code
        if (this.socket) {
            this.socket.close(1000, 'User disconnected');
            this.socket = null;
        }
        
        this.status = 'disconnected';
        this.updateStatus('disconnected');
    }

    /**
     * Check if WebSocket is currently connected
     * @returns {boolean} True if connected
     */
    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    /**
     * Get current connection status
     * @returns {string} Current status
     */
    getStatus() {
        return this.status;
    }
}

export default WebSocketClient;