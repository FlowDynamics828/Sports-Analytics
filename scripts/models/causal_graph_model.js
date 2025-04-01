/**
 * MongoDB Schema for Causal Graph Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CausalGraphSchema = new Schema({
  // Graph identifiers
  graph_id: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  
  // Graph data
  factors: {
    type: [String],
    required: true
  },
  edges: [{
    source: { type: Number, required: true },
    target: { type: Number, required: true },
    sourceName: { type: String, required: true },
    targetName: { type: String, required: true },
    weight: { type: Number },
    confidence: { type: Number }
  }],
  adjacency_matrix: {
    type: Schema.Types.Mixed
  },
  
  // Graph metadata
  node_count: {
    type: Number,
    required: true
  },
  edge_count: {
    type: Number,
    required: true
  },
  root_causes: [{
    id: { type: Number },
    name: { type: String },
    outDegree: { type: Number }
  }],
  
  // Generation information
  algorithm: {
    type: String,
    required: true,
    enum: ['pc', 'notears', 'granger', 'combined', 'manual'],
    index: true
  },
  generation_time: {
    type: Date,
    default: Date.now,
    index: true
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
  
  // Quality metrics
  confidence_score: {
    type: Number,
    min: 0,
    max: 1
  },
  data_quality: {
    type: Number,
    min: 0,
    max: 1
  },
  
  // Versioning
  version: {
    type: Number,
    default: 1
  },
  parent_graph_id: {
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
CausalGraphSchema.index({ sport: 1, league: 1, generation_time: -1 });
CausalGraphSchema.index({ confidence_score: -1 });

// Instance methods
CausalGraphSchema.methods.findPathBetween = function(sourceFactorName, targetFactorName) {
  // Find indices of source and target factors
  const sourceIndex = this.factors.indexOf(sourceFactorName);
  const targetIndex = this.factors.indexOf(targetFactorName);
  
  if (sourceIndex === -1 || targetIndex === -1) {
    return { exists: false, path: [] };
  }
  
  // Use breadth-first search to find path
  const visited = new Array(this.node_count).fill(false);
  const queue = [{ index: sourceIndex, path: [sourceIndex] }];
  visited[sourceIndex] = true;
  
  while (queue.length > 0) {
    const { index, path } = queue.shift();
    
    // Check all neighbors
    for (const edge of this.edges) {
      if (edge.source === index && !visited[edge.target]) {
        const newPath = [...path, edge.target];
        
        // Check if we reached the target
        if (edge.target === targetIndex) {
          return { 
            exists: true, 
            path: newPath.map(idx => this.factors[idx]),
            edges: newPath.slice(0, -1).map((src, i) => {
              const tgt = newPath[i + 1];
              return this.edges.find(e => e.source === src && e.target === tgt);
            })
          };
        }
        
        visited[edge.target] = true;
        queue.push({ index: edge.target, path: newPath });
      }
    }
  }
  
  return { exists: false, path: [] };
};

// Static methods
CausalGraphSchema.statics.getLatestGraph = async function(sport, league) {
  return this.findOne({ sport, league })
    .sort({ generation_time: -1 })
    .limit(1);
};

// Create and export the model
const CausalGraphModel = mongoose.model('CausalGraph', CausalGraphSchema);
module.exports = { CausalGraphModel };