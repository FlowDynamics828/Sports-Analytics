/**
 * Sports Analytics Platform Dashboard
 * v1.0.0
 * Enterprise-grade sports analytics dashboard with data visualization
 */

// Dashboard configuration
const dashboardConfig = {
    apiEndpoint: '/api',
    refreshInterval: 60000, // 1 minute
    chartColors: {
        primary: '#2563eb',
        secondary: '#4f46e5',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        dark: '#1e293b',
        light: '#f3f4f6',
        neutral: '#6b7280',
    },
    animationDuration: 1000,
    chartDefaults: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 1000,
            easing: 'easeOutQuart'
        },
        font: {
            family: 'Inter, sans-serif'
        },
        plugins: {
            legend: {
                labels: {
                    color: '#94a3b8'
                }
            },
            tooltip: {
                titleFont: {
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    size: 13
                },
                padding: 12,
                backgroundColor: 'rgba(17, 24, 39, 0.8)',
                titleColor: '#f1f5f9',
                bodyColor: '#e2e8f0',
                borderColor: '#1e293b',
                borderWidth: 1,
                displayColors: true,
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true
            }
        }
    }
};

// Cache DOM elements for performance
const DOM = {
    // Tab buttons and content
    tabButtons: document.querySelectorAll('.dashboard-tab-button'),
    tabContents: document.querySelectorAll('.dashboard-tab'),
    
    // Loading elements
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingProgressBar: document.getElementById('loading-progress-bar'),
    
    // Metric display elements
    gamesPlayedMetric: document.getElementById('gamesPlayedMetric'),
    averageScoreMetric: document.getElementById('averageScoreMetric'),
    winRateMetric: document.getElementById('winRateMetric'),
    predictionAccuracyMetric: document.getElementById('predictionAccuracyMetric'),
    
    // Chart canvases
    performanceChart: document.getElementById('performance-chart'),
    
    // Dropdowns
    leagueSelector: document.getElementById('league-selector'),
    teamSelector: document.getElementById('team-selector'),
    
    // User elements
    userInitial: document.getElementById('user-initial'),
    userName: document.getElementById('user-name'),
    
    // Status elements
    connectionStatus: document.getElementById('connectionStatus'),
    connectionText: document.getElementById('connectionText'),
    lastUpdated: document.getElementById('lastUpdated'),
    
    // Buttons
    refreshBtn: document.getElementById('refreshBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userMenuButton: document.getElementById('userMenuButton'),
    userMenu: document.getElementById('userMenu'),
    toggleSidebar: document.getElementById('toggle-sidebar'),
    sidebar: document.getElementById('sidebar')
};

// State management
const state = {
    activeTab: 'dashboardOverview',
    selectedLeague: null,
    selectedTeam: null,
    isLoading: true,
    isConnected: true,
    lastUpdated: new Date(),
    charts: {},
    data: {
        metrics: {},
        performance: [],
        teams: [],
        leagues: []
    },
    user: {
        name: 'Demo User',
        email: 'demo@example.com',
        role: 'premium',
        avatar: null
    }
};

/**
 * Initialize the dashboard
 */
function initDashboard() {
    // Simulate loading
    simulateLoading();
    
    // Show user info
    updateUserInfo();
    
    // Initialize tab handling
    initTabs();
    
    // Initialize event listeners
    initEventListeners();
    
    // Load initial data
    loadDashboardData();
    
    // Set up automatic refresh
    setInterval(refreshDashboardData, dashboardConfig.refreshInterval);
}

/**
 * Simulate loading progress
 */
function simulateLoading() {
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        DOM.loadingProgressBar.style.width = `${progress}%`;
        
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                DOM.loadingOverlay.style.opacity = 0;
                setTimeout(() => {
                    DOM.loadingOverlay.style.display = 'none';
                    state.isLoading = false;
                }, 500);
            }, 500);
        }
    }, 100);
}

/**
 * Initialize tab handling
 */
function initTabs() {
    DOM.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            activateTab(tabName);
        });
    });
}

/**
 * Activate a specific tab
 * @param {string} tabName - Name of tab to activate
 */
function activateTab(tabName) {
    // Update state
    state.activeTab = tabName;
    
    // Update UI
    DOM.tabButtons.forEach(button => {
        const buttonTabName = button.getAttribute('data-tab');
        if (buttonTabName === tabName) {
            button.classList.add('text-blue-500', 'border-blue-500', 'bg-gray-700', 'bg-opacity-50');
            button.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-gray-700', 'border-transparent', 'hover:border-gray-400');
        } else {
            button.classList.remove('text-blue-500', 'border-blue-500', 'bg-gray-700', 'bg-opacity-50');
            button.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-gray-700', 'border-transparent', 'hover:border-gray-400');
        }
    });
    
    // Show active tab content, hide others
    DOM.tabContents.forEach(content => {
        if (content.id === tabName) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Update section title
    const sectionTitle = document.getElementById('dashboard-section-title');
    if (sectionTitle) {
        sectionTitle.textContent = tabName.replace('dashboard', '');
    }
    
    // Load specific tab data if needed
    loadTabSpecificData(tabName);
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
    // Toggle sidebar
    if (DOM.toggleSidebar && DOM.sidebar) {
        DOM.toggleSidebar.addEventListener('click', () => {
            const isSidebarCollapsed = DOM.sidebar.getAttribute('data-collapsed') === 'true';
            DOM.sidebar.setAttribute('data-collapsed', !isSidebarCollapsed);
            
            if (!isSidebarCollapsed) {
                DOM.sidebar.style.width = '64px';
            } else {
                DOM.sidebar.style.width = '256px';
            }
        });
    }
    
    // User menu toggle
    if (DOM.userMenuButton && DOM.userMenu) {
        DOM.userMenuButton.addEventListener('click', event => {
            event.stopPropagation();
            DOM.userMenu.classList.toggle('hidden');
        });
        
        document.addEventListener('click', event => {
            if (!DOM.userMenu.contains(event.target) && !DOM.userMenuButton.contains(event.target)) {
                DOM.userMenu.classList.add('hidden');
            }
        });
    }
    
    // Refresh button
    if (DOM.refreshBtn) {
        DOM.refreshBtn.addEventListener('click', () => {
            showToast('Refreshing dashboard data...', 'info');
            refreshDashboardData();
        });
    }
    
    // Logout button
    if (DOM.logoutBtn) {
        DOM.logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/login';
        });
    }
    
    // League selector
    if (DOM.leagueSelector) {
        DOM.leagueSelector.addEventListener('change', event => {
            state.selectedLeague = event.target.value;
            loadTeams(state.selectedLeague);
            refreshDashboardData();
        });
    }
    
    // Team selector
    if (DOM.teamSelector) {
        DOM.teamSelector.addEventListener('change', event => {
            state.selectedTeam = event.target.value;
            refreshDashboardData();
        });
    }
}

/**
 * Load dashboard data
 */
function loadDashboardData() {
    // Start loading state
    startLoading();
    
    // Perform data loading operations in parallel
    Promise.all([
        fetchMetrics(),
        fetchLeagues(),
        fetchPerformanceData()
    ])
    .then(([metrics, leagues, performance]) => {
        // Update state with fetched data
        state.data.metrics = metrics;
        state.data.leagues = leagues;
        state.data.performance = performance;
        
        // Update UI
        updateMetricsDisplay();
        updateLeagueSelector();
        initPerformanceChart();
        
        // Update connection status and last updated time
        updateConnectionStatus(true);
        updateLastUpdated();
        
        // End loading state
        endLoading();
    })
    .catch(error => {
        console.error('Error loading dashboard data:', error);
        showToast('Error loading dashboard data. Please try again.', 'error');
        
        // Update connection status
        updateConnectionStatus(false);
        
        // End loading state even if there was an error
        endLoading();
    });
}

/**
 * Refresh dashboard data
 */
function refreshDashboardData() {
    // Only refresh if we're not already loading
    if (!state.isLoading) {
        loadDashboardData();
    }
}

/**
 * Fetch metrics data
 * @returns {Promise<Object>} Metrics data
 */
function fetchMetrics() {
    // For demo, return mock data
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                gamesPlayed: 387,
                averageScore: 108.2,
                winRate: 0.62,
                predictionAccuracy: 0.78
            });
        }, 500);
    });
}

/**
 * Fetch leagues data
 * @returns {Promise<Array>} Leagues data
 */
function fetchLeagues() {
    // For demo, fetch from API or use mock data
    return new Promise((resolve, reject) => {
        fetch(`${dashboardConfig.apiEndpoint}/leagues`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch leagues');
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    resolve(data.data);
                } else {
                    resolve([
                        { id: 'NBA', name: 'NBA' },
                        { id: 'NFL', name: 'NFL' },
                        { id: 'MLB', name: 'MLB' },
                        { id: 'NHL', name: 'NHL' },
                        { id: 'PREMIER_LEAGUE', name: 'Premier League' }
                    ]);
                }
            })
            .catch(error => {
                console.error('Error fetching leagues:', error);
                // Fallback to mock data
                resolve([
                    { id: 'NBA', name: 'NBA' },
                    { id: 'NFL', name: 'NFL' },
                    { id: 'MLB', name: 'MLB' },
                    { id: 'NHL', name: 'NHL' },
                    { id: 'PREMIER_LEAGUE', name: 'Premier League' }
                ]);
            });
    });
}

/**
 * Fetch teams for a specific league
 * @param {string} leagueId - ID of league to fetch teams for
 * @returns {Promise<Array>} Teams data
 */
function fetchTeams(leagueId) {
    // For demo, fetch from API or use mock data
    return new Promise((resolve, reject) => {
        if (!leagueId || leagueId === 'all') {
            resolve([]);
            return;
        }
        
        fetch(`${dashboardConfig.apiEndpoint}/teams?league=${leagueId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch teams');
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    resolve(data.data);
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error('Error fetching teams:', error);
                resolve([]);
            });
    });
}

/**
 * Fetch performance data
 * @returns {Promise<Array>} Performance data
 */
function fetchPerformanceData() {
    // For demo, return mock data
    return new Promise(resolve => {
        setTimeout(() => {
            resolve([
                { date: '2023-01', points: 105, opponent: 98 },
                { date: '2023-02', points: 112, opponent: 102 },
                { date: '2023-03', points: 109, opponent: 111 },
                { date: '2023-04', points: 115, opponent: 104 },
                { date: '2023-05', points: 118, opponent: 107 },
                { date: '2023-06', points: 106, opponent: 103 },
                { date: '2023-07', points: 121, opponent: 115 },
                { date: '2023-08', points: 114, opponent: 109 },
                { date: '2023-09', points: 110, opponent: 101 },
                { date: '2023-10', points: 117, opponent: 112 },
                { date: '2023-11', points: 122, opponent: 108 },
                { date: '2023-12', points: 125, opponent: 116 }
            ]);
        }, 700);
    });
}

/**
 * Load data specific to a tab
 * @param {string} tabName - Name of tab to load data for
 */
function loadTabSpecificData(tabName) {
    switch (tabName) {
        case 'dashboardTeams':
            // Load teams-specific data
            break;
        case 'dashboardPlayers':
            // Load players-specific data
            break;
        case 'dashboardPredictions':
            // Load predictions-specific data
            break;
        case 'dashboardFixtures':
            // Load fixtures-specific data
            break;
        case 'dashboardLive':
            // Load live-specific data
            break;
        case 'dashboardCharts':
            // Load charts-specific data
            break;
        case 'dashboardInsights':
            // Load insights-specific data
            break;
        case 'dashboardReports':
            // Load reports-specific data
            break;
    }
}

/**
 * Update metrics display
 */
function updateMetricsDisplay() {
    if (DOM.gamesPlayedMetric) {
        animateCounter(DOM.gamesPlayedMetric, 0, state.data.metrics.gamesPlayed || 0);
    }
    
    if (DOM.averageScoreMetric) {
        animateCounter(DOM.averageScoreMetric, 0, state.data.metrics.averageScore || 0, 1);
    }
    
    if (DOM.winRateMetric) {
        animateCounter(DOM.winRateMetric, 0, (state.data.metrics.winRate || 0) * 100, 0, '%');
    }
    
    if (DOM.predictionAccuracyMetric) {
        animateCounter(DOM.predictionAccuracyMetric, 0, (state.data.metrics.predictionAccuracy || 0) * 100, 0, '%');
    }
}

/**
 * Update league selector
 */
function updateLeagueSelector() {
    if (DOM.leagueSelector && state.data.leagues.length > 0) {
        // Clear existing options
        DOM.leagueSelector.innerHTML = '<option value="all">All Leagues</option>';
        
        // Add new options
        state.data.leagues.forEach(league => {
            const option = document.createElement('option');
            option.value = league.id;
            option.textContent = league.name;
            DOM.leagueSelector.appendChild(option);
        });
        
        // Select the previously selected league if available
        if (state.selectedLeague) {
            DOM.leagueSelector.value = state.selectedLeague;
        }
    }
}

/**
 * Load teams for a specific league
 * @param {string} leagueId - ID of league to load teams for
 */
function loadTeams(leagueId) {
    if (DOM.teamSelector) {
        // Clear team selector
        DOM.teamSelector.innerHTML = '<option value="all">All Teams</option>';
        
        // Show loading option
        const loadingOption = document.createElement('option');
        loadingOption.disabled = true;
        loadingOption.selected = true;
        loadingOption.textContent = 'Loading teams...';
        DOM.teamSelector.appendChild(loadingOption);
        
        // Fetch teams
        fetchTeams(leagueId)
            .then(teams => {
                // Remove loading option
                DOM.teamSelector.removeChild(loadingOption);
                
                // Add teams to selector
                if (teams.length > 0) {
                    teams.forEach(team => {
                        const option = document.createElement('option');
                        option.value = team.id;
                        option.textContent = team.name;
                        DOM.teamSelector.appendChild(option);
                    });
                } else {
                    const noTeamsOption = document.createElement('option');
                    noTeamsOption.disabled = true;
                    noTeamsOption.textContent = 'No teams available';
                    DOM.teamSelector.appendChild(noTeamsOption);
                }
                
                // Reset selected team
                DOM.teamSelector.value = 'all';
                state.selectedTeam = 'all';
            })
            .catch(error => {
                console.error('Error loading teams:', error);
                
                // Remove loading option
                DOM.teamSelector.removeChild(loadingOption);
                
                // Add error option
                const errorOption = document.createElement('option');
                errorOption.disabled = true;
                errorOption.textContent = 'Error loading teams';
                DOM.teamSelector.appendChild(errorOption);
            });
    }
}

/**
 * Initialize performance chart
 */
function initPerformanceChart() {
    if (DOM.performanceChart && state.data.performance.length > 0) {
        // Extract labels and data
        const labels = state.data.performance.map(item => item.date);
        const teamData = state.data.performance.map(item => item.points);
        const opponentData = state.data.performance.map(item => item.opponent);
        
        // Create chart
        if (state.charts.performance) {
            state.charts.performance.destroy();
        }
        
        state.charts.performance = new Chart(DOM.performanceChart, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Team Score',
                        data: teamData,
                        borderColor: dashboardConfig.chartColors.primary,
                        backgroundColor: hexToRgba(dashboardConfig.chartColors.primary, 0.1),
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointBackgroundColor: dashboardConfig.chartColors.primary,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Opponent Score',
                        data: opponentData,
                        borderColor: dashboardConfig.chartColors.danger,
                        backgroundColor: hexToRgba(dashboardConfig.chartColors.danger, 0.05),
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointBackgroundColor: dashboardConfig.chartColors.danger,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                ...dashboardConfig.chartDefaults,
                scales: {
                    x: {
                        grid: {
                            color: hexToRgba('#475569', 0.1)
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    },
                    y: {
                        grid: {
                            color: hexToRgba('#475569', 0.1)
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    }
                }
            }
        });
    }
}

/**
 * Update user information display
 */
function updateUserInfo() {
    if (DOM.userInitial) {
        DOM.userInitial.textContent = state.user.name.charAt(0);
    }
    
    if (DOM.userName) {
        DOM.userName.textContent = state.user.name;
    }
}

/**
 * Update connection status
 * @param {boolean} isConnected - Whether connected to API
 */
function updateConnectionStatus(isConnected) {
    state.isConnected = isConnected;
    
    if (DOM.connectionStatus) {
        DOM.connectionStatus.className = isConnected ? 'text-green-500' : 'text-red-500';
    }
    
    if (DOM.connectionText) {
        DOM.connectionText.textContent = isConnected ? 'Connected' : 'Disconnected';
        DOM.connectionText.className = isConnected ? 'text-sm' : 'text-sm text-red-500';
    }
}

/**
 * Update last updated time
 */
function updateLastUpdated() {
    state.lastUpdated = new Date();
    
    if (DOM.lastUpdated) {
        DOM.lastUpdated.textContent = formatRelativeTime(state.lastUpdated);
        
        // Update every minute
        setTimeout(updateLastUpdated, 60000);
    }
}

/**
 * Start loading state
 */
function startLoading() {
    state.isLoading = true;
}

/**
 * End loading state
 */
function endLoading() {
    state.isLoading = false;
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type (success, error, warning, info)
 * @param {number} duration - Duration in ms to show toast
 */
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    
    if (!toastContainer) {
        return;
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Add icon based on type
    let icon = 'info-circle';
    
    switch (type) {
        case 'success':
            icon = 'check-circle';
            break;
        case 'error':
            icon = 'exclamation-circle';
            break;
        case 'warning':
            icon = 'exclamation-triangle';
            break;
    }
    
    toast.innerHTML = `
        <i class="fas fa-${icon} mr-2"></i>
        <span>${message}</span>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300);
    }, duration);
}

/**
 * Animate a counter from start to end value
 * @param {HTMLElement} element - Element to update
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} decimals - Number of decimal places
 * @param {string} suffix - Suffix to add to value
 */
function animateCounter(element, start, end, decimals = 0, suffix = '') {
    const duration = dashboardConfig.animationDuration;
    const startTime = performance.now();
    const frameDuration = 1000 / 60;
    
    // Function to format number with commas and decimals
    const formatNumber = (value) => {
        return value.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    };
    
    // Animation function
    const updateCounter = (timestamp) => {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Use easeOutExpo for smoother animation
        const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        
        // Calculate current value
        const value = start + (end - start) * easedProgress;
        
        // Update element
        element.textContent = formatNumber(value) + suffix;
        
        // Continue animation if not complete
        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        }
    };
    
    // Start animation
    requestAnimationFrame(updateCounter);
}

/**
 * Format a date relative to now
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffMin < 1) {
        return 'Just now';
    } else if (diffMin < 60) {
        return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
    } else if (diffHour < 24) {
        return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
    } else {
        return date.toLocaleString();
    }
}

/**
 * Convert hex color to rgba
 * @param {string} hex - Hex color code
 * @param {number} alpha - Alpha value
 * @returns {string} RGBA color string
 */
function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);