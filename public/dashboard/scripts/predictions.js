// Dashboard Predictions Integration Component
// This connects the dashboard to the backend predictive model capabilities

import { Toast } from './toast.js';
import { LoadingState } from './loadingstate.js';

class PredictionManager {
    constructor() {
        this.currentLeague = 'nba';
        this.selectedTeam = '';
        this.predictionCache = new Map();
        this.lastPrediction = null;
        this.confidenceThresholds = {
            high: 0.75,
            medium: 0.6,
            low: 0.5
        };
        this.predictionElements = {
            container: document.getElementById('predictionsContainer'),
            gameOutcome: document.getElementById('gameOutcomeCard'),
            playerPerformance: document.getElementById('playerPerformanceCard'),
            trends: document.getElementById('trendsCard'),
            loading: document.getElementById('predictionsLoading')
        };
    }

    async initialize() {
        try {
            // Set up event listeners
            document.getElementById('predictTypeSelect')?.addEventListener('change', (e) => {
                this.setPredictionType(e.target.value);
            });
            
            document.getElementById('runPredictionBtn')?.addEventListener('click', () => {
                this.requestPrediction();
            });

            // Listen for league/team changes from dashboard
            window.addEventListener('leagueChange', (e) => {
                this.setLeague(e.detail.league);
            });
            
            window.addEventListener('teamChange', (e) => {
                this.setTeam(e.detail.teamId);
            });

            console.log('Prediction Manager initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Prediction Manager:', error);
            Toast.show('Failed to initialize prediction system', 'error');
            return false;
        }
    }

    setLeague(league) {
        this.currentLeague = league;
        console.log(`Prediction manager: League set to ${league}`);
        // Clear previous predictions when changing league
        this.clearPredictions();
    }

    setTeam(teamId) {
        this.selectedTeam = teamId;
        console.log(`Prediction manager: Team set to ${teamId}`);
        // Clear previous predictions when changing team
        this.clearPredictions();
    }

    setPredictionType(type) {
        this.currentPredictionType = type;
        console.log(`Prediction type set to ${type}`);
        
        // Show/hide relevant inputs based on prediction type
        if (type === 'multi_factor') {
            document.getElementById('multiFactorOptions')?.classList.remove('hidden');
        } else {
            document.getElementById('multiFactorOptions')?.classList.add('hidden');
        }
    }

    async requestPrediction() {
        if (!this.currentLeague) {
            Toast.show('Please select a league first', 'warning');
            return;
        }

        try {
            this.showLoading(true);
            
            // Generate the cache key
            const cacheKey = `${this.currentLeague}:${this.selectedTeam}:${this.currentPredictionType}`;
            
            // Check cache first (only valid for 5 minutes)
            const cachedPrediction = this.predictionCache.get(cacheKey);
            if (cachedPrediction && (Date.now() - cachedPrediction.timestamp < 300000)) {
                this.displayPrediction(cachedPrediction.data);
                this.showLoading(false);
                return;
            }

            // Prepare prediction request data
            const requestData = {
                league: this.currentLeague.toUpperCase(),
                prediction_type: this.currentPredictionType || 'single_factor',
                input_data: {
                    team: this.selectedTeam,
                    timestamp: new Date().toISOString()
                }
            };

            // For multi-factor predictions, gather additional factors
            if (this.currentPredictionType === 'multi_factor') {
                requestData.factors = this.gatherFactors();
            }

            // Make API request
            const response = await fetch('/api/predictions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`Prediction request failed with status: ${response.status}`);
            }

            const predictionData = await response.json();
            
            // Cache the prediction
            this.predictionCache.set(cacheKey, {
                data: predictionData,
                timestamp: Date.now()
            });
            
            // Display prediction
            this.displayPrediction(predictionData);
            this.lastPrediction = predictionData;

            // Save prediction to history
            this.savePredictionHistory(predictionData);
            
        } catch (error) {
            console.error('Prediction error:', error);
            Toast.show('Failed to generate prediction. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    gatherFactors() {
        // Get all factor inputs 
        const factorElements = document.querySelectorAll('.factor-input');
        const factors = [];

        factorElements.forEach(element => {
            const factor = {
                inputData: {},
                weight: parseFloat(element.querySelector('.factor-weight').value) || 1.0
            };

            // Get all input fields for this factor
            const inputs = element.querySelectorAll('input[data-field]');
            inputs.forEach(input => {
                const field = input.dataset.field;
                const value = input.type === 'number' ? parseFloat(input.value) : input.value;
                factor.inputData[field] = value;
            });

            factors.push(factor);
        });

        return factors;
    }

    displayPrediction(prediction) {
        // Clear previous predictions
        this.clearPredictions();
        
        if (!prediction) {
            Toast.show('No prediction data available', 'warning');
            return;
        }

        const container = this.predictionElements.container;
        if (!container) {
            console.error('Prediction container not found');
            return;
        }

        // Show container
        container.classList.remove('hidden');

        // Create prediction display based on type
        if (this.currentPredictionType === 'single_factor') {
            this.displaySingleFactorPrediction(prediction);
        } else if (this.currentPredictionType === 'multi_factor') {
            this.displayMultiFactorPrediction(prediction);
        } else {
            this.displayAdvancedPrediction(prediction);
        }

        // Smooth scroll to prediction container
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    displaySingleFactorPrediction(prediction) {
        const { mainPrediction, confidenceScore, insights } = prediction;
        
        // Game outcome prediction
        if (this.predictionElements.gameOutcome) {
            this.predictionElements.gameOutcome.innerHTML = `
                <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 class="text-xl font-bold mb-4">Game Outcome Prediction</h3>
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <div class="text-3xl font-bold ${this.getConfidenceColorClass(confidenceScore)}">${mainPrediction}</div>
                            <div class="text-sm text-gray-400">Recommended outcome</div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold">${confidenceScore.toFixed(1)}%</div>
                            <div class="text-sm text-gray-400">Confidence</div>
                        </div>
                    </div>
                    ${this.renderInsights(insights)}
                </div>
            `;
        }

        // Display timestamp and metadata
        this.displayPredictionMeta(prediction.metadata);
    }

    displayMultiFactorPrediction(prediction) {
        const { mainPrediction, combinedProbability, individualPredictions } = prediction;
        
        // Game outcome prediction
        if (this.predictionElements.gameOutcome) {
            this.predictionElements.gameOutcome.innerHTML = `
                <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 class="text-xl font-bold mb-4">Multi-Factor Prediction</h3>
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <div class="text-3xl font-bold ${this.getConfidenceColorClass(combinedProbability)}">${mainPrediction.join(', ')}</div>
                            <div class="text-sm text-gray-400">Combined prediction</div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold">${combinedProbability.toFixed(1)}%</div>
                            <div class="text-sm text-gray-400">Confidence</div>
                        </div>
                    </div>
                    <div class="mt-4">
                        <h4 class="font-bold mb-2">Individual Predictions</h4>
                        <div class="space-y-2">
                            ${individualPredictions.map((pred, index) => `
                                <div class="bg-gray-700 p-3 rounded">
                                    <div class="flex justify-between">
                                        <span>Factor ${index + 1}</span>
                                        <span class="${this.getConfidenceColorClass(pred.confidenceScore)}">${pred.confidenceScore.toFixed(1)}%</span>
                                    </div>
                                    <div class="text-sm text-gray-400">Prediction: ${pred.mainPrediction}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        // Display timestamp and metadata
        this.displayPredictionMeta(prediction.metadata);
    }

    displayAdvancedPrediction(prediction) {
        const { prediction: pred, confidence, components } = prediction;
        
        // Game outcome prediction
        if (this.predictionElements.gameOutcome) {
            this.predictionElements.gameOutcome.innerHTML = `
                <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 class="text-xl font-bold mb-4">Advanced Prediction</h3>
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <div class="text-3xl font-bold ${this.getConfidenceColorClass(confidence)}">${pred}</div>
                            <div class="text-sm text-gray-400">Advanced prediction</div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold">${confidence.toFixed(1)}%</div>
                            <div class="text-sm text-gray-400">Confidence</div>
                        </div>
                    </div>
                    <div class="mt-4">
                        <h4 class="font-bold mb-2">Model Components</h4>
                        <div class="space-y-2">
                            ${components.map(comp => `
                                <div class="bg-gray-700 p-3 rounded">
                                    <div class="flex justify-between">
                                        <span>${comp.type} model</span>
                                        <span>${comp.prediction}</span>
                                    </div>
                                    <div class="text-sm text-gray-400">Last updated: ${new Date(comp.timestamp).toLocaleString()}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        // Display timestamp and metadata
        this.displayPredictionMeta(prediction.metadata);
    }

    displayPredictionMeta(metadata) {
        const metaContainer = document.getElementById('predictionMetadata');
        if (!metaContainer) return;

        const timestamp = metadata?.timestamp ? new Date(metadata.timestamp).toLocaleString() : 'Unknown';
        
        metaContainer.innerHTML = `
            <div class="text-sm text-gray-400 mt-4">
                <div>Prediction generated: ${timestamp}</div>
                <div>Model version: ${metadata?.modelVersion || 'Unknown'}</div>
                <div>Data points analyzed: ${metadata?.dataPoints || 'Unknown'}</div>
            </div>
        `;
    }

    renderInsights(insights) {
        if (!insights || !insights.length) return '';

        return `
            <div class="mt-4 border-t border-gray-700 pt-4">
                <h4 class="font-bold mb-2">Key Insights</h4>
                <div class="space-y-2">
                    ${insights.map(insight => `
                        <div class="bg-gray-700 p-3 rounded">
                            <div class="font-semibold">${insight.type}</div>
                            <div class="text-sm text-gray-400">
                                ${Array.isArray(insight.data) 
                                    ? insight.data.map(d => `<div>${d.feature}: ${d.importance}</div>`).join('')
                                    : JSON.stringify(insight.data)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getConfidenceColorClass(score) {
        if (score >= 75) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        return 'text-red-500';
    }

    clearPredictions() {
        if (this.predictionElements.gameOutcome) {
            this.predictionElements.gameOutcome.innerHTML = '';
        }
        if (this.predictionElements.playerPerformance) {
            this.predictionElements.playerPerformance.innerHTML = '';
        }
        if (this.predictionElements.trends) {
            this.predictionElements.trends.innerHTML = '';
        }
    }

    showLoading(isLoading) {
        if (this.predictionElements.loading) {
            if (isLoading) {
                this.predictionElements.loading.classList.remove('hidden');
            } else {
                this.predictionElements.loading.classList.add('hidden');
            }
        }
    }

    savePredictionHistory(prediction) {
        try {
            // Get existing history
            const historyJson = localStorage.getItem('predictionHistory');
            const history = historyJson ? JSON.parse(historyJson) : [];
            
            // Add this prediction with metadata
            history.unshift({
                league: this.currentLeague,
                teamId: this.selectedTeam,
                predictionType: this.currentPredictionType,
                timestamp: new Date().toISOString(),
                prediction: prediction
            });
            
            // Limit history to 10 entries
            const limitedHistory = history.slice(0, 10);
            
            // Save back to localStorage
            localStorage.setItem('predictionHistory', JSON.stringify(limitedHistory));
        } catch (error) {
            console.error('Failed to save prediction history:', error);
        }
    }

    async exportPredictionHistory() {
        try {
            const historyJson = localStorage.getItem('predictionHistory');
            const history = historyJson ? JSON.parse(historyJson) : [];
            
            if (!history.length) {
                Toast.show('No prediction history to export', 'warning');
                return;
            }
            
            const blob = new Blob([JSON.stringify(history, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `prediction-history-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            Toast.show('Prediction history exported successfully', 'success');
        } catch (error) {
            console.error('Failed to export prediction history:', error);
            Toast.show('Failed to export prediction history', 'error');
        }
    }

    // Add a method to add a new factor input
    addFactorInput() {
        const factorContainer = document.getElementById('factorInputs');
        if (!factorContainer) return;
        
        const factorCount = factorContainer.querySelectorAll('.factor-input').length + 1;
        
        const factorHtml = `
            <div class="factor-input bg-gray-800 p-4 rounded-lg mb-4">
                <div class="flex justify-between mb-2">
                    <h4 class="font-bold">Factor ${factorCount}</h4>
                    <button type="button" class="text-red-500 hover:text-red-700 remove-factor">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Home Team Score</label>
                        <input type="number" data-field="homeScore" class="bg-gray-700 w-full p-2 rounded" placeholder="Home Score">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Away Team Score</label>
                        <input type="number" data-field="awayScore" class="bg-gray-700 w-full p-2 rounded" placeholder="Away Score">
                    </div>
                </div>
                <div class="mt-3">
                    <label class="block text-sm font-medium text-gray-400 mb-1">Factor Weight</label>
                    <input type="range" class="factor-weight w-full" min="0.1" max="2" step="0.1" value="1">
                    <div class="flex justify-between text-xs text-gray-400">
                        <span>0.1</span>
                        <span>1.0</span>
                        <span>2.0</span>
                    </div>
                </div>
            </div>
        `;
        
        factorContainer.insertAdjacentHTML('beforeend', factorHtml);
        
        // Add event listener to new remove button
        const newFactor = factorContainer.lastElementChild;
        newFactor.querySelector('.remove-factor').addEventListener('click', (e) => {
            e.target.closest('.factor-input').remove();
        });
    }
}

export default new PredictionManager();