/**
 * Logger utility for application logging
 */
class LoggerClass {
    constructor() {
        this.logLevel = 'info'; // default log level
        this.levels = {
            debug: 0,
            info: 1, 
            warn: 2,
            error: 3
        };
    }

    /**
     * Set the logging level
     * @param {string} level - The logging level (debug, info, warn, error)
     */
    setLevel(level) {
        if (this.levels[level] !== undefined) {
            this.logLevel = level;
            console.log(`Log level set to: ${level}`);
        } else {
            console.error(`Invalid log level: ${level}`);
        }
    }

    /**
     * Check if a message should be logged based on current log level
     * @param {string} level - The level to check
     * @returns {boolean} Whether the message should be logged
     */
    shouldLog(level) {
        return this.levels[level] >= this.levels[this.logLevel];
    }

    /**
     * Log a debug message
     * @param {string} message - The message to log
     * @param {Object} data - Optional data to include
     */
    debug(message, data) {
        if (this.shouldLog('debug')) {
            if (data) {
                console.debug(`[DEBUG] ${message}`, data);
            } else {
                console.debug(`[DEBUG] ${message}`);
            }
        }
    }

    /**
     * Log an info message
     * @param {string} message - The message to log
     * @param {Object} data - Optional data to include
     */
    info(message, data) {
        if (this.shouldLog('info')) {
            if (data) {
                console.info(`[INFO] ${message}`, data);
            } else {
                console.info(`[INFO] ${message}`);
            }
        }
    }

    /**
     * Log a warning message
     * @param {string} message - The message to log
     * @param {Object} data - Optional data to include
     */
    warn(message, data) {
        if (this.shouldLog('warn')) {
            if (data) {
                console.warn(`[WARN] ${message}`, data);
            } else {
                console.warn(`[WARN] ${message}`);
            }
        }
    }

    /**
     * Log an error message
     * @param {string} message - The message to log
     * @param {Object} data - Optional data to include
     */
    error(message, data) {
        if (this.shouldLog('error')) {
            if (data) {
                console.error(`[ERROR] ${message}`, data);
            } else {
                console.error(`[ERROR] ${message}`);
            }
        }
    }

    /**
     * Log a message at any level
     * @param {string} level - The log level
     * @param {string} message - The message to log
     * @param {Object} data - Optional data to include
     */
    log(level, message, data) {
        switch (level) {
            case 'debug':
                this.debug(message, data);
                break;
            case 'info':
                this.info(message, data);
                break;
            case 'warn':
                this.warn(message, data);
                break;
            case 'error':
                this.error(message, data);
                break;
            default:
                console.log(`[${level.toUpperCase()}] ${message}`, data || '');
        }
    }
}

// Export singleton instance
export const Logger = new LoggerClass(); 