// dashboard-scripts.js - Vanilla JavaScript implementation for better performance

document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let games = [];
    let selectedLeague = 'nba';
    let isLoading = true;
    let chart = null;

    // DOM elements
    const leagueSelector = document.getElementById('leagueSelector');
    const recentGamesContainer = document.getElementById('recentGames');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const chartContainer = document.getElementById('chartContainer');
    const connectionStatus = document.getElementById('connectionStatus');

    // Initialize the dashboard
    initDashboard();

    // Event listeners
    if (leagueSelector) {
        leagueSelector.addEventListener('change', function(e) {
            selectedLeague = e.target.value;
            fetchData();
        });
    }

    // Initialize dashboard
    function initDashboard() {
        updateConnectionStatus('connecting');
        fetchData();

        // Set up periodic data refresh (every 60 seconds)
        setInterval(fetchData, 60000);

        // Set up memory usage monitoring
        if (window.performance && window.performance.memory) {
            setInterval(checkMemoryUsage, 30000);
        }
    }

    // Fetch data from API
    function fetchData() {
        isLoading = true;
        updateUI();

        fetch(`/api/games/${selectedLeague}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
                'Cache-Control': 'no-cache'
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
            updateUI();
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            updateConnectionStatus('error');
            isLoading = false;
            games = [];
            updateUI();
        });
    }

    // Update UI with current data
    function updateUI() {
        // Update loading state
        if (loadingIndicator) {
            loadingIndicator.style.display = isLoading ? 'block' : 'none';
        }

        // Update recent games
        if (recentGamesContainer) {
            if (isLoading) {
                recentGamesContainer.innerHTML = '<div class="text-center p-4">Loading...</div>';
            } else if (games.length === 0) {
                recentGamesContainer.innerHTML = '<div class="text-center p-4">No recent games found</div>';
            } else {
                recentGamesContainer.innerHTML = '';

                // Only show up to 5 games to avoid excessive DOM operations
                const gamesToShow = games.slice(0, 5);

                gamesToShow.forEach(game => {
                    const gameElement = document.createElement('div');
                    gameElement.className = 'bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors mb-4';

                    const gameDate = new Date(game.date).toLocaleDateString();

                    gameElement.innerHTML = `
                        <div class="flex justify-between items-center">
                            <div class="text-lg">
                                <div class="font-bold">${game.homeTeam?.name || 'Home Team'}</div>
                                <div class="text-2xl">${game.homeTeam?.score || '0'}</div>
                            </div>
                            <div class="text-gray-400 mx-4">VS</div>
                            <div class="text-lg text-right">
                                <div class="font-bold">${game.awayTeam?.name || 'Away Team'}</div>
                                <div class="text-2xl">${game.awayTeam?.score || '0'}</div>
                            </div>
                        </div>
                        <div class="text-sm text-gray-400 mt-2">${gameDate}</div>
                    `;

                    recentGamesContainer.appendChild(gameElement);
                });
            }
        }

        // Update chart
        if (chartContainer && games.length > 0) {
            updateChart();
        }
    }

    // Update chart with current data
    function updateChart() {
        // Use a lightweight chart library or simple canvas drawing
        // This is a placeholder - implement with your preferred charting library
        chartContainer.innerHTML = `
            <div class="p-4 text-center">
                <p>Chart data ready with ${games.length} games</p>
                <p class="text-sm text-gray-400">Implement with your preferred charting library</p>
            </div>
        `;
    }

    // Update connection status indicator
    function updateConnectionStatus(status) {
        if (!connectionStatus) return;

        const statusDot = connectionStatus.querySelector('.status-dot');
        const statusText = connectionStatus.querySelector('.status-text');

        if (statusDot && statusText) {
            statusDot.className = 'status-dot';

            switch(status) {
                case 'connected':
                    statusDot.classList.add('status-connected');
                    statusText.textContent = 'Connected';
                    break;
                case 'disconnected':
                    statusDot.classList.add('status-disconnected');
                    statusText.textContent = 'Disconnected';
                    break;
                case 'error':
                    statusDot.classList.add('status-error');
                    statusText.textContent = 'Connection Error';
                    break;
                case 'connecting':
                    statusDot.classList.add('status-error');
                    statusText.textContent = 'Connecting...';
                    break;
                default:
                    statusDot.classList.add('status-disconnected');
                    statusText.textContent = 'Unknown Status';
            }
        }
    }

    // Check memory usage and optimize if needed
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

                // Clear any cached data
                games = games.slice(0, 10); // Keep only the 10 most recent games

                // Force garbage collection in supported browsers
                if (window.gc) {
                    window.gc();
                }
            }
        }
    }
});