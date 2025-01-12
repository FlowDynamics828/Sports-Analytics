require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const paymentRoutes = require('./routes/payment');
const leagues = require('./leagues.js');

// Environment Variables Check
if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
    console.error('Critical environment variables missing');
    process.exit(1);
}

// Initialize express and create HTTP server
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 4000;

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB Connection Function
async function connectDB() {
    try {
        const client = await MongoClient.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });
        console.log('MongoDB connected successfully');
        return client;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

// Debug Endpoint
app.get('/api/debug', (req, res) => {
    res.json({
        status: 'ok',
        auth: !!JWT_SECRET,
        db: !!MONGODB_URI,
        leagues: Object.keys(leagues),
        environment: process.env.NODE_ENV
    });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api', paymentRoutes);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard/components', express.static('public/dashboard/components'));
app.use('/dashboard/scripts', express.static('public/dashboard/scripts'));
app.use('/dashboard/services', express.static('public/dashboard/services'));

// Security Headers Middleware
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self' https://cdnjs.cloudflare.com;"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
}

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        const client = await connectDB();
        await client.db('sports-analytics').command({ ping: 1 });
        await client.close();
        res.json({ status: 'ok', message: 'Service healthy' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// User Profile Endpoint
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    const client = await connectDB();
    try {
        const user = await client.db('sports-analytics')
            .collection('users')
            .findOne({ email: req.user.email });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            email: user.email,
            subscription: user.subscription,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.close();
    }
});

// Login Endpoint
app.post('/api/auth/login', async (req, res) => {
    const client = await connectDB();
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await client.db('sports-analytics')
            .collection('users')
            .findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { 
                id: user._id.toString(), 
                email: user.email,
                subscription: user.subscription 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            token,
            user: {
                email: user.email,
                subscription: user.subscription
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.close();
    }
});

// Signup Endpoint
app.post('/api/auth/signup', async (req, res) => {
    const client = await connectDB();
    try {
        const { email, password, subscription = 'basic' } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const existingUser = await client.db('sports-analytics')
            .collection('users')
            .findOne({ email });
            
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await client.db('sports-analytics')
            .collection('users')
            .insertOne({
                email,
                password: hashedPassword,
                subscription,
                createdAt: new Date(),
                preferences: {}
            });

        const token = jwt.sign(
            { 
                id: result.insertedId.toString(), 
                email,
                subscription
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({ token });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.close();
    }
});

// Teams Endpoint
app.get('/api/leagues/:league/teams', authenticateToken, async (req, res) => {
    try {
        const { league } = req.params;
        
        if (!leagues[league.toLowerCase()]) {
            return res.status(404).json({ error: 'League not found' });
        }

        res.json(leagues[league.toLowerCase()].teams);
    } catch (error) {
        console.error('Teams error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Stats Endpoint
app.get('/api/stats/:league', authenticateToken, async (req, res) => {
    const client = await connectDB();
    try {
        const { league } = req.params;
        const { team } = req.query;
        const db = client.db('sports-analytics');
        
        let query = { league: league.toUpperCase() };
        if (team) {
            query.$or = [
                { 'homeTeam.id': team },
                { 'awayTeam.id': team }
            ];
        }

        const games = await db.collection('games')
            .find(query)
            .toArray();

        const stats = {
            totalGames: games.length,
            averageScore: games.reduce((acc, game) => 
                acc + (game.homeTeam.score + game.awayTeam.score) / 2, 0) / games.length || 0,
            homeWinPercentage: games.length ? 
                (games.filter(game => game.homeTeam.score > game.awayTeam.score).length / games.length) * 100 : 0
        };

        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.close();
    }
});

// Games Endpoint
app.get('/api/games/:league', authenticateToken, async (req, res) => {
    const client = await connectDB();
    try {
        const { league } = req.params;
        const { team } = req.query;
        const db = client.db('sports-analytics');
        
        let query = { league: league.toUpperCase() };
        if (team) {
            query.$or = [
                { 'homeTeam.id': team },
                { 'awayTeam.id': team }
            ];
        }

        const games = await db.collection('games')
            .find(query)
            .sort({ date: -1 })
            .limit(20)
            .toArray();

        res.json(games);
    } catch (error) {
        console.error('Games error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.close();
    }
});

// WebSocket Connection Handling
wss.on('connection', (ws, req) => {
    const token = new URL(req.url, 'http://localhost').searchParams.get('token');
    
    if (!token) {
        ws.close(1008, 'Authentication required');
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        ws.user = decoded;
        
        console.log('WebSocket connected for user:', decoded.email);
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'subscribe') {
                    ws.league = data.league;
                    console.log(`Client subscribed to league: ${data.league}`);
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(JSON.stringify({ error: 'Invalid message format' }));
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        ws.on('close', () => {
            console.log('Client disconnected:', decoded.email);
        });
    } catch (error) {
        console.error('WebSocket auth error:', error);
        ws.close(1008, 'Invalid token');
    }
});

// Start Server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
});

module.exports = { app, server };