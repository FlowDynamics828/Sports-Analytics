/**
 * MongoDB Schema for Experiment Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ExperimentSchema = new Schema({
  // Experiment identifiers
  experiment_id: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  
  // Description
  description: {
    type: String
  },
  
  // Configuration
  variants: {
    type: [String],
    required: true
  },
  metrics: {
    type: [String],
    required: true
  },
  traffic_split: {
    type: Schema.Types.Mixed,
    required: true
  },
  
  // Status
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },
  start_date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  end_date: {
    type: Date,
    index: true
  },
  
  // Results
  results: {
    type: Schema.Types.Mixed,
    default: {}
  },
  conclusion: {
    type: String
  },
  
  // Targeting
  target_sports: {
    type: [String]
  },
  target_leagues: {
    type: [String]
  },
  target_factor_types: {
    type: [String]
  },
  
  // Additional metadata
  tags: {
    type: [String],
    index: true
  },
  created_by: {
    type: String
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create indices
ExperimentSchema.index({ is_active: 1, start_date: -1 });
ExperimentSchema.index({ target_sports: 1, target_leagues: 1, is_active: 1 });

// Instance methods
ExperimentSchema.methods.isRunning = function() {
  const now = new Date();
  return this.is_active && this.start_date <= now && (!this.end_date || this.end_date >= now);
};

ExperimentSchema.methods.assignVariant = function(userId, factorId) {
  // Simple deterministic assignment for consistent experiment groups
  const hash = this.hashString(`${userId}:${factorId}:${this.experiment_id}`);
  const variantIndex = hash % this.variants.length;
  return this.variants[variantIndex];
};

ExperimentSchema.methods.hashString = function(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// Static methods
ExperimentSchema.statics.getActiveExperiments = async function(filters = {}) {
  const now = new Date();
  
  const query = { 
    is_active: true,
    start_date: { $lte: now },
    $or: [
      { end_date: { $exists: false } },
      { end_date: { $gte: now } }
    ]
  };
  
  // Add optional filters
  if (filters.sport) {
    query.$or = [
      { target_sports: { $exists: false } },
      { target_sports: { $size: 0 } },
      { target_sports: filters.sport }
    ];
  }
  
  if (filters.league) {
    query.$or = query.$or || [];
    query.$or.push(
      { target_leagues: { $exists: false } },
      { target_leagues: { $size: 0 } },
      { target_leagues: filters.league }
    );
  }
  
  return this.find(query);
};

// Create and export the model
const ExperimentModel = mongoose.model('Experiment', ExperimentSchema);
module.exports = { ExperimentModel };