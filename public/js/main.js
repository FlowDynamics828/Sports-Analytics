/**
 * Sports Analytics Pro - Main Application Entry Point
 * Enterprise-level architecture implementation
 */

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
  initApplication();
});

/**
 * Initialize the application
 */
function initApplication() {
  console.log('Sports Analytics Pro - Initializing application');
  
  // Initialize services
  const apiService = initApiService();
  const sportsDataService = initSportsDataService(apiService);
  
  // Initialize UI components
  initNavigation();
  initHeroSection();
  initLeaguesTabs();
  initPredictionEngine(sportsDataService);
  initAIInsights(sportsDataService);
  initLiveScores(sportsDataService);
  initStatsCards();
  initContactForm();
  
  // Initialize global event handlers
  initGlobalEventHandlers();
  
  // Check API status
  checkApiStatus();
}

/**
 * Initialize API Service
 * @returns {ApiService} - Configured API service
 */
function initApiService() {
  // Get configuration from env-config.js
  const baseUrl = window.ENV_CONFIG?.API_BASE_URL || '/api';
  const timeout = window.ENV_CONFIG?.API_TIMEOUT || 30000;
  
  // Create API service instance
  const apiService = new ApiService({
    baseUrl,
    timeout,
    retryCount: 2,
    withCredentials: true,
    debugMode: window.ENV_CONFIG?.DEBUG_MODE || false,
    onUnauthorized: () => {
      // Handle unauthorized responses (redirect to login if needed)
      console.warn('API authorization required');
      showNotification('API authorization required. Please log in.', 'warning');
    },
    onError: (error) => {
      // Global error handler
      console.error('API error:', error);
    }
  });
  
  return apiService;
}

/**
 * Initialize Sports Data Service
 * @param {ApiService} apiService - API service instance
 * @returns {SportsDataService} - Configured sports data service
 */
function initSportsDataService(apiService) {
  return new SportsDataService(apiService, {
    endpoints: {
      leagues: '/leagues',
      teams: '/teams',
      players: '/players',
      games: '/matches',
      predictions: '/predictions',
      stats: '/stats',
      standings: '/standings'
    },
    // Only use fallback mode as a last resort when real API calls fail
    fallbackMode: window.ENV_CONFIG?.SERVICES?.SPORTS_DATA_API_KEY === 'demo_key_12345',
    debugMode: window.ENV_CONFIG?.DEBUG_MODE || false
  });
}

/**
 * Initialize navigation
 */
function initNavigation() {
  const navbar = document.querySelector('.navbar');
  const navbarToggler = document.querySelector('.navbar-toggler');
  const navbarMenu = document.querySelector('.navbar-menu');
  const navLinks = document.querySelectorAll('.nav-link');
  
  // Toggle mobile menu
  if (navbarToggler && navbarMenu) {
    navbarToggler.addEventListener('click', () => {
      navbarMenu.classList.toggle('show');
    });
  }
  
  // Handle scroll behavior for navbar
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }
  
  // Smooth scroll for navigation links
  if (navLinks.length > 0) {
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        // Close mobile menu
        if (navbarMenu) {
          navbarMenu.classList.remove('show');
        }
        
        // Get target section
        const targetId = link.getAttribute('href');
        if (targetId && targetId.startsWith('#') && targetId !== '#') {
          e.preventDefault();
          
          const targetElement = document.querySelector(targetId);
          if (targetElement) {
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
            
            // Update URL but don't add to history
            window.history.replaceState(null, null, targetId);
            
            // Update active link
            navLinks.forEach(navLink => navLink.classList.remove('active'));
            link.classList.add('active');
          }
        }
      });
    });
  }
  
  // Set active link based on current position
  updateActiveNavLinkOnScroll(navLinks);
}

/**
 * Update active navigation link based on scroll position
 * @param {NodeList} navLinks - Navigation links
 */
function updateActiveNavLinkOnScroll(navLinks) {
  if (navLinks.length === 0) return;
  
  window.addEventListener('scroll', () => {
    let fromTop = window.scrollY + 100;
    
    // Find all sections
    const sections = Array.from(navLinks)
      .map(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#') && href !== '#') {
          const section = document.querySelector(href);
          return section ? { link, section } : null;
        }
        return null;
      })
      .filter(item => item !== null);
    
    // Find the current section
    let current = sections.find(item => {
      const { section } = item;
      const offset = section.offsetTop - 100;
      const height = section.offsetHeight;
      return offset <= fromTop && offset + height > fromTop;
    });
    
    // Set active class
    navLinks.forEach(link => link.classList.remove('active'));
    if (current) {
      current.link.classList.add('active');
    } else if (fromTop <= 100) {
      // If at the top, set the first link as active
      navLinks[0].classList.add('active');
    }
  });
}

/**
 * Initialize hero section
 */
function initHeroSection() {
  // Add subtle animations for hero elements
  const heroElements = document.querySelectorAll('.hero-content > *, .hero-stats > *');
  
  if (heroElements.length > 0) {
    heroElements.forEach((element, index) => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        element.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      }, 100 + (index * 100));
    });
  }
  
  // Initialize stat counters
  initStatCounters();
}

/**
 * Initialize animated stat counters
 */
function initStatCounters() {
  const statValues = document.querySelectorAll('.stat-value');
  
  if (statValues.length === 0) return;
  
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const targetValue = parseInt(element.dataset.value || '0', 10);
        
        if (!element.classList.contains('counted')) {
          animateCounter(element, 0, targetValue, 2000);
          element.classList.add('counted');
        }
      }
    });
  }, observerOptions);
  
  statValues.forEach(stat => observer.observe(stat));
}

/**
 * Animate a counter from start to end
 * @param {Element} element - Element to update
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} duration - Animation duration in ms
 */
function animateCounter(element, start, end, duration) {
  const range = end - start;
  let current = start;
  const increment = end > start ? 1 : -1;
  const stepTime = Math.abs(Math.floor(duration / range));
  
  const timer = setInterval(() => {
    current += increment;
    element.textContent = current.toLocaleString();
    
    if (current === end) {
      clearInterval(timer);
    }
  }, stepTime);
}

/**
 * Initialize leagues tabs
 */
function initLeaguesTabs() {
  const leagueTabs = document.querySelectorAll('.league-tab');
  const leagueContents = document.querySelectorAll('.league-content');
  
  if (leagueTabs.length === 0 || leagueContents.length === 0) return;
  
  leagueTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      leagueTabs.forEach(tab => tab.classList.remove('active'));
      leagueContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      
      const targetId = tab.dataset.target;
      if (targetId) {
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      }
    });
  });
}

/**
 * Initialize prediction engine component
 * @param {SportsDataService} sportsDataService - Sports data service instance
 */
function initPredictionEngine(sportsDataService) {
  const predictionContainer = document.getElementById('prediction-engine');
  if (!predictionContainer) return;
  
  try {
    const predictionEngine = new PredictionEngine('prediction-engine', {
      apiEndpoint: '/api/predictions/generate',
      formSelector: '#predictive-model-form',
      resultSelector: '#prediction-result',
      errorSelector: '.api-error',
      // Only use fallback data if API fails, prioritize real data
      fallbackMode: window.ENV_CONFIG?.SERVICES?.SPORTS_DATA_API_KEY === 'demo_key_12345',
      defaultValues: {
        sportType: 'soccer',
        homeTeam: 'Liverpool',
        awayTeam: 'Manchester City'
      },
      debug: window.ENV_CONFIG?.DEBUG_MODE || false,
      events: {
        'prediction-complete': (prediction) => {
          console.log('Prediction generated:', prediction);
          
          // Show success notification
          showNotification('Prediction generated successfully!', 'success');
          
          // Track analytics event
          if (window.analytics) {
            window.analytics.track('Prediction Generated', {
              sport: document.getElementById('sportType')?.value || 'soccer',
              homeTeam: prediction.homeTeam,
              awayTeam: prediction.awayTeam
            });
          }
        },
        'prediction-error': (error) => {
          console.error('Prediction error:', error);
          
          // Show error notification
          showNotification(`Error: ${error.message}`, 'error');
        }
      }
    });
    
    // Store component reference if needed elsewhere
    window.predictionEngine = predictionEngine;
  } catch (error) {
    console.error('Failed to initialize prediction engine:', error);
  }
}

/**
 * Initialize AI Insights component
 * @param {SportsDataService} sportsDataService - Sports data service instance
 */
function initAIInsights(sportsDataService) {
  const insightsContainer = document.getElementById('ai-insights');
  if (!insightsContainer) return;
  
  try {
    const aiInsights = new AIInsights('ai-insights', sportsDataService, {
      insightsEndpoint: '/api/insights',
      insightsCount: 4,
      autoRefresh: true,
      refreshInterval: 300000, // 5 minutes
      sportType: 'all',
      // Use real data where possible (same conditioning as other components)
      useRealData: window.ENV_CONFIG?.SERVICES?.SPORTS_DATA_API_KEY !== 'demo_key_12345',  
      debug: window.ENV_CONFIG?.DEBUG_MODE || false,
      events: {
        'insights-loaded': (insights) => {
          console.log(`Loaded ${insights.length} AI insights`);
        },
        'insights-error': (error) => {
          console.error('AI insights error:', error);
        },
        'insights-filtered': (type) => {
          console.log(`Insights filtered by: ${type}`);
        }
      }
    });
    
    // Store component reference if needed elsewhere
    window.aiInsights = aiInsights;
  } catch (error) {
    console.error('Failed to initialize AI insights:', error);
  }
}

/**
 * Initialize live scores
 * @param {SportsDataService} sportsDataService - Sports data service instance
 */
function initLiveScores(sportsDataService) {
  const liveMatchesContainer = document.querySelector('.live-matches');
  if (!liveMatchesContainer) return;
  
  // Initial load
  loadLiveMatches(liveMatchesContainer, sportsDataService);
  
  // Auto-refresh every 60 seconds
  setInterval(() => {
    loadLiveMatches(liveMatchesContainer, sportsDataService);
  }, 60000);
}

/**
 * Load live matches data
 * @param {Element} container - Container element
 * @param {SportsDataService} sportsDataService - Sports data service instance
 */
async function loadLiveMatches(container, sportsDataService) {
  try {
    container.innerHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <p class="loading-text">Updating live scores...</p>
      </div>
    `;
    
    // Get active league tab
    const activeTab = document.querySelector('.league-tab.active');
    const leagueId = activeTab?.dataset.leagueId || '4328'; // Default to Premier League
    
    // Fetch live matches
    const matches = await sportsDataService.getLiveMatches(leagueId);
    
    // Render matches
    if (matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-calendar-times"></i>
          <p>No live matches at the moment.</p>
        </div>
      `;
      return;
    }
    
    const matchesHTML = matches.map(match => `
      <div class="match-card live-match">
        <div class="match-card-header">
          <div class="match-league">${match.venue}</div>
          <div class="live-badge">LIVE</div>
        </div>
        <div class="match-card-body">
          <div class="match-time">${match.minute}'</div>
          <div class="team-container">
            <div class="team">
              <img src="${match.homeTeam.logo || '/img/teams/placeholder.svg'}" alt="${match.homeTeam.name}" class="team-logo">
              <div class="team-name">${match.homeTeam.name}</div>
            </div>
            <div class="match-score">
              <span class="home-score ${match.score.home > match.score.away ? 'winner' : ''}">${match.score.home}</span>
              <span class="score-separator">-</span>
              <span class="away-score ${match.score.away > match.score.home ? 'winner' : ''}">${match.score.away}</span>
            </div>
            <div class="team">
              <img src="${match.awayTeam.logo || '/img/teams/placeholder.svg'}" alt="${match.awayTeam.name}" class="team-logo">
              <div class="team-name">${match.awayTeam.name}</div>
            </div>
          </div>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = matchesHTML;
  } catch (error) {
    console.error('Error loading live matches:', error);
    
    container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Failed to load live matches. Please try again later.</p>
      </div>
    `;
  }
}

/**
 * Initialize stats cards
 */
function initStatsCards() {
  const statsCards = document.querySelectorAll('.stats-card');
  
  if (statsCards.length === 0) return;
  
  // Add animation when card comes into view
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const card = entry.target;
        card.classList.add('animated');
        observer.unobserve(card);
      }
    });
  }, observerOptions);
  
  statsCards.forEach(card => observer.observe(card));
}

/**
 * Initialize contact form
 */
function initContactForm() {
  const contactForm = document.getElementById('contact-form');
  if (!contactForm) return;
  
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending...';
    
    try {
      const formData = new FormData(contactForm);
      const formObject = Object.fromEntries(formData.entries());
      
      // Validate form
      if (!formObject.name || !formObject.email || !formObject.message) {
        throw new Error('Please fill in all required fields');
      }
      
      // Send form data
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formObject)
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
      
      // Show success message
      showNotification('Your message has been sent successfully!', 'success');
      contactForm.reset();
    } catch (error) {
      console.error('Contact form error:', error);
      showNotification(`Error: ${error.message}`, 'error');
    } finally {
      // Restore button
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });
}

/**
 * Check API status
 */
function checkApiStatus() {
  fetch('/api/status')
    .then(response => response.json())
    .then(data => {
      const statusIndicator = document.querySelector('.api-status-indicator');
      if (statusIndicator) {
        if (data.status === 'online') {
          statusIndicator.classList.add('online');
          statusIndicator.setAttribute('title', 'API is online');
        } else {
          statusIndicator.classList.add('offline');
          statusIndicator.setAttribute('title', 'API is offline');
        }
      }
    })
    .catch(error => {
      console.error('API status check failed:', error);
      
      const statusIndicator = document.querySelector('.api-status-indicator');
      if (statusIndicator) {
        statusIndicator.classList.add('offline');
        statusIndicator.setAttribute('title', 'API is offline');
      }
    });
}

/**
 * Initialize global event handlers
 */
function initGlobalEventHandlers() {
  // Handle dark/light mode toggle if implemented
  const themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Close notification when close button is clicked
  document.addEventListener('click', (e) => {
    if (e.target.closest('.notification-close')) {
      const notification = e.target.closest('.notification');
      if (notification) {
        closeNotification(notification);
      }
    }
  });
}

/**
 * Toggle between dark and light theme
 */
function toggleTheme() {
  const body = document.body;
  const isDarkMode = body.classList.contains('light-theme');
  
  if (isDarkMode) {
    body.classList.remove('light-theme');
    localStorage.setItem('theme', 'dark');
  } else {
    body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
  }
}

/**
 * Show a notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
  const notificationsContainer = document.getElementById('notifications');
  if (!notificationsContainer) {
    const container = document.createElement('div');
    container.id = 'notifications';
    document.body.appendChild(container);
  }
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  // Set notification icon based on type
  const icons = {
    success: 'check-circle',
    error: 'times-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  };
  
  notification.innerHTML = `
    <div class="notification-icon">
      <i class="fas fa-${icons[type] || icons.info}"></i>
    </div>
    <div class="notification-content">
      <p>${message}</p>
    </div>
    <button class="notification-close">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  // Add to container
  const container = document.getElementById('notifications');
  container.appendChild(notification);
  
  // Trigger entrance animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    closeNotification(notification);
  }, 5000);
}

/**
 * Close a notification
 * @param {Element} notification - Notification element
 */
function closeNotification(notification) {
  notification.classList.remove('show');
  
  // Remove from DOM after exit animation completes
  setTimeout(() => {
    notification.remove();
  }, 300);
}
