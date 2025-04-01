/**
 * Enterprise-Grade Memory Monitor for Sports Analytics Platform
 * 
 * This script monitors memory usage and triggers garbage collection to prevent memory leaks
 * and optimize performance in a production environment.
 */

const os = require('os');

// Configuration
const CHECK_INTERVAL = process.env.MEMORY_CHECK_INTERVAL || 30000; // 30 seconds
const WARN_THRESHOLD = process.env.MEMORY_WARN_THRESHOLD || 0.75; // 75% of available memory
const CRITICAL_THRESHOLD = process.env.MEMORY_CRITICAL_THRESHOLD || 0.85; // 85% of available memory
const FORCE_GC_THRESHOLD = process.env.MEMORY_FORCE_GC_THRESHOLD || 0.8; // 80% of available memory

// Memory thresholds in bytes
const TOTAL_MEMORY = os.totalmem();
const WARN_MEMORY = TOTAL_MEMORY * WARN_THRESHOLD;
const CRITICAL_MEMORY = TOTAL_MEMORY * CRITICAL_THRESHOLD;
const FORCE_GC_MEMORY = TOTAL_MEMORY * FORCE_GC_THRESHOLD;

// Print startup information
console.log('🧠 Memory Monitor started');
console.log(`Total System Memory: ${formatBytes(TOTAL_MEMORY)}`);
console.log(`Warning Threshold (${WARN_THRESHOLD * 100}%): ${formatBytes(WARN_MEMORY)}`);
console.log(`Critical Threshold (${CRITICAL_THRESHOLD * 100}%): ${formatBytes(CRITICAL_MEMORY)}`);
console.log(`Force GC Threshold (${FORCE_GC_THRESHOLD * 100}%): ${formatBytes(FORCE_GC_MEMORY)}`);
console.log(`Check Interval: ${CHECK_INTERVAL / 1000} seconds`);

// Start monitoring loop
setInterval(checkMemory, CHECK_INTERVAL);

// Initialize status
let lastStatusLevel = 'normal';
let consecutiveCriticalCount = 0;

/**
 * Check current memory usage and take appropriate action
 */
function checkMemory() {
  // Get current memory usage
  const usedMemory = process.memoryUsage().rss;
  const freeMemory = TOTAL_MEMORY - os.freemem();
  const percentUsed = (usedMemory / TOTAL_MEMORY) * 100;
  
  // Determine status level
  let statusLevel = 'normal';
  if (usedMemory >= CRITICAL_MEMORY) {
    statusLevel = 'critical';
    consecutiveCriticalCount++;
  } else if (usedMemory >= WARN_MEMORY) {
    statusLevel = 'warning';
    consecutiveCriticalCount = 0;
  } else {
    statusLevel = 'normal';
    consecutiveCriticalCount = 0;
  }
  
  // Log only when status changes or in non-normal states
  if (statusLevel !== lastStatusLevel || statusLevel !== 'normal') {
    console.log(`Memory Usage: ${formatBytes(usedMemory)} / ${formatBytes(TOTAL_MEMORY)} (${percentUsed.toFixed(1)}%) - Status: ${statusLevel}`);
  }
  
  // Actions based on status
  if (statusLevel === 'critical') {
    console.log('⚠️ CRITICAL MEMORY USAGE - Taking action');
    
    // Force garbage collection if available
    if (global.gc) {
      console.log('Forcing garbage collection...');
      global.gc();
      
      // Check if we need more aggressive measures
      if (consecutiveCriticalCount >= 3) {
        console.log('⚠️ Memory issues persist after multiple GC attempts - Consider server restart');
      }
    } else {
      console.log('⚠️ Garbage collection not available. Start with --expose-gc flag for better memory management');
    }
  } else if (statusLevel === 'warning') {
    if (usedMemory >= FORCE_GC_MEMORY && global.gc) {
      console.log('⚠️ Memory usage above forced GC threshold - Running garbage collection');
      global.gc();
    }
  }
  
  // Update status for next check
  lastStatusLevel = statusLevel;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @param {number} decimals - Decimal places to show
 * @returns {string} Formatted string
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// Handle process exit
process.on('SIGTERM', () => {
  console.log('Memory Monitor received SIGTERM, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Memory Monitor received SIGINT, shutting down');
  process.exit(0);
}); 