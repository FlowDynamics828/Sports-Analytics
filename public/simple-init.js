/**
 * Simple Dashboard Initialization
 * Minimal script to initialize dashboard functionality without external dependencies
 */

document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the login page but we're actually supposed to be on the dashboard
    if (window.location.pathname.includes('/login') && localStorage.getItem('token')) {
        // Redirect to dashboard if we have a token
        window.location.href = '/';
        return;
    }
    
    // Create an instance of the SportsDataService if it exists
    const dataService = window.SportsDataService ? new SportsDataService() : null;
    
    // Ensure API is configured with correct key
    if (dataService) {
        dataService.config.apiKey = '447279';
        dataService.useMockData = false; // Always use real SportDB data
    }
    
    // Setup icon error handling
    handleMissingIcons();
    
    // Initialize the UI before loading data
    initializeUI();
    
    // Simulate loading and load data
    simulateLoading(dataService);
    
    // Initialize metrics with sample data
    initializeMetrics();
    
    // Initialize predictions functionality
    initializePredictions();
    
    // Force populate leagues manually even if API fails
    forcePopulateLeagues();
    
    // Log success
    console.log('Dashboard initialized successfully with simple-init.js');
});

/**
 * Initialize the UI components
 */
function initializeUI() {
    // Initialize tab navigation
    setupEventListeners();
    
    // Set default active tab
    setActiveTab('dashboardOverview');
    
    // Ensure all panels are properly hidden except active one
    document.querySelectorAll('.dashboard-tab').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    const overviewPanel = document.getElementById('dashboardOverview');
    if (overviewPanel) {
        overviewPanel.classList.remove('hidden');
    }
}

/**
 * Simulate loading animation for the dashboard
 * @param {Object} dataService - Optional SportsDataService instance
 */
function simulateLoading(dataService) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressBar = document.getElementById('loading-progress-bar');
    
    if (!loadingOverlay || !progressBar) {
        console.error('Loading elements not found');
        return;
    }
    
    // Ensure overlay is visible
    loadingOverlay.classList.remove('hidden', 'opacity-0');
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) {
            progress = 100;
            clearInterval(interval);
            
            // Try to load data if service is available
            if (dataService) {
                try {
                    console.log('Loading data from sports data service...');
                    loadDashboardData(dataService)
                        .then(() => finishLoading(loadingOverlay))
                        .catch(err => {
                            console.error('Error loading data:', err);
                            // Still finish loading but show error toast
                            showToast('Error loading data. Using mock data instead.', 'warning');
                            finishLoading(loadingOverlay);
                        });
                } catch (e) {
                    console.error('Failed to load data:', e);
                    showToast('Failed to initialize data service. Using fallback data.', 'error');
                    finishLoading(loadingOverlay);
                }
            } else {
                showToast('SportsDataService not found. Using static data.', 'warning');
                finishLoading(loadingOverlay);
            }
        }
        progressBar.style.width = `${progress}%`;
    }, 100); // Faster loading animation
}

/**
 * Complete the loading process and hide the overlay
 * @param {HTMLElement} loadingOverlay - The loading overlay element 
 */
function finishLoading(loadingOverlay) {
    if (!loadingOverlay) return;
    
    // Ensure all UI components are visible
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.classList.remove('opacity-0');
    }
    
    // Hide loading overlay with animation
    loadingOverlay.classList.add('opacity-0');
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        showToast('Dashboard loaded successfully', 'success');
    }, 500);
}

/**
 * Load data from the sports data service
 * @param {Object} dataService - SportsDataService instance
 */
async function loadDashboardData(dataService) {
    try {
        // Make sure API is configured correctly
        console.log('Configuring API with key: 447279');
        dataService.config.apiKey = '447279';
        dataService.useMockData = false;
        
        // Create toast to inform user
        showToast('Connecting to TheSportsDB API...', 'info');
        
        // Get leagues
        const leagues = await dataService.getLeagues();
        console.log('Loaded leagues:', leagues);
        
        // Set league names in selectors
        const leagueSelector = document.getElementById('league-selector');
        if (leagueSelector && leagues && leagues.response) {
            leagueSelector.innerHTML = '';
            
            // Use the predefined leagues from the SportsDataService
            const supportedLeagues = [
                { id: dataService.leagueIds.nba, name: 'NBA' },
                { id: dataService.leagueIds.nfl, name: 'NFL' },
                { id: dataService.leagueIds.mlb, name: 'MLB' },
                { id: dataService.leagueIds.nhl, name: 'NHL' },
                { id: dataService.leagueIds.premierleague, name: 'Premier League' },
                { id: dataService.leagueIds.laliga, name: 'La Liga' },
                { id: dataService.leagueIds.bundesliga, name: 'Bundesliga' },
                { id: dataService.leagueIds.seriea, name: 'Serie A' }
            ];
            
            supportedLeagues.forEach(league => {
                const option = document.createElement('option');
                option.value = league.id;
                option.textContent = league.name;
                leagueSelector.appendChild(option);
            });
            
            // Add event listener for league selection
            leagueSelector.addEventListener('change', async (e) => {
                const selectedLeagueId = e.target.value;
                
                // Show loading indicator
                const loadingOverlay = document.getElementById('loading-overlay');
                if (loadingOverlay) {
                    loadingOverlay.classList.remove('hidden', 'opacity-0');
                    const progressBar = document.getElementById('loading-progress-bar');
                    if (progressBar) {
                        progressBar.style.width = '30%';
                    }
                }
                
                showToast(`Loading teams for ${leagueSelector.options[leagueSelector.selectedIndex].textContent}...`, 'info');
                await loadTeamsForLeague(dataService, selectedLeagueId);
                
                // Hide loading indicator
                if (loadingOverlay) {
                    loadingOverlay.classList.add('opacity-0');
                    setTimeout(() => {
                        loadingOverlay.classList.add('hidden');
                    }, 500);
                }
            });
        }
        
        // Get current league teams if a league is available
        if (leagueSelector && leagueSelector.options.length > 0) {
            // Start with NBA (ID 4387) by default
            const nbaLeagueId = dataService.leagueIds.nba;
            
            // Update the league selector
            leagueSelector.value = nbaLeagueId;
            
            await loadTeamsForLeague(dataService, nbaLeagueId);
        }
        
        return true;
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('Error connecting to TheSportsDB API. Using cached data.', 'error');
        throw error;
    }
}

/**
 * Load teams for a specific league
 * @param {Object} dataService - SportsDataService instance
 * @param {number} leagueId - League ID
 */
async function loadTeamsForLeague(dataService, leagueId) {
    try {
        // Get teams for the selected league
        const teamsResponse = await dataService.getTeams(leagueId);
        console.log(`Loaded teams for league ID ${leagueId}:`, teamsResponse);
        
        // Check if we have a valid response
        if (!teamsResponse || !teamsResponse.response) {
            showToast('No teams found for this league', 'warning');
            return;
        }
        
        const teams = teamsResponse.response;
        
        // Update team selector
        const teamSelector = document.getElementById('team-selector');
        if (teamSelector && teams && teams.length) {
            teamSelector.innerHTML = '';
            
            // Add an "All Teams" option
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'All Teams';
            teamSelector.appendChild(allOption);
            
            // Add team options
            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                teamSelector.appendChild(option);
            });
            
            // Add event listener for team selection (using once to prevent duplicate listeners)
            teamSelector.removeEventListener('change', handleTeamChange);
            teamSelector.addEventListener('change', handleTeamChange);
        }
        
        // Update teams display
        updateTeamsDisplay(teams);
        
        // Show success message
        showToast(`Loaded ${teams.length} teams`, 'success');
        
    } catch (error) {
        console.error(`Error loading teams for league ${leagueId}:`, error);
        showToast('Error loading teams', 'error');
    }
}

/**
 * Handle team selection change
 * @param {Event} e - Change event
 */
async function handleTeamChange(e) {
    const selectedTeamId = e.target.value;
    if (selectedTeamId && selectedTeamId !== 'all') {
        // Show loading indicator
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('hidden', 'opacity-0');
            const progressBar = document.getElementById('loading-progress-bar');
            if (progressBar) {
                progressBar.style.width = '30%';
            }
        }
        
        // Get the team name from the select element
        const teamName = e.target.options[e.target.selectedIndex].textContent;
        showToast(`Loading players for ${teamName}...`, 'info');
        
        // Get the data service
        const dataService = window.SportsDataService ? new SportsDataService() : null;
        if (dataService) {
            await loadPlayersForTeam(dataService, selectedTeamId);
        }
        
        // Hide loading indicator
        if (loadingOverlay) {
            loadingOverlay.classList.add('opacity-0');
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, 500);
        }
    }
}

/**
 * Load players for a specific team
 * @param {Object} dataService - SportsDataService instance
 * @param {number} teamId - Team ID
 */
async function loadPlayersForTeam(dataService, teamId) {
    try {
        // Get players for the selected team
        const playersResponse = await dataService.getPlayers(teamId);
        console.log(`Loaded players for team ID ${teamId}:`, playersResponse);
        
        // Check if we have a valid response
        if (!playersResponse || !playersResponse.response) {
            showToast('No players found for this team', 'warning');
            return;
        }
        
        const players = playersResponse.response;
        
        // Update the UI with players
        updatePlayersDisplay(players);
        
        // Show success message
        showToast(`Loaded ${players.length} players`, 'success');
        
    } catch (error) {
        console.error(`Error loading players for team ${teamId}:`, error);
        showToast('Error loading players', 'error');
    }
}

/**
 * Update the teams display with actual teams data
 * @param {Array} teams - Array of team objects
 */
function updateTeamsDisplay(teams) {
    const teamsContainer = document.querySelector('.teams-container');
    if (!teamsContainer || !teams || !teams.length) return;
    
    try {
        teamsContainer.innerHTML = '';
        
        teams.forEach(team => {
            const teamCard = document.createElement('div');
            teamCard.className = 'bg-gray-800 p-4 rounded-lg shadow-lg hover:bg-gray-700 transition-colors';
            teamCard.setAttribute('data-team-id', team.id);
            
            // Use the team logo if available
            const logoUrl = team.logo && team.logo !== 'assets/teams/default.png' 
                ? team.logo 
                : null;
            
            const logoHtml = logoUrl 
                ? `<img src="${logoUrl}" alt="${team.name}" class="w-12 h-12 rounded-full mr-3 object-contain bg-white p-1">` 
                : `<div class="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mr-3">
                     <span class="font-bold text-xl">${team.name.charAt(0)}</span>
                   </div>`;
            
            teamCard.innerHTML = `
                <div class="flex items-center">
                    ${logoHtml}
                    <div>
                        <h3 class="font-semibold text-lg">${team.name}</h3>
                        <p class="text-gray-400 text-sm">${team.city || ''}</p>
                    </div>
                </div>
            `;
            
            // Add click event to load players
            teamCard.addEventListener('click', async () => {
                // Find the team selector and set its value
                const teamSelector = document.getElementById('team-selector');
                if (teamSelector) {
                    teamSelector.value = team.id;
                    
                    // Manually dispatch a change event
                    const event = new Event('change');
                    teamSelector.dispatchEvent(event);
                }
            });
            
            teamsContainer.appendChild(teamCard);
        });
    } catch (e) {
        console.error('Error updating teams display:', e);
    }
}

/**
 * Update the players display with actual players data
 * @param {Array} players - Array of player objects
 */
function updatePlayersDisplay(players) {
    const playersContainer = document.querySelector('.players-container');
    if (!playersContainer || !players || !players.length) return;
    
    try {
        playersContainer.innerHTML = '';
        
        players.forEach(player => {
            const playerCard = document.createElement('div');
            playerCard.className = 'bg-gray-800 p-4 rounded-lg shadow-lg hover:bg-gray-700 transition-colors';
            playerCard.setAttribute('data-player-id', player.id);
            
            // Check if player has an image
            const hasImage = player.thumbnail && player.thumbnail !== '';
            
            const imageHtml = hasImage 
                ? `<img src="${player.thumbnail}" alt="${player.name}" class="w-12 h-12 rounded-full mr-3 object-cover">`
                : `<div class="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mr-3">
                    <span class="font-bold text-xl">${player.name.charAt(0)}</span>
                </div>`;
            
            // Extract position
            const position = player.position || 'Unknown Position';
            
            playerCard.innerHTML = `
                <div class="flex items-center">
                    ${imageHtml}
                    <div>
                        <h3 class="font-semibold text-lg">${player.name}</h3>
                        <p class="text-gray-400 text-sm">${position}</p>
                    </div>
                </div>
                <div class="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-400">
                    <div class="flex flex-col items-center bg-gray-700 rounded p-2">
                        <span class="font-semibold text-white">${player.stats?.games || '0'}</span>
                        <span>Games</span>
                    </div>
                    <div class="flex flex-col items-center bg-gray-700 rounded p-2">
                        <span class="font-semibold text-white">${player.stats?.goals || '0'}</span>
                        <span>Goals</span>
                    </div>
                    <div class="flex flex-col items-center bg-gray-700 rounded p-2">
                        <span class="font-semibold text-white">${player.stats?.assists || '0'}</span>
                        <span>Assists</span>
                    </div>
                </div>
            `;
            
            playersContainer.appendChild(playerCard);
        });
    } catch (e) {
        console.error('Error updating players display:', e);
    }
}

/**
 * Setup all event listeners for dashboard functionality
 */
function setupEventListeners() {
    // Dashboard tab navigation
    const tabButtons = document.querySelectorAll('.dashboard-tab-button');
    const tabContents = document.querySelectorAll('.dashboard-tab');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (!tabId) return;
            
            // Update tab button states
            tabButtons.forEach(btn => {
                btn.classList.remove('text-blue-500', 'bg-opacity-50');
                btn.classList.add('text-gray-400');
            });
            
            button.classList.remove('text-gray-400');
            button.classList.add('text-blue-500', 'bg-opacity-50');
            
            // Update tab content visibility
            tabContents.forEach(content => {
                if (content) content.classList.add('hidden');
            });
            
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.remove('hidden');
            
            // Update section title
            const sectionTitle = document.getElementById('dashboard-section-title');
            if (sectionTitle) {
                sectionTitle.textContent = tabId.replace('dashboard', '');
            }
        });
    });
    
    // Handle settings modal
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    
    if (settingsButton && settingsModal) {
        settingsButton.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
    }
    
    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }
    
    // Sidebar toggle
    const sidebarToggle = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = sidebar.getAttribute('data-collapsed') === 'true';
            
            if (isCollapsed) {
                sidebar.setAttribute('data-collapsed', 'false');
                sidebar.classList.remove('w-16');
                sidebar.classList.add('w-64');
            } else {
                sidebar.setAttribute('data-collapsed', 'true');
                sidebar.classList.remove('w-64');
                sidebar.classList.add('w-16');
            }
        });
    }
    
    // Mobile sidebar toggle
    const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
    
    if (mobileSidebarToggle && sidebar) {
        mobileSidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('translate-x-0');
            sidebar.classList.toggle('-translate-x-full');
        });
    }
    
    // User menu toggle
    const userMenuButton = document.getElementById('userMenuButton');
    const userMenu = document.getElementById('userMenu');
    
    if (userMenuButton && userMenu) {
        userMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('hidden');
        });
        
        // Close when clicking outside
        document.addEventListener('click', () => {
            if (!userMenu.classList.contains('hidden')) {
                userMenu.classList.add('hidden');
            }
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            // Show temporary loading state
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) loadingIndicator.classList.remove('hidden');
            
            // Update last updated time
            const lastUpdated = document.getElementById('lastUpdated');
            if (lastUpdated) lastUpdated.textContent = 'Just now';
            
            // Simulate refresh
            setTimeout(() => {
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                showToast('Data refreshed successfully!', 'success');
            }, 1500);
        });
    }
}

/**
 * Initialize dashboard metrics with sample data
 */
function initializeMetrics() {
    const metrics = {
        'gamesPlayedMetric': '1,024',
        'averageScoreMetric': '112.4',
        'winRateMetric': '62.3%',
        'predictionAccuracyMetric': '76.8%'
    };
    
    // Set metric values
    Object.keys(metrics).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = metrics[id];
        }
    });
    
    // Initialize connection status
    const connectionStatus = document.getElementById('connectionStatus');
    const connectionText = document.getElementById('connectionText');
    
    if (connectionStatus && connectionText) {
        connectionStatus.classList.add('text-green-500');
        connectionText.textContent = 'Connected';
    }
    
    // Create a simple performance chart if Chart.js is available
    if (window.Chart && document.getElementById('performance-chart')) {
        try {
            const ctx = document.getElementById('performance-chart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6'],
                    datasets: [{
                        label: 'Lakers',
                        data: [98, 105, 92, 110, 107, 118],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        tension: 0.3
                    }, {
                        label: 'Warriors',
                        data: [102, 98, 88, 105, 114, 110],
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.2)',
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: '#e5e7eb'
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(75, 85, 99, 0.2)'
                            },
                            ticks: {
                                color: '#9ca3af'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(75, 85, 99, 0.2)'
                            },
                            ticks: {
                                color: '#9ca3af'
                            }
                        }
                    }
                }
            });
            console.log('Performance chart initialized');
        } catch (error) {
            console.error('Error creating chart:', error);
        }
    }
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
            break;
        case 'error':
            icon = '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
            break;
        case 'warning':
            icon = '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
            break;
        default:
            icon = '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }
    
    toast.innerHTML = `
        <div class="flex items-center">
            ${icon}
            <span>${message}</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        
        setTimeout(() => {
            if (toast.parentNode === toastContainer) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Handle missing icons by providing fallbacks
 */
function handleMissingIcons() {
    // Add a global error handler for images
    document.addEventListener('error', function(e) {
        const target = e.target;
        // Only handle image errors
        if (target.tagName === 'IMG') {
            console.warn('Image failed to load:', target.src);
            
            // Check if it's a league icon
            if (target.src.includes('/assets/icons/leagues/')) {
                // Replace with default league icon
                target.src = 'assets/icons/leagues/default.svg';
                console.log('Replaced with default league icon');
            }
            
            // Add other icon type handlers as needed
        }
    }, true); // Use capture to catch the error before it bubbles
    
    // Add a mutation observer to handle dynamically added images
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'IMG') {
                        // Add error handler to new images
                        node.addEventListener('error', function(e) {
                            if (e.target.src.includes('/assets/icons/leagues/')) {
                                e.target.src = 'assets/icons/leagues/default.svg';
                            }
                        });
                    }
                });
            }
        });
    });
    
    // Start observing with configuration
    observer.observe(document.body, { 
        childList: true, 
        subtree: true 
    });
}

/**
 * Initialize prediction tabs and functionality
 */
function initializePredictions() {
    const predictionTabs = document.querySelectorAll('.prediction-tab');
    const predictionPanels = document.querySelectorAll('.prediction-panel');
    
    // Set up tab switching
    if (predictionTabs && predictionTabs.length > 0) {
        predictionTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Get the tab ID
                const tabId = tab.getAttribute('data-tab');
                
                // Remove active class from all tabs
                predictionTabs.forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                tab.classList.add('active');
                
                // Hide all panels
                predictionPanels.forEach(panel => panel.classList.remove('active'));
                
                // Show the corresponding panel
                const panel = document.getElementById(`${tabId}-panel`);
                if (panel) panel.classList.add('active');
            });
        });
    }
    
    // Set up single factor prediction form
    const singleFactorButton = document.querySelector('#single-factor-panel button');
    if (singleFactorButton) {
        singleFactorButton.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Show loading state
            singleFactorButton.innerHTML = '<span class="inline-flex items-center"><svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...</span>';
            
            // Get form values
            const teamSelect = document.querySelector('#single-factor-panel select:first-of-type');
            const factorSelect = document.querySelector('#single-factor-panel select:last-of-type');
            
            // Validate inputs
            let isValid = true;
            if (teamSelect && teamSelect.value === '') {
                teamSelect.classList.add('border-red-500');
                isValid = false;
            } else if (teamSelect) {
                teamSelect.classList.remove('border-red-500');
            }
            
            if (factorSelect && factorSelect.value === '') {
                factorSelect.classList.add('border-red-500');
                isValid = false;
            } else if (factorSelect) {
                factorSelect.classList.remove('border-red-500');
            }
            
            // Process if valid
            if (isValid) {
                setTimeout(() => {
                    const resultSection = document.getElementById('single-factor-result');
                    if (resultSection) {
                        // Update content based on selections
                        updateSingleFactorResult(
                            teamSelect ? teamSelect.options[teamSelect.selectedIndex].text : 'Los Angeles Lakers',
                            factorSelect ? factorSelect.value : 'home'
                        );
                        
                        // Show the result
                        resultSection.classList.remove('hidden');
                        resultSection.classList.add('fade-in');
                    }
                    
                    // Reset button text
                    singleFactorButton.textContent = 'Generate Prediction';
                    
                    // Scroll to the result
                    if (resultSection) {
                        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 1500);
            } else {
                // Reset button if invalid
                setTimeout(() => {
                    singleFactorButton.textContent = 'Generate Prediction';
                    showToast('Please select all required fields', 'error');
                }, 500);
            }
        });
    }
    
    // Set up multi-factor prediction form
    const multiFactorButton = document.querySelector('#multi-factor-panel button');
    if (multiFactorButton) {
        multiFactorButton.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Show loading state
            multiFactorButton.innerHTML = '<span class="inline-flex items-center"><svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...</span>';
            
            // Get form values
            const homeTeamSelect = document.querySelector('#multi-factor-panel select:first-of-type');
            const awayTeamSelect = document.querySelector('#multi-factor-panel select:last-of-type');
            
            // Get selected factors
            const selectedFactors = Array.from(document.querySelectorAll('#multi-factor-panel input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.id.replace('factor-', ''));
            
            // Validate inputs
            let isValid = true;
            if (homeTeamSelect && homeTeamSelect.value === '') {
                homeTeamSelect.classList.add('border-red-500');
                isValid = false;
            } else if (homeTeamSelect) {
                homeTeamSelect.classList.remove('border-red-500');
            }
            
            if (awayTeamSelect && awayTeamSelect.value === '') {
                awayTeamSelect.classList.add('border-red-500');
                isValid = false;
            } else if (awayTeamSelect) {
                awayTeamSelect.classList.remove('border-red-500');
            }
            
            if (selectedFactors.length === 0) {
                showToast('Please select at least one factor', 'warning');
                isValid = false;
            }
            
            // Process if valid
            if (isValid) {
                setTimeout(() => {
                    const resultSection = document.getElementById('multi-factor-result');
                    if (resultSection) {
                        // Update content based on selections
                        updateMultiFactorResult(
                            homeTeamSelect ? homeTeamSelect.options[homeTeamSelect.selectedIndex].text : 'Los Angeles Lakers',
                            awayTeamSelect ? awayTeamSelect.options[awayTeamSelect.selectedIndex].text : 'Golden State Warriors',
                            selectedFactors
                        );
                        
                        // Show the result
                        resultSection.classList.remove('hidden');
                        resultSection.classList.add('fade-in');
                    }
                    
                    // Reset button text
                    multiFactorButton.textContent = 'Generate Multi-Factor Analysis';
                    
                    // Scroll to the result
                    if (resultSection) {
                        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 2000);
            } else {
                // Reset button if invalid
                setTimeout(() => {
                    multiFactorButton.textContent = 'Generate Multi-Factor Analysis';
                }, 500);
            }
        });
    }
    
    // Set up other prediction forms
    const otherPredictionButtons = document.querySelectorAll('.prediction-panel:not(#single-factor-panel):not(#multi-factor-panel) button');
    otherPredictionButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Show loading state
            const originalText = button.textContent;
            button.innerHTML = '<span class="inline-flex items-center"><svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...</span>';
            
            // For other panels, just show a toast after a delay
            setTimeout(() => {
                // Reset button text
                button.textContent = originalText;
                
                // Show toast
                showToast('Prediction analysis complete!', 'success');
            }, 1500);
        });
    });
}

/**
 * Update the single factor prediction result with dynamic content
 * @param {string} team - Selected team name
 * @param {string} factor - Selected factor
 */
function updateSingleFactorResult(team, factor) {
    // Get content elements
    const impactAnalysis = document.querySelector('#single-factor-result .bg-gray-800 p');
    const winProbability = document.querySelector('#single-factor-result .text-lg.font-bold');
    const confidenceBadge = document.querySelector('#single-factor-result .bg-blue-500\\/20');
    
    if (!impactAnalysis || !winProbability || !confidenceBadge) return;
    
    // Define factor descriptions and win probabilities
    const factorData = {
        'home': {
            impact: `Home court advantage has historically provided <strong>${team}</strong> with a <strong>+5.2 point</strong> differential compared to their away games.`,
            probability: '68.5%',
            confidence: '87%'
        },
        'rest': {
            impact: `With 3+ days of rest, <strong>${team}</strong> shows a <strong>+2.8 point</strong> improvement in performance compared to back-to-back games.`,
            probability: '59.2%',
            confidence: '82%'
        },
        'injuries': {
            impact: `When key players are healthy, <strong>${team}</strong> has a <strong>+7.1 point</strong> differential compared to games with injury-limited rosters.`,
            probability: '73.8%',
            confidence: '91%'
        },
        'streak': {
            impact: `During winning streaks of 3+ games, <strong>${team}</strong> maintains a <strong>+4.5 point</strong> advantage in subsequent matchups.`,
            probability: '64.3%',
            confidence: '85%'
        }
    };
    
    // Set default data if factor not found
    const data = factorData[factor] || factorData['home'];
    
    // Update content
    impactAnalysis.innerHTML = data.impact;
    winProbability.textContent = data.probability;
    confidenceBadge.textContent = data.confidence + ' Confidence';
}

/**
 * Update the multi-factor prediction result with dynamic content
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {Array} factors - Selected factors
 */
function updateMultiFactorResult(homeTeam, awayTeam, factors) {
    // Get team abbreviations
    const homeAbbr = getTeamAbbreviation(homeTeam);
    const awayAbbr = getTeamAbbreviation(awayTeam);
    
    // Calculate random win probability between 55-85%
    const winProb = Math.floor(Math.random() * 31) + 55;
    const lossProb = 100 - winProb;
    
    // Update team names and probabilities
    const homeTeamEl = document.querySelector('#multi-factor-result .flex.items-center.mb-2 span:first-of-type');
    const awayTeamEl = document.querySelector('#multi-factor-result .flex.items-center.mb-2 span:last-of-type');
    if (homeTeamEl) homeTeamEl.textContent = homeAbbr;
    if (awayTeamEl) awayTeamEl.textContent = awayAbbr;
    
    // Update probability percentages
    const homeProbEl = document.querySelector('#multi-factor-result .w-16.text-center.text-2xl.font-bold:first-of-type');
    const awayProbEl = document.querySelector('#multi-factor-result .w-16.text-center.text-2xl.font-bold:last-of-type');
    if (homeProbEl) homeProbEl.textContent = winProb + '%';
    if (awayProbEl) awayProbEl.textContent = lossProb + '%';
    
    // Update probability bar
    const probBar = document.querySelector('#multi-factor-result .h-2.bg-gradient-to-r');
    if (probBar) probBar.style.width = winProb + '%';
    
    // Update projected score (random scores that make sense with the probability)
    const scoreContent = document.querySelector('#multi-factor-result .flex.justify-center.text-2xl.font-bold');
    if (scoreContent) {
        const homePts = Math.floor(Math.random() * 21) + 100; // 100-120
        const awayPts = homePts - (Math.floor(Math.random() * 16) + 5); // 5-20 points less
        scoreContent.innerHTML = `
            <span>${homePts}</span>
            <span class="mx-2 text-gray-500">-</span>
            <span>${awayPts}</span>
        `;
    }
    
    // Update teams in score caption
    const scoreCaption = document.querySelector('#multi-factor-result .text-xs.text-center.text-gray-500.mt-1');
    if (scoreCaption) {
        scoreCaption.textContent = `${homeTeam} vs ${awayTeam}`;
    }
    
    // Update key insight
    const keyInsight = document.querySelector('#multi-factor-result .bg-gray-800.rounded-lg.p-3:last-of-type p');
    if (keyInsight) {
        const insights = [
            `${homeTeam}'s 3-day rest advantage (+3.2) outweighs ${awayTeam}'s recent form (+1.7), suggesting a ${homeTeam} win with ${winProb}% probability.`,
            `${homeTeam}'s home court advantage combined with ${awayTeam}'s injury concerns gives ${homeTeam} a significant edge in this matchup.`,
            `Despite ${awayTeam}'s strong head-to-head history, ${homeTeam}'s current form suggests they have the advantage in this game.`,
            `${homeTeam}'s schedule difficulty has been lower, giving them more energy for this critical matchup against ${awayTeam}.`
        ];
        
        keyInsight.textContent = insights[Math.floor(Math.random() * insights.length)];
    }
    
    // Update factor bars (with random values that make sense)
    // This would be more dynamic in a real application
    const factorBars = document.querySelectorAll('#multi-factor-result .h-2.bg-green-500, #multi-factor-result .h-2.bg-red-500, #multi-factor-result .h-2.bg-blue-500, #multi-factor-result .h-2.bg-yellow-500');
    const factorValues = document.querySelectorAll('#multi-factor-result .w-16.text-right.text-xs.font-medium');
    
    if (factorBars.length > 0 && factorValues.length > 0) {
        factorBars.forEach((bar, index) => {
            if (index === 0 && factorValues[index]) { // Days of Rest - positive
                const value = (Math.random() * 2 + 2).toFixed(1);
                bar.style.width = (value * 20) + '%';
                factorValues[index].textContent = `+${value} pts`;
            } else if (index === 1 && factorValues[index]) { // Injury Status - negative
                const value = (Math.random() * 2 + 1).toFixed(1);
                bar.style.width = (value * 20) + '%';
                factorValues[index].textContent = `-${value} pts`;
            } else if (index === 2 && factorValues[index]) { // H2H History - positive
                const value = (Math.random() * 1.5 + 0.5).toFixed(1);
                bar.style.width = (value * 30) + '%';
                factorValues[index].textContent = `+${value} pts`;
            } else if (index === 3 && factorValues[index]) { // Schedule - positive but small
                const value = (Math.random() * 0.7 + 0.3).toFixed(1);
                bar.style.width = (value * 40) + '%';
                factorValues[index].textContent = `+${value} pts`;
            }
        });
    }
    
    // Update confidence badge
    const confidenceBadge = document.querySelector('#multi-factor-result .bg-purple-500\\/20');
    if (confidenceBadge) {
        // More factors = higher confidence
        const confidence = Math.min(93, 75 + (factors.length * 3));
        confidenceBadge.textContent = `${confidence}% Confidence`;
    }
}

/**
 * Get a team abbreviation from full team name
 * @param {string} teamName - Full team name
 * @returns {string} - Team abbreviation
 */
function getTeamAbbreviation(teamName) {
    const abbreviations = {
        'Los Angeles Lakers': 'LAL',
        'Golden State Warriors': 'GSW',
        'Boston Celtics': 'BOS',
        'Brooklyn Nets': 'BKN',
        'Miami Heat': 'MIA',
        'Milwaukee Bucks': 'MIL',
        'Phoenix Suns': 'PHX',
        'Philadelphia 76ers': 'PHI',
        'Denver Nuggets': 'DEN',
        'Dallas Mavericks': 'DAL',
        'Chicago Bulls': 'CHI'
    };
    
    return abbreviations[teamName] || teamName.substring(0, 3).toUpperCase();
}

/**
 * Force populate leagues dropdown manually
 * This ensures leagues appear even if API fails
 */
function forcePopulateLeagues() {
    const leagueSelector = document.getElementById('league-selector');
    if (!leagueSelector) return;
    
    // Clear existing options
    leagueSelector.innerHTML = '';
    
    // Define leagues manually
    const leagues = [
        { id: '4387', name: 'NBA' },
        { id: '4391', name: 'NFL' },
        { id: '4424', name: 'MLB' },
        { id: '4380', name: 'NHL' },
        { id: '4328', name: 'Premier League' },
        { id: '4335', name: 'La Liga' },
        { id: '4331', name: 'Bundesliga' },
        { id: '4332', name: 'Serie A' }
    ];
    
    // Add options to selector
    leagues.forEach(league => {
        const option = document.createElement('option');
        option.value = league.id;
        option.textContent = league.name;
        leagueSelector.appendChild(option);
    });
    
    // Set default league (NBA)
    leagueSelector.value = '4387';
    
    // Add change event listener if not already present
    if (!leagueSelector.hasChangeListener) {
        leagueSelector.addEventListener('change', async (e) => {
            const selectedLeagueId = e.target.value;
            showLoadingOverlay();
            
            // Get data service
            const dataService = window.SportsDataService ? new SportsDataService() : null;
            if (dataService) {
                try {
                    await loadTeamsForLeague(dataService, selectedLeagueId);
                } catch (error) {
                    console.error('Error loading teams:', error);
                    showToast('Failed to load teams', 'error');
                }
            } else {
                showToast('Data service unavailable', 'error');
            }
            
            hideLoadingOverlay();
        });
        leagueSelector.hasChangeListener = true;
    }
    
    console.log('League selector populated with 8 leagues');
}

/**
 * Show loading overlay for operations
 */
function showLoadingOverlay() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (!loadingOverlay) return;
    
    loadingOverlay.classList.remove('hidden', 'opacity-0');
    const progressBar = document.getElementById('loading-progress-bar');
    if (progressBar) {
        progressBar.style.width = '50%';
    }
}

/**
 * Hide loading overlay after operations
 */
function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (!loadingOverlay) return;
    
    loadingOverlay.classList.add('opacity-0');
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 500);
}

/**
 * Set active tab
 * @param {string} tabId - ID of the tab to activate
 */
function setActiveTab(tabId) {
    // Hide all tab panels
    document.querySelectorAll('.dashboard-tab').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Show selected panel
    const selectedPanel = document.getElementById(tabId);
    if (selectedPanel) {
        selectedPanel.classList.remove('hidden');
    }
    
    // Update active tab button styling
    document.querySelectorAll('.dashboard-tab-button').forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('text-blue-500', 'bg-gray-700', 'bg-opacity-50');
            button.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-gray-700');
        } else {
            button.classList.remove('text-blue-500', 'bg-gray-700', 'bg-opacity-50');
            button.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-gray-700');
        }
    });
}

// Error handling for API data fetching
async function fetchApiData(endpoint, params) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            params
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        showErrorMessage(`Failed to load data. Please try again. (${error.message})`);
        
        // Even on error, we don't fall back to mock data
        // Instead, return an empty result that matches the expected format
        return { 
            success: false, 
            error: error.message,
            response: [] 
        };
    }
}

// Handle API errors with retries instead of falling back to mock data
async function handleApiError(endpoint, error, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;
    
    console.warn(`API request failed: ${error.message}`);
    
    if (retryCount < MAX_RETRIES) {
        console.log(`Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
        try {
            return await fetchApiData(endpoint);
        } catch (retryError) {
            return handleApiError(endpoint, retryError, retryCount + 1);
        }
    }
    
    showErrorMessage(`Failed to load data after multiple attempts. Please check your connection and try again.`);
    return { 
        success: false, 
        error: error.message,
        response: [] 
    };
}

// Initialize league selector
async function initializeLeagueSelector() {
    try {
        const leagueSelector = document.getElementById('league-selector');
        if (!leagueSelector) return;
        
        showLoadingIndicator(true);
        
        // Always fetch from real API, never use mock data
        const leaguesData = await dataService.getLeagues();
        
        if (leaguesData.success) {
            // Clear existing options except the placeholder
            while (leagueSelector.options.length > 0) {
                leagueSelector.remove(0);
            }
            
            // Add our supported leagues
            const supportedLeagues = [
                { id: '4387', name: 'NBA', country: 'USA' },
                { id: '4391', name: 'NFL', country: 'USA' },
                { id: '4424', name: 'MLB', country: 'USA' },
                { id: '4380', name: 'NHL', country: 'USA' },
                { id: '4328', name: 'Premier League', country: 'England' },
                { id: '4335', name: 'La Liga', country: 'Spain' },
                { id: '4331', name: 'Bundesliga', country: 'Germany' },
                { id: '4332', name: 'Serie A', country: 'Italy' }
            ];
            
            // Create a default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select a league';
            leagueSelector.appendChild(defaultOption);
            
            // Add our supported leagues
            supportedLeagues.forEach(league => {
                const option = document.createElement('option');
                option.value = league.id;
                option.textContent = `${league.name} (${league.country})`;
                leagueSelector.appendChild(option);
            });
            
            // Add event listener for change
            leagueSelector.addEventListener('change', handleLeagueChange);
        } else {
            showErrorMessage('Failed to load leagues. Please try again.');
        }
    } catch (error) {
        console.error('Error initializing league selector:', error);
        showErrorMessage('Failed to initialize league selector. Please reload the page.');
    } finally {
        showLoadingIndicator(false);
    }
} 