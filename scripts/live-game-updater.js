require('dotenv').config();

const WebSocket = require('ws');
const EventEmitter = require('events');
const winston = require('winston');
const os = require('os');
const cluster = require('cluster');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { performance } = require('perf_hooks');
const fetch = require('node-fetch');

// Debug logging
console.log('Live Game Updater script loaded');
console.log('Environment check:', {
    mongoUri: process.env.MONGODB_URI ? 'Set' : 'Not set',
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV
});

class LiveGameUpdater extends EventEmitter {
    constructor() {
        super();
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI must be set in environment variables');
        }
        
        this.mongoUri = process.env.MONGODB_URI;
        this.dbName = process.env.MONGODB_DB_NAME || 'sports-analytics';
        this.mongoClient = new MongoClient(this.mongoUri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true
            },
            maxPoolSize: 50,
            minPoolSize: 5,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            serverSelectionTimeoutMS: 30000,
            retryWrites: true,
            retryReads: true
        });

        this.db = null;
        this.wss = null;
        this.UPDATE_INTERVAL = 5000;
        this.activeGames = new Map();
        this.gameUpdateStreams = new Map();
        this.lastUpdateTimes = new Map();
        this.updateRetries = new Map();
        this.MAX_RETRIES = 3;
        this.workers = new Map();
        this.connectionAttempts = 0;
        this.MAX_CONNECTION_ATTEMPTS = 5;
        this.RECONNECT_INTERVAL = 5000; // 5 seconds

        // Sport-specific update handlers
        this.sportUpdaters = {
            NBA: {
                handler: this.updateBasketballGame.bind(this),
                updateFrequency: 5000,  // 5 seconds
                scoringLogic: this.basketballScoringLogic.bind(this),
                gameFlow: this.basketballGameFlow.bind(this),
                statistics: this.basketballStatistics.bind(this)
            },
            NFL: {
                handler: this.updateFootballGame.bind(this),
                updateFrequency: 10000, // 10 seconds
                scoringLogic: this.footballScoringLogic.bind(this),
                gameFlow: this.footballGameFlow.bind(this),
                statistics: this.footballStatistics.bind(this)
            },
            MLB: {
                handler: this.updateBaseballGame.bind(this),
                updateFrequency: 15000, // 15 seconds
                scoringLogic: this.baseballScoringLogic.bind(this),
                gameFlow: this.baseballGameFlow.bind(this),
                statistics: this.baseballStatistics.bind(this)
            },
            NHL: {
                handler: this.updateHockeyGame.bind(this),
                updateFrequency: 5000,  // 5 seconds
                scoringLogic: this.hockeyScoringLogic.bind(this),
                gameFlow: this.hockeyGameFlow.bind(this),
                statistics: this.hockeyStatistics.bind(this)
            },
            LALIGA: {
                handler: this.updateSoccerGame.bind(this),
                updateFrequency: 10000, // 10 seconds
                scoringLogic: this.soccerScoringLogic.bind(this),
                gameFlow: this.soccerGameFlow.bind(this),
                statistics: this.soccerStatistics.bind(this)
            },
            PREMIERLEAGUE: {
                handler: this.updateSoccerGame.bind(this),
                updateFrequency: 10000, // 10 seconds
                scoringLogic: this.soccerScoringLogic.bind(this),
                gameFlow: this.soccerGameFlow.bind(this),
                statistics: this.soccerStatistics.bind(this)
            },
            BUNDESLIGA: {
                handler: this.updateSoccerGame.bind(this),
                updateFrequency: 10000, // 10 seconds
                scoringLogic: this.soccerScoringLogic.bind(this),
                gameFlow: this.soccerGameFlow.bind(this),
                statistics: this.soccerStatistics.bind(this)
            },
            SERIEA: {
                handler: this.updateSoccerGame.bind(this),
                updateFrequency: 10000, // 10 seconds
                scoringLogic: this.soccerScoringLogic.bind(this),
                gameFlow: this.soccerGameFlow.bind(this),
                statistics: this.soccerStatistics.bind(this)
            }
        };

    // Initialize logger
    this.logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ filename: 'live-games-error.log', level: 'error' }),
            new winston.transports.File({ filename: 'live-games.log' }),
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ]
    });

    // Performance monitoring
    this.metrics = {
        updatesProcessed: 0,
        updateLatency: [],
        errors: 0,
        dbConnectionAttempts: 0,
        dbReconnections: 0,
        lastMetricsReset: Date.now(),
        gamesProcessed: new Map()
    };

    // Set up MongoDB connection monitoring
    this.mongoClient.on('serverHeartbeatFailed', (event) => {
        this.logger.warn('MongoDB server heartbeat failed', { error: event.failure });
        this.metrics.dbConnectionAttempts++;
    });

    this.mongoClient.on('connectionPoolCleared', () => {
        this.logger.warn('MongoDB connection pool cleared');
    });
}


async connectDB() {
    try {
        this.connectionAttempts++;
        this.metrics.dbConnectionAttempts++;
        const startTime = performance.now();
        
        // Connect to MongoDB
        await this.mongoClient.connect();
        
        // Verify the connection with a ping
        this.db = this.mongoClient.db(this.dbName);
        await this.db.command({ ping: 1 });
        
        const connectionTime = performance.now() - startTime;
        this.logger.info('Successfully connected to MongoDB', { 
            connectionTime: `${connectionTime.toFixed(2)}ms`,
            dbName: this.dbName,
            attempt: this.connectionAttempts
        });
        
        // Reset connection attempts on success
        this.connectionAttempts = 0;
        
        // Verify collections exist and create them if they don't
        await this.ensureCollections();
        
        return true;
    } catch (error) {
        this.logger.error('MongoDB connection error:', {
            error: error.message,
            stack: error.stack,
            attempt: this.connectionAttempts
        });
        return this.handleConnectionError(error);
    }
}

async ensureCollections() {
    try {
        // Check if collections exist
        const collections = await this.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        // Ensure games collection exists
        if (!collectionNames.includes('games')) {
            this.logger.info('Creating games collection');
            await this.db.createCollection('games');
            
            // Create indexes for games collection
            await this.db.collection('games').createIndex({ gameId: 1 }, { unique: true });
            await this.db.collection('games').createIndex({ league: 1 });
            await this.db.collection('games').createIndex({ date: 1 });
            await this.db.collection('games').createIndex({ status: 1 });
            await this.db.collection('games').createIndex({ 'homeTeam.id': 1 });
            await this.db.collection('games').createIndex({ 'awayTeam.id': 1 });
        }
        
        // Ensure teams collection exists
        if (!collectionNames.includes('teams')) {
            this.logger.info('Creating teams collection');
            await this.db.createCollection('teams');
            
            // Create indexes for teams collection
            await this.db.collection('teams').createIndex({ teamId: 1 }, { unique: true });
            await this.db.collection('teams').createIndex({ league: 1 });
            await this.db.collection('teams').createIndex({ name: 1 });
        }
        
        // Ensure leagues collection exists
        if (!collectionNames.includes('leagues')) {
            this.logger.info('Creating leagues collection');
            await this.db.createCollection('leagues');
            
            // Create indexes for leagues collection
            await this.db.collection('leagues').createIndex({ leagueId: 1 }, { unique: true });
            await this.db.collection('leagues').createIndex({ name: 1 });
        }
        
        this.logger.info('Collections and indexes verified');
    } catch (error) {
        this.logger.error('Error ensuring collections:', error);
        throw error;
    }
}

async handleConnectionError(error, retryCount = 0) {
    if (this.connectionAttempts >= this.MAX_CONNECTION_ATTEMPTS) {
        this.logger.error(`Failed to connect to MongoDB after ${this.MAX_CONNECTION_ATTEMPTS} attempts`);
        throw new Error(`Failed to connect to MongoDB after ${this.MAX_CONNECTION_ATTEMPTS} attempts: ${error.message}`);
    }

    // Exponential backoff for reconnection
    const delay = Math.min(this.RECONNECT_INTERVAL * Math.pow(1.5, retryCount), 30000);
    this.logger.info(`Retrying connection in ${delay}ms... Attempt ${this.connectionAttempts}/${this.MAX_CONNECTION_ATTEMPTS}`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    this.metrics.dbReconnections++;
    return this.connectDB();
}

async initializeSystem() {
    this.logger.info('Initializing Live Game Updater system');
    try {
        // Get port from environment or API configuration
        const API_PORT = process.env.PORT || 4000;
        const WS_PORT = 5151; // Use a different port to avoid conflicts

        // First connect to MongoDB with retry logic
        await this.connectDB();

        // Then start the system
        await this.start();

        // Only set up WebSocket server in primary process, not in workers
        if (cluster.isPrimary) {
            if (this.app && this.server) {
                this.wss = new WebSocket.Server({
                    server: this.server,
                    path: '/live-updates'
                });
            } else {
                this.wss = new WebSocket.Server({
                    port: WS_PORT,
                    path: '/live-updates'
                });
            }
            this.logger.info('WebSocket server initialized', { port: WS_PORT });
        }

        this.logger.info('System initialized successfully', {
            httpPort: API_PORT, 
            wsPort: WS_PORT,
            mode: process.env.NODE_ENV,
            integratedServer: !!this.server,
            isPrimary: cluster.isPrimary
        });
    } catch (error) {
        this.logger.error('System initialization failed:', error);
        throw error;
    }
}

async start() {
    try {
        // Skip clustering if isPrimary has been manually set
        if (cluster.isPrimary) {
            // If clustering is disabled, run worker code directly
            if (cluster.isPrimary === true && Object.keys(cluster.workers || {}).length === 0) {
                this.logger.info('Running in standalone mode (clustering disabled)');
                this.startWorker();
            } else {
                this.initializeCluster();
            }
        } else {
            this.startWorker();
        }
        this.startMetricsCollection();
        this.logger.info('Live game updater started successfully');
        return true;
    } catch (error) {
        this.logger.error('Failed to start live game updater:', error);
        throw error;
    }
}

    initializeCluster() {
        const numCPUs = os.cpus().length;
        this.logger.info(`Setting up ${numCPUs} workers`);

        for (let i = 0; i < numCPUs; i++) {
            const worker = cluster.fork();
            this.workers.set(worker.id, {
                status: 'active',
                gamesAssigned: 0,
                lastHeartbeat: Date.now()
            });

            worker.on('message', (msg) => {
                this.handleWorkerMessage(worker.id, msg);
            });
        }

        cluster.on('exit', (worker, code, signal) => {
            this.logger.warn(`Worker ${worker.id} died. Restarting...`);
            this.workers.delete(worker.id);
            const newWorker = cluster.fork();
            this.workers.set(newWorker.id, {
                status: 'active',
                gamesAssigned: 0,
                lastHeartbeat: Date.now()
            });
        });
    }

    async startWorker() {
        try {
            await this.updateGames();
            this.startUpdateCycle();
            this.setupHealthCheck();
        } catch (error) {
            this.logger.error('Worker failed to start:', error);
            process.exit(1);
        }
    }

  
    startUpdateCycle() {
        this.updateInterval = setInterval(async () => {
            const startTime = process.hrtime();
            try {
                await this.updateGames();
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const latency = seconds * 1000 + nanoseconds / 1e6;
                this.metrics.updateLatency.push(latency);
            } catch (error) {
                this.metrics.errors++;
                this.logger.error('Error in update cycle:', error);
            }
        }, this.UPDATE_INTERVAL);
    }

    async updateGames() {
        if (!this.db) {
            this.logger.error('Cannot update games: Database connection not established');
            try {
                await this.connectDB();
            } catch (error) {
                this.logger.error('Failed to reconnect to database:', error);
                return;
            }
        }
        
        try {
            const startTime = performance.now();
            
            // Find all live games
            const liveGames = await this.db.collection('games')
                .find({ status: 'live' })
                .toArray();
                
            this.logger.info(`Found ${liveGames.length} live games to update`);
            
            // Track which games we've processed this cycle
            const processedGames = new Set();

            for (const game of liveGames) {
                await this.updateGame(game);
                processedGames.add(game._id.toString());
                
                // Update metrics
                if (!this.metrics.gamesProcessed.has(game._id.toString())) {
                    this.metrics.gamesProcessed.set(game._id.toString(), 0);
                }
                this.metrics.gamesProcessed.set(
                    game._id.toString(), 
                    this.metrics.gamesProcessed.get(game._id.toString()) + 1
                );
            }
            
            const updateTime = performance.now() - startTime;
            if (liveGames.length > 0) {
                this.logger.info(`Updated ${liveGames.length} games in ${updateTime.toFixed(2)}ms`);
            }
        } catch (error) {
            this.logger.error('Error updating live games:', {
                error: error.message,
                stack: error.stack
            });
            
            // If there's a MongoDB error, try to reconnect
            if (this.isMongoConnectionError(error)) {
                this.logger.warn('MongoDB connection error detected, attempting to reconnect...');
                try {
                    // Clear the existing client
                    if (this.mongoClient) {
                        await this.mongoClient.close(true);
                    }
                    
                    // Reconnect 
                    await this.connectDB();
                } catch (reconnectError) {
                    this.logger.error('Failed to reconnect to MongoDB:', reconnectError);
                }
            }
        }
    }

    async updateGame(game) {
        const updater = this.sportUpdaters[game.league];
        if (!updater) {
            this.logger.warn(`No updater for league: ${game.league}`);
            return;
        }

        try {
            const startTime = process.hrtime();
            const updates = await updater.handler(game);
            
            if (updates) {
                await this.saveGameUpdates(game._id, updates);
                this.broadcastUpdate(game.league, {
                    gameId: game._id,
                    ...updates
                });

                // Performance tracking
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const latency = seconds * 1000 + nanoseconds / 1e6;
                this.metrics.updatesProcessed++;
                this.metrics.updateLatency.push(latency);
            }
        } catch (error) {
            this.metrics.errors++;
            this.handleUpdateError(game, error);
        }
    }

    // Sport-specific update handlers
    async updateBasketballGame(game) {
        const updates = await this.sportUpdaters.NBA.scoringLogic(game);
        const gameFlow = await this.sportUpdaters.NBA.gameFlow(game);
        const statistics = await this.sportUpdaters.NBA.statistics(game);

        return {
            ...updates,
            gameFlow,
            statistics,
            lastUpdate: new Date()
        };
    }

    async updateFootballGame(game) {
        const updates = await this.sportUpdaters.NFL.scoringLogic(game);
        const gameFlow = await this.sportUpdaters.NFL.gameFlow(game);
        const statistics = await this.sportUpdaters.NFL.statistics(game);

        return {
            ...updates,
            gameFlow,
            statistics,
            lastUpdate: new Date()
        };
    }

    async updateBaseballGame(game) {
        const updates = await this.sportUpdaters.MLB.scoringLogic(game);
        const gameFlow = await this.sportUpdaters.MLB.gameFlow(game);
        const statistics = await this.sportUpdaters.MLB.statistics(game);

        return {
            ...updates,
            gameFlow,
            statistics,
            lastUpdate: new Date()
        };
    }

    async updateHockeyGame(game) {
        const updates = await this.sportUpdaters.NHL.scoringLogic(game);
        const gameFlow = await this.sportUpdaters.NHL.gameFlow(game);
        const statistics = await this.sportUpdaters.NHL.statistics(game);

        return {
            ...updates,
            gameFlow,
            statistics,
            lastUpdate: new Date()
        };
    }

    // Soccer game update handler
    async updateSoccerGame(game) {
        const updates = await this.soccerScoringLogic(game);
        const gameFlow = await this.soccerGameFlow(game);
        const statistics = await this.soccerStatistics(game);

        return {
            ...updates,
            gameFlow,
            statistics,
            lastUpdate: new Date()
        };
    }

    // Soccer logic methods
    async soccerScoringLogic(game) {
        // Placeholder implementation
        return {
            homeScore: game.homeTeam.score,
            awayScore: game.awayTeam.score,
            period: game.period
        };
    }

    async soccerGameFlow(game) {
        // Placeholder implementation
        return {
            possession: 50, // Default 50/50 possession
            attacks: {
                home: game.homeTeam.attacks || 0,
                away: game.awayTeam.attacks || 0
            }
        };
    }

    async soccerStatistics(game) {
        // Placeholder implementation
        return {
            shots: {
                home: game.homeTeam.shots || 0,
                away: game.awayTeam.shots || 0
            },
            corners: {
                home: game.homeTeam.corners || 0,
                away: game.awayTeam.corners || 0
            }
        };
    }

    // Placeholder methods for other sport-specific scoring and statistics
    async basketballScoringLogic(game) { return {}; }
    async basketballGameFlow(game) { return {}; }
    async basketballStatistics(game) { return {}; }

    async footballScoringLogic(game) { return {}; }
    async footballGameFlow(game) { return {}; }
    async footballStatistics(game) { return {}; }

    async baseballScoringLogic(game) { return {}; }
    async baseballGameFlow(game) { return {}; }
    async baseballStatistics(game) { return {}; }

    async hockeyScoringLogic(game) { return {}; }
    async hockeyGameFlow(game) { return {}; }
    async hockeyStatistics(game) { return {}; }

    async saveGameUpdates(gameId, updates) {
        if (!this.db) {
            this.logger.error('Cannot save game updates: Database connection not established');
            try {
                await this.connectDB();
            } catch (error) {
                this.logger.error('Failed to reconnect to database:', error);
                throw error;
            }
        }

        try {
            const startTime = performance.now();
            
            const result = await this.db.collection('games').updateOne(
                { _id: gameId },
                { $set: { 
                    ...updates, 
                    lastUpdated: new Date()
                }}
            );
            
            const updateTime = performance.now() - startTime;
            
            if (result.modifiedCount === 0) {
                this.logger.warn(`No game found with ID ${gameId} to update`);
            } else {
                this.logger.debug(`Game ${gameId} updated successfully in ${updateTime.toFixed(2)}ms`);
            }
            
            return result.modifiedCount > 0;
        } catch (error) {
            this.logger.error(`Error saving updates for game ${gameId}:`, {
                error: error.message,
                updates: JSON.stringify(updates)
            });
            
            // If there's a MongoDB error, try to reconnect
            if (this.isMongoConnectionError(error)) {
                this.logger.warn('MongoDB connection error detected, attempting to reconnect...');
                try {
                    await this.connectDB();
                    
                    // Retry the update once more after reconnection
                    return await this.db.collection('games').updateOne(
                        { _id: gameId },
                        { $set: { 
                            ...updates, 
                            lastUpdated: new Date()
                        }}
                    );
                } catch (reconnectError) {
                    this.logger.error('Failed to reconnect and update game:', reconnectError);
                    throw reconnectError;
                }
            }
            
            throw error;
        }
    }

    broadcastUpdate(league, update) {
        if (!this.wss) return;

        const message = JSON.stringify({
            type: 'gameUpdate',
            league,
            data: update,
            timestamp: new Date()
        });

        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.subscribedLeagues?.includes(league)) {
                client.send(message);
            }
        });
    }

   handleUpdateError(game, error) {
        const retryCount = this.updateRetries.get(game._id) || 0;
        if (retryCount < this.MAX_RETRIES) {
            this.updateRetries.set(game._id, retryCount + 1);
            setTimeout(() => this.updateGame(game), 1000 * (retryCount + 1));
        } else {
            this.logger.error(`Max retries reached for game ${game._id}`, error);
            this.updateRetries.delete(game._id);
        }
    }

    handleWorkerMessage(workerId, msg) {
        switch (msg.type) {
            case 'healthCheck':
                this.updateWorkerStatus(workerId, msg.status);
                break;
            case 'gameUpdate':
                this.processWorkerGameUpdate(msg.data);
                break;
            default:
                this.logger.warn('Unhandled worker message:', msg);
        }
    }

    updateWorkerStatus(workerId, status) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.status = status;
            worker.lastHeartbeat = Date.now();
        }
    }

    processWorkerGameUpdate(updateData) {
        // Process and potentially redistribute game updates
        this.broadcastUpdate(updateData.league, updateData);
    }

    startMetricsCollection() {
        setInterval(() => {
            const currentMetrics = {
                timestamp: new Date(),
                updatesProcessed: this.metrics.updatesProcessed,
                averageLatency: this.calculateAverageLatency(),
                errors: this.metrics.errors,
                activeGames: this.activeGames.size,
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage()
            };

            this.logger.info('Performance metrics:', currentMetrics);
            this.resetMetrics();
        }, 60000); // Collect metrics every minute
    }

    calculateAverageLatency() {
        if (this.metrics.updateLatency.length === 0) return 0;
        const sum = this.metrics.updateLatency.reduce((a, b) => a + b, 0);
        return sum / this.metrics.updateLatency.length;
    }

    resetMetrics() {
        this.metrics = {
            updatesProcessed: 0,
            updateLatency: [],
            errors: 0,
            dbConnectionAttempts: 0,
            dbReconnections: 0,
            lastMetricsReset: Date.now(),
            gamesProcessed: new Map()
        };
    }

    setupHealthCheck() {
        setInterval(async () => {
            try {
                await this.mongoClient.db().admin().ping();
                process.send?.({ type: 'healthCheck', status: 'healthy' });
            } catch (error) {
                process.send?.({ type: 'healthCheck', status: 'unhealthy', error: error.message });
            }
        }, 30000); // Health check every 30 seconds
    }

    async stop() {
        this.logger.info('Stopping Live Game Updater service');
        
        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Clear metrics collection interval
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        
        // Close WebSocket server
        if (this.wss) {
            this.logger.info('Closing WebSocket server');
            this.wss.close();
            this.wss = null;
        }
        
        // Close MongoDB connection properly
        if (this.mongoClient) {
            try {
                this.logger.info('Closing MongoDB connection');
                await this.mongoClient.close(true);
                this.mongoClient = null;
                this.db = null;
                this.logger.info('MongoDB connection closed');
            } catch (error) {
                this.logger.error('Error closing MongoDB connection:', error);
            }
        }
        
        this.logger.info('Live Game Updater service stopped');
    }

    // Helper to check if error is a MongoDB connection error
    isMongoConnectionError(error) {
        const connectionErrorCodes = [
            'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET',
            'MONGODB_ERROR_INTERRUPTED', 'MONGODB_ERROR_NOT_MASTER'
        ];
        
        return connectionErrorCodes.some(code => 
            error.message.includes(code) || 
            (error.code && error.code.toString().includes(code))
        );
    }

    async updateGameData(gameId) {
        try {
            // Check if a current update is already in progress for this game
            if (this.updateRetries.get(gameId) && this.updateRetries.get(gameId) > this.MAX_RETRIES) {
                this.logger.warn(`Maximum retries exceeded for game ${gameId}, temporarily suspending updates`);
                setTimeout(() => {
                    this.updateRetries.delete(gameId);
                    this.logger.info(`Resuming updates for game ${gameId} after cooling period`);
                }, 60000); // 1 minute cooling period
                return false;
            }
            
            // Track the start time for performance monitoring
            const updateStartTime = performance.now();
            
            this.logger.info(`Updating game data for game ID: ${gameId}`);
            
            // Get the game from database
            const game = await this.db.collection('games').findOne({ gameId });
            if (!game) {
                this.logger.error(`Game ${gameId} not found in database`);
                return false;
            }
            
            // Get real-time data from TheSportsDB API
            const apiKey = process.env.THESPORTSDB_API_KEY || '447279';
            const response = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupevent.php?id=${gameId}`);
            
            if (!response.ok) {
                throw new Error(`API response error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data || !data.events || !data.events[0]) {
                throw new Error('Invalid API response format');
            }
            
            const eventData = data.events[0];
            
            // Transform the API data to our game model
            const updatedGame = this.transformGameData(eventData, game);
            
            // Update game in database
            await this.db.collection('games').updateOne(
                { gameId },
                { $set: {
                    ...updatedGame,
                    lastUpdated: new Date()
                }}
            );
            
            // Track update time
            const updateTime = performance.now() - updateStartTime;
            this.metrics.updateLatency.push(updateTime);
            this.logger.info(`Game ${gameId} updated in ${updateTime.toFixed(2)}ms`);
            
            // Reset retry counter on success
            this.updateRetries.delete(gameId);
            
            // Emit update event
            this.emit('gameUpdated', updatedGame);
            
            return true;
        } catch (error) {
            // Increment retry counter
            const retryCount = (this.updateRetries.get(gameId) || 0) + 1;
            this.updateRetries.set(gameId, retryCount);
            
            this.logger.error(`Error updating game ${gameId} (attempt ${retryCount}/${this.MAX_RETRIES}):`, {
                error: error.message,
                stack: error.stack
            });
            
            // Record the error in metrics
            this.metrics.errors++;
            
            return false;
        }
    }

    // Transform API data to our game model
    transformGameData(eventData, existingGame) {
        // Extract relevant data from TheSportsDB API response
        const homeScore = parseInt(eventData.intHomeScore) || 0;
        const awayScore = parseInt(eventData.intAwayScore) || 0;
        const status = this.mapGameStatus(eventData.strStatus);
        const period = this.extractGamePeriod(eventData);
        const timeRemaining = this.extractTimeRemaining(eventData);
        
        // Preserve existing data structure but update with new values
        return {
            ...existingGame,
            status,
            homeTeam: {
                ...existingGame.homeTeam,
                score: homeScore
            },
            awayTeam: {
                ...existingGame.awayTeam,
                score: awayScore
            },
            period,
            timeRemaining,
            lastUpdated: new Date(),
            events: this.extractGameEvents(eventData, existingGame.events || [])
        };
    }

    // Map TheSportsDB status to our status format
    mapGameStatus(apiStatus) {
        const statusMap = {
            'NS': 'scheduled',     // Not Started
            'LIVE': 'live',        // Live
            'FT': 'completed',     // Full Time / Finished
            'HT': 'live',          // Half Time
            'ET': 'live',          // Extra Time
            'PEN': 'live',         // Penalties
            'AET': 'completed',    // After Extra Time
            'CANC': 'cancelled',   // Cancelled
            'SUSP': 'suspended',   // Suspended
            'INT': 'suspended',    // Interrupted
            'PST': 'postponed',    // Postponed
            'ABAN': 'abandoned',   // Abandoned
            'AWARDED': 'completed' // Awarded
        };
        
        return statusMap[apiStatus] || 'unknown';
    }

    // Extract game period from API data
    extractGamePeriod(eventData) {
        // Different handling based on sport
        const sport = this.detectSportFromEvent(eventData);
        
        switch (sport) {
            case 'NBA':
                return eventData.strProgress ? `Q${eventData.strProgress}` : '1st';
            case 'NFL':
                return eventData.strProgress || '1st';
            case 'NHL':
                return eventData.strProgress ? `P${eventData.strProgress}` : '1st';
            case 'MLB':
                return eventData.strProgress ? `${eventData.strProgress}` : 'Top 1st';
            default: // Soccer
                return eventData.strProgress || '1st';
        }
    }

    // Extract time remaining from API data
    extractTimeRemaining(eventData) {
        if (eventData.strStatus === 'NS') return null;
        if (eventData.strStatus === 'FT') return 0;
        
        // Try to extract from strProgress if available
        if (eventData.strTimer) {
            return eventData.strTimer;
        }
        
        // Fallback to default values based on sport
        const sport = this.detectSportFromEvent(eventData);
        
        switch (sport) {
            case 'NBA':
                return '12:00';
            case 'NFL':
                return '15:00';
            case 'NHL':
                return '20:00';
            case 'MLB':
                return null; // Baseball doesn't use a clock
            default: // Soccer
                return '45:00';
        }
    }

    // Detect sport from event data
    detectSportFromEvent(eventData) {
        const leagueId = eventData.idLeague;
        
        const sportMap = {
            '4387': 'NBA',
            '4391': 'NFL',
            '4424': 'MLB',
            '4380': 'NHL',
            '4328': 'PREMIERLEAGUE',
            '4335': 'LALIGA',
            '4331': 'BUNDESLIGA',
            '4332': 'SERIEA'
        };
        
        return sportMap[leagueId] || 'UNKNOWN';
    }

    // Extract game events from API data
    extractGameEvents(eventData, existingEvents) {
        // Maintain existing events - TheSportsDB doesn't provide detailed event data
        // In a real implementation, you'd parse events from the API
        return existingEvents;
    }

    // Update method for each sport, replacing generic simulation with real data handling
    async updateBasketballGame(gameId) {
        try {
            const updated = await this.updateGameData(gameId);
            if (!updated) return false;
            
            // Additional basketball-specific processing if needed
            return true;
        } catch (error) {
            this.logger.error(`Error updating basketball game ${gameId}:`, error);
            return false;
        }
    }

    async updateFootballGame(gameId) {
        try {
            const updated = await this.updateGameData(gameId);
            if (!updated) return false;
            
            // Additional football-specific processing if needed
            return true;
        } catch (error) {
            this.logger.error(`Error updating football game ${gameId}:`, error);
            return false;
        }
    }

    async updateBaseballGame(gameId) {
        try {
            const updated = await this.updateGameData(gameId);
            if (!updated) return false;
            
            // Additional baseball-specific processing if needed
            return true;
        } catch (error) {
            this.logger.error(`Error updating baseball game ${gameId}:`, error);
            return false;
        }
    }

    async updateHockeyGame(gameId) {
        try {
            const updated = await this.updateGameData(gameId);
            if (!updated) return false;
            
            // Additional hockey-specific processing if needed
            return true;
        } catch (error) {
            this.logger.error(`Error updating hockey game ${gameId}:`, error);
            return false;
        }
    }

    async updateSoccerGame(gameId) {
        try {
            const updated = await this.updateGameData(gameId);
            if (!updated) return false;
            
            // Additional soccer-specific processing if needed
            return true;
        } catch (error) {
            this.logger.error(`Error updating soccer game ${gameId}:`, error);
            return false;
        }
    }
}

// Module export and initialization logic
if (require.main === module) {
    console.log('Initializing Live Game Updater...');
    
    // Set to true to disable clustering for simpler operation
    const DISABLE_CLUSTERING = true;
    
    if (DISABLE_CLUSTERING) {
        // Override cluster.isPrimary to always return true for standalone operation
        cluster.isPrimary = true;
    }
    
    const updater = new LiveGameUpdater();
    
    // Prevent immediate exit
    const keepAlive = setInterval(() => {
        console.log('System status: Active');
    }, 30000);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down gracefully...');
        clearInterval(keepAlive);
        await updater.stop();
        process.exit(0);
    });

    // First connect to MongoDB, then initialize system
    updater.connectDB()
        .then(() => updater.initializeSystem())
        .then(() => {
            console.log('Live Game Updater successfully initialized');
        })
        .catch(error => {
            console.error('Failed to initialize Live Game Updater:', error);
            clearInterval(keepAlive);
            process.exit(1);
        });
} else {
    module.exports = LiveGameUpdater;
}