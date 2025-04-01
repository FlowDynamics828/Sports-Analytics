const axios = require('axios');
const assert = require('assert');

const BASE_URL = 'http://localhost:5050/api';
const TEST_USER = {
    email: 'test@example.com',
    password: 'testpassword123'
};

async function runTests() {
    try {
        console.log('Starting endpoint tests...');

        // Login to get token
        console.log('Testing authentication...');
        const authResponse = await axios.post(`${BASE_URL}/auth/login`, TEST_USER);
        const token = authResponse.data.token;
        console.log('Authentication successful');

        // Set up headers for authenticated requests
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // Test teams endpoint
        console.log('\nTesting teams endpoint...');
        const teamsResponse = await axios.get(`${BASE_URL}/teams`, { headers });
        console.log(`Found ${teamsResponse.data.count || teamsResponse.data.data.length} teams`);

        // Test players endpoint
        console.log('\nTesting players endpoint...');
        const playersResponse = await axios.get(`${BASE_URL}/players`, { headers });
        console.log(`Found ${playersResponse.data.count || playersResponse.data.data.length} players`);

        // Test games endpoint
        console.log('\nTesting games endpoint...');
        const gamesResponse = await axios.get(`${BASE_URL}/games`, { headers });
        console.log(`Found ${gamesResponse.data.count || gamesResponse.data.data.length} games`);

        // Test stats endpoint
        console.log('\nTesting stats endpoint...');
        const statsResponse = await axios.get(`${BASE_URL}/stats`, { headers });
        console.log('Stats endpoint working');

        console.log('\nAll tests completed successfully!');

    } catch (error) {
        console.error('Test failed:', error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

runTests(); 