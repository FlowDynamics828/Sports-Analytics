const WebSocket = require('ws');
const winston = require('winston');
const crypto = require('crypto');
const EventEmitter = require('events');

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'websocket-manager' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

/**
 * WebSocketManager
 * Enhanced WebSocket management with proper client tracking,
 * channel subscriptions, error handling, and performance optimization.
 */
class WebSocketManager extends EventEmitter {
    /**
     * Create a WebSocketManager instance
     * @param {WebSocket.Server} wsServer - WebSocket server instance
     */
    constructor(server) {
        super();
        this.wss = new WebSocket.Server({ server });
        this.wss.on('connection', this.handleConnection.bind(this));
        this.clients = new Map();
        this.subscriptions = new Map();
        this.pingInterval = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the WebSocketManager
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('WebSocketManager already initialized');
            return Promise.resolve();
        }

        if (!this.wss) {
            throw new Error('WebSocket server not provided');
        }

        try {
            // Set up connection handler
            this.wss.on('connection', this.handleConnection.bind(this));
            
            // Set up error handler
            this.wss.on('error', this.handleServerError.bind(this));
            
            // Set up close handler
            this.wss.on('close', this.handleServerClose.bind(this));
            
            // Set up heartbeat to detect and clean up dead connections
            this.pingInterval = setInterval(this.heartbeat.bind(this), 30000);
            
            this.isInitialized = true;
            logger.info('WebSocketManager initialized successfully');
            
            return Promise.resolve();
        } catch (error) {
            logger.error('Failed to initialize WebSocketManager:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Handle new WebSocket connections
     * @param {WebSocket} ws - WebSocket connection
     * @param {http.IncomingMessage} req - HTTP request
     * @private
     */
    handleConnection(ws, req) {
        try {
            // Generate unique client ID
            const clientId = this.generateClientId();
            
            // Set client properties
            ws.id = clientId;
            ws.isAlive = true;
            ws.subscriptions = new Set();
            ws.ip = req.socket.remoteAddress;
            ws.connectTime = Date.now();
            
            // Store client
            this.clients.set(clientId, ws);
            
            // Set up client event handlers
            this.setupClientHandlers(ws);
            
            logger.info(`Client connected: ${clientId}`, {
                ip: ws.ip,
                timestamp: new Date().toISOString()
            });
            
            // Send welcome message
            this.sendToClient(ws, {
                type: 'welcome',
                clientId: clientId,
                timestamp: Date.now(),
                message: 'Connected to Sports Analytics WebSocket Server'
            });
        } catch (error) {
            logger.error('Error handling new connection:', {
                error: error.message,
                stack: error.stack
            });
            
            // Terminate connection if we can't set it up properly
            if (ws.readyState === WebSocket.OPEN) {
                ws.terminate();
            }
        }
    }

    /**
     * Set up event handlers for a client
     * @param {WebSocket} ws - WebSocket connection
     * @private
     */
    setupClientHandlers(ws) {
        // Handle messages
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                this.handleMessage(ws, data);
            } catch (error) {
                logger.warn(`Invalid message from client ${ws.id}:`, {
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                
                this.sendToClient(ws, {
                    type: 'error',
                    message: 'Invalid message format',
                    timestamp: Date.now()
                });
            }
        });
        
        // Handle connection close
        ws.on('close', (code, reason) => {
            this.handleClientDisconnect(ws, code, reason);
        });
        
        // Handle errors
        ws.on('error', (error) => {
            logger.error(`Client ${ws.id} error:`, {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        });
        
        // Handle pong (heartbeat response)
        ws.on('pong', () => {
            ws.isAlive = true;
        });
    }

    /**
     * Handle client message
     * @param {WebSocket} ws - WebSocket connection
     * @param {Object} data - Message data
     * @private
     */
    handleMessage(ws, data) {
        if (!data || !data.type) {
            logger.warn(`Message without type from client ${ws.id}`);
            return;
        }
        
        switch (data.type) {
            case 'subscribe':
                this.handleSubscribe(ws, data.channel);
                break;
                
            case 'unsubscribe':
                this.handleUnsubscribe(ws, data.channel);
                break;
                
            case 'ping':
                this.handlePing(ws);
                break;
                
            case 'message':
                // Handle client-to-server messages
                logger.debug(`Message from client ${ws.id}:`, {
                    data: data.data,
                    timestamp: new Date().toISOString()
                });
                break;
                
            default:
                logger.warn(`Unknown message type from client ${ws.id}: ${data.type}`);
        }
    }

    /**
     * Handle client subscribe request
     * @param {WebSocket} ws - WebSocket connection
     * @param {string} channel - Channel to subscribe to
     * @private
     */
    handleSubscribe(ws, channel) {
        if (!channel) {
            logger.warn(`Client ${ws.id} tried to subscribe without specifying a channel`);
            return;
        }
        
        // Add to client's subscriptions
        ws.subscriptions.add(channel);
        
        // Add to channel subscribers
        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
        }
        
        this.subscriptions.get(channel).add(ws.id);
        
        logger.debug(`Client ${ws.id} subscribed to channel: ${channel}`, {
            timestamp: new Date().toISOString()
        });
        
        // Confirm subscription to client
        this.sendToClient(ws, {
            type: 'subscribed',
            channel: channel,
            timestamp: Date.now()
        });
    }

    /**
     * Handle client unsubscribe request
     * @param {WebSocket} ws - WebSocket connection
     * @param {string} channel - Channel to unsubscribe from
     * @private
     */
    handleUnsubscribe(ws, channel) {
        if (!channel) {
            logger.warn(`Client ${ws.id} tried to unsubscribe without specifying a channel`);
            return;
        }
        
        // Remove from client's subscriptions
        ws.subscriptions.delete(channel);
        
        // Remove from channel subscribers
        const subscribers = this.subscriptions.get(channel);
        if (subscribers) {
            subscribers.delete(ws.id);
            
            // Clean up empty channels
            if (subscribers.size === 0) {
                this.subscriptions.delete(channel);
            }
            
            logger.debug(`Client ${ws.id} unsubscribed from channel: ${channel}`, {
                timestamp: new Date().toISOString()
            });
        }
        
        // Confirm unsubscription to client
        this.sendToClient(ws, {
            type: 'unsubscribed',
            channel: channel,
            timestamp: Date.now()
        });
    }

    /**
     * Handle client ping request
     * @param {WebSocket} ws - WebSocket connection
     * @private
     */
    handlePing(ws) {
        this.sendToClient(ws, {
            type: 'pong',
            timestamp: Date.now()
        });
    }

    /**
     * Handle client disconnect
     * @param {WebSocket} ws - WebSocket connection
     * @param {number} code - Close code
     * @param {string} reason - Close reason
     * @private
     */
    handleClientDisconnect(ws, code, reason) {
        if (!ws || !ws.id) return;
        
        logger.info(`Client disconnected: ${ws.id}`, {
            code: code || 'unknown',
            reason: reason || 'No reason provided',
            timestamp: new Date().toISOString()
        });
        
        // Remove from all subscriptions
        if (ws.subscriptions) {
            ws.subscriptions.forEach(channel => {
                const subscribers = this.subscriptions.get(channel);
                if (subscribers) {
                    subscribers.delete(ws.id);
                    
                    // Clean up empty channels
                    if (subscribers.size === 0) {
                        this.subscriptions.delete(channel);
                    }
                }
            });
        }
        
        // Remove client
        this.clients.delete(ws.id);
    }

    /**
     * Handle server errors
     * @param {Error} error - Error object
     * @private
     */
    handleServerError(error) {
        logger.error('WebSocket server error:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle server close
     * @private
     */
    handleServerClose() {
        logger.info('WebSocket server closed', {
            timestamp: new Date().toISOString()
        });
        
        // Clean up
        clearInterval(this.pingInterval);
        this.clients.clear();
        this.subscriptions.clear();
        this.isInitialized = false;
    }

    /**
     * Perform heartbeat check on all clients
     * @private
     */
    heartbeat() {
        this.clients.forEach((ws, id) => {
            if (ws.isAlive === false) {
                logger.debug(`Terminating inactive client: ${id}`, {
                    timestamp: new Date().toISOString()
                });
                this.handleClientDisconnect(ws, 1008, 'Connection timeout');
                return ws.terminate();
            }
            
            ws.isAlive = false;
            try {
                ws.ping();
            } catch (error) {
                logger.debug(`Error pinging client ${id}:`, {
                    error: error.message
                });
                this.handleClientDisconnect(ws, 1011, 'Ping failed');
                ws.terminate();
            }
        });
    }

    /**
     * Send a message to a specific client
     * @param {WebSocket} ws - WebSocket connection
     * @param {Object} data - Message data
     * @returns {boolean} - Whether the message was sent
     * @private
     */
    sendToClient(ws, data) {
        try {
            if (ws.readyState !== WebSocket.OPEN) {
                return false;
            }
            
            const message = JSON.stringify(data);
            ws.send(message);
            return true;
        } catch (error) {
            logger.error(`Error sending to client ${ws.id}:`, {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    /**
     * Broadcast a message to all subscribers of a channel
     * @param {string} channel - Channel to broadcast to
     * @param {any} data - Data to broadcast
     * @returns {number} - Number of clients message was sent to
     */
    broadcast(channel, data) {
        try {
            if (!channel || !this.wss || !this.wss.clients) {
                return 0;
            }
            
            const subscribers = this.subscriptions.get(channel);
            if (!subscribers || subscribers.size === 0) {
                return 0;
            }
            
            const message = JSON.stringify({
                type: 'broadcast',
                channel: channel,
                data: data,
                timestamp: Date.now()
            });
            
            let sentCount = 0;
            
            // Send to all subscribers of the channel
            subscribers.forEach(clientId => {
                const client = this.clients.get(clientId);
                if (client && client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(message);
                        sentCount++;
                    } catch (error) {
                        logger.error(`Error broadcasting to client ${clientId}:`, {
                            error: error.message,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            });
            
            logger.debug(`Broadcast to channel ${channel}: sent to ${sentCount} clients`, {
                timestamp: new Date().toISOString()
            });
            
            return sentCount;
        } catch (error) {
            logger.error(`Broadcast error for channel ${channel}:`, {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            return 0;
        }
    }

    /**
     * Generate a unique client ID
     * @returns {string} - Unique client ID
     * @private
     */
    generateClientId() {
        return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Get the number of connected clients
     * @returns {number} - Number of clients
     */
    getClientCount() {
        return this.clients.size;
    }

    /**
     * Get the number of active subscriptions
     * @returns {number} - Number of subscriptions
     */
    getSubscriptionCount() {
        return Array.from(this.subscriptions.values())
            .reduce((count, subscribers) => count + subscribers.size, 0);
    }

    /**
     * Get the status of the WebSocket server
     * @returns {Object} - Server status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            clients: this.getClientCount(),
            channels: this.subscriptions.size,
            subscriptions: this.getSubscriptionCount(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Clean up resources
     */
    cleanup() {
        clearInterval(this.pingInterval);
        
        // Close all client connections
        this.clients.forEach((ws, id) => {
            try {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close(1001, 'Server shutting down');
                }
            } catch (error) {
                logger.debug(`Error closing client ${id}:`, {
                    error: error.message
                });
            }
        });
        
        this.clients.clear();
        this.subscriptions.clear();
        this.isInitialized = false;
        
        logger.info('WebSocketManager cleaned up', {
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = WebSocketManager;