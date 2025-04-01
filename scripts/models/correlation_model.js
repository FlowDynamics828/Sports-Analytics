/**
 * MongoDB Schema for Correlation Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CorrelationSchema = new Schema({
  // Factor identifiers
  factor_a: {
    type: String,
    required: true,
    index: true
  },
  factor_b: {
    type: String,
    required: true,
    index: true
  },
  
  // Correlation data
  correlation_coefficient: {
    type: Number,
    required: true,
    min: -1,
    max: 1
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  data_points: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Analysis metadata
  effective_sample_size: {
    type: Number,
    default: 0
  },
  recency_score: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  trend: {
    type: Number,
    min: -1,
    max: 1,
    default: 0
  },
  
  // Domain information
  sport: {
    type: String,
    index: true
  },
  league: {
    type: String,
    index: true
  },
  
  // Method information
  method: {
    type: String,
    enum: ['statistical', 'transformer', 'bayesian_nn', 'kernel', 'adaptive_window', 'transfer_learning', 'default', 'fallback'],
    default: 'statistical'
  },
  model_version: {
    type: String
  },
  
  // Uncertainty quantification
  confidence_interval: {
    lower: { type: Number, min: -1, max: 1 },
    upper: { type: Number, min: -1, max: 1 }
  },
  
  // Non-linear correlation
  non_linearity_score: {
    type: Number,
    min: 0,
    max: 1
  },
  non_linear_correlation: {
    type: Number,
    min: -1,
    max: 1
  },
  
  // Versioning and updates
  version: {
    type: Number,
    required: true,
    default: 1
  },
  last_updated: {
    type: Date,
    required: true,
    default: Date.now
  },
  update_source: {
    type: String,
    enum: ['calculation', 'batch_update', 'manual', 'correction', 'transfer'],
    default: 'calculation'
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create a compound index for factor pairs
CorrelationSchema.index({ factor_a: 1, factor_b: 1, sport: 1, league: 1 }, { unique: true });

// Create an index for trends
CorrelationSchema.index({ trend: -1, recency_score: -1 });

// Create an index for non-linearity
CorrelationSchema.index({ non_linearity_score: -1 });

// Instance methods
CorrelationSchema.methods.formatResponse = function() {
  return {
    factorA: this.factor_a,
    factorB: this.factor_b,
    coefficient: this.correlation_coefficient,
    confidence: this.confidence,
    dataPoints: this.data_points,
    sport: this.sport,
    league: this.league,
    lastUpdate: this.last_updated,
    method: this.method
  };
};

// Static methods
CorrelationSchema.statics.getTopCorrelations = async function(sport, league, limit = 10) {
  return this.find({ sport, league })
    .sort({ correlation_coefficient: -1 })
    .limit(limit);
};

CorrelationSchema.statics.getTopNonLinearCorrelations = async function(sport, league, limit = 10) {
  return this.find({ sport, league, non_linearity_score: { $gt: 0.3 } })
    .sort({ non_linearity_score: -1 })
    .limit(limit);
};

// Create and export the model
const CorrelationModel = mongoose.model('Correlation', CorrelationSchema);
module.exports = { CorrelationModel };