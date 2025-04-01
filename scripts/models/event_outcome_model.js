/**
 * MongoDB Schema for Event Outcome Model
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EventOutcomeSchema = new Schema({
  // Event identifier
  event_id: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  
  // Event metadata
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
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
  
  // Time information
  event_time: {
    type: Date,
    required: true,
    index: true
  },
  resolution_time: {
    type: Date,
    index: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'delayed'],
    default: 'scheduled',
    index: true
  },
  
  // Teams/participants
  participants: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['team', 'player', 'other'], default: 'team' }
  }],
  
  // Outcomes
  outcomes: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Additional metadata
  tags: {
    type: [String],
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Associated factors
  related_factors: {
    type: [String]
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create compound indices
EventOutcomeSchema.index({ sport: 1, league: 1, event_time: -1 });
EventOutcomeSchema.index({ status: 1, event_time: -1 });

// Instance methods
EventOutcomeSchema.methods.isResolved = function() {
  return this.status === 'completed' && this.resolution_time !== null;
};

// Static methods
EventOutcomeSchema.statics.getUpcomingEvents = async function(sport, league, limit = 10) {
  const now = new Date();
  return this.find({ 
    sport, 
    league, 
    event_time: { $gt: now },
    status: { $in: ['scheduled', 'delayed'] }
  })
  .sort({ event_time: 1 })
  .limit(limit);
};

// Create and export the model
const EventOutcomeModel = mongoose.model('EventOutcome', EventOutcomeSchema);
module.exports = { EventOutcomeModel };