// Professional Sports Analytics Platform Initialization System
// Production Version 3.0

const requiredServices = ['auth', 'dashboard', 'charts', 'predictions', 'websocket'];

async function verifyServices() {
    for (const service of requiredServices) {
        if (!this.managers[service]) {
            throw new Error(`Required service ${service} not initialized`);
        }
    }
}

import { DashboardManager } from './dashboard.js';
import ChartManager from './charts.js';
import { PredictionManager } from './predictions.js';
import { AuthManager } from './auth.js';
import { WebSocketClient } from './websocket.js';
import { DataService } from './dataService.js';

class SystemInitializer {
    constructor() {
        this.managers = {
            auth: null,
            dashboard: null,
            charts: null,
            predictions: null,
            websocket: null,
            data: null
        };
        this.initStatus = {
            started: false,
            completed: false,
            error: null
        };
        this.config = {
            refreshInterval: 30000,
            connectionTimeout: 5000,
            retryAttempts: 3
        };
    }

    async initialize() {
        if (this.initStatus.started) {
            console.warn('Initialization already in progress');
            return;
        }

        this.initStatus.started = true;
        this.showLoadingScreen('Initializing Sports Analytics System...');

        try {
            console.log('Starting system initialization sequence');
            await this.initializeCore();
            await this.initializeManagers();
            await this.establishConnections();
            await this.loadInitialData();
            this.setupEventHandlers();
            this.startMonitoring();

            this.initStatus.completed = true;
            console.log('System initialization completed successfully');
            this.hideLoadingScreen();
        } catch (error) {
            this.initStatus.error = error;
            console.error('System initialization failed:', error);
            this.handleInitializationError(error);
        }
    }

    async initializeCore() {
        // Initialize core authentication
        this.managers.auth = new AuthManager();
        const isAuthenticated = await this.verifyAuthentication();
        if (!isAuthenticated) {
            throw new Error('Authentication required');
        }

        // Initialize data service
        this.managers.data = new DataService({
            baseUrl: '/api',
            token: this.managers.auth.getToken()
        });
    }

    async initializeManagers() {
        try {
            // Create manager instances
            this.managers.dashboard = new DashboardManager();
            this.managers.charts = new ChartManager();
            this.managers.predictions = new PredictionManager();
            this.managers.websocket = new WebSocketClient();

            // Initialize in parallel
            await Promise.all([
                this.managers.dashboard.initialize(),
                this.managers.charts.initialize(),
                this.managers.predictions.initialize(),
                this.managers.websocket.connect()
            ]);

        } catch (error) {
            console.error('Manager initialization failed:', error);
            throw error;
        }
    }

    async verifyAuthentication() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.redirectToLogin();
                return false;
            }

            const isValid = await this.managers.auth.validateToken(token);
            if (!isValid) {
                this.redirectToLogin();
                return false;
            }

            return true;
        } catch (error) {
            console.error('Authentication verification failed:', error);
            this.redirectToLogin();
            return false;
        }
    }

    async establishConnections() {
        try {
            // Setup WebSocket connection
            await this.managers.websocket.establishConnection({
                onMessage: this.handleWebSocketMessage.bind(this),
                onError: this.handleWebSocketError.bind(this),
                onClose: this.handleWebSocketClose.bind(this)
            });

            // Initialize real-time data streams
            await this.managers.data.initializeDataStreams();
        } catch (error) {
            console.error('Connection establishment failed:', error);
            throw error;
        }
    }

    async loadInitialData() {
        try {
            const [stats, predictions, preferences] = await Promise.all([
                this.managers.data.loadStatistics(),
                this.managers.data.loadPredictions(),
                this.managers.data.loadUserPreferences()
            ]);

            await this.managers.dashboard.updateDisplay(stats);
            await this.managers.charts.updateCharts(stats);
            await this.managers.predictions.updatePredictions(predictions);

            this.applyUserPreferences(preferences);
        } catch (error) {
            console.error('Initial data loading failed:', error);
            throw error;
        }
    }

    setupEventHandlers() {
        // Window events
        window.addEventListener('online', () => this.handleConnectionChange(true));
        window.addEventListener('offline', () => this.handleConnectionChange(false));
        window.addEventListener('focus', () => this.handleWindowFocus());
        window.addEventListener('blur', () => this.handleWindowBlur());

        // Error handling
        window.addEventListener('error', this.handleGlobalError.bind(this));
        (window as any).addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));

        // Custom events
        document.addEventListener('dataRefresh', this.handleDataRefresh.bind(this));
        document.addEventListener('userAction', this.handleUserAction.bind(this));
    }

    handleDataRefresh() {
        console.log('Data refresh event triggered');
        // Add your data refresh logic here
    }

    startMonitoring() {
        // Start periodic health checks
        setInterval(() => this.performHealthCheck(), this.config.refreshInterval);

        // Start data refresh cycles
        this.managers.dashboard.startAutoRefresh();
        this.managers.predictions.startAutoRefresh();

        // Initialize system monitoring
        this.initializeMonitoring();
    }

    handleUnhandledRejection(event) {
        console.error('Unhandled promise rejection:', event.reason);
        this.showErrorMessage({
            title: 'Unhandled Error',
            message: 'An unexpected error occurred. Please try again later.',
            error: event.reason,
            retry: false
        });
    }

    handleInitializationError(error) {
        console.error('Initialization error:', error);

        // Show user-friendly error message
        this.showErrorMessage({
            title: 'Initialization Failed',
            message: 'Unable to initialize the dashboard. Please try refreshing the page.',
            error: error,
            retry: true
        });
    }

    showLoadingScreen(message) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            const messageElement = loadingOverlay.querySelector('.loading-message');
            if (messageElement) {
                messageElement.textContent = message;
            }
            loadingOverlay.classList.remove('hidden');
        }
    }

    hideLoadingScreen() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('opacity-0');
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, 300);
        }
    }

    redirectToLogin() {
        window.location.href = '/login';
    }

    showErrorMessage({ title, message, error, retry = false }) {
        const errorToast = document.createElement('div');
        errorToast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-4 rounded-lg shadow-xl z-50';
        errorToast.innerHTML = `
            <div class="flex flex-col">
                <h4 class="font-bold mb-1">${title}</h4>
                <p class="mb-2">${message}</p>
                ${retry ? '<button class="bg-white text-red-500 px-4 py-1 rounded mt-2" onclick="window.location.reload()">Retry</button>' : ''}
            </div>
        `;
        document.body.appendChild(errorToast);

        setTimeout(() => {
            errorToast.classList.add('opacity-0');
            setTimeout(() => errorToast.remove(), 300);
        }, 5000);
    }

    destroy() {
        // Cleanup resources
        Object.values(this.managers).forEach(manager => {
            if (manager && typeof manager.destroy === 'function') {
                manager.destroy();
            }
        });

        // Clear event listeners
        this.removeEventListeners();

        // Reset status
        this.initStatus = {
            started: false,
            completed: false,
            error: null
        };
    }
}

// Create and initialize the system
const systemInitializer = new SystemInitializer();

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded, starting system initialization');
    systemInitializer.initialize().catch(console.error);
});

export default systemInitializer;