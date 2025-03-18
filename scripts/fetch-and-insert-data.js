require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-analytics';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';
const SPORTS_API_URL = process.env.SPORTS_API_URL;
const SPORTS_API_KEY = process.env.SPORTS_API_KEY;

async function fetchData(endpoint) {
    try {
        const response = await axios.get(`${SPORTS_API_URL}/${endpoint}`, {
            headers: {
                'Ocp-Apim-Subscription-Key': SPORTS_API_KEY
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        throw error;
    }
}

async function insertData(collectionName, data) {
    const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(DB_NAME);
        const collection = db.collection(collectionName);
        await collection.insertMany(data);
        console.log(`Inserted data into ${collectionName}`);
    } catch (error) {
        console.error(`Error inserting data into ${collectionName}:`, error);
        throw error;
    } finally {
        await client.close();
        console.log('MongoDB connection closed');
    }
}

async function main() {
    const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const endpoints = [
            { name: 'nfl_player_stats', endpoint: 'nfl/player-stats' },
            { name: 'nba_player_stats', endpoint: 'nba/player-stats' },
            { name: 'mlb_player_stats', endpoint: 'mlb/player-stats' },
            { name: 'nhl_player_stats', endpoint: 'nhl/player-stats' },
            { name: 'premier_league_player_stats', endpoint: 'premier-league/player-stats' },
            { name: 'la_liga_player_stats', endpoint: 'la-liga/player-stats' },
            { name: 'bundesliga_player_stats', endpoint: 'bundesliga/player-stats' },
            { name: 'serie_a_player_stats', endpoint: 'serie-a/player-stats' },
            { name: 'teams', endpoint: 'teams' }
        ];

        for (const { name, endpoint } of endpoints) {
            const data = await fetchData(endpoint);
            await insertData(name, data);
        }

        console.log('Data fetching and insertion completed successfully.');
    } catch (error) {
        console.error('Error in data fetching and insertion process:', error);
    } finally {
        await client.close();
        console.log('MongoDB connection closed');
    }
}

main();
