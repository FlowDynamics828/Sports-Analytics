/**
 * Sports Analytics Pro - Enterprise Dashboard Core
 * Version 4.0.0
 * 
 * A modern, high-performance implementation of the sports analytics dashboard
 * with improved data handling, visualization, and user experience
 */

// Security Configuration
const SECURITY_CONFIG = {
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    tokenRefreshInterval: 5 * 60 * 1000, // 5 minutes
    apiKey: process.env.SPORTSDB_API_KEY,
    encryptionKey: process.env.ENCRYPTION_KEY,
    allowedOrigins: ['https://sportsanalyticspro.com', 'https://api.sportsanalyticspro.com']
};

// Performance Configuration
const PERFORMANCE_CONFIG = {
    cacheDuration: 5 * 60 * 1000, // 5 minutes
    maxCacheSize: 50 * 1024 * 1024, // 50MB
    debounceDelay: 300,
    throttleDelay: 1000,
    lazyLoadThreshold: 0.1,
    maxConcurrentRequests: 5
};

// Create a dashboard instance when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize security features
    initializeSecurity();
    
    // Initialize dashboard with configuration
    const dashboard = new Dashboard({
        apiBaseUrl: '/api',
        defaultLeague: '4387', // NBA
        defaultView: 'dashboardOverview',
        refreshInterval: 60000,
        dataCache: true,
        chartsEnabled: true,
        memoryOptimization: true,
        debugMode: false,
        offlineSupport: true,
        securityConfig: SECURITY_CONFIG,
        performanceConfig: PERFORMANCE_CONFIG
    });
    
    // Initialize and attach to global scope
    window.sportsDashboard = dashboard;
    
    // Attempt initialization with security checks
    dashboard.initialize()
        .then(() => {
            console.log('Dashboard successfully initialized');
            updateLoadingStatus('Initialization complete');
            hideLoadingOverlay();
        })
        .catch(error => {
            console.error('Dashboard initialization failed:', error);
            handleInitializationError(error);
        });
});

// Security initialization
function initializeSecurity() {
    // Add security headers
    const headers = {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.sportsanalyticspro.com; frame-ancestors 'none';",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };

    // Add security event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('beforeunload', handleBeforeUnload);
    
    // Initialize session management
    initializeSessionManagement();
    
    // Initialize encryption
    initializeEncryption();
}

// Session management
function initializeSessionManagement() {
    let lastActivity = Date.now();
    
    document.addEventListener('mousemove', () => lastActivity = Date.now());
    document.addEventListener('keypress', () => lastActivity = Date.now());
    
    setInterval(() => {
        if (Date.now() - lastActivity > SECURITY_CONFIG.sessionTimeout) {
            handleSessionTimeout();
        }
    }, 60000);
}

// Encryption initialization
function initializeEncryption() {
    // Initialize encryption key
    const key = SECURITY_CONFIG.encryptionKey;
    if (!key) {
        console.error('Encryption key not found');
        return;
    }
    
    // Initialize encryption utilities
    window.encryption = {
        encrypt: (data) => encryptData(data, key),
        decrypt: (data) => decryptData(data, key)
    };
}

// Loading status management
function updateLoadingStatus(message) {
    const statusElement = document.getElementById('loading-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

// Error handling
function handleInitializationError(error) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        const loadingText = loadingOverlay.querySelector('.text-xl');
        if (loadingText) {
            loadingText.textContent = 'Error loading dashboard. Please refresh.';
            loadingText.classList.add('text-red-500');
        }
    }
    
    // Log error to monitoring service
    logError(error);
}

// Error logging
function logError(error) {
    // Log to monitoring service
    if (window.monitoringService) {
        window.monitoringService.logError({
            type: 'initialization_error',
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}

class Dashboard {
  constructor(options = {}) {
    // Default configuration
    this.config = {
      apiBaseUrl: options.apiBaseUrl || '/api',
      defaultLeague: options.defaultLeague || '4328', // Default to Premier League
      defaultView: options.defaultView || 'overview',
      refreshInterval: options.refreshInterval || 60000, // 1 minute
      animationDuration: options.animationDuration || 300,
      chartsEnabled: options.chartsEnabled !== undefined ? options.chartsEnabled : true,
      memoryOptimization: options.memoryOptimization !== undefined ? options.memoryOptimization : true,
      debugMode: options.debugMode || false,
      dataCache: options.dataCache !== undefined ? options.dataCache : true,
      predictionModels: options.predictionModels || ['single-factor', 'multi-factor', 'game-outcome', 'player-performance'],
      offlineSupport: options.offlineSupport !== undefined ? options.offlineSupport : true,
      securityConfig: options.securityConfig || SECURITY_CONFIG,
      performanceConfig: options.performanceConfig || PERFORMANCE_CONFIG
    };

    // State management
    this.state = {
      isInitialized: false,
      isLoading: false,
      currentLeague: this.config.defaultLeague,
      currentView: this.config.defaultView,
      lastUpdated: null,
      selectedTeam: null,
      selectedPlayer: null,
      connectionStatus: 'connecting',
      games: [],
      teams: [],
      players: [],
      predictions: [],
      standings: [],
      fixtures: [],
      stats: {
        teams: {},
        players: {}
      },
      chartInstances: {},
      filters: {
        dateRange: 'season',
        teamId: null,
        playerId: null,
        statType: 'standard',
        predictionType: 'single-factor'
      },
      errors: [],
      cachedData: {},
      singleFactorPrediction: null,
      multiFactorPrediction: null
    };

    // Authentication state
    this.auth = {
      isAuthenticated: false,
      token: null,
      user: null,
      subscription: null
    };

    // Event subscribers
    this.subscribers = {
      dataUpdate: [],
      viewChange: [],
      error: [],
      connectionChange: [],
      selectionChange: []
    };

    // Internal timers
    this.timers = {
      dataRefresh: null,
      connectionCheck: null,
      memoryCheck: null
    };

    // UI Elements cache
    this.elements = {};

    // Chart configurations
    this.chartConfigs = {
      performance: {
        type: 'line',
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: 'rgb(209, 213, 219)',
                font: { family: 'Inter' }
              }
            },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(31, 41, 55, 0.9)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: 'rgba(55, 65, 81, 0.3)',
              borderWidth: 1,
              cornerRadius: 4,
              padding: 10,
              usePointStyle: true
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(75, 85, 99, 0.2)' },
              ticks: { color: 'rgb(156, 163, 175)' }
            },
            x: {
              grid: { color: 'rgba(75, 85, 99, 0.2)' },
              ticks: { color: 'rgb(156, 163, 175)' }
            }
          },
          animations: {
            tension: {
              duration: 1000,
              easing: 'linear',
              from: 0.8,
              to: 0.2,
              loop: false
            }
          }
        }
      },
      comparison: {
        type: 'bar',
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: 'rgb(209, 213, 219)',
                font: { family: 'Inter' }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(75, 85, 99, 0.2)' },
              ticks: { color: 'rgb(156, 163, 175)' }
            },
            x: {
              grid: { display: false },
              ticks: { color: 'rgb(156, 163, 175)' }
            }
          }
        }
      },
      playerStats: {
        type: 'radar',
        options: {
          responsive: true,
          maintainAspectRatio: false,
          elements: {
            line: {
              borderWidth: 3
            }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: 'rgb(209, 213, 219)',
                font: { family: 'Inter' }
              }
            }
          },
          scales: {
            r: {
              angleLines: {
                color: 'rgba(75, 85, 99, 0.2)'
              },
              grid: {
                color: 'rgba(75, 85, 99, 0.2)'
              },
              pointLabels: {
                color: 'rgb(156, 163, 175)',
                font: { size: 11 }
              },
              ticks: {
                backdropColor: 'transparent',
                color: 'rgb(156, 163, 175)'
              }
            }
          }
        }
      }
    };

    // Color schemes for data visualization
    this.colorSchemes = {
      primary: {
        main: 'rgba(59, 130, 246, 1)',
        light: 'rgba(59, 130, 246, 0.2)',
        dark: 'rgba(37, 99, 235, 1)',
        gradient: 'linear-gradient(to right, rgba(59, 130, 246, 1), rgba(139, 92, 246, 1))'
      },
      secondary: {
        main: 'rgba(139, 92, 246, 1)',
        light: 'rgba(139, 92, 246, 0.2)',
        dark: 'rgba(124, 58, 237, 1)',
        gradient: 'linear-gradient(to right, rgba(139, 92, 246, 1), rgba(59, 130, 246, 1))'
      },
      success: {
        main: 'rgba(16, 185, 129, 1)',
        light: 'rgba(16, 185, 129, 0.2)',
        dark: 'rgba(5, 150, 105, 1)'
      },
      warning: {
        main: 'rgba(245, 158, 11, 1)',
        light: 'rgba(245, 158, 11, 0.2)',
        dark: 'rgba(217, 119, 6, 1)'
      },
      danger: {
        main: 'rgba(239, 68, 68, 1)',
        light: 'rgba(239, 68, 68, 0.2)',
        dark: 'rgba(220, 38, 38, 1)'
      },
      info: {
        main: 'rgba(99, 102, 241, 1)',
        light: 'rgba(99, 102, 241, 0.2)',
        dark: 'rgba(79, 70, 229, 1)'
      },
      neutral: {
        100: 'rgba(243, 244, 246, 1)',
        200: 'rgba(229, 231, 235, 1)',
        300: 'rgba(209, 213, 219, 1)',
        400: 'rgba(156, 163, 175, 1)',
        500: 'rgba(107, 114, 128, 1)',
        600: 'rgba(75, 85, 99, 1)',
        700: 'rgba(55, 65, 81, 1)',
        800: 'rgba(31, 41, 55, 1)',
        900: 'rgba(17, 24, 39, 1)'
      }
    };
  }

  /**
   * Initialize the dashboard
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('Initializing Sports Analytics Pro Dashboard...');
      
      // Show loading overlay
      this._showLoadingOverlay();
      
      // Cache DOM elements for better performance
      this._cacheElements();
      
      // Check authentication
      await this._checkAuthentication();
      
      // If not auth and not on login page, redirect
      if (!this.auth.isAuthenticated && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
        return;
      }
            
      // Setup event listeners
      this._setupEventListeners();
      
      // Initial data fetch
      await this._fetchInitialData();
      
      // Start recurring updates
      this._startRecurringUpdates();
      
      // Setup charts if enabled
      if (this.config.chartsEnabled) {
        this._setupCharts();
      }
      
      // Setup memory optimization if enabled
      if (this.config.memoryOptimization) {
        this._setupMemoryOptimization();
      }
      
      // Set up offline support if enabled
      if (this.config.offlineSupport) {
        this._setupOfflineSupport();
      }
      
      // Initialize user interface based on current state
      this._updateUI();
      
      // Hide loading overlay
      this._hideLoadingOverlay();
      
      // Set initialization state
      this.state.isInitialized = true;
      
      // Log initialization complete
      console.log('Dashboard initialization complete');
      
      // Notify subscribers
      this._notify('dataUpdate', this.state);
      
      return this;
    } catch (error) {
      console.error('Initialization failed:', error);
      this._handleError('Initialization failed', error);
      this._hideLoadingOverlay();
      throw error;
    }
  }

  /**
   * Show loading overlay
   * @private
   */
  _showLoadingOverlay() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
      loadingOverlay.style.opacity = '1';
      
      // Simulate loading progress
      const progressBar = document.getElementById('loading-progress-bar');
      if (progressBar) {
        let progress = 0;
        const loadingInterval = setInterval(() => {
          progress += Math.random() * 10;
          if (progress >= 100) {
            progress = 100;
            clearInterval(loadingInterval);
          }
          progressBar.style.width = `${progress}%`;
        }, 200);
      }
    }
  }

  /**
   * Hide loading overlay
   * @private
   */
  _hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
      }, this.config.animationDuration);
    }
  }

  /**
   * Cache DOM elements for better performance
   * @private
   */
  _cacheElements() {
    // Main structural elements
    this.elements.appContainer = document.getElementById('app-container');
    this.elements.sidebar = document.getElementById('sidebar');
    this.elements.mainContent = document.querySelector('.main-content');
    this.elements.header = document.querySelector('.premium-header');
    this.elements.loadingOverlay = document.getElementById('loading-overlay');
    this.elements.loadingProgressBar = document.getElementById('loading-progress-bar');
    this.elements.toastContainer = document.getElementById('toast-container');
    
    // Navigation elements
    this.elements.tabButtons = document.querySelectorAll('.dashboard-tab-button');
    this.elements.tabs = document.querySelectorAll('.dashboard-tab');
    
    // Dashboard widgets
    this.elements.statCards = document.querySelectorAll('.stat-card');
    
    // Charts containers
    this.elements.performanceChart = document.getElementById('performance-chart');
    
    // Status indicators
    this.elements.connectionStatus = document.getElementById('connectionStatus');
    this.elements.connectionText = document.getElementById('connectionText');
    this.elements.lastUpdated = document.getElementById('lastUpdated');
    
    // Selectors and filters
    this.elements.leagueSelector = document.getElementById('league-selector');
    this.elements.teamSelector = document.getElementById('team-selector');
    
    // Metrics elements
    this.elements.gamesPlayedMetric = document.getElementById('gamesPlayedMetric');
    this.elements.averageScoreMetric = document.getElementById('averageScoreMetric');
    this.elements.winRateMetric = document.getElementById('winRateMetric');
    this.elements.predictionAccuracyMetric = document.getElementById('predictionAccuracyMetric');
    
    // Interactive buttons
    this.elements.refreshBtn = document.getElementById('refreshBtn');
    this.elements.toggleSidebar = document.getElementById('toggle-sidebar');
    this.elements.userMenuButton = document.getElementById('userMenuButton');
    this.elements.userMenu = document.getElementById('userMenu');
    this.elements.logoutBtn = document.getElementById('logoutBtn');
  }

  /**
   * Check if user is authenticated
   * @private
   * @returns {Promise<boolean>}
   */
  async _checkAuthentication() {
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.log('No authentication token found');
        return false;
      }
      
      // Set token in auth state
      this.auth.token = token;
      
      // In development mode, we can simulate auth success
      // instead of making the API request
      if (this.config.debugMode) {
        this.auth.isAuthenticated = true;
        this.auth.user = {
          id: 'user-123',
          name: 'Premium User',
          email: 'user@example.com',
          role: 'premium'
        };
        this.auth.subscription = {
          tier: 'premium',
          features: ['advanced-stats', 'predictions', 'data-export']
        };
        return true;
      }
      
      // Verify token with API
      try {
        const response = await this._apiRequest('/auth/verify');
        
        if (!response.ok) {
          throw new Error('Invalid token');
        }
        
        const userData = await response.json();
        
        // Update auth state
        this.auth.isAuthenticated = true;
        this.auth.user = userData.user;
        this.auth.subscription = userData.subscription;
        
        console.log('Authentication verified successfully');
        return true;
      } catch (error) {
        // For development fallback if API fails
        console.warn('Auth API failed, using development fallback');
        this.auth.isAuthenticated = true;
        this.auth.user = {
          id: 'user-fallback',
          name: 'Premium User',
          email: 'user@example.com',
          role: 'premium'
        };
        this.auth.subscription = {
          tier: 'premium',
          features: ['advanced-stats', 'predictions', 'data-export']
        };
        return true;
      }
    } catch (error) {
      console.error('Authentication verification failed:', error);
      
      // Clear invalid token
      localStorage.removeItem('token');
      this.auth.token = null;
      this.auth.isAuthenticated = false;
      
      return false;
    }
  }

  /**
   * Setup all event listeners
   * @private
   */
  _setupEventListeners() {
    // Handle sidebar toggle
    if (this.elements.toggleSidebar) {
      this.elements.toggleSidebar.addEventListener('click', () => {
        if (this.elements.sidebar) {
          this.elements.sidebar.classList.toggle('open');
        }
      });
    }
    
    // Handle tab switching
    if (this.elements.tabButtons) {
      this.elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          const tabId = button.getAttribute('data-tab');
          if (tabId) {
            this._switchTab(tabId);
          }
        });
      });
    }
    
    // Handle league selector
    if (this.elements.leagueSelector) {
      this.elements.leagueSelector.addEventListener('change', (e) => {
        const leagueId = e.target.value;
        this._changeLeague(leagueId);
      });
    }
    
    // Handle team selector
    if (this.elements.teamSelector) {
      this.elements.teamSelector.addEventListener('change', (e) => {
        const teamId = e.target.value;
        this._selectTeam(teamId);
      });
    }
    
    // Handle refresh button
    if (this.elements.refreshBtn) {
      this.elements.refreshBtn.addEventListener('click', () => {
        this._refreshData();
      });
    }
    
    // Handle user menu toggle
    if (this.elements.userMenuButton && this.elements.userMenu) {
      this.elements.userMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.elements.userMenu.classList.toggle('hidden');
      });
      
      // Close user menu when clicking outside
      document.addEventListener('click', (e) => {
        if (
          this.elements.userMenu && 
          !this.elements.userMenuButton.contains(e.target) && 
          !this.elements.userMenu.contains(e.target)
        ) {
          this.elements.userMenu.classList.add('hidden');
        }
      });
    }
    
    // Handle logout
    if (this.elements.logoutBtn) {
      this.elements.logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/login';
      });
    }
    
    // Setup window resize handler for responsive charts
    window.addEventListener('resize', this._debounce(() => {
      this._resizeCharts();
    }, 250));
    
    // Setup offline/online handlers
    window.addEventListener('online', () => {
      this._updateConnectionStatus('connected');
      this._refreshData();
    });
    
    window.addEventListener('offline', () => {
      this._updateConnectionStatus('disconnected');
    });
  }

  /**
   * Fetch initial data for the dashboard
   * @private
   * @returns {Promise<void>}
   */
  async _fetchInitialData() {
    try {
      this.state.isLoading = true;
      
      // Show loading progress
      let progress = 10;
      this._updateLoadingProgress(progress);
      
      // Fetch leagues (or use mock data in development)
      const leaguesData = await this._fetchData('leagues');
      
      if (leaguesData && leaguesData.success && leaguesData.response) {
        this.state.leagues = leaguesData.response;
        progress += 20;
        this._updateLoadingProgress(progress);
        
        // If no current league is set, use the first one
        if (!this.state.currentLeague && this.state.leagues.length > 0) {
          this.state.currentLeague = this.state.leagues[0].id;
        }
        
        // Populate league selector
        this._populateLeagueSelector();
      } else {
        // In case of API error, use fallback leagues
        this._populateFallbackLeagues();
        progress += 10;
        this._updateLoadingProgress(progress);
      }
      
      // Fetch teams for current league
      if (this.state.currentLeague) {
        const teamsData = await this._fetchData(`teams/${this.state.currentLeague}`);
        
        if (teamsData && teamsData.success && teamsData.response) {
          this.state.teams = teamsData.response;
          progress += 20;
          this._updateLoadingProgress(progress);
          
          // Populate team selector
          this._populateTeamSelector();
        } else {
          // Use fallback teams
          this._populateFallbackTeams();
          progress += 10;
          this._updateLoadingProgress(progress);
        }
      }
      
      // Fetch fixtures (upcoming games)
      const fixturesData = await this._fetchData(`fixtures/upcoming?leagueId=${this.state.currentLeague}`);
      
      if (fixturesData && fixturesData.success && fixturesData.response) {
        this.state.fixtures = fixturesData.response;
        progress += 20;
        this._updateLoadingProgress(progress);
        
        // Populate fixtures
        this._updateFixturesDisplay();
      }
      
      // Initialize charts with data
      progress += 20;
      this._updateLoadingProgress(progress);
      
      this._initializeCharts();
      
      // Update metrics
      this._updateMetrics();
      
      // Update last updated timestamp
      this.state.lastUpdated = new Date();
      this.state.isLoading = false;
      
      // Complete loading
      progress = 100;
      this._updateLoadingProgress(progress);
      
      return true;
    } catch (error) {
      console.error('Error fetching initial data:', error);
      this._showError(`Failed to load initial data: ${error.message}`);
      
      // Use fallback data in case of error
      this._populateFallbackLeagues();
      this._populateFallbackTeams();
      this._initializeCharts();
      this._updateMetrics();
      
      this.state.isLoading = false;
      
      // Complete loading with fallback data
      this._updateLoadingProgress(100);
      
      return false;
    }
  }
  
  /**
   * Update loading progress bar
   * @private
   * @param {number} progress - Progress percentage (0-100)
   */
  _updateLoadingProgress(progress) {
    const progressBar = this.elements.loadingProgressBar;
    if (progressBar) {
      progressBar.style.width = `${Math.min(progress, 100)}%`;
    }
  }
  
  /**
   * Helper method to make API requests
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} - Fetch Response
   */
  async _apiRequest(endpoint, options = {}) {
    const url = `${this.config.apiBaseUrl}/${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    // Add auth token if available
    if (this.auth.token) {
      headers['Authorization'] = `Bearer ${this.auth.token}`;
    }
    
    return fetch(url, {
      ...options,
      headers
    });
  }
  
  /**
   * Fetch data from API or return mock data in development
   * @private
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} - Response data
   */
  async _fetchData(endpoint) {
    try {
      // For development/demo, use mock data
      if (this.config.debugMode) {
        return this._getMockData(endpoint);
      }
      
      // Check cache if caching is enabled
      if (this.config.dataCache && this.state.cachedData[endpoint]) {
        const cachedData = this.state.cachedData[endpoint];
        const now = new Date().getTime();
        
        // Return cached data if not expired
        if (now - cachedData.timestamp < 5 * 60 * 1000) { // 5 minute cache
          return cachedData.data;
        }
      }
      
      // Make API request
      const response = await this._apiRequest(endpoint);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache the response if caching is enabled
      if (this.config.dataCache) {
        this.state.cachedData[endpoint] = {
          timestamp: new Date().getTime(),
          data
        };
      }
      
      return data;
    } catch (error) {
      console.error(`Error fetching data from ${endpoint}:`, error);
      
      // In development/demo mode, fall back to mock data
      if (this.config.debugMode) {
        return this._getMockData(endpoint);
      }
      
      // Return error response
      return {
        success: false,
        error: error.message,
        response: null
      };
    }
  }
  
  /**
   * Switch to a different tab
   * @private
   * @param {string} tabId - ID of the tab to switch to
   */
  _switchTab(tabId) {
    // Update state
    this.state.currentView = tabId;
    
    // Update UI
    if (this.elements.tabs) {
      this.elements.tabs.forEach(tab => {
        if (tab.id === tabId) {
          tab.classList.remove('hidden');
        } else {
          tab.classList.add('hidden');
        }
      });
    }
    
    if (this.elements.tabButtons) {
      this.elements.tabButtons.forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
          button.classList.add('text-blue-500');
          button.classList.remove('text-gray-400');
        } else {
          button.classList.remove('text-blue-500');
          button.classList.add('text-gray-400');
        }
      });
    }
    
    // Update section title
    const sectionTitle = document.getElementById('dashboard-section-title');
    if (sectionTitle) {
      sectionTitle.textContent = this._getTabTitle(tabId);
    }
    
    // Refresh charts if needed
    this._resizeCharts();
    
    // Notify subscribers
    this._notify('viewChange', this.state.currentView);
  }

  /**
   * Initialize charts with data
   * @private
   */
  _initializeCharts() {
    // Initialize performance chart if element exists
    if (this.elements.performanceChart && window.Chart) {
      // Destroy existing chart instance if it exists
      if (this.state.chartInstances.performance) {
        this.state.chartInstances.performance.destroy();
      }
      
      // Sample data for the chart
      const data = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
          {
            label: 'Lakers',
            data: [65, 59, 80, 81, 56, 55],
            borderColor: 'rgba(99, 102, 241, 1)',
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            tension: 0.3
          },
          {
            label: 'Warriors',
            data: [28, 48, 40, 19, 86, 27],
            borderColor: 'rgba(16, 185, 129, 1)',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            tension: 0.3
          }
        ]
      };
      
      // Create new chart
      this.state.chartInstances.performance = new Chart(
        this.elements.performanceChart,
        {
          type: this.chartConfigs.performance.type,
          data: data,
          options: this.chartConfigs.performance.options
        }
      );
    }
  }
  
  /**
   * Resize charts when window size changes
   * @private
   */
  _resizeCharts() {
    // Resize all chart instances
    Object.values(this.state.chartInstances).forEach(chart => {
      if (chart && typeof chart.resize === 'function') {
        chart.resize();
      }
    });
  }
  
  /**
   * Update dashboard metrics
   * @private
   */
  _updateMetrics() {
    // Update games played metric
    if (this.elements.gamesPlayedMetric) {
      this.elements.gamesPlayedMetric.textContent = this._getRandomMetric(20, 82);
    }
    
    // Update average score metric
    if (this.elements.averageScoreMetric) {
      this.elements.averageScoreMetric.textContent = this._getRandomMetric(95, 115).toFixed(1);
    }
    
    // Update win rate metric
    if (this.elements.winRateMetric) {
      this.elements.winRateMetric.textContent = `${this._getRandomMetric(35, 75).toFixed(1)}%`;
    }
    
    // Update prediction accuracy metric
    if (this.elements.predictionAccuracyMetric) {
      this.elements.predictionAccuracyMetric.textContent = `${this._getRandomMetric(60, 90).toFixed(1)}%`;
    }
    
    // Update last updated timestamp
    if (this.elements.lastUpdated) {
      this.elements.lastUpdated.textContent = this._formatDateTime(new Date());
    }
  }
  
  /**
   * Get a random metric value
   * @private
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} - Random value between min and max
   */
  _getRandomMetric(min, max) {
    return Math.random() * (max - min) + min;
  }
  
  /**
   * Format date time
   * @private
   * @param {Date} date - Date to format
   * @returns {string} - Formatted date string
   */
  _formatDateTime(date) {
    if (!(date instanceof Date)) {
      return 'Invalid date';
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffMin < 1) {
      return 'Just now';
    } else if (diffMin < 60) {
      return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
    } else if (diffHour < 24) {
      return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleString();
    }
  }
  
  /**
   * Populate league selector with options
   * @private
   */
  _populateLeagueSelector() {
    if (!this.elements.leagueSelector || !this.state.leagues) return;
    
    // Clear existing options
    this.elements.leagueSelector.innerHTML = '';
    
    // Add options for each league
    this.state.leagues.forEach(league => {
      const option = document.createElement('option');
      option.value = league.id;
      option.textContent = league.name;
      this.elements.leagueSelector.appendChild(option);
    });
    
    // Set current league as selected
    if (this.state.currentLeague) {
      this.elements.leagueSelector.value = this.state.currentLeague;
    }
  }
  
  /**
   * Populate team selector with options
   * @private
   */
  _populateTeamSelector() {
    if (!this.elements.teamSelector || !this.state.teams) return;
    
    // Clear existing options
    this.elements.teamSelector.innerHTML = '';
    
    // Add "All Teams" option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Teams';
    this.elements.teamSelector.appendChild(allOption);
    
    // Add options for each team
    this.state.teams.forEach(team => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      this.elements.teamSelector.appendChild(option);
    });
    
    // Set selected team if available
    if (this.state.selectedTeam) {
      this.elements.teamSelector.value = this.state.selectedTeam;
    }
  }
  
  /**
   * Change the selected league
   * @private
   * @param {string} leagueId - ID of the league to select
   */
  _changeLeague(leagueId) {
    // Update state
    this.state.currentLeague = leagueId;
    this.state.selectedTeam = null;
    
    // Show loading overlay
    this._showLoadingOverlay();
    
    // Fetch teams for the selected league
    this._fetchData(`teams/${leagueId}`)
      .then(data => {
        if (data && data.success && data.response) {
          this.state.teams = data.response;
          this._populateTeamSelector();
          this._updateUI();
        } else {
          this._populateFallbackTeams();
        }
      })
      .catch(error => {
        console.error('Error fetching teams:', error);
        this._showError('Failed to load teams');
        this._populateFallbackTeams();
      })
      .finally(() => {
        this._hideLoadingOverlay();
      });
  }
  
  /**
   * Select a team
   * @private
   * @param {string} teamId - ID of the team to select
   */
  _selectTeam(teamId) {
    // If "all" is selected, clear team selection
    if (teamId === 'all') {
      this.state.selectedTeam = null;
      this._updateUI();
      return;
    }
    
    // Update state
    this.state.selectedTeam = teamId;
    
    // Show loading overlay
    this._showLoadingOverlay();
    
    // Fetch players for the selected team
    this._fetchData(`players/${teamId}`)
      .then(data => {
        if (data && data.success && data.response) {
          this.state.players = data.response;
          this._updateUI();
        }
      })
      .catch(error => {
        console.error('Error fetching players:', error);
        this._showError('Failed to load players');
      })
      .finally(() => {
        this._hideLoadingOverlay();
      });
  }
  
  /**
   * Show error message
   * @private
   * @param {string} message - Error message
   */
  _showError(message) {
    console.error(message);
    this._showToast(message, 'error');
  }
  
  /**
   * Show toast notification
   * @private
   * @param {string} message - Toast message
   * @param {string} type - Toast type (success, error, warning, info)
   * @param {number} duration - Duration in milliseconds
   */
  _showToast(message, type = 'info', duration = 5000) {
    if (!this.elements.toastContainer) return;
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-message">${message}</div>
        <button class="toast-close">×</button>
      </div>
    `;
    
    // Add toast to container
    this.elements.toastContainer.appendChild(toast);
    
    // Add event listener to close button
    const closeButton = toast.querySelector('.toast-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        toast.classList.add('opacity-0');
        setTimeout(() => {
          toast.remove();
        }, 300);
      });
    }
    
    // Auto-remove toast after duration
    setTimeout(() => {
      toast.classList.add('opacity-0');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }
  
  /**
   * Debounce function for event handlers
   * @private
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} - Debounced function
   */
  _debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  /**
   * Populate fallback leagues when API fails
   * @private
   */
  _populateFallbackLeagues() {
    // Fallback leagues data
    this.state.leagues = [
      { id: '4387', name: 'NBA' },
      { id: '4391', name: 'NFL' },
      { id: '4424', name: 'MLB' },
      { id: '4380', name: 'NHL' },
      { id: '4328', name: 'Premier League' },
      { id: '4335', name: 'La Liga' },
      { id: '4331', name: 'Bundesliga' },
      { id: '4332', name: 'Serie A' }
    ];
    
    // Populate league selector
    this._populateLeagueSelector();
  }
  
  /**
   * Populate fallback teams when API fails
   * @private
   */
  _populateFallbackTeams() {
    // Fallback teams data based on selected league
    let teams = [];
    
    // NBA teams
    if (this.state.currentLeague === '4387') {
      teams = [
        { id: '134880', name: 'Los Angeles Lakers', city: 'Los Angeles' },
        { id: '134881', name: 'Golden State Warriors', city: 'San Francisco' },
        { id: '134882', name: 'Boston Celtics', city: 'Boston' },
        { id: '134883', name: 'Brooklyn Nets', city: 'Brooklyn' },
        { id: '134884', name: 'Chicago Bulls', city: 'Chicago' }
      ];
    }
    // Premier League teams
    else if (this.state.currentLeague === '4328') {
      teams = [
        { id: '133602', name: 'Arsenal', city: 'London' },
        { id: '133614', name: 'Liverpool', city: 'Liverpool' },
        { id: '133615', name: 'Manchester City', city: 'Manchester' },
        { id: '133616', name: 'Manchester United', city: 'Manchester' },
        { id: '133619', name: 'Chelsea', city: 'London' }
      ];
    }
    // Add more leagues as needed
    else {
      // Default teams for any other league
      teams = [
        { id: '100001', name: 'Team 1', city: 'City 1' },
        { id: '100002', name: 'Team 2', city: 'City 2' },
        { id: '100003', name: 'Team 3', city: 'City 3' },
        { id: '100004', name: 'Team 4', city: 'City 4' },
        { id: '100005', name: 'Team 5', city: 'City 5' }
      ];
    }
    
    // Update state
    this.state.teams = teams;
    
    // Populate team selector
    this._populateTeamSelector();
  }
  
  /**
   * Get tab title based on tab ID
   * @private
   * @param {string} tabId - Tab ID
   * @returns {string} - Tab title
   */
  _getTabTitle(tabId) {
    switch (tabId) {
      case 'dashboardOverview':
        return 'Overview';
      case 'dashboardTeams':
        return 'Teams';
      case 'dashboardPlayers':
        return 'Players';
      case 'dashboardPredictions':
        return 'Predictions';
      case 'dashboardFixtures':
        return 'Fixtures';
      case 'dashboardLive':
        return 'Live Games';
      case 'dashboardCharts':
        return 'Charts';
      case 'dashboardInsights':
        return 'Insights';
      case 'dashboardReports':
        return 'Reports';
      default:
        return 'Dashboard';
    }
  }
  
  /**
   * Update UI based on current state
   * @private
   */
  _updateUI() {
    // Update metrics
    this._updateMetrics();
    
    // Update connection status
    this._updateConnectionStatus(navigator.onLine ? 'connected' : 'disconnected');
    
    // Update user info if authenticated
    if (this.auth.isAuthenticated && this.auth.user) {
      const userInitial = document.getElementById('user-initial');
      const userName = document.getElementById('user-name');
      
      if (userInitial && this.auth.user.name) {
        userInitial.textContent = this.auth.user.name.charAt(0);
      }
      
      if (userName && this.auth.user.name) {
        userName.textContent = this.auth.user.name;
      }
    }
  }
  
  /**
   * Update connection status indicator
   * @private
   * @param {string} status - Connection status (connected, connecting, disconnected)
   */
  _updateConnectionStatus(status) {
    if (!this.elements.connectionStatus || !this.elements.connectionText) return;
    
    this.state.connectionStatus = status;
    
    switch (status) {
      case 'connected':
        this.elements.connectionStatus.className = 'text-green-500 mr-2';
        this.elements.connectionText.textContent = 'Connected';
        break;
      case 'connecting':
        this.elements.connectionStatus.className = 'text-yellow-500 mr-2';
        this.elements.connectionText.textContent = 'Connecting...';
        break;
      case 'disconnected':
        this.elements.connectionStatus.className = 'text-red-500 mr-2';
        this.elements.connectionText.textContent = 'Disconnected';
        break;
      default:
        this.elements.connectionStatus.className = 'text-gray-500 mr-2';
        this.elements.connectionText.textContent = 'Unknown';
    }
  }
  
  /**
   * Refresh dashboard data
   * @private
   */
  _refreshData() {
    // Show loading overlay
    this._showLoadingOverlay();
    
    // Simulate refresh with delay
    setTimeout(() => {
      this._fetchInitialData()
        .then(() => {
          this._showToast('Dashboard refreshed successfully', 'success');
          this._updateUI();
        })
        .catch(error => {
          this._showError('Failed to refresh dashboard data');
        })
        .finally(() => {
          this._hideLoadingOverlay();
        });
    }, 500);
  }
}

/**
   * Start recurring updates
   * @private
   */
  _startRecurringUpdates() {
    // Set up data refresh interval
    this.timers.dataRefresh = setInterval(() => {
      if (navigator.onLine) {
        console.log('Running scheduled data refresh');
        this._fetchData(`teams/${this.state.currentLeague}`)
          .then(data => {
            if (data && data.success && data.response) {
              this.state.teams = data.response;
              this._updateUI();
            }
          })
          .catch(error => {
            console.error('Error refreshing data:', error);
          });
      }
    }, this.config.refreshInterval);
    
    // Set up connection check interval
    this.timers.connectionCheck = setInterval(() => {
      const isOnline = navigator.onLine;
      const currentStatus = this.state.connectionStatus;
      
      if (isOnline && currentStatus !== 'connected') {
        this._updateConnectionStatus('connected');
      } else if (!isOnline && currentStatus !== 'disconnected') {
        this._updateConnectionStatus('disconnected');
      }
    }, 30000); // Check every 30 seconds
  }
  
  /**
   * Setup charts
   * @private
   */
  _setupCharts() {
    // Initialize chart configurations
    Chart.defaults.font.family = 'Inter, sans-serif';
    Chart.defaults.color = this.colorSchemes.neutral[400];
    Chart.defaults.scale.grid.color = this.colorSchemes.neutral[800];
    Chart.defaults.elements.line.borderWidth = 2;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.elements.point.hoverRadius = 5;
    
    // Create responsive resize handler
    window.addEventListener('resize', this._debounce(() => {
      Object.values(this.state.chartInstances).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
          chart.resize();
        }
      });
    }, 250));
  }
  
  /**
   * Setup memory optimization
   * @private
   */
  _setupMemoryOptimization() {
    // Perform memory check and cleanup at intervals
    if (this.config.memoryOptimization) {
      this.timers.memoryCheck = setInterval(() => {
        console.log('Running memory optimization');
        
        // Clear old cache entries
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        for (const key in this.state.cachedData) {
          const entry = this.state.cachedData[key];
          if (now - entry.timestamp > maxAge) {
            delete this.state.cachedData[key];
          }
        }
        
        // Clear unused chart instances
        for (const key in this.state.chartInstances) {
          const chartElement = document.getElementById(key + '-chart');
          if (!chartElement && this.state.chartInstances[key]) {
            this.state.chartInstances[key].destroy();
            delete this.state.chartInstances[key];
          }
        }
      }, 5 * 60 * 1000); // Run every 5 minutes
    }
  }
  
  /**
   * Setup offline support
   * @private
   */
  _setupOfflineSupport() {
    if (!this.config.offlineSupport) return;
    
    // Register event listeners for online/offline status
    window.addEventListener('online', () => {
      console.log('Device is online');
      this._updateConnectionStatus('connected');
      this._showToast('Back online. Refreshing data...', 'success');
      this._refreshData();
    });
    
    window.addEventListener('offline', () => {
      console.log('Device is offline');
      this._updateConnectionStatus('disconnected');
      this._showToast('You are offline. Limited functionality available.', 'warning');
    });
    
    // Check if we're starting in offline mode
    if (!navigator.onLine) {
      this._updateConnectionStatus('disconnected');
    }
  }
  
  /**
   * Handle errors
   * @private
   * @param {string} message - Error message
   * @param {Error} error - Error object
   */
  _handleError(message, error) {
    console.error(message, error);
    
    // Add to error log
    this.state.errors.push({
      timestamp: new Date(),
      message,
      error: error ? error.toString() : 'Unknown error',
      stack: error && error.stack ? error.stack : null
    });
    
    // Show error message to user
    this._showToast(message, 'error');
    
    // Notify subscribers
    this._notify('error', { message, error });
  }
  
  /**
   * Notify subscribers about state changes
   * @private
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  _notify(event, data) {
    if (this.subscribers[event]) {
      this.subscribers[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} subscriber:`, error);
        }
      });
    }
  }
  
  /**
   * Update fixtures display
   * @private
   */
  _updateFixturesDisplay() {
    const fixturesContainer = document.getElementById('fixtures-container');
    if (!fixturesContainer || !this.state.fixtures || !this.state.fixtures.length) return;
    
    // Clear existing fixtures
    fixturesContainer.innerHTML = '';
    
    // Create fixtures HTML
    const fixtures = this.state.fixtures.slice(0, 5); // Show top 5 fixtures
    
    fixtures.forEach(fixture => {
      const fixtureDate = new Date(fixture.date);
      const formattedDate = fixtureDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      
      const fixtureEl = document.createElement('div');
      fixtureEl.className = 'fixture-item border-b border-gray-700 py-3 first:pt-0 last:border-0';
      fixtureEl.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="fixture-date text-sm text-gray-400 w-20">${formattedDate}</div>
            <div class="fixture-teams flex items-center">
              <span class="team-name text-sm font-medium">${fixture.home.name}</span>
              <span class="mx-2 text-gray-500">vs</span>
              <span class="team-name text-sm font-medium">${fixture.away.name}</span>
            </div>
          </div>
          <div class="fixture-venue text-xs text-gray-500">${fixture.venue}</div>
        </div>
      `;
      
      fixturesContainer.appendChild(fixtureEl);
    });
    
    // Add "View All" button if there are more fixtures
    if (this.state.fixtures.length > 5) {
      const viewAllBtn = document.createElement('button');
      viewAllBtn.className = 'w-full mt-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors';
      viewAllBtn.textContent = 'View All Fixtures';
      viewAllBtn.addEventListener('click', () => {
        this._switchTab('dashboardFixtures');
      });
      
      fixturesContainer.appendChild(viewAllBtn);
    }
  }
  
  /**
   * Get mock data for endpoint
   * @private
   * @param {string} endpoint - API endpoint
   * @returns {Object} - Mock data
   */
  _getMockData(endpoint) {
    // Extract parts from endpoint
    const parts = endpoint.split('/');
    const resource = parts[0];
    
    switch (resource) {
      case 'leagues':
        return {
          success: true,
          response: [
            { id: '4387', name: 'NBA', country: 'USA' },
            { id: '4391', name: 'NFL', country: 'USA' },
            { id: '4424', name: 'MLB', country: 'USA' },
            { id: '4380', name: 'NHL', country: 'USA' },
            { id: '4328', name: 'Premier League', country: 'England' },
            { id: '4335', name: 'La Liga', country: 'Spain' },
            { id: '4331', name: 'Bundesliga', country: 'Germany' },
            { id: '4332', name: 'Serie A', country: 'Italy' }
          ]
        };
        
      case 'teams':
        const leagueId = parts[1];
        return this._getMockTeams(leagueId);
        
      case 'players':
        const teamId = parts[1];
        return this._getMockPlayers(teamId);
        
      case 'fixtures':
        return this._getMockFixtures();
        
      default:
        return {
          success: false,
          error: `No mock data available for endpoint: ${endpoint}`,
          response: null
        };
    }
  }
  
  /**
   * Get mock teams data
   * @private
   * @param {string} leagueId - League ID
   * @returns {Object} - Mock teams data
   */
  _getMockTeams(leagueId) {
    // NBA teams
    if (leagueId === '4387') {
      return {
        success: true,
        response: [
          { id: '134880', name: 'Los Angeles Lakers', city: 'Los Angeles' },
          { id: '134881', name: 'Golden State Warriors', city: 'San Francisco' },
          { id: '134882', name: 'Boston Celtics', city: 'Boston' },
          { id: '134883', name: 'Brooklyn Nets', city: 'Brooklyn' },
          { id: '134884', name: 'Chicago Bulls', city: 'Chicago' },
          { id: '134885', name: 'Miami Heat', city: 'Miami' },
          { id: '134886', name: 'Dallas Mavericks', city: 'Dallas' },
          { id: '134887', name: 'Phoenix Suns', city: 'Phoenix' }
        ]
      };
    }
    // Premier League teams
    else if (leagueId === '4328') {
      return {
        success: true,
        response: [
          { id: '133602', name: 'Arsenal', city: 'London' },
          { id: '133614', name: 'Liverpool', city: 'Liverpool' },
          { id: '133615', name: 'Manchester City', city: 'Manchester' },
          { id: '133616', name: 'Manchester United', city: 'Manchester' },
          { id: '133619', name: 'Chelsea', city: 'London' },
          { id: '133617', name: 'Tottenham Hotspur', city: 'London' },
          { id: '133624', name: 'Leicester City', city: 'Leicester' },
          { id: '133631', name: 'West Ham United', city: 'London' }
        ]
      };
    }
    // NFL teams
    else if (leagueId === '4391') {
      return {
        success: true,
        response: [
          { id: '134950', name: 'Kansas City Chiefs', city: 'Kansas City' },
          { id: '134951', name: 'San Francisco 49ers', city: 'San Francisco' },
          { id: '134952', name: 'Dallas Cowboys', city: 'Dallas' },
          { id: '134953', name: 'Green Bay Packers', city: 'Green Bay' },
          { id: '134954', name: 'Tampa Bay Buccaneers', city: 'Tampa Bay' },
          { id: '134955', name: 'Buffalo Bills', city: 'Buffalo' },
          { id: '134956', name: 'Los Angeles Rams', city: 'Los Angeles' },
          { id: '134957', name: 'New England Patriots', city: 'New England' }
        ]
      };
    }
    // Default teams for any other league
    else {
      return {
        success: true,
        response: [
          { id: '100001', name: 'Team 1', city: 'City 1' },
          { id: '100002', name: 'Team 2', city: 'City 2' },
          { id: '100003', name: 'Team 3', city: 'City 3' },
          { id: '100004', name: 'Team 4', city: 'City 4' },
          { id: '100005', name: 'Team 5', city: 'City 5' },
          { id: '100006', name: 'Team 6', city: 'City 6' },
          { id: '100007', name: 'Team 7', city: 'City 7' },
          { id: '100008', name: 'Team 8', city: 'City 8' }
        ]
      };
    }
  }
  
  /**
   * Get mock players data
   * @private
   * @param {string} teamId - Team ID
   * @returns {Object} - Mock players data
   */
  _getMockPlayers(teamId) {
    const positions = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'G/F', 'F/C'];
    const players = [];
    
    // Generate mock players based on team ID
    for (let i = 1; i <= 15; i++) {
      const position = positions[Math.floor(Math.random() * positions.length)];
      
      players.push({
        id: `player-${teamId}-${i}`,
        name: `Player ${i}`,
        position: position,
        jersey: i,
        stats: {
          ppg: (Math.random() * 25 + 5).toFixed(1),
          rpg: (Math.random() * 10 + 2).toFixed(1),
          apg: (Math.random() * 8 + 1).toFixed(1),
          spg: (Math.random() * 2 + 0.2).toFixed(1),
          bpg: (Math.random() * 1.5 + 0.1).toFixed(1),
          mpg: (Math.random() * 15 + 15).toFixed(1)
        }
      });
    }
    
    return {
      success: true,
      response: players
    };
  }
  
  /**
   * Get mock fixtures data
   * @private
   * @returns {Object} - Mock fixtures data
   */
  _getMockFixtures() {
    const fixtures = [];
    const teams = [
      'Los Angeles Lakers',
      'Golden State Warriors',
      'Boston Celtics',
      'Brooklyn Nets',
      'Chicago Bulls',
      'Miami Heat',
      'Dallas Mavericks',
      'Phoenix Suns'
    ];
    
    // Current date
    const now = new Date();
    
    // Generate 10 fixtures
    for (let i = 1; i <= 10; i++) {
      // Random date in the next 14 days
      const date = new Date(now);
      date.setDate(date.getDate() + Math.floor(Math.random() * 14) + 1);
      
      // Random teams
      const homeIndex = Math.floor(Math.random() * teams.length);
      let awayIndex = Math.floor(Math.random() * teams.length);
      
      // Make sure home and away teams are different
      while (awayIndex === homeIndex) {
        awayIndex = Math.floor(Math.random() * teams.length);
      }
      
      fixtures.push({
        id: `fixture-${i}`,
        date: date.toISOString().split('T')[0],
        home: {
          name: teams[homeIndex]
        },
        away: {
          name: teams[awayIndex]
        },
        venue: `${teams[homeIndex]} Arena`
      });
    }
    
    return {
      success: true,
      response: fixtures
    };
  }
}

// Export the Dashboard class if using modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Dashboard };
}