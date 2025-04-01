/**
 * Sports Analytics Pro - API Status Monitoring
 * Provides real-time monitoring of API connections and fallback behavior
 */

class ApiStatusMonitor {
    constructor() {
        this.apiUrls = {
            backendApi: window.ENV?.API_ENDPOINTS?.BACKEND_URL || 'http://localhost:5050/api',
            sportsDbApi: window.ENV?.API_ENDPOINTS?.THESPORTSDB_URL || 'https://www.thesportsdb.com/api/v1/json'
        };
        
        this.statusElements = {
            statusIndicator: document.getElementById('api-status'),
            errorMessage: document.getElementById('api-error'),
            statusDot: document.querySelector('#api-status .status-dot'),
            statusText: document.querySelector('#api-status .status-text')
        };
        
        this.checkInterval = 60000; // Check every minute
        this.connectionStatus = {
            backendApi: false,
            sportsDbApi: false,
            lastChecked: null
        };
        
        // Initialize
        this.init();
    }
    
    async init() {
        // Initial check
        await this.checkAllConnections();
        
        // Set up interval for periodic checks
        setInterval(() => this.checkAllConnections(), this.checkInterval);
        
        // Set up event listeners for online/offline status
        window.addEventListener('online', () => {
            console.log('Browser reports online status');
            this.checkAllConnections();
        });
        
        window.addEventListener('offline', () => {
            console.log('Browser reports offline status');
            this.updateUiStatus(false, 'Network connection lost. Using cached data.');
        });
    }
    
    async checkAllConnections() {
        try {
            // Check backend API
            const backendStatus = await this.checkApiConnection(this.apiUrls.backendApi + '/health');
            this.connectionStatus.backendApi = backendStatus;
            
            // Check SportsDB API (using a simple endpoint)
            const sportsDbStatus = await this.checkApiConnection(
                `${this.apiUrls.sportsDbApi}/${window.ENV?.THESPORTSDB_API_KEY || '3'}/all_leagues.php`
            );
            this.connectionStatus.sportsDbApi = sportsDbStatus;
            
            // Update timestamp
            this.connectionStatus.lastChecked = new Date();
            
            // Update UI based on overall status
            const overallStatus = this.connectionStatus.backendApi || this.connectionStatus.sportsDbApi;
            const statusMessage = this.getStatusMessage();
            
            this.updateUiStatus(overallStatus, statusMessage);
            
            return overallStatus;
        } catch (error) {
            console.error('Error checking API connections:', error);
            this.updateUiStatus(false, 'Error checking API status. Using cached data.');
            return false;
        }
    }
    
    async checkApiConnection(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            console.warn(`API connection check failed for ${url}:`, error);
            return false;
        }
    }
    
    getStatusMessage() {
        if (this.connectionStatus.backendApi && this.connectionStatus.sportsDbApi) {
            return 'Connected to all data sources';
        } else if (this.connectionStatus.backendApi) {
            return 'Connected to backend API only';
        } else if (this.connectionStatus.sportsDbApi) {
            return 'Connected to sports data API only';
        } else {
            return 'No API connections available. Using cached data.';
        }
    }
    
    updateUiStatus(isConnected, message) {
        const { statusIndicator, errorMessage, statusDot, statusText } = this.statusElements;
        
        if (!statusDot || !statusText) return;
        
        if (isConnected) {
            statusDot.style.backgroundColor = 'var(--success)';
            statusText.style.color = 'var(--success)';
            statusText.textContent = message || 'Connected to live data source';
            
            if (errorMessage) {
                errorMessage.style.display = 'none';
            }
        } else {
            statusDot.style.backgroundColor = 'var(--error)';
            statusText.style.color = 'var(--error)';
            statusText.textContent = 'Using offline mode - Cached data only';
            
            if (errorMessage) {
                errorMessage.style.display = 'block';
                const errorMessageText = errorMessage.querySelector('.error-message');
                if (errorMessageText) {
                    errorMessageText.textContent = message || 'Unable to connect to API. Using cached data.';
                }
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.apiStatusMonitor = new ApiStatusMonitor();
}); 