/**
 * SportsAnalyticsPro - Enhanced Predictions Module
 * Provides advanced match analysis and predictions
 */

import insightsEngine from './insights-engine.js';
import mockAPI from './mock-api.js';

class EnhancedPredictions {
    constructor() {
        this.initialized = false;
        this.currentLeagueId = '4328'; // Default to English Premier League
        this.selectedMatchId = null;
    }
    
    /**
     * Initialize the enhanced predictions module
     */
    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing Enhanced Predictions Module...');
        
        try {
            // Create enhanced predictions section
            this.createEnhancedPredictionsSection();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Load initial match data
            await this.loadInitialMatchData();
            
            this.initialized = true;
            console.log('Enhanced Predictions Module initialized successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Enhanced Predictions Module:', error);
            return false;
        }
    }
    
    /**
     * Create the enhanced predictions section in the UI
     */
    createEnhancedPredictionsSection() {
        // Find container to append our section
        const container = document.getElementById('predictions-content');
        if (!container) return;
        
        // Create enhanced predictions section
        const enhancedPredictionsSection = document.createElement('div');
        enhancedPredictionsSection.id = 'enhanced-predictions-section';
        enhancedPredictionsSection.className = 'mt-8';
        
        enhancedPredictionsSection.innerHTML = `
            <div class="premium-card">
                <div class="bg-gradient-to-r from-blue-900 to-purple-900 p-4 flex items-center">
                    <div class="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center mr-3">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold">Enhanced Match Analysis</h2>
                        <p class="text-sm text-blue-200">AI-powered predictions with multi-factor insights</p>
                    </div>
                    <div class="ml-auto">
                        <span class="text-xs bg-blue-600 bg-opacity-50 text-blue-100 px-2 py-1 rounded">PREMIUM</span>
                    </div>
                </div>
                
                <div class="p-6">
                    <div class="mb-6">
                        <h3 class="text-lg font-medium mb-3">Upcoming Matches</h3>
                        <p class="text-sm text-gray-400 mb-4">Select a match to see advanced prediction analytics</p>
                        
                        <div id="match-cards-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div class="bg-gray-800 rounded-lg p-4 animate-pulse">
                                <div class="h-6 bg-gray-700 rounded w-3/4 mb-3"></div>
                                <div class="flex justify-between items-center mb-3">
                                    <div class="h-10 w-10 bg-gray-700 rounded-full"></div>
                                    <div class="h-4 bg-gray-700 rounded w-10"></div>
                                    <div class="h-10 w-10 bg-gray-700 rounded-full"></div>
                                </div>
                                <div class="h-4 bg-gray-700 rounded w-full mb-2"></div>
                                <div class="h-4 bg-gray-700 rounded w-full"></div>
                            </div>
                            <div class="bg-gray-800 rounded-lg p-4 animate-pulse">
                                <div class="h-6 bg-gray-700 rounded w-3/4 mb-3"></div>
                                <div class="flex justify-between items-center mb-3">
                                    <div class="h-10 w-10 bg-gray-700 rounded-full"></div>
                                    <div class="h-4 bg-gray-700 rounded w-10"></div>
                                    <div class="h-10 w-10 bg-gray-700 rounded-full"></div>
                                </div>
                                <div class="h-4 bg-gray-700 rounded w-full mb-2"></div>
                                <div class="h-4 bg-gray-700 rounded w-full"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="match-analysis-container" class="hidden">
                        <hr class="border-gray-700 my-6">
                        
                        <div class="mb-6">
                            <h3 class="text-lg font-medium mb-4">Match Analysis</h3>
                            
                            <div id="selected-match-card" class="bg-gray-800 rounded-lg p-4 mb-4">
                                <!-- Selected match card will be rendered here -->
                            </div>
                            
                            <div class="bg-gray-800 rounded-lg p-5">
                                <h4 class="font-medium mb-3">Prediction Factors</h4>
                                <div id="factors-visualization" class="space-y-4">
                                    <!-- Factors will be rendered here -->
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-lg font-medium">AI Match Insights</h3>
                                <span class="text-xs px-2 py-1 rounded bg-blue-900 text-blue-300">Powered by AI</span>
                            </div>
                            
                            <div id="insights-container" class="space-y-4">
                                <!-- Insights will be rendered here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Append to container
        container.appendChild(enhancedPredictionsSection);
    }
    
    /**
     * Set up event listeners for enhanced predictions
     */
    setupEventListeners() {
        // This will be populated dynamically after matches are loaded
    }
    
    /**
     * Set up match card event listeners
     */
    setupMatchCardListeners() {
        const matchCards = document.querySelectorAll('.match-card');
        matchCards.forEach(card => {
            card.addEventListener('click', () => {
                const matchId = card.getAttribute('data-match-id');
                this.setActiveMatch(matchId);
            });
        });
    }
    
    /**
     * Load initial match data
     */
    async loadInitialMatchData() {
        try {
            // Show loading state
            const container = document.getElementById('match-cards-container');
            if (!container) return;
            
            // Fetch matches
            const matchesResponse = await mockAPI.getMatches();
            
            if (matchesResponse.status !== 'success') {
                throw new Error('Failed to fetch matches');
            }
            
            // Filter for upcoming matches
            const upcomingMatches = matchesResponse.data.matches.filter(match => match.status === 'scheduled');
            
            // Clear container
            container.innerHTML = '';
            
            // No matches available
            if (upcomingMatches.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-6">
                        <p class="text-gray-400">No upcoming matches available</p>
                    </div>
                `;
                return;
            }
            
            // Render match cards
            upcomingMatches.slice(0, 6).forEach(match => {
                // Get a prediction for this match
                const prediction = {
                    homeWin: 35 + Math.floor(Math.random() * 30),
                    draw: 15 + Math.floor(Math.random() * 20),
                    awayWin: 0
                };
                // Calculate away win to make total 100%
                prediction.awayWin = 100 - prediction.homeWin - prediction.draw;
                
                this.renderMatchCard(match, prediction, container);
            });
            
            // Set up event listeners
            this.setupMatchCardListeners();
            
            // Select first match by default
            if (upcomingMatches.length > 0) {
                this.setActiveMatch(upcomingMatches[0].id);
            }
            
        } catch (error) {
            console.error('Failed to load match data:', error);
            const container = document.getElementById('match-cards-container');
            if (container) {
                container.innerHTML = `
                    <div class="col-span-full bg-red-900 bg-opacity-30 text-red-400 p-4 rounded-lg">
                        <h3 class="font-medium mb-1">Error Loading Matches</h3>
                        <p class="text-sm">Failed to load match data. Please try again later.</p>
                    </div>
                `;
            }
        }
    }
    
    /**
     * Render a match card
     * @param {Object} match - Match data
     * @param {Object} prediction - Prediction data
     * @param {HTMLElement} container - Container to append the card to
     */
    renderMatchCard(match, prediction, container) {
        const matchDate = new Date(match.date);
        const formattedDate = matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const formattedTime = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        const card = document.createElement('div');
        card.className = 'match-card bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-colors cursor-pointer';
        card.setAttribute('data-match-id', match.id);
        
        card.innerHTML = `
            <div class="text-sm text-gray-400 mb-2">${formattedDate} · ${formattedTime}</div>
            
            <div class="flex justify-between items-center mb-3">
                <div class="flex flex-col items-center">
                    <img src="${match.homeTeam.logo}" alt="${match.homeTeam.name}" class="w-10 h-10 mb-1">
                    <span class="text-sm font-medium">${match.homeTeam.name}</span>
                </div>
                
                <div class="text-xs text-gray-400">VS</div>
                
                <div class="flex flex-col items-center">
                    <img src="${match.awayTeam.logo}" alt="${match.awayTeam.name}" class="w-10 h-10 mb-1">
                    <span class="text-sm font-medium">${match.awayTeam.name}</span>
                </div>
            </div>
            
            <div class="prediction-probability">
                <div class="home-win" style="width: ${prediction.homeWin}%"></div>
                <div class="draw" style="width: ${prediction.draw}%"></div>
                <div class="away-win" style="width: ${prediction.awayWin}%"></div>
            </div>
            
            <div class="flex justify-between text-xs mt-2">
                <div>${prediction.homeWin}%</div>
                <div>${prediction.draw}%</div>
                <div>${prediction.awayWin}%</div>
            </div>
        `;
        
        container.appendChild(card);
    }
    
    /**
     * Set active match for detailed analysis
     * @param {string} matchId - Match ID to analyze
     */
    async setActiveMatch(matchId) {
        if (this.selectedMatchId === matchId) return;
        
        this.selectedMatchId = matchId;
        
        // Update UI to show selected match
        const matchCards = document.querySelectorAll('.match-card');
        matchCards.forEach(card => {
            if (card.getAttribute('data-match-id') === matchId) {
                card.classList.add('bg-blue-900', 'bg-opacity-30');
                card.classList.remove('bg-gray-800', 'hover:bg-gray-700');
            } else {
                card.classList.remove('bg-blue-900', 'bg-opacity-30');
                card.classList.add('bg-gray-800', 'hover:bg-gray-700');
            }
        });
        
        try {
            // Show the analysis container
            const analysisContainer = document.getElementById('match-analysis-container');
            if (analysisContainer) {
                analysisContainer.classList.remove('hidden');
            }
            
            // Show loading states
            const selectedMatchCard = document.getElementById('selected-match-card');
            const factorsVisualization = document.getElementById('factors-visualization');
            const insightsContainer = document.getElementById('insights-container');
            
            if (selectedMatchCard) {
                selectedMatchCard.innerHTML = `
                    <div class="animate-pulse">
                        <div class="h-6 bg-gray-700 rounded w-3/4 mb-3"></div>
                        <div class="flex justify-between items-center mb-3">
                            <div class="h-10 w-10 bg-gray-700 rounded-full"></div>
                            <div class="h-4 bg-gray-700 rounded w-10"></div>
                            <div class="h-10 w-10 bg-gray-700 rounded-full"></div>
                        </div>
                        <div class="h-4 bg-gray-700 rounded w-full mb-2"></div>
                    </div>
                `;
            }
            
            if (factorsVisualization) {
                factorsVisualization.innerHTML = `
                    <div class="animate-pulse space-y-3">
                        <div class="h-6 bg-gray-700 rounded w-full"></div>
                        <div class="h-6 bg-gray-700 rounded w-full"></div>
                        <div class="h-6 bg-gray-700 rounded w-full"></div>
                    </div>
                `;
            }
            
            if (insightsContainer) {
                insightsContainer.innerHTML = `
                    <div class="animate-pulse space-y-3">
                        <div class="h-24 bg-gray-700 rounded w-full"></div>
                        <div class="h-24 bg-gray-700 rounded w-full"></div>
                    </div>
                `;
            }
            
            // Get advanced prediction
            const predictionResponse = await insightsEngine.getAdvancedPrediction(matchId);
            
            if (predictionResponse.status !== 'success') {
                throw new Error('Failed to get prediction');
            }
            
            const matchData = predictionResponse.data;
            
            // Get match details
            const matchesResponse = await mockAPI.getMatches();
            const match = matchesResponse.data.matches.find(m => m.id === matchId);
            
            if (!match) {
                throw new Error('Match not found');
            }
            
            // Render selected match
            this.renderSelectedMatch(match, matchData);
            
            // Render factors visualization
            this.renderFactorsVisualization(matchData.factors);
            
            // Render insights
            this.renderInsights(matchData.keyInsights);
            
        } catch (error) {
            console.error('Failed to analyze match:', error);
            
            // Show error message
            const selectedMatchCard = document.getElementById('selected-match-card');
            const factorsVisualization = document.getElementById('factors-visualization');
            const insightsContainer = document.getElementById('insights-container');
            
            if (selectedMatchCard) {
                selectedMatchCard.innerHTML = `
                    <div class="bg-red-900 bg-opacity-30 text-red-400 p-3 rounded">
                        <h3 class="font-medium mb-1">Error</h3>
                        <p class="text-sm">Failed to load match analysis.</p>
                    </div>
                `;
            }
            
            if (factorsVisualization) {
                factorsVisualization.innerHTML = '';
            }
            
            if (insightsContainer) {
                insightsContainer.innerHTML = '';
            }
        }
    }
    
    /**
     * Render the selected match card
     * @param {Object} match - Match data
     * @param {Object} prediction - Prediction data
     */
    renderSelectedMatch(match, prediction) {
        const selectedMatchCard = document.getElementById('selected-match-card');
        if (!selectedMatchCard) return;
        
        const matchDate = new Date(match.date);
        const formattedDate = matchDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const formattedTime = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        selectedMatchCard.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="font-medium text-lg">${match.homeTeam.name} vs ${match.awayTeam.name}</h3>
                    <p class="text-sm text-gray-400">${formattedDate} at ${formattedTime}</p>
                    <p class="text-sm text-gray-400">${match.venue}</p>
                </div>
                <div class="bg-indigo-900 bg-opacity-30 px-3 py-1 rounded-full text-indigo-300 text-sm font-medium">
                    ${prediction.confidence}% Confidence
                </div>
            </div>
            
            <div class="flex justify-between items-center mb-4">
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-500">${prediction.probabilities.homeWin}%</div>
                    <div class="text-sm text-gray-300">${match.homeTeam.name} Win</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-yellow-500">${prediction.probabilities.draw}%</div>
                    <div class="text-sm text-gray-300">Draw</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-red-500">${prediction.probabilities.awayWin}%</div>
                    <div class="text-sm text-gray-300">${match.awayTeam.name} Win</div>
                </div>
            </div>
            
            <div class="flex justify-between items-center bg-gray-700 bg-opacity-50 rounded-lg p-3">
                <div class="text-center">
                    <div class="text-sm text-gray-300">Expected Goals</div>
                    <div class="flex items-baseline mt-1">
                        <span class="text-xl font-bold">${prediction.expectedGoals.home}</span>
                        <span class="text-sm text-gray-400 mx-1">-</span>
                        <span class="text-xl font-bold">${prediction.expectedGoals.away}</span>
                    </div>
                </div>
                <div class="border-r border-gray-600 h-10"></div>
                <div class="text-center">
                    <div class="text-sm text-gray-300">Analysis Based On</div>
                    <div class="text-xl font-bold mt-1">${prediction.factors.length} Factors</div>
                </div>
                <div class="border-r border-gray-600 h-10"></div>
                <div class="text-center">
                    <div class="text-sm text-gray-300">Last Updated</div>
                    <div class="text-md font-medium mt-1">${new Date(prediction.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render factors visualization
     * @param {Array} factors - Factors affecting the prediction
     */
    renderFactorsVisualization(factors) {
        const factorsContainer = document.getElementById('factors-visualization');
        if (!factorsContainer) return;
        
        let html = '';
        
        factors.forEach(factor => {
            // Calculate width percentages
            const homeWidth = factor.homeScore;
            const awayWidth = factor.awayScore;
            
            html += `
                <div>
                    <div class="flex justify-between mb-1">
                        <span class="text-sm font-medium">${factor.name}</span>
                        <span class="text-xs text-gray-400">Weight: ${(factor.weight * 100).toFixed(0)}%</span>
                    </div>
                    <div class="flex items-center mb-2">
                        <div class="text-right w-10 text-xs">${match.homeTeam.name}</div>
                        <div class="flex-grow mx-2 h-5 bg-gray-700 rounded-full overflow-hidden">
                            <div class="flex h-full">
                                <div class="bg-blue-600 h-full" style="width: ${homeWidth}%"></div>
                                <div class="bg-red-600 h-full" style="width: ${awayWidth}%"></div>
                            </div>
                        </div>
                        <div class="w-10 text-xs">${match.awayTeam.name}</div>
                    </div>
                    <div class="flex justify-between text-xs text-gray-400">
                        <span>${homeWidth}%</span>
                        <span>${awayWidth}%</span>
                    </div>
                </div>
            `;
        });
        
        factorsContainer.innerHTML = html;
    }
    
    /**
     * Render insights for the match
     * @param {Array} insights - Match insights
     */
    renderInsights(insights) {
        const insightsContainer = document.getElementById('insights-container');
        if (!insightsContainer) return;
        
        let html = '';
        
        insights.forEach(insight => {
            // Determine background color based on insight type
            let bgColorClass = 'bg-blue-900';
            switch (insight.type) {
                case 'statistical':
                    bgColorClass = 'bg-blue-900';
                    break;
                case 'form':
                    bgColorClass = 'bg-green-900';
                    break;
                case 'tactical':
                    bgColorClass = 'bg-purple-900';
                    break;
                case 'contextual':
                    bgColorClass = 'bg-yellow-900';
                    break;
            }
            
            html += `
                <div class="${bgColorClass} bg-opacity-20 rounded-lg p-4 border border-${bgColorClass.replace('bg-', '')}">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-medium">${insight.title}</h4>
                        <span class="text-xs px-2 py-0.5 rounded bg-gray-700">${insight.confidence}% confidence</span>
                    </div>
                    <p class="text-sm text-gray-300">${insight.description}</p>
                    <div class="mt-2 flex justify-between items-center">
                        <span class="text-xs text-gray-400 capitalize">${insight.type}</span>
                        <span class="text-xs text-gray-400">Factor: ${insight.factor}</span>
                    </div>
                </div>
            `;
        });
        
        insightsContainer.innerHTML = html;
    }
}

// Create and export singleton instance
const enhancedPredictions = new EnhancedPredictions();
export default enhancedPredictions; 