/**
 * SportsAnalyticsPro - Insights Integration Module
 * Connects the AI insights engine with the dashboard UI
 */

import insightsEngine from './insights-engine.js';

class InsightsIntegration {
    constructor() {
        this.initialized = false;
        this.currentLeagueId = '4328'; // Default to English Premier League
        this.insightsPanel = null;
        this.insightsPanelVisible = false;
    }
    
    /**
     * Initialize the insights integration
     */
    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing Insights Integration...');
        
        try {
            // Create insights panel
            this.createInsightsPanel();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Fetch initial insights
            await this.refreshInsights(this.currentLeagueId);
            
            this.initialized = true;
            console.log('Insights Integration initialized successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Insights Integration:', error);
            return false;
        }
    }
    
    /**
     * Set the current league
     * @param {string} leagueId - League ID to set
     */
    setCurrentLeague(leagueId) {
        if (this.currentLeagueId === leagueId) return;
        
        this.currentLeagueId = leagueId;
        this.refreshInsights(leagueId);
    }
    
    /**
     * Create the insights panel in the UI
     */
    createInsightsPanel() {
        // Check if the insights panel already exists
        if (document.getElementById('insights-panel')) return;
        
        // Create the insights panel
        const panel = document.createElement('div');
        panel.id = 'insights-panel';
        panel.className = 'fixed top-20 right-0 w-96 bg-gray-900 shadow-xl rounded-l-lg transform transition-transform duration-300 z-40 flex flex-col h-[calc(100vh-5rem)] translate-x-full';
        panel.innerHTML = `
            <div class="bg-gray-800 p-4 rounded-tl-lg flex justify-between items-center">
                <div class="flex items-center">
                    <svg class="w-5 h-5 text-blue-400 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"></path>
                        <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"></path>
                    </svg>
                    <h2 class="text-lg font-bold">AI Insights</h2>
                </div>
                <div class="flex items-center">
                    <span class="text-xs px-2 py-1 rounded bg-blue-900 text-blue-300 mr-3">Premium</span>
                    <button id="close-insights-button" class="text-gray-400 hover:text-white">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            </div>
            
            <div id="insights-panel-content" class="flex-grow overflow-y-auto p-4 space-y-4">
                <div class="flex justify-center py-10">
                    <div class="premium-spinner"></div>
                </div>
            </div>
            
            <div class="bg-gray-800 p-4 rounded-bl-lg flex justify-between items-center">
                <span class="text-xs text-gray-400" id="insights-timestamp">Last updated: --</span>
                <button id="refresh-insights-button" class="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white flex items-center">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                    Refresh
                </button>
            </div>
        `;
        
        // Add panel to the document
        document.body.appendChild(panel);
        this.insightsPanel = panel;
    }
    
    /**
     * Set up event listeners for the insights panel
     */
    setupEventListeners() {
        // Add insights button to navbar if not exists
        const navbar = document.querySelector('.premium-navbar-links');
        if (navbar) {
            const insightsButton = document.createElement('button');
            insightsButton.id = 'insights-button';
            insightsButton.className = 'flex items-center text-gray-300 hover:text-white mx-4';
            insightsButton.innerHTML = `
                <svg class="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"></path>
                    <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"></path>
                </svg>
                Insights
            `;
            
            // Add click event to toggle insights panel
            insightsButton.addEventListener('click', () => {
                this.togglePanel();
            });
            
            navbar.appendChild(insightsButton);
        }
        
        // Close button event listener
        const closeButton = document.getElementById('close-insights-button');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.togglePanel(false);
            });
        }
        
        // Refresh button event listener
        const refreshButton = document.getElementById('refresh-insights-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                this.refreshInsights(this.currentLeagueId);
            });
        }
    }
    
    /**
     * Toggle the insights panel visibility
     * @param {boolean} [show] - Whether to show or hide the panel (toggles if not provided)
     */
    togglePanel(show) {
        if (!this.insightsPanel) return;
        
        // If show is not provided, toggle current state
        if (show === undefined) {
            show = !this.insightsPanelVisible;
        }
        
        // Update panel visibility
        if (show) {
            this.insightsPanel.classList.remove('translate-x-full');
        } else {
            this.insightsPanel.classList.add('translate-x-full');
        }
        
        this.insightsPanelVisible = show;
    }
    
    /**
     * Refresh insights for a league
     * @param {string} leagueId - League ID to refresh insights for
     */
    async refreshInsights(leagueId) {
        try {
            // Show loading state
            const contentElement = document.getElementById('insights-panel-content');
            if (contentElement) {
                contentElement.innerHTML = `
                    <div class="flex justify-center py-10">
                        <div class="premium-spinner"></div>
                    </div>
                `;
            }
            
            // Add a slight delay to simulate processing
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Generate insights
            const insightsResponse = await insightsEngine.generateInsights(leagueId);
            
            if (insightsResponse.status !== 'success') {
                throw new Error('Failed to generate insights');
            }
            
            // Update insights panel
            this.renderInsights(insightsResponse.data.insights);
            
            // Update timestamp
            const timestampElement = document.getElementById('insights-timestamp');
            if (timestampElement) {
                const timestamp = new Date(insightsResponse.data.timestamp);
                timestampElement.textContent = `Last updated: ${timestamp.toLocaleTimeString()}`;
            }
            
            return true;
        } catch (error) {
            console.error('Failed to refresh insights:', error);
            
            // Show error in panel
            const contentElement = document.getElementById('insights-panel-content');
            if (contentElement) {
                contentElement.innerHTML = `
                    <div class="bg-red-900 bg-opacity-30 text-red-400 p-4 rounded-lg">
                        <h3 class="font-medium mb-1">Error Generating Insights</h3>
                        <p class="text-sm">Failed to generate insights. Please try again later.</p>
                    </div>
                `;
            }
            
            return false;
        }
    }
    
    /**
     * Render insights in the panel
     * @param {Array} insights - Insights to render
     */
    renderInsights(insights) {
        const contentElement = document.getElementById('insights-panel-content');
        if (!contentElement) return;
        
        if (!insights || insights.length === 0) {
            contentElement.innerHTML = `
                <div class="text-center py-4">
                    <p class="text-gray-400">No insights available</p>
                </div>
            `;
            return;
        }
        
        let html = ``;
        
        // Group insights by type
        const groupedInsights = {};
        
        insights.forEach(insight => {
            if (!groupedInsights[insight.type]) {
                groupedInsights[insight.type] = [];
            }
            groupedInsights[insight.type].push(insight);
        });
        
        // Render each group
        for (const [type, typeInsights] of Object.entries(groupedInsights)) {
            html += `
                <div class="mb-4">
                    <h3 class="text-md font-semibold mb-2 text-gray-300 capitalize">${type} Insights</h3>
                    <div class="space-y-3">
            `;
            
            typeInsights.forEach(insight => {
                // Set background and text colors based on confidence
                let colorClass;
                if (insight.confidence >= 85) {
                    colorClass = 'bg-green-900 bg-opacity-20 border-green-800';
                } else if (insight.confidence >= 70) {
                    colorClass = 'bg-blue-900 bg-opacity-20 border-blue-800';
                } else {
                    colorClass = 'bg-yellow-900 bg-opacity-20 border-yellow-800';
                }
                
                html += `
                    <div class="rounded-lg p-3 border ${colorClass}">
                        <div class="flex justify-between mb-1">
                            <h4 class="font-medium">${insight.title}</h4>
                            <span class="text-xs px-2 py-0.5 rounded bg-gray-800">${insight.confidence}%</span>
                        </div>
                        <p class="text-sm text-gray-300">${insight.description}</p>
                        <div class="flex justify-end mt-2">
                            <span class="text-xs text-gray-400">Source: ${insight.source}</span>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        contentElement.innerHTML = html;
    }
}

// Create and export singleton instance
const insightsIntegration = new InsightsIntegration();
export default InsightsIntegration; 