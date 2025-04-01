// @ts-nocheck
// Import Jest types
import { jest } from '@jest/globals';

// Global teardown function
module.exports = async () => {
  // Clear all mocks
  jest.clearAllMocks();

  // Close any open database connections
  const mongoose = require('mongoose');
  await mongoose.connection.close();

  // Close Redis connections
  const redis = require('redis');
  const redisClient = redis.createClient();
  await redisClient.disconnect();

  // Close any open WebSocket connections
  const WebSocket = require('ws');
  if (WebSocket.Server) {
    WebSocket.Server.prototype.close();
  }

  // Clean up any temporary files
  const fs = require('fs');
  const path = require('path');
  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Clean up any test uploads
  const uploadsDir = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }

  // Reset environment variables
  process.env = { ...process.env };

  // Clear any intervals/timeouts
  jest.useRealTimers();

  // Wait for any pending promises to resolve
  await new Promise(resolve => setTimeout(resolve, 1000));
}; 