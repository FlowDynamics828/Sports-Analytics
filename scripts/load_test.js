/**
 * load_test.js
 * 
 * Enterprise-grade load testing utility for the sports analytics prediction API.
 * Simulates concurrent user traffic with detailed performance metrics and reporting.
 */
const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const EventEmitter = require('events');
require('dotenv').config();

class LoadTester extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.apiUrl = options.apiUrl || process.env.API_URL || 'http://localhost:3000/api/predict';
    this.apiKey = options.apiKey || process.env.TEST_API_KEY;
    this.jwtToken = options.jwtToken || process.env.TEST_JWT_TOKEN;
    this.outputDir = options.outputDir || path.join(__dirname, '../load_test_results');
    
    // Test parameters (defaults)
    this.concurrentUsers = options.concurrentUsers || 100;
    this.requestsPerUser = options.requestsPerUser || 5;
    this.rampUpPeriod = options.rampUpPeriod || 10; // seconds
    this.testDuration = options.testDuration || 60; // seconds
    this.targetRPS = options.targetRPS || null; // target requests per second, null means no limit
    this.userDistribution = options.userDistribution || 'fixed'; // 'fixed', 'ramp', or 'spike'
    this.throttleRequests = options.throttleRequests || false;
    
    // Test data
    this.testFactors = options.testFactors || [
      ["Chiefs win", "Mahomes throws for 300+ yards"],
      ["Lakers cover the spread", "LeBron scores 30+ points", "Game total over 220"],
      ["Yankees win", "Aaron Judge hits a home run", "Game has over 7 runs"],
      ["Man City win", "Haaland scores", "Over 2.5 goals"],
      ["Djokovic wins in straight sets", "Match has over 20 games"]
    ];
    
    // Test league distribution
    this.leagues = options.leagues || ['NFL', 'NBA', 'MLB', 'EPL', 'TENNIS', 'NHL', 'UFC', 'F1'];
    
    // Test paths
    this.testPaths = options.testPaths || [
      { path: '/api/predict/single', weight: 70 },
      { path: '/api/predict/multi', weight: 30 }
    ];
    
    // Test results
    this.results = {
      timestamp: new Date().toISOString(),
      config: {
        concurrentUsers: this.concurrentUsers,
        requestsPerUser: this.requestsPerUser,
        rampUpPeriod: this.rampUpPeriod,
        testDuration: this.testDuration,
        targetRPS: this.targetRPS,
        userDistribution: this.userDistribution,
        throttleRequests: this.throttleRequests
      },
      summary: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        startTime: null,
        endTime: null,
        totalDurationSec: 0,
        requestsPerSecond: 0,
        avgResponseTimeMs: 0,
        p50ResponseTimeMs: 0,
        p90ResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
        p99ResponseTimeMs: 0,
        minResponseTimeMs: 0,
        maxResponseTimeMs: 0
      },
      errors: {},
      responseTimes: [],
      responseCodeDistribution: {},
      responseTimeByPath: {},
      throughputBySecond: {}
    };
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    // Request control
    this.activeRequestCount = 0;
    this.completedRequestCount = 0;
    this.rateLimiter = {
      lastRequestTime: 0,
      minDelay: this.targetRPS ? (1000 / this.targetRPS) : 0
    };
    
    // Execution tracking
    this.isRunning = false;
    this.startTime = null;
    this.endTime = null;
    this.aborted = false;
  }
  
  /**
   * Start the load test
   * @returns {Promise<Object>} Test results
   */
  async runTest() {
    if (this.isRunning) {
      throw new Error('Test is already running');
    }
    
    this.isRunning = true;
    this.startTime = performance.now();
    this.results.summary.startTime = new Date().toISOString();
    
    logger.info(`Starting load test with ${this.concurrentUsers} concurrent users, ${this.requestsPerUser} requests per user`);
    logger.info(`Total target requests: ${this.concurrentUsers * this.requestsPerUser}`);
    logger.info(`User distribution: ${this.userDistribution}, ramp-up period: ${this.rampUpPeriod}s, test duration: ${this.testDuration}s`);
    
    // Performance monitoring
    const monitoringIntervalId = setInterval(() => {
      this.emitStatus();
    }, 1000);
    
    // Set timeout for test duration
    const testTimeoutId = setTimeout(() => {
      logger.info('Test duration reached, stopping test');
      this.aborted = true;
    }, this.testDuration * 1000);
    
    try {
      // Generate users according to distribution
      const userGenerationPromise = this.generateUsers();
      
      // Wait for all requests to finish or test to be aborted
      await userGenerationPromise;
      
      while (this.activeRequestCount > 0 && !this.aborted) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.endTime = performance.now();
      this.results.summary.endTime = new Date().toISOString();
      
      // Calculate final metrics
      this.calculateMetrics();
      
      // Save results
      const resultsFile = this.saveResults();
      
      logger.info(`Load test completed in ${((this.endTime - this.startTime) / 1000).toFixed(2)} seconds`);
      logger.info(`Results saved to ${resultsFile}`);
      
      return {
        success: true,
        summary: this.results.summary,
        resultsFile
      };
    } catch (error) {
      logger.error(`Load test failed: ${error.message}`);
      throw error;
    } finally {
      clearInterval(monitoringIntervalId);
      clearTimeout(testTimeoutId);
      this.isRunning = false;
      this.emit('testCompleted', this.results);
    }
  }
  
  /**
   * Generate users according to selected distribution
   */
  async generateUsers() {
    const intervalMs = (this.rampUpPeriod * 1000) / this.concurrentUsers;
    
    switch (this.userDistribution) {
      case 'ramp':
        // Gradually ramp up users
        for (let i = 0; i < this.concurrentUsers && !this.aborted; i++) {
          this.spawnUser(i);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        break;
        
      case 'spike':
        // Spike pattern - 20% initially, then 60% in the middle, then remaining 20%
        const firstBatch = Math.floor(this.concurrentUsers * 0.2);
        const secondBatch = Math.floor(this.concurrentUsers * 0.6);
        const thirdBatch = this.concurrentUsers - firstBatch - secondBatch;
        
        // First 20% of users
        for (let i = 0; i < firstBatch && !this.aborted; i++) {
          this.spawnUser(i);
        }
        
        await new Promise(resolve => setTimeout(resolve, this.rampUpPeriod * 1000 * 0.4));
        
        // Middle 60% of users (spike)
        for (let i = 0; i < secondBatch && !this.aborted; i++) {
          this.spawnUser(firstBatch + i);
        }
        
        await new Promise(resolve => setTimeout(resolve, this.rampUpPeriod * 1000 * 0.4));
        
        // Final 20% of users
        for (let i = 0; i < thirdBatch && !this.aborted; i++) {
          this.spawnUser(firstBatch + secondBatch + i);
        }
        break;
        
      case 'fixed':
      default:
        // All users at once
        for (let i = 0; i < this.concurrentUsers && !this.aborted; i++) {
          this.spawnUser(i);
        }
    }
  }
  
  /**
   * Spawn a virtual user that makes requests
   * @param {number} userId User identifier
   */
  async spawnUser(userId) {
    for (let i = 0; i < this.requestsPerUser && !this.aborted; i++) {
      // If we're throttling, honor the rate limit
      if (this.throttleRequests && this.targetRPS) {
        const now = Date.now();
        const timeSinceLastRequest = now - this.rateLimiter.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimiter.minDelay) {
          const delayMs = this.rateLimiter.minDelay - timeSinceLastRequest;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        this.rateLimiter.lastRequestTime = Date.now();
      }
      
      // Randomly select test path based on weights
      const selectedPath = this.selectRandomPath();
      
      // Make the request
      this.makeRequest(userId, i, selectedPath).catch(error => {
        logger.error(`Error in request: ${error.message}`);
      });
      
      // Small random delay between requests from the same user
      const userDelay = Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, userDelay));
    }
  }
  
  /**
   * Select a random API path based on configured weights
   * @returns {string} Selected path
   */
  selectRandomPath() {
    // Calculate total weight
    const totalWeight = this.testPaths.reduce((sum, path) => sum + path.weight, 0);
    
    // Generate random value
    const random = Math.random() * totalWeight;
    
    // Find the path that corresponds to the random value
    let cumulativeWeight = 0;
    for (const pathConfig of this.testPaths) {
      cumulativeWeight += pathConfig.weight;
      if (random < cumulativeWeight) {
        return pathConfig.path;
      }
    }
    
    // Fallback to first path
    return this.testPaths[0].path;
  }
  
  /**
   * Make a single API request
   * @param {number} userId User identifier
   * @param {number} requestId Request identifier
   * @param {string} path API path to request
   */
  async makeRequest(userId, requestId, path) {
    this.activeRequestCount++;
    
    const currentSecond = Math.floor((performance.now() - this.startTime) / 1000);
    if (!this.results.throughputBySecond[currentSecond]) {
      this.results.throughputBySecond[currentSecond] = {
        sent: 0,
        received: 0,
        failed: 0
      };
    }
    this.results.throughputBySecond[currentSecond].sent++;
    
    const requestStartTime = performance.now();
    
    try {
      // Select random test factors
      const factors = this.selectRandomFactors();
      const league = this.leagues[Math.floor(Math.random() * this.leagues.length)];
      
      // Prepare request based on path
      let requestData;
      if (path.includes('/multi')) {
        requestData = {
          factors: factors,
          league: league,
          includeAnalysis: false
        };
      } else {
        requestData = {
          factor: factors[0],
          league: league,
          include_supporting_data: false
        };
      }
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Add authentication
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }
      
      if (this.jwtToken) {
        headers['Authorization'] = `Bearer ${this.jwtToken}`;
      }
      
      // Make the request
      const response = await axios({
        method: 'post',
        url: `${this.apiUrl}${path}`,
        data: requestData,
        headers,
        timeout: 30000, // 30 second timeout
        validateStatus: () => true // Don't throw on any status code
      });
      
      // Calculate response time
      const responseTime = performance.now() - requestStartTime;
      
      // Update throughput stats
      const completionSecond = Math.floor((performance.now() - this.startTime) / 1000);
      if (!this.results.throughputBySecond[completionSecond]) {
        this.results.throughputBySecond[completionSecond] = {
          sent: 0,
          received: 0,
          failed: 0
        };
      }
      
      // Track response time
      this.results.responseTimes.push(responseTime);
      
      // Track response by path
      if (!this.results.responseTimeByPath[path]) {
        this.results.responseTimeByPath[path] = [];
      }
      this.results.responseTimeByPath[path].push(responseTime);
      
      // Track response code distribution
      const statusCode = response.status.toString();
      this.results.responseCodeDistribution[statusCode] = 
        (this.results.responseCodeDistribution[statusCode] || 0) + 1;
      
      // Check if request was successful
      if (response.status >= 200 && response.status < 300) {
        this.results.summary.successfulRequests++;
        this.results.throughputBySecond[completionSecond].received++;
      } else {
        this.results.summary.failedRequests++;
        this.results.throughputBySecond[completionSecond].failed++;
        
        // Track error details
        const errorKey = `${response.status}: ${response.statusText || 'Unknown'}`;
        this.results.errors[errorKey] = (this.results.errors[errorKey] || 0) + 1;
      }
    } catch (error) {
      // Handle request errors
      const responseTime = performance.now() - requestStartTime;
      this.results.responseTimes.push(responseTime);
      this.results.summary.failedRequests++;
      
      // Track error by type
      const errorKey = error.code || error.message || 'Unknown Error';
      this.results.errors[errorKey] = (this.results.errors[errorKey] || 0) + 1;
      
      // Update throughput stats for error
      const completionSecond = Math.floor((performance.now() - this.startTime) / 1000);
      if (!this.results.throughputBySecond[completionSecond]) {
        this.results.throughputBySecond[completionSecond] = {
          sent: 0,
          received: 0,
          failed: 0
        };
      }
      this.results.throughputBySecond[completionSecond].failed++;
    } finally {
      this.activeRequestCount--;
      this.completedRequestCount++;
      
      // Update total request count
      this.results.summary.totalRequests = this.completedRequestCount;
    }
  }
  
  /**
   * Select random factors for testing
   * @returns {Array} Selected factors
   */
  selectRandomFactors() {
    // Select a random set of factors
    const factorSet = this.testFactors[Math.floor(Math.random() * this.testFactors.length)];
    
    // Determine how many factors to use (1-5)
    const maxFactors = Math.min(5, factorSet.length);
    const factorCount = 1 + Math.floor(Math.random() * maxFactors);
    
    // Return subset
    return factorSet.slice(0, factorCount);
  }
  
  /**
   * Calculate final metrics from test results
   */
  calculateMetrics() {
    const results = this.results;
    
    // Calculate test duration
    results.summary.totalDurationSec = (this.endTime - this.startTime) / 1000;
    
    // Calculate requests per second
    results.summary.requestsPerSecond = results.summary.totalRequests / results.summary.totalDurationSec;
    
    // Calculate response time statistics
    if (results.responseTimes.length > 0) {
      results.responseTimes.sort((a, b) => a - b);
      
      results.summary.minResponseTimeMs = results.responseTimes[0];
      results.summary.maxResponseTimeMs = results.responseTimes[results.responseTimes.length - 1];
      
      results.summary.avgResponseTimeMs = results.responseTimes.reduce((sum, time) => sum + time, 0) / 
        results.responseTimes.length;
      
      results.summary.p50ResponseTimeMs = this.calculatePercentile(results.responseTimes, 50);
      results.summary.p90ResponseTimeMs = this.calculatePercentile(results.responseTimes, 90);
      results.summary.p95ResponseTimeMs = this.calculatePercentile(results.responseTimes, 95);
      results.summary.p99ResponseTimeMs = this.calculatePercentile(results.responseTimes, 99);
    }
    
    // Calculate per-path metrics
    for (const [path, times] of Object.entries(results.responseTimeByPath)) {
      if (times.length > 0) {
        times.sort((a, b) => a - b);
        
        results.responseTimeByPath[path] = {
          count: times.length,
          avg: times.reduce((sum, time) => sum + time, 0) / times.length,
          min: times[0],
          max: times[times.length - 1],
          p50: this.calculatePercentile(times, 50),
          p90: this.calculatePercentile(times, 90),
          p95: this.calculatePercentile(times, 95)
        };
      }
    }
    
    // Error rate
    results.summary.errorRate = results.summary.failedRequests / results.summary.totalRequests;
  }
  
  /**
   * Calculate percentile value from sorted array
   * @param {Array} sortedArray Sorted array of values
   * @param {number} percentile Percentile to calculate (0-100)
   * @returns {number} Percentile value
   */
  calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile / 100) - 1;
    return sortedArray[index];
  }
  
  /**
   * Save test results to file
   * @returns {string} Path to saved results file
   */
  saveResults() {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `load_test_${timestamp}.json`;
    const filePath = path.join(this.outputDir, filename);
    
    fs.writeFileSync(
      filePath,
      JSON.stringify(this.results, null, 2)
    );
    
    return filePath;
  }
  
  /**
   * Emit current test status
   */
  emitStatus() {
    if (!this.isRunning) return;
    
    const currentTime = performance.now();
    const elapsedSec = (currentTime - this.startTime) / 1000;
    const completedRequests = this.completedRequestCount;
    const activeRequests = this.activeRequestCount;
    const totalRequests = this.concurrentUsers * this.requestsPerUser;
    const progress = completedRequests / totalRequests;
    const currentRps = completedRequests / elapsedSec;
    
    const status = {
      elapsedTime: elapsedSec.toFixed(2),
      progress: (progress * 100).toFixed(1),
      completedRequests,
      activeRequests,
      totalRequests,
      currentRps: currentRps.toFixed(2)
    };
    
    this.emit('status', status);
    
    // Log status every 5 seconds
    if (Math.floor(elapsedSec) % 5 === 0) {
      logger.info(`Progress: ${status.progress}%, ${completedRequests}/${totalRequests} requests, RPS: ${status.currentRps}`);
    }
  }
  
  /**
   * Generate a human-readable report from test results
   * @returns {string} Formatted report
   */
  generateReport() {
    const results = this.results;
    const report = [];
    
    report.push('# Load Test Report');
    report.push(`Generated: ${new Date().toISOString()}\n`);
    
    report.push('## Test Configuration');
    report.push(`- Concurrent Users: ${results.config.concurrentUsers}`);
    report.push(`- Requests Per User: ${results.config.requestsPerUser}`);
    report.push(`- User Distribution: ${results.config.userDistribution}`);
    report.push(`- Ramp-up Period: ${results.config.rampUpPeriod} seconds`);
    report.push(`- Test Duration: ${results.config.testDuration} seconds`);
    report.push(`- API URL: ${this.apiUrl}`);
    
    report.push('\n## Test Results');
    report.push(`- Total Requests: ${results.summary.totalRequests}`);
    report.push(`- Successful Requests: ${results.summary.successfulRequests}`);
    report.push(`- Failed Requests: ${results.summary.failedRequests}`);
    report.push(`- Error Rate: ${(results.summary.errorRate * 100).toFixed(2)}%`);
    report.push(`- Test Duration: ${results.summary.totalDurationSec.toFixed(2)} seconds`);
    report.push(`- Requests Per Second: ${results.summary.requestsPerSecond.toFixed(2)}`);
    
    report.push('\n## Response Time (ms)');
    report.push(`- Average: ${results.summary.avgResponseTimeMs.toFixed(2)}`);
    report.push(`- Minimum: ${results.summary.minResponseTimeMs.toFixed(2)}`);
    report.push(`- Maximum: ${results.summary.maxResponseTimeMs.toFixed(2)}`);
    report.push(`- Median (P50): ${results.summary.p50ResponseTimeMs.toFixed(2)}`);
    report.push(`- P90: ${results.summary.p90ResponseTimeMs.toFixed(2)}`);
    report.push(`- P95: ${results.summary.p95ResponseTimeMs.toFixed(2)}`);
    report.push(`- P99: ${results.summary.p99ResponseTimeMs.toFixed(2)}`);
    
    report.push('\n## Response Codes');
    for (const [code, count] of Object.entries(results.responseCodeDistribution).sort()) {
      const percentage = (count / results.summary.totalRequests * 100).toFixed(2);
      report.push(`- ${code}: ${count} (${percentage}%)`);
    }
    
    if (Object.keys(results.errors).length > 0) {
      report.push('\n## Errors');
      for (const [error, count] of Object.entries(results.errors).sort((a, b) => b[1] - a[1])) {
        const percentage = (count / results.summary.totalRequests * 100).toFixed(2);
        report.push(`- ${error}: ${count} (${percentage}%)`);
      }
    }
    
    report.push('\n## Performance by Endpoint');
    for (const [path, stats] of Object.entries(results.responseTimeByPath)) {
      report.push(`\n### ${path}`);
      report.push(`- Requests: ${stats.count}`);
      report.push(`- Average Response Time: ${stats.avg.toFixed(2)} ms`);
      report.push(`- Min/Max: ${stats.min.toFixed(2)}/${stats.max.toFixed(2)} ms`);
      report.push(`- P50/P90/P95: ${stats.p50.toFixed(2)}/${stats.p90.toFixed(2)}/${stats.p95.toFixed(2)} ms`);
    }
    
    return report.join('\n');
  }
}

// Export the load tester
module.exports = LoadTester;

// Run load test if called directly
if (require.main === module) {
  const tester = new LoadTester({
    concurrentUsers: process.env.LOAD_TEST_USERS ? parseInt(process.env.LOAD_TEST_USERS) : 50,
    requestsPerUser: process.env.LOAD_TEST_REQUESTS_PER_USER ? parseInt(process.env.LOAD_TEST_REQUESTS_PER_USER) : 10
  });
  
  // Log status updates
  tester.on('status', (status) => {
    // Already being logged by the emitStatus method
  });
  
  // Run the test
  tester.runTest()
    .then(results => {
      logger.info(`Load test completed successfully with ${results.summary.requestsPerSecond.toFixed(2)} requests/sec`);
      
      // Generate and save report
      const report = tester.generateReport();
      const reportPath = path.join(tester.outputDir, 'load_test_report.md');
      fs.writeFileSync(reportPath, report);
      
      logger.info(`Report saved to ${reportPath}`);
      process.exit(0);
    })
    .catch(err => {
      logger.error(`Load test failed: ${err.message}`);
      process.exit(1);
    });
} 