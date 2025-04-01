/**
 * Transformer Correlator for Time Series Analysis
 * 
 * Advanced deep learning model for analyzing correlations in time series data
 * using transformer architecture with attention mechanisms
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const tf = require('@tensorflow/tfjs-node');
const math = require('mathjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class TransformerCorrelator {
  /**
   * Initialize the transformer model for sequence analysis
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Model architecture parameters
    this.modelDimension = config.modelDimension || 128;
    this.numHeads = config.numHeads || 8;
    this.numLayers = config.numLayers || 4;
    this.dropoutRate = config.dropoutRate || 0.1;
    this.maxSequenceLength = config.maxSequenceLength || 365;
    
    // Model tracking
    this.model = null;
    this.isInitialized = false;
    this.trainingHistory = [];
    this.modelId = config.modelId || uuidv4();
    this.modelVersion = config.modelVersion || 'v1.0.0';
    
    // Embedding parameters
    this.embeddingDimension = config.embeddingDimension || 64;
    this.positionEncodingType = config.positionEncodingType || 'sinusoidal';
    
    // Paths for model storage
    this.modelSavePath = config.modelSavePath || './models/transformer';
    
    // Preprocessing configuration
    this.normalization = config.normalization || 'z-score';
    this.timeFeatures = config.timeFeatures || ['day_of_week', 'month', 'quarter'];
    this.augmentation = config.augmentation !== false;
    
    // Bind methods to this instance
    this.initialize = this.initialize.bind(this);
    this.train = this.train.bind(this);
    this.predict = this.predict.bind(this);
    this.saveModel = this.saveModel.bind(this);
    this.loadModel = this.loadModel.bind(this);
  }

  /**
   * Initialize the model architecture
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized && this.model) {
      return;
    }

    try {
      logger.info('TransformerCorrelator: Initializing model architecture...');
      
      // Set up input layers
      const sequenceInput = tf.input({
        shape: [null, 3], // [time, valueA, valueB]
        name: 'sequence_input'
      });
      
      const factorAInput = tf.input({
        shape: [this.embeddingDimension],
        name: 'factor_a_embedding',
        sparse: false
      });
      
      const factorBInput = tf.input({
        shape: [this.embeddingDimension],
        name: 'factor_b_embedding',
        sparse: false
      });
      
      // Apply positional encoding to sequence
      const encodedSequence = this.applyPositionalEncoding(sequenceInput);
      
      // Project sequence to model dimension
      let projected = tf.layers.dense({
        units: this.modelDimension,
        activation: 'relu',
        name: 'sequence_projection'
      }).apply(encodedSequence);
      
      // Apply transformer layers
      for (let i = 0; i < this.numLayers; i++) {
        const attention = tf.layers.multiHeadAttention({
          numHeads: this.numHeads,
          keyDim: this.modelDimension / this.numHeads,
          dropout: this.dropoutRate,
          name: `transformer_layer_${i+1}_attention`
        }).apply(projected, projected);
        
        const normalized1 = tf.layers.layerNormalization({
          name: `transformer_layer_${i+1}_norm1`
        }).apply(tf.layers.add().apply([projected, attention]));
        
        const ffn = tf.layers.dense({
          units: this.modelDimension * 4,
          activation: 'gelu',
          name: `transformer_layer_${i+1}_ffn1`
        }).apply(normalized1);
        
        const ffnOut = tf.layers.dense({
          units: this.modelDimension,
          name: `transformer_layer_${i+1}_ffn2`
        }).apply(ffn);
        
        const ffnDropout = tf.layers.dropout({
          rate: this.dropoutRate,
          name: `transformer_layer_${i+1}_dropout`
        }).apply(ffnOut);
        
        projected = tf.layers.layerNormalization({
          name: `transformer_layer_${i+1}_norm2`
        }).apply(tf.layers.add().apply([normalized1, ffnDropout]));
      }
      
      // Global average pooling over time dimension
      const pooled = tf.layers.globalAveragePooling1D({
        name: 'global_pooling'
      }).apply(projected);
      
      // Combine with factor embeddings
      const combined = tf.layers.concatenate({
        name: 'combined_features'
      }).apply([pooled, factorAInput, factorBInput]);
      
      // Output layers
      const dense1 = tf.layers.dense({
        units: 64,
        activation: 'relu',
        name: 'output_dense1'
      }).apply(combined);
      
      const dropout = tf.layers.dropout({
        rate: 0.2,
        name: 'output_dropout'
      }).apply(dense1);
      
      // Multiple output heads
      const correlationOutput = tf.layers.dense({
        units: 1,
        activation: 'tanh', // Range [-1, 1]
        name: 'correlation_output'
      }).apply(dropout);
      
      const confidenceOutput = tf.layers.dense({
        units: 1,
        activation: 'sigmoid', // Range [0, 1]
        name: 'confidence_output'
      }).apply(dropout);
      
      const uncertaintyOutput = tf.layers.dense({
        units: 1,
        activation: 'sigmoid', // Range [0, 1]
        name: 'uncertainty_output'
      }).apply(dropout);
      
      // Create model
      this.model = tf.model({
        inputs: [sequenceInput, factorAInput, factorBInput],
        outputs: [correlationOutput, confidenceOutput, uncertaintyOutput],
        name: 'transformer_correlator'
      });
      
      // Compile model
      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: {
          correlation_output: 'meanSquaredError',
          confidence_output: 'binaryCrossentropy',
          uncertainty_output: 'meanSquaredError'
        },
        metrics: {
          correlation_output: ['meanAbsoluteError'],
          confidence_output: ['accuracy'],
          uncertainty_output: ['meanAbsoluteError']
        },
        loss_weights: {
          correlation_output: 1.0,
          confidence_output: 0.5,
          uncertainty_output: 0.5
        }
      });
      
      // Save model summary
      const modelSummary = [];
      this.model.summary((line) => modelSummary.push(line));
      logger.info(`TransformerCorrelator: Model initialized\n${modelSummary.join('\n')}`);
      
      this.isInitialized = true;
    } catch (error) {
      logger.error(`TransformerCorrelator: Initialization error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply positional encoding to the input sequence
   * @param {tf.SymbolicTensor} input Input tensor
   * @returns {tf.SymbolicTensor} Encoded tensor
   * @private
   */
  applyPositionalEncoding(input) {
    if (this.positionEncodingType === 'learned') {
      // Use a learned positional embedding
      const posEmbedding = tf.layers.embedding({
        inputDim: this.maxSequenceLength,
        outputDim: input.shape[2],
        name: 'position_embedding'
      });
      
      const positions = tf.range(0, this.maxSequenceLength).expandDims(0);
      const encodedPos = posEmbedding.apply(positions);
      
      // Add positional encoding to input
      return tf.layers.add().apply([input, encodedPos]);
    } else {
      // Use fixed sinusoidal encoding
      // This is implemented as a Lambda layer that adds sinusoidal positional encoding
      return tf.layers.lambda({
        name: 'sinusoidal_position_encoding',
        outputShape: input.shape,
        function: (x) => this.addSinusoidalEncoding(x)
      }).apply(input);
    }
  }

  /**
   * Add sinusoidal encoding to input tensor
   * @param {tf.Tensor} x Input tensor
   * @returns {tf.Tensor} Tensor with positional encoding added
   * @private
   */
  addSinusoidalEncoding(x) {
    const sequenceLength = x.shape[1];
    const hiddenSize = x.shape[2];
    
    // Generate position indices
    const positions = tf.range(0, sequenceLength).expandDims(1);
    
    // Generate dimension indices
    const dimIndices = tf.range(0, hiddenSize).expandDims(0);
    
    // Compute factors for even and odd dimensions
    const evenIndices = dimIndices.floorDiv(2).mul(2); // Even indices: 0, 2, 4...
    const angles = positions.cast('float32').mul(tf.pow(10000, evenIndices.neg().div(hiddenSize).cast('float32')));
    
    // Generate encodings with sin for even dimensions and cos for odd dimensions
    const even = tf.sin(angles);
    const odd = tf.cos(angles);
    
    // Merge even and odd encodings
    const encodings = tf.concat([even, odd], -1).slice([0, 0], [sequenceLength, hiddenSize]);
    
    // Add to input
    return x.add(encodings);
  }

  /**
   * Train the model on correlation data
   * @param {Array<Object>} samples Training samples
   * @param {Object} config Training configuration
   * @returns {Promise<Object>} Training results
   */
  async train(samples, config = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      logger.info(`TransformerCorrelator: Starting training with ${samples.length} samples...`);
      
      // Preprocess samples
      const preprocessedData = this.preprocessSamples(samples);
      
      // Configure training parameters
      const batchSize = config.batchSize || 32;
      const epochs = config.epochs || 50;
      const validationSplit = config.validationSplit || 0.2;
      const earlyStoppingPatience = config.patienceEpochs || 5;
      
      // Prepare callbacks
      const callbacks = [];
      
      if (config.earlyStopping !== false) {
        callbacks.push(tf.callbacks.earlyStopping({
          monitor: 'val_loss',
          patience: earlyStoppingPatience,
          restoreBestWeights: true
        }));
      }
      
      // Train the model
      const history = await this.model.fit(
        [preprocessedData.sequenceData, preprocessedData.embeddingA, preprocessedData.embeddingB],
        [
          preprocessedData.correlationTargets,
          preprocessedData.confidenceTargets,
          preprocessedData.uncertaintyTargets
        ],
        {
          batchSize,
          epochs,
          validationSplit,
          callbacks,
          verbose: 1
        }
      );
      
      // Store training history
      this.trainingHistory.push({
        timestamp: new Date().toISOString(),
        epochs: history.epoch.length,
        trainLoss: history.history.loss[history.history.loss.length - 1],
        valLoss: history.history.val_loss[history.history.val_loss.length - 1],
        metrics: {
          correlation_mae: history.history.correlation_output_mean_absolute_error[history.history.correlation_output_mean_absolute_error.length - 1],
          confidence_accuracy: history.history.confidence_output_accuracy[history.history.confidence_output_accuracy.length - 1]
        }
      });
      
      logger.info(`TransformerCorrelator: Training completed in ${history.epoch.length} epochs`);
      
      // Save model
      await this.saveModel();
      
      return {
        epochs: history.epoch.length,
        trainLoss: history.history.loss[history.history.loss.length - 1],
        valLoss: history.history.val_loss[history.history.val_loss.length - 1],
        majorArchitectureChange: false,
        modelVersion: this.modelVersion
      };
    } catch (error) {
      logger.error(`TransformerCorrelator: Training error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Preprocess samples for training
   * @param {Array<Object>} samples Raw training samples
   * @returns {Object} Preprocessed data tensors
   * @private
   */
  preprocessSamples(samples) {
    // Prepare arrays for each input/output
    const sequenceData = [];
    const embeddingA = [];
    const embeddingB = [];
    const correlationTargets = [];
    const confidenceTargets = [];
    const uncertaintyTargets = [];
    
    // Process each sample
    for (const sample of samples) {
      // Extract time series
      const timeSeries = sample.timeSeries || [];
      
      // Skip if not enough data points
      if (timeSeries.length < 3) {
        continue;
      }
      
      // Normalize and pad/truncate sequence
      const normalizedSeries = this.normalizeTimeSeries(timeSeries);
      const processed = this.padOrTruncateSequence(normalizedSeries, this.maxSequenceLength);
      sequenceData.push(processed);
      
      // Get or generate factor embeddings
      const factorAEmb = sample.embeddingA || this.generateRandomEmbedding();
      const factorBEmb = sample.embeddingB || this.generateRandomEmbedding();
      embeddingA.push(factorAEmb);
      embeddingB.push(factorBEmb);
      
      // Target values
      correlationTargets.push([sample.correlation]);
      confidenceTargets.push([sample.confidence || 0.7]);
      
      // Calculate uncertainty as inverse of confidence and data volume
      const uncertainty = 1 - (sample.confidence || 0.7) * Math.min(1, (sample.dataPoints || 30) / 100);
      uncertaintyTargets.push([uncertainty]);
    }
    
    // Convert to tensors
    return {
      sequenceData: tf.tensor3d(sequenceData),
      embeddingA: tf.tensor2d(embeddingA),
      embeddingB: tf.tensor2d(embeddingB),
      correlationTargets: tf.tensor2d(correlationTargets),
      confidenceTargets: tf.tensor2d(confidenceTargets),
      uncertaintyTargets: tf.tensor2d(uncertaintyTargets)
    };
  }

  /**
   * Normalize time series data
   * @param {Array<Object>} timeSeries Array of time points
   * @returns {Array<Array<number>>} Normalized sequence
   * @private
   */
  normalizeTimeSeries(timeSeries) {
    // Extract values
    const times = timeSeries.map(point => new Date(point.date).getTime());
    const valuesA = timeSeries.map(point => point.valueA);
    const valuesB = timeSeries.map(point => point.valueB);
    
    // Calculate statistics for normalization
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime;
    
    let meanA, stdA, meanB, stdB;
    
    if (this.normalization === 'z-score') {
      // Z-score normalization
      meanA = math.mean(valuesA);
      stdA = math.std(valuesA) || 1; // Avoid division by zero
      meanB = math.mean(valuesB);
      stdB = math.std(valuesB) || 1;
    } else {
      // Min-max normalization
      const minA = Math.min(...valuesA);
      const maxA = Math.max(...valuesA);
      const minB = Math.min(...valuesB);
      const maxB = Math.max(...valuesB);
      
      meanA = minA;
      stdA = maxA - minA || 1;
      meanB = minB;
      stdB = maxB - minB || 1;
    }
    
    // Normalize the sequence
    return timeSeries.map(point => {
      const normalizedTime = timeRange > 0 
        ? (new Date(point.date).getTime() - minTime) / timeRange 
        : 0.5;
      
      const normalizedA = this.normalization === 'z-score'
        ? (point.valueA - meanA) / stdA
        : (point.valueA - meanA) / stdA;
      
      const normalizedB = this.normalization === 'z-score'
        ? (point.valueB - meanB) / stdB
        : (point.valueB - meanB) / stdB;
      
      return [normalizedTime, normalizedA, normalizedB];
    });
  }

  /**
   * Pad or truncate sequence to desired length
   * @param {Array<Array<number>>} sequence Sequence to adjust
   * @param {number} targetLength Desired length
   * @returns {Array<Array<number>>} Adjusted sequence
   * @private
   */
  padOrTruncateSequence(sequence, targetLength) {
    if (sequence.length === targetLength) {
      return sequence;
    } else if (sequence.length > targetLength) {
      // Truncate by taking evenly spaced samples
      const result = [];
      const step = sequence.length / targetLength;
      
      for (let i = 0; i < targetLength; i++) {
        const idx = Math.min(Math.floor(i * step), sequence.length - 1);
        result.push(sequence[idx]);
      }
      
      return result;
    } else {
      // Pad with zeros at the beginning
      const padding = new Array(targetLength - sequence.length).fill([0, 0, 0]);
      return [...padding, ...sequence];
    }
  }

  /**
   * Generate a random embedding vector
   * @returns {Array<number>} Random embedding
   * @private
   */
  generateRandomEmbedding() {
    return Array(this.embeddingDimension).fill(0).map(() => Math.random() * 2 - 1);
  }

  /**
   * Make a correlation prediction for two factors
   * @param {Object} input Prediction input data
   * @returns {Promise<Object>} Prediction results
   */
  async predict(input) {
    try {
      if (!this.isInitialized || !this.model) {
        await this.initialize();
      }
      
      // Extract inputs
      const { sequence, factorA, factorB, factorEmbeddingA, factorEmbeddingB } = input;
      
      // Preprocess sequence
      const normalizedSequence = this.normalizeTimeSeries(sequence);
      const processedSequence = this.padOrTruncateSequence(normalizedSequence, this.maxSequenceLength);
      
      // Create tensors
      const sequenceTensor = tf.tensor3d([processedSequence]);
      const embeddingATensor = tf.tensor2d([factorEmbeddingA || this.generateRandomEmbedding()]);
      const embeddingBTensor = tf.tensor2d([factorEmbeddingB || this.generateRandomEmbedding()]);
      
      // Make prediction
      const [correlationTensor, confidenceTensor, uncertaintyTensor] = 
        this.model.predict([sequenceTensor, embeddingATensor, embeddingBTensor]);
      
      // Extract values
      const correlation = correlationTensor.dataSync()[0];
      const confidence = confidenceTensor.dataSync()[0];
      const uncertainty = uncertaintyTensor.dataSync()[0];
      
      // Calculate effective sample size based on sequence length
      const effectiveSampleSize = sequence.length * confidence;
      
      // Calculate recency score (weight of recent data)
      const recencyScore = this.calculateRecencyScore(sequence);
      
      // Clean up tensors
      tf.dispose([correlationTensor, confidenceTensor, uncertaintyTensor, 
                  sequenceTensor, embeddingATensor, embeddingBTensor]);
      
      return {
        correlation,
        confidence,
        uncertainty,
        confidenceInterval: [
          Math.max(-1, correlation - uncertainty),
          Math.min(1, correlation + uncertainty)
        ],
        effectiveSampleSize,
        recencyScore,
        nonLinearityScore: this.estimateNonLinearity(sequence),
        factorA,
        factorB
      };
    } catch (error) {
      logger.error(`TransformerCorrelator: Prediction error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate recency score for a sequence
   * @param {Array<Object>} sequence Time sequence
   * @returns {number} Recency score (0-1)
   * @private
   */
  calculateRecencyScore(sequence) {
    if (!sequence || sequence.length === 0) {
      return 0.5;
    }
    
    try {
      const dates = sequence.map(point => new Date(point.date));
      const now = new Date();
      
      // Sort dates chronologically
      dates.sort((a, b) => a - b);
      
      // Calculate age in days for each data point
      const agesInDays = dates.map(date => (now - date) / (1000 * 60 * 60 * 24));
      
      // Apply exponential decay weighting
      const halfLifeDays = 30;
      const weights = agesInDays.map(age => Math.exp(-age / halfLifeDays));
      
      // Calculate weighted sum
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      
      // Normalize to 0-1 range
      if (totalWeight === 0) return 0.5;
      
      // Calculate recency as normalized sum of recent weights
      const recentThreshold = 30; // Days considered "recent"
      const recentWeights = weights.filter((_, i) => agesInDays[i] <= recentThreshold);
      const recentWeight = recentWeights.reduce((sum, w) => sum + w, 0);
      
      return recentWeight / totalWeight;
    } catch (error) {
      logger.error(`TransformerCorrelator: Recency score error: ${error.message}`);
      return 0.5;
    }
  }

  /**
   * Estimate non-linearity in the relationship between two series
   * @param {Array<Object>} sequence Time sequence
   * @returns {number} Non-linearity score (0-1)
   * @private
   */
  estimateNonLinearity(sequence) {
    if (!sequence || sequence.length < 10) {
      return 0;
    }
    
    try {
      // Extract values
      const valuesA = sequence.map(point => point.valueA);
      const valuesB = sequence.map(point => point.valueB);
      
      // Calculate linear correlation
      const meanA = math.mean(valuesA);
      const meanB = math.mean(valuesB);
      
      let numerator = 0;
      let denominatorA = 0;
      let denominatorB = 0;
      
      for (let i = 0; i < valuesA.length; i++) {
        const diffA = valuesA[i] - meanA;
        const diffB = valuesB[i] - meanB;
        
        numerator += diffA * diffB;
        denominatorA += diffA * diffA;
        denominatorB += diffB * diffB;
      }
      
      const linearCorrelation = numerator / (Math.sqrt(denominatorA) * Math.sqrt(denominatorB));
      
      // Calculate non-linear measures
      // 1. Spearman rank correlation
      const ranksA = this.calculateRanks(valuesA);
      const ranksB = this.calculateRanks(valuesB);
      
      let spearmanNumerator = 0;
      let spearmanDenominatorA = 0;
      let spearmanDenominatorB = 0;
      
      const meanRankA = math.mean(ranksA);
      const meanRankB = math.mean(ranksB);
      
      for (let i = 0; i < ranksA.length; i++) {
        const diffA = ranksA[i] - meanRankA;
        const diffB = ranksB[i] - meanRankB;
        
        spearmanNumerator += diffA * diffB;
        spearmanDenominatorA += diffA * diffA;
        spearmanDenominatorB += diffB * diffB;
      }
      
      const spearmanCorrelation = spearmanNumerator / (Math.sqrt(spearmanDenominatorA) * Math.sqrt(spearmanDenominatorB));
      
      // 2. Test quadratic relationship using polynomial regression
      const n = valuesA.length;
      const x = valuesA;
      const y = valuesB;
      const x2 = x.map(v => v * v);
      
      // Calculate coefficients for y = a + bx + cx²
      const sumX = x.reduce((sum, val) => sum + val, 0);
      const sumX2 = x2.reduce((sum, val) => sum + val, 0);
      const sumX3 = x.reduce((sum, val) => sum + val * val * val, 0);
      const sumX4 = x.reduce((sum, val) => sum + val * val * val * val, 0);
      const sumY = y.reduce((sum, val) => sum + val, 0);
      const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
      const sumX2Y = x2.reduce((sum, val, i) => sum + val * y[i], 0);
      
      // Solve system of equations for a, b, c
      const matrix = [
        [n, sumX, sumX2],
        [sumX, sumX2, sumX3],
        [sumX2, sumX3, sumX4]
      ];
      
      const vector = [sumY, sumXY, sumX2Y];
      const coeffs = math.lusolve(matrix, vector);
      const a = coeffs[0][0];
      const b = coeffs[1][0];
      const c = coeffs[2][0];
      
      // Calculate R² for linear vs quadratic fit
      let linearSumSquares = 0;
      let quadraticSumSquares = 0;
      let totalSumSquares = 0;
      
      for (let i = 0; i < n; i++) {
        const linearPredicted = meanB + linearCorrelation * (x[i] - meanA) * (math.std(y) / math.std(x));
        const quadraticPredicted = a + b * x[i] + c * x[i] * x[i];
        
        linearSumSquares += Math.pow(y[i] - linearPredicted, 2);
        quadraticSumSquares += Math.pow(y[i] - quadraticPredicted, 2);
        totalSumSquares += Math.pow(y[i] - meanB, 2);
      }
      
      const linearR2 = 1 - linearSumSquares / totalSumSquares;
      const quadraticR2 = 1 - quadraticSumSquares / totalSumSquares;
      
      // Calculate non-linearity score as improvement from linear to quadratic
      const r2Improvement = Math.max(0, quadraticR2 - linearR2);
      
      // Calculate difference between Pearson and Spearman
      const correlationDifference = Math.abs(linearCorrelation - spearmanCorrelation);
      
      // Combine measures into final non-linearity score
      const nonLinearityScore = Math.min(1, (r2Improvement * 5 + correlationDifference * 3) / 2);
      
      return nonLinearityScore;
    } catch (error) {
      logger.error(`TransformerCorrelator: Non-linearity estimation error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calculate ranks for an array of values
   * @param {Array<number>} values Values to rank
   * @returns {Array<number>} Ranks
   * @private
   */
  calculateRanks(values) {
    // Create array of indices
    const indices = values.map((_, i) => i);
    
    // Sort indices by values
    indices.sort((a, b) => values[a] - values[b]);
    
    // Assign ranks
    const ranks = new Array(values.length);
    
    for (let i = 0; i < indices.length; i++) {
      ranks[indices[i]] = i + 1;
    }
    
    // Handle ties by averaging ranks
    const valueRankMap = new Map();
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!valueRankMap.has(value)) {
        valueRankMap.set(value, []);
      }
      valueRankMap.get(value).push(i);
    }
    
    for (const [_, indices] of valueRankMap.entries()) {
      if (indices.length > 1) {
        // Average the ranks for tied values
        const avgRank = indices.reduce((sum, i) => sum + ranks[i], 0) / indices.length;
        for (const i of indices) {
          ranks[i] = avgRank;
        }
      }
    }
    
    return ranks;
  }

  /**
   * Get attention weights for interpretability
   * @param {Object} input Prediction input
   * @returns {Promise<Array<Array<Array<number>>>>} Attention weights
   */
  async getAttentionWeights(input) {
    try {
      if (!this.isInitialized || !this.model) {
        await this.initialize();
      }
      
      // Extract attention layers
      const attentionLayers = this.model.layers.filter(
        layer => layer.name.includes('attention')
      );
      
      if (attentionLayers.length === 0) {
        return [];
      }
      
      // Extract inputs
      const { sequence, factorEmbeddingA, factorEmbeddingB } = input;
      
      // Preprocess sequence
      const normalizedSequence = this.normalizeTimeSeries(sequence);
      const processedSequence = this.padOrTruncateSequence(normalizedSequence, this.maxSequenceLength);
      
      // Create tensors
      const sequenceTensor = tf.tensor3d([processedSequence]);
      const embeddingATensor = tf.tensor2d([factorEmbeddingA || this.generateRandomEmbedding()]);
      const embeddingBTensor = tf.tensor2d([factorEmbeddingB || this.generateRandomEmbedding()]);
      
      // Create intermediate model that outputs attention weights
      const attentionWeights = [];
      
      // Extract weights from each attention layer
      for (const layer of attentionLayers) {
        // Create an intermediate model for this layer
        const intermediateModel = tf.model({
          inputs: this.model.inputs,
          outputs: layer.output[1] // Attention weights
        });
        
        // Get attention weights
        const weights = intermediateModel.predict(
          [sequenceTensor, embeddingATensor, embeddingBTensor]
        );
        
        // Convert to array
        const weightsArray = await weights.array();
        attentionWeights.push(weightsArray[0]); // First batch item
        
        // Clean up
        tf.dispose(weights);
      }
      
      // Clean up input tensors
      tf.dispose([sequenceTensor, embeddingATensor, embeddingBTensor]);
      
      return attentionWeights;
    } catch (error) {
      logger.error(`TransformerCorrelator: Error getting attention weights: ${error.message}`);
      return [];
    }
  }

  /**
   * Predict counterfactual propagation using the transformer model
   * @param {Object} input Counterfactual input data
   * @returns {Promise<Object>} Propagated probabilities
   */
  async predictCounterfactual(input) {
    try {
      if (!this.isInitialized || !this.model) {
        await this.initialize();
      }
      
      // Extract inputs
      const { 
        factors,
        baseProbabilities,
        changeIndex,
        newProbability,
        correlationMatrix,
        embeddings
      } = input;
      
      // Prepare embeddings
      const factorEmbeddings = [];
      for (const factor of factors) {
        factorEmbeddings.push(
          embeddings && embeddings[factor] ? embeddings[factor] : this.generateRandomEmbedding()
        );
      }
      
      // Create input tensors
      const factorEmbeddingsTensor = tf.tensor2d(factorEmbeddings);
      const baseProbabilitiesTensor = tf.tensor1d(baseProbabilities);
      const correlationMatrixTensor = tf.tensor2d(correlationMatrix);
      
      // Create counterfactual tensor
      const counterfactualTensor = tf.tensor1d(
        factors.map((_, i) => i === changeIndex ? 1 : 0)
      );
      
      // Create change magnitude tensor
      const changeMagnitudeTensor = tf.scalar(newProbability - baseProbabilities[changeIndex]);
      
      // Define and run propagation model
      const propagatedTensor = tf.tidy(() => {
        // 1. Calculate direct effects based on correlation
        const directEffects = tf.matrixTimesVector(
          correlationMatrixTensor, 
          counterfactualTensor
        ).mul(changeMagnitudeTensor);
        
        // 2. Apply propagation dampening factor
        const dampening = tf.scalar(0.7);
        const dampened = directEffects.mul(dampening);
        
        // 3. Add to base probabilities
        const rawProbabilities = baseProbabilitiesTensor.add(dampened);
        
        // 4. Ensure the changed factor is exactly the new value
        const mask = counterfactualTensor.mul(-1).add(1); // Invert mask (0 for changed factor, 1 for others)
        const changedValue = tf.scalar(newProbability).mul(counterfactualTensor);
        
        return rawProbabilities.mul(mask).add(changedValue);
      });
      
      // Convert to array and ensure valid probability range
      const propagatedArray = await propagatedTensor.array();
      const propagatedProbabilities = propagatedArray.map(p => Math.max(0, Math.min(1, p)));
      
      // Clean up tensors
      tf.dispose([
        factorEmbeddingsTensor,
        baseProbabilitiesTensor,
        correlationMatrixTensor,
        counterfactualTensor,
        changeMagnitudeTensor,
        propagatedTensor
      ]);
      
      return {
        propagatedProbabilities,
        factorIndices: factors.map((_, i) => i)
      };
    } catch (error) {
      logger.error(`TransformerCorrelator: Counterfactual prediction error: ${error.message}`);
      
      // Return a fallback propagation
      return {
        propagatedProbabilities: input.baseProbabilities.map((p, i) => 
          i === input.changeIndex ? input.newProbability : p
        ),
        factorIndices: input.factors.map((_, i) => i),
        error: error.message
      };
    }
  }

  /**
   * Evaluate model on test data
   * @param {Array<Object>} testSamples Test samples
   * @returns {Promise<Object>} Evaluation results
   */
  async evaluate(testSamples) {
    try {
      if (!this.isInitialized || !this.model) {
        await this.initialize();
      }
      
      // No samples to evaluate
      if (!testSamples || testSamples.length === 0) {
        return { loss: 0, accuracy: 0, r2: 0 };
      }
      
      // Preprocess test samples
      const preprocessedData = this.preprocessSamples(testSamples);
      
      // Evaluate model
      const result = await this.model.evaluate(
        [preprocessedData.sequenceData, preprocessedData.embeddingA, preprocessedData.embeddingB],
        [
          preprocessedData.correlationTargets,
          preprocessedData.confidenceTargets,
          preprocessedData.uncertaintyTargets
        ],
        { batchSize: 32 }
      );
      
      // Extract metrics
      const totalLoss = result[0].dataSync()[0];
      const correlationMae = result[1].dataSync()[0]; // Mean absolute error
      const confidenceAccuracy = result[3].dataSync()[0]; // Accuracy
      
      // Calculate R² for correlation predictions
      const predictions = await this.model.predict(
        [preprocessedData.sequenceData, preprocessedData.embeddingA, preprocessedData.embeddingB]
      );
      
      const predictedCorrelations = await predictions[0].array();
      const actualCorrelations = await preprocessedData.correlationTargets.array();
      
      const r2 = this.calculateR2(
        actualCorrelations.flat(),
        predictedCorrelations.flat()
      );
      
      // Clean up tensors
      tf.dispose([...result, ...predictions, 
                 preprocessedData.sequenceData, 
                 preprocessedData.embeddingA, 
                 preprocessedData.embeddingB,
                 preprocessedData.correlationTargets,
                 preprocessedData.confidenceTargets,
                 preprocessedData.uncertaintyTargets]);
      
      return {
        loss: totalLoss,
        correlationMae,
        accuracy: confidenceAccuracy,
        r2
      };
    } catch (error) {
      logger.error(`TransformerCorrelator: Evaluation error: ${error.message}`);
      return { loss: Infinity, accuracy: 0, r2: 0, error: error.message };
    }
  }

  /**
   * Calculate R² (coefficient of determination)
   * @param {Array<number>} actual Actual values
   * @param {Array<number>} predicted Predicted values
   * @returns {number} R² value
   * @private
   */
  calculateR2(actual, predicted) {
    const mean = actual.reduce((sum, val) => sum + val, 0) / actual.length;
    
    let ssTot = 0; // Total sum of squares
    let ssRes = 0; // Residual sum of squares
    
    for (let i = 0; i < actual.length; i++) {
      ssTot += Math.pow(actual[i] - mean, 2);
      ssRes += Math.pow(actual[i] - predicted[i], 2);
    }
    
    if (ssTot === 0) return 0;
    
    return 1 - (ssRes / ssTot);
  }

  /**
   * Save model to disk
   * @param {string} savePath Optional custom save path
   * @returns {Promise<string>} Path where model was saved
   */
  async saveModel(savePath = null) {
    try {
      if (!this.isInitialized || !this.model) {
        throw new Error('Model not initialized');
      }
      
      // Create directory if it doesn't exist
      const modelDir = savePath || this.modelSavePath;
      if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
      }
      
      // Create a unique path for this model version
      const modelPath = path.join(
        modelDir,
        `transformer_correlator_${this.modelVersion}_${this.modelId}`
      );
      
      // Save the model
      await this.model.save(`file://${modelPath}`);
      
      // Save metadata
      const metadata = {
        modelId: this.modelId,
        modelVersion: this.modelVersion,
        modelDimension: this.modelDimension,
        numHeads: this.numHeads,
        numLayers: this.numLayers,
        embeddingDimension: this.embeddingDimension,
        maxSequenceLength: this.maxSequenceLength,
        trainingHistory: this.trainingHistory,
        savedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(modelPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      logger.info(`TransformerCorrelator: Model saved to ${modelPath}`);
      return modelPath;
    } catch (error) {
      logger.error(`TransformerCorrelator: Save error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load model from disk
   * @param {string} modelPath Path to load model from
   * @returns {Promise<void>}
   */
  async loadModel(modelPath) {
    try {
      // Check if path exists
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model path ${modelPath} does not exist`);
      }
      
      // Load the model
      this.model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
      
      // Load metadata
      const metadataPath = path.join(modelPath, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        // Update model properties
        this.modelId = metadata.modelId;
        this.modelVersion = metadata.modelVersion;
        this.modelDimension = metadata.modelDimension;
        this.numHeads = metadata.numHeads;
        this.numLayers = metadata.numLayers;
        this.embeddingDimension = metadata.embeddingDimension;
        this.maxSequenceLength = metadata.maxSequenceLength;
        this.trainingHistory = metadata.trainingHistory || [];
      }
      
      // Compile the model
      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: {
          correlation_output: 'meanSquaredError',
          confidence_output: 'binaryCrossentropy',
          uncertainty_output: 'meanSquaredError'
        },
        metrics: {
          correlation_output: ['meanAbsoluteError'],
          confidence_output: ['accuracy'],
          uncertainty_output: ['meanAbsoluteError']
        }
      });
      
      this.isInitialized = true;
      logger.info(`TransformerCorrelator: Model loaded from ${modelPath}`);
    } catch (error) {
      logger.error(`TransformerCorrelator: Load error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save model to registry
   * @param {Object} modelRegistry Model registry instance
   * @returns {Promise<string>} Registry path
   */
  async saveToRegistry(modelRegistry) {
    try {
      if (!modelRegistry) {
        throw new Error('Model registry not provided');
      }
      
      if (!this.isInitialized || !this.model) {
        throw new Error('Model not initialized');
      }
      
      // Save model to temporary directory
      const tempDir = await this.saveModel();
      
      // Upload to registry
      const registryPath = await modelRegistry.uploadModel(
        'transformer_correlator',
        this.modelVersion,
        tempDir
      );
      
      logger.info(`TransformerCorrelator: Model saved to registry at ${registryPath}`);
      return registryPath;
    } catch (error) {
      logger.error(`TransformerCorrelator: Registry save error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load model from registry
   * @param {Object} modelRegistry Model registry instance
   * @param {string} version Optional specific version to load
   * @returns {Promise<void>}
   */
  async loadFromRegistry(modelRegistry, version = 'latest') {
    try {
      if (!modelRegistry) {
        throw new Error('Model registry not provided');
      }
      
      // Download from registry
      const localPath = await modelRegistry.downloadModel(
        'transformer_correlator',
        version
      );
      
      // Load the model
      await this.loadModel(localPath);
      
      logger.info(`TransformerCorrelator: Model loaded from registry (${version})`);
    } catch (error) {
      logger.error(`TransformerCorrelator: Registry load error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = TransformerCorrelator;