# Factor Correlation Analysis Engine

## Overview

The Factor Correlation Analysis Engine is an enterprise-grade component of the Sports Analytics Platform that analyzes correlations between different prediction factors to improve multi-factor prediction accuracy. This engine identifies relationships between factors and provides mathematical models for combining single-factor predictions into more accurate joint probabilities.

## Key Features

- **Advanced Statistical Analysis**: Uses sophisticated statistical methods to identify relationships between sports prediction factors
- **Time-Series Correlation Tracking**: Tracks how correlations evolve over time to adapt to changing patterns
- **Sport and League-Specific Analysis**: Maintains separate correlation matrices for different sports and leagues
- **Gaussian Copula Method**: Implements advanced mathematical techniques for multi-factor probability calculations
- **Caching System**: Uses both Redis and in-memory caching for high-performance operation
- **Correlation Insights**: Generates actionable insights about factor relationships
- **Robust Error Handling**: Includes fallback mechanisms and graceful degradation

## Technical Implementation

The engine uses several advanced mathematical and statistical techniques:

1. **Pearson Correlation Coefficient**: Measures linear correlation between factors
2. **Gaussian Copula**: Advanced method for joining multiple probability distributions
3. **Monte Carlo Simulation**: Used for approximating complex joint probabilities
4. **Confidence Calibration**: Adjusts confidence based on correlation strength
5. **Matrix Manipulation**: Ensures correlation matrices maintain mathematical properties

## Usage Example

```javascript
// Initialize the engine
const engine = new FactorCorrelationEngine();
await engine.initialize();

// Calculate joint probability for multiple factors
const factorPredictions = [
  { factor: 'Team A wins', probability: 0.7, confidence: 0.8 },
  { factor: 'Player X scores more than 25 points', probability: 0.6, confidence: 0.75 }
];

const result = await engine.calculateMultiFactorProbability(factorPredictions);
console.log(`Joint probability: ${result.joint_probability}`);
console.log(`Joint confidence: ${result.joint_confidence}`);

// Get correlation between two specific factors
const correlation = await engine.getFactorCorrelation(
  'Team A wins', 
  'Player X scores more than 25 points'
);
console.log(`Correlation: ${correlation}`);

// Clean up when done
await engine.shutdown();
```

## Dependencies

- MongoDB (for correlation storage)
- Redis (for caching)
- mathjs (for matrix operations)
- uuid (for generating unique IDs)

## Maintenance

The correlation matrices are automatically rebuilt periodically to incorporate new data. You can also trigger a manual rebuild using the `rebuildCorrelationMatrices()` method.

## Integration with Prediction System

This engine seamlessly integrates with the Prediction Accuracy Tracking system to form a comprehensive prediction analytics framework. While the accuracy tracker focuses on adapting predictions based on historical accuracy, the correlation engine focuses on understanding the relationships between different prediction factors. 