/**
 * Data Service
 * Handles all API calls for the dashboard with proper error handling and caching
 */

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const cache = new Map();

/**
 * Get data from cache or fetch it from API
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch data if not in cache
 * @returns {Promise<any>} Resolved data
 */
async function getCachedOrFetch(key, fetchFn) {
    const now = Date.now();
    const cachedData = cache.get(key);
    
    // If we have cached data and it's still valid, return it
    if (cachedData && (now - cachedData.timestamp < CACHE_TTL)) {
        console.log(`Using cached data for ${key}`);
        return cachedData.data;
    }
    
    // Otherwise fetch fresh data
    try {
        console.log(`Fetching fresh data for ${key}`);
        const data = await fetchFn();
        
        // Cache the result
        cache.set(key, {
            data,
            timestamp: now
        });
        
        return data;
    } catch (error) {
        console.error(`Error fetching data for ${key}:`, error);
        
        // If we have stale cached data, return it as fallback
        if (cachedData) {
            console.warn(`Using stale cached data for ${key} due to fetch error`);
            return cachedData.data;
        }
        
        // Otherwise rethrow the error
        throw error;
    }
}

/**
 * Clear the cache
 */
function clearCache() {
    cache.clear();
    console.log('Data cache cleared');
}

/**
 * Get teams for a specific league
 * @param {string} league - League ID
 * @returns {Promise<Array>} Array of team objects
 */
async function getTeams(league) {
    const cacheKey = `teams:${league}`;
    
    return getCachedOrFetch(cacheKey, async () => {
        try {
            // Try primary endpoint
            const response = await fetch(`/api/leagues/${league}/teams`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // Try fallback endpoint
                console.log(`Primary endpoint failed for ${league} teams, trying fallback...`);
                const fallbackResponse = await fetch(`/api/teams?league=${league}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!fallbackResponse.ok) {
                    throw new Error(`Failed to fetch teams: ${response.status}`);
                }
                
                const fallbackData = await fallbackResponse.json();
                return Array.isArray(fallbackData.data) ? fallbackData.data :
                       Array.isArray(fallbackData) ? fallbackData : [];
            }
            
            const data = await response.json();
            return Array.isArray(data.data) ? data.data : 
                   Array.isArray(data) ? data : [];
        } catch (error) {
            console.error(`Error fetching teams for ${league}:`, error);
            showToast('error', `Failed to load teams for ${league}. Please try again.`);
            return [];
        }
    });
}

/**
 * Get players for a specific team
 * @param {string} teamId - Team ID
 * @param {string} league - League ID
 * @returns {Promise<Array>} Array of player objects
 */
async function getPlayers(teamId, league) {
    if (!teamId || !league) {
        return [];
    }
    
    const cacheKey = `players:${league}:${teamId}`;
    
    return getCachedOrFetch(cacheKey, async () => {
        try {
            // Show loading indicator
            showLoadingIndicator(true);
            
            // Try primary endpoint
            const response = await fetch(`/api/leagues/${league}/teams/${teamId}/players`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // Try fallback endpoints
                console.log(`Primary endpoint failed for team ${teamId} players, trying fallback 1...`);
                
                // First fallback: /api/players?teamId=X&league=Y
                const fallback1Response = await fetch(`/api/players?teamId=${teamId}&league=${league}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!fallback1Response.ok) {
                    console.log(`Fallback 1 failed for team ${teamId} players, trying fallback 2...`);
                    
                    // Second fallback: /api/teams/X/players
                    const fallback2Response = await fetch(`/api/teams/${teamId}/players`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!fallback2Response.ok) {
                        throw new Error(`Failed to fetch players: ${response.status}`);
                    }
                    
                    const fallback2Data = await fallback2Response.json();
                    return Array.isArray(fallback2Data.data) ? fallback2Data.data :
                           Array.isArray(fallback2Data) ? fallback2Data : [];
                }
                
                const fallback1Data = await fallback1Response.json();
                return Array.isArray(fallback1Data.data) ? fallback1Data.data :
                       Array.isArray(fallback1Data) ? fallback1Data : [];
            }
            
            const data = await response.json();
            return Array.isArray(data.data) ? data.data : 
                   Array.isArray(data) ? data : [];
        } catch (error) {
            console.error(`Error fetching players for team ${teamId}:`, error);
            showToast('error', `Failed to load players for team. Please try again.`);
            return [];
        } finally {
            // Hide loading indicator
            showLoadingIndicator(false);
        }
    });
}

/**
 * Get detailed player stats
 * @param {string} playerId - Player ID
 * @param {string} league - League ID
 * @returns {Promise<Object>} Player stats object
 */
async function getPlayerStats(playerId, league) {
    if (!playerId) {
        return null;
    }
    
    const cacheKey = `playerStats:${league}:${playerId}`;
    
    return getCachedOrFetch(cacheKey, async () => {
        try {
            // Show loading indicator
            showLoadingIndicator(true);
            
            // Try primary endpoint
            const response = await fetch(`/api/leagues/${league}/players/${playerId}/stats`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // Try fallback endpoint
                console.log(`Primary endpoint failed for player ${playerId} stats, trying fallback...`);
                const fallbackResponse = await fetch(`/api/players/${playerId}/stats?league=${league}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!fallbackResponse.ok) {
                    throw new Error(`Failed to fetch player stats: ${response.status}`);
                }
                
                return await fallbackResponse.json();
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error fetching stats for player ${playerId}:`, error);
            showToast('error', `Failed to load player statistics. Please try again.`);
            return null;
        } finally {
            // Hide loading indicator
            showLoadingIndicator(false);
        }
    });
}

/**
 * Show or hide loading indicator
 * @param {boolean} show - Whether to show or hide the indicator
 */
function showLoadingIndicator(show) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        if (show) {
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }
}

/**
 * Show a toast notification
 * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
 * @param {string} message - Message to display
 */
function showToast(type, message) {
    // Check if toast module is available
    if (window.toast && typeof window.toast[type] === 'function') {
        window.toast[type](message);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
}

// Export the service methods
window.dataService = {
    getTeams,
    getPlayers,
    getPlayerStats,
    clearCache
}; 