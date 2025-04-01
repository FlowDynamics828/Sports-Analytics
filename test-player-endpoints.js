const { default: axios } = require('axios');
const assert = require('assert');

const BASE_URL = 'http://localhost:5050/api';
const TEST_CREDENTIALS = {
    email: 'test@example.com',
    password: 'testpassword123'
};

async function runTests() {
    try {
        console.log('Starting player endpoint tests...');

        // Login to get auth token
        console.log('Authenticating...');
        const authResponse = await axios.post(`${BASE_URL}/auth/login`, TEST_CREDENTIALS);
        const token = authResponse.data.token;
        
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // Test getting all players
        console.log('\nTesting GET /api/players');
        const allPlayersResponse = await axios.get(`${BASE_URL}/players`, { headers });
        assert(allPlayersResponse.data.success, 'Failed to fetch all players');
        console.log(`Found ${allPlayersResponse.data.data.length} players`);

        // Test filtering players by league
        console.log('\nTesting GET /api/players?league=NBA');
        const nbaPlayersResponse = await axios.get(`${BASE_URL}/players?league=NBA`, { headers });
        assert(nbaPlayersResponse.data.success, 'Failed to fetch NBA players');
        console.log(`Found ${nbaPlayersResponse.data.data.length} NBA players`);

        // Test getting a specific player
        if (allPlayersResponse.data.data.length > 0) {
            const testPlayer = allPlayersResponse.data.data[0];
            console.log(`\nTesting GET /api/players/${testPlayer.id}`);
            const playerResponse = await axios.get(`${BASE_URL}/players/${testPlayer.id}`, { headers });
            assert(playerResponse.data.success, 'Failed to fetch specific player');
            console.log(`Successfully fetched player: ${playerResponse.data.data.name}`);

            // Test getting player stats
            console.log(`\nTesting GET /api/players/${testPlayer.id}/stats`);
            const statsResponse = await axios.get(`${BASE_URL}/players/${testPlayer.id}/stats`, { headers });
            assert(statsResponse.data.success, 'Failed to fetch player stats');
            console.log('Successfully fetched player stats');
        }

        console.log('\nAll tests passed successfully! ✅');
    } catch (error) {
        console.error('\n❌ Test failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

runTests(); 