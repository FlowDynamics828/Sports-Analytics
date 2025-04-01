// dataService.js - Optimized data service for dashboard
'use strict';

// Cache for API responses
const cache = {
    data: new Map(),
    maxAge: 60000, // 1 minute cache lifetime
    
    // Get cached data if available and not expired
    get(key) {
        if (!this.data.has(key)) return null;
        
        const cachedItem = this.data.get(key);
        const now = Date.now();
        
        if (now - cachedItem.timestamp > this.maxAge) {
            // Cache expired
            this.data.delete(key);
            return null;
        }
        
        return cachedItem.data;
    },
    
    // Store data in cache
    set(key, data) {
        this.data.set(key, {
            data,
            timestamp: Date.now()
        });
        
        // Clean up old cache entries if we have too many
        if (this.data.size > 50) {
            this.cleanup();
        }
    },
    
    // Clean up expired cache entries
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.data.entries()) {
            if (now - value.timestamp > this.maxAge) {
                this.data.delete(key);
            }
        }
    },
    
    // Clear all cache
    clear() {
        this.data.clear();
    }
};

// API request with caching, retries and timeouts
async function fetchAPI(endpoint, options = {}) {
    // Check cache first if caching is enabled
    if (options.useCache !== false) {
        const cachedData = cache.get(endpoint);
        if (cachedData) {
            console.log(`Using cached data for ${endpoint}`);
            return cachedData;
        }
    }
    
    // Default options
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            'Content-Type': 'application/json'
        },
        timeout: 10000, // 10 second timeout
        retries: 1
    };
    
    // Merge options
    const fetchOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };
    
    // Extract non-fetch options
    const { timeout, retries, useCache, ...actualFetchOptions } = fetchOptions;
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        // Add signal to options
        actualFetchOptions.signal = controller.signal;
        
        console.log(`Fetching data from ${endpoint}...`);
        
        // Make the request
        const response = await fetch(endpoint, actualFetchOptions);
        
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Handle response
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        // Parse JSON response
        const data = await response.json();
        
        // Cache successful response if caching is enabled
        if (useCache !== false) {
            cache.set(endpoint, data);
        }
        
        return data;
    } catch (error) {
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Handle abort error
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        
        // Handle other errors
        if (retries > 0) {
            console.log(`Retrying request to ${endpoint} (${retries} attempts left)`);
            return fetchAPI(endpoint, {
                ...options,
                retries: retries - 1
            });
        }
        
        throw error;
    }
}

// Data service API
const dataService = {
    // Leagues
    async getLeagues() {
        try {
            const result = await fetchAPI('/api/leagues');
            return result.data || [];
        } catch (error) {
            console.error('Failed to fetch leagues:', error);
            return this.getFallbackLeagues();
        }
    },
    
    // Teams for a league
    async getTeams(leagueId) {
        try {
            const result = await fetchAPI(`/api/leagues/${leagueId}/teams`);
            return result.data || [];
        } catch (error) {
            console.error(`Failed to fetch teams for league ${leagueId}:`, error);
            return this.fetchFromDatabase('teams', { league: leagueId.toUpperCase() }) || [];
        }
    },
    
    // Players for a team
    async getPlayers(leagueId, teamId) {
        try {
            const result = await fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/players`);
            return result.data || [];
        } catch (error) {
            console.error(`Failed to fetch players for team ${teamId}:`, error);
            return this.fetchFromDatabase('players', { teamId: teamId }) || [];
        }
    },
    
    // Games for a team
    async getGames(leagueId, teamId) {
        try {
            const result = await fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/games`);
            return result.data || [];
        } catch (error) {
            console.error(`Failed to fetch games for team ${teamId}:`, error);
            return this.fetchFromDatabase('games', { 
                $or: [
                    { homeTeamId: teamId },
                    { awayTeamId: teamId }
                ]
            }) || [];
        }
    },
    
    // Stats for a team
    async getTeamStats(leagueId, teamId) {
        try {
            const result = await fetchAPI(`/api/stats/team/${teamId}/advanced?league=${leagueId}`);
            return result.data || {};
        } catch (error) {
            console.error(`Failed to fetch stats for team ${teamId}:`, error);
            return {};
        }
    },
    
    // Recent games across leagues
    async getRecentGames(limit = 5) {
        try {
            const result = await fetchAPI(`/api/games/recent?limit=${limit}`);
            return result.data || [];
        } catch (error) {
            console.error('Failed to fetch recent games:', error);
            return this.fetchFromDatabase('games', {}, { gameDate: -1 }, limit) || [];
        }
    },
    
    // Upcoming games
    async getUpcomingGames(limit = 5) {
        try {
            const result = await fetchAPI(`/api/games/upcoming?limit=${limit}`);
            return result.data || [];
        } catch (error) {
            console.error('Failed to fetch upcoming games:', error);
            return [];
        }
    },
    
    // Live games
    async getLiveGames() {
        try {
            const result = await fetchAPI('/api/games/live');
            return result.data || [];
        } catch (error) {
            console.error('Failed to fetch live games:', error);
            return [];
        }
    },
    
    // Direct database fetch as fallback if needed
    async fetchFromDatabase(collection, query = {}, sort = {}, limit = 50) {
        try {
            console.log(`Attempting direct database fallback for ${collection}`);
            // Note: This is a fallback mechanism and shouldn't be used regularly
            // In a production environment, this would need more security measures
            const result = await fetchAPI(`/api/admin/db/query`, {
                method: 'POST',
                body: JSON.stringify({
                    collection,
                    query,
                    sort,
                    limit
                })
            });
            return result.data || [];
        } catch (error) {
            console.error(`Database fallback failed for ${collection}:`, error);
            return null;
        }
    },
    
    // Get fallback leagues if API fails
    getFallbackLeagues() {
        return [
            {
                id: 'nfl',
                name: 'NFL',
                displayName: 'National Football League',
                iconPath: '/assets/icons/leagues/nfl.svg',
                available: true
            },
            {
                id: 'nba',
                name: 'NBA',
                displayName: 'National Basketball Association',
                iconPath: '/assets/icons/leagues/nba.svg',
                available: true
            },
            {
                id: 'mlb',
                name: 'MLB',
                displayName: 'Major League Baseball',
                iconPath: '/assets/icons/leagues/mlb.svg',
                available: true
            },
            {
                id: 'nhl',
                name: 'NHL',
                displayName: 'National Hockey League',
                iconPath: '/assets/icons/leagues/nhl.svg',
                available: true
            },
            {
                id: 'premierleague',
                name: 'Premier League',
                displayName: 'English Premier League',
                iconPath: '/assets/icons/leagues/premierleague.svg',
                available: true
            },
            {
                id: 'laliga',
                name: 'La Liga',
                displayName: 'La Liga Santander',
                iconPath: '/assets/icons/leagues/laliga.svg',
                available: true
            },
            {
                id: 'bundesliga',
                name: 'Bundesliga',
                displayName: 'Bundesliga',
                iconPath: '/assets/icons/leagues/bundesliga.svg',
                available: true
            },
            {
                id: 'seriea',
                name: 'Serie A',
                displayName: 'Serie A',
                iconPath: '/assets/icons/leagues/seriea.svg',
                available: true
            }
        ];
    },
    
    // Clear all cache
    clearCache() {
        cache.clear();
        console.log('Data service cache cleared');
    }
};

// Export for use in modules
window.dataService = dataService;