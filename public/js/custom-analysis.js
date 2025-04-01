/**
 * SportsAnalyticsPro - Custom Analysis Module
 * Allows users to create custom single-factor and multi-factor predictions
 */

import insightsEngine from './insights-engine.js';
import mockAPI from './mock-api.js';

class CustomAnalysisModule {
    constructor() {
        this.initialized = false;
        this.customFactors = [];
        this.multiFactorAnalysis = [];
    }

    /**
     * Initialize the custom analysis module
     */
    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing Custom Analysis Module...');
        
        try {
            // Create UI elements
            this.createCustomAnalysisSection();
            
            // Set up event listeners
            this.setupEventListeners();
            
            this.initialized = true;
            console.log('Custom Analysis Module initialized successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Custom Analysis Module:', error);
            return false;
        }
    }
    
    /**
     * Create the custom analysis section in the UI
     */
    createCustomAnalysisSection() {
        // Find the predictions content section to append our custom analysis
        const container = document.getElementById('predictions-content');
        if (!container) return;
        
        // Create custom analysis section
        const customAnalysisSection = document.createElement('div');
        customAnalysisSection.id = 'custom-analysis-section';
        customAnalysisSection.className = 'mt-8';
        
        customAnalysisSection.innerHTML = `
            <div class="premium-card p-6 mb-6">
                <div class="flex items-center mb-4">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mr-3">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                    </div>
                    <h2 class="text-xl font-bold">Custom Factor Analysis</h2>
                </div>

                <div class="bg-gray-800 p-5 rounded-lg mb-6">
                    <h3 class="text-lg font-semibold mb-3">Single Factor Analysis</h3>
                    <p class="text-sm text-gray-400 mb-4">Enter your custom factor for analysis against our statistical model</p>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-300 mb-2">Custom Factor</label>
                        <input type="text" id="single-factor-input" class="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Team A scores first">
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">League</label>
                            <select id="single-factor-league" class="premium-select w-full">
                                <option value="4328">Premier League</option>
                                <option value="4331">La Liga</option>
                                <option value="4332">Serie A</option>
                                <option value="4335">Bundesliga</option>
                                <option value="4334">Ligue 1</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">Focus Team (Optional)</label>
                            <select id="single-factor-team" class="premium-select w-full">
                                <option value="">All Teams</option>
                                <!-- Teams will be populated dynamically -->
                            </select>
                        </div>
                    </div>
                    
                    <button id="analyze-single-factor" class="premium-button premium-button-primary">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                        </svg>
                        Analyze Factor
                    </button>
                </div>
                
                <div id="single-factor-results" class="hidden bg-gray-800 p-5 rounded-lg mb-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">Analysis Results</h3>
                        <span class="text-xs bg-blue-600 text-white px-2 py-1 rounded">AI-Generated</span>
                    </div>
                    
                    <div class="mb-4">
                        <div class="factor-title text-md font-medium mb-2"><!-- Factor title will be inserted here --></div>
                        <div class="factor-description text-sm text-gray-300 mb-3"><!-- Description will be inserted here --></div>
                    </div>
                    
                    <div class="probability-bar relative h-8 bg-gray-700 rounded-full overflow-hidden mb-2">
                        <div class="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full" style="width: 0%"></div>
                        <div class="absolute top-0 left-0 w-full h-full flex items-center justify-center text-white font-bold">0%</div>
                    </div>
                    
                    <div class="text-center text-sm mb-3">
                        <span class="text-gray-400">Probability based on historical data analysis</span>
                    </div>
                    
                    <div class="flex flex-col space-y-2 mb-4">
                        <div class="flex justify-between">
                            <span class="text-sm">Sample Size:</span>
                            <span class="text-sm font-medium sample-size">0 matches</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm">Confidence Level:</span>
                            <span class="text-sm font-medium confidence-level">0%</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm">Last 5 Matches Trend:</span>
                            <span class="text-sm font-medium trend-direction">Neutral</span>
                        </div>
                    </div>
                    
                    <div class="text-xs text-gray-400 mt-2">
                        <span>Analysis generated on <span class="analysis-timestamp">--</span></span>
                    </div>
                </div>
                
                <div class="bg-gray-800 p-5 rounded-lg">
                    <h3 class="text-lg font-semibold mb-3">Multi-Factor Analysis</h3>
                    <p class="text-sm text-gray-400 mb-4">Combine up to 5 factors to create a compound statistical prediction</p>
                    
                    <div id="multi-factor-container" class="space-y-3 mb-4">
                        <div class="factor-input-row flex items-center space-x-2">
                            <input type="text" class="multi-factor-input w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Factor 1, e.g., Arsenal wins">
                            <select class="factor-probability premium-select w-24">
                                <option value="custom">Custom</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                            <input type="number" class="custom-probability w-20 bg-gray-700 border border-gray-600 rounded-md p-3 text-white" placeholder="%" min="1" max="99">
                        </div>
                    </div>
                    
                    <div class="flex items-center justify-between mb-4">
                        <button id="add-factor-btn" class="text-sm text-blue-400 hover:text-blue-300 flex items-center">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                            </svg>
                            Add Another Factor
                        </button>
                        <span class="text-xs text-gray-400">Maximum 5 factors</span>
                    </div>
                    
                    <button id="analyze-multi-factor" class="premium-button premium-button-primary">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                        </svg>
                        Calculate Compound Probability
                    </button>
                </div>
                
                <div id="multi-factor-results" class="hidden bg-gray-800 p-5 rounded-lg mt-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">Multi-Factor Analysis Results</h3>
                        <span class="text-xs bg-purple-600 text-white px-2 py-1 rounded">Advanced Analysis</span>
                    </div>
                    
                    <div class="mb-4">
                        <div class="text-md font-medium mb-2">Compound Prediction</div>
                        <ul id="factor-list" class="list-disc pl-5 mb-3 text-sm text-gray-300">
                            <!-- Factor items will be inserted here -->
                        </ul>
                    </div>
                    
                    <div class="probability-bar relative h-8 bg-gray-700 rounded-full overflow-hidden mb-2">
                        <div class="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full" style="width: 0%"></div>
                        <div class="absolute top-0 left-0 w-full h-full flex items-center justify-center text-white font-bold compound-probability">0%</div>
                    </div>
                    
                    <div class="text-center text-sm mb-3">
                        <span class="text-gray-400">Compound probability based on statistical independence</span>
                    </div>
                    
                    <div class="flex justify-between bg-gray-700 p-3 rounded-lg mb-4">
                        <div class="text-center">
                            <div class="text-sm text-gray-400">Mathematical Probability</div>
                            <div class="text-xl font-bold mathematical-probability">0%</div>
                        </div>
                        <div class="text-center">
                            <div class="text-sm text-gray-400">Adjusted (AI Model)</div>
                            <div class="text-xl font-bold adjusted-probability">0%</div>
                        </div>
                    </div>
                    
                    <div class="p-3 bg-gray-700 rounded-lg mb-4">
                        <div class="text-sm font-medium mb-2">AI Analysis</div>
                        <p class="text-sm text-gray-300 ai-explanation">
                            <!-- AI explanation will be inserted here -->
                        </p>
                    </div>
                    
                    <div class="text-xs text-gray-400 mt-2">
                        <span>Analysis generated on <span class="multi-analysis-timestamp">--</span></span>
                    </div>
                </div>
            </div>
        `;
        
        // Append to container
        container.appendChild(customAnalysisSection);
    }
    
    /**
     * Set up event listeners for the custom analysis section
     */
    setupEventListeners() {
        // Single factor analysis
        const analyzeSingleFactorBtn = document.getElementById('analyze-single-factor');
        if (analyzeSingleFactorBtn) {
            analyzeSingleFactorBtn.addEventListener('click', () => this.analyzeSingleFactor());
        }
        
        // League change event for populating teams
        const leagueSelect = document.getElementById('single-factor-league');
        if (leagueSelect) {
            leagueSelect.addEventListener('change', () => this.populateTeams(leagueSelect.value));
            // Populate teams for default league
            this.populateTeams(leagueSelect.value);
        }
        
        // Multi-factor analysis
        const addFactorBtn = document.getElementById('add-factor-btn');
        if (addFactorBtn) {
            addFactorBtn.addEventListener('click', () => this.addFactorInput());
        }
        
        const analyzeMultiFactorBtn = document.getElementById('analyze-multi-factor');
        if (analyzeMultiFactorBtn) {
            analyzeMultiFactorBtn.addEventListener('click', () => this.analyzeMultiFactors());
        }
        
        // Add event listeners to the first factor probability select
        this.setupFactorProbabilityListeners();
    }
    
    /**
     * Setup listeners for factor probability selects
     */
    setupFactorProbabilityListeners() {
        const probSelects = document.querySelectorAll('.factor-probability');
        
        probSelects.forEach(select => {
            if (!select.hasAttribute('data-listener-attached')) {
                select.addEventListener('change', (e) => {
                    const customProbInput = e.target.nextElementSibling;
                    if (e.target.value === 'custom') {
                        customProbInput.classList.remove('hidden');
                    } else {
                        customProbInput.classList.add('hidden');
                        // Set a default value based on selection
                        switch (e.target.value) {
                            case 'high':
                                customProbInput.value = '75';
                                break;
                            case 'medium':
                                customProbInput.value = '50';
                                break;
                            case 'low':
                                customProbInput.value = '25';
                                break;
                        }
                    }
                });
                
                select.setAttribute('data-listener-attached', 'true');
            }
        });
    }
    
    /**
     * Populate teams dropdown based on selected league
     * @param {string} leagueId - League ID to fetch teams for
     */
    async populateTeams(leagueId) {
        try {
            const teamSelect = document.getElementById('single-factor-team');
            if (!teamSelect) return;
            
            // Clear existing options except the first one
            while (teamSelect.options.length > 1) {
                teamSelect.remove(1);
            }
            
            // Set loading state
            const defaultOption = teamSelect.options[0];
            defaultOption.text = 'Loading teams...';
            
            // Fetch teams
            const teamsResponse = await mockAPI.getTeams(leagueId);
            
            // Reset default option
            defaultOption.text = 'All Teams';
            
            if (teamsResponse.status === 'success') {
                const teams = teamsResponse.data.teams;
                
                // Add teams to select
                teams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.text = team.name;
                    teamSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to populate teams:', error);
        }
    }
    
    /**
     * Analyze a single custom factor
     */
    async analyzeSingleFactor() {
        // Get input values
        const factorInput = document.getElementById('single-factor-input');
        const leagueSelect = document.getElementById('single-factor-league');
        const teamSelect = document.getElementById('single-factor-team');
        
        if (!factorInput || !factorInput.value.trim()) {
            alert('Please enter a factor to analyze');
            return;
        }
        
        // Show loading state
        const analyzeBtn = document.getElementById('analyze-single-factor');
        const originalBtnText = analyzeBtn.innerHTML;
        analyzeBtn.innerHTML = `
            <div class="premium-spinner w-5 h-5 mr-2"></div>
            Analyzing...
        `;
        analyzeBtn.disabled = true;
        
        try {
            // Simulate API call for factor analysis
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Get results container
            const resultsContainer = document.getElementById('single-factor-results');
            
            // Generate a probability value - in a real app this would come from the AI model
            const probability = Math.floor(Math.random() * 60) + 20; // 20-80%
            const sampleSize = Math.floor(Math.random() * 200) + 50; // 50-250 matches
            const confidenceLevel = Math.floor(Math.random() * 30) + 60; // 60-90%
            
            // Trend direction
            const trends = ['Increasing', 'Decreasing', 'Stable'];
            const trendDirection = trends[Math.floor(Math.random() * trends.length)];
            const trendClass = trendDirection === 'Increasing' ? 'text-green-400' : 
                trendDirection === 'Decreasing' ? 'text-red-400' : 'text-yellow-400';
            
            // Update results
            const factorTitle = resultsContainer.querySelector('.factor-title');
            factorTitle.textContent = factorInput.value;
            
            const factorDescription = resultsContainer.querySelector('.factor-description');
            factorDescription.textContent = `Analysis based on ${sampleSize} matches in the selected league${teamSelect.value ? ` focusing on ${teamSelect.options[teamSelect.selectedIndex].text}` : ''}.`;
            
            // Update probability bar
            const probabilityBar = resultsContainer.querySelector('.probability-bar div:first-child');
            probabilityBar.style.width = `${probability}%`;
            
            const probabilityText = resultsContainer.querySelector('.probability-bar div:last-child');
            probabilityText.textContent = `${probability}%`;
            
            // Update stats
            resultsContainer.querySelector('.sample-size').textContent = `${sampleSize} matches`;
            resultsContainer.querySelector('.confidence-level').textContent = `${confidenceLevel}%`;
            
            const trendElement = resultsContainer.querySelector('.trend-direction');
            trendElement.textContent = trendDirection;
            trendElement.className = `text-sm font-medium trend-direction ${trendClass}`;
            
            // Update timestamp
            const timestamp = new Date().toLocaleString();
            resultsContainer.querySelector('.analysis-timestamp').textContent = timestamp;
            
            // Show results
            resultsContainer.classList.remove('hidden');
            
        } catch (error) {
            console.error('Analysis failed:', error);
            alert('Failed to analyze factor. Please try again.');
        } finally {
            // Reset button
            analyzeBtn.innerHTML = originalBtnText;
            analyzeBtn.disabled = false;
        }
    }
    
    /**
     * Add a new factor input row for multi-factor analysis
     */
    addFactorInput() {
        const container = document.getElementById('multi-factor-container');
        const factorRows = container.querySelectorAll('.factor-input-row');
        
        // Limit to 5 factors
        if (factorRows.length >= 5) {
            alert('Maximum of 5 factors allowed');
            return;
        }
        
        // Create new row
        const newRow = document.createElement('div');
        newRow.className = 'factor-input-row flex items-center space-x-2';
        newRow.innerHTML = `
            <input type="text" class="multi-factor-input w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Factor ${factorRows.length + 1}">
            <select class="factor-probability premium-select w-24">
                <option value="custom">Custom</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
            </select>
            <input type="number" class="custom-probability w-20 bg-gray-700 border border-gray-600 rounded-md p-3 text-white" placeholder="%" min="1" max="99">
            <button class="remove-factor text-gray-400 hover:text-red-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        `;
        
        // Add remove event listener
        const removeBtn = newRow.querySelector('.remove-factor');
        removeBtn.addEventListener('click', () => {
            container.removeChild(newRow);
            
            // Update placeholders to keep them sequential
            const factorInputs = container.querySelectorAll('.multi-factor-input');
            factorInputs.forEach((input, index) => {
                input.placeholder = `Factor ${index + 1}`;
            });
        });
        
        // Add to container
        container.appendChild(newRow);
        
        // Set up probability select listener
        this.setupFactorProbabilityListeners();
    }
    
    /**
     * Analyze multiple factors for compound prediction
     */
    async analyzeMultiFactors() {
        // Get all factor inputs
        const factorRows = document.querySelectorAll('.factor-input-row');
        const factors = [];
        
        // Validate and collect factors
        for (let i = 0; i < factorRows.length; i++) {
            const row = factorRows[i];
            const factorInput = row.querySelector('.multi-factor-input');
            const probabilitySelect = row.querySelector('.factor-probability');
            const customProbability = row.querySelector('.custom-probability');
            
            if (!factorInput.value.trim()) {
                alert(`Please enter a description for Factor ${i + 1}`);
                return;
            }
            
            let probability;
            if (probabilitySelect.value === 'custom') {
                if (!customProbability.value || isNaN(customProbability.value) || 
                    customProbability.value < 1 || customProbability.value > 99) {
                    alert(`Please enter a valid probability (1-99%) for Factor ${i + 1}`);
                    return;
                }
                probability = parseInt(customProbability.value);
            } else {
                // Get probability based on selection
                switch (probabilitySelect.value) {
                    case 'high':
                        probability = 75;
                        break;
                    case 'medium':
                        probability = 50;
                        break;
                    case 'low':
                        probability = 25;
                        break;
                    default:
                        probability = 50;
                }
            }
            
            factors.push({
                description: factorInput.value,
                probability: probability
            });
        }
        
        if (factors.length === 0) {
            alert('Please add at least one factor');
            return;
        }
        
        // Show loading state
        const analyzeBtn = document.getElementById('analyze-multi-factor');
        const originalBtnText = analyzeBtn.innerHTML;
        analyzeBtn.innerHTML = `
            <div class="premium-spinner w-5 h-5 mr-2"></div>
            Calculating...
        `;
        analyzeBtn.disabled = true;
        
        try {
            // Simulate API processing time
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Calculate compound probability
            // In a real app, this would use a more sophisticated AI model
            let compoundProbability = 1;
            factors.forEach(factor => {
                compoundProbability *= (factor.probability / 100);
            });
            
            // Convert to percentage
            const mathematicalProbability = (compoundProbability * 100).toFixed(2);
            
            // Add some "AI magic" by slightly adjusting the probability
            // This simulates how an AI might account for correlated factors
            const randomAdjustment = (Math.random() * 10) - 5; // -5% to +5%
            const adjustedProbability = Math.max(1, Math.min(99, parseFloat(mathematicalProbability) + randomAdjustment)).toFixed(2);
            
            // Prepare results
            const resultsContainer = document.getElementById('multi-factor-results');
            
            // Update factor list
            const factorList = resultsContainer.querySelector('#factor-list');
            factorList.innerHTML = '';
            factors.forEach(factor => {
                const li = document.createElement('li');
                li.className = 'mb-1';
                li.innerHTML = `${factor.description} <span class="text-blue-400">(${factor.probability}%)</span>`;
                factorList.appendChild(li);
            });
            
            // Update probability bars
            const probabilityBar = resultsContainer.querySelector('.probability-bar div:first-child');
            probabilityBar.style.width = `${adjustedProbability}%`;
            
            const probabilityText = resultsContainer.querySelector('.compound-probability');
            probabilityText.textContent = `${adjustedProbability}%`;
            
            // Update mathematical vs adjusted probabilities
            resultsContainer.querySelector('.mathematical-probability').textContent = `${mathematicalProbability}%`;
            resultsContainer.querySelector('.adjusted-probability').textContent = `${adjustedProbability}%`;
            
            // Generate AI explanation
            const explanations = [
                `This compound analysis combines ${factors.length} independent statistical factors. The mathematical probability (${mathematicalProbability}%) has been adjusted to ${adjustedProbability}% by our AI model to account for potential correlations between factors.`,
                `Our advanced model analyzed these ${factors.length} factors and determined a ${adjustedProbability}% probability for this combination. This differs slightly from the pure mathematical calculation (${mathematicalProbability}%) because our AI considers historical patterns.`,
                `Based on statistical analysis of these ${factors.length} factors, there is a ${adjustedProbability}% probability of this combined outcome. Our AI has refined the raw mathematical probability (${mathematicalProbability}%) to account for contextual relationships.`
            ];
            
            const aiExplanation = explanations[Math.floor(Math.random() * explanations.length)];
            resultsContainer.querySelector('.ai-explanation').textContent = aiExplanation;
            
            // Update timestamp
            const timestamp = new Date().toLocaleString();
            resultsContainer.querySelector('.multi-analysis-timestamp').textContent = timestamp;
            
            // Show results
            resultsContainer.classList.remove('hidden');
            
        } catch (error) {
            console.error('Multi-factor analysis failed:', error);
            alert('Failed to analyze factors. Please try again.');
        } finally {
            // Reset button
            analyzeBtn.innerHTML = originalBtnText;
            analyzeBtn.disabled = false;
        }
    }
}

// Create and export singleton instance
const customAnalysis = new CustomAnalysisModule();
export default customAnalysis; 