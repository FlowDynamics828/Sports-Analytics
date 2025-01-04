
import DataVisualizations from './dataVisualizations.js';
import LiveUpdates from './liveUpdates.js';

class DashboardManager {
    constructor() {
        this.visualizations = new DataVisualizations();
        this.liveUpdates = new LiveUpdates();
        this.initializeEventListeners();
        this.loadInitialData();
    }

    initializeEventListeners() {
        document.getElementById('leagueSelect').addEventListener('change', 
            (e) => this.handleLeagueChange(e.target.value));
        
        document.getElementById('teamSelect').addEventListener('change',
            (e) => this.handleTeamChange(e.target.value));

        document.getElementById('timeRange').addEventListener('change',
            (e) => this.handleTimeRangeChange(e.target.value));
    }

    async loadInitialData() {
        const league = document.getElementById('leagueSelect').value;
        await this.loadData(league);
    }

    async loadData(league, team = '') {
        try {
            const [stats, games] = await Promise.all([
                this.fetchStats(league, team),
                this.fetchGames(league, team)
            ]);

            this.updateDashboard(stats, games);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async fetchStats(league, team) {
        const response = await fetch(`/api/stats/${league}${team ? `?team=${team}` : ''}`);
        return response.json();
    }

    async fetchGames(league, team) {
        const response = await fetch(`/api/games/${league}${team ? `?team=${team}` : ''}`);
        return response.json();
    }

    updateDashboard(stats, games) {
        // Update stats cards
        this.updateStatsCards(stats);
        
        // Update charts
        this.visualizations.updateChartData('performance', this.prepareChartData(games));
        
        // Update recent games
        this.updateRecentGames(games);
    }

    updateStatsCards(stats) {
        document.getElementById('totalGames').textContent = stats.totalGames;
        document.getElementById('avgScore').textContent = stats.averageScore.toFixed(1);
        document.getElementById('winRate').textContent = `${stats.homeWinPercentage.toFixed(1)}%`;
    }

    prepareChartData(games) {
        // Transform games data for chart
        return {
            labels: games.map(game => new Date(game.date).toLocaleDateString()),
            datasets: [{
                label: 'Score',
                data: games.map(game => game.homeTeam.score),
                borderColor: 'rgb(59, 130, 246)',
                tension: 0.1
            }]
        };
    }

    updateRecentGames(games) {
        const container = document.getElementById('recentGames');
        container.innerHTML = games.slice(0, 5).map(game => `
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

    handleLeagueChange(league) {
        this.loadData(league);
    }

    handleTeamChange(team) {
        const league = document.getElementById('leagueSelect').value;
        this.loadData(league, team);
    }

    handleTimeRangeChange(range) {
        // Implement time range filtering
    }
}

export default DashboardManager;