class DashboardManager {
    constructor() {
        this.selectedLeague = localStorage.getItem('selectedLeague') || 'nba';
        this.selectedTeam = localStorage.getItem('selectedTeam') || '';
        this.chart = null;
        this.ws = null;
        this.initializeEventListeners();
        this.syncSelectorStates();
        this.connectWebSocket();
        this.loadDashboardData();
    }

    initializeEventListeners() {
        try {
            // League selection
            const leagueSelect = document.getElementById('leagueSelect');
            if (leagueSelect) {
                leagueSelect.addEventListener('change', (e) => {
                    if (e.target instanceof HTMLSelectElement) {
                        console.log('League changed to:', e.target.value);
                        this.selectedLeague = e.target.value;
                        localStorage.setItem('selectedLeague', this.selectedLeague);
                        this.loadTeams();
                        this.loadDashboardData();
                        this.syncLeagueSelectors(this.selectedLeague);
                    }
                });
            } else {
                console.warn('League select element not found');
            }

            // Team selection
            const teamSelect = document.getElementById('teamSelect');
            if (teamSelect) {
                teamSelect.addEventListener('change', (e) => {
                    if (e.target instanceof HTMLSelectElement) {
                        console.log('Team changed to:', e.target.value);
                        this.selectedTeam = e.target.value;
                        localStorage.setItem('selectedTeam', this.selectedTeam);
                        this.loadDashboardData();
                        this.syncTeamSelectors(this.selectedTeam);
                        
                        // Also load players when team changes
                        this.loadPlayersForTeam(this.selectedTeam);
                    }
                });
            } else {
                console.warn('Team select element not found');
            }

            // Also add listeners to other team selectors
            const otherTeamSelectors = document.querySelectorAll('.team-selector');
            otherTeamSelectors.forEach(selector => {
                if (selector && selector.id !== 'teamSelect' && selector instanceof HTMLSelectElement) {
                    selector.addEventListener('change', (e) => {
                        if (e.target instanceof HTMLSelectElement) {
                            const teamId = e.target.value;
                            if (teamId !== this.selectedTeam) {
                                console.log('Team changed from other selector:', teamId);
                                this.selectedTeam = teamId;
                                localStorage.setItem('selectedTeam', this.selectedTeam);
                                // Sync with main team selector
                                if (teamSelect && teamSelect instanceof HTMLSelectElement) {
                                    teamSelect.value = teamId;
                                }
                                this.loadDashboardData();
                                this.syncTeamSelectors(teamId);
                                
                                // Also load players when team changes
                                this.loadPlayersForTeam(teamId);
                            }
                        }
                    });
                }
            });

            // Games filter
            const gamesFilter = document.getElementById('gamesFilter');
            if (gamesFilter) {
                gamesFilter.addEventListener('change', () => {
                    this.loadDashboardData();
                });
            }
            
            // Listen for league change events from other components
            document.addEventListener('leagueChanged', (e) => {
                if (e instanceof CustomEvent && e.detail && e.detail.league && e.detail.league !== this.selectedLeague) {
                    console.log('Received league change event:', e.detail.league);
                    this.selectedLeague = e.detail.league;
                    if (leagueSelect && leagueSelect instanceof HTMLSelectElement) {
                        leagueSelect.value = this.selectedLeague;
                    }
                    this.loadTeams();
                    this.loadDashboardData();
                }
            });
            
            // Listen for team change events from other components
            document.addEventListener('teamChanged', (e) => {
                if (e instanceof CustomEvent && e.detail && e.detail.teamId !== undefined && e.detail.teamId !== this.selectedTeam) {
                    console.log('Received team change event:', e.detail.teamId);
                    this.selectedTeam = e.detail.teamId;
                    if (teamSelect && teamSelect instanceof HTMLSelectElement) {
                        teamSelect.value = this.selectedTeam;
                    }
                    this.loadDashboardData();
                    
                    // Also load players when team changes
                    this.loadPlayersForTeam(this.selectedTeam);
                }
            });
        } catch (error) {
            console.error('Error initializing event listeners:', error);
        }
    }
    
    // Synchronize all league selector dropdowns with the current state
    syncLeagueSelectors(league) {
        const leagueSelectors = document.querySelectorAll('.league-selector');
        leagueSelectors.forEach(selector => {
            if (selector instanceof HTMLSelectElement) {
                selector.value = league;
            }
        });
        
        // Update the main dropdown display as well
        const currentLeagueName = document.getElementById('currentLeagueName');
        if (currentLeagueName instanceof HTMLElement) {
            currentLeagueName.textContent = league.toUpperCase();
        }
        
        const currentLeagueIcon = document.getElementById('currentLeagueIcon');
        if (currentLeagueIcon instanceof HTMLImageElement) {
            currentLeagueIcon.src = `/assets/icons/leagues/${league.toLowerCase()}.svg`;
            currentLeagueIcon.alt = league.toUpperCase();
        }
        
        // Notify other components about the league change
        document.dispatchEvent(new CustomEvent('leagueChanged', {
            detail: { league: league }
        }));
    }
    
    // Synchronize all team selector dropdowns with the current state
    syncTeamSelectors(teamId) {
        const teamSelectors = document.querySelectorAll('.team-selector');
        teamSelectors.forEach(selector => {
            if (selector instanceof HTMLSelectElement) {
                selector.value = teamId;
            }
        });
        
        // Notify other components about the team change
        document.dispatchEvent(new CustomEvent('teamChanged', {
            detail: { teamId: teamId }
        }));
    }
    
    // Set initial state for all selectors based on stored values
    syncSelectorStates() {
        // Set the initial league value
        const leagueSelect = document.getElementById('leagueSelect');
        if (leagueSelect) {
            leagueSelect.value = this.selectedLeague;
        }
        
        // Update visual indicators for league selection
        this.syncLeagueSelectors(this.selectedLeague);
        
        // Team selector will be populated during loadTeams() call
    }

    async loadTeams() {
        try {
            console.log('Loading teams for', this.selectedLeague);
            
            // Show loading indicator
            const teamSelectElements = document.querySelectorAll('.team-selector');
            teamSelectElements.forEach(select => {
                if (select instanceof HTMLSelectElement) {
                    select.disabled = true;
                }
            });
            
            // Use dataService if available
            let teams = [];
            if (window.dataService && typeof window.dataService.getTeams === 'function') {
                teams = await window.dataService.getTeams(this.selectedLeague);
            } else {
                // Fallback to direct API call
                const response = await fetch(`/api/leagues/${this.selectedLeague}/teams`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                
                if (!response.ok) {
                    // Try fallback endpoint
                    const fallbackResponse = await fetch(`/api/teams?league=${this.selectedLeague}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });
                    
                    if (!fallbackResponse.ok) {
                        throw new Error('Failed to load teams');
                    }
                    
                    const data = await fallbackResponse.json();
                    teams = Array.isArray(data.data) ? data.data : 
                           Array.isArray(data) ? data : [];
                } else {
                    const data = await response.json();
                    teams = Array.isArray(data.data) ? data.data : 
                           Array.isArray(data) ? data : [];
                }
            }
            
            this.updateTeamSelect(teams);
        } catch (error) {
            console.error('Error loading teams:', error);
            // Show error message
            const errorMsg = `Failed to load teams for ${this.selectedLeague}. Please try again.`;
            if (window.toast) {
                window.toast.error(errorMsg);
            } else {
                console.error(errorMsg);
            }
        } finally {
            // Re-enable team selects
            const teamSelectElements = document.querySelectorAll('.team-selector');
            teamSelectElements.forEach(select => {
                if (select instanceof HTMLSelectElement) {
                    select.disabled = false;
                }
            });
        }
    }

    updateTeamSelect(teams) {
        const teamSelect = document.getElementById('teamSelect');
        if (!teamSelect) return;
        
        // Store current selection to restore it if the team still exists
        const currentSelection = teamSelect.value;
        
        // Clear existing options
        teamSelect.innerHTML = '<option value="">All Teams</option>';
        
        // Add team options
        if (Array.isArray(teams)) {
            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id || team.teamId;
                option.textContent = team.name || team.displayName;
                teamSelect.appendChild(option);
            });
        }
        
        // Try to restore previous selection if that team exists in the new league
        // Otherwise, set to empty (All Teams)
        if (currentSelection && teams.some(t => (t.id === currentSelection || t.teamId === currentSelection))) {
            teamSelect.value = currentSelection;
            this.selectedTeam = currentSelection;
        } else {
            teamSelect.value = '';
            this.selectedTeam = '';
            localStorage.setItem('selectedTeam', '');
        }
        
        // Also update other team selectors
        this.syncTeamSelectors(this.selectedTeam);
    }

    async loadDashboardData() {
        try {
            document.getElementById('loadingOverlay').classList.remove('hidden');

            const [stats, games] = await Promise.all([
                this.fetchStats(),
                this.fetchGames()
            ]);

            this.updateStats(stats);
            this.updateGames(games);
            this.updateChart(games);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            document.getElementById('loadingOverlay').classList.add('hidden');
        }
    }

    async fetchStats() {
        const response = await fetch(`/api/stats/${this.selectedLeague}${this.selectedTeam ? `?team=${this.selectedTeam}` : ''}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch stats');
        return response.json();
    }

    async fetchGames() {
        const response = await fetch(`/api/games/${this.selectedLeague}${this.selectedTeam ? `?team=${this.selectedTeam}` : ''}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch games');
        return response.json();
    }

    updateStats(stats) {
        document.getElementById('totalGames').textContent = stats.totalGames || '-';
        document.getElementById('avgScore').textContent = stats.averageScore ? stats.averageScore.toFixed(1) : '-';
        document.getElementById('winRate').textContent = stats.homeWinPercentage ? `${stats.homeWinPercentage.toFixed(1)}%` : '-';
    }

    updateGames(games) {
        const gamesContainer = document.getElementById('recentGames');
        const limit = parseInt(document.getElementById('gamesFilter').value);

        if (!games.length) {
            gamesContainer.innerHTML = '<div class="text-gray-400 text-center">No games available</div>';
            return;
        }

        gamesContainer.innerHTML = games.slice(0, limit).map(game => `
            <div class="bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors">
                <div class="flex justify-between items-center">
                    <div class="text-lg">
                        <div class="font-bold">${game.homeTeam.name}</div>
                        <div class="text-2xl">${game.homeTeam.score}</div>
                    </div>
                    <div class="text-gray-400 mx-4">VS</div>
                    <div class="text-lg text-right">
                        <div class="font-bold">${game.awayTeam.name}</div>
                        <div class="text-2xl">${game.awayTeam.score}</div>
                    </div>
                </div>
                <div class="text-sm text-gray-400 mt-2">
                    ${new Date(game.date).toLocaleDateString()}
                </div>
            </div>
        `).join('');
    }

    updateChart(games) {
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: games.map(game => new Date(game.date).toLocaleDateString()),
                datasets: [{
                    label: 'Home Score',
                    data: games.map(game => game.homeTeam.score),
                    borderColor: 'rgb(59, 130, 246)',
                    tension: 0.1
                }, {
                    label: 'Away Score',
                    data: games.map(game => game.awayTeam.score),
                    borderColor: 'rgb(239, 68, 68)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'white'
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
                            color: 'white'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white'
                        }
                    }
                }
            }
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsPort = process.env.WS_PORT || 5150;
        this.ws = new WebSocket(`${protocol}//${window.location.hostname}:${wsPort}/ws`);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.ws.send(JSON.stringify({ 
                type: 'subscribe', 
                league: this.selectedLeague 
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'gameUpdate') {
                this.loadDashboardData();
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected, attempting to reconnect...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }

    /**
     * Load players for the selected team
     * @param {string} teamId - The team ID to load players for
     */
    async loadPlayersForTeam(teamId) {
        if (!teamId) {
            console.warn('No team ID provided to load players');
            return;
        }
        
        try {
            console.log(`Loading players for team ${teamId} in league ${this.selectedLeague}`);
            
            // Disable player dropdown during loading
            const playerSelect = document.getElementById('playerSelector');
            if (playerSelect instanceof HTMLSelectElement) {
                playerSelect.disabled = true;
                playerSelect.innerHTML = '<option value="">Loading players...</option>';
            }
            
            // Clear player display container if it exists
            const playerContainer = document.getElementById('playerContainer');
            if (playerContainer) {
                playerContainer.innerHTML = '<div class="loading">Loading players...</div>';
            }
            
            // Use dataService if available
            let players = [];
            if (window.dataService && typeof window.dataService.getPlayers === 'function') {
                players = await window.dataService.getPlayers(teamId, this.selectedLeague);
            } else if (window.fetchPlayersByTeam && typeof window.fetchPlayersByTeam === 'function') {
                // Use global function if available
                players = await window.fetchPlayersByTeam(teamId, this.selectedLeague);
            } else {
                // Fallback to direct API call
                const response = await fetch(`/api/leagues/${this.selectedLeague}/teams/${teamId}/players`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                
                if (!response.ok) {
                    // Try fallback endpoint
                    const fallbackResponse = await fetch(`/api/players?teamId=${teamId}&league=${this.selectedLeague}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });
                    
                    if (!fallbackResponse.ok) {
                        throw new Error(`Failed to fetch players: ${response.status}`);
                    }
                    
                    const fallbackData = await fallbackResponse.json();
                    players = Array.isArray(fallbackData.data) ? fallbackData.data : 
                           Array.isArray(fallbackData) ? fallbackData : [];
                } else {
                    const data = await response.json();
                    players = Array.isArray(data.data) ? data.data : 
                           Array.isArray(data) ? data : [];
                }
            }
            
            // Update player dropdown
            if (playerSelect instanceof HTMLSelectElement) {
                // Use displayPlayers function if available
                if (window.displayPlayers && typeof window.displayPlayers === 'function') {
                    window.displayPlayers(players, playerSelect);
                } else {
                    this.updatePlayerSelect(players, playerSelect);
                }
            }
            
            // Also update player container if it exists
            if (playerContainer) {
                // Use displayPlayers function if available
                if (window.displayPlayers && typeof window.displayPlayers === 'function') {
                    window.displayPlayers(players, playerContainer);
                } else {
                    this.displayPlayerCards(players, playerContainer);
                }
            }
            
            // Update player stats if a player is already selected
            const playerSelector = document.getElementById('playerSelector');
            if (playerSelector instanceof HTMLSelectElement && playerSelector.value) {
                this.loadPlayerStats(playerSelector.value);
            }
        } catch (error) {
            console.error('Error loading players:', error);
            
            // Show error message
            const errorMsg = 'Failed to load players. Please try again.';
            if (window.toast) {
                window.toast.error(errorMsg);
            } else {
                console.error(errorMsg);
            }
            
            // Reset player dropdown
            const playerSelect = document.getElementById('playerSelector');
            if (playerSelect instanceof HTMLSelectElement) {
                playerSelect.innerHTML = '<option value="">Select a player...</option>';
                playerSelect.disabled = false;
            }
            
            // Clear player container
            const playerContainer = document.getElementById('playerContainer');
            if (playerContainer) {
                playerContainer.innerHTML = '<div class="error-state">Failed to load players. Please try selecting another team.</div>';
            }
        }
    }
    
    /**
     * Update player dropdown with player data
     * @param {Array} players - Array of player objects
     * @param {HTMLSelectElement} selectElement - The select element to update
     */
    updatePlayerSelect(players, selectElement) {
        if (!selectElement) return;
        
        // Clear existing options
        selectElement.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a player...';
        selectElement.appendChild(defaultOption);
        
        if (!players || players.length === 0) {
            const noPlayersOption = document.createElement('option');
            noPlayersOption.disabled = true;
            noPlayersOption.textContent = 'No players found for this team';
            selectElement.appendChild(noPlayersOption);
            return;
        }
        
        // Add player options
        players.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id || player.playerId || '';
            
            // Handle different API response formats for player names
            const playerName = player.name || 
                             (player.firstName && player.lastName ? `${player.firstName} ${player.lastName}` : '') ||
                             player.fullName ||
                             'Unknown Player';
            
            option.textContent = playerName;
            
            // Add position if available
            if (player.position) {
                option.textContent += ` (${player.position})`;
            }
            
            selectElement.appendChild(option);
        });
        
        // Enable the select element
        selectElement.disabled = false;
    }
    
    /**
     * Display player cards in a container
     * @param {Array} players - Array of player objects
     * @param {HTMLElement} container - Container to display player cards in
     */
    displayPlayerCards(players, container) {
        if (!container) return;
        
        // Clear container
        container.innerHTML = '';
        
        if (!players || players.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No players found for this team. Try selecting another team.</p></div>';
            return;
        }
        
        // Create player cards
        players.forEach(player => {
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.setAttribute('data-player-id', player.id || player.playerId || '');
            
            // Handle different API response formats for player data
            const playerName = player.name || 
                             (player.firstName && player.lastName ? `${player.firstName} ${player.lastName}` : '') ||
                             player.fullName ||
                             'Unknown Player';
            
            const jerseyNumber = player.jerseyNumber || player.jersey || '';
            const position = player.position || player.pos || '';
            const playerId = player.id || player.playerId || '';
            
            playerCard.innerHTML = `
                <div class="player-header">
                    <span class="player-number">${jerseyNumber}</span>
                    <h3 class="player-name">${playerName}</h3>
                    <span class="player-position">${position}</span>
                </div>
                <button class="view-stats-btn" data-player-id="${playerId}">View Stats</button>
            `;
            
            // Add click handler for view stats button
            const viewStatsBtn = playerCard.querySelector('.view-stats-btn');
            if (viewStatsBtn) {
                viewStatsBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const id = viewStatsBtn.getAttribute('data-player-id');
                    if (id) {
                        // Use global function if available
                        if (window.showPlayerDetails && typeof window.showPlayerDetails === 'function') {
                            window.showPlayerDetails(id);
                        } else {
                            this.loadPlayerStats(id);
                        }
                    }
                });
            }
            
            container.appendChild(playerCard);
        });
    }

    /**
     * Load detailed stats for a specific player
     * @param {string} playerId - The ID of the player to load stats for
     */
    async loadPlayerStats(playerId) {
        if (!playerId) {
            console.warn('No player ID provided to load player stats');
            return;
        }
        
        try {
            console.log(`Loading stats for player ${playerId} in league ${this.selectedLeague}`);
            
            // Show loading state in player stats container
            const playerStatsContainer = document.getElementById('playerStats');
            if (playerStatsContainer instanceof HTMLElement) {
                playerStatsContainer.innerHTML = '<div class="loading">Loading player statistics...</div>';
                playerStatsContainer.classList.remove('hidden');
            }
            
            // Use dataService if available
            let playerStats = null;
            if (window.dataService && typeof window.dataService.getPlayerStats === 'function') {
                playerStats = await window.dataService.getPlayerStats(playerId, this.selectedLeague);
            } else if (window.fetchPlayerStats && typeof window.fetchPlayerStats === 'function') {
                // Use global function if available
                playerStats = await window.fetchPlayerStats(playerId, this.selectedLeague);
            } else {
                // Fallback to direct API call
                const response = await fetch(`/api/leagues/${this.selectedLeague}/players/${playerId}/stats`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                
                if (!response.ok) {
                    // Try fallback endpoint
                    const fallbackResponse = await fetch(`/api/players/${playerId}/stats?league=${this.selectedLeague}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });
                    
                    if (!fallbackResponse.ok) {
                        throw new Error(`Failed to fetch player stats: ${response.status}`);
                    }
                    
                    playerStats = await fallbackResponse.json();
                } else {
                    playerStats = await response.json();
                }
            }
            
            // Display player stats
            if (playerStatsContainer instanceof HTMLElement) {
                this.renderPlayerStats(playerStats, playerStatsContainer);
            }
            
            // Create or update player chart if chart container exists
            const chartContainer = document.getElementById('playerStatsChart');
            if (chartContainer instanceof HTMLElement && playerStats) {
                this.createPlayerStatsChart(playerStats, chartContainer);
            }
        } catch (error) {
            console.error('Error loading player stats:', error);
            
            // Show error message
            const errorMsg = 'Failed to load player statistics. Please try again.';
            if (window.toast) {
                window.toast.error(errorMsg);
            } else {
                console.error(errorMsg);
            }
            
            // Display error in stats container
            const playerStatsContainer = document.getElementById('playerStats');
            if (playerStatsContainer instanceof HTMLElement) {
                playerStatsContainer.innerHTML = '<div class="error-state">Failed to load player statistics. Please try again.</div>';
            }
        }
    }
    
    /**
     * Render player statistics in the UI
     * @param {Object} stats - Player statistics object
     * @param {HTMLElement} container - Container element to render stats in
     */
    renderPlayerStats(stats, container) {
        if (!container || !stats) {
            return;
        }
        
        try {
            // Extract player info - handle different API response formats
            const playerInfo = stats.player || stats.playerInfo || stats;
            const seasonStats = stats.stats || stats.seasonStats || stats.statistics || {};
            
            const playerName = playerInfo.name || 
                             (playerInfo.firstName && playerInfo.lastName ? `${playerInfo.firstName} ${playerInfo.lastName}` : '') ||
                             playerInfo.fullName ||
                             'Unknown Player';
            
            // Build the HTML content
            let html = `
                <div class="stats-header">
                    <h2>${playerName}</h2>
                    <div class="player-meta">`;
            
            if (playerInfo.position) {
                html += `<span class="position">${playerInfo.position}</span>`;
            }
            
            if (playerInfo.jerseyNumber) {
                html += `<span class="jersey">#${playerInfo.jerseyNumber}</span>`;
            }
            
            if (playerInfo.team && playerInfo.team.name) {
                html += `<span class="team">${playerInfo.team.name}</span>`;
            }
            
            html += `</div>
                </div>
                <div class="stats-container">
                    <div class="stats-section">
                        <h3>Season Statistics</h3>
                        <div class="stats-grid">`;
            
            // Build stats table dynamically based on available data
            if (Object.keys(seasonStats).length > 0) {
                html += this.buildStatsTable(seasonStats);
            } else {
                html += '<p>No season statistics available.</p>';
            }
            
            html += `</div>
                    </div>`;
            
            // Set the container content
            container.innerHTML = html;
        } catch (error) {
            console.error('Error rendering player stats:', error);
            container.innerHTML = '<div class="error-state">Error displaying player statistics.</div>';
        }
    }
    
    /**
     * Build a stats table from statistics object
     * @param {Object} stats - Statistics object
     * @returns {string} - HTML string for the stats table
     */
    buildStatsTable(stats) {
        // Common stats to display
        const commonStats = [
            { key: 'gamesPlayed', label: 'Games' },
            { key: 'minutesPerGame', label: 'MPG' },
            { key: 'pointsPerGame', label: 'PPG' },
            { key: 'reboundsPerGame', label: 'RPG' },
            { key: 'assistsPerGame', label: 'APG' },
            { key: 'stealsPerGame', label: 'SPG' },
            { key: 'blocksPerGame', label: 'BPG' },
            { key: 'turnoversPerGame', label: 'TO' },
            { key: 'fieldGoalPercentage', label: 'FG%' },
            { key: 'threePointPercentage', label: '3P%' },
            { key: 'freeThrowPercentage', label: 'FT%' },
            { key: 'plusMinus', label: '+/-' }
        ];
        
        let tableHtml = '<div class="stats-table">';
        
        // Find keys that exist in the stats object
        const availableStats = commonStats.filter(stat => 
            stats[stat.key] !== undefined || 
            // Check for alternative key formats
            stats[stat.key.toLowerCase()] !== undefined || 
            stats[stat.key.replace(/([A-Z])/g, '_$1').toLowerCase()] !== undefined
        );
        
        if (availableStats.length === 0) {
            return '<p>No detailed statistics available.</p>';
        }
        
        // Build the table with available stats
        for (const stat of availableStats) {
            // Try different formats to find the value
            let value = stats[stat.key];
            
            if (value === undefined) {
                value = stats[stat.key.toLowerCase()];
            }
            
            if (value === undefined) {
                value = stats[stat.key.replace(/([A-Z])/g, '_$1').toLowerCase()];
            }
            
            // Format percentage values
            if (stat.key.includes('Percentage') && value !== undefined) {
                value = (parseFloat(value) * 100).toFixed(1) + '%';
            }
            
            // Format decimal values
            if (typeof value === 'number' && !Number.isInteger(value)) {
                value = value.toFixed(1);
            }
            
            tableHtml += `
                <div class="stat-item">
                    <span class="stat-label">${stat.label}</span>
                    <span class="stat-value">${value !== undefined ? value : 'N/A'}</span>
                </div>`;
        }
        
        tableHtml += '</div>';
        return tableHtml;
    }
    
    /**
     * Create a chart to visualize player statistics
     * @param {Object} stats - Player statistics object
     * @param {HTMLElement} container - Container element for the chart
     */
    createPlayerStatsChart(stats, container) {
        if (!container || !stats) {
            return;
        }
        
        try {
            // Check if Chart.js is available
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js is not available');
                container.innerHTML = '<div class="chart-error">Charts library not available</div>';
                return;
            }
            
            // Get the canvas element
            let canvas = container.querySelector('canvas');
            if (!canvas) {
                // Create canvas if it doesn't exist
                canvas = document.createElement('canvas');
                container.innerHTML = '';
                container.appendChild(canvas);
            }
            
            // Extract relevant stats
            const seasonStats = stats.stats || stats.seasonStats || stats.statistics || {};
            
            // Define stats to chart
            const statsToChart = [
                { key: 'pointsPerGame', label: 'Points' },
                { key: 'reboundsPerGame', label: 'Rebounds' },
                { key: 'assistsPerGame', label: 'Assists' },
                { key: 'stealsPerGame', label: 'Steals' },
                { key: 'blocksPerGame', label: 'Blocks' }
            ];
            
            // Prepare data for the chart
            const labels = [];
            const data = [];
            const colors = [
                'rgba(66, 133, 244, 0.7)',
                'rgba(219, 68, 55, 0.7)',
                'rgba(244, 160, 0, 0.7)',
                'rgba(15, 157, 88, 0.7)',
                'rgba(171, 71, 188, 0.7)'
            ];
            
            statsToChart.forEach((stat, index) => {
                const value = seasonStats[stat.key] || 0;
                labels.push(stat.label);
                data.push(parseFloat(value) || 0);
            });
            
            // Destroy existing chart if any
            if (this.playerChart) {
                this.playerChart.destroy();
            }
            
            // Create new chart
            this.playerChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Season Stats',
                        data: data,
                        backgroundColor: colors,
                        borderColor: colors.map(color => color.replace('0.7', '1')),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating player stats chart:', error);
            container.innerHTML = '<div class="chart-error">Error creating chart</div>';
        }
    }
}

export default DashboardManager;