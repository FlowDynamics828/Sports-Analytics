// Predictions module
import { apiClient } from '../utils/apiClient.js';
import { Logger } from '../utils/logger.js';

export class Predictions {
    constructor(elementId = 'predictions-content') {
        this.containerId = elementId;
        this.container = document.getElementById(elementId);
        this.predictions = [];
    }
    
    async initialize() {
        try {
            if (!this.container) {
                console.warn(`Predictions container #${this.containerId} not found`);
                return false;
            }
            
            // Add loading state
            this.container.innerHTML = '<div class="text-center py-4"><div class="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div><p class="mt-2 text-gray-400">Loading predictions data...</p></div>';
            
            // Fetch predictions data
            await this.loadPredictions();
            
            // Render predictions
            this.renderPredictions();
            
            Logger.info('Predictions module initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Predictions module:', error);
            this.showError('Failed to load predictions data');
            return false;
        }
    }
    
    async loadPredictions() {
        try {
            const response = await apiClient.get('/api/predictions');
            
            if (response.status === 200 && response.data && Array.isArray(response.data.predictions)) {
                this.predictions = response.data.predictions;
            } else {
                throw new Error('Invalid predictions data format');
            }
        } catch (error) {
            console.error('Error loading predictions data:', error);
            throw error;
        }
    }
    
    renderPredictions() {
        if (!this.container) return;
        
        if (!this.predictions.length) {
            this.showError('No predictions data available');
            return;
        }
        
        // Clear container
        this.container.innerHTML = '';
        
        // Create title
        const titleElement = document.createElement('h2');
        titleElement.className = 'text-xl font-bold mb-4 text-white';
        titleElement.textContent = 'Game Predictions';
        this.container.appendChild(titleElement);
        
        // Create predictions container
        const predictionsContainer = document.createElement('div');
        predictionsContainer.className = 'grid gap-4';
        this.container.appendChild(predictionsContainer);
        
        // Add prediction cards
        this.predictions.forEach(prediction => {
            const card = this.createPredictionCard(prediction);
            predictionsContainer.appendChild(card);
        });
    }
    
    createPredictionCard(prediction) {
        const card = document.createElement('div');
        card.className = 'bg-gray-900 rounded-lg overflow-hidden border border-gray-800';
        
        // Format game time
        const gameDate = new Date(prediction.gameTime);
        const formattedDate = gameDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
        const formattedTime = gameDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        // Create header
        const header = document.createElement('div');
        header.className = 'bg-gray-800 px-4 py-2 flex justify-between items-center';
        header.innerHTML = `
            <div class="text-sm text-gray-300">${formattedDate} • ${formattedTime}</div>
            <div class="text-sm text-gray-400">${prediction.venue}</div>
        `;
        card.appendChild(header);
        
        // Create matchup section
        const matchupSection = document.createElement('div');
        matchupSection.className = 'p-4';
        
        // Team comparison
        const teamsContainer = document.createElement('div');
        teamsContainer.className = 'flex items-center justify-between mb-4';
        
        // Away team
        const awayTeam = document.createElement('div');
        awayTeam.className = 'flex flex-col items-center space-y-2 w-1/3';
        awayTeam.innerHTML = `
            <img src="${prediction.awayTeam.logo}" alt="${prediction.awayTeam.name}" class="w-16 h-16 object-contain">
            <div class="text-center">
                <div class="font-semibold text-white">${prediction.awayTeam.name}</div>
                <div class="text-3xl font-bold text-white">${prediction.predictedScore.away}</div>
            </div>
        `;
        
        // Center VS
        const vsContainer = document.createElement('div');
        vsContainer.className = 'w-1/3 flex flex-col items-center justify-center space-y-1';
        vsContainer.innerHTML = `
            <div class="text-xl font-bold text-gray-500">VS</div>
            <div class="text-sm text-gray-400">Predicted Score</div>
        `;
        
        // Home team
        const homeTeam = document.createElement('div');
        homeTeam.className = 'flex flex-col items-center space-y-2 w-1/3';
        homeTeam.innerHTML = `
            <img src="${prediction.homeTeam.logo}" alt="${prediction.homeTeam.name}" class="w-16 h-16 object-contain">
            <div class="text-center">
                <div class="font-semibold text-white">${prediction.homeTeam.name}</div>
                <div class="text-3xl font-bold text-white">${prediction.predictedScore.home}</div>
            </div>
        `;
        
        teamsContainer.appendChild(awayTeam);
        teamsContainer.appendChild(vsContainer);
        teamsContainer.appendChild(homeTeam);
        matchupSection.appendChild(teamsContainer);
        
        // Win probability
        const probabilityContainer = document.createElement('div');
        probabilityContainer.className = 'mt-3 mb-4';
        
        // Progress bar
        const progressContainer = document.createElement('div');
        progressContainer.className = 'h-6 rounded-full bg-gray-700 overflow-hidden';
        
        const progress = document.createElement('div');
        progress.className = 'h-full bg-gradient-to-r from-indigo-600 to-blue-500';
        progress.style.width = `${prediction.homeWinProb}%`;
        
        progressContainer.appendChild(progress);
        
        // Labels
        const labelsContainer = document.createElement('div');
        labelsContainer.className = 'flex justify-between text-sm mt-1';
        
        const awayLabel = document.createElement('div');
        awayLabel.className = 'text-gray-300';
        awayLabel.textContent = `${prediction.awayTeam.name}: ${prediction.awayWinProb}%`;
        
        const homeLabel = document.createElement('div');
        homeLabel.className = 'text-gray-300';
        homeLabel.textContent = `${prediction.homeTeam.name}: ${prediction.homeWinProb}%`;
        
        labelsContainer.appendChild(awayLabel);
        labelsContainer.appendChild(homeLabel);
        
        probabilityContainer.appendChild(progressContainer);
        probabilityContainer.appendChild(labelsContainer);
        matchupSection.appendChild(probabilityContainer);
        
        // Confidence
        const confidenceContainer = document.createElement('div');
        confidenceContainer.className = 'mt-4 pt-3 border-t border-gray-800 flex justify-between items-center';
        
        const confidenceLabel = document.createElement('div');
        confidenceLabel.className = 'text-sm text-gray-400';
        confidenceLabel.textContent = 'Model Confidence:';
        
        // Determine confidence level color
        let confidenceColor = 'text-yellow-500';
        if (prediction.confidence >= 80) {
            confidenceColor = 'text-green-500';
        } else if (prediction.confidence < 60) {
            confidenceColor = 'text-red-500';
        }
        
        const confidenceValue = document.createElement('div');
        confidenceValue.className = `text-lg font-semibold ${confidenceColor}`;
        confidenceValue.textContent = `${prediction.confidence}%`;
        
        confidenceContainer.appendChild(confidenceLabel);
        confidenceContainer.appendChild(confidenceValue);
        matchupSection.appendChild(confidenceContainer);
        
        card.appendChild(matchupSection);
        
        return card;
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

export default Predictions; 