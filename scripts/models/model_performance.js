/**
 * MongoDB Schema for Model Version
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ModelVersionSchema = new Schema({
  // Model identifier
  model_id: {
    type: String,
    required: true,
    index: true
  },
  
  // Version information
  version: {
    type: String,
    required: true
  },
  major_version: {
    type: Number,
    required: true
  },
  minor_version: {
    type: Number,
    required: true
  },
  patch_version: {
    type: Number,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['development', 'testing', 'production', 'deprecated', 'archived'],
    default: 'development',
    index: true
  },
  
  // Model type
  model_type: {
    type: String,
    required: true,
    enum: [
      'transformer_correlator', 
      'bayesian_nn', 
      'kernel_correlator', 
      'factor_embedder', 
      'adaptive_window', 
      'causal_discovery',
      'transfer_learning',
      'quantum_optimizer'
    ],
    index: true
  },
  
  // Training information
  training_date: {
    type: Date,
    default: Date.now
  },
  training_duration_ms: {
    type: Number
  },
  training_samples: {
    type: Number
  },
  
  // Performance metrics
  metrics: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Storage information
  storage_path: {
    type: String
  },
  file_size_bytes: {
    type: Number
  },
  
  // Version history
  parent_version: {
    type: String
  },
  changelog: {
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

// Create compound indices
ModelVersionSchema.index({ model_id: 1, version: 1 }, { unique: true });
ModelVersionSchema.index({ model_type: 1, status: 1 });
ModelVersionSchema.index({ model_type: 1, major_version: -1, minor_version: -1, patch_version: -1 });

// Version parsing middleware
ModelVersionSchema.pre('save', function(next) {
  // Parse version string (format: "v1.2.3")
  if (this.isNew && this.version) {
    const match = this.version.match(/v?(\d+)\.(\d+)\.(\d+)/);
    if (match) {
      this.major_version = parseInt(match[1]);
      this.minor_version = parseInt(match[2]);
      this.patch_version = parseInt(match[3]);
    }
  }
  next();
});

// Static methods
ModelVersionSchema.statics.getLatestVersion = async function(modelType, status = 'production') {
  return this.findOne({ 
    model_type: modelType, 
    status 
  })
  .sort({ major_version: -1, minor_version: -1, patch_version: -1 })
  .limit(1);
};

// Create and export the model
const ModelVersionModel = mongoose.model('ModelVersion', ModelVersionSchema);
module.exports = { ModelVersionModel };