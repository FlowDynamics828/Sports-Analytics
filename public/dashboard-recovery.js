/**
 * dashboard-recovery.js - Helps recover from dashboard loading errors
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard recovery script loaded');
    
    // Set a maximum loading time
    const MAX_LOADING_TIME = 10000; // 10 seconds
    
    // Reference to loading overlay
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = loadingOverlay ? loadingOverlay.querySelector('.text-xl') : null;
    
    // Handle uncaught errors
    window.addEventListener('error', function(event) {
        console.error('Dashboard error caught:', event.error);
        displayErrorAndAttemptRecovery(event.error);
        
        // Prevent default error handling
        event.preventDefault();
    });
    
    // Set timeout for loading
    const loadingTimeout = setTimeout(function() {
        if (loadingOverlay && loadingOverlay.style.display !== 'none' && 
            loadingOverlay.style.opacity !== '0') {
            console.warn('Dashboard loading timed out after', MAX_LOADING_TIME, 'ms');
            displayErrorAndAttemptRecovery(new Error('Loading timed out'));
        }
    }, MAX_LOADING_TIME);
    
    // Function to display error and attempt recovery
    function displayErrorAndAttemptRecovery(error) {
        console.log('Attempting dashboard recovery');
        
        // Update loading message
        if (loadingText) {
            loadingText.textContent = 'Error loading dashboard. Attempting to recover...';
            loadingText.classList.add('text-yellow-500');
        }
        
        // Try to hide loading overlay after a short delay
        setTimeout(function() {
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 500);
            }
            
            // Initialize dashboard tabs manually
            initializeDashboardTabs();
            
            // Show toast message
            showToast('Dashboard recovered in offline mode', 'warning');
            
            // Update connection status
            updateConnectionStatus('offline');
        }, 2000);
    }
    
    // Initialize dashboard tabs
    function initializeDashboardTabs() {
        const tabButtons = document.querySelectorAll('.dashboard-tab-button');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const tabId = this.getAttribute('data-tab');
                
                // Hide all tabs
                document.querySelectorAll('.dashboard-tab').forEach(tab => {
                    tab.classList.add('hidden');
                });
                
                // Show selected tab
                const selectedTab = document.getElementById(tabId);
                if (selectedTab) {
                    selectedTab.classList.remove('hidden');
                }
                
                // Update active button styles
                tabButtons.forEach(btn => {
                    btn.classList.remove('text-blue-500');
                    btn.classList.add('text-gray-400');
                });
                
                this.classList.add('text-blue-500');
                this.classList.remove('text-gray-400');
                
                // Update section title
                const sectionTitle = document.getElementById('dashboard-section-title');
                if (sectionTitle) {
                    sectionTitle.textContent = getTabTitle(tabId);
                }
            });
        });
    }
    
    // Get tab title based on tab ID
    function getTabTitle(tabId) {
        switch (tabId) {
            case 'dashboardOverview': return 'Overview';
            case 'dashboardTeams': return 'Teams';
            case 'dashboardPlayers': return 'Players';
            case 'dashboardPredictions': return 'Predictions';
            case 'dashboardFixtures': return 'Fixtures';
            case 'dashboardLive': return 'Live Games';
            case 'dashboardCharts': return 'Charts';
            case 'dashboardInsights': return 'Insights';
            case 'dashboardReports': return 'Reports';
            default: return 'Dashboard';
        }
    }
    
    // Function to show toast notification
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = message;
        
        toastContainer.appendChild(toast);
        
        // Remove toast after 5 seconds
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 5000);
    }
    
    // Update connection status indicator
    function updateConnectionStatus(status) {
        const connectionStatus = document.getElementById('connectionStatus');
        const connectionText = document.getElementById('connectionText');
        
        if (connectionStatus && connectionText) {
            switch (status) {
                case 'online':
                    connectionStatus.className = 'text-green-500 mr-2';
                    connectionText.textContent = 'Connected';
                    break;
                case 'connecting':
                    connectionStatus.className = 'text-yellow-500 mr-2';
                    connectionText.textContent = 'Connecting...';
                    break;
                case 'offline':
                    connectionStatus.className = 'text-red-500 mr-2';
                    connectionText.textContent = 'Offline Mode';
                    break;
                default:
                    connectionStatus.className = 'text-gray-500 mr-2';
                    connectionText.textContent = 'Unknown';
            }
        }
    }
});