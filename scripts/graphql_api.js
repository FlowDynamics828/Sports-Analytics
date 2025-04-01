/**
 * GraphQL API for Sports Analytics Platform
 * 
 * Provides a unified GraphQL interface for accessing all features of the platform:
 * - Advanced Correlation Analysis
 * - Real-Time Intelligence System
 * - Causal Discovery
 * - Anomaly Detection
 * - Performance Metrics
 * - System Health
 */

const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Import internal components
const { AdvancedCorrelationAPI, graphqlSchema: correlationSchema, GraphQLResolver: CorrelationResolver } = require('./advanced_correlation_api');
const RealTimeIntelligenceSystem = require('./real_time_intelligence_system');
const FactorCorrelationEngine = require('./factor_correlation_engine');
const { PerformanceMonitor } = require('./utils/performance_monitor');
const logger = require('./utils/logger');
const { SecurityManager } = require('./security_manager');
const RateLimiter = require('./rate_limiter');

// Load environment variables
require('dotenv').config();

// Main API class
class GraphQLAPI {
  /**
   * Initialize the GraphQL API
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.port = options.port || process.env.GRAPHQL_PORT || 4000;
    this.path = options.path || '/graphql';
    this.app = express();
    this.correlationEngine = options.correlationEngine || new FactorCorrelationEngine();
    this.correlationAPI = options.correlationAPI || new AdvancedCorrelationAPI({ engine: this.correlationEngine });
    this.correlationResolver = options.correlationResolver || new CorrelationResolver(this.correlationEngine);
    this.intelligenceSystem = options.intelligenceSystem || new RealTimeIntelligenceSystem();
    this.securityManager = options.securityManager || new SecurityManager();
    this.rateLimiter = options.rateLimiter || new RateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100, // limit each IP to 100 requests per windowMs
      keyGenerator: req => req.headers['x-forwarded-for'] || req.ip
    });
    this.performanceMonitor = options.performanceMonitor || new PerformanceMonitor();

    // Combine schema fragments
    this.schema = this.buildSchema();
    
    // Initialize resolvers
    this.resolvers = this.buildResolvers();
    
    // Setup middleware
    this.setupMiddleware();
  }
  
  /**
   * Build the combined GraphQL schema
   * @private
   * @returns {Object} GraphQL schema
   */
  buildSchema() {
    // Build schema from individual components
    const baseSchema = `
      scalar JSON
      scalar Date
      
      type SystemInfo {
        name: String!
        version: String!
        environment: String!
        uptime: Int!
        startTime: Date!
        currentTime: Date!
      }
      
      type SystemHealth {
        status: String!
        overall: String!
        timestamp: Date!
        components: JSON!
      }
      
      type RealTimeAlert {
        id: ID!
        type: String!
        priority: String!
        title: String!
        message: String!
        timestamp: Date!
        data: JSON
      }
      
      type AlertSubscription {
        userId: ID!
        alertTypes: [String!]!
        minPriority: String!
        sports: [String!]!
        leagues: [String!]!
        channels: [String!]!
      }
      
      type BettingOpportunity {
        id: ID!
        factor: String!
        opportunityType: String!
        estimatedValue: Float!
        sport: String
        league: String
        confidence: Float!
        expiresAt: Date
        source: String!
        timestamp: Date!
      }
      
      type Metrics {
        alertsGenerated: Int!
        alertsSent: Int!
        monitoringCycles: Int!
        opportunitiesDetected: Int!
        avgProcessingTime: Float!
        lastCycleTime: Float
      }
      
      type HealthCheckResult {
        healthy: Boolean!
        status: String!
        message: String
        timestamp: Date!
      }
      
      type Query {
        # System information
        systemInfo: SystemInfo!
        systemHealth: SystemHealth!
        systemMetrics: Metrics!
        
        # Health checks
        healthCheck: HealthCheckResult!
        componentHealthCheck(component: String!): HealthCheckResult!
        
        # Real-time intelligence
        activeAlerts(limit: Int, types: [String], priority: String, since: Date): [RealTimeAlert!]!
        activeBettingOpportunities(limit: Int, sport: String, league: String, minValue: Float): [BettingOpportunity!]!
        
        # User subscriptions
        userSubscription(userId: ID!): AlertSubscription
      }
      
      type Mutation {
        # Subscription management
        subscribeUser(userId: ID!, alertTypes: [String!], minPriority: String, sports: [String!], leagues: [String!], channels: [String!]): AlertSubscription!
        unsubscribeUser(userId: ID!): Boolean!
        
        # System control
        startMonitoring: Boolean!
        stopMonitoring: Boolean!
        startHealthMonitoring: Boolean!
        
        # Manual operations
        triggerTestAlert(userId: ID!, priority: String!): Boolean!
        clearAlerts(olderThan: Date): Int!
      }
      
      type Subscription {
        newAlert(userId: ID, types: [String], minPriority: String): RealTimeAlert!
        newBettingOpportunity(userId: ID, sports: [String], leagues: [String], minValue: Float): BettingOpportunity!
        systemHealthChanged: SystemHealth!
      }
    `;
    
    // Combine with correlation schema
    const combinedSchema = [baseSchema, correlationSchema].join('\n');
    
    // Build and return the schema
    return buildSchema(combinedSchema);
  }
  
  /**
   * Build the combined resolvers
   * @private
   * @returns {Object} GraphQL resolvers
   */
  buildResolvers() {
    return {
      // System information resolvers
      systemInfo: () => {
        const startTime = new Date(Date.now() - process.uptime() * 1000);
        return {
          name: 'Sports Analytics Platform',
          version: process.env.VERSION || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          uptime: Math.floor(process.uptime()),
          startTime,
          currentTime: new Date()
        };
      },
      
      systemHealth: async () => {
        return this.intelligenceSystem.getHealthStatus();
      },
      
      systemMetrics: () => {
        return this.intelligenceSystem.getMetrics();
      },
      
      // Health check resolvers
      healthCheck: async () => {
        try {
          const health = await this.intelligenceSystem.getHealthStatus();
          return {
            healthy: health.overall === 'healthy' || health.overall === 'optimal',
            status: health.overall,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            healthy: false,
            status: 'critical',
            message: error.message,
            timestamp: new Date()
          };
        }
      },
      
      componentHealthCheck: async ({ component }) => {
        try {
          const health = await this.intelligenceSystem.getHealthStatus();
          const componentHealth = health.components[component];
          
          if (!componentHealth) {
            return {
              healthy: false,
              status: 'unknown',
              message: `Component '${component}' not found`,
              timestamp: new Date()
            };
          }
          
          return {
            healthy: componentHealth.status === 'healthy' || componentHealth.status === 'optimal',
            status: componentHealth.status,
            message: componentHealth.message,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            healthy: false,
            status: 'critical',
            message: error.message,
            timestamp: new Date()
          };
        }
      },
      
      // Real-time intelligence resolvers
      activeAlerts: async ({ limit, types, priority, since }) => {
        return this.intelligenceSystem.getActiveAlerts({
          limit,
          types,
          priority,
          since
        });
      },
      
      activeBettingOpportunities: async ({ limit, sport, league, minValue }) => {
        return this.intelligenceSystem.getActiveBettingOpportunities({
          limit,
          sport,
          league,
          minValue
        });
      },
      
      // User subscription resolvers
      userSubscription: async ({ userId }) => {
        const subscriptions = this.intelligenceSystem.userSubscriptions;
        return subscriptions.get(userId);
      },
      
      // Mutation resolvers
      subscribeUser: async ({ userId, alertTypes, minPriority, sports, leagues, channels }) => {
        return this.intelligenceSystem.subscribeUser(userId, {
          alertTypes,
          minPriority,
          sports,
          leagues,
          channels
        });
      },
      
      unsubscribeUser: async ({ userId }) => {
        return this.intelligenceSystem.unsubscribeUser(userId);
      },
      
      startMonitoring: async () => {
        await this.intelligenceSystem.startMonitoring();
        return true;
      },
      
      stopMonitoring: async () => {
        this.intelligenceSystem.stopMonitoring();
        return true;
      },
      
      startHealthMonitoring: async () => {
        await this.intelligenceSystem.startHealthMonitoring();
        return true;
      },
      
      triggerTestAlert: async ({ userId, priority }) => {
        try {
          const testAlert = {
            id: 'test-' + Date.now(),
            type: 'test',
            priority: priority || 'medium',
            title: `Test Alert (${priority || 'medium'})`,
            message: 'This is a test alert triggered manually.',
            timestamp: new Date(),
            data: { isTest: true }
          };
          
          await this.intelligenceSystem.sendAlert(testAlert, {
            userId,
            preferences: this.intelligenceSystem.userSubscriptions.get(userId) || { channels: ['web'] }
          });
          
          return true;
        } catch (error) {
          logger.error(`Error triggering test alert: ${error.message}`);
          return false;
        }
      },
      
      clearAlerts: async ({ olderThan }) => {
        // This would typically connect to the database to clear alerts
        return 0; // Return count of cleared alerts
      },
      
      // Add correlation-specific resolvers
      getCorrelationMatrix: args => this.correlationResolver.getCorrelationMatrix(args),
      getFactorCorrelation: args => this.correlationResolver.getFactorCorrelation(args),
      getAnomalousShifts: args => this.correlationResolver.getAnomalousShifts(args),
      getCausalRelationships: args => this.correlationResolver.getCausalRelationships(args),
      getCausalGraph: args => this.correlationResolver.getCausalGraph(args),
      getCounterfactualAnalysis: args => this.correlationResolver.getCounterfactualAnalysis(args),
      calculateMultiFactorProbability: args => this.correlationResolver.calculateMultiFactorProbability(args),
      getTopCorrelatedFactors: args => this.correlationResolver.getTopCorrelatedFactors(args)
    };
  }
  
  /**
   * Setup Express middleware
   * @private
   */
  setupMiddleware() {
    // Add CORS support
    this.app.use(cors());
    
    // Add JSON body parser
    this.app.use(express.json());
    
    // Add authentication middleware
    this.app.use(this.authenticate.bind(this));
    
    // Add rate limiting
    this.app.use(this.rateLimiter.middleware());
    
    // Add performance monitoring
    this.app.use(this.performanceMonitor.middleware());
    
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.intelligenceSystem.getHealthStatus();
        res.status(health.overall === 'critical' ? 500 : 200).json({
          status: health.overall,
          timestamp: new Date()
        });
      } catch (error) {
        res.status(500).json({
          status: 'critical',
          error: error.message,
          timestamp: new Date()
        });
      }
    });
    
    // GraphQL endpoint
    this.app.use(
      this.path,
      graphqlHTTP((request) => ({
        schema: this.schema,
        rootValue: this.resolvers,
        graphiql: process.env.NODE_ENV !== 'production',
        context: { user: request.user }, // Pass user info from authentication
        customFormatErrorFn: (err) => {
          // Log errors but don't expose details in production
          logger.error(`GraphQL Error: ${err.message}`, { path: err.path, source: err.source });
          
          if (process.env.NODE_ENV === 'production') {
            return { message: 'An error occurred' };
          }
          
          return {
            message: err.message,
            locations: err.locations,
            path: err.path
          };
        }
      }))
    );
  }
  
  /**
   * Authenticate incoming requests
   * @private
   */
  authenticate(req, res, next) {
    try {
      // Check for API key
      const apiKey = req.headers['x-api-key'];
      if (!apiKey) {
        return res.status(401).json({ error: 'Missing API key' });
      }
      
      // Validate API key
      if (!this.securityManager.validateApiKey(apiKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      
      // Check for JWT if path is protected
      if (this.securityManager.isProtectedPath(req.path)) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Missing authorization token' });
        }
        
        const token = authHeader.split(' ')[1];
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          req.user = decoded;
        } catch (error) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
      }
      
      next();
    } catch (error) {
      logger.error(`Authentication error: ${error.message}`);
      return res.status(500).json({ error: 'Authentication error' });
    }
  }
  
  /**
   * Start the GraphQL server
   * @returns {Promise<Object>} Server instance
   */
  async start() {
    try {
      // Initialize components
      await this.correlationEngine.initialize();
      await this.correlationAPI.initialize();
      await this.intelligenceSystem.initialize();
      
      // Start server
      return new Promise((resolve) => {
        const server = this.app.listen(this.port, () => {
          logger.info(`GraphQL API server running at http://localhost:${this.port}${this.path}`);
          resolve(server);
        });
      });
    } catch (error) {
      logger.error(`Failed to start GraphQL API: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Stop the GraphQL server and cleanup resources
   * @param {Object} server Server instance
   * @returns {Promise<void>}
   */
  async stop(server) {
    try {
      // Shutdown components
      await this.intelligenceSystem.shutdown();
      await this.correlationEngine.shutdown();
      
      // Close server
      if (server) {
        return new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) {
              logger.error(`Error closing GraphQL server: ${err.message}`);
              reject(err);
            } else {
              logger.info('GraphQL API server shut down');
              resolve();
            }
          });
        });
      }
    } catch (error) {
      logger.error(`Error during GraphQL API shutdown: ${error.message}`);
      throw error;
    }
  }
}

// Export the GraphQL API
module.exports = GraphQLAPI;

// Start server if run directly
if (require.main === module) {
  const api = new GraphQLAPI();
  api.start().catch(err => {
    logger.error(`Failed to start API: ${err.message}`);
    process.exit(1);
  });
} 