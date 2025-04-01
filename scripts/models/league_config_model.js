/**
 * MongoDB Schema for League Config Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LeagueConfigSchema = new Schema({
  // League identifiers
  league_id: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  league_name: {
    type: String,
    required: true
  },
  
  // League parameters
  factor_weights: {
    type: Schema.Types.Mixed,
    required: true,
    default: {
      player: 0.5,
      team: 0.5
    }
  },
  season_length: {
    type: Number,
    required: true
  },
  correlation_halflife: {
    type: Number,
    required: true
  },
  
  // Key metrics
  key_metrics: {
    type: [String],
    required: true
  },
  
  // Model parameters
  model_params: {
    type: Schema.Types.Mixed,
    required: true
  },
  
  // Update information
  last_updated: {
    type: Date,
    default: Date.now
  },
  updated_by: {
    type: String
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

// Instance methods
LeagueConfigSchema.methods.updateParams = function(newParams, updatedBy) {
  // Merge new parameters with existing ones
  this.model_params = { ...this.model_params, ...newParams };
  this.last_updated = new Date();
  this.updated_by = updatedBy || 'system';
  
  return this;
};

// Static methods
LeagueConfigSchema.statics.getDefaultConfig = async function(leagueId) {
  // If a specific league config is not found, return default values
  return {
    league_id: leagueId,
    league_name: leagueId.toUpperCase(),
    factor_weights: { player: 0.5, team: 0.5 },
    season_length: 82,
    correlation_halflife: 30,
    key_metrics: ['points', 'rebounds', 'assists'],
    model_params: {
      transformerLayers: 3,
      bnuSlippage: 0.15,
      windowSizes: [7, 14, 30, 60]
    },
    last_updated: new Date(),
    updated_by: 'system'
  };
};

// Create and export the model
const LeagueConfigModel = mongoose.model('LeagueConfig', LeagueConfigSchema);
module.exports = { LeagueConfigModel };