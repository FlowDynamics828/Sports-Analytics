require('dotenv').config();

const WebSocket = require('ws');
const EventEmitter = require('events');
const winston = require('winston');
const os = require('os');
const cluster = require('cluster');

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
        this.mongoClient = new MongoClient(this.mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverApi: ServerApiVersion.v1,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });

        this.wss = null;
        this.UPDATE_INTERVAL = 5000;
        this.activeGames = new Map();
        this.gameUpdateStreams = new Map();
        this.lastUpdateTimes = new Map();
        this.updateRetries = new Map();
        this.MAX_RETRIES = 3;
        this.workers = new Map();

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
        lastMetricsReset: Date.now()
    };
}


async connectDB() {
    try {
        // Connect to MongoDB
        await this.mongoClient.connect();
        
        // Verify the connection
        const database = this.mongoClient.db('sports-analytics');
        await database.command({ ping: 1 });
        
        console.log('Successfully connected to MongoDB');
        return true;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        return this.handleConnectionError(error);
    }
}

async handleConnectionError(error, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5 seconds

    if (retryCount < MAX_RETRIES) {
        this.logger.info(`Retrying connection... Attempt ${retryCount + 1}/${MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return this.connectDB(retryCount + 1);
    }

    throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts: ${error.message}`);
}

  async initializeSystem() {
    try {
        // Get port from environment or API configuration
        const API_PORT = process.env.PORT || 4000;
        const WS_PORT = API_PORT;

        // First connect to MongoDB with retry logic
        await this.connectDB();

        // Then start the system
        await this.start();

        // Update WebSocket to use server instance
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

        this.logger.info('System initialized successfully', {
            httpPort: API_PORT, 
            mode: process.env.NODE_ENV,
            integratedServer: !!this.server
        });
    } catch (error) {
        this.logger.error('System initialization failed:', error);
        throw error;
    }
}

async start() {
    try {
        if (cluster.isMaster) {
            this.initializeCluster();
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
        const db = this.mongoClient.db('sports-analytics');
        try {
            const liveGames = await db.collection('games')
                .find({ status: 'live' })
                .toArray();

            for (const game of liveGames) {
                await this.updateGame(game);
            }
        } catch (error) {
            this.logger.error('Error updating live games:', error);
            throw error;
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
        const db = this.mongoClient.db('sports-analytics');
        try {
            const result = await db.collection('games').updateOne(
                { _id: gameId },
                { 
                    $set: updates,
                    $push: {
                        updateHistory: {
                            ...updates,
                            timestamp: new Date()
                        }
                    }
                }
            );
            return result;
        } catch (error) {
            this.logger.error('Error saving game updates:', error);
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
            lastMetricsReset: Date.now()
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
        this.logger.info('Stopping live game updater...');
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
        if (this.wss) {
            this.wss.close();
        }
        this.logger.info('Live game updater stopped');
    }
}

// Module export and initialization logic
if (require.main === module) {
    console.log('Initializing Live Game Updater...');
    
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

    // Initialize with error handling
    updater.initializeSystem()
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