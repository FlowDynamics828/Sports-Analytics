/**
 * API Client for Sports Analytics Platform
 * Handles all API requests with authentication, error handling, and retries
 */

import { 
  API_CLIENT_CONFIG, 
  API_CONFIG, 
  API_KEY_HEADER, 
  getStoredToken, 
  removeAuthToken 
} from './apiConfig.js';

class ApiClient {
  constructor(config = API_CLIENT_CONFIG) {
    this.config = config;
    this.maxRetries = 2;
    this.retryDelay = 1000;
    this.offline = {
      enabled: false,
      queue: []
    };
  }

  /**
   * Initialize the API client
   */
  initialize() {
    // Set up offline detection
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._handleOnline.bind(this));
      window.addEventListener('offline', this._handleOffline.bind(this));
      this.offline.enabled = !navigator.onLine;
    }
    
    console.log('API Client initialized');
    return this;
  }

  /**
   * Make an API request
   */
  async request(endpoint, options = {}) {
    const { method = 'GET', data = null, headers = {}, retry = true } = options;
    
    // Check offline status
    if (this.offline.enabled && retry) {
      console.log('Device is offline, queueing request');
      this._queueOfflineRequest(endpoint, options);
      throw new Error('Device is offline');
    }
    
    // Set up request options
    const reqOptions = {
      method,
      headers: this._createHeaders(headers),
      credentials: 'include'
    };
    
    // Add body data if needed
    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      reqOptions.body = JSON.stringify(data);
    }
    
    // Track retries
    let retries = 0;
    
    while (true) {
      try {
        const response = await fetch(endpoint, reqOptions);
        
        // Handle unauthorized responses
        if (response.status === 401) {
          removeAuthToken();
          throw new Error('Unauthorized access');
        }
        
        // Check if response is OK
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `API Error: ${response.status}`);
        }
        
        // Parse and return response
        const responseData = await response.json();
        return responseData;
      } catch (error) {
        // Check if we should retry
        if (retry && retries < this.maxRetries && this._isRetryableError(error)) {
          retries++;
          console.log(`Retrying request (${retries}/${this.maxRetries})...`);
          await this._delay(this.retryDelay * retries);
          continue;
        }
        
        // If we've exhausted retries or shouldn't retry, rethrow
        throw error;
      }
    }
  }
  
  /**
   * Make a GET request
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }
  
  /**
   * Make a POST request
   */
  async post(endpoint, data = null, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', data });
  }
  
  /**
   * Make a PUT request
   */
  async put(endpoint, data = null, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', data });
  }
  
  /**
   * Make a PATCH request
   */
  async patch(endpoint, data = null, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', data });
  }
  
  /**
   * Make a DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
  
  /**
   * Create headers for request
   */
  _createHeaders(additionalHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...additionalHeaders
    };
    
    // Add authentication token if available
    const token = getStoredToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add API key if specified in environment (for development and testing)
    const apiKey = process.env.API_KEY;
    if (apiKey) {
      headers[API_KEY_HEADER] = apiKey;
    }
    
    return headers;
  }
  
  /**
   * Check if an error is retryable
   */
  _isRetryableError(error) {
    // Network errors are retryable
    if (error.name === 'TypeError' && error.message.includes('Network')) {
      return true;
    }
    
    // Timeout errors are retryable
    if (error.name === 'TimeoutError') {
      return true;
    }
    
    // 5xx errors are retryable
    if (error.message && error.message.includes('API Error: 5')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Queue a request for when online
   */
  _queueOfflineRequest(endpoint, options) {
    this.offline.queue.push({ endpoint, options, timestamp: Date.now() });
    
    // Save to IndexedDB if available
    if (typeof window !== 'undefined' && window.indexedDB) {
      this._saveQueueToIndexedDB();
    }
  }
  
  /**
   * Save the offline queue to IndexedDB
   */
  async _saveQueueToIndexedDB() {
    try {
      const db = await this._getIndexedDB();
      const tx = db.transaction('requests', 'readwrite');
      const store = tx.objectStore('requests');
      
      // Clear current requests
      await store.clear();
      
      // Add all pending requests
      for (const request of this.offline.queue) {
        await store.add(request);
      }
      
      console.log(`Saved ${this.offline.queue.length} offline requests to IndexedDB`);
    } catch (error) {
      console.error('Error saving offline queue:', error);
    }
  }
  
  /**
   * Load the offline queue from IndexedDB
   */
  async _loadQueueFromIndexedDB() {
    try {
      const db = await this._getIndexedDB();
      const tx = db.transaction('requests', 'readonly');
      const store = tx.objectStore('requests');
      const requests = await store.getAll();
      
      this.offline.queue = requests;
      console.log(`Loaded ${requests.length} offline requests from IndexedDB`);
    } catch (error) {
      console.error('Error loading offline queue:', error);
    }
  }
  
  /**
   * Get IndexedDB instance
   */
  _getIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open('sports_analytics_offline', 1);
      
      request.onerror = () => reject(new Error('Could not open IndexedDB'));
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('requests')) {
          db.createObjectStore('requests', { keyPath: 'timestamp' });
        }
      };
      
      request.onsuccess = (event) => resolve(event.target.result);
    });
  }
  
  /**
   * Handle coming back online
   */
  async _handleOnline() {
    console.log('Device is back online');
    this.offline.enabled = false;
    
    // Process offline queue
    await this._processOfflineQueue();
  }
  
  /**
   * Handle going offline
   */
  _handleOffline() {
    console.log('Device is offline');
    this.offline.enabled = true;
  }
  
  /**
   * Process the offline request queue
   */
  async _processOfflineQueue() {
    if (!this.offline.queue.length) {
      await this._loadQueueFromIndexedDB();
    }
    
    console.log(`Processing ${this.offline.queue.length} offline requests`);
    
    const requests = [...this.offline.queue];
    this.offline.queue = [];
    
    for (const req of requests) {
      try {
        console.log(`Processing offline request to ${req.endpoint}`);
        await this.request(req.endpoint, req.options);
      } catch (error) {
        console.error('Error processing offline request:', error);
        // Re-queue with exponential backoff if it's a retryable error
        if (this._isRetryableError(error)) {
          this._queueOfflineRequest(req.endpoint, req.options);
        }
      }
    }
    
    // Update IndexedDB
    await this._saveQueueToIndexedDB();
  }
  
  /**
   * Simple delay promise
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create and initialize singleton instance
const apiClient = new ApiClient().initialize();

// Export client
export { ApiClient, apiClient }; 