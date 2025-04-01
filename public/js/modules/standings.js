// Standings module
import { apiClient } from '../utils/apiClient.js';
import { Logger } from '../utils/logger.js';

export class Standings {
    constructor(elementId = 'standings-content') {
        this.containerId = elementId;
        this.container = document.getElementById(elementId);
        this.standings = [];
    }
    
    async initialize() {
        try {
            if (!this.container) {
                console.warn(`Standings container #${this.containerId} not found`);
                return false;
            }
            
            // Add loading state
            this.container.innerHTML = '<div class="text-center py-4"><div class="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div><p class="mt-2 text-gray-400">Loading standings data...</p></div>';
            
            // Fetch standings data
            await this.loadStandings();
            
            // Render standings
            this.renderStandings();
            
            Logger.info('Standings module initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Standings module:', error);
            this.showError('Failed to load standings data');
            return false;
        }
    }
    
    async loadStandings() {
        try {
            const response = await apiClient.get('/api/standings');
            
            if (response.status === 200 && response.data && Array.isArray(response.data.standings)) {
                this.standings = response.data.standings;
            } else {
                throw new Error('Invalid standings data format');
            }
        } catch (error) {
            console.error('Error loading standings data:', error);
            throw error;
        }
    }
    
    renderStandings() {
        if (!this.container) return;
        
        if (!this.standings.length) {
            this.showError('No standings data available');
            return;
        }
        
        // Clear container
        this.container.innerHTML = '';
        
        // Create title
        const titleElement = document.createElement('h2');
        titleElement.className = 'text-xl font-bold mb-4 text-white';
        titleElement.textContent = 'Team Standings';
        this.container.appendChild(titleElement);
        
        // Create standings table
        const tableContainer = document.createElement('div');
        tableContainer.className = 'overflow-x-auto';
        this.container.appendChild(tableContainer);
        
        const table = document.createElement('table');
        table.className = 'min-w-full text-sm text-left text-gray-300';
        tableContainer.appendChild(table);
        
        // Create table header
        const thead = document.createElement('thead');
        thead.className = 'text-xs uppercase bg-gray-700 text-gray-300';
        table.appendChild(thead);
        
        const headerRow = document.createElement('tr');
        thead.appendChild(headerRow);
        
        const headers = [
            { text: 'Rank', class: 'px-4 py-3 w-12 text-center' },
            { text: 'Team', class: 'px-4 py-3' },
            { text: 'W', class: 'px-3 py-3 text-center' },
            { text: 'L', class: 'px-3 py-3 text-center' },
            { text: 'PCT', class: 'px-3 py-3 text-center' },
            { text: 'GB', class: 'px-3 py-3 text-center' },
            { text: 'Last 10', class: 'px-3 py-3 text-center hidden sm:table-cell' },
            { text: 'Streak', class: 'px-3 py-3 text-center hidden sm:table-cell' }
        ];
        
        headers.forEach(header => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.className = header.class;
            th.textContent = header.text;
            headerRow.appendChild(th);
        });
        
        // Create table body
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        
        // Add team rows
        this.standings.forEach((team, index) => {
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-900';
            
            // Rank cell
            const rankCell = document.createElement('td');
            rankCell.className = 'px-4 py-3 text-center font-medium';
            rankCell.textContent = index + 1;
            row.appendChild(rankCell);
            
            // Team cell
            const teamCell = document.createElement('td');
            teamCell.className = 'px-4 py-3 font-medium';
            teamCell.innerHTML = `
                <div class="flex items-center space-x-3">
                    <img src="${team.logo}" alt="${team.name}" class="w-6 h-6 object-contain">
                    <span>${team.name}</span>
                </div>
            `;
            row.appendChild(teamCell);
            
            // Wins cell
            const winsCell = document.createElement('td');
            winsCell.className = 'px-3 py-3 text-center';
            winsCell.textContent = team.wins;
            row.appendChild(winsCell);
            
            // Losses cell
            const lossesCell = document.createElement('td');
            lossesCell.className = 'px-3 py-3 text-center';
            lossesCell.textContent = team.losses;
            row.appendChild(lossesCell);
            
            // Winning percentage cell
            const pctCell = document.createElement('td');
            pctCell.className = 'px-3 py-3 text-center';
            pctCell.textContent = team.winningPct.toFixed(3).replace(/^0+/, '');
            row.appendChild(pctCell);
            
            // Games behind cell
            const gbCell = document.createElement('td');
            gbCell.className = 'px-3 py-3 text-center';
            gbCell.textContent = team.gamesBehind === 0 ? '-' : team.gamesBehind;
            row.appendChild(gbCell);
            
            // Last 10 cell
            const last10Cell = document.createElement('td');
            last10Cell.className = 'px-3 py-3 text-center hidden sm:table-cell';
            last10Cell.textContent = team.lastTen;
            row.appendChild(last10Cell);
            
            // Streak cell
            const streakCell = document.createElement('td');
            streakCell.className = 'px-3 py-3 text-center hidden sm:table-cell';
            
            // Color formatting for streaks
            if (team.streak.startsWith('W')) {
                streakCell.innerHTML = `<span class="text-green-500">${team.streak}</span>`;
            } else {
                streakCell.innerHTML = `<span class="text-red-500">${team.streak}</span>`;
            }
            
            row.appendChild(streakCell);
            
            tbody.appendChild(row);
        });
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

export default Standings; 