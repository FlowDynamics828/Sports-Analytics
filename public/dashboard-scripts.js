// dashboard-scripts.js - Enhanced JavaScript implementation for better performance
// Version 3.1.0

/**
 * Dashboard scripts for lightweight, standalone components
 * This file contains vanilla JavaScript implementations of dashboard features
 * that can operate without the full dashboard framework for better performance
 */
(function() {
    // Global variables to track dashboard state
    let games = [];
    let selectedLeague = 'nba';
    let isLoading = false;
    let chart = null;
    let lastUpdateTime = Date.now();
    let connectionStatus = 'connecting';

    // Cache DOM elements for better performance
    let leagueSelector;
    let recentGamesContainer;
    let loadingIndicator;
    let chartContainer;
    let connectionStatusEl;
    let connectionTextEl;
    let lastUpdatedEl;
    let dashboardLeagueNameEl;

    // Constants
    const DEFAULT_LIMIT = 5;
    const UPDATE_INTERVAL = 60000; // 1 minute
    const MEMORY_CHECK_INTERVAL = 30000; // 30 seconds

    // Configuration
    const config = {
        chartColors: {
            home: {
                border: 'rgba(59, 130, 246, 1)',
                background: 'rgba(59, 130, 246, 0.2)'
            },
            away: {
                border: 'rgba(239, 68, 68, 1)',
                background: 'rgba(239, 68, 68, 0.2)'
            },
            differential: {
                border: 'rgba(16, 185, 129, 1)',
                background: 'rgba(16, 185, 129, 0.2)'
            }
        },
        statusColors: {
            connected: 'text-green-500',
            disconnected: 'text-red-500',
            error: 'text-red-500',
            connecting: 'text-yellow-500'
        }
    };

    /**
     * Initialize the dashboard on DOM ready
     */
    document.addEventListener('DOMContentLoaded', function() {
        // Cache DOM elements
        cacheElements();

        // Initialize the dashboard
        initDashboard();

        // Set up event listeners
        setupEventListeners();
    });

    /**
     * Cache frequently accessed DOM elements for better performance
     */
    function cacheElements() {
        leagueSelector = document.getElementById('leagueSelector');
        recentGamesContainer = document.getElementById('recentGames');
        loadingIndicator = document.getElementById('loadingIndicator');
        chartContainer = document.getElementById('chartContainer');
        connectionStatusEl = document.getElementById('connectionStatus');
        connectionTextEl = document.getElementById('connectionText');
        lastUpdatedEl = document.getElementById('lastUpdated');
        dashboardLeagueNameEl = document.getElementById('dashboardLeagueName');
    }

    /**
     * Set up all event listeners for the dashboard
     */
    function setupEventListeners() {
        // League selector change
        if (leagueSelector) {
            leagueSelector.addEventListener('change', function(e) {
                selectedLeague = e.target.value;
                fetchData();
            });
        }

        // Games filter change
        const gamesFilter = document.getElementById('gamesFilter');
        if (gamesFilter) {
            gamesFilter.addEventListener('change', function() {
                updateGamesList();
                updatePerformanceChart();
            });
        }

        // Chart type change
        const chartType = document.getElementById('chartType');
        if (chartType) {
            chartType.addEventListener('change', updatePerformanceChart);
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                fetchData(true); // Force refresh
            });
        }

        // League dropdown options
        const leagueOptions = document.querySelectorAll('.league-option');
        leagueOptions.forEach(option => {
            option.addEventListener('click', function(e) {
                e.preventDefault();
                const league = e.currentTarget.dataset.league;
                if (league) {
                    selectedLeague = league;
                    updateLeagueDisplay(league);
                    fetchData();
                    
                    // Hide the dropdown
                    const leagueMenu = document.getElementById('leagueMenu');
                    if (leagueMenu) {
                        leagueMenu.classList.add('hidden');
                    }
                }
            });
        });

        // Dropdown toggles
        const leagueDropdown = document.getElementById('leagueDropdown');
        if (leagueDropdown) {
            leagueDropdown.addEventListener('click', function(e) {
                e.stopPropagation();
                const leagueMenu = document.getElementById('leagueMenu');
                if (leagueMenu) {
                    leagueMenu.classList.toggle('hidden');
                }
            });
        }
        
        const userDropdown = document.getElementById('userDropdown');
        if (userDropdown) {
            userDropdown.addEventListener('click', function(e) {
                e.stopPropagation();
                const userMenu = document.getElementById('userMenu');
                if (userMenu) {
                    userMenu.classList.toggle('hidden');
                }
            });
        }
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            const leagueMenu = document.getElementById('leagueMenu');
            const userMenu = document.getElementById('userMenu');
            
            if (leagueMenu && !e.target.closest('#leagueDropdown')) {
                leagueMenu.classList.add('hidden');
            }
            
            if (userMenu && !e.target.closest('#userDropdown')) {
                userMenu.classList.add('hidden');
            }
        });
    }

    /**
     * Initialize dashboard
     */
    function initDashboard() {
        console.log('Initializing dashboard components...');
        updateConnectionStatus('connecting');
        
        // Initialize the chart if the container exists
        if (chartContainer) {
            initializeChart();
        }
        
        // Fetch initial data
        fetchData();

        // Set up periodic data refresh
        setInterval(function() {
            const timeElapsed = Date.now() - lastUpdateTime;
            // Only auto-refresh if more than the update interval has passed
            if (timeElapsed > UPDATE_INTERVAL) {
                fetchData();
            }
        }, UPDATE_INTERVAL);

        // Set up memory usage monitoring in development/testing
        if (window.performance && window.performance.memory) {
            setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL);
        }
        
        // Update "last updated" time
        if (lastUpdatedEl) {
            setInterval(updateLastUpdatedTime, 30000); // Update every 30 seconds
        }
    }

    /**
     * Initialize the performance chart
     */
    function initializeChart() {
        if (!window.Chart || !chartContainer) return;
        
        const ctx = chartContainer.getContext('2d');
        
        // Create an empty chart initially
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Home Score',
                    data: [],
                    borderColor: config.chartColors.home.border,
                    backgroundColor: config.chartColors.home.background,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        titleColor: 'rgba(255, 255, 255, 0.9)',
                        bodyColor: 'rgba(255, 255, 255, 0.7)',
                        borderColor: 'rgba(59, 130, 246, 0.5)',
                        borderWidth: 1
                    }
                }
            }
        });
    }

    /**
     * Update the league display in the UI
     * @param {string} league - League identifier
     */
    function updateLeagueDisplay(league) {
        // Update current league text
        if (dashboardLeagueNameEl) {
            dashboardLeagueNameEl.textContent = league.toUpperCase();
        }
        
        // Update league selector if it exists
        if (leagueSelector) {
            leagueSelector.value = league;
        }
        
        // Update league icon if it exists
        const currentLeagueIcon = document.getElementById('currentLeagueIcon');
        if (currentLeagueIcon) {
            currentLeagueIcon.src = `/assets/icons/leagues/${league}.svg`;
            currentLeagueIcon.alt = league.toUpperCase();
        }
        
        const currentLeagueName = document.getElementById('currentLeagueName');
        if (currentLeagueName) {
            currentLeagueName.textContent = league.toUpperCase();
        }
    }

    /**
     * Fetch data from API
     * @param {boolean} force - Force refresh even if already loading
     */
    function fetchData(force = false) {
        if (isLoading && !force) {
            console.log('Already loading data, skipping refresh');
            return;
        }

        isLoading = true;
        updateLoadingState(true);

        // Get the token from localStorage
        const token = localStorage.getItem('token') || '';

        fetch(`/api/games/${selectedLeague}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            updateConnectionStatus('connected');
            return response.json();
        })
        .then(data => {
            games = data || [];
            isLoading = false;
            lastUpdateTime = Date.now();
            
            updateUI();
            showToast('Data refreshed successfully', 'success');
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            updateConnectionStatus('error');
            isLoading = false;
            games = [];
            updateUI();
            
            showToast('Failed to load data. Please try again.', 'error');
        });
    }

    /**
     * Update all UI elements with current data
     */
    function updateUI() {
        // Update loading state
        updateLoadingState(false);

        // Update recent games list
        updateGamesList();

        // Update performance chart
        updatePerformanceChart();
        
        // Update last updated time display
        updateLastUpdatedTime();
    }

    /**
     * Update the loading state indicators
     * @param {boolean} isLoading - Whether data is currently loading
     */
    function updateLoadingState(isLoading) {
        // Update loading indicator
        if (loadingIndicator) {
            loadingIndicator.style.display = isLoading ? 'block' : 'none';
        }
        
        // Update refresh button if it exists
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            if (isLoading) {
                refreshBtn.disabled = true;
                refreshBtn.classList.add('opacity-50');
            } else {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('opacity-50');
            }
        }
    }

    /**
     * Update the recent games list
     */
    function updateGamesList() {
        if (!recentGamesContainer) return;

        // Get the number of games to display
        const gamesFilterEl = document.getElementById('gamesFilter');
        const limit = gamesFilterEl ? parseInt(gamesFilterEl.value || DEFAULT_LIMIT) : DEFAULT_LIMIT;

        if (!games || games.length === 0) {
            recentGamesContainer.innerHTML = '<div class="text-center p-4 text-gray-400">No recent games found</div>';
            return;
        }

        // Create a document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        // Only show up to the limit to avoid excessive DOM operations
        const gamesToShow = games.slice(0, limit);

        gamesToShow.forEach(game => {
            const gameElement = document.createElement('div');
            gameElement.className = 'bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors mb-4';

            // Format date properly
            const gameDate = new Date(game.date);
            const formattedDate = gameDate.toLocaleDateString(undefined, { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });

            // Create game HTML
            gameElement.innerHTML = `
                <div class="flex justify-between items-center">
                    <div class="text-lg">
                        <div class="font-bold">${game.homeTeam?.name || 'Home Team'}</div>
                        <div class="text-2xl">${game.homeTeam?.score !== undefined ? game.homeTeam.score : '-'}</div>
                    </div>
                    <div class="text-gray-400 mx-4">VS</div>
                    <div class="text-lg text-right">
                        <div class="font-bold">${game.awayTeam?.name || 'Away Team'}</div>
                        <div class="text-2xl">${game.awayTeam?.score !== undefined ? game.awayTeam.score : '-'}</div>
                    </div>
                </div>
                <div class="text-sm text-gray-400 mt-2 flex justify-between">
                    <span>${formattedDate}</span>
                    ${game.status ? `<span class="px-2 py-0.5 rounded bg-gray-800 text-xs">${game.status}</span>` : ''}
                </div>
            `;

            fragment.appendChild(gameElement);
        });

        // Clear container and append all games at once
        recentGamesContainer.innerHTML = '';
        recentGamesContainer.appendChild(fragment);
    }

    /**
     * Update the performance chart with game data
     */
    function updatePerformanceChart() {
        if (!chart || !games || !games.length) return;
        
        const chartTypeEl = document.getElementById('chartType');
        const chartType = chartTypeEl?.value || 'score';
        
        const gamesFilterEl = document.getElementById('gamesFilter');
        const limit = gamesFilterEl ? parseInt(gamesFilterEl.value || DEFAULT_LIMIT) : DEFAULT_LIMIT;
        
        const limitedGames = games.slice(0, limit).reverse(); // Reverse to show oldest first
        
        // Prepare data based on chart type
        const labels = limitedGames.map(game => {
            const gameDate = new Date(game.date);
            return gameDate.toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric' 
            });
        });
        
        let datasets = [];
        
        if (chartType === 'score') {
            datasets = [
                {
                    label: 'Home Score',
                    data: limitedGames.map(game => game.homeTeam?.score || 0),
                    borderColor: config.chartColors.home.border,
                    backgroundColor: config.chartColors.home.background,
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'Away Score',
                    data: limitedGames.map(game => game.awayTeam?.score || 0),
                    borderColor: config.chartColors.away.border,
                    backgroundColor: config.chartColors.away.background,
                    tension: 0.1,
                    fill: true
                }
            ];
        } else if (chartType === 'differential') {
            // Point differential
            datasets = [
                {
                    label: 'Point Differential',
                    data: limitedGames.map(game => (game.homeTeam?.score || 0) - (game.awayTeam?.score || 0)),
                    borderColor: config.chartColors.differential.border,
                    backgroundColor: function(context) {
                        const value = context.dataset.data[context.dataIndex];
                        return value >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                    },
                    tension: 0.1
                }
            ];
        } else if (chartType === 'combined') {
            // Combined score
            datasets = [
                {
                    label: 'Total Score',
                    data: limitedGames.map(game => (game.homeTeam?.score || 0) + (game.awayTeam?.score || 0)),
                    borderColor: 'rgba(139, 92, 246, 1)',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    tension: 0.1,
                    fill: true
                }
            ];
        }
        
        // Update chart data
        chart.data.labels = labels;
        chart.data.datasets = datasets;
        chart.update();
    }

    /**
     * Update the connection status display
     * @param {string} status - Connection status
     */
    function updateConnectionStatus(status) {
        if (!connectionStatusEl || !connectionTextEl) return;
        
        connectionStatus = status;
        
        const statusConfig = {
            'connected': { class: 'text-green-500', text: 'Connected' },
            'disconnected': { class: 'text-red-500', text: 'Disconnected' },
            'error': { class: 'text-red-500', text: 'Connection Error' },
            'connecting': { class: 'text-yellow-500', text: 'Connecting...' }
        };
        
        const config = statusConfig[status] || statusConfig.connecting;
        
        // Update status dot color
        connectionStatusEl.className = `${config.class} mr-2`;
        
        // Update status text
        connectionTextEl.textContent = config.text;
    }

    /**
     * Update the "last updated" time display
     */
    function updateLastUpdatedTime() {
        if (!lastUpdatedEl) return;
        
        const secondsAgo = Math.floor((Date.now() - lastUpdateTime) / 1000);
        
        if (secondsAgo < 60) {
            lastUpdatedEl.textContent = secondsAgo <= 5 ? 'Just now' : `${secondsAgo} seconds ago`;
        } else if (secondsAgo < 3600) {
            const minutes = Math.floor(secondsAgo / 60);
            lastUpdatedEl.textContent = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            const hours = Math.floor(secondsAgo / 3600);
            lastUpdatedEl.textContent = `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type (success, info, warning, error)
     * @param {number} duration - Duration in milliseconds
     */
    function showToast(message, type = 'info', duration = 3000) {
        // Check if toast container exists, create if it doesn't
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
            document.body.appendChild(toastContainer);
        }

        // Create toast
        const toast = document.createElement('div');
        
        // Set class based on type
        let typeClass = 'bg-blue-500';
        let icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>';
        
        switch (type) {
            case 'success':
                typeClass = 'bg-green-500';
                icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>';
                break;
            case 'warning':
                typeClass = 'bg-yellow-500';
                icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>';
                break;
            case 'error':
                typeClass = 'bg-red-500';
                icon = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>';
                break;
        }

        toast.className = `${typeClass} text-white px-4 py-3 rounded shadow-lg flex items-center transform transition-all duration-300 translate-x-0`;
        toast.innerHTML = `
            ${icon}
            <span>${message}</span>
            <button class="ml-4 text-white hover:text-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
        `;

        // Add to container
        toastContainer.appendChild(toast);

        // Auto-remove after duration
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-x-1');
            setTimeout(() => toast.remove(), 300);
        }, duration);

        // Click to remove
        toast.querySelector('button').addEventListener('click', () => {
            toast.classList.add('opacity-0', 'translate-x-1');
            setTimeout(() => toast.remove(), 300);
        });
    }

    /**
     * Check memory usage and optimize if needed
     */
    function checkMemoryUsage() {
        if (window.performance && window.performance.memory) {
            const memoryInfo = window.performance.memory;
            const usedHeapSize = memoryInfo.usedJSHeapSize;
            const totalHeapSize = memoryInfo.totalJSHeapSize;
            const usageRatio = usedHeapSize / totalHeapSize;

            console.debug(`Memory usage: ${Math.round(usageRatio * 100)}% (${Math.round(usedHeapSize / 1048576)}MB / ${Math.round(totalHeapSize / 1048576)}MB)`);

            // If memory usage is high, perform cleanup
            if (usageRatio > 0.7) {
                console.warn(`High memory usage detected: ${Math.round(usageRatio * 100)}%`);

                // Clear any excessive cached data
                if (games.length > 20) {
                    games = games.slice(0, 20); // Keep only the 20 most recent games
                }

                // Force garbage collection in supported browsers
                if (window.gc) {
                    window.gc();
                }
            }
        }
    }
})();