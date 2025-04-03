/**
 * SportsDataService - API Integration & Data Management
 * Enterprise Sports Analytics Platform
 * Version 3.0.0
 */

class SportsDataService {
    /**
     * Initialize the sports data service
     */
    constructor() {
        // Default configuration that will be overridden by server config
        this.config = {
            baseUrl: '',
            cacheTime: 3600000, // Cache duration in milliseconds (1 hour)
            timeout: 10000,      // Request timeout in milliseconds
            retryAttempts: 3,    // Number of retry attempts
            retryDelay: 1000,    // Delay between retries in milliseconds
            useMockDataWhenOffline: true // Use mock data when offline
        };
        
        // Initialize as not ready until config is loaded
        this.isConfigLoaded = false;
        this.useMockData = false;
        
        // League IDs - will be populated from server config
        this.leagueIds = {};
        
        // Initialize cache
        this.cache = {};
        
        // Add connection status tracking
        this.networkStatus = {
            lastSuccessfulRequest: null,
            failedRequests: 0,
            consecutiveFailures: 0,
            isOnline: navigator.onLine,
            lastNetworkCheck: Date.now()
        };
        
        // Analytics tracking
        this.analytics = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            apiErrors: 0,
            mockDataUsage: 0,
            requestTimes: []
        };
        
        // Logger
        this.log = {
            debug: (msg) => console.debug(`[SportsDataService] ${msg}`),
            info: (msg) => console.info(`[SportsDataService] ${msg}`),
            warn: (msg) => console.warn(`[SportsDataService] ${msg}`),
            error: (msg, err) => console.error(`[SportsDataService] ${msg}`, err)
        };
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.networkStatus.isOnline = true;
            this.log.info('Connection restored, switching to online mode');
            
            // Always prefer real data when online
            if (this.isConfigLoaded) {
                this.useMockData = false;
            }
            
            // Refresh stale cache when coming back online
            this._refreshStaleDataWhenOnline();
        });
        
        window.addEventListener('offline', () => {
            this.networkStatus.isOnline = false;
            this.log.warn('Connection lost, switching to offline mode');
            
            if (this.config.useMockDataWhenOffline) {
                this.useMockData = true;
                this.log.info('Using mock data in offline mode');
            }
        });
        
        // Initialize immediately
        this._initialize();
    }
    
    /**
     * Initialize the service with configuration from server
     * @private
     */
    async _initialize() {
        try {
            const response = await fetch('/api/config/sports-api', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch API configuration: ${response.status}`);
            }
            
            const serverConfig = await response.json();
            
            // Update configuration
            this.config = {
                ...this.config,
                ...serverConfig,
                apiKey: serverConfig.apiKey || '',
                baseUrl: serverConfig.baseUrl || '',
            };
            
            // Get league IDs from config
            if (serverConfig.leagueIds) {
                this.leagueIds = serverConfig.leagueIds;
            }
            
            // Validation
            if (!this.config.apiKey) {
                throw new Error('No API key provided by server configuration');
            }
            
            if (!this.config.baseUrl) {
                throw new Error('No base URL provided by server configuration');
            }
            
            // Set status
            this.isConfigLoaded = true;
            this.useMockData = false;
            
            this.log.info('Configuration loaded successfully');
            this.log.debug('Using real data API');
            
            return true;
        } catch (error) {
            this.log.error('Failed to initialize with server config:', error);
            
            // Try fallback status endpoint
            try {
                const statusResponse = await fetch('/api/status', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (statusResponse.ok) {
                    const status = await statusResponse.json();
                    if (status.dataServiceReady) {
                        // We can use the API via server proxy
                        this.isConfigLoaded = true;
                        this.useMockData = false;
                        this.usingServerProxy = true;
                        this.log.info('Initialized with server proxy mode');
                        return true;
                    }
                }
                
                throw new Error('Data service not ready');
            } catch (fallbackError) {
                this.log.error('Initialization completely failed:', fallbackError);
                this.isConfigLoaded = false;
                this.useMockData = true;
                return false;
            }
        }
    }
    
    /**
     * Fetch with timeout and retry capability
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @returns {Promise} - Promise resolving to response
     */
    async fetchWithTimeout(url, options = {}) {
        let lastError;
        
        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
                
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                // Update connection status
                this.networkStatus.lastSuccessfulRequest = Date.now();
                this.networkStatus.failedRequests = 0;
                
                return response;
            } catch (error) {
                lastError = error;
                this.networkStatus.failedRequests++;
                
                if (attempt < this.config.retryAttempts - 1) {
                    console.warn(`Retry attempt ${attempt + 1} for ${url}`);
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                }
            }
        }
        
        // If we've reached max failed requests, switch to mock data temporarily
        if (this.networkStatus.failedRequests >= this.config.retryAttempts) {
            console.warn(`Multiple failed requests, temporarily switching to mock data mode`);
            this.useMockData = true;
        }
        
        throw lastError;
    }
    
    /**
     * Get leagues from API or mock data
     * @returns {Promise} Promise resolving to leagues data
     */
    async getLeagues() {
        try {
            // Check cache first
            if (this.cache.leagues && this.cache.leagues.timestamp > Date.now() - this.config.cacheTime) {
                console.log('Returning leagues from cache');
                return this.cache.leagues.data;
            }
            
            // Try to get data from API first if we are configured to use real data
            if (!this.useMockData || this.config.preferRealData) {
                try {
                    const response = await this.fetchWithTimeout(
                        `${this.config.baseUrl}${this.config.apiKey}/all_leagues.php`
                    );
                    const data = await response.json();
                    
                    if (data && data.leagues) {
                        // Update cache
                        this.cache.leagues = {
                            timestamp: Date.now(),
                            data: { success: true, response: data.leagues }
                        };
                        return this.cache.leagues.data;
                    } else {
                        throw new Error('Invalid API response');
                    }
                } catch (error) {
                    console.warn('API request failed, falling back to mock data:', error);
                    // Only set to use mock data if we configured to allow fallbacks
                    if (!this.config.preferRealData) {
                        this.useMockData = true;
                    }
                }
            }
            
            // Return mock data if API fails or useMockData is true
            const mockData = this.getMockLeagues();
            // Cache mock data as well
            this.cache.leagues = {
                timestamp: Date.now(),
                data: mockData
            };
            return mockData;
        } catch (error) {
            console.error('Error getting leagues:', error);
            return { 
                success: false, 
                error: error.message,
                response: this.getMockLeagues().response
            };
        }
    }
    
    /**
     * Get teams for a specific league from API or mock data
     * @param {string} leagueId - League ID
     * @returns {Promise} Promise resolving to teams data
     */
    async getTeams(leagueId) {
        try {
            if (!leagueId) {
                throw new Error('League ID is required');
            }
            
            // Check cache first
            const cacheKey = `teams_${leagueId}`;
            if (this.cache[cacheKey] && this.cache[cacheKey].timestamp > Date.now() - this.config.cacheTime) {
                console.log(`Returning teams for league ${leagueId} from cache`);
                return this.cache[cacheKey].data;
            }
            
            // Try to get data from API first if not using mock data
            if (!this.useMockData) {
                try {
                    const response = await this.fetchWithTimeout(
                        `${this.config.baseUrl}${this.config.apiKey}/lookup_all_teams.php?id=${leagueId}`
                    );
                    const data = await response.json();
                    
                    if (data && data.teams) {
                        const formattedTeams = data.teams.map(team => ({
                            id: team.idTeam,
                            name: team.strTeam,
                            code: team.strTeamShort || '',
                            city: team.strStadiumLocation || '',
                            logo: team.strTeamBadge || ''
                        }));
                        
                        // Update cache
                        this.cache[cacheKey] = {
                            timestamp: Date.now(),
                            data: { success: true, response: formattedTeams }
                        };
                        return this.cache[cacheKey].data;
                    } else {
                        throw new Error('Invalid API response for teams');
                    }
                } catch (error) {
                    console.warn(`API request for teams failed, falling back to mock data: ${error.message}`);
                    // Temporarily set to use mock data for this request
                    this.useMockData = true;
                }
            }
            
            // Return mock data if API fails or useMockData is true
            const mockData = this.getMockTeams(leagueId);
            // Cache mock data as well
            this.cache[cacheKey] = {
                timestamp: Date.now(),
                data: mockData
            };
            return mockData;
        } catch (error) {
            console.error(`Error getting teams for league ${leagueId}:`, error);
            return { 
                success: false, 
                error: error.message,
                response: [] 
            };
        }
    }
    
    /**
     * Get players for a specific team from API or mock data
     * @param {string} teamId - Team ID
     * @returns {Promise} Promise resolving to players data
     */
    async getPlayers(teamId) {
        try {
            if (!teamId) {
                throw new Error('Team ID is required');
            }
            
            // Check cache first
            const cacheKey = `players_${teamId}`;
            if (this.cache[cacheKey] && this.cache[cacheKey].timestamp > Date.now() - this.config.cacheTime) {
                console.log(`Returning players for team ${teamId} from cache`);
                return this.cache[cacheKey].data;
            }
            
            // Try to get data from API first if not using mock data
            if (!this.useMockData) {
                try {
                    const response = await this.fetchWithTimeout(
                        `${this.config.baseUrl}${this.config.apiKey}/lookup_all_players.php?id=${teamId}`
                    );
                    const data = await response.json();
                    
                    if (data && data.player) {
                        const formattedPlayers = data.player.map(player => ({
                            id: player.idPlayer,
                            name: player.strPlayer,
                            position: player.strPosition || 'Unknown',
                            nationality: player.strNationality || '',
                            thumbnail: player.strThumb || '',
                            stats: {
                                games: Math.floor(Math.random() * 82) + 20,
                                points: (Math.random() * 25).toFixed(1),
                                assists: (Math.random() * 8).toFixed(1)
                            }
                        }));
                        
                        // Update cache
                        this.cache[cacheKey] = {
                            timestamp: Date.now(),
                            data: { success: true, response: formattedPlayers }
                        };
                        return this.cache[cacheKey].data;
                    } else {
                        throw new Error('Invalid API response for players');
                    }
                } catch (error) {
                    console.warn(`API request for players failed, falling back to mock data: ${error.message}`);
                    // Temporarily set to use mock data for this request
                    this.useMockData = true;
                }
            }
            
            // Return mock data if API fails or useMockData is true
            const mockData = this.getMockPlayers(teamId);
            // Cache mock data as well
            this.cache[cacheKey] = {
                timestamp: Date.now(),
                data: mockData
            };
            return mockData;
        } catch (error) {
            console.error(`Error getting players for team ${teamId}:`, error);
            return { 
                success: false, 
                error: error.message,
                response: this.getMockPlayers(teamId).response
            };
        }
    }
    
    /**
     * Get upcoming fixtures/games for a specific league
     * @param {string} leagueId - League ID
     * @param {Object} options - Options for this request
     * @returns {Promise} Promise resolving to fixtures data
     */
    async getUpcomingFixtures(leagueId, options = {}) {
        try {
            if (!leagueId) {
                throw new Error('League ID is required');
            }
            
            const cacheKey = `fixtures_${leagueId}`;
            // Different endpoints for different sports due to API structure
            let endpoint;
            
            // Determine the sport based on league ID to use appropriate endpoint
            if (['4387', '4388', '4381'].includes(leagueId)) {
                // Basketball leagues - use events next league endpoint
                endpoint = `eventsnextleague.php?id=${leagueId}`;
            } else if (['4391'].includes(leagueId)) {
                // American football leagues
                endpoint = `eventsnextleague.php?id=${leagueId}`;
            } else if (['4380'].includes(leagueId)) {
                // Hockey leagues
                endpoint = `eventsnextleague.php?id=${leagueId}`;
            } else if (['4424'].includes(leagueId)) {
                // Baseball leagues
                endpoint = `eventsnextleague.php?id=${leagueId}`;
            } else {
                // Soccer leagues - default to round 38 of current season
                endpoint = `eventsnextleague.php?id=${leagueId}`;
            }
            
            // Merge request-specific options with defaults
            const requestOptions = {
                ...options,
                useMockData: options.useMockData !== undefined ? options.useMockData : this.useMockData,
                forceFresh: options.forceFresh || false
            };
            
            // Check cache first if not forcing fresh data and not fixtures (which change frequently)
            if (!requestOptions.forceFresh) {
                const cachedData = this._getFromCache(cacheKey);
                // For fixtures, we use a shorter cache expiration (1 hour) than the default
                if (cachedData && (Date.now() - cachedData.timestamp) < (1 * 60 * 60 * 1000)) {
                    this.log.info(`Returning fixtures for league ${leagueId} from cache`);
                    this.analytics.cacheHits++;
                    return cachedData.data;
                }
            }
            
            // Try to get data from API first if not using mock data
            if (!requestOptions.useMockData && this.networkStatus.isOnline) {
                try {
                    this.analytics.totalRequests++;
                    this.analytics.cacheMisses++;
                    
                    const startTime = Date.now();
                    const response = await this._apiRequest(endpoint);
                    const requestTime = Date.now() - startTime;
                    this.analytics.requestTimes.push(requestTime);
                    
                    if (response && response.events) {
                        // Map response to standardized format
                        const formattedFixtures = response.events.map(event => ({
                            id: event.idEvent,
                            date: event.dateEvent,
                            time: event.strTime,
                            status: event.strStatus || 'scheduled',
                            leagueId: event.idLeague,
                            season: event.strSeason,
                            round: event.intRound,
                            home: {
                                id: event.idHomeTeam,
                                name: event.strHomeTeam,
                                score: event.intHomeScore || null
                            },
                            away: {
                                id: event.idAwayTeam,
                                name: event.strAwayTeam,
                                score: event.intAwayScore || null
                            },
                            venue: event.strVenue || 'TBD',
                            thumbnail: event.strThumb || null
                        }));
                        
                        // Update cache
                        const result = { 
                            success: true, 
                            response: formattedFixtures,
                            source: 'api'
                        };
                        
                        this._addToCache(cacheKey, result);
                        this.networkStatus.lastSuccessfulRequest = Date.now();
                        this.networkStatus.consecutiveFailures = 0;
                        
                        return result;
                    } else {
                        throw new Error('Invalid API response structure for fixtures');
                    }
                } catch (error) {
                    this.log.warn(`API request for fixtures failed: ${error.message}`);
                    this.analytics.apiErrors++;
                    this.networkStatus.failedRequests++;
                    this.networkStatus.consecutiveFailures++;
                    
                    // If configured to not fall back to mock data, rethrow the error
                    if (!this.config.fallbackToMock) {
                        throw error;
                    }
                    
                    this.log.info(`Falling back to mock data for fixtures in league ${leagueId}`);
                }
            }
            
            // Return mock data if API fails or useMockData is true
            this.analytics.mockDataUsage++;
            const mockData = this.getMockFixtures(leagueId);
            
            // Cache mock data as well
            this._addToCache(cacheKey, mockData);
            
            return mockData;
        } catch (error) {
            this.log.error(`Error getting fixtures for league ${leagueId}:`, error);
            return { 
                success: false, 
                error: error.message,
                response: this.getMockFixtures(leagueId).response,
                source: 'error-fallback'
            };
        }
    }
    
    /**
     * Get team statistics for a specific team
     * @param {string} teamId - Team ID
     * @param {string} seasonId - Season ID (optional)
     * @param {Object} options - Options for this request
     * @returns {Promise} Promise resolving to team statistics data
     */
    async getTeamStats(teamId, seasonId = null, options = {}) {
        try {
            if (!teamId) {
                throw new Error('Team ID is required');
            }
            
            const cacheKey = `teamstats_${teamId}_${seasonId || 'current'}`;
            
            // No direct endpoint for team stats in TheSportsDB free tier
            // In a real enterprise implementation, we would use a paid API or aggregate data
            
            // Always use mock data for this endpoint
            const mockData = this.getMockTeamStats(teamId, seasonId);
            this._addToCache(cacheKey, mockData);
            this.analytics.mockDataUsage++;
            
            return mockData;
        } catch (error) {
            this.log.error(`Error getting team stats for team ${teamId}:`, error);
            return { 
                success: false, 
                error: error.message,
                response: []
            };
        }
    }
    
    /**
     * Get player statistics for a specific player
     * @param {string} playerId - Player ID
     * @param {string} seasonId - Season ID (optional)
     * @param {Object} options - Options for this request
     * @returns {Promise} Promise resolving to player statistics data
     */
    async getPlayerStats(playerId, seasonId = null, options = {}) {
        try {
            if (!playerId) {
                throw new Error('Player ID is required');
            }
            
            const cacheKey = `playerstats_${playerId}_${seasonId || 'current'}`;
            
            // No direct endpoint for player stats in TheSportsDB free tier
            // In a real enterprise implementation, we would use a paid API or aggregate data
            
            // Always use mock data for this endpoint
            const mockData = this.getMockPlayerStats(playerId, seasonId);
            this._addToCache(cacheKey, mockData);
            this.analytics.mockDataUsage++;
            
            return mockData;
        } catch (error) {
            this.log.error(`Error getting player stats for player ${playerId}:`, error);
            return { 
                success: false, 
                error: error.message,
                response: []
            };
        }
    }
    
    /**
     * Get team standings for a specific league
     * @param {string} leagueId - League ID
     * @param {string} seasonId - Season ID (optional)
     * @param {Object} options - Options for this request
     * @returns {Promise} Promise resolving to standings data
     */
    async getStandings(leagueId, seasonId = null, options = {}) {
        try {
            if (!leagueId) {
                throw new Error('League ID is required');
            }
            
            const season = seasonId || '2023-2024';
            const cacheKey = `standings_${leagueId}_${season}`;
            const endpoint = `lookuptable.php?l=${leagueId}&s=${season}`;
            
            // Merge request-specific options with defaults
            const requestOptions = {
                ...options,
                useMockData: options.useMockData !== undefined ? options.useMockData : this.useMockData,
                forceFresh: options.forceFresh || false
            };
            
            // Check cache first if not forcing fresh data
            if (!requestOptions.forceFresh) {
                const cachedData = this._getFromCache(cacheKey);
                if (cachedData) {
                    this.log.info(`Returning standings for league ${leagueId} from cache`);
                    this.analytics.cacheHits++;
                    return cachedData;
                }
            }
            
            // Try to get data from API first if not using mock data
            if (!requestOptions.useMockData && this.networkStatus.isOnline) {
                try {
                    this.analytics.totalRequests++;
                    this.analytics.cacheMisses++;
                    
                    const startTime = Date.now();
                    const response = await this._apiRequest(endpoint);
                    const requestTime = Date.now() - startTime;
                    this.analytics.requestTimes.push(requestTime);
                    
                    if (response && response.table) {
                        // Map response to standardized format
                        const formattedStandings = response.table.map(team => ({
                            teamId: team.teamid,
                            teamName: team.name,
                            position: parseInt(team.intRank, 10),
                            played: parseInt(team.played, 10),
                            wins: parseInt(team.win, 10),
                            draws: parseInt(team.draw, 10),
                            losses: parseInt(team.loss, 10),
                            points: parseInt(team.total, 10),
                            goalsFor: parseInt(team.goalsfor, 10),
                            goalsAgainst: parseInt(team.goalsagainst, 10),
                            goalDifference: parseInt(team.goalsdifference, 10),
                            form: team.strForm || ''
                        }));
                        
                        // Update cache
                        const result = { 
                            success: true, 
                            response: formattedStandings,
                            source: 'api'
                        };
                        
                        this._addToCache(cacheKey, result);
                        this.networkStatus.lastSuccessfulRequest = Date.now();
                        this.networkStatus.consecutiveFailures = 0;
                        
                        return result;
                    } else {
                        throw new Error('Invalid API response structure for standings');
                    }
                } catch (error) {
                    this.log.warn(`API request for standings failed: ${error.message}`);
                    this.analytics.apiErrors++;
                    this.networkStatus.failedRequests++;
                    this.networkStatus.consecutiveFailures++;
                    
                    // If configured to not fall back to mock data, rethrow the error
                    if (!this.config.fallbackToMock) {
                        throw error;
                    }
                    
                    this.log.info(`Falling back to mock data for standings in league ${leagueId}`);
                }
            }
            
            // Return mock data if API fails or useMockData is true
            this.analytics.mockDataUsage++;
            const mockData = this.getMockStandings(leagueId, season);
            
            // Cache mock data as well
            this._addToCache(cacheKey, mockData);
            
            return mockData;
        } catch (error) {
            this.log.error(`Error getting standings for league ${leagueId}:`, error);
            return { 
                success: false, 
                error: error.message,
                response: this.getMockStandings(leagueId).response,
                source: 'error-fallback'
            };
        }
    }
    
    /**
     * Search for teams, leagues, or players
     * @param {string} query - Search query
     * @param {string} type - Type of search (teams, leagues, players, or all)
     * @returns {Promise} Promise resolving to search results
     */
    async search(query, type = 'all') {
        try {
            if (!query) {
                throw new Error('Search query is required');
            }
            
            const cacheKey = `search_${type}_${query.toLowerCase()}`;
            let endpoint;
            
            switch (type.toLowerCase()) {
                case 'teams':
                    endpoint = `searchteams.php?t=${encodeURIComponent(query)}`;
                    break;
                case 'leagues':
                    endpoint = `search_all_leagues.php?l=${encodeURIComponent(query)}`;
                    break;
                case 'players':
                    endpoint = `searchplayers.php?p=${encodeURIComponent(query)}`;
                    break;
                case 'all':
                default:
                    // No general search endpoint in free tier, so we'll do multiple searches
                    const teams = await this.search(query, 'teams');
                    const players = await this.search(query, 'players');
                    
                    return {
                        success: true,
                        response: {
                            teams: teams.success ? teams.response : [],
                            players: players.success ? players.response : []
                        }
                    };
            }
            
            // Check cache
            const cachedData = this._getFromCache(cacheKey);
            if (cachedData) {
                this.log.info(`Returning search results for "${query}" from cache`);
                this.analytics.cacheHits++;
                return cachedData;
            }
            
            // Try API if online and not using mock data
            if (!this.useMockData && this.networkStatus.isOnline) {
                try {
                    this.analytics.totalRequests++;
                    this.analytics.cacheMisses++;
                    
                    const startTime = Date.now();
                    const response = await this._apiRequest(endpoint);
                    const requestTime = Date.now() - startTime;
                    this.analytics.requestTimes.push(requestTime);
                    
                    let formattedResults;
                    
                    if (type.toLowerCase() === 'teams' && response.teams) {
                        formattedResults = response.teams.map(team => ({
                            id: team.idTeam,
                            name: team.strTeam,
                            sport: team.strSport,
                            league: team.strLeague,
                            country: team.strCountry,
                            logo: team.strTeamBadge
                        }));
                    } else if (type.toLowerCase() === 'players' && response.player) {
                        formattedResults = response.player.map(player => ({
                            id: player.idPlayer,
                            name: player.strPlayer,
                            team: player.strTeam,
                            position: player.strPosition,
                            thumbnail: player.strThumb
                        }));
                    } else if (type.toLowerCase() === 'leagues' && response.leagues) {
                        formattedResults = response.leagues.map(league => ({
                            id: league.idLeague,
                            name: league.strLeague,
                            sport: league.strSport,
                            country: league.strCountry
                        }));
                    } else {
                        throw new Error('No search results found or invalid response type');
                    }
                    
                    const result = {
                        success: true,
                        response: formattedResults,
                        source: 'api'
                    };
                    
                    this._addToCache(cacheKey, result);
                    this.networkStatus.lastSuccessfulRequest = Date.now();
                    this.networkStatus.consecutiveFailures = 0;
                    
                    return result;
                } catch (error) {
                    this.log.warn(`API request for search failed: ${error.message}`);
                    this.analytics.apiErrors++;
                    this.networkStatus.failedRequests++;
                    this.networkStatus.consecutiveFailures++;
                    
                    // Fall back to mock search
                    this.log.info(`Falling back to mock data for search results`);
                }
            }
            
            // Return mock search results
            this.analytics.mockDataUsage++;
            const mockData = this.getMockSearchResults(query, type);
            this._addToCache(cacheKey, mockData);
            return mockData;
            
        } catch (error) {
            this.log.error(`Error searching for ${type} with query "${query}":`, error);
            return { 
                success: false, 
                error: error.message,
                response: []
            };
        }
    }
    
    /**
     * Fetch with timeout and retries
     * @private
     * @param {string} endpoint - API endpoint to fetch
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Promise resolving to JSON response
     */
    async _apiRequest(endpoint, options = {}) {
        let lastError;
        let attempt = 0;
        
        // Add protocol and base URL if not included
        const url = endpoint.startsWith('http')
            ? endpoint
            : `${this.config.baseUrl}${this.config.apiKey}/${endpoint}`;
        
        const maxAttempts = this.config.retryAttempts + 1; // +1 for initial attempt
        
        while (attempt < maxAttempts) {
            attempt++;
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
                
                this.log.debug(`API Request (Attempt ${attempt}/${maxAttempts}): ${url}`);
                
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        ...options.headers
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                // Check for API-level errors in the response
                if (data.error) {
                    throw new Error(`API error: ${data.error}`);
                }
                
                return data;
            } catch (error) {
                lastError = error;
                
                if (error.name === 'AbortError') {
                    this.log.warn(`Request timeout after ${this.config.timeout}ms`);
                } else {
                    this.log.warn(`API request failed (attempt ${attempt}/${maxAttempts}):`, error.message);
                }
                
                // If there are more attempts to make, delay before next try
                if (attempt < maxAttempts) {
                    const delay = this.config.retryDelay * attempt; // Progressive backoff
                    this.log.debug(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    this.log.error(`All ${maxAttempts} attempts failed for ${url}`);
                }
            }
        }
        
        throw lastError;
    }
    
    /**
     * Get data from cache
     * @private
     * @param {string} key - Cache key
     * @returns {Object|null} - Cached data or null if not found/expired
     */
    _getFromCache(key) {
        const cachedItem = this.cache[key];
        
        if (!cachedItem) {
            return null;
        }
        
        const now = Date.now();
        
        // Check if cache has expired
        if (now - cachedItem.timestamp > this.config.cacheTime) {
            // Delete expired item
            delete this.cache[key];
            return null;
        }
        
        return cachedItem.data;
    }
    
    /**
     * Add data to cache
     * @private
     * @param {string} key - Cache key
     * @param {Object} data - Data to cache
     */
    _addToCache(key, data) {
        this.cache[key] = {
            timestamp: Date.now(),
            data
        };
        
        // Perform basic cache size management
        this._manageCacheSize();
    }
    
    /**
     * Manage cache size by removing oldest entries if needed
     * @private
     */
    _manageCacheSize() {
        const MAX_CACHE_ITEMS = 100;
        const cacheKeys = Object.keys(this.cache);
        
        if (cacheKeys.length > MAX_CACHE_ITEMS) {
            // Sort by timestamp (oldest first)
            cacheKeys.sort((a, b) => this.cache[a].timestamp - this.cache[b].timestamp);
            
            // Remove oldest entries to bring count back down
            const keysToRemove = cacheKeys.slice(0, cacheKeys.length - MAX_CACHE_ITEMS);
            keysToRemove.forEach(key => delete this.cache[key]);
            
            this.log.debug(`Cache cleanup: removed ${keysToRemove.length} old entries`);
        }
    }
    
    /**
     * Clear cache data
     * @public
     * @param {string} key - Specific cache key to clear (optional, clears all if not provided)
     */
    clearCache(key = null) {
        if (key) {
            delete this.cache[key];
            this.log.info(`Cleared cache for key: ${key}`);
        } else {
            this.cache = {};
            this.log.info('Cleared all cache data');
        }
    }
    
    /**
     * Generate realistic stats based on player position
     * @private
     * @param {string} position - Player position
     * @returns {Object} - Generated stats object
     */
    _generateStatsByPosition(position) {
        // Base stats generation for basketball positions
        if (['PG', 'G', 'Point Guard', 'Guard'].some(p => position.includes(p))) {
            // Point guards typically have high assists and steals
            return {
                ppg: (Math.random() * 15 + 8).toFixed(1),
                rpg: (Math.random() * 4 + 2).toFixed(1),
                apg: (Math.random() * 7 + 5).toFixed(1),
                spg: (Math.random() * 1.5 + 1).toFixed(1),
                bpg: (Math.random() * 0.5 + 0.1).toFixed(1),
                fg_pct: (Math.random() * 0.12 + 0.42).toFixed(3),
                ft_pct: (Math.random() * 0.15 + 0.75).toFixed(3),
                three_pct: (Math.random() * 0.15 + 0.35).toFixed(3),
                mpg: (Math.random() * 12 + 22).toFixed(1)
            };
        } else if (['SG', 'Shooting Guard', 'G'].some(p => position.includes(p))) {
            // Shooting guards typically have high scoring
            return {
                ppg: (Math.random() * 18 + 12).toFixed(1),
                rpg: (Math.random() * 4 + 2).toFixed(1),
                apg: (Math.random() * 4 + 2).toFixed(1),
                spg: (Math.random() * 1.2 + 0.8).toFixed(1),
                bpg: (Math.random() * 0.6 + 0.2).toFixed(1),
                fg_pct: (Math.random() * 0.10 + 0.44).toFixed(3),
                ft_pct: (Math.random() * 0.12 + 0.78).toFixed(3),
                three_pct: (Math.random() * 0.18 + 0.36).toFixed(3),
                mpg: (Math.random() * 10 + 25).toFixed(1)
            };
        } else if (['SF', 'Small Forward', 'F'].some(p => position.includes(p))) {
            // Small forwards are well-rounded
            return {
                ppg: (Math.random() * 17 + 10).toFixed(1),
                rpg: (Math.random() * 5 + 4).toFixed(1),
                apg: (Math.random() * 3 + 2).toFixed(1),
                spg: (Math.random() * 1.2 + 0.7).toFixed(1),
                bpg: (Math.random() * 0.8 + 0.3).toFixed(1),
                fg_pct: (Math.random() * 0.08 + 0.45).toFixed(3),
                ft_pct: (Math.random() * 0.10 + 0.75).toFixed(3),
                three_pct: (Math.random() * 0.14 + 0.34).toFixed(3),
                mpg: (Math.random() * 12 + 22).toFixed(1)
            };
        } else if (['PF', 'Power Forward', 'F'].some(p => position.includes(p))) {
            // Power forwards have high rebounds and blocks
            return {
                ppg: (Math.random() * 15 + 8).toFixed(1),
                rpg: (Math.random() * 6 + 6).toFixed(1),
                apg: (Math.random() * 2 + 1).toFixed(1),
                spg: (Math.random() * 0.8 + 0.4).toFixed(1),
                bpg: (Math.random() * 1.2 + 0.6).toFixed(1),
                fg_pct: (Math.random() * 0.10 + 0.50).toFixed(3),
                ft_pct: (Math.random() * 0.15 + 0.65).toFixed(3),
                three_pct: (Math.random() * 0.10 + 0.30).toFixed(3),
                mpg: (Math.random() * 10 + 24).toFixed(1)
            };
        } else if (['C', 'Center'].some(p => position.includes(p))) {
            // Centers have high rebounds, blocks, and field goal percentage
            return {
                ppg: (Math.random() * 14 + 8).toFixed(1),
                rpg: (Math.random() * 6 + 8).toFixed(1),
                apg: (Math.random() * 1.5 + 0.5).toFixed(1),
                spg: (Math.random() * 0.7 + 0.3).toFixed(1),
                bpg: (Math.random() * 1.5 + 1).toFixed(1),
                fg_pct: (Math.random() * 0.10 + 0.55).toFixed(3),
                ft_pct: (Math.random() * 0.20 + 0.60).toFixed(3),
                three_pct: (Math.random() * 0.05 + 0.15).toFixed(3),
                mpg: (Math.random() * 8 + 22).toFixed(1)
            };
        } else if (['GK', 'Goalkeeper'].some(p => position.includes(p))) {
            // Soccer goalkeeper
            return {
                appearances: Math.floor(Math.random() * 30 + 10),
                cleanSheets: Math.floor(Math.random() * 10 + 2),
                saves: Math.floor(Math.random() * 80 + 40),
                savePercentage: (Math.random() * 25 + 65).toFixed(1) + '%',
                goalsAgainst: Math.floor(Math.random() * 40 + 10),
                passAccuracy: (Math.random() * 15 + 75).toFixed(1) + '%'
            };
        } else if (['QB', 'Quarterback'].some(p => position.includes(p))) {
            // American football quarterback
            return {
                passingYards: Math.floor(Math.random() * 2000 + 2000),
                passingTDs: Math.floor(Math.random() * 20 + 10),
                interceptions: Math.floor(Math.random() * 12 + 3),
                completionPercentage: (Math.random() * 15 + 60).toFixed(1) + '%',
                rating: (Math.random() * 40 + 75).toFixed(1)
            };
        } else if (['RB', 'Running Back'].some(p => position.includes(p))) {
            // American football running back
            return {
                rushingYards: Math.floor(Math.random() * 1000 + 500),
                rushingTDs: Math.floor(Math.random() * 10 + 3),
                receptions: Math.floor(Math.random() * 40 + 10),
                receivingYards: Math.floor(Math.random() * 400 + 100),
                fumbles: Math.floor(Math.random() * 3 + 1)
            };
        } else {
            // Default/unknown position - general stats
            return {
                gamesPlayed: Math.floor(Math.random() * 60 + 20),
                gamesStarted: Math.floor(Math.random() * 40 + 10),
                minutesPerGame: (Math.random() * 20 + 10).toFixed(1),
                pointsPerGame: (Math.random() * 15 + 5).toFixed(1),
                efficiency: (Math.random() * 20 + 10).toFixed(1)
            };
        }
    }
    
    /**
     * Get analytics data for service usage
     * @public
     * @returns {Object} - Analytics data
     */
    getAnalytics() {
        const totalTimeMs = Date.now() - this.analytics.startTime;
        const avgRequestTime = this.analytics.requestTimes.length > 0
            ? this.analytics.requestTimes.reduce((acc, time) => acc + time, 0) / this.analytics.requestTimes.length
            : 0;
        
        return {
            totalRequests: this.analytics.totalRequests,
            apiRequests: this.analytics.totalRequests - this.analytics.cacheHits,
            cacheHits: this.analytics.cacheHits,
            cacheMisses: this.analytics.cacheMisses,
            mockDataUsage: this.analytics.mockDataUsage,
            apiErrors: this.analytics.apiErrors,
            cacheHitRate: this.analytics.totalRequests > 0 
                ? (this.analytics.cacheHits / this.analytics.totalRequests * 100).toFixed(1) + '%'
                : '0%',
            uptime: this._formatTimespan(totalTimeMs),
            avgRequestTime: avgRequestTime.toFixed(1) + 'ms',
            cachedItems: Object.keys(this.cache).length,
            networkStatus: this.networkStatus.isOnline ? 'online' : 'offline',
            lastRequest: this.networkStatus.lastSuccessfulRequest 
                ? new Date(this.networkStatus.lastSuccessfulRequest).toISOString() 
                : 'never'
        };
    }
    
    /**
     * Format timespan in milliseconds to human-readable string
     * @private
     * @param {number} ms - Timespan in milliseconds
     * @returns {string} - Formatted timespan
     */
    _formatTimespan(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    /**
     * Reset the service state (for development/testing)
     */
    reset() {
        this.cache = {};
        this.analytics = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            apiErrors: 0,
            mockDataUsage: 0,
            startTime: Date.now(),
            requestTimes: []
        };
        this.networkStatus = {
            isOnline: navigator.onLine,
            lastSuccessfulRequest: null,
            failedRequests: 0,
            consecutiveFailures: 0
        };
        this.log.info('Service state reset');
    }
    
    /**
     * Get mock leagues data
     * @returns {Object} Object containing mock leagues data
     */
    getMockLeagues() {
        return {
            success: true,
            response: [
                { id: this.leagueIds.nba, name: 'NBA', country: 'USA', sport: 'Basketball', logo: 'nba.png' },
                { id: this.leagueIds.nfl, name: 'NFL', country: 'USA', sport: 'American Football', logo: 'nfl.png' },
                { id: this.leagueIds.mlb, name: 'MLB', country: 'USA', sport: 'Baseball', logo: 'mlb.png' },
                { id: this.leagueIds.nhl, name: 'NHL', country: 'USA', sport: 'Ice Hockey', logo: 'nhl.png' },
                { id: this.leagueIds.premierleague, name: 'Premier League', country: 'England', sport: 'Soccer', logo: 'epl.png' },
                { id: this.leagueIds.laliga, name: 'La Liga', country: 'Spain', sport: 'Soccer', logo: 'laliga.png' },
                { id: this.leagueIds.bundesliga, name: 'Bundesliga', country: 'Germany', sport: 'Soccer', logo: 'bundesliga.png' },
                { id: this.leagueIds.seriea, name: 'Serie A', country: 'Italy', sport: 'Soccer', logo: 'seriea.png' },
                { id: this.leagueIds.ligue1, name: 'Ligue 1', country: 'France', sport: 'Soccer', logo: 'ligue1.png' },
                { id: this.leagueIds.mls, name: 'MLS', country: 'USA', sport: 'Soccer', logo: 'mls.png' },
                { id: this.leagueIds.nba_g, name: 'NBA G League', country: 'USA', sport: 'Basketball', logo: 'nbag.png' },
                { id: this.leagueIds.ncaa, name: 'NCAA Basketball', country: 'USA', sport: 'Basketball', logo: 'ncaa.png' },
                { id: this.leagueIds.champions, name: 'Champions League', country: 'Europe', sport: 'Soccer', logo: 'ucl.png' },
                { id: this.leagueIds.europa, name: 'Europa League', country: 'Europe', sport: 'Soccer', logo: 'uel.png' }
            ],
            source: 'mock'
        };
    }
    
    /**
     * Get mock teams data for a specific league
     * @param {string} leagueId - League ID
     * @returns {Object} Object containing mock teams data
     */
    getMockTeams(leagueId) {
        // NBA teams
        if (leagueId === this.leagueIds.nba) {
            return {
                success: true,
                response: [
        { id: '134880', name: 'Los Angeles Lakers', city: 'Los Angeles', logo: 'lakers.png', colors: { primary: '#552583', secondary: '#FDB927' } },
        { id: '134881', name: 'Golden State Warriors', city: 'San Francisco', logo: 'warriors.png', colors: { primary: '#006BB6', secondary: '#FDB927' } },
        { id: '134882', name: 'Boston Celtics', city: 'Boston', logo: 'celtics.png', colors: { primary: '#007A33', secondary: '#BAC3C9' } },
        { id: '134883', name: 'Brooklyn Nets', city: 'Brooklyn', logo: 'nets.png', colors: { primary: '#000000', secondary: '#FFFFFF' } },
        { id: '134884', name: 'Chicago Bulls', city: 'Chicago', logo: 'bulls.png', colors: { primary: '#CE1141', secondary: '#000000' } },
        { id: '134885', name: 'Miami Heat', city: 'Miami', logo: 'heat.png', colors: { primary: '#98002E', secondary: '#F9A01B' } },
        { id: '134886', name: 'Phoenix Suns', city: 'Phoenix', logo: 'suns.png', colors: { primary: '#1D1160', secondary: '#E56620' } },
        { id: '134887', name: 'Dallas Mavericks', city: 'Dallas', logo: 'mavs.png', colors: { primary: '#00B0D6', secondary: '#002B5E' } },
        { id: '134888', name: 'Milwaukee Bucks', city: 'Milwaukee', logo: 'bucks.png', colors: { primary: '#00471B', secondary: '#EEE1C6' } },
        { id: '134889', name: 'Philadelphia 76ers', city: 'Philadelphia', logo: '76ers.png', colors: { primary: '#006BB6', secondary: '#ED174C' } },
        { id: '134890', name: 'Denver Nuggets', city: 'Denver', logo: 'nuggets.png', colors: { primary: '#0E2240', secondary: '#FEC524' } },
        { id: '134891', name: 'Los Angeles Clippers', city: 'Los Angeles', logo: 'clippers.png', colors: { primary: '#C8102E', secondary: '#1D428A' } },
        { id: '134892', name: 'New York Knicks', city: 'New York', logo: 'knicks.png', colors: { primary: '#006BB6', secondary: '#F58426' } },
        { id: '134893', name: 'Toronto Raptors', city: 'Toronto', logo: 'raptors.png', colors: { primary: '#CE1141', secondary: '#000000' } },
        { id: '134894', name: 'Utah Jazz', city: 'Utah', logo: 'jazz.png', colors: { primary: '#002B5C', secondary: '#00471B' } },
        { id: '134895', name: 'Atlanta Hawks', city: 'Atlanta', logo: 'hawks.png', colors: { primary: '#E03A3E', secondary: '#26282A' } },
        { id: '134896', name: 'Cleveland Cavaliers', city: 'Cleveland', logo: 'cavaliers.png', colors: { primary: '#860038', secondary: '#041E42' } },
        { id: '134897', name: 'Portland Trail Blazers', city: 'Portland', logo: 'blazers.png', colors: { primary: '#E03A3E', secondary: '#000000' } },
        { id: '134898', name: 'Minnesota Timberwolves', city: 'Minneapolis', logo: 'timberwolves.png', colors: { primary: '#0C2340', secondary: '#236192' } },
        { id: '134899', name: 'New Orleans Pelicans', city: 'New Orleans', logo: 'pelicans.png', colors: { primary: '#0C2340', secondary: '#C8102E' } },
        { id: '134900', name: 'Sacramento Kings', city: 'Sacramento', logo: 'kings.png', colors: { primary: '#5A2D81', secondary: '#63727A' } },
        { id: '134901', name: 'San Antonio Spurs', city: 'San Antonio', logo: 'spurs.png', colors: { primary: '#C4CED4', secondary: '#000000' } },
        { id: '134902', name: 'Memphis Grizzlies', city: 'Memphis', logo: 'grizzlies.png', colors: { primary: '#5D76A9', secondary: '#12173F' } },
        { id: '134903', name: 'Houston Rockets', city: 'Houston', logo: 'rockets.png', colors: { primary: '#CE1141', secondary: '#000000' } },
        { id: '134904', name: 'Oklahoma City Thunder', city: 'Oklahoma City', logo: 'thunder.png', colors: { primary: '#007AC1', secondary: '#002D62' } },
        { id: '134905', name: 'Washington Wizards', city: 'Washington', logo: 'wizards.png', colors: { primary: '#002B5C', secondary: '#E31837' } },
        { id: '134906', name: 'Orlando Magic', city: 'Orlando', logo: 'magic.png', colors: { primary: '#0077C1', secondary: '#C4CED4' } },
        { id: '134907', name: 'Charlotte Hornets', city: 'Charlotte', logo: 'hornets.png', colors: { primary: '#1D1160', secondary: '#00788C' } },
        { id: '134908', name: 'Detroit Pistons', city: 'Detroit', logo: 'pistons.png', colors: { primary: '#C8102E', secondary: '#1D428A' } },
        { id: '134909', name: 'Indiana Pacers', city: 'Indianapolis', logo: 'pacers.png', colors: { primary: '#002D62', secondary: '#FDBB30' } }
                ],
                source: 'mock'
            };
        }
        // Premier League teams
        else if (leagueId === this.leagueIds.premierleague) {
            return {
                success: true,
                response: [
                     { id: '133602', name: 'Arsenal', city: 'London', logo: 'arsenal.png', colors: { primary: '#EF0107', secondary: '#FFFFFF' } },
        { id: '133614', name: 'Liverpool', city: 'Liverpool', logo: 'liverpool.png', colors: { primary: '#C8102E', secondary: '#FFFFFF' } },
        { id: '133615', name: 'Manchester City', city: 'Manchester', logo: 'mancity.png', colors: { primary: '#6CABDD', secondary: '#FFFFFF' } },
        { id: '133616', name: 'Manchester United', city: 'Manchester', logo: 'manutd.png', colors: { primary: '#DA291C', secondary: '#000000' } },
        { id: '133619', name: 'Chelsea', city: 'London', logo: 'chelsea.png', colors: { primary: '#034694', secondary: '#FFFFFF' } },
        { id: '133626', name: 'Tottenham Hotspur', city: 'London', logo: 'tottenham.png', colors: { primary: '#132257', secondary: '#FFFFFF' } },
        { id: '133632', name: 'Newcastle United', city: 'Newcastle', logo: 'newcastle.png', colors: { primary: '#241F20', secondary: '#FFFFFF' } },
        { id: '133624', name: 'Leicester City', city: 'Leicester', logo: 'leicester.png', colors: { primary: '#003090', secondary: '#FDBE11' } },
        { id: '133634', name: 'West Ham United', city: 'London', logo: 'westham.png', colors: { primary: '#7A263A', secondary: '#FFFFFF' } },
        { id: '133622', name: 'Everton', city: 'Liverpool', logo: 'everton.png', colors: { primary: '#003399', secondary: '#FFFFFF' } },
        { id: '133621', name: 'Crystal Palace', city: 'London', logo: 'crystalpalace.png', colors: { primary: '#1B458F', secondary: '#C4122E' } },
        { id: '133625', name: 'Brighton & Hove Albion', city: 'Brighton', logo: 'brighton.png', colors: { primary: '#0057B8', secondary: '#FFFFFF' } },
        { id: '133623', name: 'Brentford', city: 'London', logo: 'brentford.png', colors: { primary: '#E30613', secondary: '#FFFFFF' } },
        { id: '133635', name: 'Leeds United', city: 'Leeds', logo: 'leeds.png', colors: { primary: '#FFCD00', secondary: '#000000' } },
        { id: '133636', name: 'Burnley', city: 'Burnley', logo: 'burnley.png', colors: { primary: '#6C1D45', secondary: '#90D6E3' } },
        { id: '133637', name: 'Watford', city: 'Watford', logo: 'watford.png', colors: { primary: '#FBEE23', secondary: '#ED2127' } },
        { id: '133638', name: 'Norwich City', city: 'Norwich', logo: 'norwich.png', colors: { primary: '#00A650', secondary: '#FFF200' } }
                ],
                source: 'mock'
            };
        }
        // NFL teams
        else if (leagueId === this.leagueIds.nfl) {
            return {
                success: true,
                response: [
                     { id: '134950', name: 'Kansas City Chiefs', city: 'Kansas City', logo: 'chiefs.png', colors: { primary: '#E31837', secondary: '#FFB81C' } },
        { id: '134951', name: 'San Francisco 49ers', city: 'San Francisco', logo: '49ers.png', colors: { primary: '#AA0000', secondary: '#B3995D' } },
        { id: '134952', name: 'Dallas Cowboys', city: 'Dallas', logo: 'cowboys.png', colors: { primary: '#003594', secondary: '#869397' } },
        { id: '134953', name: 'Green Bay Packers', city: 'Green Bay', logo: 'packers.png', colors: { primary: '#203731', secondary: '#FFB612' } },
        { id: '134954', name: 'Tampa Bay Buccaneers', city: 'Tampa', logo: 'buccaneers.png', colors: { primary: '#D50A0A', secondary: '#C60C30' } },
        { id: '134955', name: 'Buffalo Bills', city: 'Buffalo', logo: 'bills.png', colors: { primary: '#00338D', secondary: '#C60C30' } },
        { id: '134956', name: 'Los Angeles Rams', city: 'Los Angeles', logo: 'rams.png', colors: { primary: '#003394', secondary: '#FFA300' } },
        { id: '134957', name: 'New England Patriots', city: 'New England', logo: 'patriots.png', colors: { primary: '#002244', secondary: '#C60C30' } },
        { id: '134958', name: 'Baltimore Ravens', city: 'Baltimore', logo: 'ravens.png', colors: { primary: '#241773', secondary: '#000000' } },
        { id: '134959', name: 'Pittsburgh Steelers', city: 'Pittsburgh', logo: 'steelers.png', colors: { primary: '#000000', secondary: '#FFB612' } },
        { id: '134960', name: 'Las Vegas Raiders', city: 'Las Vegas', logo: 'raiders.png', colors: { primary: '#000000', secondary: '#A5ACAF' } },
        { id: '134961', name: 'Philadelphia Eagles', city: 'Philadelphia', logo: 'eagles.png', colors: { primary: '#004C54', secondary: '#A5ACAF' } },
        { id: '134962', name: 'New Orleans Saints', city: 'New Orleans', logo: 'saints.png', colors: { primary: '#D3BC8D', secondary: '#000000' } },
        { id: '134963', name: 'Cincinnati Bengals', city: 'Cincinnati', logo: 'bengals.png', colors: { primary: '#FB4F14', secondary: '#000000' } },
        { id: '134964', name: 'Arizona Cardinals', city: 'Arizona', logo: 'cardinals.png', colors: { primary: '#97233F', secondary: '#000000' } },
        { id: '134965', name: 'Seattle Seahawks', city: 'Seattle', logo: 'seahawks.png', colors: { primary: '#002244', secondary: '#69BE28' } },
        { id: '134966', name: 'Tennessee Titans', city: 'Tennessee', logo: 'titans.png', colors: { primary: '#0C2340', secondary: '#4B92DB' } },
        { id: '134967', name: 'Los Angeles Chargers', city: 'Los Angeles', logo: 'chargers.png', colors: { primary: '#0080C6', secondary: '#FFC20E' } },
        { id: '134968', name: 'Indianapolis Colts', city: 'Indianapolis', logo: 'colts.png', colors: { primary: '#002C5F', secondary: '#A2AAAD' } },
        { id: '134969', name: 'Miami Dolphins', city: 'Miami', logo: 'dolphins.png', colors: { primary: '#008E97', secondary: '#FC4C02' } },
        { id: '134970', name: 'Cleveland Browns', city: 'Cleveland', logo: 'browns.png', colors: { primary: '#FF3C00', secondary: '#311D00' } },
        { id: '134971', name: 'Jacksonville Jaguars', city: 'Jacksonville', logo: 'jaguars.png', colors: { primary: '#006778', secondary: '#9F8958' } },
        { id: '134972', name: 'New York Giants', city: 'New York', logo: 'giants.png', colors: { primary: '#0B2265', secondary: '#A5ACAF' } },
        { id: '134973', name: 'Carolina Panthers', city: 'Carolina', logo: 'panthers.png', colors: { primary: '#0085CA', secondary: '#000000' } }
                ],
                source: 'mock'
            };
        }
        // MLB teams
        else if (leagueId === this.leagueIds.mlb) {
            return {
                success: true,
                response: [
                   { id: '135001', name: 'New York Yankees', city: 'New York', logo: 'yankees.png', colors: { primary: '#003087', secondary: '#E4002C' } },
        { id: '135002', name: 'Los Angeles Dodgers', city: 'Los Angeles', logo: 'dodgers.png', colors: { primary: '#005A9C', secondary: '#EF3E42' } },
        { id: '135003', name: 'Boston Red Sox', city: 'Boston', logo: 'redsox.png', colors: { primary: '#BD3039', secondary: '#0C2340' } },
        { id: '135004', name: 'Chicago Cubs', city: 'Chicago', logo: 'cubs.png', colors: { primary: '#0E3386', secondary: '#CC3433' } },
        { id: '135005', name: 'Houston Astros', city: 'Houston', logo: 'astros.png', colors: { primary: '#002262', secondary: '#EB6E1F' } },
        { id: '135006', name: 'Atlanta Braves', city: 'Atlanta', logo: 'braves.png', colors: { primary: '#13274F', secondary: '#CE1141' } },
        { id: '135007', name: 'San Francisco Giants', city: 'San Francisco', logo: 'giants.png', colors: { primary: '#FD5A1E', secondary: '#27251F' } },
        { id: '135008', name: 'St. Louis Cardinals', city: 'St. Louis', logo: 'cardinals.png', colors: { primary: '#C41E3A', secondary: '#0C2340' } },
        { id: '135009', name: 'New York Mets', city: 'New York', logo: 'mets.png', colors: { primary: '#002D72', secondary: '#FF5910' } },
        { id: '135010', name: 'Chicago White Sox', city: 'Chicago', logo: 'whitesox.png', colors: { primary: '#000000', secondary: '#C4CED4' } },
        { id: '135011', name: 'Los Angeles Angels', city: 'Los Angeles', logo: 'angels.png', colors: { primary: '#BA0021', secondary: '#003263' } },
        { id: '135012', name: 'Oakland Athletics', city: 'Oakland', logo: 'athletics.png', colors: { primary: '#003831', secondary: '#EFB21E' } },
        { id: '135013', name: 'Cleveland Guardians', city: 'Cleveland', logo: 'guardians.png', colors: { primary: '#0C2340', secondary: '#E50034' } },
        { id: '135014', name: 'Seattle Mariners', city: 'Seattle', logo: 'mariners.png', colors: { primary: '#0C2C56', secondary: '#005C5C' } },
        { id: '135015', name: 'San Diego Padres', city: 'San Diego', logo: 'padres.png', colors: { primary: '#2F241D', secondary: '#FFC425' } },
        { id: '135016', name: 'Texas Rangers', city: 'Texas', logo: 'rangers.png', colors: { primary: '#003278', secondary: '#C0111F' } },
        { id: '135017', name: 'Toronto Blue Jays', city: 'Toronto', logo: 'bluejays.png', colors: { primary: '#134A8E', secondary: '#1D428A' } },
        { id: '135018', name: 'Milwaukee Brewers', city: 'Milwaukee', logo: 'brewers.png', colors: { primary: '#12284B', secondary: '#FFC52F' } },
        { id: '135019', name: 'Cincinnati Reds', city: 'Cincinnati', logo: 'reds.png', colors: { primary: '#C6011F', secondary: '#000000' } },
        { id: '135020', name: 'Colorado Rockies', city: 'Colorado', logo: 'rockies.png', colors: { primary: '#333366', secondary: '#000000' } },
        { id: '135021', name: 'Arizona Diamondbacks', city: 'Arizona', logo: 'diamondbacks.png', colors: { primary: '#A71930', secondary: '#E3D4AD' } },
        { id: '135022', name: 'Pittsburgh Pirates', city: 'Pittsburgh', logo: 'pirates.png', colors: { primary: '#000000', secondary: '#FFC72C' } },
        { id: '135023', name: 'Kansas City Royals', city: 'Kansas City', logo: 'royals.png', colors: { primary: '#004687', secondary: '#C09A5B' } },
        { id: '135024', name: 'Miami Marlins', city: 'Miami', logo: 'marlins.png', colors: { primary: '#00A3E0', secondary: '#41748D' } }
                ],
                source: 'mock'
            };
        }
        // NHL teams
        else if (leagueId === this.leagueIds.nhl) {
            return {
                success: true,
                response: [
                     { id: '135051', name: 'Toronto Maple Leafs', city: 'Toronto', logo: 'mapleleafs.png', colors: { primary: '#00205B', secondary: '#FFFFFF' } },
        { id: '135052', name: 'Montreal Canadiens', city: 'Montreal', logo: 'canadiens.png', colors: { primary: '#AF1E2D', secondary: '#192168' } },
        { id: '135053', name: 'Boston Bruins', city: 'Boston', logo: 'bruins.png', colors: { primary: '#FFB81C', secondary: '#000000' } },
        { id: '135054', name: 'Chicago Blackhawks', city: 'Chicago', logo: 'blackhawks.png', colors: { primary: '#CF0A2C', secondary: '#000000' } },
        { id: '135055', name: 'Detroit Red Wings', city: 'Detroit', logo: 'redwings.png', colors: { primary: '#CE1126', secondary: '#FFFFFF' } },
        { id: '135056', name: 'New York Rangers', city: 'New York', logo: 'rangers.png', colors: { primary: '#0038A8', secondary: '#CE1126' } },
        { id: '135057', name: 'Pittsburgh Penguins', city: 'Pittsburgh', logo: 'penguins.png', colors: { primary: '#000000', secondary: '#CFC493' } },
        { id: '135058', name: 'Edmonton Oilers', city: 'Edmonton', logo: 'oilers.png', colors: { primary: '#FF4E00', secondary: '#041E42' } },
        { id: '135059', name: 'Colorado Avalanche', city: 'Colorado', logo: 'avalanche.png', colors: { primary: '#6F263D', secondary: '#236192' } },
        { id: '135060', name: 'Tampa Bay Lightning', city: 'Tampa Bay', logo: 'lightning.png', colors: { primary: '#002868', secondary: '#FFFFFF' } },
        { id: '135061', name: 'Vegas Golden Knights', city: 'Las Vegas', logo: 'goldenknights.png', colors: { primary: '#B4975A', secondary: '#333F48' } },
        { id: '135062', name: 'Washington Capitals', city: 'Washington', logo: 'capitals.png', colors: { primary: '#041E42', secondary: '#C8102E' } },
        { id: '135063', name: 'Nashville Predators', city: 'Nashville', logo: 'predators.png', colors: { primary: '#FFB81C', secondary: '#041E42' } },
        { id: '135064', name: 'Carolina Hurricanes', city: 'Carolina', logo: 'hurricanes.png', colors: { primary: '#CC0000', secondary: '#000000' } },
        { id: '135065', name: 'St. Louis Blues', city: 'St. Louis', logo: 'blues.png', colors: { primary: '#002F87', secondary: '#FCB514' } },
        { id: '135066', name: 'Winnipeg Jets', city: 'Winnipeg', logo: 'jets.png', colors: { primary: '#041E42', secondary: '#004C97' } },
        { id: '135067', name: 'San Jose Sharks', city: 'San Jose', logo: 'sharks.png', colors: { primary: '#006D75', secondary: '#000000' } },
        { id: '135068', name: 'Dallas Stars', city: 'Dallas', logo: 'stars.png', colors: { primary: '#006847', secondary: '#000000' } },
        { id: '135069', name: 'Los Angeles Kings', city: 'Los Angeles', logo: 'kings.png', colors: { primary: '#111B4E', secondary: '#A2AAAD' } },
        { id: '135070', name: 'Calgary Flames', city: 'Calgary', logo: 'flames.png', colors: { primary: '#C8102E', secondary: '#F1B81D' } },
        { id: '135071', name: 'New Jersey Devils', city: 'New Jersey', logo: 'devils.png', colors: { primary: '#CE1126', secondary: '#000000' } },
        { id: '135072', name: 'Philadelphia Flyers', city: 'Philadelphia', logo: 'flyers.png', colors: { primary: '#F74902', secondary: '#000000' } },
        { id: '135073', name: 'Ottawa Senators', city: 'Ottawa', logo: 'senators.png', colors: { primary: '#D69F0F', secondary: '#000000' } },
        { id: '135074', name: 'Anaheim Ducks', city: 'Anaheim', logo: 'ducks.png', colors: { primary: '#F47A38', secondary: '#000000' } },
        { id: '135075', name: 'Arizona Coyotes', city: 'Arizona', logo: 'coyotes.png', colors: { primary: '#8C4B9E', secondary: '#E2D6B5' } }
                ],
                source: 'mock'
            };
        }
        // La Liga teams
        else if (leagueId === this.leagueIds.laliga) {
            return {
                success: true,
                response: [
                     { id: '133701', name: 'Real Madrid', city: 'Madrid', logo: 'realmadrid.png', colors: { primary: '#FFFFFF', secondary: '#00529F' } },
        { id: '133702', name: 'Barcelona', city: 'Barcelona', logo: 'barcelona.png', colors: { primary: '#A50044', secondary: '#004D98' } },
        { id: '133703', name: 'Atletico Madrid', city: 'Madrid', logo: 'atleticomadrid.png', colors: { primary: '#CB3324', secondary: '#FFFFFF' } },
        { id: '133704', name: 'Sevilla', city: 'Sevilla', logo: 'sevilla.png', colors: { primary: '#FFFFFF', secondary: '#F53732' } },
        { id: '133705', name: 'Real Betis', city: 'Sevilla', logo: 'betis.png', colors: { primary: '#009540', secondary: '#FFFFFF' } },
        { id: '133706', name: 'Valencia', city: 'Valencia', logo: 'valencia.png', colors: { primary: '#F18A1C', secondary: '#FFFFFF' } },
        { id: '133707', name: 'Athletic Bilbao', city: 'Bilbao', logo: 'athletic.png', colors: { primary: '#EE2523', secondary: '#000000' } },
        { id: '133708', name: 'Villarreal', city: 'Villarreal', logo: 'villarreal.png', colors: { primary: '#005080', secondary: '#FBEE23' } },
        { id: '133709', name: 'Real Sociedad', city: 'San Sebastian', logo: 'realsociedad.png', colors: { primary: '#0071BC', secondary: '#FFFFFF' } },
        { id: '133710', name: 'Osasuna', city: 'Pamplona', logo: 'osasuna.png', colors: { primary: '#C00000', secondary: '#FFFFFF' } },
        { id: '133711', name: 'Espanyol', city: 'Barcelona', logo: 'espanyol.png', colors: { primary: '#0070B7', secondary: '#FFFFFF' } },
        { id: '133712', name: 'Granada', city: 'Granada', logo: 'granada.png', colors: { primary: '#C00000', secondary: '#FFFFFF' } },
        { id: '133713', name: 'Celta Vigo', city: 'Vigo', logo: 'celtavigo.png', colors: { primary: '#98C63F', secondary: '#FFFFFF' } },
        { id: '133714', name: 'Elche', city: 'Elche', logo: 'elche.png', colors: { primary: '#00A650', secondary: '#FFFFFF' } },
        { id: '133715', name: 'Levante', city: 'Valencia', logo: 'levante.png', colors: { primary: '#0070B7', secondary: '#C00000' } },
        { id: '133716', name: 'Cadiz', city: 'Cadiz', logo: 'cadiz.png', colors: { primary: '#FFDD00', secondary: '#0055A5' } }
                ],
                source: 'mock'
            };
        }
         // Bundesliga teams
  else if (leagueId === this.leagueIds.bundesliga) {
    return {
      success: true,
      response: [
        { id: '133901', name: 'Bayern Munich', city: 'Munich', logo: 'bayernmunich.png', colors: { primary: '#DC052D', secondary: '#FFFFFF' } },
        { id: '133902', name: 'Borussia Dortmund', city: 'Dortmund', logo: 'borussiadortmund.png', colors: { primary: '#FDE100', secondary: '#000000' } },
        { id: '133903', name: 'RB Leipzig', city: 'Leipzig', logo: 'rbleipzig.png', colors: { primary: '#DD0740', secondary: '#FFFFFF' } },
        { id: '133904', name: 'Bayer Leverkusen', city: 'Leverkusen', logo: 'bayerleverkusen.png', colors: { primary: '#E32934', secondary: '#000000' } },
        { id: '133905', name: 'Borussia Monchengladbach', city: 'Monchengladbach', logo: 'monchengladbach.png', colors: { primary: '#009344', secondary: '#000000' } },
        { id: '133906', name: 'Union Berlin', city: 'Berlin', logo: 'unionberlin.png', colors: { primary: '#C4122E', secondary: '#FFFFFF' } },
        { id: '133907', name: 'VfB Stuttgart', city: 'Stuttgart', logo: 'vfbstuttgart.png', colors: { primary: '#D00F22', secondary: '#FFFFFF' } },
        { id: '133908', name: 'Eintracht Frankfurt', city: 'Frankfurt', logo: 'eintrachtfrankfurt.png', colors: { primary: '#000000', secondary: '#FFFFFF' } },
        { id: '133909', name: 'FC Koln', city: 'Cologne', logo: 'fckoln.png', colors: { primary: '#FF0000', secondary: '#FFFFFF' } },
        { id: '133910', name: 'Mainz 05', city: 'Mainz', logo: 'mainz05.png', colors: { primary: '#D00F22', secondary: '#FFFFFF' } },
        { id: '133911', name: 'Wolfsburg', city: 'Wolfsburg', logo: 'wolfsburg.png', colors: { primary: '#65B32E', secondary: '#FFFFFF' } },
        { id: '133912', name: 'Freiburg', city: 'Freiburg', logo: 'freiburg.png', colors: { primary: '#134731', secondary: '#FFFFFF' } },
        { id: '133913', name: 'Augsburg', city: 'Augsburg', logo: 'augsburg.png', colors: { primary: '#CE1A21', secondary: '#FFFFFF' } },
        { id: '133914', name: 'Hoffenheim', city: 'Hoffenheim', logo: 'hoffenheim.png', colors: { primary: '#1A6CFF', secondary: '#FFFFFF' } },
        { id: '133915', name: 'Hertha BSC', city: 'Berlin', logo: 'herthabsc.png', colors: { primary: '#005CAE', secondary: '#FFFFFF' } },
        { id: '133916', name: 'Bochum', city: 'Bochum', logo: 'bochum.png', colors: { primary: '#005CAE', secondary: '#FFFFFF' } }
                ],
                source: 'mock'

// Serie A teams
  else if (leagueId === this.leagueIds.seriea) {
    return {
      success: true,
      response: [
        { id: '133801', name: 'Juventus', city: 'Turin', logo: 'juventus.png', colors: { primary: '#000000', secondary: '#FFFFFF' } },
        { id: '133802', name: 'Inter Milan', city: 'Milan', logo: 'inter.png', colors: { primary: '#000000', secondary: '#0065BE' } },
        { id: '133803', name: 'AC Milan', city: 'Milan', logo: 'acmilan.png', colors: { primary: '#C00000', secondary: '#000000' } },
        { id: '133804', name: 'Napoli', city: 'Naples', logo: 'napoli.png', colors: { primary: '#0070B7', secondary: '#FFFFFF' } },
        { id: '133805', name: 'Roma', city: 'Rome', logo: 'roma.png', colors: { primary: '#C00000', secondary: '#FFD700' } },
        { id: '133806', name: 'Lazio', city: 'Rome', logo: 'lazio.png', colors: { primary: '#0070B7', secondary: '#FFFFFF' } },
        { id: '133807', name: 'Atalanta', city: 'Bergamo', logo: 'atalanta.png', colors: { primary: '#0070B7', secondary: '#000000' } },
        { id: '133808', name: 'Fiorentina', city: 'Florence', logo: 'fiorentina.png', colors: { primary: '#6F0F9A', secondary: '#FFFFFF' } },
        { id: '133809', name: 'Sassuolo', city: 'Sassuolo', logo: 'sassuolo.png', colors: { primary: '#008000', secondary: '#000000' } },
        { id: '133810', name: 'Torino', city: 'Turin', logo: 'torino.png', colors: { primary: '#800000', secondary: '#FFFFFF' } },
        { id: '133811', name: 'Udinese', city: 'Udine', logo: 'udinese.png', colors: { primary: '#000000', secondary: '#FFFFFF' } },
        { id: '133812', name: 'Sampdoria', city: 'Genoa', logo: 'sampdoria.png', colors: { primary: '#0070B7', secondary: '#FFFFFF' } },
        { id: '133813', name: 'Genoa', city: 'Genoa', logo: 'genoa.png', colors: { primary: '#C00000', secondary: '#008000' } },
        { id: '133814', name: 'Bologna', city: 'Bologna', logo: 'bologna.png', colors: { primary: '#C00000', secondary: '#FFFFFF' } },
        { id: '133815', name: 'Empoli', city: 'Empoli', logo: 'empoli.png', colors: { primary: '#0070B7', secondary: '#FFFFFF' } },
        { id: '133816', name: 'Spezia', city: 'La Spezia', logo: 'spezia.png', colors: { primary: '#FFFFFF', secondary: '#000000' } },
        { id: '133817', name: 'Cremonese', city: 'Cremona', logo: 'cremonese.png', colors: { primary: '#C00000', secondary: '#FFFFFF' } },
        { id: '133818', name: 'Monza', city: 'Monza', logo: 'monza.png', colors: { primary: '#ED1C24', secondary: '#FFFFFF' } }
		],
                source: 'mock'
            };
        }
    }
    
    /**
     * Get mock players data for a specific team
     * @param {string} teamId - Team ID
     * @returns {Object} Object containing mock players data
     */
    getMockPlayers(teamId) {
        const positions = {
            basketball: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'G/F', 'F/C'],
            football: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'],
            baseball: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
            hockey: ['C', 'LW', 'RW', 'D', 'G'],
            soccer: ['GK', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF']
        };
        
        // Determine sport based on team ID (first 3 digits)
        const sportKey = parseInt(teamId.substring(0, 3), 10);
        let sportPositions;
        
        if (sportKey === 134) {
            // Basketball teams
            sportPositions = positions.basketball;
        } else if (sportKey === 135 && parseInt(teamId.substring(3, 1), 10) === 0) {
            // Baseball teams
            sportPositions = positions.baseball;
        } else if (sportKey === 135 && parseInt(teamId.substring(3, 1), 10) === 5) {
            // Hockey teams
            sportPositions = positions.hockey;
        } else if (sportKey === 134 && parseInt(teamId.substring(3, 1), 10) === 9) {
            // Football teams
            sportPositions = positions.football;
        } else if (sportKey === 133) {
            // Soccer teams
            sportPositions = positions.soccer;
        } else {
            // Default to basketball
            sportPositions = positions.basketball;
        }
        
        // First names and last names for player generation
        const firstNames = ['James', 'Michael', 'Chris', 'Anthony', 'Kevin', 'John', 'David', 'Robert', 'Thomas', 'Richard', 'Daniel', 'Paul', 'Mark', 'Donald', 'George', 'Kenneth', 'Steven', 'Edward', 'Brian', 'Ronald', 'Juan', 'Carlos', 'Luis', 'Jose', 'Miguel', 'Antonio', 'Sergio', 'Rafael', 'Luka', 'Nikola', 'Giannis', 'Joel', 'Stephen', 'LeBron', 'Kawhi', 'Damian', 'Kyrie', 'Jayson', 'Jimmy', 'Donovan', 'Devin', 'Trae', 'Zion', 'Ja', 'Bam', 'Pascal', 'Russell', 'Bradley', 'Jaylen', 'Khris', 'Kyle', 'Victor', 'Gordon', 'Domantas', 'CJ', 'Kristaps', 'Brandon', 'Zach', 'Jrue', 'Fred', 'Shai', 'Malcolm', 'Myles', 'Lonzo', 'Jerami', 'Jonas', 'Marcus', 'Terry', 'Joe', 'Seth', 'Bojan', 'Bogdan', 'Davis', 'Montrezl', 'Andre', 'Buddy', 'Evan', 'Malik', 'Dennis', 'Josh', 'Mikal', 'Miles', 'DeAndre', 'Clint', 'Brook', 'Robin', 'Mitchell', 'Wendell', 'Dillon', 'Kelly', 'TJ', 'Eric', 'Patty', 'Jordan', 'Harrison', 'Luke', 'Reggie', 'Derrick', 'Marvin', 'OG', 'JJ', 'Goran', 'Ricky', 'Cedi', 'Isaiah', 'Jamal', 'Jarrett'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'James', 'Durant', 'Irving', 'Curry', 'Leonard', 'Westbrook', 'George', 'Lillard', 'Butler', 'Thompson', 'Harden', 'Antetokounmpo', 'Davis', 'Paul', 'Towns', 'Jokic', 'Doncic', 'Embiid', 'Tatum', 'Booker', 'Mitchell', 'Adebayo', 'Siakam', 'Ingram', 'Murray', 'Middleton', 'Lowry', 'Fox', 'Hayward', 'Sabonis', 'McCollum', 'Porzingis', 'Beal', 'LaVine', 'Simmons', 'Gobert', 'Holiday', 'VanVleet', 'Kuzma', 'Ball', 'Brogdon', 'Turner', 'Grant', 'Valanciunas', 'Smart', 'Bogdanovic', 'Nurkić', 'Capela', 'Collins', 'Dinwiddie', 'Harrell', 'Bridges', 'Oubre', 'Hunter', 'Allen', 'Lopez', 'Robinson', 'Ayton', 'Jordan', 'Carter', 'Brooks', 'Oubre', 'Warren', 'Gordon', 'Bagley', 'Mills', 'Clarkson', 'Barnes', 'Kennard', 'Jackson', 'Rose', 'Anunoby', 'Redick', 'Dragic', 'Rubio', 'Osman', 'Thomas', 'Murray', 'Allen'];
        
        // Generate mock players
        const mockPlayers = [];
        const numPlayers = sportKey === 134 ? 15 : 22; // Basketball teams have 15 players, others have more
        
        for (let i = 1; i <= numPlayers; i++) {
            // Randomly select name
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            
            // Randomly select position
            const position = sportPositions[Math.floor(Math.random() * sportPositions.length)];
            
            // Generate stats based on position
            const stats = this._generateStatsByPosition(position);
            
            // Player age between 20-38
            const age = Math.floor(Math.random() * 18) + 20;
            
            // Jersey numbers
            let jersey = i;
            if (position === 'GK' && sportPositions === positions.soccer) {
                jersey = Math.floor(Math.random() * 10) + 1; // Goalkeepers often have lower numbers
            } else if (sportPositions === positions.soccer) {
                // Soccer jersey convention
                jersey = Math.floor(Math.random() * 30) + 1;
            } else {
                // Basketball/other sports
                jersey = Math.floor(Math.random() * 99) + 1;
            }
            
            // Player height in appropriate format
            let height;
            if (sportPositions === positions.basketball) {
                // Basketball height in feet and inches
                const heightInches = Math.floor(Math.random() * 18) + 70; // 5'10" to 7'4"
                const feet = Math.floor(heightInches / 12);
                const inches = heightInches % 12;
                height = `${feet}'${inches}"`;
            } else if (sportPositions === positions.soccer) {
                // Soccer height in cm
                height = `${Math.floor(Math.random() * 26) + 170}cm`; // 170cm to 195cm
            } else {
                // Default height format
                height = `${Math.floor(Math.random() * 30) + 170}cm`; // 170cm to 199cm
            }
            
            // Weight in lbs or kg
            let weight;
            if (sportPositions === positions.basketball) {
                weight = `${Math.floor(Math.random() * 100) + 175}lbs`; // 175-275 lbs
            } else if (sportPositions === positions.soccer) {
                weight = `${Math.floor(Math.random() * 30) + 65}kg`; // 65-95kg
            } else {
                weight = `${Math.floor(Math.random() * 60) + 70}kg`; // 70-130kg
            }
            
            mockPlayers.push({
                id: `player-${teamId}-${i}`,
                name: `${firstName} ${lastName}`,
                position: position,
                jersey: jersey,
                age: age,
                height: height,
                weight: weight,
                birthplace: 'Some City, Country',
                stats: stats,
                thumbnail: `player${i}.png`
            });
        }
        
        return {
            success: true,
            response: mockPlayers,
            source: 'mock'
        };
    }
    
    /**
     * Get mock fixtures data for a specific league
     * @param {string} leagueId - League ID
     * @returns {Object} Object containing mock fixtures data
     */
    getMockFixtures(leagueId) {
        // Get teams for the league (or default teams if no league specified)
        const teamsResponse = this.getMockTeams(leagueId);
        const teams = teamsResponse.response || [];
        
        // If no teams are available, provide generic teams
        const teamNames = teams.length > 0 
            ? teams.map(team => team.name)
            : ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team H'];
        
        const fixtures = [];
        const now = new Date();
        
        // Generate 15 upcoming fixtures
        for (let i = 1; i <= 15; i++) {
            // Create a date for fixture (1-30 days from now)
            const fixtureDate = new Date(now);
            fixtureDate.setDate(fixtureDate.getDate() + Math.floor(Math.random() * 30) + 1);
            
            // Format date as YYYY-MM-DD
            const formattedDate = fixtureDate.toISOString().split('T')[0];
            
            // Get random home and away teams
            const homeIndex = Math.floor(Math.random() * teamNames.length);
            let awayIndex = Math.floor(Math.random() * teamNames.length);
            
            // Make sure home and away teams are different
            while (awayIndex === homeIndex) {
                awayIndex = Math.floor(Math.random() * teamNames.length);
            }
            
            const homeTeam = teamNames[homeIndex];
            const awayTeam = teamNames[awayIndex];
            
            // Random time (HH:MM:SS)
            const hours = Math.floor(Math.random() * 12) + 12; // Between 12pm and 11pm
            const minutes = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, or 45
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
            
            fixtures.push({
                id: `fixture-${leagueId}-${i}`,
                date: formattedDate,
                time: timeString,
                status: 'scheduled',
                round: Math.floor(Math.random() * 10) + 1,
                season: '2024-2025',
                home: {
                    name: homeTeam,
                    id: teams.length > 0 ? teams[homeIndex].id : `team-${homeIndex}`,
                    logo: homeTeam.toLowerCase().replace(' ', '') + '.png'
                },
                away: {
                    name: awayTeam,
                    id: teams.length > 0 ? teams[awayIndex].id : `team-${awayIndex}`,
                    logo: awayTeam.toLowerCase().replace(' ', '') + '.png'
                },
                venue: `${homeTeam} Stadium`
            });
        }
        
        return {
            success: true,
            response: fixtures,
            source: 'mock'
        };
    }
    
    /**
     * Get mock team statistics data
     * @param {string} teamId - Team ID
     * @param {string} seasonId - Season ID (optional)
     * @returns {Object} Object containing mock team statistics data
     */
    getMockTeamStats(teamId, seasonId = null) {
        // Determine sport from team ID
        const sportKey = parseInt(teamId.substring(0, 3), 10);
        
        // Basketball team stats
        if (sportKey === 134 && parseInt(teamId.substring(3, 1), 10) !== 9) {
            return {
                success: true,
                response: {
                    teamId: teamId,
                    season: seasonId || '2024-2025',
                    games: {
                        played: Math.floor(Math.random() * 82) + 1,
                        wins: Math.floor(Math.random() * 60),
                        losses: Math.floor(Math.random() * 40),
                        winPercentage: (Math.random() * 0.8 + 0.1).toFixed(3)
                    },
                    points: {
                        for: (Math.random() * 20 + 100).toFixed(1),
                        against: (Math.random() * 20 + 100).toFixed(1),
                        differential: (Math.random() * 10 - 5).toFixed(1)
                    },
                    shooting: {
                        fieldGoalPercentage: (Math.random() * 0.1 + 0.42).toFixed(3),
                        threePointPercentage: (Math.random() * 0.1 + 0.33).toFixed(3),
                        freeThrowPercentage: (Math.random() * 0.1 + 0.72).toFixed(3)
                    },
                    rebounds: {
                        offensive: (Math.random() * 5 + 8).toFixed(1),
                        defensive: (Math.random() * 10 + 30).toFixed(1),
                        total: (Math.random() * 10 + 40).toFixed(1)
                    },
                    assists: (Math.random() * 8 + 20).toFixed(1),
                    steals: (Math.random() * 3 + 6).toFixed(1),
                    blocks: (Math.random() * 2 + 3).toFixed(1),
                    turnovers: (Math.random() * 5 + 10).toFixed(1),
                    fouls: (Math.random() * 5 + 15).toFixed(1),
                    advanced: {
                        offensiveRating: (Math.random() * 15 + 105).toFixed(1),
                        defensiveRating: (Math.random() * 15 + 105).toFixed(1),
                        pace: (Math.random() * 5 + 95).toFixed(1),
                        trueShootingPercentage: (Math.random() * 0.08 + 0.54).toFixed(3)
                    }
                },
                source: 'mock'
            };
        }
       // Soccer team stats
        else if (sportKey === 133) {
            return {
                success: true,
                response: {
                    teamId: teamId,
                    season: seasonId || '2023-2024',
                    games: {
                        played: Math.floor(Math.random() * 38) + 1,
                        wins: Math.floor(Math.random() * 25),
                        draws: Math.floor(Math.random() * 15),
                        losses: Math.floor(Math.random() * 20),
                        winPercentage: (Math.random() * 0.6 + 0.2).toFixed(3)
                    },
                    goals: {
                        for: Math.floor(Math.random() * 80) + 10,
                        against: Math.floor(Math.random() * 60) + 10,
                        differential: Math.floor(Math.random() * 40 - 10)
                    },
                    cards: {
                        yellow: Math.floor(Math.random() * 80) + 20,
                        red: Math.floor(Math.random() * 5) + 1
                    },
                    possession: {
                        average: (Math.random() * 20 + 40).toFixed(1) + '%'
                    },
                    passing: {
                        accuracy: (Math.random() * 15 + 75).toFixed(1) + '%',
                        totalPasses: Math.floor(Math.random() * 10000) + 5000
                    },
                    shooting: {
                        shotsTotal: Math.floor(Math.random() * 400) + 200,
                        shotsOnTarget: Math.floor(Math.random() * 250) + 100,
                        shotsOnTargetPercentage: (Math.random() * 20 + 40).toFixed(1) + '%'
                    },
                    defense: {
                        cleanSheets: Math.floor(Math.random() * 15) + 1,
                        tackles: Math.floor(Math.random() * 500) + 300,
                        interceptions: Math.floor(Math.random() * 300) + 150,
                        clearances: Math.floor(Math.random() * 1000) + 500
                    },
                    fouls: {
                        committed: Math.floor(Math.random() * 300) + 150,
                        suffered: Math.floor(Math.random() * 300) + 150
                    },
                    corners: Math.floor(Math.random() * 200) + 50,
                    advanced: {
                        expectedGoals: (Math.random() * 60 + 20).toFixed(1),
                        expectedGoalsAgainst: (Math.random() * 60 + 20).toFixed(1),
                        expectedPoints: (Math.random() * 60 + 20).toFixed(1)
                    }
                },
                source: 'mock'
            };
        }
        // Football team stats
        else if (sportKey === 134 && parseInt(teamId.substring(3, 1), 10) === 9) {
            return {
                success: true,
                response: {
                    teamId: teamId,
                    season: seasonId || '2023-2024',
                    games: {
                        played: Math.floor(Math.random() * 17) + 1,
                        wins: Math.floor(Math.random() * 13),
                        losses: Math.floor(Math.random() * 10),
                        ties: Math.floor(Math.random() * 2),
                        winPercentage: (Math.random() * 0.8 + 0.1).toFixed(3)
                    },
                    scoring: {
                        pointsFor: Math.floor(Math.random() * 400) + 100,
                        pointsAgainst: Math.floor(Math.random() * 350) + 100,
                        pointDifferential: Math.floor(Math.random() * 200 - 100)
                    },
                    offense: {
                        totalYards: Math.floor(Math.random() * 4000) + 2000,
                        passingYards: Math.floor(Math.random() * 3000) + 1500,
                        rushingYards: Math.floor(Math.random() * 2000) + 500,
                        yardsPerPlay: (Math.random() * 3 + 4).toFixed(1),
                        thirdDownConversion: (Math.random() * 30 + 30).toFixed(1) + '%',
                        fourthDownConversion: (Math.random() * 40 + 30).toFixed(1) + '%',
                        sacks: Math.floor(Math.random() * 40) + 10,
                        interceptions: Math.floor(Math.random() * 20) + 3,
                        fumbles: Math.floor(Math.random() * 15) + 2
                    },
                    defense: {
                        totalYardsAllowed: Math.floor(Math.random() * 4000) + 2000,
                        passingYardsAllowed: Math.floor(Math.random() * 3000) + 1500,
                        rushingYardsAllowed: Math.floor(Math.random() * 2000) + 500,
                        sacks: Math.floor(Math.random() * 40) + 10,
                        interceptions: Math.floor(Math.random() * 20) + 3,
                        forcedFumbles: Math.floor(Math.random() * 15) + 5
                    },
                    specialTeams: {
                        fieldGoalPercentage: (Math.random() * 20 + 75).toFixed(1) + '%',
                        puntsAverage: (Math.random() * 10 + 40).toFixed(1),
                        kickReturnAverage: (Math.random() * 10 + 20).toFixed(1),
                        puntReturnAverage: (Math.random() * 5 + 7).toFixed(1)
                    },
                    penalties: {
                        number: Math.floor(Math.random() * 100) + 50,
                        yards: Math.floor(Math.random() * 800) + 400
                    }
                },
                source: 'mock'
            };
        }
        // Baseball team stats
        else if (sportKey === 135 && parseInt(teamId.substring(3, 1), 10) === 0) {
            return {
                success: true,
                response: {
                    teamId: teamId,
                    season: seasonId || '2023',
                    games: {
                        played: Math.floor(Math.random() * 162) + 1,
                        wins: Math.floor(Math.random() * 100) + 40,
                        losses: Math.floor(Math.random() * 100),
                        winPercentage: (Math.random() * 0.4 + 0.4).toFixed(3)
                    },
                    batting: {
                        runs: Math.floor(Math.random() * 800) + 400,
                        hits: Math.floor(Math.random() * 1400) + 800,
                        homeRuns: Math.floor(Math.random() * 220) + 100,
                        rbi: Math.floor(Math.random() * 750) + 400,
                        stolenBases: Math.floor(Math.random() * 150) + 30,
                        battingAverage: (Math.random() * 0.05 + 0.23).toFixed(3),
                        onBasePercentage: (Math.random() * 0.07 + 0.3).toFixed(3),
                        sluggingPercentage: (Math.random() * 0.1 + 0.38).toFixed(3),
                        ops: (Math.random() * 0.15 + 0.7).toFixed(3)
                    },
                    pitching: {
                        era: (Math.random() * 3 + 2.5).toFixed(2),
                        strikeouts: Math.floor(Math.random() * 1400) + 800,
                        walks: Math.floor(Math.random() * 550) + 250,
                        whip: (Math.random() * 0.5 + 1.1).toFixed(2),
                        saves: Math.floor(Math.random() * 50) + 10,
                        inningsPitched: (Math.floor(Math.random() * 500) + 1000).toFixed(1),
                        homeRunsAllowed: Math.floor(Math.random() * 200) + 100,
                    },
                    fielding: {
                        fielingPercentage: (Math.random() * 0.02 + 0.97).toFixed(3),
                        errors: Math.floor(Math.random() * 100) + 50,
                        doublePlays: Math.floor(Math.random() * 150) + 100
                    }
                },
                source: 'mock'
            };
        }
        // Hockey team stats
        else if (sportKey === 135 && parseInt(teamId.substring(3, 1), 10) === 5) {
            return {
                success: true,
                response: {
                    teamId: teamId,
                    season: seasonId || '2023-2024',
                    games: {
                        played: Math.floor(Math.random() * 82) + 1,
                        wins: Math.floor(Math.random() * 50) + 10,
                        overtimeLosses: Math.floor(Math.random() * 10) + 5,
                        losses: Math.floor(Math.random() * 40) + 10,
                        points: Math.floor(Math.random() * 100) + 40,
                        winPercentage: (Math.random() * 0.5 + 0.3).toFixed(3)
                    },
                    goals: {
                        for: Math.floor(Math.random() * 150) + 150,
                        against: Math.floor(Math.random() * 150) + 150,
                        differential: Math.floor(Math.random() * 100 - 50)
                    },
                    scoring: {
                        powerPlayGoals: Math.floor(Math.random() * 70) + 30,
                        powerPlayOpportunities: Math.floor(Math.random() * 100) + 200,
                        powerPlayPercentage: (Math.random() * 10 + 15).toFixed(1) + '%',
                        penaltyKillPercentage: (Math.random() * 10 + 75).toFixed(1) + '%',
                        shorthandedGoals: Math.floor(Math.random() * 10) + 2,
                        emptyNetGoals: Math.floor(Math.random() * 10) + 2
                    },
                    shots: {
                        shotsFor: Math.floor(Math.random() * 500) + 2000,
                        shotsAgainst: Math.floor(Math.random() * 500) + 2000,
                        shootingPercentage: (Math.random() * 5 + 7).toFixed(1) + '%',
                        savesPercentage: (Math.random() * 5 + 90).toFixed(1) + '%'
                    },
                    penalties: {
                        number: Math.floor(Math.random() * 100) + 200,
                        penaltyMinutes: Math.floor(Math.random() * 200) + 400
                    },
                    faceoffs: {
                        faceoffWins: Math.floor(Math.random() * 500) + 1500,
                        faceoffLosses: Math.floor(Math.random() * 500) + 1500,
                        faceoffPercentage: (Math.random() * 10 + 45).toFixed(1) + '%'
                    }
                },
                source: 'mock'
            };
        }
        // Default team stats for generic teams
        else {
            return {
                success: true,
                response: {
                    teamId: teamId,
                    season: seasonId || 'Current',
                    games: {
                        played: Math.floor(Math.random() * 50) + 1,
                        wins: Math.floor(Math.random() * 30),
                        losses: Math.floor(Math.random() * 25),
                        winPercentage: (Math.random() * 0.7 + 0.2).toFixed(3)
                    },
                    points: {
                        for: Math.floor(Math.random() * 200) + 100,
                        against: Math.floor(Math.random() * 200) + 100,
                        differential: Math.floor(Math.random() * 100 - 50)
                    },
                    additional: {
                        metric1: (Math.random() * 50 + 20).toFixed(1),
                        metric2: (Math.random() * 40 + 30).toFixed(1),
                        metric3: (Math.random() * 0.3 + 0.4).toFixed(3),
                        metric4: Math.floor(Math.random() * 100) + 50
                    }
                },
                source: 'mock'
            };
        }
    }
    
    /**
     * Get mock player statistics data
     * @param {string} playerId - Player ID
     * @param {string} seasonId - Season ID (optional)
     * @returns {Object} Object containing mock player statistics data
     */
    getMockPlayerStats(playerId, seasonId = null) {
        const season = seasonId || '2023-2024';
        
        // Extract sport type from player ID format
        // Format is typically "player-teamId-playerNumber"
        const parts = playerId.split('-');
        if (parts.length < 2) {
            // If can't determine, return generic stats
            return {
                success: true,
                response: {
                    playerId: playerId,
                    season: season,
                    games: {
                        played: Math.floor(Math.random() * 50) + 1,
                        started: Math.floor(Math.random() * 40)
                    },
                    stats: {
                        stat1: (Math.random() * 20 + 10).toFixed(1),
                        stat2: (Math.random() * 10 + 5).toFixed(1),
                        stat3: (Math.random() * 5 + 1).toFixed(1),
                        stat4: (Math.random() * 0.2 + 0.3).toFixed(3)
                    }
                },
                source: 'mock'
            };
        }
        
        const teamId = parts[1];
        const sportKey = parseInt(teamId.substring(0, 3), 10);
        
        // Basketball player stats
        if (sportKey === 134 && parseInt(teamId.substring(3, 1), 10) !== 9) {
            return {
                success: true,
                response: {
                    playerId: playerId,
                    season: season,
                    games: {
                        played: Math.floor(Math.random() * 82) + 1,
                        started: Math.floor(Math.random() * 70)
                    },
                    minutes: (Math.random() * 30 + 10).toFixed(1),
                    scoring: {
                        points: (Math.random() * 25 + 5).toFixed(1),
                        fieldGoalsMade: (Math.random() * 8 + 2).toFixed(1),
                        fieldGoalsAttempted: (Math.random() * 16 + 5).toFixed(1),
                        fieldGoalPercentage: (Math.random() * 0.2 + 0.4).toFixed(3),
                        threePointsMade: (Math.random() * 3 + 0.5).toFixed(1),
                        threePointsAttempted: (Math.random() * 7 + 1).toFixed(1),
                        threePointPercentage: (Math.random() * 0.2 + 0.3).toFixed(3),
                        freeThrowsMade: (Math.random() * 6 + 1).toFixed(1),
                        freeThrowsAttempted: (Math.random() * 7 + 1.5).toFixed(1),
                        freeThrowPercentage: (Math.random() * 0.2 + 0.7).toFixed(3)
                    },
                    rebounds: {
                        offensive: (Math.random() * 3 + 0.5).toFixed(1),
                        defensive: (Math.random() * 6 + 1).toFixed(1),
                        total: (Math.random() * 8 + 2).toFixed(1)
                    },
                    assists: (Math.random() * 7 + 1).toFixed(1),
                    defense: {
                        steals: (Math.random() * 2 + 0.3).toFixed(1),
                        blocks: (Math.random() * 1.5 + 0.1).toFixed(1),
                        personalFouls: (Math.random() * 3 + 1).toFixed(1)
                    },
                    efficiency: {
                        turnovers: (Math.random() * 3 + 0.5).toFixed(1),
                        plusMinus: (Math.random() * 20 - 10).toFixed(1),
                        trueShootingPercentage: (Math.random() * 0.15 + 0.5).toFixed(3),
                        playerEfficiencyRating: (Math.random() * 25 + 5).toFixed(1)
                    }
                },
                source: 'mock'
            };
        }
        // Soccer player stats
        else if (sportKey === 133) {
            return {
                success: true,
                response: {
                    playerId: playerId,
                    season: season,
                    appearances: {
                        total: Math.floor(Math.random() * 38) + 1,
                        lineups: Math.floor(Math.random() * 30),
                        substitutesIn: Math.floor(Math.random() * 10),
                        substitutesOut: Math.floor(Math.random() * 15),
                        minutesPlayed: Math.floor(Math.random() * 3000) + 500
                    },
                    goals: {
                        total: Math.floor(Math.random() * 25),
                        assists: Math.floor(Math.random() * 15),
                        penalties: Math.floor(Math.random() * 5)
                    },
                    shots: {
                        total: Math.floor(Math.random() * 100) + 10,
                        onTarget: Math.floor(Math.random() * 60) + 5
                    },
                    passes: {
                        total: Math.floor(Math.random() * 2000) + 500,
                        accuracy: (Math.random() * 25 + 65).toFixed(1) + '%',
                        keyPasses: Math.floor(Math.random() * 50) + 5
                    },
                    tackles: {
                        total: Math.floor(Math.random() * 100) + 10,
                        blocks: Math.floor(Math.random() * 30) + 5,
                        interceptions: Math.floor(Math.random() * 50) + 10
                    },
                    duels: {
                        won: Math.floor(Math.random() * 200) + 50,
                        lost: Math.floor(Math.random() * 150) + 50
                    },
                    dribbles: {
                        attempts: Math.floor(Math.random() * 100) + 10,
                        success: Math.floor(Math.random() * 70) + 5
                    },
                    fouls: {
                        drawn: Math.floor(Math.random() * 50) + 5,
                        committed: Math.floor(Math.random() * 40) + 5
                    },
                    cards: {
                        yellow: Math.floor(Math.random() * 10),
                        red: Math.floor(Math.random() * 2)
                    },
                    rating: (Math.random() * 3 + 6).toFixed(2)
                },
                source: 'mock'
            };
        }
        // American football player stats
        else if (sportKey === 134 && parseInt(teamId.substring(3, 1), 10) === 9) {
            // Create position-specific stats
            const position = playerId.includes('-QB-') ? 'QB' :
                             playerId.includes('-RB-') ? 'RB' :
                             playerId.includes('-WR-') ? 'WR' :
                             playerId.includes('-TE-') ? 'TE' :
                             playerId.includes('-K-') ? 'K' :
                             playerId.includes('-DEF-') ? 'DEF' : 'Generic';
            
            let statsObj = {
                playerId: playerId,
                season: season,
                games: {
                    played: Math.floor(Math.random() * 17) + 1,
                    started: Math.floor(Math.random() * 16)
                }
            };
            
            // Position-specific stats
            if (position === 'QB') {
                statsObj = {
                    ...statsObj,
                    passing: {
                        attempts: Math.floor(Math.random() * 500) + 200,
                        completions: Math.floor(Math.random() * 350) + 150,
                        yards: Math.floor(Math.random() * 4000) + 1000,
                        touchdowns: Math.floor(Math.random() * 35) + 5,
                        interceptions: Math.floor(Math.random() * 20),
                        sacks: Math.floor(Math.random() * 40),
                        rating: (Math.random() * 50 + 70).toFixed(1)
                    },
                    rushing: {
                        attempts: Math.floor(Math.random() * 100),
                        yards: Math.floor(Math.random() * 500),
                        touchdowns: Math.floor(Math.random() * 5)
                    }
                };
            } else if (position === 'RB') {
                statsObj = {
                    ...statsObj,
                    rushing: {
                        attempts: Math.floor(Math.random() * 300) + 50,
                        yards: Math.floor(Math.random() * 1500) + 200,
                        touchdowns: Math.floor(Math.random() * 15) + 1,
                        longRun: Math.floor(Math.random() * 80) + 10,
                        yardsPerAttempt: (Math.random() * 3 + 3).toFixed(1),
                        yardsPerGame: (Math.random() * 100 + 20).toFixed(1)
                    },
                    receiving: {
                        targets: Math.floor(Math.random() * 80) + 10,
                        receptions: Math.floor(Math.random() * 60) + 5,
                        yards: Math.floor(Math.random() * 600) + 100,
                        touchdowns: Math.floor(Math.random() * 5),
                        yardsPerReception: (Math.random() * 10 + 5).toFixed(1)
                    },
                    fumbles: Math.floor(Math.random() * 5)
                };
            } else if (position === 'WR' || position === 'TE') {
                statsObj = {
                    ...statsObj,
                    receiving: {
                        targets: Math.floor(Math.random() * 150) + 30,
                        receptions: Math.floor(Math.random() * 100) + 20,
                        yards: Math.floor(Math.random() * 1500) + 200,
                        touchdowns: Math.floor(Math.random() * 15),
                        longReception: Math.floor(Math.random() * 80) + 15,
                        yardsPerReception: (Math.random() * 10 + 8).toFixed(1),
                        yardsPerGame: (Math.random() * 100 + 30).toFixed(1),
                        firstDowns: Math.floor(Math.random() * 60) + 10
                    },
                    rushing: {
                        attempts: Math.floor(Math.random() * 10),
                        yards: Math.floor(Math.random() * 100),
                        touchdowns: Math.floor(Math.random() * 2)
                    },
                    fumbles: Math.floor(Math.random() * 3)
                };
            } else if (position === 'K') {
                statsObj = {
                    ...statsObj,
                    fieldGoals: {
                        attempts: Math.floor(Math.random() * 40) + 10,
                        made: Math.floor(Math.random() * 35) + 5,
                        percentage: (Math.random() * 20 + 75).toFixed(1) + '%',
                        long: Math.floor(Math.random() * 20) + 40
                    },
                    extraPoints: {
                        attempts: Math.floor(Math.random() * 50) + 10,
                        made: Math.floor(Math.random() * 48) + 8,
                        percentage: (Math.random() * 10 + 90).toFixed(1) + '%'
                    },
                    points: Math.floor(Math.random() * 150) + 30
                };
            } else if (position === 'DEF') {
                statsObj = {
                    ...statsObj,
                    defense: {
                        combinedTackles: Math.floor(Math.random() * 150) + 20,
                        soloTackles: Math.floor(Math.random() * 100) + 10,
                        assistedTackles: Math.floor(Math.random() * 80) + 10,
                        sacks: (Math.random() * 15).toFixed(1),
                        tacklesForLoss: Math.floor(Math.random() * 20) + 1,
                        interceptions: Math.floor(Math.random() * 5),
                        passesDefended: Math.floor(Math.random() * 15) + 1,
                        forcedFumbles: Math.floor(Math.random() * 5),
                        fumblesRecovered: Math.floor(Math.random() * 3),
                        defensiveTouchdowns: Math.floor(Math.random() * 2)
                    }
                };
            } else {
                // Generic stats for other positions
                statsObj = {
                    ...statsObj,
                    offense: {
                        touchdowns: Math.floor(Math.random() * 10),
                        yardsFromScrimmage: Math.floor(Math.random() * 1000) + 100
                    },
                    defense: {
                        tackles: Math.floor(Math.random() * 100) + 10,
                        sacks: Math.floor(Math.random() * 10),
                        interceptions: Math.floor(Math.random() * 3)
                    }
                };
            }
            
            return {
                success: true,
                response: statsObj,
                source: 'mock'
            };
        }
        // Baseball player stats
        else if (sportKey === 135 && parseInt(teamId.substring(3, 1), 10) === 0) {
            // Determine if player is pitcher or position player
            const isPitcher = playerId.includes('-P-');
            
            let statsObj = {
                playerId: playerId,
                season: season,
                games: {
                    played: Math.floor(Math.random() * 162) + 1
                }
            };
            
            if (isPitcher) {
                statsObj = {
                    ...statsObj,
                    pitching: {
                        wins: Math.floor(Math.random() * 20),
                        losses: Math.floor(Math.random() * 15),
                        era: (Math.random() * 5 + 1).toFixed(2),
                        games: Math.floor(Math.random() * 60) + 1,
                        gamesStarted: Math.floor(Math.random() * 35),
                        saves: Math.floor(Math.random() * 30),
                        inningsPitched: (Math.floor(Math.random() * 200) + 20).toFixed(1),
                        hitsAllowed: Math.floor(Math.random() * 200) + 30,
                        runsAllowed: Math.floor(Math.random() * 100) + 10,
                        earnedRuns: Math.floor(Math.random() * 90) + 10,
                        homeRunsAllowed: Math.floor(Math.random() * 30) + 5,
                        strikeouts: Math.floor(Math.random() * 300) + 30,
                        walks: Math.floor(Math.random() * 100) + 10,
                        whip: (Math.random() * 1 + 0.8).toFixed(2),
                        battingAverageAgainst: (Math.random() * 0.1 + 0.2).toFixed(3)
                    }
                };
            } else {
                statsObj = {
                    ...statsObj,
                    batting: {
                        atBats: Math.floor(Math.random() * 600) + 100,
                        runs: Math.floor(Math.random() * 100) + 20,
                        hits: Math.floor(Math.random() * 200) + 30,
                        doubles: Math.floor(Math.random() * 40) + 5,
                        triples: Math.floor(Math.random() * 10),
                        homeRuns: Math.floor(Math.random() * 40),
                        rbi: Math.floor(Math.random() * 100) + 20,
                        stolenBases: Math.floor(Math.random() * 30),
                        caughtStealing: Math.floor(Math.random() * 10),
                        walks: Math.floor(Math.random() * 80) + 10,
                        strikeouts: Math.floor(Math.random() * 150) + 30,
                        avg: (Math.random() * 0.150 + 0.220).toFixed(3),
                        obp: (Math.random() * 0.150 + 0.300).toFixed(3),
                        slg: (Math.random() * 0.200 + 0.350).toFixed(3),
                        ops: (Math.random() * 0.300 + 0.650).toFixed(3)
                    },
                    fielding: {
                        position: isPitcher ? 'P' : ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'][Math.floor(Math.random() * 9)],
                        innings: (Math.floor(Math.random() * 1200) + 100).toFixed(1),
                        putouts: Math.floor(Math.random() * 400) + 20,
                        assists: Math.floor(Math.random() * 300) + 10,
                        errors: Math.floor(Math.random() * 20),
                        fieldingPercentage: (Math.random() * 0.050 + 0.950).toFixed(3)
                    }
                };
            }
            
            return {
                success: true,
                response: statsObj,
                source: 'mock'
            };
        }
        // Hockey player stats
        else if (sportKey === 135 && parseInt(teamId.substring(3, 1), 10) === 5) {
            // Determine if player is goalie or position player
            const isGoalie = playerId.includes('-G-');
            
            let statsObj = {
                playerId: playerId,
                season: season,
                games: {
                    played: Math.floor(Math.random() * 82) + 1
                }
            };
            
            if (isGoalie) {
                statsObj = {
                    ...statsObj,
                    goaltending: {
                        wins: Math.floor(Math.random() * 40),
                        losses: Math.floor(Math.random() * 30),
                        overtimeLosses: Math.floor(Math.random() * 10),
                        goalsAgainst: Math.floor(Math.random() * 150) + 50,
                        goalsAgainstAverage: (Math.random() * 2 + 1.5).toFixed(2),
                        saves: Math.floor(Math.random() * 1500) + 500,
                        shotsAgainst: Math.floor(Math.random() * 1700) + 600,
                        savePercentage: (Math.random() * 0.050 + 0.900).toFixed(3),
                        shutouts: Math.floor(Math.random() * 10),
                        minutesPlayed: Math.floor(Math.random() * 3500) + 500
                    }
                };
            } else {
                statsObj = {
                    ...statsObj,
                    skating: {
                        goals: Math.floor(Math.random() * 50),
                        assists: Math.floor(Math.random() * 60),
                        points: Math.floor(Math.random() * 100),
                        plusMinus: Math.floor(Math.random() * 60) - 30,
                        penaltyMinutes: Math.floor(Math.random() * 100),
                        powerPlayGoals: Math.floor(Math.random() * 20),
                        powerPlayAssists: Math.floor(Math.random() * 30),
                        shortHandedGoals: Math.floor(Math.random() * 5),
                        shortHandedAssists: Math.floor(Math.random() * 5),
                        gameWinningGoals: Math.floor(Math.random() * 10),
                        shots: Math.floor(Math.random() * 300) + 50,
                        shootingPercentage: (Math.random() * 15 + 5).toFixed(1) + '%',
                        timeOnIcePerGame: (Math.random() * 10 + 10).toFixed(2)
                    }
                };
            }
            
            return {
                success: true,
                response: statsObj,
                source: 'mock'
            };
        }
        // Default player stats
        else {
            return {
                success: true,
                response: {
                    playerId: playerId,
                    season: season,
                    games: {
                        played: Math.floor(Math.random() * 50) + 1,
                        started: Math.floor(Math.random() * 40)
                    },
                    stats: {
                        stat1: (Math.random() * 20 + 10).toFixed(1),
                        stat2: (Math.random() * 10 + 5).toFixed(1),
                        stat3: (Math.random() * 5 + 1).toFixed(1),
                        stat4: (Math.random() * 0.2 + 0.3).toFixed(3)
                    }
                },
                source: 'mock'
            };
        }
    }
    
    /**
     * Get mock standings data for a specific league
     * @param {string} leagueId - League ID
     * @param {string} season - Season (optional)
     * @returns {Object} Object containing mock standings data
     */
    getMockStandings(leagueId, season = '2023-2024') {
        // Get teams for the league (or default teams if league not found)
        const teamsResponse = this.getMockTeams(leagueId);
        const teams = teamsResponse.response || [];
        
        // If no teams found, return empty array
        if (teams.length === 0) {
            return {
                success: false,
                error: 'No teams found for this league',
                response: []
            };
        }
        
        // Generate standings for each team
        const standings = teams.map((team, index) => {
            // Generate team record based on league type
            if (leagueId === this.leagueIds.nba || leagueId === this.leagueIds.nba_g) {
                // NBA standings
                const gamesPlayed = Math.floor(Math.random() * 82) + 1;
                const wins = Math.floor(Math.random() * gamesPlayed);
                const losses = gamesPlayed - wins;
                
                return {
                    position: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    played: gamesPlayed,
                    wins: wins,
                    losses: losses,
                    winPercentage: (wins / gamesPlayed).toFixed(3),
                    gamesBehind: (Math.random() * 20).toFixed(1),
                    homeRecord: `${Math.floor(Math.random() * Math.min(41, wins) + 1)}-${Math.floor(Math.random() * Math.min(41, losses) + 1)}`,
                    awayRecord: `${Math.floor(Math.random() * Math.min(41, wins) + 1)}-${Math.floor(Math.random() * Math.min(41, losses) + 1)}`,
                    lastTenGames: `${Math.floor(Math.random() * 11)}-${Math.floor(Math.random() * 11)}`,
                    streak: Math.random() > 0.5 ? `W${Math.floor(Math.random() * 10) + 1}` : `L${Math.floor(Math.random() * 10) + 1}`,
                    pointsFor: Math.floor(Math.random() * 9000) + 7000,
                    pointsAgainst: Math.floor(Math.random() * 9000) + 7000
                };
            } else if (leagueId === this.leagueIds.nfl) {
                // NFL standings
                const gamesPlayed = Math.floor(Math.random() * 17) + 1;
                const wins = Math.floor(Math.random() * gamesPlayed);
                const losses = gamesPlayed - wins - (Math.floor(Math.random() * 2)); // Possible tie
                const ties = gamesPlayed - wins - losses;
                
                return {
                    position: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    played: gamesPlayed,
                    wins: wins,
                    losses: losses,
                    ties: ties,
                    winPercentage: ((wins + ties * 0.5) / gamesPlayed).toFixed(3),
                    homeRecord: `${Math.floor(Math.random() * Math.min(8, wins) + 1)}-${Math.floor(Math.random() * Math.min(8, losses) + 1)}${ties > 0 ? `-${Math.floor(Math.random() * ties + 1)}` : ''}`,
                    awayRecord: `${Math.floor(Math.random() * Math.min(8, wins) + 1)}-${Math.floor(Math.random() * Math.min(8, losses) + 1)}${ties > 0 ? `-${Math.floor(Math.random() * ties + 1)}` : ''}`,
                    divisionRecord: `${Math.floor(Math.random() * Math.min(6, wins) + 1)}-${Math.floor(Math.random() * Math.min(6, losses) + 1)}${ties > 0 ? `-${Math.floor(Math.random() * ties + 1)}` : ''}`,
                    conferenceRecord: `${Math.floor(Math.random() * Math.min(12, wins) + 1)}-${Math.floor(Math.random() * Math.min(12, losses) + 1)}${ties > 0 ? `-${Math.floor(Math.random() * ties + 1)}` : ''}`,
                    pointsFor: Math.floor(Math.random() * 400) + 100,
                    pointsAgainst: Math.floor(Math.random() * 400) + 100,
                    streak: Math.random() > 0.5 ? `W${Math.floor(Math.random() * 10) + 1}` : `L${Math.floor(Math.random() * 10) + 1}`
                };
            } else if (leagueId === this.leagueIds.mlb) {
                // MLB standings
                const gamesPlayed = Math.floor(Math.random() * 162) + 1;
                const wins = Math.floor(Math.random() * gamesPlayed);
                const losses = gamesPlayed - wins;
                
                return {
                    position: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    played: gamesPlayed,
                    wins: wins,
                    losses: losses,
                    winPercentage: (wins / gamesPlayed).toFixed(3),
                    gamesBehind: (Math.random() * 20).toFixed(1),
                    homeRecord: `${Math.floor(Math.random() * Math.min(81, wins) + 1)}-${Math.floor(Math.random() * Math.min(81, losses) + 1)}`,
                    awayRecord: `${Math.floor(Math.random() * Math.min(81, wins) + 1)}-${Math.floor(Math.random() * Math.min(81, losses) + 1)}`,
                    lastTenGames: `${Math.floor(Math.random() * 11)}-${Math.floor(Math.random() * 11)}`,
                    runsScored: Math.floor(Math.random() * 800) + 400,
                    runsAllowed: Math.floor(Math.random() * 800) + 400,
                    runDifferential: Math.floor(Math.random() * 200) - 100,
                    streak: Math.random() > 0.5 ? `W${Math.floor(Math.random() * 10) + 1}` : `L${Math.floor(Math.random() * 10) + 1}`
                };
            } else if (leagueId === this.leagueIds.nhl) {
                // NHL standings
                const gamesPlayed = Math.floor(Math.random() * 82) + 1;
                const wins = Math.floor(Math.random() * gamesPlayed);
                const otLosses = Math.floor(Math.random() * (gamesPlayed - wins) / 2);
                const losses = gamesPlayed - wins - otLosses;
                const points = wins * 2 + otLosses;
                
                return {
                    position: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    played: gamesPlayed,
                    wins: wins,
                    losses: losses,
                    otLosses: otLosses,
                    points: points,
                    pointPercentage: (points / (gamesPlayed * 2)).toFixed(3),
                    homeRecord: `${Math.floor(Math.random() * Math.min(41, wins) + 1)}-${Math.floor(Math.random() * Math.min(41, losses) + 1)}-${Math.floor(Math.random() * Math.min(41, otLosses) + 1)}`,
                    awayRecord: `${Math.floor(Math.random() * Math.min(41, wins) + 1)}-${Math.floor(Math.random() * Math.min(41, losses) + 1)}-${Math.floor(Math.random() * Math.min(41, otLosses) + 1)}`,
                    lastTenGames: `${Math.floor(Math.random() * 11)}-${Math.floor(Math.random() * 11)}`,
                    goalsFor: Math.floor(Math.random() * 300) + 100,
                    goalsAgainst: Math.floor(Math.random() * 300) + 100,
                    streak: Math.random() > 0.5 ? `W${Math.floor(Math.random() * 10) + 1}` : `L${Math.floor(Math.random() * 10) + 1}`
                };
            } else if ([this.leagueIds.premierleague, this.leagueIds.laliga, this.leagueIds.bundesliga, 
                        this.leagueIds.seriea, this.leagueIds.ligue1, this.leagueIds.mls].includes(leagueId)) {
                // Soccer standings
                const gamesPlayed = Math.floor(Math.random() * 38) + 1;
                const wins = Math.floor(Math.random() * gamesPlayed);
                const draws = Math.floor(Math.random() * (gamesPlayed - wins));
                const losses = gamesPlayed - wins - draws;
                const points = wins * 3 + draws;
                
                return {
                    position: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    played: gamesPlayed,
                    wins: wins,
                    draws: draws,
                    losses: losses,
                    points: points,
                    goalsFor: Math.floor(Math.random() * 90) + 10,
                    goalsAgainst: Math.floor(Math.random() * 80) + 10,
                    goalDifference: Math.floor(Math.random() * 70) - 20,
                    form: ['W', 'D', 'L', 'W', 'D'].sort(() => Math.random() - 0.5).join('')
                };
            } else {
                // Default standings format for other leagues
                const gamesPlayed = Math.floor(Math.random() * 50) + 1;
                const wins = Math.floor(Math.random() * gamesPlayed);
                const losses = gamesPlayed - wins;
                
                return {
                    position: index + 1,
                    teamId: team.id,
                    teamName: team.name,
                    played: gamesPlayed,
                    wins: wins,
                    losses: losses,
                    pointsFor: Math.floor(Math.random() * 1000) + 500,
                    pointsAgainst: Math.floor(Math.random() * 1000) + 500
                };
            }
        });
        
        // Sort standings by appropriate criteria based on league
        if ([this.leagueIds.premierleague, this.leagueIds.laliga, this.leagueIds.bundesliga, 
             this.leagueIds.seriea, this.leagueIds.ligue1, this.leagueIds.mls].includes(leagueId)) {
            // Soccer: sort by points, then goal difference, then goals for
            standings.sort((a, b) => {
                if (a.points !== b.points) return b.points - a.points;
                if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
                return b.goalsFor - a.goalsFor;
            });
        } else if (leagueId === this.leagueIds.nhl) {
            // NHL: sort by points, then wins
            standings.sort((a, b) => {
                if (a.points !== b.points) return b.points - a.points;
                return b.wins - a.wins;
            });
        } else {
            // Most other leagues: sort by win percentage
            standings.sort((a, b) => {
                return parseFloat(b.winPercentage) - parseFloat(a.winPercentage);
            });
        }
        
        // Update positions after sorting
        standings.forEach((team, index) => {
            team.position = index + 1;
        });
        
        return {
            success: true,
            response: standings,
            source: 'mock'
        };
    }
    
    /**
     * Get mock search results
     * @param {string} query - Search query
     * @param {string} type - Type of search (teams, leagues, players, or all)
     * @returns {Object} Object containing mock search results
     */
    getMockSearchResults(query, type = 'all') {
        const lowerQuery = query.toLowerCase();
        let results = [];
        
        if (type === 'leagues' || type === 'all') {
            // Search leagues
            const leagues = this.getMockLeagues().response;
            const matchedLeagues = leagues.filter(league => 
                league.name.toLowerCase().includes(lowerQuery) || 
                (league.country && league.country.toLowerCase().includes(lowerQuery)) ||
                (league.sport && league.sport.toLowerCase().includes(lowerQuery))
            );
            
            if (type === 'leagues') {
                results = matchedLeagues;
            } else {
                results = { leagues: matchedLeagues };
            }
        }
        
        if (type === 'teams' || type === 'all') {
            // For teams, we'll combine teams from different leagues
            const allTeams = [];
            
            // Get teams from major leagues
            const leagueIds = [
                this.leagueIds.nba, 
                this.leagueIds.nfl, 
                this.leagueIds.mlb,
                this.leagueIds.nhl,
                this.leagueIds.premierleague
            ];
            
            leagueIds.forEach(leagueId => {
                const teams = this.getMockTeams(leagueId).response;
                teams.forEach(team => {
                    team.league = this.leagueNames[leagueId] || 'Unknown League';
                });
                allTeams.push(...teams);
            });
            
            const matchedTeams = allTeams.filter(team => 
                team.name.toLowerCase().includes(lowerQuery) || 
                (team.city && team.city.toLowerCase().includes(lowerQuery)) ||
                (team.league && team.league.toLowerCase().includes(lowerQuery))
            );
            
            if (type === 'teams') {
                results = matchedTeams;
            } else {
                results.teams = matchedTeams;
            }
        }
        
        if (type === 'players' || type === 'all') {
            // For players, we'll create sample players
            const samplePlayers = [];
            const firstNames = ['James', 'Michael', 'Chris', 'Anthony', 'Kevin', 'Stephen', 'LeBron', 'Giannis', 'Luka', 'Kawhi', 'Nikola', 'Joel', 'Marcus', 'Russell', 'Jayson', 'Damian', 'Kyrie', 'Jimmy', 'Donovan', 'Zion', 'Devin', 'Ben'];
            const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'James', 'Curry', 'Antetokounmpo', 'Doncic', 'Leonard', 'Jokić', 'Embiid', 'Tatum', 'Lillard', 'Irving', 'Butler', 'Mitchell', 'Williamson', 'Booker', 'Simmons'];
            
            // Generate 50 sample players
            for (let i = 1; i <= 50; i++) {
                const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
                const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
                
                samplePlayers.push({
                    id: `player-sample-${i}`,
                    name: `${firstName} ${lastName}`,
                    team: ['Lakers', 'Warriors', 'Celtics', 'Nets', 'Bucks', '76ers', 'Heat', 'Suns', 'Jazz', 'Nuggets'][Math.floor(Math.random() * 10)],
                    position: ['PG', 'SG', 'SF', 'PF', 'C'][Math.floor(Math.random() * 5)]
                });
            }
            
            const matchedPlayers = samplePlayers.filter(player => 
                player.name.toLowerCase().includes(lowerQuery) || 
                player.team.toLowerCase().includes(lowerQuery) ||
                player.position.toLowerCase().includes(lowerQuery)
            );
            
            if (type === 'players') {
                results = matchedPlayers;
            } else {
                results.players = matchedPlayers;
            }
        }
        
        return {
            success: true,
            query: query,
            response: results,
            source: 'mock'
        };
    }
    
    /**
     * Export cache data to JSON
     * @returns {string} JSON string of cache data
     */
    exportCache() {
        return JSON.stringify(this.cache);
    }
    
    /**
     * Import cache data from JSON
     * @param {string} jsonData - JSON string of cache data
     * @returns {boolean} Success status
     */
    importCache(jsonData) {
        try {
            const parsed = JSON.parse(jsonData);
            this.cache = parsed;
            this.log.info('Cache data imported successfully');
            return true;
        } catch (error) {
            this.log.error('Failed to import cache data:', error);
            return false;
        }
    }
    
    /**
     * Get service status information
     * @returns {Object} Service status object
     */
    getStatus() {
        return {
            version: '4.0.0',
            apiKey: this.config.apiKey ? 'Valid' : 'Missing or Invalid',
            useMockData: this.useMockData,
            networkStatus: this.networkStatus.isOnline ? 'Online' : 'Offline',
            cachedEntities: Object.keys(this.cache).length,
            lastSuccessfulRequest: this.networkStatus.lastSuccessfulRequest 
                ? new Date(this.networkStatus.lastSuccessfulRequest).toISOString() 
                : 'Never',
            failedRequests: this.networkStatus.failedRequests,
            consecutiveFailures: this.networkStatus.consecutiveFailures,
            uptime: this._formatTimespan(Date.now() - this.analytics.startTime)
        };
    }
}

// Create a singleton instance
window.sportsDataService = window.sportsDataService || new SportsDataService();

// Export the service instance
export default window.sportsDataService;

// Make the class globally available
window.SportsDataService = SportsDataService;