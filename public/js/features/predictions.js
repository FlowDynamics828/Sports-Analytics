/**
 * Predictions module
 * Handles prediction loading and display for the dashboard
 */

import { Logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { apiClient } from '../utils/apiClient.js';

// Internal class for managing the loading state of predictions
class LoadingState {
    constructor() {
        this.isLoading = false;
        this.loadingElements = document.querySelectorAll('.prediction-loading');
        this.loadedElements = document.querySelectorAll('.prediction-loaded');
        this.errorElements = document.querySelectorAll('.prediction-error');
    }
    
    // Show loading state
    showLoading() {
        this.isLoading = true;
        this.loadingElements.forEach(el => el.classList.remove('hidden'));
        this.loadedElements.forEach(el => el.classList.add('hidden'));
        this.errorElements.forEach(el => el.classList.add('hidden'));
    }
    
    // Show loaded state
    showLoaded() {
        this.isLoading = false;
        this.loadingElements.forEach(el => el.classList.add('hidden'));
        this.loadedElements.forEach(el => el.classList.remove('hidden'));
        this.errorElements.forEach(el => el.classList.add('hidden'));
    }
    
    // Show error state
    showError() {
        this.isLoading = false;
        this.loadingElements.forEach(el => el.classList.add('hidden'));
        this.loadedElements.forEach(el => el.classList.add('hidden'));
        this.errorElements.forEach(el => el.classList.remove('hidden'));
    }
}

// Predictions class for managing prediction data and display
export default class Predictions {
    constructor() {
        this.container = document.getElementById('predictions-content');
        this.currentLeague = null;
        this.selectedTeam = null;
        this.isLoading = false;
        this.predictions = [];
        this.loadingState = new LoadingState();
        this.filteredPredictions = [];
        this.filters = {
            league: 'all',
            date: 'upcoming',
            team: null
        };
    }
    
    // Initialize predictions module
    async initialize() {
        try {
            Logger.info('Initializing predictions module');
            
            // Subscribe to relevant events
            eventBus.subscribe('league:changed', this.handleLeagueChange.bind(this));
            eventBus.subscribe('team:selected', this.handleTeamSelection.bind(this));
            
            // Create predictions container
            this.createContainer();
            
            // Load initial data
            await this.loadData();
            
            Logger.info('Predictions module initialized');
        } catch (error) {
            Logger.error('Failed to initialize predictions:', { error });
            this.handleError(error);
        }
    }
    
    // Load predictions from API
    async loadData() {
        try {
            this.setLoading(true);
            
            const data = await apiClient.get('/api/predictions', {
                league: this.currentLeague,
                team: this.selectedTeam
            });
            
            this.predictions = data.predictions;
            this.renderPredictions();
            
        } catch (error) {
            Logger.error('Failed to load predictions:', { error });
            this.handleError(error);
        } finally {
            this.setLoading(false);
        }
    }
    
    // Set up event listeners for prediction filters
    setupEventListeners() {
        // League filter
        const leagueFilter = document.getElementById('prediction-league-filter');
        if (leagueFilter) {
            leagueFilter.addEventListener('change', (e) => {
                this.filters.league = e.target.value;
                this.filterPredictions();
                this.renderPredictions();
            });
        }
        
        // Date filter
        const dateFilter = document.getElementById('prediction-date-filter');
        if (dateFilter) {
            dateFilter.addEventListener('change', (e) => {
                this.filters.date = e.target.value;
                this.filterPredictions();
                this.renderPredictions();
            });
        }
        
        // Team filter
        const teamFilter = document.getElementById('prediction-team-filter');
        if (teamFilter) {
            teamFilter.addEventListener('change', (e) => {
                this.filters.team = e.target.value === 'all' ? null : e.target.value;
                this.filterPredictions();
                this.renderPredictions();
            });
        }
    }
    
    // Filter predictions based on current filters
    filterPredictions() {
        this.filteredPredictions = this.predictions.filter(prediction => {
            // League filter
            if (this.filters.league !== 'all' && prediction.league.toLowerCase() !== this.filters.league.toLowerCase()) {
                return false;
            }
            
            // Date filter
            const now = new Date();
            const gameDate = new Date(prediction.gameDate);
            
            if (this.filters.date === 'upcoming' && gameDate < now) {
                return false;
            }
            
            if (this.filters.date === 'past' && gameDate > now) {
                return false;
            }
            
            // Team filter
            if (this.filters.team && prediction.homeTeam.id !== this.filters.team && prediction.awayTeam.id !== this.filters.team) {
                return false;
            }
            
            return true;
        });
    }
    
    // Render filtered predictions to the DOM
    renderPredictions() {
        const grid = document.getElementById('predictionsGrid');
        if (!grid || !this.predictions.length) {
            grid.innerHTML = `
                <div class="bg-gray-800 rounded-lg p-4 text-center text-gray-400">
                    No predictions available at this time
                </div>
            `;
            return;
        }

        grid.innerHTML = this.predictions.map(prediction => `
            <div class="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-3">
                        <img src="${prediction.homeTeam.logo}" alt="${prediction.homeTeam.name}" class="w-8 h-8">
                        <span class="text-lg font-medium text-gray-200">${prediction.homeTeam.name}</span>
                    </div>
                    <div class="text-sm font-medium text-gray-400">VS</div>
                    <div class="flex items-center space-x-3">
                        <span class="text-lg font-medium text-gray-200">${prediction.awayTeam.name}</span>
                        <img src="${prediction.awayTeam.logo}" alt="${prediction.awayTeam.name}" class="w-8 h-8">
                    </div>
                </div>
                
                <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">Win Probability</span>
                        <div class="flex space-x-4">
                            <span class="text-blue-400">${prediction.homeWinProb}%</span>
                            <span class="text-gray-500">|</span>
                            <span class="text-red-400">${prediction.awayWinProb}%</span>
                        </div>
                    </div>
                    
                    <div class="w-full bg-gray-700 rounded-full h-2">
                        <div class="bg-gradient-to-r from-blue-500 to-red-500 h-2 rounded-full" 
                             style="width: ${prediction.homeWinProb}%"></div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 mt-4">
                        <div class="text-center p-2 bg-gray-700 rounded">
                            <div class="text-sm text-gray-400">Predicted Score</div>
                            <div class="text-lg font-medium text-gray-200">
                                ${prediction.predictedScore.home} - ${prediction.predictedScore.away}
                            </div>
                        </div>
                        <div class="text-center p-2 bg-gray-700 rounded">
                            <div class="text-sm text-gray-400">Confidence</div>
                            <div class="text-lg font-medium ${this.getConfidenceColor(prediction.confidence)}">
                                ${prediction.confidence}%
                            </div>
                        </div>
                    </div>
                    
                    <div class="mt-4 text-sm text-gray-400">
                        <div class="flex justify-between">
                            <span>Game Time</span>
                            <span>${new Date(prediction.gameTime).toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between mt-1">
                            <span>Venue</span>
                            <span>${prediction.venue}</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getConfidenceColor(confidence) {
        if (confidence >= 80) return 'text-green-400';
        if (confidence >= 60) return 'text-blue-400';
        if (confidence >= 40) return 'text-yellow-400';
        return 'text-red-400';
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        const loadingElement = document.getElementById('predictionsLoading');
        if (loadingElement) {
            loadingElement.classList.toggle('hidden', !isLoading);
        }
    }

    handleError(error) {
        this.container.innerHTML = `
            <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500">
                <p class="font-medium">Failed to load predictions</p>
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

    async handleRefresh() {
        await this.loadData();
    }

    // Cleanup method
    destroy() {
        // Remove event listeners
        document.getElementById('refreshPredictions')?.removeEventListener('click', this.handleRefresh);
        // Unsubscribe from events
        eventBus.unsubscribe('league:changed', this.handleLeagueChange);
        eventBus.unsubscribe('team:selected', this.handleTeamSelection);
    }
}

// Create global instance
const predictions = new Predictions();

// Export for ES modules
export { Predictions, predictions };

// Export for global use
window.Predictions = Predictions;
window.predictions = predictions; 