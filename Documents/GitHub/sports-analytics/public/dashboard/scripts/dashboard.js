let selectedTeam = '';
let currentGames = [];
let ws;
let currentChart = null;

// Loading State Management
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

// Error Handling
function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="bg-red-500/10 border border-red-500 rounded-lg p-4 col-span-full">
                <p class="text-red-500">${message}</p>
                <button onclick="retryLoad()" class="mt-2 text-blue-400 hover:text-blue-300">
                    Try Again
                </button>
            </div>
        `;
    }
}

async function retryLoad() {
    const league = document.getElementById('leagueSelect').value;
    await Promise.all([
        loadTeams(league),
        loadStats(league, selectedTeam),
        loadGames(league, selectedTeam)
    ]);
}

// Data Loading Functions
async function loadTeams(league) {
    showLoading();
    try {
        console.log('Loading teams for league:', league);
        const response = await fetch(`/api/leagues/${league.toLowerCase()}/teams`);
        if (!response.ok) throw new Error('Failed to load teams');
        
        const teams = await response.json();
        console.log('Teams loaded:', teams);
        const teamSelect = document.getElementById('teamSelect');
        teamSelect.innerHTML = '<option value="">All Teams</option>' +
            teams.map(team => `<option value="${team.id}">${team.name}</option>`).join('');
    } catch (error) {
        console.error('Teams error:', error);
        showError('teamSelect', 'Failed to load teams');
    } finally {
        hideLoading();
    }
}

async function loadStats(league, team = '') {
    try {
        console.log('Loading stats for:', league, team);
        const response = await fetch(`/api/stats/${league.toUpperCase()}${team ? `?team=${team}` : ''}`);
        if (!response.ok) throw new Error('Failed to load statistics');
        
        const stats = await response.json();
        console.log('Stats received:', stats);
        updateDashboardStats(stats);
    } catch (error) {
        console.error('Stats error:', error);
        showError('stats-container', 'Failed to load statistics');
    }
}

function updateDashboardStats(stats) {
    if (!stats) return;
    
    const elements = {
        'totalGames': stats.totalGames || '-',
        'avgScore': stats.averageScore ? stats.averageScore.toFixed(1) : '-',
        'winRate': stats.homeWinPercentage ? `${stats.homeWinPercentage.toFixed(1)}%` : '-'
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
}

async function loadGames(league, team = '') {
    showLoading();
    try {
        console.log('Loading games for:', league, team);
        const response = await fetch(`/api/games/${league.toUpperCase()}${team ? `?team=${team}` : ''}`);
        if (!response.ok) throw new Error('Failed to load games');
        
        const games = await response.json();
        console.log('Games loaded:', games);
        currentGames = games;
        displayGames(games);
        updateChart(games);
    } catch (error) {
        console.error('Games error:', error);
        showError('recentGames', 'Failed to load recent games');
    } finally {
        hideLoading();
    }
}

function displayGames(games) {
    const container = document.getElementById('recentGames');
    if (!container) return;

    if (!games || !games.length) {
        container.innerHTML = '<div class="text-gray-400 text-center">No games available</div>';
        return;
    }

    const limit = parseInt(document.getElementById('gamesFilter').value);
    container.innerHTML = games.slice(0, limit).map(game => `
        <div class="bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors">
            <div class="flex justify-between items-center">
                <div class="text-lg">
                    <div class="font-bold">${game.homeTeam.name}</div>
                    <div class="text-2xl">${game.homeTeam.score || '-'}</div>
                </div>
                <div class="text-gray-400 mx-4">VS</div>
                <div class="text-lg text-right">
                    <div class="font-bold">${game.awayTeam.name}</div>
                    <div class="text-2xl">${game.awayTeam.score || '-'}</div>
                </div>
            </div>
            <div class="text-sm text-gray-400 mt-2">
                ${new Date(game.date).toLocaleDateString()}
            </div>
        </div>
    `).join('');
}

function updateChart(games) {
    const canvas = document.getElementById('performanceChart');
    if (!canvas) return;

    if (currentChart) {
        currentChart.destroy();
    }

    if (!games || !games.length) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const chartType = document.getElementById('chartType').value;
    
    const datasets = chartType === 'score' ? [
        {
            label: 'Home Team Score',
            data: games.map(game => game.homeTeam.score),
            borderColor: 'rgb(59, 130, 246)',
            tension: 0.1
        }, 
        {
            label: 'Away Team Score',
            data: games.map(game => game.awayTeam.score),
            borderColor: 'rgb(239, 68, 68)',
            tension: 0.1
        }
    ] : [
        {
            label: 'Point Differential',
            data: games.map(game => game.homeTeam.score - game.awayTeam.score),
            borderColor: 'rgb(59, 130, 246)',
            tension: 0.1,
            fill: true
        }
    ];

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: games.map(game => new Date(game.date).toLocaleDateString()),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: 'white' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'white' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'white' }
                }
            }
        }
    });
}

function connectWebSocket() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('No authentication token found');
        return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}?token=${token}`);
    
    ws.onopen = () => {
        updateConnectionStatus('connected');
        subscribeToLeague(document.getElementById('leagueSelect').value);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    ws.onclose = (event) => {
        updateConnectionStatus('disconnected');
        if (event.code !== 1000) {
            setTimeout(connectWebSocket, 3000);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('error');
    };
}

function updateConnectionStatus(status) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');
    
    const states = {
        connected: { class: 'text-green-500', text: 'Connected' },
        disconnected: { class: 'text-red-500', text: 'Disconnected' },
        error: { class: 'text-red-500', text: 'Error' }
    };

    const state = states[status];
    if (state && statusDot && statusText) {
        statusDot.className = `${state.class} mr-2`;
        statusText.textContent = state.text;
    }
}

function handleWebSocketMessage(data) {
    if (data.type === 'update') {
        const league = document.getElementById('leagueSelect').value;
        loadStats(league, selectedTeam);
        loadGames(league, selectedTeam);
    }
}

function subscribeToLeague(league) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: 'subscribe', 
            league 
        }));
    }
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Initialize event listeners
    document.getElementById('leagueSelect')?.addEventListener('change', (e) => {
        const league = e.target.value;
        console.log('League changed to:', league);
        loadTeams(league);
        loadStats(league, selectedTeam);
        loadGames(league, selectedTeam);
        subscribeToLeague(league);
    });

    document.getElementById('teamSelect')?.addEventListener('change', (e) => {
        selectedTeam = e.target.value;
        console.log('Team selected:', selectedTeam);
        const league = document.getElementById('leagueSelect').value;
        loadStats(league, selectedTeam);
        loadGames(league, selectedTeam);
    });

    document.getElementById('gamesFilter')?.addEventListener('change', () => {
        displayGames(currentGames);
    });

    document.getElementById('chartType')?.addEventListener('change', () => {
        updateChart(currentGames);
    });

    // Initialize dashboard
    const initialLeague = 'nba';
    console.log('Initializing dashboard with league:', initialLeague);
    loadTeams(initialLeague);
    loadStats(initialLeague);
    loadGames(initialLeague);
    connectWebSocket();
});