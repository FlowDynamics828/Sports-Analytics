/**
 * Sports Analytics Pro - Module Imports
 * Handles loading all components and services in the correct order
 */

// Immediately load environment configuration and initialize app
document.addEventListener('DOMContentLoaded', async () => {
  await loadModules();
  console.log('All modules loaded successfully');
});

/**
 * Load all application modules in proper dependency order
 */
async function loadModules() {
  try {
    // Load environment config first
    await loadScript('/js/env-config.js');
    
    // Load base components and services
    await Promise.all([
      loadScript('/js/services/ApiService.js'),
      loadScript('/js/components/Component.js')
    ]);
    
    // Load services that depend on ApiService
    await loadScript('/js/services/SportsDataService.js');
    
    // Load compatibility and legacy support
    await Promise.all([
      loadScript('/js/api-client.js'),
      loadScript('/js/api-status.js')
    ]);
    
    // Load all components that depend on the base Component class
    await Promise.all([
      loadScript('/js/components/PredictionEngine.js'),
      loadScript('/js/components/AIInsights.js')
    ]);
    
    // Load main application script which initializes everything
    await loadScript('/js/main.js');
    
    // Load additional components if needed
    if (window.ENV_CONFIG?.ENABLE_AI_INSIGHTS) {
      await loadScript('/js/ai-insights-loader.js');
    }
    
    return true;
  } catch (error) {
    console.error('Error loading modules:', error);
    showErrorMessage('Failed to load application modules. Please refresh the page or contact support.');
    return false;
  }
}

/**
 * Load a JavaScript file dynamically
 * @param {string} src - Script source URL
 * @returns {Promise} - Resolves when script is loaded
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    
    document.head.appendChild(script);
  });
}

/**
 * Show error message for critical loading failures
 * @param {string} message - Error message
 */
function showErrorMessage(message) {
  const container = document.querySelector('#app-loader') || document.body;
  
  const errorElement = document.createElement('div');
  errorElement.className = 'critical-error';
  errorElement.innerHTML = `
    <div class="error-container">
      <div class="error-icon">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h3>Application Error</h3>
      <p>${message}</p>
      <button onclick="window.location.reload()">Retry</button>
    </div>
  `;
  
  container.appendChild(errorElement);
} 