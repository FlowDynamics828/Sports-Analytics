// Core services
export { DataService } from './dataService.js';
export { default as LoadingState } from './loadingstate.js';
export { default as ErrorBoundary } from './ErrorBoundary.js';
export { default as Toast } from './toast.js';
export { default as Cache } from './cache.js';
export { default as Auth } from './auth.js';

// Dashboard components
export { default as DashboardManager } from './dashboard.js';
export { default as NavigationManager } from './nav.js';
export { default as WebSocketManager } from './websocket.js';

// Data handling and visualization
export { default as DataVisualizations } from '../components/datavisualizations.js';

// Utilities
export { default as PredictiveModel } from '../../scripts/predictive_model.js';
export { default as LiveGameUpdater } from '../../scripts/live-game-updater.js';

// Constants
export const API_BASE = 'http://localhost:4000/api';
export const WS_BASE = 'ws://localhost:4000/ws';
export const MONGODB_URI = 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics';

// Initialize core services
export const initializeServices = async () => {
    try {
        await Auth.initialize();
        Cache.initialize();
        WebSocketManager.initialize();
        return true;
    } catch (error) {
        console.error('Failed to initialize services:', error);
        return false;
    }
};

// Event handlers
export const registerGlobalEventHandlers = () => {
    window.addEventListener('error', (error) => {
        console.error('Global error:', error);
        Toast.show('An unexpected error occurred', 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        Toast.show('Failed to complete operation', 'error');
    });
};

// Initialize everything
document.addEventListener('DOMContentLoaded', async () => {
    if (await initializeServices()) {
        registerGlobalEventHandlers();
    }
});