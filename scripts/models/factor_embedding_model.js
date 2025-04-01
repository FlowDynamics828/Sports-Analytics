/**
 * MongoDB Schema for Factor Embedding Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FactorEmbeddingSchema = new Schema({
  // Factor identifier
  factor: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  
  // Embedding vector
  embedding: {
    type: [Number],
    required: true
  },
  
  // Embedding metadata
  dimension: {
    type: Number,
    required: true
  },
  version: {
    type: String,
    required: true,
    index: true
  },
  method: {
    type: String,
    enum: ['dynamic', 'static', 'pretrained', 'transferred'],
    default: 'dynamic'
  },
  
  // Factor metadata
  factor_type: {
    type: String,
    index: true
  },
  sport: {
    type: String,
    index: true
  },
  league: {
    type: String,
    index: true
  },
  
  // Usage statistics
  frequency: {
    type: Number,
    default: 0
  },
  last_updated: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Historical versions
  history: [{
    embedding: [Number],
    timestamp: Date,
    version: String
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
FactorEmbeddingSchema.index({ sport: 1, league: 1, factor_type: 1 });
FactorEmbeddingSchema.index({ frequency: -1 });

// Instance methods
FactorEmbeddingSchema.methods.updateEmbedding = function(newEmbedding, newVersion) {
  // Add current embedding to history
  this.history.push({
    embedding: this.embedding,
    timestamp: this.last_updated,
    version: this.version
  });
  
  // Keep history limited to 10 entries
  if (this.history.length > 10) {
    this.history.shift();
  }
  
  // Update with new embedding
  this.embedding = newEmbedding;
  this.dimension = newEmbedding.length;
  this.version = newVersion;
  this.last_updated = new Date();
  
  return this;
};

// Static methods
FactorEmbeddingSchema.statics.getMostFrequentFactors = async function(sport, league, limit = 100) {
  return this.find({ sport, league })
    .sort({ frequency: -1 })
    .limit(limit);
};

// Create and export the model
const FactorEmbeddingModel = mongoose.model('FactorEmbedding', FactorEmbeddingSchema);
module.exports = { FactorEmbeddingModel };