/**
 * MongoDB Schema for Prediction Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PredictionSchema = new Schema({
  // Factor identifier
  factor: {
    type: String,
    required: true,
    index: true
  },
  
  // Prediction metadata
  event_id: {
    type: String,
    required: true,
    index: true
  },
  probability: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  
  // Prediction outcome
  is_correct: {
    type: Boolean
  },
  actual_value: {
    type: Schema.Types.Mixed
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'error'],
    default: 'pending',
    index: true
  },
  
  // Domain information
  sport: {
    type: String,
    required: true,
    index: true
  },
  league: {
    type: String,
    required: true,
    index: true
  },
  
  // Time data
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  event_time: {
    type: Date,
    index: true
  },
  resolution_time: {
    type: Date
  },
  
  // Additional data
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  uncertainty: {
    type: Number,
    min: 0,
    max: 1
  },
  
  // Model information
  model_version: {
    type: String
  },
  model_type: {
    type: String
  },
  
  // Additional metadata
  tags: {
    type: [String],
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create compound indices
PredictionSchema.index({ factor: 1, event_id: 1 }, { unique: true });
PredictionSchema.index({ sport: 1, league: 1, factor: 1 });
PredictionSchema.index({ status: 1, created_at: -1 });

// Instance methods
PredictionSchema.methods.validatePrediction = function() {
  // Check for valid probability
  if (this.probability < 0 || this.probability > 1) {
    return false;
  }
  
  // Check for required fields
  if (!this.factor || !this.event_id || !this.sport || !this.league) {
    return false;
  }
  
  return true;
};

// Create and export the model
const PredictionModel = mongoose.model('Prediction', PredictionSchema);
module.exports = { PredictionModel };