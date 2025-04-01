/**
 * Kernel Correlator for Non-Linear Relationship Detection
 * 
 * Advanced kernel-based methods for detecting non-linear correlations
 * between prediction factors using RBF kernels and HSIC algorithm
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const math = require('mathjs');
const logger = require('../../utils/logger');

class KernelCorrelator {
  /**
   * Initialize kernel correlator for non-linear correlation detection
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Kernel configuration
    this.kernelType = config.kernelType || 'rbf';
    this.gamma = config.gamma || 0.1; // RBF kernel parameter
    this.regularization = config.regularization || 0.01;
    
    // Performance optimization
    this.cachingEnabled = config.cachingEnabled !== false;
    this.kernelMatrixCache = new Map();
    this.cacheMaxSize = config.cacheMaxSize || 100;
    
    // Testing configuration
    this.bootstrapSamples = config.bootstrapSamples || 1000;
    this.significanceLevel = config.significanceLevel || 0.05;
    
    // Metrics tracking
    this.computeCount = 0;
    this.cacheHits = 0;
    this.totalComputeTimeMs = 0;
    
    // Bind methods
    this.calculateKernelMatrix = this.calculateKernelMatrix.bind(this);
    this.calculateHSIC = this.calculateHSIC.bind(this);
    this.testIndependence = this.testIndependence.bind(this);
    this.calculateNonLinearCorrelation = this.calculateNonLinearCorrelation.bind(this);
  }

  /**
   * Calculate kernel matrix for a dataset
   * @param {Array<Array<number>>} data Data points (each row is a sample)
   * @param {Object} options Optional kernel parameters
   * @returns {Array<Array<number>>} Kernel matrix
   */
  calculateKernelMatrix(data, options = {}) {
    const startTime = Date.now();
    this.computeCount++;
    
    try {
      // Check cache first if enabled
      const cacheKey = this.getCacheKey(data, options);
      if (this.cachingEnabled && this.kernelMatrixCache.has(cacheKey)) {
        this.cacheHits++;
        return this.kernelMatrixCache.get(cacheKey);
      }
      
      // Extract parameters
      const kernelType = options.type || this.kernelType;
      const gamma = options.gamma || this.gamma;
      const n = data.length;
      
      // Initialize kernel matrix
      const K = math.zeros(n, n)._data;
      
      // Compute kernel matrix based on selected kernel type
      switch (kernelType.toLowerCase()) {
        case 'rbf': {
          // Radial Basis Function (Gaussian) kernel: K(x,y) = exp(-gamma * ||x-y||²)
          for (let i = 0; i < n; i++) {
            K[i][i] = 1.0; // Diagonal elements are 1 for RBF kernel
            
            for (let j = i + 1; j < n; j++) {
              const xi = data[i];
              const xj = data[j];
              
              // Calculate squared Euclidean distance
              let squaredDist = 0;
              for (let k = 0; k < xi.length; k++) {
                squaredDist += Math.pow(xi[k] - xj[k], 2);
              }
              
              // Compute kernel value
              const kernelValue = Math.exp(-gamma * squaredDist);
              
              // Kernel matrix is symmetric
              K[i][j] = kernelValue;
              K[j][i] = kernelValue;
            }
          }
          break;
        }
        
        case 'linear': {
          // Linear kernel: K(x,y) = x⋅y
          for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
              const xi = data[i];
              const xj = data[j];
              
              // Calculate dot product
              let dotProduct = 0;
              for (let k = 0; k < xi.length; k++) {
                dotProduct += xi[k] * xj[k];
              }
              
              // Kernel matrix is symmetric
              K[i][j] = dotProduct;
              K[j][i] = dotProduct;
            }
          }
          break;
        }
        
        case 'polynomial': {
          // Polynomial kernel: K(x,y) = (scale * x⋅y + offset)^degree
          const degree = options.degree || 3;
          const scale = options.scale || 1;
          const offset = options.offset || 1;
          
          for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
              const xi = data[i];
              const xj = data[j];
              
              // Calculate dot product
              let dotProduct = 0;
              for (let k = 0; k < xi.length; k++) {
                dotProduct += xi[k] * xj[k];
              }
              
              // Compute kernel value
              const kernelValue = Math.pow(scale * dotProduct + offset, degree);
              
              // Kernel matrix is symmetric
              K[i][j] = kernelValue;
              K[j][i] = kernelValue;
            }
          }
          break;
        }
        
        default:
          throw new Error(`Unsupported kernel type: ${kernelType}`);
      }
      
      // Apply regularization if specified (add to diagonal)
      if (this.regularization > 0) {
        for (let i = 0; i < n; i++) {
          K[i][i] += this.regularization;
        }
      }
      
      // Cache the result if enabled
      if (this.cachingEnabled) {
        this.kernelMatrixCache.set(cacheKey, K);
        
        // Clean up cache if it gets too large
        if (this.kernelMatrixCache.size > this.cacheMaxSize) {
          const keys = Array.from(this.kernelMatrixCache.keys());
          const keyToDelete = keys[0]; // Remove oldest entry
          this.kernelMatrixCache.delete(keyToDelete);
        }
      }
      
      // Update timing metrics
      this.totalComputeTimeMs += (Date.now() - startTime);
      
      return K;
    } catch (error) {
      logger.error(`KernelCorrelator: Error calculating kernel matrix: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a cache key for kernel matrix computation
   * @param {Array<Array<number>>} data Data points
   * @param {Object} options Kernel options
   * @returns {string} Cache key
   * @private
   */
  getCacheKey(data, options) {
    const dataHash = JSON.stringify(data).length.toString(16);
    const optionsHash = JSON.stringify(options);
    return `${dataHash}-${optionsHash}`;
  }

  /**
   * Calculate HSIC (Hilbert-Schmidt Independence Criterion)
   * for measuring dependence between random variables
   * @param {Array<Array<number>>} kernelMatrix Kernel matrix
   * @param {number} n Sample size (optional, inferred from matrix if not provided)
   * @returns {number} HSIC value
   */
  calculateHSIC(kernelMatrix, n = null) {
    try {
      // If sample size not provided, infer from kernel matrix
      if (n === null) {
        n = kernelMatrix.length;
      }
      
      // Create centering matrix: H = I - 1/n * 1_n 1_n^T
      const H = math.identity(n)._data;
      const factor = 1 / n;
      
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          H[i][j] -= factor;
        }
      }
      
      // Calculate HSIC: 1/(n-1)^2 * trace(KHKH)
      // Where K is the kernel matrix and H is the centering matrix
      
      // Calculate HK
      const HK = math.multiply(H, kernelMatrix);
      
      // Calculate HKH
      const HKH = math.multiply(HK, H);
      
      // Calculate trace(HKH·K)
      let trace = 0;
      const HKHK = math.multiply(HKH, kernelMatrix);
      for (let i = 0; i < n; i++) {
        trace += HKHK[i][i];
      }
      
      // Normalize by sample size
      const normalizationFactor = 1 / Math.pow(n - 1, 2);
      return normalizationFactor * trace;
    } catch (error) {
      logger.error(`KernelCorrelator: Error calculating HSIC: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test for independence between variables using kernel methods
   * @param {Array<Array<number>>} kernelMatrix Kernel matrix
   * @param {number} sampleSize Number of samples used to create kernel matrix
   * @param {Object} options Testing options
   * @returns {Object} Test results including p-value
   */
  testIndependence(kernelMatrix, sampleSize, options = {}) {
    try {
      // Calculate observed HSIC statistic
      const observedHSIC = this.calculateHSIC(kernelMatrix, sampleSize);
      
      // Configure bootstrap test
      const numBootstraps = options.bootstrapSamples || this.bootstrapSamples;
      const alpha = options.significanceLevel || this.significanceLevel;
      
      // Perform bootstrap permutation test
      const bootstrapStats = [];
      const n = kernelMatrix.length;
      
      for (let b = 0; b < numBootstraps; b++) {
        // Generate random permutation
        const permutation = this.generatePermutation(n);
        
        // Permute the kernel matrix
        const permutedMatrix = this.permuteMatrix(kernelMatrix, permutation);
        
        // Calculate HSIC on permuted data
        const permutedHSIC = this.calculateHSIC(permutedMatrix, n);
        bootstrapStats.push(permutedHSIC);
      }
      
      // Sort bootstrap statistics
      bootstrapStats.sort((a, b) => a - b);
      
      // Calculate p-value: proportion of bootstrap values >= observed statistic
      let exceedCount = 0;
      for (const stat of bootstrapStats) {
        if (stat >= observedHSIC) {
          exceedCount++;
        }
      }
      
      const pValue = exceedCount / numBootstraps;
      
      // Calculate critical value at significance level alpha
      const criticalIdx = Math.floor(numBootstraps * (1 - alpha));
      const criticalValue = bootstrapStats[criticalIdx];
      
      return {
        hsic: observedHSIC,
        pValue,
        criticalValue,
        isIndependent: pValue > alpha,
        numBootstraps
      };
    } catch (error) {
      logger.error(`KernelCorrelator: Error testing independence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a random permutation of indices
   * @param {number} n Size of permutation
   * @returns {Array<number>} Permuted indices
   * @private
   */
  generatePermutation(n) {
    // Initialize array of indices
    const indices = Array.from({ length: n }, (_, i) => i);
    
    // Fisher-Yates shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    return indices;
  }

  /**
   * Permute kernel matrix based on provided permutation
   * @param {Array<Array<number>>} matrix Original matrix
   * @param {Array<number>} permutation Permutation indices
   * @returns {Array<Array<number>>} Permuted matrix
   * @private
   */
  permuteMatrix(matrix, permutation) {
    const n = matrix.length;
    const permuted = math.zeros(n, n)._data;
    
    // Apply permutation to rows and columns
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        permuted[i][j] = matrix[permutation[i]][permutation[j]];
      }
    }
    
    return permuted;
  }

  /**
   * Calculate non-linear correlation between two variables
   * @param {Array<number>} x First variable
   * @param {Array<number>} y Second variable
   * @param {Object} options Optional parameters
   * @returns {Object} Non-linear correlation results
   */
  calculateNonLinearCorrelation(x, y, options = {}) {
    try {
      // Check input dimensions
      if (x.length !== y.length) {
        throw new Error('Input arrays must have the same length');
      }
      
      const n = x.length;
      
      // Calculate linear (Pearson) correlation for comparison
      const pearsonCorrelation = this.calculatePearsonCorrelation(x, y);
      
      // Format data for kernel calculations
      const data = [];
      for (let i = 0; i < n; i++) {
        data.push([x[i], y[i]]);
      }
      
      // Calculate individual kernel matrices for X and Y
      const xData = x.map(val => [val]);
      const yData = y.map(val => [val]);
      
      const kernelX = this.calculateKernelMatrix(xData, options);
      const kernelY = this.calculateKernelMatrix(yData, options);
      
      // Calculate HSIC for assessing dependence
      const hsicX = this.calculateHSIC(kernelX, n);
      const hsicY = this.calculateHSIC(kernelY, n);
      const hsicXY = this.calculateHSIC(math.multiply(kernelX, kernelY), n);
      
      // Normalize HSIC to [0, 1] range (like correlation coefficient)
      const normalizedHSIC = hsicXY / Math.sqrt(hsicX * hsicY);
      
      // Calculate HSIC-based correlation that maintains sign from Pearson
      const signedHSIC = Math.sign(pearsonCorrelation.coefficient) * normalizedHSIC;
      
      // Test for independence using permutation test
      const independenceTest = this.testIndependence(math.multiply(kernelX, kernelY), n, options);
      
      // Calculate non-linearity score as difference between kernel and linear correlation
      const nonLinearityScore = Math.abs(signedHSIC - pearsonCorrelation.coefficient);
      
      return {
        linearCorrelation: pearsonCorrelation.coefficient,
        nonLinearCorrelation: signedHSIC,
        nonLinearityScore,
        hsic: independenceTest.hsic,
        pValue: independenceTest.pValue,
        isIndependent: independenceTest.isIndependent,
        confidence: 1 - independenceTest.pValue,
        kernelType: options.type || this.kernelType,
        gamma: options.gamma || this.gamma
      };
    } catch (error) {
      logger.error(`KernelCorrelator: Error calculating non-linear correlation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate Pearson correlation coefficient
   * @param {Array<number>} x First array
   * @param {Array<number>} y Second array
   * @returns {Object} Correlation coefficient and confidence
   * @private
   */
  calculatePearsonCorrelation(x, y) {
    try {
      if (x.length !== y.length) {
        throw new Error('Arrays must have the same length');
      }
      
      if (x.length === 0) {
        return { coefficient: 0, confidence: 0 };
      }
      
      // Calculate means
      const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;
      const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;
      
      // Calculate covariance and variances
      let covariance = 0;
      let varianceX = 0;
      let varianceY = 0;
      
      for (let i = 0; i < x.length; i++) {
        const diffX = x[i] - meanX;
        const diffY = y[i] - meanY;
        
        covariance += diffX * diffY;
        varianceX += diffX * diffX;
        varianceY += diffY * diffY;
      }
      
      // Avoid division by zero
      if (varianceX === 0 || varianceY === 0) {
        return { coefficient: 0, confidence: 0.1 };
      }
      
      // Calculate correlation coefficient
      const correlation = covariance / Math.sqrt(varianceX * varianceY);
      
      // Calculate confidence based on sample size
      const confidence = Math.min(0.9, x.length / 200);
      
      return { coefficient: correlation, confidence };
    } catch (error) {
      logger.error(`KernelCorrelator: Error calculating Pearson correlation: ${error.message}`);
      return { coefficient: 0, confidence: 0 };
    }
  }

  /**
   * Calculate Distance Correlation (another measure of dependence)
   * @param {Array<number>} x First variable
   * @param {Array<number>} y Second variable
   * @returns {number} Distance correlation
   */
  calculateDistanceCorrelation(x, y) {
    try {
      if (x.length !== y.length) {
        throw new Error('Arrays must have the same length');
      }
      
      const n = x.length;
      
      // Calculate distance matrices
      const distX = math.zeros(n, n)._data;
      const distY = math.zeros(n, n)._data;
      
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          distX[i][j] = Math.abs(x[i] - x[j]);
          distX[j][i] = distX[i][j];
          
          distY[i][j] = Math.abs(y[i] - y[j]);
          distY[j][i] = distY[i][j];
        }
      }
      
      // Double-center the distance matrices
      const HX = this.doubleCenter(distX);
      const HY = this.doubleCenter(distY);
      
      // Calculate squared distance covariance
      let distCov = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          distCov += HX[i][j] * HY[i][j];
        }
      }
      distCov /= Math.pow(n, 2);
      
      // Calculate squared distance variances
      let distVarX = 0;
      let distVarY = 0;
      
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          distVarX += HX[i][j] * HX[i][j];
          distVarY += HY[i][j] * HY[i][j];
        }
      }
      
      distVarX /= Math.pow(n, 2);
      distVarY /= Math.pow(n, 2);
      
      // Avoid division by zero
      if (distVarX <= 0 || distVarY <= 0) {
        return 0;
      }
      
      // Calculate distance correlation
      return Math.sqrt(distCov / Math.sqrt(distVarX * distVarY));
    } catch (error) {
      logger.error(`KernelCorrelator: Error calculating distance correlation: ${error.message}`);
      return 0;
    }
  }

  /**
   * Double-center a matrix (used for distance correlation)
   * @param {Array<Array<number>>} matrix Input matrix
   * @returns {Array<Array<number>>} Double-centered matrix
   * @private
   */
  doubleCenter(matrix) {
    const n = matrix.length;
    const centered = math.zeros(n, n)._data;
    
    // Calculate row and column means
    const rowMeans = new Array(n).fill(0);
    const colMeans = new Array(n).fill(0);
    let totalMean = 0;
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        rowMeans[i] += matrix[i][j] / n;
        colMeans[j] += matrix[i][j] / n;
        totalMean += matrix[i][j];
      }
    }
    totalMean /= (n * n);
    
    // Double-center the matrix
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centered[i][j] = matrix[i][j] - rowMeans[i] - colMeans[j] + totalMean;
      }
    }
    
    return centered;
  }

  /**
   * Detect the most appropriate kernel parameters for given data
   * @param {Array<Array<number>>} data Data points
   * @param {Object} options Options for parameter selection
   * @returns {Object} Optimal kernel parameters
   */
  detectOptimalParameters(data, options = {}) {
    try {
      // Extract variables
      const x = data.map(d => d[0]);
      const y = data.map(d => d[1]);
      
      // Prepare potential gamma values for RBF kernel
      const numCandidates = options.numCandidates || 10;
      const gammaCandidates = [];
      
      // Calculate median distance between points
      const distances = [];
      for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
          const xi = data[i];
          const xj = data[j];
          
          let squaredDist = 0;
          for (let k = 0; k < xi.length; k++) {
            squaredDist += Math.pow(xi[k] - xj[k], 2);
          }
          
          distances.push(Math.sqrt(squaredDist));
        }
      }
      
      // Sort distances and get median
      distances.sort((a, b) => a - b);
      const medianDistance = distances[Math.floor(distances.length / 2)];
      
      // Generate candidate gamma values around 1/(median distance)
      const baseGamma = 1 / (medianDistance * medianDistance);
      for (let i = -5; i <= 5; i++) {
        gammaCandidates.push(baseGamma * Math.pow(2, i));
      }
      
      // Evaluate each candidate
      const results = [];
      for (const gamma of gammaCandidates) {
        const kernelOpts = { type: 'rbf', gamma };
        const result = this.calculateNonLinearCorrelation(x, y, kernelOpts);
        
        results.push({
          gamma,
          nonLinearCorrelation: result.nonLinearCorrelation,
          nonLinearityScore: result.nonLinearityScore,
          pValue: result.pValue
        });
      }
      
      // Select gamma that maximizes non-linearity score while maintaining significance
      results.sort((a, b) => {
        // First prioritize statistical significance
        if (a.pValue <= 0.05 && b.pValue > 0.05) return -1;
        if (a.pValue > 0.05 && b.pValue <= 0.05) return 1;
        
        // Then maximize non-linearity score
        return b.nonLinearityScore - a.nonLinearityScore;
      });
      
      // Return best parameters
      return {
        kernelType: 'rbf',
        gamma: results[0].gamma,
        allResults: results
      };
    } catch (error) {
      logger.error(`KernelCorrelator: Error detecting optimal parameters: ${error.message}`);
      
      // Return default parameters on error
      return {
        kernelType: 'rbf',
        gamma: this.gamma,
        error: error.message
      };
    }
  }

  /**
   * Get performance metrics for the kernel correlator
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    const cacheHitRate = this.computeCount > 0 ? this.cacheHits / this.computeCount : 0;
    const avgComputeTimeMs = this.computeCount > 0 ? this.totalComputeTimeMs / this.computeCount : 0;
    
    return {
      computeCount: this.computeCount,
      cacheHits: this.cacheHits,
      cacheHitRate,
      avgComputeTimeMs,
      totalComputeTimeMs: this.totalComputeTimeMs,
      cacheSize: this.kernelMatrixCache.size
    };
  }
}

module.exports = KernelCorrelator;