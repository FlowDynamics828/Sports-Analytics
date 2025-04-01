import { Logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { apiClient } from '../utils/apiClient.js';

export default class TeamComparison {
    constructor() {
        this.container = document.getElementById('team-comparison-content');
        this.chart = null;
        this.currentData = null;
        this.isLoading = false;
    }

    async initialize() {
        try {
            Logger.info('Initializing team comparison module');
            
            // Subscribe to relevant events
            eventBus.subscribe('league:changed', this.handleLeagueChange.bind(this));
            eventBus.subscribe('team:selected', this.handleTeamSelection.bind(this));
            
            // Create chart container
            this.createChartContainer();
            
            // Load initial data
            await this.loadData();
            
            Logger.info('Team comparison module initialized');
        } catch (error) {
            Logger.error('Failed to initialize team comparison:', { error });
            this.handleError(error);
        }
    }

    createChartContainer() {
        // Create chart container with loading state
        this.container.innerHTML = `
            <div class="relative">
                <div class="flex justify-between items-center mb-4">
                    <div class="space-y-1">
                        <h3 class="text-lg font-semibold text-gray-200">Team Comparison</h3>
                        <p class="text-sm text-gray-400">Compare key metrics between teams</p>
                    </div>
                    <div class="flex space-x-2">
                        <button id="compareTeamBtn" class="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                            Compare Team
                        </button>
                    </div>
                </div>
                <div class="bg-gray-800 rounded-lg p-4">
                    <canvas id="teamComparisonChart" class="w-full h-64"></canvas>
                </div>
                <div id="teamComparisonLoading" class="absolute inset-0 bg-gray-900/50 flex items-center justify-center hidden">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            </div>
        `;

        // Add event listener to compare team button
        document.getElementById('compareTeamBtn').addEventListener('click', this.handleCompareTeamClick.bind(this));
    }

    async loadData() {
        try {
            this.setLoading(true);
            
            const data = await apiClient.get('/api/team-comparison', {
                league: this.currentLeague,
                team: this.selectedTeam
            });
            
            this.currentData = data;
            this.renderChart();
            
        } catch (error) {
            Logger.error('Failed to load team comparison data:', { error });
            this.handleError(error);
        } finally {
            this.setLoading(false);
        }
    }

    renderChart() {
        if (!this.currentData) return;

        const ctx = document.getElementById('teamComparisonChart').getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: this.currentData.metrics.map(m => m.name),
                datasets: this.currentData.teams.map(team => ({
                    label: team.name,
                    data: team.values,
                    borderColor: team.color,
                    backgroundColor: `${team.color}33`,
                    borderWidth: 2,
                    pointBackgroundColor: team.color
                }))
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
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'rgba(255, 255, 255, 1)',
                        bodyColor: 'rgba(255, 255, 255, 0.8)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }
                }
            }
        });
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        const loadingElement = document.getElementById('teamComparisonLoading');
        if (loadingElement) {
            loadingElement.classList.toggle('hidden', !isLoading);
        }
    }

    handleError(error) {
        // Show error in the container
        this.container.innerHTML = `
            <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500">
                <p class="font-medium">Failed to load team comparison</p>
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
        await this.loadData();
    }

    async handleCompareTeamClick() {
        // Show team selection modal
        eventBus.publish('modal:show', {
            type: 'team-select',
            title: 'Select Team to Compare',
            onSelect: async (teamId) => {
                try {
                    this.setLoading(true);
                    const data = await apiClient.get('/api/team-comparison', {
                        league: this.currentLeague,
                        team: this.selectedTeam,
                        compareWith: teamId
                    });
                    this.currentData = data;
                    this.renderChart();
                } catch (error) {
                    Logger.error('Failed to compare team:', { error });
                    this.handleError(error);
                } finally {
                    this.setLoading(false);
                }
            }
        });
    }

    // Cleanup method
    destroy() {
        if (this.chart) {
            this.chart.destroy();
        }
        // Remove event listeners
        document.getElementById('compareTeamBtn')?.removeEventListener('click', this.handleCompareTeamClick);
        // Unsubscribe from events
        eventBus.unsubscribe('league:changed', this.handleLeagueChange);
        eventBus.unsubscribe('team:selected', this.handleTeamSelection);
    }
} 