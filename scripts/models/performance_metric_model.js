/**
 * MongoDB Schema for Performance Metric Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PerformanceMetricSchema = new Schema({
  // Metric type
  metric_type: {
    type: String,
    required: true,
    enum: [
      'system_metrics',
      'system_initialization',
      'correlation_calculation',
      'api_request',
      'model_training',
      'inference',
      'database_operation',
      'experiment_metrics'
    ],
    index: true
  },
  
  // Time information
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Data
  data: {
    type: Schema.Types.Mixed,
    required: true
  },
  
  // Context
  system_version: {
    type: String
  },
  component: {
    type: String,
    index: true
  },
  environment: {
    type: String,
    enum: ['development', 'testing', 'staging', 'production'],
    default: 'production',
    index: true
  },
  
  // Additional metadata
  tags: {
    type: [String],
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create compound indices
PerformanceMetricSchema.index({ metric_type: 1, timestamp: -1 });
PerformanceMetricSchema.index({ component: 1, metric_type: 1, timestamp: -1 });

// TTL index for auto-deletion of old metrics
PerformanceMetricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days

// Static methods
PerformanceMetricSchema.statics.getRecentMetrics = async function(metricType, component, hours = 24) {
  const query = { metric_type: metricType };
  if (component) {
    query.component = component;
  }
  
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hours);
  
  return this.find({
    ...query,
    timestamp: { $gte: cutoff }
  })
  .sort({ timestamp: -1 });
};

PerformanceMetricSchema.statics.getAggregatedMetrics = async function(metricType, component, groupByField, hours = 24) {
  const query = { metric_type: metricType };
  if (component) {
    query.component = component;
  }
  
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hours);
  query.timestamp = { $gte: cutoff };
  
  return this.aggregate([
    { $match: query },
    { $group: {
      _id: `$data.${groupByField}`,
      count: { $sum: 1 },
      avgValue: { $avg: `$data.${groupByField}` },
      minValue: { $min: `$data.${groupByField}` },
      maxValue: { $max: `$data.${groupByField}` }
    }},
    { $sort: { _id: 1 } }
  ]);
};

// Create and export the model
const PerformanceMetricModel = mongoose.model('PerformanceMetric', PerformanceMetricSchema);
module.exports = { PerformanceMetricModel };