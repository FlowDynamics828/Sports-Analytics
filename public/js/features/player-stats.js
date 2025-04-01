import { Logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { apiClient } from '../utils/apiClient.js';

export default class PlayerStats {
    constructor() {
        this.container = document.getElementById('player-stats-content');
        this.currentLeague = null;
        this.selectedTeam = null;
        this.selectedPlayer = null;
        this.isLoading = false;
        this.stats = [];
        this.chart = null;
        this.statType = 'basic'; // 'basic' or 'advanced'
    }

    async initialize() {
        try {
            Logger.info('Initializing player stats module');
            
            // Subscribe to relevant events
            eventBus.subscribe('league:changed', this.handleLeagueChange.bind(this));
            eventBus.subscribe('team:selected', this.handleTeamSelection.bind(this));
            
            // Create player stats container
            this.createContainer();
            
            // Load initial data
            await this.loadData();
            
            Logger.info('Player stats module initialized');
        } catch (error) {
            Logger.error('Failed to initialize player stats:', { error });
            this.handleError(error);
        }
    }

    createContainer() {
        this.container.innerHTML = `
            <div class="relative">
                <div class="flex justify-between items-center mb-4">
                    <div class="space-y-1">
                        <h3 class="text-lg font-semibold text-gray-200">Player Statistics</h3>
                        <p class="text-sm text-gray-400">Detailed player performance metrics</p>
                    </div>
                    <div class="flex space-x-2">
                        <select id="playerSelect" class="bg-gray-700 text-white px-3 py-1 rounded-md">
                            <option value="">Select Player</option>
                        </select>
                        <div class="flex rounded-md overflow-hidden">
                            <button id="basicStats" class="px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                Basic
                            </button>
                            <button id="advancedStats" class="px-3 py-1 bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                                Advanced
                            </button>
                        </div>
                    </div>
                </div>
                <div id="playerStatsContent" class="bg-gray-800 rounded-lg p-4">
                    <div class="text-center text-gray-400 py-8">
                        Select a player to view their statistics
                    </div>
                </div>
                <div id="playerStatsLoading" class="absolute inset-0 bg-gray-900/50 flex items-center justify-center hidden">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            </div>
        `;

        // Add event listeners
        document.getElementById('playerSelect').addEventListener('change', this.handlePlayerSelection.bind(this));
        document.getElementById('basicStats').addEventListener('click', () => this.switchStatType('basic'));
        document.getElementById('advancedStats').addEventListener('click', () => this.switchStatType('advanced'));
    }

    async loadData() {
        if (!this.selectedTeam) return;

        try {
            this.setLoading(true);
            
            const data = await apiClient.get('/api/player-stats', {
                league: this.currentLeague,
                team: this.selectedTeam,
                player: this.selectedPlayer,
                type: this.statType
            });
            
            this.stats = data.stats;
            
            if (this.selectedPlayer) {
                this.renderPlayerStats();
            } else {
                this.updatePlayerList(data.players);
            }
            
        } catch (error) {
            Logger.error('Failed to load player stats:', { error });
            this.handleError(error);
        } finally {
            this.setLoading(false);
        }
    }

    updatePlayerList(players) {
        const select = document.getElementById('playerSelect');
        select.innerHTML = `
            <option value="">Select Player</option>
            ${players.map(player => `
                <option value="${player.id}">${player.name} - #${player.number}</option>
            `).join('')}
        `;
    }

    renderPlayerStats() {
        if (!this.stats || !this.selectedPlayer) return;

        const content = document.getElementById('playerStatsContent');
        const player = this.stats.player;
        const stats = this.stats.statistics;

        content.innerHTML = `
            <div class="flex flex-col md:flex-row gap-6">
                <!-- Player Info -->
                <div class="md:w-1/3">
                    <div class="bg-gray-700 rounded-lg p-4">
                        <div class="flex items-center space-x-4">
                            <img src="${player.photo}" alt="${player.name}" 
                                 class="w-20 h-20 rounded-full object-cover">
                            <div>
                                <h4 class="text-xl font-medium text-gray-200">${player.name}</h4>
                                <p class="text-gray-400">#${player.number} - ${player.position}</p>
                            </div>
                        </div>
                        <div class="mt-4 grid grid-cols-2 gap-2 text-sm">
                            <div class="text-gray-400">Height:</div>
                            <div class="text-gray-200">${player.height}</div>
                            <div class="text-gray-400">Weight:</div>
                            <div class="text-gray-200">${player.weight}</div>
                            <div class="text-gray-400">Age:</div>
                            <div class="text-gray-200">${player.age}</div>
                            <div class="text-gray-400">Experience:</div>
                            <div class="text-gray-200">${player.experience} years</div>
                        </div>
                    </div>
                </div>

                <!-- Stats -->
                <div class="md:w-2/3">
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                        ${this.renderStatCards(stats)}
                    </div>
                    
                    <!-- Chart -->
                    <div class="mt-6 bg-gray-700 rounded-lg p-4">
                        <canvas id="playerStatsChart" class="w-full h-64"></canvas>
                    </div>
                </div>
            </div>
        `;

        this.renderChart(stats);
    }

    renderStatCards(stats) {
        if (this.statType === 'basic') {
            return `
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">Points</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.ppg}</div>
                    <div class="text-xs text-gray-400">Per Game</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">Rebounds</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.rpg}</div>
                    <div class="text-xs text-gray-400">Per Game</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">Assists</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.apg}</div>
                    <div class="text-xs text-gray-400">Per Game</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">FG%</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.fgPercent}%</div>
                    <div class="text-xs text-gray-400">Field Goal</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">3P%</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.threePtPercent}%</div>
                    <div class="text-xs text-gray-400">Three Point</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">FT%</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.ftPercent}%</div>
                    <div class="text-xs text-gray-400">Free Throw</div>
                </div>
            `;
        } else {
            return `
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">PER</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.per}</div>
                    <div class="text-xs text-gray-400">Player Efficiency</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">TS%</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.tsPercent}%</div>
                    <div class="text-xs text-gray-400">True Shooting</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">USG%</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.usgPercent}%</div>
                    <div class="text-xs text-gray-400">Usage Rate</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">VORP</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.vorp}</div>
                    <div class="text-xs text-gray-400">Value Over Replacement</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">BPM</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.bpm}</div>
                    <div class="text-xs text-gray-400">Box Plus/Minus</div>
                </div>
                <div class="bg-gray-700 rounded-lg p-4">
                    <div class="text-sm text-gray-400">WS</div>
                    <div class="text-2xl font-medium text-gray-200">${stats.ws}</div>
                    <div class="text-xs text-gray-400">Win Shares</div>
                </div>
            `;
        }
    }

    renderChart(stats) {
        const ctx = document.getElementById('playerStatsChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        const labels = this.statType === 'basic' 
            ? ['Points', 'Rebounds', 'Assists', 'Steals', 'Blocks', 'Turnovers']
            : ['PER', 'TS%', 'USG%', 'VORP', 'BPM', 'WS'];

        const data = this.statType === 'basic'
            ? [stats.ppg, stats.rpg, stats.apg, stats.spg, stats.bpg, stats.topg]
            : [stats.per, stats.tsPercent, stats.usgPercent, stats.vorp, stats.bpm, stats.ws];

        this.chart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Current Season',
                    data: data,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgb(59, 130, 246)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            backdropColor: 'transparent'
                        },
                        pointLabels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    switchStatType(type) {
        this.statType = type;
        
        // Update button states
        document.getElementById('basicStats').className = 
            type === 'basic' 
                ? 'px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors'
                : 'px-3 py-1 bg-gray-700 text-white hover:bg-gray-600 transition-colors';
        
        document.getElementById('advancedStats').className = 
            type === 'advanced'
                ? 'px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors'
                : 'px-3 py-1 bg-gray-700 text-white hover:bg-gray-600 transition-colors';

        if (this.selectedPlayer) {
            this.loadData();
        }
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        const loadingElement = document.getElementById('playerStatsLoading');
        if (loadingElement) {
            loadingElement.classList.toggle('hidden', !isLoading);
        }
    }

    handleError(error) {
        this.container.innerHTML = `
            <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500">
                <p class="font-medium">Failed to load player statistics</p>
                <p class="text-sm mt-1 text-red-400">${error.message}</p>
            </div>
        `;
    }

    // Event Handlers
    async handleLeagueChange(data) {
        this.currentLeague = data.league;
        this.selectedPlayer = null;
        await this.loadData();
    }

    async handleTeamSelection(data) {
        this.selectedTeam = data.team;
        this.selectedPlayer = null;
        await this.loadData();
    }

    async handlePlayerSelection(event) {
        this.selectedPlayer = event.target.value;
        if (this.selectedPlayer) {
            await this.loadData();
        } else {
            document.getElementById('playerStatsContent').innerHTML = `
                <div class="text-center text-gray-400 py-8">
                    Select a player to view their statistics
                </div>
            `;
        }
    }

    // Cleanup method
    destroy() {
        if (this.chart) {
            this.chart.destroy();
        }
        // Remove event listeners
        document.getElementById('playerSelect')?.removeEventListener('change', this.handlePlayerSelection);
        document.getElementById('basicStats')?.removeEventListener('click', () => this.switchStatType('basic'));
        document.getElementById('advancedStats')?.removeEventListener('click', () => this.switchStatType('advanced'));
        // Unsubscribe from events
        eventBus.unsubscribe('league:changed', this.handleLeagueChange);
        eventBus.unsubscribe('team:selected', this.handleTeamSelection);
    }
} 