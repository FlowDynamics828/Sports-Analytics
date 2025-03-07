// sports-analytics/public/dashboard/scripts/security/CacheManager.js
const CacheService = require('../cache'); 

class CacheManager {
    constructor() {
        this.cache = CacheService;
    }

    // League-specific caching methods
    setLeagueData(league, data) {
        return this.cache.setLeagueData(league, data);
    }

    getLeagueData(league) {
        return this.cache.getLeagueData(league);
    }

    // Prediction caching methods
    setPrediction(gameId, prediction) {
        return this.cache.setPrediction(gameId, prediction);
    }

    getPrediction(gameId) {
        return this.cache.getPrediction(gameId);
    }

    // Stats caching methods
    setStats(league, teamId, stats) {
        return this.cache.setStats(league, teamId, stats);
    }

    getStats(league, teamId) {
        return this.cache.getStats(league, teamId);
    }

    // Generic cache methods
    get(key) {
        return this.cache.get(key);
    }

    set(key, value, ttl) {
        return this.cache.set(key, value, ttl);
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        return this.cache.clear();
    }
}

// Export the class instead of an instance
module.exports = CacheManager;