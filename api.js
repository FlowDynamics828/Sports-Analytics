require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { authenticateToken, generateToken } = require('./auth/auth');
const errorHandler = require('./utils/errorHandler');

const app = express();
const port = process.env.PORT || 4000;

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    setTimeout(() => process.exit(1), 1000);
});

// MongoDB Connection
async function connectDB() {
    try {
        const client = await MongoClient.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('MongoDB connected');
        return client;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return connectDB();
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Base routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/preferences', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'preferences.html'));
});

app.get('/visualization', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'visualization.html'));
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
    const client = await connectDB();
    try {
        const { email, password } = req.body;
        const user = await client.db('sports-analytics')
            .collection('users')
            .findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user);
        res.json({ 
            token, 
            user: { 
                email: user.email, 
                subscription: user.subscription 
            } 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await client.close();
    }
});

// User routes
app.post('/api/user/preferences', authenticateToken, async (req, res) => {
    const client = await connectDB();
    try {
        await client.db('sports-analytics')
            .collection('users')
            .updateOne(
                { _id: ObjectId(req.user.id) },
                { $set: { preferences: req.body } }
            );
        res.json({ message: 'Preferences updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await client.close();
    }
});

// Data routes
app.get('/api/games/:league', authenticateToken, async (req, res) => {
    const client = await connectDB();
    try {
        const games = await client.db('sports-analytics')
            .collection(`${req.params.league}-games`)
            .find()
            .sort({ date: -1 })
            .limit(50)
            .toArray();
        res.json(games);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await client.close();
    }
});

app.get('/api/stats/:league', authenticateToken, async (req, res) => {
    const client = await connectDB();
    try {
        const { days = 7 } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));

        const games = await client.db('sports-analytics')
            .collection(`${req.params.league}-games`)
            .find({ date: { $gte: daysAgo } })
            .sort({ date: 1 })
            .toArray();

        const stats = processStats(games);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await client.close();
    }
});

// WebSocket handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'subscribe') {
            ws.league = data.league;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
});

// Attach WebSocket server to HTTP server
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Helper function for stats processing
function processStats(games) {
    return {
        totalGames: games.length,
        averageScore: games.reduce((acc, game) => 
            acc + (parseInt(game.homeTeam.score) + parseInt(game.awayTeam.score))/2, 0) / games.length,
        homeWinPercentage: (games.filter(game => 
            parseInt(game.homeTeam.score) > parseInt(game.awayTeam.score)
        ).length / games.length) * 100
    };
}

module.exports = { app, server };