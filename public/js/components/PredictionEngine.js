/**
 * PredictionEngine Component
 * Handles the prediction form and displays results
 */
class PredictionEngine extends Component {
  /**
   * Create a new prediction engine component
   * @param {string|HTMLElement} container - Container element or ID
   * @param {Object} options - Component options
   */
  constructor(container, options = {}) {
    // Set default options and call parent constructor
    super(container, Object.assign({
      apiEndpoint: '/api/predictions/generate',
      formSelector: '#predictive-model-form',
      resultSelector: '#prediction-result',
      errorSelector: '.api-error',
      loadingTemplate: `
        <div class="loading-indicator">
          <div class="spinner"></div>
          <p>Analyzing data...</p>
        </div>
      `,
      fallbackMode: true, // Use demo data if API fails
      defaultValues: {
        sportType: 'soccer',
        homeTeam: 'Liverpool',
        awayTeam: 'Manchester City'
      },
      alwaysAttemptRealData: true, // Always try to get real data first
      maxRetries: 2, // Number of retries for API calls
      retryDelay: 1000 // Delay between retries in ms
    }, options));
    
    // Component state
    this.state = {
      isLoading: false,
      error: null,
      result: null
    };
  }
  
  /**
   * Initialize the component
   */
  init() {
    this.debug('Initializing prediction engine');
    
    // Find form and result elements
    this.form = this.container.querySelector(this.options.formSelector);
    this.resultContainer = this.container.querySelector(this.options.resultSelector);
    this.errorContainer = this.container.querySelector(this.options.errorSelector);
    
    if (!this.form || !this.resultContainer) {
      this.debug('Required elements not found');
      return;
    }
    
    // Set up event listeners
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
    
    // Initialize advanced options toggle if present
    const advancedToggle = this.form.querySelector('.advanced-toggle');
    const advancedFields = this.form.querySelector('.advanced-fields');
    
    if (advancedToggle && advancedFields) {
      advancedToggle.addEventListener('click', () => {
        const isHidden = advancedFields.style.display === 'none';
        advancedFields.style.display = isHidden ? 'block' : 'none';
        advancedToggle.querySelector('i').className = isHidden 
          ? 'fas fa-chevron-up' 
          : 'fas fa-chevron-down';
      });
    }
    
    // Set default values
    if (this.options.defaultValues) {
      Object.entries(this.options.defaultValues).forEach(([key, value]) => {
        const field = this.form.elements[key];
        if (field && !field.value) {
          field.value = value;
        }
      });
    }
    
    // Call parent init
    super.init();
  }
  
  /**
   * Handle form submission
   * @param {Event} event - Submit event
   */
  async handleSubmit(event) {
    event.preventDefault();
    this.showLoading();
    
    try {
      // Get form data
      const formData = new FormData(this.form);
      const formObject = Object.fromEntries(formData.entries());
      
      // Validate form data
      this.validateFormData(formObject);
      
      // Send API request
      const prediction = await this.getPrediction(formObject);
      
      // Update state and render result
      this.state.result = prediction;
      this.state.isLoading = false;
      this.state.error = null;
      
      this.renderResult();
      
      // Emit event
      this.events.emit('prediction-complete', prediction);
      
    } catch (error) {
      this.handleError(error);
    }
  }
  
  /**
   * Validate form data
   * @param {Object} data - Form data
   * @throws {Error} If validation fails
   */
  validateFormData(data) {
    if (!data.homeTeam || !data.awayTeam) {
      throw new Error('Please enter both home and away teams');
    }
    
    if (data.homeTeam === data.awayTeam) {
      throw new Error('Home and away teams must be different');
    }
  }
  
  /**
   * Get prediction from API or fallback to demo data
   * @param {Object} formData - Form data
   * @returns {Object} Prediction data
   */
  async getPrediction(formData) {
    try {
      // Try to fetch from API multiple times
      let attemptCount = 0;
      let lastError = null;
      
      while (attemptCount <= this.options.maxRetries) {
        try {
          this.debug(`API attempt ${attemptCount + 1}/${this.options.maxRetries + 1}`);
          
          const response = await fetch(this.options.apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data && (data.homeWinProbability !== undefined || data.prediction !== undefined)) {
            this.debug('Successfully fetched real prediction data');
            return data;
          } else {
            throw new Error('Invalid API response structure');
          }
        } catch (error) {
          lastError = error;
          attemptCount++;
          
          if (attemptCount <= this.options.maxRetries) {
            this.debug(`Retry attempt ${attemptCount} after error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
          }
        }
      }
      
      // All API attempts failed, use fallback
      throw lastError || new Error('Failed to get prediction after multiple attempts');
      
    } catch (apiError) {
      this.debug('API call failed:', apiError);
      
      // Try alternate endpoint if available
      try {
        if (this.options.alternateApiEndpoint) {
          this.debug('Trying alternate API endpoint');
          const altResponse = await fetch(this.options.alternateApiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
          });
          
          if (altResponse.ok) {
            const altData = await altResponse.json();
            if (altData && (altData.homeWinProbability !== undefined || altData.prediction !== undefined)) {
              this.debug('Successfully fetched prediction from alternate endpoint');
              return altData;
            }
          }
        }
      } catch (altError) {
        this.debug('Alternate API endpoint also failed:', altError);
      }
      
      // Use demo data if fallback mode is enabled
      if (this.options.fallbackMode) {
        this.showApiError(apiError.message);
        return this.generateDemoPrediction(formData);
      }
      
      // Otherwise, rethrow the error
      throw apiError;
    }
  }
  
  /**
   * Generate demo prediction data
   * @param {Object} formData - Form data
   * @returns {Object} Demo prediction
   */
  generateDemoPrediction(formData) {
    const homeTeam = formData.homeTeam;
    const awayTeam = formData.awayTeam;
    const homeWinProb = Math.random() * 0.4 + 0.3; // 30-70%
    
    return {
      homeTeam,
      awayTeam,
      homeWinProbability: homeWinProb,
      awayWinProbability: 1 - homeWinProb,
      factors: [
        "Recent team performance (last 10 games)",
        "Head-to-head historical matchups",
        "Home court advantage factor",
        "Key player availability",
        "Rest days advantage"
      ],
      confidence: Math.random() * 0.15 + 0.75, // 75-90%
      demoMode: true
    };
  }
  
  /**
   * Show loading state
   */
  showLoading() {
    this.state.isLoading = true;
    this.state.error = null;
    
    if (this.resultContainer) {
      this.resultContainer.innerHTML = this.options.loadingTemplate;
    }
  }
  
  /**
   * Show API error message
   * @param {string} message - Error message
   */
  showApiError(message) {
    if (this.errorContainer) {
      this.errorContainer.textContent = `Note: Using demo data due to API unavailability. Error: ${message}`;
      this.errorContainer.style.display = 'block';
      
      // Hide error after 5 seconds
      setTimeout(() => {
        this.errorContainer.style.display = 'none';
      }, 5000);
    }
  }
  
  /**
   * Handle prediction error
   * @param {Error} error - Error object
   */
  handleError(error) {
    this.debug('Error in prediction:', error);
    
    this.state.isLoading = false;
    this.state.error = error.message;
    
    if (this.resultContainer) {
      this.resultContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>${error.message || 'An unexpected error occurred. Please try again.'}</p>
        </div>
      `;
    }
    
    // Emit error event
    this.events.emit('prediction-error', error);
  }
  
  /**
   * Render prediction result
   */
  renderResult() {
    if (!this.resultContainer || !this.state.result) return;
    
    const prediction = this.state.result;
    
    // Determine data source indicator 
    let dataSourceIndicator = '';
    
    if (prediction.source === 'real_api' || prediction.source === 'thesportsdb') {
      // Real data from API
      dataSourceIndicator = `
        <div class="source-badge real-data">
          <i class="fas fa-database"></i> Real Data
        </div>
      `;
    } else if (prediction.isGenerated || prediction.demoMode || prediction.source === 'algorithm' || prediction.source === 'generated') {
      // Generated data - show disclaimer
      dataSourceIndicator = `
        <div class="source-badge generated-data">
          <i class="fas fa-robot"></i> AI-Generated Model
        </div>
        <div class="data-notice">
          ${prediction.notice || 'This prediction is generated using statistical models and historical patterns.'}
        </div>
      `;
    }
    
    // Add demo badge if using demo data
    const demoNote = prediction.demoMode 
      ? '<div class="demo-badge">Demo Prediction</div>' 
      : '';
    
    this.resultContainer.innerHTML = `
      <div class="prediction-card">
        ${demoNote}
        ${dataSourceIndicator}
        <h3>Prediction Result</h3>
        <div class="teams-prediction">
          <div class="team ${prediction.homeWinProbability > prediction.awayWinProbability ? 'favorite' : ''}">
            <span class="team-name">${prediction.homeTeam}</span>
            <span class="win-probability">${(prediction.homeWinProbability * 100).toFixed(1)}%</span>
          </div>
          <div class="vs">VS</div>
          <div class="team ${prediction.awayWinProbability > prediction.homeWinProbability ? 'favorite' : ''}">
            <span class="team-name">${prediction.awayTeam}</span>
            <span class="win-probability">${(prediction.awayWinProbability * 100).toFixed(1)}%</span>
          </div>
        </div>
        
        ${prediction.drawProbability !== undefined ? `
          <div class="draw-probability">
            <span class="label">Draw Probability:</span>
            <span class="value">${(prediction.drawProbability * 100).toFixed(1)}%</span>
          </div>
        ` : ''}
        
        <div class="confidence-meter">
          <div class="label">Prediction Confidence</div>
          <div class="meter">
            <div class="meter-fill" style="width: ${(prediction.confidence || 0.75) * 100}%"></div>
          </div>
          <div class="value">${((prediction.confidence || 0.75) * 100).toFixed(0)}%</div>
        </div>
        
        <div class="key-factors">
          <h4>Key Factors</h4>
          <ul>
            ${prediction.factors.map(factor => {
              // Handle both string factors and object factors with weights
              if (typeof factor === 'string') {
                return `<li>${factor}</li>`;
              } else if (factor.name) {
                return `<li>${factor.name} ${factor.weight ? `(${(factor.weight * 100).toFixed(0)}%)` : ''}</li>`;
              }
              return '';
            }).join('')}
          </ul>
        </div>
      </div>
    `;
  }
  
  /**
   * Reset the form and clear results
   */
  reset() {
    if (this.form) {
      this.form.reset();
    }
    
    this.state = {
      isLoading: false,
      error: null,
      result: null
    };
    
    if (this.resultContainer) {
      this.resultContainer.innerHTML = `
        <div class="placeholder-message">
          <p>Enter teams above to see AI-powered match predictions</p>
        </div>
      `;
    }
    
    // Emit reset event
    this.events.emit('prediction-reset');
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PredictionEngine;
} 