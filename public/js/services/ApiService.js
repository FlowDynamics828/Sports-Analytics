/**
 * ApiService - Enterprise-grade API communications layer
 * Handles all API requests with consistent error handling, retries, and caching
 */
class ApiService {
  /**
   * Initialize the API service
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    this.config = Object.assign({
      baseUrl: '/api',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000,        // 30 seconds default timeout
      retryCount: 3,         // Number of retries for failed requests
      retryDelay: 1000,      // Base delay between retries (ms)
      useCache: true,        // Whether to use caching
      cacheTTL: 5 * 60 * 1000, // 5 minutes cache TTL
      debugMode: false,      // Enable debug logging
      onUnauthorized: null,  // Callback for 401 responses
      onError: null,         // Global error callback
      withCredentials: true  // Send cookies with cross-origin requests
    }, config);
    
    // Initialize cache if enabled
    this.cache = this.config.useCache ? new Map() : null;
    
    // Authentication state
    this.authToken = null;
    
    // Request aborts registry (for cleanup)
    this.abortControllers = new Map();
    
    // Performance metrics
    this.metrics = {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      retryCount: 0,
      cacheHitCount: 0,
      averageResponseTime: 0
    };
    
    this.debug('ApiService initialized with config:', this.config);
  }
  
  /**
   * Set the authentication token
   * @param {string} token - JWT or other auth token
   */
  setAuthToken(token) {
    this.authToken = token;
    this.debug('Auth token updated');
  }
  
  /**
   * Clear the authentication token
   */
  clearAuthToken() {
    this.authToken = null;
    this.debug('Auth token cleared');
  }
  
  /**
   * Clear all cached data
   */
  clearCache() {
    if (this.cache) {
      this.cache.clear();
      this.debug('Cache cleared');
    }
  }
  
  /**
   * Cancel all pending requests
   */
  cancelAllRequests() {
    this.abortControllers.forEach((controller, id) => {
      controller.abort();
      this.debug(`Request ${id} aborted`);
    });
    this.abortControllers.clear();
  }
  
  /**
   * Make an HTTP request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint (will be joined with baseUrl)
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Response data
   */
  async request(method, endpoint, options = {}) {
    const requestId = `${method}-${endpoint}-${Date.now()}`;
    const startTime = performance.now();
    this.metrics.requestCount++;
    
    // Process options
    const {
      data = null,
      params = null,
      headers = {},
      timeout = this.config.timeout,
      retries = this.config.retryCount,
      skipCache = false,
      cacheTTL = this.config.cacheTTL,
      signal = null
    } = options;
    
    // Create URL with query parameters
    let url = `${this.config.baseUrl}${endpoint}`;
    
    if (params) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          queryParams.append(key, value);
        }
      });
      
      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    
    // Create cache key
    const cacheKey = `${method}-${url}-${JSON.stringify(data || {})}`;
    
    // Check cache for GET requests
    if (this.cache && method === 'GET' && !skipCache) {
      const cachedResponse = this.cache.get(cacheKey);
      if (cachedResponse && cachedResponse.expiry > Date.now()) {
        this.debug(`Cache hit for ${url}`);
        this.metrics.cacheHitCount++;
        return cachedResponse.data;
      }
    }
    
    // Set up request
    const requestOptions = {
      method,
      headers: { ...this.config.headers, ...headers },
      credentials: this.config.withCredentials ? 'include' : 'same-origin'
    };
    
    // Add auth token if available
    if (this.authToken) {
      requestOptions.headers.Authorization = `Bearer ${this.authToken}`;
    }
    
    // Add request body for non-GET requests
    if (data && method !== 'GET') {
      requestOptions.body = JSON.stringify(data);
    }
    
    // Set up abort controller for timeout
    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);
    
    // Use provided signal or create our own
    const abortSignal = signal || controller.signal;
    requestOptions.signal = abortSignal;
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.debug(`Request to ${url} timed out after ${timeout}ms`);
    }, timeout);
    
    // Execute request with retries
    let attempts = 0;
    let lastError;
    
    while (attempts <= retries) {
      try {
        this.debug(`Request to ${url} (attempt ${attempts + 1}/${retries + 1})`);
        
        const response = await fetch(url, requestOptions);
        clearTimeout(timeoutId);
        
        // Handle response
        if (!response.ok) {
          // Handle specific status codes
          if (response.status === 401 && this.config.onUnauthorized) {
            this.config.onUnauthorized();
          }
          
          const errorData = await this.parseResponse(response);
          throw new ApiError(
            errorData.message || `API request failed with status ${response.status}`,
            response.status,
            errorData
          );
        }
        
        // Parse successful response
        const responseData = await this.parseResponse(response);
        
        // Cache successful GET responses
        if (this.cache && method === 'GET' && !skipCache) {
          this.cache.set(cacheKey, {
            data: responseData,
            expiry: Date.now() + cacheTTL
          });
          this.debug(`Cached response for ${url} (TTL: ${cacheTTL}ms)`);
        }
        
        // Update metrics
        this.metrics.successCount++;
        this.updateResponseTimeMetric(startTime);
        
        // Clean up
        this.abortControllers.delete(requestId);
        
        return responseData;
        
      } catch (error) {
        lastError = error;
        
        // Don't retry if request was aborted
        if (error.name === 'AbortError') {
          this.debug(`Request to ${url} was aborted`);
          break;
        }
        
        // Don't retry certain status codes
        if (error instanceof ApiError) {
          const nonRetryableCodes = [400, 401, 403, 404, 422];
          if (nonRetryableCodes.includes(error.status)) {
            this.debug(`Not retrying ${url} due to status code ${error.status}`);
            break;
          }
        }
        
        attempts++;
        this.metrics.retryCount++;
        
        if (attempts <= retries) {
          // Exponential backoff with jitter
          const delay = Math.min(
            1000 * Math.pow(2, attempts - 1) + Math.random() * 1000,
            30000 // Cap at 30 seconds
          );
          this.debug(`Retrying ${url} in ${delay}ms (attempt ${attempts}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Clean up
    clearTimeout(timeoutId);
    this.abortControllers.delete(requestId);
    
    // Update metrics
    this.metrics.errorCount++;
    this.updateResponseTimeMetric(startTime);
    
    // Handle final error
    if (this.config.onError) {
      this.config.onError(lastError);
    }
    
    throw lastError;
  }
  
  /**
   * Parse response according to content type
   * @param {Response} response - Fetch Response object
   * @returns {Promise<Object>} - Parsed response
   */
  async parseResponse(response) {
    const contentType = response.headers.get('Content-Type') || '';
    
    if (contentType.includes('application/json')) {
      return response.json();
    }
    
    if (contentType.includes('text/')) {
      return { text: await response.text() };
    }
    
    return { raw: response };
  }
  
  /**
   * Update the average response time metric
   * @param {number} startTime - Start time of the request
   */
  updateResponseTimeMetric(startTime) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    
    // Exponential moving average
    this.metrics.averageResponseTime = 
      this.metrics.averageResponseTime * 0.9 + responseTime * 0.1;
  }
  
  /**
   * Log debug messages
   * @param  {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.config.debugMode) {
      console.log('[ApiService]', ...args);
    }
  }
  
  /**
   * GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Response data
   */
  get(endpoint, options = {}) {
    return this.request('GET', endpoint, options);
  }
  
  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Response data
   */
  post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, { ...options, data });
  }
  
  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Response data
   */
  put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, { ...options, data });
  }
  
  /**
   * PATCH request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Response data
   */
  patch(endpoint, data, options = {}) {
    return this.request('PATCH', endpoint, { ...options, data });
  }
  
  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} - Response data
   */
  delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, options);
  }
  
  /**
   * Get performance metrics
   * @returns {Object} - Performance metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * Custom API Error class
 */
class ApiError extends Error {
  /**
   * Create a new API error
   * @param {string} message - Error message
   * @param {number} status - HTTP status code
   * @param {Object} data - Error data from response
   */
  constructor(message, status, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApiService, ApiError };
} 