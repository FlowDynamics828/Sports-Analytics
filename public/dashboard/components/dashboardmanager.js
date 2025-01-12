class DashboardManager {
    constructor() {
        this.selectedLeague = 'nba';
        this.selectedTeam = '';
        this.chart = null;
        this.ws = null;
        this.initializeEventListeners();
        this.connectWebSocket();
        this.loadDashboardData();
    }

    initializeEventListeners() {
        // League selection
        document.getElementById('leagueSelect').addEventListener('change', (e) => {
            console.log('League changed to:', e.target.value);
            this.selectedLeague = e.target.value;
            this.loadTeams();
            this.loadDashboardData();
        });

        // Team selection
        document.getElementById('teamSelect').addEventListener('change', (e) => {
            console.log('Team changed to:', e.target.value);
            this.selectedTeam = e.target.value;
            this.loadDashboardData();
        });

        // Games filter
        document.getElementById('gamesFilter').addEventListener('change', () => {
            this.loadDashboardData();
        });
    }

    async loadTeams() {
        try {
            const response = await fetch(`/api/leagues/${this.selectedLeague}/teams`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) throw new Error('Failed to load teams');

            const teams = await response.json();
            this.updateTeamSelect(teams);
        } catch (error) {
            console.error('Error loading teams:', error);
        }
    }

    updateTeamSelect(teams) {
        const teamSelect = document.getElementById('teamSelect');
        teamSelect.innerHTML = '<option value="">All Teams</option>' +
            teams.map(team => `<option value="${team.id}">${team.name}</option>`).join('');
    }

    async loadDashboardData() {
        try {
            document.getElementById('loadingOverlay').classList.remove('hidden');

            const [stats, games] = await Promise.all([
                this.fetchStats(),
                this.fetchGames()
            ]);

            this.updateStats(stats);
            this.updateGames(games);
            this.updateChart(games);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            document.getElementById('loadingOverlay').classList.add('hidden');
        }
    }

    async fetchStats() {
        const response = await fetch(`/api/stats/${this.selectedLeague}${this.selectedTeam ? `?team=${this.selectedTeam}` : ''}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch stats');
        return response.json();
    }

    async fetchGames() {
        const response = await fetch(`/api/games/${this.selectedLeague}${this.selectedTeam ? `?team=${this.selectedTeam}` : ''}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch games');
        return response.json();
    }

    updateStats(stats) {
        document.getElementById('totalGames').textContent = stats.totalGames || '-';
        document.getElementById('avgScore').textContent = stats.averageScore ? stats.averageScore.toFixed(1) : '-';
        document.getElementById('winRate').textContent = stats.homeWinPercentage ? `${stats.homeWinPercentage.toFixed(1)}%` : '-';
    }

    updateGames(games) {
        const gamesContainer = document.getElementById('recentGames');
        const limit = parseInt(document.getElementById('gamesFilter').value);

        if (!games.length) {
            gamesContainer.innerHTML = '<div class="text-gray-400 text-center">No games available</div>';
            return;
        }

        gamesContainer.innerHTML = games.slice(0, limit).map(game => `
            <div class="bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors">
                <div class="flex justify-between items-center">
                    <div class="text-lg">
                        <div class="font-bold">${game.homeTeam.name}</div>
                        <div class="text-2xl">${game.homeTeam.score}</div>
                    </div>
                    <div class="text-gray-400 mx-4">VS</div>
                    <div class="text-lg text-right">
                        <div class="font-bold">${game.awayTeam.name}</div>
                        <div class="text-2xl">${game.awayTeam.score}</div>
                    </div>
                </div>
                <div class="text-sm text-gray-400 mt-2">
                    ${new Date(game.date).toLocaleDateString()}
                </div>
            </div>
        `).join('');
    }

    updateChart(games) {
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: games.map(game => new Date(game.date).toLocaleDateString()),
                datasets: [{
                    label: 'Home Score',
                    data: games.map(game => game.homeTeam.score),
                    borderColor: 'rgb(59, 130, 246)',
                    tension: 0.1
                }, {
                    label: 'Away Score',
                    data: games.map(game => game.awayTeam.score),
                    borderColor: 'rgb(239, 68, 68)',
                    tension: 0.1
                }]
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

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.ws.send(JSON.stringify({ 
                type: 'subscribe', 
                league: this.selectedLeague 
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'gameUpdate') {
                this.loadDashboardData();
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected, attempting to reconnect...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }
}

export default DashboardManager;