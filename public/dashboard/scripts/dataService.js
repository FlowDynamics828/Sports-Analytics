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
        
        // Retry logic
        if (retries > 0) {
            console.warn(`Retrying API request to ${endpoint}, ${retries} retries left`);
            return fetchAPI(endpoint, {
                ...fetchOptions,
                retries: retries - 1
            });
        }
        
        // Re-throw error if no retries left
        throw error;
    }
}

// API endpoints
const api = {
    // Get league data
    async getLeague(leagueId) {
        return fetchAPI(`/api/leagues/${leagueId}`, { useCache: true });
    },
    
    // Get games for a league
    async getGames(leagueId, teamId = null, limit = null) {
        let endpoint = `/api/games/${leagueId}`;
        if (teamId) {
            endpoint += `/${teamId}`;
        }
        if (limit) {
            endpoint += `?limit=${limit}`;
        }
        return fetchAPI(endpoint, { useCache: true });
    },
    
    // Get user profile
    async getProfile() {
        return fetchAPI('/api/user/profile', { useCache: false });
    },
    
    // Check API health
    async checkHealth() {
        return fetchAPI('/api/health', { 
            useCache: false,
            timeout: 3000,
            retries: 0
        });
    },
    
    // Clear cache
    clearCache() {
        cache.clear();
    }
};

// Export the API
window.dataService = api;// dataService.js - Optimized data service for dashboard
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
        
        // Retry logic
        if (retries > 0) {
            console.warn(`Retrying API request to ${endpoint}, ${retries} retries left`);
            return fetchAPI(endpoint, {
                ...fetchOptions,
                retries: retries - 1
            });
        }
        
        // Re-throw error if no retries left
        throw error;
    }
}

// API endpoints
const api = {
    // Get league data
    async getLeague(leagueId) {
        return fetchAPI(`/api/leagues/${leagueId}`, { useCache: true });
    },
    
    // Get games for a league
    async getGames(leagueId, teamId = null, limit = null) {
        let endpoint = `/api/games/${leagueId}`;
        if (teamId) {
            endpoint += `/${teamId}`;
        }
        if (limit) {
            endpoint += `?limit=${limit}`;
        }
        return fetchAPI(endpoint, { useCache: true });
    },
    
    // Get user profile
    async getProfile() {
        return fetchAPI('/api/user/profile', { useCache: false });
    },
    
    // Check API health
    async checkHealth() {
        return fetchAPI('/api/health', { 
            useCache: false,
            timeout: 3000,
            retries: 0
        });
    },
    
    // Clear cache
    clearCache() {
        cache.clear();
    }
};

// Export the API
window.dataService = api;class DataService {
    static async fetchStats(league, team = '') {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/stats/${league}${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch stats');
            return await response.json();
        } catch (error) {
            console.error('Error fetching stats:', error);
            throw error;
        }
    }

    static async fetchGames(league, team = '') {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/games/${league}${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch games');
            return await response.json();
        } catch (error) {
            console.error('Error fetching games:', error);
            throw error;
        }
    }

    static async fetchTeams(league) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/leagues/${league}/teams`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch teams');
            return await response.json();
        } catch (error) {
            console.error('Error fetching teams:', error);
            throw error;
        }
    }
}

window.DataService = DataService;