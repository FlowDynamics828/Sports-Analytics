/**
 * Transfer Learning Manager
 * 
 * Enables knowledge transfer between different sports leagues
 * to improve predictions when data is limited
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const math = require('mathjs');
const logger = require('../../utils/logger');

class TransferLearningManager {
  /**
   * Initialize transfer learning manager
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Transfer learning configuration
    this.sourceDomains = config.sourceDomains || ['NBA', 'NFL', 'NHL', 'MLB', 'LALIGA', 'SERIEA', 'PREMIERLEAGUE', 'BUNDESLIGA'];
    this.adaptationLayers = config.adaptationLayers || 2;
    this.finetuneLearningRate = config.finetuneLearningRate || 0.001;
    
    // Similarity metrics configuration
    this.factorSimilarityWeight = config.factorSimilarityWeight || 0.5;
    this.correlationPatternWeight = config.correlationPatternWeight || 0.3;
    this.temporalPatternWeight = config.temporalPatternWeight || 0.2;
    
    // Transfer adaptation settings
    this.transferStrength = config.transferStrength || 0.7;
    this.confidenceMultiplier = config.confidenceMultiplier || 0.8;
    
    // Transfer learning models
    this.domainEmbeddings = new Map();
    this.domainAffinities = new Map();
    this.factorMappings = new Map();
    
    // Metrics tracking
    this.transferCount = 0;
    this.transferSuccessCount = 0;
    this.lastTransferTime = null;
    
    // Bind methods
    this.findTransferSources = this.findTransferSources.bind(this);
    this.calculateTransferCorrelation = this.calculateTransferCorrelation.bind(this);
    this.updateDomainAffinities = this.updateDomainAffinities.bind(this);
  }

  /**
   * Find suitable transfer sources for target factors
   * @param {string} factorA First target factor
   * @param {string} factorB Second target factor
   * @param {string} targetSport Target sport
   * @param {string} targetLeague Target league
   * @returns {Promise<Array<Object>>} Potential transfer sources
   */
  async findTransferSources(factorA, factorB, targetSport, targetLeague) {
    try {
      // Skip if target domain is not specified
      if (!targetSport || !targetLeague) {
        return [];
      }
      
      const targetDomain = `${targetSport}_${targetLeague}`;
      
      // Create factor pair key
      const factorPairKey = [factorA, factorB].sort().join('|');
      
      // Check if we already have mappings for this factor pair
      if (this.factorMappings.has(factorPairKey)) {
        return this.factorMappings.get(factorPairKey);
      }
      
      // Get all potential source domains
      const sourceDomains = this.sourceDomains
        .map(domain => domain.toUpperCase())
        .filter(domain => `${targetSport}_${targetLeague}`.toUpperCase() !== domain);
      
      if (sourceDomains.length === 0) {
        return [];
      }
      
      logger.debug(`TransferLearningManager: Searching transfer sources for ${factorA} and ${factorB} in ${targetDomain}`);
      
      // Query database for similar factor pairs in source domains
      const transferSources = await this.queryTransferSources(
        factorA, factorB, targetSport, targetLeague, sourceDomains
      );
      
      // Cache the results
      this.factorMappings.set(factorPairKey, transferSources);
      
      return transferSources;
    } catch (error) {
      logger.error(`TransferLearningManager: Error finding transfer sources: ${error.message}`);
      return [];
    }
  }

  /**
   * Query database for potential transfer sources
   * @param {string} factorA First target factor
   * @param {string} factorB Second target factor
   * @param {string} targetSport Target sport
   * @param {string} targetLeague Target league
   * @param {Array<string>} sourceDomains Source domains to search
   * @returns {Promise<Array<Object>>} Transfer sources
   * @private
   */
  async queryTransferSources(factorA, factorB, targetSport, targetLeague, sourceDomains) {
    try {
      // This is where we would query the database for similar factor pairs
      // For now, we'll simulate this with a mock implementation
      
      // Extract factor types from names (simple heuristic)
      const factorAType = this.extractFactorType(factorA);
      const factorBType = this.extractFactorType(factorB);
      
      // Model the database query results
      const mockResults = [];
      
      // For each source domain, find relevant mappings
      for (const sourceDomain of sourceDomains) {
        // Parse source domain
        const [sourceSport, sourceLeague] = sourceDomain.toLowerCase().split('_');
        
        // Check domain affinity
        const domainPair = `${targetSport}_${targetLeague}|${sourceSport}_${sourceLeague}`;
        const affinity = this.domainAffinities.get(domainPair) || 0.5;
        
        // Skip domains with very low affinity
        if (affinity < 0.2) {
          continue;
        }
        
        // Add mock transfer sources based on factor types
        if (factorAType && factorBType) {
          // Generate similar factors for each source domain
          const sourceFactorA = this.generateSimilarFactor(factorA, factorAType, sourceSport, sourceLeague);
          const sourceFactorB = this.generateSimilarFactor(factorB, factorBType, sourceSport, sourceLeague);
          
          // Add potential transfer source
          mockResults.push({
            sourceSport,
            sourceLeague,
            sourceFactorA,
            sourceFactorB,
            factorSimilarity: 0.7 + Math.random() * 0.2,
            correlationPatternSimilarity: 0.6 + Math.random() * 0.3,
            temporalPatternSimilarity: 0.5 + Math.random() * 0.4,
            domainAffinity: affinity,
            sampleSize: 50 + Math.floor(Math.random() * 200)
          });
        }
      }
      
      // Calculate overall similarity scores
      for (const source of mockResults) {
        source.overallSimilarity = 
          source.factorSimilarity * this.factorSimilarityWeight +
          source.correlationPatternSimilarity * this.correlationPatternWeight +
          source.temporalPatternSimilarity * this.temporalPatternWeight;
      }
      
      // Sort by overall similarity (descending)
      mockResults.sort((a, b) => b.overallSimilarity - a.overallSimilarity);
      
      // Return top results (limit to 5 for performance)
      return mockResults.slice(0, 5);
    } catch (error) {
      logger.error(`TransferLearningManager: Error querying transfer sources: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract factor type from factor name
   * @param {string} factor Factor name
   * @returns {string} Factor type
   * @private
   */
  extractFactorType(factor) {
    // Simple heuristic to extract factor type
    if (factor.includes('player_') || factor.includes('Player_')) {
      return 'player';
    } else if (factor.includes('team_') || factor.includes('Team_')) {
      return 'team';
    } else if (factor.includes('weather_') || factor.includes('Weather_')) {
      return 'weather';
    } else if (factor.includes('injury_') || factor.includes('Injury_')) {
      return 'injury';
    } else if (factor.includes('streak_') || factor.includes('Streak_')) {
      return 'streak';
    } else {
      return null;
    }
  }

  /**
   * Generate a similar factor name for different domain
   * @param {string} originalFactor Original factor name
   * @param {string} factorType Factor type
   * @param {string} sport Sport domain
   * @param {string} league League domain
   * @returns {string} Similar factor name
   * @private
   */
  generateSimilarFactor(originalFactor, factorType, sport, league) {
    // This is a mock implementation
    // In a real system, we would query the database for similar factors
    
    // Extract factor base name (remove prefixes)
    const parts = originalFactor.split('_');
    const baseName = parts.length > 1 ? parts.slice(1).join('_') : parts[0];
    
    // Generate a domain-specific version
    return `${factorType}_${sport}_${league}_${baseName}`;
  }

  /**
   * Calculate correlation using transfer learning
   * @param {string} factorA First target factor
   * @param {string} factorB Second target factor
   * @param {Array<Object>} transferSources Transfer sources
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Transfer correlation results
   */
  async calculateTransferCorrelation(factorA, factorB, transferSources, options = {}) {
    this.transferCount++;
    const startTime = Date.now();
    
    try {
      // Check if we have valid transfer sources
      if (!transferSources || transferSources.length === 0) {
        throw new Error('No valid transfer sources provided');
      }
      
      logger.debug(`TransferLearningManager: Calculating transfer correlation for ${factorA} and ${factorB}`);
      
      // Step 1: Retrieve correlation data from each source
      const sourceCorrelations = await this.retrieveSourceCorrelations(transferSources);
      
      // Step 2: Apply transfer learning adaptation
      const transferResult = this.applyTransferAdaptation(factorA, factorB, sourceCorrelations, options);
      
      // Record success
      this.transferSuccessCount++;
      this.lastTransferTime = new Date();
      
      // Add metadata
      transferResult.sourceDomains = transferSources.map(s => `${s.sourceSport}_${s.sourceLeague}`);
      transferResult.sourceWeights = transferSources.map(s => s.weight);
      transferResult.executionTimeMs = Date.now() - startTime;
      
      return transferResult;
    } catch (error) {
      logger.error(`TransferLearningManager: Error calculating transfer correlation: ${error.message}`);
      
      // Return default correlation
      return {
        correlation: 0,
        confidence: 0.3,
        sourceDomains: [],
        sourceWeights: [],
        error: error.message
      };
    }
  }

  /**
   * Retrieve correlation data from transfer sources
   * @param {Array<Object>} transferSources Transfer sources
   * @returns {Promise<Array<Object>>} Source correlations
   * @private
   */
  async retrieveSourceCorrelations(transferSources) {
    try {
      // In a real system, we would query the database for correlation data
      // For now, we'll simulate this with mock data
      
      const sourceCorrelations = [];
      
      for (const source of transferSources) {
        // Generate mock correlation data
        const correlation = Math.random() * 2 - 1; // Random value between -1 and 1
        const confidence = 0.5 + Math.random() * 0.4; // Random value between 0.5 and 0.9
        
        sourceCorrelations.push({
          source,
          correlation,
          confidence,
          sampleSize: source.sampleSize || 50
        });
      }
      
      return sourceCorrelations;
    } catch (error) {
      logger.error(`TransferLearningManager: Error retrieving source correlations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply transfer adaptation to source correlations
   * @param {string} factorA First target factor
   * @param {string} factorB Second target factor
   * @param {Array<Object>} sourceCorrelations Source correlations
   * @param {Object} options Additional options
   * @returns {Object} Adapted correlation result
   * @private
   */
  applyTransferAdaptation(factorA, factorB, sourceCorrelations, options = {}) {
    try {
      // Extract options
      const transferStrength = options.transferStrength || this.transferStrength;
      const targetSampleSize = options.sampleSize || 0;
      
      // Calculate weights for each source based on similarity and confidence
      const totalSimilarity = sourceCorrelations.reduce(
        (sum, s) => sum + s.source.overallSimilarity, 0
      );
      
      for (const source of sourceCorrelations) {
        // Calculate base weight based on similarity
        let weight = source.source.overallSimilarity / totalSimilarity;
        
        // Adjust weight based on confidence and sample size
        weight *= source.confidence;
        
        // Store weight
        source.weight = weight;
      }
      
      // Normalize weights
      const totalWeight = sourceCorrelations.reduce(
        (sum, s) => sum + s.weight, 0
      );
      
      for (const source of sourceCorrelations) {
        source.weight /= totalWeight;
      }
      
      // Calculate weighted correlation
      let weightedCorrelation = 0;
      let weightedConfidence = 0;
      
      for (const source of sourceCorrelations) {
        weightedCorrelation += source.correlation * source.weight;
        weightedConfidence += source.confidence * source.weight;
      }
      
      // Apply confidence multiplier for transfer learning
      weightedConfidence *= this.confidenceMultiplier;
      
      // Calculate confidence improvement from transfer learning
      const baseConfidence = Math.min(0.5, targetSampleSize / 100);
      const confidenceImprovement = weightedConfidence - baseConfidence;
      
      // Prepare result
      return {
        correlation: weightedCorrelation,
        confidence: weightedConfidence,
        effectiveSampleSize: this.calculateEffectiveSampleSize(sourceCorrelations),
        confidenceInterval: this.calculateConfidenceInterval(
          weightedCorrelation, 
          this.calculateEffectiveSampleSize(sourceCorrelations)
        ),
        confidenceImprovement,
        transferStrength
      };
    } catch (error) {
      logger.error(`TransferLearningManager: Error applying transfer adaptation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate effective sample size from transfer sources
   * @param {Array<Object>} sourceCorrelations Source correlations
   * @returns {number} Effective sample size
   * @private
   */
  calculateEffectiveSampleSize(sourceCorrelations) {
    // Calculate weighted average of sample sizes
    let effectiveSampleSize = 0;
    
    for (const source of sourceCorrelations) {
      effectiveSampleSize += source.sampleSize * source.weight;
    }
    
    // Apply discount factor for transfer learning
    return Math.floor(effectiveSampleSize * this.confidenceMultiplier);
  }

  /**
   * Calculate confidence interval for a correlation coefficient
   * @param {number} correlation Correlation coefficient
   * @param {number} sampleSize Sample size
   * @returns {Array<number>} Lower and upper bounds of confidence interval
   * @private
   */
  calculateConfidenceInterval(correlation, sampleSize) {
    try {
      // Apply Fisher's Z-transformation
      const z = 0.5 * Math.log((1 + correlation) / (1 - correlation));
      
      // Standard error of z
      const se = 1 / Math.sqrt(sampleSize - 3);
      
      // 95% confidence interval in z-space
      const zLower = z - 1.96 * se;
      const zUpper = z + 1.96 * se;
      
      // Convert back to correlation scale
      const rLower = Math.max(-1, (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1));
      const rUpper = Math.min(1, (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1));
      
      return [rLower, rUpper];
    } catch (error) {
      // Default confidence interval
      return [
        Math.max(-1, correlation - 0.3),
        Math.min(1, correlation + 0.3)
      ];
    }
  }

  /**
   * Update domain affinities based on transfer learning outcomes
   * @param {Array<Object>} transferResults Transfer learning results
   * @returns {Promise<Object>} Update results
   */
  async updateDomainAffinities(transferResults) {
    try {
      // Check if we have valid results
      if (!transferResults || transferResults.length === 0) {
        return { updated: 0 };
      }
      
      let updatedCount = 0;
      
      for (const result of transferResults) {
        // Skip invalid results
        if (!result.targetDomain || !result.sourceDomain || 
            result.transferError === undefined || 
            result.improvementScore === undefined) {
          continue;
        }
        
        // Calculate domain pair key
        const domainPair = `${result.targetDomain}|${result.sourceDomain}`;
        
        // Get current affinity or set default
        const currentAffinity = this.domainAffinities.get(domainPair) || 0.5;
        
        // Update affinity based on transfer results
        let updatedAffinity;
        
        if (result.transferError > 0.5) {
          // High error, reduce affinity
          updatedAffinity = Math.max(0.1, currentAffinity - 0.05);
        } else if (result.improvementScore > 0.2) {
          // Good improvement, increase affinity
          updatedAffinity = Math.min(1.0, currentAffinity + 0.05);
        } else {
          // Neutral result, minor adjustment
          const adjustment = (result.improvementScore - 0.1) * 0.1;
          updatedAffinity = Math.max(0.1, Math.min(1.0, currentAffinity + adjustment));
        }
        
        // Update if changed significantly
        if (Math.abs(updatedAffinity - currentAffinity) > 0.01) {
          this.domainAffinities.set(domainPair, updatedAffinity);
          updatedCount++;
        }
      }
      
      return {
        updated: updatedCount,
        totalAffinities: this.domainAffinities.size
      };
    } catch (error) {
      logger.error(`TransferLearningManager: Error updating domain affinities: ${error.message}`);
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Get performance metrics for the transfer learning manager
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    const successRate = this.transferCount > 0 ? 
      this.transferSuccessCount / this.transferCount : 0;
    
    return {
      transferCount: this.transferCount,
      successRate,
      domainMappings: this.domainAffinities.size,
      factorMappings: this.factorMappings.size,
      lastTransferTime: this.lastTransferTime ? this.lastTransferTime.toISOString() : null
    };
  }
}

module.exports = TransferLearningManager;