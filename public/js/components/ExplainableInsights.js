/**
 * Explainable Insights Component
 * 
 * This component renders detailed explanations for predictions,
 * providing transparency into how the prediction system works.
 */

import { apiClient } from '../utils/apiClient.js';
import { chartRenderer } from '../utils/chartRenderer.js';
import { notificationService } from '../services/notificationService.js';
import { analyticsService } from '../services/analyticsService.js';

class ExplainableInsights {
  /**
   * Constructor for the ExplainableInsights component
   * @param {Object} options Component options
   */
  constructor(options = {}) {
    this.container = options.container || document.createElement('div');
    this.factors = options.factors || [];
    this.sport = options.sport || null;
    this.league = options.league || null;
    this.detailLevel = options.detailLevel || 'STANDARD';
    this.onInsightsLoaded = options.onInsightsLoaded || null;
    this.isLoading = false;
    this.insights = [];
    this.createdCharts = []; // Track chart instances for cleanup
    this.keyboardNavEnabled = options.keyboardNavEnabled !== false;
    this.exportFormats = ['PDF', 'CSV', 'EXCEL', 'JSON'];
    this.lastFocusedElement = null;
    this.isDestroyed = false;
    
    // Bind methods
    this.loadInsights = this.loadInsights.bind(this);
    this.renderInsights = this.renderInsights.bind(this);
    this.renderFeatureImportance = this.renderFeatureImportance.bind(this);
    this.renderHistoricalContext = this.renderHistoricalContext.bind(this);
    this.renderStatisticalSignificance = this.renderStatisticalSignificance.bind(this);
    this.renderCorrelationPattern = this.renderCorrelationPattern.bind(this);
    this.renderCounterfactual = this.renderCounterfactual.bind(this);
    this.renderCausalRelationships = this.renderCausalRelationships.bind(this);
    this.exportInsights = this.exportInsights.bind(this);
    this.destroy = this.destroy.bind(this);
    this.setupKeyboardNavigation = this.setupKeyboardNavigation.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);
    this.handleChartRendered = this.handleChartRendered.bind(this);
    this.clearCharts = this.clearCharts.bind(this);
    
    // Store instance in a WeakMap to allow lookup from DOM references
    if (typeof WeakMap !== 'undefined' && typeof window.__insightComponents === 'undefined') {
      window.__insightComponents = new WeakMap();
    }
    
    if (window.__insightComponents) {
      window.__insightComponents.set(this.container, this);
    }
    
    // Initialize component
    this.initialize();
  }
  
  /**
   * Initialize the component
   */
  initialize() {
    // Set container ID for ARIA relationships if not already set
    if (!this.container.id) {
      this.container.id = `explainable-insights-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    
    this.container.classList.add('explainable-insights-container');
    
    // Set ARIA role and label
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Prediction Explanation');
    
    // Setup base HTML with improved accessibility
    this.container.innerHTML = `
      <div class="insights-header">
        <h3 id="${this.container.id}-title">Prediction Explanation</h3>
        <div class="insights-controls">
          <div class="detail-level-selector">
            <label for="${this.container.id}-detail-level" class="sr-only">Detail Level</label>
            <select id="${this.container.id}-detail-level" class="detail-level-select" aria-label="Select detail level">
              <option value="BASIC" ${this.detailLevel === 'BASIC' ? 'selected' : ''}>Basic</option>
              <option value="STANDARD" ${this.detailLevel === 'STANDARD' ? 'selected' : ''}>Standard</option>
              <option value="ADVANCED" ${this.detailLevel === 'ADVANCED' ? 'selected' : ''}>Advanced</option>
            </select>
          </div>
          <div class="export-dropdown">
            <button id="${this.container.id}-export-btn" class="export-button" aria-haspopup="true" aria-expanded="false">
              <span class="export-icon">⬇️</span> Export
            </button>
            <div id="${this.container.id}-export-menu" class="export-menu hidden" role="menu" aria-labelledby="${this.container.id}-export-btn">
              ${this.exportFormats.map(format => `
                <button class="export-option" role="menuitem" data-format="${format}" aria-label="Export as ${format}">
                  ${format}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="insights-content">
        <div class="insights-loading" aria-live="polite">
          <div class="spinner" role="progressbar" aria-label="Loading insights"></div>
          <p>Analyzing prediction factors...</p>
        </div>
        <div id="${this.container.id}-results" class="insights-results hidden" aria-live="polite"></div>
      </div>
    `;
    
    // Set up event listeners
    const detailSelect = this.container.querySelector(`#${this.container.id}-detail-level`);
    detailSelect.addEventListener('change', (e) => {
      this.detailLevel = e.target.value;
      this.loadInsights();
      
      // Track analytics
      analyticsService.trackEvent('insights', 'detail_level_changed', {
        detail_level: this.detailLevel,
        factor_count: this.factors.length
      });
    });
    
    // Export button functionality
    const exportBtn = this.container.querySelector(`#${this.container.id}-export-btn`);
    const exportMenu = this.container.querySelector(`#${this.container.id}-export-menu`);
    
    exportBtn.addEventListener('click', () => {
      const isExpanded = exportMenu.classList.contains('hidden');
      exportMenu.classList.toggle('hidden', !isExpanded);
      exportBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      
      // If opening the menu, focus the first item
      if (isExpanded && this.keyboardNavEnabled) {
        setTimeout(() => {
          const firstOption = exportMenu.querySelector('.export-option');
          if (firstOption) firstOption.focus();
        }, 10);
      }
    });
    
    // Close export menu on outside click
    document.addEventListener('click', (e) => {
      if (!this.isDestroyed && 
          !exportBtn.contains(e.target) && 
          !exportMenu.contains(e.target)) {
        exportMenu.classList.add('hidden');
        exportBtn.setAttribute('aria-expanded', 'false');
      }
    });
    
    // Add export option event listeners
    const exportOptions = this.container.querySelectorAll('.export-option');
    exportOptions.forEach(option => {
      option.addEventListener('click', () => {
        const format = option.dataset.format;
        this.exportInsights(format);
        exportMenu.classList.add('hidden');
        exportBtn.setAttribute('aria-expanded', 'false');
      });
    });
    
    // Setup keyboard navigation
    if (this.keyboardNavEnabled) {
      this.setupKeyboardNavigation();
    }
    
    // Load insights if factors are provided
    if (this.factors.length > 0) {
      // Use local storage to check for cached insights
      const localStorageKey = `insights_${this.factors.sort().join('_')}_${this.sport || 'all'}_${this.league || 'all'}_${this.detailLevel}`;
      const cachedInsights = this.getFromLocalStorage(localStorageKey);
      
      if (cachedInsights) {
        this.insights = cachedInsights;
        this.renderInsights();
        
        // Log analytics for cache hit
        analyticsService.trackEvent('insights', 'local_cache_hit', {
          factor_count: this.factors.length
        });
        
        // Still refresh in background for updated data
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.loadInsights(true); // Silent refresh
          }
        }, 2000);
      } else {
        this.loadInsights();
      }
    }
  }
  
  /**
   * Set up keyboard navigation
   */
  setupKeyboardNavigation() {
    // Track current focus for restoring focus
    this.container.addEventListener('focusin', (e) => {
      if (!this.isDestroyed) {
        this.lastFocusedElement = e.target;
      }
    });
    
    // Handle component blur
    this.container.addEventListener('focusout', this.handleFocusOut);
    
    // Export menu keyboard navigation
    const exportMenu = this.container.querySelector(`#${this.container.id}-export-menu`);
    exportMenu.addEventListener('keydown', (e) => {
      if (this.isDestroyed) return;
      
      const options = Array.from(exportMenu.querySelectorAll('.export-option'));
      const currentIndex = options.indexOf(document.activeElement);
      
      if (currentIndex === -1) return;
      
      let nextIndex;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = (currentIndex + 1) % options.length;
          options[nextIndex].focus();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = (currentIndex - 1 + options.length) % options.length;
          options[nextIndex].focus();
          break;
          
        case 'Escape':
          e.preventDefault();
          exportMenu.classList.add('hidden');
          this.container.querySelector(`#${this.container.id}-export-btn`).setAttribute('aria-expanded', 'false');
          this.container.querySelector(`#${this.container.id}-export-btn`).focus();
          break;
          
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (document.activeElement.classList.contains('export-option')) {
            const format = document.activeElement.dataset.format;
            this.exportInsights(format);
            exportMenu.classList.add('hidden');
            this.container.querySelector(`#${this.container.id}-export-btn`).setAttribute('aria-expanded', 'false');
          }
          break;
      }
    });
    
    // Result section keyboard navigation
    const resultsContainer = this.container.querySelector(`#${this.container.id}-results`);
    resultsContainer.addEventListener('keydown', (e) => {
      if (this.isDestroyed) return;
      
      if (['Tab', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.altKey) {
        e.preventDefault();
        
        const sections = Array.from(resultsContainer.querySelectorAll('.insight-section'));
        if (sections.length === 0) return;
        
        const headings = sections.map(section => section.querySelector('h4'));
        const currentIndex = headings.indexOf(document.activeElement);
        
        if (e.key === 'Tab' && e.altKey) {
          // Jump to next/previous section
          const direction = e.shiftKey ? -1 : 1;
          let nextIndex;
          
          if (currentIndex === -1) {
            nextIndex = direction > 0 ? 0 : headings.length - 1;
          } else {
            nextIndex = (currentIndex + direction + headings.length) % headings.length;
          }
          
          headings[nextIndex].focus();
        }
      }
    });
  }
  
  /**
   * Handle focus leaving the component
   * @param {FocusEvent} e Focus event
   */
  handleFocusOut(e) {
    if (this.isDestroyed) return;
    
    // Close any open menus when focus leaves the component
    if (!this.container.contains(e.relatedTarget)) {
      const exportMenu = this.container.querySelector(`#${this.container.id}-export-menu`);
      exportMenu.classList.add('hidden');
      this.container.querySelector(`#${this.container.id}-export-btn`).setAttribute('aria-expanded', 'false');
    }
  }
  
  /**
   * Save insights to local storage
   * @param {string} key Storage key
   * @param {Array} insights Insights to store
   */
  saveToLocalStorage(key, insights) {
    try {
      const serialized = JSON.stringify({
        insights,
        timestamp: Date.now(),
        version: '1.0'
      });
      
      localStorage.setItem(key, serialized);
    } catch (error) {
      console.warn('Failed to save insights to local storage:', error);
    }
  }
  
  /**
   * Get insights from local storage
   * @param {string} key Storage key
   * @returns {Array|null} Insights or null if not found or expired
   */
  getFromLocalStorage(key) {
    try {
      const serialized = localStorage.getItem(key);
      if (!serialized) return null;
      
      const parsed = JSON.parse(serialized);
      
      // Check if data is expired (5 minutes)
      const now = Date.now();
      const cacheTime = parsed.timestamp || 0;
      const expirationTime = 5 * 60 * 1000; // 5 minutes
      
      if (now - cacheTime > expirationTime) {
        localStorage.removeItem(key);
        return null;
      }
      
      return parsed.insights;
    } catch (error) {
      console.warn('Failed to get insights from local storage:', error);
      return null;
    }
  }
  
  /**
   * Load insights from the API
   * @param {boolean} silent Whether to show loading state
   */
  async loadInsights(silent = false) {
    if (this.isDestroyed || (this.isLoading && !silent) || this.factors.length === 0) return;
    
    try {
      this.isLoading = true;
      
      if (!silent) {
        this.showLoading(true);
      }
      
      // Track analytics
      analyticsService.trackEvent('insights', 'load_insights_requested', {
        factor_count: this.factors.length,
        detail_level: this.detailLevel,
        sport: this.sport,
        league: this.league,
        silent
      });
      
      // Show timeout message for long running requests
      let timeoutMessage;
      
      if (!silent) {
        timeoutMessage = setTimeout(() => {
          if (this.isDestroyed) return;
          
          const loadingEl = this.container.querySelector('.insights-loading p');
          if (loadingEl) {
            loadingEl.innerHTML = 'This is taking longer than expected. Complex insights may take a few moments to generate...';
          }
        }, 5000);
      }
      
      // Call API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        // Call API
        const response = await apiClient.post('/api/graphql', {
          query: `
            query GetExplainableInsights($input: ExplainableInsightsInput!) {
              explainableInsights(input: $input) {
                id
                type
                title
                description
                confidence
                data
                visualizationData
                metadata
              }
            }
          `,
          variables: {
            input: {
              factors: this.factors,
              sport: this.sport,
              league: this.league,
              detailLevel: this.detailLevel,
              includeCounterfactuals: true,
              includeCausalRelationships: true,
              maxInsightsPerCategory: 3,
              useCache: true
            }
          }
        }, { signal: controller.signal });
        
        clearTimeout(timeoutId);
        
        // Process response
        if (response && response.data && response.data.explainableInsights) {
          this.insights = response.data.explainableInsights;
          
          // Cache insights in local storage
          const localStorageKey = `insights_${this.factors.sort().join('_')}_${this.sport || 'all'}_${this.league || 'all'}_${this.detailLevel}`;
          this.saveToLocalStorage(localStorageKey, this.insights);
          
          if (!silent) {
            // Clear existing charts before rendering new ones
            this.clearCharts();
            this.renderInsights();
          }
          
          // Call callback if provided
          if (this.onInsightsLoaded) {
            this.onInsightsLoaded(this.insights);
          }
          
          // Track analytics
          analyticsService.trackEvent('insights', 'insights_loaded', {
            insight_count: this.insights.length,
            factor_count: this.factors.length,
            silent
          });
        } else {
          throw new Error('Invalid response from API');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timed out after 30 seconds. Please try again with fewer factors or a lower detail level.');
        } else {
          throw fetchError;
        }
      }
      
      // Clear timeout message
      if (timeoutMessage) {
        clearTimeout(timeoutMessage);
      }
    } catch (error) {
      console.error('Error loading insights:', error);
      
      if (!silent) {
        notificationService.showNotification('Failed to load prediction insights: ' + error.message, 'error');
        
        // Show error in container
        const resultsContainer = this.container.querySelector('.insights-results');
        resultsContainer.innerHTML = `
          <div class="insights-error" role="alert" aria-live="assertive">
            <p>Failed to load prediction insights. ${error.message}</p>
            <button class="retry-button">Retry</button>
          </div>
        `;
        resultsContainer.classList.remove('hidden');
        
        // Add retry handler
        const retryButton = resultsContainer.querySelector('.retry-button');
        retryButton.addEventListener('click', () => this.loadInsights());
      }
    } finally {
      this.isLoading = false;
      
      if (!silent) {
        this.showLoading(false);
      }
    }
  }
  
  /**
   * Export insights to different formats
   * @param {string} format Export format (PDF, CSV, EXCEL, JSON)
   */
  async exportInsights(format) {
    if (this.isDestroyed || this.isLoading || this.factors.length === 0) return;
    
    try {
      // Show notification
      notificationService.showNotification(`Preparing ${format} export...`, 'info', 2000);
      
      // Track analytics
      analyticsService.trackEvent('insights', 'export_requested', {
        format,
        factor_count: this.factors.length,
        insight_count: this.insights.length
      });
      
      // Call API
      const response = await apiClient.post('/api/graphql', {
        query: `
          query ExportInsights($input: ExportInsightsInput!) {
            exportInsights(input: $input) {
              url
              expiresAt
              contentType
              filename
              metadata
            }
          }
        `,
        variables: {
          input: {
            factors: this.factors,
            sport: this.sport,
            league: this.league,
            detailLevel: this.detailLevel,
            format
          }
        }
      });
      
      // Process response
      if (response && response.data && response.data.exportInsights) {
        const exportData = response.data.exportInsights;
        
        // Create a modal that shows download progress
        const modalId = `export-modal-${Date.now()}`;
        const modal = document.createElement('div');
        modal.className = 'insights-export-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', `${modalId}-title`);
        
        modal.innerHTML = `
          <div class="modal-content">
            <h4 id="${modalId}-title">Export Ready</h4>
            <p>Your ${format} export is ready to download.</p>
            <p class="expires-text">This download link will expire in 24 hours.</p>
            <div class="modal-footer">
              <button class="modal-close-btn">Close</button>
              <a href="${exportData.url}" download="${exportData.filename}" class="download-btn">Download ${format}</a>
            </div>
          </div>
        `;
        
        // Add modal to the DOM
        document.body.appendChild(modal);
        
        // Set up event listeners
        const closeBtn = modal.querySelector('.modal-close-btn');
        closeBtn.addEventListener('click', () => {
          document.body.removeChild(modal);
        });
        
        // Auto-close modal after download clicked
        const downloadBtn = modal.querySelector('.download-btn');
        downloadBtn.addEventListener('click', () => {
          setTimeout(() => {
            if (document.body.contains(modal)) {
              document.body.removeChild(modal);
            }
          }, 1000);
          
          // Track analytics
          analyticsService.trackEvent('insights', 'export_downloaded', {
            format,
            factor_count: this.factors.length
          });
        });
        
        // Focus download button for accessibility
        setTimeout(() => {
          downloadBtn.focus();
        }, 10);
        
        // Close modal on escape key
        const handleEscape = (e) => {
          if (e.key === 'Escape') {
            if (document.body.contains(modal)) {
              document.body.removeChild(modal);
            }
            document.removeEventListener('keydown', handleEscape);
          }
        };
        
        document.addEventListener('keydown', handleEscape);
      } else {
        throw new Error('Invalid response from export API');
      }
    } catch (error) {
      console.error('Error exporting insights:', error);
      notificationService.showNotification(`Failed to export insights: ${error.message}`, 'error');
    }
  }
  
  /**
   * Show or hide loading state
   * @param {boolean} show Whether to show loading
   */
  showLoading(show) {
    if (this.isDestroyed) return;
    
    const loadingEl = this.container.querySelector('.insights-loading');
    const resultsEl = this.container.querySelector('.insights-results');
    
    if (show) {
      loadingEl.classList.remove('hidden');
      resultsEl.classList.add('hidden');
      // Reset loading message
      const loadingText = loadingEl.querySelector('p');
      if (loadingText) {
        loadingText.textContent = 'Analyzing prediction factors...';
      }
    } else {
      loadingEl.classList.add('hidden');
      resultsEl.classList.remove('hidden');
    }
  }
  
  /**
   * Render all insights
   */
  renderInsights() {
    if (this.isDestroyed) return;
    
    const resultsContainer = this.container.querySelector('.insights-results');
    
    // Clear container
    resultsContainer.innerHTML = '';
    
    // Group insights by type
    const insightsByType = this.insights.reduce((acc, insight) => {
      if (!acc[insight.type]) {
        acc[insight.type] = [];
      }
      acc[insight.type].push(insight);
      return acc;
    }, {});
    
    // Create an ordered list of insight types to ensure consistent order
    const orderPriority = {
      'FEATURE_IMPORTANCE': 1,
      'HISTORICAL_CONTEXT': 2,
      'STATISTICAL_SIGNIFICANCE': 3,
      'CORRELATION_PATTERN': 4, 
      'COUNTERFACTUAL': 5,
      'CAUSAL_RELATIONSHIP': 6
    };
    
    const orderedTypes = Object.keys(insightsByType).sort((a, b) => {
      return (orderPriority[a] || 99) - (orderPriority[b] || 99);
    });
    
    // Check if we have any insights
    if (orderedTypes.length === 0) {
      resultsContainer.innerHTML = `
        <div class="insights-empty" role="alert">
          <p>No insights available for the selected factors.</p>
          <button class="retry-button">Try Again</button>
        </div>
      `;
      
      // Add retry handler
      const retryButton = resultsContainer.querySelector('.retry-button');
      retryButton.addEventListener('click', () => this.loadInsights());
      
      return;
    }
    
    // Add summary section
    resultsContainer.innerHTML = `
      <div class="insights-summary">
        <p>Showing ${this.insights.length} insights for ${this.factors.length} factors.</p>
      </div>
    `;
    
    // Create navigation
    if (orderedTypes.length > 1) {
      const nav = document.createElement('nav');
      nav.className = 'insights-nav';
      nav.setAttribute('aria-label', 'Insights sections');
      
      const navList = document.createElement('ul');
      nav.appendChild(navList);
      
      orderedTypes.forEach(type => {
        const typeFormatted = formatInsightType(type);
        const sectionId = `${this.container.id}-section-${type.toLowerCase()}`;
        
        const navItem = document.createElement('li');
        navItem.innerHTML = `
          <a href="#${sectionId}" class="nav-link">
            ${typeFormatted}
          </a>
        `;
        
        navList.appendChild(navItem);
      });
      
      resultsContainer.appendChild(nav);
    }
    
    // Render each insight type
    orderedTypes.forEach(type => {
      const insights = insightsByType[type];
      let insightHtml = '';
      const sectionId = `${this.container.id}-section-${type.toLowerCase()}`;
      
      switch (type) {
        case 'FEATURE_IMPORTANCE':
          insightHtml = this.renderFeatureImportance(insights, sectionId);
          break;
        case 'HISTORICAL_CONTEXT':
          insightHtml = this.renderHistoricalContext(insights, sectionId);
          break;
        case 'STATISTICAL_SIGNIFICANCE':
          insightHtml = this.renderStatisticalSignificance(insights, sectionId);
          break;
        case 'CORRELATION_PATTERN':
          insightHtml = this.renderCorrelationPattern(insights, sectionId);
          break;
        case 'COUNTERFACTUAL':
          insightHtml = this.renderCounterfactual(insights, sectionId);
          break;
        case 'CAUSAL_RELATIONSHIP':
          insightHtml = this.renderCausalRelationships(insights, sectionId);
          break;
        default:
          // Generic renderer for other types
          insightHtml = this.renderGenericInsight(insights, sectionId);
      }
      
      // Create a div for the section and add it to the container
      const sectionDiv = document.createElement('div');
      sectionDiv.innerHTML = insightHtml;
      resultsContainer.appendChild(sectionDiv);
    });
    
    // Initialize charts after rendering
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.initializeCharts();
      }
    }, 10);
  }
  
  /**
   * Render feature importance insights
   * @param {Array} insights Feature importance insights
   * @param {string} sectionId Section ID for linking
   * @returns {string} HTML for feature importance
   */
  renderFeatureImportance(insights, sectionId) {
    if (!insights || insights.length === 0) return '';
    
    const insight = insights[0]; // Use first insight
    
    return `
      <section id="${sectionId}" class="insight-section feature-importance" aria-labelledby="${sectionId}-title">
        <h4 id="${sectionId}-title" tabindex="-1">
          <i class="icon-features" aria-hidden="true"></i> ${insight.title}
        </h4>
        <p>${insight.description}</p>
        <div class="feature-importance-chart" data-insight-id="${insight.id}" 
             role="img" aria-label="Bar chart showing feature importance"></div>
        <div class="feature-details">
          ${insight.data.map((item, index) => `
            <div class="feature-item">
              <div class="feature-name" id="${sectionId}-feature-${index}" tabindex="0">${item.feature}</div>
              <div class="feature-bar-container" role="progressbar" 
                   aria-labelledby="${sectionId}-feature-${index}" 
                   aria-valuenow="${Math.round(item.importance * 100)}" 
                   aria-valuemin="0" aria-valuemax="100">
                <div class="feature-bar" style="width: ${item.importance * 100}%"></div>
                <div class="feature-value">${Math.round(item.importance * 100)}%</div>
              </div>
              <div class="feature-explanation">${item.explanation}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }
  
  /**
   * Render historical context insights
   * @param {Array} insights Historical context insights
   * @param {string} sectionId Section ID for linking
   * @returns {string} HTML for historical context
   */
  renderHistoricalContext(insights, sectionId) {
    if (!insights || insights.length === 0) return '';
    
    const insight = insights[0]; // Use first insight
    
    return `
      <section id="${sectionId}" class="insight-section historical-context" aria-labelledby="${sectionId}-title">
        <h4 id="${sectionId}-title" tabindex="-1">
          <i class="icon-history" aria-hidden="true"></i> ${insight.title}
        </h4>
        <p>${insight.description}</p>
        <div class="historical-stats">
          <div class="stat-item">
            <div class="stat-value">${insight.data.similarCases}</div>
            <div class="stat-label">Similar Cases</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${Math.round(insight.data.successRate * 100)}%</div>
            <div class="stat-label">Success Rate</div>
          </div>
        </div>
        <div class="historical-examples" role="list" aria-label="Historical examples">
          <h5 id="${sectionId}-examples-title">Historical Examples</h5>
          <ul aria-labelledby="${sectionId}-examples-title">
            ${insight.data.examples.map(example => `
              <li class="example-item ${example.result.toLowerCase()}" role="listitem">
                <span class="example-result" aria-hidden="true">${example.result === 'SUCCESS' ? '✓' : '✗'}</span>
                <span class="example-description">${example.description}</span>
                <span class="sr-only">${example.result === 'SUCCESS' ? 'Successful' : 'Failed'} prediction</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </section>
    `;
  }
  
  /**
   * Render statistical significance insights
   * @param {Array} insights Statistical significance insights
   * @param {string} sectionId Section ID for linking
   * @returns {string} HTML for statistical significance
   */
  renderStatisticalSignificance(insights, sectionId) {
    // Simple implementation - in a real system, this would be more detailed
    if (!insights || insights.length === 0) return '';
    
    const insight = insights[0];
    
    return `
      <section id="${sectionId}" class="insight-section statistical-significance" aria-labelledby="${sectionId}-title">
        <h4 id="${sectionId}-title" tabindex="-1">
          <i class="icon-stats" aria-hidden="true"></i> ${insight.title}
        </h4>
        <p>${insight.description}</p>
        <div class="significance-metrics">
          <div class="metric-item">
            <div class="metric-label">P-Value</div>
            <div class="metric-value">${insight.data.pValue.toFixed(3)}</div>
            <div class="metric-explanation" aria-hidden="true">
              ${insight.data.pValue < 0.05 ? 'Statistically significant' : 'Not statistically significant'}
            </div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Sample Size</div>
            <div class="metric-value">${insight.data.sampleSize}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Confidence Interval</div>
            <div class="metric-value">${insight.data.confidenceInterval[0].toFixed(2)} - ${insight.data.confidenceInterval[1].toFixed(2)}</div>
          </div>
        </div>
      </section>
    `;
  }
  
  /**
   * Render correlation pattern insights
   * @param {Array} insights Correlation pattern insights
   * @param {string} sectionId Section ID for linking
   * @returns {string} HTML for correlation patterns
   */
  renderCorrelationPattern(insights, sectionId) {
    // Simple implementation - in a real system, this would render a correlation matrix visualization
    if (!insights || insights.length === 0) return '';
    
    const insight = insights[0];
    
    return `
      <section id="${sectionId}" class="insight-section correlation-pattern" aria-labelledby="${sectionId}-title">
        <h4 id="${sectionId}-title" tabindex="-1">
          <i class="icon-correlation" aria-hidden="true"></i> ${insight.title}
        </h4>
        <p>${insight.description}</p>
        <div class="correlation-chart" data-insight-id="${insight.id}" 
             role="img" aria-label="Correlation matrix showing relationships between factors"></div>
        <div class="strongest-correlations">
          <h5 id="${sectionId}-correlations-title">Strongest Relationships</h5>
          <ul aria-labelledby="${sectionId}-correlations-title">
            ${insight.data.strongestCorrelations.map((corr, index) => `
              <li class="correlation-item" tabindex="0">
                <div class="correlation-factors">${corr.factor1} ↔ ${corr.factor2}</div>
                <div class="correlation-strength ${corr.type.toLowerCase()}">${Math.round(corr.strength * 100)}%</div>
              </li>
            `).join('')}
          </ul>
        </div>
      </section>
    `;
  }
  
  /**
   * Render counterfactual insights
   * @param {Array} insights Counterfactual insights
   * @param {string} sectionId Section ID for linking
   * @returns {string} HTML for counterfactuals
   */
  renderCounterfactual(insights, sectionId) {
    if (!insights || insights.length === 0) return '';
    
    const insight = insights[0];
    
    return `
      <section id="${sectionId}" class="insight-section counterfactual" aria-labelledby="${sectionId}-title">
        <h4 id="${sectionId}-title" tabindex="-1">
          <i class="icon-whatif" aria-hidden="true"></i> ${insight.title}
        </h4>
        <p>${insight.description}</p>
        <div class="scenarios" role="list" aria-label="What-if scenarios">
          ${insight.data.scenarios.map((scenario, index) => `
            <div class="scenario-item impact-${scenario.impact.toLowerCase()}" role="listitem" tabindex="0">
              <div class="scenario-change">${scenario.change}</div>
              <div class="scenario-probability">
                <div class="new-probability">${Math.round(scenario.newProbability * 100)}%</div>
                <div class="probability-change ${scenario.change > 0 ? 'positive' : 'negative'}">
                  ${scenario.change > 0 ? '+' : ''}${Math.round(scenario.change * 100)}%
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }
  
  /**
   * Render causal relationship insights
   * @param {Array} insights Causal relationship insights
   * @param {string} sectionId Section ID for linking
   * @returns {string} HTML for causal relationships
   */
  renderCausalRelationships(insights, sectionId) {
    if (!insights || insights.length === 0) return '';
    
    const insight = insights[0];
    
    return `
      <section id="${sectionId}" class="insight-section causal-relationship" aria-labelledby="${sectionId}-title">
        <h4 id="${sectionId}-title" tabindex="-1">
          <i class="icon-causal" aria-hidden="true"></i> ${insight.title}
        </h4>
        <p>${insight.description}</p>
        <div class="causal-links" role="list" aria-label="Causal relationships">
          ${insight.data.causalLinks.map((link, index) => `
            <div class="causal-link-item" role="listitem" tabindex="0">
              <div class="causal-direction">
                <div class="cause">${link.cause}</div>
                <div class="arrow" aria-hidden="true">→</div>
                <div class="effect">${link.effect}</div>
              </div>
              <div class="causal-strength-bar" role="progressbar" 
                   aria-label="Causal strength" 
                   aria-valuenow="${Math.round(link.strength * 100)}" 
                   aria-valuemin="0" aria-valuemax="100">
                <div class="strength-fill" style="width: ${link.strength * 100}%"></div>
              </div>
              <div class="causal-evidence">${link.evidence}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }
  
  /**
   * Render generic insights
   * @param {Array} insights Generic insights
   * @param {string} sectionId Section ID for linking
   * @returns {string} HTML for generic insights
   */
  renderGenericInsight(insights, sectionId) {
    if (!insights || insights.length === 0) return '';
    
    return `
      <section id="${sectionId}" class="insight-section generic" aria-labelledby="${sectionId}-title">
        <h4 id="${sectionId}-title" tabindex="-1">${formatInsightType(insights[0].type)}</h4>
        ${insights.map((insight, index) => `
          <div class="generic-insight" tabindex="0">
            <h5>${insight.title}</h5>
            <p>${insight.description}</p>
            <div class="insight-confidence">Confidence: ${Math.round(insight.confidence * 100)}%</div>
            ${insight.data ? `<pre class="insight-data">${JSON.stringify(insight.data, null, 2)}</pre>` : ''}
          </div>
        `).join('')}
      </section>
    `;
  }
  
  /**
   * Track chart instances for later cleanup
   * @param {string} id Chart ID
   * @param {Object} chart Chart instance
   */
  handleChartRendered(id, chart) {
    if (this.isDestroyed) return;
    
    this.createdCharts.push({
      id,
      chart
    });
  }
  
  /**
   * Clear all charts to prevent memory leaks
   */
  clearCharts() {
    // Clean up any previously created charts
    if (this.createdCharts.length > 0) {
      this.createdCharts.forEach(chartInfo => {
        if (chartInfo.chart && typeof chartInfo.chart.destroy === 'function') {
          chartInfo.chart.destroy();
        }
      });
      
      this.createdCharts = [];
    }
    
    // Also use chartRenderer's clear method for any missed charts
    const chartContainers = this.container.querySelectorAll('.feature-importance-chart, .correlation-chart');
    chartContainers.forEach(container => {
      if (chartRenderer && typeof chartRenderer.clearChart === 'function') {
        chartRenderer.clearChart(container);
      }
    });
  }
  
  /**
   * Initialize charts after rendering
   */
  initializeCharts() {
    if (this.isDestroyed) return;
    
    // Feature importance chart
    const featureChartEl = this.container.querySelector('.feature-importance-chart');
    if (featureChartEl) {
      const insightId = featureChartEl.dataset.insightId;
      const insight = this.insights.find(i => i.id === insightId);
      
      if (insight && chartRenderer) {
        const chart = chartRenderer.renderBarChart(featureChartEl, {
          labels: insight.data.map(d => d.feature),
          values: insight.data.map(d => d.importance),
          title: 'Factor Importance',
          colors: ['#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107'],
          accessibleColors: true, // Use colorblind-safe palette
          onRendered: (chartInstance) => this.handleChartRendered(insightId, chartInstance)
        });
      }
    }
    
    // Correlation matrix chart
    const correlationChartEl = this.container.querySelector('.correlation-chart');
    if (correlationChartEl) {
      const insightId = correlationChartEl.dataset.insightId;
      const insight = this.insights.find(i => i.id === insightId);
      
      if (insight && chartRenderer) {
        const chart = chartRenderer.renderHeatmap(correlationChartEl, {
          matrix: insight.data.correlationMatrix,
          labels: insight.data.factorLabels,
          title: 'Correlation Matrix',
          colorRange: ['#4393c3', '#f7f7f7', '#d6604d'], // Colorblind-safe palette
          accessibleColors: true,
          onRendered: (chartInstance) => this.handleChartRendered(insightId, chartInstance)
        });
      }
    }
  }
  
  /**
   * Update factors and reload insights
   * @param {Array} factors New factors
   * @param {Object} options Optional settings
   */
  updateFactors(factors, options = {}) {
    if (this.isDestroyed) return;
    
    this.factors = factors;
    
    if (options.sport) this.sport = options.sport;
    if (options.league) this.league = options.league;
    if (options.detailLevel) this.detailLevel = options.detailLevel;
    
    // Update detail level selector if needed
    if (options.detailLevel) {
      const detailSelect = this.container.querySelector(`#${this.container.id}-detail-level`);
      if (detailSelect) {
        detailSelect.value = options.detailLevel;
      }
    }
    
    // Clear existing charts
    this.clearCharts();
    
    // Reload insights
    this.loadInsights();
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    // Set destroyed flag
    this.isDestroyed = true;
    
    // Remove event listeners
    this.container.removeEventListener('focusout', this.handleFocusOut);
    
    // Clear charts
    this.clearCharts();
    
    // Remove from WeakMap
    if (window.__insightComponents) {
      window.__insightComponents.delete(this.container);
    }
    
    // Clear any references that could cause memory leaks
    this.onInsightsLoaded = null;
    this.insights = null;
    this.lastFocusedElement = null;
    
    // Remove content
    this.container.innerHTML = '';
    this.container.classList.remove('explainable-insights-container');
    
    // Remove ARIA attributes
    this.container.removeAttribute('role');
    this.container.removeAttribute('aria-label');
  }
}

/**
 * Format insight type for display
 * @param {string} type Insight type constant
 * @returns {string} Formatted type
 */
function formatInsightType(type) {
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

export default ExplainableInsights; 