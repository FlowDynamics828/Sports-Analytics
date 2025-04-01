/**
 * Causal Discovery Engine
 * 
 * Advanced causal discovery algorithms for inferring causal structure
 * from observational data using PC algorithm, NOTEARS, and other methods
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const math = require('mathjs');
const logger = require('../../utils/logger');

class CausalDiscoveryEngine {
  /**
   * Initialize causal discovery engine
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Algorithm selection
    this.algorithm = config.algorithm || 'pc'; // 'pc', 'notears', or 'granger'
    this.significanceLevel = config.significanceLevel || 0.05;
    this.maxDepth = config.maxDepth || 3;
    this.stableSearch = config.stableSearch !== false;
    
    // Performance configuration
    this.maxFactors = config.maxFactors || 20;
    this.parallelize = config.parallelize !== false;
    
    // Numerical stability
    this.epsilon = config.epsilon || 1e-8;
    this.regularization = config.regularization || 0.01;
    
    // Optimization parameters for NOTEARS
    this.maxIterations = config.maxIterations || 100;
    this.learningRate = config.learningRate || 0.01;
    this.h_threshold = config.h_threshold || 1e-8;
    
    // Performance metrics
    this.discoveryCount = 0;
    this.totalExecutionTimeMs = 0;
    this.lastExecutionTimeMs = 0;
    
    // Bind methods
    this.discoverCausalStructure = this.discoverCausalStructure.bind(this);
    this.runPCAlgorithm = this.runPCAlgorithm.bind(this);
    this.runNOTEARS = this.runNOTEARS.bind(this);
    this.runGrangerCausality = this.runGrangerCausality.bind(this);
  }

  /**
   * Discover causal structure in data
   * @param {Object} data Input data object
   * @param {Array<string>} factors Factor names
   * @param {Array<Array<number>>} timeSeries Time series data for each factor
   * @param {Array<Array<number>>} correlationMatrix Correlation matrix
   * @param {Object} options Additional options
   * @returns {Object} Discovered causal structure
   */
  discoverCausalStructure(data, options = {}) {
    const startTime = Date.now();
    this.discoveryCount++;
    
    try {
      // Extract data
      const { factors, timeSeries, correlationMatrix } = data;
      
      // Check inputs
      if (!factors || !Array.isArray(factors) || factors.length === 0) {
        throw new Error('Invalid factors provided');
      }
      
      if (!correlationMatrix || !Array.isArray(correlationMatrix)) {
        throw new Error('Invalid correlation matrix provided');
      }
      
      // Select algorithm
      const algorithm = options.algorithm || this.algorithm;
      
      // Run selected algorithm
      let result;
      switch (algorithm.toLowerCase()) {
        case 'pc':
          result = this.runPCAlgorithm(factors, correlationMatrix, timeSeries, options);
          break;
        case 'notears':
          result = this.runNOTEARS(factors, correlationMatrix, timeSeries, options);
          break;
        case 'granger':
          result = this.runGrangerCausality(factors, timeSeries, options);
          break;
        default:
          throw new Error(`Unsupported causal discovery algorithm: ${algorithm}`);
      }
      
      // Add metadata
      result.algorithm = algorithm;
      result.factorCount = factors.length;
      result.options = {
        significanceLevel: options.significanceLevel || this.significanceLevel,
        maxDepth: options.maxDepth || this.maxDepth
      };
      
      // Record timing
      this.lastExecutionTimeMs = Date.now() - startTime;
      this.totalExecutionTimeMs += this.lastExecutionTimeMs;
      
      result.executionTimeMs = this.lastExecutionTimeMs;
      
      return result;
    } catch (error) {
      logger.error(`CausalDiscoveryEngine: Error discovering causal structure: ${error.message}`);
      
      // Record timing even on error
      this.lastExecutionTimeMs = Date.now() - startTime;
      this.totalExecutionTimeMs += this.lastExecutionTimeMs;
      
      throw error;
    }
  }

  /**
   * Run PC (Peter-Clark) Algorithm for causal discovery
   * @param {Array<string>} factors Factor names
   * @param {Array<Array<number>>} correlationMatrix Correlation matrix
   * @param {Array<Array<number>>} timeSeries Optional time series data
   * @param {Object} options Additional options
   * @returns {Object} Discovered causal graph
   * @private
   */
  runPCAlgorithm(factors, correlationMatrix, timeSeries, options = {}) {
    try {
      const n = factors.length;
      
      // Configuration
      const alpha = options.significanceLevel || this.significanceLevel;
      const maxDepth = Math.min(options.maxDepth || this.maxDepth, n - 1);
      const stable = options.stableSearch !== undefined ? options.stableSearch : this.stableSearch;
      
      // Step 1: Initialize complete undirected graph
      const adjacencyMatrix = math.ones(n, n)._data;
      
      // Set diagonal to 0 (no self-loops)
      for (let i = 0; i < n; i++) {
        adjacencyMatrix[i][i] = 0;
      }
      
      // Step 2: Edge elimination based on conditional independence
      // Start with conditioning set size d = 0 (unconditional independence)
      for (let d = 0; d <= maxDepth; d++) {
        // Track if any edge was removed in this iteration
        let edgeRemoved = false;
        
        // Create list of adjacent node pairs
        const adjacentPairs = [];
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (adjacencyMatrix[i][j] === 1) {
              adjacentPairs.push({ i, j });
            }
          }
        }
        
        // Stable PC sorts the adjacent pairs for order-independent results
        if (stable) {
          adjacentPairs.sort((a, b) => {
            if (a.i !== b.i) return a.i - b.i;
            return a.j - b.j;
          });
        }
        
        // Test each adjacent pair
        for (const { i, j } of adjacentPairs) {
          // Skip if edge already removed
          if (adjacencyMatrix[i][j] === 0) continue;
          
          // Get adjacent nodes for conditioning sets
          const adjI = this.getAdjacentNodes(adjacencyMatrix, i, j);
          
          // Generate all possible conditioning sets of size d
          if (adjI.length >= d) {
            const condSets = this.generateCombinations(adjI, d);
            
            // Test each conditioning set
            for (const condSet of condSets) {
              // Test conditional independence
              const isIndependent = this.testConditionalIndependence(
                i, j, condSet, correlationMatrix, timeSeries, alpha
              );
              
              if (isIndependent) {
                // Remove edge if conditionally independent
                adjacencyMatrix[i][j] = 0;
                adjacencyMatrix[j][i] = 0;
                
                // Record separating set
                const sepSet = condSet.map(idx => factors[idx]);
                
                // Store in separation sets (for orientation phase)
                if (!this.separationSets) {
                  this.separationSets = {};
                }
                const key = `${i},${j}`;
                this.separationSets[key] = sepSet;
                
                edgeRemoved = true;
                break; // Test next pair
              }
            }
          }
        }
        
        // Break if no edge was removed in this iteration
        if (!edgeRemoved) break;
      }
      
      // Step 3: Orient edges to form a DAG
      const directedGraph = this.orientEdges(adjacencyMatrix, factors);
      
      // Convert to causal graph representation
      const causalGraph = this.convertToCausalGraph(directedGraph, factors);
      
      return {
        factors,
        causalGraph,
        adjacencyMatrix: directedGraph,
        edgeCount: causalGraph.edges.length,
        separationSets: this.separationSets
      };
    } catch (error) {
      logger.error(`CausalDiscoveryEngine: Error running PC algorithm: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get adjacent nodes excluding target node
   * @param {Array<Array<number>>} adjacencyMatrix Adjacency matrix
   * @param {number} node Node index
   * @param {number} exclude Node to exclude
   * @returns {Array<number>} Adjacent node indices
   * @private
   */
  getAdjacentNodes(adjacencyMatrix, node, exclude) {
    const adjacent = [];
    for (let i = 0; i < adjacencyMatrix.length; i++) {
      if (i !== exclude && adjacencyMatrix[node][i] === 1) {
        adjacent.push(i);
      }
    }
    return adjacent;
  }

  /**
   * Generate all combinations of k elements from array
   * @param {Array} array Input array
   * @param {number} k Combination size
   * @returns {Array<Array>} All combinations
   * @private
   */
  generateCombinations(array, k) {
    const result = [];
    
    // Recursive helper function
    const combine = (start, combo) => {
      if (combo.length === k) {
        result.push([...combo]);
        return;
      }
      
      for (let i = start; i < array.length; i++) {
        combo.push(array[i]);
        combine(i + 1, combo);
        combo.pop();
      }
    };
    
    combine(0, []);
    return result;
  }

  /**
   * Test conditional independence between two variables
   * @param {number} i First variable index
   * @param {number} j Second variable index
   * @param {Array<number>} condSet Conditioning set indices
   * @param {Array<Array<number>>} correlationMatrix Correlation matrix
   * @param {Array<Array<number>>} timeSeries Optional time series data
   * @param {number} alpha Significance level
   * @returns {boolean} True if conditionally independent
   * @private
   */
  testConditionalIndependence(i, j, condSet, correlationMatrix, timeSeries, alpha) {
    try {
      // If time series data is provided, use partial correlation
      if (timeSeries && timeSeries.length > 0) {
        return this.testPartialCorrelation(i, j, condSet, timeSeries, alpha);
      }
      
      // Otherwise use correlation matrix
      return this.testPartialCorrelationFromMatrix(i, j, condSet, correlationMatrix, alpha);
    } catch (error) {
      logger.warn(`Error testing conditional independence: ${error.message}`);
      
      // Default to dependent (keep edge) on error
      return false;
    }
  }

  /**
   * Test partial correlation from time series data
   * @param {number} i First variable index
   * @param {number} j Second variable index
   * @param {Array<number>} condSet Conditioning set indices
   * @param {Array<Array<number>>} timeSeries Time series data
   * @param {number} alpha Significance level
   * @returns {boolean} True if conditionally independent
   * @private
   */
  testPartialCorrelation(i, j, condSet, timeSeries, alpha) {
    try {
      // Extract relevant time series
      const varI = timeSeries[i];
      const varJ = timeSeries[j];
      const condVars = condSet.map(idx => timeSeries[idx]);
      
      // Calculate partial correlation
      const partialCorr = this.calculatePartialCorrelation(varI, varJ, condVars);
      
      // Calculate Fisher's Z transform
      const z = 0.5 * Math.log((1 + partialCorr) / (1 - partialCorr));
      
      // Calculate standard error
      const n = varI.length;
      const se = 1 / Math.sqrt(n - condSet.length - 3);
      
      // Calculate test statistic
      const testStat = Math.abs(z / se);
      
      // Calculate p-value (assuming normal distribution)
      const pValue = 2 * (1 - this.normCDF(testStat));
      
      // Compare with significance level
      return pValue > alpha;
    } catch (error) {
      logger.warn(`Error calculating partial correlation: ${error.message}`);
      return false;
    }
  }

  /**
   * Test partial correlation from correlation matrix
   * @param {number} i First variable index
   * @param {number} j Second variable index
   * @param {Array<number>} condSet Conditioning set indices
   * @param {Array<Array<number>>} correlationMatrix Correlation matrix
   * @param {number} alpha Significance level
   * @returns {boolean} True if conditionally independent
   * @private
   */
  testPartialCorrelationFromMatrix(i, j, condSet, correlationMatrix, alpha) {
    try {
      if (condSet.length === 0) {
        // No conditioning, just use regular correlation
        const corr = correlationMatrix[i][j];
        
        // Simple test with reasonable sample size assumption (n=100)
        const z = 0.5 * Math.log((1 + corr) / (1 - corr));
        const se = 1 / Math.sqrt(100 - 3);
        const testStat = Math.abs(z / se);
        const pValue = 2 * (1 - this.normCDF(testStat));
        
        return pValue > alpha;
      }
      
      // Extract relevant sub-matrix
      const indices = [i, j, ...condSet];
      const subMatrix = this.extractSubMatrix(correlationMatrix, indices);
      
      // Calculate partial correlation
      const precision = math.inv(subMatrix);
      const partialCorr = -precision[0][1] / Math.sqrt(precision[0][0] * precision[1][1]);
      
      // Fisher's Z test
      const z = 0.5 * Math.log((1 + partialCorr) / (1 - partialCorr));
      
      // Assume sample size of 100 for simplicity
      const n = 100;
      const se = 1 / Math.sqrt(n - condSet.length - 3);
      
      // Calculate test statistic
      const testStat = Math.abs(z / se);
      
      // Calculate p-value
      const pValue = 2 * (1 - this.normCDF(testStat));
      
      // Compare with significance level
      return pValue > alpha;
    } catch (error) {
      logger.warn(`Error calculating partial correlation from matrix: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract sub-matrix from correlation matrix
   * @param {Array<Array<number>>} matrix Original matrix
   * @param {Array<number>} indices Indices to extract
   * @returns {Array<Array<number>>} Sub-matrix
   * @private
   */
  extractSubMatrix(matrix, indices) {
    const n = indices.length;
    const subMatrix = math.zeros(n, n)._data;
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        subMatrix[i][j] = matrix[indices[i]][indices[j]];
      }
    }
    
    return subMatrix;
  }

  /**
   * Calculate partial correlation between two variables
   * @param {Array<number>} x First variable values
   * @param {Array<number>} y Second variable values
   * @param {Array<Array<number>>} z Conditioning variables
   * @returns {number} Partial correlation coefficient
   * @private
   */
  calculatePartialCorrelation(x, y, z) {
    if (z.length === 0) {
      // No conditioning, calculate regular correlation
      return this.calculateCorrelation(x, y);
    }
    
    // Perform linear regression of x on z
    const residualsX = this.calculateResiduals(x, z);
    
    // Perform linear regression of y on z
    const residualsY = this.calculateResiduals(y, z);
    
    // Calculate correlation between residuals
    return this.calculateCorrelation(residualsX, residualsY);
  }

  /**
   * Calculate residuals after regressing variable on covariates
   * @param {Array<number>} y Dependent variable
   * @param {Array<Array<number>>} X Covariates
   * @returns {Array<number>} Residuals
   * @private
   */
  calculateResiduals(y, X) {
    const n = y.length;
    const p = X.length;
    
    // Prepare design matrix with intercept
    const designMatrix = math.ones(n, p + 1)._data;
    
    for (let j = 0; j < p; j++) {
      for (let i = 0; i < n; i++) {
        designMatrix[i][j + 1] = X[j][i];
      }
    }
    
    // Calculate X'X
    const XtX = math.multiply(math.transpose(designMatrix), designMatrix);
    
    // Add small regularization for numerical stability
    for (let i = 0; i < XtX.length; i++) {
      XtX[i][i] += this.regularization;
    }
    
    // Calculate X'y
    const Xty = math.multiply(math.transpose(designMatrix), y);
    
    // Solve for coefficients: beta = (X'X)^-1 X'y
    const beta = math.multiply(math.inv(XtX), Xty);
    
    // Calculate fitted values
    const fitted = math.multiply(designMatrix, beta);
    
    // Calculate residuals
    const residuals = [];
    for (let i = 0; i < n; i++) {
      residuals.push(y[i] - fitted[i]);
    }
    
    return residuals;
  }

  /**
   * Calculate Pearson correlation coefficient
   * @param {Array<number>} x First variable
   * @param {Array<number>} y Second variable
   * @returns {number} Correlation coefficient
   * @private
   */
  calculateCorrelation(x, y) {
    const n = x.length;
    
    // Calculate means
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;
    
    // Calculate covariance and variances
    let covariance = 0;
    let varianceX = 0;
    let varianceY = 0;
    
    for (let i = 0; i < n; i++) {
      const diffX = x[i] - meanX;
      const diffY = y[i] - meanY;
      
      covariance += diffX * diffY;
      varianceX += diffX * diffX;
      varianceY += diffY * diffY;
    }
    
    // Avoid division by zero
    if (varianceX < this.epsilon || varianceY < this.epsilon) {
      return 0;
    }
    
    return covariance / Math.sqrt(varianceX * varianceY);
  }

  /**
   * Standard normal cumulative distribution function
   * @param {number} x Input value
   * @returns {number} CDF value
   * @private
   */
  normCDF(x) {
    // Approximation of the standard normal CDF
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * Orient edges to create a directed acyclic graph
   * @param {Array<Array<number>>} adjacencyMatrix Undirected adjacency matrix
   * @param {Array<string>} factors Factor names
   * @returns {Array<Array<number>>} Directed adjacency matrix
   * @private
   */
  orientEdges(adjacencyMatrix, factors) {
    const n = adjacencyMatrix.length;
    
    // Clone the adjacency matrix for the directed graph
    const directedGraph = JSON.parse(JSON.stringify(adjacencyMatrix));
    
    // Step 1: Find v-structures (colliders): X → Z ← Y where X and Y are not adjacent
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || adjacencyMatrix[i][j] === 0) continue;
        
        for (let k = 0; k < n; k++) {
          if (k === i || k === j || adjacencyMatrix[j][k] === 0) continue;
          
          // Check if i and k are not adjacent
          if (adjacencyMatrix[i][k] === 0) {
            // Check if j is not in the separating set of i and k
            const sepSetKey = `${Math.min(i, k)},${Math.max(i, k)}`;
            const sepSet = this.separationSets ? this.separationSets[sepSetKey] : [];
            
            if (!sepSet || !sepSet.includes(factors[j])) {
              // Orient edges: i → j ← k (v-structure)
              directedGraph[i][j] = 1;
              directedGraph[j][i] = 0;
              
              directedGraph[k][j] = 1;
              directedGraph[j][k] = 0;
            }
          }
        }
      }
    }
    
    // Step 2: Apply orientation rules until no more edges can be oriented
    let edgesOriented = true;
    while (edgesOriented) {
      edgesOriented = false;
      
      // Rule 1: Orient i-j into i→j if there is an arrow k→i and k and j are not adjacent
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (directedGraph[i][j] === 1 && directedGraph[j][i] === 1) {
            for (let k = 0; k < n; k++) {
              if (directedGraph[k][i] === 1 && directedGraph[i][k] === 0 &&
                  directedGraph[k][j] === 0 && directedGraph[j][k] === 0) {
                directedGraph[i][j] = 1;
                directedGraph[j][i] = 0;
                edgesOriented = true;
              }
            }
          }
        }
      }
      
      // Rule 2: Orient i-j into i→j if there is a directed path from i to j
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (directedGraph[i][j] === 1 && directedGraph[j][i] === 1) {
            // Check if there is another directed path from i to j
            if (this.existsDirectedPath(directedGraph, i, j, [i, j])) {
              directedGraph[i][j] = 1;
              directedGraph[j][i] = 0;
              edgesOriented = true;
            }
          }
        }
      }
    }
    
    // Step 3: Orient remaining undirected edges to avoid cycles
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (directedGraph[i][j] === 1 && directedGraph[j][i] === 1) {
          // Orient based on index (arbitrary but consistent)
          if (i < j) {
            directedGraph[j][i] = 0;
          } else {
            directedGraph[i][j] = 0;
          }
        }
      }
    }
    
    return directedGraph;
  }

  /**
   * Check if there is a directed path from source to target
   * @param {Array<Array<number>>} graph Directed graph
   * @param {number} source Source node
   * @param {number} target Target node
   * @param {Array<number>} excluded Nodes to exclude from path
   * @returns {boolean} True if directed path exists
   * @private
   */
  existsDirectedPath(graph, source, target, excluded) {
    const n = graph.length;
    const visited = new Array(n).fill(false);
    
    // Mark excluded nodes as visited
    for (const node of excluded) {
      visited[node] = true;
    }
    
    // Stack for DFS
    const stack = [source];
    visited[source] = true;
    
    while (stack.length > 0) {
      const node = stack.pop();
      
      for (let neighbor = 0; neighbor < n; neighbor++) {
        // Check for directed edge
        if (graph[node][neighbor] === 1 && graph[neighbor][node] === 0 && !visited[neighbor]) {
          if (neighbor === target) {
            return true;
          }
          
          visited[neighbor] = true;
          stack.push(neighbor);
        }
      }
    }
    
    return false;
  }

  /**
   * Convert directed graph to causal graph representation
   * @param {Array<Array<number>>} directedGraph Directed adjacency matrix
   * @param {Array<string>} factors Factor names
   * @returns {Object} Causal graph representation
   * @private
   */
  convertToCausalGraph(directedGraph, factors) {
    const n = directedGraph.length;
    const nodes = [];
    const edges = [];
    
    // Create nodes
    for (let i = 0; i < n; i++) {
      nodes.push({
        id: i,
        name: factors[i],
        inDegree: 0,
        outDegree: 0
      });
    }
    
    // Create edges and calculate degrees
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (directedGraph[i][j] === 1 && directedGraph[j][i] === 0) {
          edges.push({
            source: i,
            target: j,
            sourceName: factors[i],
            targetName: factors[j]
          });
          
          // Update degrees
          nodes[i].outDegree++;
          nodes[j].inDegree++;
        }
      }
    }
    
    // Identify potential root causes (nodes with no parents)
    const rootCauses = nodes.filter(node => node.inDegree === 0).map(node => ({
      id: node.id,
      name: node.name,
      outDegree: node.outDegree
    }));
    
    // Identify potential effects (nodes with no children)
    const effects = nodes.filter(node => node.outDegree === 0).map(node => ({
      id: node.id,
      name: node.name,
      inDegree: node.inDegree
    }));
    
    return {
      nodes,
      edges,
      rootCauses,
      effects,
      density: edges.length / (n * (n - 1))
    };
  }

  /**
   * Run NOTEARS algorithm for causal discovery
   * NOTEARS: Non-combinatorial Optimization for Trace Exponential Acyclic Regularizer
   * @param {Array<string>} factors Factor names
   * @param {Array<Array<number>>} correlationMatrix Correlation matrix
   * @param {Array<Array<number>>} timeSeries Optional time series data
   * @param {Object} options Additional options
   * @returns {Object} Discovered causal graph
   * @private
   */
  runNOTEARS(factors, correlationMatrix, timeSeries, options = {}) {
    try {
      const n = factors.length;
      
      // Check if time series data is available
      if (!timeSeries || !Array.isArray(timeSeries) || timeSeries.length !== n) {
        throw new Error('NOTEARS algorithm requires time series data for all factors');
      }
      
      // Extract data matrix X
      const dataLength = timeSeries[0].length;
      const X = math.zeros(dataLength, n)._data;
      
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < dataLength; j++) {
          X[j][i] = timeSeries[i][j];
        }
      }
      
      // Normalize data
      const X_normalized = this.normalizeData(X);
      
      // Initialize weight matrix W (adjacency matrix)
      let W = math.zeros(n, n)._data;
      
      // Set optimization parameters
      const maxIter = options.maxIterations || this.maxIterations;
      const lr = options.learningRate || this.learningRate;
      const h_tol = options.h_threshold || this.h_threshold;
      const lambda = options.lambda || 0.1; // L1 regularization parameter
      
      // Augmented Lagrangian parameters
      let rho = 1.0;
      let alpha = 0.0;
      const rho_max = 1e+16;
      const h_new = Infinity;
      
      // Optimization loop
      for (let iter = 0; iter < maxIter; iter++) {
        const W_old = math.clone(W);
        const h_old = h_new;
        
        // Gradient descent step
        const [grad_f, h_val] = this.notears_grad(X_normalized, W, lambda);
        const grad_aug = math.add(grad_f, math.multiply(alpha + rho * h_val, this.notears_h_grad(W)));
        
        // Update W with gradient descent
        W = math.subtract(W, math.multiply(lr, grad_aug));
        
        // Apply thresholding (soft-thresholding for L1 regularization)
        W = this.softThreshold(W, lambda * lr);
        
        // Ensure diagonal is zero (no self-loops)
        for (let i = 0; i < n; i++) {
          W[i][i] = 0;
        }
        
        // Calculate h(W) = tr(exp(W ◦ W)) - d
        const h_new = this.notears_h(W);
        
        // Check convergence
        if (h_new <= h_tol && iter > 0) {
          logger.info(`NOTEARS converged after ${iter} iterations with h(W)=${h_new}`);
          break;
        }
        
        // Update Lagrangian parameters
        if (h_new > 0.25 * h_old) {
          alpha += rho * h_new;
          rho = Math.min(rho_max, rho * 10);
        }
      }
      
      // Threshold small weights to zero for sparsity
      const threshold = options.edgeThreshold || 0.3;
      const directedGraph = math.zeros(n, n)._data;
      
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (Math.abs(W[i][j]) > threshold) {
            directedGraph[i][j] = 1;
          }
        }
      }
      
      // Convert to causal graph representation
      const causalGraph = this.convertToCausalGraph(directedGraph, factors);
      
      return {
        factors,
        causalGraph,
        adjacencyMatrix: directedGraph,
        edgeCount: causalGraph.edges.length,
        weightMatrix: W
      };
    } catch (error) {
      logger.error(`CausalDiscoveryEngine: Error running NOTEARS algorithm: ${error.message}`);
      throw error;
    }
  }

  /**
   * Normalize data matrix (center and scale)
   * @param {Array<Array<number>>} X Data matrix
   * @returns {Array<Array<number>>} Normalized data matrix
   * @private
   */
  normalizeData(X) {
    const n = X.length;
    const p = X[0].length;
    const X_norm = math.zeros(n, p)._data;
    
    // Calculate column means and standard deviations
    const means = new Array(p).fill(0);
    const stds = new Array(p).fill(0);
    
    for (let j = 0; j < p; j++) {
      for (let i = 0; i < n; i++) {
        means[j] += X[i][j] / n;
      }
      
      for (let i = 0; i < n; i++) {
        stds[j] += Math.pow(X[i][j] - means[j], 2) / n;
      }
      stds[j] = Math.sqrt(stds[j]);
      
      // Avoid division by zero
      if (stds[j] < this.epsilon) {
        stds[j] = 1.0;
      }
    }
    
    // Normalize data
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        X_norm[i][j] = (X[i][j] - means[j]) / stds[j];
      }
    }
    
    return X_norm;
  }

  /**
   * Calculate loss gradient for NOTEARS
   * @param {Array<Array<number>>} X Data matrix
   * @param {Array<Array<number>>} W Weight matrix
   * @param {number} lambda L1 regularization parameter
   * @returns {Array} Gradient and h(W) value
   * @private
   */
  notears_grad(X, W, lambda) {
    const n = X.length;
    const p = X[0].length;
    
    // Calculate XW
    const XW = math.multiply(X, W);
    
    // Calculate residual: R = XW - X
    const R = math.subtract(XW, X);
    
    // Calculate gradient of least squares loss: 2/n * X^T R
    const grad_f = math.multiply(2/n, math.multiply(math.transpose(X), R));
    
    // Calculate h(W)
    const h_val = this.notears_h(W);
    
    return [grad_f, h_val];
  }

  /**
   * Calculate h(W) = tr(exp(W ◦ W)) - d
   * @param {Array<Array<number>>} W Weight matrix
   * @returns {number} h(W) value
   * @private
   */
  notears_h(W) {
    const d = W.length;
    
    // Calculate W ◦ W (element-wise square)
    const W_squared = W.map(row => row.map(val => val * val));
    
    // Calculate matrix exponential
    const expW = math.expm(W_squared);
    
    // Calculate trace
    let trace = 0;
    for (let i = 0; i < d; i++) {
      trace += expW[i][i];
    }
    
    return trace - d;
  }

  /**
   * Calculate gradient of h(W)
   * @param {Array<Array<number>>} W Weight matrix
   * @returns {Array<Array<number>>} Gradient of h(W)
   * @private
   */
  notears_h_grad(W) {
    const d = W.length;
    
    // Calculate W ◦ W (element-wise square)
    const W_squared = W.map(row => row.map(val => val * val));
    
    // Calculate matrix exponential
    const expW = math.expm(W_squared);
    
    // Calculate gradient
    const grad = math.zeros(d, d)._data;
    
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        grad[i][j] = 2 * W[i][j] * expW[i][j];
      }
    }
    
    return grad;
  }

  /**
   * Apply soft thresholding (for L1 regularization)
   * @param {Array<Array<number>>} W Weight matrix
   * @param {number} lambda Threshold value
   * @returns {Array<Array<number>>} Thresholded matrix
   * @private
   */
  softThreshold(W, lambda) {
    const d = W.length;
    const result = math.zeros(d, d)._data;
    
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        if (W[i][j] > lambda) {
          result[i][j] = W[i][j] - lambda;
        } else if (W[i][j] < -lambda) {
          result[i][j] = W[i][j] + lambda;
        }
      }
    }
    
    return result;
  }

  /**
   * Run Granger causality test for causal discovery
   * @param {Array<string>} factors Factor names
   * @param {Array<Array<number>>} timeSeries Time series data
   * @param {Object} options Additional options
   * @returns {Object} Discovered causal graph
   * @private
   */
  runGrangerCausality(factors, timeSeries, options = {}) {
    try {
      const n = factors.length;
      
      // Check if time series data is available
      if (!timeSeries || !Array.isArray(timeSeries) || timeSeries.length !== n) {
        throw new Error('Granger causality requires time series data for all factors');
      }
      
      // Configure parameters
      const maxLag = options.maxLag || 3;
      const alpha = options.significanceLevel || this.significanceLevel;
      
      // Initialize adjacency matrix
      const directedGraph = math.zeros(n, n)._data;
      
      // Perform pairwise Granger causality tests
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue; // Skip self-loops
          
          // Test if i Granger-causes j
          const result = this.testGrangerCausality(
            timeSeries[j], // Effect (Y)
            timeSeries[i], // Potential cause (X)
            maxLag,
            alpha
          );
          
          if (result.isCausal) {
            directedGraph[i][j] = 1;
          }
        }
      }
      
      // Convert to causal graph representation
      const causalGraph = this.convertToCausalGraph(directedGraph, factors);
      
      return {
        factors,
        causalGraph,
        adjacencyMatrix: directedGraph,
        edgeCount: causalGraph.edges.length,
        maxLag
      };
    } catch (error) {
      logger.error(`CausalDiscoveryEngine: Error running Granger causality: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test Granger causality between two time series
   * @param {Array<number>} Y Effect time series
   * @param {Array<number>} X Potential cause time series
   * @param {number} maxLag Maximum lag to test
   * @param {number} alpha Significance level
   * @returns {Object} Test results
   * @private
   */
  testGrangerCausality(Y, X, maxLag, alpha) {
    try {
      const T = Y.length;
      
      // Ensure we have enough data
      if (T <= 2 * maxLag + 1) {
        return { isCausal: false, pValue: 1.0, fStat: 0 };
      }
      
      // Adjust for lags
      const effectiveT = T - maxLag;
      const y = Y.slice(maxLag);
      
      // Create lagged variables
      const X_lagged = [];
      const Y_lagged = [];
      
      for (let lag = 1; lag <= maxLag; lag++) {
        const X_lag = [];
        const Y_lag = [];
        
        for (let t = 0; t < effectiveT; t++) {
          X_lag.push(X[t + maxLag - lag]);
          Y_lag.push(Y[t + maxLag - lag]);
        }
        
        X_lagged.push(X_lag);
        Y_lagged.push(Y_lag);
      }
      
      // Model 1: Restricted model (Y regressed on its own lags)
      const X1 = [new Array(effectiveT).fill(1)]; // Intercept
      X1.push(...Y_lagged);
      
      const X1_matrix = math.transpose(X1);
      const beta1 = this.olsEstimator(X1_matrix, y);
      const resid1 = this.calculateResiduals(y, X1);
      const rss1 = resid1.reduce((sum, r) => sum + r * r, 0);
      
      // Model 2: Unrestricted model (Y regressed on its own lags and X lags)
      const X2 = [...X1, ...X_lagged];
      const X2_matrix = math.transpose(X2);
      const beta2 = this.olsEstimator(X2_matrix, y);
      const resid2 = this.calculateResiduals(y, X2);
      const rss2 = resid2.reduce((sum, r) => sum + r * r, 0);
      
      // Calculate F-statistic
      const df1 = maxLag; // Number of restrictions
      const df2 = effectiveT - 2 * maxLag - 1; // Degrees of freedom in unrestricted model
      
      // Avoid division by zero
      if (rss2 < this.epsilon || df2 <= 0) {
        return { isCausal: false, pValue: 1.0, fStat: 0 };
      }
      
      const fStat = ((rss1 - rss2) / df1) / (rss2 / df2);
      
      // Calculate p-value using F-distribution
      const pValue = this.calculateFPValue(fStat, df1, df2);
      
      return {
        isCausal: pValue < alpha,
        pValue,
        fStat,
        dfs: [df1, df2],
        rss: [rss1, rss2],
        beta: [beta1, beta2]
      };
    } catch (error) {
      logger.error(`CausalDiscoveryEngine: Error testing Granger causality: ${error.message}`);
      return { isCausal: false, pValue: 1.0, fStat: 0, error: error.message };
    }
  }

  /**
   * OLS (Ordinary Least Squares) estimator
   * @param {Array<Array<number>>} X Design matrix
   * @param {Array<number>} y Response variable
   * @returns {Array<number>} Coefficient estimates
   * @private
   */
  olsEstimator(X, y) {
    try {
      const XtX = math.multiply(math.transpose(X), X);
      
      // Add small regularization for numerical stability
      for (let i = 0; i < XtX.length; i++) {
        XtX[i][i] += this.regularization;
      }
      
      const Xty = math.multiply(math.transpose(X), y);
      return math.multiply(math.inv(XtX), Xty);
    } catch (error) {
      logger.error(`OLS estimator error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate p-value from F-statistic
   * @param {number} fStat F-statistic
   * @param {number} df1 Numerator degrees of freedom
   * @param {number} df2 Denominator degrees of freedom
   * @returns {number} P-value
   * @private
   */
  calculateFPValue(fStat, df1, df2) {
    // Approximation of F distribution CDF
    // Using Wilson-Hilferty transformation for F -> Chi-square
    
    if (fStat <= 0) return 1.0;
    
    try {
      // Transform F to chi-square
      const nu1 = df1;
      const nu2 = df2;
      
      const x = (nu1 * fStat) / (nu1 * fStat + nu2);
      const chi2 = (nu1 + nu2 - 2) * x / (1 - x);
      const dof = (nu1 + nu2 - 2) / 2;
      
      // Approximate chi-square CDF
      const p = this.chiSquareCDF(chi2, dof);
      
      return 1 - p;
    } catch (error) {
      logger.error(`Error calculating F p-value: ${error.message}`);
      return 1.0;
    }
  }

  /**
   * Approximate Chi-square CDF
   * @param {number} x Chi-square value
   * @param {number} k Degrees of freedom
   * @returns {number} CDF value
   * @private
   */
  chiSquareCDF(x, k) {
    // Approximation of chi-square CDF
    if (x <= 0) return 0;
    if (k <= 0) return 0;
    
    // Using Wilson-Hilferty approximation
    const z = Math.pow(x / k, 1/3) - 1 + 1/(9 * k);
    const normalCDF = this.normCDF(z * Math.sqrt(9 * k));
    
    return normalCDF;
  }

  /**
   * Get performance metrics for the causal discovery engine
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      discoveryCount: this.discoveryCount,
      avgExecutionTimeMs: this.discoveryCount > 0 ? 
        this.totalExecutionTimeMs / this.discoveryCount : 0,
      lastExecutionTimeMs: this.lastExecutionTimeMs,
      totalExecutionTimeMs: this.totalExecutionTimeMs
    };
  }
}

module.exports = CausalDiscoveryEngine;