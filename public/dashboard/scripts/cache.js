// Cache Service for Sports Analytics Dashboard
class CacheService {
    constructor(ttl = 300000) { // 5 minutes default TTL
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    setTTL(ttl) {
        this.ttl = ttl;
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    // Special methods for our specific data types
    setLeagueData(league, data) {
        return this.set(`league:${league}`, data);
    }

    getLeagueData(league) {
        return this.get(`league:${league}`);
    }

    setStats(league, teamId, stats) {
        return this.set(`stats:${league}:${teamId || ''}`, stats);
    }

    getStats(league, teamId) {
        return this.get(`stats:${league}:${teamId || ''}`);
    }

    setGames(league, teamId, games) {
        return this.set(`games:${league}:${teamId || ''}`, games);
    }

    getGames(league, teamId) {
        return this.get(`games:${league}:${teamId || ''}`);
    }

    setPrediction(predictionId, prediction) {
        return this.set(`prediction:${predictionId}`, prediction);
    }

    getPrediction(predictionId) {
        return this.get(`prediction:${predictionId}`);
    }

    // Helper method to clean expired items
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now - item.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }

    // Get all keys
    keys() {
        return Array.from(this.cache.keys());
    }

    // Get size
    size() {
        return this.cache.size;
    }
}

// Export a singleton instance
const Cache = new CacheService();
export default Cache;