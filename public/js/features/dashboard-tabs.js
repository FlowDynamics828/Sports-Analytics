/**
 * Dashboard Tabs Script
 * Handles tab switching in the dashboard UI and ensures data synchronization between tabs
 */

// Add TypeScript interface for window object
// @ts-ignore
window.dashboardTabs = window.dashboardTabs || {};

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tabs functionality
    initTabs();
    
    // Initialize tab sync
    initTabSync();
});

/**
 * Initialize tabs functionality
 */
function initTabs() {
    // Find all tab buttons
    const tabButtons = document.querySelectorAll('.dashboard-tab-button');
    
    // Exit if no tab buttons found
    if (!tabButtons.length) {
        console.warn('No dashboard tab buttons found');
        return;
    }
    
    // Add click listeners to all tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            const tabId = this.getAttribute('data-tab');
            if (tabId) {
                switchToTab(tabId);
                
                // Store last active tab in localStorage
                localStorage.setItem('lastActiveTab', tabId);
                
                // Dispatch event for other components
                document.dispatchEvent(new CustomEvent('tabChanged', {
                    detail: { tabId }
                }));
            }
        });
    });
    
    // Show the last active tab or default to first tab
    const lastActiveTab = localStorage.getItem('lastActiveTab');
    if (lastActiveTab) {
        switchToTab(lastActiveTab);
    } else {
        // Default to first tab
        const firstTabButton = tabButtons[0];
        if (firstTabButton) {
            const firstTabId = firstTabButton.getAttribute('data-tab');
            if (firstTabId) {
                switchToTab(firstTabId);
            }
        }
    }
}

/**
 * Switch to the specified tab
 * @param {string} tabId - ID of the tab to switch to
 */
function switchToTab(tabId) {
    console.log(`Switching to tab: ${tabId}`);
    
    // Find all tab sections
    const tabSections = document.querySelectorAll('.dashboard-tab');
    
    // Hide all tab sections
    tabSections.forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show the selected tab section
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
    } else {
        console.warn(`Tab section with ID "${tabId}" not found`);
    }
    
    // Update active state of tab buttons
    const tabButtons = document.querySelectorAll('.dashboard-tab-button');
    tabButtons.forEach(button => {
        // Remove active classes from all buttons
        button.classList.remove('text-blue-500', 'border-blue-500');
        button.classList.add('text-gray-400', 'border-transparent');
        
        // Add active classes to the selected button
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.remove('text-gray-400', 'border-transparent');
            button.classList.add('text-blue-500', 'border-blue-500');
        }
    });
    
    // Special handling for player stats tab
    if (tabId === 'playerStatsSection') {
        refreshPlayerData();
    }
}

/**
 * Refresh player data when switching to player stats tab
 */
function refreshPlayerData() {
    // Get current selections
    const selectedLeague = localStorage.getItem('selectedLeague') || 'nba';
    const selectedTeam = localStorage.getItem('selectedTeam') || '';
    
    // Update league selector in player stats
    const leagueSelector = document.getElementById('playerStatsLeagueSelector');
    if (leagueSelector && leagueSelector instanceof HTMLSelectElement) {
        leagueSelector.value = selectedLeague;
    }
    
    // Update team selector in player stats
    const teamSelector = document.getElementById('playerStatsTeamSelector');
    if (teamSelector && teamSelector instanceof HTMLSelectElement && selectedTeam) {
        teamSelector.value = selectedTeam;
        
        // Trigger player load if a team is selected
        if (selectedTeam) {
            // Create and dispatch change event
            const event = new Event('change');
            teamSelector.dispatchEvent(event);
        }
    }
}

/**
 * Initialize tab synchronization
 */
function initTabSync() {
    // Add listener to leagueChanged event
    document.addEventListener('leagueChanged', function(e) {
        // Make sure we have the event detail
        if (!e.detail || !e.detail.league) return;
        
        // Update league selector in player stats
        const leagueSelector = document.getElementById('playerStatsLeagueSelector');
        if (leagueSelector && leagueSelector instanceof HTMLSelectElement) {
            leagueSelector.value = e.detail.league;
        }
    });
    
    // Add listener to teamChanged event
    document.addEventListener('teamChanged', function(e) {
        // Make sure we have the event detail
        if (!e.detail || e.detail.teamId === undefined) return;
        
        // Update team selector in player stats
        const teamSelector = document.getElementById('playerStatsTeamSelector');
        if (teamSelector && teamSelector instanceof HTMLSelectElement) {
            teamSelector.value = e.detail.teamId;
        }
    });
    
    // Add listeners to the player stats specific selectors
    const playerStatsLeagueSelector = document.getElementById('playerStatsLeagueSelector');
    if (playerStatsLeagueSelector && playerStatsLeagueSelector instanceof HTMLSelectElement) {
        playerStatsLeagueSelector.addEventListener('change', function(e) {
            if (e.target instanceof HTMLSelectElement) {
                const league = e.target.value;
                localStorage.setItem('selectedLeague', league);
                
                // Notify other components about the league change
                document.dispatchEvent(new CustomEvent('leagueChanged', {
                    detail: { league }
                }));
                
                // Clear team selection when league changes
                const teamSelector = document.getElementById('playerStatsTeamSelector');
                if (teamSelector && teamSelector instanceof HTMLSelectElement) {
                    teamSelector.value = '';
                    localStorage.setItem('selectedTeam', '');
                    
                    // Clear player content
                    const playerStatsContent = document.getElementById('playerStatsContent');
                    if (playerStatsContent) {
                        playerStatsContent.innerHTML = '<div class="text-center py-6 text-gray-500">Select a team to view player stats</div>';
                    }
                    
                    // Clear player dropdown
                    const playerSelect = document.getElementById('playerSelect');
                    if (playerSelect && playerSelect instanceof HTMLSelectElement) {
                        // Clear except first option
                        while (playerSelect.options.length > 1) {
                            playerSelect.remove(1);
                        }
                        playerSelect.disabled = true;
                    }
                    
                    // Notify other components about team change
                    document.dispatchEvent(new CustomEvent('teamChanged', {
                        detail: { teamId: '' }
                    }));
                }
            }
        });
    }
}

// Make switchToTab available globally
window.switchToTab = switchToTab;

/**
 * Public API for switching tabs programmatically
 */
// Define the dashboardTabs object in the global scope
window.dashboardTabs = {
    switchToTab: function(tabId) {
        const tabButton = document.querySelector(`[data-tab="${tabId}"]`);
        if (tabButton) {
            switchToTab(tabId);
        }
    }
}; 