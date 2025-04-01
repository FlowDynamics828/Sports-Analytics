// Team Comparison module
import { apiClient } from '../utils/apiClient.js';
import { Logger } from '../utils/logger.js';

export class TeamComparison {
    constructor(elementId = 'team-comparison-content') {
        this.containerId = elementId;
        this.container = document.getElementById(elementId);
        this.chart = null;
        this.teams = [];
        this.metrics = [];
    }
    
    async initialize() {
        try {
            if (!this.container) {
                console.warn(`TeamComparison container #${this.containerId} not found`);
                return false;
            }
            
            // Add loading state
            this.container.innerHTML = '<div class="text-center py-4"><div class="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div><p class="mt-2 text-gray-400">Loading team comparison data...</p></div>';
            
            // Fetch comparison data
            await this.loadComparisonData();
            
            // Render chart
            this.renderChart();
            
            Logger.info('Team Comparison module initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Team Comparison module:', error);
            this.showError('Failed to load team comparison data');
            return false;
        }
    }
    
    async loadComparisonData() {
        try {
            const response = await apiClient.get('/api/team-comparison');
            
            if (response.status === 200 && response.data) {
                this.metrics = response.data.metrics || [];
                this.teams = response.data.teams || [];
            } else {
                throw new Error('Invalid data format');
            }
        } catch (error) {
            console.error('Error loading team comparison data:', error);
            throw error;
        }
    }
    
    renderChart() {
        if (!this.container || !this.metrics.length || !this.teams.length) {
            this.showError('No comparison data available');
            return;
        }
        
        // Prepare container
        this.container.innerHTML = '';
        
        // Create title
        const titleElement = document.createElement('h2');
        titleElement.className = 'text-xl font-bold mb-4 text-white';
        titleElement.textContent = 'Team Comparison';
        this.container.appendChild(titleElement);
        
        // Create chart container
        const chartContainer = document.createElement('div');
        chartContainer.className = 'relative h-64 md:h-80';
        chartContainer.style.minHeight = '320px';
        this.container.appendChild(chartContainer);
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'team-comparison-chart';
        chartContainer.appendChild(canvas);
        
        // Get labels and data
        const labels = this.metrics.map(metric => metric.name);
        const datasets = this.teams.map(team => ({
            label: team.name,
            data: team.values,
            backgroundColor: this.hexToRgba(team.color, 0.2),
            borderColor: team.color,
            pointBackgroundColor: team.color,
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: team.color
        }));
        
        // Create the chart
        this.chart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e5e7eb',
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.8)',
                        titleFont: {
                            size: 14
                        },
                        bodyFont: {
                            size: 13
                        },
                        bodySpacing: 4,
                        padding: 12
                    }
                },
                scales: {
                    r: {
                        angleLines: {
                            color: 'rgba(255, 255, 255, 0.15)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        pointLabels: {
                            color: '#e5e7eb',
                            font: {
                                size: 12
                            }
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            backdropColor: 'transparent',
                            showLabelBackdrop: false
                        }
                    }
                }
            }
        });
        
        // Add metrics explanation
        this.renderMetricsExplanation();
    }
    
    renderMetricsExplanation() {
        if (!this.metrics.length) return;
        
        const explanationContainer = document.createElement('div');
        explanationContainer.className = 'mt-6 pt-4 border-t border-gray-700 grid grid-cols-2 gap-3';
        
        this.metrics.forEach(metric => {
            const item = document.createElement('div');
            item.className = 'text-sm';
            
            const name = document.createElement('span');
            name.className = 'font-medium text-white';
            name.textContent = metric.name + ': ';
            
            const description = document.createElement('span');
            description.className = 'text-gray-400';
            description.textContent = metric.description;
            
            item.appendChild(name);
            item.appendChild(description);
            explanationContainer.appendChild(item);
        });
        
        this.container.appendChild(explanationContainer);
    }
    
    hexToRgba(hex, alpha = 1) {
        if (!hex) return 'rgba(128, 128, 128, ' + alpha + ')';
        
        // Default color if conversion fails
        if (typeof hex !== 'string') {
            return 'rgba(128, 128, 128, ' + alpha + ')';
        }
        
        // Remove the hash if it exists
        hex = hex.replace('#', '');
        
        // Convert 3-digit hex to 6-digit
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        
        // Extract the RGB components
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Return the RGBA value
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
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
    
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}

export default TeamComparison; 