// utils/websocket-server.js

// Load environment variables
require('dotenv').config();

// Import required modules
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const zlib = require('zlib'); // Use built-in Node.js zlib
const { promisify } = require('util');
const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');
const winston = require('winston');
const rateLimiter = require('./rateLimiter'); // Use rateLimiter.js instead of RateLimiterCluster.js
const MetricsManager = require('./metricsManager'); // Assume this exists for metrics tracking
const http = require('http');
const os = require('os');
const WebSocketManager = require('./websocketManager');

// Configure winston logger to match api.js
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/websocket-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/websocket.log' })
  ]
});

/**
 * Enterprise-Grade WebSocket Server
 * Features: High-frequency real-time data, auto-recovery, load balancing, security, metrics
 * Version: 3.0.0
 */
class WebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.validateAndSetOptions(options);
    this.initializeState();
    this.bindMethods();

    // Initialize monitoring intervals array
    this.monitoringIntervals = [];

    // Track consecutive high memory usage events
    this.highMemoryCount = 0;
    this.lastMemoryOptimization = Date.now();

    // Enhanced memory usage check with tiered response based on severity
    this.checkMemoryUsage = () => {
      const memoryUsage = process.memoryUsage();
      const heapUsed = memoryUsage.heapUsed;
      const heapTotal = memoryUsage.heapTotal;
      const memoryRatio = heapUsed / heapTotal;
      const threshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80;

      // Format memory values for logging (in MB)
      const heapUsedMB = Math.round(heapUsed / (1024 * 1024));
      const heapTotalMB = Math.round(heapTotal / (1024 * 1024));
      const usagePercentage = Math.round(memoryRatio * 100);

      // Log memory usage periodically regardless of threshold
      if (this.options.monitoring && this.options.monitoring.enabled) {
        logger.info(`WebSocketServer memory usage: ${usagePercentage}% (${heapUsedMB}MB / ${heapTotalMB}MB)`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // Check if memory usage exceeds threshold
      if (memoryRatio > threshold) {
        this.highMemoryCount++;

        // Log warning with severity based on consecutive high usage events
        const severity = this.highMemoryCount > 3 ? 'CRITICAL' : this.highMemoryCount > 1 ? 'WARNING' : 'NOTICE';
        logger.warn(`[${severity}] High memory usage detected in WebSocketServer: ${usagePercentage}% of heap used (${heapUsedMB}MB / ${heapTotalMB}MB)`, {
          metadata: {
            service: 'websocket-server',
            timestamp: new Date().toISOString(),
            consecutiveEvents: this.highMemoryCount
          }
        });

        // Implement tiered response based on severity
        if (this.highMemoryCount > 3) {
          // Critical level - aggressive cleanup
          this._performAggressiveMemoryCleanup(memoryRatio);
        } else if (this.highMemoryCount > 1) {
          // Warning level - standard cleanup
          this._performStandardMemoryCleanup();
        } else {
          // Notice level - basic cleanup
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            logger.info('Garbage collection triggered in WebSocketServer', {
              metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
            });
          }
        }
      } else {
        // Reset consecutive count if memory usage is below threshold
        if (this.highMemoryCount > 0) {
          logger.info(`Memory usage returned to normal: ${usagePercentage}%`, {
            metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
          });
          this.highMemoryCount = 0;
        }
      }
    };

    // Store interval reference for proper cleanup
    this.checkMemoryUsageInterval = setInterval(this.checkMemoryUsage, 300000); // Check every 5 minutes
    this.monitoringIntervals.push(this.checkMemoryUsageInterval);

    // Add a more frequent cleanup interval for event listeners
    this.eventListenerCleanupInterval = setInterval(() => {
      this._cleanupEventListeners();
    }, 600000); // Every 10 minutes
    this.monitoringIntervals.push(this.eventListenerCleanupInterval);

    // Set max listeners to prevent memory leaks
    this.setMaxListeners(20); // Increased to accommodate additional listeners

    // Track event listeners for cleanup
    this.activeListeners = new Map();
  }

  /**
   * Clean up event listeners to prevent memory leaks
   * @private
   */
  _cleanupEventListeners() {
    try {
      // Get current listener count
      const listenerCount = this.eventNames().reduce((total, event) => {
        return total + this.listenerCount(event);
      }, 0);

      logger.info(`WebSocketServer event listener check: ${listenerCount} total listeners across ${this.eventNames().length} events`, {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });

      // If we have too many listeners, log details and clean up
      if (listenerCount > 15) {
        logger.warn(`High number of event listeners detected: ${listenerCount}`, {
          events: this.eventNames(),
          counts: this.eventNames().map(event => ({
            event,
            count: this.listenerCount(event)
          })),
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });

        // Remove duplicate or unnecessary listeners
        this._removeExcessListeners();
      }
    } catch (error) {
      logger.error('Error during event listener cleanup:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    }
  }

  /**
   * Remove excess event listeners to prevent memory leaks
   * @private
   */
  _removeExcessListeners() {
    // For each event with more than 5 listeners, keep only the most recent ones
    this.eventNames().forEach(event => {
      const count = this.listenerCount(event);
      if (count > 5) {
        logger.info(`Cleaning up excess listeners for event: ${event} (${count} listeners)`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });

        // For metrics events, we can safely remove all and add back one
        if (event === 'metrics') {
          this.removeAllListeners(event);
          this.once('metrics', data => {
            logger.debug('Metrics event received after listener cleanup', {
              metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
            });
          });
          logger.info(`Removed all metrics listeners and added one listener back`, {
            metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
          });
        }
      }
    });
  }

  /**
   * Perform standard memory cleanup
   * @private
   */
  _performStandardMemoryCleanup() {
    try {
      logger.info('Performing standard memory cleanup in WebSocketServer', {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });

      // Clear any cached data
      if (this.metrics && this.metrics.performance) {
        // Trim performance metrics arrays
        if (Array.isArray(this.metrics.performance.latency)) {
          this.metrics.performance.latency = this.metrics.performance.latency.slice(-20);
        }
      }

      // Force garbage collection
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered during standard cleanup', {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // Log memory usage after cleanup
      const memUsage = process.memoryUsage();
      logger.info('Memory usage after standard cleanup:', {
        heapUsed: Math.round(memUsage.heapUsed / (1024 * 1024)) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024)) + ' MB',
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100) + '%',
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Error during standard memory cleanup:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    }
  }

  /**
   * Perform aggressive memory cleanup for critical situations
   * @param {number} currentUsage - Current memory usage ratio
   * @private
   */
  _performAggressiveMemoryCleanup(currentUsage) {
    try {
      // Only perform aggressive cleanup if it's been at least 5 minutes since the last one
      const now = Date.now();
      if (now - this.lastMemoryOptimization < 300000) {
        logger.info('Skipping aggressive cleanup - performed recently', {
          timeSinceLast: Math.round((now - this.lastMemoryOptimization) / 1000) + ' seconds',
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
        return;
      }

      this.lastMemoryOptimization = now;

      logger.warn('Performing AGGRESSIVE memory cleanup in WebSocketServer', {
        currentUsage: Math.round(currentUsage * 100) + '%',
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });

      // Reset metrics completely
      this.metrics = {
        connections: { total: 0, active: this.clients ? this.clients.size : 0, rejected: 0 },
        messages: { sent: 0, received: 0, errors: 0 },
        performance: { latency: [], messageRate: 0 }
      };

      // Remove all event listeners and re-add essential ones
      this.removeAllListeners();
      this._setupEventHandlers();

      // Clear all maps except active clients
      if (this.subscriptions) {
        // Keep track of subscription count before clearing
        const subscriptionCount = Array.from(this.subscriptions.values())
          .reduce((total, subs) => total + subs.size, 0);

        logger.info(`Clearing ${this.subscriptions.size} subscription channels with ${subscriptionCount} total subscriptions`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });

        // Instead of clearing completely, rebuild with only active subscriptions
        const activeSubscriptions = new Map();
        this.subscriptions.forEach((subscribers, channel) => {
          // Filter out any subscribers that don't exist in clients
          const activeSubscribers = new Set();
          subscribers.forEach(clientId => {
            if (this.clients && this.clients.has(clientId)) {
              activeSubscribers.add(clientId);
            }
          });

          // Only keep channels with active subscribers
          if (activeSubscribers.size > 0) {
            activeSubscriptions.set(channel, activeSubscribers);
          }
        });

        // Replace with cleaned map
        this.subscriptions = activeSubscriptions;

        logger.info(`Rebuilt subscription map with ${this.subscriptions.size} active channels`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // Force garbage collection
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered during aggressive cleanup', {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // Log memory usage after cleanup
      const memUsage = process.memoryUsage();
      logger.info('Memory usage after aggressive cleanup:', {
        heapUsed: Math.round(memUsage.heapUsed / (1024 * 1024)) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024)) + ' MB',
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100) + '%',
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      logger.error('Error during aggressive memory cleanup:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    }
  }

  /**
   * Set up essential event handlers after cleanup
   * @private
   */
  _setupEventHandlers() {
    // Add minimal required event handlers
    this.on('error', (error) => {
      logger.error('WebSocket server error:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    });

    // Add subscription handler
    this.on('subscribe', ({ clientId, channel }) => {
      logger.debug(`Client ${clientId} subscribed to channel ${channel}`, {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    });

    // Add unsubscribe handler
    this.on('unsubscribe', ({ clientId, channel }) => {
      logger.debug(`Client ${clientId} unsubscribed from channel ${channel}`, {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    });

    // Add message handler
    this.on('message', ({ clientId, data }) => {
      logger.debug(`Message received from client ${clientId}`, {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    });
  }

  validateAndSetOptions(options) {
    const defaultOptions = {
      path: process.env.WS_PATH || '/ws',
      jwtSecret: process.env.JWT_SECRET,
      heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 60000, // 1 minute from .env
      clientTimeout: parseInt(process.env.WS_CLIENT_TIMEOUT, 10) || 35000,
      maxPayload: parseInt(process.env.WS_MAX_PAYLOAD, 10) || (50 * 1024 * 1024), // 50MB
      maxClients: 1000, // Reduced from 10000 to lower resource usage
      compression: {
        enabled: true,
        level: parseInt(process.env.COMPRESSION_LEVEL, 10) || 6,
        threshold: parseInt(process.env.COMPRESSION_THRESHOLD, 10) || 1024
      },
      security: {
        rateLimiting: {
          enabled: true,
          maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_MAX, 10) * 4 || 200 // Adjusted to match .env
        },
        maxConnectionsPerIP: parseInt(process.env.MAX_CONNECTIONS_PER_IP, 10) || 50
      },
      monitoring: {
        enabled: true,
        metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 300000 // 5 minutes from .env
      }
    };

    this.options = {
      ...defaultOptions,
      ...options,
      security: { ...defaultOptions.security, ...options.security },
      compression: { ...defaultOptions.compression, ...options.compression },
      monitoring: { ...defaultOptions.monitoring, ...options.monitoring }
    };
  }

  initializeState() {
    this.server = null;
    this.isInitialized = false;
    this.shuttingDown = false;
    
    this.clients = new Map();
    this.subscriptions = new Map();
    this.ipConnections = new Map();
    
    this.metrics = {
      connections: { total: 0, active: 0, rejected: 0 },
      messages: { sent: 0, received: 0, errors: 0 },
      performance: { latency: [], messageRate: 0 }
    };

    // Store system information for diagnostics
    this.systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime()
    };

    logger.info('WebSocketServer state initialized', {
      metadata: { 
        service: 'websocket-server', 
        timestamp: new Date().toISOString(),
        cpus: this.systemInfo.cpus,
        memoryGB: Math.round(this.systemInfo.totalMemory / (1024 * 1024 * 1024) * 10) / 10
      }
    });
  }

  bindMethods() {
    this.handleConnection = this.handleConnection.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.verifyClient = this.verifyClient.bind(this);
    this.handleGracefulShutdown = this.handleGracefulShutdown.bind(this);
    this.broadcast = this.broadcast.bind(this);
    this.handleSubscribe = this.handleSubscribe.bind(this);
    this.handleUnsubscribe = this.handleUnsubscribe.bind(this);
    this.handleClientMessage = this.handleClientMessage.bind(this);
    this.sendWelcome = this.sendWelcome.bind(this);
  }

  async initialize(server) {
    if (this.isInitialized) {
      logger.info('WebSocketServer already initialized, skipping initialization', {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
      return true;
    }

    if (!server || typeof server !== 'object' || !server.on || !server.close) {
      throw new Error('Server instance required for WebSocketServer initialization');
    }

    try {
      // Create WebSocket server with the existing HTTP server
      this.server = new WebSocket.Server({
        server: server, // Ensure server is passed correctly without binding
        path: this.options.path,
        clientTracking: true,
        maxPayload: this.options.maxPayload,
        verifyClient: this.verifyClient,
        perMessageDeflate: this.options.compression.enabled ? {
          zlibDeflateOptions: { level: this.options.compression.level },
          threshold: this.options.compression.threshold,
          concurrencyLimit: 5 // Reduced to lower resource usage
        } : false
      });
      
      // Register event handlers
      this.server.on('connection', this.handleConnection);
      this.server.on('error', this.handleError);
      this.server.on('close', () => {
        logger.info('WebSocket server closed', {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      });
      
      // Setup monitoring and shutdown handlers
      this.setupMonitoring();
      this.setupShutdownHandlers();
      
      this.isInitialized = true;
      
      // Log with server information
      logger.info('WebSocket server initialized successfully', { 
        metadata: { 
          service: 'websocket-server', 
          timestamp: new Date().toISOString(),
          path: this.options.path,
          maxPayload: `${Math.round(this.options.maxPayload / (1024 * 1024))}MB`
        } 
      });
      
      return true;
    } catch (error) {
      logger.error('WebSocket server initialization failed:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
      throw error;
    }
  }

  async verifyClient(info, callback) {
    try {
      const clientIP = info.req.socket.remoteAddress;
      
      // Check IP connection limit
      if (this.getIPConnections(clientIP) >= this.options.security.maxConnectionsPerIP) {
        logger.warn('Too many connections from IP:', { ip: clientIP, timestamp: new Date().toISOString() });
        return callback(false, 429, 'Too Many Connections');
      }

      // Check rate limit for WebSocket connections
      if (this.options.security.rateLimiting.enabled) {
        const rateLimitKey = `ws:${clientIP}`;
        if (!(await rateLimiter.checkLimit(rateLimitKey, this.options.security.rateLimiting.maxRequestsPerMinute / 4))) { // Adjusted for WebSocket frequency
          logger.warn('WebSocket rate limit exceeded for:', { ip: clientIP, timestamp: new Date().toISOString() });
          return callback(false, 429, 'Rate Limit Exceeded');
        }
      }

      // Verify authentication - only if JWT secret is configured
      if (this.options.jwtSecret) {
        const token = this.extractToken(info.req);
        if (!token) {
          logger.warn('Authentication required for WebSocket connection:', { ip: clientIP, timestamp: new Date().toISOString() });
          return callback(false, 401, 'Authentication Required');
        }

        try {
          const user = await this.verifyToken(token);
          info.req.user = user;
        } catch (authError) {
          logger.error('JWT verification failed:', {
            error: authError.message,
            ip: clientIP,
            timestamp: new Date().toISOString()
          });
          return callback(false, 401, 'Invalid Authentication');
        }
      }

      // Check server capacity
      if (this.clients.size >= this.options.maxClients) {
        logger.warn('Server at capacity for WebSocket connection:', { timestamp: new Date().toISOString() });
        return callback(false, 503, 'Server At Capacity');
      }

      // All checks passed
      callback(true);
    } catch (error) {
      logger.error('WebSocket client verification failed:', { 
        error: error.message, 
        stack: error.stack, 
        ip: info.req.socket.remoteAddress, 
        timestamp: new Date().toISOString() 
      });
      callback(false, 500, 'Internal Server Error');
    }
  }

  async handleConnection(ws, req) {
    try {
      const clientId = this.generateClientId();
      const clientIP = req.socket.remoteAddress;

      ws.id = clientId;
      ws.user = req.user || { anonymous: true };
      ws.isAlive = true;
      ws.subscriptions = new Set();
      ws.ip = clientIP;
      ws.connectTime = Date.now();

      this.initializeClient(ws, clientIP);
      this.setupClientHandlers(ws);
      
      // Send welcome message
      await this.sendWelcome(ws);

      // Update metrics
      this.metrics.connections.active++;
      this.metrics.connections.total++;
      
      logger.info('WebSocket client connected:', { 
        clientId, 
        ip: clientIP,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString() 
      });
      
      // Emit connection event for external listeners
      this.emit('client-connected', {
        clientId,
        ip: clientIP,
        user: ws.user
      });

    } catch (error) {
      this.handleClientError(ws, error);
    }
  }

  setupClientHandlers(ws) {
    // Handle incoming messages
    ws.on('message', (data) => this.handleMessage(ws, data));
    
    // Handle connection close
    ws.on('close', (code, reason) => {
      logger.debug(`Client ${ws.id} closed connection with code ${code}: ${reason || 'No reason provided'}`, {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
      this.handleClientDisconnect(ws, code, reason);
    });
    
    // Handle errors
    ws.on('error', (error) => this.handleClientError(ws, error));
    
    // Handle pong responses (for heartbeat)
    ws.on('pong', () => this.handlePong(ws));
    
    // Send initial ping to verify connection
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 1000);
  }

  async handleMessage(ws, data) {
    try {
      const startTime = performance.now();
      
      // Decode the message
      let message;
      try {
        message = await this.decodeMessage(data);
      } catch (parseError) {
        logger.warn(`Failed to parse message from client ${ws.id}:`, {
          error: parseError.message,
          timestamp: new Date().toISOString()
        });
        
        await this.sendToClient(ws, {
          type: 'error',
          message: 'Invalid message format',
          timestamp: Date.now()
        });
        
        return;
      }
      
      // Rate limit with memory check
      if (this.options.security.rateLimiting.enabled) {
        const rateLimitKey = `ws:message:${ws.id}`;
        if (!(await rateLimiter.checkLimit(rateLimitKey, this.options.security.rateLimiting.maxRequestsPerMinute / 60))) {
          throw new Error('Message rate limit exceeded');
        }
      }

      // Check memory before processing
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed / memoryUsage.heapTotal > parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80) { // Match .env threshold
        logger.warn(`High memory usage detected in WebSocketServer handleMessage: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}% of heap used`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // Process message based on type
      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(ws, message.data);
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(ws, message.data);
          break;
        case 'message':
          await this.handleClientMessage(ws, message.data);
          break;
        case 'ping':
          await this.sendToClient(ws, {
            type: 'pong',
            timestamp: Date.now()
          });
          break;
        case 'get_subscriptions':
          await this.sendSubscriptionsList(ws);
          break;
        default:
          logger.warn(`Unknown message type from client ${ws.id}: ${message.type}`, {
            timestamp: new Date().toISOString()
          });
          
          await this.sendToClient(ws, {
            type: 'error',
            message: `Unknown message type: ${message.type}`,
            timestamp: Date.now()
          });
      }

      // Update metrics
      this.metrics.messages.received++;
      this.metrics.performance.latency.push(performance.now() - startTime);
      if (this.metrics.performance.latency.length > 100) {
        this.metrics.performance.latency.shift(); // Limit latency history
      }

    } catch (error) {
      this.handleMessageError(ws, error);
    }
  }

  async sendSubscriptionsList(ws) {
    try {
      const subscriptionsList = Array.from(ws.subscriptions || []);
      
      await this.sendToClient(ws, {
        type: 'subscriptions_list',
        data: subscriptionsList,
        count: subscriptionsList.length,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      logger.error(`Error sending subscriptions list to client ${ws.id}:`, {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  async broadcast(channel, data) {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers?.size) return 0;

    const message = await this.encodeMessage({
      type: 'broadcast',
      channel,
      data,
      timestamp: Date.now()
    });

    let sent = 0;
    let failed = 0;
    const startTime = performance.now();
    
    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client?.readyState === WebSocket.OPEN) {
        try {
          await this.sendToClient(client, message);
          sent++;
        } catch (error) {
          failed++;
          logger.error(`Error broadcasting to client ${clientId}:`, {
            error: error.message,
            channel,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    const duration = performance.now() - startTime;
    
    // Log broadcast metrics
    logger.debug(`Broadcast to channel ${channel}: ${sent} delivered, ${failed} failed in ${Math.round(duration)}ms`, {
      metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
    });

    this.metrics.messages.sent += sent;
    return sent;
  }

  async sendToClient(ws, data) {
    try {
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error('Client connection not open');
      }

      // Prepare data if it's an object
      const messageData = typeof data === 'object' && !(data instanceof Buffer)
        ? await this.encodeMessage(data)
        : data;

      await new Promise((resolve, reject) => {
        ws.send(messageData, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      this.metrics.messages.sent++;
      return true;
    } catch (error) {
      this.handleSendError(ws, error);
      return false;
    }
  }

  // Utility Methods
  generateClientId() {
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  extractToken(req) {
    // Try to extract from Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try to extract from query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (token) {
      return token;
    }

    // Try to extract from cookies
    const cookies = req.headers.cookie;
    if (cookies) {
      const tokenMatch = cookies.split(';').find(c => c.trim().startsWith('token='));
      if (tokenMatch) {
        return tokenMatch.split('=')[1].trim();
      }
    }

    return null;
  }

  async verifyToken(token) {
    return await promisify(jwt.verify)(token, this.options.jwtSecret);
  }

  async encodeMessage(data) {
    const message = JSON.stringify(data);
    return this.options.compression.enabled && message.length > this.options.compression.threshold
      ? await promisify(zlib.deflate)(message)
      : Buffer.from(message);
  }

  async decodeMessage(data) {
    try {
      // Try to detect if the message is compressed
      const isCompressed = data[0] === 0x78 && (data[1] === 0x01 || data[1] === 0x9C || data[1] === 0xDA);
      
      const message = isCompressed
        ? await promisify(zlib.inflate)(data)
        : data;
        
      return JSON.parse(message.toString());
    } catch (parseError) {
      // If parsing fails, try again with inflation (in case compression detection failed)
      try {
        const inflated = await promisify(zlib.inflate)(data);
        return JSON.parse(inflated.toString());
      } catch (inflateError) {
        throw parseError; // Throw the original error if both methods fail
      }
    }
  }

  getIPConnections(ip) {
    return this.ipConnections.get(ip) || 0;
  }

  initializeClient(ws, ip) {
    this.clients.set(ws.id, ws);
    this.ipConnections.set(ip, this.getIPConnections(ip) + 1);
  }

  handleClientDisconnect(ws, code, reason) {
    const clientIP = ws.ip;
    const disconnectTime = Date.now();
    const connectionDuration = disconnectTime - (ws.connectTime || disconnectTime);
    
    // Clean up subscriptions
    if (ws.subscriptions) {
      ws.subscriptions.forEach(channel => {
        const subs = this.subscriptions.get(channel);
        if (subs) {
          subs.delete(ws.id);
          if (subs.size === 0) {
            this.subscriptions.delete(channel);
          }
        }
      });
    }

    // Update IP connections
    const ipCount = this.getIPConnections(clientIP);
    if (ipCount > 1) {
      this.ipConnections.set(clientIP, ipCount - 1);
    } else {
      this.ipConnections.delete(clientIP);
    }

    // Remove from clients map
    this.clients.delete(ws.id);
    
    // Update metrics
    this.metrics.connections.active--;
    
    // Log the disconnection with more details
    logger.info('WebSocket client disconnected:', { 
      clientId: ws.id, 
      ip: clientIP,
      code: code || 'unknown',
      reason: reason || 'No reason provided',
      connectionDuration: `${Math.round(connectionDuration / 1000)}s`,
      timestamp: new Date().toISOString() 
    });
    
    // Emit disconnect event for external listeners
    this.emit('client-disconnected', {
      clientId: ws.id,
      ip: clientIP,
      code,
      reason,
      connectionDuration
    });
  }

  handlePong(ws) {
    ws.isAlive = true;
    ws.lastPong = Date.now();
  }

  // Error Handlers
  handleError(error) {
    logger.error('WebSocket server error:', { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
    
    // Emit error event for external monitoring
    this.emit('server-error', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  handleClientError(ws, error) {
    logger.error(`Client ${ws.id} error:`, { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
    
    // Try to notify client about the error
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Internal server error',
          timestamp: Date.now()
        }));
      }
    } catch (sendError) {
      // Ignore send errors
    }
    
    // Terminate the connection to clean up resources
    try {
      ws.terminate();
    } catch (terminateError) {
      logger.warn(`Error terminating client ${ws.id} connection:`, {
        error: terminateError.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleMessageError(ws, error) {
    logger.error(`Message error from ${ws.id}:`, { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
    
    // Send error notification to client
    this.sendToClient(ws, {
      type: 'error',
      message: error.message,
      timestamp: Date.now()
    }).catch(() => {
      // Ignore send errors
    });
  }

  handleSendError(ws, error) {
    logger.error(`Send error to ${ws.id}:`, { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
    
    // Check if the connection is still open
    if (ws.readyState !== WebSocket.OPEN) {
      logger.debug(`Client ${ws.id} connection not open, terminating`, {
        timestamp: new Date().toISOString()
      });
      
      try {
        ws.terminate();
      } catch (terminateError) {
        // Ignore terminate errors
      }
    }
  }

  // Monitoring & Maintenance
  setupMonitoring() {
    if (!this.options.monitoring.enabled) return;

    // Store interval references for proper cleanup
    this.monitoringIntervals = this.monitoringIntervals || [];

    // Heartbeat checking
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((ws) => {
        // If client hasn't responded to previous ping, terminate
        if (!ws.isAlive) {
          logger.debug(`Client ${ws.id} heartbeat timeout, terminating connection`, {
            timestamp: new Date().toISOString()
          });
          ws.terminate();
          this.handleClientDisconnect(ws, 1008, 'Heartbeat timeout');
          return;
        }

        // Mark as not alive until pong response
        ws.isAlive = false;
        
        // Send ping
        try {
          ws.ping();
        } catch (pingError) {
          logger.debug(`Error sending ping to client ${ws.id}:`, {
            error: pingError.message,
            timestamp: new Date().toISOString()
          });
          ws.terminate();
        }
      });
    }, this.options.heartbeatInterval);
    this.monitoringIntervals.push(heartbeatInterval);

    // Metrics collection - limit listeners to prevent memory leak
    const maxListeners = this.getMaxListeners();
    if (maxListeners !== 0) { // If not unlimited
      this.setMaxListeners(Math.max(maxListeners, 15)); // Increase max listeners to accommodate metrics
    }

    const metricsInterval = setInterval(() => {
      this.collectMetrics();
      // Only emit if we have listeners to prevent memory leaks
      if (this.listenerCount('metrics') > 0) {
        this.emit('metrics', this.metrics);
      }
    }, this.options.monitoring.metricsInterval);
    this.monitoringIntervals.push(metricsInterval);

    // Clean up old metrics data
    const cleanupInterval = setInterval(() => {
      if (this.metrics.performance.latency.length > 100) {
        this.metrics.performance.latency = this.metrics.performance.latency.slice(-100);
      }
    }, 600000); // Clean every 10 minutes
    this.monitoringIntervals.push(cleanupInterval);
    
    // Log status periodically
    const statusInterval = setInterval(() => {
      logger.info('WebSocketServer status:', {
        activeConnections: this.clients.size,
        totalMessages: this.metrics.messages.sent + this.metrics.messages.received,
        uniqueIPs: this.ipConnections.size,
        subscriptionChannels: this.subscriptions.size,
        timestamp: new Date().toISOString()
      });
    }, 900000); // Every 15 minutes
    this.monitoringIntervals.push(statusInterval);
  }

  collectMetrics() {
    try {
      const messageRate = this.metrics.messages.received / (this.options.monitoring.metricsInterval / 1000);
      this.metrics.performance.messageRate = messageRate;

      // Record metrics with memory check
      const memoryUsage = process.memoryUsage();
      const memoryRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;
      const threshold = parseFloat(process.env.MEMORY_USAGE_THRESHOLD) || 0.80;

      if (memoryRatio > threshold) {
        logger.warn(`High memory usage detected in WebSocketServer collectMetrics: ${Math.round(memoryRatio * 100)}% of heap used`, {
          metadata: {
            service: 'websocket-server',
            timestamp: new Date().toISOString(),
            heapUsedMB: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
            heapTotalMB: Math.round(memoryUsage.heapTotal / (1024 * 1024))
          }
        });
      }

      // Safely record metrics if MetricsManager is available
      if (typeof MetricsManager !== 'undefined' && MetricsManager && typeof MetricsManager.getInstance === 'function') {
        // Use Promise.resolve to handle both Promise and non-Promise returns
        Promise.resolve(MetricsManager.getInstance())
          .then(metricsInstance => {
            // Check if metrics instance exists and has recordEvent method
            if (metricsInstance && typeof metricsInstance.recordEvent === 'function') {
              metricsInstance.recordEvent({
                type: 'websocket',
                name: 'metrics',
                value: {
                  activeConnections: this.metrics.connections.active,
                  messagesReceived: this.metrics.messages.received,
                  messagesSent: this.metrics.messages.sent,
                  messageRate,
                  memoryUsage: Math.round(memoryRatio * 100)
                },
                tags: { status: 'healthy' },
                metadata: { service: 'metrics-manager', timestamp: new Date().toISOString() }
              });
            } else {
              // Log that recordEvent is not available but don't throw an error
              logger.debug('MetricsManager.recordEvent is not available, skipping metrics recording', {
                timestamp: new Date().toISOString()
              });
            }
          })
          .catch(error => {
            logger.warn('WebSocket metrics recording failed:', {
              error: error.message,
              timestamp: new Date().toISOString()
            });
          });
      } else {
        // Log that MetricsManager is not available but don't throw an error
        logger.debug('MetricsManager is not available, skipping metrics recording', {
          timestamp: new Date().toISOString()
        });
      }

      // Emit metrics event for any listeners
      if (this.listenerCount('metrics') > 0) {
        this.emit('metrics', {
          timestamp: new Date().toISOString(),
          connections: this.metrics.connections,
          messages: this.metrics.messages,
          performance: {
            messageRate,
            latency: this.metrics.performance.latency.length > 0
              ? this.metrics.performance.latency.reduce((sum, val) => sum + val, 0) / this.metrics.performance.latency.length
              : 0
          },
          memory: {
            usage: Math.round(memoryRatio * 100),
            heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
            heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024))
          }
        });
      }
    } catch (error) {
      logger.warn('WebSocket metrics collection failed:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }

  setupShutdownHandlers() {
    ['SIGTERM', 'SIGINT'].forEach(signal => {
      process.on(signal, this.handleGracefulShutdown);
    });
  }

  async handleGracefulShutdown() {
    if (this.shuttingDown) {
      logger.info('Shutdown already in progress, skipping duplicate request', {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
      return;
    }

    this.shuttingDown = true;

    logger.info('Initiating graceful WebSocket shutdown...', {
      metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
    });

    // Track shutdown start time for timeout monitoring
    const shutdownStart = Date.now();

    // Create a master shutdown timeout to ensure we don't hang indefinitely
    const shutdownTimeout = setTimeout(() => {
      logger.error('WebSocket shutdown timed out after 30 seconds, forcing exit', {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
      // At this point, we've waited too long - force cleanup of remaining resources
      this._forceCleanupResources();
    }, 30000); // 30 second master timeout

    try {
      // 1. Clear all intervals first to prevent new operations during shutdown
      if (this.monitoringIntervals && this.monitoringIntervals.length > 0) {
        logger.info(`Clearing ${this.monitoringIntervals.length} monitoring intervals`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
        this.monitoringIntervals.forEach(interval => {
          try {
            clearInterval(interval);
          } catch (e) {
            // Ignore errors clearing intervals
          }
        });
        this.monitoringIntervals = [];
      }

      // Clear any other intervals that might not be in the monitoring array
      if (this.checkMemoryUsageInterval) {
        clearInterval(this.checkMemoryUsageInterval);
        this.checkMemoryUsageInterval = null;
      }

      if (this.eventListenerCleanupInterval) {
        clearInterval(this.eventListenerCleanupInterval);
        this.eventListenerCleanupInterval = null;
      }

      // 2. Notify clients about shutdown with timeout protection
      try {
        logger.info('Notifying clients about shutdown', {
          clientCount: this.clients ? this.clients.size : 0,
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });

        if (this.clients && this.clients.size > 0) {
          const shutdownMessage = JSON.stringify({
            type: 'system',
            message: 'Server shutting down',
            timestamp: new Date().toISOString()
          });

          // Use a timeout to ensure we don't wait too long
          const notifyPromise = Promise.all(
            Array.from(this.clients.values())
              .map(ws => {
                try {
                  return new Promise(resolve => {
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(shutdownMessage, () => resolve());
                    } else {
                      resolve();
                    }
                  });
                } catch (e) {
                  return Promise.resolve();
                }
              })
          );

          Promise.race([
            notifyPromise,
            new Promise(resolve => setTimeout(resolve, 3000)) // 3 second timeout for notifications
          ]).catch(() => {
            // Ignore errors in notification
          });
        }
      } catch (error) {
        logger.warn('Error notifying clients during shutdown:', {
          error: error.message,
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // 3. Close all client connections with proper error handling
      try {
        if (this.clients && this.clients.size > 0) {
          logger.info(`Closing ${this.clients.size} WebSocket connections`, {
            metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
          });

          for (const ws of this.clients.values()) {
            try {
              // Close the connection
              ws.close(1001, 'Server shutting down');
              
              // Force terminate after 100ms if not closed gracefully
              setTimeout(() => {
                if (ws.readyState !== WebSocket.CLOSED) {
                  try {
                    ws.terminate();
                  } catch (e) {
                    // Ignore terminate errors
                  }
                }
              }, 100);
            } catch (error) {
              // Just log and continue
              logger.debug(`Error closing client connection: ${error.message}`);
            }
          }
        }
      } catch (error) {
        logger.warn('Error during client connection cleanup:', {
          error: error.message,
          stack: error.stack,
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // 4. Remove all event listeners to prevent memory leaks
      try {
        this.removeAllListeners();
      } catch (error) {
        logger.warn('Error removing event listeners:', {
          error: error.message,
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // 5. Clear all data structures to free memory
      try {
        if (this.clients) this.clients.clear();
        if (this.subscriptions) this.subscriptions.clear();
        if (this.ipConnections) this.ipConnections.clear();
        if (this.activeListeners) this.activeListeners.clear();
      } catch (error) {
        logger.warn('Error clearing data structures:', {
          error: error.message,
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      // 6. Close the WebSocket server
      if (this.server) {
        try {
          this.server.close();
        } catch (error) {
          logger.warn('Error during WebSocket server close:', {
            error: error.message,
            metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
          });
        } finally {
          this.server = null;
        }
      }

      // 7. Force garbage collection if available
      if (global.gc) {
        try {
          global.gc();
        } catch (error) {
          logger.warn('Error during garbage collection:', {
            error: error.message,
            metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
          });
        }
      }

      // Clear the master shutdown timeout since we completed successfully
      clearTimeout(shutdownTimeout);

      const shutdownDuration = Date.now() - shutdownStart;
      logger.info(`WebSocket shutdown completed successfully in ${shutdownDuration}ms`, {
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });
    } catch (error) {
      // If we get here, something went very wrong during shutdown
      logger.error('Critical error during WebSocket shutdown:', {
        error: error.message,
        stack: error.stack,
        metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
      });

      // Force cleanup of any remaining resources
      this._forceCleanupResources();

      // Clear the master shutdown timeout
      clearTimeout(shutdownTimeout);
    }
  }

  _forceCleanupResources() {
    // Implement force cleanup logic here
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WebSocket server is running');
});

const wsManager = new WebSocketManager(server);

wsManager.on('message', (message) => {
  console.log('Received message:', message);
});

server.listen(8080, () => {
  console.log('Server is listening on port 8080');
});