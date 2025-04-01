/**
 * Bayesian Neural Network for Uncertainty Quantification
 * 
 * Implements variational inference with reparameterization trick
 * for neural networks with uncertainty estimation
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class BayesianNeuralNetwork {
  /**
   * Initialize the Bayesian Neural Network
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Model architecture parameters
    this.inputDimension = config.inputDimension || 256;
    this.hiddenDimensions = config.hiddenDimensions || [128, 64];
    this.outputDimension = config.outputDimension || 1;
    
    // Bayesian parameters
    this.priorScale = config.priorScale || 1.0;
    this.posteriorScale = config.posteriorScale || 0.1;
    this.klWeight = config.klWeight || 1.0;
    this.numSamples = config.numSamples || 10;
    
    // Model tracking
    this.model = null;
    this.isInitialized = false;
    this.trainingHistory = [];
    this.modelId = config.modelId || uuidv4();
    this.modelVersion = config.modelVersion || 'v1.0.0';
    
    // Paths for model storage
    this.modelSavePath = config.modelSavePath || './models/bayesian_nn';
    
    // Binding methods
    this.initialize = this.initialize.bind(this);
    this.predict = this.predict.bind(this);
    this.train = this.train.bind(this);
    this.saveModel = this.saveModel.bind(this);
    this.loadModel = this.loadModel.bind(this);
  }

  /**
   * Initialize the Bayesian Neural Network
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized && this.model) {
      return;
    }

    try {
      logger.info('BayesianNN: Initializing model architecture...');
      
      // Create custom Bayesian Dense layer using reparameterization trick
      class BayesianDenseLayer extends tf.layers.Layer {
        constructor(config) {
          super(config);
          this.units = config.units;
          this.activation = tf.activations.get(config.activation);
          this.useBias = config.useBias !== false;
          this.priorScale = config.priorScale || 1.0;
          this.posteriorScale = config.posteriorScale || 0.1;
        }
        
        build(inputShape) {
          // Weight mean parameters
          this.kernelMean = this.addWeight(
            'kernel_mean',
            [inputShape[inputShape.length - 1], this.units],
            'float32',
            tf.initializers.glorotNormal()
          );
          
          // Weight log variance parameters
          this.kernelLogVar = this.addWeight(
            'kernel_log_var',
            [inputShape[inputShape.length - 1], this.units],
            'float32',
            tf.initializers.constant({ value: Math.log(this.posteriorScale) })
          );
          
          if (this.useBias) {
            // Bias mean parameters
            this.biasMean = this.addWeight(
              'bias_mean',
              [this.units],
              'float32',
              tf.initializers.zeros()
            );
            
            // Bias log variance parameters
            this.biasLogVar = this.addWeight(
              'bias_log_var',
              [this.units],
              'float32',
              tf.initializers.constant({ value: Math.log(this.posteriorScale) })
            );
          }
          
          this.built = true;
        }
        
        // KL divergence between variational posterior and prior
        computeKLDivergence() {
          return tf.tidy(() => {
            // Prior: N(0, priorScale²)
            // Posterior: N(mean, exp(log_var))
            
            // KL divergence for weights
            const weightKL = this.computeKLForTensor(
              this.kernelMean, this.kernelLogVar, this.priorScale
            );
            
            if (this.useBias) {
              // KL divergence for biases
              const biasKL = this.computeKLForTensor(
                this.biasMean, this.biasLogVar, this.priorScale
              );
              
              return weightKL.add(biasKL);
            }
            
            return weightKL;
          });
        }
        
        // Compute KL divergence for a specific tensor
        computeKLForTensor(mean, logVar, priorScale) {
          return tf.tidy(() => {
            const variance = tf.exp(logVar);
            const priorVariance = tf.scalar(priorScale * priorScale);
            
            // KL[N(mean, var) || N(0, priorScale²)]
            // 0.5 * sum(var/priorVar + mean²/priorVar - 1 - log(var/priorVar))
            const term1 = variance.div(priorVariance);
            const term2 = mean.square().div(priorVariance);
            const term3 = tf.onesLike(variance);
            const term4 = logVar.sub(tf.log(priorVariance));
            
            return term1.add(term2).sub(term3).sub(term4)
              .mul(tf.scalar(0.5))
              .sum();
          });
        }
        
        // Reparameterized sampling
        sampleWeights(training) {
          return tf.tidy(() => {
            if (!training) {
              // During prediction, just use the mean
              return {
                kernel: this.kernelMean,
                bias: this.useBias ? this.biasMean : null
              };
            }
            
            // Sample from standard normal
            const epsilonKernel = tf.randomNormal(this.kernelMean.shape);
            
            // Reparameterization trick: mean + exp(log_var/2) * epsilon
            const kernelStdDev = tf.exp(this.kernelLogVar.div(tf.scalar(2)));
            const kernel = this.kernelMean.add(kernelStdDev.mul(epsilonKernel));
            
            let bias = null;
            if (this.useBias) {
              const epsilonBias = tf.randomNormal(this.biasMean.shape);
              const biasStdDev = tf.exp(this.biasLogVar.div(tf.scalar(2)));
              bias = this.biasMean.add(biasStdDev.mul(epsilonBias));
            }
            
            return { kernel, bias };
          });
        }
        
        call(inputs, { training = false }) {
          return tf.tidy(() => {
            const { kernel, bias } = this.sampleWeights(training);
            
            const outputs = tf.matMul(inputs, kernel);
            const biasedOutputs = bias ? outputs.add(bias) : outputs;
            
            if (this.activation) {
              return this.activation.apply(biasedOutputs);
            }
            
            return biasedOutputs;
          });
        }
        
        computeOutputShape(inputShape) {
          return [inputShape[0], this.units];
        }
        
        getConfig() {
          const baseConfig = super.getConfig();
          return {
            ...baseConfig,
            units: this.units,
            activation: tf.activations.serializeActivation(this.activation),
            useBias: this.useBias,
            priorScale: this.priorScale,
            posteriorScale: this.posteriorScale
          };
        }
        
        static get className() {
          return 'BayesianDenseLayer';
        }
      }
      
      // Register custom layer
      tf.serialization.registerClass(BayesianDenseLayer);
      
      // Add KL Loss layer
      class KLLossLayer extends tf.layers.Layer {
        constructor(config) {
          super(config);
          this.klWeight = config.klWeight || 1.0;
          this.bayesianLayers = [];
        }
        
        call(inputs, { training = false }) {
          // Pass inputs through unchanged
          if (training) {
            // Collect KL loss from all registered Bayesian layers
            const klLosses = this.bayesianLayers.map(layer => layer.computeKLDivergence());
            
            // Sum all KL losses
            const totalKL = tf.tidy(() => {
              return klLosses.reduce((acc, kl) => acc.add(kl), tf.scalar(0));
            });
            
            // Add as a metric/loss
            this.addLoss(totalKL.mul(tf.scalar(this.klWeight)));
          }
          
          return inputs;
        }
        
        registerBayesianLayer(layer) {
          if (layer instanceof BayesianDenseLayer) {
            this.bayesianLayers.push(layer);
          }
        }
        
        getConfig() {
          const baseConfig = super.getConfig();
          return {
            ...baseConfig,
            klWeight: this.klWeight
          };
        }
        
        static get className() {
          return 'KLLossLayer';
        }
      }
      
      // Register custom layer
      tf.serialization.registerClass(KLLossLayer);
      
      // Build the model
      // 1. Define inputs
      const input = tf.input({ shape: [this.inputDimension] });
      
      // 2. Create KL loss layer
      const klLossLayer = new KLLossLayer({ klWeight: this.klWeight });
      
      // 3. Build network
      let x = input;
      
      // Hidden layers
      for (let i = 0; i < this.hiddenDimensions.length; i++) {
        const bayesianLayer = new BayesianDenseLayer({
          units: this.hiddenDimensions[i],
          activation: 'relu',
          priorScale: this.priorScale,
          posteriorScale: this.posteriorScale,
          name: `bayesian_dense_${i+1}`
        });
        
        x = bayesianLayer.apply(x);
        klLossLayer.registerBayesianLayer(bayesianLayer);
      }
      
      // Output layer
      const outputLayer = new BayesianDenseLayer({
        units: this.outputDimension,
        activation: 'tanh', // Range [-1, 1] for correlation
        priorScale: this.priorScale,
        posteriorScale: this.posteriorScale,
        name: 'bayesian_output'
      });
      
      x = outputLayer.apply(x);
      klLossLayer.registerBayesianLayer(outputLayer);
      
      // Apply KL loss
      const output = klLossLayer.apply(x);
      
      // Create and compile model
      this.model = tf.model({ inputs: input, outputs: output });
      
      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['meanAbsoluteError']
      });
      
      // Save model summary
      const modelSummary = [];
      this.model.summary((line) => modelSummary.push(line));
      logger.info(`BayesianNN: Model initialized\n${modelSummary.join('\n')}`);
      
      this.isInitialized = true;
    } catch (error) {
      logger.error(`BayesianNN: Initialization error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Train the Bayesian Neural Network
   * @param {Array<Object>} samples Training samples
   * @param {Object} config Training configuration
   * @returns {Promise<Object>} Training results
   */
  async train(samples, config = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      logger.info(`BayesianNN: Starting training with ${samples.length} samples...`);
      
      // Preprocess samples
      const preprocessedData = this.preprocessSamples(samples);
      
      // Configure training parameters
      const batchSize = config.batchSize || 16;
      const epochs = config.num_epochs || 100;
      const validationSplit = config.validation_split || 0.2;
      const earlyStoppingPatience = config.patience_epochs || 10;
      
      // Prepare callbacks
      const callbacks = [];
      
      if (config.early_stopping !== false) {
        callbacks.push(tf.callbacks.earlyStopping({
          monitor: 'val_loss',
          patience: earlyStoppingPatience,
          restoreBestWeights: true
        }));
      }
      
      // Train the model
      const history = await this.model.fit(
        preprocessedData.inputs,
        preprocessedData.targets,
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
          mae: history.history.meanAbsoluteError[history.history.meanAbsoluteError.length - 1]
        }
      });
      
      logger.info(`BayesianNN: Training completed in ${history.epoch.length} epochs`);
      
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
      logger.error(`BayesianNN: Training error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Preprocess correlation samples for training
   * @param {Array<Object>} samples Raw training samples
   * @returns {Object} Preprocessed data tensors
   * @private
   */
  preprocessSamples(samples) {
    // Extract and prepare features and targets
    const inputs = [];
    const targets = [];
    
    for (const sample of samples) {
      // Extract time series features
      const timeSeriesFeatures = this.extractTimeSeriesFeatures(sample.timeSeries || []);
      
      // Extract factor embeddings
      const embeddingA = sample.embeddingA || new Array(32).fill(0);
      const embeddingB = sample.embeddingB || new Array(32).fill(0);
      
      // Combine features
      const featureVector = [
        ...timeSeriesFeatures,
        ...embeddingA,
        ...embeddingB,
        sample.dataPoints / 100, // Normalized data points
        sample.sport === 'nba' ? 1 : 0,
        sample.sport === 'nfl' ? 1 : 0,
        sample.sport === 'mlb' ? 1 : 0,
        sample.sport === 'nhl' ? 1 : 0,
        sample.sport === 'premier' ? 1 : 0,
        sample.sport === 'bundesliga' ? 1 : 0,
        sample.sport === 'laliga' ? 1 : 0,
        sample.sport === 'seriea' ? 1 : 0
      ];
      
      // Pad or truncate to input dimension
      const paddedFeatures = this.padOrTruncateVector(featureVector, this.inputDimension);
      
      inputs.push(paddedFeatures);
      targets.push([sample.correlation]);
    }
    
    // Convert to tensors
    return {
      inputs: tf.tensor2d(inputs),
      targets: tf.tensor2d(targets)
    };
  }

  /**
   * Extract features from time series data
   * @param {Array<Object>} timeSeries Time series data
   * @returns {Array<number>} Extracted features
   * @private
   */
  extractTimeSeriesFeatures(timeSeries) {
    if (!timeSeries || timeSeries.length === 0) {
      return new Array(64).fill(0); // Default empty feature vector
    }
    
    try {
      // Extract series data
      const valuesA = timeSeries.map(point => point.valueA);
      const valuesB = timeSeries.map(point => point.valueB);
      
      // Basic statistics for series A
      const statsA = this.calculateBasicStats(valuesA);
      
      // Basic statistics for series B
      const statsB = this.calculateBasicStats(valuesB);
      
      // Calculate cross-correlation at different lags
      const maxLag = Math.min(5, Math.floor(timeSeries.length / 5));
      const crossCorrelations = [];
      
      for (let lag = -maxLag; lag <= maxLag; lag++) {
        crossCorrelations.push(this.calculateCrossCorrelation(valuesA, valuesB, lag));
      }
      
      // Calculate rolling window statistics
      const windowSize = Math.min(5, Math.floor(timeSeries.length / 2));
      const rollingStats = this.calculateRollingStats(valuesA, valuesB, windowSize);
      
      // Combine all features
      return [
        // Series A stats
        statsA.mean,
        statsA.std,
        statsA.min,
        statsA.max,
        statsA.median,
        statsA.skewness,
        statsA.kurtosis,
        statsA.range,
        
        // Series B stats
        statsB.mean,
        statsB.std,
        statsB.min,
        statsB.max,
        statsB.median,
        statsB.skewness,
        statsB.kurtosis,
        statsB.range,
        
        // Cross-correlations at different lags
        ...crossCorrelations,
        
        // Rolling statistics
        ...rollingStats,
        
        // Series length (normalized)
        Math.min(1, timeSeries.length / 100)
      ];
    } catch (error) {
      logger.error(`BayesianNN: Feature extraction error: ${error.message}`);
      return new Array(64).fill(0);
    }
  }

  /**
   * Calculate basic statistical features
   * @param {Array<number>} values Input values
   * @returns {Object} Statistical features
   * @private
   */
  calculateBasicStats(values) {
    try {
      if (values.length === 0) {
        return {
          mean: 0,
          std: 0,
          min: 0,
          max: 0,
          median: 0,
          skewness: 0,
          kurtosis: 0,
          range: 0
        };
      }
      
      // Calculate mean
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      
      // Calculate standard deviation
      const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
      const std = Math.sqrt(variance);
      
      // Sort values for percentiles
      const sorted = [...values].sort((a, b) => a - b);
      
      // Calculate various statistics
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const range = max - min;
      
      // Calculate skewness
      let skewness = 0;
      if (std > 0 && values.length > 0) {
        const cubedDiffs = values.map(v => Math.pow((v - mean) / std, 3));
        skewness = cubedDiffs.reduce((sum, v) => sum + v, 0) / values.length;
      }
      
      // Calculate kurtosis
      let kurtosis = 0;
      if (std > 0 && values.length > 0) {
        const fourthPowerDiffs = values.map(v => Math.pow((v - mean) / std, 4));
        kurtosis = fourthPowerDiffs.reduce((sum, v) => sum + v, 0) / values.length - 3;
      }
      
      return {
        mean,
        std,
        min,
        max,
        median,
        skewness,
        kurtosis,
        range
      };
    } catch (error) {
      logger.error(`BayesianNN: Error calculating statistics: ${error.message}`);
      return {
        mean: 0,
        std: 0,
        min: 0,
        max: 0,
        median: 0,
        skewness: 0,
        kurtosis: 0,
        range: 0
      };
    }
  }

  /**
   * Calculate cross-correlation between two series at a specific lag
   * @param {Array<number>} x First series
   * @param {Array<number>} y Second series
   * @param {number} lag Lag value (positive means y is shifted forward)
   * @returns {number} Cross-correlation value
   * @private
   */
  calculateCrossCorrelation(x, y, lag) {
    try {
      // Handle lag
      let x1, y1;
      if (lag >= 0) {
        x1 = x.slice(0, x.length - lag);
        y1 = y.slice(lag);
      } else {
        x1 = x.slice(-lag);
        y1 = y.slice(0, y.length + lag);
      }
      
      // Check if we have enough points
      if (x1.length < 3 || y1.length < 3) {
        return 0;
      }
      
      // Calculate means
      const meanX = x1.reduce((sum, v) => sum + v, 0) / x1.length;
      const meanY = y1.reduce((sum, v) => sum + v, 0) / y1.length;
      
      // Calculate cross-correlation
      let numerator = 0;
      let denominatorX = 0;
      let denominatorY = 0;
      
      for (let i = 0; i < x1.length; i++) {
        const diffX = x1[i] - meanX;
        const diffY = y1[i] - meanY;
        
        numerator += diffX * diffY;
        denominatorX += diffX * diffX;
        denominatorY += diffY * diffY;
      }
      
      // Handle division by zero
      if (denominatorX === 0 || denominatorY === 0) {
        return 0;
      }
      
      return numerator / Math.sqrt(denominatorX * denominatorY);
    } catch (error) {
      logger.error(`BayesianNN: Error calculating cross-correlation: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calculate rolling window statistics
   * @param {Array<number>} valuesA First series
   * @param {Array<number>} valuesB Second series
   * @param {number} windowSize Window size
   * @returns {Array<number>} Rolling statistics
   * @private
   */
  calculateRollingStats(valuesA, valuesB, windowSize) {
    try {
      const result = [];
      
      if (valuesA.length < windowSize || valuesB.length < windowSize) {
        return new Array(20).fill(0);
      }
      
      // Calculate rolling correlations
      const rollingCorrelations = [];
      for (let i = 0; i <= valuesA.length - windowSize; i++) {
        const windowA = valuesA.slice(i, i + windowSize);
        const windowB = valuesB.slice(i, i + windowSize);
        
        const meanA = windowA.reduce((sum, v) => sum + v, 0) / windowSize;
        const meanB = windowB.reduce((sum, v) => sum + v, 0) / windowSize;
        
        let numerator = 0;
        let denominatorA = 0;
        let denominatorB = 0;
        
        for (let j = 0; j < windowSize; j++) {
          const diffA = windowA[j] - meanA;
          const diffB = windowB[j] - meanB;
          
          numerator += diffA * diffB;
          denominatorA += diffA * diffA;
          denominatorB += diffB * diffB;
        }
        
        let correlation = 0;
        if (denominatorA > 0 && denominatorB > 0) {
          correlation = numerator / Math.sqrt(denominatorA * denominatorB);
        }
        
        rollingCorrelations.push(correlation);
      }
      
      if (rollingCorrelations.length === 0) {
        return new Array(20).fill(0);
      }
      
      // Calculate statistics of rolling correlations
      const meanCorr = rollingCorrelations.reduce((sum, v) => sum + v, 0) / rollingCorrelations.length;
      
      const squaredDiffs = rollingCorrelations.map(v => Math.pow(v - meanCorr, 2));
      const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / rollingCorrelations.length;
      const stdCorr = Math.sqrt(variance);
      
      const sortedCorr = [...rollingCorrelations].sort((a, b) => a - b);
      const minCorr = sortedCorr[0];
      const maxCorr = sortedCorr[sortedCorr.length - 1];
      const medianCorr = sortedCorr[Math.floor(sortedCorr.length / 2)];
      
      // Calculate correlation trend
      const corrTrend = rollingCorrelations.length >= 2
        ? rollingCorrelations[rollingCorrelations.length - 1] - rollingCorrelations[0]
        : 0;
      
      // Calculate volatility as standard deviation of differences
      const corrDiffs = [];
      for (let i = 1; i < rollingCorrelations.length; i++) {
        corrDiffs.push(rollingCorrelations[i] - rollingCorrelations[i - 1]);
      }
      
      let volatility = 0;
      if (corrDiffs.length > 0) {
        const meanDiff = corrDiffs.reduce((sum, v) => sum + v, 0) / corrDiffs.length;
        const squaredDiffDiffs = corrDiffs.map(v => Math.pow(v - meanDiff, 2));
        const varianceDiffs = squaredDiffDiffs.reduce((sum, v) => sum + v, 0) / corrDiffs.length;
        volatility = Math.sqrt(varianceDiffs);
      }
      
      return [
        meanCorr,
        stdCorr,
        minCorr,
        maxCorr,
        medianCorr,
        corrTrend,
        volatility
      ];
    } catch (error) {
      logger.error(`BayesianNN: Error calculating rolling stats: ${error.message}`);
      return new Array(20).fill(0);
    }
  }

  /**
   * Pad or truncate a vector to the target length
   * @param {Array<number>} vector Input vector
   * @param {number} targetLength Target length
   * @returns {Array<number>} Adjusted vector
   * @private
   */
  padOrTruncateVector(vector, targetLength) {
    if (vector.length === targetLength) {
      return vector;
    } else if (vector.length > targetLength) {
      return vector.slice(0, targetLength);
    } else {
      return [...vector, ...new Array(targetLength - vector.length).fill(0)];
    }
  }

  /**
   * Make correlation prediction with uncertainty
   * @param {Object} input Prediction input
   * @returns {Promise<Object>} Prediction with uncertainty bounds
   */
  async predict(input) {
    try {
      if (!this.isInitialized || !this.model) {
        await this.initialize();
      }
      
      // Prepare input features
      const featureVector = await this.prepareInputFeatures(input);
      
      // Make multiple predictions with Monte Carlo sampling
      const sampleCount = input.sampleCount || this.numSamples;
      const samples = [];
      
      for (let i = 0; i < sampleCount; i++) {
        const prediction = this.model.predict(featureVector);
        const value = await prediction.data();
        samples.push(value[0]);
        prediction.dispose();
      }
      
      // Calculate statistics from samples
      const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
      
      const squaredDiffs = samples.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / samples.length;
      const std = Math.sqrt(variance);
      
      // Calculate confidence interval
      const sortedSamples = [...samples].sort((a, b) => a - b);
      const lowerBound = sortedSamples[Math.floor(samples.length * 0.025)]; // 2.5 percentile
      const upperBound = sortedSamples[Math.floor(samples.length * 0.975)]; // 97.5 percentile
      
      // Calculate confidence level
      const confidence = 1 - std;
      
      // Clean up
      featureVector.dispose();
      
      return {
        mean,
        std,
        lowerBound,
        upperBound,
        confidence,
        samples,
        effectiveSampleSize: input.dataPoints || 30
      };
    } catch (error) {
      logger.error(`BayesianNN: Prediction error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Prepare input features for prediction
   * @param {Object} input Raw input data
   * @returns {tf.Tensor} Input tensor
   * @private
   */
  async prepareInputFeatures(input) {
    // Extract time series
    const timeSeriesFeatures = this.extractTimeSeriesFeatures(input.timeSeriesFeatures || []);
    
    // Extract factor embeddings
    const embeddingA = input.factorEmbeddingA || new Array(32).fill(0);
    const embeddingB = input.factorEmbeddingB || new Array(32).fill(0);
    
    // Combine features
    const featureVector = [
      ...timeSeriesFeatures,
      ...embeddingA,
      ...embeddingB,
      input.dataPoints ? input.dataPoints / 100 : 0.3, // Normalized data points
      input.sport === 'nba' ? 1 : 0,
      input.sport === 'nfl' ? 1 : 0,
      input.sport === 'mlb' ? 1 : 0,
      input.sport === 'nhl' ? 1 : 0,
      input.sport === 'premier' ? 1 : 0,
      input.sport === 'bundesliga' ? 1 : 0,
      input.sport === 'laliga' ? 1 : 0,
      input.sport === 'seriea' ? 1 : 0
    ];
    
    // Pad or truncate to input dimension
    const paddedFeatures = this.padOrTruncateVector(featureVector, this.inputDimension);
    
    // Convert to tensor
    return tf.tensor2d([paddedFeatures]);
  }

  /**
   * Predict joint probability with uncertainty
   * @param {Object} input Joint probability input
   * @returns {Promise<Object>} Joint probability with uncertainty
   */
  async predictJointProbability(input) {
    try {
      if (!this.isInitialized || !this.model) {
        await this.initialize();
      }
      
      const { factors, probabilities, correlationMatrix, embeddings, sampleCount } = input;
      
      // Using Gaussian Copula method with Monte Carlo sampling for uncertainty
      const numSamples = sampleCount || 50;
      const jointSamples = [];
      
      // Convert probabilities to normal quantiles
      const quantiles = probabilities.map(p => {
        // Handle edge cases to avoid Infinity
        const safeP = Math.max(0.001, Math.min(0.999, p));
        return this.quantileNormal(safeP);
      });
      
      // Run Monte Carlo simulation
      for (let s = 0; s < numSamples; s++) {
        // Generate a sample for each run using Cholesky decomposition
        // of the correlation matrix
        const L = this.choleskyDecomposition(correlationMatrix);
        
        // Generate independent standard normal samples
        const z = factors.map(() => this.sampleStandardNormal());
        
        // Apply correlation structure using Cholesky factor
        const correlatedSamples = this.multiplyMatrixVector(L, z);
        
        // Check if the sample is below all quantiles
        const belowAllQuantiles = correlatedSamples.every((sample, i) => 
          sample <= quantiles[i]
        );
        
        if (belowAllQuantiles) {
          jointSamples.push(1);
        } else {
          jointSamples.push(0);
        }
      }
      
      // Calculate mean (this is the joint probability estimate)
      const mean = jointSamples.reduce((sum, v) => sum + v, 0) / numSamples;
      
      // Calculate standard deviation
      const squaredDiffs = jointSamples.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / numSamples;
      const std = Math.sqrt(variance);
      
      // Calculate confidence interval
      const lowerBound = Math.max(0, mean - 1.96 * std);
      const upperBound = Math.min(1, mean + 1.96 * std);
      
      return {
        jointProbability: mean,
        uncertainty: std,
        lowerBound,
        upperBound,
        samplesCount: numSamples
      };
    } catch (error) {
      logger.error(`BayesianNN: Joint probability prediction error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compute Cholesky decomposition of a matrix
   * @param {Array<Array<number>>} matrix Correlation matrix
   * @returns {Array<Array<number>>} Lower triangular matrix L
   * @private
   */
  choleskyDecomposition(matrix) {
    const n = matrix.length;
    const L = Array(n).fill().map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        
        if (j === i) {
          for (let k = 0; k < j; k++) {
            sum += L[j][k] * L[j][k];
          }
          L[j][j] = Math.sqrt(Math.max(0.0001, matrix[j][j] - sum));
        } else {
          for (let k = 0; k < j; k++) {
            sum += L[i][k] * L[j][k];
          }
          if (L[j][j] > 0) {
            L[i][j] = (matrix[i][j] - sum) / L[j][j];
          }
        }
      }
    }
    
    return L;
  }

  /**
   * Multiply matrix by vector
   * @param {Array<Array<number>>} matrix Matrix
   * @param {Array<number>} vector Vector
   * @returns {Array<number>} Result vector
   * @private
   */
  multiplyMatrixVector(matrix, vector) {
    const n = matrix.length;
    const result = Array(n).fill(0);
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i] += matrix[i][j] * vector[j];
      }
    }
    
    return result;
  }

  /**
   * Standard normal quantile function
   * @param {number} p Probability
   * @returns {number} Quantile
   * @private
   */
  quantileNormal(p) {
    // Approximation of the inverse error function
    const a = 8 * (Math.PI - 3) / (3 * Math.PI * (4 - Math.PI));
    
    const inverseErf = (x) => {
      const sgn = x >= 0 ? 1 : -1;
      const x2 = x * x;
      
      const term1 = 2 / (Math.PI * a);
      const term2 = Math.log(1 - x2);
      const term3 = Math.sqrt(term1 + term2 / 2);
      
      return sgn * Math.sqrt(term3 - term1);
    };
    
    // Convert p to quantile
    return Math.sqrt(2) * inverseErf(2 * p - 1);
  }

  /**
   * Sample from standard normal distribution
   * @returns {number} Random sample
   * @private
   */
  sampleStandardNormal() {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Evaluate model on test data
   * @param {Array<Object>} testSamples Test samples
   * @param {Object} config Evaluation configuration
   * @returns {Promise<Object>} Evaluation metrics
   */
  async evaluate(testSamples, config = {}) {
    try {
      if (!this.isInitialized || !this.model) {
        await this.initialize();
      }
      
      if (!testSamples || testSamples.length === 0) {
        return { loss: 0, rmse: 0, calibration: 0 };
      }
      
      // Preprocess test samples
      const preprocessedData = this.preprocessSamples(testSamples);
      
      // Basic evaluation
      const result = await this.model.evaluate(
        preprocessedData.inputs,
        preprocessedData.targets,
        { batchSize: 32 }
      );
      
      // Extract loss
      const loss = result[0].dataSync()[0];
      
      // Make predictions with uncertainty
      const predictions = [];
      const numMonteCarlo = config.num_monte_carlo || 20;
      
      for (let i = 0; i < testSamples.length; i++) {
        const sample = testSamples[i];
        
        const prediction = await this.predict({
          timeSeriesFeatures: sample.timeSeries,
          factorEmbeddingA: sample.embeddingA,
          factorEmbeddingB: sample.embeddingB,
          factorA: sample.factorA,
          factorB: sample.factorB,
          sport: sample.sport,
          league: sample.league,
          dataPoints: sample.dataPoints,
          sampleCount: numMonteCarlo
        });
        
        predictions.push({
          actual: sample.correlation,
          predicted: prediction.mean,
          lowerBound: prediction.lowerBound,
          upperBound: prediction.upperBound,
          std: prediction.std
        });
      }
      
      // Calculate RMSE
      const squaredErrors = predictions.map(p => Math.pow(p.actual - p.predicted, 2));
      const mse = squaredErrors.reduce((sum, se) => sum + se, 0) / predictions.length;
      const rmse = Math.sqrt(mse);
      
      // Calculate calibration score (percentage of actual values within confidence intervals)
      const inIntervalCount = predictions.filter(
        p => p.actual >= p.lowerBound && p.actual <= p.upperBound
      ).length;
      
      const calibration = inIntervalCount / predictions.length;
      
      // Clean up
      tf.dispose([
        ...result,
        preprocessedData.inputs,
        preprocessedData.targets
      ]);
      
      return {
        loss,
        rmse,
        calibration
      };
    } catch (error) {
      logger.error(`BayesianNN: Evaluation error: ${error.message}`);
      return { loss: Infinity, rmse: Infinity, calibration: 0, error: error.message };
    }
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
        `bayesian_nn_${this.modelVersion}_${this.modelId}`
      );
      
      // Save the model
      await this.model.save(`file://${modelPath}`);
      
      // Save metadata
      const metadata = {
        modelId: this.modelId,
        modelVersion: this.modelVersion,
        inputDimension: this.inputDimension,
        hiddenDimensions: this.hiddenDimensions,
        outputDimension: this.outputDimension,
        priorScale: this.priorScale,
        posteriorScale: this.posteriorScale,
        trainingHistory: this.trainingHistory,
        savedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(modelPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      logger.info(`BayesianNN: Model saved to ${modelPath}`);
      return modelPath;
    } catch (error) {
      logger.error(`BayesianNN: Save error: ${error.message}`);
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
        this.inputDimension = metadata.inputDimension;
        this.hiddenDimensions = metadata.hiddenDimensions;
        this.outputDimension = metadata.outputDimension;
        this.priorScale = metadata.priorScale;
        this.posteriorScale = metadata.posteriorScale;
        this.trainingHistory = metadata.trainingHistory || [];
      }
      
      // Compile the model
      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['meanAbsoluteError']
      });
      
      this.isInitialized = true;
      logger.info(`BayesianNN: Model loaded from ${modelPath}`);
    } catch (error) {
      logger.error(`BayesianNN: Load error: ${error.message}`);
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
        'bayesian_nn',
        this.modelVersion,
        tempDir
      );
      
      logger.info(`BayesianNN: Model saved to registry at ${registryPath}`);
      return registryPath;
    } catch (error) {
      logger.error(`BayesianNN: Registry save error: ${error.message}`);
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
        'bayesian_nn',
        version
      );
      
      // Load the model
      await this.loadModel(localPath);
      
      logger.info(`BayesianNN: Model loaded from registry (${version})`);
    } catch (error) {
      logger.error(`BayesianNN: Registry load error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = BayesianNeuralNetwork;