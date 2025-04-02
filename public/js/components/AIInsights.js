/**
 * AIInsights Component
 * Displays AI-powered insights and analysis for sports data
 * Extends the base Component class
 */
class AIInsights extends Component {
  /**
   * Create a new AI Insights component
   * @param {string|HTMLElement} container - Container element or ID
   * @param {SportsDataService} sportsDataService - Sports data service instance
   * @param {Object} options - Component options
   */
  constructor(container, sportsDataService, options = {}) {
    // Set default options and call parent constructor
    super(container, Object.assign({
      insightsEndpoint: '/api/insights',
      insightsCount: 4,
      loadingTemplate: `
        <div class="loading-container">
          <div class="spinner"></div>
          <p class="loading-text">Loading AI analysis...</p>
        </div>
      `,
      emptyTemplate: `
        <div class="empty-state">
          <i class="fas fa-robot"></i>
          <p>No AI insights available at the moment. Please check back later.</p>
        </div>
      `,
      refreshInterval: 300000, // 5 minutes in milliseconds
      autoRefresh: false,
      sportType: 'all',
      leagueId: null,
      insightTypes: ['prediction', 'trend', 'anomaly', 'statistical'],
      debug: false,
      useRealData: true // Prioritize real data by default
    }, options));
    
    // Store dependencies
    this.sportsDataService = sportsDataService;
    
    // Component state
    this.state = {
      isLoading: false,
      error: null,
      insights: [],
      lastUpdated: null
    };
    
    // Auto refresh timer
    this.refreshTimer = null;
  }
  
  /**
   * Initialize the component
   */
  init() {
    this.debug('Initializing AI Insights component');
    
    // Set up auto-refresh if enabled
    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    }
    
    // Initialize event listeners
    this.initEventListeners();
    
    // Call parent init (which calls render)
    super.init();
    
    // Load initial data after render
    this.loadInsights();
  }
  
  /**
   * Initialize event listeners
   */
  initEventListeners() {
    // Find refresh button if exists
    const refreshBtn = this.container.querySelector('.refresh-insights');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadInsights(true);
      });
    }
    
    // Find filter buttons if they exist
    const filterButtons = this.container.querySelectorAll('.insight-filter');
    if (filterButtons.length > 0) {
      filterButtons.forEach(btn => {
        btn.addEventListener('click', e => {
          const type = e.target.dataset.type;
          this.filterInsights(type);
          
          // Update active state on buttons
          filterButtons.forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
        });
      });
    }
  }
  
  /**
   * Render the component
   */
  render() {
    this.debug('Rendering AI Insights component');
    
    if (this.state.isLoading) {
      this.container.innerHTML = this.options.loadingTemplate;
      return this;
    }
    
    if (this.state.error) {
      this.container.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>${this.state.error}</p>
        </div>
      `;
      return this;
    }
    
    if (!this.state.insights || this.state.insights.length === 0) {
      this.container.innerHTML = this.options.emptyTemplate;
      return this;
    }
    
    // Render insights
    const insightsHTML = this.state.insights
      .map(insight => this.renderInsightCard(insight))
      .join('');
    
    // Create last updated timestamp
    const lastUpdated = this.state.lastUpdated 
      ? `Last updated: ${new Date(this.state.lastUpdated).toLocaleTimeString()}`
      : '';
    
    this.container.innerHTML = `
      <div class="insights-header">
        <div class="insights-controls">
          <div class="filter-buttons">
            <button class="insight-filter active" data-type="all">All Insights</button>
            <button class="insight-filter" data-type="prediction">Predictions</button>
            <button class="insight-filter" data-type="trend">Trends</button>
            <button class="insight-filter" data-type="statistical">Stats</button>
          </div>
          <button class="refresh-insights">
            <i class="fas fa-sync-alt"></i>
            Refresh
          </button>
        </div>
        <div class="insights-updated">${lastUpdated}</div>
      </div>
      <div class="insights-grid">${insightsHTML}</div>
    `;
    
    // Re-initialize event listeners after rendering
    this.initEventListeners();
    
    return this;
  }
  
  /**
   * Render a single insight card
   * @param {Object} insight - Insight data
   * @returns {string} - HTML for the insight card
   */
  renderInsightCard(insight) {
    // Get icon based on insight type
    const icons = {
      prediction: 'crystal-ball',
      trend: 'chart-line',
      anomaly: 'exclamation-triangle',
      statistical: 'chart-bar',
      default: 'lightbulb'
    };
    
    const icon = icons[insight.type] || icons.default;
    
    // Format confidence as percentage if it's a number
    const confidence = typeof insight.confidence === 'number'
      ? `${(insight.confidence * 100).toFixed(0)}%`
      : insight.confidence || 'High';
    
    // Generate source attribution
    const source = insight.source
      ? `<div class="insight-source">Source: ${insight.source}</div>`
      : '';
    
    // Determine badge class based on insight type
    const badgeClass = `badge-${insight.type}`;
    
    // Create data source indicator
    let dataSourceIndicator = '';
    if (insight.source === 'real_api' || insight.source === 'thesportsdb' || insight.isRealData) {
      dataSourceIndicator = `<span class="data-badge real">Real Data</span>`;
    } else if (insight.isGenerated || !insight.source || insight.source.includes('AI') || insight.source.includes('Model')) {
      dataSourceIndicator = `<span class="data-badge generated">AI Generated</span>`;
    }
    
    return `
      <div class="insight-card" data-type="${insight.type}">
        <div class="insight-header">
          <div class="insight-icon">
            <i class="fas fa-${icon}"></i>
          </div>
          <div class="insight-title">${insight.title}</div>
        </div>
        <div class="insight-content">
          <p>${insight.description}</p>
          ${insight.details ? `<p class="insight-details">${insight.details}</p>` : ''}
        </div>
        <div class="insight-footer">
          <div class="insight-metadata">
            <span class="insight-badge ${badgeClass}">${insight.type}</span>
            ${dataSourceIndicator}
            <span class="confidence">Confidence: ${confidence}</span>
          </div>
          ${source}
        </div>
      </div>
    `;
  }
  
  /**
   * Load insights from the API
   * @param {boolean} forceRefresh - Whether to force a refresh from the server
   */
  async loadInsights(forceRefresh = false) {
    this.state.isLoading = true;
    this.render();
    
    try {
      const params = {
        count: this.options.insightsCount,
        sportType: this.options.sportType,
        leagueId: this.options.leagueId,
        types: this.options.insightTypes.join(',')
      };
      
      // Add cache-busting parameter if force refresh
      if (forceRefresh) {
        params._t = Date.now();
      }
      
      // Fetch insights
      let insights;
      
      try {
        // Try API endpoint first
        const response = await fetch(`${this.options.insightsEndpoint}?${new URLSearchParams(params)}`);
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        insights = data.insights || data;
      } catch (apiError) {
        this.debug('API call failed:', apiError);
        
        // Only use fallback data if we're not prioritizing real data
        if (!this.options.useRealData) {
          this.debug('Using fallback insights data');
          insights = this.generateFallbackInsights();
        } else {
          // If we are prioritizing real data, throw the error
          this.debug('Real data prioritized, not using fallback data');
          throw apiError;
        }
      }
      
      // Process and cache the insights
      this.state.insights = this.processInsights(insights);
      this.state.isLoading = false;
      this.state.error = null;
      this.state.lastUpdated = new Date();
      
      // Render the component with new data
      this.render();
      
      // Emit event
      this.events.emit('insights-loaded', this.state.insights);
    } catch (error) {
      this.debug('Error loading insights:', error);
      
      this.state.isLoading = false;
      this.state.error = 'Failed to load AI insights. Please try again later.';
      
      // Render error state
      this.render();
      
      // Emit error event
      this.events.emit('insights-error', error);
    }
  }
  
  /**
   * Process raw insights data
   * @param {Array} insights - Raw insights data
   * @returns {Array} - Processed insights
   */
  processInsights(insights) {
    if (!Array.isArray(insights)) {
      return [];
    }
    
    return insights.map(insight => ({
      id: insight.id || `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: insight.title || 'AI Insight',
      description: insight.description || insight.content || '',
      details: insight.details || '',
      type: insight.type || 'statistical',
      confidence: insight.confidence || 0.85,
      source: insight.source || insight.provider || '',
      timestamp: insight.timestamp || new Date().toISOString(),
      teams: insight.teams || [],
      isGenerated: insight.isGenerated || false
    }));
  }
  
  /**
   * Filter insights by type
   * @param {string} type - Insight type to filter by
   */
  filterInsights(type) {
    const cards = this.container.querySelectorAll('.insight-card');
    
    if (type === 'all') {
      cards.forEach(card => card.style.display = '');
    } else {
      cards.forEach(card => {
        const cardType = card.dataset.type;
        card.style.display = cardType === type ? '' : 'none';
      });
    }
    
    // Emit filter event
    this.events.emit('insights-filtered', type);
  }
  
  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    this.stopAutoRefresh(); // Clear any existing timer
    
    this.refreshTimer = setInterval(() => {
      this.debug('Auto-refreshing insights');
      this.loadInsights();
    }, this.options.refreshInterval);
    
    this.debug(`Auto-refresh started with interval ${this.options.refreshInterval}ms`);
  }
  
  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      this.debug('Auto-refresh stopped');
    }
  }
  
  /**
   * Generate fallback insights data
   * @returns {Array} - Fallback insights
   */
  generateFallbackInsights() {
    this.debug('Generating fallback insights');
    
    const insights = [
      {
        title: 'Team Form Analysis',
        description: 'Manchester City is showing a strong positive trend in their last 5 matches with a +2.3 goal difference per game.',
        type: 'trend',
        confidence: 0.92,
        source: 'StatModel v3',
        isGenerated: true
      },
      {
        title: 'Injury Impact Alert',
        description: 'The absence of Kevin De Bruyne reduces Manchester City\'s expected goal output by 0.8 goals per match based on historical data.',
        type: 'statistical',
        confidence: 0.87,
        source: 'InjuryAnalytics',
        isGenerated: true
      },
      {
        title: 'Undervalued Betting Opportunity',
        description: 'Statistical models suggest Leicester City is undervalued by bookmakers for their next match. Expected value +15%.',
        type: 'prediction',
        confidence: 0.78,
        source: 'BetValueAI',
        isGenerated: true
      },
      {
        title: 'Player Performance Anomaly',
        description: 'Mohamed Salah\'s expected goals (xG) has exceeded actual goals by 3.7 over the last 8 matches - suggesting a potential scoring burst is imminent.',
        type: 'anomaly',
        confidence: 0.81,
        source: 'PerformanceAI',
        isGenerated: true
      },
      {
        title: 'Tactical Trend Identified',
        description: 'Arsenal has increased their high press intensity by 23% in away matches this season, resulting in 7 more high turnovers per game.',
        type: 'trend',
        confidence: 0.89,
        source: 'TacticsAI',
        isGenerated: true
      },
      {
        title: 'Weather Impact Analysis',
        description: 'Forecasted rain (75% chance) for the Liverpool vs Chelsea match historically reduces total goals by 0.7 per match.',
        type: 'statistical',
        confidence: 0.76,
        source: 'EnvironmentalFactors',
        isGenerated: true
      }
    ];
    
    // Return a subset of insights based on configured count
    return insights.slice(0, this.options.insightsCount);
  }
  
  /**
   * Clean up resources when destroying component
   */
  destroy() {
    this.stopAutoRefresh();
    super.destroy();
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIInsights;
} 