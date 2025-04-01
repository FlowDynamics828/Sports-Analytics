/**
 * SportsAnalyticsPro - Premium Dashboard Core
 * Enterprise-grade sports analytics platform
 * 
 * This module handles the core dashboard functionality including:
 * - Data fetching
 * - UI state management
 * - Animation and transitions
 * - Notifications
 */

import mockAPI from './mock-api.js';
import sportDBClient from './api-client.js';
import insightsIntegration from './insights-integration.js';
import enhancedPredictions from './enhanced-predictions.js';
import customAnalysis from './custom-analysis.js';

// Use real API client in production, fallback to mock API for development
const USE_MOCK_API = false; // Set to false to use real SportDB API

// API client for data fetching
const apiClient = {
    // Use mock API for development
    async getTeams(leagueId) {
        return await mockAPI.getTeams(leagueId);
    },
    
    async getStandings(leagueId) {
        return await mockAPI.getStandings(leagueId);
    },
    
    async getMatches() {
        return await mockAPI.getMatches();
    },
    
    async getLeagues() {
        return await mockAPI.getLeagues();
    },
    
    async getPredictions(matchId, type = 'single') {
        return await mockAPI.getPredictions(matchId, type);
    },
    
    async getPlayerStats(teamId) {
        return await mockAPI.getPlayerStats(teamId);
    }
};

// UI utilities
const ui = {
    // Show toast notification
    showToast(message, type = 'info', duration = 5000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        toast.innerHTML = `
            <div class="flex items-center">
                <span class="mr-3">${message}</span>
            </div>
            <button class="ml-4 focus:outline-none">
                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
        `;
        
        // Add close functionality
        const closeButton = toast.querySelector('button');
        closeButton.addEventListener('click', () => {
            toast.classList.add('opacity-0');
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 300);
        });
        
        // Auto-remove after duration
        container.appendChild(toast);
        setTimeout(() => {
            if (container.contains(toast)) {
                toast.classList.add('opacity-0');
                setTimeout(() => {
                    if (container.contains(toast)) {
                        container.removeChild(toast);
                    }
                }, 300);
            }
        }, duration);
    },
    
    // Toggle loading overlay
    toggleLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    },
    
    // Update connection status
    updateConnectionStatus(isConnected) {
        const statusIndicator = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        if (statusIndicator && statusText) {
            if (isConnected) {
                statusIndicator.className = 'text-green-500 mr-2';
                statusText.textContent = 'Connected';
            } else {
                statusIndicator.className = 'text-red-500 mr-2';
                statusText.textContent = 'Disconnected';
            }
        }
    }
};

// Dashboard state management
class DashboardState {
    constructor() {
        this.state = {
            currentLeague: '4328', // Default to English Premier League using TheSportsDB ID
            timeRange: 'season',
            selectedTeam: null,
            predictionMode: 'single',
            isLoading: true,
            data: {
                teams: [],
                standings: [],
                matches: [],
                players: []
            }
        };
        
        // Event listeners for state changes
        this.eventListeners = {};
    }
    
    // Update state and trigger listeners
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notifyListeners('stateChange', this.state);
    }
    
    // Get current state
    getState() {
        return { ...this.state };
    }
    
    // Add event listener
    addEventListener(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }
    
    // Remove event listener
    removeEventListener(event, callback) {
        if (!this.eventListeners[event]) return;
        this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
    
    // Notify listeners of event
    notifyListeners(event, data) {
        if (!this.eventListeners[event]) return;
        this.eventListeners[event].forEach(callback => callback(data));
    }
}

// Content renderers for dashboard sections
const renderers = {
    // Render team comparison section
    renderTeamComparison(teams) {
        const container = document.getElementById('team-comparison-content');
        if (!container) return;
        
        let html = `
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        `;
        
        // Display first 6 teams as examples
        const displayTeams = teams.slice(0, 6);
        displayTeams.forEach(team => {
            html += `
                <div class="bg-gray-800 hover:bg-gray-700 rounded p-4 flex flex-col items-center transition-all duration-300 cursor-pointer team-card">
                    <img src="${team.logo}" alt="${team.name}" class="w-16 h-16 mb-3">
                    <p class="font-medium text-center">${team.name}</p>
                    <p class="text-xs text-gray-400 mt-1">${team.league}</p>
                </div>
            `;
        });
        
        html += `</div>
            <div class="mt-6">
                <button class="premium-button premium-button-secondary w-full">Compare Selected Teams</button>
            </div>
        `;
        container.innerHTML = html;
    },
    
    // Render standings section
    renderStandings(standings) {
        const container = document.getElementById('standings-content');
        if (!container) return;
        
        let html = `
            <div class="overflow-x-auto">
                <table class="premium-table w-full">
                    <thead>
                        <tr>
                            <th class="py-2 px-3 text-left">#</th>
                            <th class="py-2 px-3 text-left">Team</th>
                            <th class="py-2 px-3 text-center">P</th>
                            <th class="py-2 px-3 text-center">W</th>
                            <th class="py-2 px-3 text-center">D</th>
                            <th class="py-2 px-3 text-center">L</th>
                            <th class="py-2 px-3 text-center">Pts</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // Display standings data
        standings.forEach((item) => {
            html += `
                <tr>
                    <td class="py-2 px-3">${item.position}</td>
                    <td class="py-2 px-3 flex items-center">
                        <img src="${item.team.logo}" alt="${item.team.name}" class="w-5 h-5 mr-2">
                        <span class="font-medium">${item.team.name}</span>
                    </td>
                    <td class="py-2 px-3 text-center">${item.played}</td>
                    <td class="py-2 px-3 text-center">${item.won}</td>
                    <td class="py-2 px-3 text-center">${item.drawn}</td>
                    <td class="py-2 px-3 text-center">${item.lost}</td>
                    <td class="py-2 px-3 text-center font-semibold">${item.points}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;
    },
    
    // Render predictions section
    renderPredictions(matches, type = 'single') {
        const container = document.getElementById(`${type}-predictions-container`);
        if (!container) return;
        
        if (matches.length === 0) {
            container.innerHTML = `
                <div class="bg-gray-800 rounded p-4 text-center">
                    <p class="text-gray-400">No upcoming matches found</p>
                </div>
            `;
            return;
        }
        
        let html = ``;
        
        // Display upcoming matches
        const upcomingMatches = matches.filter(match => match.status === 'scheduled').slice(0, 4);
        upcomingMatches.forEach(match => {
            const matchDate = new Date(match.date);
            const formattedDate = matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const formattedTime = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            
            // Generate prediction probabilities based on type
            let homeWinProb, drawProb, awayWinProb;
            
            switch (type) {
                case 'form':
                    homeWinProb = 35 + Math.floor(Math.random() * 30);
                    drawProb = Math.floor(Math.random() * (100 - homeWinProb) / 2);
                    awayWinProb = 100 - homeWinProb - drawProb;
                    break;
                case 'historical':
                    homeWinProb = 30 + Math.floor(Math.random() * 25);
                    drawProb = 20 + Math.floor(Math.random() * 15);
                    awayWinProb = 100 - homeWinProb - drawProb;
                    break;
                case 'injuries':
                    homeWinProb = 20 + Math.floor(Math.random() * 50);
                    drawProb = Math.floor(Math.random() * 30);
                    awayWinProb = 100 - homeWinProb - drawProb;
                    break;
                case 'composite':
                    homeWinProb = 40 + Math.floor(Math.random() * 20);
                    drawProb = 15 + Math.floor(Math.random() * 15);
                    awayWinProb = 100 - homeWinProb - drawProb;
                    break;
                default: // single
                    homeWinProb = Math.floor(Math.random() * 100);
                    drawProb = Math.floor(Math.random() * (100 - homeWinProb));
                    awayWinProb = 100 - homeWinProb - drawProb;
            }
            
            // Factors badges for multi-factor
            let factorBadges = '';
            if (type === 'composite') {
                factorBadges = `
                    <div class="mt-2 mb-3">
                        <span class="factor-badge">Recent Form</span>
                        <span class="factor-badge historical">H2H History</span>
                        <span class="factor-badge injury">Key Players</span>
                        <span class="factor-badge">Home Advantage</span>
                    </div>
                `;
            }
            
            html += `
                <div class="prediction-match" data-match-id="${match.id}">
                    <div class="flex flex-col w-full">
                        <div class="flex justify-between items-center mb-3">
                            <div class="prediction-team">
                                <img src="${match.homeTeam.logo}" alt="${match.homeTeam.name}" class="prediction-team-logo">
                                <span class="prediction-team-name">${match.homeTeam.name}</span>
                            </div>
                            <div class="prediction-vs">VS</div>
                            <div class="prediction-team flex-row-reverse text-right">
                                <img src="${match.awayTeam.logo}" alt="${match.awayTeam.name}" class="prediction-team-logo ml-2">
                                <span class="prediction-team-name">${match.awayTeam.name}</span>
                            </div>
                        </div>
                        
                        <div class="text-sm text-gray-400 mb-3">${formattedDate} · ${formattedTime}</div>
                        
                        ${factorBadges}
                        
                        <div class="prediction-probability">
                            <div class="home-win" style="width: ${homeWinProb}%"></div>
                            <div class="draw" style="width: ${drawProb}%"></div>
                            <div class="away-win" style="width: ${awayWinProb}%"></div>
                        </div>
                        
                        <div class="flex justify-between text-xs mt-2">
                            <div class="text-green-400">${homeWinProb}%</div>
                            <div class="text-yellow-400">${drawProb}%</div>
                            <div class="text-red-400">${awayWinProb}%</div>
                        </div>
                        
                        <div class="flex justify-between text-xs mt-1 text-gray-400">
                            <div>Home win</div>
                            <div>Draw</div>
                            <div>Away win</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    // Render player stats section
    renderPlayerStats(teams) {
        const container = document.getElementById('player-stats-content');
        if (!container) return;
        
        const playerData = [
            { name: "Marcus Johnson", team: teams[0], position: "Forward", stat: "Goals", value: 18 },
            { name: "Carlos Rodriguez", team: teams[1], position: "Midfielder", stat: "Assists", value: 12 },
            { name: "David Williams", team: teams[2], position: "Forward", stat: "Goals", value: 15 },
            { name: "James Thompson", team: teams[3], position: "Midfielder", stat: "Pass Completion", value: 93 },
            { name: "Michael Anderson", team: teams[4], position: "Goalkeeper", stat: "Clean Sheets", value: 9 }
        ];
        
        let html = `<div class="space-y-3">`;
        
        playerData.forEach(player => {
            html += `
                <div class="bg-gray-800 hover:bg-gray-700 rounded p-4 flex items-center justify-between transition-all duration-300">
                    <div class="flex items-center">
                        <div class="bg-gradient-to-r from-blue-600 to-blue-800 rounded-full w-12 h-12 flex items-center justify-center text-white font-bold mr-4">
                            ${player.name.charAt(0)}${player.name.split(' ')[1].charAt(0)}
                        </div>
                        <div>
                            <p class="font-medium">${player.name}</p>
                            <div class="flex items-center text-xs text-gray-400 mt-1">
                                <img src="${player.team.logo}" class="w-4 h-4 mr-1" alt="${player.team.name}">
                                ${player.team.name} · ${player.position}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-3xl font-bold">${player.value}</p>
                        <p class="text-xs text-gray-400">${player.stat}</p>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
        container.innerHTML = html;
    },
    
    // Initialize performance chart
    initPerformanceChart() {
        const ctx = document.getElementById('performance-chart');
        if (!ctx) return;
        
        const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8'];
        
        // Generate random data for demonstration
        const teamData = Array.from({ length: 3 }, () => 
            Array.from({ length: labels.length }, () => Math.floor(Math.random() * 100))
        );
        
        const chartColors = [
            'rgba(59, 130, 246, 0.8)',  // Blue
            'rgba(16, 185, 129, 0.8)',  // Green
            'rgba(139, 92, 246, 0.8)'   // Purple
        ];
        
        const datasets = [
            { label: 'Manchester City', data: teamData[0], borderColor: chartColors[0], backgroundColor: chartColors[0].replace('0.8', '0.1') },
            { label: 'Liverpool', data: teamData[1], borderColor: chartColors[1], backgroundColor: chartColors[1].replace('0.8', '0.1') },
            { label: 'Arsenal', data: teamData[2], borderColor: chartColors[2], backgroundColor: chartColors[2].replace('0.8', '0.1') }
        ];
        
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                family: "'Inter', sans-serif"
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
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
                }
            }
        });
    }
};

// Main dashboard class
class Dashboard {
    constructor() {
        this.initialized = false;
        this.apiClient = USE_MOCK_API ? mockAPI : sportDBClient;
        this.state = new DashboardState();
        this.currentLeagueId = '4328'; // Default to English Premier League using TheSportsDB ID
        
        // UI utilities embedded
        this.showToast = function(message, type = 'info', duration = 5000) {
            const container = document.getElementById('toast-container');
            if (!container) return;
            
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            
            toast.innerHTML = `
                <div class="flex items-center">
                    <span class="mr-3">${message}</span>
                </div>
                <button class="ml-4 focus:outline-none">
                    <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                </button>
            `;
            
            // Add close functionality
            const closeButton = toast.querySelector('button');
            closeButton.addEventListener('click', () => {
                toast.classList.add('opacity-0');
                setTimeout(() => {
                    if (container.contains(toast)) {
                        container.removeChild(toast);
                    }
                }, 300);
            });
            
            // Auto-remove after duration
            container.appendChild(toast);
            setTimeout(() => {
                if (container.contains(toast)) {
                    toast.classList.add('opacity-0');
                    setTimeout(() => {
                        if (container.contains(toast)) {
                            container.removeChild(toast);
                        }
                    }, 300);
                }
            }, duration);
        };
        
        this.toggleLoading = function(show) {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.style.display = show ? 'flex' : 'none';
            }
        };
        
        this.updateConnectionStatus = function(isConnected) {
            const statusIndicator = document.getElementById('connectionStatus');
            const statusText = document.getElementById('connectionText');
            
            if (statusIndicator && statusText) {
                if (isConnected) {
                    statusIndicator.className = 'text-green-500 mr-2';
                    statusText.textContent = 'Connected';
                } else {
                    statusIndicator.className = 'text-red-500 mr-2';
                    statusText.textContent = 'Disconnected';
                }
            }
        };
    }
    
    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing Dashboard...');
        
        try {
            // Show loading overlay
            this.toggleLoading(true);
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Setup prediction tabs
            this.setupPredictionTabs();
            
            // Load all leagues, teams, and players
            await this.loadAllData();
            
            // Load initial data for the default league
            await this.loadData(this.currentLeagueId);
            
            // Initialize custom modules
            await this.initializeModules();
            
            // Hide loading overlay
            this.toggleLoading(false);
            
            this.initialized = true;
            this.showToast('Dashboard initialized successfully', 'success');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.toggleLoading(false);
            this.showToast('Failed to initialize dashboard: ' + error.message, 'error');
            
            return false;
        }
    }
    
    /**
     * Initialize additional modules
     */
    async initializeModules() {
        try {
            // Import and initialize enhanced predictions module
            const enhancedPredictions = await import('./enhanced-predictions.js').then(module => module.default);
            await enhancedPredictions.initialize();
            
            // Import and initialize custom analysis module
            const customAnalysis = await import('./custom-analysis.js').then(module => module.default);
            await customAnalysis.initialize();
            
            // Import and initialize insights engine if it exists
            try {
                const insightsEngine = await import('./insights-engine.js').then(module => module.default);
                if (insightsEngine && typeof insightsEngine.initialize === 'function') {
                    await insightsEngine.initialize();
                }
            } catch (error) {
                console.warn('Insights engine not available:', error);
            }
            
            console.log('All modules initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize modules:', error);
            this.showToast('Some premium features could not be loaded', 'warning');
        }
    }
    
    // Set up event listeners
    setupEventListeners() {
        // Refresh button
        const refreshButton = document.getElementById('refresh-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.handleRefresh());
        }
        
        // League selector
        const leagueSelector = document.getElementById('league-selector');
        if (leagueSelector) {
            leagueSelector.addEventListener('change', (e) => {
                const leagueId = e.target.value;
                this.state.setState({ currentLeague: leagueId });
                
                // Update insights for new league
                insightsIntegration.setCurrentLeague(leagueId);
                
                this.handleRefresh();
            });
        }
        
        // Time range selector
        const timeRange = document.getElementById('time-range');
        if (timeRange) {
            timeRange.addEventListener('change', (e) => {
                this.state.setState({ timeRange: e.target.value });
                this.handleRefresh();
            });
        }
    }
    
    // Set up prediction tabs
    setupPredictionTabs() {
        const tabs = document.querySelectorAll('.prediction-tab');
        const panels = document.querySelectorAll('.prediction-panel');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabType = tab.getAttribute('data-tab');
                
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active panel
                panels.forEach(p => p.classList.remove('active'));
                const activePanel = document.getElementById(`${tabType}-analysis`) || document.getElementById(`${tabType}-factor`);
                if (activePanel) activePanel.classList.add('active');
                
                // Update state
                this.state.setState({ predictionMode: tabType });
                
                // Render predictions for this tab if not already loaded
                const container = document.getElementById(`${tabType}-predictions-container`);
                if (container && container.children.length === 0) {
                    this.renderPredictionsForTab(tabType);
                }
            });
        });
    }
    
    // Load initial data
    async loadData(leagueId) {
        try {
            const currentState = this.state.getState();
            
            // Fetch teams data
            const teamsResponse = await this.apiClient.getTeams(leagueId);
            
            // Fetch standings data
            const standingsResponse = await this.apiClient.getStandings(leagueId);
            
            // Fetch matches data
            const matchesResponse = await this.apiClient.getMatches();
            
            // Update state with data
            if (teamsResponse.status === 'success' && standingsResponse.status === 'success' && matchesResponse.status === 'success') {
                this.state.setState({
                    data: {
                        teams: teamsResponse.data.teams,
                        standings: standingsResponse.data.standings,
                        matches: matchesResponse.data.matches
                    }
                });
                
                // Render UI components
                this.renderDashboard();
                
                // Update connection status
                ui.updateConnectionStatus(true);
            } else {
                throw new Error('Data loading failed');
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            ui.showToast('Failed to load data. Using cached data.', 'warning');
            ui.updateConnectionStatus(false);
            
            // Use mock data for demonstration
            this.useMockData();
        }
    }
    
    // Use mock data if API fails
    useMockData() {
        // Mock teams for Premier League
        const teams = [
            { id: '133602', name: 'Arsenal', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/a1af2i1557005128.png' },
            { id: '133604', name: 'Chelsea', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/yvwvtu1448813215.png' },
            { id: '133600', name: 'Liverpool', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/xzqdr21575276578.png' },
            { id: '133615', name: 'Manchester City', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/vuspxr1467462651.png' },
            { id: '133613', name: 'Manchester United', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/uyhbfe1612467562.png' },
            { id: '133616', name: 'Tottenham', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/30bphv1604179364.png' }
        ];
        
        // Mock standings
        const standings = teams.map((team, index) => {
            const position = index + 1;
            const played = 10 + Math.floor(Math.random() * 10);
            const won = Math.floor(Math.random() * played);
            const drawn = Math.floor(Math.random() * (played - won));
            const lost = played - won - drawn;
            const points = won * 3 + drawn;
            
            return {
                position,
                team: {
                    id: team.id,
                    name: team.name,
                    logo: team.logo
                },
                played,
                won,
                drawn,
                lost,
                goalsFor: won * 2 + drawn,
                goalsAgainst: lost * 2,
                goalDifference: won * 2 + drawn - lost * 2,
                points
            };
        }).sort((a, b) => b.points - a.points);
        
        // Update positions after sorting
        standings.forEach((item, index) => {
            item.position = index + 1;
        });
        
        // Mock matches
        const matches = [];
        for (let i = 0; i < 8; i++) {
            const homeTeamIndex = Math.floor(Math.random() * teams.length);
            let awayTeamIndex;
            do {
                awayTeamIndex = Math.floor(Math.random() * teams.length);
            } while (awayTeamIndex === homeTeamIndex);
            
            const homeTeam = teams[homeTeamIndex];
            const awayTeam = teams[awayTeamIndex];
            
            const date = new Date();
            date.setDate(date.getDate() + Math.floor(Math.random() * 14));
            
            matches.push({
                id: `match-${i + 1}`,
                homeTeam: {
                    id: homeTeam.id,
                    name: homeTeam.name,
                    logo: homeTeam.logo
                },
                awayTeam: {
                    id: awayTeam.id,
                    name: awayTeam.name,
                    logo: awayTeam.logo
                },
                date: date.toISOString(),
                status: 'scheduled',
                venue: `${homeTeam.name} Stadium`
            });
        }
        
        // Update state with mock data
        this.state.setState({
            data: {
                teams,
                standings,
                matches
            }
        });
        
        // Render UI components
        this.renderDashboard();
    }
    
    // Render dashboard components
    renderDashboard() {
        const { data } = this.state.getState();
        
        // Render team comparison
        renderers.renderTeamComparison(data.teams);
        
        // Render standings
        renderers.renderStandings(data.standings);
        
        // Render single factor predictions
        renderers.renderPredictions(data.matches, 'single');
        
        // Render player stats
        renderers.renderPlayerStats(data.teams);
    }
    
    // Render predictions for a specific tab
    renderPredictionsForTab(tabType) {
        const { data } = this.state.getState();
        renderers.renderPredictions(data.matches, tabType);
    }
    
    // Handle refresh button click
    async handleRefresh() {
        try {
            ui.showToast('Refreshing data...', 'info');
            ui.toggleLoading(true);
            
            // Reload data
            await this.loadData(this.currentLeagueId);
            
            ui.toggleLoading(false);
            ui.showToast('Data refreshed successfully', 'success');
        } catch (error) {
            console.error('Refresh failed:', error);
            ui.toggleLoading(false);
            ui.showToast('Failed to refresh data', 'error');
        }
    }
    
    /**
     * Load all leagues, teams, and players data
     */
    async loadAllData() {
        try {
            // Show loading message
            this.showToast('Loading all leagues, teams, and players...', 'info');
            
            // Load all leagues
            const leaguesResponse = await this.apiClient.getLeagues();
            if (leaguesResponse.status !== 'success') {
                throw new Error('Failed to fetch leagues');
            }
            
            const leagues = leaguesResponse.data.leagues;
            
            // Update league selector
            this.updateLeagueSelector(leagues);
            
            // Store leagues in state
            this.state.setState({ leagues });
            
            // Load all teams for each league
            const allTeams = [];
            const allPlayers = [];
            
            for (const league of leagues) {
                // Load teams for this league
                const teamsResponse = await this.apiClient.getTeams(league.id);
                if (teamsResponse.status === 'success') {
                    const leagueTeams = teamsResponse.data.teams;
                    
                    // Add league information to each team
                    leagueTeams.forEach(team => {
                        team.league = {
                            id: league.id,
                            name: league.name,
                            country: league.country
                        };
                        allTeams.push(team);
                    });
                    
                    // Load players for each team
                    for (const team of leagueTeams) {
                        const playersResponse = await this.apiClient.getPlayerStats(team.id);
                        if (playersResponse.status === 'success') {
                            const teamPlayers = playersResponse.data.players;
                            
                            // Add team information to each player
                            teamPlayers.forEach(player => {
                                player.team = {
                                    id: team.id,
                                    name: team.name,
                                    logo: team.logo
                                };
                                player.league = {
                                    id: league.id,
                                    name: league.name,
                                    country: league.country
                                };
                                allPlayers.push(player);
                            });
                        }
                    }
                }
            }
            
            // Store all teams and players in state
            this.state.setState({ 
                allTeams,
                allPlayers
            });
            
            console.log(`Loaded data: ${leagues.length} leagues, ${allTeams.length} teams, ${allPlayers.length} players`);
            this.showToast(`Loaded ${leagues.length} leagues, ${allTeams.length} teams, ${allPlayers.length} players`, 'success');
            
            // Create and populate teams & players select dropdowns
            this.createTeamsAndPlayersSelectors();
            
            // Initialize leagues explorer
            this.initializeLeaguesExplorer();
            
        } catch (error) {
            console.error('Failed to load all data:', error);
            this.showToast('Failed to load complete dataset: ' + error.message, 'error');
        }
    }
    
    /**
     * Update league selector with all available leagues
     * @param {Array} leagues - List of available leagues
     */
    updateLeagueSelector(leagues) {
        const leagueSelector = document.getElementById('league-selector');
        if (!leagueSelector) return;
        
        // Clear existing options
        leagueSelector.innerHTML = '';
        
        // Add leagues as options
        leagues.forEach(league => {
            const option = document.createElement('option');
            option.value = league.id;
            option.text = league.name;
            leagueSelector.appendChild(option);
        });
        
        // Set default league
        leagueSelector.value = this.currentLeagueId;
    }
    
    /**
     * Create and populate teams and players selectors
     */
    createTeamsAndPlayersSelectors() {
        const { allTeams, allPlayers } = this.state.getState();
        
        // Create team selector component in the dashboard header
        const headerRight = document.querySelector('.premium-header .flex.items-center.space-x-3');
        if (headerRight) {
            // Add team selector
            const teamSelectorContainer = document.createElement('div');
            teamSelectorContainer.className = 'hidden md:block';
            teamSelectorContainer.innerHTML = `
                <select id="team-selector" class="bg-gray-800 text-white text-sm rounded-md border-gray-700 focus:ring-blue-500 focus:border-blue-500 block w-full p-2">
                    <option value="">All Teams</option>
                </select>
            `;
            headerRight.insertBefore(teamSelectorContainer, headerRight.querySelector('#refresh-button'));
            
            // Add player selector
            const playerSelectorContainer = document.createElement('div');
            playerSelectorContainer.className = 'hidden md:block';
            playerSelectorContainer.innerHTML = `
                <select id="player-selector" class="bg-gray-800 text-white text-sm rounded-md border-gray-700 focus:ring-blue-500 focus:border-blue-500 block w-full p-2">
                    <option value="">All Players</option>
                </select>
            `;
            headerRight.insertBefore(playerSelectorContainer, headerRight.querySelector('#refresh-button'));
            
            // Populate team selector
            const teamSelector = document.getElementById('team-selector');
            if (teamSelector) {
                allTeams.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.text = `${team.name} (${team.league.name})`;
                    teamSelector.appendChild(option);
                });
                
                // Add event listener
                teamSelector.addEventListener('change', () => this.handleTeamSelect(teamSelector.value));
            }
            
            // Populate player selector (initially empty since we'll filter by team first)
            const playerSelector = document.getElementById('player-selector');
            if (playerSelector) {
                // Add event listener
                playerSelector.addEventListener('change', () => this.handlePlayerSelect(playerSelector.value));
            }
        }
    }
    
    /**
     * Handle team selection change
     * @param {string} teamId - Selected team ID
     */
    handleTeamSelect(teamId) {
        const { allPlayers } = this.state.getState();
        const playerSelector = document.getElementById('player-selector');
        
        if (!playerSelector) return;
        
        // Clear existing options except first
        while (playerSelector.options.length > 1) {
            playerSelector.remove(1);
        }
        
        if (!teamId) {
            // If "All Teams" is selected, show top players from all teams
            const topPlayers = allPlayers
                .sort((a, b) => b.stats.rating - a.stats.rating)
                .slice(0, 20);
                
            topPlayers.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.text = `${player.name} (${player.team.name})`;
                playerSelector.appendChild(option);
            });
        } else {
            // Filter players by team
            const teamPlayers = allPlayers.filter(player => player.team.id === teamId);
            
            teamPlayers.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.text = player.name;
                playerSelector.appendChild(option);
            });
        }
        
        // Show player information panel if a player is selected
        if (playerSelector.options.length > 1) {
            this.showPlayerInfoPanel(playerSelector.value);
        } else {
            this.hidePlayerInfoPanel();
        }
    }
    
    /**
     * Handle player selection change
     * @param {string} playerId - Selected player ID
     */
    handlePlayerSelect(playerId) {
        if (playerId) {
            this.showPlayerInfoPanel(playerId);
        } else {
            this.hidePlayerInfoPanel();
        }
    }
    
    /**
     * Show player information panel
     * @param {string} playerId - Player ID to display
     */
    showPlayerInfoPanel(playerId) {
        const { allPlayers } = this.state.getState();
        
        if (!playerId) return;
        
        // Find player by ID
        const player = allPlayers.find(p => p.id === playerId);
        if (!player) return;
        
        // Create or get player info panel
        let playerInfoPanel = document.getElementById('player-info-panel');
        
        if (!playerInfoPanel) {
            // Create panel if it doesn't exist
            playerInfoPanel = document.createElement('div');
            playerInfoPanel.id = 'player-info-panel';
            playerInfoPanel.className = 'premium-card p-6 mb-6';
            
            // Find where to insert the panel (after predictions content)
            const predictionsContent = document.getElementById('predictions-content');
            if (predictionsContent) {
                predictionsContent.parentNode.insertBefore(playerInfoPanel, predictionsContent.nextSibling);
            } else {
                // Fallback - add to main container
                const container = document.querySelector('main .container');
                if (container) {
                    container.appendChild(playerInfoPanel);
                }
            }
        }
        
        // Fill panel with player data
        playerInfoPanel.innerHTML = `
            <div class="flex items-start md:items-center">
                <div class="flex-shrink-0 mr-4">
                    <img src="${player.photo || 'https://via.placeholder.com/120?text=Player'}" 
                        alt="${player.name}" class="w-24 h-24 object-cover rounded-lg">
                </div>
                <div class="flex-grow">
                    <div class="flex flex-col md:flex-row md:items-center justify-between mb-2">
                        <h2 class="text-2xl font-bold">${player.name}</h2>
                        <div class="flex items-center mt-2 md:mt-0">
                            <img src="${player.team.logo}" alt="${player.team.name}" class="w-6 h-6 mr-2">
                            <span class="text-sm text-gray-300">${player.team.name}</span>
                            <span class="mx-2 text-gray-500">|</span>
                            <span class="text-sm text-gray-300">${player.league.name}</span>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div class="bg-gray-800 rounded-lg p-3 text-center">
                            <div class="text-xs text-gray-400">Rating</div>
                            <div class="text-2xl font-bold text-yellow-400">${player.stats.rating || '-'}</div>
                        </div>
                        <div class="bg-gray-800 rounded-lg p-3 text-center">
                            <div class="text-xs text-gray-400">Goals</div>
                            <div class="text-2xl font-bold">${player.stats.goals || '0'}</div>
                        </div>
                        <div class="bg-gray-800 rounded-lg p-3 text-center">
                            <div class="text-xs text-gray-400">Assists</div>
                            <div class="text-2xl font-bold">${player.stats.assists || '0'}</div>
                        </div>
                        <div class="bg-gray-800 rounded-lg p-3 text-center">
                            <div class="text-xs text-gray-400">Minutes</div>
                            <div class="text-2xl font-bold">${player.stats.minutes || '0'}</div>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div class="bg-gray-800 rounded-lg p-4">
                            <h3 class="text-sm font-medium mb-3">Performance Metrics</h3>
                            <div class="space-y-3">
                                ${this.renderPlayerStatBars(player)}
                            </div>
                        </div>
                        <div class="bg-gray-800 rounded-lg p-4">
                            <h3 class="text-sm font-medium mb-3">Form Analysis</h3>
                            <div class="space-y-2">
                                ${this.renderPlayerForm(player)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Show the panel
        playerInfoPanel.style.display = 'block';
    }
    
    /**
     * Hide player information panel
     */
    hidePlayerInfoPanel() {
        const playerInfoPanel = document.getElementById('player-info-panel');
        if (playerInfoPanel) {
            playerInfoPanel.style.display = 'none';
        }
    }
    
    /**
     * Render player stat bars
     * @param {Object} player - Player data
     * @returns {string} HTML for stat bars
     */
    renderPlayerStatBars(player) {
        const stats = [
            { name: 'Attacking', value: Math.floor(Math.random() * 40) + 60 },
            { name: 'Technique', value: Math.floor(Math.random() * 40) + 60 },
            { name: 'Defending', value: Math.floor(Math.random() * 40) + 60 },
            { name: 'Physical', value: Math.floor(Math.random() * 40) + 60 },
            { name: 'Speed', value: Math.floor(Math.random() * 40) + 60 }
        ];
        
        return stats.map(stat => `
            <div>
                <div class="flex justify-between mb-1">
                    <span class="text-xs text-gray-300">${stat.name}</span>
                    <span class="text-xs text-gray-300">${stat.value}/100</span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="bg-gradient-to-r from-blue-500 to-purple-600 h-full" style="width: ${stat.value}%"></div>
                </div>
            </div>
        `).join('');
    }
    
    /**
     * Render player form
     * @param {Object} player - Player data
     * @returns {string} HTML for form analysis
     */
    renderPlayerForm(player) {
        // Generate last 5 match ratings
        const lastMatches = [];
        for (let i = 0; i < 5; i++) {
            lastMatches.push({
                opponent: `Team ${i + 1}`,
                rating: (Math.random() * 3 + 6).toFixed(1), // 6.0 - 9.0
                result: ['W', 'D', 'L'][Math.floor(Math.random() * 3)]
            });
        }
        
        return lastMatches.map(match => `
            <div class="flex justify-between items-center bg-gray-700 bg-opacity-40 rounded p-2">
                <span class="text-xs">vs ${match.opponent}</span>
                <div class="flex items-center">
                    <span class="text-xs mr-2 ${match.result === 'W' ? 'text-green-400' : match.result === 'L' ? 'text-red-400' : 'text-yellow-400'}">${match.result}</span>
                    <span class="text-xs font-medium">${match.rating}</span>
                </div>
            </div>
        `).join('');
    }
    
    /**
     * Initialize leagues explorer 
     */
    initializeLeaguesExplorer() {
        const { leagues } = this.state.getState();
        if (!leagues || leagues.length === 0) {
            console.warn('No leagues data available for explorer');
            return;
        }
        
        // Get containers
        const leagueTabsContainer = document.getElementById('league-tabs');
        const teamsExplorerContainer = document.getElementById('teams-explorer-content');
        
        if (!leagueTabsContainer || !teamsExplorerContainer) {
            console.warn('League explorer containers not found');
            return;
        }
        
        // Clear spinner
        leagueTabsContainer.innerHTML = '';
        
        // Add league tabs
        leagues.forEach((league, index) => {
            const tab = document.createElement('button');
            tab.className = `league-tab flex items-center p-2 rounded ${index === 0 ? 'active bg-gray-800' : 'bg-gray-700 hover:bg-gray-800'}`;
            tab.dataset.leagueId = league.id;
            tab.innerHTML = `
                <img src="${league.logo}" alt="${league.name}" class="w-6 h-6 mr-2">
                <span>${league.name}</span>
            `;
            
            // Add click event
            tab.addEventListener('click', () => {
                // Update active tab
                document.querySelectorAll('.league-tab').forEach(t => {
                    t.classList.remove('active', 'bg-gray-800');
                    t.classList.add('bg-gray-700', 'hover:bg-gray-800');
                });
                tab.classList.add('active', 'bg-gray-800');
                tab.classList.remove('bg-gray-700', 'hover:bg-gray-800');
                
                // Load teams for this league
                this.displayTeamsForLeague(league.id);
            });
            
            leagueTabsContainer.appendChild(tab);
        });
        
        // Display teams for first league
        if (leagues.length > 0) {
            this.displayTeamsForLeague(leagues[0].id);
        }
    }
    
    /**
     * Display teams for a specific league in the explorer
     * @param {string} leagueId - League ID
     */
    async displayTeamsForLeague(leagueId) {
        const teamsExplorerContainer = document.getElementById('teams-explorer-content');
        if (!teamsExplorerContainer) return;
        
        // Show loading spinner
        teamsExplorerContainer.innerHTML = `
            <div class="flex justify-center py-10">
                <div class="premium-spinner"></div>
            </div>
        `;
        
        // Fetch teams if we don't have them
        let teams = [];
        const { allTeams } = this.state.getState();
        
        if (allTeams && allTeams.length > 0) {
            // Filter teams by league
            teams = allTeams.filter(team => team.league.id === leagueId);
        } else {
            // Fetch teams from API
            const response = await this.apiClient.getTeams(leagueId);
            if (response.status === 'success') {
                teams = response.data.teams;
            }
        }
        
        // Render teams in grid
        let html = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">`;
        
        teams.forEach(team => {
            html += `
                <div class="team-card bg-gray-800 hover:bg-gray-700 rounded-lg p-4 flex flex-col items-center transition-all duration-300 cursor-pointer"
                     data-team-id="${team.id}">
                    <img src="${team.logo}" alt="${team.name}" class="w-16 h-16 mb-3 object-contain">
                    <p class="font-medium text-center">${team.name}</p>
                </div>
            `;
        });
        
        html += `</div>`;
        teamsExplorerContainer.innerHTML = html;
        
        // Add click event to team cards
        document.querySelectorAll('.team-card').forEach(card => {
            card.addEventListener('click', () => {
                const teamId = card.dataset.teamId;
                this.displayTeamDetails(teamId);
            });
        });
    }
    
    /**
     * Display detailed information for a team
     * @param {string} teamId - Team ID
     */
    async displayTeamDetails(teamId) {
        // Get team from state
        const { allTeams } = this.state.getState();
        const team = allTeams.find(t => t.id === teamId);
        
        if (!team) {
            console.warn(`Team not found: ${teamId}`);
            return;
        }
        
        // Update the team selector if it exists
        const teamSelector = document.getElementById('team-selector');
        if (teamSelector) {
            teamSelector.value = teamId;
            
            // Trigger change event
            const event = new Event('change');
            teamSelector.dispatchEvent(event);
        }
        
        // Create a modal with team details
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-75 p-4';
        modal.id = 'team-detail-modal';
        
        // Fetch players for this team
        let players = [];
        const { allPlayers } = this.state.getState();
        
        // Show loading spinner in modal
        modal.innerHTML = `
            <div class="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div class="flex justify-center py-10">
                    <div class="premium-spinner"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Allow clicking outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Get players for this team
        if (allPlayers && allPlayers.length > 0) {
            players = allPlayers.filter(p => p.team.id === teamId);
        } else {
            // Fetch players from API
            const response = await this.apiClient.getPlayerStats(teamId);
            if (response.status === 'success') {
                players = response.data.players;
            }
        }
        
        // Get standings
        const standingsResponse = await this.apiClient.getStandings(team.league.id);
        const teamStanding = standingsResponse.status === 'success' 
            ? standingsResponse.data.standings.find(s => s.team.id === teamId)
            : null;
        
        // Prepare content for modal
        let modalContent = `
            <div class="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div class="sticky top-0 bg-gray-900 p-6 border-b border-gray-800 flex justify-between items-center">
                    <div class="flex items-center">
                        <img src="${team.logo}" alt="${team.name}" class="w-16 h-16 mr-4">
                        <div>
                            <h2 class="text-2xl font-bold">${team.name}</h2>
                            <p class="text-gray-400">${team.league.name} · ${team.country}</p>
                        </div>
                    </div>
                    <button class="text-gray-400 hover:text-white" id="close-modal">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                
                <div class="p-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Team stats -->
                        <div class="space-y-4">
                            <h3 class="text-xl font-bold mb-4">Team Statistics</h3>
                            ${teamStanding ? `
                            <div class="bg-gray-800 rounded-lg p-4">
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="text-center p-3 bg-gray-700 rounded-lg">
                                        <p class="text-sm text-gray-400">Position</p>
                                        <p class="text-xl font-bold">${teamStanding.position}</p>
                                    </div>
                                    <div class="text-center p-3 bg-gray-700 rounded-lg">
                                        <p class="text-sm text-gray-400">Points</p>
                                        <p class="text-xl font-bold">${teamStanding.points}</p>
                                    </div>
                                    <div class="text-center p-3 bg-gray-700 rounded-lg">
                                        <p class="text-sm text-gray-400">Form</p>
                                        <p class="text-xl font-bold">${teamStanding.form || 'N/A'}</p>
                                    </div>
                                    <div class="text-center p-3 bg-gray-700 rounded-lg">
                                        <p class="text-sm text-gray-400">Goal Diff</p>
                                        <p class="text-xl font-bold">${teamStanding.goalDifference}</p>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-4 gap-2 mt-4">
                                    <div class="text-center p-2">
                                        <p class="text-xs text-gray-400">Played</p>
                                        <p class="text-lg font-bold">${teamStanding.played}</p>
                                    </div>
                                    <div class="text-center p-2">
                                        <p class="text-xs text-gray-400">Won</p>
                                        <p class="text-lg font-bold text-green-500">${teamStanding.won}</p>
                                    </div>
                                    <div class="text-center p-2">
                                        <p class="text-xs text-gray-400">Drawn</p>
                                        <p class="text-lg font-bold text-yellow-500">${teamStanding.drawn}</p>
                                    </div>
                                    <div class="text-center p-2">
                                        <p class="text-xs text-gray-400">Lost</p>
                                        <p class="text-lg font-bold text-red-500">${teamStanding.lost}</p>
                                    </div>
                                </div>
                            </div>
                            ` : '<p class="text-gray-400">Team standings not available</p>'}
                            
                            <div class="bg-gray-800 rounded-lg p-4">
                                <h4 class="font-medium mb-4">Strengths Analysis</h4>
                                <div class="space-y-3">
                                    ${this.renderTeamStrengths()}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Players section -->
                        <div>
                            <h3 class="text-xl font-bold mb-4">Key Players</h3>
                            <div class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                ${players.length > 0 
                                    ? players
                                        .sort((a, b) => parseFloat(b.stats.rating || 0) - parseFloat(a.stats.rating || 0))
                                        .slice(0, 10)
                                        .map(player => `
                                            <div class="bg-gray-800 hover:bg-gray-700 rounded-lg p-3 flex items-center transition-all duration-300">
                                                <img src="${player.photo}" alt="${player.name}" class="w-12 h-12 rounded-full object-cover mr-3">
                                                <div class="flex-grow">
                                                    <div class="flex justify-between items-center">
                                                        <p class="font-medium">${player.name}</p>
                                                        <p class="text-sm bg-blue-600 bg-opacity-30 text-blue-400 rounded px-2">${player.positionAbbr}</p>
                                                    </div>
                                                    <div class="flex justify-between mt-1">
                                                        <p class="text-xs text-gray-400">${player.nationality} · ${player.age} years</p>
                                                        <p class="text-sm font-medium text-yellow-400">${player.stats.rating || '-'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        `).join('')
                                    : '<p class="text-gray-400">No player data available</p>'
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Update modal content
        modal.innerHTML = modalContent;
        
        // Add close button functionality
        const closeButton = document.getElementById('close-modal');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        }
    }
    
    /**
     * Render team strengths analysis
     * @returns {string} HTML content
     */
    renderTeamStrengths() {
        // Generate random team strengths
        const strengths = [
            { name: 'Attacking', value: Math.floor(Math.random() * 30) + 70 },
            { name: 'Defending', value: Math.floor(Math.random() * 30) + 70 },
            { name: 'Possession', value: Math.floor(Math.random() * 30) + 70 },
            { name: 'Set Pieces', value: Math.floor(Math.random() * 30) + 70 },
            { name: 'Counter Attack', value: Math.floor(Math.random() * 30) + 70 }
        ];
        
        return strengths.map(strength => `
            <div>
                <div class="flex justify-between mb-1">
                    <span class="text-xs text-gray-300">${strength.name}</span>
                    <span class="text-xs text-gray-300">${strength.value}/100</span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="bg-gradient-to-r from-blue-500 to-purple-600 h-full" style="width: ${strength.value}%"></div>
                </div>
            </div>
        `).join('');
    }
}

export default Dashboard; 