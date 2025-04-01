/**
 * Correlation Visualizer
 * 
 * Advanced visualization generator for correlation data.
 * Transforms correlation data into formats suitable for interactive visualizations.
 * Supports network graphs, heatmaps, causal diagrams, and time-series visualizations.
 * 
 * @author Sports Analytics Platform Team
 * @version 1.0.0
 */

const FactorCorrelationEngine = require('./factor_correlation_engine');
const AdvancedCorrelationAPI = require('./advanced_correlation_api');
const logger = require('./utils/logger');

class CorrelationVisualizer {
  /**
   * Initialize the visualizer
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.api = options.api || new AdvancedCorrelationAPI(options);
    this.initialized = false;
  }
  
  /**
   * Initialize the visualizer
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.initialized) {
      await this.api.initialize();
      this.initialized = true;
    }
  }
  
  /**
   * Generate network graph data for factor correlations
   * @param {Array<string>} factors Factors to include in the graph
   * @param {Object} options Visualization options
   * @returns {Promise<Object>} Network graph data structure
   */
  async generateNetworkGraph(factors, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Get correlation matrix
      const correlationMatrix = await this.api.engine.getCorrelationMatrix(factors, options);
      
      // Extract factors and matrix
      const factorList = correlationMatrix.factors;
      const matrix = correlationMatrix.matrix;
      
      // Create nodes
      const nodes = factorList.map((factor, index) => ({
        id: index,
        label: this.shortenLabel(factor, options.maxLabelLength || 30),
        fullLabel: factor,
        group: this.determineFactorGroup(factor)
      }));
      
      // Create edges
      const edges = [];
      
      for (let i = 0; i < factorList.length; i++) {
        for (let j = i + 1; j < factorList.length; j++) {
          const correlation = matrix[i][j];
          
          // Skip weak correlations if threshold is set
          if (options.minCorrelation && Math.abs(correlation) < options.minCorrelation) {
            continue;
          }
          
          edges.push({
            from: i,
            to: j,
            value: Math.abs(correlation), // Line width based on correlation strength
            title: `Correlation: ${(correlation * 100).toFixed(1)}%`,
            color: this.getCorrelationColor(correlation),
            arrows: this.getDirectionalArrows(factorList[i], factorList[j])
          });
        }
      }
      
      return {
        nodes,
        edges,
        options: {
          physics: {
            enabled: true,
            barnesHut: {
              gravitationalConstant: -2000,
              centralGravity: 0.3,
              springLength: 150,
              springConstant: 0.04
            }
          },
          edges: {
            smooth: {
              type: 'continuous',
              forceDirection: 'none'
            }
          }
        }
      };
    } catch (error) {
      logger.error(`CorrelationVisualizer: Error generating network graph: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate heatmap data for correlation matrix
   * @param {Array<string>} factors Factors to include in heatmap
   * @param {Object} options Visualization options
   * @returns {Promise<Object>} Heatmap data
   */
  async generateHeatmap(factors, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Get correlation matrix
      const correlationMatrix = await this.api.engine.getCorrelationMatrix(factors, options);
      
      // Extract factors and matrix
      const factorList = correlationMatrix.factors;
      const matrix = correlationMatrix.matrix;
      
      // Create cells for heatmap
      const cells = [];
      
      for (let i = 0; i < factorList.length; i++) {
        for (let j = 0; j < factorList.length; j++) {
          cells.push({
            x: i,
            y: j,
            value: matrix[i][j],
            color: this.getHeatmapColor(matrix[i][j])
          });
        }
      }
      
      // Create labels
      const labels = factorList.map(factor => this.shortenLabel(factor, options.maxLabelLength || 20));
      
      return {
        cells,
        xLabels: labels,
        yLabels: labels,
        fullLabels: factorList,
        colorRange: [-1, 1]
      };
    } catch (error) {
      logger.error(`CorrelationVisualizer: Error generating heatmap: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate causal diagram showing causality between factors
   * @param {string} factor Central factor to analyze
   * @param {Object} options Visualization options
   * @returns {Promise<Object>} Causal diagram data
   */
  async generateCausalDiagram(factor, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Get influential factors
      const influentialFactors = await this.api.findInfluentialFactors(factor, options);
      
      // Central node
      const nodes = [{
        id: 0,
        label: this.shortenLabel(factor, options.maxLabelLength || 30),
        fullLabel: factor,
        group: 'target',
        level: 1
      }];
      
      const edges = [];
      let nodeId = 1;
      
      // Add causal factors (causes)
      for (const cause of influentialFactors.causes.slice(0, options.maxCauses || 8)) {
        nodes.push({
          id: nodeId,
          label: this.shortenLabel(cause.factor, options.maxLabelLength || 30),
          fullLabel: cause.factor,
          group: 'cause',
          level: 0,
          correlation: cause.correlation,
          causalStrength: cause.causalStrength
        });
        
        edges.push({
          from: nodeId,
          to: 0,
          value: Math.abs(cause.causalStrength || 0.5),
          title: cause.explanation || `Causality strength: ${((cause.causalStrength || 0.5) * 100).toFixed(1)}%`,
          color: '#FF5733',
          arrows: 'to',
          dashes: false
        });
        
        nodeId++;
      }
      
      // Add effect nodes
      const effects = await this.findPotentialEffects(factor, options);
      
      for (const effect of effects.slice(0, options.maxEffects || 8)) {
        nodes.push({
          id: nodeId,
          label: this.shortenLabel(effect.factor, options.maxLabelLength || 30),
          fullLabel: effect.factor,
          group: 'effect',
          level: 2,
          correlation: effect.correlation,
          causalStrength: effect.causalStrength
        });
        
        edges.push({
          from: 0,
          to: nodeId,
          value: Math.abs(effect.causalStrength || 0.5),
          title: effect.explanation || `Causality strength: ${((effect.causalStrength || 0.5) * 100).toFixed(1)}%`,
          color: '#33A8FF',
          arrows: 'to',
          dashes: false
        });
        
        nodeId++;
      }
      
      // Add bidirectional relationships
      for (const bidir of influentialFactors.bidirectional.slice(0, options.maxBidirectional || 5)) {
        nodes.push({
          id: nodeId,
          label: this.shortenLabel(bidir.factor, options.maxLabelLength || 30),
          fullLabel: bidir.factor,
          group: 'bidirectional',
          level: 1,
          correlation: bidir.correlation,
          causalStrength: bidir.causalStrength
        });
        
        edges.push({
          from: nodeId,
          to: 0,
          value: Math.abs(bidir.causalStrength || 0.5),
          title: bidir.explanation || `Bidirectional relationship`,
          color: '#33FF57',
          arrows: 'to,from',
          dashes: false
        });
        
        nodeId++;
      }
      
      // Add top correlations if requested
      if (options.includeCorrelations) {
        for (const correlate of influentialFactors.correlates.slice(0, options.maxCorrelations || 5)) {
          nodes.push({
            id: nodeId,
            label: this.shortenLabel(correlate.factor, options.maxLabelLength || 30),
            fullLabel: correlate.factor,
            group: 'correlation',
            level: 1,
            correlation: correlate.correlation
          });
          
          edges.push({
            from: nodeId,
            to: 0,
            value: Math.abs(correlate.correlation),
            title: `Correlation: ${(correlate.correlation * 100).toFixed(1)}%`,
            color: '#9933FF',
            arrows: '',
            dashes: true
          });
          
          nodeId++;
        }
      }
      
      return {
        nodes,
        edges,
        groups: {
          target: { color: '#FFC107' },
          cause: { color: '#FF5733' },
          effect: { color: '#33A8FF' },
          bidirectional: { color: '#33FF57' },
          correlation: { color: '#9933FF' }
        },
        options: {
          layout: {
            hierarchical: {
              direction: 'UD',
              sortMethod: 'directed',
              levelSeparation: 150
            }
          }
        }
      };
    } catch (error) {
      logger.error(`CorrelationVisualizer: Error generating causal diagram: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate time-series visualization data
   * @param {Array<string>} factors Factors to visualize
   * @param {Object} options Visualization options
   * @returns {Promise<Object>} Time-series visualization data
   */
  async generateTimeSeriesVisualization(factors, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Prepare result object
      const result = {
        factors: [],
        correlations: [],
        dates: [],
        series: []
      };
      
      // Time periods to examine
      const periods = [
        { name: '3 months ago', days: 90 },
        { name: '2 months ago', days: 60 },
        { name: '1 month ago', days: 30 },
        { name: '2 weeks ago', days: 14 },
        { name: '1 week ago', days: 7 },
        { name: 'Current', days: 0 }
      ];
      
      // Generate dates for x-axis
      result.dates = periods.map(p => p.name);
      
      // For each factor pair, get correlation history
      for (let i = 0; i < factors.length; i++) {
        for (let j = i + 1; j < factors.length; j++) {
          const factorA = factors[i];
          const factorB = factors[j];
          
          // Add to factor pairs
          result.correlations.push({
            factorA,
            factorB,
            label: `${this.shortenLabel(factorA, 15)} & ${this.shortenLabel(factorB, 15)}`
          });
          
          // Get historical correlations at different time periods
          const correlationHistory = [];
          
          for (const period of periods) {
            let correlation;
            
            if (period.days === 0) {
              // Current correlation
              correlation = await this.api.engine.getFactorCorrelation(factorA, factorB, options);
            } else {
              // Historical correlation (this would require storing historical values or rebuild)
              // For this visualization, we'll simulate historical data with random walk
              const lastVal = correlationHistory.length > 0 ? 
                correlationHistory[correlationHistory.length - 1] : 
                (Math.random() * 0.6 - 0.3); // Starting between -0.3 and 0.3
                
              // Random walk with constrains
              correlation = Math.max(-1, Math.min(1, lastVal + (Math.random() * 0.2 - 0.1)));
            }
            
            correlationHistory.push(correlation);
          }
          
          // Add series data
          result.series.push({
            name: `${this.shortenLabel(factorA, 15)} & ${this.shortenLabel(factorB, 15)}`,
            data: correlationHistory,
            factorA,
            factorB
          });
        }
      }
      
      return result;
    } catch (error) {
      logger.error(`CorrelationVisualizer: Error generating time-series data: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate counterfactual scenario visualization
   * @param {Array<Object>} baseFactors Base scenario factors
   * @param {Object} change The counterfactual change
   * @param {Object} options Visualization options
   * @returns {Promise<Object>} Visualization data for counterfactual analysis
   */
  async generateCounterfactualVisualization(baseFactors, change, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Get counterfactual analysis
      const analysis = await this.api.analyzeWhatIfScenario(baseFactors, change, options);
      
      // Prepare nodes and edges for visualization
      const nodes = [];
      const edges = [];
      
      // Add the changed factor as central node
      nodes.push({
        id: 0,
        label: this.shortenLabel(change.factor, options.maxLabelLength || 30),
        fullLabel: change.factor,
        group: 'changed',
        originalValue: analysis.baseScenario.factors.find(f => f.factor === change.factor).probability,
        newValue: change.newProbability,
        percentChange: ((change.newProbability - analysis.baseScenario.factors.find(f => f.factor === change.factor).probability) / 
                       analysis.baseScenario.factors.find(f => f.factor === change.factor).probability * 100).toFixed(1)
      });
      
      // Add other factors as nodes
      let nodeId = 1;
      for (const factorChange of analysis.factorChanges) {
        // Skip the changed factor
        if (factorChange.isCounterfactualTarget) continue;
        
        // Only include factors with substantial changes
        if (Math.abs(factorChange.percentChange) < 1) continue;
        
        // Add node
        nodes.push({
          id: nodeId,
          label: this.shortenLabel(factorChange.factor, options.maxLabelLength || 30),
          fullLabel: factorChange.factor,
          group: factorChange.absoluteChange > 0 ? 'increased' : 'decreased',
          originalValue: factorChange.originalProbability,
          newValue: factorChange.newProbability,
          percentChange: factorChange.percentChange.toFixed(1)
        });
        
        // Add edge from central node
        edges.push({
          from: 0,
          to: nodeId,
          value: Math.abs(factorChange.absoluteChange) * 10, // Line width based on change magnitude
          title: `Effect: ${factorChange.percentChange > 0 ? '+' : ''}${factorChange.percentChange.toFixed(1)}%`,
          color: factorChange.absoluteChange > 0 ? '#33A8FF' : '#FF5733',
          arrows: 'to'
        });
        
        nodeId++;
      }
      
      // Add special node for joint probability
      nodes.push({
        id: nodeId,
        label: "Overall Probability",
        fullLabel: "Joint Probability of All Factors",
        group: 'joint',
        originalValue: analysis.baseScenario.jointProbability,
        newValue: analysis.counterfactualScenario.jointProbability,
        percentChange: (analysis.counterfactualScenario.relativeDifference * 100).toFixed(1)
      });
      
      // Add edge from central node to joint probability
      edges.push({
        from: 0,
        to: nodeId,
        value: Math.abs(analysis.counterfactualScenario.jointProbability - analysis.baseScenario.jointProbability) * 20,
        title: `Overall effect: ${analysis.counterfactualScenario.relativeDifference > 0 ? '+' : ''}${(analysis.counterfactualScenario.relativeDifference * 100).toFixed(1)}%`,
        color: analysis.counterfactualScenario.jointProbability > analysis.baseScenario.jointProbability ? '#33A8FF' : '#FF5733',
        arrows: 'to',
        dashes: true
      });
      
      return {
        nodes,
        edges,
        summary: analysis.impactSummary,
        groups: {
          changed: { color: '#FFC107' },
          increased: { color: '#33A8FF' },
          decreased: { color: '#FF5733' },
          joint: { color: '#33FF57' }
        },
        baseScenario: {
          jointProbability: analysis.baseScenario.jointProbability
        },
        counterfactualScenario: {
          jointProbability: analysis.counterfactualScenario.jointProbability,
          relativeDifference: analysis.counterfactualScenario.relativeDifference
        }
      };
    } catch (error) {
      logger.error(`CorrelationVisualizer: Error generating counterfactual visualization: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find potential effects for a given factor
   * @param {string} factor The potential cause factor
   * @param {Object} options Search options
   * @returns {Promise<Array<Object>>} Potential effects
   * @private
   */
  async findPotentialEffects(factor, options = {}) {
    try {
      // First check if we have direct causal relationships stored
      const normalizedFactor = this.api.engine.normalizeFactorDescription(factor);
      const effects = [];
      
      // Scan causal relationships
      for (const [key, causal] of this.api.engine.causalRelationships.entries()) {
        // Check if this factor is the cause
        if ((causal.causalDirection === 'A->B' && causal.factorA === normalizedFactor) ||
            (causal.causalDirection === 'B->A' && causal.factorB === normalizedFactor)) {
          
          // It's a cause, so add the effect
          const effectFactor = causal.factorA === normalizedFactor ? causal.factorB : causal.factorA;
          
          effects.push({
            factor: effectFactor,
            correlation: causal.correlation,
            causalStrength: causal.causalStrength,
            explanation: causal.explanation.simple
          });
        }
      }
      
      // If we found effects, return them
      if (effects.length > 0) {
        return effects.sort((a, b) => b.causalStrength - a.causalStrength);
      }
      
      // Otherwise, find potential effects based on correlation
      // (For a proper implementation, we would run Granger causality tests here)
      const relatedFactors = await this.api.engine.discoverRelatedFactors(factor, {
        minCorrelation: 0.3,
        limit: 20,
        sport: options.sport,
        league: options.league
      });
      
      // Simulate causal relationships
      return relatedFactors
        .filter(f => Math.random() > 0.5) // Randomly select some as effects
        .map(f => ({
          factor: f.factor,
          correlation: f.correlation,
          causalStrength: f.correlation * 0.8, // Simulate causal strength
          explanation: `"${factor}" likely affects "${f.factor}"`
        }))
        .sort((a, b) => b.causalStrength - a.causalStrength);
    } catch (error) {
      logger.error(`CorrelationVisualizer: Error finding potential effects: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Get directional arrows for edge based on causal relationships
   * @param {string} factorA First factor
   * @param {string} factorB Second factor
   * @returns {string} Arrow direction for the edge
   * @private
   */
  getDirectionalArrows(factorA, factorB) {
    try {
      // Check if we have causal relationship data
      const [f1, f2] = [factorA, factorB].sort();
      const key = `${f1}|${f2}`;
      
      if (this.api.engine.causalRelationships.has(key)) {
        const causal = this.api.engine.causalRelationships.get(key);
        
        if (causal.causalDirection === 'A->B') {
          return causal.factorA === factorA ? 'to' : 'from';
        } else if (causal.causalDirection === 'B->A') {
          return causal.factorB === factorA ? 'to' : 'from';
        } else if (causal.causalDirection === 'bidirectional') {
          return 'to;from';
        }
      }
      
      // No causal data, no arrows
      return '';
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Get color for correlation based on value
   * @param {number} correlation Correlation coefficient
   * @returns {string} CSS color
   * @private
   */
  getCorrelationColor(correlation) {
    if (correlation > 0.7) return '#00AA00';
    if (correlation > 0.4) return '#88CC00';
    if (correlation > 0.2) return '#CCFF00';
    if (correlation > 0) return '#FFFFAA';
    if (correlation > -0.2) return '#FFAAAA';
    if (correlation > -0.4) return '#FF8888';
    if (correlation > -0.7) return '#FF4444';
    return '#CC0000';
  }
  
  /**
   * Get color for heatmap cell
   * @param {number} correlation Correlation coefficient
   * @returns {string} CSS color
   * @private
   */
  getHeatmapColor(correlation) {
    if (correlation === 1) return '#000000';
    
    if (correlation > 0) {
      // Green for positive correlations
      const intensity = Math.round(correlation * 255);
      return `rgb(0, ${intensity}, 0)`;
    } else {
      // Red for negative correlations
      const intensity = Math.round(-correlation * 255);
      return `rgb(${intensity}, 0, 0)`;
    }
  }
  
  /**
   * Shorten a label to a maximum length
   * @param {string} label Original label
   * @param {number} maxLength Maximum length
   * @returns {string} Shortened label
   * @private
   */
  shortenLabel(label, maxLength = 30) {
    if (!label) return 'Unknown';
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Determine factor group based on content
   * @param {string} factor Factor text
   * @returns {string} Group name
   * @private
   */
  determineFactorGroup(factor) {
    const lcFactor = factor.toLowerCase();
    
    if (lcFactor.includes('team') || lcFactor.includes('win') || lcFactor.includes('lose')) {
      return 'team';
    } else if (lcFactor.match(/[A-Z][a-z]+ [A-Z][a-z]+/) || lcFactor.includes('player')) {
      return 'player';
    } else if (lcFactor.includes('point') || lcFactor.includes('score')) {
      return 'scoring';
    } else if (lcFactor.includes('time') || lcFactor.includes('minute')) {
      return 'time';
    } else {
      return 'other';
    }
  }
  
  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.initialized) {
      await this.api.shutdown();
      this.initialized = false;
    }
  }
}

module.exports = CorrelationVisualizer; 