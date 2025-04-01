// Professional Sports Analytics Dashboard - Main Controller
// Version 3.1.0

// Standard imports
import LoadingState from './loadingstate.js';
import Toast from './toast.js';
import ErrorBoundary from './ErrorBoundary.js';
import SecurityManager from './security/SecurityManager.js';
import PredictionManager from './predictions.js';
import WebSocketClient from './websocket.js';
import Cache from './cache.js';

class SportsAnalyticsDashboard {
    constructor() {
        this.initialized = false;
        this.managers = {
            security: null,
            dashboard: null,
            predictions: null,
            websocket: null,
            cache: null
        };
        this.state = {
            currentLeague: 'nba',
            selectedTeam: '',
            user: null,
            isLoading: true,
            connectionStatus: 'connecting',
            lastUpdate: null
        };
        this.errorBoundary = new ErrorBoundary(document.getElementById('dashboardContainer'));
    }

    async initialize() {
        if (this.initialized) return;

        try {
            console.log('Initializing Sports Analytics Dashboard...');
            LoadingState.show('dashboardInit', 'Initializing dashboard...');
            
            // Verify authentication
            await this.verifyAuthentication();
            
            // Initialize security first
            this.managers.security = new SecurityManager();
            await this.managers.security.initialize();
            
            // Initialize other components in parallel for better performance
            await Promise.all([
                this.initializeWebsocket(),
                this.initializeCache(),
                this.initializeDashboard(),
                this.initializePredictions()
            ]);
            
            // Set up global event handlers
            this.setupEventHandlers();
            
            // Initial data load
            await this.loadInitialData();
            
            this.initialized = true;
            console.log('Dashboard initialized successfully');
            
            // Hide loading screen with slight delay for smooth transition
            setTimeout(() => {
                LoadingState.hide('dashboardInit');
                this.state.isLoading = false;
            }, 500);
            
            // Show welcome message
            const displayName = this.state.user?.firstName || 'User';
            Toast.show(`Welcome back, ${displayName}!`, 'success');
            
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.handleInitializationError(error);
            LoadingState.hide('dashboardInit');
        }
    }

    async verifyAuthentication() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('No authentication token found, redirecting to login');
            window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
            throw new Error('Authentication required');
        }

        try {
            console.log('Verifying authentication token...');
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Authentication failed with status ${response.status}`);
            }

            const userData = await response.json();
            this.state.user = userData.user || userData;
            
            // Update UI with user info
            this.updateUserInterface(this.state.user);
            
            console.log('Authentication verified successfully');
            return this.state.user;
        } catch (error) {
            console.error('Authentication verification failed:', error);
            localStorage.removeItem('token');
            window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
            throw new Error('Authentication failed: ' + (error.message || 'Unknown error'));
        }
    }

    updateUserInterface(userData) {
        if (!userData) return;
        
        const welcomeNameEl = document.getElementById('welcomeName');
        if (welcomeNameEl) {
            welcomeNameEl.textContent = userData.firstName || userData.email.split('@')[0];
        }
        
        const userInitialsEl = document.getElementById('userInitials');
        if (userInitialsEl) {
            const nameParts = (userData.firstName && userData.lastName) 
                ? [userData.firstName, userData.lastName] 
                : userData.email.split('@')[0].split('.');
            
            const initials = nameParts
                .map(part => part.charAt(0).toUpperCase())
                .slice(0, 2)
                .join('');
            
            userInitialsEl.textContent = initials;
        }
        
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = userData.firstName && userData.lastName
                ? `${userData.firstName} ${userData.lastName}`
                : userData.email.split('@')[0];
        }
        
        const userSubscriptionEl = document.getElementById('userSubscription');
        if (userSubscriptionEl) {
            const subscription = userData.subscription || 'free';
            userSubscriptionEl.textContent = subscription.charAt(0).toUpperCase() + subscription.slice(1);
            
            // If user is not premium, show the pro badge upsell
            const proBadgeEl = document.getElementById('proBadge');
            if (proBadgeEl && subscription.toLowerCase() !== 'premium') {
                proBadgeEl.classList.remove('hidden');
            }
        }
    }

    async initializeWebsocket() {
        try {
            console.log('Initializing WebSocket connection...');
            this.managers.websocket = new WebSocketClient();
            
            // Set up WebSocket events
            this.managers.websocket.onMessage = this.handleWebSocketMessage.bind(this);
            this.managers.websocket.onStatusChange = this.handleConnectionChange.bind(this);
            
            // Connect to WebSocket server
            await this.managers.websocket.connect('wss://new-websocket-url.com');
            console.log('WebSocket connection initialized');
        } catch (error) {
            console.error('WebSocket initialization failed:', error);
            // We'll continue without WebSocket - it's not critical
            Toast.show('Live updates unavailable. Please refresh manually for new data.', 'warning', 5000);
        }
    }

    async initializeCache() {
        try {
            console.log('Initializing cache system...');
            this.managers.cache = Cache;
            // Set TTL based on subscription level - premium users get shorter cache times for fresher data
            const cacheTTL = this.state.user?.subscription === 'premium' ? 3 * 60 : 5 * 60; // 3 or 5 minutes
            this.managers.cache.setTTL(cacheTTL);
            console.log(`Cache system initialized with TTL: ${cacheTTL}s`);
        } catch (error) {
            console.error('Cache initialization failed:', error);
            // Create a simple fallback cache
            this.managers.cache = {
                _cache: new Map(),
                get: (key) => this._cache.get(key),
                set: (key, value) => this._cache.set(key, value),
                clear: () => this._cache.clear(),
                setTTL: () => {} // No-op
            };
        }
    }

    async initializeDashboard() {
        try {
            console.log('Initializing dashboard manager...');
            this.managers.dashboard = new DashboardManager({
                onError: this.handleComponentError.bind(this, 'dashboard')
            });
            await this.managers.dashboard.initialize();
            console.log('Dashboard manager initialized');
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            throw error; // Dashboard is critical, so throw error
        }
    }

    async initializePredictions() {
        try {
            console.log('Initializing prediction system...');
            this.managers.predictions = PredictionManager;
            await this.managers.predictions.initialize();
            console.log('Prediction system initialized');
        } catch (error) {
            console.error('Prediction system initialization failed:', error);
            Toast.show('Some prediction features may be limited', 'warning');
            // Continue without full predictions
        }
    }

    setupEventHandlers() {
        // League selection change
        const leagueSelect = document.getElementById('leagueSelect');
        if (leagueSelect) {
            leagueSelect.addEventListener('change', this.handleLeagueChange.bind(this));
        }

        // Team selection change
        const teamSelect = document.getElementById('teamSelect');
        if (teamSelect) {
            teamSelect.addEventListener('change', this.handleTeamChange.bind(this));
        }

        // Games filter change
        const gamesFilter = document.getElementById('gamesFilter');
        if (gamesFilter) {
            gamesFilter.addEventListener('change', this.handleGamesFilterChange.bind(this));
        }

        // Chart type change
        const chartType = document.getElementById('chartType');
        if (chartType) {
            chartType.addEventListener('change', this.handleChartTypeChange.bind(this));
        }

        // Prediction events
        const addFactorBtn = document.getElementById('addFactorBtn');
        if (addFactorBtn && this.managers.predictions) {
            addFactorBtn.addEventListener('click', () => {
                this.managers.predictions.addFactorInput();
            });
        }

        const exportHistoryBtn = document.getElementById('exportHistoryBtn');
        if (exportHistoryBtn && this.managers.predictions) {
            exportHistoryBtn.addEventListener('click', () => {
                this.managers.predictions.exportPredictionHistory();
            });
        }

        // User interaction events
        const exportPredictionBtn = document.getElementById('exportPredictionBtn');
        if (exportPredictionBtn) {
            exportPredictionBtn.addEventListener('click', this.handleExportPrediction.bind(this));
        }
        
        const savePredictionBtn = document.getElementById('savePredictionBtn');
        if (savePredictionBtn) {
            savePredictionBtn.addEventListener('click', this.handleSavePrediction.bind(this));
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData(true); // Force refresh
            });
        }

        // Navigation events 
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.handleLogout.bind(this));
        }

        // League dropdown handlers
        const leagueOptions = document.querySelectorAll('.league-option');
        leagueOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                const league = e.currentTarget.dataset.league;
                if (league) {
                    this.setCurrentLeague(league);
                }
            });
        });

        // Window events
        window.addEventListener('online', () => this.handleConnectionChange('online'));
        window.addEventListener('offline', () => this.handleConnectionChange('offline'));
        
        // Custom events
        document.addEventListener('dataRefresh', this.handleDataRefresh.bind(this));

        console.log('Event handlers set up');
    }

    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            LoadingState.show('dataLoad', 'Loading data...');
            
            // Update league display
            const currentLeagueEl = document.getElementById('currentLeague');
            if (currentLeagueEl) {
                currentLeagueEl.textContent = this.state.currentLeague.toUpperCase();
            }
            
            const dashboardLeagueNameEl = document.getElementById('dashboardLeagueName');
            if (dashboardLeagueNameEl) {
                dashboardLeagueNameEl.textContent = this.state.currentLeague.toUpperCase();
            }
            
            // Load data for current league
            const league = this.state.currentLeague;
            
            // Load teams first - other data depends on this
            await this.loadTeams(league);
            
            // Then load stats and games in parallel
            await Promise.all([
                this.loadStats(league, this.state.selectedTeam),
                this.loadGames(league, this.state.selectedTeam)
            ]);
            
            // Update last update time
            this.updateLastUpdatedTime();
            console.log('Initial data loaded successfully');
            
            LoadingState.hide('dataLoad');
            
            // Subscribe to updates
            if (this.managers.websocket && this.managers.websocket.isConnected()) {
                this.managers.websocket.subscribe(league);
            }
        } catch (error) {
            console.error('Initial data loading failed:', error);
            this.showDataLoadingError(error.message);
            LoadingState.hide('dataLoad');
        }
    }

    updateLastUpdatedTime() {
        this.state.lastUpdate = new Date();
        
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = 'Just now';
            
            // Set up an interval to update the "time ago" text
            if (this._lastUpdateInterval) {
                clearInterval(this._lastUpdateInterval);
            }
            
            this._lastUpdateInterval = setInterval(() => {
                if (!this.state.lastUpdate) return;
                
                const secondsAgo = Math.floor((new Date() - this.state.lastUpdate) / 1000);
                let timeAgoText;
                
                if (secondsAgo < 60) {
                    timeAgoText = `${secondsAgo} seconds ago`;
                } else if (secondsAgo < 3600) {
                    const minutes = Math.floor(secondsAgo / 60);
                    timeAgoText = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
                } else {
                    const hours = Math.floor(secondsAgo / 3600);
                    timeAgoText = `${hours} hour${hours > 1 ? 's' : ''} ago`;
                }
                
                lastUpdatedEl.textContent = timeAgoText;
            }, 30000); // Update every 30 seconds
        }
    }

    async loadTeams(league) {
        try {
            console.log(`Loading teams for ${league}...`);
            
            // Show loading state in team selectors
            const teamSelectors = document.querySelectorAll('.team-selector, #teamSelect');
            teamSelectors.forEach(selector => {
                if (selector instanceof HTMLSelectElement) {
                    selector.disabled = true;
                    selector.innerHTML = '<option value="">Loading teams...</option>';
                }
            });

            const response = await fetch(`/api/leagues/${league}/teams`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load teams: ${response.status}`);
            }
            
            const result = await response.json();
            const teams = result.data || [];
            
            // Update all team selectors
            teamSelectors.forEach(selector => {
                if (selector instanceof HTMLSelectElement) {
                    selector.innerHTML = '<option value="">All Teams</option>';
                    teams.forEach(team => {
                        const option = document.createElement('option');
                        option.value = team.id || team.teamId;
                        option.textContent = team.name || team.displayName;
                        selector.appendChild(option);
                    });
                    selector.disabled = false;
                }
            });

            // Store teams in state
            this.state.teams = teams;
            
            // If there was a previously selected team for this league, try to restore it
            const previousTeam = localStorage.getItem('selectedTeam');
            if (previousTeam && teams.some(t => (t.id === previousTeam || t.teamId === previousTeam))) {
                this.state.selectedTeam = previousTeam;
                teamSelectors.forEach(selector => {
                    if (selector instanceof HTMLSelectElement) {
                        selector.value = previousTeam;
                    }
                });
            } else {
                // Reset team selection
                this.state.selectedTeam = '';
                localStorage.setItem('selectedTeam', '');
                teamSelectors.forEach(selector => {
                    if (selector instanceof HTMLSelectElement) {
                        selector.value = '';
                    }
                });
            }

            return teams;
        } catch (error) {
            console.error(`Error loading teams for ${league}:`, error);
            // Show error in selectors
            const teamSelectors = document.querySelectorAll('.team-selector, #teamSelect');
            teamSelectors.forEach(selector => {
                if (selector instanceof HTMLSelectElement) {
                    selector.innerHTML = '<option value="">Error loading teams</option>';
                    selector.disabled = true;
                }
            });
            throw error;
        }
    }

    async loadStats(league, team = '') {
        try {
            console.log(`Loading stats for ${league}${team ? ` (team: ${team})` : ''}...`);
            
            // Try to get from cache first
            const cacheKey = `stats:${league}:${team}`;
            const cachedStats = this.managers.cache.get(cacheKey);
            
            if (cachedStats) {
                console.log(`Using cached stats for ${league}${team ? ` (team: ${team})` : ''}`);
                this.updateDashboardStats(cachedStats);
                return cachedStats;
            }
            
            const response = await fetch(`/api/stats/${league}${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load stats: ${response.status}`);
            }
            
            const stats = await response.json();
            
            // Cache the stats
            this.managers.cache.set(cacheKey, stats);
            
            this.updateDashboardStats(stats);
            return stats;
        } catch (error) {
            console.error(`Error loading stats for ${league}:`, error);
            // Don't rethrow - we can continue without stats
            Toast.show('Unable to load statistics. Some data may be unavailable.', 'warning');
            return null;
        }
    }

    async loadGames(league, team = '') {
        try {
            console.log(`Loading games for ${league}${team ? ` (team: ${team})` : ''}...`);
            
            // Try to get from cache first
            const cacheKey = `games:${league}:${team}`;
            const cachedGames = this.managers.cache.get(cacheKey);
            
            if (cachedGames) {
                console.log(`Using cached games for ${league}${team ? ` (team: ${team})` : ''}`);
                this.updateGamesList(cachedGames);
                this.updatePerformanceChart(cachedGames);
                return cachedGames;
            }
            
            const response = await fetch(`/api/games/${league}${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load games: ${response.status}`);
            }
            
            const games = await response.json();
            
            // Validate games data structure
            if (!Array.isArray(games)) {
                throw new Error('Invalid games data: expected an array');
            }
            
            // Cache the games
            this.managers.cache.set(cacheKey, games);
            
            this.updateGamesList(games);
            this.updatePerformanceChart(games);
            return games;
        } catch (error) {
            console.error(`Error loading games for ${league}:`, error);
            // Don't rethrow - we can continue without games
            Toast.show('Unable to load games. Some data may be unavailable.', 'warning');
            return [];
        }
    }

    updateDashboardStats(stats) {
        if (!stats) return;
        
        // Map of element IDs to stats values with formatting
        const elements = {
            'totalGames': stats.totalGames || '-',
            'avgScore': stats.averageScore ? stats.averageScore.toFixed(1) : '-',
            'winRate': stats.homeWinPercentage ? `${stats.homeWinPercentage.toFixed(1)}%` : '-',
            'predictionAccuracy': stats.predictionAccuracy ? `${stats.predictionAccuracy.toFixed(1)}%` : '-'
        };

        // Update each element if it exists
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                
                // Add data-trend attribute for styling if available
                if (stats.trends && stats.trends[id]) {
                    const trend = stats.trends[id];
                    element.setAttribute('data-trend', trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral');
                    
                    // If we have a trend indicator element, update it
                    const trendEl = document.getElementById(`${id}Trend`);
                    if (trendEl) {
                        trendEl.textContent = trend > 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`;
                        trendEl.className = trend > 0 
                            ? 'ml-2 text-sm font-medium text-green-500 flex items-center'
                            : 'ml-2 text-sm font-medium text-red-500 flex items-center';
                    }
                }
            }
        });
    }

    updateGamesList(games) {
        const container = document.getElementById('recentGames');
        if (!container) return;

        // Get the number of games to display
        const gamesFilterEl = document.getElementById('gamesFilter');
        const limit = gamesFilterEl ? parseInt(gamesFilterEl.value || 5) : 5;

        if (!games || !games.length) {
            container.innerHTML = '<div class="text-gray-400 text-center p-4">No games available</div>';
            return;
        }

        // Create a document fragment for better performance when adding multiple elements
        const fragment = document.createDocumentFragment();
        
        // Add each game up to the limit
        games.slice(0, limit).forEach(game => {
            const gameEl = document.createElement('div');
            gameEl.className = 'bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors mb-4';
            
            // Format date properly
            const gameDate = new Date(game.date);
            const formattedDate = gameDate.toLocaleDateString(undefined, { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            gameEl.innerHTML = `
                <div class="flex justify-between items-center">
                    <div class="text-lg">
                        <div class="font-bold">${game.homeTeam?.name || 'Home Team'}</div>
                        <div class="text-2xl">${game.homeTeam?.score !== undefined ? game.homeTeam.score : '-'}</div>
                    </div>
                    <div class="text-gray-400 mx-4">VS</div>
                    <div class="text-lg text-right">
                        <div class="font-bold">${game.awayTeam?.name || 'Away Team'}</div>
                        <div class="text-2xl">${game.awayTeam?.score !== undefined ? game.awayTeam.score : '-'}</div>
                    </div>
                </div>
                <div class="text-sm text-gray-400 mt-2 flex justify-between">
                    <span>${formattedDate}</span>
                    ${game.status ? `<span class="px-2 py-0.5 rounded bg-gray-800 text-xs">${game.status}</span>` : ''}
                </div>
            `;
            
            fragment.appendChild(gameEl);
        });
        
        // Clear container and append all games at once
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    updatePerformanceChart(games) {
        const chart = this.managers.dashboard?.chart;
        if (!chart || !games || !games.length) return;
        
        const chartTypeEl = document.getElementById('chartType');
        const chartType = chartTypeEl?.value || 'score';
        
        const gamesFilterEl = document.getElementById('gamesFilter');
        const limit = gamesFilterEl ? parseInt(gamesFilterEl.value || 5) : 5;
        
        const limitedGames = games.slice(0, limit);
        
        // Prepare data based on chart type
        const labels = limitedGames.map(game => {
            const gameDate = new Date(game.date);
            return gameDate.toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric' 
            });
        });
        
        let datasets = [];
        
        if (chartType === 'score') {
            datasets = [
                {
                    label: 'Home Score',
                    data: limitedGames.map(game => game.homeTeam?.score || 0),
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    tension: 0.1
                },
                {
                    label: 'Away Score',
                    data: limitedGames.map(game => game.awayTeam?.score || 0),
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    tension: 0.1
                }
            ];
        } else if (chartType === 'differential') {
            // Point differential
            datasets = [
                {
                    label: 'Point Differential',
                    data: limitedGames.map(game => (game.homeTeam?.score || 0) - (game.awayTeam?.score || 0)),
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: function(context) {
                        const value = context.dataset.data[context.dataIndex];
                        return value >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                    },
                    tension: 0.1
                }
            ];
        } else if (chartType === 'combined') {
            // Combined score
            datasets = [
                {
                    label: 'Total Score',
                    data: limitedGames.map(game => (game.homeTeam?.score || 0) + (game.awayTeam?.score || 0)),
                    borderColor: 'rgba(139, 92, 246, 1)',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    tension: 0.1
                }
            ];
        }
        
        // Update chart data
        chart.data.labels = labels;
        chart.data.datasets = datasets;
        chart.update();
    }

    handleWebSocketMessage(message) {
        try {
            const { type, league, data } = message;
            
            if (type === 'gameUpdate' && league.toLowerCase() === this.state.currentLeague) {
                console.log('Received game update:', message);
                Toast.show('New data available! Refreshing...', 'info');
                
                // Refresh data
                this.refreshData();
            } else if (type === 'pong') {
                // Handle pong response (keep-alive)
                const latency = Date.now() - message.timestamp;
                console.log(`WebSocket latency: ${latency}ms`);
            } else if (type === 'notification') {
                // Handle generic notifications
                Toast.show(message.message, message.level || 'info');
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    handleConnectionChange(status) {
        let newStatus;
        switch(status) {
            case 'connected':
                newStatus = 'connected';
                break;
            case 'disconnected':
                newStatus = 'disconnected';
                break;
            case 'error':
                newStatus = 'error';
                break;
            case 'online':
                // Browser online event - try to reconnect WebSocket
                if (this.managers.websocket && this.managers.websocket.getStatus() !== 'connected') {
                    this.managers.websocket.connect().catch(() => {});
                }
                newStatus = 'connected';
                break;
            case 'offline':
                newStatus = 'disconnected';
                break;
            default:
                newStatus = 'unknown';
        }
        
        this.state.connectionStatus = newStatus;
        this.updateConnectionStatus(newStatus);
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        const textElement = document.getElementById('connectionText');
        
        if (!statusElement || !textElement) return;
        
        const statusConfig = {
            'connected': { class: 'text-green-500', text: 'Connected' },
            'disconnected': { class: 'text-red-500', text: 'Disconnected' },
            'error': { class: 'text-red-500', text: 'Connection Error' },
            'unknown': { class: 'text-yellow-500', text: 'Unknown' }
        };
        
        const config = statusConfig[status] || statusConfig.unknown;
        
        statusElement.className = `${config.class} mr-2`;
        textElement.textContent = config.text;
    }

    async refreshData(force = false) {
        if (this.state.isLoading && !force) {
            console.log('Already loading data, skipping refresh');
            return;
        }
        
        try {
            this.state.isLoading = true;
            
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.classList.add('opacity-50');
            }
            
            // Load data for current league
            const league = this.state.currentLeague;
            const team = this.state.selectedTeam;
            
            // Load stats and games in parallel
            await Promise.all([
                this.loadStats(league, team),
                this.loadGames(league, team)
            ]);
            
            // Update last update time
            this.updateLastUpdatedTime();
            
            console.log('Data refreshed successfully');
            if (force) {
                Toast.show('Data refreshed successfully', 'success');
            }
        } catch (error) {
            console.error('Data refresh failed:', error);
            Toast.show('Failed to refresh data', 'error');
        } finally {
            this.state.isLoading = false;
            
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('opacity-50');
            }
        }
    }

    setCurrentLeague(newLeague) {
        if (!newLeague || newLeague === this.state.currentLeague) return;
        
        console.log(`League changed: ${this.state.currentLeague} -> ${newLeague}`);
        
        // Update state
        this.state.currentLeague = newLeague;
        this.state.selectedTeam = '';
        
        // Update UI
        const currentLeagueEl = document.getElementById('currentLeague');
        if (currentLeagueEl) {
            currentLeagueEl.textContent = newLeague.toUpperCase();
        }
        
        const dashboardLeagueNameEl = document.getElementById('dashboardLeagueName');
        if (dashboardLeagueNameEl) {
            dashboardLeagueNameEl.textContent = newLeague.toUpperCase();
        }
        
        const currentTeamEl = document.getElementById('currentTeam');
        if (currentTeamEl) {
            currentTeamEl.textContent = 'All Teams';
        }
        
        // Update league icon if it exists
        const currentLeagueIconEl = document.getElementById('currentLeagueIcon');
        if (currentLeagueIconEl) {
            currentLeagueIconEl.src = `/assets/icons/leagues/${newLeague}.svg`;
            currentLeagueIconEl.alt = newLeague.toUpperCase();
        }
        
        // Update select visual state
        const teamSelectEl = document.getElementById('teamSelect');
        if (teamSelectEl) {
            teamSelectEl.value = '';
        }
        
        // Dispatch custom event for other components
        window.dispatchEvent(new CustomEvent('leagueChange', { 
            detail: { 
                league: newLeague,
                leagueName: newLeague.toUpperCase()
            }
        }));
        
        // Update websocket subscription
        if (this.managers.websocket && this.managers.websocket.isConnected()) {
            // Unsubscribe from current league first
            if (this.state.currentLeague) {
                this.managers.websocket.unsubscribe(this.state.currentLeague);
            }
            // Subscribe to new league
            this.managers.websocket.subscribe(newLeague);
        }
        
        // Hide league dropdown
        const leagueMenuEl = document.getElementById('leagueMenu');
        if (leagueMenuEl) {
            leagueMenuEl.classList.add('hidden');
        }
        
        // Load new data
        this.loadInitialData();
    }

    handleLeagueChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        
        const league = target.value;
        console.log('League changed to:', league);
        
        if (league !== this.state.currentLeague) {
            this.state.currentLeague = league;
            localStorage.setItem('selectedLeague', league);
            
            // Reset team selection when changing leagues
            this.state.selectedTeam = '';
            localStorage.setItem('selectedTeam', '');
            
            // Update UI to reflect the change
            this.updateLeagueDisplay(league);
            
            // Load new data for the selected league
            this.loadTeams(league).then(() => {
                // After teams are loaded, refresh all data
                this.refreshData(true);
                
                // Clear player data when changing leagues
                const playerStatsContent = document.getElementById('playerStatsContent');
                if (playerStatsContent) {
                    playerStatsContent.innerHTML = '<div class="text-center py-6 text-gray-500">Select a team to view player stats</div>';
                }
                
                // Reset player dropdown
                const playerSelect = document.getElementById('playerSelect');
                if (playerSelect && playerSelect instanceof HTMLSelectElement) {
                    // Clear player dropdown except first option
                    while (playerSelect.options.length > 1) {
                        playerSelect.remove(1);
                    }
                    playerSelect.disabled = true;
                    playerSelect.value = '';
                }
            });
            
            // Notify other components about the league change
            document.dispatchEvent(new CustomEvent('leagueChanged', {
                detail: { league: league }
            }));
        }
    }
    
    handleTeamChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        
        const teamId = target.value;
        console.log('Team changed to:', teamId);
        
        if (teamId !== this.state.selectedTeam) {
            this.state.selectedTeam = teamId;
            localStorage.setItem('selectedTeam', teamId);
            
            // Update UI to reflect the change
            this.updateTeamDisplay(teamId);
            
            // Load new data for the selected team
            this.refreshData(true);
            
            // Notify other components about the team change
            document.dispatchEvent(new CustomEvent('teamChanged', {
                detail: { teamId: teamId }
            }));
        }
    }
    
    updateLeagueDisplay(league) {
        // Update the main UI elements
        const currentLeagueEl = document.getElementById('currentLeague');
        if (currentLeagueEl) {
            currentLeagueEl.textContent = league.toUpperCase();
        }
        
        const dashboardLeagueNameEl = document.getElementById('dashboardLeagueName');
        if (dashboardLeagueNameEl) {
            dashboardLeagueNameEl.textContent = league.toUpperCase();
        }
        
        const currentLeagueNameEl = document.getElementById('currentLeagueName');
        if (currentLeagueNameEl) {
            currentLeagueNameEl.textContent = league.toUpperCase();
        }
        
        const currentLeagueIconEl = document.getElementById('currentLeagueIcon');
        if (currentLeagueIconEl) {
            currentLeagueIconEl.src = `/assets/icons/leagues/${league.toLowerCase()}.svg`;
            currentLeagueIconEl.alt = league.toUpperCase();
        }
        
        // Update all league selectors
        const leagueSelectors = document.querySelectorAll('.league-selector, #leagueSelect');
        leagueSelectors.forEach(selector => {
            if (selector instanceof HTMLSelectElement) {
                selector.value = league;
            }
        });
    }
    
    updateTeamDisplay(teamId) {
        // Update all team selectors
        const teamSelectors = document.querySelectorAll('.team-selector, #teamSelect');
        teamSelectors.forEach(selector => {
            if (selector instanceof HTMLSelectElement) {
                selector.value = teamId;
            }
        });
        
        // Update the team name display if a team is selected
        if (teamId) {
            // First, we need to find the team name from the teams array
            const teamName = this.findTeamName(teamId);
            
            // Update team name display
            const currentTeamEl = document.getElementById('currentTeam');
            if (currentTeamEl) {
                currentTeamEl.textContent = teamName || 'Unknown Team';
            }
        } else {
            // If no team is selected, show "All Teams"
            const currentTeamEl = document.getElementById('currentTeam');
            if (currentTeamEl) {
                currentTeamEl.textContent = 'All Teams';
            }
        }
    }
    
    findTeamName(teamId) {
        // Try to get from cache first
        const cacheKey = `teams:${this.state.currentLeague}`;
        const cachedTeams = this.managers.cache.get(cacheKey);
        
        if (cachedTeams && Array.isArray(cachedTeams)) {
            const team = cachedTeams.find(t => t.id === teamId || t.teamId === teamId);
            if (team) {
                return team.name || team.displayName;
            }
        }
        
        return 'Unknown Team';
    }

    handleGamesFilterChange() {
        console.log('Games filter changed');
        
        // Just update the display without fetching new data
        const league = this.state.currentLeague;
        const team = this.state.selectedTeam;
        const cacheKey = `games:${league}:${team}`;
        
        const games = this.managers.cache.get(cacheKey);
        if (games) {
            this.updateGamesList(games);
            this.updatePerformanceChart(games);
        }
    }

    handleChartTypeChange() {
        console.log('Chart type changed');
        
        // Just update the chart without fetching new data
        const league = this.state.currentLeague;
        const team = this.state.selectedTeam;
        const cacheKey = `games:${league}:${team}`;
        
        const games = this.managers.cache.get(cacheKey);
        if (games) {
            this.updatePerformanceChart(games);
        }
    }

    handleDataRefresh() {
        console.log('Data refresh requested');
        this.refreshData();
    }

    handleExportPrediction() {
        if (!this.managers.predictions || !this.managers.predictions.lastPrediction) {
            Toast.show('No prediction to export', 'warning');
            return;
        }
        
        try {
            const predictionData = this.managers.predictions.lastPrediction;
            
            // Add metadata
            const exportData = {
                ...predictionData,
                metadata: {
                    exportTime: new Date().toISOString(),
                    league: this.state.currentLeague,
                    team: this.state.selectedTeam,
                    user: this.state.user ? {
                        id: this.state.user.id,
                        email: this.state.user.email
                    } : null,
                    version: '3.1.0'
                }
            };
            
            const blob = new Blob(
                [JSON.stringify(exportData, null, 2)], 
                { type: 'application/json' }
            );
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `prediction-${this.state.currentLeague}-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            Toast.show('Prediction exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting prediction:', error);
            Toast.show('Failed to export prediction', 'error');
        }
    }

    handleSavePrediction() {
        if (!this.managers.predictions || !this.managers.predictions.lastPrediction) {
            Toast.show('No prediction to save', 'warning');
            return;
        }
        
        // Save to server
        fetch('/api/predictions/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                league: this.state.currentLeague,
                team: this.state.selectedTeam,
                prediction: this.managers.predictions.lastPrediction,
                timestamp: new Date().toISOString()
            })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.message || 'Failed to save prediction');
                });
            }
            return response.json();
        })
        .then(data => {
            Toast.show(data.message || 'Prediction saved successfully', 'success');
        })
        .catch(error => {
            console.error('Save prediction error:', error);
            Toast.show(error.message || 'Failed to save prediction', 'error');
        });
    }

    handleLogout() {
        console.log('Logout requested');
        
        // Show confirmation before logout
        if (this.managers.predictions?.hasUnsavedChanges()) {
            const confirmed = window.confirm('You have unsaved predictions. Are you sure you want to log out?');
            if (!confirmed) return;
        }
        
        // Clean up before logout
        if (this.managers.websocket) {
            this.managers.websocket.disconnect();
        }
        
        // Clear intervals
        if (this._lastUpdateInterval) {
            clearInterval(this._lastUpdateInterval);
        }
        
        // Clear token and redirect
        localStorage.removeItem('token');
        window.location.href = '/login';
    }

    handleComponentError(component, error) {
        console.error(`Error in ${component} component:`, error);
        
        // For non-critical components, show a warning but don't crash the app
        if (component !== 'dashboard') {
            Toast.show(`${component} component error: ${error.message}`, 'warning');
            return;
        }
        
        // For critical components, show a more intrusive error
        const errorContainer = document.createElement('div');
        errorContainer.className = 'fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center';
        errorContainer.innerHTML = `
            <div class="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md mx-auto">
                <div class="text-red-500 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-white mb-2 text-center">Dashboard Error</h3>
                <p class="text-gray-300 mb-4">${error.message}</p>
                <div class="flex justify-center space-x-4">
                    <button id="errorRetryBtn" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white">
                        Retry
                    </button>
                    <button id="errorReloadBtn" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white">
                        Reload Page
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(errorContainer);
        
        // Set up event handlers
        document.getElementById('errorRetryBtn').addEventListener('click', () => {
            errorContainer.remove();
            this.refreshData(true);
        });
        
        document.getElementById('errorReloadBtn').addEventListener('click', () => {
            window.location.reload();
        });
    }

    handleInitializationError(error) {
        console.error('Initialization error:', error);
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'bg-red-500/10 border border-red-500 p-8 rounded-lg max-w-md mx-auto mt-20 text-center';
        errorMessage.innerHTML = `
            <h3 class="text-xl font-bold text-red-500 mb-4">Dashboard Initialization Failed</h3>
            <p class="mb-4">We encountered an error while setting up your dashboard:</p>
            <div class="bg-gray-800 p-4 rounded text-left mb-6 overflow-auto max-h-40">
                <code>${error.message || 'Unknown error'}</code>
            </div>
            <button id="retryInit" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded mr-2">
                Retry
            </button>
            <button id="goToLogin" class="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded">
                Go to Login
            </button>
        `;
        
        document.body.innerHTML = '';
        document.body.appendChild(errorMessage);
        
        document.getElementById('retryInit').addEventListener('click', () => {
            window.location.reload();
        });
        
        document.getElementById('goToLogin').addEventListener('click', () => {
            window.location.href = '/login';
        });
    }

    showDataLoadingError(message) {
        Toast.show(`Failed to load dashboard data: ${message}. Please try again.`, 'error');
    }

    async loadDashboardData() {
        try {
            console.log('Loading dashboard data...');
            LoadingState.show('dataLoad', 'Loading data...');
            
            const league = this.state.currentLeague;
            const teamId = this.state.selectedTeam;
            
            // Load league overview data regardless of team selection
            const leagueStatsPromise = fetch(`/api/leagues/${league}/stats`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            }).then(res => res.json());
            
            // Load team-specific data if a team is selected
            let teamStatsPromise = Promise.resolve(null);
            if (teamId) {
                teamStatsPromise = fetch(`/api/teams/${teamId}/stats`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    }
                }).then(res => res.json());
            }
            
            // Load recent games
            const gamesPromise = fetch(`/api/leagues/${league}/games${teamId ? `?teamId=${teamId}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            }).then(res => res.json());
            
            // Wait for all data to load
            const [leagueStats, teamStats, games] = await Promise.all([
                leagueStatsPromise,
                teamStatsPromise,
                gamesPromise
            ]);
            
            // Update metrics
            this.updateMetrics(leagueStats.data, teamStats?.data);
            
            // Update games list
            this.updateGamesList(games.data);
            
            LoadingState.hide('dataLoad');
            this.updateLastUpdatedTime();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            LoadingState.hide('dataLoad');
            this.showError('Failed to load dashboard data. Please try again.');
        }
    }

    updateMetrics(leagueStats, teamStats) {
        // Update games played
        const gamesPlayedEl = document.getElementById('gamesPlayed');
        if (gamesPlayedEl) {
            const gamesPlayed = teamStats ? teamStats.gamesPlayed : leagueStats.totalGamesPlayed;
            gamesPlayedEl.textContent = gamesPlayed || 0;
            
            const gamesPlayedDiff = document.getElementById('gamesPlayedDiff');
            if (gamesPlayedDiff) {
                const diff = teamStats ? teamStats.gamesPlayedLastWeek : leagueStats.gamesPlayedLastWeek;
                gamesPlayedDiff.textContent = diff > 0 ? `+${diff} since last week` : 'No new games';
            }
        }
        
        // Update average score
        const avgScoreEl = document.getElementById('averageScore');
        if (avgScoreEl) {
            const avgScore = teamStats ? teamStats.averageScore : leagueStats.averageScore;
            avgScoreEl.textContent = avgScore?.toFixed(1) || '0.0';
            
            const avgScoreDiff = document.getElementById('averageScoreDiff');
            if (avgScoreDiff) {
                const diff = teamStats ? teamStats.averageScoreDiff : leagueStats.averageScoreDiff;
                avgScoreDiff.textContent = diff > 0 ? `+${diff.toFixed(1)} pts higher than average` : `${diff.toFixed(1)} pts lower than average`;
            }
        }
        
        // Update win rate
        const winRateEl = document.getElementById('winRate');
        if (winRateEl) {
            const winRate = teamStats ? teamStats.winRate : leagueStats.averageWinRate;
            winRateEl.textContent = `${(winRate * 100).toFixed(1)}%`;
            
            const winRateDiff = document.getElementById('winRateDiff');
            if (winRateDiff) {
                const avgRate = leagueStats.averageWinRate * 100;
                winRateDiff.textContent = `${avgRate.toFixed(1)}% on average across league`;
            }
        }
        
        // Update prediction accuracy
        const predictionAccuracyEl = document.getElementById('predictionAccuracy');
        if (predictionAccuracyEl) {
            const accuracy = teamStats ? teamStats.predictionAccuracy : leagueStats.overallPredictionAccuracy;
            predictionAccuracyEl.textContent = `${(accuracy * 100).toFixed(1)}%`;
            
            const accuracyDiff = document.getElementById('predictionAccuracyDiff');
            if (accuracyDiff) {
                const diff = teamStats ? teamStats.predictionAccuracyChange : leagueStats.predictionAccuracyChange;
                accuracyDiff.textContent = diff > 0 ? `+${diff.toFixed(1)}% improvement this month` : `${diff.toFixed(1)}% decrease this month`;
            }
        }
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new SportsAnalyticsDashboard();
    
    // Store dashboard instance on window for debugging
    if (process.env.NODE_ENV !== 'production') {
        window._dashboard = dashboard;
    }
    
    dashboard.initialize().catch(error => {
        console.error('Dashboard initialization failed:', error);
    });
});