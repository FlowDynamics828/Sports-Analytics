/**
 * Advanced Correlation API 2.0
 * 
 * Revolutionary high-level API for the enhanced Factor Correlation Engine.
 * Provides simplified access to advanced correlation analysis capabilities
 * with GraphQL support, real-time streaming, intelligent caching, and more.
 * 
 * @author Sports Analytics Platform Team
 * @version 3.0.0
 */

// Core dependencies
const FactorCorrelationEngine = require('./factor_correlation_engine');
const logger = require('./utils/logger');
const { ApolloServer } = require('apollo-server-express');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { execute, subscribe } = require('graphql');
const express = require('express');
const http = require('http');
const ws = require('ws');
const Redis = require('ioredis');
const { RedisPubSub } = require('graphql-redis-subscriptions');
const TokenBucket = require('./utils/token_bucket');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');
const { performance } = require('perf_hooks');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { createComplexityLimitRule } = require('graphql-validation-complexity');
const { graphqlUploadExpress } = require('graphql-upload');
const DataLoader = require('dataloader');
const gql = require('graphql-tag');

// Load environment variables
dotenv.config();

// GraphQL Schema Definition
const typeDefs = gql`
  # Main query type
  type Query {
    # Get joint probability for multiple factors
    jointProbability(input: JointProbabilityInput!): JointProbabilityResult!
    
    # Find factors that influence the given factor
    influentialFactors(input: InfluentialFactorsInput!): InfluentialFactorsResult!
    
    # Discover factor clusters (groups of related factors)
    factorGroups(input: FactorGroupsInput!): [FactorGroup!]!
    
    # Get anomalous correlation shifts detected in the system
    anomalousShifts(input: AnomalousShiftsInput!): [AnomalousShift!]!
    
    # Generate an analysis report with key insights
    insightReport(input: InsightReportInput!): InsightReport!
    
    # Get the strongest correlations in the system
    strongestCorrelations(input: StrongestCorrelationsInput!): StrongestCorrelationsResult!
    
    # Analyze "what if" scenarios by changing factor probabilities
    whatIfScenario(input: WhatIfScenarioInput!): WhatIfScenarioResult!
    
    # Get explainable insights for prediction factors
    explainableInsights(input: ExplainableInsightsInput!): [Insight!]!
    
    # Get export URL for insights data
    exportInsights(input: ExportInsightsInput!): ExportResult!
    
    # Get system health information
    systemHealth: SystemHealthInfo!
  }

  # Mutation type for operations that change data
  type Mutation {
    # Create a custom correlation analysis job
    createAnalysisJob(input: AnalysisJobInput!): AnalysisJob!
    
    # Cancel a running analysis job
    cancelAnalysisJob(id: ID!): Boolean!
    
    # Add a factor to the watchlist for real-time monitoring
    addFactorToWatchlist(input: WatchlistInput!): WatchlistEntry!
    
    # Remove a factor from the watchlist
    removeFactorFromWatchlist(id: ID!): Boolean!
  }

  # Subscription type for real-time data streams
  type Subscription {
    # Subscribe to real-time correlation updates for watched factors
    correlationUpdates(filter: CorrelationUpdateFilter): CorrelationUpdate!
    
    # Subscribe to anomaly detection events
    anomalyDetected(filter: AnomalyFilter): AnomalyEvent!
    
    # Subscribe to analysis job status updates
    analysisJobProgress(jobId: ID!): JobProgressUpdate!
  }

  # Input for joint probability calculation
  input JointProbabilityInput {
    factors: [FactorInput!]!
    sport: Sport
    league: League
    includeInsights: Boolean
  }

  # Input for a single factor
  input FactorInput {
    factor: String!
    probability: Float
    value: Float
  }

  # Input for influential factors query
  input InfluentialFactorsInput {
    factor: String!
    minCorrelation: Float
    limit: Int
    sport: Sport
    league: League
  }

  # Input for factor groups discovery
  input FactorGroupsInput {
    minCorrelation: Float
    sport: Sport
    league: League
  }

  # Input for anomalous shifts query
  input AnomalousShiftsInput {
    limit: Int
    sport: Sport
    league: League
  }

  # Input for insight report generation
  input InsightReportInput {
    sport: Sport
    league: League
    timeframe: Timeframe
  }

  # Input for strongest correlations query
  input StrongestCorrelationsInput {
    limit: Int
    minConfidence: Float
    sport: Sport
    league: League
  }

  # Input for what-if scenario analysis
  input WhatIfScenarioInput {
    baseFactors: [FactorInput!]!
    changes: [FactorChangeInput!]!
    sport: Sport
    league: League
  }

  # Input for a factor change in what-if analysis
  input FactorChangeInput {
    factor: String!
    newProbability: Float
    newValue: Float
  }

  # Input for creating an analysis job
  input AnalysisJobInput {
    name: String!
    description: String
    sport: Sport
    league: League
    factorsToAnalyze: [String!]!
    analysisType: AnalysisType!
    priority: JobPriority
    notifyOnComplete: Boolean
    parameters: JSON
  }

  # Input for adding a factor to the watchlist
  input WatchlistInput {
    factor: String!
    sport: Sport
    league: League
    alertThreshold: Float
    description: String
  }

  # Filter for correlation update subscriptions
  input CorrelationUpdateFilter {
    factors: [String!]
    sport: Sport
    league: League
    minChange: Float
  }

  # Filter for anomaly subscriptions
  input AnomalyFilter {
    factors: [String!]
    sport: Sport
    league: League
    minSignificance: Float
  }

  # Result of joint probability calculation
  type JointProbabilityResult {
    probability: Float!
    confidence: Float!
    factors: [FactorProbability!]!
    insights: [Insight!]
    timestamp: DateTime!
  }

  # Factor with probability
  type FactorProbability {
    factor: String!
    probability: Float!
    contribution: Float!
  }

  # Result of influential factors query
  type InfluentialFactorsResult {
    factor: String!
    causes: [InfluentialFactor!]!
    bidirectional: [InfluentialFactor!]!
    correlates: [InfluentialFactor!]!
    sport: String!
    league: String!
    totalFactorsAnalyzed: Int!
  }

  # An influential factor
  type InfluentialFactor {
    factor: String!
    correlation: Float!
    confidence: Float!
    description: String
  }

  # A group of related factors
  type FactorGroup {
    id: ID!
    theme: String!
    size: Int!
    centralFactor: String!
    factors: [GroupFactor!]!
    sport: String!
    league: String!
  }

  # A factor within a group
  type GroupFactor {
    factor: String!
    correlationToCentral: Float!
    importance: Float!
  }

  # An anomalous correlation shift
  type AnomalousShift {
    id: ID!
    factorA: String!
    factorB: String!
    sport: String!
    league: String!
    detectedAt: DateTime!
    previousCorrelation: Float!
    currentCorrelation: Float!
    significance: Float!
    history: [CorrelationHistoryPoint!]!
  }

  # A point in correlation history
  type CorrelationHistoryPoint {
    timestamp: DateTime!
    correlation: Float!
    confidence: Float!
  }

  # An insight report
  type InsightReport {
    id: ID!
    timestamp: DateTime!
    sport: String!
    league: String!
    insights: [ReportInsight!]!
  }

  # An insight within a report
  type ReportInsight {
    type: InsightType!
    title: String!
    description: String!
    correlations: [CorrelationInsight!]
    anomalies: [AnomalyInsight!]
    clusters: [ClusterInsight!]
    prediction: PredictionInsight
  }

  # A correlation insight
  type CorrelationInsight {
    factorA: String!
    factorB: String!
    correlation: Float!
    confidence: Float!
    description: String!
  }

  # An anomaly insight
  type AnomalyInsight {
    factorA: String!
    factorB: String!
    detectedAt: DateTime!
    description: String!
  }

  # A cluster insight
  type ClusterInsight {
    theme: String!
    size: Int!
    centralFactor: String!
    topFactors: [String!]!
  }

  # A prediction insight
  type PredictionInsight {
    subject: String!
    prediction: String!
    confidence: Float!
    reasoning: String!
  }

  # Result of strongest correlations query
  type StrongestCorrelationsResult {
    positive: [CorrelationInsight!]!
    negative: [CorrelationInsight!]!
  }

  # Result of what-if scenario analysis
  type WhatIfScenarioResult {
    originalProbability: Float!
    newProbability: Float!
    change: Float!
    significantFactors: [FactorImpact!]!
    confidence: Float!
  }

  # Factor impact in what-if analysis
  type FactorImpact {
    factor: String!
    originalValue: Float!
    newValue: Float!
    impact: Float!
  }

  # An analysis job
  type AnalysisJob {
    id: ID!
    name: String!
    description: String
    status: JobStatus!
    progress: Float!
    createdAt: DateTime!
    startedAt: DateTime
    completedAt: DateTime
    sport: String
    league: String
    factorsToAnalyze: [String!]!
    analysisType: AnalysisType!
    priority: JobPriority!
    results: JSON
    error: String
  }

  # A watchlist entry
  type WatchlistEntry {
    id: ID!
    factor: String!
    sport: String!
    league: String!
    alertThreshold: Float!
    description: String
    createdAt: DateTime!
    lastTriggered: DateTime
  }

  # A real-time correlation update
  type CorrelationUpdate {
    factorA: String!
    factorB: String!
    oldCorrelation: Float!
    newCorrelation: Float!
    changePercent: Float!
    timestamp: DateTime!
    sport: String!
    league: String!
  }

  # An anomaly event
  type AnomalyEvent {
    id: ID!
    factorA: String!
    factorB: String!
    previousCorrelation: Float!
    currentCorrelation: Float!
    significance: Float!
    timestamp: DateTime!
    sport: String!
    league: String!
    description: String!
  }

  # A job progress update
  type JobProgressUpdate {
    jobId: ID!
    status: JobStatus!
    progress: Float!
    currentStage: String
    estimatedTimeRemaining: Int
    timestamp: DateTime!
  }

  # Custom scalar types
  scalar DateTime
  scalar JSON

  # Enum for supported sports
  enum Sport {
    NBA
    NHL
    NFL
    MLB
    LA_LIGA
    SERIE_A
    PREMIER_LEAGUE
    BUNDESLIGA
    ALL
  }

  # Enum for supported leagues
  enum League {
    NBA
    NHL
    NFL
    MLB
    LA_LIGA
    SERIE_A
    PREMIER_LEAGUE
    BUNDESLIGA
    ALL
  }

  # Enum for timeframes
  enum Timeframe {
    LAST_DAY
    LAST_WEEK
    LAST_MONTH
    LAST_SEASON
    ALL_TIME
  }

  # Enum for analysis types
  enum AnalysisType {
    CORRELATION_DISCOVERY
    FACTOR_CLUSTERING
    ANOMALY_DETECTION
    PREDICTIVE_MODELING
    CAUSAL_INFERENCE
    CUSTOM
  }

  # Enum for job status
  enum JobStatus {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    CANCELLED
  }

  # Enum for job priority
  enum JobPriority {
    LOW
    NORMAL
    HIGH
    CRITICAL
  }

  # Enum for insight types
  enum InsightType {
    STRONGEST_POSITIVE_CORRELATIONS
    STRONGEST_NEGATIVE_CORRELATIONS
    RECENT_ANOMALIES
    FACTOR_CLUSTERS
    EMERGING_TRENDS
    PREDICTIVE_INSIGHTS
  }

  # Input for explainable insights
  input ExplainableInsightsInput {
    factors: [String!]!
    sport: Sport
    league: League
    detailLevel: DetailLevel
    includeCounterfactuals: Boolean
    includeCausalRelationships: Boolean
    maxInsightsPerCategory: Int
    useCache: Boolean
  }

  # Detail level enum for explainable insights
  enum DetailLevel {
    BASIC
    STANDARD
    ADVANCED
  }

  # Insight type enum
  enum InsightType {
    FEATURE_IMPORTANCE
    HISTORICAL_CONTEXT
    STATISTICAL_SIGNIFICANCE
    CORRELATION_PATTERN
    COUNTERFACTUAL
    CAUSAL_RELATIONSHIP
  }

  # An insight with explanation
  type Insight {
    id: ID!
    type: InsightType!
    title: String!
    description: String!
    confidence: Float!
    data: JSON
    visualizationData: JSON
  }
  
  # Input for exporting insights
  input ExportInsightsInput {
    factors: [String!]!
    sport: Sport
    league: League
    detailLevel: DetailLevel
    format: ExportFormat!
  }
  
  # Export format options
  enum ExportFormat {
    PDF
    CSV
    EXCEL
    JSON
  }
  
  # Export result
  type ExportResult {
    url: String!
    expiresAt: DateTime!
    contentType: String!
    filename: String!
    metadata: JSON
  }
  
  # System health information
  type SystemHealthInfo {
    status: SystemStatus!
    version: String!
    uptime: Float!
    components: [ComponentHealth!]!
    circuitBreakers: [CircuitBreakerStatus!]!
  }
  
  # System status enum
  enum SystemStatus {
    HEALTHY
    DEGRADED
    UNHEALTHY
  }
  
  # Component health information
  type ComponentHealth {
    name: String!
    status: SystemStatus!
    latency: Float
    message: String
  }
  
  # Circuit breaker status
  type CircuitBreakerStatus {
    name: String!
    state: String!
    failures: Int!
    successful: Int!
    rejected: Int!
    timeout: Int!
    lastFailure: DateTime
  }
`;

// Define the access control policy
const accessControlPolicy = {
  // Field-level permissions
  fields: {
    Query: {
      insightReport: ['ADMIN', 'ANALYST'],
      whatIfScenario: ['ADMIN', 'ANALYST', 'COACH'],
      anomalousShifts: ['ADMIN', 'ANALYST', 'COACH'],
      strongestCorrelations: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT'],
      factorGroups: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT'],
      influentialFactors: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM'],
      jointProbability: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC']
    },
    Mutation: {
      createAnalysisJob: ['ADMIN', 'ANALYST'],
      cancelAnalysisJob: ['ADMIN', 'ANALYST'],
      addFactorToWatchlist: ['ADMIN', 'ANALYST', 'COACH'],
      removeFactorFromWatchlist: ['ADMIN', 'ANALYST', 'COACH']
    },
    Subscription: {
      correlationUpdates: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM'],
      anomalyDetected: ['ADMIN', 'ANALYST', 'COACH'],
      analysisJobProgress: ['ADMIN', 'ANALYST']
    }
  },
  
  // Entity-level permissions (for specific factors, leagues, etc.)
  entities: {
    // Restricted factors that need special access
    restrictedFactors: [
      {
        pattern: /^injury_risk_.*/,
        roles: ['ADMIN', 'ANALYST', 'COACH']
      },
      {
        pattern: /^proprietary_.*/,
        roles: ['ADMIN', 'ANALYST']
      },
      {
        pattern: /^confidential_.*/,
        roles: ['ADMIN']
      }
    ],
    
    // League-specific restrictions
    leagueAccess: {
      NBA: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'],
      NHL: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'],
      NFL: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'],
      MLB: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'],
      LA_LIGA: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'],
      SERIE_A: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'],
      PREMIER_LEAGUE: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC'],
      BUNDESLIGA: ['ADMIN', 'ANALYST', 'COACH', 'SCOUT', 'FAN_PREMIUM', 'FAN_BASIC']
    }
  }
};

// Token bucket configuration for rate limiting
const rateLimitConfig = {
  buckets: {
    ADMIN: {
      capacity: 1000,
      refillRate: 100, // per second
      refillInterval: 1000 // 1 second
    },
    ANALYST: {
      capacity: 500,
      refillRate: 50,
      refillInterval: 1000
    },
    COACH: {
      capacity: 300,
      refillRate: 30,
      refillInterval: 1000
    },
    SCOUT: {
      capacity: 200,
      refillRate: 20,
      refillInterval: 1000
    },
    FAN_PREMIUM: {
      capacity: 100,
      refillRate: 10,
      refillInterval: 1000
    },
    FAN_BASIC: {
      capacity: 50,
      refillRate: 5,
      refillInterval: 1000
    }
  },
  
  // Cost factors for different query types
  queryCosts: {
    jointProbability: 5,
    influentialFactors: 3,
    factorGroups: 7,
    anomalousShifts: 2,
    insightReport: 10,
    strongestCorrelations: 3,
    whatIfScenario: 5,
    createAnalysisJob: 15,
    cancelAnalysisJob: 1,
    addFactorToWatchlist: 2,
    removeFactorFromWatchlist: 1,
    correlationUpdates: 1,
    anomalyDetected: 1,
    analysisJobProgress: 1
  }
};

// Cache configuration
const cacheConfig = {
  // Default TTL (time to live) in seconds
  defaultTTL: 300, // 5 minutes
  
  // Custom TTLs for specific query types
  customTTLs: {
    factorGroups: 3600, // 1 hour
    insightReport: 1800, // 30 minutes
    strongestCorrelations: 1800, // 30 minutes
    influentialFactors: 600 // 10 minutes
  },
  
  // Maximum number of items in cache
  maxItems: 10000,
  
  // Check period for expired items (in seconds)
  checkPeriod: 60
};

/**
 * Advanced Correlation API Class
 */
class AdvancedCorrelationAPI {
  /**
   * Initialize the API
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    // Initialize core components
    this.engine = new FactorCorrelationEngine(options);
    this.initialized = false;
    
    // Initialize Redis clients
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0,
      keyPrefix: 'correlation_api:'
    });
    
    // Create Redis PubSub for GraphQL subscriptions
    this.redisPubSub = new RedisPubSub({
      publisher: new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: process.env.REDIS_SUB_DB || 1,
        keyPrefix: 'correlation_pubsub:'
      }),
      subscriber: new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: process.env.REDIS_SUB_DB || 1,
        keyPrefix: 'correlation_pubsub:'
      })
    });
    
    // Initialize cache
    this.cache = new NodeCache({
      stdTTL: cacheConfig.defaultTTL,
      checkperiod: cacheConfig.checkPeriod,
      maxKeys: cacheConfig.maxItems,
      useClones: false
    });
    
    // Initialize token buckets for rate limiting
    this.tokenBuckets = {};
    Object.entries(rateLimitConfig.buckets).forEach(([role, config]) => {
      this.tokenBuckets[role] = new TokenBucket(
        config.capacity,
        config.refillRate,
        config.refillInterval
      );
    });
    
    // Initialize query analytics storage
    this.queryAnalytics = {
      queries: {},
      lastCleanup: Date.now()
    };
    
    // Initialize data loaders for batching
    this.initializeDataLoaders();
    
    // Initialize Express app and HTTP server
    this.app = express();
    this.httpServer = http.createServer(this.app);
    
    // Set up GraphQL server and subscriptions
    this.setupGraphQL();
    
    // Set up anomaly detection
    this.setupAnomalyDetection();
    
    // Set up predictive prefetching
    this.setupPredictivePrefetching();
    
    // Log initialization
    logger.info('AdvancedCorrelationAPI: Initialized with enhanced features');
  }
  
  /**
   * Initialize data loaders for batch processing
   * @private
   */
  initializeDataLoaders() {
    // Loader for factor correlations
    this.factorCorrelationLoader = new DataLoader(
      async (keys) => {
        const results = await Promise.all(
          keys.map(async (key) => {
            const [factorA, factorB, sport, league] = key.split(':');
            try {
              return await this.engine.getFactorCorrelation(factorA, factorB, {
                sport: sport === 'ALL' ? null : sport,
                league: league === 'ALL' ? null : league
              });
            } catch (error) {
              logger.error(`Error loading correlation for ${factorA}:${factorB}: ${error.message}`);
              return null;
            }
          })
        );
        return results;
      },
      {
        // Cache key function
        cacheKeyFn: (key) => key,
        // Batch scheduling function (process in batches of max 100 with 50ms delay)
        batchScheduleFn: (callback) => setTimeout(callback, 50)
      }
    );
    
    // Loader for factor details
    this.factorDetailsLoader = new DataLoader(
      async (factorIds) => {
        const results = await Promise.all(
          factorIds.map(async (factorId) => {
            try {
              return await this.engine.getFactorDetails(factorId);
            } catch (error) {
              logger.error(`Error loading factor details for ${factorId}: ${error.message}`);
              return null;
            }
          })
        );
        return results;
      },
      {
        // Cache for 5 minutes
        maxBatchSize: 100
      }
    );
    
    // Loader for factor history
    this.factorHistoryLoader = new DataLoader(
      async (keys) => {
        const results = await Promise.all(
          keys.map(async (key) => {
            const [factorId, timeframe] = key.split(':');
            try {
              return await this.engine.getFactorHistory(factorId, { timeframe });
            } catch (error) {
              logger.error(`Error loading factor history for ${factorId}: ${error.message}`);
              return [];
            }
          })
        );
        return results;
      }
    );
  }
  
  /**
   * Set up GraphQL server and subscriptions
   * @private
   */
  setupGraphQL() {
    // Define resolvers
    const resolvers = {
      Query: {
        jointProbability: this.createResolver(
          this.getJointProbability.bind(this),
          rateLimitConfig.queryCosts.jointProbability
        ),
        influentialFactors: this.createResolver(
          this.findInfluentialFactors.bind(this),
          rateLimitConfig.queryCosts.influentialFactors,
          cacheConfig.customTTLs.influentialFactors
        ),
        factorGroups: this.createResolver(
          this.discoverFactorGroups.bind(this),
          rateLimitConfig.queryCosts.factorGroups,
          cacheConfig.customTTLs.factorGroups
        ),
        anomalousShifts: this.createResolver(
          this.getAnomalousShifts.bind(this),
          rateLimitConfig.queryCosts.anomalousShifts
        ),
        insightReport: this.createResolver(
          this.generateInsightReport.bind(this),
          rateLimitConfig.queryCosts.insightReport,
          cacheConfig.customTTLs.insightReport
        ),
        strongestCorrelations: this.createResolver(
          this.getStrongestCorrelations.bind(this),
          rateLimitConfig.queryCosts.strongestCorrelations,
          cacheConfig.customTTLs.strongestCorrelations
        ),
        whatIfScenario: this.createResolver(
          this.analyzeWhatIfScenario.bind(this),
          rateLimitConfig.queryCosts.whatIfScenario
        ),
        explainableInsights: async (_, { input }, context) => {
          try {
            // Start telemetry
            const startTime = performance.now();
            
            // Check feature flag - failsafe to quickly disable if needed
            if (!featureFlags.isEnabled('explainable_insights', context.user)) {
              throw new Error('Explainable insights feature is currently disabled');
            }
            
            // Authorization check with enhanced logging
            if (!context.user || !hasPermission(context.user, 'ADVANCED_INSIGHTS')) {
              logger.warn(`Unauthorized access attempt to explainableInsights by ${context.requestId}`);
              throw new Error('Unauthorized: Advanced insights requires Premium tier or higher');
            }
            
            // Rate limiting with enhanced configuration
            const requesterId = context.user.id || 'anonymous';
            const rateLimitKey = `explainable_insights:${requesterId}`;
            
            // Use tier-specific rate limits
            const rateLimitConfig = {
              PREMIUM: { maxRequests: 50, window: 60 * 60 },
              ULTRA_PREMIUM: { maxRequests: 200, window: 60 * 60 },
              ENTERPRISE: { maxRequests: 500, window: 60 * 60 }
            };
            
            const tierConfig = rateLimitConfig[context.user.tier] || rateLimitConfig.PREMIUM;
            
            const allowed = await rateLimiter.checkRateLimit(rateLimitKey, {
              tier: context.user.tier,
              maxRequests: tierConfig.maxRequests,
              window: tierConfig.window
            });
            
            if (!allowed) {
              logger.warn(`Rate limit exceeded for explainableInsights by user ${requesterId}`);
              
              // Track rate limit events
              context.analytics.trackEvent('api_rate_limit', {
                operation: 'explainable_insights',
                user_id: requesterId,
                tier: context.user.tier
              });
              
              throw new Error(`Rate limit exceeded for explainable insights API. Limit: ${tierConfig.maxRequests} requests per hour`);
            }
            
            // Validate input
            if (!input.factors || !Array.isArray(input.factors) || input.factors.length === 0) {
              throw new Error('At least one factor is required');
            }
            
            if (input.factors.length > 10) {
              throw new Error('Maximum of 10 factors allowed for explainable insights');
            }
            
            // Use circuit breaker for resilient API calls
            try {
              const insights = await circuitBreakers.explainableInsights.fire(
                context.engine,
                input,
                context.user
              );
              
              // Track performance
              const duration = performance.now() - startTime;
              logger.debug(`Generated ${insights.length} explainable insights in ${duration.toFixed(2)}ms`);
              
              // Add request context for debugging
              const enhancedInsights = insights.map(insight => ({
                ...insight,
                metadata: {
                  ...(insight.metadata || {}),
                  requestId: context.requestId
                }
              }));
              
              // Log usage for analytics with enhanced data
              context.analytics.trackEvent('api_usage', {
                operation: 'explainable_insights',
                user_id: requesterId,
                tier: context.user.tier,
                factor_count: input.factors.length,
                insight_count: enhancedInsights.length,
                detail_level: input.detailLevel || 'STANDARD',
                duration_ms: duration,
                sport: input.sport,
                league: input.league,
                counterfactuals_included: input.includeCounterfactuals !== false,
                causal_relationships_included: input.includeCausalRelationships !== false,
                cache_used: input.useCache !== false
              });
              
              return enhancedInsights;
            } catch (circuitError) {
              // If circuit breaker fails, try fallback strategy
              if (circuitBreakers.explainableInsights.status.state === 'open') {
                logger.warn(`Circuit is open for explainableInsights, using fallback`);
                
                return [
                  {
                    id: `fallback_${Date.now()}`,
                    type: 'FEATURE_IMPORTANCE',
                    title: 'Limited Service Available',
                    description: 'Our advanced insights system is experiencing high load. Basic insights are provided below.',
                    confidence: 0.5,
                    data: input.factors.map((factor, idx) => ({
                      feature: factor,
                      importance: 1 - (idx * 0.1),
                      explanation: 'Basic factor analysis available during high system load.'
                    })),
                    metadata: {
                      fallback: true,
                      reason: 'circuit_open',
                      requestId: context.requestId
                    }
                  }
                ];
              }
              
              // Otherwise, propagate the error
              logger.error(`Circuit error for explainableInsights: ${circuitError.message}`);
              throw circuitError;
            }
          } catch (error) {
            logger.error(`Error generating explainable insights: ${error.message}`, {
              stack: error.stack,
              requestId: context.requestId
            });
            
            // Track error for monitoring
            context.analytics.trackEvent('api_error', {
              operation: 'explainable_insights',
              error: error.message,
              user_id: context.user?.id || 'anonymous',
              request_id: context.requestId
            });
            
            throw error;
          }
        },
        exportInsights: async (_, { input }, context) => {
          try {
            // Authorization check
            if (!context.user || !hasPermission(context.user, 'EXPORT_DATA')) {
              throw new Error('Unauthorized: Export functionality requires Premium tier or higher');
            }
            
            // Rate limiting for exports (stricter than regular API calls)
            const requesterId = context.user.id || 'anonymous';
            const rateLimitKey = `export_insights:${requesterId}`;
            const allowed = await rateLimiter.checkRateLimit(rateLimitKey, {
              tier: context.user.tier,
              maxRequests: 10, // Lower limit for exports
              window: 60 * 60 // 1 hour
            });
            
            if (!allowed) {
              throw new Error('Rate limit exceeded for export functionality');
            }
            
            // Generate insights first
            const insights = await context.engine.getExplainableInsights(input.factors, {
              sport: input.sport,
              league: input.league,
              detailLevel: input.detailLevel || 'STANDARD',
              includeCounterfactuals: true,
              includeCausalRelationships: true,
              maxInsightsPerCategory: 5, // More insights for exports
              useCache: true
            });
            
            // Generate a unique filename
            const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
            const randomSuffix = Math.random().toString(36).substring(2, 7);
            const exportId = `${timestamp}_${randomSuffix}`;
            
            let filename, contentType, exportData;
            
            // Format the export based on requested format
            switch (input.format) {
              case 'PDF':
                // Generate PDF
                filename = `insights_${exportId}.pdf`;
                contentType = 'application/pdf';
                exportData = await generatePdfExport(insights, input);
                break;
                
              case 'CSV':
                // Generate CSV
                filename = `insights_${exportId}.csv`;
                contentType = 'text/csv';
                exportData = generateCsvExport(insights, input);
                break;
                
              case 'EXCEL':
                // Generate Excel
                filename = `insights_${exportId}.xlsx`;
                contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                exportData = await generateExcelExport(insights, input);
                break;
                
              case 'JSON':
                // Generate JSON
                filename = `insights_${exportId}.json`;
                contentType = 'application/json';
                exportData = JSON.stringify(insights, null, 2);
                break;
                
              default:
                throw new Error(`Unsupported export format: ${input.format}`);
            }
            
            // Store the export data
            const storageKey = `exports/${context.user.id}/${filename}`;
            await context.storageProvider.putObject(storageKey, exportData, {
              contentType,
              metadata: {
                userId: context.user.id,
                exportType: 'insights',
                factors: input.factors.join(','),
                timestamp: new Date().toISOString(),
                sport: input.sport || 'all',
                league: input.league || 'all'
              }
            });
            
            // Calculate expiration (24 hours)
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            
            // Generate HMAC for secure URL
            const hmacKey = process.env.EXPORT_HMAC_SECRET || 'default-hmac-key';
            const hmac = crypto.createHmac('sha256', hmacKey)
              .update(`${context.user.id}:${storageKey}:${expiresAt.getTime()}`)
              .digest('hex');
            
            // Generate secure download URL
            const downloadUrl = `/api/download/${storageKey}?expires=${expiresAt.getTime()}&signature=${hmac}`;
            
            // Log export for analytics
            context.analytics.trackEvent('data_export', {
              format: input.format,
              user_id: context.user.id,
              export_id: exportId,
              factor_count: input.factors.length,
              insight_count: insights.length,
              sport: input.sport,
              league: input.league
            });
            
            return {
              url: downloadUrl,
              expiresAt,
              contentType,
              filename,
              metadata: {
                insightCount: insights.length,
                factorCount: input.factors.length,
                exportId,
                format: input.format
              }
            };
          } catch (error) {
            logger.error(`Error exporting insights: ${error.message}`);
            throw error;
          }
        },
        systemHealth: async (_, args, context) => {
          try {
            // Authorization check - require admin for detailed health info
            const isAdmin = context.user && hasPermission(context.user, 'ADMIN');
            
            // Get system uptime
            const uptime = process.uptime();
            
            // Get version info
            const version = packageJson.version;
            
            // Check components health
            const components = [];
            
            // Database health check
            try {
              const dbStartTime = performance.now();
              const dbInfo = await context.engine.mongoConnection.db.admin().serverStatus();
              const dbLatency = performance.now() - dbStartTime;
              
              components.push({
                name: 'MongoDB',
                status: 'HEALTHY',
                latency: dbLatency,
                message: isAdmin ? `Connected to ${dbInfo.host}` : null
              });
            } catch (dbError) {
              components.push({
                name: 'MongoDB',
                status: 'UNHEALTHY',
                message: isAdmin ? dbError.message : 'Database connection issue'
              });
            }
            
            // Redis health check
            try {
              const redisStartTime = performance.now();
              await context.engine.redisClient.ping();
              const redisLatency = performance.now() - redisStartTime;
              
              components.push({
                name: 'Redis',
                status: 'HEALTHY',
                latency: redisLatency,
                message: null
              });
            } catch (redisError) {
              components.push({
                name: 'Redis',
                status: 'UNHEALTHY',
                message: isAdmin ? redisError.message : 'Cache service issue'
              });
            }
            
            // ML Models health check
            const mlStatus = context.engine.transformerModel ? 'HEALTHY' : 'DEGRADED';
            components.push({
              name: 'ML Models',
              status: mlStatus,
              message: mlStatus === 'DEGRADED' ? 'Some models may not be loaded' : null
            });
            
            // Circuit breaker status
            const circuitBreakerStatusList = Object.entries(circuitBreakers).map(([name, breaker]) => {
              return {
                name,
                state: breaker.status.state,
                failures: breaker.status.stats.failures,
                successful: breaker.status.stats.successful,
                rejected: breaker.status.stats.rejected,
                timeout: breaker.status.stats.timeouts,
                lastFailure: breaker.status.lastFailure ? new Date(breaker.status.lastFailure) : null
              };
            });
            
            // Determine overall system status
            let overallStatus = 'HEALTHY';
            const unhealthyComponents = components.filter(c => c.status === 'UNHEALTHY');
            const degradedComponents = components.filter(c => c.status === 'DEGRADED');
            
            if (unhealthyComponents.length > 0) {
              overallStatus = 'UNHEALTHY';
            } else if (degradedComponents.length > 0) {
              overallStatus = 'DEGRADED';
            }
            
            // Return system health information
            return {
              status: overallStatus,
              version,
              uptime,
              components,
              circuitBreakers: isAdmin ? circuitBreakerStatusList : []
            };
          } catch (error) {
            logger.error(`Error checking system health: ${error.message}`);
            
            return {
              status: 'DEGRADED',
              version: packageJson.version,
              uptime: process.uptime(),
              components: [
                {
                  name: 'Health Check',
                  status: 'DEGRADED',
                  message: 'Error checking system health'
                }
              ],
              circuitBreakers: []
            };
          }
        },
      },
      Mutation: {
        createAnalysisJob: this.createResolver(
          this.createAnalysisJob.bind(this),
          rateLimitConfig.queryCosts.createAnalysisJob
        ),
        cancelAnalysisJob: this.createResolver(
          this.cancelAnalysisJob.bind(this),
          rateLimitConfig.queryCosts.cancelAnalysisJob
        ),
        addFactorToWatchlist: this.createResolver(
          this.addFactorToWatchlist.bind(this),
          rateLimitConfig.queryCosts.addFactorToWatchlist
        ),
        removeFactorFromWatchlist: this.createResolver(
          this.removeFactorFromWatchlist.bind(this),
          rateLimitConfig.queryCosts.removeFactorFromWatchlist
        )
      },
      Subscription: {
        correlationUpdates: {
          subscribe: (_, { filter }, context) => {
            // Check permissions
            this.checkPermissions(
              context.user,
              'Subscription.correlationUpdates',
              filter?.factors,
              filter?.sport
            );
            
            // Apply rate limiting
            this.applyRateLimit(
              context.user.role,
              rateLimitConfig.queryCosts.correlationUpdates
            );
            
            // Subscribe to correlation updates
            return this.redisPubSub.asyncIterator(['CORRELATION_UPDATES']);
          }
        },
        anomalyDetected: {
          subscribe: (_, { filter }, context) => {
            // Check permissions
            this.checkPermissions(
              context.user,
              'Subscription.anomalyDetected',
              filter?.factors,
              filter?.sport
            );
            
            // Apply rate limiting
            this.applyRateLimit(
              context.user.role,
              rateLimitConfig.queryCosts.anomalyDetected
            );
            
            // Subscribe to anomaly events
            return this.redisPubSub.asyncIterator(['ANOMALY_DETECTED']);
          }
        },
        analysisJobProgress: {
          subscribe: (_, { jobId }, context) => {
            // Check permissions
            this.checkPermissions(
              context.user,
              'Subscription.analysisJobProgress'
            );
            
            // Apply rate limiting
            this.applyRateLimit(
              context.user.role,
              rateLimitConfig.queryCosts.analysisJobProgress
            );
            
            // Subscribe to job progress updates for this job
            return this.redisPubSub.asyncIterator([`JOB_PROGRESS:${jobId}`]);
          }
        }
      },
      // Custom scalar resolvers
      DateTime: {
        serialize(value) {
          return value instanceof Date ? value.toISOString() : value;
        },
        parseValue(value) {
          return new Date(value);
        },
        parseLiteral(ast) {
          if (ast.kind === 'StringValue') {
            return new Date(ast.value);
          }
          return null;
        }
      },
      JSON: {
        serialize(value) {
          return value;
        },
        parseValue(value) {
          return value;
        },
        parseLiteral(ast) {
          switch (ast.kind) {
            case 'StringValue':
              return JSON.parse(ast.value);
            case 'ObjectValue':
              const value = {};
              ast.fields.forEach(field => {
                value[field.name.value] = this.parseLiteral(field.value);
              });
              return value;
            case 'IntValue':
              return parseInt(ast.value, 10);
            case 'FloatValue':
              return parseFloat(ast.value);
            case 'BooleanValue':
              return ast.value;
            case 'NullValue':
              return null;
            default:
              return null;
          }
        }
      }
    };
    
    // Create executable schema
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers
    });
    
    // Create Apollo Server
    this.apolloServer = new ApolloServer({
      schema,
      context: async ({ req, connection }) => {
        // For subscriptions
        if (connection) {
          return connection.context;
        }
        
        // For queries and mutations
        const token = req.headers.authorization?.split(' ')[1] || '';
        let user = { role: 'FAN_BASIC' }; // Default role
        
        try {
          if (token) {
            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            user = {
              id: decoded.id,
              role: decoded.role,
              teams: decoded.teams || [],
              leagues: decoded.leagues || []
            };
          }
        } catch (error) {
          logger.warn(`Invalid auth token: ${error.message}`);
        }
        
        return {
          user,
          loaders: {
            factorCorrelation: this.factorCorrelationLoader,
            factorDetails: this.factorDetailsLoader,
            factorHistory: this.factorHistoryLoader
          },
          startTime: performance.now()
        };
      },
      validationRules: [
        createComplexityLimitRule(1000, {
          scalarCost: 1,
          objectCost: 2,
          listFactor: 10,
          introspectionListFactor: 0
        })
      ],
      formatError: (error) => {
        logger.error(`GraphQL Error: ${error.message}`, error);
        
        // Don't expose internal errors to clients
        if (error.extensions?.code === 'INTERNAL_SERVER_ERROR') {
          return {
            message: 'An internal error occurred',
            extensions: {
              code: 'INTERNAL_SERVER_ERROR'
            }
          };
        }
        
        return error;
      },
      plugins: [{
        requestDidStart: () => ({
          willSendResponse: ({ context }) => {
            if (context.startTime) {
              const duration = performance.now() - context.startTime;
              this.recordQueryAnalytics(context.operationName, duration);
            }
          }
        })
      }]
    });
    
    // Apply Apollo Server middleware to Express app
    this.apolloServer.applyMiddleware({ app: this.app });
    
    // Set up file uploads
    this.app.use(graphqlUploadExpress({
      maxFileSize: 10000000, // 10 MB
      maxFiles: 10
    }));
    
    // Set up subscription server
    this.subscriptionServer = SubscriptionServer.create(
      {
        schema,
        execute,
        subscribe,
        onConnect: async (connectionParams) => {
          // Authenticate subscription connection
          const token = connectionParams.authorization?.split(' ')[1] || '';
          let user = { role: 'FAN_BASIC' }; // Default role
          
          try {
            if (token) {
              // Verify JWT token
              const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
              user = {
                id: decoded.id,
                role: decoded.role,
                teams: decoded.teams || [],
                leagues: decoded.leagues || []
              };
            }
          } catch (error) {
            logger.warn(`Invalid subscription auth token: ${error.message}`);
          }
          
          return {
            user,
            loaders: {
              factorCorrelation: this.factorCorrelationLoader,
              factorDetails: this.factorDetailsLoader,
              factorHistory: this.factorHistoryLoader
            }
          };
        }
      },
      {
        server: this.httpServer,
        path: this.apolloServer.graphqlPath
      }
    );
  }
  
  /**
   * Set up anomaly detection subscription
   * @private
   */
  setupAnomalyDetection() {
    // Subscribe to anomaly detection events
    this.engine.on('anomalyDetected', (anomaly) => {
      // Publish to Redis for GraphQL subscriptions
      this.redisPubSub.publish('ANOMALY_DETECTED', {
        anomalyDetected: {
          id: uuidv4(),
          factorA: anomaly.factorA,
          factorB: anomaly.factorB,
          previousCorrelation: anomaly.previousCorrelation,
          currentCorrelation: anomaly.currentCorrelation,
          significance: anomaly.significance,
          timestamp: new Date(),
          sport: anomaly.sport || 'ALL',
          league: anomaly.league || 'ALL',
          description: `Significant change detected between "${anomaly.factorA}" and "${anomaly.factorB}"`
        }
      });
      
      // Invalidate relevant caches
      this.invalidateRelatedCaches(anomaly.factorA);
      this.invalidateRelatedCaches(anomaly.factorB);
    });
    
    // Subscribe to correlation updates
    this.engine.on('correlationUpdated', (update) => {
      // Publish to Redis for GraphQL subscriptions
      this.redisPubSub.publish('CORRELATION_UPDATES', {
        correlationUpdates: {
          factorA: update.factorA,
          factorB: update.factorB,
          oldCorrelation: update.oldValue,
          newCorrelation: update.newValue,
          changePercent: ((update.newValue - update.oldValue) / Math.abs(update.oldValue)) * 100,
          timestamp: new Date(),
          sport: update.sport || 'ALL',
          league: update.league || 'ALL'
        }
      });
      
      // Invalidate relevant caches
      this.invalidateRelatedCaches(update.factorA);
      this.invalidateRelatedCaches(update.factorB);
    });
  }
  
  /**
   * Set up predictive prefetching
   * @private
   */
  setupPredictivePrefetching() {
    // Maintain a graph of query patterns
    this.queryPatternGraph = {};
    
    // Listen for query completions
    this.on('queryCompleted', ({ operationName, args }) => {
      // Record this query in the pattern graph
      const queryKey = `${operationName}:${JSON.stringify(args)}`;
      
      // Periodically clean up the prefetch queue and execute prefetches
      setInterval(() => {
        this.processPrefetchQueue();
      }, 5000); // Every 5 seconds
    });
  }
  
  /**
   * Process the queue of predictive prefetches
   * @private
   */
  async processPrefetchQueue() {
    // Get the highest probability prefetches
    const prefetchQueue = this.getPrefetchCandidates();
    
    // Execute prefetches with lowest load
    for (const prefetch of prefetchQueue.slice(0, 5)) {
      try {
        const { operationName, args } = prefetch;
        const cacheKey = `${operationName}:${JSON.stringify(args)}`;
        
        // Skip if already cached
        if (this.cache.has(cacheKey)) {
          continue;
        }
        
        // Call the resolver function
        const resolverFunction = this.resolvers[operationName];
        if (resolverFunction) {
          const result = await resolverFunction(null, args, { user: { role: 'SYSTEM' } });
          
          // Cache the result
          this.cache.set(cacheKey, result, cacheConfig.customTTLs[operationName] || cacheConfig.defaultTTL);
          
          logger.debug(`Prefetched ${operationName}`);
        }
      } catch (error) {
        logger.error(`Error in prefetch for ${prefetch.operationName}: ${error.message}`);
      }
    }
  }
  
  /**
   * Get candidates for prefetching based on query patterns
   * @private
   * @returns {Array<Object>} Prefetch candidates
   */
  getPrefetchCandidates() {
    const candidates = [];
    
    // Analyze query pattern graph
    for (const [queryKey, nextQueries] of Object.entries(this.queryPatternGraph)) {
      for (const [nextQueryKey, count] of Object.entries(nextQueries)) {
        // Calculate probability based on count and recency
        const probability = count.count / count.total;
        
        // Only consider high probability transitions
        if (probability > 0.6) {
          const [operationName, argsStr] = nextQueryKey.split(':');
          candidates.push({
            operationName,
            args: JSON.parse(argsStr),
            probability,
            recency: Date.now() - count.lastSeen
          });
        }
      }
    }
    
    // Sort by probability and recency
    return candidates.sort((a, b) => {
      // Weight: 70% probability, 30% recency
      const scoreA = (a.probability * 0.7) + (1 / (a.recency + 1) * 0.3);
      const scoreB = (b.probability * 0.7) + (1 / (b.recency + 1) * 0.3);
      return scoreB - scoreA;
    });
  }
  
  /**
   * Create a resolver function with rate limiting, permission checking, and caching
   * @private
   * @param {Function} resolverFn The resolver function
   * @param {number} cost The cost of the query
   * @param {number} [cacheTTL] Optional cache TTL
   * @returns {Function} Wrapped resolver
   */
  createResolver(resolverFn, cost, cacheTTL) {
    return async (parent, args, context, info) => {
      const startTime = performance.now();
      
      try {
        // Extract operation name
        const operationName = info.fieldName;
        
        // Check if user has permission for this operation
        this.checkPermissions(
          context.user,
          `${info.parentType}.${operationName}`,
          this.extractFactors(args),
          this.extractLeague(args)
        );
        
        // Apply rate limiting
        if (context.user.role !== 'SYSTEM') {
          this.applyRateLimit(context.user.role, cost);
        }
        
        // Check cache if cacheTTL is provided
        if (cacheTTL !== undefined && context.user.role !== 'SYSTEM') {
          const cacheKey = `${operationName}:${JSON.stringify(args)}:${context.user.role}`;
          const cachedResult = this.cache.get(cacheKey);
          
          if (cachedResult) {
            // Record cache hit in analytics
            this.recordCacheHit(operationName);
            return cachedResult;
          }
        }
        
        // Execute the resolver
        const result = await resolverFn(parent, args, context, info);
        
        // Cache the result if cacheTTL is provided
        if (cacheTTL !== undefined && context.user.role !== 'SYSTEM') {
          const cacheKey = `${operationName}:${JSON.stringify(args)}:${context.user.role}`;
          this.cache.set(cacheKey, result, cacheTTL);
          
          // Record cache miss in analytics
          this.recordCacheMiss(operationName);
        }
        
        // Record query completion for prefetching
        if (context.user.role !== 'SYSTEM') {
          this.emit('queryCompleted', {
            operationName,
            args
          });
        }
        
        // Return the result
        return result;
      } catch (error) {
        // Log the error
        logger.error(`Error in resolver ${info.fieldName}: ${error.message}`, error);
        
        // Rethrow the error
        throw error;
      } finally {
        // Record query analytics
        const duration = performance.now() - startTime;
        this.recordQueryAnalytics(info.fieldName, duration);
      }
    };
  }
  
  /**
   * Extract factors from query arguments
   * @private
   * @param {Object} args Query arguments
   * @returns {Array<string>} Array of factors
   */
  extractFactors(args) {
    const factors = [];
    
    // Recursive function to extract factors
    const extract = (obj) => {
      if (!obj) return;
      
      if (typeof obj === 'object') {
        if (obj.factor) {
          factors.push(obj.factor);
        }
        
        if (obj.factors) {
          obj.factors.forEach(f => factors.push(f.factor || f));
        }
        
        if (obj.factorsToAnalyze) {
          obj.factorsToAnalyze.forEach(f => factors.push(f));
        }
        
        if (obj.factorA && obj.factorB) {
          factors.push(obj.factorA, obj.factorB);
        }
        
        // Recursively process nested objects
        Object.values(obj).forEach(val => {
          if (typeof val === 'object' && val !== null) {
            extract(val);
          }
        });
      }
    };
    
    // Start extraction
    extract(args);
    
    return [...new Set(factors)]; // Remove duplicates
  }
  
  /**
   * Extract league from query arguments
   * @private
   * @param {Object} args Query arguments
   * @returns {string|null} League
   */
  extractLeague(args) {
    // Recursive function to extract league
    const extract = (obj) => {
      if (!obj) return null;
      
      if (obj.league) {
        return obj.league;
      }
      
      if (obj.input && obj.input.league) {
        return obj.input.league;
      }
      
      for (const val of Object.values(obj)) {
        if (typeof val === 'object' && val !== null) {
          const result = extract(val);
          if (result) return result;
        }
      }
      
      return null;
    };
    
    return extract(args);
  }
  
  /**
   * Check if user has permission for an operation
   * @private
   * @param {Object} user User object
   * @param {string} operation Operation name
   * @param {Array<string>} [factors] Optional factors
   * @param {string} [league] Optional league
   * @throws {Error} If user doesn't have permission
   */
  checkPermissions(user, operation, factors = [], league = null) {
    // Skip check for system queries
    if (user.role === 'SYSTEM') {
      return true;
    }
    
    // Check field-level permissions
    const [parent, field] = operation.split('.');
    const allowedRoles = accessControlPolicy.fields[parent]?.[field] || [];
    
    if (!allowedRoles.includes(user.role)) {
      throw new Error(`Access denied: You don't have permission to perform this operation`);
    }
    
    // Check entity-level permissions for factors
    if (factors.length > 0) {
      for (const factor of factors) {
        // Check restricted factors
        for (const restriction of accessControlPolicy.entities.restrictedFactors) {
          if (restriction.pattern.test(factor) && !restriction.roles.includes(user.role)) {
            throw new Error(`Access denied: You don't have permission to access the factor "${factor}"`);
          }
        }
      }
    }
    
    // Check league-specific restrictions
    if (league && league !== 'ALL') {
      const allowedLeagueRoles = accessControlPolicy.entities.leagueAccess[league] || [];
      if (!allowedLeagueRoles.includes(user.role)) {
        throw new Error(`Access denied: You don't have permission to access data for ${league}`);
      }
    }
    
    return true;
  }
  
  /**
   * Apply rate limiting to a request
   * @private
   * @param {string} role User role
   * @param {number} cost Query cost
   * @throws {Error} If rate limit is exceeded
   */
  applyRateLimit(role, cost) {
    // Get the token bucket for this role
    const bucket = this.tokenBuckets[role];
    if (!bucket) {
      throw new Error(`Unknown user role: ${role}`);
    }
    
    // Try to consume tokens
    if (!bucket.consume(cost)) {
      throw new Error(`Rate limit exceeded. Please try again later.`);
    }
  }
  
  /**
   * Record query analytics
   * @private
   * @param {string} operationName Operation name
   * @param {number} duration Duration in milliseconds
   */
  recordQueryAnalytics(operationName, duration) {
    // Initialize query stats if not exists
    if (!this.queryAnalytics.queries[operationName]) {
      this.queryAnalytics.queries[operationName] = {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        cacheHits: 0,
        cacheMisses: 0,
        lastExecuted: Date.now()
      };
    }
    
    // Update stats
    const stats = this.queryAnalytics.queries[operationName];
    stats.count++;
    stats.totalDuration += duration;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.durations.push(duration);
    stats.lastExecuted = Date.now();
    
    // Keep only last 100 durations
    if (stats.durations.length > 100) {
      stats.durations.shift();
    }
    
    // Clean up analytics periodically (once per hour)
    const hourMs = 60 * 60 * 1000;
    if (Date.now() - this.queryAnalytics.lastCleanup > hourMs) {
      this.cleanupQueryAnalytics();
    }
  }
  
  /**
   * Record cache hit in analytics
   * @private
   * @param {string} operationName Operation name
   */
  recordCacheHit(operationName) {
    if (this.queryAnalytics.queries[operationName]) {
      this.queryAnalytics.queries[operationName].cacheHits++;
    }
  }
  
  /**
   * Record cache miss in analytics
   * @private
   * @param {string} operationName Operation name
   */
  recordCacheMiss(operationName) {
    if (this.queryAnalytics.queries[operationName]) {
      this.queryAnalytics.queries[operationName].cacheMisses++;
    }
  }
  
  /**
   * Clean up old query analytics
   * @private
   */
  cleanupQueryAnalytics() {
    // Remove queries not executed in the last day
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    Object.keys(this.queryAnalytics.queries).forEach(key => {
      if (now - this.queryAnalytics.queries[key].lastExecuted > dayMs) {
        delete this.queryAnalytics.queries[key];
      }
    });
    
    this.queryAnalytics.lastCleanup = now;
  }
  
  /**
   * Invalidate caches related to specific factors
   * @private
   * @param {string} factor Factor name
   */
  invalidateRelatedCaches(factor) {
    // Get all cache keys
    const keys = this.cache.keys();
    
    // Find and delete keys related to this factor
    for (const key of keys) {
      if (key.includes(factor)) {
        this.cache.del(key);
      }
    }
    
    // Clear dataloader cache for this factor
    this.factorCorrelationLoader.clearAll();
    this.factorDetailsLoader.clear(factor);
  }
  
  /**
   * Initialize the API
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.initialized) {
      // Initialize the core engine
      await this.engine.initialize();
      
      // Start the HTTP server
      const port = process.env.PORT || 4000;
      this.httpServer.listen(port, () => {
        logger.info(`AdvancedCorrelationAPI server running at http://localhost:${port}${this.apolloServer.graphqlPath}`);
      });
      
      this.initialized = true;
    }
  }
  
  /**
   * Calculate joint probability for multiple factors
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @param {Object} context Request context
   * @returns {Promise<Object>} Joint probability result with insights
   */
  async getJointProbability(_, { input }, context) {
    try {
      // Calculate multi-factor probability
      const result = await this.engine.calculateMultiFactorProbability(input.factors, {
        sport: input.sport,
        league: input.league
      });
      
      // Get explainable insights if requested
      if (input.includeInsights !== false) {
        const factorsList = input.factors.map(f => f.factor);
        
        // Use dataloader to batch factor detail requests
        const factorDetails = await Promise.all(
          factorsList.map(f => context.loaders.factorDetails.load(f))
        );
        
        // Get insights based on factor details
        const insights = await this.engine.getExplainableInsights(factorsList, {
          sport: input.sport,
          league: input.league,
          factorDetails
        });
        
        result.insights = insights;
      }
      
      // Add timestamp
      result.timestamp = new Date();
      
      return result;
    } catch (error) {
      logger.error(`Error calculating joint probability: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find factors that influence the given factor
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @param {Object} context Request context
   * @returns {Promise<Object>} Influential factors with causal relationships
   */
  async findInfluentialFactors(_, { input }, context) {
    try {
      const relatedFactors = await this.engine.discoverRelatedFactors(input.factor, {
        minCorrelation: input.minCorrelation || 0.3,
        limit: input.limit || 20,
        sport: input.sport,
        league: input.league
      });
      
      // Separate factors into causes, effects, and correlates
      const causes = relatedFactors.filter(f => f.causes === true);
      const bidirectional = relatedFactors.filter(f => f.bidirectional === true);
      const correlatesOnly = relatedFactors.filter(f => !f.causes && !f.bidirectional);
      
      return {
        factor: input.factor,
        causes: causes.sort((a, b) => b.correlation - a.correlation),
        bidirectional: bidirectional.sort((a, b) => b.correlation - a.correlation),
        correlates: correlatesOnly.sort((a, b) => b.correlation - a.correlation),
        sport: input.sport || 'ALL',
        league: input.league || 'ALL',
        totalFactorsAnalyzed: relatedFactors.length
      };
    } catch (error) {
      logger.error(`Error finding influential factors: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Discover factor clusters (groups of related factors)
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<Array<Object>>} Discovered factor clusters
   */
  async discoverFactorGroups(_, { input }) {
    try {
      // Check if we have cached clusters
      const sport = input.sport || 'ALL';
      const league = input.league || 'ALL';
      const clusterKey = `correlation:clusters:${sport}:${league}`;
      
      let clusters = null;
      
      // Try to get from cache
      const cachedClusters = await this.redisClient.get(clusterKey);
      if (cachedClusters) {
        const parsed = JSON.parse(cachedClusters);
        
        // Return cached results if fresh enough
        const cacheAge = Date.now() - new Date(parsed.timestamp).getTime();
        if (cacheAge < 24 * 60 * 60 * 1000) { // 24 hours
          clusters = parsed.clusters;
        }
      }
      
      // If no cache, discover clusters
      if (!clusters) {
        clusters = await this.engine.discoverFactorClusters({
          minCorrelation: input.minCorrelation || 0.5,
          sport,
          league
        });
        
        // Add IDs to clusters
        clusters = clusters.map(cluster => ({
          ...cluster,
          id: uuidv4()
        }));
        
        // Cache results for future use
        if (clusters.length > 0) {
          await this.redisClient.set(
            clusterKey,
            JSON.stringify({
              clusters,
              timestamp: new Date().toISOString(),
              sport,
              league
            }),
            { EX: 60 * 60 * 24 * 7 } // 7 days
          );
        }
      }
      
      return clusters;
    } catch (error) {
      logger.error(`Error discovering factor groups: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get anomalous correlation shifts detected in the system
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<Array<Object>>} Detected anomalies
   */
  async getAnomalousShifts(_, { input }) {
    try {
      const anomalies = [];
      
      // Get all entries from anomaly registry
      for (const [key, record] of this.engine.anomalyRegistry.entries()) {
        if (record.anomalyDetected) {
          // Parse the key to get factors and metadata
          const keyParts = key.split(':');
          
          // Format: sport:league:factorA:factorB
          const sport = keyParts[0];
          const league = keyParts[1];
          const factorA = keyParts[2];
          const factorB = keyParts[3];
          
          // Apply filters
          if (input.sport && sport !== input.sport && sport !== 'ALL') continue;
          if (input.league && league !== input.league && league !== 'ALL') continue;
          
          // Get the latest correlation
          let currentCorrelation;
          try {
            const correlationKey = `${factorA}:${factorB}:${sport}:${league}`;
            currentCorrelation = await this.factorCorrelationLoader.load(correlationKey);
          } catch (err) {
            currentCorrelation = 0;
          }
          
          // Add to results
          anomalies.push({
            id: uuidv4(),
            factorA,
            factorB,
            sport,
            league,
            detectedAt: record.anomalyTimestamp,
            previousCorrelation: record.previousCorrelation,
            currentCorrelation: currentCorrelation || record.currentCorrelation,
            significance: record.significance || 0.95,
            history: record.history.map(point => ({
              timestamp: new Date(point.timestamp),
              correlation: point.correlation,
              confidence: point.confidence || 0.9
            }))
          });
        }
      }
      
      // Sort by detection time (most recent first)
      anomalies.sort((a, b) => 
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
      );
      
      // Apply limit if provided
      if (input.limit && input.limit > 0) {
        return anomalies.slice(0, input.limit);
      }
      
      return anomalies;
    } catch (error) {
      logger.error(`Error getting anomalous shifts: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate an analysis report with key insights
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<Object>} Analysis report
   */
  async generateInsightReport(_, { input }) {
    try {
      const reportId = uuidv4();
      
      const report = {
        id: reportId,
        timestamp: new Date(),
        sport: input.sport || 'ALL',
        league: input.league || 'ALL',
        insights: []
      };
      
      // 1. Get strongest correlations
      const strongestCorrelations = await this.getStrongestCorrelations(_, {
        input: {
          sport: input.sport,
          league: input.league,
          limit: 20,
          minConfidence: 0.7
        }
      });
      
      if (strongestCorrelations.positive.length > 0) {
        report.insights.push({
          type: 'STRONGEST_POSITIVE_CORRELATIONS',
          title: 'Strongest Positive Relationships',
          description: 'These factors show the strongest positive associations in the data',
          correlations: strongestCorrelations.positive.slice(0, 5)
        });
      }
      
      if (strongestCorrelations.negative.length > 0) {
        report.insights.push({
          type: 'STRONGEST_NEGATIVE_CORRELATIONS',
          title: 'Strongest Negative Relationships',
          description: 'These factors show the strongest negative associations in the data',
          correlations: strongestCorrelations.negative.slice(0, 5)
        });
      }
      
      // 2. Get recent anomalies
      const anomalies = await this.getAnomalousShifts(_, {
        input: {
          sport: input.sport,
          league: input.league,
          limit: 5
        }
      });
      
      if (anomalies.length > 0) {
        report.insights.push({
          type: 'RECENT_ANOMALIES',
          title: 'Recently Detected Relationship Changes',
          description: 'These factor relationships have shown significant recent changes',
          anomalies: anomalies.map(a => ({
            factorA: a.factorA,
            factorB: a.factorB,
            detectedAt: a.detectedAt,
            description: `The relationship between "${a.factorA}" and "${a.factorB}" has changed significantly from ${a.previousCorrelation.toFixed(2)} to ${a.currentCorrelation.toFixed(2)}`
          }))
        });
      }
      
      // 3. Get factor clusters
      const clusters = await this.discoverFactorGroups(_, {
        input: {
          sport: input.sport,
          league: input.league,
          minCorrelation: 0.6
        }
      });
      
      if (clusters.length > 0) {
        report.insights.push({
          type: 'FACTOR_CLUSTERS',
          title: 'Factor Relationship Groups',
          description: 'These groups of related factors tend to move together',
          clusters: clusters.slice(0, 3).map(c => ({
            theme: c.theme,
            size: c.size,
            centralFactor: c.centralFactor,
            topFactors: c.factors.slice(0, 5).map(f => f.factor)
          }))
        });
      }
      
      // 4. Get emerging trends (time-based analysis)
      const trendingFactors = await this.engine.analyzeTrendingFactors({
        sport: input.sport,
        league: input.league,
        timeframe: input.timeframe || 'LAST_MONTH'
      });
      
      if (trendingFactors.length > 0) {
        report.insights.push({
          type: 'EMERGING_TRENDS',
          title: 'Emerging Trends',
          description: 'These factors show significant changes in their importance or relationships',
          correlations: trendingFactors.slice(0, 5).map(tf => ({
            factorA: tf.factor,
            factorB: tf.relatedTo,
            correlation: tf.currentCorrelation,
            confidence: tf.confidence,
            description: tf.description
          }))
        });
      }
      
      // 5. Get predictive insights
      const predictions = await this.engine.generatePredictiveInsights({
        sport: input.sport,
        league: input.league
      });
      
      if (predictions.length > 0) {
        report.insights.push({
          type: 'PREDICTIVE_INSIGHTS',
          title: 'Predictive Insights',
          description: 'These insights represent potential future developments based on current data',
          prediction: {
            subject: predictions[0].subject,
            prediction: predictions[0].prediction,
            confidence: predictions[0].confidence,
            reasoning: predictions[0].reasoning
          }
        });
      }
      
      return report;
    } catch (error) {
      logger.error(`Error generating insight report: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the strongest correlations in the system
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<Object>} Strongest positive and negative correlations
   */
  async getStrongestCorrelations(_, { input }) {
    try {
      // Query for positive correlations
      const positiveCorrelations = await this.engine.CorrelationModel.find({
        correlation_coefficient: { $gt: 0.5 },
        confidence: { $gt: input.minConfidence || 0.6 },
        ...(input.sport && input.sport !== 'ALL' ? { sport: input.sport } : {}),
        ...(input.league && input.league !== 'ALL' ? { league: input.league } : {})
      })
      .sort({ correlation_coefficient: -1 })
      .limit(input.limit || 10);
      
      // Query for negative correlations
      const negativeCorrelations = await this.engine.CorrelationModel.find({
        correlation_coefficient: { $lt: -0.5 },
        confidence: { $gt: input.minConfidence || 0.6 },
        ...(input.sport && input.sport !== 'ALL' ? { sport: input.sport } : {}),
        ...(input.league && input.league !== 'ALL' ? { league: input.league } : {})
      })
      .sort({ correlation_coefficient: 1 })
      .limit(input.limit || 10);
      
      // Format results
      return {
        positive: positiveCorrelations.map(c => ({
          factorA: c.factor_a,
          factorB: c.factor_b,
          correlation: c.correlation_coefficient,
          confidence: c.confidence,
          description: `Strong positive relationship between ${c.factor_a} and ${c.factor_b} (correlation: ${c.correlation_coefficient.toFixed(2)})`
        })),
        
        negative: negativeCorrelations.map(c => ({
          factorA: c.factor_a,
          factorB: c.factor_b,
          correlation: c.correlation_coefficient,
          confidence: c.confidence,
          description: `Strong negative relationship between ${c.factor_a} and ${c.factor_b} (correlation: ${c.correlation_coefficient.toFixed(2)})`
        }))
      };
    } catch (error) {
      logger.error(`Error getting strongest correlations: ${error.message}`);
      return { positive: [], negative: [] };
    }
  }
  
  /**
   * Analyze "what if" scenarios by changing factor probabilities
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<Object>} Counterfactual analysis
   */
  async analyzeWhatIfScenario(_, { input }) {
    try {
      // Get the base probability
      const baseProbability = await this.engine.calculateMultiFactorProbability(
        input.baseFactors, 
        {
          sport: input.sport,
          league: input.league
        }
      );
      
      // Apply changes one by one to track individual impacts
      const factorImpacts = [];
      let cumulativeProbability = baseProbability.probability;
      
      for (const change of input.changes) {
        // Find the original factor
        const originalFactor = input.baseFactors.find(f => f.factor === change.factor);
        if (!originalFactor) continue;
        
        // Apply just this change
        const singleChangeFactors = [...input.baseFactors];
        const factorIndex = singleChangeFactors.findIndex(f => f.factor === change.factor);
        
        if (factorIndex >= 0) {
          singleChangeFactors[factorIndex] = {
            ...singleChangeFactors[factorIndex],
            probability: change.newProbability,
            value: change.newValue
          };
        }
        
        // Calculate the new probability with just this change
        const singleChangeProbability = await this.engine.calculateMultiFactorProbability(
          singleChangeFactors,
          {
            sport: input.sport,
            league: input.league
          }
        );
        
        // Record the impact
        factorImpacts.push({
          factor: change.factor,
          originalValue: originalFactor.probability || originalFactor.value,
          newValue: change.newProbability || change.newValue,
          impact: singleChangeProbability.probability - baseProbability.probability
        });
        
        // Update the cumulative probability (all changes so far)
        cumulativeProbability = singleChangeProbability.probability;
      }
      
      // Calculate final probability with all changes
      const changedFactors = [...input.baseFactors];
      
      for (const change of input.changes) {
        const factorIndex = changedFactors.findIndex(f => f.factor === change.factor);
        
        if (factorIndex >= 0) {
          changedFactors[factorIndex] = {
            ...changedFactors[factorIndex],
            probability: change.newProbability,
            value: change.newValue
          };
        }
      }
      
      const newProbability = await this.engine.calculateMultiFactorProbability(
        changedFactors,
        {
          sport: input.sport,
          league: input.league
        }
      );
      
      // Sort factors by impact magnitude (descending)
      factorImpacts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
      
      return {
        originalProbability: baseProbability.probability,
        newProbability: newProbability.probability,
        change: newProbability.probability - baseProbability.probability,
        significantFactors: factorImpacts,
        confidence: newProbability.confidence
      };
    } catch (error) {
      logger.error(`Error analyzing what-if scenario: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a custom correlation analysis job
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<Object>} Created job
   */
  async createAnalysisJob(_, { input }) {
    try {
      // Create job ID
      const jobId = uuidv4();
      
      // Create job record
      const job = {
        id: jobId,
        name: input.name,
        description: input.description || '',
        status: 'PENDING',
        progress: 0,
        createdAt: new Date(),
        sport: input.sport || 'ALL',
        league: input.league || 'ALL',
        factorsToAnalyze: input.factorsToAnalyze,
        analysisType: input.analysisType,
        priority: input.priority || 'NORMAL',
        notifyOnComplete: input.notifyOnComplete || false
      };
      
      // Store job in Redis
      await this.redisClient.set(
        `jobs:${jobId}`,
        JSON.stringify(job),
        { EX: 60 * 60 * 24 * 7 } // 7 days
      );
      
      // Add to queue for processing
      await this.redisClient.zadd(
        'jobs:queue',
        this.getPriorityScore(job.priority),
        jobId
      );
      
      // Start processing (in real implementation, this would be done by a worker)
      setTimeout(() => this.processAnalysisJob(jobId), 100);
      
      return job;
    } catch (error) {
      logger.error(`Error creating analysis job: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Cancel a running analysis job
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<boolean>} Success status
   */
  async cancelAnalysisJob(_, { id }) {
    try {
      // Get job from Redis
      const jobJson = await this.redisClient.get(`jobs:${id}`);
      if (!jobJson) {
        throw new Error(`Job not found: ${id}`);
      }
      
      const job = JSON.parse(jobJson);
      
      // Check if job can be cancelled
      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        return false;
      }
      
      // Update job status
      job.status = 'CANCELLED';
      
      // Save updated job
      await this.redisClient.set(
        `jobs:${id}`,
        JSON.stringify(job),
        { EX: 60 * 60 * 24 * 7 } // 7 days
      );
      
      // Remove from queue
      await this.redisClient.zrem('jobs:queue', id);
      
      // Notify subscribers
      this.redisPubSub.publish(`JOB_PROGRESS:${id}`, {
        analysisJobProgress: {
          jobId: id,
          status: 'CANCELLED',
          progress: job.progress,
          currentStage: 'Job cancelled by user',
          estimatedTimeRemaining: 0,
          timestamp: new Date()
        }
      });
      
      return true;
    } catch (error) {
      logger.error(`Error cancelling analysis job: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Add a factor to the watchlist for real-time monitoring
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<Object>} Created watchlist entry
   */
  async addFactorToWatchlist(_, { input }) {
    try {
      // Create entry ID
      const entryId = uuidv4();
      
      // Create watchlist entry
      const entry = {
        id: entryId,
        factor: input.factor,
        sport: input.sport || 'ALL',
        league: input.league || 'ALL',
        alertThreshold: input.alertThreshold || 0.1,
        description: input.description || '',
        createdAt: new Date()
      };
      
      // Store in Redis
      await this.redisClient.set(
        `watchlist:${entryId}`,
        JSON.stringify(entry)
      );
      
      // Add to watchlist index
      await this.redisClient.sadd('watchlist:factors', input.factor);
      
      return entry;
    } catch (error) {
      logger.error(`Error adding factor to watchlist: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Remove a factor from the watchlist
   * @param {null} _ Parent (not used)
   * @param {Object} args Query arguments
   * @returns {Promise<boolean>} Success status
   */
  async removeFactorFromWatchlist(_, { id }) {
    try {
      // Get watchlist entry
      const entryJson = await this.redisClient.get(`watchlist:${id}`);
      if (!entryJson) {
        throw new Error(`Watchlist entry not found: ${id}`);
      }
      
      const entry = JSON.parse(entryJson);
      
      // Delete from Redis
      await this.redisClient.del(`watchlist:${id}`);
      
      // Check if this factor is still in other watchlist entries
      const allEntries = await this.getAllWatchlistEntries();
      const factorExists = allEntries.some(e => e.id !== id && e.factor === entry.factor);
      
      // If factor is no longer in any watchlist entry, remove from index
      if (!factorExists) {
        await this.redisClient.srem('watchlist:factors', entry.factor);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error removing factor from watchlist: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get all watchlist entries
   * @private
   * @returns {Promise<Array<Object>>} Watchlist entries
   */
  async getAllWatchlistEntries() {
    const keys = await this.redisClient.keys('watchlist:*');
    const entries = [];
    
    for (const key of keys) {
      if (key === 'watchlist:factors') continue;
      
      const entryJson = await this.redisClient.get(key);
      if (entryJson) {
        entries.push(JSON.parse(entryJson));
      }
    }
    
    return entries;
  }
  
  /**
   * Get priority score for job queue
   * @private
   * @param {string} priority Priority level
   * @returns {number} Priority score (lower is higher priority)
   */
  getPriorityScore(priority) {
    const now = Date.now();
    
    switch (priority) {
      case 'CRITICAL':
        return now - 1000000;
      case 'HIGH':
        return now - 100000;
      case 'NORMAL':
        return now;
      case 'LOW':
        return now + 100000;
      default:
        return now;
    }
  }
  
  /**
   * Process an analysis job
   * @private
   * @param {string} jobId Job ID
   */
  async processAnalysisJob(jobId) {
    try {
      // Get job from Redis
      const jobJson = await this.redisClient.get(`jobs:${jobId}`);
      if (!jobJson) {
        return;
      }
      
      const job = JSON.parse(jobJson);
      
      // Check if job should be processed
      if (job.status !== 'PENDING') {
        return;
      }
      
      // Update job status
      job.status = 'RUNNING';
      job.startedAt = new Date();
      job.progress = 0;
      
      // Save updated job
      await this.redisClient.set(
        `jobs:${jobId}`,
        JSON.stringify(job),
        { EX: 60 * 60 * 24 * 7 } // 7 days
      );
      
      // Notify subscribers
      this.redisPubSub.publish(`JOB_PROGRESS:${jobId}`, {
        analysisJobProgress: {
          jobId,
          status: 'RUNNING',
          progress: 0,
          currentStage: 'Initializing analysis',
          estimatedTimeRemaining: this.estimateJobDuration(job),
          timestamp: new Date()
        }
      });
      
      // Simulate job progress (in a real implementation, this would be actual analysis)
      const totalSteps = 10;
      const stepTime = 500; // ms per step
      
      for (let step = 1; step <= totalSteps; step++) {
        // Check if job was cancelled
        const currentJobJson = await this.redisClient.get(`jobs:${jobId}`);
        const currentJob = JSON.parse(currentJobJson);
        
        if (currentJob.status === 'CANCELLED') {
          break;
        }
        
        // Update progress
        const progress = Math.round((step / totalSteps) * 100);
        const currentStage = this.getJobStage(job, step, totalSteps);
        
        // Update job
        currentJob.progress = progress;
        
        // Save updated job
        await this.redisClient.set(
          `jobs:${jobId}`,
          JSON.stringify(currentJob),
          { EX: 60 * 60 * 24 * 7 } // 7 days
        );
        
        // Notify subscribers
        this.redisPubSub.publish(`JOB_PROGRESS:${jobId}`, {
          analysisJobProgress: {
            jobId,
            status: 'RUNNING',
            progress,
            currentStage,
            estimatedTimeRemaining: Math.round((totalSteps - step) * stepTime / 1000),
            timestamp: new Date()
          }
        });
        
        // Wait for next step
        await new Promise(resolve => setTimeout(resolve, stepTime));
      }
      
      // Generate job results
      const results = await this.generateJobResults(job);
      
      // Complete job
      job.status = 'COMPLETED';
      job.progress = 100;
      job.completedAt = new Date();
      job.results = results;
      
      // Save completed job
      await this.redisClient.set(
        `jobs:${jobId}`,
        JSON.stringify(job),
        { EX: 60 * 60 * 24 * 7 } // 7 days
      );
      
      // Remove from queue
      await this.redisClient.zrem('jobs:queue', jobId);
      
      // Notify subscribers
      this.redisPubSub.publish(`JOB_PROGRESS:${jobId}`, {
        analysisJobProgress: {
          jobId,
          status: 'COMPLETED',
          progress: 100,
          currentStage: 'Analysis complete',
          estimatedTimeRemaining: 0,
          timestamp: new Date()
        }
      });
      
      // Send notification if requested
      if (job.notifyOnComplete) {
        this.redisPubSub.publish('ANALYSIS_COMPLETED', {
          analysisCompleted: {
            jobId,
            name: job.name,
            timestamp: new Date()
          }
        });
      }
    } catch (error) {
      logger.error(`Error processing analysis job ${jobId}: ${error.message}`);
      
      // Update job as failed
      const jobJson = await this.redisClient.get(`jobs:${jobId}`);
      if (jobJson) {
        const job = JSON.parse(jobJson);
        
        job.status = 'FAILED';
        job.error = error.message;
        
        // Save failed job
        await this.redisClient.set(
          `jobs:${jobId}`,
          JSON.stringify(job),
          { EX: 60 * 60 * 24 * 7 } // 7 days
        );
        
        // Remove from queue
        await this.redisClient.zrem('jobs:queue', jobId);
        
        // Notify subscribers
        this.redisPubSub.publish(`JOB_PROGRESS:${jobId}`, {
          analysisJobProgress: {
            jobId,
            status: 'FAILED',
            progress: job.progress,
            currentStage: `Error: ${error.message}`,
            estimatedTimeRemaining: 0,
            timestamp: new Date()
          }
        });
      }
    }
  }
  
  /**
   * Estimate job duration in seconds
   * @private
   * @param {Object} job Job object
   * @returns {number} Estimated duration in seconds
   */
  estimateJobDuration(job) {
    // Base time depending on analysis type
    let baseTime = 10; // seconds
    
    switch (job.analysisType) {
      case 'CORRELATION_DISCOVERY':
        baseTime = 20;
        break;
      case 'FACTOR_CLUSTERING':
        baseTime = 30;
        break;
      case 'ANOMALY_DETECTION':
        baseTime = 15;
        break;
      case 'PREDICTIVE_MODELING':
        baseTime = 45;
        break;
      case 'CAUSAL_INFERENCE':
        baseTime = 60;
        break;
      default:
        baseTime = 30;
    }
    
    // Add time based on number of factors
    const factorMultiplier = Math.max(1, Math.log10(job.factorsToAnalyze.length));
    
    return Math.round(baseTime * factorMultiplier);
  }
  
  /**
   * Get job stage description
   * @private
   * @param {Object} job Job object
   * @param {number} step Current step
   * @param {number} totalSteps Total steps
   * @returns {string} Stage description
   */
  getJobStage(job, step, totalSteps) {
    const progress = step / totalSteps;
    
    if (progress < 0.2) {
      return 'Loading and preparing factor data';
    } else if (progress < 0.4) {
      return 'Analyzing historical correlation patterns';
    } else if (progress < 0.6) {
      return 'Applying statistical models';
    } else if (progress < 0.8) {
      return 'Processing results and generating insights';
    } else {
      return 'Finalizing analysis and preparing report';
    }
  }
  
  /**
   * Generate job results
   * @private
   * @param {Object} job Job object
   * @returns {Promise<Object>} Job results
   */
  async generateJobResults(job) {
    try {
      // Different analysis types generate different results
      switch (job.analysisType) {
        case 'CORRELATION_DISCOVERY': {
          // For each factor, find correlations
          const correlations = await Promise.all(
            job.factorsToAnalyze.map(async (factor) => {
              const related = await this.engine.discoverRelatedFactors(factor, {
                sport: job.sport,
                league: job.league
              });
              
              return {
                factor,
                correlations: related.slice(0, 10)
              };
            })
          );
          
          return {
            analysisType: 'CORRELATION_DISCOVERY',
            timestamp: new Date(),
            correlations
          };
        }
        
        case 'FACTOR_CLUSTERING': {
          // Discover factor clusters
          const clusters = await this.engine.discoverFactorClusters({
            factors: job.factorsToAnalyze,
            sport: job.sport,
            league: job.league
          });
          
          return {
            analysisType: 'FACTOR_CLUSTERING',
            timestamp: new Date(),
            clusters
          };
        }
        
        case 'ANOMALY_DETECTION': {
          // Detect anomalies for the factors
          const anomalies = await this.engine.detectFactorAnomalies({
            factors: job.factorsToAnalyze,
            sport: job.sport,
            league: job.league
          });
          
          return {
            analysisType: 'ANOMALY_DETECTION',
            timestamp: new Date(),
            anomalies
          };
        }
        
        case 'PREDICTIVE_MODELING': {
          // Generate predictive models
          const predictions = await this.engine.generatePredictiveModels({
            factors: job.factorsToAnalyze,
            sport: job.sport,
            league: job.league
          });
          
          return {
            analysisType: 'PREDICTIVE_MODELING',
            timestamp: new Date(),
            predictions
          };
        }
        
        case 'CAUSAL_INFERENCE': {
          // Perform causal inference
          const causalRelationships = await this.engine.inferCausalRelationships({
            factors: job.factorsToAnalyze,
            sport: job.sport,
            league: job.league
          });
          
          return {
            analysisType: 'CAUSAL_INFERENCE',
            timestamp: new Date(),
            causalRelationships
          };
        }
        
        default:
          return {
            analysisType: job.analysisType,
            timestamp: new Date(),
            message: 'Analysis completed successfully'
          };
      }
    } catch (error) {
      logger.error(`Error generating job results: ${error.message}`);
      return {
        error: error.message,
        partial: true,
        timestamp: new Date()
      };
    }
  }
  
  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.initialized) {
      // Shut down core engine
      await this.engine.shutdown();
      
      // Stop Apollo Server
      await this.apolloServer.stop();
      
      // Close HTTP server
      await new Promise((resolve) => {
        this.httpServer.close(resolve);
      });
      
      // Close subscription server
      this.subscriptionServer.close();
      
      // Close Redis connections
      this.redisClient.quit();
      this.redisPubSub.close();
      
      // Clear caches
      this.cache.flushAll();
      
      // Clear token buckets
      this.tokenBuckets = {};
      
      this.initialized = false;
      
      logger.info('AdvancedCorrelationAPI: Shut down successfully');
    }
  }
}

/**
 * Token Bucket implementation for rate limiting
 */
class TokenBucket {
  /**
   * Create a new token bucket
   * @param {number} capacity Maximum tokens
   * @param {number} refillRate Tokens per refill
   * @param {number} refillInterval Interval in ms
   */
  constructor(capacity, refillRate, refillInterval) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.lastRefill = Date.now();
    
    // Start refill timer
    this.refillTimer = setInterval(() => this.refill(), refillInterval);
  }
  
  /**
   * Refill tokens
   * @private
   */
  refill() {
    const now = Date.now();
    const elapsedTime = now - this.lastRefill;
    
    // Calculate tokens to add
    const tokensToAdd = Math.floor((elapsedTime / this.refillInterval) * this.refillRate);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
  
  /**
   * Try to consume tokens
   * @param {number} count Tokens to consume
   * @returns {boolean} Success
   */
  consume(count) {
    // Refill first
    this.refill();
    
    // Check if enough tokens
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    
    return false;
  }
  
  /**
   * Stop the refill timer
   */
  stop() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
    }
  }
}

// Add GraphQL schema definition at the bottom of the file before the module.exports
const graphqlSchema = `
  type CorrelationFactor {
    id: ID!
    name: String!
    description: String
    sport: String
    league: String
    category: String
    weight: Float
    confidence: Float
  }

  type CorrelationPair {
    factorA: CorrelationFactor!
    factorB: CorrelationFactor!
    correlationCoefficient: Float!
    confidenceInterval: [Float]!
    sampleSize: Int!
    pValue: Float!
    timeWeightedCoefficient: Float
    bayesianEstimate: Float
    causalDirection: String
    strength: String
  }

  type CorrelationMatrix {
    dimensions: Int!
    factors: [CorrelationFactor!]!
    matrix: [[Float!]!]!
    confidenceMatrix: [[Float!]!]!
    timestamp: String!
  }

  type AnomalyShift {
    id: ID!
    factorA: String!
    factorB: String!
    previousCorrelation: Float!
    currentCorrelation: Float!
    changePercent: Float!
    detectedAt: String!
    confidence: Float!
    sport: String
    league: String
    significance: String!
  }

  type CausalRelationship {
    cause: CorrelationFactor!
    effect: CorrelationFactor!
    strength: Float!
    confidence: Float!
    lagPeriod: Int
    pValue: Float!
    supportingEvidence: [String!]
  }

  type CausalGraph {
    nodes: [CorrelationFactor!]!
    edges: [CausalRelationship!]!
    timestamp: String!
  }

  type CounterfactualAnalysis {
    factor: String!
    originalValue: Float!
    counterfactualValue: Float!
    impacts: [CounterfactualImpact!]!
    confidence: Float!
  }

  type CounterfactualImpact {
    targetFactor: String!
    originalProbability: Float!
    newProbability: Float!
    percentChange: Float!
    confidence: Float!
  }

  type MultiFactorProbability {
    factors: [String!]!
    individualProbabilities: [Float!]!
    jointProbability: Float!
    confidenceInterval: [Float!]!
    correlationImpact: Float!
  }

  type Query {
    getCorrelationMatrix(factors: [String!]!, options: MatrixOptionsInput): CorrelationMatrix!
    getFactorCorrelation(factorA: String!, factorB: String!, options: CorrelationOptionsInput): CorrelationPair
    getAnomalousShifts(limit: Int, threshold: Float, sport: String, league: String): [AnomalyShift!]!
    getCausalRelationships(factor: String!, direction: String, limit: Int): [CausalRelationship!]!
    getCausalGraph(factors: [String!]!, depth: Int): CausalGraph!
    getCounterfactualAnalysis(factor: String!, value: Float!, targets: [String!]!): CounterfactualAnalysis!
    calculateMultiFactorProbability(predictions: [PredictionInput!]!): MultiFactorProbability!
    getTopCorrelatedFactors(factor: String!, limit: Int, minCorrelation: Float): [CorrelationPair!]!
  }

  input MatrixOptionsInput {
    sport: String
    league: String
    timeWindow: String
    timeWeighted: Boolean
    bayesianShrinkage: Boolean
  }

  input CorrelationOptionsInput {
    sport: String
    league: String
    timeWindow: String
    timeWeighted: Boolean
    bayesianShrinkage: Boolean
    includeCausal: Boolean
  }

  input PredictionInput {
    factor: String!
    probability: Float!
    confidence: Float
  }
`;

// Add GraphQL resolver implementation
class GraphQLResolver {
  constructor(correlationEngine) {
    this.engine = correlationEngine;
  }

  async getCorrelationMatrix(args) {
    const { factors, options = {} } = args;
    return this.engine.getCorrelationMatrix(factors, options);
  }

  async getFactorCorrelation(args) {
    const { factorA, factorB, options = {} } = args;
    return this.engine.getCorrelationBetweenFactors(factorA, factorB, options);
  }

  async getAnomalousShifts(args) {
    const { limit = 10, threshold = 0.2, sport, league } = args;
    return this.engine.getAnomalousShifts({
      limit,
      threshold,
      sport,
      league
    });
  }

  async getCausalRelationships(args) {
    const { factor, direction = 'both', limit = 10 } = args;
    return this.engine.getCausalRelationships(factor, {
      direction,
      limit
    });
  }

  async getCausalGraph(args) {
    const { factors, depth = 2 } = args;
    return this.engine.generateCausalGraph(factors, {
      maxDepth: depth
    });
  }

  async getCounterfactualAnalysis(args) {
    const { factor, value, targets } = args;
    return this.engine.performCounterfactualAnalysis(factor, value, targets);
  }

  async calculateMultiFactorProbability(args) {
    const { predictions } = args;
    return this.engine.calculateMultiFactorProbability(predictions);
  }

  async getTopCorrelatedFactors(args) {
    const { factor, limit = 10, minCorrelation = 0.3 } = args;
    return this.engine.getTopCorrelatedFactors(factor, {
      limit,
      minCorrelation
    });
  }
}

// Update the module.exports to include GraphQL components
module.exports = {
  AdvancedCorrelationAPI,
  graphqlSchema,
  GraphQLResolver
};