/**
 * Adaptive Window Analyzer for Time Series
 * 
 * Automatically determines optimal window sizes for analyzing
 * time series data with dynamic temporal patterns
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const math = require('mathjs');
const logger = require('../../utils/logger');

class AdaptiveWindowAnalyzer {
  /**
   * Initialize adaptive window analyzer
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Window configuration
    this.minWindowSize = config.minWindowSize || 5;
    this.maxWindowSize = config.maxWindowSize || 365;
    this.defaultWindowSizes = config.defaultWindowSizes || [7, 14, 30, 60, 90];
    
    // Adaptation parameters
    this.adaptationRate = config.adaptationRate || 0.1;
    this.metricThreshold = config.metricThreshold || 0.05;
    
    // Window selection strategy
    this.selectionStrategy = config.selectionStrategy || 'confidence';
    this.volatilityWeight = config.volatilityWeight || 0.5;
    
    // State tracking
    this.lastOptimalWindows = new Map();
    this.windowPerformance = new Map();
    this.analysisCount = 0;
    
    // Bind methods
    this.analyzeTimeSeries = this.analyzeTimeSeries.bind(this);
    this.findOptimalWindow = this.findOptimalWindow.bind(this);
    this.calculateWindowedCorrelations = this.calculateWindowedCorrelations.bind(this);
  }

  /**
   * Analyze time series data with automatic window sizing
   * @param {Array<number>} seriesA First time series
   * @param {Array<number>} seriesB Second time series
   * @param {Array<Date>} dates Dates for the time series
   * @param {Object} options Additional options
   * @returns {Object} Analysis results with optimal window
   */
  analyzeTimeSeries(seriesA, seriesB, dates, options = {}) {
    this.analysisCount++;
    
    try {
      // Validate inputs
      if (!seriesA || !seriesB || !dates) {
        throw new Error('Invalid input time series');
      }
      
      if (seriesA.length !== seriesB.length || seriesA.length !== dates.length) {
        throw new Error('Time series must have the same length');
      }
      
      // Extract options
      const contextKey = options.contextKey || 'default';
      const adaptationEnabled = options.adaptation !== false;
      const forceRecalculation = options.forceRecalculation === true;
      
      // Check if we have a previous optimal window for this context
      let candidateWindows = [];
      if (!forceRecalculation && this.lastOptimalWindows.has(contextKey)) {
        const lastOptimal = this.lastOptimalWindows.get(contextKey);
        
        // Include previous optimal window and windows around it
        candidateWindows.push(lastOptimal);
        
        // Add windows around the optimal
        const windowStep = Math.max(1, Math.floor(lastOptimal / 5));
        for (let offset of [-2, -1, 1, 2]) {
          const windowSize = lastOptimal + offset * windowStep;
          if (windowSize >= this.minWindowSize && windowSize <= this.maxWindowSize) {
            candidateWindows.push(windowSize);
          }
        }
      }
      
      // Add default windows if not enough candidates
      if (candidateWindows.length < 3) {
        candidateWindows = this.defaultWindowSizes.filter(
          w => w >= this.minWindowSize && w <= Math.min(this.maxWindowSize, seriesA.length / 2)
        );
      }
      
      // Ensure we have at least one valid window
      if (candidateWindows.length === 0) {
        candidateWindows = [
          Math.min(
            Math.max(this.minWindowSize, Math.floor(seriesA.length / 5)),
            this.maxWindowSize
          )
        ];
      }
      
      // Find optimal window
      const result = this.findOptimalWindow(
        seriesA, seriesB, dates, candidateWindows, options
      );
      
      // Update optimal window if adaptation is enabled
      if (adaptationEnabled) {
        this.lastOptimalWindows.set(contextKey, result.optimalWindow);
        
        // Update window performance tracking
        for (const windowResult of result.windowResults) {
          const windowSize = windowResult.windowSize;
          const performance = windowResult.performance;
          
          if (!this.windowPerformance.has(windowSize)) {
            this.windowPerformance.set(windowSize, []);
          }
          
          const performances = this.windowPerformance.get(windowSize);
          performances.push(performance);
          
          // Keep only the most recent performances
          if (performances.length > 50) {
            performances.shift();
          }
        }
      }
      
      return result;
    } catch (error) {
      logger.error(`AdaptiveWindowAnalyzer: Analysis error: ${error.message}`);
      
      // Return a default result
      return {
        optimalWindow: this.defaultWindowSizes[0],
        correlation: 0,
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Find optimal window size for time series analysis
   * @param {Array<number>} seriesA First time series
   * @param {Array<number>} seriesB Second time series
   * @param {Array<Date>} dates Dates for the time series
   * @param {Array<number>} windowSizes Window sizes to evaluate
   * @param {Object} options Additional options
   * @returns {Object} Analysis results with optimal window
   * @private
   */
  findOptimalWindow(seriesA, seriesB, dates, windowSizes, options = {}) {
    try {
      // Sort data chronologically
      const timeSeriesData = [];
      for (let i = 0; i < seriesA.length; i++) {
        timeSeriesData.push({
          date: dates[i],
          valueA: seriesA[i],
          valueB: seriesB[i]
        });
      }
      
      timeSeriesData.sort((a, b) => a.date - b.date);
      
      // Extract sorted arrays
      const sortedSeriesA = timeSeriesData.map(d => d.valueA);
      const sortedSeriesB = timeSeriesData.map(d => d.valueB);
      const sortedDates = timeSeriesData.map(d => d.date);
      
      // Calculate full series correlation for reference
      const fullCorrelation = this.calculatePearsonCorrelation(
        sortedSeriesA, sortedSeriesB
      );
      
      // Get statistic for each window size
      const windowResults = [];
      
      for (const windowSize of windowSizes) {
        // Skip window sizes larger than data
        if (windowSize >= sortedSeriesA.length) {
          continue;
        }
        
        // Calculate windowed correlations
        const windowedCorrelations = this.calculateWindowedCorrelations(
          sortedSeriesA, sortedSeriesB, sortedDates, windowSize
        );
        
        // Skip if no valid windows
        if (windowedCorrelations.length === 0) {
          continue;
        }
        
        // Calculate statistics
        const correlations = windowedCorrelations.map(w => w.correlation);
        
        // Calculate average correlation
        const avgCorrelation = correlations.reduce((sum, c) => sum + c, 0) / correlations.length;
        
        // Calculate recency-weighted correlation
        const weights = [];
        const halfLifeWindows = 10;
        for (let i = 0; i < correlations.length; i++) {
          weights.push(Math.exp(-Math.log(2) * (correlations.length - 1 - i) / halfLifeWindows));
        }
        
        const weightSum = weights.reduce((sum, w) => sum + w, 0);
        const weightedCorrelation = correlations.reduce(
          (sum, c, i) => sum + c * weights[i], 0
        ) / weightSum;
        
        // Calculate volatility (standard deviation)
        const squaredDiffs = correlations.map(c => Math.pow(c - avgCorrelation, 2));
        const variance = squaredDiffs.reduce((sum, sq) => sum + sq, 0) / correlations.length;
        const volatility = Math.sqrt(variance);
        
        // Calculate confidence based on multiple factors
        const windowCountFactor = Math.min(1, windowedCorrelations.length / 20);
        const volatilityFactor = Math.max(0, 1 - volatility * 2);
        const stabilityFactor = Math.exp(-Math.abs(weightedCorrelation - fullCorrelation.coefficient) * 2);
        
        const confidence = (
          windowCountFactor * 0.4 +
          volatilityFactor * 0.4 +
          stabilityFactor * 0.2
        );
        
        // Calculate performance score based on selection strategy
        let performance;
        switch (this.selectionStrategy) {
          case 'confidence':
            performance = confidence;
            break;
          
          case 'recency':
            // Favor recent correlations
            performance = windowedCorrelations[windowedCorrelations.length - 1].correlation;
            break;
          
          case 'stability':
            // Favor low volatility
            performance = 1 - volatility;
            break;
          
          case 'balanced':
          default:
            // Balance between confidence and correlation strength
            performance = confidence * 0.7 + Math.abs(weightedCorrelation) * 0.3;
        }
        
        windowResults.push({
          windowSize,
          windowCount: windowedCorrelations.length,
          correlation: weightedCorrelation,
          avgCorrelation,
          volatility,
          confidence,
          performance,
          recentCorrelation: windowedCorrelations[windowedCorrelations.length - 1].correlation,
          windowedCorrelations: windowedCorrelations.slice(-5) // Include only the most recent ones
        });
      }
      
      // Select the best window
      windowResults.sort((a, b) => b.performance - a.performance);
      
      // Check if we have any valid windows
      if (windowResults.length === 0) {
        throw new Error('No valid window sizes found');
      }
      
      const bestWindow = windowResults[0];
      
      return {
        optimalWindow: bestWindow.windowSize,
        correlation: bestWindow.correlation,
        confidence: bestWindow.confidence,
        fullCorrelation: fullCorrelation.coefficient,
        volatility: bestWindow.volatility,
        windowCount: bestWindow.windowCount,
        recentCorrelation: bestWindow.recentCorrelation,
        windowResults
      };
    } catch (error) {
      logger.error(`AdaptiveWindowAnalyzer: Error finding optimal window: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate windowed correlations
   * @param {Array<number>} seriesA First time series
   * @param {Array<number>} seriesB Second time series
   * @param {Array<Date>} dates Dates for the time series
   * @param {number} windowSize Size of the window
   * @returns {Array<Object>} Windowed correlations
   * @private
   */
  calculateWindowedCorrelations(seriesA, seriesB, dates, windowSize) {
    try {
      const results = [];
      
      // Need at least windowSize elements
      if (seriesA.length < windowSize) {
        return results;
      }
      
      // Calculate correlation for each window
      for (let i = 0; i <= seriesA.length - windowSize; i++) {
        const windowA = seriesA.slice(i, i + windowSize);
        const windowB = seriesB.slice(i, i + windowSize);
        const windowDates = dates.slice(i, i + windowSize);
        
        const correlation = this.calculatePearsonCorrelation(windowA, windowB);
        
        results.push({
          startIndex: i,
          endIndex: i + windowSize - 1,
          startDate: windowDates[0],
          endDate: windowDates[windowDates.length - 1],
          correlation: correlation.coefficient,
          confidence: correlation.confidence
        });
      }
      
      return results;
    } catch (error) {
      logger.error(`AdaptiveWindowAnalyzer: Error calculating windowed correlations: ${error.message}`);
      return [];
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
      logger.error(`AdaptiveWindowAnalyzer: Error calculating Pearson correlation: ${error.message}`);
      return { coefficient: 0, confidence: 0 };
    }
  }

  /**
   * Suggest window sizes for a specific context
   * @param {string} contextKey Context identifier
   * @param {number} dataLength Length of the data
   * @returns {Array<number>} Suggested window sizes
   */
  suggestWindowSizes(contextKey, dataLength) {
    try {
      // First check if we have optimal window for this context
      if (this.lastOptimalWindows.has(contextKey)) {
        const optimal = this.lastOptimalWindows.get(contextKey);
        
        // Generate windows around optimal
        const step = Math.max(1, Math.floor(optimal / 4));
        const suggested = [optimal];
        
        for (let i = 1; i <= 2; i++) {
          const smaller = optimal - i * step;
          const larger = optimal + i * step;
          
          if (smaller >= this.minWindowSize) {
            suggested.push(smaller);
          }
          
          if (larger <= this.maxWindowSize && larger <= dataLength / 2) {
            suggested.push(larger);
          }
        }
        
        return suggested.sort((a, b) => a - b);
      }
      
      // If no optimal window, use default windows based on data length
      const maxWindow = Math.min(this.maxWindowSize, Math.floor(dataLength / 2));
      
      // Generate logarithmically spaced windows
      const windows = [];
      let current = this.minWindowSize;
      
      while (current <= maxWindow) {
        windows.push(current);
        current = Math.ceil(current * 1.5);
      }
      
      // Ensure we have reasonable number of windows
      if (windows.length <= 2 && maxWindow > this.minWindowSize) {
        // Add linear spacing if not enough windows
        const step = Math.max(1, Math.floor((maxWindow - this.minWindowSize) / 4));
        
        windows.length = 0;
        for (let w = this.minWindowSize; w <= maxWindow; w += step) {
          windows.push(w);
        }
      }
      
      return windows;
    } catch (error) {
      logger.error(`AdaptiveWindowAnalyzer: Error suggesting window sizes: ${error.message}`);
      
      // Return default windows as fallback
      return this.defaultWindowSizes.filter(
        w => w >= this.minWindowSize && w <= Math.min(this.maxWindowSize, dataLength / 2)
      );
    }
  }

  /**
   * Check window performance and adapt parameters
   * @param {Object} options Additional options
   * @returns {Object} Adaptation results
   */
  adaptParameters(options = {}) {
    try {
      // Skip if not enough data
      if (this.windowPerformance.size < 3) {
        return {
          adapted: false,
          message: 'Not enough data for adaptation'
        };
      }
      
      // Calculate average performance for each window size
      const performanceStats = {};
      
      for (const [windowSize, performances] of this.windowPerformance.entries()) {
        if (performances.length < 5) continue;
        
        const avg = performances.reduce((sum, p) => sum + p, 0) / performances.length;
        
        // Calculate recent performance (last 30%)
        const recentCount = Math.max(1, Math.ceil(performances.length * 0.3));
        const recentPerformances = performances.slice(-recentCount);
        const recentAvg = recentPerformances.reduce((sum, p) => sum + p, 0) / recentCount;
        
        // Calculate trend
        const trend = recentAvg - avg;
        
        performanceStats[windowSize] = {
          averagePerformance: avg,
          recentPerformance: recentAvg,
          trend,
          sampleCount: performances.length
        };
      }
      
      // Check if we have enough statistics
      if (Object.keys(performanceStats).length < 2) {
        return {
          adapted: false,
          message: 'Not enough window statistics for adaptation'
        };
      }
      
      // Find best performing window size
      let bestWindowSize = null;
      let bestPerformance = -Infinity;
      
      for (const [windowSize, stats] of Object.entries(performanceStats)) {
        // Use recent performance with trend bonus
        const score = stats.recentPerformance + stats.trend * 0.5;
        
        if (score > bestPerformance) {
          bestPerformance = score;
          bestWindowSize = parseInt(windowSize);
        }
      }
      
      // Add/remove window sizes based on performance
      const adaptations = [];
      
      // Check if we should add new window sizes around best performer
      if (bestWindowSize !== null) {
        const step = Math.max(1, Math.floor(bestWindowSize / 5));
        
        // Check smaller window
        const smallerWindow = bestWindowSize - step;
        if (smallerWindow >= this.minWindowSize && !performanceStats[smallerWindow]) {
          adaptations.push({
            type: 'add',
            windowSize: smallerWindow,
            reason: 'Exploring around best performer'
          });
        }
        
        // Check larger window
        const largerWindow = bestWindowSize + step;
        if (largerWindow <= this.maxWindowSize && !performanceStats[largerWindow]) {
          adaptations.push({
            type: 'add',
            windowSize: largerWindow,
            reason: 'Exploring around best performer'
          });
        }
      }
      
      // Update adaptation parameters
      const adaptationThreshold = options.adaptationThreshold || this.metricThreshold;
      
      // Find if there are significant performance differences
      const performances = Object.values(performanceStats).map(s => s.recentPerformance);
      const avgPerformance = performances.reduce((sum, p) => sum + p, 0) / performances.length;
      const maxDifference = Math.max(...performances) - Math.min(...performances);
      
      if (maxDifference > adaptationThreshold) {
        // Significant differences found, adjust adaptation rate
        const newRate = Math.min(0.3, this.adaptationRate * 1.1);
        
        if (newRate !== this.adaptationRate) {
          this.adaptationRate = newRate;
          
          adaptations.push({
            type: 'parameter',
            parameter: 'adaptationRate',
            oldValue: this.adaptationRate,
            newValue: newRate,
            reason: 'Significant performance differences'
          });
        }
      } else {
        // Small differences, reduce adaptation rate
        const newRate = Math.max(0.05, this.adaptationRate * 0.9);
        
        if (newRate !== this.adaptationRate) {
          this.adaptationRate = newRate;
          
          adaptations.push({
            type: 'parameter',
            parameter: 'adaptationRate',
            oldValue: this.adaptationRate,
            newValue: newRate,
            reason: 'Small performance differences'
          });
        }
      }
      
      // Add default windows if we have too few
      if (Object.keys(performanceStats).length < 3) {
        for (const defWindow of this.defaultWindowSizes) {
          if (!performanceStats[defWindow] && 
              defWindow >= this.minWindowSize && 
              defWindow <= this.maxWindowSize) {
            adaptations.push({
              type: 'add',
              windowSize: defWindow,
              reason: 'Adding default window for exploration'
            });
          }
        }
      }
      
      return {
        adapted: adaptations.length > 0,
        adaptations,
        performanceStats,
        bestWindowSize
      };
    } catch (error) {
      logger.error(`AdaptiveWindowAnalyzer: Error adapting parameters: ${error.message}`);
      return {
        adapted: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate change detection in time series using adaptive windows
   * @param {Array<number>} timeSeries Time series data
   * @param {Array<Date>} dates Dates for the time series
   * @param {Object} options Additional options
   * @returns {Object} Change points and segments
   */
  detectChanges(timeSeries, dates, options = {}) {
    try {
      // Validate inputs
      if (!timeSeries || !dates) {
        throw new Error('Invalid input time series');
      }
      
      if (timeSeries.length !== dates.length) {
        throw new Error('Time series and dates must have the same length');
      }
      
      // Extract options
      const minSegmentSize = options.minSegmentSize || Math.max(5, Math.ceil(timeSeries.length / 20));
      const changeThreshold = options.changeThreshold || 0.3;
      const maxSegments = options.maxSegments || 10;
      
      // Sort data chronologically
      const data = [];
      for (let i = 0; i < timeSeries.length; i++) {
        data.push({
          date: dates[i],
          value: timeSeries[i]
        });
      }
      
      data.sort((a, b) => a.date - b.date);
      
      // Extract sorted arrays
      const sortedValues = data.map(d => d.value);
      const sortedDates = data.map(d => d.date);
      
      // Use adaptive windows for change detection
      const smallWindow = Math.max(this.minWindowSize, Math.ceil(timeSeries.length / 20));
      const largeWindow = Math.min(
        this.maxWindowSize, 
        Math.max(smallWindow * 3, Math.floor(timeSeries.length / 3))
      );
      
      // Calculate statistics for each window at each point
      const statistics = [];
      
      for (let i = 0; i < sortedValues.length; i++) {
        // Skip if not enough data for small window
        if (i < smallWindow) {
          continue;
        }
        
        // Calculate small window statistics
        const smallWindowData = sortedValues.slice(Math.max(0, i - smallWindow), i);
        const smallMean = smallWindowData.reduce((sum, v) => sum + v, 0) / smallWindowData.length;
        const smallVarSum = smallWindowData.reduce((sum, v) => sum + Math.pow(v - smallMean, 2), 0);
        const smallStd = Math.sqrt(smallVarSum / smallWindowData.length);
        
        // Calculate large window statistics if possible
        let largeMean = null;
        let largeStd = null;
        
        if (i >= largeWindow) {
          const largeWindowData = sortedValues.slice(Math.max(0, i - largeWindow), i);
          largeMean = largeWindowData.reduce((sum, v) => sum + v, 0) / largeWindowData.length;
          const largeVarSum = largeWindowData.reduce((sum, v) => sum + Math.pow(v - largeMean, 2), 0);
          largeStd = Math.sqrt(largeVarSum / largeWindowData.length);
        }
        
        // Store statistics
        statistics.push({
          index: i,
          date: sortedDates[i],
          value: sortedValues[i],
          smallWindowMean: smallMean,
          smallWindowStd: smallStd,
          largeWindowMean: largeMean,
          largeWindowStd: largeStd
        });
      }
      
      // Calculate change scores based on window differences
      const changeScores = [];
      
      for (let i = 0; i < statistics.length; i++) {
        const stat = statistics[i];
        
        // Skip if no large window statistics
        if (stat.largeWindowMean === null) {
          continue;
        }
        
        // Calculate z-score of difference between small and large window
        const meanDiff = Math.abs(stat.smallWindowMean - stat.largeWindowMean);
        const stdDiff = Math.abs(stat.smallWindowStd - stat.largeWindowStd);
        
        // Normalize differences
        const normalizedMeanDiff = meanDiff / Math.max(0.0001, stat.largeWindowStd);
        const normalizedStdDiff = stdDiff / Math.max(0.0001, stat.largeWindowStd);
        
        // Combine into change score
        const changeScore = normalizedMeanDiff * 0.7 + normalizedStdDiff * 0.3;
        
        changeScores.push({
          index: stat.index,
          date: stat.date,
          changeScore
        });
      }
      
      // Find significant change points
      const significantChanges = [];
      
      // Add potential change points
      for (let i = 1; i < changeScores.length - 1; i++) {
        const prev = changeScores[i - 1].changeScore;
        const curr = changeScores[i].changeScore;
        const next = changeScores[i + 1].changeScore;
        
        // Check if current point is a local maximum
        if (curr > prev && curr > next && curr > changeThreshold) {
          significantChanges.push({
            index: changeScores[i].index,
            date: changeScores[i].date,
            score: curr
          });
        }
      }
      
      // Sort by change score (descending)
      significantChanges.sort((a, b) => b.score - a.score);
      
      // Select top changes while respecting minimum segment size
      const selectedChanges = [];
      
      for (const change of significantChanges) {
        // Check if this change point is far enough from already selected ones
        if (selectedChanges.every(
          selected => Math.abs(selected.index - change.index) >= minSegmentSize
        )) {
          selectedChanges.push(change);
          
          // Stop if we have enough segments
          if (selectedChanges.length >= maxSegments - 1) {
            break;
          }
        }
      }
      
      // Sort by index
      selectedChanges.sort((a, b) => a.index - b.index);
      
      // Create segments
      const segments = [];
      let startIndex = 0;
      
      for (const change of selectedChanges) {
        segments.push({
          start: startIndex,
          end: change.index,
          startDate: sortedDates[startIndex],
          endDate: sortedDates[change.index],
          length: change.index - startIndex + 1
        });
        
        startIndex = change.index + 1;
      }
      
      // Add final segment
      segments.push({
        start: startIndex,
        end: sortedValues.length - 1,
        startDate: sortedDates[startIndex],
        endDate: sortedDates[sortedValues.length - 1],
        length: sortedValues.length - startIndex
      });
      
      // Calculate segment statistics
      for (const segment of segments) {
        const segmentData = sortedValues.slice(segment.start, segment.end + 1);
        const mean = segmentData.reduce((sum, v) => sum + v, 0) / segmentData.length;
        const varSum = segmentData.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
        const std = Math.sqrt(varSum / segmentData.length);
        
        segment.mean = mean;
        segment.std = std;
      }
      
      return {
        changePoints: selectedChanges,
        segments,
        allScores: changeScores
      };
    } catch (error) {
      logger.error(`AdaptiveWindowAnalyzer: Error detecting changes: ${error.message}`);
      return {
        changePoints: [],
        segments: [{
          start: 0,
          end: timeSeries.length - 1,
          startDate: dates[0],
          endDate: dates[dates.length - 1],
          length: timeSeries.length
        }],
        error: error.message
      };
    }
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      analysisCount: this.analysisCount,
      contextCount: this.lastOptimalWindows.size,
      windowCount: this.windowPerformance.size,
      adaptationRate: this.adaptationRate
    };
  }
}

module.exports = AdaptiveWindowAnalyzer;