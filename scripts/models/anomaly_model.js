/**
 * MongoDB Schema for Anomaly Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AnomalySchema = new Schema({
  // Anomaly type
  anomaly_type: {
    type: String,
    required: true,
    enum: [
      'correlation_change',
      'factor_change',
      'system_performance',
      'prediction_accuracy',
      'data_quality',
      'model_drift',
      'outlier'
    ],
    index: true
  },
  
  // Detection information
  detection_time: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  
  // Anomaly details
  details: {
    type: Schema.Types.Mixed,
    required: true
  },
  
  // Related entities
  related_factors: {
    type: [String],
    index: true
  },
  related_models: {
    type: [String]
  },
  sport: {
    type: String,
    index: true
  },
  league: {
    type: String,
    index: true
  },
  
  // Resolution status
  is_resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolution_time: {
    type: Date
  },
  resolution_note: {
    type: String
  },
  
  // Actions
  actions_taken: [{
    action: String,
    timestamp: Date,
    user: String,
    result: String
  }],
  
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
AnomalySchema.index({ is_resolved: 1, severity: -1, detection_time: -1 });
AnomalySchema.index({ anomaly_type: 1, sport: 1, league: 1 });

// Instance methods
AnomalySchema.methods.resolve = function(note, actionTaken) {
  this.is_resolved = true;
  this.resolution_time = new Date();
  this.resolution_note = note;
  
  if (actionTaken) {
    this.actions_taken.push({
      action: actionTaken,
      timestamp: new Date(),
      result: 'resolved'
    });
  }
  
  return this;
};

AnomalySchema.methods.addAction = function(action, user, result) {
  this.actions_taken.push({
    action,
    timestamp: new Date(),
    user: user || 'system',
    result: result || 'pending'
  });
  
  return this;
};

// Static methods
AnomalySchema.statics.getActiveAnomalies = async function(options = {}) {
  const query = { is_resolved: false };
  
  // Add optional filters
  if (options.severity) {
    query.severity = options.severity;
  }
  
  if (options.type) {
    query.anomaly_type = options.type;
  }
  
  if (options.sport) {
    query.sport = options.sport;
  }
  
  if (options.league) {
    query.league = options.league;
  }
  
  return this.find(query)
    .sort({ severity: -1, detection_time: -1 })
    .limit(options.limit || 100);
};

// Create and export the model
const AnomalyModel = mongoose.model('Anomaly', AnomalySchema);
module.exports = { AnomalyModel };