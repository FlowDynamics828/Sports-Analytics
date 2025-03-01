const winston = require('winston');

class LogManager {
    constructor(options = {}) {
        this.logger = winston.createLogger({
            level: options.level || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
                new winston.transports.File({ 
                    filename: 'error.log', 
                    level: 'error' 
                }),
                new winston.transports.File({ 
                    filename: 'combined.log' 
                })
            ]
        });
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Add method for cleanup during shutdown
    cleanup() {
        return new Promise((resolve) => {
            // Close all transports
            this.logger.close();
            resolve();
        });
    }
}

// Export the class itself, not an instance
module.exports = { LogManager };