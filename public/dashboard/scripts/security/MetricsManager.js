// public/dashboard/scripts/security/MetricsManager.js
class MetricsManager {
    constructor() {
        this.metrics = new Map();
    }

    incrementMetric(metricName, value = 1) {
        const currentValue = this.metrics.get(metricName) || 0;
        this.metrics.set(metricName, currentValue + value);
    }

    setMetric(metricName, value) {
        this.metrics.set(metricName, value);
    }

    getMetric(metricName) {
        return this.metrics.get(metricName) || 0;
    }

    getAllMetrics() {
        return Object.fromEntries(this.metrics);
    }

    resetMetric(metricName) {
        this.metrics.delete(metricName);
    }

    resetAllMetrics() {
        this.metrics.clear();
    }
}

// Export the class instead of an instance
module.exports = MetricsManager;