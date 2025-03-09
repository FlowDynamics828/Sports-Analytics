// dashboard.js - Optimized dashboard implementation
'use strict';

// Cache DOM elements to avoid repeated queries
const elements = {
    leagueSelect: document.getElementById('leagueSelect'),
    teamSelect: document.getElementById('teamSelect'),
    totalGames: document.getElementById('totalGames'),
    avgScore: document.getElementById('avgScore'),
    winRate: document.getElementById('winRate'),
    recentGames: document.getElementById('recentGames'),
    performanceChart: document.getElementById('performanceChart'),
    gamesFilter: document.getElementById('gamesFilter'),
    chartType: document.getElementById('chartType'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    connectionStatus: document.getElementById('connectionStatus'),
    connectionText: document.getElementById('connectionText')
};

// State management
const state = {
    games: [],
    teams: [],
    selectedLeague: 'nba',
    selectedTeam: '',
    gamesLimit: 5,
    chartType: 'score',
    isLoading: false,
    chart: null,
    connectionStatus: 'connected',
    lastUpdate: null
};

// Initialize dashboard
function initDashboard() {
    // Set up event listeners
    elements.leagueSelect.addEventListener('change', handleLeagueChange);
    elements.teamSelect.addEventListener('change', handleTeamChange);
    elements.gamesFilter.addEventListener('change', handleGamesFilterChange);
    elements.chartType.addEventListener('change', handleChartTypeChange);
    
    // Initial data load
    loadLeagueData();
    
    // Set up periodic refresh (every 60 seconds)
    setInterval(refreshData, 60000);
    
    // Set up connection status check
    setInterval(checkConnection, 30000);
}

// Event handlers
function handleLeagueChange(e) {
    state.selectedLeague = e.target.value;
    state.selectedTeam = '';
    elements.teamSelect.innerHTML = '<option value="">Select Team</option>';
    loadLeagueData();
}

function handleTeamChange(e) {
    state.selectedTeam = e.target.value;
    refreshData();
}

function handleGamesFilterChange(e) {
    state.gamesLimit = parseInt(e.target.value, 10);
    updateRecentGames();
    updateChart();
}

function handleChartTypeChange(e) {
    state.chartType = e.target.value;
    updateChart();
}

// Data loading functions
function loadLeagueData() {
    setLoading(true);
    updateConnectionStatus('connecting');
    
    fetch(`/api/leagues/${state.selectedLeague}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load league data');
            return response.json();
        })
        .then(data => {
            state.teams = data.teams || [];
            populateTeamSelect();
            loadGameData();
            updateConnectionStatus('connected');
        })
        .catch(error => {
            console.error('Error loading league data:', error);
            updateConnectionStatus('error');
            setLoading(false);
        });
}

function loadGameData() {
    setLoading(true);
    
    const endpoint = state.selectedTeam 
        ? `/api/games/${state.selectedLeague}/${state.selectedTeam}`
        : `/api/games/${state.selectedLeague}`;
    
    fetch(endpoint)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load game data');
            return response.json();
        })
        .then(data => {
            // Process and store game data
            state.games = Array.isArray(data) ? data : [];
            state.lastUpdate = new Date();
            
            // Update UI components
            updateStats();
            updateRecentGames();
            updateChart();
            
            setLoading(false);
        })
        .catch(error => {
            console.error('Error loading game data:', error);
            state.games = [];
            updateStats();
            updateRecentGames();
            updateChart();
            setLoading(false);
        });
}

function refreshData() {
    // Only refresh if not already loading
    if (!state.isLoading) {
        loadGameData();
    }
}

// UI update functions
function populateTeamSelect() {
    // Clear existing options except the default
    elements.teamSelect.innerHTML = '<option value="">All Teams</option>';
    
    // Add team options
    state.teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        elements.teamSelect.appendChild(option);
    });
}

function updateStats() {
    const games = state.games;
    
    // Update total games
    elements.totalGames.textContent = games.length;
    
    // Calculate average score
    if (games.length > 0) {
        const totalHomeScore = games.reduce((sum, game) => sum + (game.homeTeam?.score || 0), 0);
        const totalAwayScore = games.reduce((sum, game) => sum + (game.awayTeam?.score || 0), 0);
        const avgScore = (totalHomeScore + totalAwayScore) / (games.length * 2);
        elements.avgScore.textContent = avgScore.toFixed(1);
        
        // Calculate home win rate
        const homeWins = games.filter(game => (game.homeTeam?.score || 0) > (game.awayTeam?.score || 0)).length;
        const winRate = (homeWins / games.length) * 100;
        elements.winRate.textContent = winRate.toFixed(1) + '%';
    } else {
        elements.avgScore.textContent = '-';
        elements.winRate.textContent = '-';
    }
}

function updateRecentGames() {
    const container = elements.recentGames;
    const games = state.games.slice(0, state.gamesLimit);
    
    // Clear container
    container.innerHTML = '';
    
    if (games.length === 0) {
        container.innerHTML = '<div class="text-center p-4">No games found</div>';
        return;
    }
    
    // Create game elements
    games.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors mb-4';
        
        const gameDate = new Date(game.date).toLocaleDateString();
        
        gameElement.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="text-lg">
                    <div class="font-bold">${game.homeTeam?.name || 'Home Team'}</div>
                    <div class="text-2xl">${game.homeTeam?.score || '0'}</div>
                </div>
                <div class="text-gray-400 mx-4">VS</div>
                <div class="text-lg text-right">
                    <div class="font-bold">${game.awayTeam?.name || 'Away Team'}</div>
                    <div class="text-2xl">${game.awayTeam?.score || '0'}</div>
                </div>
            </div>
            <div class="text-sm text-gray-400 mt-2">${gameDate}</div>
        `;
        
        container.appendChild(gameElement);
    });
}

function updateChart() {
    const canvas = elements.performanceChart;
    const games = state.games.slice(0, state.gamesLimit);
    
    // Destroy existing chart if it exists
    if (state.chart) {
        state.chart.destroy();
    }
    
    if (games.length === 0) {
        return;
    }
    
    // Prepare data based on chart type
    const labels = games.map(game => new Date(game.date).toLocaleDateString());
    let datasets = [];
    
    if (state.chartType === 'score') {
        datasets = [
            {
                label: 'Home Score',
                data: games.map(game => game.homeTeam?.score || 0),
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                tension: 0.1
            },
            {
                label: 'Away Score',
                data: games.map(game => game.awayTeam?.score || 0),
                borderColor: 'rgba(239, 68, 68, 1)',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                tension: 0.1
            }
        ];
    } else {
        // Point differential
        datasets = [
            {
                label: 'Point Differential',
                data: games.map(game => (game.homeTeam?.score || 0) - (game.awayTeam?.score || 0)),
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                tension: 0.1
            }
        ];
    }
    
    // Create new chart
    state.chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: state.chartType === 'differential',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            }
        }
    });
}

// Utility functions
function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
}

function updateConnectionStatus(status) {
    state.connectionStatus = status;
    
    switch(status) {
        case 'connected':
            elements.connectionStatus.className = 'text-green-500 mr-2';
            elements.connectionText.textContent = 'Connected';
            break;
        case 'disconnected':
            elements.connectionStatus.className = 'text-red-500 mr-2';
            elements.connectionText.textContent = 'Disconnected';
            break;
        case 'connecting':
            elements.connectionStatus.className = 'text-yellow-500 mr-2';
            elements.connectionText.textContent = 'Connecting...';
            break;
        case 'error':
            elements.connectionStatus.className = 'text-red-500 mr-2';
            elements.connectionText.textContent = 'Connection Error';
            break;
    }
}

function checkConnection() {
    // Simple ping to check if API is responsive
    fetch('/api/health')
        .then(response => {
            if (response.ok) {
                updateConnectionStatus('connected');
            } else {
                updateConnectionStatus('error');
            }
        })
        .catch(() => {
            updateConnectionStatus('disconnected');
        });
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);

// Memory management - clean up event listeners when page unloads
window.addEventListener('beforeunload', () => {
    // Remove event listeners
    elements.leagueSelect.removeEventListener('change', handleLeagueChange);
    elements.teamSelect.removeEventListener('change', handleTeamChange);
    elements.gamesFilter.removeEventListener('change', handleGamesFilterChange);
    elements.chartType.removeEventListener('change', handleChartTypeChange);
    
    // Destroy chart
    if (state.chart) {
        state.chart.destroy();
    }
    
    // Clear state
    Object.keys(state).forEach(key => {
        if (Array.isArray(state[key])) {
            state[key] = [];
        } else if (typeof state[key] === 'object' && state[key] !== null) {
            state[key] = null;
        }
    });
});// dashboard.js - Optimized dashboard implementation
'use strict';

// Cache DOM elements to avoid repeated queries
const elements = {
    leagueSelect: document.getElementById('leagueSelect'),
    teamSelect: document.getElementById('teamSelect'),
    totalGames: document.getElementById('totalGames'),
    avgScore: document.getElementById('avgScore'),
    winRate: document.getElementById('winRate'),
    recentGames: document.getElementById('recentGames'),
    performanceChart: document.getElementById('performanceChart'),
    gamesFilter: document.getElementById('gamesFilter'),
    chartType: document.getElementById('chartType'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    connectionStatus: document.getElementById('connectionStatus'),
    connectionText: document.getElementById('connectionText')
};

// State management
const state = {
    games: [],
    teams: [],
    selectedLeague: 'nba',
    selectedTeam: '',
    gamesLimit: 5,
    chartType: 'score',
    isLoading: false,
    chart: null,
    connectionStatus: 'connected',
    lastUpdate: null
};

// Initialize dashboard
function initDashboard() {
    // Set up event listeners
    elements.leagueSelect.addEventListener('change', handleLeagueChange);
    elements.teamSelect.addEventListener('change', handleTeamChange);
    elements.gamesFilter.addEventListener('change', handleGamesFilterChange);
    elements.chartType.addEventListener('change', handleChartTypeChange);
    
    // Initial data load
    loadLeagueData();
    
    // Set up periodic refresh (every 60 seconds)
    setInterval(refreshData, 60000);
    
    // Set up connection status check
    setInterval(checkConnection, 30000);
}

// Event handlers
function handleLeagueChange(e) {
    state.selectedLeague = e.target.value;
    state.selectedTeam = '';
    elements.teamSelect.innerHTML = '<option value="">Select Team</option>';
    loadLeagueData();
}

function handleTeamChange(e) {
    state.selectedTeam = e.target.value;
    refreshData();
}

function handleGamesFilterChange(e) {
    state.gamesLimit = parseInt(e.target.value, 10);
    updateRecentGames();
    updateChart();
}

function handleChartTypeChange(e) {
    state.chartType = e.target.value;
    updateChart();
}

// Data loading functions
function loadLeagueData() {
    setLoading(true);
    updateConnectionStatus('connecting');
    
    fetch(`/api/leagues/${state.selectedLeague}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load league data');
            return response.json();
        })
        .then(data => {
            state.teams = data.teams || [];
            populateTeamSelect();
            loadGameData();
            updateConnectionStatus('connected');
        })
        .catch(error => {
            console.error('Error loading league data:', error);
            updateConnectionStatus('error');
            setLoading(false);
        });
}

function loadGameData() {
    setLoading(true);
    
    const endpoint = state.selectedTeam 
        ? `/api/games/${state.selectedLeague}/${state.selectedTeam}`
        : `/api/games/${state.selectedLeague}`;
    
    fetch(endpoint)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load game data');
            return response.json();
        })
        .then(data => {
            // Process and store game data
            state.games = Array.isArray(data) ? data : [];
            state.lastUpdate = new Date();
            
            // Update UI components
            updateStats();
            updateRecentGames();
            updateChart();
            
            setLoading(false);
        })
        .catch(error => {
            console.error('Error loading game data:', error);
            state.games = [];
            updateStats();
            updateRecentGames();
            updateChart();
            setLoading(false);
        });
}

function refreshData() {
    // Only refresh if not already loading
    if (!state.isLoading) {
        loadGameData();
    }
}

// UI update functions
function populateTeamSelect() {
    // Clear existing options except the default
    elements.teamSelect.innerHTML = '<option value="">All Teams</option>';
    
    // Add team options
    state.teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        elements.teamSelect.appendChild(option);
    });
}

function updateStats() {
    const games = state.games;
    
    // Update total games
    elements.totalGames.textContent = games.length;
    
    // Calculate average score
    if (games.length > 0) {
        const totalHomeScore = games.reduce((sum, game) => sum + (game.homeTeam?.score || 0), 0);
        const totalAwayScore = games.reduce((sum, game) => sum + (game.awayTeam?.score || 0), 0);
        const avgScore = (totalHomeScore + totalAwayScore) / (games.length * 2);
        elements.avgScore.textContent = avgScore.toFixed(1);
        
        // Calculate home win rate
        const homeWins = games.filter(game => (game.homeTeam?.score || 0) > (game.awayTeam?.score || 0)).length;
        const winRate = (homeWins / games.length) * 100;
        elements.winRate.textContent = winRate.toFixed(1) + '%';
    } else {
        elements.avgScore.textContent = '-';
        elements.winRate.textContent = '-';
    }
}

function updateRecentGames() {
    const container = elements.recentGames;
    const games = state.games.slice(0, state.gamesLimit);
    
    // Clear container
    container.innerHTML = '';
    
    if (games.length === 0) {
        container.innerHTML = '<div class="text-center p-4">No games found</div>';
        return;
    }
    
    // Create game elements
    games.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors mb-4';
        
        const gameDate = new Date(game.date).toLocaleDateString();
        
        gameElement.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="text-lg">
                    <div class="font-bold">${game.homeTeam?.name || 'Home Team'}</div>
                    <div class="text-2xl">${game.homeTeam?.score || '0'}</div>
                </div>
                <div class="text-gray-400 mx-4">VS</div>
                <div class="text-lg text-right">
                    <div class="font-bold">${game.awayTeam?.name || 'Away Team'}</div>
                    <div class="text-2xl">${game.awayTeam?.score || '0'}</div>
                </div>
            </div>
            <div class="text-sm text-gray-400 mt-2">${gameDate}</div>
        `;
        
        container.appendChild(gameElement);
    });
}

function updateChart() {
    const canvas = elements.performanceChart;
    const games = state.games.slice(0, state.gamesLimit);
    
    // Destroy existing chart if it exists
    if (state.chart) {
        state.chart.destroy();
    }
    
    if (games.length === 0) {
        return;
    }
    
    // Prepare data based on chart type
    const labels = games.map(game => new Date(game.date).toLocaleDateString());
    let datasets = [];
    
    if (state.chartType === 'score') {
        datasets = [
            {
                label: 'Home Score',
                data: games.map(game => game.homeTeam?.score || 0),
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                tension: 0.1
            },
            {
                label: 'Away Score',
                data: games.map(game => game.awayTeam?.score || 0),
                borderColor: 'rgba(239, 68, 68, 1)',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                tension: 0.1
            }
        ];
    } else {
        // Point differential
        datasets = [
            {
                label: 'Point Differential',
                data: games.map(game => (game.homeTeam?.score || 0) - (game.awayTeam?.score || 0)),
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                tension: 0.1
            }
        ];
    }
    
    // Create new chart
    state.chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: state.chartType === 'differential',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            }
        }
    });
}

// Utility functions
function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
}

function updateConnectionStatus(status) {
    state.connectionStatus = status;
    
    switch(status) {
        case 'connected':
            elements.connectionStatus.className = 'text-green-500 mr-2';
            elements.connectionText.textContent = 'Connected';
            break;
        case 'disconnected':
            elements.connectionStatus.className = 'text-red-500 mr-2';
            elements.connectionText.textContent = 'Disconnected';
            break;
        case 'connecting':
            elements.connectionStatus.className = 'text-yellow-500 mr-2';
            elements.connectionText.textContent = 'Connecting...';
            break;
        case 'error':
            elements.connectionStatus.className = 'text-red-500 mr-2';
            elements.connectionText.textContent = 'Connection Error';
            break;
    }
}

function checkConnection() {
    // Simple ping to check if API is responsive
    fetch('/api/health')
        .then(response => {
            if (response.ok) {
                updateConnectionStatus('connected');
            } else {
                updateConnectionStatus('error');
            }
        })
        .catch(() => {
            updateConnectionStatus('disconnected');
        });
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);

// Memory management - clean up event listeners when page unloads
window.addEventListener('beforeunload', () => {
    // Remove event listeners
    elements.leagueSelect.removeEventListener('change', handleLeagueChange);
    elements.teamSelect.removeEventListener('change', handleTeamChange);
    elements.gamesFilter.removeEventListener('change', handleGamesFilterChange);
    elements.chartType.removeEventListener('change', handleChartTypeChange);
    
    // Destroy chart
    if (state.chart) {
        state.chart.destroy();
    }
    
    // Clear state
    Object.keys(state).forEach(key => {
        if (Array.isArray(state[key])) {
            state[key] = [];
        } else if (typeof state[key] === 'object' && state[key] !== null) {
            state[key] = null;
        }
    });
});let selectedTeam = '';
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