// public/dashboard/scripts/dashboard.js
let selectedTeam = '';
let currentGames = [];
let currentChart = null;

function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

async function loadTeams(league) {
    showLoading();
    try {
        const response = await fetch(`/api/leagues/${league}/teams`);
        if (response.ok) {
            const teams = await response.json();
            const teamSelect = document.getElementById('teamSelect');
            teamSelect.innerHTML = '<option value="">All Teams</option>' +
                teams.map(team => `<option value="${team.id}">${team.name}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading teams:', error);
    } finally {
        hideLoading();
    }
}

async function loadStats(league, team = '') {
    try {
        const response = await fetch(`/api/stats/${league}${team ? `?team=${team}` : ''}`);
        if (response.ok) {
            const stats = await response.json();
            updateDashboardStats(stats);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function updateDashboardStats(stats) {
    if (!stats) return;
    
    document.getElementById('totalGames').textContent = stats.totalGames || '-';
    document.getElementById('avgScore').textContent = 
        stats.averageScore ? stats.averageScore.toFixed(1) : '-';
    document.getElementById('winRate').textContent = 
        stats.homeWinPercentage ? `${stats.homeWinPercentage.toFixed(1)}%` : '-';
}

async function loadGames(league, team = '') {
    showLoading();
    try {
        const response = await fetch(`/api/games/${league}${team ? `?team=${team}` : ''}`);
        if (response.ok) {
            const games = await response.json();
            currentGames = games;
            displayGames(games);
            updateChart(games);
        }
    } catch (error) {
        console.error('Error loading games:', error);
    } finally {
        hideLoading();
    }
}

function displayGames(games) {
    if (!games || !games.length) {
        document.getElementById('recentGames').innerHTML = 
            '<div class="text-gray-400 text-center">No games available</div>';
        return;
    }

    const limit = parseInt(document.getElementById('gamesFilter').value);
    const container = document.getElementById('recentGames');
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
                ${new Date(game.date).toLocaleDateString()} - 
                ${game.venue || 'Home Game'}
            </div>
        </div>
    `).join('');
}

function updateChart(games) {
    if (currentChart) {
        currentChart.destroy();
    }

    if (!games || !games.length) {
        return;
    }

    const ctx = document.getElementById('performanceChart').getContext('2d');
    const chartType = document.getElementById('chartType').value;
    
    let datasets = [];
    if (chartType === 'score') {
        datasets = [{
            label: 'Home Team Score',
            data: games.map(game => game.homeTeam.score),
            borderColor: 'rgb(59, 130, 246)',
            tension: 0.1
        }, {
            label: 'Away Team Score',
            data: games.map(game => game.awayTeam.score),
            borderColor: 'rgb(239, 68, 68)',
            tension: 0.1
        }];
    } else {
        datasets = [{
            label: 'Point Differential',
            data: games.map(game => game.homeTeam.score - game.awayTeam.score),
            borderColor: 'rgb(59, 130, 246)',
            tension: 0.1,
            fill: true
        }];
    }

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
                    labels: {
                        color: 'white'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'white'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'white'
                    }
                }
            }
        }
    });
}

// Event Listeners
document.getElementById('leagueSelect').addEventListener('change', (e) => {
    const league = e.target.value;
    loadTeams(league);
    loadStats(league, selectedTeam);
    loadGames(league, selectedTeam);
    subscribeToLeague(league);
});

document.getElementById('teamSelect').addEventListener('change', (e) => {
    selectedTeam = e.target.value;
    const league = document.getElementById('leagueSelect').value;
    loadStats(league, selectedTeam);
    loadGames(league, selectedTeam);
});

document.getElementById('gamesFilter').addEventListener('change', () => {
    displayGames(currentGames);
});

document.getElementById('chartType').addEventListener('change', () => {
    updateChart(currentGames);
});

// Initialize dashboard data
loadTeams('nba');
loadStats('nba');
loadGames('nba');});

// Initialize dashboard
loadTeams('nba');
loadStats('nba');
loadGames('nba');