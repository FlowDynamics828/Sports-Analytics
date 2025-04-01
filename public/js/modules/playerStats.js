// Player Stats module
import { apiClient } from '../utils/apiClient.js';
import { Logger } from '../utils/logger.js';

export class PlayerStats {
    constructor(elementId = 'player-stats-content') {
        this.containerId = elementId;
        this.container = document.getElementById(elementId);
        this.players = [];
        this.selectedPlayerId = null;
        this.playerStats = null;
    }
    
    async initialize() {
        try {
            if (!this.container) {
                console.warn(`PlayerStats container #${this.containerId} not found`);
                return false;
            }
            
            // Add loading state
            this.container.innerHTML = '<div class="text-center py-4"><div class="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div><p class="mt-2 text-gray-400">Loading player stats...</p></div>';
            
            // Fetch player data
            await this.loadPlayers();
            
            // Select first player by default
            if (this.players.length > 0) {
                this.selectedPlayerId = this.players[0].id;
                await this.loadPlayerStats(this.selectedPlayerId);
            }
            
            // Render player stats
            this.renderPlayerStats();
            
            Logger.info('Player Stats module initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Player Stats module:', error);
            this.showError('Failed to load player statistics');
            return false;
        }
    }
    
    async loadPlayers() {
        try {
            const response = await apiClient.get('/api/player-stats');
            
            if (response.status === 200 && response.data && Array.isArray(response.data.players)) {
                this.players = response.data.players;
            } else {
                throw new Error('Invalid player data format');
            }
        } catch (error) {
            console.error('Error loading player list:', error);
            throw error;
        }
    }
    
    async loadPlayerStats(playerId) {
        try {
            if (!playerId) {
                throw new Error('Player ID is required');
            }
            
            // In a real implementation, this would be a separate API call
            // For this demo, we'll use the mock data already provided
            const response = await apiClient.get('/api/player-stats');
            
            if (response.status === 200 && response.data && response.data.stats) {
                this.playerStats = response.data.stats;
            } else {
                throw new Error('Invalid player stats data format');
            }
        } catch (error) {
            console.error(`Error loading stats for player ${playerId}:`, error);
            throw error;
        }
    }
    
    renderPlayerStats() {
        if (!this.container) return;
        
        // Clear container
        this.container.innerHTML = '';
        
        // Create title
        const titleElement = document.createElement('h2');
        titleElement.className = 'text-xl font-bold mb-4 text-white';
        titleElement.textContent = 'Player Statistics';
        this.container.appendChild(titleElement);
        
        // Create player selector
        this.renderPlayerSelector();
        
        // Render player profile and stats if available
        if (this.playerStats) {
            this.renderPlayerProfile();
            this.renderStatsBreakdown();
        } else if (this.players.length === 0) {
            this.showError('No player data available');
        } else {
            this.container.appendChild(document.createElement('div')).innerHTML = 
                '<div class="text-center py-8 text-gray-400">Select a player to view their statistics</div>';
        }
    }
    
    renderPlayerSelector() {
        if (!this.players.length) return;
        
        const selectorContainer = document.createElement('div');
        selectorContainer.className = 'mb-4';
        
        const label = document.createElement('label');
        label.htmlFor = 'player-selector';
        label.className = 'block text-sm font-medium text-gray-400 mb-1';
        label.textContent = 'Select Player:';
        
        const select = document.createElement('select');
        select.id = 'player-selector';
        select.className = 'bg-gray-700 border border-gray-600 text-white py-2 px-3 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
        
        // Add options for each player
        this.players.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.name} #${player.number}`;
            option.selected = player.id === this.selectedPlayerId;
            select.appendChild(option);
        });
        
        // Add change event listener
        select.addEventListener('change', async (e) => {
            this.selectedPlayerId = e.target.value;
            
            // Show loading state
            this.container.querySelector('.player-stats-content')?.classList.add('opacity-50');
            
            try {
                await this.loadPlayerStats(this.selectedPlayerId);
                this.renderPlayerStats();
            } catch (error) {
                console.error('Failed to load player stats:', error);
                this.showError('Failed to load player statistics');
            }
        });
        
        selectorContainer.appendChild(label);
        selectorContainer.appendChild(select);
        this.container.appendChild(selectorContainer);
    }
    
    renderPlayerProfile() {
        if (!this.playerStats || !this.playerStats.player) return;
        
        const player = this.playerStats.player;
        
        const profileContainer = document.createElement('div');
        profileContainer.className = 'player-stats-content bg-gray-900 rounded-lg overflow-hidden border border-gray-800 mb-4';
        
        // Profile header
        const header = document.createElement('div');
        header.className = 'bg-gray-800 p-4 flex items-center space-x-4';
        
        // Player photo
        const photoContainer = document.createElement('div');
        photoContainer.className = 'w-20 h-20 rounded-full bg-gray-700 overflow-hidden border-2 border-blue-500 flex-shrink-0';
        
        if (player.photo) {
            photoContainer.innerHTML = `<img src="${player.photo}" alt="${player.name}" class="w-full h-full object-cover">`;
        } else {
            // Placeholder if no photo
            photoContainer.innerHTML = `
                <div class="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-500">
                    ${player.name.charAt(0)}
                </div>
            `;
        }
        
        // Player info
        const infoContainer = document.createElement('div');
        infoContainer.className = 'flex-1';
        infoContainer.innerHTML = `
            <h3 class="text-xl font-bold text-white">${player.name}</h3>
            <div class="flex space-x-4 mt-1">
                <span class="text-sm text-gray-400">Position: <span class="text-white">${player.position || 'N/A'}</span></span>
                <span class="text-sm text-gray-400">Number: <span class="text-white">#${player.number}</span></span>
            </div>
        `;
        
        header.appendChild(photoContainer);
        header.appendChild(infoContainer);
        profileContainer.appendChild(header);
        
        // Player attributes
        const attributesContainer = document.createElement('div');
        attributesContainer.className = 'p-4 grid grid-cols-2 sm:grid-cols-4 gap-4';
        
        const attributes = [
            { label: 'Height', value: player.height || 'N/A' },
            { label: 'Weight', value: player.weight || 'N/A' },
            { label: 'Age', value: player.age ? `${player.age} years` : 'N/A' },
            { label: 'Experience', value: player.experience ? `${player.experience} years` : 'N/A' }
        ];
        
        attributes.forEach(attr => {
            const attribute = document.createElement('div');
            attribute.className = 'text-center';
            attribute.innerHTML = `
                <div class="text-xs text-gray-400">${attr.label}</div>
                <div class="text-lg font-semibold text-white">${attr.value}</div>
            `;
            attributesContainer.appendChild(attribute);
        });
        
        profileContainer.appendChild(attributesContainer);
        this.container.appendChild(profileContainer);
    }
    
    renderStatsBreakdown() {
        if (!this.playerStats || !this.playerStats.statistics) return;
        
        const stats = this.playerStats.statistics;
        
        const statsContainer = document.createElement('div');
        statsContainer.className = 'player-stats-content grid grid-cols-1 md:grid-cols-2 gap-4';
        
        // Basic stats card
        const basicStatsCard = document.createElement('div');
        basicStatsCard.className = 'bg-gray-900 rounded-lg border border-gray-800 overflow-hidden';
        
        const basicStatsHeader = document.createElement('div');
        basicStatsHeader.className = 'bg-gray-800 px-4 py-2';
        basicStatsHeader.innerHTML = `<h3 class="font-semibold text-white">Basic Statistics</h3>`;
        
        const basicStatsGrid = document.createElement('div');
        basicStatsGrid.className = 'grid grid-cols-3 gap-2 p-4';
        
        const basicStatItems = [
            { label: 'PPG', value: stats.ppg || 0 },
            { label: 'RPG', value: stats.rpg || 0 },
            { label: 'APG', value: stats.apg || 0 },
            { label: 'SPG', value: stats.spg || 0 },
            { label: 'BPG', value: stats.bpg || 0 },
            { label: 'TOPG', value: stats.topg || 0 },
            { label: 'FG%', value: `${stats.fgPercent || 0}%` },
            { label: '3PT%', value: `${stats.threePtPercent || 0}%` },
            { label: 'FT%', value: `${stats.ftPercent || 0}%` }
        ];
        
        basicStatItems.forEach(stat => {
            const statItem = document.createElement('div');
            statItem.className = 'text-center p-2';
            statItem.innerHTML = `
                <div class="text-xs text-gray-400">${stat.label}</div>
                <div class="text-lg font-semibold text-white">${stat.value}</div>
            `;
            basicStatsGrid.appendChild(statItem);
        });
        
        basicStatsCard.appendChild(basicStatsHeader);
        basicStatsCard.appendChild(basicStatsGrid);
        statsContainer.appendChild(basicStatsCard);
        
        // Advanced stats card
        const advancedStatsCard = document.createElement('div');
        advancedStatsCard.className = 'bg-gray-900 rounded-lg border border-gray-800 overflow-hidden';
        
        const advancedStatsHeader = document.createElement('div');
        advancedStatsHeader.className = 'bg-gray-800 px-4 py-2';
        advancedStatsHeader.innerHTML = `<h3 class="font-semibold text-white">Advanced Metrics</h3>`;
        
        const advancedStatsGrid = document.createElement('div');
        advancedStatsGrid.className = 'grid grid-cols-2 gap-4 p-4';
        
        const advancedStatItems = [
            { label: 'PER', value: stats.per || 0, description: 'Player Efficiency Rating' },
            { label: 'TS%', value: `${stats.tsPercent || 0}%`, description: 'True Shooting Percentage' },
            { label: 'USG%', value: `${stats.usgPercent || 0}%`, description: 'Usage Rate' },
            { label: 'VORP', value: stats.vorp || 0, description: 'Value Over Replacement Player' },
            { label: 'BPM', value: stats.bpm || 0, description: 'Box Plus/Minus' },
            { label: 'WS', value: stats.ws || 0, description: 'Win Shares' }
        ];
        
        advancedStatItems.forEach(stat => {
            const statItem = document.createElement('div');
            statItem.className = 'p-2';
            statItem.innerHTML = `
                <div class="flex justify-between items-center">
                    <div class="font-medium text-white">${stat.label}</div>
                    <div class="text-lg font-semibold text-white">${stat.value}</div>
                </div>
                <div class="text-xs text-gray-500">${stat.description}</div>
            `;
            advancedStatsGrid.appendChild(statItem);
        });
        
        advancedStatsCard.appendChild(advancedStatsHeader);
        advancedStatsCard.appendChild(advancedStatsGrid);
        statsContainer.appendChild(advancedStatsCard);
        
        this.container.appendChild(statsContainer);
    }
    
    showError(message) {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="bg-red-900/20 border border-red-800 rounded-md p-4 text-center">
                <svg class="w-8 h-8 mx-auto text-red-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-red-200">${message}</p>
            </div>
        `;
    }
}

export default PlayerStats; 