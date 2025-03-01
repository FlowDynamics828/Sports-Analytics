// Professional Sports Analytics Chart Management System
// Production Version 3.0

import { DataService } from '/scripts/dataService.js';
import { Toast } from '/scripts/toast.js';


class ChartManager {
    constructor() {
        this.charts = new Map();
        this.chartConfigs = {
            performance: {
                type: 'line',
                title: 'Team Performance',
                gridColor: 'rgba(255, 255, 255, 0.1)',
                colors: ['#3B82F6', '#10B981', '#F59E0B']
            },
            scoring: {
                type: 'bar',
                title: 'Scoring Distribution',
                gridColor: 'rgba(255, 255, 255, 0.1)',
                colors: ['#60A5FA', '#34D399', '#FBBF24']
            },
            winLoss: {
                type: 'doughnut',
                title: 'Win/Loss Record',
                colors: ['#10B981', '#EF4444', '#F59E0B']
            },
            playerPerformance: {
                type: 'radar',
                title: 'Player Performance Metrics',
                gridColor: 'rgba(255, 255, 255, 0.1)',
                colors: ['#3B82F6', '#F59E0B']
            }
        };
        this.defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 750,
                easing: 'easeInOutQuart'
            }
        };
    }

    async initialize() {
        try {
            await this.setupCharts();
            this.setupResizeHandler();
            console.log('Charts initialized successfully');
            return true;
        } catch (error) {
            console.error('Chart initialization failed:', error);
            throw error;
        }
    }

    async setupCharts() {
        // Performance Trend Chart
        this.createPerformanceChart();
        
        // Scoring Distribution Chart
        this.createScoringChart();
        
        // Win/Loss Record Chart
        this.createWinLossChart();
        
        // Player Performance Chart
        this.createPlayerPerformanceChart();
    }

    createPerformanceChart() {
        const ctx = document.getElementById('performanceChart')?.getContext('2d');
        if (!ctx) return;

        const config = this.chartConfigs.performance;
        const chart = new Chart(ctx, {
            type: config.type,
            data: {
                labels: [],
                datasets: [{
                    label: 'Performance Index',
                    data: [],
                    borderColor: config.colors[0],
                    backgroundColor: `${config.colors[0]}33`,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                ...this.defaultOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: config.gridColor },
                        ticks: { 
                            color: 'white',
                            callback: (value) => `${value}%`
                        }
                    },
                    x: {
                        grid: { color: config.gridColor },
                        ticks: { color: 'white' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: 'white' }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(17, 24, 39, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'rgba(255,255,255,0.8)',
                        borderColor: 'rgba(59, 130, 246, 0.5)',
                        borderWidth: 1
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        this.charts.set('performance', chart);
    }

    createScoringChart() {
        const ctx = document.getElementById('scoringChart')?.getContext('2d');
        if (!ctx) return;

        const config = this.chartConfigs.scoring;
        const chart = new Chart(ctx, {
            type: config.type,
            data: {
                labels: [],
                datasets: [{
                    label: 'Points Scored',
                    data: [],
                    backgroundColor: config.colors.map(color => `${color}CC`),
                    borderColor: config.colors,
                    borderWidth: 1
                }]
            },
            options: {
                ...this.defaultOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: config.gridColor },
                        ticks: { color: 'white' }
                    },
                    x: {
                        grid: { color: config.gridColor },
                        ticks: { color: 'white' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'rgba(255,255,255,0.8)',
                        callbacks: {
                            label: (context) => `Points: ${context.raw}`
                        }
                    }
                }
            }
        });

        this.charts.set('scoring', chart);
    }

    createWinLossChart() {
        const ctx = document.getElementById('winLossChart')?.getContext('2d');
        if (!ctx) return;

        const config = this.chartConfigs.winLoss;
        const chart = new Chart(ctx, {
            type: config.type,
            data: {
                labels: ['Wins', 'Losses', 'Draws'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: config.colors,
                    borderWidth: 0
                }]
            },
            options: {
                ...this.defaultOptions,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: 'white' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'rgba(255,255,255,0.8)',
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });

        this.charts.set('winLoss', chart);
    }

    createPlayerPerformanceChart() {
        const ctx = document.getElementById('playerChart')?.getContext('2d');
        if (!ctx) return;

        const config = this.chartConfigs.playerPerformance;
        const chart = new Chart(ctx, {
            type: config.type,
            data: {
                labels: ['Offense', 'Defense', 'Playmaking', 'Efficiency', 'Impact', 'Consistency'],
                datasets: [{
                    label: 'Current Performance',
                    data: [],
                    borderColor: config.colors[0],
                    backgroundColor: `${config.colors[0]}33`,
                    borderWidth: 2
                }, {
                    label: 'League Average',
                    data: [],
                    borderColor: config.colors[1],
                    backgroundColor: `${config.colors[1]}33`,
                    borderWidth: 2
                }]
            },
            options: {
                ...this.defaultOptions,
                scales: {
                    r: {
                        beginAtZero: true,
                        grid: { color: config.gridColor },
                        angleLines: { color: config.gridColor },
                        pointLabels: { color: 'white' },
                        ticks: { 
                            color: 'white',
                            backdropColor: 'transparent'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: 'white' }
                    }
                }
            }
        });

        this.charts.set('playerPerformance', chart);
    }

    async updateCharts(data) {
        try {
            this.updatePerformanceChart(data.performance);
            this.updateScoringChart(data.scoring);
            this.updateWinLossChart(data.record);
            this.updatePlayerPerformanceChart(data.players);
        } catch (error) {
            console.error('Chart update error:', error);
            throw error;
        }
    }

    updatePerformanceChart(data) {
        const chart = this.charts.get('performance');
        if (!chart) return;

        chart.data.labels = data.dates;
        chart.data.datasets[0].data = data.values;
        chart.update('none');
    }

    updateScoringChart(data) {
        const chart = this.charts.get('scoring');
        if (!chart) return;

        chart.data.labels = data.labels;
        chart.data.datasets[0].data = data.values;
        chart.update('none');
    }

    updateWinLossChart(data) {
        const chart = this.charts.get('winLoss');
        if (!chart) return;

        chart.data.datasets[0].data = [data.wins, data.losses, data.draws];
        chart.update('none');
    }

    updatePlayerPerformanceChart(data) {
        const chart = this.charts.get('playerPerformance');
        if (!chart) return;

        chart.data.datasets[0].data = data.current;
        chart.data.datasets[1].data = data.average;
        chart.update('none');
    }

    setupResizeHandler() {
        const resizeObserver = new ResizeObserver(_.debounce(() => {
            this.charts.forEach(chart => chart.resize());
        }, 250));

        document.querySelectorAll('[id$="Chart"]').forEach(element => {
            resizeObserver.observe(element);
        });
    }

    destroy() {
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();
    }
}

export default ChartManager;