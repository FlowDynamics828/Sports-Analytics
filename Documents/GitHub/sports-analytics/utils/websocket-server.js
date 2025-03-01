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
    new winston.transports.File({ filename: 'error.log', level: 'error' })
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

    // Add memory usage check in constructor
    this.checkMemoryUsage = () => {
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.80) { // Match .env threshold
        logger.warn(`High memory usage detected in WebSocketServer: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}% of heap used`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }
    };
    setInterval(this.checkMemoryUsage, 300000); // Check every 5 minutes
  }

  validateAndSetOptions(options) {
    const defaultOptions = {
      path: process.env.WS_PATH || '/ws',
      jwtSecret: process.env.JWT_SECRET,
      heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 60000, // 1 minute from .env
      clientTimeout: parseInt(process.env.WS_CLIENT_TIMEOUT) || 35000,
      maxPayload: parseInt(process.env.WS_MAX_PAYLOAD) || (50 * 1024 * 1024), // 50MB
      maxClients: 1000, // Reduced from 10000 to lower resource usage
      compression: {
        enabled: true,
        level: parseInt(process.env.COMPRESSION_LEVEL) || 6,
        threshold: parseInt(process.env.COMPRESSION_THRESHOLD) || 1024
      },
      security: {
        rateLimiting: {
          enabled: true,
          maxRequestsPerMinute: 300 // Reduced from 600 to lower load
        },
        maxConnectionsPerIP: parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 50
      },
      monitoring: {
        enabled: true,
        metricsInterval: 300000 // 5 minutes from optimizations
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
  }

  bindMethods() {
    this.handleConnection = this.handleConnection.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.verifyClient = this.verifyClient.bind(this);
    this.handleGracefulShutdown = this.handleGracefulShutdown.bind(this);
  }

  async initialize(server) {
    if (this.isInitialized) {
      return;
    }

    if (!server || typeof server !== 'object' || !server.on || !server.close) {
      throw new Error('Server instance required');
    }

    this.server = new WebSocket.Server({
      server,
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
    
    this.server.on('connection', this.handleConnection);
    this.server.on('error', this.handleError);
    
    this.setupMonitoring();
    this.setupShutdownHandlers();
    
    this.isInitialized = true;
    logger.info('WebSocket server initialized successfully', { 
      metadata: { service: 'websocket-server', timestamp: new Date().toISOString() } 
    });
    
    return true;
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

      // Verify authentication
      const token = this.extractToken(info.req);
      if (!token) {
        logger.warn('Authentication required for WebSocket connection:', { ip: clientIP, timestamp: new Date().toISOString() });
        return callback(false, 401, 'Authentication Required');
      }

      const user = await this.verifyToken(token);
      info.req.user = user;

      // Check server capacity
      if (this.clients.size >= this.options.maxClients) {
        logger.warn('Server at capacity for WebSocket connection:', { timestamp: new Date().toISOString() });
        return callback(false, 503, 'Server At Capacity');
      }

      callback(true);
    } catch (error) {
      logger.error('WebSocket client verification failed:', { 
        error: error.message, 
        stack: error.stack, 
        ip: info.req.socket.remoteAddress, 
        timestamp: new Date().toISOString() 
      });
      callback(false, 401, 'Authentication Failed');
    }
  }

  async handleConnection(ws, req) {
    try {
      const clientId = this.generateClientId();
      const clientIP = req.socket.remoteAddress;

      ws.id = clientId;
      ws.user = req.user;
      ws.isAlive = true;
      ws.subscriptions = new Set();
      ws.ip = clientIP;

      this.initializeClient(ws, clientIP);
      this.setupClientHandlers(ws);
      
      await this.sendWelcome(ws);

      this.metrics.connections.active++;
      this.metrics.connections.total++;
      logger.info('WebSocket client connected:', { 
        clientId, 
        ip: clientIP, 
        timestamp: new Date().toISOString() 
      });

    } catch (error) {
      this.handleClientError(ws, error);
    }
  }

  setupClientHandlers(ws) {
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('close', () => this.handleClientDisconnect(ws));
    ws.on('error', (error) => this.handleClientError(ws, error));
    ws.on('pong', () => this.handlePong(ws));
  }

  async handleMessage(ws, data) {
    try {
      const startTime = performance.now();
      const message = await this.decodeMessage(data);
      
      // Rate limit with memory check
      if (this.options.security.rateLimiting.enabled) {
        const rateLimitKey = `ws:message:${ws.id}`;
        if (!(await rateLimiter.checkLimit(rateLimitKey, this.options.security.rateLimiting.maxRequestsPerMinute / 60))) {
          throw new Error('Message rate limit exceeded');
        }
      }

      // Check memory before processing
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.80) { // Match .env threshold
        logger.warn(`High memory usage detected in WebSocketServer handleMessage: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}% of heap used`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

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
        default:
          throw new Error('Invalid message type');
      }

      this.metrics.messages.received++;
      this.metrics.performance.latency.push(performance.now() - startTime);
      if (this.metrics.performance.latency.length > 100) {
        this.metrics.performance.latency.shift(); // Limit latency history
      }

    } catch (error) {
      this.handleMessageError(ws, error);
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
    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client?.readyState === WebSocket.OPEN) {
        await this.sendToClient(client, message);
        sent++;
      }
    }

    this.metrics.messages.sent += sent;
    return sent;
  }

  async sendToClient(ws, data) {
    try {
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error('Client connection not open');
      }

      await new Promise((resolve, reject) => {
        ws.send(data, (error) => {
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
    const header = req.headers['authorization'];
    return header?.startsWith('Bearer ') ? header.slice(7) : null;
  }

  async verifyToken(token) {
    return await promisify(jwt.verify)(token, this.options.jwtSecret);
  }

  async encodeMessage(data) {
    const message = JSON.stringify(data);
    return this.options.compression.enabled
      ? await promisify(zlib.deflate)(message)
      : Buffer.from(message);
  }

  async decodeMessage(data) {
    const message = this.options.compression.enabled
      ? await promisify(zlib.inflate)(data)
      : data;
    return JSON.parse(message.toString());
  }

  getIPConnections(ip) {
    return this.ipConnections.get(ip) || 0;
  }

  initializeClient(ws, ip) {
    this.clients.set(ws.id, ws);
    this.ipConnections.set(ip, this.getIPConnections(ip) + 1);
  }

  handleClientDisconnect(ws) {
    const clientIP = ws.ip;
    
    // Clean up subscriptions
    ws.subscriptions?.forEach(channel => {
      const subs = this.subscriptions.get(channel);
      subs?.delete(ws.id);
      if (subs?.size === 0) {
        this.subscriptions.delete(channel);
      }
    });

    // Update IP connections
    const ipCount = this.getIPConnections(clientIP);
    if (ipCount > 1) {
      this.ipConnections.set(clientIP, ipCount - 1);
    } else {
      this.ipConnections.delete(clientIP);
    }

    this.clients.delete(ws.id);
    this.metrics.connections.active--;
    logger.info('WebSocket client disconnected:', { 
      clientId: ws.id, 
      ip: clientIP, 
      timestamp: new Date().toISOString() 
    });
  }

  handlePong(ws) {
    ws.isAlive = true;
  }

  // Error Handlers
  handleError(error) {
    logger.error('WebSocket server error:', { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
  }

  handleClientError(ws, error) {
    logger.error(`Client ${ws.id} error:`, { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
    ws.terminate();
  }

  handleMessageError(ws, error) {
    logger.error(`Message error from ${ws.id}:`, { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
    this.sendToClient(ws, {
      type: 'error',
      message: error.message
    }).catch(() => {});
  }

  handleSendError(ws, error) {
    logger.error(`Send error to ${ws.id}:`, { 
      error: error.message, 
      stack: error.stack, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.messages.errors++;
  }

  // Monitoring & Maintenance
  setupMonitoring() {
    if (!this.options.monitoring.enabled) return;

    // Heartbeat checking
    setInterval(() => {
      this.clients.forEach((ws) => {
        if (!ws.isAlive) {
          ws.terminate();
          this.handleClientDisconnect(ws);
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, this.options.heartbeatInterval);

    // Metrics collection
    setInterval(() => {
      this.collectMetrics();
      this.emit('metrics', this.metrics);
    }, this.options.monitoring.metricsInterval);

    // Clean up old metrics data
    setInterval(() => {
      if (this.metrics.performance.latency.length > 100) {
        this.metrics.performance.latency = this.metrics.performance.latency.slice(-100);
      }
    }, 600000); // Clean every 10 minutes
  }

  collectMetrics() {
    try {
      const messageRate = this.metrics.messages.received / (this.options.monitoring.metricsInterval / 1000);
      this.metrics.performance.messageRate = messageRate;
      
      // Record metrics with memory check
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.80) { // Match .env threshold
        logger.warn(`High memory usage detected in WebSocketServer collectMetrics: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}% of heap used`, {
          metadata: { service: 'websocket-server', timestamp: new Date().toISOString() }
        });
      }

      if (MetricsManager && MetricsManager.getInstance) {
        const metrics = MetricsManager.getInstance();
        metrics.recordEvent({
          type: 'websocket',
          name: 'metrics',
          value: {
            activeConnections: this.metrics.connections.active,
            messagesReceived: this.metrics.messages.received,
            messagesSent: this.metrics.messages.sent,
            messageRate
          },
          tags: { status: 'healthy' }
        });
      }
    } catch (error) {
      logger.warn('WebSocket metrics collection failed:', { 
        error: error.message, 
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
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    logger.info('Initiating graceful WebSocket shutdown...', { 
      metadata: { service: 'websocket-server', timestamp: new Date().toISOString() } 
    });

    // Notify all clients
    const shutdownMessage = await this.encodeMessage({
      type: 'system',
      message: 'Server shutting down',
      timestamp: new Date().toISOString()
    });

    await Promise.all(
      Array.from(this.clients.values())
        .map(ws => this.sendToClient(ws, shutdownMessage).catch(() => {}))
    );

    // Close all connections
    this.clients.forEach(ws => ws.close());

    // Close server
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
      this.server = null;
    }

    logger.info('WebSocket shutdown completed', { 
      metadata: { service: 'websocket-server', timestamp: new Date().toISOString() } 
    });
  }
}

// Export class for instantiation
module.exports = { WebSocketServer };