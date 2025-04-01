/**
 * Factor Embedder for Vector Representations
 * 
 * Creates dynamic vector embeddings for prediction factors
 * that evolve over time based on observed correlation patterns
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const math = require('mathjs');
const tf = require('@tensorflow/tfjs-node');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class FactorEmbedder {
  /**
   * Initialize factor embedder
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Embedding dimensions
    this.embeddingDimension = config.embeddingDimension || 64;
    this.minDimension = config.minDimension || 16;
    this.maxDimension = config.maxDimension || 128;
    
    // Training parameters
    this.numNegativeSamples = config.numNegativeSamples || 5;
    this.learningRate = config.learningRate || 0.01;
    this.batchSize = config.batchSize || 64;
    this.epochs = config.epochs || 10;
    
    // Temporal regularization
    this.temporalRegularization = config.temporalRegularization || 0.1;
    this.historyWindow = config.historyWindow || 3;
    
    // Factor metadata
    this.factorTypes = new Map();
    this.factorSports = new Map();
    this.factorLeagues = new Map();
    this.factorFrequency = new Map();
    
    // Embeddings and state
    this.embeddingModel = null;
    this.embeddings = new Map();
    this.embeddingHistory = new Map();
    this.initialized = false;
    this.lastUpdateTime = null;
    
    // Model IDs for versioning
    this.modelId = config.modelId || uuidv4();
    this.modelVersion = config.modelVersion || 'v1.0.0';
    
    // Save paths
    this.saveDirectory = config.saveDirectory || './models/embeddings';
    
    // Performance tracking
    this.trainingHistory = [];
    this.trainingTime = 0;
    this.inferenceCount = 0;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.updateEmbeddings = this.updateEmbeddings.bind(this);
    this.getEmbedding = this.getEmbedding.bind(this);
    this.saveEmbeddings = this.saveEmbeddings.bind(this);
    this.loadEmbeddings = this.loadEmbeddings.bind(this);
  }

  /**
   * Initialize the embedder and model
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      logger.info(`FactorEmbedder: Initializing with dimension ${this.embeddingDimension}`);
      
      // Create embedding model
      this.embeddingModel = await this.createModel();
      
      this.initialized = true;
      logger.info('FactorEmbedder: Initialization complete');
    } catch (error) {
      logger.error(`FactorEmbedder: Initialization error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create embedding model with TensorFlow.js
   * @returns {tf.LayersModel} TensorFlow model
   * @private
   */
  async createModel() {
    try {
      // Input layers
      const factorAInput = tf.input({
        shape: [1],
        name: 'factor_a_input',
        dtype: 'int32'
      });
      
      const factorBInput = tf.input({
        shape: [1],
        name: 'factor_b_input',
        dtype: 'int32'
      });
      
      const labelInput = tf.input({
        shape: [1],
        name: 'label_input',
        dtype: 'float32'
      });
      
      // Placeholder for maximum factor ID
      // Will be updated during training
      this.maxFactorId = 10000;
      
      // Embedding layer (shared weights)
      const embeddingLayer = tf.layers.embedding({
        inputDim: this.maxFactorId + 1,
        outputDim: this.embeddingDimension,
        embeddingsInitializer: 'randomNormal',
        name: 'factor_embeddings'
      });
      
      // Apply embedding layer to both inputs
      const factorAEmbedding = embeddingLayer.apply(factorAInput);
      const factorBEmbedding = embeddingLayer.apply(factorBInput);
      
      // Flatten embeddings
      const flatA = tf.layers.flatten().apply(factorAEmbedding);
      const flatB = tf.layers.flatten().apply(factorBEmbedding);
      
      // Calculate dot product
      const dotProduct = tf.layers.dot({
        axes: 1,
        name: 'dot_product'
      }).apply([flatA, flatB]);
      
      // Build the model
      const model = tf.model({
        inputs: [factorAInput, factorBInput, labelInput],
        outputs: dotProduct,
        name: 'factor_embedder'
      });
      
      // Compile the model
      model.compile({
        optimizer: tf.train.adam(this.learningRate),
        loss: 'meanSquaredError'
      });
      
      // Create utility model to extract embeddings
      this.embeddingExtractor = tf.model({
        inputs: factorAInput,
        outputs: flatA,
        name: 'embedding_extractor'
      });
      
      return model;
    } catch (error) {
      logger.error(`FactorEmbedder: Error creating model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update factor embeddings based on new correlation data
   * @param {Array<Object>} correlationData Array of factor correlation samples
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Training results
   */
  async updateEmbeddings(correlationData, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      logger.info(`FactorEmbedder: Updating embeddings with ${correlationData.length} correlation samples`);
      
      // Process factor data and create training set
      const { trainingSamples, factorToId, idToFactor, maxFactorId } = 
        this.prepareTrainingData(correlationData);
      
      if (trainingSamples.length === 0) {
        logger.warn('FactorEmbedder: No valid training samples generated');
        return { success: false, message: 'No valid training samples' };
      }
      
      // Update maximum factor ID
      this.maxFactorId = Math.max(this.maxFactorId, maxFactorId);
      
      // Store factor mappings
      this.factorToId = factorToId;
      this.idToFactor = idToFactor;
      
      // Check if we need to recreate the model with a larger vocabulary
      if (maxFactorId > this.maxFactorId) {
        logger.info(`FactorEmbedder: Recreating model for larger vocabulary (${maxFactorId})`);
        this.embeddingModel = await this.createModel();
        this.maxFactorId = maxFactorId;
      }
      
      // Set training parameters
      const epochs = options.epochs || this.epochs;
      const batchSize = options.batchSize || this.batchSize;
      
      // Create training tensors
      const factorAIds = tf.tensor2d(trainingSamples.map(s => [s.factorAId]), null, 'int32');
      const factorBIds = tf.tensor2d(trainingSamples.map(s => [s.factorBId]), null, 'int32');
      const correlationValues = tf.tensor2d(trainingSamples.map(s => [s.correlation]), null, 'float32');
      
      // Train the model
      const history = await this.embeddingModel.fit(
        [factorAIds, factorBIds, correlationValues],
        correlationValues,
        {
          epochs,
          batchSize,
          validationSplit: 0.2,
          callbacks: {
            onEpochEnd: (epoch, logs) => {
              logger.debug(`FactorEmbedder: Epoch ${epoch + 1}/${epochs}, Loss: ${logs.loss.toFixed(4)}`);
            }
          }
        }
      );
      
      // Extract final embeddings for all factors
      await this.extractAllEmbeddings();
      
      // Apply temporal regularization
      if (options.temporalRegularization !== false) {
        this.applyTemporalRegularization();
      }
      
      // Clean up tensors
      tf.dispose([factorAIds, factorBIds, correlationValues]);
      
      // Record training history
      this.trainingHistory.push({
        timestamp: new Date().toISOString(),
        epochs: epochs,
        sampleCount: trainingSamples.length,
        factorCount: Object.keys(factorToId).length,
        finalLoss: history.history.loss[history.history.loss.length - 1],
        validationLoss: history.history.val_loss ? 
          history.history.val_loss[history.history.val_loss.length - 1] : null
      });
      
      // Update timestamp
      this.lastUpdateTime = new Date();
      this.trainingTime += (Date.now() - startTime);
      
      return {
        success: true,
        factorCount: Object.keys(factorToId).length,
        sampleCount: trainingSamples.length,
        finalLoss: history.history.loss[history.history.loss.length - 1],
        executionTimeMs: Date.now() - startTime
      };
    } catch (error) {
      logger.error(`FactorEmbedder: Error updating embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Prepare training data from correlation samples
   * @param {Array<Object>} correlationData Correlation samples
   * @returns {Object} Prepared training data
   * @private
   */
  prepareTrainingData(correlationData) {
    try {
      // Create factor ID mappings
      let factorToId;
      let idToFactor;
      let nextId = 0;
      
      // Reuse existing mappings if available
      if (this.factorToId && this.idToFactor) {
        factorToId = new Map(this.factorToId);
        idToFactor = new Map(this.idToFactor);
        nextId = Math.max(...factorToId.values()) + 1;
      } else {
        factorToId = new Map();
        idToFactor = new Map();
      }
      
      // Collect unique factors and assign IDs
      const factors = new Set();
      
      for (const sample of correlationData) {
        factors.add(sample.factorA);
        factors.add(sample.factorB);
        
        // Store metadata if available
        if (sample.sport) {
          this.factorSports.set(sample.factorA, sample.sport);
          this.factorSports.set(sample.factorB, sample.sport);
        }
        
        if (sample.league) {
          this.factorLeagues.set(sample.factorA, sample.league);
          this.factorLeagues.set(sample.factorB, sample.league);
        }
        
        if (sample.factorAType) {
          this.factorTypes.set(sample.factorA, sample.factorAType);
        }
        
        if (sample.factorBType) {
          this.factorTypes.set(sample.factorB, sample.factorBType);
        }
        
        // Update frequency
        this.factorFrequency.set(sample.factorA, (this.factorFrequency.get(sample.factorA) || 0) + 1);
        this.factorFrequency.set(sample.factorB, (this.factorFrequency.get(sample.factorB) || 0) + 1);
      }
      
      // Assign IDs to new factors
      for (const factor of factors) {
        if (!factorToId.has(factor)) {
          const id = nextId++;
          factorToId.set(factor, id);
          idToFactor.set(id, factor);
        }
      }
      
      // Create positive training samples
      const trainingSamples = [];
      
      for (const sample of correlationData) {
        const factorAId = factorToId.get(sample.factorA);
        const factorBId = factorToId.get(sample.factorB);
        
        // Skip invalid or missing factors
        if (factorAId === undefined || factorBId === undefined) {
          continue;
        }
        
        // Map correlation from [-1, 1] to target range
        // Using sigmoid-like transformation
        const correlation = (sample.correlation + 1) / 2;
        
        // Add positive sample
        trainingSamples.push({
          factorAId,
          factorBId,
          correlation,
          isPositive: true
        });
        
        // Symmetric pair (to ensure symmetry in embeddings)
        trainingSamples.push({
          factorAId: factorBId,
          factorBId: factorAId,
          correlation,
          isPositive: true
        });
        
        // Generate negative samples
        for (let n = 0; n < this.numNegativeSamples; n++) {
          // Randomly select a factor different from A and B
          let negativeId;
          do {
            negativeId = Math.floor(Math.random() * nextId);
          } while (negativeId === factorAId || negativeId === factorBId);
          
          // Add negative sample with correlation close to 0
          const negativeCorrelation = Math.max(0, Math.min(0.1, Math.random() * 0.1));
          
          trainingSamples.push({
            factorAId,
            factorBId: negativeId,
            correlation: negativeCorrelation,
            isPositive: false
          });
        }
      }
      
      // Find maximum factor ID
      const maxFactorId = nextId - 1;
      
      return {
        trainingSamples,
        factorToId,
        idToFactor,
        maxFactorId
      };
    } catch (error) {
      logger.error(`FactorEmbedder: Error preparing training data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract embeddings for all factors
   * @returns {Promise<void>}
   * @private
   */
  async extractAllEmbeddings() {
    try {
      if (!this.factorToId || !this.idToFactor) {
        logger.warn('FactorEmbedder: No factor mappings available for extraction');
        return;
      }
      
      // Store current embeddings in history
      if (this.embeddings.size > 0) {
        const timestamp = new Date().toISOString();
        this.embeddingHistory.set(timestamp, new Map(this.embeddings));
        
        // Limit history size
        const maxHistorySize = this.historyWindow;
        if (this.embeddingHistory.size > maxHistorySize) {
          const oldestKey = Array.from(this.embeddingHistory.keys())[0];
          this.embeddingHistory.delete(oldestKey);
        }
      }
      
      // Reset embeddings
      this.embeddings = new Map();
      
      // Process in batches to avoid memory issues
      const batchSize = 100;
      const factorIds = Array.from(this.factorToId.values());
      
      for (let i = 0; i < factorIds.length; i += batchSize) {
        const batchIds = factorIds.slice(i, i + batchSize);
        
        // Create input tensor for batch
        const inputTensor = tf.tensor2d(batchIds.map(id => [id]), null, 'int32');
        
        // Extract embeddings
        const embeddingTensor = this.embeddingExtractor.predict(inputTensor);
        
        // Convert to arrays
        const embeddings = await embeddingTensor.array();
        
        // Store embeddings
        for (let j = 0; j < batchIds.length; j++) {
          const factorId = batchIds[j];
          const factorName = this.idToFactor.get(factorId);
          
          if (factorName) {
            this.embeddings.set(factorName, embeddings[j]);
          }
        }
        
        // Clean up tensors
        tf.dispose([inputTensor, embeddingTensor]);
      }
      
      logger.info(`FactorEmbedder: Extracted embeddings for ${this.embeddings.size} factors`);
    } catch (error) {
      logger.error(`FactorEmbedder: Error extracting embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply temporal regularization to embeddings
   * @private
   */
  applyTemporalRegularization() {
    try {
      // Skip if no history
      if (this.embeddingHistory.size === 0) {
        return;
      }
      
      // Get history entries sorted by timestamp
      const historyEntries = Array.from(this.embeddingHistory.entries())
        .sort((a, b) => new Date(a[0]) - new Date(b[0]));
      
      // Skip if no history
      if (historyEntries.length === 0) {
        return;
      }
      
      // Get latest history
      const latestHistory = historyEntries[historyEntries.length - 1][1];
      
      // Apply regularization - average with historical embeddings
      for (const [factor, embedding] of this.embeddings.entries()) {
        if (latestHistory.has(factor)) {
          const historicalEmbedding = latestHistory.get(factor);
          
          // Apply weighted average with historical embedding
          const alpha = this.temporalRegularization;
          const regularizedEmbedding = embedding.map((val, i) => 
            (1 - alpha) * val + alpha * historicalEmbedding[i]
          );
          
          // Update embedding with regularized version
          this.embeddings.set(factor, regularizedEmbedding);
        }
      }
      
      logger.info('FactorEmbedder: Applied temporal regularization to embeddings');
    } catch (error) {
      logger.error(`FactorEmbedder: Error applying temporal regularization: ${error.message}`);
    }
  }

  /**
   * Get embedding for a specified factor
   * @param {string} factor Factor name
   * @param {Object} options Additional options
   * @returns {Array<number>} Embedding vector
   */
  getEmbedding(factor, options = {}) {
    this.inferenceCount++;
    
    try {
      // Check if embedding exists
      if (this.embeddings.has(factor)) {
        return this.embeddings.get(factor);
      }
      
      // If not, generate a random embedding or return zeros
      if (options.generateRandom) {
        return this.generateRandomEmbedding();
      } else {
        return new Array(this.embeddingDimension).fill(0);
      }
    } catch (error) {
      logger.error(`FactorEmbedder: Error getting embedding for ${factor}: ${error.message}`);
      return new Array(this.embeddingDimension).fill(0);
    }
  }

  /**
   * Get embeddings for multiple factors
   * @param {Array<string>} factors Factor names
   * @param {Object} options Additional options
   * @returns {Object} Map of factor to embedding
   */
  getEmbeddings(factors, options = {}) {
    try {
      const result = {};
      
      for (const factor of factors) {
        result[factor] = this.getEmbedding(factor, options);
      }
      
      return result;
    } catch (error) {
      logger.error(`FactorEmbedder: Error getting multiple embeddings: ${error.message}`);
      return {};
    }
  }

  /**
   * Generate a random embedding vector
   * @returns {Array<number>} Random embedding
   * @private
   */
  generateRandomEmbedding() {
    return Array(this.embeddingDimension)
      .fill(0)
      .map(() => (Math.random() * 2 - 1) * 0.1);
  }

  /**
   * Calculate similarity between two factors
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @returns {number} Similarity score (-1 to 1)
   */
  calculateSimilarity(factorA, factorB) {
    try {
      const embeddingA = this.getEmbedding(factorA);
      const embeddingB = this.getEmbedding(factorB);
      
      // Calculate dot product
      let dotProduct = 0;
      for (let i = 0; i < this.embeddingDimension; i++) {
        dotProduct += embeddingA[i] * embeddingB[i];
      }
      
      // Calculate magnitudes
      let magA = 0;
      let magB = 0;
      
      for (let i = 0; i < this.embeddingDimension; i++) {
        magA += embeddingA[i] * embeddingA[i];
        magB += embeddingB[i] * embeddingB[i];
      }
      
      magA = Math.sqrt(magA);
      magB = Math.sqrt(magB);
      
      // Avoid division by zero
      if (magA === 0 || magB === 0) {
        return 0;
      }
      
      // Calculate cosine similarity
      return dotProduct / (magA * magB);
    } catch (error) {
      logger.error(`FactorEmbedder: Error calculating similarity: ${error.message}`);
      return 0;
    }
  }

  /**
   * Find most similar factors to target
   * @param {string} targetFactor Target factor
   * @param {Object} options Search options
   * @returns {Array<Object>} Ranked similar factors
   */
  findSimilarFactors(targetFactor, options = {}) {
    try {
      // Get target embedding
      const targetEmbedding = this.getEmbedding(targetFactor);
      
      // Default options
      const limit = options.limit || 10;
      const minSimilarity = options.minSimilarity || 0.5;
      const filterSport = options.sport;
      const filterLeague = options.league;
      const filterType = options.type;
      
      // Calculate similarities
      const similarities = [];
      
      for (const [factor, embedding] of this.embeddings.entries()) {
        // Skip the target factor itself
        if (factor === targetFactor) {
          continue;
        }
        
        // Apply filters if specified
        if (filterSport && this.factorSports.get(factor) !== filterSport) {
          continue;
        }
        
        if (filterLeague && this.factorLeagues.get(factor) !== filterLeague) {
          continue;
        }
        
        if (filterType && this.factorTypes.get(factor) !== filterType) {
          continue;
        }
        
        // Calculate similarity
        let dotProduct = 0;
        let magTarget = 0;
        let magFactor = 0;
        
        for (let i = 0; i < this.embeddingDimension; i++) {
          dotProduct += targetEmbedding[i] * embedding[i];
          magTarget += targetEmbedding[i] * targetEmbedding[i];
          magFactor += embedding[i] * embedding[i];
        }
        
        magTarget = Math.sqrt(magTarget);
        magFactor = Math.sqrt(magFactor);
        
        // Skip if magnitudes are zero
        if (magTarget === 0 || magFactor === 0) {
          continue;
        }
        
        // Calculate cosine similarity
        const similarity = dotProduct / (magTarget * magFactor);
        
        // Skip if below minimum similarity
        if (similarity < minSimilarity) {
          continue;
        }
        
        // Add to results
        similarities.push({
          factor,
          similarity,
          type: this.factorTypes.get(factor),
          sport: this.factorSports.get(factor),
          league: this.factorLeagues.get(factor)
        });
      }
      
      // Sort by similarity (descending)
      similarities.sort((a, b) => b.similarity - a.similarity);
      
      // Limit results
      return similarities.slice(0, limit);
    } catch (error) {
      logger.error(`FactorEmbedder: Error finding similar factors: ${error.message}`);
      return [];
    }
  }

  /**
   * Reduce embeddings dimensionality using PCA
   * @param {number} targetDim Target dimensionality
   * @returns {Promise<boolean>} Success flag
   */
  async reduceDimensionality(targetDim) {
    try {
      // Validate target dimension
      if (targetDim <= 0 || targetDim >= this.embeddingDimension) {
        throw new Error(`Invalid target dimension: ${targetDim}`);
      }
      
      // Ensure target is in valid range
      targetDim = Math.max(this.minDimension, Math.min(targetDim, this.maxDimension));
      
      logger.info(`FactorEmbedder: Reducing dimensionality to ${targetDim}`);
      
      // Get all embeddings as a matrix
      const factors = Array.from(this.embeddings.keys());
      const matrix = [];
      
      for (const factor of factors) {
        matrix.push(this.embeddings.get(factor));
      }
      
      // Apply PCA using TensorFlow.js
      const tensorMatrix = tf.tensor2d(matrix);
      
      // Center the data
      const mean = tensorMatrix.mean(0);
      const centeredData = tensorMatrix.sub(mean);
      
      // Compute covariance matrix
      const n = tensorMatrix.shape[0];
      const cov = tf.matMul(centeredData.transpose(), centeredData).div(tf.scalar(n - 1));
      
      // Get eigendecomposition
      const covArray = await cov.array();
      const result = math.eigs(covArray);
      
      // Sort eigenvectors by eigenvalues (descending)
      const eigenvalues = result.values;
      const eigenvectors = result.vectors;
      
      const eigenPairs = [];
      for (let i = 0; i < eigenvalues.length; i++) {
        eigenPairs.push({
          value: eigenvalues[i],
          vector: eigenvectors.map(row => row[i])
        });
      }
      
      eigenPairs.sort((a, b) => b.value - a.value);
      
      // Create projection matrix
      const projectionMatrix = [];
      for (let i = 0; i < targetDim; i++) {
        projectionMatrix.push(eigenPairs[i].vector);
      }
      
      // Convert to tensor
      const projectionTensor = tf.tensor2d(projectionMatrix);
      
      // Project the data
      const projectedData = tf.matMul(centeredData, projectionTensor.transpose());
      
      // Convert back to JavaScript array
      const reducedEmbeddings = await projectedData.array();
      
      // Update embeddings
      for (let i = 0; i < factors.length; i++) {
        this.embeddings.set(factors[i], reducedEmbeddings[i]);
      }
      
      // Update dimension
      this.embeddingDimension = targetDim;
      
      // Clean up tensors
      tf.dispose([tensorMatrix, mean, centeredData, cov, projectionTensor, projectedData]);
      
      logger.info(`FactorEmbedder: Successfully reduced dimensionality to ${targetDim}`);
      return true;
    } catch (error) {
      logger.error(`FactorEmbedder: Error reducing dimensionality: ${error.message}`);
      return false;
    }
  }

  /**
   * Save embeddings to disk
   * @param {string} filePath Optional custom file path
   * @returns {Promise<string>} Path where embeddings were saved
   */
  async saveEmbeddings(filePath = null) {
    try {
      // Create save directory if it doesn't exist
      const saveDir = path.dirname(filePath || this.saveDirectory);
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      
      // Generate file path if not provided
      const actualFilePath = filePath || path.join(
        this.saveDirectory,
        `embeddings_${this.modelVersion}_${new Date().toISOString().replace(/:/g, '-')}.json`
      );
      
      // Prepare data to save
      const embeddingsData = {};
      for (const [factor, embedding] of this.embeddings.entries()) {
        embeddingsData[factor] = embedding;
      }
      
      // Prepare metadata
      const metadata = {
        modelId: this.modelId,
        modelVersion: this.modelVersion,
        embeddingDimension: this.embeddingDimension,
        factorCount: this.embeddings.size,
        timestamp: new Date().toISOString(),
        metadata: {
          factorTypes: Object.fromEntries(this.factorTypes),
          factorSports: Object.fromEntries(this.factorSports),
          factorLeagues: Object.fromEntries(this.factorLeagues),
          factorFrequency: Object.fromEntries(this.factorFrequency)
        }
      };
      
      // Combine data and metadata
      const saveData = {
        embeddings: embeddingsData,
        metadata
      };
      
      // Save to file
      fs.writeFileSync(actualFilePath, JSON.stringify(saveData, null, 2));
      
      logger.info(`FactorEmbedder: Saved embeddings to ${actualFilePath}`);
      return actualFilePath;
    } catch (error) {
      logger.error(`FactorEmbedder: Error saving embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load embeddings from disk
   * @param {string} filePath Path to embeddings file
   * @returns {Promise<boolean>} Success flag
   */
  async loadEmbeddings(filePath) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`Embeddings file not found: ${filePath}`);
      }
      
      // Read file
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      // Validate data structure
      if (!data.embeddings || !data.metadata) {
        throw new Error('Invalid embeddings file format');
      }
      
      // Load embeddings
      this.embeddings = new Map();
      for (const [factor, embedding] of Object.entries(data.embeddings)) {
        this.embeddings.set(factor, embedding);
      }
      
      // Load metadata
      if (data.metadata.modelId) {
        this.modelId = data.metadata.modelId;
      }
      
      if (data.metadata.modelVersion) {
        this.modelVersion = data.metadata.modelVersion;
      }
      
      if (data.metadata.embeddingDimension) {
        this.embeddingDimension = data.metadata.embeddingDimension;
      }
      
      // Load factor metadata if available
      if (data.metadata.metadata) {
        if (data.metadata.metadata.factorTypes) {
          this.factorTypes = new Map(Object.entries(data.metadata.metadata.factorTypes));
        }
        
        if (data.metadata.metadata.factorSports) {
          this.factorSports = new Map(Object.entries(data.metadata.metadata.factorSports));
        }
        
        if (data.metadata.metadata.factorLeagues) {
          this.factorLeagues = new Map(Object.entries(data.metadata.metadata.factorLeagues));
        }
        
        if (data.metadata.metadata.factorFrequency) {
          this.factorFrequency = new Map(Object.entries(data.metadata.metadata.factorFrequency));
        }
      }
      
      logger.info(`FactorEmbedder: Loaded ${this.embeddings.size} embeddings from ${filePath}`);
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error(`FactorEmbedder: Error loading embeddings: ${error.message}`);
      return false;
    }
  }

  /**
   * Save to model registry
   * @param {Object} modelRegistry Model registry instance
   * @returns {Promise<string>} Registry path
   */
  async saveToRegistry(modelRegistry) {
    try {
      if (!modelRegistry) {
        throw new Error('Model registry not provided');
      }
      
      // Save embeddings to temporary file
      const tempFilePath = path.join(
        os.tmpdir(),
        `embeddings_${this.modelId}_${Date.now()}.json`
      );
      
      await this.saveEmbeddings(tempFilePath);
      
      // Upload to registry
      const registryPath = await modelRegistry.uploadModel(
        'factor_embedder',
        this.modelVersion,
        tempFilePath
      );
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      
      logger.info(`FactorEmbedder: Saved to registry at ${registryPath}`);
      return registryPath;
    } catch (error) {
      logger.error(`FactorEmbedder: Error saving to registry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load from model registry
   * @param {Object} modelRegistry Model registry instance
   * @param {string} version Optional specific version to load
   * @returns {Promise<boolean>} Success flag
   */
  async loadFromRegistry(modelRegistry, version = 'latest') {
    try {
      if (!modelRegistry) {
        throw new Error('Model registry not provided');
      }
      
      // Download from registry
      const localPath = await modelRegistry.downloadModel(
        'factor_embedder',
        version
      );
      
      // Load the embeddings
      const success = await this.loadEmbeddings(localPath);
      
      logger.info(`FactorEmbedder: Loaded from registry (${version})`);
      return success;
    } catch (error) {
      logger.error(`FactorEmbedder: Error loading from registry: ${error.message}`);
      return false;
    }
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      embeddingCount: this.embeddings.size,
      dimension: this.embeddingDimension,
      trainingCount: this.trainingHistory.length,
      trainingTimeMs: this.trainingTime,
      inferenceCount: this.inferenceCount,
      lastUpdateTime: this.lastUpdateTime ? this.lastUpdateTime.toISOString() : null
    };
  }
}

module.exports = FactorEmbedder;