// public/dashboard/scripts/security/LogManager.js
class LogManager {
    constructor() {
        this.logs = [];
    }

    log(level, message, metadata = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            metadata
        };
        
        this.logs.push(logEntry);
        console[level](message, metadata);
    }

    info(message, metadata) {
        this.log('info', message, metadata);
    }

    warn(message, metadata) {
        this.log('warn', message, metadata);
    }

    error(message, metadata) {
        this.log('error', message, metadata);
    }

    getLogs() {
        return this.logs;
    }

    clearLogs() {
        this.logs = [];
    }
}

// Export the class instead of an instance
module.exports = LogManager;