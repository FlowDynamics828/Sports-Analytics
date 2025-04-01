/**
 * Accuracy Report Generator
 * 
 * Enterprise-grade report generator for prediction system accuracy metrics.
 * Produces detailed reports on model performance with time-weighted analysis
 * and trend visualization.
 * 
 * @author Sports Analytics Platform Team
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { PredictionModel } = require('./models/prediction_model');
const { EventOutcomeModel } = require('./models/event_outcome_model');
const { ModelPerformanceModel } = require('./models/model_performance');
const PredictionAccuracyTracker = require('./prediction_accuracy_tracker');
const logger = require('./utils/logger');
require('dotenv').config();

// Configure report options
const REPORT_DIR = process.env.REPORT_DIR || 'reports';
const TIME_WINDOWS = {
  recent: 7,      // Last 7 days
  medium: 30,     // Last 30 days
  season: 180     // Last 180 days
};

/**
 * Generate a comprehensive accuracy report
 * @param {Object} options Report configuration options
 * @returns {Promise<Object>} Report data and file paths
 */
async function generateAccuracyReport(options = {}) {
  logger.info('Starting accuracy report generation...');
  
  // Initialize prediction tracker for access to accuracy metrics
  const tracker = new PredictionAccuracyTracker({
    enableTimeWeighting: options.enableTimeWeighting !== false
  });
  
  await tracker.initialize();
  
  try {
    // Create report directory if it doesn't exist
    if (!fs.existsSync(REPORT_DIR)) {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
    }
    
    const reportData = {
      generated_at: new Date().toISOString(),
      time_weighted_enabled: tracker.enableTimeWeighting,
      overall_metrics: {},
      sports: {},
      leagues: {},
      trending_models: [],
      calibration_data: {}
    };
    
    // Get overall accuracy metrics
    const overallMetrics = await tracker.calculateAccuracy();
    reportData.overall_metrics = overallMetrics;
    
    // Get list of all sports and leagues
    const sports = await PredictionModel.distinct('sport', { status: 'completed' });
    const leagues = await PredictionModel.distinct('league', { status: 'completed' });
    
    // Get metrics for each sport
    for (const sport of sports) {
      if (!sport) continue;
      
      const sportMetrics = await tracker.calculateAccuracy({ sport });
      reportData.sports[sport] = sportMetrics;
      
      // Get sport-specific leagues
      const sportLeagues = await PredictionModel.distinct('league', { 
        sport, 
        status: 'completed' 
      });
      
      // Add league details to sport
      reportData.sports[sport].leagues = {};
      
      for (const league of sportLeagues) {
        if (!league) continue;
        
        const leagueMetrics = await tracker.calculateAccuracy({ sport, league });
        reportData.sports[sport].leagues[league] = leagueMetrics;
        reportData.leagues[league] = leagueMetrics;
      }
    }
    
    // Get trending models (improving or declining)
    const trendingModels = await ModelPerformanceModel.find({
      $or: [
        { trending_direction: 1 }, // Improving
        { trending_direction: -1 } // Declining
      ]
    }).sort({ reliability_score: -1 }).limit(20);
    
    reportData.trending_models = trendingModels.map(model => ({
      key: model.performance_key,
      sport: model.sport,
      league: model.league,
      entity_type: model.entity_type,
      recent_accuracy: model.recent_accuracy,
      medium_term_accuracy: model.medium_term_accuracy,
      trending_direction: model.trending_direction === 1 ? 'improving' : 'declining',
      confidence_adjustment: model.confidence_adjustment,
      total_predictions: model.total_predictions
    }));
    
    // Get time-weighted window metrics
    for (const [windowName, days] of Object.entries(TIME_WINDOWS)) {
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - days);
      
      const windowMetrics = await calculateWindowMetrics(windowStart);
      reportData.calibration_data[windowName] = {
        days,
        start_date: windowStart.toISOString(),
        ...windowMetrics
      };
    }
    
    // Generate reports
    const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonReportPath = path.join(REPORT_DIR, `accuracy_report_${reportTimestamp}.json`);
    const htmlReportPath = path.join(REPORT_DIR, `accuracy_report_${reportTimestamp}.html`);
    
    // Write JSON report
    fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2));
    logger.info(`JSON report saved to ${jsonReportPath}`);
    
    // Generate HTML report with visualizations
    const htmlReport = generateHtmlReport(reportData);
    fs.writeFileSync(htmlReportPath, htmlReport);
    logger.info(`HTML report saved to ${htmlReportPath}`);
    
    await tracker.shutdown();
    
    return {
      data: reportData,
      jsonPath: jsonReportPath,
      htmlPath: htmlReportPath
    };
  } catch (error) {
    logger.error(`Error generating accuracy report: ${error.message}`);
    await tracker.shutdown();
    throw error;
  }
}

/**
 * Calculate metrics for a specific time window
 * @param {Date} windowStart Start date for the window
 * @returns {Promise<Object>} Window metrics
 * @private
 */
async function calculateWindowMetrics(windowStart) {
  try {
    // Get all predictions in this window
    const predictions = await PredictionModel.find({
      status: 'completed',
      created_at: { $gte: windowStart }
    });
    
    // Calculate key metrics
    const total = predictions.length;
    const correct = predictions.filter(p => p.is_correct).length;
    const accuracy = total > 0 ? correct / total : 0;
    
    // Calculate confidence calibration
    const avgConfidence = total > 0 ? 
      predictions.reduce((sum, p) => sum + p.confidence, 0) / total : 0;
    const calibrationError = Math.abs(accuracy - avgConfidence);
    
    // Get most accurate model types
    const modelTypeAccuracy = {};
    predictions.forEach(p => {
      const modelType = p.model_type || 'unknown';
      if (!modelTypeAccuracy[modelType]) {
        modelTypeAccuracy[modelType] = { total: 0, correct: 0 };
      }
      modelTypeAccuracy[modelType].total++;
      if (p.is_correct) {
        modelTypeAccuracy[modelType].correct++;
      }
    });
    
    // Calculate accuracy for each model type
    Object.keys(modelTypeAccuracy).forEach(key => {
      const model = modelTypeAccuracy[key];
      model.accuracy = model.total > 0 ? model.correct / model.total : 0;
    });
    
    return {
      total_predictions: total,
      correct_predictions: correct,
      accuracy,
      avg_confidence: avgConfidence,
      calibration_error: calibrationError,
      model_types: modelTypeAccuracy
    };
  } catch (error) {
    logger.error(`Error calculating window metrics: ${error.message}`);
    return {
      total_predictions: 0,
      correct_predictions: 0,
      accuracy: 0,
      error: error.message
    };
  }
}

/**
 * Generate HTML report with visualizations
 * @param {Object} reportData Report data object
 * @returns {string} HTML report content
 * @private
 */
function generateHtmlReport(reportData) {
  // Format numbers for display
  const formatPercent = (value) => (value * 100).toFixed(1) + '%';
  const formatNumber = (value) => value.toLocaleString();
  
  // Get the overall metrics
  const overall = reportData.overall_metrics;
  
  // Generate sport metrics tables
  let sportsTableRows = '';
  for (const [sport, metrics] of Object.entries(reportData.sports)) {
    sportsTableRows += `
      <tr>
        <td>${sport}</td>
        <td>${formatNumber(metrics.total_predictions)}</td>
        <td>${formatPercent(metrics.accuracy)}</td>
        <td>${formatPercent(metrics.time_windows?.recent?.accuracy || 0)}</td>
        <td>${formatPercent(metrics.time_windows?.medium?.accuracy || 0)}</td>
        <td>${formatPercent(metrics.confidence_calibration)}</td>
      </tr>
    `;
  }
  
  // Generate trending models table
  let trendingTableRows = '';
  for (const model of reportData.trending_models) {
    const trendClass = model.trending_direction === 'improving' ? 'trend-up' : 'trend-down';
    const trendIcon = model.trending_direction === 'improving' ? '↑' : '↓';
    
    trendingTableRows += `
      <tr class="${trendClass}">
        <td>${model.entity_type}</td>
        <td>${model.sport}${model.league ? ` / ${model.league}` : ''}</td>
        <td>${formatPercent(model.recent_accuracy)}</td>
        <td>${formatPercent(model.medium_term_accuracy)}</td>
        <td>${trendIcon} ${model.trending_direction}</td>
        <td>${model.confidence_adjustment.toFixed(2)}</td>
        <td>${formatNumber(model.total_predictions)}</td>
      </tr>
    `;
  }
  
  // Generate time window comparison data for charts
  const timeWindowLabels = Object.keys(reportData.calibration_data).map(w => w.charAt(0).toUpperCase() + w.slice(1));
  const accuracyData = Object.values(reportData.calibration_data).map(w => w.accuracy);
  const predictionsData = Object.values(reportData.calibration_data).map(w => w.total_predictions);
  const calibrationData = Object.values(reportData.calibration_data).map(w => 1 - w.calibration_error);
  
  // Generate HTML content with embedded chart.js
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prediction Accuracy Report - ${new Date().toLocaleDateString()}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid #eee;
      padding-bottom: 20px;
    }
    .report-meta {
      color: #7f8c8d;
      font-size: 0.9em;
    }
    .metrics-container {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      margin-bottom: 30px;
    }
    .metric-card {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      width: calc(25% - 20px);
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .metric-value {
      font-size: 2em;
      font-weight: bold;
      color: #2980b9;
      margin: 10px 0;
    }
    .metric-label {
      font-size: 0.9em;
      color: #7f8c8d;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f8f9fa;
      font-weight: bold;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .chart-container {
      margin-bottom: 30px;
      height: 400px;
    }
    .trend-up {
      color: #27ae60;
    }
    .trend-down {
      color: #e74c3c;
    }
    .time-weighted-badge {
      display: inline-block;
      background: #3498db;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <h1>Prediction Accuracy Report
        ${reportData.time_weighted_enabled ? 
          '<span class="time-weighted-badge">Time-Weighted Learning Enabled</span>' : ''}
      </h1>
      <p class="report-meta">Generated on: ${new Date(reportData.generated_at).toLocaleString()}</p>
    </div>
  </div>

  <div class="metrics-container">
    <div class="metric-card">
      <div class="metric-label">Overall Accuracy</div>
      <div class="metric-value">${formatPercent(overall.accuracy)}</div>
      <div class="metric-label">Based on ${formatNumber(overall.total_predictions)} predictions</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Recent Accuracy (7 days)</div>
      <div class="metric-value">${formatPercent(overall.time_windows?.recent?.accuracy || 0)}</div>
      <div class="metric-label">${formatNumber(overall.time_windows?.recent?.total_predictions || 0)} predictions</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Confidence Calibration</div>
      <div class="metric-value">${formatPercent(overall.confidence_calibration)}</div>
      <div class="metric-label">Higher is better</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Improvement Factor</div>
      <div class="metric-value">${overall.improvement_factor ? overall.improvement_factor.toFixed(2) : 'N/A'}</div>
      <div class="metric-label">Confidence adjustment impact</div>
    </div>
  </div>

  <h2>Accuracy Trends</h2>
  <div class="chart-container">
    <canvas id="accuracyChart"></canvas>
  </div>

  <h2>Sport Performance</h2>
  <table>
    <thead>
      <tr>
        <th>Sport</th>
        <th>Predictions</th>
        <th>Overall Accuracy</th>
        <th>Recent (7d)</th>
        <th>Medium (30d)</th>
        <th>Calibration</th>
      </tr>
    </thead>
    <tbody>
      ${sportsTableRows}
    </tbody>
  </table>

  <h2>Trending Models</h2>
  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th>Sport/League</th>
        <th>Recent Accuracy</th>
        <th>Medium-term</th>
        <th>Trend</th>
        <th>Adjustment</th>
        <th>Predictions</th>
      </tr>
    </thead>
    <tbody>
      ${trendingTableRows}
    </tbody>
  </table>

  <script>
    // Create accuracy trend chart
    const ctx = document.getElementById('accuracyChart').getContext('2d');
    const accuracyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(timeWindowLabels)},
        datasets: [
          {
            label: 'Accuracy',
            data: ${JSON.stringify(accuracyData)},
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Calibration Score',
            data: ${JSON.stringify(calibrationData)},
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Predictions',
            data: ${JSON.stringify(predictionsData)},
            type: 'line',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Accuracy & Calibration'
            },
            max: 1,
            ticks: {
              callback: function(value) {
                return (value * 100) + '%';
              }
            }
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Predictions'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  </script>
</body>
</html>
  `;
}

// Export for use in other modules
module.exports = { generateAccuracyReport };

// Run directly if called from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    enableTimeWeighting: args.includes('--enable-time-weighting') || !args.includes('--disable-time-weighting')
  };
  
  generateAccuracyReport(options)
    .then(report => {
      console.log(`\nReport generated successfully!`);
      console.log(`- JSON report: ${report.jsonPath}`);
      console.log(`- HTML report: ${report.htmlPath}`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`Error generating report: ${error.message}`);
      process.exit(1);
    });
} 