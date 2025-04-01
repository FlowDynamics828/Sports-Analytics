import { Logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { apiClient } from '../utils/apiClient.js';

export default class Standings {
    constructor() {
        this.container = document.getElementById('standings-content');
        this.currentLeague = null;
        this.selectedTeam = null;
        this.isLoading = false;
        this.standings = [];
        this.viewMode = 'table'; // 'table' or 'grid'
    }

    async initialize() {
        try {
            Logger.info('Initializing standings module');
            
            // Subscribe to relevant events
            eventBus.subscribe('league:changed', this.handleLeagueChange.bind(this));
            eventBus.subscribe('team:selected', this.handleTeamSelection.bind(this));
            
            // Create standings container
            this.createContainer();
            
            // Load initial data
            await this.loadData();
            
            Logger.info('Standings module initialized');
        } catch (error) {
            Logger.error('Failed to initialize standings:', { error });
            this.handleError(error);
        }
    }

    createContainer() {
        this.container.innerHTML = `
            <div class="relative">
                <div class="flex justify-between items-center mb-4">
                    <div class="space-y-1">
                        <h3 class="text-lg font-semibold text-gray-200">League Standings</h3>
                        <p class="text-sm text-gray-400">Current standings and team statistics</p>
                    </div>
                    <div class="flex space-x-2">
                        <button id="viewModeToggle" class="px-3 py-1 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors">
                            <i class="fas fa-table"></i>
                        </button>
                        <button id="refreshStandings" class="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                            Refresh
                        </button>
                    </div>
                </div>
                <div id="standingsContent" class="bg-gray-800 rounded-lg overflow-hidden">
                    <!-- Standings will be rendered here -->
                </div>
                <div id="standingsLoading" class="absolute inset-0 bg-gray-900/50 flex items-center justify-center hidden">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            </div>
        `;

        // Add event listeners
        document.getElementById('viewModeToggle').addEventListener('click', this.toggleViewMode.bind(this));
        document.getElementById('refreshStandings').addEventListener('click', this.handleRefresh.bind(this));
    }

    async loadData() {
        try {
            this.setLoading(true);
            
            const data = await apiClient.get('/api/standings', {
                league: this.currentLeague
            });
            
            this.standings = data.standings;
            this.renderStandings();
            
        } catch (error) {
            Logger.error('Failed to load standings:', { error });
            this.handleError(error);
        } finally {
            this.setLoading(false);
        }
    }

    renderStandings() {
        const content = document.getElementById('standingsContent');
        if (!content || !this.standings.length) {
            content.innerHTML = `
                <div class="p-4 text-center text-gray-400">
                    No standings data available
                </div>
            `;
            return;
        }

        if (this.viewMode === 'table') {
            this.renderTableView(content);
        } else {
            this.renderGridView(content);
        }

        // Highlight selected team if any
        if (this.selectedTeam) {
            const selectedRow = content.querySelector(`[data-team-id="${this.selectedTeam}"]`);
            if (selectedRow) {
                selectedRow.classList.add('bg-blue-900/20');
            }
        }
    }

    renderTableView(container) {
        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="text-xs text-gray-400 border-b border-gray-700">
                            <th class="p-3 text-left">Rank</th>
                            <th class="p-3 text-left">Team</th>
                            <th class="p-3 text-center">GP</th>
                            <th class="p-3 text-center">W</th>
                            <th class="p-3 text-center">L</th>
                            <th class="p-3 text-center">PCT</th>
                            <th class="p-3 text-center">GB</th>
                            <th class="p-3 text-center">L10</th>
                            <th class="p-3 text-center">STRK</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.standings.map((team, index) => `
                            <tr class="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors" 
                                data-team-id="${team.id}">
                                <td class="p-3 text-gray-300">${index + 1}</td>
                                <td class="p-3">
                                    <div class="flex items-center space-x-3">
                                        <img src="${team.logo}" alt="${team.name}" class="w-6 h-6">
                                        <span class="font-medium text-gray-200">${team.name}</span>
                                    </div>
                                </td>
                                <td class="p-3 text-center text-gray-300">${team.gamesPlayed}</td>
                                <td class="p-3 text-center text-gray-300">${team.wins}</td>
                                <td class="p-3 text-center text-gray-300">${team.losses}</td>
                                <td class="p-3 text-center text-gray-300">${team.winningPct.toFixed(3)}</td>
                                <td class="p-3 text-center text-gray-300">${team.gamesBehind}</td>
                                <td class="p-3 text-center text-gray-300">${team.lastTen}</td>
                                <td class="p-3 text-center ${this.getStreakColor(team.streak)}">${team.streak}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderGridView(container) {
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                ${this.standings.map((team, index) => `
                    <div class="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition-colors"
                         data-team-id="${team.id}">
                        <div class="flex items-center space-x-4 mb-3">
                            <div class="flex-shrink-0">
                                <img src="${team.logo}" alt="${team.name}" class="w-12 h-12">
                            </div>
                            <div>
                                <div class="font-medium text-gray-200">${team.name}</div>
                                <div class="text-sm text-gray-400">Rank: ${index + 1}</div>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-3 gap-2 text-center mb-3">
                            <div class="bg-gray-800 rounded p-2">
                                <div class="text-sm text-gray-400">Wins</div>
                                <div class="text-lg font-medium text-gray-200">${team.wins}</div>
                            </div>
                            <div class="bg-gray-800 rounded p-2">
                                <div class="text-sm text-gray-400">Losses</div>
                                <div class="text-lg font-medium text-gray-200">${team.losses}</div>
                            </div>
                            <div class="bg-gray-800 rounded p-2">
                                <div class="text-sm text-gray-400">PCT</div>
                                <div class="text-lg font-medium text-gray-200">${team.winningPct.toFixed(3)}</div>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2 text-sm text-gray-400">
                            <div class="flex justify-between">
                                <span>Last 10:</span>
                                <span class="text-gray-200">${team.lastTen}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Streak:</span>
                                <span class="${this.getStreakColor(team.streak)}">${team.streak}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>GB:</span>
                                <span class="text-gray-200">${team.gamesBehind}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Home:</span>
                                <span class="text-gray-200">${team.homeRecord}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getStreakColor(streak) {
        if (streak.startsWith('W')) return 'text-green-400';
        if (streak.startsWith('L')) return 'text-red-400';
        return 'text-gray-300';
    }

    toggleViewMode() {
        this.viewMode = this.viewMode === 'table' ? 'grid' : 'table';
        const button = document.getElementById('viewModeToggle');
        button.innerHTML = `<i class="fas fa-${this.viewMode === 'table' ? 'table' : 'th'}"></i>`;
        this.renderStandings();
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        const loadingElement = document.getElementById('standingsLoading');
        if (loadingElement) {
            loadingElement.classList.toggle('hidden', !isLoading);
        }
    }

    handleError(error) {
        this.container.innerHTML = `
            <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500">
                <p class="font-medium">Failed to load standings</p>
                <p class="text-sm mt-1 text-red-400">${error.message}</p>
            </div>
        `;
    }

    // Event Handlers
    async handleLeagueChange(data) {
        this.currentLeague = data.league;
        await this.loadData();
    }

    async handleTeamSelection(data) {
        this.selectedTeam = data.team;
        this.renderStandings(); // Just re-render to highlight the selected team
    }

    async handleRefresh() {
        await this.loadData();
    }

    // Cleanup method
    destroy() {
        // Remove event listeners
        document.getElementById('viewModeToggle')?.removeEventListener('click', this.toggleViewMode);
        document.getElementById('refreshStandings')?.removeEventListener('click', this.handleRefresh);
        // Unsubscribe from events
        eventBus.unsubscribe('league:changed', this.handleLeagueChange);
        eventBus.unsubscribe('team:selected', this.handleTeamSelection);
    }
} 