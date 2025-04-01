/**
 * Live Matches Component
 * 
 * Displays live matches and upcoming events from all leagues
 * with real-time score updates and match details.
 */

class LiveMatchesComponent {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      refreshInterval: options.refreshInterval || 60000, // 60 seconds
      matchLimit: options.matchLimit || 10,
      defaultLeague: options.defaultLeague || null,
      showMatchDetails: options.showMatchDetails || false
    };
    
    this.activeLeague = this.options.defaultLeague;
    this.matches = [];
    this.leagues = [];
    this.timer = null;
    
    // Check if container exists
    if (!this.container) {
      console.error(`Container with ID "${containerId}" not found.`);
      return;
    }
    
    // Initialize the component
    this.init();
  }
  
  /**
   * Initialize the component
   */
  async init() {
    // Create loading state
    this.renderLoading();
    
    // Fetch leagues
    await this.fetchLeagues();
    
    // Fetch initial matches
    await this.fetchMatches();
    
    // Render component
    this.render();
    
    // Set up auto-refresh
    this.startAutoRefresh();
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  /**
   * Render loading state
   */
  renderLoading() {
    this.container.innerHTML = `
      <div class="loading-container">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="loading-text mt-2">Loading matches...</p>
      </div>
    `;
  }
  
  /**
   * Fetch leagues from API
   */
  async fetchLeagues() {
    try {
      const response = await fetch('/api/leagues');
      if (!response.ok) {
        throw new Error('Failed to fetch leagues');
      }
      
      const data = await response.json();
      this.leagues = data.data || [];
      
      // If no active league and we have leagues, set the first one as active
      if (!this.activeLeague && this.leagues.length > 0) {
        this.activeLeague = this.leagues[0].name;
      }
    } catch (error) {
      console.error('Error fetching leagues:', error);
      this.renderError('Failed to load leagues. Please try again later.');
    }
  }
  
  /**
   * Fetch matches from API
   */
  async fetchMatches() {
    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (this.activeLeague) {
        params.append('league', this.activeLeague);
      }
      
      params.append('limit', this.options.matchLimit);
      
      // Fetch matches
      const response = await fetch(`/api/matches?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch matches');
      }
      
      const data = await response.json();
      this.matches = data.data || [];
      
      // Update UI
      if (this.container) {
        this.renderMatches();
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
      this.renderError('Failed to load matches. Please try again later.');
    }
  }
  
  /**
   * Render the entire component
   */
  render() {
    // Create container structure
    this.container.innerHTML = `
      <div class="live-matches-component">
        <div class="league-selector mb-3">
          <div class="d-flex justify-content-between align-items-center">
            <h3 class="component-title">Live & Upcoming Matches</h3>
            <div class="refresh-btn">
              <button class="btn btn-sm btn-outline-primary refresh-button">
                <i class="bi bi-arrow-clockwise"></i> Refresh
              </button>
            </div>
          </div>
          <div class="league-tabs mt-2">
            <ul class="nav nav-tabs" id="league-tabs">
              ${this.renderLeagueTabs()}
            </ul>
          </div>
        </div>
        <div class="matches-container" id="matches-container">
          ${this.renderMatches()}
        </div>
      </div>
    `;
    
    // Set up league tab listeners
    this.setupTabListeners();
  }
  
  /**
   * Render league tabs
   */
  renderLeagueTabs() {
    if (!this.leagues || this.leagues.length === 0) {
      return '<li class="nav-item"><span class="nav-link disabled">No leagues available</span></li>';
    }
    
    return this.leagues.map(league => {
      const isActive = league.name === this.activeLeague;
      return `
        <li class="nav-item">
          <a class="nav-link ${isActive ? 'active' : ''}" 
             href="#" 
             data-league="${league.name}">
            ${league.name}
          </a>
        </li>
      `;
    }).join('');
  }
  
  /**
   * Render matches
   */
  renderMatches() {
    const matchesContainer = this.container.querySelector('#matches-container') || this.container;
    
    if (!this.matches || this.matches.length === 0) {
      matchesContainer.innerHTML = `
        <div class="no-matches-container text-center p-4">
          <i class="bi bi-calendar-x fs-1 text-muted"></i>
          <p class="mt-3">No matches found for ${this.activeLeague || 'selected league'}</p>
        </div>
      `;
      return;
    }
    
    const matchesHtml = this.matches.map(match => this.renderMatchCard(match)).join('');
    
    matchesContainer.innerHTML = `
      <div class="row match-cards">
        ${matchesHtml}
      </div>
    `;
  }
  
  /**
   * Render a single match card
   */
  renderMatchCard(match) {
    const isLive = match.status === 'in_progress';
    const isCompleted = match.status === 'completed';
    const isScheduled = match.status === 'scheduled';
    
    // Format date
    const matchDate = new Date(match.match_date);
    const formattedDate = matchDate.toLocaleDateString();
    const formattedTime = match.match_time ? match.match_time : '00:00';
    
    // Status badge
    let statusBadge = '';
    if (isLive) {
      statusBadge = `<span class="badge bg-danger live-badge">LIVE ${match.live_minute || ''}</span>`;
    } else if (isCompleted) {
      statusBadge = '<span class="badge bg-secondary">FINAL</span>';
    } else {
      statusBadge = '<span class="badge bg-primary">UPCOMING</span>';
    }
    
    // Score display
    let scoreDisplay = '';
    if (isLive || isCompleted) {
      scoreDisplay = `
        <div class="match-score">
          <span class="home-score ${match.home_score > match.away_score ? 'winner' : ''}">${match.home_score}</span>
          <span class="score-separator">-</span>
          <span class="away-score ${match.away_score > match.home_score ? 'winner' : ''}">${match.away_score}</span>
        </div>
      `;
    } else {
      scoreDisplay = `
        <div class="match-time">
          ${formattedTime}
        </div>
      `;
    }
    
    // Match details button
    const detailsButton = this.options.showMatchDetails ? `
      <div class="match-details-btn mt-2">
        <button class="btn btn-sm btn-outline-secondary" data-match-id="${match.match_id}">
          Match Details
        </button>
      </div>
    ` : '';
    
    return `
      <div class="col-md-6 col-lg-4 mb-3">
        <div class="card match-card ${isLive ? 'live-match' : ''}">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span class="league-name">${match.league}</span>
            ${statusBadge}
          </div>
          <div class="card-body">
            <div class="match-date">${formattedDate}</div>
            <div class="team-container">
              <div class="team home-team">
                <span class="team-name">${match.home_team}</span>
              </div>
              ${scoreDisplay}
              <div class="team away-team">
                <span class="team-name">${match.away_team}</span>
              </div>
            </div>
            ${match.venue ? `<div class="match-venue mt-1 small text-muted">${match.venue}</div>` : ''}
            ${detailsButton}
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Render error message
   */
  renderError(message) {
    this.container.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        ${message}
      </div>
    `;
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Refresh button
    const refreshBtn = this.container.querySelector('.refresh-button');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.fetchMatches();
      });
    }
  }
  
  /**
   * Setup league tab listeners
   */
  setupTabListeners() {
    const tabs = this.container.querySelectorAll('#league-tabs .nav-link');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active class from all tabs
        tabs.forEach(t => t.classList.remove('active'));
        
        // Add active class to clicked tab
        tab.classList.add('active');
        
        // Update active league
        this.activeLeague = tab.dataset.league;
        
        // Fetch matches for selected league
        this.fetchMatches();
      });
    });
  }
  
  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    // Clear existing timer
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    // Set new timer
    this.timer = setInterval(() => {
      this.fetchMatches();
    }, this.options.refreshInterval);
  }
  
  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  
  /**
   * Destroy the component
   */
  destroy() {
    // Stop auto-refresh
    this.stopAutoRefresh();
    
    // Remove event listeners
    const refreshBtn = this.container.querySelector('.refresh-button');
    if (refreshBtn) {
      refreshBtn.removeEventListener('click', this.fetchMatches);
    }
    
    // Clear container
    this.container.innerHTML = '';
  }
}

// Export the component
window.LiveMatchesComponent = LiveMatchesComponent; 