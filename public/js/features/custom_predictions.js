/**
 * Enhanced Custom Predictions Module v2.0
 * Advanced multi-league sports prediction platform with interactive visualizations,
 * real-time updates, and machine learning-driven insights
 * 
 * Features:
 * - Progressive Web App for offline access
 * - Real-time WebSocket updates for live event tracking
 * - Voice recognition for natural language queries
 * - Interactive D3-based visualizations
 * - Multi-league support (NBA, NFL, MLB, NHL, Premier League, Serie A, Bundesliga, La Liga)
 * - Prediction comparison analytics
 * - Personalized ML-driven dashboards
 * - WCAG 2.1 AA compliant UI
 * - Export to multiple formats
 * - Social media integration
 */

import { Logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { apiClient } from '../utils/apiClient.js';
import { authService } from '../services/authService.js';
import { notificationService } from '../services/notificationService.js';
import { analyticsService } from '../services/analyticsService.js';
import { localStorageService } from '../services/localStorageService.js';
import { exportService } from '../utils/exportService.js';
import { speechRecognitionService } from '../utils/speechRecognitionService.js';
import { predictionEngine } from '../engines/predictionEngine.js';
import { dataVisualizationService } from '../services/dataVisualizationService.js';
import { leagueDataService } from '../services/leagueDataService.js';
import { mlService } from '../services/mlService.js';
import { accessibilityService } from '../services/accessibilityService.js';
import { comparatorService } from '../services/comparatorService.js';
import { socialSharingService } from '../services/socialSharingService.js';

// Import D3 for advanced visualizations
import * as d3 from 'd3';

// League data constants
import { 
    NBA_TEAMS, NFL_TEAMS, MLB_TEAMS, NHL_TEAMS, 
    PREMIER_LEAGUE_TEAMS, SERIE_A_TEAMS, BUNDESLIGA_TEAMS, LA_LIGA_TEAMS,
    LEAGUE_COLORS, LEAGUE_ICONS
} from '../constants/leagueData.js';

// API configuration with keys
const API_CONFIG = {
    predictionApiKey: 'ult_pred_api_9af721bc35d8e4f2',
    webSocketEndpoint: 'wss://api.sportspredictions.com/ws',
    mlEndpoint: 'https://ml.sportspredictions.com/predict',
    requestTimeout: 30000,
    maxRetries: 3
};

// PWA Configuration
const PWA_CONFIG = {
    cacheVersion: 'predictions-v1',
    offlineFallbackPage: '/offline.html',
    cachableResources: [
        '/styles/predictions.css',
        '/scripts/prediction-bundle.js',
        '/images/logos/*.png',
        '/fonts/*'
    ]
};

/**
 * Enhanced Custom Predictions Class
 */
class CustomPredictions {
    constructor() {
        // Core properties
        this.container = null;
        this.isInitialized = false;
        this.isLoading = false;
        this.currentPrediction = null;
        this.predictionHistory = [];
        this.maxFactors = 7; // Increased from 5
        this.factorInputs = [];
        this.webSocketConnection = null;
        this.speechRecognitionActive = false;
        this.offlineMode = false;
        this.currentLeague = 'all';
        this.userPreferences = {};
        this.customDashboardConfig = null;
        this.visualizationMode = 'standard';
        this.pendingComparisons = [];
        this.feedbackData = {
            submissions: 0,
            lastSubmitted: null,
            pendingSync: []
        };
        
        // Bind methods to maintain context
        this._handleWebSocketMessage = this._handleWebSocketMessage.bind(this);
        this._handleSpeechResult = this._handleSpeechResult.bind(this);
        this._handleAuthStatusChanged = this._handleAuthStatusChanged.bind(this);
        this._handleOfflineStatusChange = this._handleOfflineStatusChange.bind(this);
        this._saveToIndexedDB = this._saveToIndexedDB.bind(this);
        this._loadFromIndexedDB = this._loadFromIndexedDB.bind(this);
        
        // Initialize analytics tracking
        analyticsService.trackEvent('predictions_module', 'init');
    }
    
    /**
     * Initialize the custom predictions module with enhanced features
     */
    async initialize(containerId = 'custom-predictions-container') {
        try {
            Logger.info('Initializing enhanced custom predictions module');
            
            // Get container
            this.container = document.getElementById(containerId);
            if (!this.container) {
                Logger.error('Custom predictions container not found');
                return false;
            }
            
            // Check online status and set mode
            this.offlineMode = !navigator.onLine;
            window.addEventListener('online', this._handleOfflineStatusChange);
            window.addEventListener('offline', this._handleOfflineStatusChange);
            
            // Register service worker for PWA
            this._registerServiceWorker();
            
            // Load user preferences
            await this._loadUserPreferences();
            
            // Check if user has Ultra Premium access
            const hasAccess = await this._checkPremiumAccess();
            if (!hasAccess) {
                this._renderUpgradePrompt();
                return false;
            }
            
            // Initialize IndexedDB for offline storage
            await this._initializeIndexedDB();
            
            // Initialize feedback system
            await this._initializeFeedbackSystem();
            
            // Render the enhanced UI
            this._renderEnhancedUI();
            
            // Setup voice recognition if available
            this._setupSpeechRecognition();
            
            // Connect to WebSocket for real-time updates
            if (!this.offlineMode) {
                this._connectToWebSocket();
            }
            
            // Set up event listeners
            this._setupEventListeners();
            
            // Subscribe to relevant events
            eventBus.subscribe('auth:statusChanged', this._handleAuthStatusChanged);
            eventBus.subscribe('preferences:updated', this._handlePreferencesUpdated.bind(this));
            eventBus.subscribe('league:changed', this._handleLeagueChanged.bind(this));
            
            // Load prediction history (from server or local cache)
            await this._loadPredictionHistory();
            
            // Initialize accessibility features
            accessibilityService.enhanceAccessibility(this.container);
            
            // Fetch league data
            await this._fetchLeagueData();
            
            // Render personalized dashboard if available
            this._renderPersonalizedDashboard();
            
            // Track initialization
            analyticsService.trackEvent('predictions_module', 'initialized', {
                offline_mode: this.offlineMode,
                current_league: this.currentLeague,
                visualization_mode: this.visualizationMode
            });
            
            this.isInitialized = true;
            Logger.info('Enhanced custom predictions module initialized');
            return true;
            
        } catch (error) {
            Logger.error('Failed to initialize enhanced custom predictions:', error);
            this._renderErrorState(error);
            return false;
        }
    }
    
    /**
     * Register service worker for PWA capabilities
     */
    async _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/'
                });
                Logger.info('Service Worker registered with scope:', registration.scope);
            } catch (error) {
                Logger.error('Service Worker registration failed:', error);
            }
        }
    }
    
    /**
     * Initialize IndexedDB for offline storage
     */
    async _initializeIndexedDB() {
        try {
            const dbPromise = indexedDB.open('PredictionsDB', 1);
            
            dbPromise.onupgradeneeded = function(event) {
                const db = event.target.result;
                
                // Create predictions store
                if (!db.objectStoreNames.contains('predictions')) {
                    const predictionStore = db.createObjectStore('predictions', { keyPath: 'id' });
                    predictionStore.createIndex('timestamp', 'timestamp', { unique: false });
                    predictionStore.createIndex('type', 'type', { unique: false });
                    predictionStore.createIndex('league', 'league', { unique: false });
                }
                
                // Create user preferences store
                if (!db.objectStoreNames.contains('userPreferences')) {
                    db.createObjectStore('userPreferences', { keyPath: 'id' });
                }
                
                // Create comparisons store
                if (!db.objectStoreNames.contains('comparisons')) {
                    const comparisonsStore = db.createObjectStore('comparisons', { keyPath: 'id' });
                    comparisonsStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            
            return new Promise((resolve, reject) => {
                dbPromise.onsuccess = function(event) {
                    Logger.info('IndexedDB initialized successfully');
                    resolve(event.target.result);
                };
                
                dbPromise.onerror = function(event) {
                    Logger.error('Error initializing IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            Logger.error('IndexedDB initialization error:', error);
            throw error;
        }
    }
    
    /**
     * Save prediction to IndexedDB for offline access
     */
    async _saveToIndexedDB(prediction) {
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['predictions'], 'readwrite');
            const store = transaction.objectStore('predictions');
            
            // Add unique ID and timestamp if not present
            prediction.id = prediction.id || `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            prediction.timestamp = prediction.timestamp || Date.now();
            prediction.synced = prediction.synced || false;
            
            await store.put(prediction);
            Logger.info('Prediction saved to IndexedDB:', prediction.id);
            return prediction;
        } catch (error) {
            Logger.error('Error saving to IndexedDB:', error);
            throw error;
        }
    }
    
    /**
     * Load predictions from IndexedDB
     */
    async _loadFromIndexedDB(limit = 10) {
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['predictions'], 'readonly');
            const store = transaction.objectStore('predictions');
            const index = store.index('timestamp');
            
            return new Promise((resolve, reject) => {
                const request = index.openCursor(null, 'prev');
                const results = [];
                
                request.onsuccess = function(event) {
                    const cursor = event.target.result;
                    if (cursor && results.length < limit) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };
                
                request.onerror = function(event) {
                    reject(event.target.error);
                };
            });
        } catch (error) {
            Logger.error('Error loading from IndexedDB:', error);
            return [];
        }
    }
    
    /**
     * Get IndexedDB instance
     */
    async _getIndexedDBInstance() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PredictionsDB', 1);
            
            request.onsuccess = function(event) {
                resolve(event.target.result);
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }
    
    /**
     * Load user preferences from server or local storage
     */
    async _loadUserPreferences() {
        try {
            if (this.offlineMode) {
                // Load from IndexedDB in offline mode
                const db = await this._getIndexedDBInstance();
                const transaction = db.transaction(['userPreferences'], 'readonly');
                const store = transaction.objectStore('userPreferences');
                
                return new Promise((resolve, reject) => {
                    const request = store.get('userPrefs');
                    
                    request.onsuccess = (event) => {
                        if (event.target.result) {
                            this.userPreferences = event.target.result.data || {};
                            this.customDashboardConfig = event.target.result.dashboardConfig || null;
                        }
                        resolve();
                    };
                    
                    request.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            } else {
                // Load from server
                const response = await apiClient.get('/api/users/preferences', {
                    headers: {
                        'Authorization': `Bearer ${authService.getToken()}`,
                        'X-API-Key': API_CONFIG.predictionApiKey
                    }
                });
                
                if (response.status === 'success') {
                    this.userPreferences = response.data.preferences || {};
                    this.customDashboardConfig = response.data.dashboardConfig || null;
                    
                    // Save to IndexedDB for offline access
                    const db = await this._getIndexedDBInstance();
                    const transaction = db.transaction(['userPreferences'], 'readwrite');
                    const store = transaction.objectStore('userPreferences');
                    
                    await store.put({
                        id: 'userPrefs',
                        data: this.userPreferences,
                        dashboardConfig: this.customDashboardConfig,
                        updatedAt: Date.now()
                    });
                }
            }
        } catch (error) {
            Logger.error('Error loading user preferences:', error);
            // Use default preferences
            this.userPreferences = {
                favoriteLeagues: ['NBA', 'NFL'],
                favoriteTeams: [],
                predictionDisplayMode: 'detailed',
                theme: 'auto',
                notificationsEnabled: true,
                visualizationPreference: 'standard'
            };
        }
    }
    
    /**
     * Check if user has Ultra Premium access
     */
    async _checkPremiumAccess() {
        try {
            // Try to get from local storage first for faster loading
            const cachedStatus = localStorageService.get('premium_access_status');
            if (cachedStatus && cachedStatus.expiry > Date.now()) {
                return cachedStatus.hasPremium;
            }
            
            // If offline and no cached status, assume they have access
            // (we'll verify when they go back online)
            if (this.offlineMode) {
                return true;
            }
            
            const userStatus = await authService.getUserStatus();
            const hasPremium = userStatus.subscription && 
                              (userStatus.subscription.tier === 'ultra_premium' || 
                               userStatus.subscription.tier === 'enterprise');
            
            // Cache the result for 1 hour
            localStorageService.set('premium_access_status', {
                hasPremium,
                expiry: Date.now() + (60 * 60 * 1000)
            });
            
            return hasPremium;
        } catch (error) {
            Logger.error('Error checking premium access:', error);
            
            // If offline, give benefit of the doubt
            if (this.offlineMode) {
                return true;
            }
            
            return false;
        }
    }
    
    /**
     * Handle online/offline status change
     */
    async _handleOfflineStatusChange(event) {
        const isOnline = navigator.onLine;
        
        if (isOnline && this.offlineMode) {
            // Switched from offline to online
            this.offlineMode = false;
            notificationService.showNotification('Back online! Syncing your predictions...', 'info');
            
            // Connect to WebSocket
            this._connectToWebSocket();
            
            // Sync offline predictions
            await this._syncOfflinePredictions();
            
            // Refresh the UI with latest data
            this._renderEnhancedUI();
            
        } else if (!isOnline && !this.offlineMode) {
            // Switched from online to offline
            this.offlineMode = true;
            notificationService.showNotification('You\'re offline. Predictions will be saved locally.', 'warning');
            
            // Disconnect WebSocket
            if (this.webSocketConnection) {
                this.webSocketConnection.close();
                this.webSocketConnection = null;
            }
            
            // Update UI to show offline mode
            this._updateOfflineUI();
        }
    }
    
    /**
     * Update UI to show offline mode
     */
    _updateOfflineUI() {
        // Add offline indicator
        const header = this.container.querySelector('.card-header');
        if (header) {
            const offlineIndicator = document.createElement('div');
            offlineIndicator.id = 'offline-indicator';
            offlineIndicator.className = 'offline-badge px-2 py-1 bg-warning rounded-pill text-xs font-weight-bold ms-2';
            offlineIndicator.textContent = 'OFFLINE';
            
            if (!header.querySelector('#offline-indicator')) {
                header.appendChild(offlineIndicator);
            }
        }
        
        // Disable features that require online connection
        const disabledButtons = [
            '#share-prediction-btn',
            '#export-prediction-btn',
            '#multi-predict-button',
            '#single-predict-button'
        ];
        
        disabledButtons.forEach(selector => {
            const button = this.container.querySelector(selector);
            if (button) {
                button.disabled = true;
                button.title = 'This feature requires an internet connection';
            }
        });
        
        // Show offline message
        const resultsContainer = this.container.querySelector('#prediction-results');
        if (resultsContainer && !resultsContainer.classList.contains('d-none')) {
            const offlineMessage = document.createElement('div');
            offlineMessage.className = 'alert alert-warning mt-3';
            offlineMessage.innerHTML = '<i class="fas fa-wifi-slash"></i> You\'re currently offline. This prediction is saved locally and will sync when you\'re back online.';
            
            if (!resultsContainer.querySelector('.alert-warning')) {
                resultsContainer.appendChild(offlineMessage);
            }
        }
    }
    
    /**
     * Sync offline predictions when coming back online
     */
    async _syncOfflinePredictions() {
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['predictions'], 'readonly');
            const store = transaction.objectStore('predictions');
            
            return new Promise((resolve, reject) => {
                const request = store.index('synced').openCursor(IDBKeyRange.only(false));
                const unsyncedPredictions = [];
                
                request.onsuccess = async function(event) {
                    const cursor = event.target.result;
                    
                    if (cursor) {
                        unsyncedPredictions.push(cursor.value);
                        cursor.continue();
                    } else {
                        // Now sync all unsynced predictions
                        for (const prediction of unsyncedPredictions) {
                            try {
                                // Send to server
                                await apiClient.post('/api/predictions/sync', {
                                    prediction: prediction
                                });
                                
                                // Mark as synced
                                prediction.synced = true;
                                const updateTx = db.transaction(['predictions'], 'readwrite');
                                const updateStore = updateTx.objectStore('predictions');
                                await updateStore.put(prediction);
                            } catch (error) {
                                Logger.error('Error syncing prediction:', error);
                            }
                        }
                        
                        resolve(unsyncedPredictions.length);
                    }
                };
                
                request.onerror = function(event) {
                    reject(event.target.error);
                };
            });
        } catch (error) {
            Logger.error('Error syncing offline predictions:', error);
            return 0;
        }
    }
    
    /**
     * Connect to WebSocket for real-time updates
     */
    _connectToWebSocket() {
        if (this.webSocketConnection) {
            this.webSocketConnection.close();
        }
        
        try {
            const token = authService.getToken();
            this.webSocketConnection = new WebSocket(`${API_CONFIG.webSocketEndpoint}?token=${token}`);
            
            this.webSocketConnection.onopen = () => {
                Logger.info('WebSocket connection established');
                // Subscribe to relevant updates
                this._subscribeToLiveUpdates();
            };
            
            this.webSocketConnection.onmessage = this._handleWebSocketMessage;
            
            this.webSocketConnection.onerror = (error) => {
                Logger.error('WebSocket error:', error);
            };
            
            this.webSocketConnection.onclose = () => {
                Logger.info('WebSocket connection closed');
                // Try to reconnect after a delay
                setTimeout(() => {
                    if (!this.offlineMode) {
                        this._connectToWebSocket();
                    }
                }, 5000);
            };
        } catch (error) {
            Logger.error('Error connecting to WebSocket:', error);
        }
    }
    
    /**
     * Subscribe to live updates via WebSocket
     */
    _subscribeToLiveUpdates() {
        if (!this.webSocketConnection || this.webSocketConnection.readyState !== WebSocket.OPEN) {
            return;
        }
        
        // Get user's favorite teams and leagues from preferences
        const favoriteTeams = this.userPreferences.favoriteTeams || [];
        const favoriteLeagues = this.userPreferences.favoriteLeagues || [];
        
        // Subscribe to relevant topics
        this.webSocketConnection.send(JSON.stringify({
            action: 'subscribe',
            topics: [
                'predictions.updates',
                'live.scores',
                ...favoriteLeagues.map(league => `league.${league.toLowerCase()}`),
                ...favoriteTeams.map(team => `team.${team.toLowerCase().replace(/\s+/g, '-')}`)
            ]
        }));
    }
    
    /**
     * Handle WebSocket messages for real-time updates
     */
    _handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'prediction_update':
                    this._handlePredictionUpdate(data.payload);
                    break;
                
                case 'live_score_update':
                    this._handleLiveScoreUpdate(data.payload);
                    break;
                
                case 'odds_change':
                    this._handleOddsChange(data.payload);
                    break;
                
                case 'player_status_update':
                    this._handlePlayerStatusUpdate(data.payload);
                    break;
                
                case 'game_status_update':
                    this._handleGameStatusUpdate(data.payload);
                    break;
                
                case 'system_message':
                    notificationService.showNotification(data.payload.message, data.payload.level || 'info');
                    break;
            }
            
            // Dispatch event for other components
            eventBus.publish('websocket:message', data);
            
        } catch (error) {
            Logger.error('Error handling WebSocket message:', error);
        }
    }
    
    /**
     * Handle prediction update from WebSocket
     */
    _handlePredictionUpdate(payload) {
        // If this prediction is currently displayed, update it
        if (this.currentPrediction && this.currentPrediction.id === payload.predictionId) {
            // Update current prediction
            this.currentPrediction = {
                ...this.currentPrediction,
                ...payload.updates
            };
            
            // Re-render the prediction
            this._displayPredictionResults(this.currentPrediction, this.currentPrediction.type === 'multi');
            
            // Show notification
            notificationService.showNotification('Prediction updated with latest data', 'info');
        }
        
        // Update prediction in history if it exists
        const historyIndex = this.predictionHistory.findIndex(p => p.id === payload.predictionId);
        if (historyIndex >= 0) {
            this.predictionHistory[historyIndex] = {
                ...this.predictionHistory[historyIndex],
                ...payload.updates
            };
            
            // Update history display
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Handle live score update from WebSocket
     */
    _handleLiveScoreUpdate(payload) {
        // Find relevant predictions that might be affected by this score
        const affectedPredictions = this._findAffectedPredictions(payload);
        
        // If any affected predictions are found, highlight them in the UI
        if (affectedPredictions.length > 0) {
            affectedPredictions.forEach(prediction => {
                this._highlightAffectedPrediction(prediction.id, payload);
            });
            
            // Show notification
            const game = `${payload.awayTeam} @ ${payload.homeTeam}`;
            notificationService.showNotification(`Score update: ${game} | ${payload.awayScore}-${payload.homeScore}`, 'info');
        }
        
        // Update live game indicators
        this._updateLiveGameIndicators(payload);
    }
    
    /**
     * Find predictions affected by a live update
     */
    _findAffectedPredictions(payload) {
        return this.predictionHistory.filter(prediction => {
            // For single-factor predictions
            if (prediction.type === 'single' && prediction.factor) {
                const factorText = prediction.factor.toLowerCase();
                const homeTeam = payload.homeTeam.toLowerCase();
                const awayTeam = payload.awayTeam.toLowerCase();
                
                return factorText.includes(homeTeam) || factorText.includes(awayTeam);
            }
            
            // For multi-factor predictions
            if (prediction.type === 'multi' && prediction.factors) {
                const homeTeam = payload.homeTeam.toLowerCase();
                const awayTeam = payload.awayTeam.toLowerCase();
                
                return prediction.factors.some(factor => 
                    factor.toLowerCase().includes(homeTeam) || 
                    factor.toLowerCase().includes(awayTeam)
                );
            }
            
            return false;
        });
    }
    
    /**
     * Highlight a prediction affected by a live update
     */
    _highlightAffectedPrediction(predictionId, update) {
        const historyItem = this.container.querySelector(`.history-item[data-prediction-id="${predictionId}"]`);
        
        if (historyItem) {
            // Add live update indicator
            const liveIndicator = document.createElement('div');
            liveIndicator.className = 'live-update-indicator pulse-animation';
            liveIndicator.innerHTML = '<i class="fas fa-bolt"></i> LIVE';
            
            // Replace existing indicator or add new one
            const existingIndicator = historyItem.querySelector('.live-update-indicator');
            if (existingIndicator) {
                existingIndicator.replaceWith(liveIndicator);
            } else {
                historyItem.appendChild(liveIndicator);
            }
            
            // Add update details tooltip
            historyItem.setAttribute('data-bs-toggle', 'tooltip');
            historyItem.setAttribute('data-bs-placement', 'top');
            historyItem.setAttribute('data-bs-html', 'true');
            historyItem.setAttribute('title', `
                <strong>${update.homeTeam} vs ${update.awayTeam}</strong><br>
                Score: ${update.homeScore}-${update.awayScore}<br>
                ${update.period} | ${update.timeRemaining}
            `);
            
            // Initialize tooltip
            new bootstrap.Tooltip(historyItem);
            
            // Add highlight animation
            historyItem.classList.add('prediction-update-highlight');
            setTimeout(() => {
                historyItem.classList.remove('prediction-update-highlight');
            }, 3000);
        }
    }
    
    /**
     * Update live game indicators
     */
    _updateLiveGameIndicators(update) {
        // Update global live games indicators
        const liveGamesContainer = document.getElementById('live-games-container');
        
        if (liveGamesContainer) {
            // Check if this game is already displayed
            const gameId = `${update.homeTeam}-${update.awayTeam}`.toLowerCase().replace(/\s+/g, '-');
            let gameElement = liveGamesContainer.querySelector(`[data-game-id="${gameId}"]`);
            
            if (!gameElement) {
                // Create new game element
                gameElement = document.createElement('div');
                gameElement.className = 'live-game-pill d-inline-flex align-items-center me-2 mb-2 py-1 px-2 rounded bg-danger text-white';
                gameElement.setAttribute('data-game-id', gameId);
                liveGamesContainer.appendChild(gameElement);
            }
            
            // Update content
            gameElement.innerHTML = `
                <span class="live-indicator me-1"></span>
                <span>${update.awayTeam} ${update.awayScore} @ ${update.homeTeam} ${update.homeScore}</span>
                <span class="ms-1 text-xs opacity-75">${update.timeRemaining}</span>
            `;
        }
    }
    
    /**
     * Handle odds change from WebSocket
     */
    _handleOddsChange(payload) {
        // Find predictions affected by odds change
        const affectedPredictions = this._findPredictionsAffectedByOdds(payload);
        
        if (affectedPredictions.length > 0) {
            // Update affected predictions
            affectedPredictions.forEach(prediction => {
                // Calculate probability impact
                const probabilityDelta = this._calculateProbabilityDelta(prediction, payload);
                
                // Update prediction if significant change
                if (Math.abs(probabilityDelta) >= 0.05) { // 5% change threshold
                    this._updatePredictionWithNewOdds(prediction.id, payload, probabilityDelta);
                }
            });
            
            // Show notification for significant odds changes
            const significantChange = affectedPredictions.some(p => 
                Math.abs(this._calculateProbabilityDelta(p, payload)) >= 0.1
            );
            
            if (significantChange) {
                notificationService.showNotification(
                    `Significant odds change for ${payload.team || payload.player}`,
                    'warning'
                );
            }
        }
    }
    
    /**
     * Find predictions affected by odds change
     */
    _findPredictionsAffectedByOdds(payload) {
        return this.predictionHistory.filter(prediction => {
            const content = prediction.type === 'single' 
                ? prediction.factor 
                : prediction.factors ? prediction.factors.join(' ') : '';
                
            if (!content) return false;
            
            const contentLower = content.toLowerCase();
            const entityLower = (payload.team || payload.player || '').toLowerCase();
            
            return entityLower && contentLower.includes(entityLower);
        });
    }
    
    /**
     * Calculate probability change from odds update
     */
    _calculateProbabilityDelta(prediction, oddsPayload) {
        // This would normally use a complex algorithm based on your prediction model
        // Simplified example:
        const oldOdds = oddsPayload.previousOdds;
        const newOdds = oddsPayload.currentOdds;
        
        // Convert American odds to probability
        const oddsToProb = (odds) => {
            if (odds > 0) {
                return 100 / (odds + 100);
            } else {
                return Math.abs(odds) / (Math.abs(odds) + 100);
            }
        };
        
        const oldProb = oddsToProb(oldOdds);
        const newProb = oddsToProb(newOdds);
        
        return newProb - oldProb;
    }
    
    /**
     * Update prediction with new odds
     */
    _updatePredictionWithNewOdds(predictionId, oddsPayload, probabilityDelta) {
        // Find prediction in history
        const predictionIndex = this.predictionHistory.findIndex(p => p.id === predictionId);
        
        if (predictionIndex >= 0) {
            const prediction = this.predictionHistory[predictionIndex];
            
            // Update probability
            if (prediction.type === 'single') {
                prediction.result.probability += probabilityDelta;
                // Ensure probability stays in valid range
                prediction.result.probability = Math.max(0, Math.min(1, prediction.result.probability));
            } else if (prediction.type === 'multi') {
                // For multi-factor, update individual probabilities that match
                const entity = (oddsPayload.team || oddsPayload.player || '').toLowerCase();
                
                prediction.result.individual_probabilities = 
                    prediction.result.individual_probabilities.map((prob, i) => {
                        const factor = prediction.factors[i].toLowerCase();
                        return factor.includes(entity) ? 
                            Math.max(0, Math.min(1, prob + probabilityDelta)) : 
                            prob;
                    });
                
                // Recalculate combined probability
                prediction.result.combined_probability = 
                    prediction.result.individual_probabilities.reduce((acc, p) => acc * p, 1);
            }
            
            // Add odds update to prediction
            prediction.oddsUpdates = prediction.oddsUpdates || [];
            prediction.oddsUpdates.push({
                timestamp: Date.now(),
                entity: oddsPayload.team || oddsPayload.player,
                previousOdds: oddsPayload.previousOdds,
                currentOdds: oddsPayload.currentOdds,
                probabilityDelta: probabilityDelta
            });
            
            // Update in history
            this.predictionHistory[predictionIndex] = prediction;
            
            // If this is the current prediction, update display
            if (this.currentPrediction && this.currentPrediction.id === predictionId) {
                this.currentPrediction = prediction;
                this._displayPredictionResults(
                    this.currentPrediction, 
                    this.currentPrediction.type === 'multi'
                );
            }
            
            // Update history display
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Handle player status update from WebSocket
     */
    _handlePlayerStatusUpdate(payload) {
        // Find predictions that mention this player
        const playerName = payload.playerName.toLowerCase();
        const affectedPredictions = this.predictionHistory.filter(prediction => {
            const content = prediction.type === 'single' 
                ? prediction.factor 
                : prediction.factors ? prediction.factors.join(' ') : '';
                
            return content.toLowerCase().includes(playerName);
        });
        
        if (affectedPredictions.length > 0) {
            // Show notification
            const statusIcon = payload.status === 'active' ? '✅' : 
                               payload.status === 'questionable' ? '⚠️' : 
                               payload.status === 'out' ? '❌' : '❓';
                               
            notificationService.showNotification(
                `${statusIcon} ${payload.playerName} is now ${payload.status.toUpperCase()} for ${payload.team}`,
                payload.status === 'active' ? 'success' : 
                payload.status === 'questionable' ? 'warning' : 'danger'
            );
            
            // Update affected predictions with player status
            affectedPredictions.forEach(prediction => {
                // Add player status update
                prediction.playerUpdates = prediction.playerUpdates || [];
                prediction.playerUpdates.push({
                    playerName: payload.playerName,
                    team: payload.team,
                    previousStatus: payload.previousStatus,
                    currentStatus: payload.status,
                    timestamp: Date.now()
                });
                
                // If status changed from active to out, adjust probability significantly
                if (payload.previousStatus === 'active' && payload.status === 'out') {
                    if (prediction.type === 'single') {
                        // Reduce probability based on player importance
                        prediction.result.probability *= 0.7; // Example: 30% reduction
                    } else if (prediction.type === 'multi') {
                        // Reduce individual probabilities for factors mentioning the player
                        prediction.result.individual_probabilities = 
                            prediction.result.individual_probabilities.map((prob, i) => {
                                const factor = prediction.factors[i].toLowerCase();
                                return factor.includes(playerName) ? prob * 0.7 : prob;
                            });
                        
                        // Recalculate combined probability
                        prediction.result.combined_probability = 
                            prediction.result.individual_probabilities.reduce((acc, p) => acc * p, 1);
                    }
                }
            });
            
            // Update current prediction if affected
            if (this.currentPrediction && affectedPredictions.some(p => p.id === this.currentPrediction.id)) {
                this.currentPrediction = this.predictionHistory.find(p => p.id === this.currentPrediction.id);
                this._displayPredictionResults(
                    this.currentPrediction, 
                    this.currentPrediction.type === 'multi'
                );
            }
            
            // Update history display
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Handle game status update from WebSocket
     */
    _handleGameStatusUpdate(payload) {
        // Find predictions related to this game
        const homeTeam = payload.homeTeam.toLowerCase();
        const awayTeam = payload.awayTeam.toLowerCase();
        
        const affectedPredictions = this.predictionHistory.filter(prediction => {
            const content = prediction.type === 'single' 
                ? prediction.factor 
                : prediction.factors ? prediction.factors.join(' ') : '';
                
            return content.toLowerCase().includes(homeTeam) || 
                   content.toLowerCase().includes(awayTeam);
        });
        
        if (affectedPredictions.length > 0) {
            // Show notification for game start or end
            if (payload.status === 'in_progress' && payload.previousStatus === 'scheduled') {
                notificationService.showNotification(
                    `🏆 Game Started: ${payload.awayTeam} @ ${payload.homeTeam}`,
                    'info'
                );
            } else if (payload.status === 'final') {
                notificationService.showNotification(
                    `🏁 Final Score: ${payload.awayTeam} ${payload.awayScore}, ${payload.homeTeam} ${payload.homeScore}`,
                    'info'
                );
                
                // Update predictions with final result
                affectedPredictions.forEach(prediction => {
                    prediction.gameResults = prediction.gameResults || [];
                    prediction.gameResults.push({
                        homeTeam: payload.homeTeam,
                        awayTeam: payload.awayTeam,
                        homeScore: payload.homeScore,
                        awayScore: payload.awayScore,
                        timestamp: Date.now()
                    });
                    
                    // Mark prediction as resolved if possible
                    if (this._canResolvePrediction(prediction, payload)) {
                        prediction.resolved = true;
                        prediction.resolvedResult = this._determineResolvedResult(prediction, payload);
                        prediction.resolvedTimestamp = Date.now();
                    }
                });
                
                // Update current prediction if affected
                if (this.currentPrediction && affectedPredictions.some(p => p.id === this.currentPrediction.id)) {
                    this.currentPrediction = this.predictionHistory.find(p => p.id === this.currentPrediction.id);
                    
                    if (this.currentPrediction.resolved) {
                        this._displayResolvedPrediction(this.currentPrediction);
                    } else {
                        this._displayPredictionResults(
                            this.currentPrediction, 
                            this.currentPrediction.type === 'multi'
                        );
                    }
                }
                
                // Update history display
                this._updatePredictionHistory();
            }
        }
    }
    
    /**
     * Determine if a prediction can be resolved based on game result
     */
    _canResolvePrediction(prediction, gameResult) {
        // This would normally use NLP to parse the prediction and compare with game result
        // For example, if prediction is "Lakers win by 10+ points"
        // and Lakers won by 15, this should return true
        
        // Simplified example:
        const factor = prediction.type === 'single' ? prediction.factor : '';
        
        if (!factor) return false;
        
        const homeTeam = gameResult.homeTeam.toLowerCase();
        const awayTeam = gameResult.awayTeam.toLowerCase();
        
        // Very basic pattern matching for demonstration
        const homeWin = gameResult.homeScore > gameResult.awayScore;
        const awayWin = gameResult.awayScore > gameResult.homeScore;
        
        if (factor.toLowerCase().includes(`${homeTeam} win`) && homeWin) {
            return true;
        }
        
        if (factor.toLowerCase().includes(`${awayTeam} win`) && awayWin) {
            return true;
        }
        
        // Handle point spread patterns, etc.
        // This would be far more sophisticated in a real implementation
        
        return false;
    }
    
    /**
     * Determine the result of a resolved prediction
     */
    _determineResolvedResult(prediction, gameResult) {
        // This would use NLP to parse the prediction and determine if it was correct
        // Simplified example:
        return {
            correct: true, // Would be determined by comparing prediction to actual result
            actualResult: `${gameResult.homeTeam} ${gameResult.homeScore}, ${gameResult.awayTeam} ${gameResult.awayScore}`,
            winAmount: prediction.result.probability > 0.5 ? 100 : 0 // Example calculation
        };
    }
    
    /**
     * Display a resolved prediction with actual results
     */
    _displayResolvedPrediction(prediction) {
        const resultsContainer = this.container.querySelector('#prediction-results');
        
        if (!resultsContainer) return;
        
        resultsContainer.classList.remove('d-none');
        
        // Create resolved prediction display
        resultsContainer.innerHTML = `
            <div class="prediction-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4 d-flex justify-content-between align-items-start">
                    <div>
                        <h4 class="prediction-factor">${prediction.factor || 'Multi-Factor Prediction'}</h4>
                        <p class="text-muted mb-0 text-sm">${prediction.result.analysis?.summary || ''}</p>
                    </div>
                    <div class="resolved-badge ${prediction.resolvedResult.correct ? 'bg-success' : 'bg-danger'} text-white px-3 py-2 rounded">
                        ${prediction.resolvedResult.correct ? 'CORRECT' : 'INCORRECT'}
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-6">
                        <div class="predicted-result p-3 rounded bg-light mb-3">
                            <h6 class="mb-2">Your Prediction</h6>
                            <div class="d-flex justify-content-between">
                                <span>Probability:</span>
                                <span class="font-weight-bold">${(prediction.result.probability * 100).toFixed(1)}%</span>
                            </div>
                            <div class="progress mt-2" style="height: 15px;">
                                <div class="progress-bar" 
                                    role="progressbar" 
                                    style="width: ${prediction.result.probability * 100}%;"
                                    aria-valuenow="${prediction.result.probability * 100}" 
                                    aria-valuemin="0" 
                                    aria-valuemax="100">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-6">
                        <div class="actual-result p-3 rounded bg-light mb-3">
                            <h6 class="mb-2">Actual Result</h6>
                            <p class="mb-1">${prediction.resolvedResult.actualResult}</p>
                            ${prediction.resolvedResult.winAmount > 0 ? 
                                `<div class="win-amount text-success">+$${prediction.resolvedResult.winAmount.toFixed(2)}</div>` : 
                                ''}
                        </div>
                    </div>
                </div>
                
                <div class="insights border-top pt-3 mt-2">
                    <h6>Analysis</h6>
                    <p>${prediction.resolvedResult.correct ? 
                        'Your prediction was accurate! The result matched your prediction.' : 
                        'Your prediction did not match the actual outcome. Here\'s why it may have been off:'}</p>
                    
                    <ul class="text-sm">
                        ${prediction.playerUpdates ? prediction.playerUpdates.map(update => 
                            `<li>${update.playerName} changed status from ${update.previousStatus} to ${update.currentStatus}</li>`
                        ).join('') : ''}
                        
                        ${prediction.oddsUpdates ? prediction.oddsUpdates.map(update => 
                            `<li>Odds for ${update.entity} changed by ${(update.probabilityDelta * 100).toFixed(1)}%</li>`
                        ).join('') : ''}
                    </ul>
                </div>
                
                <div class="mt-3 text-end">
                    <button class="btn btn-sm btn-outline-primary me-2 add-to-comparison-btn">
                        <i class="fas fa-chart-bar"></i> Compare
                    </button>
                    <button class="btn btn-sm btn-outline-success share-prediction-btn">
                        <i class="fas fa-share-alt"></i> Share Result
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        resultsContainer.querySelector('.add-to-comparison-btn')?.addEventListener('click', () => {
            this._addPredictionToComparison(prediction);
        });
        
        resultsContainer.querySelector('.share-prediction-btn')?.addEventListener('click', () => {
            this._sharePredictionResult(prediction);
        });
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    /**
     * Setup speech recognition for voice commands
     */
    _setupSpeechRecognition() {
        if (!speechRecognitionService.isAvailable()) {
            Logger.warn('Speech recognition not available in this browser');
            return;
        }
        
        // Initialize speech recognition
        speechRecognitionService.initialize({
            language: 'en-US',
            continuous: false,
            interimResults: true,
            maxAlternatives: 3
        });
        
        // Set up event handlers
        speechRecognitionService.onResult(this._handleSpeechResult);
        
        speechRecognitionService.onError((error) => {
            Logger.error('Speech recognition error:', error);
            this._updateVoiceRecognitionUI(false, 'Error: ' + error.message);
        });
        
        speechRecognitionService.onEnd(() => {
            this.speechRecognitionActive = false;
            this._updateVoiceRecognitionUI(false);
        });
    }
    
    /**
     * Handle speech recognition result
     */
    _handleSpeechResult(event) {
        const results = event.results;
        
        if (results && results.length > 0) {
            const mostRecentResult = results[results.length - 1];
            
            if (mostRecentResult.isFinal) {
                const transcript = mostRecentResult[0].transcript.trim();
                
                // Update voice input display
                this._updateVoiceRecognitionUI(true, transcript);
                
                // Process the command
                this._processVoiceCommand(transcript);
                
                // Stop recognition after processing
                speechRecognitionService.stop();
                this.speechRecognitionActive = false;
            } else {
                // Show interim results
                const interimTranscript = mostRecentResult[0].transcript.trim();
                this._updateVoiceRecognitionUI(true, interimTranscript, true);
            }
        }
    }
    
    /**
     * Process voice command
     */
    _processVoiceCommand(command) {
        // Convert to lowercase for easier matching
        const lowerCommand = command.toLowerCase();
        
        // Basic command patterns
        const predictPattern = /^predict\s+(.+)$/i;
        const comparePattern = /^compare\s+(.+)$/i;
        const showPattern = /^show\s+(.+)$/i;
        const exportPattern = /^export\s+(.+)$/i;
        
        // Check for command patterns
        const predictMatch = lowerCommand.match(predictPattern);
        const compareMatch = lowerCommand.match(comparePattern);
        const showMatch = lowerCommand.match(showPattern);
        const exportMatch = lowerCommand.match(exportPattern);
        
        if (predictMatch) {
            // Prediction command
            const predictionText = predictMatch[1];
            this._handleVoicePrediction(predictionText);
        } else if (compareMatch) {
            // Compare command
            const compareText = compareMatch[1];
            this._handleVoiceCompare(compareText);
        } else if (showMatch) {
            // Show command
            const showText = showMatch[1];
            this._handleVoiceShow(showText);
        } else if (exportMatch) {
            // Export command
            const exportText = exportMatch[1];
            this._handleVoiceExport(exportText);
        } else if (lowerCommand.includes('help')) {
            // Help command
            this._showVoiceCommandHelp();
        } else {
            // Unknown command
            notificationService.showNotification('Sorry, I didn\'t understand that command. Try saying "help" for a list of commands.', 'warning');
        }
    }
    
    /**
     * Handle voice prediction command
     */
    _handleVoicePrediction(predictionText) {
        // Set the prediction text in the input field
        const inputField = this.container.querySelector('#single-factor-input');
        if (inputField) {
            inputField.value = predictionText;
            
            // Switch to single factor tab
            const singleFactorTab = this.container.querySelector('[data-tab="single-factor"]');
            if (singleFactorTab) {
                singleFactorTab.click();
            }
            
            // Show notification
            notificationService.showNotification('Voice prediction added. Click "Generate Prediction" to continue.', 'info');
            
            // Scroll to the prediction button
            this.container.querySelector('#single-predict-button')?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }
    
    /**
     * Handle voice compare command
     */
    _handleVoiceCompare(compareText) {
        // Parse the command to see what to compare
        if (compareText.includes('last') || compareText.includes('recent')) {
            // Compare recent predictions
            const count = parseInt(compareText.match(/\d+/)?.[0] || 2);
            
            const recentPredictions = this.predictionHistory.slice(0, Math.min(count, 5));
            this.pendingComparisons = recentPredictions.map(p => p.id);
            
            if (recentPredictions.length > 0) {
                this._showComparisonTool();
                notificationService.showNotification(`Comparing the ${recentPredictions.length} most recent predictions`, 'info');
            } else {
                notificationService.showNotification('No recent predictions to compare', 'warning');
            }
        } else {
            // Try to find predictions with matching text
            const matchingPredictions = this.predictionHistory.filter(p => {
                const content = p.type === 'single' ? p.factor : p.factors?.join(' ') || '';
                return content.toLowerCase().includes(compareText.toLowerCase());
            });
            
            if (matchingPredictions.length > 0) {
                this.pendingComparisons = matchingPredictions.map(p => p.id);
                this._showComparisonTool();
                notificationService.showNotification(`Found ${matchingPredictions.length} predictions to compare`, 'info');
            } else {
                notificationService.showNotification(`No predictions found matching "${compareText}"`, 'warning');
            }
        }
    }
    
    /**
     * Handle voice show command
     */
    _handleVoiceShow(showText) {
        // Different show commands
        if (showText.includes('history')) {
            // Scroll to history section
            this.container.querySelector('#prediction-history')?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        } else if (showText.includes('dashboard')) {
            // Show personalized dashboard
            this._renderPersonalizedDashboard();
            notificationService.showNotification('Showing your personalized dashboard', 'info');
        } else if (showText.includes('league') || showText.includes('sport')) {
            // Match league name in text
            const leagues = [
                'NBA', 'NFL', 'MLB', 'NHL', 
                'Premier League', 'Serie A', 'Bundesliga', 'La Liga'
            ];
            
            const matchedLeague = leagues.find(league => 
                showText.toLowerCase().includes(league.toLowerCase())
            );
            
            if (matchedLeague) {
                this._changeLeague(matchedLeague);
                notificationService.showNotification(`Showing predictions for ${matchedLeague}`, 'info');
            } else {
                notificationService.showNotification('Please specify a valid league', 'warning');
            }
        } else {
            notificationService.showNotification(`Unsure what to show for "${showText}"`, 'warning');
        }
    }
    
    /**
     * Handle voice export command
     */
    _handleVoiceExport(exportText) {
        // Default to exporting current prediction if available
        if (this.currentPrediction) {
            // Check export format
            if (exportText.includes('pdf')) {
                this._exportPrediction(this.currentPrediction, 'pdf');
            } else if (exportText.includes('csv')) {
                this._exportPrediction(this.currentPrediction, 'csv');
            } else if (exportText.includes('image') || exportText.includes('png')) {
                this._exportPrediction(this.currentPrediction, 'image');
            } else {
                // Default to PDF
                this._exportPrediction(this.currentPrediction, 'pdf');
            }
            
            notificationService.showNotification('Exporting current prediction', 'info');
        } else {
            notificationService.showNotification('No current prediction to export', 'warning');
        }
    }
    
    /**
     * Show voice command help
     */
    _showVoiceCommandHelp() {
        const helpContainer = document.createElement('div');
        helpContainer.className = 'voice-help-overlay';
        helpContainer.innerHTML = `
            <div class="voice-help-modal p-4 bg-white rounded-lg shadow-lg">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="mb-0">Voice Command Help</h4>
                    <button class="close-help-btn btn btn-sm btn-outline-secondary">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="help-content">
                    <p class="text-muted mb-3">Here are some commands you can try:</p>
                    
                    <h6>Prediction Commands</h6>
                    <ul class="mb-3">
                        <li><strong>"Predict Lakers win by 10 points"</strong> - Creates a new prediction</li>
                        <li><strong>"Predict Tom Brady throws 3 touchdowns"</strong> - Creates player-specific prediction</li>
                    </ul>
                    
                    <h6>Comparison Commands</h6>
                    <ul class="mb-3">
                        <li><strong>"Compare last 3 predictions"</strong> - Compares recent predictions</li>
                        <li><strong>"Compare Lakers predictions"</strong> - Compares predictions with "Lakers" in them</li>
                    </ul>
                    
                    <h6>Show Commands</h6>
                    <ul class="mb-3">
                        <li><strong>"Show history"</strong> - Scrolls to prediction history</li>
                        <li><strong>"Show dashboard"</strong> - Displays your personalized dashboard</li>
                        <li><strong>"Show NBA league"</strong> - Filters to NBA predictions</li>
                    </ul>
                    
                    <h6>Export Commands</h6>
                    <ul>
                        <li><strong>"Export as PDF"</strong> - Exports current prediction as PDF</li>
                        <li><strong>"Export as CSV"</strong> - Exports prediction data as CSV</li>
                        <li><strong>"Export as image"</strong> - Exports prediction as shareable image</li>
                    </ul>
                </div>
                
                <div class="text-center mt-3">
                    <button class="try-voice-btn btn btn-primary">
                        <i class="fas fa-microphone"></i> Try Voice Command
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(helpContainer);
        
        // Add event listeners
        helpContainer.querySelector('.close-help-btn').addEventListener('click', () => {
            helpContainer.remove();
        });
        
        helpContainer.querySelector('.try-voice-btn').addEventListener('click', () => {
            helpContainer.remove();
            this._startVoiceRecognition();
        });
    }
    
    /**
     * Update voice recognition UI
     */
    _updateVoiceRecognitionUI(isActive, text = '', isInterim = false) {
        const voiceUI = this.container.querySelector('#voice-recognition-ui');
        
        if (!voiceUI) return;
        
        if (isActive) {
            voiceUI.classList.remove('d-none');
            
            const textDisplay = voiceUI.querySelector('.voice-text');
            if (textDisplay) {
                textDisplay.textContent = text;
                textDisplay.classList.toggle('voice-interim', isInterim);
            }
            
            // Update mic icon
            const micIcon = this.container.querySelector('.voice-control i');
            if (micIcon) {
                micIcon.className = isInterim ? 'fas fa-microphone-alt pulse-animation' : 'fas fa-microphone';
            }
        } else {
            // Hide with slight delay to allow reading
            setTimeout(() => {
                voiceUI.classList.add('d-none');
                
                // Reset mic icon
                const micIcon = this.container.querySelector('.voice-control i');
                if (micIcon) {
                    micIcon.className = 'fas fa-microphone';
                }
            }, text ? 2000 : 0);
        }
    }
    
    /**
     * Start voice recognition
     */
    _startVoiceRecognition() {
        if (!speechRecognitionService.isAvailable()) {
            notificationService.showNotification('Speech recognition is not supported in your browser', 'error');
            return;
        }
        
        if (this.speechRecognitionActive) {
            speechRecognitionService.stop();
            this.speechRecognitionActive = false;
            this._updateVoiceRecognitionUI(false);
            return;
        }
        
        try {
            speechRecognitionService.start();
            this.speechRecognitionActive = true;
            this._updateVoiceRecognitionUI(true, 'Listening...');
            
            // Auto-stop after timeout
            setTimeout(() => {
                if (this.speechRecognitionActive) {
                    speechRecognitionService.stop();
                    this.speechRecognitionActive = false;
                    this._updateVoiceRecognitionUI(false);
                }
            }, 10000);
        } catch (error) {
            Logger.error('Error starting speech recognition:', error);
            notificationService.showNotification('Could not start speech recognition', 'error');
        }
    }
    
    /**
     * Change current league
     */
    _changeLeague(league) {
        const normalizedLeague = league.toLowerCase().replace(/\s+/g, '_');
        this.currentLeague = normalizedLeague;
        
        // Update league selector UI
        const leagueSelector = this.container.querySelector('#league-selector');
        if (leagueSelector) {
            const leagueButtons = leagueSelector.querySelectorAll('.league-button');
            leagueButtons.forEach(button => {
                const buttonLeague = button.getAttribute('data-league');
                button.classList.toggle('active', buttonLeague === normalizedLeague);
            });
        }
        
        // Filter prediction history display
        this._updatePredictionHistory();
        
        // Update league context in prediction inputs
        this._updateLeagueContext(normalizedLeague);
        
        // Trigger event
        eventBus.publish('league:changed', normalizedLeague);
        
        // Track analytics
        analyticsService.trackEvent('predictions', 'league_changed', {
            league: normalizedLeague
        });
    }
    
    /**
     * Update league context in prediction inputs
     */
    _updateLeagueContext(league) {
        // Update placeholder text
        const singleFactorInput = this.container.querySelector('#single-factor-input');
        if (singleFactorInput) {
            const placeholders = {
                nba: 'Example: LeBron James scores more than 25 points',
                nfl: 'Example: Chiefs win by at least 7 points',
                mlb: 'Example: Yankees get more than 8 hits',
                nhl: 'Example: Oilers score in the first period',
                premier_league: 'Example: Manchester City wins with a clean sheet',
                serie_a: 'Example: Juventus scores in both halves',
                bundesliga: 'Example: Bayern Munich wins by 2+ goals',
                la_liga: 'Example: Barcelona scores 3 or more goals'
            };
            
            singleFactorInput.placeholder = placeholders[league] || 'Enter prediction factor';
        }
        
        // Update visualization context (team colors, etc)
        this._refreshVisualizationsForLeague(league);
        
        // Load league-specific players and teams for autocomplete
        this._loadLeagueSpecificData(league);
    }
    
    /**
     * Refresh visualizations for the current league
     */
    _refreshVisualizationsForLeague(league) {
        // Get league colors
        const leagueColors = LEAGUE_COLORS[league] || LEAGUE_COLORS.default;
        
        // Update CSS variables for league theming
        document.documentElement.style.setProperty('--league-primary', leagueColors.primary);
        document.documentElement.style.setProperty('--league-secondary', leagueColors.secondary);
        document.documentElement.style.setProperty('--league-accent', leagueColors.accent);
        
        // Re-render current prediction if exists
        if (this.currentPrediction) {
            this._displayPredictionResults(
                this.currentPrediction, 
                this.currentPrediction.type === 'multi'
            );
        }
    }
    
    /**
     * Load league-specific data for autocomplete
     */
    async _loadLeagueSpecificData(league) {
        try {
            if (this.offlineMode) {
                // Use cached data in offline mode
                return;
            }
            
            const response = await leagueDataService.getLeagueData(league);
            
            // Set up autocomplete for player names and teams
            if (response.players && response.teams) {
                this._setupAutocomplete(response.players, response.teams);
            }
        } catch (error) {
            Logger.error('Error loading league data:', error);
        }
    }
    
    /**
     * Setup autocomplete for prediction inputs
     */
    _setupAutocomplete(players, teams) {
        const inputs = [
            ...this.container.querySelectorAll('textarea'),
            ...this.container.querySelectorAll('input[type="text"]')
        ];
        
        inputs.forEach(input => {
            // If autocomplete already initialized, destroy it
            if (input.autocomplete) {
                input.autocomplete.destroy();
            }
            
            // Create new autocomplete
            input.autocomplete = new Autocomplete(input, {
                data: {
                    src: [...players.map(p => p.name), ...teams],
                    keys: ['value'],
                    cache: true
                },
                threshold: 3,
                debounce: 300,
                maxResults: 8,
                onSelection: (feedback) => {
                    const value = feedback.selection.value;
                    
                    // Insert at cursor position
                    const cursorPos = input.selectionStart;
                    const textBefore = input.value.substring(0, cursorPos);
                    const textAfter = input.value.substring(cursorPos);
                    
                    // Find the word being typed
                    const wordBefore = textBefore.match(/\S*$/)[0];
                    const textBeforeWithoutWord = textBefore.substring(0, textBefore.length - wordBefore.length);
                    
                    input.value = textBeforeWithoutWord + value + textAfter;
                    
                    // Set cursor position after the inserted value
                    const newCursorPos = textBeforeWithoutWord.length + value.length;
                    input.selectionStart = newCursorPos;
                    input.selectionEnd = newCursorPos;
                    
                    input.focus();
                }
            });
        });
    }
    
    /**
     * Fetch league data
     */
    async _fetchLeagueData() {
        try {
            if (this.offlineMode) {
                // Skip in offline mode
                return;
            }
            
            // Fetch data for all leagues
            const leaguePromises = [
                'nba', 'nfl', 'mlb', 'nhl', 
                'premier_league', 'serie_a', 'bundesliga', 'la_liga'
            ].map(league => leagueDataService.getLeagueData(league));
            
            const leagueData = await Promise.all(leaguePromises);
            
            // Cache the data for offline use
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['userPreferences'], 'readwrite');
            const store = transaction.objectStore('userPreferences');
            
            await store.put({
                id: 'leagueData',
                data: leagueData,
                timestamp: Date.now()
            });
            
            Logger.info('League data fetched and cached successfully');
        } catch (error) {
            Logger.error('Error fetching league data:', error);
        }
    }
    
    /**
     * Load prediction history from server or local cache
     */
    async _loadPredictionHistory() {
        try {
            if (this.offlineMode) {
                // Load from IndexedDB in offline mode
                this.predictionHistory = await this._loadFromIndexedDB(20);
                this._updatePredictionHistory();
                return;
            }
            
            // Load from server
            const response = await apiClient.get('/api/predictions/history', {
                params: {
                    limit: 20,
                    include_details: true
                },
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                }
            });
            
            if (response.status === 'success') {
                this.predictionHistory = response.data.predictions || [];
                
                // Cache in IndexedDB for offline access
                for (const prediction of this.predictionHistory) {
                    await this._saveToIndexedDB(prediction);
                }
                
                this._updatePredictionHistory();
            }
        } catch (error) {
            Logger.error('Error loading prediction history:', error);
            
            // Try to load from local cache as fallback
            this.predictionHistory = await this._loadFromIndexedDB(20);
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Render the enhanced UI with advanced features
     */
    _renderEnhancedUI() {
        this.container.innerHTML = `
            <div class="custom-predictions">
                <!-- Main prediction card -->
                <div class="card border-0 shadow-sm rounded-lg bg-gradient-to-b from-indigo-900 to-blue-900 text-white">
                    <!-- Header with status indicators -->
                    <div class="card-header bg-transparent border-0 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <h3 class="card-title mb-0">Ultra Premium Predictions</h3>
                            <div class="ultra-premium-badge ms-2 px-2 py-1 bg-yellow-600 rounded-pill text-xs font-weight-bold">ULTRA</div>
                            
                            <!-- Live indicator (shows when games are in progress) -->
                            <div id="live-indicator" class="ms-2 d-none d-flex align-items-center">
                                <span class="live-dot me-1"></span>
                                <span class="text-xs">LIVE</span>
                            </div>
                        </div>
                        
                        <!-- Voice control -->
                        <div class="d-flex align-items-center">
                            <button class="voice-control btn btn-sm btn-outline-light me-2" aria-label="Voice command">
                                <i class="fas fa-microphone"></i>
                            </button>
                            
                            <!-- Dashboard button -->
                            <button class="dashboard-btn btn btn-sm btn-outline-light me-2" aria-label="Dashboard">
                                <i class="fas fa-chart-line"></i>
                            </button>
                            
                            <!-- Settings button -->
                            <button class="settings-btn btn btn-sm btn-outline-light" aria-label="Settings">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Voice recognition UI (hidden by default) -->
                    <div id="voice-recognition-ui" class="voice-recognition-ui d-none">
                        <div class="p-2 mb-3 bg-blue-800 rounded d-flex align-items-center">
                            <i class="fas fa-microphone-alt me-2 pulse-animation"></i>
                            <div class="voice-text">Listening...</div>
                        </div>
                    </div>
                    
                    <!-- League selector -->
                    <div class="card-body pt-0 pb-2">
                        <div id="league-selector" class="league-selector d-flex overflow-auto hide-scrollbar py-2">
                            <button class="league-button active me-2 btn btn-sm rounded-pill" data-league="all">
                                <span>All Leagues</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="nba">
                                <img src="/images/leagues/nba.png" alt="NBA" width="16" height="16" class="me-1">
                                <span>NBA</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="nfl">
                                <img src="/images/leagues/nfl.png" alt="NFL" width="16" height="16" class="me-1">
                                <span>NFL</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="mlb">
                                <img src="/images/leagues/mlb.png" alt="MLB" width="16" height="16" class="me-1">
                                <span>MLB</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="nhl">
                                <img src="/images/leagues/nhl.png" alt="NHL" width="16" height="16" class="me-1">
                                <span>NHL</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="premier_league">
                                <img src="/images/leagues/premier-league.png" alt="Premier League" width="16" height="16" class="me-1">
                                <span>Premier League</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="serie_a">
                                <img src="/images/leagues/serie-a.png" alt="Serie A" width="16" height="16" class="me-1">
                                <span>Serie A</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="bundesliga">
                                <img src="/images/leagues/bundesliga.png" alt="Bundesliga" width="16" height="16" class="me-1">
                                <span>Bundesliga</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="la_liga">
                                <img src="/images/leagues/la-liga.png" alt="La Liga" width="16" height="16" class="me-1">
                                <span>La Liga</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Live games container (shown when games are in progress) -->
                    <div id="live-games-container" class="live-games-container px-3 pb-2 d-none">
                        <!-- Live game pills will be added here -->
                    </div>
                    
                    <div class="card-body">
                        <!-- Tabs for different prediction types -->
                        <div class="tabs mb-4">
                            <div class="tab-buttons d-flex">
                                <button class="tab-button active flex-grow-1 py-2 px-3 bg-transparent border-0 text-white opacity-80 hover:opacity-100" data-tab="single-factor">
                                    Single Factor
                                </button>
                                <button class="tab-button flex-grow-1 py-2 px-3 bg-transparent border-0 text-white opacity-80 hover:opacity-100" data-tab="multi-factor">
                                    Multi Factor
                                </button>
                                <button class="tab-button flex-grow-1 py-2 px-3 bg-transparent border-0 text-white opacity-80 hover:opacity-100" data-tab="comparison">
                                    Comparison
                                </button>
                            </div>
                            
                            <div class="tab-content mt-3">
                                <!-- Single factor tab -->
                                <div class="tab-pane active" id="single-factor-tab">
                                    <p class="text-sm text-blue-200 mb-3">
                                        Enter any sports prediction factor and our AI will calculate the probability.
                                    </p>
                                    <div class="mb-3">
                                        <textarea id="single-factor-input" class="form-control bg-blue-800 border-blue-700 text-white" 
                                            placeholder="Example: LeBron James scores more than 25 points" rows="3"></textarea>
                                    </div>
                                    
                                    <!-- Advanced options (collapsible) -->
                                    <div class="advanced-options mb-3">
                                        <button class="btn btn-link text-blue-200 p-0 text-decoration-none text-sm" type="button" data-bs-toggle="collapse" data-bs-target="#advancedSingleOptions">
                                            <i class="fas fa-cog me-1"></i> Advanced Options
                                        </button>
                                        
                                        <div class="collapse mt-2" id="advancedSingleOptions">
                                            <div class="p-3 bg-blue-800 rounded border border-blue-700">
                                                <div class="form-check mb-2">
                                                    <input class="form-check-input" type="checkbox" id="include-supporting-data" checked>
                                                    <label class="form-check-label text-sm" for="include-supporting-data">
                                                        Include supporting data
                                                    </label>
                                                </div>
                                                
                                                <div class="form-check mb-2">
                                                    <input class="form-check-input" type="checkbox" id="include-detailed-analysis" checked>
                                                    <label class="form-check-label text-sm" for="include-detailed-analysis">
                                                        Generate detailed analysis
                                                    </label>
                                                </div>
                                                
                                                <div class="form-group mb-0">
                                                    <label class="form-label text-sm">Confidence threshold</label>
                                                    <input type="range" class="form-range" min="0" max="100" value="70" id="confidence-threshold">
                                                    <div class="d-flex justify-content-between">
                                                        <span class="text-xs">Lower (more results)</span>
                                                        <span class="text-xs">Higher (better quality)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button id="single-predict-button" class="btn btn-primary btn-lg w-100">
                                        Generate Prediction
                                    </button>
                                </div>
                                
                                <!-- Multi factor tab -->
                                <div class="tab-pane" id="multi-factor-tab">
                                    <p class="text-sm text-blue-200 mb-3">
                                        Combine up to 7 factors for a comprehensive prediction probability.
                                    </p>
                                    <div id="multi-factor-inputs" class="mb-3">
                                        <div class="factor-input mb-2">
                                            <textarea class="form-control bg-blue-800 border-blue-700 text-white" 
                                                placeholder="Factor 1: Lakers win the game" rows="2"></textarea>
                                        </div>
                                        <div class="factor-input mb-2">
                                            <textarea class="form-control bg-blue-800 border-blue-700 text-white" 
                                                placeholder="Factor 2: LeBron James scores over 25 points" rows="2"></textarea>
                                        </div>
                                    </div>
                                    
                                    <div class="mb-3 d-flex justify-content-between">
                                        <button id="add-factor-button" class="btn btn-sm btn-outline-light">
                                            <i class="fas fa-plus"></i> Add Factor
                                        </button>
                                        <span class="text-sm text-blue-200">
                                            <span id="factor-count">2</span>/<span id="max-factors">${this.maxFactors}</span> factors
                                        </span>
                                    </div>
                                    
                                    <!-- Multi-factor correlation options -->
                                    <div class="correlation-options mb-3">
                                        <div class="form-group">
                                            <label class="text-sm text-blue-200 mb-1">Correlation Handling</label>
                                            <select class="form-select form-select-sm bg-blue-800 border-blue-700 text-white" id="correlation-method">
                                                <option value="auto">Auto-detect correlations</option>
                                                <option value="independent">Treat as independent</option>
                                                <option value="strong_positive">Strong positive correlation</option>
                                                <option value="moderate_positive">Moderate positive correlation</option>
                                                <option value="negative">Negative correlation</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <button id="multi-predict-button" class="btn btn-primary btn-lg w-100">
                                        Generate Multi-Factor Prediction
                                    </button>
                                </div>
                                
                                <!-- Comparison tool tab -->
                                <div class="tab-pane" id="comparison-tab">
                                    <p class="text-sm text-blue-200 mb-3">
                                        Compare multiple predictions to identify patterns and insights.
                                    </p>
                                    
                                    <div class="mb-3" id="comparison-selection">
                                        <label class="text-sm text-blue-200 mb-2">Select predictions to compare</label>
                                        <div class="comparison-items" id="comparison-items">
                                            <p class="text-center text-sm text-blue-200 py-3">
                                                <i class="fas fa-info-circle me-1"></i> No predictions selected for comparison.
                                                <br>Add predictions from your history or results.
                                            </p>
                                        </div>
                                        
                                        <div class="mt-3 d-flex justify-content-between">
                                            <button id="clear-comparisons-button" class="btn btn-sm btn-outline-light" disabled>
                                                <i class="fas fa-trash-alt"></i> Clear All
                                            </button>
                                            <button id="add-from-history-button" class="btn btn-sm btn-outline-light">
                                                <i class="fas fa-history"></i> Add from History
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div class="visualization-options mb-3">
                                        <label class="text-sm text-blue-200 mb-2">Visualization Type</label>
                                        <div class="btn-group w-100" role="group">
                                            <button type="button" class="btn btn-outline-light active" data-viz="bar">Bar Chart</button>
                                            <button type="button" class="btn btn-outline-light" data-viz="radar">Radar Chart</button>
                                            <button type="button" class="btn btn-outline-light" data-viz="probability">Probability Distribution</button>
                                        </div>
                                    </div>
                                    
                                    <button id="generate-comparison-button" class="btn btn-primary btn-lg w-100" disabled>
                                        Generate Comparison Analysis
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Prediction results container -->
                        <div id="prediction-results" class="prediction-results mt-4 d-none">
                            <!-- Prediction results will be displayed here -->
                        </div>
                        
                        <!-- Prediction visualization container -->
                        <div id="prediction-visualization" class="prediction-visualization mt-3 d-none">
                            <!-- D3 visualizations will be rendered here -->
                        </div>
                        
                        <!-- Comparison results container -->
                        <div id="comparison-results" class="comparison-results mt-4 d-none">
                            <!-- Comparison results will be displayed here -->
                        </div>
                        
                        <!-- Error message container -->
                        <div id="prediction-error" class="prediction-error mt-4 d-none">
                            <!-- Error messages will be displayed here -->
                        </div>
                        
                        <!-- Loading indicator -->
                        <div id="prediction-loading" class="prediction-loading mt-4 d-none">
                            <div class="d-flex justify-content-center">
                                <div class="spinner-border text-light" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </div>
                            <p class="text-center text-sm text-blue-200 mt-2">
                                Analyzing data and generating prediction...
                            </p>
                        </div>
                        
                        <!-- Export and share options -->
                        <div id="export-options" class="export-options mt-3 d-none">
                            <div class="d-flex justify-content-center">
                                <button class="btn btn-sm btn-outline-light me-2 export-pdf-btn">
                                    <i class="fas fa-file-pdf"></i> PDF
                                </button>
                                <button class="btn btn-sm btn-outline-light me-2 export-csv-btn">
                                    <i class="fas fa-file-csv"></i> CSV
                                </button>
                                <button class="btn btn-sm btn-outline-light me-2 export-image-btn">
                                    <i class="fas fa-image"></i> Image
                                </button>
                                <button class="btn btn-sm btn-outline-light share-btn">
                                    <i class="fas fa-share-alt"></i> Share
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Personalized dashboard (hidden by default) -->
                <div id="personalized-dashboard" class="mt-4 mb-4 d-none">
                    <div class="card border-0 shadow-sm rounded-lg">
                        <div class="card-header bg-white border-0">
                            <div class="d-flex justify-content-between align-items-center">
                                <h4 class="mb-0">Your Prediction Dashboard</h4>
                                <button class="btn btn-sm btn-outline-secondary close-dashboard-btn">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="dashboard-content">
                                <!-- Dashboard content will be loaded here -->
                                <div class="text-center py-5">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                    <p class="mt-3">Loading your personalized dashboard...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Prediction history section -->
                <div class="mt-4 mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4 class="mb-0 text-gray-700">Recent Predictions</h4>
                        
                        <!-- History filter options -->
                        <div class="btn-group">
                            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                <i class="fas fa-filter me-1"></i> Filter
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item active" href="#" data-filter="all">All Predictions</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" href="#" data-filter="single">Single Factor Only</a></li>
                                <li><a class="dropdown-item" href="#" data-filter="multi">Multi-Factor Only</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" href="#" data-filter="resolved">Resolved Only</a></li>
                                <li><a class="dropdown-item" href="#" data-filter="unresolved">Unresolved Only</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <!-- History visualization summary (mini chart) -->
                    <div id="history-viz" class="history-viz mb-3">
                        <!-- Mini performance chart will be rendered here -->
                    </div>
                    
                    <div id="prediction-history" class="prediction-history">
                        <p class="text-gray-500 text-sm">No recent predictions yet</p>
                    </div>
                </div>
            </div>
            
            <!-- Modals -->
            <!-- Settings Modal -->
            <div class="modal fade" id="settingsModal" tabindex="-1" aria-labelledby="settingsModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="settingsModalLabel">Prediction Settings</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="settings-container">
                                <h6>Display Preferences</h6>
                                <div class="mb-3">
                                    <label class="form-label">Visualization Detail Level</label>
                                    <select class="form-select" id="visualization-detail">
                                        <option value="standard">Standard</option>
                                        <option value="detailed">Detailed</option>
                                        <option value="simplified">Simplified</option>
                                    </select>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Theme</label>
                                    <select class="form-select" id="theme-preference">
                                        <option value="auto">Auto (System Default)</option>
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </div>
                                
                                <h6 class="mt-4">Prediction Preferences</h6>
                                <div class="mb-3">
                                    <label class="form-label">Default League</label>
                                    <select class="form-select" id="default-league">
                                        <option value="all">All Leagues</option>
                                        <option value="nba">NBA</option>
                                        <option value="nfl">NFL</option>
                                        <option value="mlb">MLB</option>
                                        <option value="nhl">NHL</option>
                                        <option value="premier_league">Premier League</option>
                                        <option value="serie_a">Serie A</option>
                                        <option value="bundesliga">Bundesliga</option>
                                        <option value="la_liga">La Liga</option>
                                    </select>
                                </div>
                                
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="live-updates-enabled" checked>
                                    <label class="form-check-label" for="live-updates-enabled">Enable live updates</label>
                                </div>
                                
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="notifications-enabled" checked>
                                    <label class="form-check-label" for="notifications-enabled">Enable notifications</label>
                                </div>
                                
                                <h6 class="mt-4">Accessibility</h6>
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="high-contrast-mode">
                                    <label class="form-check-label" for="high-contrast-mode">High contrast mode</label>
                                </div>
                                
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="larger-text">
                                    <label class="form-check-label" for="larger-text">Larger text</label>
                                </div>
                                
                                <h6 class="mt-4">Data Management</h6>
                                <div class="mt-2">
                                    <button class="btn btn-outline-danger btn-sm" id="clear-prediction-data">
                                        Clear Prediction Data
                                    </button>
                                    <button class="btn btn-outline-secondary btn-sm ms-2" id="export-all-predictions">
                                        Export All Predictions
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="save-settings">Save Settings</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Comparison Selection Modal -->
            <div class="modal fade" id="comparisonSelectionModal" tabindex="-1" aria-labelledby="comparisonSelectionModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="comparisonSelectionModalLabel">Select Predictions to Compare</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col">
                                    <input type="text" class="form-control" id="comparison-search" placeholder="Search predictions...">
                                </div>
                                <div class="col-auto">
                                    <select class="form-select" id="comparison-filter">
                                        <option value="all">All Types</option>
                                        <option value="single">Single Factor</option>
                                        <option value="multi">Multi-Factor</option>
                                        <option value="resolved">Resolved Only</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="comparison-predictions-container">
                                <!-- Prediction checkboxes will be rendered here -->
                                <div class="text-center py-4 text-muted">
                                    <i class="fas fa-spinner fa-spin"></i>
                                    <p class="mt-2">Loading predictions...</p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="add-to-comparison">Add Selected</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Share Modal -->
            <div class="modal fade" id="shareModal" tabindex="-1" aria-labelledby="shareModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="shareModalLabel">Share Prediction</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="share-preview mb-3">
                                <!-- Share preview will be rendered here -->
                            </div>
                            
                            <div class="form-group mb-3">
                                <label class="form-label">Share Link</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" id="share-link" readonly>
                                    <button class="btn btn-outline-secondary" type="button" id="copy-link">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="share-options">
                                <label class="form-label">Share to</label>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-outline-primary" id="share-twitter">
                                        <i class="fab fa-twitter"></i> Twitter
                                    </button>
                                    <button class="btn btn-outline-primary" id="share-facebook">
                                        <i class="fab fa-facebook"></i> Facebook
                                    </button>
                                    <button class="btn btn-outline-success" id="share-whatsapp">
                                        <i class="fab fa-whatsapp"></i> WhatsApp
                                    </button>
                                    <button class="btn btn-outline-secondary" id="share-email">
                                        <i class="fas fa-envelope"></i> Email
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Check if should render offline mode UI
        if (this.offlineMode) {
            this._updateOfflineUI();
        }
    }
    
    /**
     * Render error state
     */
    _renderErrorState(error) {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="alert alert-danger">
                <h4 class="alert-heading">Error Loading Enhanced Predictions</h4>
                <p>${error.message || 'An unknown error occurred'}</p>
                <div class="mt-3">
                    <button id="retry-custom-predictions" class="btn btn-danger me-2">Retry</button>
                    <button id="offline-mode-button" class="btn btn-outline-secondary">Try Offline Mode</button>
                </div>
            </div>
        `;
        
        document.getElementById('retry-custom-predictions')?.addEventListener('click', () => {
            this.initialize(this.container.id);
        });
        
        document.getElementById('offline-mode-button')?.addEventListener('click', () => {
            this.offlineMode = true;
            this.initialize(this.container.id);
        });
    }
    
    /**
     * Render upgrade prompt for non-premium users
     */
    _renderUpgradePrompt() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="card border-0 shadow-sm rounded-lg">
                <div class="card-body text-center py-5">
                    <i class="fas fa-crown text-yellow-500 fa-3x mb-3"></i>
                    <h3 class="card-title">Ultra Premium Feature</h3>
                    <p class="card-text text-muted mb-4">
                        Enhanced predictions with real-time updates, voice control, and advanced analytics
                        are available exclusively for Ultra Premium members.
                    </p>
                    <div class="premium-features mb-4">
                        <div class="row g-3">
                            <div class="col-md-4">
                                <div class="feature-card p-3 border rounded text-start">
                                    <i class="fas fa-bolt text-primary mb-2"></i>
                                    <h6>Real-time Updates</h6>
                                    <p class="text-sm text-muted mb-0">Live odds changes and game updates</p>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="feature-card p-3 border rounded text-start">
                                    <i class="fas fa-microphone text-primary mb-2"></i>
                                    <h6>Voice Control</h6>
                                    <p class="text-sm text-muted mb-0">Natural language prediction queries</p>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="feature-card p-3 border rounded text-start">
                                    <i class="fas fa-chart-line text-primary mb-2"></i>
                                    <h6>Advanced Analytics</h6>
                                    <p class="text-sm text-muted mb-0">ML-powered prediction insights</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button id="upgrade-to-premium" class="btn btn-primary btn-lg px-5">
                        Upgrade to Ultra Premium
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('upgrade-to-premium')?.addEventListener('click', () => {
            window.location.href = '/pricing?plan=ultra&ref=predictions';
        });
    }
    
    /**
     * Set up event listeners
     */
    _setupEventListeners() {
        // Tab switching
        const tabButtons = this.container.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                const tabPanes = this.container.querySelectorAll('.tab-pane');
                tabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active class to clicked button and corresponding pane
                button.classList.add('active');
                const tabName = button.getAttribute('data-tab');
                document.getElementById(`${tabName}-tab`)?.classList.add('active');
                
                // Track tab change
                analyticsService.trackEvent('predictions', 'tab_change', {
                    tab: tabName
                });
            });
        });
        
        // League selector buttons
        const leagueButtons = this.container.querySelectorAll('.league-button');
        leagueButtons.forEach(button => {
            button.addEventListener('click', () => {
                const league = button.getAttribute('data-league');
                this._changeLeague(league);
            });
        });
        
        // Voice control button
        this.container.querySelector('.voice-control')?.addEventListener('click', () => {
            this._startVoiceRecognition();
        });
        
        // Dashboard button
        this.container.querySelector('.dashboard-btn')?.addEventListener('click', () => {
            this._togglePersonalizedDashboard();
        });
        
        // Settings button
        this.container.querySelector('.settings-btn')?.addEventListener('click', () => {
            this._showSettingsModal();
        });
        
        // Single factor prediction button
        this.container.querySelector('#single-predict-button')?.addEventListener('click', () => {
            this._handleSingleFactorPrediction();
        });
        
        // Multi factor prediction button
        this.container.querySelector('#multi-predict-button')?.addEventListener('click', () => {
            this._handleMultiFactorPrediction();
        });
        
        // Add factor button
        this.container.querySelector('#add-factor-button')?.addEventListener('click', () => {
            this._addFactorInput();
        });
        
        // Comparison related buttons
        this.container.querySelector('#add-from-history-button')?.addEventListener('click', () => {
            this._showComparisonSelectionModal();
        });
        
        this.container.querySelector('#clear-comparisons-button')?.addEventListener('click', () => {
            this._clearPendingComparisons();
        });
        
        this.container.querySelector('#generate-comparison-button')?.addEventListener('click', () => {
            this._generateComparisonAnalysis();
        });
        
        // Settings modal save button
        document.getElementById('save-settings')?.addEventListener('click', () => {
            this._saveUserSettings();
        });
        
        // Add to comparison button in modal
        document.getElementById('add-to-comparison')?.addEventListener('click', () => {
            this._addSelectedToComparison();
        });
        
        // Export buttons
        this.container.querySelector('.export-pdf-btn')?.addEventListener('click', () => {
            this._exportPrediction(this.currentPrediction, 'pdf');
        });
        
        this.container.querySelector('.export-csv-btn')?.addEventListener('click', () => {
            this._exportPrediction(this.currentPrediction, 'csv');
        });
        
        this.container.querySelector('.export-image-btn')?.addEventListener('click', () => {
            this._exportPrediction(this.currentPrediction, 'image');
        });
        
        // Share button
        this.container.querySelector('.share-btn')?.addEventListener('click', () => {
            this._sharePrediction(this.currentPrediction);
        });
        
        // Close dashboard button
        this.container.querySelector('.close-dashboard-btn')?.addEventListener('click', () => {
            this._togglePersonalizedDashboard();
        });
        
        // Visualization selector buttons
        const vizButtons = this.container.querySelectorAll('[data-viz]');
        vizButtons.forEach(button => {
            button.addEventListener('click', () => {
                vizButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                const vizType = button.getAttribute('data-viz');
                this.visualizationMode = vizType;
                
                // Update visualization if comparison items exist
                if (this.pendingComparisons.length > 0) {
                    this._updateComparisonVisualization(vizType);
                }
            });
        });
        
        // History filter dropdown
        const historyFilters = this.container.querySelectorAll('[data-filter]');
        historyFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Update active state
                historyFilters.forEach(f => f.classList.remove('active'));
                filter.classList.add('active');
                
                // Apply filter
                const filterType = filter.getAttribute('data-filter');
                this._filterPredictionHistory(filterType);
            });
        });
        
        // Copy share link button
        document.getElementById('copy-link')?.addEventListener('click', () => {
            const linkInput = document.getElementById('share-link');
            if (linkInput) {
                linkInput.select();
                document.execCommand('copy');
                notificationService.showNotification('Link copied to clipboard', 'success');
            }
        });
        
        // Social sharing buttons
        document.getElementById('share-twitter')?.addEventListener('click', () => {
            this._shareToSocialMedia('twitter');
        });
        
        document.getElementById('share-facebook')?.addEventListener('click', () => {
            this._shareToSocialMedia('facebook');
        });
        
        document.getElementById('share-whatsapp')?.addEventListener('click', () => {
            this._shareToSocialMedia('whatsapp');
        });
        
        document.getElementById('share-email')?.addEventListener('click', () => {
            this._shareToSocialMedia('email');
        });
        
        // Data management buttons
        document.getElementById('clear-prediction-data')?.addEventListener('click', () => {
            this._clearAllPredictionData();
        });
        
        document.getElementById('export-all-predictions')?.addEventListener('click', () => {
            this._exportAllPredictions();
        });
        
        // Initialize factor inputs
        this._initializeFactorInputs();
        
        // Setup keyboard shortcuts
        this._setupKeyboardShortcuts();
    }
    
    /**
     * Setup keyboard shortcuts
     */
    _setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts if predictions module is initialized
            if (!this.isInitialized) return;
            
            // Check for modifier key (Ctrl/Cmd)
            const isModifierPressed = event.ctrlKey || event.metaKey;
            
            // Ctrl/Cmd + Shift + P = Generate Prediction 
            if (isModifierPressed && event.shiftKey && event.key === 'P') {
                event.preventDefault();
                
                // Check which tab is active
                const activeTab = this.container.querySelector('.tab-button.active');
                if (activeTab) {
                    const tabName = activeTab.getAttribute('data-tab');
                    
                    if (tabName === 'single-factor') {
                        this._handleSingleFactorPrediction();
                    } else if (tabName === 'multi-factor') {
                        this._handleMultiFactorPrediction();
                    } else if (tabName === 'comparison') {
                        this._generateComparisonAnalysis();
                    }
                }
            }
            
            // Ctrl/Cmd + Shift + V = Voice Input
            if (isModifierPressed && event.shiftKey && event.key === 'V') {
                event.preventDefault();
                this._startVoiceRecognition();
            }
            
            // Ctrl/Cmd + Shift + D = Dashboard
            if (isModifierPressed && event.shiftKey && event.key === 'D') {
                event.preventDefault();
                this._togglePersonalizedDashboard();
            }
            
            // Ctrl/Cmd + Shift + S = Settings
            if (isModifierPressed && event.shiftKey && event.key === 'S') {
                event.preventDefault();
                this._showSettingsModal();
            }
        });
    }
    
    /**
     * Initialize factor inputs
     */
    _initializeFactorInputs() {
        const inputs = this.container.querySelectorAll('#multi-factor-inputs .factor-input textarea');
        this.factorInputs = Array.from(inputs);
        this._updateFactorCount();
    }
    
    /**
     * Handle adding a new factor input
     */
    _addFactorInput() {
        if (this.factorInputs.length >= this.maxFactors) {
            notificationService.showNotification(`Maximum of ${this.maxFactors} factors allowed`, 'warning');
            return;
        }
        
        const factorInputs = this.container.querySelector('#multi-factor-inputs');
        const newInput = document.createElement('div');
        newInput.className = 'factor-input mb-2';
        newInput.innerHTML = `
            <div class="d-flex">
                <textarea class="form-control bg-blue-800 border-blue-700 text-white" 
                    placeholder="Factor ${this.factorInputs.length + 1}: Enter prediction factor" rows="2"></textarea>
                <button class="remove-factor-btn btn btn-sm btn-outline-danger ms-2">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        factorInputs.appendChild(newInput);
        
        // Add event listener to remove button
        const removeButton = newInput.querySelector('.remove-factor-btn');
        removeButton.addEventListener('click', () => {
            newInput.remove();
            this._initializeFactorInputs();
        });
        
        // Update factor inputs array
        this._initializeFactorInputs();
        
        // Track event
        analyticsService.trackEvent('predictions', 'factor_added', {
            factor_count: this.factorInputs.length
        });
    }
    
    /**
     * Update factor count display
     */
    _updateFactorCount() {
        const factorCount = this.container.querySelector('#factor-count');
        if (factorCount) {
            factorCount.textContent = this.factorInputs.length;
        }
        
        // Update UI state based on factor count
        const addFactorButton = this.container.querySelector('#add-factor-button');
        if (addFactorButton) {
            addFactorButton.disabled = this.factorInputs.length >= this.maxFactors;
        }
    }
    
    /**
     * Handle single factor prediction
     */
    async _handleSingleFactorPrediction() {
        try {
            const factorInput = this.container.querySelector('#single-factor-input');
            const factorText = factorInput.value.trim();
            
            if (!factorText) {
                notificationService.showNotification('Please enter a prediction factor', 'warning');
                return;
            }
            
            // Get advanced options
            const includeSupportingData = this.container.querySelector('#include-supporting-data')?.checked ?? true;
            const includeDetailedAnalysis = this.container.querySelector('#include-detailed-analysis')?.checked ?? true;
            const confidenceThreshold = this.container.querySelector('#confidence-threshold')?.value ?? 70;
            
            // Show loading state
            this._setLoadingState(true);
            
            // Track prediction request
            analyticsService.trackEvent('predictions', 'single_factor_prediction_requested', {
                factor_length: factorText.length,
                league: this.currentLeague
            });
            
            // Make prediction request
            let result;
            if (this.offlineMode) {
                // Use local prediction engine in offline mode
                result = await predictionEngine.predictSingleFactor(
                    factorText, 
                    includeSupportingData, 
                    includeDetailedAnalysis,
                    confidenceThreshold / 100
                );
            } else {
                // Use API in online mode
                result = await this._predictSingleFactor(
                    factorText, 
                    includeSupportingData, 
                    includeDetailedAnalysis,
                    confidenceThreshold / 100
                );
            }
            
            // Generate unique ID for this prediction
            result.id = `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            
            // Add league info to result
            result.league = this.currentLeague;
            
            // Display results
            this._displayPredictionResults(result);
            
            // Show visualization
            this._renderPredictionVisualization(result);
            
            // Show export options
            this._showExportOptions();
            
            // Add to history
            this._addToPredictionHistory({
                id: result.id,
                type: 'single',
                factor: factorText,
                result: result,
                timestamp: Date.now(),
                league: this.currentLeague
            });
            
            // Track successful prediction
            analyticsService.trackEvent('predictions', 'single_factor_prediction_completed', {
                probability: result.probability,
                confidence: result.confidence,
                league: this.currentLeague
            });
            
        } catch (error) {
            Logger.error('Error making single factor prediction:', error);
            this._showPredictionError(error);
            
            // Track error
            analyticsService.trackEvent('predictions', 'prediction_error', {
                error_type: error.name,
                error_message: error.message
            });
        } finally {
            this._setLoadingState(false);
        }
    }
    
    /**
     * Handle multi-factor prediction
     */
    async _handleMultiFactorPrediction() {
        try {
            // Get factor inputs
            const factorTexts = this.factorInputs.map(input => input.value.trim()).filter(text => text);
            
            if (factorTexts.length === 0) {
                notificationService.showNotification('Please enter at least one prediction factor', 'warning');
                return;
            }
            
            // Get correlation method
            const correlationMethod = this.container.querySelector('#correlation-method')?.value || 'auto';
            
            // Show loading state
            this._setLoadingState(true);
            
            // Track prediction request
            analyticsService.trackEvent('predictions', 'multi_factor_prediction_requested', {
                factor_count: factorTexts.length,
                correlation_method: correlationMethod,
                league: this.currentLeague
            });
            
            // Make prediction request
            let result;
            if (this.offlineMode) {
                // Use local prediction engine in offline mode
                result = await predictionEngine.predictMultiFactors(
                    factorTexts,
                    this.maxFactors,
                    true, // include_analysis
                    correlationMethod
                );
            } else {
                // Use API in online mode
                result = await this._predictMultiFactors(
                    factorTexts,
                    correlationMethod
                );
            }
            
            // Generate unique ID for this prediction
            result.id = `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            
            // Add league info to result
            result.league = this.currentLeague;
            
            // Display results
            this._displayPredictionResults(result, true);
            
            // Show visualization
            this._renderPredictionVisualization(result, true);
            
            // Show export options
            this._showExportOptions();
            
            // Add to history
            this._addToPredictionHistory({
                id: result.id,
                type: 'multi',
                factors: factorTexts,
                result: result,
                timestamp: Date.now(),
                league: this.currentLeague
            });
            
            // Track successful prediction
            analyticsService.trackEvent('predictions', 'multi_factor_prediction_completed', {
                factor_count: factorTexts.length,
                combined_probability: result.combined_probability,
                confidence: result.confidence,
                league: this.currentLeague
            });
            
        } catch (error) {
            Logger.error('Error making multi-factor prediction:', error);
            this._showPredictionError(error);
            
            // Track error
            analyticsService.trackEvent('predictions', 'prediction_error', {
                error_type: error.name,
                error_message: error.message
            });
        } finally {
            this._setLoadingState(false);
        }
    }
    
    /**
     * Predict single factor
     */
    async _predictSingleFactor(factorText, includeSupportingData = true, includeDetailedAnalysis = true, confidenceThreshold = 0.7) {
        try {
            const response = await apiClient.post('/api/predictions/custom/single', {
                factor: factorText,
                include_supporting_data: includeSupportingData,
                include_detailed_analysis: includeDetailedAnalysis,
                confidence_threshold: confidenceThreshold,
                league: this.currentLeague !== 'all' ? this.currentLeague : undefined
            }, {
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                },
                timeout: API_CONFIG.requestTimeout
            });
            
            if (response.status !== 'success') {
                throw new Error(response.message || 'Failed to generate prediction');
            }
            
            return response.data;
            
        } catch (error) {
            Logger.error('API error making single factor prediction:', error);
            throw error;
        }
    }
    
    /**
     * Predict multiple factors
     */
    async _predictMultiFactors(factorTexts, correlationMethod = 'auto') {
        try {
            const response = await apiClient.post('/api/predictions/custom/multi', {
                factors: factorTexts,
                max_factors: this.maxFactors,
                include_analysis: true,
                correlation_method: correlationMethod,
                league: this.currentLeague !== 'all' ? this.currentLeague : undefined
            }, {
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                },
                timeout: API_CONFIG.requestTimeout
            });
            
            if (response.status !== 'success') {
                throw new Error(response.message || 'Failed to generate multi-factor prediction');
            }
            
            return response.data;
            
        } catch (error) {
            Logger.error('API error making multi-factor prediction:', error);
            throw error;
        }
    }
    
    /**
     * Display prediction results
     */
    _displayPredictionResults(result, isMultiFactor = false) {
        const resultsContainer = this.container.querySelector('#prediction-results');
        
        if (!resultsContainer) return;
        
        // Store current prediction
        this.currentPrediction = result;
        
        // Show results container
        resultsContainer.classList.remove('d-none');
        
        // Hide comparison results if visible
        const comparisonResults = this.container.querySelector('#comparison-results');
        if (comparisonResults) {
            comparisonResults.classList.add('d-none');
        }
        
        if (isMultiFactor) {
            // Display multi-factor results
            resultsContainer.innerHTML = this._renderMultiFactorResults(result);
        } else {
            // Display single factor results
            resultsContainer.innerHTML = this._renderSingleFactorResults(result);
        }
        
        // Set up event listeners for the prediction card
        this._setupPredictionCardEventListeners(result);
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    /**
     * Set up event listeners for prediction result card
     */
    _setupPredictionCardEventListeners(prediction) {
        const resultsContainer = this.container.querySelector('#prediction-results');
        
        // Add to comparison button
        resultsContainer.querySelector('.add-to-comparison-btn')?.addEventListener('click', () => {
            this._addPredictionToComparison(prediction);
        });
        
        // Share button
        resultsContainer.querySelector('.share-prediction-btn')?.addEventListener('click', () => {
            this._sharePrediction(prediction);
        });
        
        // Info buttons (tooltips)
        const infoButtons = resultsContainer.querySelectorAll('.info-tooltip');
        infoButtons.forEach(button => {
            new bootstrap.Tooltip(button);
        });
        
        // Probability distribution button
        resultsContainer.querySelector('.show-distribution-btn')?.addEventListener('click', () => {
            this._toggleProbabilityDistribution(prediction);
        });
        
        // Supporting data toggle
        resultsContainer.querySelector('.toggle-supporting-data')?.addEventListener('click', () => {
            resultsContainer.querySelector('.supporting-data-container')?.classList.toggle('d-none');
        });
        
        // Key insights toggle
        resultsContainer.querySelector('.toggle-insights')?.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const insightsContainer = resultsContainer.querySelector('.insights-content');
            
            if (insightsContainer) {
                insightsContainer.classList.toggle('d-none');
                
                // Toggle icon
                const icon = target.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down');
                    icon.classList.toggle('fa-chevron-up');
                }
            }
        });
    }
    
    /**
     * Render single factor results
     */
    _renderSingleFactorResults(result) {
        const probability = result.probability * 100;
        const confidenceClass = this._getConfidenceClass(result.confidence);
        
        // Format the factor description
        const factorDescription = result.raw_factor || result.factor || 'Prediction';
        
        // Generate insight texts
        const analysis = result.analysis || {};
        const insights = analysis.key_factors || [];
        
        // Get supporting data
        const supportingData = result.supporting_data || {};
        
        return `
            <div class="prediction-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-start">
                        <h4 class="prediction-factor">${factorDescription}</h4>
                        <button class="btn btn-sm btn-outline-primary add-to-comparison-btn">
                            <i class="fas fa-plus"></i> Compare
                        </button>
                    </div>
                    <p class="text-muted mb-0 text-sm">${analysis.summary || ''}</p>
                </div>
                
                <div class="row align-items-center mb-4">
                    <div class="col-md-7">
                        <div class="d-flex align-items-center mb-2">
                            <h5 class="mb-0 me-2">Probability</h5>
                            <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                data-bs-toggle="tooltip" 
                                data-bs-placement="top" 
                                title="Our AI-calculated probability of this outcome occurring based on historical data and current factors">
                                <i class="fas fa-info-circle text-muted"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 ms-2 show-distribution-btn">
                                <i class="fas fa-chart-area text-muted"></i>
                            </button>
                        </div>
                        <div class="progress" style="height: 25px;">
                            <div class="progress-bar bg-${this._getProbabilityClass(probability)}" 
                                role="progressbar" 
                                style="width: ${probability}%;"
                                aria-valuenow="${probability}" 
                                aria-valuemin="0" 
                                aria-valuemax="100">
                                ${probability.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    <div class="col-md-5 mt-3 mt-md-0">
                        <div class="confidence-container p-3 rounded bg-light">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <div class="d-flex align-items-center">
                                    <h6 class="mb-0 me-2">Confidence</h6>
                                    <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                        data-bs-toggle="tooltip" 
                                        data-bs-placement="top" 
                                        title="How confident our model is in this prediction. Higher confidence indicates more reliable odds.">
                                        <i class="fas fa-info-circle text-muted"></i>
                                    </button>
                                </div>
                                <span class="badge bg-${confidenceClass}">${(result.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div class="progress" style="height: 8px;">
                                <div class="progress-bar bg-${confidenceClass}" 
                                    role="progressbar" 
                                    style="width: ${result.confidence * 100}%;" 
                                    aria-valuenow="${result.confidence * 100}" 
                                    aria-valuemin="0" 
                                    aria-valuemax="100">
                                </div>
                            </div>
                            <div class="prediction-strength text-${confidenceClass} text-sm mt-1">
                                ${analysis.strength || 'Moderate Confidence'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="insights-section border-top pt-3 mt-2">
                    <div class="d-flex justify-content-between align-items-center mb-2 toggle-insights cursor-pointer">
                        <h6 class="mb-0">Key Insights</h6>
                        <i class="fas fa-chevron-down text-muted"></i>
                    </div>
                    <div class="insights-content">
                        ${insights.length > 0 ? `
                            <ul class="text-sm">
                                ${insights.map(insight => `<li>${insight}</li>`).join('')}
                            </ul>
                        ` : '<p class="text-muted text-sm">No additional insights available</p>'}
                    </div>
                </div>
                
                ${supportingData && Object.keys(supportingData).length > 0 ? `
                    <div class="supporting-data border-top pt-3 mt-3">
                        <div class="d-flex justify-content-between align-items-center mb-2 toggle-supporting-data cursor-pointer">
                            <h6 class="mb-0">Supporting Data</h6>
                            <i class="fas fa-chevron-down text-muted"></i>
                        </div>
                        <div class="supporting-data-container d-none">
                            <div class="table-responsive">
                                <table class="table table-sm text-sm">
                                    <tbody>
                                        ${Object.entries(supportingData).map(([key, value]) => `
                                            <tr>
                                                <td class="fw-medium">${key.replace(/_/g, ' ')}</td>
                                                <td>${typeof value === 'object' ? JSON.stringify(value) : value}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                <div class="mt-4 text-end">
                    <button class="btn btn-sm btn-outline-success me-2 save-prediction-btn">
                        <i class="fas fa-bookmark"></i> Save
                    </button>
                    <button class="btn btn-sm btn-outline-primary share-prediction-btn">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Render multi-factor results
     */
    _renderMultiFactorResults(result) {
        const probability = result.combined_probability * 100;
        const confidenceClass = this._getConfidenceClass(result.confidence);
        
        // Get factors and their probabilities
        const factors = result.factors || [];
        const individualProbabilities = result.individual_probabilities || [];
        
        // Get correlation info
        const correlationInfo = (result.analysis && result.analysis.correlation) || { level: 'Unknown', value: 0 };
        
        // Get insights
        const insights = (result.analysis && result.analysis.key_insights) || [];
        
        return `
            <div class="prediction-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-start">
                        <h4 class="prediction-title">Multi-Factor Prediction</h4>
                        <button class="btn btn-sm btn-outline-primary add-to-comparison-btn">
                            <i class="fas fa-plus"></i> Compare
                        </button>
                    </div>
                    <p class="text-muted mb-0 text-sm">${result.analysis?.summary || 'Combined prediction for multiple factors'}</p>
                </div>
                
                <div class="row align-items-center mb-4">
                    <div class="col-md-7">
                        <div class="d-flex align-items-center mb-2">
                            <h5 class="mb-0 me-2">Combined Probability</h5>
                            <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                data-bs-toggle="tooltip" 
                                data-bs-placement="top" 
                                title="The probability of all factors occurring together, taking into account correlations between events">
                                <i class="fas fa-info-circle text-muted"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 ms-2 show-distribution-btn">
                                <i class="fas fa-chart-area text-muted"></i>
                            </button>
                        </div>
                        <div class="progress" style="height: 25px;">
                            <div class="progress-bar bg-${this._getProbabilityClass(probability)}" 
                                role="progressbar" 
                                style="width: ${probability}%;"
                                aria-valuenow="${probability}" 
                                aria-valuemin="0" 
                                aria-valuemax="100">
                                ${probability.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    <div class="col-md-5 mt-3 mt-md-0">
                        <div class="confidence-container p-3 rounded bg-light">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <div class="d-flex align-items-center">
                                    <h6 class="mb-0 me-2">Confidence</h6>
                                    <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                        data-bs-toggle="tooltip" 
                                        data-bs-placement="top" 
                                        title="How confident our model is in this prediction. Higher confidence indicates more reliable odds.">
                                        <i class="fas fa-info-circle text-muted"></i>
                                    </button>
                                </div>
                                <span class="badge bg-${confidenceClass}">${(result.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div class="progress" style="height: 8px;">
                                <div class="progress-bar bg-${confidenceClass}" 
                                    role="progressbar" 
                                    style="width: ${result.confidence * 100}%;" 
                                    aria-valuenow="${result.confidence * 100}" 
                                    aria-valuemin="0" 
                                    aria-valuemax="100">
                                </div>
                            </div>
                            <div class="prediction-strength text-${confidenceClass} text-sm mt-1">
                                ${result.analysis?.strength || 'Moderate Confidence'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="individual-factors mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Individual Factors</h6>
                        <div class="correlation-badge d-flex align-items-center">
                            <span class="text-sm text-muted me-1">Correlation:</span>
                            <span class="badge ${correlationInfo.level === 'Strong' ? 'bg-danger' : 
                                              correlationInfo.level === 'Moderate' ? 'bg-warning' : 
                                              correlationInfo.level === 'Weak' ? 'bg-info' : 'bg-secondary'}">
                                ${correlationInfo.level}
                            </span>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm text-sm">
                            <thead>
                                <tr>
                                    <th>Factor</th>
                                    <th class="text-end">Probability</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${factors.map((factor, i) => `
                                    <tr>
                                        <td>${factor.raw_text || factor}</td>
                                        <td class="text-end font-weight-bold">
                                            <div class="d-flex align-items-center justify-content-end">
                                                <div class="progress me-2" style="width: 60px; height: 8px;">
                                                    <div class="progress-bar bg-${this._getProbabilityClass(individualProbabilities[i] * 100)}" 
                                                        role="progressbar" 
                                                        style="width: ${individualProbabilities[i] * 100}%;"
                                                        aria-valuenow="${individualProbabilities[i] * 100}" 
                                                        aria-valuemin="0" 
                                                        aria-valuemax="100">
                                                    </div>
                                                </div>
                                                ${(individualProbabilities[i] * 100).toFixed(1)}%
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="insights-section border-top pt-3 mt-2">
                    <div class="d-flex justify-content-between align-items-center mb-2 toggle-insights cursor-pointer">
                        <h6 class="mb-0">Key Insights</h6>
                        <i class="fas fa-chevron-down text-muted"></i>
                    </div>
                    <div class="insights-content">
                        ${insights.length > 0 ? `
                            <ul class="text-sm">
                                ${insights.map(insight => `<li>${insight}</li>`).join('')}
                            </ul>
                        ` : '<p class="text-muted text-sm">No additional insights available</p>'}
                    </div>
                </div>
                
                <div class="mt-4 text-end">
                    <button class="btn btn-sm btn-outline-success me-2 save-prediction-btn">
                        <i class="fas fa-bookmark"></i> Save
                    </button>
                    <button class="btn btn-sm btn-outline-primary share-prediction-btn">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Render prediction visualization
     */
    _renderPredictionVisualization(prediction, isMultiFactor = false) {
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        
        if (!visualizationContainer) return;
        
        // Show container
        visualizationContainer.classList.remove('d-none');
        
        try {
            // Clear previous visualizations
            visualizationContainer.innerHTML = '';
            
            // Create visualization based on prediction type
            if (isMultiFactor) {
                this._createMultiFactorVisualization(prediction, visualizationContainer);
            } else {
                this._createSingleFactorVisualization(prediction, visualizationContainer);
            }
        } catch (error) {
            Logger.error('Error rendering prediction visualization:', error);
            visualizationContainer.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Could not render visualization. ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * Create single factor visualization
     */
    _createSingleFactorVisualization(prediction, container) {
        // Create a container for the D3 visualization
        const vizContainer = document.createElement('div');
        vizContainer.className = 'single-factor-viz d-flex justify-content-center my-3';
        vizContainer.style.height = '200px';
        container.appendChild(vizContainer);
        
        // Use D3 to create a visualization
        const width = vizContainer.clientWidth || 600;
        const height = vizContainer.clientHeight || 200;
        const margin = { top: 20, right: 30, bottom: 40, left: 40 };
        
        const svg = d3.select(vizContainer)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create a probability gauge
        const gaugeWidth = width * 0.8;
        const gaugeHeight = height * 0.6;
        const gaugeX = (width - gaugeWidth) / 2;
        const gaugeY = (height - gaugeHeight) / 2;
        
        // Draw gauge background
        svg.append('rect')
            .attr('x', gaugeX)
            .attr('y', gaugeY)
            .attr('width', gaugeWidth)
            .attr('height', gaugeHeight)
            .attr('rx', 5)
            .attr('ry', 5)
            .attr('fill', '#f0f0f0');
        
        // Draw gauge fill based on probability
        const probability = prediction.probability;
        const fillWidth = gaugeWidth * probability;
        
        svg.append('rect')
            .attr('x', gaugeX)
            .attr('y', gaugeY)
            .attr('width', fillWidth)
            .attr('height', gaugeHeight)
            .attr('rx', 5)
            .attr('ry', 5)
            .attr('fill', this._getProbabilityColor(probability * 100));
        
        // Add probability text
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', gaugeY + gaugeHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', probability > 0.5 ? 'white' : 'black')
            .attr('font-weight', 'bold')
            .attr('font-size', '24px')
            .text(`${(probability * 100).toFixed(1)}%`);
        
        // Add scale marks
        const scaleY = gaugeY + gaugeHeight + 10;
        for (let i = 0; i <= 10; i++) {
            const scaleX = gaugeX + (gaugeWidth * i / 10);
            
            svg.append('line')
                .attr('x1', scaleX)
                .attr('y1', scaleY)
                .attr('x2', scaleX)
                .attr('y2', scaleY + 5)
                .attr('stroke', '#666')
                .attr('stroke-width', i % 5 === 0 ? 2 : 1);
            
            if (i % 2 === 0) {
                svg.append('text')
                    .attr('x', scaleX)
                    .attr('y', scaleY + 15)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#666')
                    .attr('font-size', '12px')
                    .text(`${i * 10}%`);
            }
        }
        
        // Add prediction factor as title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', gaugeY - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', '#333')
            .attr('font-size', '14px')
            .text('Probability Gauge');
    }
    
    /**
     * Create multi-factor visualization
     */
    _createMultiFactorVisualization(prediction, container) {
        // Get data needed for visualization
        const individualProbabilities = prediction.individual_probabilities || [];
        const factors = prediction.factors || [];
        const combinedProbability = prediction.combined_probability;
        
        // Limit factors to display (for readability)
        const displayLimit = 5;
        const displayFactors = factors.slice(0, displayLimit);
        const displayProbabilities = individualProbabilities.slice(0, displayLimit);
        
        // Create a container for the radar chart
        const radarContainer = document.createElement('div');
        radarContainer.className = 'multi-factor-viz d-flex flex-column align-items-center my-3';
        container.appendChild(radarContainer);
        
        // Add title
        const title = document.createElement('h6');
        title.className = 'text-center mb-2';
        title.textContent = 'Factor Probability Analysis';
        radarContainer.appendChild(title);
        
        // Create SVG container
        const width = 500;
        const height = 400;
        const margin = { top: 50, right: 50, bottom: 50, left: 50 };
        
        const svg = d3.select(radarContainer)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create bar chart
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(displayFactors.map((_, i) => `Factor ${i + 1}`))
            .range([0, chartWidth])
            .padding(0.3);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([chartHeight, 0]);
        
        // Create chart group
        const chartGroup = svg.append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);
        
        // Add x-axis
        chartGroup.append('g')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(d3.axisBottom(xScale));
        
        // Add y-axis
        chartGroup.append('g')
            .call(d3.axisLeft(yScale).ticks(10, '%'));
        
        // Add bars for individual probabilities
        chartGroup.selectAll('.factor-bar')
            .data(displayProbabilities)
            .enter()
            .append('rect')
            .attr('class', 'factor-bar')
            .attr('x', (d, i) => xScale(`Factor ${i + 1}`))
            .attr('y', d => yScale(d))
            .attr('width', xScale.bandwidth())
            .attr('height', d => chartHeight - yScale(d))
            .attr('fill', d => this._getProbabilityColor(d * 100));
        
        // Add bar labels
        chartGroup.selectAll('.bar-label')
            .data(displayProbabilities)
            .enter()
            .append('text')
            .attr('class', 'bar-label')
            .attr('x', (d, i) => xScale(`Factor ${i + 1}`) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d) - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text(d => `${(d * 100).toFixed(0)}%`);
        
        // Add combined probability line
        chartGroup.append('line')
            .attr('x1', 0)
            .attr('y1', yScale(combinedProbability))
            .attr('x2', chartWidth)
            .attr('y2', yScale(combinedProbability))
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        // Add combined probability label
        chartGroup.append('text')
            .attr('x', chartWidth)
            .attr('y', yScale(combinedProbability) - 5)
            .attr('text-anchor', 'end')
            .attr('font-size', '12px')
            .attr('fill', 'red')
            .text(`Combined: ${(combinedProbability * 100).toFixed(0)}%`);
        
        // Add factor tooltips
        for (let i = 0; i < displayFactors.length; i++) {
            const factorText = displayFactors[i].length > 30 
                ? displayFactors[i].substring(0, 27) + '...' 
                : displayFactors[i];
                
            chartGroup.append('title')
                .text(factorText);
        }
    }
    
    /**
     * Toggle probability distribution visualization
     */
    _toggleProbabilityDistribution(prediction) {
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        
        if (!visualizationContainer) return;
        
        // Toggle visibility
        const isVisible = !visualizationContainer.classList.contains('d-none');
        
        if (isVisible) {
            visualizationContainer.classList.add('d-none');
        } else {
            visualizationContainer.classList.remove('d-none');
            
            // Render the probability distribution
            this._renderProbabilityDistribution(prediction, visualizationContainer);
        }
    }
    
    /**
     * Render probability distribution visualization
     */
    _renderProbabilityDistribution(prediction, container) {
        // Clear previous visualizations
        container.innerHTML = '';
        
        // Create title
        const title = document.createElement('h6');
        title.className = 'text-center mb-3';
        title.textContent = 'Probability Distribution';
        container.appendChild(title);
        
        // Create SVG container
        const width = 600;
        const height = 300;
        const margin = { top: 20, right: 30, bottom: 40, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Generate probability distribution data
        // This would normally come from the API with actual distribution data
        // For now, we'll simulate a bell curve around the predicted probability
        const distributionData = this._generateProbabilityDistribution(
            prediction.probability,
            prediction.confidence
        );
        
        // Create scales
        const xScale = d3.scaleLinear()
            .domain([0, 1])
            .range([margin.left, width - margin.right]);
        
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(distributionData, d => d.density)])
            .range([height - margin.bottom, margin.top]);
        
        // Create line generator
        const line = d3.line()
            .x(d => xScale(d.probability))
            .y(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Create area generator
        const area = d3.area()
            .x(d => xScale(d.probability))
            .y0(height - margin.bottom)
            .y1(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Draw axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(10, '%'));
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale));
        
        // Add axis labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Probability');
        
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Density');
        
        // Draw area
        svg.append('path')
            .datum(distributionData)
            .attr('fill', 'rgba(72, 133, 237, 0.2)')
            .attr('d', area);
        
        // Draw line
        svg.append('path')
            .datum(distributionData)
            .attr('fill', 'none')
            .attr('stroke', '#4885ed')
            .attr('stroke-width', 2)
            .attr('d', line);
        
        // Draw predicted probability line
        svg.append('line')
            .attr('x1', xScale(prediction.probability))
            .attr('y1', margin.top)
            .attr('x2', xScale(prediction.probability))
            .attr('y2', height - margin.bottom)
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        // Add predicted probability label
        svg.append('text')
            .attr('x', xScale(prediction.probability))
            .attr('y', margin.top - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'red')
            .text(`${(prediction.probability * 100).toFixed(1)}%`);
        
        // Add confidence interval
        const confidenceInterval = this._calculateConfidenceInterval(
            prediction.probability,
            prediction.confidence
        );
        
        svg.append('rect')
            .attr('x', xScale(confidenceInterval.lower))
            .attr('y', margin.top)
            .attr('width', xScale(confidenceInterval.upper) - xScale(confidenceInterval.lower))
            .attr('height', height - margin.top - margin.bottom)
            .attr('fill', 'rgba(255, 0, 0, 0.1)')
            .attr('stroke', 'rgba(255, 0, 0, 0.3)')
            .attr('stroke-width', 1);
        
        // Add confidence interval labels
        svg.append('text')
            .attr('x', xScale(confidenceInterval.lower))
            .attr('y', height - margin.bottom + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .text(`${(confidenceInterval.lower * 100).toFixed(1)}%`);
        
        svg.append('text')
            .attr('x', xScale(confidenceInterval.upper))
            .attr('y', height - margin.bottom + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .text(`${(confidenceInterval.upper * 100).toFixed(1)}%`);
        
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - margin.bottom + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-style', 'italic')
            .text('95% Confidence Interval');
    }
    
    /**
     * Generate probability distribution data
     */
    _generateProbabilityDistribution(probability, confidence) {
        const points = 100;
        const distributionData = [];
        
        // Use confidence to determine the standard deviation
        // Lower confidence = wider distribution
        const stdDev = 0.2 * (1 - confidence);
        
        for (let i = 0; i <= points; i++) {
            const x = i / points;
            
            // Calculate normal distribution density
            const density = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * 
                           Math.exp(-0.5 * Math.pow((x - probability) / stdDev, 2));
            
            distributionData.push({
                probability: x,
                density: density
            });
        }
        
        return distributionData;
    }
    
    /**
     * Calculate confidence interval
     */
    _calculateConfidenceInterval(probability, confidence) {
        // Use confidence to determine width of interval
        const intervalWidth = 0.2 * (1 - confidence);
        
        return {
            lower: Math.max(0, probability - intervalWidth),
            upper: Math.min(1, probability + intervalWidth)
        };
    }
    
    /**
     * Show export options
     */
    _showExportOptions() {
        const exportOptions = this.container.querySelector('#export-options');
        
        if (exportOptions) {
            exportOptions.classList.remove('d-none');
        }
    }
    
    /**
     * Show prediction error
     */
    _showPredictionError(error) {
        const errorContainer = this.container.querySelector('#prediction-error');
        
        if (!errorContainer) return;
        
        // Show error container
        errorContainer.classList.remove('d-none');
        
        // Hide results container
        const resultsContainer = this.container.querySelector('#prediction-results');
        if (resultsContainer) {
            resultsContainer.classList.add('d-none');
        }
        
        // Hide visualization container
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        if (visualizationContainer) {
            visualizationContainer.classList.add('d-none');
        }
        
        // Hide export options
        const exportOptions = this.container.querySelector('#export-options');
        if (exportOptions) {
            exportOptions.classList.add('d-none');
        }
        
        // Display error message
        errorContainer.innerHTML = `
            <div class="alert alert-danger">
                <h5 class="alert-heading">Prediction Error</h5>
                <p>${error.message || 'An unknown error occurred while generating the prediction'}</p>
                <div class="mt-2">
                    <button class="btn btn-sm btn-danger retry-prediction-btn me-2">Try Again</button>
                    ${this.offlineMode ? '' : `
                        <button class="btn btn-sm btn-outline-secondary try-offline-btn">Try in Offline Mode</button>
                    `}
                </div>
            </div>
        `;
        
        // Add event listener to retry button
        errorContainer.querySelector('.retry-prediction-btn')?.addEventListener('click', () => {
            errorContainer.classList.add('d-none');
            
            // Detect current tab
            const activeTab = this.container.querySelector('.tab-button.active');
            if (activeTab) {
                const tabName = activeTab.getAttribute('data-tab');
                
                if (tabName === 'single-factor') {
                    this._handleSingleFactorPrediction();
                } else if (tabName === 'multi-factor') {
                    this._handleMultiFactorPrediction();
                }
            }
        });
        
        // Add event listener to offline mode button
        errorContainer.querySelector('.try-offline-btn')?.addEventListener('click', () => {
            this.offlineMode = true;
            errorContainer.classList.add('d-none');
            this._updateOfflineUI();
            
            // Detect current tab
            const activeTab = this.container.querySelector('.tab-button.active');
            if (activeTab) {
                const tabName = activeTab.getAttribute('data-tab');
                
                if (tabName === 'single-factor') {
                    this._handleSingleFactorPrediction();
                } else if (tabName === 'multi-factor') {
                    this._handleMultiFactorPrediction();
                }
            }
        });
    }
    
    /**
     * Set loading state
     */
    _setLoadingState(isLoading) {
        this.isLoading = isLoading;
        
        const loadingContainer = this.container.querySelector('#prediction-loading');
        const resultsContainer = this.container.querySelector('#prediction-results');
        const errorContainer = this.container.querySelector('#prediction-error');
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        const exportOptions = this.container.querySelector('#export-options');
        
        if (isLoading) {
            loadingContainer?.classList.remove('d-none');
            resultsContainer?.classList.add('d-none');
            errorContainer?.classList.add('d-none');
            visualizationContainer?.classList.add('d-none');
            exportOptions?.classList.add('d-none');
            
            // Disable prediction buttons
            const predictionButtons = this.container.querySelectorAll('button[id$="-predict-button"]');
            predictionButtons.forEach(button => {
                button.disabled = true;
                button.innerHTML = `
                    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Generating...
                `;
            });
        } else {
            loadingContainer?.classList.add('d-none');
            
            // Re-enable prediction buttons
            const predictionButtons = this.container.querySelectorAll('button[id$="-predict-button"]');
            predictionButtons.forEach(button => {
                button.disabled = false;
                
                if (button.id === 'single-predict-button') {
                    button.innerHTML = 'Generate Prediction';
                } else if (button.id === 'multi-predict-button') {
                    button.innerHTML = 'Generate Multi-Factor Prediction';
                }
            });
        }
    }
    
    /**
     * Add prediction to history
     */
    async _addToPredictionHistory(prediction) {
        // Add to history
        this.predictionHistory.unshift(prediction);
        
        // Keep only last 20 predictions
        if (this.predictionHistory.length > 20) {
            this.predictionHistory.pop();
        }
        
        // Save to IndexedDB for offline access
        if (prediction.id) {
            await this._saveToIndexedDB(prediction);
        }
        
        // Update history display
        this._updatePredictionHistory();
        
        // Update history visualization
        this._updateHistoryVisualization();
        
        // Sync to server if online
        if (!this.offlineMode) {
            try {
                await apiClient.post('/api/predictions/history', {
                    prediction: prediction
                }, {
                    headers: {
                        'Authorization': `Bearer ${authService.getToken()}`,
                        'X-API-Key': API_CONFIG.predictionApiKey
                    }
                });
            } catch (error) {
                Logger.error('Error syncing prediction to server:', error);
                // Mark as unsynced
                prediction.synced = false;
                await this._saveToIndexedDB(prediction);
            }
        } else {
            // Mark as unsynced if offline
            prediction.synced = false;
            await this._saveToIndexedDB(prediction);
        }
    }
    
    /**
     * Update prediction history display
     */
    _updatePredictionHistory() {
        const historyContainer = this.container.querySelector('#prediction-history');
        
        if (!historyContainer) return;
        
        // Get filtered predictions based on current league
        let filteredPredictions = this.predictionHistory;
        
        if (this.currentLeague !== 'all') {
            filteredPredictions = this.predictionHistory.filter(prediction => 
                prediction.league === this.currentLeague || !prediction.league
            );
        }
        
        if (filteredPredictions.length === 0) {
            historyContainer.innerHTML = '<p class="text-gray-500 text-sm">No recent predictions for this league</p>';
            return;
        }
        
        // Render history items
        historyContainer.innerHTML = `
            <div class="history-items">
                ${filteredPredictions.map((item, index) => this._renderHistoryItem(item, index)).join('')}
            </div>
        `;
        
        // Add event listeners for history items
        historyContainer.querySelectorAll('.history-item').forEach((item, index) => {
            const predictionId = item.getAttribute('data-prediction-id');
            const prediction = this.predictionHistory.find(p => p.id === predictionId);
            
            item.addEventListener('click', () => {
                if (prediction) {
                    this._displayPredictionResults(prediction.result, prediction.type === 'multi');
                    this._renderPredictionVisualization(prediction.result, prediction.type === 'multi');
                    this._showExportOptions();
                    this.currentPrediction = prediction.result;
                }
            });
            
            // Add to comparison button
            const compareBtn = item.querySelector('.add-to-comparison-history-btn');
            if (compareBtn) {
                compareBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent item click
                    if (prediction) {
                        this._addPredictionToComparison(prediction.result);
                    }
                });
            }
        });
    }
    
    /**
     * Render history item
     */
    _renderHistoryItem(item, index) {
        const timestamp = new Date(item.timestamp || Date.now()).toLocaleString();
        
        if (item.type === 'single') {
            const probability = item.result.probability * 100;
            
            return `
                <div class="history-item bg-white rounded shadow-sm p-3 mb-2 cursor-pointer hover:bg-gray-50" 
                     data-prediction-id="${item.id}"
                     data-index="${index}">
                    <div class="d-flex justify-content-between">
                        <div class="history-content flex-grow-1">
                            <div class="factor-text font-weight-medium">${item.factor}</div>
                            <div class="d-flex align-items-center mt-1">
                                <div class="text-sm text-muted">${timestamp}</div>
                                ${item.league ? `
                                    <div class="ms-2 league-badge px-2 py-0 rounded-pill bg-light text-xs">
                                        ${item.league.replace('_', ' ').toUpperCase()}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="history-actions d-flex flex-column align-items-end">
                            <span class="badge ${this._getProbabilityBadgeClass(probability)} mb-2">
                                ${probability.toFixed(1)}%
                            </span>
                            <button class="btn btn-sm btn-outline-primary add-to-comparison-history-btn py-0 px-1" title="Add to comparison">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    ${item.resolved ? `
                        <div class="resolved-indicator mt-1 text-xs ${item.resolvedResult?.correct ? 'text-success' : 'text-danger'}">
                            <i class="fas ${item.resolvedResult?.correct ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${item.resolvedResult?.correct ? 'Correct Prediction' : 'Incorrect Prediction'}
                        </div>
                    ` : ''}
                    ${!this.offlineMode && !item.synced ? `
                        <div class="unsynced-indicator mt-1 text-xs text-warning">
                            <i class="fas fa-cloud-upload-alt me-1"></i> Waiting to sync
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            const probability = item.result.combined_probability * 100;
            const factorCount = item.factors.length;
            
            return `
                <div class="history-item bg-white rounded shadow-sm p-3 mb-2 cursor-pointer hover:bg-gray-50" 
                     data-prediction-id="${item.id}"
                     data-index="${index}">
                    <div class="d-flex justify-content-between">
                        <div class="history-content flex-grow-1">
                            <div class="factor-text font-weight-medium">
                                <span class="badge bg-info text-white me-1">${factorCount}</span>
                                Multi-Factor Prediction
                            </div>
                            <div class="multi-factors text-xs text-muted mt-1">
                                ${item.factors.slice(0, 2).map(f => `<div class="truncate">${f}</div>`).join('')}
                                ${item.factors.length > 2 ? `<div class="text-xs text-muted">+ ${item.factors.length - 2} more factors</div>` : ''}
                            </div>
                            <div class="d-flex align-items-center mt-1">
                                <div class="text-sm text-muted">${timestamp}</div>
                                ${item.league ? `
                                    <div class="ms-2 league-badge px-2 py-0 rounded-pill bg-light text-xs">
                                        ${item.league.replace('_', ' ').toUpperCase()}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="history-actions d-flex flex-column align-items-end">
                            <span class="badge ${this._getProbabilityBadgeClass(probability)} mb-2">
                                ${probability.toFixed(1)}%
                            </span>
                            <button class="btn btn-sm btn-outline-primary add-to-comparison-history-btn py-0 px-1" title="Add to comparison">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    ${item.resolved ? `
                        <div class="resolved-indicator mt-1 text-xs ${item.resolvedResult?.correct ? 'text-success' : 'text-danger'}">
                            <i class="fas ${item.resolvedResult?.correct ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${item.resolvedResult?.correct ? 'Correct Prediction' : 'Incorrect Prediction'}
                        </div>
                    ` : ''}
                    ${!this.offlineMode && !item.synced ? `
                        <div class="unsynced-indicator mt-1 text-xs text-warning">
                            <i class="fas fa-cloud-upload-alt me-1"></i> Waiting to sync
                        </div>
                    ` : ''}
                </div>
            `;
        }
    }
    
    /**
     * Update history visualization
     */
    _updateHistoryVisualization() {
        const container = this.container.querySelector('#history-viz');
        
        if (!container || this.predictionHistory.length < 2) {
            return;
        }
        
        // Get data for the last 10 predictions
        const lastPredictions = this.predictionHistory.slice(0, 10).reverse();
        
        // Create labels and data points
        const labels = lastPredictions.map((_, i) => `Pred ${i + 1}`);
        
        const dataPoints = lastPredictions.map(pred => {
            return pred.type === 'single' 
                ? pred.result.probability 
                : pred.result.combined_probability;
        });
        
        // Clear previous visualizations
        container.innerHTML = '';
        
        // Create SVG for mini chart
        const width = container.clientWidth || 600;
        const height = 60;
        const margin = { top: 10, right: 10, bottom: 20, left: 30 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(labels)
            .range([margin.left, width - margin.right])
            .padding(0.2);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([height - margin.bottom, margin.top]);
        
        // Create line generator
        const line = d3.line()
            .x((d, i) => xScale(labels[i]) + xScale.bandwidth() / 2)
            .y(d => yScale(d))
            .curve(d3.curveMonotoneX);
        
        // Draw line
        svg.append('path')
            .datum(dataPoints)
            .attr('fill', 'none')
            .attr('stroke', '#4885ed')
            .attr('stroke-width', 2)
            .attr('d', line);
        
        // Draw points
        svg.selectAll('.point')
            .data(dataPoints)
            .enter()
            .append('circle')
            .attr('class', 'point')
            .attr('cx', (d, i) => xScale(labels[i]) + xScale.bandwidth() / 2)
            .attr('cy', d => yScale(d))
            .attr('r', 3)
            .attr('fill', (d, i) => this._getProbabilityColor(d * 100));
        
        // Draw x-axis
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).tickSize(0));
        
        // Draw y-axis
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale).ticks(3).tickFormat(d3.format('.0%')));
        
        // Add title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#666')
            .text('Recent Prediction Probabilities');
    }
    
    /**
     * Filter prediction history
     */
    _filterPredictionHistory(filterType) {
        // Store the current filter
        this.historyFilter = filterType;
        
        // Apply filter to history display
        const historyContainer = this.container.querySelector('#prediction-history');
        
        if (!historyContainer) return;
        
        // Get filtered predictions
        let filteredPredictions = this.predictionHistory;
        
        if (filterType === 'single') {
            filteredPredictions = this.predictionHistory.filter(p => p.type === 'single');
        } else if (filterType === 'multi') {
            filteredPredictions = this.predictionHistory.filter(p => p.type === 'multi');
        } else if (filterType === 'resolved') {
            filteredPredictions = this.predictionHistory.filter(p => p.resolved);
        } else if (filterType === 'unresolved') {
            filteredPredictions = this.predictionHistory.filter(p => !p.resolved);
        }
        
        if (this.currentLeague !== 'all') {
            filteredPredictions = filteredPredictions.filter(prediction => 
                prediction.league === this.currentLeague || !prediction.league
            );
        }
        
        if (filteredPredictions.length === 0) {
            historyContainer.innerHTML = `<p class="text-gray-500 text-sm">No predictions match the selected filter</p>`;
            return;
        }
        
        // Render filtered history items
        historyContainer.innerHTML = `
            <div class="history-items">
                ${filteredPredictions.map((item, index) => this._renderHistoryItem(item, index)).join('')}
            </div>
        `;
        
        // Add event listeners for history items
        historyContainer.querySelectorAll('.history-item').forEach((item) => {
            const predictionId = item.getAttribute('data-prediction-id');
            const prediction = this.predictionHistory.find(p => p.id === predictionId);
            
            item.addEventListener('click', () => {
                if (prediction) {
                    this._displayPredictionResults(prediction.result, prediction.type === 'multi');
                    this._renderPredictionVisualization(prediction.result, prediction.type === 'multi');
                    this._showExportOptions();
                    this.currentPrediction = prediction.result;
                }
            });
            
            // Add to comparison button
            const compareBtn = item.querySelector('.add-to-comparison-history-btn');
            if (compareBtn) {
                compareBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent item click
                    if (prediction) {
                        this._addPredictionToComparison(prediction.result);
                    }
                });
            }
        });
    }
    
    /**
     * Get probability badge class
     */
    _getProbabilityBadgeClass(probability) {
        if (probability >= 80) return 'bg-success text-white';
        if (probability >= 65) return 'bg-primary text-white';
        if (probability >= 50) return 'bg-info text-white';
        if (probability >= 35) return 'bg-warning text-dark';
        return 'bg-danger text-white';
    }
    
    /**
     * Get probability class based on value
     */
    _getProbabilityClass(probability) {
        if (probability >= 80) return 'success';
        if (probability >= 65) return 'primary';
        if (probability >= 50) return 'info';
        if (probability >= 35) return 'warning';
        return 'danger';
    }
    
    /**
     * Get probability color
     */
    _getProbabilityColor(probability) {
        if (probability >= 80) return '#28a745';
        if (probability >= 65) return '#007bff';
        if (probability >= 50) return '#17a2b8';
        if (probability >= 35) return '#ffc107';
        return '#dc3545';
    }
    
    /**
     * Get confidence class based on value
     */
    _getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'success';
        if (confidence >= 0.6) return 'primary';
        if (confidence >= 0.4) return 'info';
        if (confidence >= 0.2) return 'warning';
        return 'danger';
    }
    
    /**
     * Add prediction to comparison
     */
    _addPredictionToComparison(prediction) {
        if (!prediction.id) {
            prediction.id = `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        }
        
        // Check if already in comparisons
        if (this.pendingComparisons.includes(prediction.id)) {
            notificationService.showNotification('This prediction is already in your comparison', 'info');
            return;
        }
        
        // Add to pending comparisons
        this.pendingComparisons.push(prediction.id);
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Enable comparison button if needed
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = this.pendingComparisons.length < 2;
        }
        
        // Enable clear button
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = false;
        }
        
        // Switch to comparison tab
        const comparisonTab = this.container.querySelector('[data-tab="comparison"]');
        if (comparisonTab) {
            comparisonTab.click();
        }
        
        // Show notification
        notificationService.showNotification('Prediction added to comparison', 'success');
        
        // Track analytics
        analyticsService.trackEvent('predictions', 'add_to_comparison', {
            prediction_type: prediction.type,
            comparison_count: this.pendingComparisons.length
        });
    }
    
    /**
     * Update comparison items display
     */
    _updateComparisonItems() {
        const comparisonItems = this.container.querySelector('#comparison-items');
        
        if (!comparisonItems) return;
        
        if (this.pendingComparisons.length === 0) {
            comparisonItems.innerHTML = `
                <p class="text-center text-sm text-blue-200 py-3">
                    <i class="fas fa-info-circle me-1"></i> No predictions selected for comparison.
                    <br>Add predictions from your history or results.
                </p>
            `;
            return;
        }
        
        // Get prediction objects from IDs
        const comparisonPredictions = this.pendingComparisons
            .map(id => this.predictionHistory.find(p => p.id === id || p.result?.id === id))
            .filter(p => p); // Remove any not found
        
        comparisonItems.innerHTML = `
            <div class="selected-comparisons">
                ${comparisonPredictions.map(prediction => this._renderComparisonItem(prediction)).join('')}
            </div>
        `;
        
        // Add event listeners for remove buttons
        comparisonItems.querySelectorAll('.remove-comparison-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const predictionId =                 e.currentTarget.getAttribute('data-prediction-id');
                this._removePredictionFromComparison(predictionId);
            });
        });
    }
    
    /**
     * Render comparison item
     */
    _renderComparisonItem(prediction) {
        const factor = prediction.type === 'single' 
            ? prediction.factor 
            : `Multi-Factor (${prediction.factors?.length || 0} factors)`;
            
        const probability = prediction.type === 'single'
            ? prediction.result.probability * 100
            : prediction.result.combined_probability * 100;
            
        return `
            <div class="comparison-item p-2 mb-2 border rounded bg-light">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="comparison-content">
                        <div class="factor-text text-sm font-weight-medium truncate">
                            ${factor}
                        </div>
                        <div class="text-xs text-muted mt-1 d-flex align-items-center">
                            <div class="probability-badge me-2">
                                <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                                    ${probability.toFixed(1)}%
                                </span>
                            </div>
                            ${prediction.type === 'multi' ? `
                                <span class="badge bg-info text-white">Multi</span>
                            ` : ''}
                        </div>
                    </div>
                    <button class="btn btn-sm btn-link text-danger remove-comparison-btn" 
                        data-prediction-id="${prediction.id || prediction.result?.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Remove prediction from comparison
     */
    _removePredictionFromComparison(predictionId) {
        const index = this.pendingComparisons.indexOf(predictionId);
        if (index !== -1) {
            this.pendingComparisons.splice(index, 1);
        }
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Update button states
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = this.pendingComparisons.length < 2;
        }
        
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = this.pendingComparisons.length === 0;
        }
    }
    
    /**
     * Clear pending comparisons
     */
    _clearPendingComparisons() {
        this.pendingComparisons = [];
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Update button states
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = true;
        }
        
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = true;
        }
    }
    
    /**
     * Show comparison selection modal
     */
    _showComparisonSelectionModal() {
        const modal = document.getElementById('comparisonSelectionModal');
        
        if (!modal) return;
        
        // Get predictions container
        const predictionsContainer = modal.querySelector('.comparison-predictions-container');
        
        if (predictionsContainer) {
            // Show loading state
            predictionsContainer.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p class="mt-2">Loading predictions...</p>
                </div>
            `;
            
            // Load predictions
            setTimeout(() => {
                predictionsContainer.innerHTML = this._renderComparisonSelectionList();
                
                // Add event listeners
                const checkboxes = predictionsContainer.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        // Count selected items
                        const selectedCount = predictionsContainer.querySelectorAll('input[type="checkbox"]:checked').length;
                        
                        // Update add button state
                        const addButton = document.getElementById('add-to-comparison');
                        if (addButton) {
                            addButton.disabled = selectedCount === 0;
                            addButton.textContent = `Add Selected (${selectedCount})`;
                        }
                    });
                });
            }, 500);
        }
        
        // Initialize search
        const searchInput = modal.querySelector('#comparison-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.addEventListener('input', () => {
                this._filterComparisonSelection(searchInput.value);
            });
        }
        
        // Initialize filter
        const filterSelect = modal.querySelector('#comparison-filter');
        if (filterSelect) {
            filterSelect.value = 'all';
            filterSelect.addEventListener('change', () => {
                this._filterComparisonSelection(searchInput.value, filterSelect.value);
            });
        }
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
    
    /**
     * Render comparison selection list
     */
    _renderComparisonSelectionList() {
        // No predictions
        if (this.predictionHistory.length === 0) {
            return `
                <div class="text-center py-3">
                    <p class="text-muted">No predictions found</p>
                </div>
            `;
        }
        
        // Render predictions as checkboxes
        return `
            <div class="comparison-selection-list">
                <div class="list-group">
                    ${this.predictionHistory.map(prediction => {
                        const factor = prediction.type === 'single' 
                            ? prediction.factor 
                            : `Multi-Factor (${prediction.factors?.length || 0} factors)`;
                            
                        const probability = prediction.type === 'single'
                            ? prediction.result.probability * 100
                            : prediction.result.combined_probability * 100;
                        
                        const isAlreadySelected = this.pendingComparisons.includes(prediction.id || prediction.result?.id);
                        
                        return `
                            <label class="list-group-item list-group-item-action d-flex align-items-center">
                                <input type="checkbox" class="form-check-input me-3" 
                                    value="${prediction.id || prediction.result?.id}"
                                    ${isAlreadySelected ? 'checked disabled' : ''}>
                                <div class="flex-grow-1">
                                    <div class="d-flex justify-content-between">
                                        <div class="prediction-text">
                                            ${factor.length > 50 ? factor.substring(0, 47) + '...' : factor}
                                        </div>
                                        <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                                            ${probability.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div class="text-xs text-muted mt-1">
                                        ${new Date(prediction.timestamp || Date.now()).toLocaleString()}
                                        ${prediction.type === 'multi' ? ' • Multi-Factor' : ''}
                                        ${prediction.league ? ` • ${prediction.league.replace('_', ' ').toUpperCase()}` : ''}
                                    </div>
                                </div>
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    /**
     * Filter comparison selection
     */
    _filterComparisonSelection(searchTerm = '', filterType = 'all') {
        const modal = document.getElementById('comparisonSelectionModal');
        
        if (!modal) return;
        
        const items = modal.querySelectorAll('.list-group-item');
        
        items.forEach(item => {
            const predictionText = item.querySelector('.prediction-text')?.textContent.toLowerCase() || '';
            const typeInfo = item.querySelector('.text-muted')?.textContent.toLowerCase() || '';
            
            // Check if matches search
            const matchesSearch = !searchTerm || predictionText.includes(searchTerm.toLowerCase());
            
            // Check if matches filter
            let matchesFilter = true;
            
            if (filterType === 'single') {
                matchesFilter = !typeInfo.includes('multi-factor');
            } else if (filterType === 'multi') {
                matchesFilter = typeInfo.includes('multi-factor');
            } else if (filterType === 'resolved') {
                matchesFilter = item.querySelector('.resolved-indicator') !== null;
            }
            
            // Show or hide based on filters
            item.style.display = matchesSearch && matchesFilter ? 'flex' : 'none';
        });
        
        // Check if no results
        const visibleItems = Array.from(items).filter(item => item.style.display !== 'none');
        
        const predictionsContainer = modal.querySelector('.comparison-predictions-container');
        const noResults = predictionsContainer.querySelector('.no-results');
        
        if (visibleItems.length === 0) {
            if (!noResults) {
                const noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'no-results text-center py-3';
                noResultsMsg.innerHTML = `
                    <p class="text-muted">No predictions match your search</p>
                `;
                predictionsContainer.appendChild(noResultsMsg);
            }
        } else if (noResults) {
            noResults.remove();
        }
    }
    
    /**
     * Add selected predictions to comparison
     */
    _addSelectedToComparison() {
        const modal = document.getElementById('comparisonSelectionModal');
        
        if (!modal) return;
        
        // Get selected checkboxes
        const selectedCheckboxes = modal.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
        
        if (selectedCheckboxes.length === 0) {
            return;
        }
        
        // Add to pending comparisons
        selectedCheckboxes.forEach(checkbox => {
            const predictionId = checkbox.value;
            if (!this.pendingComparisons.includes(predictionId)) {
                this.pendingComparisons.push(predictionId);
            }
        });
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Update button states
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = this.pendingComparisons.length < 2;
        }
        
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = false;
        }
        
        // Close modal
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal.hide();
        
        // Show notification
        notificationService.showNotification(`Added ${selectedCheckboxes.length} predictions to comparison`, 'success');
    }
    
    /**
     * Generate comparison analysis
     */
    _generateComparisonAnalysis() {
        try {
            if (this.pendingComparisons.length < 2) {
                notificationService.showNotification('You need at least 2 predictions to compare', 'warning');
                return;
            }
            
            // Get prediction objects from IDs
            const comparisonPredictions = this.pendingComparisons
                .map(id => {
                    const prediction = this.predictionHistory.find(p => p.id === id || p.result?.id === id);
                    return prediction 
                        ? {
                            id: prediction.id || prediction.result?.id,
                            type: prediction.type,
                            factor: prediction.type === 'single' ? prediction.factor : null,
                            factors: prediction.type === 'multi' ? prediction.factors : null,
                            probability: prediction.type === 'single' 
                                ? prediction.result.probability 
                                : prediction.result.combined_probability,
                            confidence: prediction.result.confidence,
                            result: prediction.result,
                            timestamp: prediction.timestamp,
                            league: prediction.league
                        }
                        : null;
                })
                .filter(p => p); // Remove any not found
            
            // Show loading state
            this._setLoadingState(true);
            
            // Generate comparison
            setTimeout(() => {
                // Generate comparison analysis result
                const analysisResult = this._analyzeComparisons(comparisonPredictions);
                
                // Display results
                this._displayComparisonResults(analysisResult);
                
                // Create visualization based on current mode
                this._updateComparisonVisualization(this.visualizationMode);
                
                // End loading state
                this._setLoadingState(false);
                
                // Track analytics
                analyticsService.trackEvent('predictions', 'comparison_generated', {
                    prediction_count: comparisonPredictions.length,
                    visualization_mode: this.visualizationMode
                });
            }, 1500);
            
        } catch (error) {
            Logger.error('Error generating comparison analysis:', error);
            this._setLoadingState(false);
            this._showPredictionError(error);
        }
    }
    
    /**
     * Analyze comparisons
     */
    _analyzeComparisons(predictions) {
        // Calculate average probability
        const avgProbability = predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length;
        
        // Calculate probability spread
        const minProb = Math.min(...predictions.map(p => p.probability));
        const maxProb = Math.max(...predictions.map(p => p.probability));
        const probSpread = maxProb - minProb;
        
        // Calculate average confidence
        const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
        
        // Identify common factors (for multi-factor predictions)
        const allFactors = new Set();
        const factorCounts = {};
        
        predictions.forEach(prediction => {
            if (prediction.type === 'single') {
                const factor = prediction.factor.toLowerCase();
                allFactors.add(factor);
                factorCounts[factor] = (factorCounts[factor] || 0) + 1;
            } else if (prediction.type === 'multi' && prediction.factors) {
                prediction.factors.forEach(factor => {
                    const factorLower = factor.toLowerCase();
                    allFactors.add(factorLower);
                    factorCounts[factorLower] = (factorCounts[factorLower] || 0) + 1;
                });
            }
        });
        
        // Find common factors (present in more than one prediction)
        const commonFactors = Object.entries(factorCounts)
            .filter(([_, count]) => count > 1)
            .map(([factor]) => factor);
        
        // Sort predictions by probability
        const sortedByProbability = [...predictions].sort((a, b) => b.probability - a.probability);
        
        // Calculate correlation between predictions
        // This is simplified; real correlation would be more complex
        let correlationLevel = 'Low';
        if (probSpread < 0.1) {
            correlationLevel = 'High';
        } else if (probSpread < 0.2) {
            correlationLevel = 'Medium';
        }
        
        // Generate insights based on analysis
        const insights = [
            `The average probability across all compared predictions is ${(avgProbability * 100).toFixed(1)}%`,
            `Probability spread between highest and lowest prediction is ${(probSpread * 100).toFixed(1)}%`,
            `The highest probability prediction is ${(maxProb * 100).toFixed(1)}%`
        ];
        
        if (commonFactors.length > 0) {
            insights.push(`Found ${commonFactors.length} common factors across predictions`);
        }
        
        // Generate recommendation
        let recommendation = '';
        if (avgProbability > 0.7) {
            recommendation = 'These predictions show high probability outcomes that are worth strong consideration.';
        } else if (avgProbability > 0.5) {
            recommendation = 'These predictions show moderate probability outcomes with reasonable chance of success.';
        } else {
            recommendation = 'These predictions show lower probability outcomes that carry higher risk.';
        }
        
        // Return analysis result
        return {
            predictions: predictions,
            avgProbability: avgProbability,
            probSpread: probSpread,
            minProb: minProb,
            maxProb: maxProb,
            avgConfidence: avgConfidence,
            commonFactors: commonFactors,
            correlationLevel: correlationLevel,
            insights: insights,
            recommendation: recommendation,
            sortedByProbability: sortedByProbability,
            timestamp: Date.now()
        };
    }
    
    /**
     * Display comparison results
     */
    _displayComparisonResults(analysisResult) {
        const resultsContainer = this.container.querySelector('#comparison-results');
        
        if (!resultsContainer) return;
        
        // Show comparison results container
        resultsContainer.classList.remove('d-none');
        
        // Hide prediction results if visible
        const predictionResults = this.container.querySelector('#prediction-results');
        if (predictionResults) {
            predictionResults.classList.add('d-none');
        }
        
        // Show visualization container
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        if (visualizationContainer) {
            visualizationContainer.classList.remove('d-none');
        }
        
        // Build comparison results HTML
        resultsContainer.innerHTML = `
            <div class="comparison-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-start">
                        <h4 class="comparison-title">Prediction Comparison Analysis</h4>
                        <button class="btn btn-sm btn-outline-primary export-comparison-btn">
                            <i class="fas fa-download"></i> Export
                        </button>
                    </div>
                    <p class="text-muted mb-0 text-sm">
                        Comparing ${analysisResult.predictions.length} predictions
                    </p>
                </div>
                
                <div class="row mb-4">
                    <div class="col-md-4">
                        <div class="stat-card p-3 bg-light rounded mb-3">
                            <h6>Average Probability</h6>
                            <div class="d-flex align-items-center mt-2">
                                <div class="progress flex-grow-1 me-2" style="height: 8px;">
                                    <div class="progress-bar bg-${this._getProbabilityClass(analysisResult.avgProbability * 100)}" 
                                        role="progressbar" 
                                        style="width: ${analysisResult.avgProbability * 100}%;"
                                        aria-valuenow="${analysisResult.avgProbability * 100}" 
                                        aria-valuemin="0" 
                                        aria-valuemax="100">
                                    </div>
                                </div>
                                <span class="font-weight-bold">${(analysisResult.avgProbability * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-4">
                        <div class="stat-card p-3 bg-light rounded mb-3">
                            <h6>Probability Range</h6>
                            <div class="d-flex justify-content-between mt-2">
                                <span class="text-danger">${(analysisResult.minProb * 100).toFixed(1)}%</span>
                                <span class="text-success">${(analysisResult.maxProb * 100).toFixed(1)}%</span>
                            </div>
                            <div class="progress mt-1" style="height: 8px;">
                                <div class="progress-bar bg-danger" 
                                    role="progressbar" 
                                    style="width: ${analysisResult.minProb * 100}%;">
                                </div>
                                <div class="progress-bar bg-warning" 
                                    role="progressbar" 
                                    style="width: ${analysisResult.probSpread * 100}%;">
                                </div>
                            </div>
                            <div class="text-xs text-muted mt-1">
                                Spread: ${(analysisResult.probSpread * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-4">
                        <div class="stat-card p-3 bg-light rounded mb-3">
                            <h6>Correlation</h6>
                            <div class="d-flex align-items-center mt-2">
                                <span class="badge ${
                                    analysisResult.correlationLevel === 'High' ? 'bg-danger' :
                                    analysisResult.correlationLevel === 'Medium' ? 'bg-warning' :
                                    'bg-info'
                                }">
                                    ${analysisResult.correlationLevel}
                                </span>
                                <div class="ms-2 text-sm text-muted">
                                    ${
                                        analysisResult.correlationLevel === 'High' ? 'Highly correlated predictions' :
                                        analysisResult.correlationLevel === 'Medium' ? 'Moderately correlated predictions' :
                                        'Low correlation between predictions'
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mb-4">
                    <h5 class="mb-3">Compared Predictions</h5>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Prediction</th>
                                    <th>Probability</th>
                                    <th>Confidence</th>
                                    ${analysisResult.predictions.some(p => p.league) ? '<th>League</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${analysisResult.sortedByProbability.map(prediction => `
                                    <tr>
                                        <td class="text-sm">
                                            ${prediction.type === 'single' 
                                                ? prediction.factor 
                                                : `Multi-Factor (${prediction.factors?.length || 0} factors)`
                                            }
                                        </td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="progress me-2" style="width: 60px; height: 8px;">
                                                    <div class="progress-bar bg-${this._getProbabilityClass(prediction.probability * 100)}" 
                                                        role="progressbar" 
                                                        style="width: ${prediction.probability * 100}%;"
                                                        aria-valuenow="${prediction.probability * 100}" 
                                                        aria-valuemin="0" 
                                                        aria-valuemax="100">
                                                    </div>
                                                </div>
                                                <span class="text-sm">${(prediction.probability * 100).toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge bg-${this._getConfidenceClass(prediction.confidence)}">
                                                ${(prediction.confidence * 100).toFixed(0)}%
                                            </span>
                                        </td>
                                        ${analysisResult.predictions.some(p => p.league) ? `
                                            <td>
                                                ${prediction.league 
                                                    ? `<span class="badge bg-light text-dark">${prediction.league.replace('_', ' ').toUpperCase()}</span>` 
                                                    : '-'
                                                }
                                            </td>
                                        ` : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                ${analysisResult.commonFactors.length > 0 ? `
                    <div class="common-factors mb-4">
                        <h6>Common Factors</h6>
                        <ul class="common-factors-list text-sm">
                            ${analysisResult.commonFactors.map(factor => `
                                <li>${factor}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                <div class="insights-section border-top pt-3 mt-2">
                    <h6>Analysis Insights</h6>
                    <ul class="text-sm">
                        ${analysisResult.insights.map(insight => `
                            <li>${insight}</li>
                        `).join('')}
                    </ul>
                    <div class="recommendation p-3 mt-3 bg-light rounded">
                        <h6>Recommendation</h6>
                        <p class="text-sm mb-0">${analysisResult.recommendation}</p>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        resultsContainer.querySelector('.export-comparison-btn')?.addEventListener('click', () => {
            this._exportComparisonAnalysis(analysisResult);
        });
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    /**
     * Update comparison visualization based on visualization mode
     */
    _updateComparisonVisualization(visualizationMode) {
        const container = this.container.querySelector('#prediction-visualization');
        
        if (!container || this.pendingComparisons.length === 0) {
            return;
        }
        
        // Get prediction objects from IDs
        const comparisonPredictions = this.pendingComparisons
            .map(id => {
                const prediction = this.predictionHistory.find(p => p.id === id || p.result?.id === id);
                return prediction 
                    ? {
                        id: prediction.id || prediction.result?.id,
                        type: prediction.type,
                        factor: prediction.type === 'single' ? prediction.factor : null,
                        factors: prediction.type === 'multi' ? prediction.factors : null,
                        probability: prediction.type === 'single' 
                            ? prediction.result.probability 
                            : prediction.result.combined_probability,
                        confidence: prediction.result.confidence,
                        result: prediction.result,
                        timestamp: prediction.timestamp,
                        league: prediction.league
                    }
                    : null;
            })
            .filter(p => p); // Remove any not found
        
        // Clear previous visualization
        container.innerHTML = '';
        
        // Create title
        const title = document.createElement('h6');
        title.className = 'text-center mb-3';
        title.textContent = 'Prediction Comparison Visualization';
        container.appendChild(title);
        
        // Create visualization based on mode
        switch (visualizationMode) {
            case 'bar':
                this._createBarChartComparison(comparisonPredictions, container);
                break;
            case 'radar':
                this._createRadarChartComparison(comparisonPredictions, container);
                break;
            case 'probability':
                this._createProbabilityDistributionComparison(comparisonPredictions, container);
                break;
            default:
                this._createBarChartComparison(comparisonPredictions, container);
        }
    }
    
    /**
     * Create bar chart comparison visualization
     */
    _createBarChartComparison(predictions, container) {
        // Create SVG for bar chart
        const width = 600;
        const height = 400;
        const margin = { top: 40, right: 30, bottom: 100, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(predictions.map((_, i) => `Pred ${i + 1}`))
            .range([margin.left, width - margin.right])
            .padding(0.2);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([height - margin.bottom, margin.top]);
        
        // Create axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em');
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale).ticks(10, '%'));
        
        // Create bars
        svg.selectAll('.bar')
            .data(predictions)
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', (d, i) => xScale(`Pred ${i + 1}`))
            .attr('y', d => yScale(d.probability))
            .attr('width', xScale.bandwidth())
            .attr('height', d => height - margin.bottom - yScale(d.probability))
            .attr('fill', d => this._getProbabilityColor(d.probability * 100));
        
        // Add probability labels
        svg.selectAll('.bar-label')
            .data(predictions)
            .enter()
            .append('text')
            .attr('class', 'bar-label')
            .attr('x', (d, i) => xScale(`Pred ${i + 1}`) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d.probability) - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text(d => `${(d.probability * 100).toFixed(1)}%`);
        
        // Add average line
        const avgProbability = predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length;
        
        svg.append('line')
            .attr('x1', margin.left)
            .attr('y1', yScale(avgProbability))
            .attr('x2', width - margin.right)
            .attr('y2', yScale(avgProbability))
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        svg.append('text')
            .attr('x', width - margin.right)
            .attr('y', yScale(avgProbability) - 5)
            .attr('text-anchor', 'end')
            .attr('font-size', '12px')
            .attr('fill', 'red')
            .text(`Average: ${(avgProbability * 100).toFixed(1)}%`);
        
        // Add tooltips with prediction details
        svg.selectAll('.bar')
            .append('title')
            .text((d, i) => {
                const factor = d.type === 'single' 
                    ? d.factor 
                    : `Multi-Factor (${d.factors?.length || 0} factors)`;
                
                return `${factor}\nProbability: ${(d.probability * 100).toFixed(1)}%\nConfidence: ${(d.confidence * 100).toFixed(0)}%`;
            });
        
        // Add legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width / 2}, ${height - 20})`);
        
        legend.append('text')
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Prediction comparison by probability');
    }
    
    /**
     * Create radar chart comparison visualization
     */
    _createRadarChartComparison(predictions, container) {
        // We need at least 3 data points for a radar chart
        // If fewer, fall back to bar chart
        if (predictions.length < 3) {
            this._createBarChartComparison(predictions, container);
            return;
        }
        
        // Create dimensions for radar chart
        // We'll use probability, confidence, and a calculated "value" metric
        const dimensions = [
            { name: 'Probability', key: 'probability' },
            { name: 'Confidence', key: 'confidence' },
            { name: 'Value', key: 'value' } // Will calculate this
        ];
        
        // Calculate "value" for each prediction (simplified example)
        predictions.forEach(pred => {
            pred.value = pred.probability * pred.confidence;
        });
        
        // Create SVG for radar chart
        const width = 600;
        const height = 500;
        const margin = 60;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - margin;
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales for each dimension
        const angleScale = d3.scaleLinear()
            .domain([0, dimensions.length])
            .range([0, 2 * Math.PI]);
        
        const radiusScale = d3.scaleLinear()
            .domain([0, 1])
            .range([0, radius]);
        
        // Create radar grid lines
        const gridLevels = 5;
        for (let level = 1; level <= gridLevels; level++) {
            const r = radius * level / gridLevels;
            
            svg.append('circle')
                .attr('cx', centerX)
                .attr('cy', centerY)
                .attr('r', r)
                .attr('fill', 'none')
                .attr('stroke', '#ddd')
                .attr('stroke-width', 1);
            
            // Add level labels (percentages)
            svg.append('text')
                .attr('x', centerX)
                .attr('y', centerY - r)
                .attr('dy', -5)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('fill', '#999')
                .text(`${(level / gridLevels * 100).toFixed(0)}%`);
        }
        
        // Create radar axes
        for (let i = 0; i < dimensions.length; i++) {
            const angle = angleScale(i);
            const line = svg.append('line')
                .attr('x1', centerX)
                .attr('y1', centerY)
                .attr('x2', centerX + radius * Math.sin(angle))
                .attr('y2', centerY - radius * Math.cos(angle))
                .attr('stroke', '#999')
                .attr('stroke-width', 1);
            
            // Add axis labels
            svg.append('text')
                .attr('x', centerX + (radius + 15) * Math.sin(angle))
                .attr('y', centerY - (radius + 15) * Math.cos(angle))
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .text(dimensions[i].name);
        }
        
        // Create radar paths for each prediction
        predictions.forEach((prediction, predIndex) => {
            const points = dimensions.map((dim, i) => {
                const angle = angleScale(i);
                const value = prediction[dim.key];
                return {
                    x: centerX + radiusScale(value) * Math.sin(angle),
                    y: centerY - radiusScale(value) * Math.cos(angle)
                };
            });
            
            // Close the path by repeating the first point
            points.push(points[0]);
            
            // Create line generator
            const lineGenerator = d3.line()
                .x(d => d.x)
                .y(d => d.y);
            
            // Draw path
            svg.append('path')
                .datum(points)
                .attr('fill', this._getProbabilityColor(prediction.probability * 100))
                .attr('fill-opacity', 0.3)
                .attr('stroke', this._getProbabilityColor(prediction.probability * 100))
                .attr('stroke-width', 2)
                .attr('d', lineGenerator);
            
            // Add prediction points
            dimensions.forEach((dim, dimIndex) => {
                const angle = angleScale(dimIndex);
                const value = prediction[dim.key];
                
                svg.append('circle')
                    .attr('cx', centerX + radiusScale(value) * Math.sin(angle))
                    .attr('cy', centerY - radiusScale(value) * Math.cos(angle))
                    .attr('r', 4)
                    .attr('fill', this._getProbabilityColor(prediction.probability * 100));
            });
        });
        
        // Add legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - 150}, 20)`);
        
        predictions.forEach((prediction, i) => {
            legend.append('rect')
                .attr('x', 0)
                .attr('y', i * 20)
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', this._getProbabilityColor(prediction.probability * 100));
            
            legend.append('text')
                .attr('x', 20)
                .attr('y', i * 20 + 10)
                .attr('font-size', '12px')
                .text(`Pred ${i + 1}: ${(prediction.probability * 100).toFixed(1)}%`);
        });
    }
    
    /**
     * Create probability distribution comparison visualization
     */
    _createProbabilityDistributionComparison(predictions, container) {
        // Create SVG for distribution chart
        const width = 600;
        const height = 400;
        const margin = { top: 40, right: 100, bottom: 60, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleLinear()
            .domain([0, 1])
            .range([margin.left, width - margin.right]);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1]) // Will adjust later
            .range([height - margin.bottom, margin.top]);
        
        // Create axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(10, '%'));
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale));
        
        // Generate distribution data for each prediction
        const distributionData = predictions.map(prediction => ({
            id: prediction.id,
            label: `Pred ${predictions.indexOf(prediction) + 1}`,
            probability: prediction.probability,
            confidence: prediction.confidence,
            color: this._getProbabilityColor(prediction.probability * 100),
            distribution: this._generateProbabilityDistribution(prediction.probability, prediction.confidence)
        }));
        
        // Update y-scale domain based on max density
        const maxDensity = d3.max(
            distributionData.flatMap(d => d.distribution.map(p => p.density))
        );
        yScale.domain([0, maxDensity]);
        
        // Update y-axis
        svg.select('g').call(d3.axisLeft(yScale));
        
        // Create line generator
        const lineGenerator = d3.line()
            .x(d => xScale(d.probability))
            .y(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Create area generator
        const areaGenerator = d3.area()
            .x(d => xScale(d.probability))
            .y0(height - margin.bottom)
            .y1(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Draw distribution curves for each prediction
        distributionData.forEach(data => {
            // Draw area under curve
            svg.append('path')
                .datum(data.distribution)
                .attr('fill', data.color)
                .attr('fill-opacity', 0.2)
                .attr('d', areaGenerator);
            
            // Draw line
            svg.append('path')
                .datum(data.distribution)
                .attr('fill', 'none')
                .attr('stroke', data.color)
                .attr('stroke-width', 2)
                .attr('d', lineGenerator);
            
            // Draw vertical line at probability point
            svg.append('line')
                .attr('x1', xScale(data.probability))
                .attr('y1', height - margin.bottom)
                .attr('x2', xScale(data.probability))
                .attr('y2', yScale(data.distribution.find(p => p.probability === data.probability)?.density || 0))
                .attr('stroke', data.color)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3');
            
            // Add probability label
            svg.append('text')
                .attr('x', xScale(data.probability))
                .attr('y', height - margin.bottom + 15)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('fill', data.color)
                .text(`${(data.probability * 100).toFixed(1)}%`);
        });
        
        // Add legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - 90}, 50)`);
        
        distributionData.forEach((data, i) => {
            legend.append('rect')
                .attr('x', 0)
                .attr('y', i * 20)
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', data.color);
            
            legend.append('text')
                .attr('x', 20)
                .attr('y', i * 20 + 10)
                .attr('font-size', '12px')
                .text(`${data.label}`);
        });
        
        // Add axis labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Probability');
        
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', margin.left - 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Density');
    }
    
    /**
     * Export comparison analysis
     */
    _exportComparisonAnalysis(analysisResult) {
        const exportOptions = [
            { label: 'PDF Report', icon: 'file-pdf', value: 'pdf' },
            { label: 'CSV Data', icon: 'file-csv', value: 'csv' },
            { label: 'PNG Image', icon: 'image', value: 'image' }
        ];
        
        // Create export dialog
        const dialog = document.createElement('div');
        dialog.className = 'export-dialog card position-fixed start-50 top-50 translate-middle shadow-lg rounded-lg';
        dialog.style.zIndex = '1050';
        dialog.style.width = '300px';
        
        dialog.innerHTML = `
            <div class="card-header bg-primary text-white py-2">
                <h6 class="mb-0">Export Comparison</h6>
            </div>
            <div class="card-body">
                <p class="text-sm text-muted mb-3">Choose export format:</p>
                <div class="export-options">
                    ${exportOptions.map(option => `
                        <button class="btn btn-outline-secondary w-100 text-start mb-2 export-option" data-format="${option.value}">
                            <i class="fas fa-${option.icon} me-2"></i> ${option.label}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="card-footer d-flex justify-content-end py-2">
                <button class="btn btn-sm btn-secondary cancel-export-btn">Cancel</button>
            </div>
        `;
        
        // Add dialog to document
        document.body.appendChild(dialog);
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.style.zIndex = '1040';
        document.body.appendChild(backdrop);
        
        // Add event listeners
        dialog.querySelectorAll('.export-option').forEach(button => {
            button.addEventListener('click', () => {
                const format = button.getAttribute('data-format');
                this._performComparisonExport(analysisResult, format);
                
                // Remove dialog and backdrop
                dialog.remove();
                backdrop.remove();
            });
        });
        
        dialog.querySelector('.cancel-export-btn').addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });
    }
    
    /**
     * Perform comparison export
     */
    _performComparisonExport(analysisResult, format) {
        // Show loading notification
        notificationService.showNotification(`Preparing ${format.toUpperCase()} export...`, 'info');
        
        try {
            switch (format) {
                case 'pdf':
                    exportService.exportComparisonToPDF(analysisResult);
                    break;
                case 'csv':
                    exportService.exportComparisonToCSV(analysisResult);
                    break;
                case 'image':
                    exportService.exportComparisonToImage(analysisResult);
                    break;
            }
            
            // Track export analytics
            analyticsService.trackEvent('predictions', 'export_comparison', {
                format: format,
                prediction_count: analysisResult.predictions.length
            });
            
        } catch (error) {
            Logger.error(`Error exporting comparison as ${format}:`, error);
            notificationService.showNotification(`Failed to export as ${format.toUpperCase()}`, 'error');
        }
    }
    
    /**
     * Export prediction
     */
    _exportPrediction(prediction, format = 'pdf') {
        if (!prediction) {
            notificationService.showNotification('No prediction to export', 'warning');
            return;
        }
        
        // Show loading notification
        notificationService.showNotification(`Preparing ${format.toUpperCase()} export...`, 'info');
        
        try {
            switch (format) {
                case 'pdf':
                    exportService.exportPredictionToPDF(prediction);
                    break;
                case 'csv':
                    exportService.exportPredictionToCSV(prediction);
                    break;
                case 'image':
                    exportService.exportPredictionToImage(prediction);
                    break;
            }
            
            // Track export analytics
            analyticsService.trackEvent('predictions', 'export_prediction', {
                format: format,
                prediction_type: prediction.type || 'single'
            });
            
        } catch (error) {
            Logger.error(`Error exporting prediction as ${format}:`, error);
            notificationService.showNotification(`Failed to export as ${format.toUpperCase()}`, 'error');
        }
    }
    
    /**
     * Export all predictions
     */
    _exportAllPredictions() {
        if (this.predictionHistory.length === 0) {
            notificationService.showNotification('No predictions to export', 'warning');
            return;
        }
        
        // Show loading notification
        notificationService.showNotification('Preparing data export...', 'info');
        
        try {
            // Export all prediction history
            exportService.exportAllPredictions(this.predictionHistory);
            
            // Track export analytics
            analyticsService.trackEvent('predictions', 'export_all_predictions', {
                prediction_count: this.predictionHistory.length
            });
            
        } catch (error) {
            Logger.error('Error exporting all predictions:', error);
            notificationService.showNotification('Failed to export predictions', 'error');
        }
    }
    
    /**
     * Share prediction
     */
    _sharePrediction(prediction) {
        if (!prediction) {
            notificationService.showNotification('No prediction to share', 'warning');
            return;
        }
        
        // Show sharing modal
        const modal = document.getElementById('shareModal');
        
        if (!modal) return;
        
        // Generate share preview
        const previewContainer = modal.querySelector('.share-preview');
        if (previewContainer) {
            previewContainer.innerHTML = this._generateSharePreview(prediction);
        }
        
        // Generate share link
        const shareLink = this._generateShareLink(prediction);
        const linkInput = modal.querySelector('#share-link');
        if (linkInput) {
            linkInput.value = shareLink;
        }
        
        // Update share buttons with link
        this._updateShareButtons(shareLink, prediction);
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Track share attempt
        analyticsService.trackEvent('predictions', 'share_prediction_opened', {
            prediction_type: prediction.type || 'single'
        });
    }
    
    /**
     * Generate share preview
     */
    _generateSharePreview(prediction) {
        // Determine if single or multi-factor prediction
        const isSingleFactor = !prediction.combined_probability;
        const probability = isSingleFactor 
            ? prediction.probability * 100 
            : prediction.combined_probability * 100;
        
        // Get prediction content
        const content = isSingleFactor
            ? prediction.raw_factor || prediction.factor || 'Prediction'
            : `Multi-Factor Prediction (${prediction.factors?.length || 0} factors)`;
        
        return `
            <div class="share-preview-card bg-white rounded border p-3">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-1">${content}</h6>
                        <div class="text-sm text-muted">Sports Predictions Ultra</div>
                    </div>
                    <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                        ${probability.toFixed(1)}%
                    </span>
                </div>
                
                <div class="preview-footer d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                    <small class="text-muted">
                        ${new Date().toLocaleDateString()}
                    </small>
                    <img src="/images/logo-small.png" alt="Logo" height="16">
                </div>
            </div>
        `;
    }
    
    /**
     * Generate share link
     */
    _generateShareLink(prediction) {
        // Generate a unique identifier for prediction
        const predictionId = prediction.id || `pred_${Date.now()}`;
        
        // Create sharing parameters
        const params = new URLSearchParams();
        params.append('id', predictionId);
        params.append('type', prediction.combined_probability ? 'multi' : 'single');
        
        // Generate share URL
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/share/prediction?${params.toString()}`;
        
        return shareUrl;
    }
    
    /**
     * Update share buttons with link and data
     */
    _updateShareButtons(shareLink, prediction) {
        // Prepare share message
        const isSingleFactor = !prediction.combined_probability;
        const probability = isSingleFactor 
            ? prediction.probability * 100 
            : prediction.combined_probability * 100;
            
        const content = isSingleFactor
            ? prediction.raw_factor || prediction.factor || 'Prediction'
            : `Multi-Factor Prediction`;
            
        const shareMessage = `Check out my prediction: ${content} - ${probability.toFixed(1)}% probability`;
        
        // Update Twitter share
        const twitterBtn = document.getElementById('share-twitter');
        if (twitterBtn) {
            const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(shareLink)}`;
            twitterBtn.addEventListener('click', () => {
                window.open(twitterUrl, '_blank', 'width=550,height=420');
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'twitter'
                });
            });
        }
        
        // Update Facebook share
        const facebookBtn = document.getElementById('share-facebook');
        if (facebookBtn) {
            const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`;
            facebookBtn.addEventListener('click', () => {
                window.open(facebookUrl, '_blank', 'width=550,height=420');
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'facebook'
                });
            });
        }
        
        // Update WhatsApp share
        const whatsappBtn = document.getElementById('share-whatsapp');
        if (whatsappBtn) {
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage + ' ' + shareLink)}`;
            whatsappBtn.addEventListener('click', () => {
                window.open(whatsappUrl, '_blank');
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'whatsapp'
                });
            });
        }
        
        // Update Email share
        const emailBtn = document.getElementById('share-email');
        if (emailBtn) {
            const subject = 'Check out my sports prediction';
            const body = `${shareMessage}\n\nView the prediction here: ${shareLink}`;
            const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            
            emailBtn.addEventListener('click', () => {
                window.location.href = mailtoUrl;
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'email'
                });
            });
        }
    }
    
    /**
     * Share prediction result to social media
     */
    _shareToSocialMedia(platform) {
        const modal = document.getElementById('shareModal');
        if (!modal) return;
        
        const shareLink = modal.querySelector('#share-link')?.value;
        if (!shareLink) return;
        
        // Close modal
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal.hide();
        
        // Show success notification
        notificationService.showNotification(`Shared to ${platform}`, 'success');
    }
    
    /**
     * Show settings modal
     */
    _showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        
        if (!modal) return;
        
        // Populate settings with current values
        this._populateSettingsForm();
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
    
    /**
     * Populate settings form with current values
     */
    _populateSettingsForm() {
        // Visualization detail
        const visualizationDetail = document.getElementById('visualization-detail');
        if (visualizationDetail) {
            visualizationDetail.value = this.userPreferences.visualizationPreference || 'standard';
        }
        
        // Theme preference
        const themePreference = document.getElementById('theme-preference');
        if (themePreference) {
            themePreference.value = this.userPreferences.theme || 'auto';
        }
        
        // Default league
        const defaultLeague = document.getElementById('default-league');
        if (defaultLeague) {
            defaultLeague.value = this.userPreferences.defaultLeague || 'all';
        }
        
        // Live updates enabled
        const liveUpdatesEnabled = document.getElementById('live-updates-enabled');
        if (liveUpdatesEnabled) {
            liveUpdatesEnabled.checked = this.userPreferences.liveUpdatesEnabled !== false;
        }
        
        // Notifications enabled
        const notificationsEnabled = document.getElementById('notifications-enabled');
        if (notificationsEnabled) {
            notificationsEnabled.checked = this.userPreferences.notificationsEnabled !== false;
        }
        
        // Accessibility options
        const highContrastMode = document.getElementById('high-contrast-mode');
        if (highContrastMode) {
            highContrastMode.checked = this.userPreferences.highContrastMode === true;
        }
        
        const largerText = document.getElementById('larger-text');
        if (largerText) {
            largerText.checked = this.userPreferences.largerText === true;
        }
    }
    
    /**
     * Save user settings
     */
    async _saveUserSettings() {
        // Collect settings values
        const visualizationDetail = document.getElementById('visualization-detail')?.value || 'standard';
        const themePreference = document.getElementById('theme-preference')?.value || 'auto';
        const defaultLeague = document.getElementById('default-league')?.value || 'all';
        const liveUpdatesEnabled = document.getElementById('live-updates-enabled')?.checked ?? true;
        const notificationsEnabled = document.getElementById('notifications-enabled')?.checked ?? true;
        const highContrastMode = document.getElementById('high-contrast-mode')?.checked ?? false;
        const largerText = document.getElementById('larger-text')?.checked ?? false;
        
        // Update user preferences
        this.userPreferences = {
            ...this.userPreferences,
            visualizationPreference: visualizationDetail,
            theme: themePreference,
            defaultLeague: defaultLeague,
            liveUpdatesEnabled: liveUpdatesEnabled,
            notificationsEnabled: notificationsEnabled,
            highContrastMode: highContrastMode,
            largerText: largerText
        };
        
        // Apply settings
        this._applyUserSettings();
        
        // Save to server if online
        if (!this.offlineMode) {
            try {
                await apiClient.post('/api/users/preferences', {
                    preferences: this.userPreferences
                }, {
                    headers: {
                        'Authorization': `Bearer ${authService.getToken()}`,
                        'X-API-Key': API_CONFIG.predictionApiKey
                    }
                });
            } catch (error) {
                Logger.error('Error saving user preferences:', error);
            }
        }
        
        // Save to IndexedDB for offline access
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['userPreferences'], 'readwrite');
            const store = transaction.objectStore('userPreferences');
            
            await store.put({
                id: 'userPrefs',
                data: this.userPreferences,
                dashboardConfig: this.customDashboardConfig,
                updatedAt: Date.now()
            });
        } catch (error) {
            Logger.error('Error saving preferences to IndexedDB:', error);
        }
        
        // Close modal
        const modal = document.getElementById('settingsModal');
        if (modal) {
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
        }
        
        // Show notification
        notificationService.showNotification('Settings saved successfully', 'success');
        
        // Track settings update
        analyticsService.trackEvent('predictions', 'settings_updated', {
            theme: themePreference,
            visualization: visualizationDetail,
            accessibility: {
                high_contrast: highContrastMode,
                larger_text: largerText
            }
        });
        
        // Publish event
        eventBus.publish('preferences:updated', this.userPreferences);
    }
    
    /**
     * Apply user settings
     */
    _applyUserSettings() {
        // Apply visualization preference
        this.visualizationMode = this.userPreferences.visualizationPreference || 'standard';
        
        // Apply theme
        const theme = this.userPreferences.theme || 'auto';
        document.documentElement.setAttribute('data-theme', theme);
        
        // Apply accessibility settings
        if (this.userPreferences.highContrastMode) {
            document.body.classList.add('high-contrast-mode');
        } else {
            document.body.classList.remove('high-contrast-mode');
        }
        
        if (this.userPreferences.largerText) {
            document.body.classList.add('larger-text');
        } else {
            document.body.classList.remove('larger-text');
        }
        
        // Apply default league
        if (this.currentLeague === 'all') {
            this.currentLeague = this.userPreferences.defaultLeague || 'all';
            const leagueButton = this.container.querySelector(`[data-league="${this.currentLeague}"]`);
            if (leagueButton) {
                leagueButton.click();
            }
        }
        
        // Apply notification settings
        notificationService.setEnabled(this.userPreferences.notificationsEnabled !== false);
        
        // Apply WebSocket connection based on live updates setting
        if (this.userPreferences.liveUpdatesEnabled === false) {
            if (this.webSocketConnection) {
                this.webSocketConnection.close();
                this.webSocketConnection = null;
            }
        } else if (!this.webSocketConnection && !this.offlineMode) {
            this._connectToWebSocket();
        }
    }
    
    /**
     * Handle preferences updated event
     */
    _handlePreferencesUpdated(preferences) {
        // Update local preferences
        this.userPreferences = preferences;
        
        // Apply settings
        this._applyUserSettings();
        
        // Re-render UI if needed
        if (this.currentPrediction) {
            this._displayPredictionResults(
                this.currentPrediction, 
                this.currentPrediction.combined_probability !== undefined
            );
        }
    }
    
    /**
     * Handle league changed event
     */
    _handleLeagueChanged(league) {
        this.currentLeague = league;
        
        // Update prediction history display
        this._updatePredictionHistory();
        
        // Update league context in prediction inputs
        this._updateLeagueContext(league);
    }
    
    /**
     * Toggle personalized dashboard
     */
    _togglePersonalizedDashboard() {
        const dashboard = this.container.querySelector('#personalized-dashboard');
        
        if (!dashboard) return;
        
        const isVisible = !dashboard.classList.contains('d-none');
        
        if (isVisible) {
            dashboard.classList.add('d-none');
        } else {
            dashboard.classList.remove('d-none');
            this._renderPersonalizedDashboard();
            
            // Scroll to dashboard
            dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Track dashboard view
            analyticsService.trackEvent('predictions', 'dashboard_viewed');
        }
    }
    
    /**
     * Render personalized dashboard
     */
    _renderPersonalizedDashboard() {
        const dashboard = this.container.querySelector('#personalized-dashboard');
        
        if (!dashboard) return;
        
        const dashboardContent = dashboard.querySelector('.dashboard-content');
        
        if (!dashboardContent) return;
        
        // Show loading
        dashboardContent.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-3">Loading your personalized dashboard...</p>
            </div>
        `;
        
        // Get dashboard data
        if (this.offlineMode) {
            // Use cached dashboard
            this._renderDashboardWithLocalData(dashboardContent);
        } else {
            // Fetch from server
            this._fetchAndRenderDashboard(dashboardContent);
        }
    }
    
    /**
     * Render dashboard with local data
     */
    _renderDashboardWithLocalData(container) {
        // Use prediction history to generate insights
        setTimeout(() => {
            if (this.predictionHistory.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-4">
                        <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                        <h5>No Prediction Data Yet</h5>
                        <p class="text-muted">Make some predictions to see your personalized dashboard.</p>
                    </div>
                `;
                return;
            }
            
            // Generate dashboard content
            container.innerHTML = this._generateDashboardContent({
                predictions: this.predictionHistory,
                recentActivity: this.predictionHistory.slice(0, 5),
                trends: this._calculatePredictionTrends(),
                favoriteLeagues: this._calculateFavoriteLeagues(),
                insights: this._generateLocalInsights()
            });
            
            // Initialize dashboard charts
            this._initializeDashboardCharts();
            
        }, 1000);
    }
    
    /**
     * Fetch and render dashboard from server
     */
    async _fetchAndRenderDashboard(container) {
        try {
            const response = await apiClient.get('/api/users/dashboard', {
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                }
            });
            
            if (response.status === 'success') {
                // Render dashboard with server data
                container.innerHTML = this._generateDashboardContent(response.data);
                
                // Initialize dashboard charts
                this._initializeDashboardCharts();
                
                // Cache dashboard data for offline use
                this.customDashboardConfig = response.data.dashboardConfig;
                
                // Save to IndexedDB
                try {
                    const db = await this._getIndexedDBInstance();
                    const transaction = db.transaction(['userPreferences'], 'readwrite');
                    const store = transaction.objectStore('userPreferences');
                    
                    const userPrefs = await store.get('userPrefs');
                    
                    if (userPrefs && userPrefs.result) {
                        userPrefs.result.dashboardConfig = response.data.dashboardConfig;
                        userPrefs.result.dashboardData = response.data;
                        userPrefs.result.updatedAt = Date.now();
                        
                        await store.put(userPrefs.result);
                    } else {
                        await store.put({
                            id: 'userPrefs',
                            data: this.userPreferences,
                            dashboardConfig: response.data.dashboardConfig,
                            dashboardData: response.data,
                            updatedAt: Date.now()
                        });
                    }
                } catch (error) {
                    Logger.error('Error caching dashboard data:', error);
                }
            } else {
                throw new Error(response.message || 'Failed to load dashboard');
            }
        } catch (error) {
            Logger.error('Error fetching dashboard data:', error);
            
            // Show error state
            container.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                    <h5>Could Not Load Dashboard</h5>
                    <p class="text-muted mb-3">${error.message || 'An error occurred while loading your dashboard'}</p>
                    <button class="btn btn-primary retry-dashboard-btn">
                        <i class="fas fa-sync-alt me-2"></i> Retry
                    </button>
                </div>
            `;
            
            // Add retry event listener
            container.querySelector('.retry-dashboard-btn')?.addEventListener('click', () => {
                this._renderPersonalizedDashboard();
            });
            
            // Fall back to local data
            if (this.predictionHistory.length > 0) {
                container.innerHTML += `
                    <div class="mt-4 pt-4 border-top">
                        <h5 class="mb-3">Local Insights</h5>
                        ${this._generateLocalInsightsHTML()}
                    </div>
                `;
            }
        }
    }
    
    /**
     * Generate dashboard content
     */
    _generateDashboardContent(data) {
        return `
            <div class="dashboard-container">
                <!-- Summary stats -->
                <div class="row mb-4">
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Total Predictions</h6>
                            <h3>${data.predictions?.length || 0}</h3>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Avg Probability</h6>
                            <h3>${this._calculateAverageProbability().toFixed(1)}%</h3>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Resolved</h6>
                            <h3>${this._countResolvedPredictions()}</h3>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Accuracy</h6>
                            <h3>${this._calculateAccuracy().toFixed(0)}%</h3>
                        </div>
                    </div>
                </div>
                
                <!-- Probability trend chart -->
                <div class="row mb-4">
                    <div class="col-md-8">
                        <div class="card shadow-sm h-100">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Prediction Probability Trend</h5>
                            </div>
                            <div class="card-body">
                                <div id="probability-trend-chart" style="height: 300px;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card shadow-sm h-100">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Leagues</h5>
                            </div>
                            <div class="card-body">
                                <div id="leagues-distribution-chart" style="height: 300px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Insights and recent activity -->
                <div class="row">
                    <div class="col-md-6">
                        <div class="card shadow-sm mb-4">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Insights</h5>
                            </div>
                            <div class="card-body">
                                <ul class="insights-list">
                                    ${this._generateDashboardInsights().map(insight => `
                                        <li class="mb-3">
                                            <i class="fas fa-chart-line text-primary me-2"></i>
                                            ${insight}
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card shadow-sm mb-4">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Recent Activity</h5>
                            </div>
                            <div class="card-body p-0">
                                <div class="list-group list-group-flush">
                                    ${this._generateRecentActivityItems()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Initialize dashboard charts
     */
    _initializeDashboardCharts() {
        // Initialize probability trend chart
        const trendChartContainer = document.getElementById('probability-trend-chart');
        if (trendChartContainer) {
            this._createProbabilityTrendChart(trendChartContainer);
        }
        
        // Initialize leagues distribution chart
        const leaguesChartContainer = document.getElementById('leagues-distribution-chart');
        if (leaguesChartContainer) {
            this._createLeaguesDistributionChart(leaguesChartContainer);
        }
    }
    
    /**
     * Create probability trend chart
     */
    _createProbabilityTrendChart(container) {
        // Get last 15 predictions
        const predictions = this.predictionHistory.slice(0, 15).reverse();
        
        if (predictions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <p>No prediction data available</p>
                </div>
            `;
            return;
        }
        
        // Prepare data
        const data = predictions.map((prediction, index) => {
            const probability = prediction.type === 'single'
                ? prediction.result.probability
                : prediction.result.combined_probability;
                
            return {
                index: index + 1,
                probability: probability * 100,
                date: new Date(prediction.timestamp || Date.now()).toLocaleDateString(),
                isResolved: prediction.resolved || false,
                isCorrect: prediction.resolvedResult?.correct || false
            };
        });
        
        // Create SVG
        const width = container.clientWidth;
        const height = container.clientHeight || 300;
        const margin = { top: 20, right: 30, bottom: 40, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleLinear()
            .domain([1, data.length])
            .range([margin.left, width - margin.right]);
        
        const yScale = d3.scaleLinear()
            .domain([0, 100])
            .range([height - margin.bottom, margin.top]);
        
        // Create line generator
        const lineGenerator = d3.line()
            .x(d => xScale(d.index))
            .y(d => yScale(d.probability))
            .curve(d3.curveMonotoneX);
        
        // Create axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(Math.min(data.length, 10)).tickFormat(i => {
                const dataPoint = data[Math.round(i) - 1];
                return dataPoint ? dataPoint.date : '';
            }))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .style('font-size', '10px');
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d}%`));
        
        // Draw grid lines
        svg.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale)
                .ticks(5)
                .tickSize(-(height - margin.top - margin.bottom))
                .tickFormat('')
            )
            .selectAll('line')
            .style('stroke', '#e0e0e0');
        
        svg.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale)
                .ticks(5)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat('')
            )
            .selectAll('line')
            .style('stroke', '#e0e0e0');
        
        // Draw 50% guideline
        svg.append('line')
            .attr('x1', margin.left)
            .attr('y1', yScale(50))
            .attr('x2', width - margin.right)
            .attr('y2', yScale(50))
            .attr('stroke', '#aaa')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3 3');
        
        // Draw line
        svg.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', '#4885ed')
            .attr('stroke-width', 2)
            .attr('d', lineGenerator);
        
        // Draw points
        svg.selectAll('.point')
            .data(data)
            .enter()
            .append('circle')
            .attr('class', 'point')
            .attr('cx', d => xScale(d.index))
            .attr('cy', d => yScale(d.probability))
            .attr('r', 5)
            .attr('fill', d => {
                if (!d.isResolved) return '#4885ed';
                return d.isCorrect ? '#28a745' : '#dc3545';
            })
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);
        
        // Add tooltips
        svg.selectAll('.point')
            .append('title')
            .text(d => `Date: ${d.date}\nProbability: ${d.probability.toFixed(1)}%${d.isResolved ? '\nResolved: ' + (d.isCorrect ? 'Correct' : 'Incorrect') : ''}`);
        
        // Add trend line
        if (data.length >= 3) {
            // Calculate linear regression
            const xValues = data.map(d => d.index);
            const yValues = data.map(d => d.probability);
            
            const xMean = d3.mean(xValues);
            const yMean = d3.mean(yValues);
            
            const ssxy = d3.sum(data.map((d, i) => (d.index - xMean) * (d.probability - yMean)));
            const ssxx = d3.sum(data.map(d => Math.pow(d.index - xMean, 2)));
            
            const slope = ssxy / ssxx;
            const intercept = yMean - slope * xMean;
            
            const x1 = 1;
            const y1 = slope * x1 + intercept;
            const x2 = data.length;
            const y2 = slope * x2 + intercept;
            
            svg.append('line')
                .attr('x1', xScale(x1))
                .attr('y1', yScale(y1))
                .attr('x2', xScale(x2))
                .attr('y2', yScale(y2))
                .attr('stroke', slope > 0 ? '#28a745' : '#dc3545')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5 5');
        }
    }
    
    /**
     * Create leagues distribution chart
     */
    _createLeaguesDistributionChart(container) {
        // Calculate league distribution
        const leagueCounts = {};
        
        this.predictionHistory.forEach(prediction => {
            const league = prediction.league || 'unknown';
            leagueCounts[league] = (leagueCounts[league] || 0) + 1;
        });
        
        // Convert to array for D3
        const data = Object.entries(leagueCounts).map(([league, count]) => ({
            league: league === 'unknown' ? 'Unspecified' : league.replace('_', ' ').toUpperCase(),
            count: count
        }));
        
        // Sort by count
        data.sort((a, b) => b.count - a.count);
        
        // If no data
        if (data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <p>No league data available</p>
                </div>
            `;
            return;
        }
        
        // Create pie chart
        const width = container.clientWidth;
        const height = container.clientHeight || 300;
        const radius = Math.min(width, height) / 2 * 0.8;
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .append('g')
            .attr('transform', `translate(${width / 2}, ${height / 2})`);
        
        // Create color scale
        const color = d3.scaleOrdinal()
            .domain(data.map(d => d.league))
            .range([
                '#4285F4', '#EA4335', '#FBBC05', '#34A853', 
                '#FF6D00', '#2979FF', '#00BFA5', '#D500F9',
                '#6200EA', '#AEEA00', '#FFD600', '#DD2C00'
            ]);
        
        // Create pie generator
        const pie = d3.pie()
            .value(d => d.count)
            .sort(null);
        
        // Create arc generator
        const arc = d3.arc()
            .innerRadius(radius * 0.5) // Donut chart
            .outerRadius(radius);
        
        // Draw pie
        const paths = svg.selectAll('path')
            .data(pie(data))
            .enter()
            .append('path')
            .attr('d', arc)
            .attr('fill', d => color(d.data.league))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('opacity', 0.8);
        
        // Add tooltips
        paths.append('title')
            .text(d => `${d.data.league}: ${d.data.count} predictions (${(d.data.count / this.predictionHistory.length * 100).toFixed(1)}%)`);
        
        // Add text labels for larger segments
        svg.selectAll('text')
            .data(pie(data))
            .enter()
            .filter(d => d.endAngle - d.startAngle > 0.25) // Only show labels for larger segments
            .append('text')
            .attr('transform', d => `translate(${arc.centroid(d)})`)
            .attr('dy', '.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .text(d => d.data.league);
        
        // Add center text
        svg.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0em')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .text(`${this.predictionHistory.length}`);
        
        svg.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.2em')
            .attr('font-size', '12px')
            .text('Predictions');
    }
    
    /**
     * Generate recent activity items
     */
    _generateRecentActivityItems() {
        const recentPredictions = this.predictionHistory.slice(0, 5);
        
        if (recentPredictions.length === 0) {
            return `
                <div class="list-group-item text-center py-4 text-muted">
                    <p>No recent activity</p>
                </div>
            `;
        }
        
        return recentPredictions.map(prediction => {
            const timestamp = new Date(prediction.timestamp || Date.now()).toLocaleString();
            
            const activity = prediction.type === 'single'
                ? `Created prediction: ${prediction.factor}`
                : `Created multi-factor prediction with ${prediction.factors?.length || 0} factors`;
                
            const probability = prediction.type === 'single'
                ? prediction.result.probability * 100
                : prediction.result.combined_probability * 100;
                
            return `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="activity-content">
                            <div class="activity-text text-sm">
                                ${activity.length > 60 ? activity.substring(0, 57) + '...' : activity}
                            </div>
                            <div class="text-xs text-muted mt-1">
                                ${timestamp}
                                ${prediction.league ? ` • ${prediction.league.replace('_', ' ').toUpperCase()}` : ''}
                            </div>
                        </div>
                        <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                            ${probability.toFixed(1)}%
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Generate dashboard insights
     */
    _generateDashboardInsights() {
        const insights = [];
        
        // Only generate insights if we have enough predictions
        if (this.predictionHistory.length < 3) {
            insights.push('Make more predictions to get personalized insights.');
            return insights;
        }
        
        // Calculate average probability
        const avgProbability = this._calculateAverageProbability();
        
        if (avgProbability > 70) {
            insights.push(`Your predictions show high confidence with an average probability of ${avgProbability.toFixed(1)}%.`);
        } else if (avgProbability > 50) {
            insights.push(`Your predictions show moderate confidence with an average probability of ${avgProbability.toFixed(1)}%.`);
        } else {
            insights.push(`Your predictions tend to be cautious with an average probability of ${avgProbability.toFixed(1)}%.`);
        }
        
        // Find favorite leagues
        const favoriteLeagues = this._calculateFavoriteLeagues();
        
        if (favoriteLeagues.length > 0) {
            const topLeague = favoriteLeagues[0];
            insights.push(`You predict most frequently in ${topLeague.league.replace('_', ' ').toUpperCase()} (${topLeague.percentage.toFixed(0)}% of predictions).`);
        }
        
        // Analyze prediction trends
        const trends = this._calculatePredictionTrends();
        
        if (trends.slope > 0.5) {
            insights.push('Your recent predictions show increasing probability levels, indicating growing confidence.');
        } else if (trends.slope < -0.5) {
            insights.push('Your recent predictions show decreasing probability levels, indicating more caution recently.');
        } else {
            insights.push('Your prediction probability levels have remained relatively consistent.');
        }
        
        // Analyze resolved predictions
        const resolvedCount = this._countResolvedPredictions();
        
        if (resolvedCount > 0) {
            const accuracy = this._calculateAccuracy();
            
            if (accuracy > 70) {
                insights.push(`Your prediction accuracy is excellent at ${accuracy.toFixed(0)}%.`);
            } else if (accuracy > 50) {
                insights.push(`Your prediction accuracy is good at ${accuracy.toFixed(0)}%.`);
            } else if (resolvedCount >= 3) {
                insights.push(`Your prediction accuracy could improve, currently at ${accuracy.toFixed(0)}%.`);
            }
        }
        
        return insights;
    }
    
    /**
     * Generate local insights HTML
     */
    _generateLocalInsightsHTML() {
        const insights = this._generateDashboardInsights();
        
        return `
            <ul class="insights-list">
                ${insights.map(insight => `
                    <li class="mb-3">
                        <i class="fas fa-chart-line text-primary me-2"></i>
                        ${insight}
                    </li>
                `).join('')}
            </ul>
        `;
    }
    
    /**
     * Calculate average probability
     */
    _calculateAverageProbability() {
        if (this.predictionHistory.length === 0) {
            return 0;
        }
        
        const sum = this.predictionHistory.reduce((total, prediction) => {
            const probability = prediction.type === 'single'
                ? prediction.result.probability
                : prediction.result.combined_probability;
                
            return total + probability;
        }, 0);
        
        return (sum / this.predictionHistory.length) * 100;
    }
    
    /**
     * Count resolved predictions
     */
    _countResolvedPredictions() {
        return this.predictionHistory.filter(p => p.resolved).length;
    }
    
    /**
     * Calculate prediction accuracy
     */
    _calculateAccuracy() {
        const resolvedPredictions = this.predictionHistory.filter(p => p.resolved);
        
        if (resolvedPredictions.length === 0) {
            return 0;
        }
        
        const correctPredictions = resolvedPredictions.filter(p => p.resolvedResult?.correct);
        
        return (correctPredictions.length / resolvedPredictions.length) * 100;
    }
    
    /**
     * Calculate favorite leagues
     */
    _calculateFavoriteLeagues() {
        const leagueCounts = {};
        let totalWithLeague = 0;
        
        this.predictionHistory.forEach(prediction => {
            if (prediction.league) {
                const league = prediction.league;
                leagueCounts[league] = (leagueCounts[league] || 0) + 1;
                totalWithLeague++;
            }
        });
        
        if (totalWithLeague === 0) {
            return [];
        }
        
        // Convert to array for sorting
        const leagues = Object.entries(leagueCounts).map(([league, count]) => ({
            league: league,
            count: count,
            percentage: (count / totalWithLeague) * 100
        }));
        
        // Sort by count
        leagues.sort((a, b) => b.count - a.count);
        
        return leagues;
    }
    
    /**
     * Calculate prediction trends
     */
    _calculatePredictionTrends() {
        if (this.predictionHistory.length < 3) {
            return { slope: 0, trend: 'stable' };
        }
        
        // Get last 10 predictions
        const recentPredictions = this.predictionHistory.slice(0, 10);
        
        // Extract probability values
        const values = recentPredictions.map(prediction => {
            return prediction.type === 'single'
                ? prediction.result.probability
                : prediction.result.combined_probability;
        });
        
        // Calculate slope using simple linear regression
        const n = values.length;
        const indices = Array.from({ length: n }, (_, i) => i + 1);
        
        const sumX = indices.reduce((sum, x) => sum + x, 0);
        const sumY = values.reduce((sum, y) => sum + y, 0);
        const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
        const sumXX = indices.reduce((sum, x) => sum + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Determine trend
        let trend = 'stable';
        if (slope > 0.02) {
            trend = 'increasing';
        } else if (slope < -0.02) {
            trend = 'decreasing';
        }
        
        return { slope, trend };
    }
    
    /**
     * Generate local insights
     */
    _generateLocalInsights() {
        const insights = [];
        
        // Add basic insights
        if (this.predictionHistory.length === 0) {
            insights.push('Make your first prediction to get started!');
            return insights;
        }
        
        // Calculate league distribution
        const favoriteLeagues = this._calculateFavoriteLeagues();
        
        if (favoriteLeagues.length > 0) {
            const topLeague = favoriteLeagues[0];
            insights.push(`You predict most often in ${topLeague.league.replace('_', ' ').toUpperCase()}.`);
        }
        
        // Calculate average probability
        const avgProbability = this._calculateAverageProbability();
        
        insights.push(`Average prediction probability: ${avgProbability.toFixed(1)}%`);
        
        // Calculate resolved/accuracy stats
        const resolvedCount = this._countResolvedPredictions();
        
        if (resolvedCount > 0) {
            const accuracy = this._calculateAccuracy();
            insights.push(`Prediction accuracy: ${accuracy.toFixed(1)}% (${resolvedCount} resolved)`);
        } else {
            insights.push('No resolved predictions yet.');
        }
        
        return insights;
    }
    
    /**
     * Clear all prediction data
     */
    async _clearAllPredictionData() {
        // Create confirmation dialog
        const dialog = document.createElement('div');
        dialog.className = 'confirmation-dialog card position-fixed start-50 top-50 translate-middle shadow-lg rounded-lg';
        dialog.style.zIndex = '1050';
        dialog.style.width = '350px';
        
        dialog.innerHTML = `
            <div class="card-header bg-danger text-white py-2">
                <h6 class="mb-0">Clear All Prediction Data</h6>
            </div>
            <div class="card-body">
                <p class="mb-3">Are you sure you want to clear all prediction data? This action cannot be undone.</p>
                <div class="form-check mb-3">
                    <input class="form-check-input" type="checkbox" id="confirm-clear-data">
                    <label class="form-check-label" for="confirm-clear-data">
                        I understand this will delete all my prediction data
                    </label>
                </div>
            </div>
            <div class="card-footer d-flex justify-content-between py-2">
                <button class="btn btn-secondary cancel-clear-btn">Cancel</button>
                <button class="btn btn-danger confirm-clear-btn" disabled>Clear All Data</button>
            </div>
        `;
        
        // Add dialog to document
        document.body.appendChild(dialog);
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.style.zIndex = '1040';
        document.body.appendChild(backdrop);
        
        // Add event listeners
        const checkbox = dialog.querySelector('#confirm-clear-data');
        const confirmBtn = dialog.querySelector('.confirm-clear-btn');
        
        checkbox?.addEventListener('change', () => {
            if (confirmBtn) {
                confirmBtn.disabled = !checkbox.checked;
            }
        });
        
        dialog.querySelector('.cancel-clear-btn')?.addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });
        
        return new Promise((resolve) => {
            confirmBtn?.addEventListener('click', async () => {
                // Clear prediction history
                this.predictionHistory = [];
                this.currentPrediction = null;
                this.pendingComparisons = [];
                
                // Clear IndexedDB
                try {
                    const db = await this._getIndexedDBInstance();
                    const transaction = db.transaction(['predictions'], 'readwrite');
                    const store = transaction.objectStore('predictions');
                    
                    await store.clear();
                    
                    // Clear from server if online
                    if (!this.offlineMode) {
                        await apiClient.delete('/api/predictions/all', {
                            headers: {
                                'Authorization': `Bearer ${authService.getToken()}`,
                                'X-API-Key': API_CONFIG.predictionApiKey
                            }
                        });
                    }
                    
                    // Track analytics
                    analyticsService.trackEvent('predictions', 'clear_all_predictions');
                    
                    // Update UI
                    this._updatePredictionHistory();
                    
                    // Hide results containers
                    const resultsContainer = this.container.querySelector('#prediction-results');
                    if (resultsContainer) {
                        resultsContainer.classList.add('d-none');
                    }
                    
                    const visualizationContainer = this.container.querySelector('#prediction-visualization');
                    if (visualizationContainer) {
                        visualizationContainer.classList.add('d-none');
                    }
                    
                    const exportOptions = this.container.querySelector('#export-options');
                    if (exportOptions) {
                        exportOptions.classList.add('d-none');
                    }
                    
                    // Show notification
                    notificationService.showNotification('All prediction data has been cleared', 'success');
                    
                    resolve(true);
                } catch (error) {
                    Logger.error('Error clearing prediction data:', error);
                    notificationService.showNotification('Error clearing prediction data', 'error');
                    resolve(false);
                } finally {
                    dialog.remove();
                    backdrop.remove();
                }
            });
        });
    }
    
    /**
     * Handle auth status changed event
     */
    _handleAuthStatusChanged(status) {
        Logger.info('Auth status changed:', status);
        
        // Reinitialize if user status changes
        this.initialize(this.container.id);
    }
    
    /**
     * Show settings modal
     */
    _showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        
        if (!modal) return;
        
        // Populate settings with current values
        this._populateSettingsForm();
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
    
    /**
     * Toggle probability distribution visualization
     */
    _toggleProbabilityDistribution(prediction) {
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        
        if (!visualizationContainer) return;
        
        // Toggle visibility
        const isVisible = !visualizationContainer.classList.contains('d-none');
        
        if (isVisible) {
            visualizationContainer.classList.add('d-none');
        } else {
            visualizationContainer.classList.remove('d-none');
            
            // Render the probability distribution
            this._renderProbabilityDistribution(prediction, visualizationContainer);
        }
    }
    
    /**
     * Destroy the module and clean up
     */
    destroy() {
        // Clean up WebSocket connection
        if (this.webSocketConnection) {
            this.webSocketConnection.close();
            this.webSocketConnection = null;
        }
        
        // Stop speech recognition if active
        if (this.speechRecognitionActive) {
            speechRecognitionService.stop();
            this.speechRecognitionActive = false;
        }
        
        // Remove event listeners
        window.removeEventListener('online', this._handleOfflineStatusChange);
        window.removeEventListener('offline', this._handleOfflineStatusChange);
        
        // Unsubscribe from events
        eventBus.unsubscribe('auth:statusChanged', this._handleAuthStatusChanged);
        eventBus.unsubscribe('preferences:updated', this._handlePreferencesUpdated);
        eventBus.unsubscribe('league:changed', this._handleLeagueChanged);
        
        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
        
        this.isInitialized = false;
        
        // Track destroy event
        analyticsService.trackEvent('predictions_module', 'destroyed');
        
        Logger.info('Custom predictions module destroyed');
    }

    async _initializeFeedbackSystem() {
        console.log("Initializing prediction feedback system...");
        
        // Try to load existing feedback data from localStorage
        const storedFeedback = localStorage.getItem('prediction_feedback_data');
        if (storedFeedback) {
            try {
                this.feedbackData = JSON.parse(storedFeedback);
                console.log(`Loaded feedback data: ${this.feedbackData.submissions} previous submissions`);
            } catch (e) {
                console.error("Failed to parse stored feedback data:", e);
            }
        }
        
        // Set up event listeners for feedback UI
        document.addEventListener('click', (e) => {
            // Handle prediction feedback button clicks
            if (e.target.classList.contains('prediction-feedback-btn')) {
                const predictionId = e.target.getAttribute('data-prediction-id');
                const rating = e.target.getAttribute('data-rating');
                this._collectPredictionFeedback(predictionId, rating);
            }
            
            // Handle feature feedback button
            if (e.target.id === 'open-feedback-modal') {
                this._showFeedbackModal();
            }
        });
        
        // Schedule periodic sync of feedback data to server
        setInterval(() => this._syncFeedbackData(), 5 * 60 * 1000); // Every 5 minutes
    }
    
    _collectPredictionFeedback(predictionId, rating) {
        console.log(`Collecting feedback for prediction ${predictionId}: ${rating}`);
        
        // Find the prediction in history or current results
        const prediction = this._findPredictionById(predictionId);
        if (!prediction) {
            console.error(`Prediction ${predictionId} not found for feedback`);
            return;
        }
        
        // Create feedback entry
        const feedback = {
            id: `feedback_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            timestamp: new Date().toISOString(),
            predictionId,
            factor: prediction.factor || (prediction.factors ? prediction.factors.join('; ') : 'Unknown'),
            rating: parseInt(rating, 10),
            probability: prediction.probability || prediction.combined_probability || 0,
            confidence: prediction.confidence || 0,
            userTier: this.userPreferences.subscriptionTier || 'free',
            source: 'prediction_card',
            deviceInfo: {
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                userAgent: navigator.userAgent,
                platform: navigator.platform
            }
        };
        
        // Store feedback locally
        this.feedbackData.submissions++;
        this.feedbackData.lastSubmitted = new Date().toISOString();
        this.feedbackData.pendingSync.push(feedback);
        
        // Save to localStorage
        localStorage.setItem('prediction_feedback_data', JSON.stringify(this.feedbackData));
        
        // Show confirmation to user
        this._showFeedbackConfirmation(rating);
        
        // If online, try to sync immediately
        if (navigator.onLine) {
            this._syncFeedbackData();
        }
    }
    
    _findPredictionById(predictionId) {
        // Check current predictions
        const currentPredictions = document.querySelectorAll('.prediction-card');
        for (const card of currentPredictions) {
            if (card.getAttribute('data-prediction-id') === predictionId) {
                const predictionData = JSON.parse(card.getAttribute('data-prediction'));
                return predictionData;
            }
        }
        
        // Check history
        const historyItems = this._loadFromLocalStorage('prediction_history') || [];
        return historyItems.find(item => item.id === predictionId);
    }
    
    _showFeedbackConfirmation(rating) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'feedback-toast';
        
        // Determine message based on rating
        let message = '';
        let iconClass = '';
        
        switch(parseInt(rating, 10)) {
            case 1:
                message = 'We appreciate your feedback! We\'ll work to improve our predictions.';
                iconClass = 'thumbs-down';
                break;
            case 2:
                message = 'Thanks for your feedback! We\'ll keep refining our prediction engine.';
                iconClass = 'neutral-face';
                break;
            case 3:
                message = 'Thank you! Your feedback helps us improve our prediction accuracy.';
                iconClass = 'thumbs-up';
                break;
            default:
                message = 'Thank you for your feedback!';
                iconClass = 'check-mark';
        }
        
        toast.innerHTML = `
            <div class="toast-icon ${iconClass}"></div>
            <div class="toast-content">${message}</div>
            <div class="toast-close">&times;</div>
        `;
        
        // Add to document
        document.body.appendChild(toast);
        
        // Show with animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Set up close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        });
        
        // Auto hide after 4 seconds
        setTimeout(() => {
            if (document.body.contains(toast)) {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (document.body.contains(toast)) {
                        document.body.removeChild(toast);
                    }
                }, 300);
            }
        }, 4000);
    }
    
    _showFeedbackModal() {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'feedback-modal';
        modal.innerHTML = `
            <div class="feedback-modal-content">
                <div class="feedback-modal-header">
                    <h2>Help Us Improve</h2>
                    <button class="feedback-modal-close">&times;</button>
                </div>
                <div class="feedback-modal-body">
                    <p>We value your feedback! Please let us know how we can improve our sports prediction platform.</p>
                    
                    <form id="platform-feedback-form">
                        <div class="feedback-section">
                            <h3>Overall Experience</h3>
                            <div class="rating-container">
                                <span class="rating-label">Poor</span>
                                <div class="star-rating">
                                    <input type="radio" id="star5" name="overall_rating" value="5" />
                                    <label for="star5"></label>
                                    <input type="radio" id="star4" name="overall_rating" value="4" />
                                    <label for="star4"></label>
                                    <input type="radio" id="star3" name="overall_rating" value="3" />
                                    <label for="star3"></label>
                                    <input type="radio" id="star2" name="overall_rating" value="2" />
                                    <label for="star2"></label>
                                    <input type="radio" id="star1" name="overall_rating" value="1" />
                                    <label for="star1"></label>
                                </div>
                                <span class="rating-label">Excellent</span>
                            </div>
                        </div>
                        
                        <div class="feedback-section">
                            <h3>Prediction Accuracy</h3>
                            <div class="rating-container">
                                <span class="rating-label">Poor</span>
                                <div class="star-rating">
                                    <input type="radio" id="accuracy5" name="accuracy_rating" value="5" />
                                    <label for="accuracy5"></label>
                                    <input type="radio" id="accuracy4" name="accuracy_rating" value="4" />
                                    <label for="accuracy4"></label>
                                    <input type="radio" id="accuracy3" name="accuracy_rating" value="3" />
                                    <label for="accuracy3"></label>
                                    <input type="radio" id="accuracy2" name="accuracy_rating" value="2" />
                                    <label for="accuracy2"></label>
                                    <input type="radio" id="accuracy1" name="accuracy_rating" value="1" />
                                    <label for="accuracy1"></label>
                                </div>
                                <span class="rating-label">Excellent</span>
                            </div>
                        </div>
                        
                        <div class="feedback-section">
                            <h3>User Interface</h3>
                            <div class="rating-container">
                                <span class="rating-label">Poor</span>
                                <div class="star-rating">
                                    <input type="radio" id="ui5" name="ui_rating" value="5" />
                                    <label for="ui5"></label>
                                    <input type="radio" id="ui4" name="ui_rating" value="4" />
                                    <label for="ui4"></label>
                                    <input type="radio" id="ui3" name="ui_rating" value="3" />
                                    <label for="ui3"></label>
                                    <input type="radio" id="ui2" name="ui_rating" value="2" />
                                    <label for="ui2"></label>
                                    <input type="radio" id="ui1" name="ui_rating" value="1" />
                                    <label for="ui1"></label>
                                </div>
                                <span class="rating-label">Excellent</span>
                            </div>
                        </div>
                        
                        <div class="feedback-section">
                            <h3>Feature Requests</h3>
                            <div class="checkbox-group">
                                <label><input type="checkbox" name="feature_request" value="more_leagues"> Support for more leagues</label>
                                <label><input type="checkbox" name="feature_request" value="player_stats"> Detailed player statistics</label>
                                <label><input type="checkbox" name="feature_request" value="mobile_app"> Mobile application</label>
                                <label><input type="checkbox" name="feature_request" value="notifications"> Game notifications</label>
                                <label><input type="checkbox" name="feature_request" value="social_sharing"> Social media sharing</label>
                            </div>
                        </div>
                        
                        <div class="feedback-section">
                            <h3>Additional Comments</h3>
                            <textarea name="comments" rows="4" placeholder="Please share any other feedback or suggestions..."></textarea>
                        </div>
                        
                        <div class="feedback-actions">
                            <button type="submit" class="primary-button">Submit Feedback</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(modal);
        
        // Show with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Set up close button
        const closeBtn = modal.querySelector('.feedback-modal-close');
        closeBtn.addEventListener('click', () => {
            this._closeFeedbackModal(modal);
        });
        
        // Handle click outside modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this._closeFeedbackModal(modal);
            }
        });
        
        // Handle form submission
        const form = modal.querySelector('#platform-feedback-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this._submitPlatformFeedback(form, modal);
        });
    }
    
    _closeFeedbackModal(modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        }, 300);
    }
    
    _submitPlatformFeedback(form, modal) {
        // Collect form data
        const formData = new FormData(form);
        const feedbackData = {
            id: `feedback_platform_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            timestamp: new Date().toISOString(),
            overall_rating: formData.get('overall_rating'),
            accuracy_rating: formData.get('accuracy_rating'),
            ui_rating: formData.get('ui_rating'),
            feature_requests: Array.from(formData.getAll('feature_request')),
            comments: formData.get('comments'),
            userTier: this.userPreferences.subscriptionTier || 'free',
            source: 'platform_feedback',
            deviceInfo: {
/**
 * Enhanced Custom Predictions Module v2.0
 * Advanced multi-league sports prediction platform with interactive visualizations,
 * real-time updates, and machine learning-driven insights
 * 
 * Features:
 * - Progressive Web App for offline access
 * - Real-time WebSocket updates for live event tracking
 * - Voice recognition for natural language queries
 * - Interactive D3-based visualizations
 * - Multi-league support (NBA, NFL, MLB, NHL, Premier League, Serie A, Bundesliga, La Liga)
 * - Prediction comparison analytics
 * - Personalized ML-driven dashboards
 * - WCAG 2.1 AA compliant UI
 * - Export to multiple formats
 * - Social media integration
 */

import { Logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { apiClient } from '../utils/apiClient.js';
import { authService } from '../services/authService.js';
import { notificationService } from '../services/notificationService.js';
import { analyticsService } from '../services/analyticsService.js';
import { localStorageService } from '../services/localStorageService.js';
import { exportService } from '../utils/exportService.js';
import { speechRecognitionService } from '../utils/speechRecognitionService.js';
import { predictionEngine } from '../engines/predictionEngine.js';
import { dataVisualizationService } from '../services/dataVisualizationService.js';
import { leagueDataService } from '../services/leagueDataService.js';
import { mlService } from '../services/mlService.js';
import { accessibilityService } from '../services/accessibilityService.js';
import { comparatorService } from '../services/comparatorService.js';
import { socialSharingService } from '../services/socialSharingService.js';

// Import D3 for advanced visualizations
import * as d3 from 'd3';

// League data constants
import { 
    NBA_TEAMS, NFL_TEAMS, MLB_TEAMS, NHL_TEAMS, 
    PREMIER_LEAGUE_TEAMS, SERIE_A_TEAMS, BUNDESLIGA_TEAMS, LA_LIGA_TEAMS,
    LEAGUE_COLORS, LEAGUE_ICONS
} from '../constants/leagueData.js';

// API configuration with keys
const API_CONFIG = {
    predictionApiKey: 'ult_pred_api_9af721bc35d8e4f2',
    webSocketEndpoint: 'wss://api.sportspredictions.com/ws',
    mlEndpoint: 'https://ml.sportspredictions.com/predict',
    requestTimeout: 30000,
    maxRetries: 3
};

// PWA Configuration
const PWA_CONFIG = {
    cacheVersion: 'predictions-v1',
    offlineFallbackPage: '/offline.html',
    cachableResources: [
        '/styles/predictions.css',
        '/scripts/prediction-bundle.js',
        '/images/logos/*.png',
        '/fonts/*'
    ]
};

/**
 * Enhanced Custom Predictions Class
 */
class CustomPredictions {
    constructor() {
        // Core properties
        this.container = null;
        this.isInitialized = false;
        this.isLoading = false;
        this.currentPrediction = null;
        this.predictionHistory = [];
        this.maxFactors = 7; // Increased from 5
        this.factorInputs = [];
        this.webSocketConnection = null;
        this.speechRecognitionActive = false;
        this.offlineMode = false;
        this.currentLeague = 'all';
        this.userPreferences = {};
        this.customDashboardConfig = null;
        this.visualizationMode = 'standard';
        this.pendingComparisons = [];
        
        // Bind methods to maintain context
        this._handleWebSocketMessage = this._handleWebSocketMessage.bind(this);
        this._handleSpeechResult = this._handleSpeechResult.bind(this);
        this._handleAuthStatusChanged = this._handleAuthStatusChanged.bind(this);
        this._handleOfflineStatusChange = this._handleOfflineStatusChange.bind(this);
        this._saveToIndexedDB = this._saveToIndexedDB.bind(this);
        this._loadFromIndexedDB = this._loadFromIndexedDB.bind(this);
        
        // Initialize analytics tracking
        analyticsService.trackEvent('predictions_module', 'init');
    }
    
    /**
     * Initialize the custom predictions module with enhanced features
     */
    async initialize(containerId = 'custom-predictions-container') {
        try {
            Logger.info('Initializing enhanced custom predictions module');
            
            // Get container
            this.container = document.getElementById(containerId);
            if (!this.container) {
                Logger.error('Custom predictions container not found');
                return false;
            }
            
            // Check online status and set mode
            this.offlineMode = !navigator.onLine;
            window.addEventListener('online', this._handleOfflineStatusChange);
            window.addEventListener('offline', this._handleOfflineStatusChange);
            
            // Register service worker for PWA
            this._registerServiceWorker();
            
            // Load user preferences
            await this._loadUserPreferences();
            
            // Check if user has Ultra Premium access
            const hasAccess = await this._checkPremiumAccess();
            if (!hasAccess) {
                this._renderUpgradePrompt();
                return false;
            }
            
            // Initialize IndexedDB for offline storage
            await this._initializeIndexedDB();
            
            // Render the enhanced UI
            this._renderEnhancedUI();
            
            // Setup voice recognition if available
            this._setupSpeechRecognition();
            
            // Connect to WebSocket for real-time updates
            if (!this.offlineMode) {
                this._connectToWebSocket();
            }
            
            // Set up event listeners
            this._setupEventListeners();
            
            // Subscribe to relevant events
            eventBus.subscribe('auth:statusChanged', this._handleAuthStatusChanged);
            eventBus.subscribe('preferences:updated', this._handlePreferencesUpdated.bind(this));
            eventBus.subscribe('league:changed', this._handleLeagueChanged.bind(this));
            
            // Load prediction history (from server or local cache)
            await this._loadPredictionHistory();
            
            // Initialize accessibility features
            accessibilityService.enhanceAccessibility(this.container);
            
            // Fetch league data
            await this._fetchLeagueData();
            
            // Render personalized dashboard if available
            this._renderPersonalizedDashboard();
            
            // Track initialization
            analyticsService.trackEvent('predictions_module', 'initialized', {
                offline_mode: this.offlineMode,
                current_league: this.currentLeague,
                visualization_mode: this.visualizationMode
            });
            
            this.isInitialized = true;
            Logger.info('Enhanced custom predictions module initialized');
            return true;
            
        } catch (error) {
            Logger.error('Failed to initialize enhanced custom predictions:', error);
            this._renderErrorState(error);
            return false;
        }
    }
    
    /**
     * Register service worker for PWA capabilities
     */
    async _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/'
                });
                Logger.info('Service Worker registered with scope:', registration.scope);
            } catch (error) {
                Logger.error('Service Worker registration failed:', error);
            }
        }
    }
    
    /**
     * Initialize IndexedDB for offline storage
     */
    async _initializeIndexedDB() {
        try {
            const dbPromise = indexedDB.open('PredictionsDB', 1);
            
            dbPromise.onupgradeneeded = function(event) {
                const db = event.target.result;
                
                // Create predictions store
                if (!db.objectStoreNames.contains('predictions')) {
                    const predictionStore = db.createObjectStore('predictions', { keyPath: 'id' });
                    predictionStore.createIndex('timestamp', 'timestamp', { unique: false });
                    predictionStore.createIndex('type', 'type', { unique: false });
                    predictionStore.createIndex('league', 'league', { unique: false });
                }
                
                // Create user preferences store
                if (!db.objectStoreNames.contains('userPreferences')) {
                    db.createObjectStore('userPreferences', { keyPath: 'id' });
                }
                
                // Create comparisons store
                if (!db.objectStoreNames.contains('comparisons')) {
                    const comparisonsStore = db.createObjectStore('comparisons', { keyPath: 'id' });
                    comparisonsStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            
            return new Promise((resolve, reject) => {
                dbPromise.onsuccess = function(event) {
                    Logger.info('IndexedDB initialized successfully');
                    resolve(event.target.result);
                };
                
                dbPromise.onerror = function(event) {
                    Logger.error('Error initializing IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            Logger.error('IndexedDB initialization error:', error);
            throw error;
        }
    }
    
    /**
     * Save prediction to IndexedDB for offline access
     */
    async _saveToIndexedDB(prediction) {
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['predictions'], 'readwrite');
            const store = transaction.objectStore('predictions');
            
            // Add unique ID and timestamp if not present
            prediction.id = prediction.id || `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            prediction.timestamp = prediction.timestamp || Date.now();
            prediction.synced = prediction.synced || false;
            
            await store.put(prediction);
            Logger.info('Prediction saved to IndexedDB:', prediction.id);
            return prediction;
        } catch (error) {
            Logger.error('Error saving to IndexedDB:', error);
            throw error;
        }
    }
    
    /**
     * Load predictions from IndexedDB
     */
    async _loadFromIndexedDB(limit = 10) {
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['predictions'], 'readonly');
            const store = transaction.objectStore('predictions');
            const index = store.index('timestamp');
            
            return new Promise((resolve, reject) => {
                const request = index.openCursor(null, 'prev');
                const results = [];
                
                request.onsuccess = function(event) {
                    const cursor = event.target.result;
                    if (cursor && results.length < limit) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };
                
                request.onerror = function(event) {
                    reject(event.target.error);
                };
            });
        } catch (error) {
            Logger.error('Error loading from IndexedDB:', error);
            return [];
        }
    }
    
    /**
     * Get IndexedDB instance
     */
    async _getIndexedDBInstance() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PredictionsDB', 1);
            
            request.onsuccess = function(event) {
                resolve(event.target.result);
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }
    
    /**
     * Load user preferences from server or local storage
     */
    async _loadUserPreferences() {
        try {
            if (this.offlineMode) {
                // Load from IndexedDB in offline mode
                const db = await this._getIndexedDBInstance();
                const transaction = db.transaction(['userPreferences'], 'readonly');
                const store = transaction.objectStore('userPreferences');
                
                return new Promise((resolve, reject) => {
                    const request = store.get('userPrefs');
                    
                    request.onsuccess = (event) => {
                        if (event.target.result) {
                            this.userPreferences = event.target.result.data || {};
                            this.customDashboardConfig = event.target.result.dashboardConfig || null;
                        }
                        resolve();
                    };
                    
                    request.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            } else {
                // Load from server
                const response = await apiClient.get('/api/users/preferences', {
                    headers: {
                        'Authorization': `Bearer ${authService.getToken()}`,
                        'X-API-Key': API_CONFIG.predictionApiKey
                    }
                });
                
                if (response.status === 'success') {
                    this.userPreferences = response.data.preferences || {};
                    this.customDashboardConfig = response.data.dashboardConfig || null;
                    
                    // Save to IndexedDB for offline access
                    const db = await this._getIndexedDBInstance();
                    const transaction = db.transaction(['userPreferences'], 'readwrite');
                    const store = transaction.objectStore('userPreferences');
                    
                    await store.put({
                        id: 'userPrefs',
                        data: this.userPreferences,
                        dashboardConfig: this.customDashboardConfig,
                        updatedAt: Date.now()
                    });
                }
            }
        } catch (error) {
            Logger.error('Error loading user preferences:', error);
            // Use default preferences
            this.userPreferences = {
                favoriteLeagues: ['NBA', 'NFL'],
                favoriteTeams: [],
                predictionDisplayMode: 'detailed',
                theme: 'auto',
                notificationsEnabled: true,
                visualizationPreference: 'standard'
            };
        }
    }
    
    /**
     * Check if user has Ultra Premium access
     */
    async _checkPremiumAccess() {
        try {
            // Try to get from local storage first for faster loading
            const cachedStatus = localStorageService.get('premium_access_status');
            if (cachedStatus && cachedStatus.expiry > Date.now()) {
                return cachedStatus.hasPremium;
            }
            
            // If offline and no cached status, assume they have access
            // (we'll verify when they go back online)
            if (this.offlineMode) {
                return true;
            }
            
            const userStatus = await authService.getUserStatus();
            const hasPremium = userStatus.subscription && 
                              (userStatus.subscription.tier === 'ultra_premium' || 
                               userStatus.subscription.tier === 'enterprise');
            
            // Cache the result for 1 hour
            localStorageService.set('premium_access_status', {
                hasPremium,
                expiry: Date.now() + (60 * 60 * 1000)
            });
            
            return hasPremium;
        } catch (error) {
            Logger.error('Error checking premium access:', error);
            
            // If offline, give benefit of the doubt
            if (this.offlineMode) {
                return true;
            }
            
            return false;
        }
    }
    
    /**
     * Handle online/offline status change
     */
    async _handleOfflineStatusChange(event) {
        const isOnline = navigator.onLine;
        
        if (isOnline && this.offlineMode) {
            // Switched from offline to online
            this.offlineMode = false;
            notificationService.showNotification('Back online! Syncing your predictions...', 'info');
            
            // Connect to WebSocket
            this._connectToWebSocket();
            
            // Sync offline predictions
            await this._syncOfflinePredictions();
            
            // Refresh the UI with latest data
            this._renderEnhancedUI();
            
        } else if (!isOnline && !this.offlineMode) {
            // Switched from online to offline
            this.offlineMode = true;
            notificationService.showNotification('You\'re offline. Predictions will be saved locally.', 'warning');
            
            // Disconnect WebSocket
            if (this.webSocketConnection) {
                this.webSocketConnection.close();
                this.webSocketConnection = null;
            }
            
            // Update UI to show offline mode
            this._updateOfflineUI();
        }
    }
    
    /**
     * Update UI to show offline mode
     */
    _updateOfflineUI() {
        // Add offline indicator
        const header = this.container.querySelector('.card-header');
        if (header) {
            const offlineIndicator = document.createElement('div');
            offlineIndicator.id = 'offline-indicator';
            offlineIndicator.className = 'offline-badge px-2 py-1 bg-warning rounded-pill text-xs font-weight-bold ms-2';
            offlineIndicator.textContent = 'OFFLINE';
            
            if (!header.querySelector('#offline-indicator')) {
                header.appendChild(offlineIndicator);
            }
        }
        
        // Disable features that require online connection
        const disabledButtons = [
            '#share-prediction-btn',
            '#export-prediction-btn',
            '#multi-predict-button',
            '#single-predict-button'
        ];
        
        disabledButtons.forEach(selector => {
            const button = this.container.querySelector(selector);
            if (button) {
                button.disabled = true;
                button.title = 'This feature requires an internet connection';
            }
        });
        
        // Show offline message
        const resultsContainer = this.container.querySelector('#prediction-results');
        if (resultsContainer && !resultsContainer.classList.contains('d-none')) {
            const offlineMessage = document.createElement('div');
            offlineMessage.className = 'alert alert-warning mt-3';
            offlineMessage.innerHTML = '<i class="fas fa-wifi-slash"></i> You\'re currently offline. This prediction is saved locally and will sync when you\'re back online.';
            
            if (!resultsContainer.querySelector('.alert-warning')) {
                resultsContainer.appendChild(offlineMessage);
            }
        }
    }
    
    /**
     * Sync offline predictions when coming back online
     */
    async _syncOfflinePredictions() {
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['predictions'], 'readonly');
            const store = transaction.objectStore('predictions');
            
            return new Promise((resolve, reject) => {
                const request = store.index('synced').openCursor(IDBKeyRange.only(false));
                const unsyncedPredictions = [];
                
                request.onsuccess = async function(event) {
                    const cursor = event.target.result;
                    
                    if (cursor) {
                        unsyncedPredictions.push(cursor.value);
                        cursor.continue();
                    } else {
                        // Now sync all unsynced predictions
                        for (const prediction of unsyncedPredictions) {
                            try {
                                // Send to server
                                await apiClient.post('/api/predictions/sync', {
                                    prediction: prediction
                                });
                                
                                // Mark as synced
                                prediction.synced = true;
                                const updateTx = db.transaction(['predictions'], 'readwrite');
                                const updateStore = updateTx.objectStore('predictions');
                                await updateStore.put(prediction);
                            } catch (error) {
                                Logger.error('Error syncing prediction:', error);
                            }
                        }
                        
                        resolve(unsyncedPredictions.length);
                    }
                };
                
                request.onerror = function(event) {
                    reject(event.target.error);
                };
            });
        } catch (error) {
            Logger.error('Error syncing offline predictions:', error);
            return 0;
        }
    }
    
    /**
     * Connect to WebSocket for real-time updates
     */
    _connectToWebSocket() {
        if (this.webSocketConnection) {
            this.webSocketConnection.close();
        }
        
        try {
            const token = authService.getToken();
            this.webSocketConnection = new WebSocket(`${API_CONFIG.webSocketEndpoint}?token=${token}`);
            
            this.webSocketConnection.onopen = () => {
                Logger.info('WebSocket connection established');
                // Subscribe to relevant updates
                this._subscribeToLiveUpdates();
            };
            
            this.webSocketConnection.onmessage = this._handleWebSocketMessage;
            
            this.webSocketConnection.onerror = (error) => {
                Logger.error('WebSocket error:', error);
            };
            
            this.webSocketConnection.onclose = () => {
                Logger.info('WebSocket connection closed');
                // Try to reconnect after a delay
                setTimeout(() => {
                    if (!this.offlineMode) {
                        this._connectToWebSocket();
                    }
                }, 5000);
            };
        } catch (error) {
            Logger.error('Error connecting to WebSocket:', error);
        }
    }
    
    /**
     * Subscribe to live updates via WebSocket
     */
    _subscribeToLiveUpdates() {
        if (!this.webSocketConnection || this.webSocketConnection.readyState !== WebSocket.OPEN) {
            return;
        }
        
        // Get user's favorite teams and leagues from preferences
        const favoriteTeams = this.userPreferences.favoriteTeams || [];
        const favoriteLeagues = this.userPreferences.favoriteLeagues || [];
        
        // Subscribe to relevant topics
        this.webSocketConnection.send(JSON.stringify({
            action: 'subscribe',
            topics: [
                'predictions.updates',
                'live.scores',
                ...favoriteLeagues.map(league => `league.${league.toLowerCase()}`),
                ...favoriteTeams.map(team => `team.${team.toLowerCase().replace(/\s+/g, '-')}`)
            ]
        }));
    }
    
    /**
     * Handle WebSocket messages for real-time updates
     */
    _handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'prediction_update':
                    this._handlePredictionUpdate(data.payload);
                    break;
                
                case 'live_score_update':
                    this._handleLiveScoreUpdate(data.payload);
                    break;
                
                case 'odds_change':
                    this._handleOddsChange(data.payload);
                    break;
                
                case 'player_status_update':
                    this._handlePlayerStatusUpdate(data.payload);
                    break;
                
                case 'game_status_update':
                    this._handleGameStatusUpdate(data.payload);
                    break;
                
                case 'system_message':
                    notificationService.showNotification(data.payload.message, data.payload.level || 'info');
                    break;
            }
            
            // Dispatch event for other components
            eventBus.publish('websocket:message', data);
            
        } catch (error) {
            Logger.error('Error handling WebSocket message:', error);
        }
    }
    
    /**
     * Handle prediction update from WebSocket
     */
    _handlePredictionUpdate(payload) {
        // If this prediction is currently displayed, update it
        if (this.currentPrediction && this.currentPrediction.id === payload.predictionId) {
            // Update current prediction
            this.currentPrediction = {
                ...this.currentPrediction,
                ...payload.updates
            };
            
            // Re-render the prediction
            this._displayPredictionResults(this.currentPrediction, this.currentPrediction.type === 'multi');
            
            // Show notification
            notificationService.showNotification('Prediction updated with latest data', 'info');
        }
        
        // Update prediction in history if it exists
        const historyIndex = this.predictionHistory.findIndex(p => p.id === payload.predictionId);
        if (historyIndex >= 0) {
            this.predictionHistory[historyIndex] = {
                ...this.predictionHistory[historyIndex],
                ...payload.updates
            };
            
            // Update history display
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Handle live score update from WebSocket
     */
    _handleLiveScoreUpdate(payload) {
        // Find relevant predictions that might be affected by this score
        const affectedPredictions = this._findAffectedPredictions(payload);
        
        // If any affected predictions are found, highlight them in the UI
        if (affectedPredictions.length > 0) {
            affectedPredictions.forEach(prediction => {
                this._highlightAffectedPrediction(prediction.id, payload);
            });
            
            // Show notification
            const game = `${payload.awayTeam} @ ${payload.homeTeam}`;
            notificationService.showNotification(`Score update: ${game} | ${payload.awayScore}-${payload.homeScore}`, 'info');
        }
        
        // Update live game indicators
        this._updateLiveGameIndicators(payload);
    }
    
    /**
     * Find predictions affected by a live update
     */
    _findAffectedPredictions(payload) {
        return this.predictionHistory.filter(prediction => {
            // For single-factor predictions
            if (prediction.type === 'single' && prediction.factor) {
                const factorText = prediction.factor.toLowerCase();
                const homeTeam = payload.homeTeam.toLowerCase();
                const awayTeam = payload.awayTeam.toLowerCase();
                
                return factorText.includes(homeTeam) || factorText.includes(awayTeam);
            }
            
            // For multi-factor predictions
            if (prediction.type === 'multi' && prediction.factors) {
                const homeTeam = payload.homeTeam.toLowerCase();
                const awayTeam = payload.awayTeam.toLowerCase();
                
                return prediction.factors.some(factor => 
                    factor.toLowerCase().includes(homeTeam) || 
                    factor.toLowerCase().includes(awayTeam)
                );
            }
            
            return false;
        });
    }
    
    /**
     * Highlight a prediction affected by a live update
     */
    _highlightAffectedPrediction(predictionId, update) {
        const historyItem = this.container.querySelector(`.history-item[data-prediction-id="${predictionId}"]`);
        
        if (historyItem) {
            // Add live update indicator
            const liveIndicator = document.createElement('div');
            liveIndicator.className = 'live-update-indicator pulse-animation';
            liveIndicator.innerHTML = '<i class="fas fa-bolt"></i> LIVE';
            
            // Replace existing indicator or add new one
            const existingIndicator = historyItem.querySelector('.live-update-indicator');
            if (existingIndicator) {
                existingIndicator.replaceWith(liveIndicator);
            } else {
                historyItem.appendChild(liveIndicator);
            }
            
            // Add update details tooltip
            historyItem.setAttribute('data-bs-toggle', 'tooltip');
            historyItem.setAttribute('data-bs-placement', 'top');
            historyItem.setAttribute('data-bs-html', 'true');
            historyItem.setAttribute('title', `
                <strong>${update.homeTeam} vs ${update.awayTeam}</strong><br>
                Score: ${update.homeScore}-${update.awayScore}<br>
                ${update.period} | ${update.timeRemaining}
            `);
            
            // Initialize tooltip
            new bootstrap.Tooltip(historyItem);
            
            // Add highlight animation
            historyItem.classList.add('prediction-update-highlight');
            setTimeout(() => {
                historyItem.classList.remove('prediction-update-highlight');
            }, 3000);
        }
    }
    
    /**
     * Update live game indicators
     */
    _updateLiveGameIndicators(update) {
        // Update global live games indicators
        const liveGamesContainer = document.getElementById('live-games-container');
        
        if (liveGamesContainer) {
            // Check if this game is already displayed
            const gameId = `${update.homeTeam}-${update.awayTeam}`.toLowerCase().replace(/\s+/g, '-');
            let gameElement = liveGamesContainer.querySelector(`[data-game-id="${gameId}"]`);
            
            if (!gameElement) {
                // Create new game element
                gameElement = document.createElement('div');
                gameElement.className = 'live-game-pill d-inline-flex align-items-center me-2 mb-2 py-1 px-2 rounded bg-danger text-white';
                gameElement.setAttribute('data-game-id', gameId);
                liveGamesContainer.appendChild(gameElement);
            }
            
            // Update content
            gameElement.innerHTML = `
                <span class="live-indicator me-1"></span>
                <span>${update.awayTeam} ${update.awayScore} @ ${update.homeTeam} ${update.homeScore}</span>
                <span class="ms-1 text-xs opacity-75">${update.timeRemaining}</span>
            `;
        }
    }
    
    /**
     * Handle odds change from WebSocket
     */
    _handleOddsChange(payload) {
        // Find predictions affected by odds change
        const affectedPredictions = this._findPredictionsAffectedByOdds(payload);
        
        if (affectedPredictions.length > 0) {
            // Update affected predictions
            affectedPredictions.forEach(prediction => {
                // Calculate probability impact
                const probabilityDelta = this._calculateProbabilityDelta(prediction, payload);
                
                // Update prediction if significant change
                if (Math.abs(probabilityDelta) >= 0.05) { // 5% change threshold
                    this._updatePredictionWithNewOdds(prediction.id, payload, probabilityDelta);
                }
            });
            
            // Show notification for significant odds changes
            const significantChange = affectedPredictions.some(p => 
                Math.abs(this._calculateProbabilityDelta(p, payload)) >= 0.1
            );
            
            if (significantChange) {
                notificationService.showNotification(
                    `Significant odds change for ${payload.team || payload.player}`,
                    'warning'
                );
            }
        }
    }
    
    /**
     * Find predictions affected by odds change
     */
    _findPredictionsAffectedByOdds(payload) {
        return this.predictionHistory.filter(prediction => {
            const content = prediction.type === 'single' 
                ? prediction.factor 
                : prediction.factors ? prediction.factors.join(' ') : '';
                
            if (!content) return false;
            
            const contentLower = content.toLowerCase();
            const entityLower = (payload.team || payload.player || '').toLowerCase();
            
            return entityLower && contentLower.includes(entityLower);
        });
    }
    
    /**
     * Calculate probability change from odds update
     */
    _calculateProbabilityDelta(prediction, oddsPayload) {
        // This would normally use a complex algorithm based on your prediction model
        // Simplified example:
        const oldOdds = oddsPayload.previousOdds;
        const newOdds = oddsPayload.currentOdds;
        
        // Convert American odds to probability
        const oddsToProb = (odds) => {
            if (odds > 0) {
                return 100 / (odds + 100);
            } else {
                return Math.abs(odds) / (Math.abs(odds) + 100);
            }
        };
        
        const oldProb = oddsToProb(oldOdds);
        const newProb = oddsToProb(newOdds);
        
        return newProb - oldProb;
    }
    
    /**
     * Update prediction with new odds
     */
    _updatePredictionWithNewOdds(predictionId, oddsPayload, probabilityDelta) {
        // Find prediction in history
        const predictionIndex = this.predictionHistory.findIndex(p => p.id === predictionId);
        
        if (predictionIndex >= 0) {
            const prediction = this.predictionHistory[predictionIndex];
            
            // Update probability
            if (prediction.type === 'single') {
                prediction.result.probability += probabilityDelta;
                // Ensure probability stays in valid range
                prediction.result.probability = Math.max(0, Math.min(1, prediction.result.probability));
            } else if (prediction.type === 'multi') {
                // For multi-factor, update individual probabilities that match
                const entity = (oddsPayload.team || oddsPayload.player || '').toLowerCase();
                
                prediction.result.individual_probabilities = 
                    prediction.result.individual_probabilities.map((prob, i) => {
                        const factor = prediction.factors[i].toLowerCase();
                        return factor.includes(entity) ? 
                            Math.max(0, Math.min(1, prob + probabilityDelta)) : 
                            prob;
                    });
                
                // Recalculate combined probability
                prediction.result.combined_probability = 
                    prediction.result.individual_probabilities.reduce((acc, p) => acc * p, 1);
            }
            
            // Add odds update to prediction
            prediction.oddsUpdates = prediction.oddsUpdates || [];
            prediction.oddsUpdates.push({
                timestamp: Date.now(),
                entity: oddsPayload.team || oddsPayload.player,
                previousOdds: oddsPayload.previousOdds,
                currentOdds: oddsPayload.currentOdds,
                probabilityDelta: probabilityDelta
            });
            
            // Update in history
            this.predictionHistory[predictionIndex] = prediction;
            
            // If this is the current prediction, update display
            if (this.currentPrediction && this.currentPrediction.id === predictionId) {
                this.currentPrediction = prediction;
                this._displayPredictionResults(
                    this.currentPrediction, 
                    this.currentPrediction.type === 'multi'
                );
            }
            
            // Update history display
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Handle player status update from WebSocket
     */
    _handlePlayerStatusUpdate(payload) {
        // Find predictions that mention this player
        const playerName = payload.playerName.toLowerCase();
        const affectedPredictions = this.predictionHistory.filter(prediction => {
            const content = prediction.type === 'single' 
                ? prediction.factor 
                : prediction.factors ? prediction.factors.join(' ') : '';
                
            return content.toLowerCase().includes(playerName);
        });
        
        if (affectedPredictions.length > 0) {
            // Show notification
            const statusIcon = payload.status === 'active' ? '✅' : 
                               payload.status === 'questionable' ? '⚠️' : 
                               payload.status === 'out' ? '❌' : '❓';
                               
            notificationService.showNotification(
                `${statusIcon} ${payload.playerName} is now ${payload.status.toUpperCase()} for ${payload.team}`,
                payload.status === 'active' ? 'success' : 
                payload.status === 'questionable' ? 'warning' : 'danger'
            );
            
            // Update affected predictions with player status
            affectedPredictions.forEach(prediction => {
                // Add player status update
                prediction.playerUpdates = prediction.playerUpdates || [];
                prediction.playerUpdates.push({
                    playerName: payload.playerName,
                    team: payload.team,
                    previousStatus: payload.previousStatus,
                    currentStatus: payload.status,
                    timestamp: Date.now()
                });
                
                // If status changed from active to out, adjust probability significantly
                if (payload.previousStatus === 'active' && payload.status === 'out') {
                    if (prediction.type === 'single') {
                        // Reduce probability based on player importance
                        prediction.result.probability *= 0.7; // Example: 30% reduction
                    } else if (prediction.type === 'multi') {
                        // Reduce individual probabilities for factors mentioning the player
                        prediction.result.individual_probabilities = 
                            prediction.result.individual_probabilities.map((prob, i) => {
                                const factor = prediction.factors[i].toLowerCase();
                                return factor.includes(playerName) ? prob * 0.7 : prob;
                            });
                        
                        // Recalculate combined probability
                        prediction.result.combined_probability = 
                            prediction.result.individual_probabilities.reduce((acc, p) => acc * p, 1);
                    }
                }
            });
            
            // Update current prediction if affected
            if (this.currentPrediction && affectedPredictions.some(p => p.id === this.currentPrediction.id)) {
                this.currentPrediction = this.predictionHistory.find(p => p.id === this.currentPrediction.id);
                this._displayPredictionResults(
                    this.currentPrediction, 
                    this.currentPrediction.type === 'multi'
                );
            }
            
            // Update history display
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Handle game status update from WebSocket
     */
    _handleGameStatusUpdate(payload) {
        // Find predictions related to this game
        const homeTeam = payload.homeTeam.toLowerCase();
        const awayTeam = payload.awayTeam.toLowerCase();
        
        const affectedPredictions = this.predictionHistory.filter(prediction => {
            const content = prediction.type === 'single' 
                ? prediction.factor 
                : prediction.factors ? prediction.factors.join(' ') : '';
                
            return content.toLowerCase().includes(homeTeam) || 
                   content.toLowerCase().includes(awayTeam);
        });
        
        if (affectedPredictions.length > 0) {
            // Show notification for game start or end
            if (payload.status === 'in_progress' && payload.previousStatus === 'scheduled') {
                notificationService.showNotification(
                    `🏆 Game Started: ${payload.awayTeam} @ ${payload.homeTeam}`,
                    'info'
                );
            } else if (payload.status === 'final') {
                notificationService.showNotification(
                    `🏁 Final Score: ${payload.awayTeam} ${payload.awayScore}, ${payload.homeTeam} ${payload.homeScore}`,
                    'info'
                );
                
                // Update predictions with final result
                affectedPredictions.forEach(prediction => {
                    prediction.gameResults = prediction.gameResults || [];
                    prediction.gameResults.push({
                        homeTeam: payload.homeTeam,
                        awayTeam: payload.awayTeam,
                        homeScore: payload.homeScore,
                        awayScore: payload.awayScore,
                        timestamp: Date.now()
                    });
                    
                    // Mark prediction as resolved if possible
                    if (this._canResolvePrediction(prediction, payload)) {
                        prediction.resolved = true;
                        prediction.resolvedResult = this._determineResolvedResult(prediction, payload);
                        prediction.resolvedTimestamp = Date.now();
                    }
                });
                
                // Update current prediction if affected
                if (this.currentPrediction && affectedPredictions.some(p => p.id === this.currentPrediction.id)) {
                    this.currentPrediction = this.predictionHistory.find(p => p.id === this.currentPrediction.id);
                    
                    if (this.currentPrediction.resolved) {
                        this._displayResolvedPrediction(this.currentPrediction);
                    } else {
                        this._displayPredictionResults(
                            this.currentPrediction, 
                            this.currentPrediction.type === 'multi'
                        );
                    }
                }
                
                // Update history display
                this._updatePredictionHistory();
            }
        }
    }
    
    /**
     * Determine if a prediction can be resolved based on game result
     */
    _canResolvePrediction(prediction, gameResult) {
        // This would normally use NLP to parse the prediction and compare with game result
        // For example, if prediction is "Lakers win by 10+ points"
        // and Lakers won by 15, this should return true
        
        // Simplified example:
        const factor = prediction.type === 'single' ? prediction.factor : '';
        
        if (!factor) return false;
        
        const homeTeam = gameResult.homeTeam.toLowerCase();
        const awayTeam = gameResult.awayTeam.toLowerCase();
        
        // Very basic pattern matching for demonstration
        const homeWin = gameResult.homeScore > gameResult.awayScore;
        const awayWin = gameResult.awayScore > gameResult.homeScore;
        
        if (factor.toLowerCase().includes(`${homeTeam} win`) && homeWin) {
            return true;
        }
        
        if (factor.toLowerCase().includes(`${awayTeam} win`) && awayWin) {
            return true;
        }
        
        // Handle point spread patterns, etc.
        // This would be far more sophisticated in a real implementation
        
        return false;
    }
    
    /**
     * Determine the result of a resolved prediction
     */
    _determineResolvedResult(prediction, gameResult) {
        // This would use NLP to parse the prediction and determine if it was correct
        // Simplified example:
        return {
            correct: true, // Would be determined by comparing prediction to actual result
            actualResult: `${gameResult.homeTeam} ${gameResult.homeScore}, ${gameResult.awayTeam} ${gameResult.awayScore}`,
            winAmount: prediction.result.probability > 0.5 ? 100 : 0 // Example calculation
        };
    }
    
    /**
     * Display a resolved prediction with actual results
     */
    _displayResolvedPrediction(prediction) {
        const resultsContainer = this.container.querySelector('#prediction-results');
        
        if (!resultsContainer) return;
        
        resultsContainer.classList.remove('d-none');
        
        // Create resolved prediction display
        resultsContainer.innerHTML = `
            <div class="prediction-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4 d-flex justify-content-between align-items-start">
                    <div>
                        <h4 class="prediction-factor">${prediction.factor || 'Multi-Factor Prediction'}</h4>
                        <p class="text-muted mb-0 text-sm">${prediction.result.analysis?.summary || ''}</p>
                    </div>
                    <div class="resolved-badge ${prediction.resolvedResult.correct ? 'bg-success' : 'bg-danger'} text-white px-3 py-2 rounded">
                        ${prediction.resolvedResult.correct ? 'CORRECT' : 'INCORRECT'}
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-6">
                        <div class="predicted-result p-3 rounded bg-light mb-3">
                            <h6 class="mb-2">Your Prediction</h6>
                            <div class="d-flex justify-content-between">
                                <span>Probability:</span>
                                <span class="font-weight-bold">${(prediction.result.probability * 100).toFixed(1)}%</span>
                            </div>
                            <div class="progress mt-2" style="height: 15px;">
                                <div class="progress-bar" 
                                    role="progressbar" 
                                    style="width: ${prediction.result.probability * 100}%;"
                                    aria-valuenow="${prediction.result.probability * 100}" 
                                    aria-valuemin="0" 
                                    aria-valuemax="100">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-6">
                        <div class="actual-result p-3 rounded bg-light mb-3">
                            <h6 class="mb-2">Actual Result</h6>
                            <p class="mb-1">${prediction.resolvedResult.actualResult}</p>
                            ${prediction.resolvedResult.winAmount > 0 ? 
                                `<div class="win-amount text-success">+$${prediction.resolvedResult.winAmount.toFixed(2)}</div>` : 
                                ''}
                        </div>
                    </div>
                </div>
                
                <div class="insights border-top pt-3 mt-2">
                    <h6>Analysis</h6>
                    <p>${prediction.resolvedResult.correct ? 
                        'Your prediction was accurate! The result matched your prediction.' : 
                        'Your prediction did not match the actual outcome. Here\'s why it may have been off:'}</p>
                    
                    <ul class="text-sm">
                        ${prediction.playerUpdates ? prediction.playerUpdates.map(update => 
                            `<li>${update.playerName} changed status from ${update.previousStatus} to ${update.currentStatus}</li>`
                        ).join('') : ''}
                        
                        ${prediction.oddsUpdates ? prediction.oddsUpdates.map(update => 
                            `<li>Odds for ${update.entity} changed by ${(update.probabilityDelta * 100).toFixed(1)}%</li>`
                        ).join('') : ''}
                    </ul>
                </div>
                
                <div class="mt-3 text-end">
                    <button class="btn btn-sm btn-outline-primary me-2 add-to-comparison-btn">
                        <i class="fas fa-chart-bar"></i> Compare
                    </button>
                    <button class="btn btn-sm btn-outline-success share-prediction-btn">
                        <i class="fas fa-share-alt"></i> Share Result
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        resultsContainer.querySelector('.add-to-comparison-btn')?.addEventListener('click', () => {
            this._addPredictionToComparison(prediction);
        });
        
        resultsContainer.querySelector('.share-prediction-btn')?.addEventListener('click', () => {
            this._sharePredictionResult(prediction);
        });
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    /**
     * Setup speech recognition for voice commands
     */
    _setupSpeechRecognition() {
        if (!speechRecognitionService.isAvailable()) {
            Logger.warn('Speech recognition not available in this browser');
            return;
        }
        
        // Initialize speech recognition
        speechRecognitionService.initialize({
            language: 'en-US',
            continuous: false,
            interimResults: true,
            maxAlternatives: 3
        });
        
        // Set up event handlers
        speechRecognitionService.onResult(this._handleSpeechResult);
        
        speechRecognitionService.onError((error) => {
            Logger.error('Speech recognition error:', error);
            this._updateVoiceRecognitionUI(false, 'Error: ' + error.message);
        });
        
        speechRecognitionService.onEnd(() => {
            this.speechRecognitionActive = false;
            this._updateVoiceRecognitionUI(false);
        });
    }
    
    /**
     * Handle speech recognition result
     */
    _handleSpeechResult(event) {
        const results = event.results;
        
        if (results && results.length > 0) {
            const mostRecentResult = results[results.length - 1];
            
            if (mostRecentResult.isFinal) {
                const transcript = mostRecentResult[0].transcript.trim();
                
                // Update voice input display
                this._updateVoiceRecognitionUI(true, transcript);
                
                // Process the command
                this._processVoiceCommand(transcript);
                
                // Stop recognition after processing
                speechRecognitionService.stop();
                this.speechRecognitionActive = false;
            } else {
                // Show interim results
                const interimTranscript = mostRecentResult[0].transcript.trim();
                this._updateVoiceRecognitionUI(true, interimTranscript, true);
            }
        }
    }
    
    /**
     * Process voice command
     */
    _processVoiceCommand(command) {
        // Convert to lowercase for easier matching
        const lowerCommand = command.toLowerCase();
        
        // Basic command patterns
        const predictPattern = /^predict\s+(.+)$/i;
        const comparePattern = /^compare\s+(.+)$/i;
        const showPattern = /^show\s+(.+)$/i;
        const exportPattern = /^export\s+(.+)$/i;
        
        // Check for command patterns
        const predictMatch = lowerCommand.match(predictPattern);
        const compareMatch = lowerCommand.match(comparePattern);
        const showMatch = lowerCommand.match(showPattern);
        const exportMatch = lowerCommand.match(exportPattern);
        
        if (predictMatch) {
            // Prediction command
            const predictionText = predictMatch[1];
            this._handleVoicePrediction(predictionText);
        } else if (compareMatch) {
            // Compare command
            const compareText = compareMatch[1];
            this._handleVoiceCompare(compareText);
        } else if (showMatch) {
            // Show command
            const showText = showMatch[1];
            this._handleVoiceShow(showText);
        } else if (exportMatch) {
            // Export command
            const exportText = exportMatch[1];
            this._handleVoiceExport(exportText);
        } else if (lowerCommand.includes('help')) {
            // Help command
            this._showVoiceCommandHelp();
        } else {
            // Unknown command
            notificationService.showNotification('Sorry, I didn\'t understand that command. Try saying "help" for a list of commands.', 'warning');
        }
    }
    
    /**
     * Handle voice prediction command
     */
    _handleVoicePrediction(predictionText) {
        // Set the prediction text in the input field
        const inputField = this.container.querySelector('#single-factor-input');
        if (inputField) {
            inputField.value = predictionText;
            
            // Switch to single factor tab
            const singleFactorTab = this.container.querySelector('[data-tab="single-factor"]');
            if (singleFactorTab) {
                singleFactorTab.click();
            }
            
            // Show notification
            notificationService.showNotification('Voice prediction added. Click "Generate Prediction" to continue.', 'info');
            
            // Scroll to the prediction button
            this.container.querySelector('#single-predict-button')?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }
    
    /**
     * Handle voice compare command
     */
    _handleVoiceCompare(compareText) {
        // Parse the command to see what to compare
        if (compareText.includes('last') || compareText.includes('recent')) {
            // Compare recent predictions
            const count = parseInt(compareText.match(/\d+/)?.[0] || 2);
            
            const recentPredictions = this.predictionHistory.slice(0, Math.min(count, 5));
            this.pendingComparisons = recentPredictions.map(p => p.id);
            
            if (recentPredictions.length > 0) {
                this._showComparisonTool();
                notificationService.showNotification(`Comparing the ${recentPredictions.length} most recent predictions`, 'info');
            } else {
                notificationService.showNotification('No recent predictions to compare', 'warning');
            }
        } else {
            // Try to find predictions with matching text
            const matchingPredictions = this.predictionHistory.filter(p => {
                const content = p.type === 'single' ? p.factor : p.factors?.join(' ') || '';
                return content.toLowerCase().includes(compareText.toLowerCase());
            });
            
            if (matchingPredictions.length > 0) {
                this.pendingComparisons = matchingPredictions.map(p => p.id);
                this._showComparisonTool();
                notificationService.showNotification(`Found ${matchingPredictions.length} predictions to compare`, 'info');
            } else {
                notificationService.showNotification(`No predictions found matching "${compareText}"`, 'warning');
            }
        }
    }
    
    /**
     * Handle voice show command
     */
    _handleVoiceShow(showText) {
        // Different show commands
        if (showText.includes('history')) {
            // Scroll to history section
            this.container.querySelector('#prediction-history')?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        } else if (showText.includes('dashboard')) {
            // Show personalized dashboard
            this._renderPersonalizedDashboard();
            notificationService.showNotification('Showing your personalized dashboard', 'info');
        } else if (showText.includes('league') || showText.includes('sport')) {
            // Match league name in text
            const leagues = [
                'NBA', 'NFL', 'MLB', 'NHL', 
                'Premier League', 'Serie A', 'Bundesliga', 'La Liga'
            ];
            
            const matchedLeague = leagues.find(league => 
                showText.toLowerCase().includes(league.toLowerCase())
            );
            
            if (matchedLeague) {
                this._changeLeague(matchedLeague);
                notificationService.showNotification(`Showing predictions for ${matchedLeague}`, 'info');
            } else {
                notificationService.showNotification('Please specify a valid league', 'warning');
            }
        } else {
            notificationService.showNotification(`Unsure what to show for "${showText}"`, 'warning');
        }
    }
    
    /**
     * Handle voice export command
     */
    _handleVoiceExport(exportText) {
        // Default to exporting current prediction if available
        if (this.currentPrediction) {
            // Check export format
            if (exportText.includes('pdf')) {
                this._exportPrediction(this.currentPrediction, 'pdf');
            } else if (exportText.includes('csv')) {
                this._exportPrediction(this.currentPrediction, 'csv');
            } else if (exportText.includes('image') || exportText.includes('png')) {
                this._exportPrediction(this.currentPrediction, 'image');
            } else {
                // Default to PDF
                this._exportPrediction(this.currentPrediction, 'pdf');
            }
            
            notificationService.showNotification('Exporting current prediction', 'info');
        } else {
            notificationService.showNotification('No current prediction to export', 'warning');
        }
    }
    
    /**
     * Show voice command help
     */
    _showVoiceCommandHelp() {
        const helpContainer = document.createElement('div');
        helpContainer.className = 'voice-help-overlay';
        helpContainer.innerHTML = `
            <div class="voice-help-modal p-4 bg-white rounded-lg shadow-lg">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="mb-0">Voice Command Help</h4>
                    <button class="close-help-btn btn btn-sm btn-outline-secondary">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="help-content">
                    <p class="text-muted mb-3">Here are some commands you can try:</p>
                    
                    <h6>Prediction Commands</h6>
                    <ul class="mb-3">
                        <li><strong>"Predict Lakers win by 10 points"</strong> - Creates a new prediction</li>
                        <li><strong>"Predict Tom Brady throws 3 touchdowns"</strong> - Creates player-specific prediction</li>
                    </ul>
                    
                    <h6>Comparison Commands</h6>
                    <ul class="mb-3">
                        <li><strong>"Compare last 3 predictions"</strong> - Compares recent predictions</li>
                        <li><strong>"Compare Lakers predictions"</strong> - Compares predictions with "Lakers" in them</li>
                    </ul>
                    
                    <h6>Show Commands</h6>
                    <ul class="mb-3">
                        <li><strong>"Show history"</strong> - Scrolls to prediction history</li>
                        <li><strong>"Show dashboard"</strong> - Displays your personalized dashboard</li>
                        <li><strong>"Show NBA league"</strong> - Filters to NBA predictions</li>
                    </ul>
                    
                    <h6>Export Commands</h6>
                    <ul>
                        <li><strong>"Export as PDF"</strong> - Exports current prediction as PDF</li>
                        <li><strong>"Export as CSV"</strong> - Exports prediction data as CSV</li>
                        <li><strong>"Export as image"</strong> - Exports prediction as shareable image</li>
                    </ul>
                </div>
                
                <div class="text-center mt-3">
                    <button class="try-voice-btn btn btn-primary">
                        <i class="fas fa-microphone"></i> Try Voice Command
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(helpContainer);
        
        // Add event listeners
        helpContainer.querySelector('.close-help-btn').addEventListener('click', () => {
            helpContainer.remove();
        });
        
        helpContainer.querySelector('.try-voice-btn').addEventListener('click', () => {
            helpContainer.remove();
            this._startVoiceRecognition();
        });
    }
    
    /**
     * Update voice recognition UI
     */
    _updateVoiceRecognitionUI(isActive, text = '', isInterim = false) {
        const voiceUI = this.container.querySelector('#voice-recognition-ui');
        
        if (!voiceUI) return;
        
        if (isActive) {
            voiceUI.classList.remove('d-none');
            
            const textDisplay = voiceUI.querySelector('.voice-text');
            if (textDisplay) {
                textDisplay.textContent = text;
                textDisplay.classList.toggle('voice-interim', isInterim);
            }
            
            // Update mic icon
            const micIcon = this.container.querySelector('.voice-control i');
            if (micIcon) {
                micIcon.className = isInterim ? 'fas fa-microphone-alt pulse-animation' : 'fas fa-microphone';
            }
        } else {
            // Hide with slight delay to allow reading
            setTimeout(() => {
                voiceUI.classList.add('d-none');
                
                // Reset mic icon
                const micIcon = this.container.querySelector('.voice-control i');
                if (micIcon) {
                    micIcon.className = 'fas fa-microphone';
                }
            }, text ? 2000 : 0);
        }
    }
    
    /**
     * Start voice recognition
     */
    _startVoiceRecognition() {
        if (!speechRecognitionService.isAvailable()) {
            notificationService.showNotification('Speech recognition is not supported in your browser', 'error');
            return;
        }
        
        if (this.speechRecognitionActive) {
            speechRecognitionService.stop();
            this.speechRecognitionActive = false;
            this._updateVoiceRecognitionUI(false);
            return;
        }
        
        try {
            speechRecognitionService.start();
            this.speechRecognitionActive = true;
            this._updateVoiceRecognitionUI(true, 'Listening...');
            
            // Auto-stop after timeout
            setTimeout(() => {
                if (this.speechRecognitionActive) {
                    speechRecognitionService.stop();
                    this.speechRecognitionActive = false;
                    this._updateVoiceRecognitionUI(false);
                }
            }, 10000);
        } catch (error) {
            Logger.error('Error starting speech recognition:', error);
            notificationService.showNotification('Could not start speech recognition', 'error');
        }
    }
    
    /**
     * Change current league
     */
    _changeLeague(league) {
        const normalizedLeague = league.toLowerCase().replace(/\s+/g, '_');
        this.currentLeague = normalizedLeague;
        
        // Update league selector UI
        const leagueSelector = this.container.querySelector('#league-selector');
        if (leagueSelector) {
            const leagueButtons = leagueSelector.querySelectorAll('.league-button');
            leagueButtons.forEach(button => {
                const buttonLeague = button.getAttribute('data-league');
                button.classList.toggle('active', buttonLeague === normalizedLeague);
            });
        }
        
        // Filter prediction history display
        this._updatePredictionHistory();
        
        // Update league context in prediction inputs
        this._updateLeagueContext(normalizedLeague);
        
        // Trigger event
        eventBus.publish('league:changed', normalizedLeague);
        
        // Track analytics
        analyticsService.trackEvent('predictions', 'league_changed', {
            league: normalizedLeague
        });
    }
    
    /**
     * Update league context in prediction inputs
     */
    _updateLeagueContext(league) {
        // Update placeholder text
        const singleFactorInput = this.container.querySelector('#single-factor-input');
        if (singleFactorInput) {
            const placeholders = {
                nba: 'Example: LeBron James scores more than 25 points',
                nfl: 'Example: Chiefs win by at least 7 points',
                mlb: 'Example: Yankees get more than 8 hits',
                nhl: 'Example: Oilers score in the first period',
                premier_league: 'Example: Manchester City wins with a clean sheet',
                serie_a: 'Example: Juventus scores in both halves',
                bundesliga: 'Example: Bayern Munich wins by 2+ goals',
                la_liga: 'Example: Barcelona scores 3 or more goals'
            };
            
            singleFactorInput.placeholder = placeholders[league] || 'Enter prediction factor';
        }
        
        // Update visualization context (team colors, etc)
        this._refreshVisualizationsForLeague(league);
        
        // Load league-specific players and teams for autocomplete
        this._loadLeagueSpecificData(league);
    }
    
    /**
     * Refresh visualizations for the current league
     */
    _refreshVisualizationsForLeague(league) {
        // Get league colors
        const leagueColors = LEAGUE_COLORS[league] || LEAGUE_COLORS.default;
        
        // Update CSS variables for league theming
        document.documentElement.style.setProperty('--league-primary', leagueColors.primary);
        document.documentElement.style.setProperty('--league-secondary', leagueColors.secondary);
        document.documentElement.style.setProperty('--league-accent', leagueColors.accent);
        
        // Re-render current prediction if exists
        if (this.currentPrediction) {
            this._displayPredictionResults(
                this.currentPrediction, 
                this.currentPrediction.type === 'multi'
            );
        }
    }
    
    /**
     * Load league-specific data for autocomplete
     */
    async _loadLeagueSpecificData(league) {
        try {
            if (this.offlineMode) {
                // Use cached data in offline mode
                return;
            }
            
            const response = await leagueDataService.getLeagueData(league);
            
            // Set up autocomplete for player names and teams
            if (response.players && response.teams) {
                this._setupAutocomplete(response.players, response.teams);
            }
        } catch (error) {
            Logger.error('Error loading league data:', error);
        }
    }
    
    /**
     * Setup autocomplete for prediction inputs
     */
    _setupAutocomplete(players, teams) {
        const inputs = [
            ...this.container.querySelectorAll('textarea'),
            ...this.container.querySelectorAll('input[type="text"]')
        ];
        
        inputs.forEach(input => {
            // If autocomplete already initialized, destroy it
            if (input.autocomplete) {
                input.autocomplete.destroy();
            }
            
            // Create new autocomplete
            input.autocomplete = new Autocomplete(input, {
                data: {
                    src: [...players.map(p => p.name), ...teams],
                    keys: ['value'],
                    cache: true
                },
                threshold: 3,
                debounce: 300,
                maxResults: 8,
                onSelection: (feedback) => {
                    const value = feedback.selection.value;
                    
                    // Insert at cursor position
                    const cursorPos = input.selectionStart;
                    const textBefore = input.value.substring(0, cursorPos);
                    const textAfter = input.value.substring(cursorPos);
                    
                    // Find the word being typed
                    const wordBefore = textBefore.match(/\S*$/)[0];
                    const textBeforeWithoutWord = textBefore.substring(0, textBefore.length - wordBefore.length);
                    
                    input.value = textBeforeWithoutWord + value + textAfter;
                    
                    // Set cursor position after the inserted value
                    const newCursorPos = textBeforeWithoutWord.length + value.length;
                    input.selectionStart = newCursorPos;
                    input.selectionEnd = newCursorPos;
                    
                    input.focus();
                }
            });
        });
    }
    
    /**
     * Fetch league data
     */
    async _fetchLeagueData() {
        try {
            if (this.offlineMode) {
                // Skip in offline mode
                return;
            }
            
            // Fetch data for all leagues
            const leaguePromises = [
                'nba', 'nfl', 'mlb', 'nhl', 
                'premier_league', 'serie_a', 'bundesliga', 'la_liga'
            ].map(league => leagueDataService.getLeagueData(league));
            
            const leagueData = await Promise.all(leaguePromises);
            
            // Cache the data for offline use
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['userPreferences'], 'readwrite');
            const store = transaction.objectStore('userPreferences');
            
            await store.put({
                id: 'leagueData',
                data: leagueData,
                timestamp: Date.now()
            });
            
            Logger.info('League data fetched and cached successfully');
        } catch (error) {
            Logger.error('Error fetching league data:', error);
        }
    }
    
    /**
     * Load prediction history from server or local cache
     */
    async _loadPredictionHistory() {
        try {
            if (this.offlineMode) {
                // Load from IndexedDB in offline mode
                this.predictionHistory = await this._loadFromIndexedDB(20);
                this._updatePredictionHistory();
                return;
            }
            
            // Load from server
            const response = await apiClient.get('/api/predictions/history', {
                params: {
                    limit: 20,
                    include_details: true
                },
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                }
            });
            
            if (response.status === 'success') {
                this.predictionHistory = response.data.predictions || [];
                
                // Cache in IndexedDB for offline access
                for (const prediction of this.predictionHistory) {
                    await this._saveToIndexedDB(prediction);
                }
                
                this._updatePredictionHistory();
            }
        } catch (error) {
            Logger.error('Error loading prediction history:', error);
            
            // Try to load from local cache as fallback
            this.predictionHistory = await this._loadFromIndexedDB(20);
            this._updatePredictionHistory();
        }
    }
    
    /**
     * Render the enhanced UI with advanced features
     */
    _renderEnhancedUI() {
        this.container.innerHTML = `
            <div class="custom-predictions">
                <!-- Main prediction card -->
                <div class="card border-0 shadow-sm rounded-lg bg-gradient-to-b from-indigo-900 to-blue-900 text-white">
                    <!-- Header with status indicators -->
                    <div class="card-header bg-transparent border-0 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <h3 class="card-title mb-0">Ultra Premium Predictions</h3>
                            <div class="ultra-premium-badge ms-2 px-2 py-1 bg-yellow-600 rounded-pill text-xs font-weight-bold">ULTRA</div>
                            
                            <!-- Live indicator (shows when games are in progress) -->
                            <div id="live-indicator" class="ms-2 d-none d-flex align-items-center">
                                <span class="live-dot me-1"></span>
                                <span class="text-xs">LIVE</span>
                            </div>
                        </div>
                        
                        <!-- Voice control -->
                        <div class="d-flex align-items-center">
                            <button class="voice-control btn btn-sm btn-outline-light me-2" aria-label="Voice command">
                                <i class="fas fa-microphone"></i>
                            </button>
                            
                            <!-- Dashboard button -->
                            <button class="dashboard-btn btn btn-sm btn-outline-light me-2" aria-label="Dashboard">
                                <i class="fas fa-chart-line"></i>
                            </button>
                            
                            <!-- Settings button -->
                            <button class="settings-btn btn btn-sm btn-outline-light" aria-label="Settings">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Voice recognition UI (hidden by default) -->
                    <div id="voice-recognition-ui" class="voice-recognition-ui d-none">
                        <div class="p-2 mb-3 bg-blue-800 rounded d-flex align-items-center">
                            <i class="fas fa-microphone-alt me-2 pulse-animation"></i>
                            <div class="voice-text">Listening...</div>
                        </div>
                    </div>
                    
                    <!-- League selector -->
                    <div class="card-body pt-0 pb-2">
                        <div id="league-selector" class="league-selector d-flex overflow-auto hide-scrollbar py-2">
                            <button class="league-button active me-2 btn btn-sm rounded-pill" data-league="all">
                                <span>All Leagues</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="nba">
                                <img src="/images/leagues/nba.png" alt="NBA" width="16" height="16" class="me-1">
                                <span>NBA</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="nfl">
                                <img src="/images/leagues/nfl.png" alt="NFL" width="16" height="16" class="me-1">
                                <span>NFL</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="mlb">
                                <img src="/images/leagues/mlb.png" alt="MLB" width="16" height="16" class="me-1">
                                <span>MLB</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="nhl">
                                <img src="/images/leagues/nhl.png" alt="NHL" width="16" height="16" class="me-1">
                                <span>NHL</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="premier_league">
                                <img src="/images/leagues/premier-league.png" alt="Premier League" width="16" height="16" class="me-1">
                                <span>Premier League</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="serie_a">
                                <img src="/images/leagues/serie-a.png" alt="Serie A" width="16" height="16" class="me-1">
                                <span>Serie A</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="bundesliga">
                                <img src="/images/leagues/bundesliga.png" alt="Bundesliga" width="16" height="16" class="me-1">
                                <span>Bundesliga</span>
                            </button>
                            
                            <button class="league-button me-2 btn btn-sm rounded-pill" data-league="la_liga">
                                <img src="/images/leagues/la-liga.png" alt="La Liga" width="16" height="16" class="me-1">
                                <span>La Liga</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Live games container (shown when games are in progress) -->
                    <div id="live-games-container" class="live-games-container px-3 pb-2 d-none">
                        <!-- Live game pills will be added here -->
                    </div>
                    
                    <div class="card-body">
                        <!-- Tabs for different prediction types -->
                        <div class="tabs mb-4">
                            <div class="tab-buttons d-flex">
                                <button class="tab-button active flex-grow-1 py-2 px-3 bg-transparent border-0 text-white opacity-80 hover:opacity-100" data-tab="single-factor">
                                    Single Factor
                                </button>
                                <button class="tab-button flex-grow-1 py-2 px-3 bg-transparent border-0 text-white opacity-80 hover:opacity-100" data-tab="multi-factor">
                                    Multi Factor
                                </button>
                                <button class="tab-button flex-grow-1 py-2 px-3 bg-transparent border-0 text-white opacity-80 hover:opacity-100" data-tab="comparison">
                                    Comparison
                                </button>
                            </div>
                            
                            <div class="tab-content mt-3">
                                <!-- Single factor tab -->
                                <div class="tab-pane active" id="single-factor-tab">
                                    <p class="text-sm text-blue-200 mb-3">
                                        Enter any sports prediction factor and our AI will calculate the probability.
                                    </p>
                                    <div class="mb-3">
                                        <textarea id="single-factor-input" class="form-control bg-blue-800 border-blue-700 text-white" 
                                            placeholder="Example: LeBron James scores more than 25 points" rows="3"></textarea>
                                    </div>
                                    
                                    <!-- Advanced options (collapsible) -->
                                    <div class="advanced-options mb-3">
                                        <button class="btn btn-link text-blue-200 p-0 text-decoration-none text-sm" type="button" data-bs-toggle="collapse" data-bs-target="#advancedSingleOptions">
                                            <i class="fas fa-cog me-1"></i> Advanced Options
                                        </button>
                                        
                                        <div class="collapse mt-2" id="advancedSingleOptions">
                                            <div class="p-3 bg-blue-800 rounded border border-blue-700">
                                                <div class="form-check mb-2">
                                                    <input class="form-check-input" type="checkbox" id="include-supporting-data" checked>
                                                    <label class="form-check-label text-sm" for="include-supporting-data">
                                                        Include supporting data
                                                    </label>
                                                </div>
                                                
                                                <div class="form-check mb-2">
                                                    <input class="form-check-input" type="checkbox" id="include-detailed-analysis" checked>
                                                    <label class="form-check-label text-sm" for="include-detailed-analysis">
                                                        Generate detailed analysis
                                                    </label>
                                                </div>
                                                
                                                <div class="form-group mb-0">
                                                    <label class="form-label text-sm">Confidence threshold</label>
                                                    <input type="range" class="form-range" min="0" max="100" value="70" id="confidence-threshold">
                                                    <div class="d-flex justify-content-between">
                                                        <span class="text-xs">Lower (more results)</span>
                                                        <span class="text-xs">Higher (better quality)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button id="single-predict-button" class="btn btn-primary btn-lg w-100">
                                        Generate Prediction
                                    </button>
                                </div>
                                
                                <!-- Multi factor tab -->
                                <div class="tab-pane" id="multi-factor-tab">
                                    <p class="text-sm text-blue-200 mb-3">
                                        Combine up to 7 factors for a comprehensive prediction probability.
                                    </p>
                                    <div id="multi-factor-inputs" class="mb-3">
                                        <div class="factor-input mb-2">
                                            <textarea class="form-control bg-blue-800 border-blue-700 text-white" 
                                                placeholder="Factor 1: Lakers win the game" rows="2"></textarea>
                                        </div>
                                        <div class="factor-input mb-2">
                                            <textarea class="form-control bg-blue-800 border-blue-700 text-white" 
                                                placeholder="Factor 2: LeBron James scores over 25 points" rows="2"></textarea>
                                        </div>
                                    </div>
                                    
                                    <div class="mb-3 d-flex justify-content-between">
                                        <button id="add-factor-button" class="btn btn-sm btn-outline-light">
                                            <i class="fas fa-plus"></i> Add Factor
                                        </button>
                                        <span class="text-sm text-blue-200">
                                            <span id="factor-count">2</span>/<span id="max-factors">${this.maxFactors}</span> factors
                                        </span>
                                    </div>
                                    
                                    <!-- Multi-factor correlation options -->
                                    <div class="correlation-options mb-3">
                                        <div class="form-group">
                                            <label class="text-sm text-blue-200 mb-1">Correlation Handling</label>
                                            <select class="form-select form-select-sm bg-blue-800 border-blue-700 text-white" id="correlation-method">
                                                <option value="auto">Auto-detect correlations</option>
                                                <option value="independent">Treat as independent</option>
                                                <option value="strong_positive">Strong positive correlation</option>
                                                <option value="moderate_positive">Moderate positive correlation</option>
                                                <option value="negative">Negative correlation</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <button id="multi-predict-button" class="btn btn-primary btn-lg w-100">
                                        Generate Multi-Factor Prediction
                                    </button>
                                </div>
                                
                                <!-- Comparison tool tab -->
                                <div class="tab-pane" id="comparison-tab">
                                    <p class="text-sm text-blue-200 mb-3">
                                        Compare multiple predictions to identify patterns and insights.
                                    </p>
                                    
                                    <div class="mb-3" id="comparison-selection">
                                        <label class="text-sm text-blue-200 mb-2">Select predictions to compare</label>
                                        <div class="comparison-items" id="comparison-items">
                                            <p class="text-center text-sm text-blue-200 py-3">
                                                <i class="fas fa-info-circle me-1"></i> No predictions selected for comparison.
                                                <br>Add predictions from your history or results.
                                            </p>
                                        </div>
                                        
                                        <div class="mt-3 d-flex justify-content-between">
                                            <button id="clear-comparisons-button" class="btn btn-sm btn-outline-light" disabled>
                                                <i class="fas fa-trash-alt"></i> Clear All
                                            </button>
                                            <button id="add-from-history-button" class="btn btn-sm btn-outline-light">
                                                <i class="fas fa-history"></i> Add from History
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div class="visualization-options mb-3">
                                        <label class="text-sm text-blue-200 mb-2">Visualization Type</label>
                                        <div class="btn-group w-100" role="group">
                                            <button type="button" class="btn btn-outline-light active" data-viz="bar">Bar Chart</button>
                                            <button type="button" class="btn btn-outline-light" data-viz="radar">Radar Chart</button>
                                            <button type="button" class="btn btn-outline-light" data-viz="probability">Probability Distribution</button>
                                        </div>
                                    </div>
                                    
                                    <button id="generate-comparison-button" class="btn btn-primary btn-lg w-100" disabled>
                                        Generate Comparison Analysis
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Prediction results container -->
                        <div id="prediction-results" class="prediction-results mt-4 d-none">
                            <!-- Prediction results will be displayed here -->
                        </div>
                        
                        <!-- Prediction visualization container -->
                        <div id="prediction-visualization" class="prediction-visualization mt-3 d-none">
                            <!-- D3 visualizations will be rendered here -->
                        </div>
                        
                        <!-- Comparison results container -->
                        <div id="comparison-results" class="comparison-results mt-4 d-none">
                            <!-- Comparison results will be displayed here -->
                        </div>
                        
                        <!-- Error message container -->
                        <div id="prediction-error" class="prediction-error mt-4 d-none">
                            <!-- Error messages will be displayed here -->
                        </div>
                        
                        <!-- Loading indicator -->
                        <div id="prediction-loading" class="prediction-loading mt-4 d-none">
                            <div class="d-flex justify-content-center">
                                <div class="spinner-border text-light" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </div>
                            <p class="text-center text-sm text-blue-200 mt-2">
                                Analyzing data and generating prediction...
                            </p>
                        </div>
                        
                        <!-- Export and share options -->
                        <div id="export-options" class="export-options mt-3 d-none">
                            <div class="d-flex justify-content-center">
                                <button class="btn btn-sm btn-outline-light me-2 export-pdf-btn">
                                    <i class="fas fa-file-pdf"></i> PDF
                                </button>
                                <button class="btn btn-sm btn-outline-light me-2 export-csv-btn">
                                    <i class="fas fa-file-csv"></i> CSV
                                </button>
                                <button class="btn btn-sm btn-outline-light me-2 export-image-btn">
                                    <i class="fas fa-image"></i> Image
                                </button>
                                <button class="btn btn-sm btn-outline-light share-btn">
                                    <i class="fas fa-share-alt"></i> Share
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Personalized dashboard (hidden by default) -->
                <div id="personalized-dashboard" class="mt-4 mb-4 d-none">
                    <div class="card border-0 shadow-sm rounded-lg">
                        <div class="card-header bg-white border-0">
                            <div class="d-flex justify-content-between align-items-center">
                                <h4 class="mb-0">Your Prediction Dashboard</h4>
                                <button class="btn btn-sm btn-outline-secondary close-dashboard-btn">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="dashboard-content">
                                <!-- Dashboard content will be loaded here -->
                                <div class="text-center py-5">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                    <p class="mt-3">Loading your personalized dashboard...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Prediction history section -->
                <div class="mt-4 mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4 class="mb-0 text-gray-700">Recent Predictions</h4>
                        
                        <!-- History filter options -->
                        <div class="btn-group">
                            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                <i class="fas fa-filter me-1"></i> Filter
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item active" href="#" data-filter="all">All Predictions</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" href="#" data-filter="single">Single Factor Only</a></li>
                                <li><a class="dropdown-item" href="#" data-filter="multi">Multi-Factor Only</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" href="#" data-filter="resolved">Resolved Only</a></li>
                                <li><a class="dropdown-item" href="#" data-filter="unresolved">Unresolved Only</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <!-- History visualization summary (mini chart) -->
                    <div id="history-viz" class="history-viz mb-3">
                        <!-- Mini performance chart will be rendered here -->
                    </div>
                    
                    <div id="prediction-history" class="prediction-history">
                        <p class="text-gray-500 text-sm">No recent predictions yet</p>
                    </div>
                </div>
            </div>
            
            <!-- Modals -->
            <!-- Settings Modal -->
            <div class="modal fade" id="settingsModal" tabindex="-1" aria-labelledby="settingsModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="settingsModalLabel">Prediction Settings</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="settings-container">
                                <h6>Display Preferences</h6>
                                <div class="mb-3">
                                    <label class="form-label">Visualization Detail Level</label>
                                    <select class="form-select" id="visualization-detail">
                                        <option value="standard">Standard</option>
                                        <option value="detailed">Detailed</option>
                                        <option value="simplified">Simplified</option>
                                    </select>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Theme</label>
                                    <select class="form-select" id="theme-preference">
                                        <option value="auto">Auto (System Default)</option>
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </div>
                                
                                <h6 class="mt-4">Prediction Preferences</h6>
                                <div class="mb-3">
                                    <label class="form-label">Default League</label>
                                    <select class="form-select" id="default-league">
                                        <option value="all">All Leagues</option>
                                        <option value="nba">NBA</option>
                                        <option value="nfl">NFL</option>
                                        <option value="mlb">MLB</option>
                                        <option value="nhl">NHL</option>
                                        <option value="premier_league">Premier League</option>
                                        <option value="serie_a">Serie A</option>
                                        <option value="bundesliga">Bundesliga</option>
                                        <option value="la_liga">La Liga</option>
                                    </select>
                                </div>
                                
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="live-updates-enabled" checked>
                                    <label class="form-check-label" for="live-updates-enabled">Enable live updates</label>
                                </div>
                                
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="notifications-enabled" checked>
                                    <label class="form-check-label" for="notifications-enabled">Enable notifications</label>
                                </div>
                                
                                <h6 class="mt-4">Accessibility</h6>
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="high-contrast-mode">
                                    <label class="form-check-label" for="high-contrast-mode">High contrast mode</label>
                                </div>
                                
                                <div class="mb-3 form-check">
                                    <input type="checkbox" class="form-check-input" id="larger-text">
                                    <label class="form-check-label" for="larger-text">Larger text</label>
                                </div>
                                
                                <h6 class="mt-4">Data Management</h6>
                                <div class="mt-2">
                                    <button class="btn btn-outline-danger btn-sm" id="clear-prediction-data">
                                        Clear Prediction Data
                                    </button>
                                    <button class="btn btn-outline-secondary btn-sm ms-2" id="export-all-predictions">
                                        Export All Predictions
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="save-settings">Save Settings</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Comparison Selection Modal -->
            <div class="modal fade" id="comparisonSelectionModal" tabindex="-1" aria-labelledby="comparisonSelectionModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="comparisonSelectionModalLabel">Select Predictions to Compare</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col">
                                    <input type="text" class="form-control" id="comparison-search" placeholder="Search predictions...">
                                </div>
                                <div class="col-auto">
                                    <select class="form-select" id="comparison-filter">
                                        <option value="all">All Types</option>
                                        <option value="single">Single Factor</option>
                                        <option value="multi">Multi-Factor</option>
                                        <option value="resolved">Resolved Only</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="comparison-predictions-container">
                                <!-- Prediction checkboxes will be rendered here -->
                                <div class="text-center py-4 text-muted">
                                    <i class="fas fa-spinner fa-spin"></i>
                                    <p class="mt-2">Loading predictions...</p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="add-to-comparison">Add Selected</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Share Modal -->
            <div class="modal fade" id="shareModal" tabindex="-1" aria-labelledby="shareModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="shareModalLabel">Share Prediction</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="share-preview mb-3">
                                <!-- Share preview will be rendered here -->
                            </div>
                            
                            <div class="form-group mb-3">
                                <label class="form-label">Share Link</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" id="share-link" readonly>
                                    <button class="btn btn-outline-secondary" type="button" id="copy-link">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="share-options">
                                <label class="form-label">Share to</label>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-outline-primary" id="share-twitter">
                                        <i class="fab fa-twitter"></i> Twitter
                                    </button>
                                    <button class="btn btn-outline-primary" id="share-facebook">
                                        <i class="fab fa-facebook"></i> Facebook
                                    </button>
                                    <button class="btn btn-outline-success" id="share-whatsapp">
                                        <i class="fab fa-whatsapp"></i> WhatsApp
                                    </button>
                                    <button class="btn btn-outline-secondary" id="share-email">
                                        <i class="fas fa-envelope"></i> Email
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Check if should render offline mode UI
        if (this.offlineMode) {
            this._updateOfflineUI();
        }
    }
    
    /**
     * Render error state
     */
    _renderErrorState(error) {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="alert alert-danger">
                <h4 class="alert-heading">Error Loading Enhanced Predictions</h4>
                <p>${error.message || 'An unknown error occurred'}</p>
                <div class="mt-3">
                    <button id="retry-custom-predictions" class="btn btn-danger me-2">Retry</button>
                    <button id="offline-mode-button" class="btn btn-outline-secondary">Try Offline Mode</button>
                </div>
            </div>
        `;
        
        document.getElementById('retry-custom-predictions')?.addEventListener('click', () => {
            this.initialize(this.container.id);
        });
        
        document.getElementById('offline-mode-button')?.addEventListener('click', () => {
            this.offlineMode = true;
            this.initialize(this.container.id);
        });
    }
    
    /**
     * Render upgrade prompt for non-premium users
     */
    _renderUpgradePrompt() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="card border-0 shadow-sm rounded-lg">
                <div class="card-body text-center py-5">
                    <i class="fas fa-crown text-yellow-500 fa-3x mb-3"></i>
                    <h3 class="card-title">Ultra Premium Feature</h3>
                    <p class="card-text text-muted mb-4">
                        Enhanced predictions with real-time updates, voice control, and advanced analytics
                        are available exclusively for Ultra Premium members.
                    </p>
                    <div class="premium-features mb-4">
                        <div class="row g-3">
                            <div class="col-md-4">
                                <div class="feature-card p-3 border rounded text-start">
                                    <i class="fas fa-bolt text-primary mb-2"></i>
                                    <h6>Real-time Updates</h6>
                                    <p class="text-sm text-muted mb-0">Live odds changes and game updates</p>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="feature-card p-3 border rounded text-start">
                                    <i class="fas fa-microphone text-primary mb-2"></i>
                                    <h6>Voice Control</h6>
                                    <p class="text-sm text-muted mb-0">Natural language prediction queries</p>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="feature-card p-3 border rounded text-start">
                                    <i class="fas fa-chart-line text-primary mb-2"></i>
                                    <h6>Advanced Analytics</h6>
                                    <p class="text-sm text-muted mb-0">ML-powered prediction insights</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button id="upgrade-to-premium" class="btn btn-primary btn-lg px-5">
                        Upgrade to Ultra Premium
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('upgrade-to-premium')?.addEventListener('click', () => {
            window.location.href = '/pricing?plan=ultra&ref=predictions';
        });
    }
    
    /**
     * Set up event listeners
     */
    _setupEventListeners() {
        // Tab switching
        const tabButtons = this.container.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                const tabPanes = this.container.querySelectorAll('.tab-pane');
                tabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active class to clicked button and corresponding pane
                button.classList.add('active');
                const tabName = button.getAttribute('data-tab');
                document.getElementById(`${tabName}-tab`)?.classList.add('active');
                
                // Track tab change
                analyticsService.trackEvent('predictions', 'tab_change', {
                    tab: tabName
                });
            });
        });
        
        // League selector buttons
        const leagueButtons = this.container.querySelectorAll('.league-button');
        leagueButtons.forEach(button => {
            button.addEventListener('click', () => {
                const league = button.getAttribute('data-league');
                this._changeLeague(league);
            });
        });
        
        // Voice control button
        this.container.querySelector('.voice-control')?.addEventListener('click', () => {
            this._startVoiceRecognition();
        });
        
        // Dashboard button
        this.container.querySelector('.dashboard-btn')?.addEventListener('click', () => {
            this._togglePersonalizedDashboard();
        });
        
        // Settings button
        this.container.querySelector('.settings-btn')?.addEventListener('click', () => {
            this._showSettingsModal();
        });
        
        // Single factor prediction button
        this.container.querySelector('#single-predict-button')?.addEventListener('click', () => {
            this._handleSingleFactorPrediction();
        });
        
        // Multi factor prediction button
        this.container.querySelector('#multi-predict-button')?.addEventListener('click', () => {
            this._handleMultiFactorPrediction();
        });
        
        // Add factor button
        this.container.querySelector('#add-factor-button')?.addEventListener('click', () => {
            this._addFactorInput();
        });
        
        // Comparison related buttons
        this.container.querySelector('#add-from-history-button')?.addEventListener('click', () => {
            this._showComparisonSelectionModal();
        });
        
        this.container.querySelector('#clear-comparisons-button')?.addEventListener('click', () => {
            this._clearPendingComparisons();
        });
        
        this.container.querySelector('#generate-comparison-button')?.addEventListener('click', () => {
            this._generateComparisonAnalysis();
        });
        
        // Settings modal save button
        document.getElementById('save-settings')?.addEventListener('click', () => {
            this._saveUserSettings();
        });
        
        // Add to comparison button in modal
        document.getElementById('add-to-comparison')?.addEventListener('click', () => {
            this._addSelectedToComparison();
        });
        
        // Export buttons
        this.container.querySelector('.export-pdf-btn')?.addEventListener('click', () => {
            this._exportPrediction(this.currentPrediction, 'pdf');
        });
        
        this.container.querySelector('.export-csv-btn')?.addEventListener('click', () => {
            this._exportPrediction(this.currentPrediction, 'csv');
        });
        
        this.container.querySelector('.export-image-btn')?.addEventListener('click', () => {
            this._exportPrediction(this.currentPrediction, 'image');
        });
        
        // Share button
        this.container.querySelector('.share-btn')?.addEventListener('click', () => {
            this._sharePrediction(this.currentPrediction);
        });
        
        // Close dashboard button
        this.container.querySelector('.close-dashboard-btn')?.addEventListener('click', () => {
            this._togglePersonalizedDashboard();
        });
        
        // Visualization selector buttons
        const vizButtons = this.container.querySelectorAll('[data-viz]');
        vizButtons.forEach(button => {
            button.addEventListener('click', () => {
                vizButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                const vizType = button.getAttribute('data-viz');
                this.visualizationMode = vizType;
                
                // Update visualization if comparison items exist
                if (this.pendingComparisons.length > 0) {
                    this._updateComparisonVisualization(vizType);
                }
            });
        });
        
        // History filter dropdown
        const historyFilters = this.container.querySelectorAll('[data-filter]');
        historyFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Update active state
                historyFilters.forEach(f => f.classList.remove('active'));
                filter.classList.add('active');
                
                // Apply filter
                const filterType = filter.getAttribute('data-filter');
                this._filterPredictionHistory(filterType);
            });
        });
        
        // Copy share link button
        document.getElementById('copy-link')?.addEventListener('click', () => {
            const linkInput = document.getElementById('share-link');
            if (linkInput) {
                linkInput.select();
                document.execCommand('copy');
                notificationService.showNotification('Link copied to clipboard', 'success');
            }
        });
        
        // Social sharing buttons
        document.getElementById('share-twitter')?.addEventListener('click', () => {
            this._shareToSocialMedia('twitter');
        });
        
        document.getElementById('share-facebook')?.addEventListener('click', () => {
            this._shareToSocialMedia('facebook');
        });
        
        document.getElementById('share-whatsapp')?.addEventListener('click', () => {
            this._shareToSocialMedia('whatsapp');
        });
        
        document.getElementById('share-email')?.addEventListener('click', () => {
            this._shareToSocialMedia('email');
        });
        
        // Data management buttons
        document.getElementById('clear-prediction-data')?.addEventListener('click', () => {
            this._clearAllPredictionData();
        });
        
        document.getElementById('export-all-predictions')?.addEventListener('click', () => {
            this._exportAllPredictions();
        });
        
        // Initialize factor inputs
        this._initializeFactorInputs();
        
        // Setup keyboard shortcuts
        this._setupKeyboardShortcuts();
    }
    
    /**
     * Setup keyboard shortcuts
     */
    _setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts if predictions module is initialized
            if (!this.isInitialized) return;
            
            // Check for modifier key (Ctrl/Cmd)
            const isModifierPressed = event.ctrlKey || event.metaKey;
            
            // Ctrl/Cmd + Shift + P = Generate Prediction 
            if (isModifierPressed && event.shiftKey && event.key === 'P') {
                event.preventDefault();
                
                // Check which tab is active
                const activeTab = this.container.querySelector('.tab-button.active');
                if (activeTab) {
                    const tabName = activeTab.getAttribute('data-tab');
                    
                    if (tabName === 'single-factor') {
                        this._handleSingleFactorPrediction();
                    } else if (tabName === 'multi-factor') {
                        this._handleMultiFactorPrediction();
                    } else if (tabName === 'comparison') {
                        this._generateComparisonAnalysis();
                    }
                }
            }
            
            // Ctrl/Cmd + Shift + V = Voice Input
            if (isModifierPressed && event.shiftKey && event.key === 'V') {
                event.preventDefault();
                this._startVoiceRecognition();
            }
            
            // Ctrl/Cmd + Shift + D = Dashboard
            if (isModifierPressed && event.shiftKey && event.key === 'D') {
                event.preventDefault();
                this._togglePersonalizedDashboard();
            }
            
            // Ctrl/Cmd + Shift + S = Settings
            if (isModifierPressed && event.shiftKey && event.key === 'S') {
                event.preventDefault();
                this._showSettingsModal();
            }
        });
    }
    
    /**
     * Initialize factor inputs
     */
    _initializeFactorInputs() {
        const inputs = this.container.querySelectorAll('#multi-factor-inputs .factor-input textarea');
        this.factorInputs = Array.from(inputs);
        this._updateFactorCount();
    }
    
    /**
     * Handle adding a new factor input
     */
    _addFactorInput() {
        if (this.factorInputs.length >= this.maxFactors) {
            notificationService.showNotification(`Maximum of ${this.maxFactors} factors allowed`, 'warning');
            return;
        }
        
        const factorInputs = this.container.querySelector('#multi-factor-inputs');
        const newInput = document.createElement('div');
        newInput.className = 'factor-input mb-2';
        newInput.innerHTML = `
            <div class="d-flex">
                <textarea class="form-control bg-blue-800 border-blue-700 text-white" 
                    placeholder="Factor ${this.factorInputs.length + 1}: Enter prediction factor" rows="2"></textarea>
                <button class="remove-factor-btn btn btn-sm btn-outline-danger ms-2">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        factorInputs.appendChild(newInput);
        
        // Add event listener to remove button
        const removeButton = newInput.querySelector('.remove-factor-btn');
        removeButton.addEventListener('click', () => {
            newInput.remove();
            this._initializeFactorInputs();
        });
        
        // Update factor inputs array
        this._initializeFactorInputs();
        
        // Track event
        analyticsService.trackEvent('predictions', 'factor_added', {
            factor_count: this.factorInputs.length
        });
    }
    
    /**
     * Update factor count display
     */
    _updateFactorCount() {
        const factorCount = this.container.querySelector('#factor-count');
        if (factorCount) {
            factorCount.textContent = this.factorInputs.length;
        }
        
        // Update UI state based on factor count
        const addFactorButton = this.container.querySelector('#add-factor-button');
        if (addFactorButton) {
            addFactorButton.disabled = this.factorInputs.length >= this.maxFactors;
        }
    }
    
    /**
     * Handle single factor prediction
     */
    async _handleSingleFactorPrediction() {
        try {
            const factorInput = this.container.querySelector('#single-factor-input');
            const factorText = factorInput.value.trim();
            
            if (!factorText) {
                notificationService.showNotification('Please enter a prediction factor', 'warning');
                return;
            }
            
            // Get advanced options
            const includeSupportingData = this.container.querySelector('#include-supporting-data')?.checked ?? true;
            const includeDetailedAnalysis = this.container.querySelector('#include-detailed-analysis')?.checked ?? true;
            const confidenceThreshold = this.container.querySelector('#confidence-threshold')?.value ?? 70;
            
            // Show loading state
            this._setLoadingState(true);
            
            // Track prediction request
            analyticsService.trackEvent('predictions', 'single_factor_prediction_requested', {
                factor_length: factorText.length,
                league: this.currentLeague
            });
            
            // Make prediction request
            let result;
            if (this.offlineMode) {
                // Use local prediction engine in offline mode
                result = await predictionEngine.predictSingleFactor(
                    factorText, 
                    includeSupportingData, 
                    includeDetailedAnalysis,
                    confidenceThreshold / 100
                );
            } else {
                // Use API in online mode
                result = await this._predictSingleFactor(
                    factorText, 
                    includeSupportingData, 
                    includeDetailedAnalysis,
                    confidenceThreshold / 100
                );
            }
            
            // Generate unique ID for this prediction
            result.id = `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            
            // Add league info to result
            result.league = this.currentLeague;
            
            // Display results
            this._displayPredictionResults(result);
            
            // Show visualization
            this._renderPredictionVisualization(result);
            
            // Show export options
            this._showExportOptions();
            
            // Add to history
            this._addToPredictionHistory({
                id: result.id,
                type: 'single',
                factor: factorText,
                result: result,
                timestamp: Date.now(),
                league: this.currentLeague
            });
            
            // Track successful prediction
            analyticsService.trackEvent('predictions', 'single_factor_prediction_completed', {
                probability: result.probability,
                confidence: result.confidence,
                league: this.currentLeague
            });
            
        } catch (error) {
            Logger.error('Error making single factor prediction:', error);
            this._showPredictionError(error);
            
            // Track error
            analyticsService.trackEvent('predictions', 'prediction_error', {
                error_type: error.name,
                error_message: error.message
            });
        } finally {
            this._setLoadingState(false);
        }
    }
    
    /**
     * Handle multi-factor prediction
     */
    async _handleMultiFactorPrediction() {
        try {
            // Get factor inputs
            const factorTexts = this.factorInputs.map(input => input.value.trim()).filter(text => text);
            
            if (factorTexts.length === 0) {
                notificationService.showNotification('Please enter at least one prediction factor', 'warning');
                return;
            }
            
            // Get correlation method
            const correlationMethod = this.container.querySelector('#correlation-method')?.value || 'auto';
            
            // Show loading state
            this._setLoadingState(true);
            
            // Track prediction request
            analyticsService.trackEvent('predictions', 'multi_factor_prediction_requested', {
                factor_count: factorTexts.length,
                correlation_method: correlationMethod,
                league: this.currentLeague
            });
            
            // Make prediction request
            let result;
            if (this.offlineMode) {
                // Use local prediction engine in offline mode
                result = await predictionEngine.predictMultiFactors(
                    factorTexts,
                    this.maxFactors,
                    true, // include_analysis
                    correlationMethod
                );
            } else {
                // Use API in online mode
                result = await this._predictMultiFactors(
                    factorTexts,
                    correlationMethod
                );
            }
            
            // Generate unique ID for this prediction
            result.id = `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            
            // Add league info to result
            result.league = this.currentLeague;
            
            // Display results
            this._displayPredictionResults(result, true);
            
            // Show visualization
            this._renderPredictionVisualization(result, true);
            
            // Show export options
            this._showExportOptions();
            
            // Add to history
            this._addToPredictionHistory({
                id: result.id,
                type: 'multi',
                factors: factorTexts,
                result: result,
                timestamp: Date.now(),
                league: this.currentLeague
            });
            
            // Track successful prediction
            analyticsService.trackEvent('predictions', 'multi_factor_prediction_completed', {
                factor_count: factorTexts.length,
                combined_probability: result.combined_probability,
                confidence: result.confidence,
                league: this.currentLeague
            });
            
        } catch (error) {
            Logger.error('Error making multi-factor prediction:', error);
            this._showPredictionError(error);
            
            // Track error
            analyticsService.trackEvent('predictions', 'prediction_error', {
                error_type: error.name,
                error_message: error.message
            });
        } finally {
            this._setLoadingState(false);
        }
    }
    
    /**
     * Predict single factor
     */
    async _predictSingleFactor(factorText, includeSupportingData = true, includeDetailedAnalysis = true, confidenceThreshold = 0.7) {
        try {
            const response = await apiClient.post('/api/predictions/custom/single', {
                factor: factorText,
                include_supporting_data: includeSupportingData,
                include_detailed_analysis: includeDetailedAnalysis,
                confidence_threshold: confidenceThreshold,
                league: this.currentLeague !== 'all' ? this.currentLeague : undefined
            }, {
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                },
                timeout: API_CONFIG.requestTimeout
            });
            
            if (response.status !== 'success') {
                throw new Error(response.message || 'Failed to generate prediction');
            }
            
            return response.data;
            
        } catch (error) {
            Logger.error('API error making single factor prediction:', error);
            throw error;
        }
    }
    
    /**
     * Predict multiple factors
     */
    async _predictMultiFactors(factorTexts, correlationMethod = 'auto') {
        try {
            const response = await apiClient.post('/api/predictions/custom/multi', {
                factors: factorTexts,
                max_factors: this.maxFactors,
                include_analysis: true,
                correlation_method: correlationMethod,
                league: this.currentLeague !== 'all' ? this.currentLeague : undefined
            }, {
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                },
                timeout: API_CONFIG.requestTimeout
            });
            
            if (response.status !== 'success') {
                throw new Error(response.message || 'Failed to generate multi-factor prediction');
            }
            
            return response.data;
            
        } catch (error) {
            Logger.error('API error making multi-factor prediction:', error);
            throw error;
        }
    }
    
    /**
     * Display prediction results
     */
    _displayPredictionResults(result, isMultiFactor = false) {
        const resultsContainer = this.container.querySelector('#prediction-results');
        
        if (!resultsContainer) return;
        
        // Store current prediction
        this.currentPrediction = result;
        
        // Show results container
        resultsContainer.classList.remove('d-none');
        
        // Hide comparison results if visible
        const comparisonResults = this.container.querySelector('#comparison-results');
        if (comparisonResults) {
            comparisonResults.classList.add('d-none');
        }
        
        if (isMultiFactor) {
            // Display multi-factor results
            resultsContainer.innerHTML = this._renderMultiFactorResults(result);
        } else {
            // Display single factor results
            resultsContainer.innerHTML = this._renderSingleFactorResults(result);
        }
        
        // Set up event listeners for the prediction card
        this._setupPredictionCardEventListeners(result);
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    /**
     * Set up event listeners for prediction result card
     */
    _setupPredictionCardEventListeners(prediction) {
        const resultsContainer = this.container.querySelector('#prediction-results');
        
        // Add to comparison button
        resultsContainer.querySelector('.add-to-comparison-btn')?.addEventListener('click', () => {
            this._addPredictionToComparison(prediction);
        });
        
        // Share button
        resultsContainer.querySelector('.share-prediction-btn')?.addEventListener('click', () => {
            this._sharePrediction(prediction);
        });
        
        // Info buttons (tooltips)
        const infoButtons = resultsContainer.querySelectorAll('.info-tooltip');
        infoButtons.forEach(button => {
            new bootstrap.Tooltip(button);
        });
        
        // Probability distribution button
        resultsContainer.querySelector('.show-distribution-btn')?.addEventListener('click', () => {
            this._toggleProbabilityDistribution(prediction);
        });
        
        // Supporting data toggle
        resultsContainer.querySelector('.toggle-supporting-data')?.addEventListener('click', () => {
            resultsContainer.querySelector('.supporting-data-container')?.classList.toggle('d-none');
        });
        
        // Key insights toggle
        resultsContainer.querySelector('.toggle-insights')?.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const insightsContainer = resultsContainer.querySelector('.insights-content');
            
            if (insightsContainer) {
                insightsContainer.classList.toggle('d-none');
                
                // Toggle icon
                const icon = target.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down');
                    icon.classList.toggle('fa-chevron-up');
                }
            }
        });
    }
    
    /**
     * Render single factor results
     */
    _renderSingleFactorResults(result) {
        const probability = result.probability * 100;
        const confidenceClass = this._getConfidenceClass(result.confidence);
        
        // Format the factor description
        const factorDescription = result.raw_factor || result.factor || 'Prediction';
        
        // Generate insight texts
        const analysis = result.analysis || {};
        const insights = analysis.key_factors || [];
        
        // Get supporting data
        const supportingData = result.supporting_data || {};
        
        return `
            <div class="prediction-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-start">
                        <h4 class="prediction-factor">${factorDescription}</h4>
                        <button class="btn btn-sm btn-outline-primary add-to-comparison-btn">
                            <i class="fas fa-plus"></i> Compare
                        </button>
                    </div>
                    <p class="text-muted mb-0 text-sm">${analysis.summary || ''}</p>
                </div>
                
                <div class="row align-items-center mb-4">
                    <div class="col-md-7">
                        <div class="d-flex align-items-center mb-2">
                            <h5 class="mb-0 me-2">Probability</h5>
                            <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                data-bs-toggle="tooltip" 
                                data-bs-placement="top" 
                                title="Our AI-calculated probability of this outcome occurring based on historical data and current factors">
                                <i class="fas fa-info-circle text-muted"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 ms-2 show-distribution-btn">
                                <i class="fas fa-chart-area text-muted"></i>
                            </button>
                        </div>
                        <div class="progress" style="height: 25px;">
                            <div class="progress-bar bg-${this._getProbabilityClass(probability)}" 
                                role="progressbar" 
                                style="width: ${probability}%;"
                                aria-valuenow="${probability}" 
                                aria-valuemin="0" 
                                aria-valuemax="100">
                                ${probability.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    <div class="col-md-5 mt-3 mt-md-0">
                        <div class="confidence-container p-3 rounded bg-light">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <div class="d-flex align-items-center">
                                    <h6 class="mb-0 me-2">Confidence</h6>
                                    <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                        data-bs-toggle="tooltip" 
                                        data-bs-placement="top" 
                                        title="How confident our model is in this prediction. Higher confidence indicates more reliable odds.">
                                        <i class="fas fa-info-circle text-muted"></i>
                                    </button>
                                </div>
                                <span class="badge bg-${confidenceClass}">${(result.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div class="progress" style="height: 8px;">
                                <div class="progress-bar bg-${confidenceClass}" 
                                    role="progressbar" 
                                    style="width: ${result.confidence * 100}%;" 
                                    aria-valuenow="${result.confidence * 100}" 
                                    aria-valuemin="0" 
                                    aria-valuemax="100">
                                </div>
                            </div>
                            <div class="prediction-strength text-${confidenceClass} text-sm mt-1">
                                ${analysis.strength || 'Moderate Confidence'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="insights-section border-top pt-3 mt-2">
                    <div class="d-flex justify-content-between align-items-center mb-2 toggle-insights cursor-pointer">
                        <h6 class="mb-0">Key Insights</h6>
                        <i class="fas fa-chevron-down text-muted"></i>
                    </div>
                    <div class="insights-content">
                        ${insights.length > 0 ? `
                            <ul class="text-sm">
                                ${insights.map(insight => `<li>${insight}</li>`).join('')}
                            </ul>
                        ` : '<p class="text-muted text-sm">No additional insights available</p>'}
                    </div>
                </div>
                
                ${supportingData && Object.keys(supportingData).length > 0 ? `
                    <div class="supporting-data border-top pt-3 mt-3">
                        <div class="d-flex justify-content-between align-items-center mb-2 toggle-supporting-data cursor-pointer">
                            <h6 class="mb-0">Supporting Data</h6>
                            <i class="fas fa-chevron-down text-muted"></i>
                        </div>
                        <div class="supporting-data-container d-none">
                            <div class="table-responsive">
                                <table class="table table-sm text-sm">
                                    <tbody>
                                        ${Object.entries(supportingData).map(([key, value]) => `
                                            <tr>
                                                <td class="fw-medium">${key.replace(/_/g, ' ')}</td>
                                                <td>${typeof value === 'object' ? JSON.stringify(value) : value}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                <div class="mt-4 text-end">
                    <button class="btn btn-sm btn-outline-success me-2 save-prediction-btn">
                        <i class="fas fa-bookmark"></i> Save
                    </button>
                    <button class="btn btn-sm btn-outline-primary share-prediction-btn">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Render multi-factor results
     */
    _renderMultiFactorResults(result) {
        const probability = result.combined_probability * 100;
        const confidenceClass = this._getConfidenceClass(result.confidence);
        
        // Get factors and their probabilities
        const factors = result.factors || [];
        const individualProbabilities = result.individual_probabilities || [];
        
        // Get correlation info
        const correlationInfo = (result.analysis && result.analysis.correlation) || { level: 'Unknown', value: 0 };
        
        // Get insights
        const insights = (result.analysis && result.analysis.key_insights) || [];
        
        return `
            <div class="prediction-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-start">
                        <h4 class="prediction-title">Multi-Factor Prediction</h4>
                        <button class="btn btn-sm btn-outline-primary add-to-comparison-btn">
                            <i class="fas fa-plus"></i> Compare
                        </button>
                    </div>
                    <p class="text-muted mb-0 text-sm">${result.analysis?.summary || 'Combined prediction for multiple factors'}</p>
                </div>
                
                <div class="row align-items-center mb-4">
                    <div class="col-md-7">
                        <div class="d-flex align-items-center mb-2">
                            <h5 class="mb-0 me-2">Combined Probability</h5>
                            <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                data-bs-toggle="tooltip" 
                                data-bs-placement="top" 
                                title="The probability of all factors occurring together, taking into account correlations between events">
                                <i class="fas fa-info-circle text-muted"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 ms-2 show-distribution-btn">
                                <i class="fas fa-chart-area text-muted"></i>
                            </button>
                        </div>
                        <div class="progress" style="height: 25px;">
                            <div class="progress-bar bg-${this._getProbabilityClass(probability)}" 
                                role="progressbar" 
                                style="width: ${probability}%;"
                                aria-valuenow="${probability}" 
                                aria-valuemin="0" 
                                aria-valuemax="100">
                                ${probability.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    <div class="col-md-5 mt-3 mt-md-0">
                        <div class="confidence-container p-3 rounded bg-light">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <div class="d-flex align-items-center">
                                    <h6 class="mb-0 me-2">Confidence</h6>
                                    <button class="btn btn-sm btn-link p-0 info-tooltip" 
                                        data-bs-toggle="tooltip" 
                                        data-bs-placement="top" 
                                        title="How confident our model is in this prediction. Higher confidence indicates more reliable odds.">
                                        <i class="fas fa-info-circle text-muted"></i>
                                    </button>
                                </div>
                                <span class="badge bg-${confidenceClass}">${(result.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div class="progress" style="height: 8px;">
                                <div class="progress-bar bg-${confidenceClass}" 
                                    role="progressbar" 
                                    style="width: ${result.confidence * 100}%;" 
                                    aria-valuenow="${result.confidence * 100}" 
                                    aria-valuemin="0" 
                                    aria-valuemax="100">
                                </div>
                            </div>
                            <div class="prediction-strength text-${confidenceClass} text-sm mt-1">
                                ${result.analysis?.strength || 'Moderate Confidence'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="individual-factors mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Individual Factors</h6>
                        <div class="correlation-badge d-flex align-items-center">
                            <span class="text-sm text-muted me-1">Correlation:</span>
                            <span class="badge ${correlationInfo.level === 'Strong' ? 'bg-danger' : 
                                              correlationInfo.level === 'Moderate' ? 'bg-warning' : 
                                              correlationInfo.level === 'Weak' ? 'bg-info' : 'bg-secondary'}">
                                ${correlationInfo.level}
                            </span>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm text-sm">
                            <thead>
                                <tr>
                                    <th>Factor</th>
                                    <th class="text-end">Probability</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${factors.map((factor, i) => `
                                    <tr>
                                        <td>${factor.raw_text || factor}</td>
                                        <td class="text-end font-weight-bold">
                                            <div class="d-flex align-items-center justify-content-end">
                                                <div class="progress me-2" style="width: 60px; height: 8px;">
                                                    <div class="progress-bar bg-${this._getProbabilityClass(individualProbabilities[i] * 100)}" 
                                                        role="progressbar" 
                                                        style="width: ${individualProbabilities[i] * 100}%;"
                                                        aria-valuenow="${individualProbabilities[i] * 100}" 
                                                        aria-valuemin="0" 
                                                        aria-valuemax="100">
                                                    </div>
                                                </div>
                                                ${(individualProbabilities[i] * 100).toFixed(1)}%
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="insights-section border-top pt-3 mt-2">
                    <div class="d-flex justify-content-between align-items-center mb-2 toggle-insights cursor-pointer">
                        <h6 class="mb-0">Key Insights</h6>
                        <i class="fas fa-chevron-down text-muted"></i>
                    </div>
                    <div class="insights-content">
                        ${insights.length > 0 ? `
                            <ul class="text-sm">
                                ${insights.map(insight => `<li>${insight}</li>`).join('')}
                            </ul>
                        ` : '<p class="text-muted text-sm">No additional insights available</p>'}
                    </div>
                </div>
                
                <div class="mt-4 text-end">
                    <button class="btn btn-sm btn-outline-success me-2 save-prediction-btn">
                        <i class="fas fa-bookmark"></i> Save
                    </button>
                    <button class="btn btn-sm btn-outline-primary share-prediction-btn">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Render prediction visualization
     */
    _renderPredictionVisualization(prediction, isMultiFactor = false) {
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        
        if (!visualizationContainer) return;
        
        // Show container
        visualizationContainer.classList.remove('d-none');
        
        try {
            // Clear previous visualizations
            visualizationContainer.innerHTML = '';
            
            // Create visualization based on prediction type
            if (isMultiFactor) {
                this._createMultiFactorVisualization(prediction, visualizationContainer);
            } else {
                this._createSingleFactorVisualization(prediction, visualizationContainer);
            }
        } catch (error) {
            Logger.error('Error rendering prediction visualization:', error);
            visualizationContainer.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Could not render visualization. ${error.message}
                </div>
            `;
        }
    }
    
    /**
     * Create single factor visualization
     */
    _createSingleFactorVisualization(prediction, container) {
        // Create a container for the D3 visualization
        const vizContainer = document.createElement('div');
        vizContainer.className = 'single-factor-viz d-flex justify-content-center my-3';
        vizContainer.style.height = '200px';
        container.appendChild(vizContainer);
        
        // Use D3 to create a visualization
        const width = vizContainer.clientWidth || 600;
        const height = vizContainer.clientHeight || 200;
        const margin = { top: 20, right: 30, bottom: 40, left: 40 };
        
        const svg = d3.select(vizContainer)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create a probability gauge
        const gaugeWidth = width * 0.8;
        const gaugeHeight = height * 0.6;
        const gaugeX = (width - gaugeWidth) / 2;
        const gaugeY = (height - gaugeHeight) / 2;
        
        // Draw gauge background
        svg.append('rect')
            .attr('x', gaugeX)
            .attr('y', gaugeY)
            .attr('width', gaugeWidth)
            .attr('height', gaugeHeight)
            .attr('rx', 5)
            .attr('ry', 5)
            .attr('fill', '#f0f0f0');
        
        // Draw gauge fill based on probability
        const probability = prediction.probability;
        const fillWidth = gaugeWidth * probability;
        
        svg.append('rect')
            .attr('x', gaugeX)
            .attr('y', gaugeY)
            .attr('width', fillWidth)
            .attr('height', gaugeHeight)
            .attr('rx', 5)
            .attr('ry', 5)
            .attr('fill', this._getProbabilityColor(probability * 100));
        
        // Add probability text
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', gaugeY + gaugeHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', probability > 0.5 ? 'white' : 'black')
            .attr('font-weight', 'bold')
            .attr('font-size', '24px')
            .text(`${(probability * 100).toFixed(1)}%`);
        
        // Add scale marks
        const scaleY = gaugeY + gaugeHeight + 10;
        for (let i = 0; i <= 10; i++) {
            const scaleX = gaugeX + (gaugeWidth * i / 10);
            
            svg.append('line')
                .attr('x1', scaleX)
                .attr('y1', scaleY)
                .attr('x2', scaleX)
                .attr('y2', scaleY + 5)
                .attr('stroke', '#666')
                .attr('stroke-width', i % 5 === 0 ? 2 : 1);
            
            if (i % 2 === 0) {
                svg.append('text')
                    .attr('x', scaleX)
                    .attr('y', scaleY + 15)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#666')
                    .attr('font-size', '12px')
                    .text(`${i * 10}%`);
            }
        }
        
        // Add prediction factor as title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', gaugeY - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', '#333')
            .attr('font-size', '14px')
            .text('Probability Gauge');
    }
    
    /**
     * Create multi-factor visualization
     */
    _createMultiFactorVisualization(prediction, container) {
        // Get data needed for visualization
        const individualProbabilities = prediction.individual_probabilities || [];
        const factors = prediction.factors || [];
        const combinedProbability = prediction.combined_probability;
        
        // Limit factors to display (for readability)
        const displayLimit = 5;
        const displayFactors = factors.slice(0, displayLimit);
        const displayProbabilities = individualProbabilities.slice(0, displayLimit);
        
        // Create a container for the radar chart
        const radarContainer = document.createElement('div');
        radarContainer.className = 'multi-factor-viz d-flex flex-column align-items-center my-3';
        container.appendChild(radarContainer);
        
        // Add title
        const title = document.createElement('h6');
        title.className = 'text-center mb-2';
        title.textContent = 'Factor Probability Analysis';
        radarContainer.appendChild(title);
        
        // Create SVG container
        const width = 500;
        const height = 400;
        const margin = { top: 50, right: 50, bottom: 50, left: 50 };
        
        const svg = d3.select(radarContainer)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create bar chart
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(displayFactors.map((_, i) => `Factor ${i + 1}`))
            .range([0, chartWidth])
            .padding(0.3);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([chartHeight, 0]);
        
        // Create chart group
        const chartGroup = svg.append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);
        
        // Add x-axis
        chartGroup.append('g')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(d3.axisBottom(xScale));
        
        // Add y-axis
        chartGroup.append('g')
            .call(d3.axisLeft(yScale).ticks(10, '%'));
        
        // Add bars for individual probabilities
        chartGroup.selectAll('.factor-bar')
            .data(displayProbabilities)
            .enter()
            .append('rect')
            .attr('class', 'factor-bar')
            .attr('x', (d, i) => xScale(`Factor ${i + 1}`))
            .attr('y', d => yScale(d))
            .attr('width', xScale.bandwidth())
            .attr('height', d => chartHeight - yScale(d))
            .attr('fill', d => this._getProbabilityColor(d * 100));
        
        // Add bar labels
        chartGroup.selectAll('.bar-label')
            .data(displayProbabilities)
            .enter()
            .append('text')
            .attr('class', 'bar-label')
            .attr('x', (d, i) => xScale(`Factor ${i + 1}`) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d) - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text(d => `${(d * 100).toFixed(0)}%`);
        
        // Add combined probability line
        chartGroup.append('line')
            .attr('x1', 0)
            .attr('y1', yScale(combinedProbability))
            .attr('x2', chartWidth)
            .attr('y2', yScale(combinedProbability))
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        // Add combined probability label
        chartGroup.append('text')
            .attr('x', chartWidth)
            .attr('y', yScale(combinedProbability) - 5)
            .attr('text-anchor', 'end')
            .attr('font-size', '12px')
            .attr('fill', 'red')
            .text(`Combined: ${(combinedProbability * 100).toFixed(0)}%`);
        
        // Add factor tooltips
        for (let i = 0; i < displayFactors.length; i++) {
            const factorText = displayFactors[i].length > 30 
                ? displayFactors[i].substring(0, 27) + '...' 
                : displayFactors[i];
                
            chartGroup.append('title')
                .text(factorText);
        }
    }
    
    /**
     * Toggle probability distribution visualization
     */
    _toggleProbabilityDistribution(prediction) {
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        
        if (!visualizationContainer) return;
        
        // Toggle visibility
        const isVisible = !visualizationContainer.classList.contains('d-none');
        
        if (isVisible) {
            visualizationContainer.classList.add('d-none');
        } else {
            visualizationContainer.classList.remove('d-none');
            
            // Render the probability distribution
            this._renderProbabilityDistribution(prediction, visualizationContainer);
        }
    }
    
    /**
     * Render probability distribution visualization
     */
    _renderProbabilityDistribution(prediction, container) {
        // Clear previous visualizations
        container.innerHTML = '';
        
        // Create title
        const title = document.createElement('h6');
        title.className = 'text-center mb-3';
        title.textContent = 'Probability Distribution';
        container.appendChild(title);
        
        // Create SVG container
        const width = 600;
        const height = 300;
        const margin = { top: 20, right: 30, bottom: 40, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Generate probability distribution data
        // This would normally come from the API with actual distribution data
        // For now, we'll simulate a bell curve around the predicted probability
        const distributionData = this._generateProbabilityDistribution(
            prediction.probability,
            prediction.confidence
        );
        
        // Create scales
        const xScale = d3.scaleLinear()
            .domain([0, 1])
            .range([margin.left, width - margin.right]);
        
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(distributionData, d => d.density)])
            .range([height - margin.bottom, margin.top]);
        
        // Create line generator
        const line = d3.line()
            .x(d => xScale(d.probability))
            .y(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Create area generator
        const area = d3.area()
            .x(d => xScale(d.probability))
            .y0(height - margin.bottom)
            .y1(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Draw axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(10, '%'));
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale));
        
        // Add axis labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Probability');
        
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Density');
        
        // Draw area
        svg.append('path')
            .datum(distributionData)
            .attr('fill', 'rgba(72, 133, 237, 0.2)')
            .attr('d', area);
        
        // Draw line
        svg.append('path')
            .datum(distributionData)
            .attr('fill', 'none')
            .attr('stroke', '#4885ed')
            .attr('stroke-width', 2)
            .attr('d', line);
        
        // Draw predicted probability line
        svg.append('line')
            .attr('x1', xScale(prediction.probability))
            .attr('y1', margin.top)
            .attr('x2', xScale(prediction.probability))
            .attr('y2', height - margin.bottom)
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        // Add predicted probability label
        svg.append('text')
            .attr('x', xScale(prediction.probability))
            .attr('y', margin.top - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'red')
            .text(`${(prediction.probability * 100).toFixed(1)}%`);
        
        // Add confidence interval
        const confidenceInterval = this._calculateConfidenceInterval(
            prediction.probability,
            prediction.confidence
        );
        
        svg.append('rect')
            .attr('x', xScale(confidenceInterval.lower))
            .attr('y', margin.top)
            .attr('width', xScale(confidenceInterval.upper) - xScale(confidenceInterval.lower))
            .attr('height', height - margin.top - margin.bottom)
            .attr('fill', 'rgba(255, 0, 0, 0.1)')
            .attr('stroke', 'rgba(255, 0, 0, 0.3)')
            .attr('stroke-width', 1);
        
        // Add confidence interval labels
        svg.append('text')
            .attr('x', xScale(confidenceInterval.lower))
            .attr('y', height - margin.bottom + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .text(`${(confidenceInterval.lower * 100).toFixed(1)}%`);
        
        svg.append('text')
            .attr('x', xScale(confidenceInterval.upper))
            .attr('y', height - margin.bottom + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .text(`${(confidenceInterval.upper * 100).toFixed(1)}%`);
        
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - margin.bottom + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-style', 'italic')
            .text('95% Confidence Interval');
    }
    
    /**
     * Generate probability distribution data
     */
    _generateProbabilityDistribution(probability, confidence) {
        const points = 100;
        const distributionData = [];
        
        // Use confidence to determine the standard deviation
        // Lower confidence = wider distribution
        const stdDev = 0.2 * (1 - confidence);
        
        for (let i = 0; i <= points; i++) {
            const x = i / points;
            
            // Calculate normal distribution density
            const density = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * 
                           Math.exp(-0.5 * Math.pow((x - probability) / stdDev, 2));
            
            distributionData.push({
                probability: x,
                density: density
            });
        }
        
        return distributionData;
    }
    
    /**
     * Calculate confidence interval
     */
    _calculateConfidenceInterval(probability, confidence) {
        // Use confidence to determine width of interval
        const intervalWidth = 0.2 * (1 - confidence);
        
        return {
            lower: Math.max(0, probability - intervalWidth),
            upper: Math.min(1, probability + intervalWidth)
        };
    }
    
    /**
     * Show export options
     */
    _showExportOptions() {
        const exportOptions = this.container.querySelector('#export-options');
        
        if (exportOptions) {
            exportOptions.classList.remove('d-none');
        }
    }
    
    /**
     * Show prediction error
     */
    _showPredictionError(error) {
        const errorContainer = this.container.querySelector('#prediction-error');
        
        if (!errorContainer) return;
        
        // Show error container
        errorContainer.classList.remove('d-none');
        
        // Hide results container
        const resultsContainer = this.container.querySelector('#prediction-results');
        if (resultsContainer) {
            resultsContainer.classList.add('d-none');
        }
        
        // Hide visualization container
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        if (visualizationContainer) {
            visualizationContainer.classList.add('d-none');
        }
        
        // Hide export options
        const exportOptions = this.container.querySelector('#export-options');
        if (exportOptions) {
            exportOptions.classList.add('d-none');
        }
        
        // Display error message
        errorContainer.innerHTML = `
            <div class="alert alert-danger">
                <h5 class="alert-heading">Prediction Error</h5>
                <p>${error.message || 'An unknown error occurred while generating the prediction'}</p>
                <div class="mt-2">
                    <button class="btn btn-sm btn-danger retry-prediction-btn me-2">Try Again</button>
                    ${this.offlineMode ? '' : `
                        <button class="btn btn-sm btn-outline-secondary try-offline-btn">Try in Offline Mode</button>
                    `}
                </div>
            </div>
        `;
        
        // Add event listener to retry button
        errorContainer.querySelector('.retry-prediction-btn')?.addEventListener('click', () => {
            errorContainer.classList.add('d-none');
            
            // Detect current tab
            const activeTab = this.container.querySelector('.tab-button.active');
            if (activeTab) {
                const tabName = activeTab.getAttribute('data-tab');
                
                if (tabName === 'single-factor') {
                    this._handleSingleFactorPrediction();
                } else if (tabName === 'multi-factor') {
                    this._handleMultiFactorPrediction();
                }
            }
        });
        
        // Add event listener to offline mode button
        errorContainer.querySelector('.try-offline-btn')?.addEventListener('click', () => {
            this.offlineMode = true;
            errorContainer.classList.add('d-none');
            this._updateOfflineUI();
            
            // Detect current tab
            const activeTab = this.container.querySelector('.tab-button.active');
            if (activeTab) {
                const tabName = activeTab.getAttribute('data-tab');
                
                if (tabName === 'single-factor') {
                    this._handleSingleFactorPrediction();
                } else if (tabName === 'multi-factor') {
                    this._handleMultiFactorPrediction();
                }
            }
        });
    }
    
    /**
     * Set loading state
     */
    _setLoadingState(isLoading) {
        this.isLoading = isLoading;
        
        const loadingContainer = this.container.querySelector('#prediction-loading');
        const resultsContainer = this.container.querySelector('#prediction-results');
        const errorContainer = this.container.querySelector('#prediction-error');
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        const exportOptions = this.container.querySelector('#export-options');
        
        if (isLoading) {
            loadingContainer?.classList.remove('d-none');
            resultsContainer?.classList.add('d-none');
            errorContainer?.classList.add('d-none');
            visualizationContainer?.classList.add('d-none');
            exportOptions?.classList.add('d-none');
            
            // Disable prediction buttons
            const predictionButtons = this.container.querySelectorAll('button[id$="-predict-button"]');
            predictionButtons.forEach(button => {
                button.disabled = true;
                button.innerHTML = `
                    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Generating...
                `;
            });
        } else {
            loadingContainer?.classList.add('d-none');
            
            // Re-enable prediction buttons
            const predictionButtons = this.container.querySelectorAll('button[id$="-predict-button"]');
            predictionButtons.forEach(button => {
                button.disabled = false;
                
                if (button.id === 'single-predict-button') {
                    button.innerHTML = 'Generate Prediction';
                } else if (button.id === 'multi-predict-button') {
                    button.innerHTML = 'Generate Multi-Factor Prediction';
                }
            });
        }
    }
    
    /**
     * Add prediction to history
     */
    async _addToPredictionHistory(prediction) {
        // Add to history
        this.predictionHistory.unshift(prediction);
        
        // Keep only last 20 predictions
        if (this.predictionHistory.length > 20) {
            this.predictionHistory.pop();
        }
        
        // Save to IndexedDB for offline access
        if (prediction.id) {
            await this._saveToIndexedDB(prediction);
        }
        
        // Update history display
        this._updatePredictionHistory();
        
        // Update history visualization
        this._updateHistoryVisualization();
        
        // Sync to server if online
        if (!this.offlineMode) {
            try {
                await apiClient.post('/api/predictions/history', {
                    prediction: prediction
                }, {
                    headers: {
                        'Authorization': `Bearer ${authService.getToken()}`,
                        'X-API-Key': API_CONFIG.predictionApiKey
                    }
                });
            } catch (error) {
                Logger.error('Error syncing prediction to server:', error);
                // Mark as unsynced
                prediction.synced = false;
                await this._saveToIndexedDB(prediction);
            }
        } else {
            // Mark as unsynced if offline
            prediction.synced = false;
            await this._saveToIndexedDB(prediction);
        }
    }
    
    /**
     * Update prediction history display
     */
    _updatePredictionHistory() {
        const historyContainer = this.container.querySelector('#prediction-history');
        
        if (!historyContainer) return;
        
        // Get filtered predictions based on current league
        let filteredPredictions = this.predictionHistory;
        
        if (this.currentLeague !== 'all') {
            filteredPredictions = this.predictionHistory.filter(prediction => 
                prediction.league === this.currentLeague || !prediction.league
            );
        }
        
        if (filteredPredictions.length === 0) {
            historyContainer.innerHTML = '<p class="text-gray-500 text-sm">No recent predictions for this league</p>';
            return;
        }
        
        // Render history items
        historyContainer.innerHTML = `
            <div class="history-items">
                ${filteredPredictions.map((item, index) => this._renderHistoryItem(item, index)).join('')}
            </div>
        `;
        
        // Add event listeners for history items
        historyContainer.querySelectorAll('.history-item').forEach((item, index) => {
            const predictionId = item.getAttribute('data-prediction-id');
            const prediction = this.predictionHistory.find(p => p.id === predictionId);
            
            item.addEventListener('click', () => {
                if (prediction) {
                    this._displayPredictionResults(prediction.result, prediction.type === 'multi');
                    this._renderPredictionVisualization(prediction.result, prediction.type === 'multi');
                    this._showExportOptions();
                    this.currentPrediction = prediction.result;
                }
            });
            
            // Add to comparison button
            const compareBtn = item.querySelector('.add-to-comparison-history-btn');
            if (compareBtn) {
                compareBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent item click
                    if (prediction) {
                        this._addPredictionToComparison(prediction.result);
                    }
                });
            }
        });
    }
    
    /**
     * Render history item
     */
    _renderHistoryItem(item, index) {
        const timestamp = new Date(item.timestamp || Date.now()).toLocaleString();
        
        if (item.type === 'single') {
            const probability = item.result.probability * 100;
            
            return `
                <div class="history-item bg-white rounded shadow-sm p-3 mb-2 cursor-pointer hover:bg-gray-50" 
                     data-prediction-id="${item.id}"
                     data-index="${index}">
                    <div class="d-flex justify-content-between">
                        <div class="history-content flex-grow-1">
                            <div class="factor-text font-weight-medium">${item.factor}</div>
                            <div class="d-flex align-items-center mt-1">
                                <div class="text-sm text-muted">${timestamp}</div>
                                ${item.league ? `
                                    <div class="ms-2 league-badge px-2 py-0 rounded-pill bg-light text-xs">
                                        ${item.league.replace('_', ' ').toUpperCase()}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="history-actions d-flex flex-column align-items-end">
                            <span class="badge ${this._getProbabilityBadgeClass(probability)} mb-2">
                                ${probability.toFixed(1)}%
                            </span>
                            <button class="btn btn-sm btn-outline-primary add-to-comparison-history-btn py-0 px-1" title="Add to comparison">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    ${item.resolved ? `
                        <div class="resolved-indicator mt-1 text-xs ${item.resolvedResult?.correct ? 'text-success' : 'text-danger'}">
                            <i class="fas ${item.resolvedResult?.correct ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${item.resolvedResult?.correct ? 'Correct Prediction' : 'Incorrect Prediction'}
                        </div>
                    ` : ''}
                    ${!this.offlineMode && !item.synced ? `
                        <div class="unsynced-indicator mt-1 text-xs text-warning">
                            <i class="fas fa-cloud-upload-alt me-1"></i> Waiting to sync
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            const probability = item.result.combined_probability * 100;
            const factorCount = item.factors.length;
            
            return `
                <div class="history-item bg-white rounded shadow-sm p-3 mb-2 cursor-pointer hover:bg-gray-50" 
                     data-prediction-id="${item.id}"
                     data-index="${index}">
                    <div class="d-flex justify-content-between">
                        <div class="history-content flex-grow-1">
                            <div class="factor-text font-weight-medium">
                                <span class="badge bg-info text-white me-1">${factorCount}</span>
                                Multi-Factor Prediction
                            </div>
                            <div class="multi-factors text-xs text-muted mt-1">
                                ${item.factors.slice(0, 2).map(f => `<div class="truncate">${f}</div>`).join('')}
                                ${item.factors.length > 2 ? `<div class="text-xs text-muted">+ ${item.factors.length - 2} more factors</div>` : ''}
                            </div>
                            <div class="d-flex align-items-center mt-1">
                                <div class="text-sm text-muted">${timestamp}</div>
                                ${item.league ? `
                                    <div class="ms-2 league-badge px-2 py-0 rounded-pill bg-light text-xs">
                                        ${item.league.replace('_', ' ').toUpperCase()}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="history-actions d-flex flex-column align-items-end">
                            <span class="badge ${this._getProbabilityBadgeClass(probability)} mb-2">
                                ${probability.toFixed(1)}%
                            </span>
                            <button class="btn btn-sm btn-outline-primary add-to-comparison-history-btn py-0 px-1" title="Add to comparison">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    ${item.resolved ? `
                        <div class="resolved-indicator mt-1 text-xs ${item.resolvedResult?.correct ? 'text-success' : 'text-danger'}">
                            <i class="fas ${item.resolvedResult?.correct ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${item.resolvedResult?.correct ? 'Correct Prediction' : 'Incorrect Prediction'}
                        </div>
                    ` : ''}
                    ${!this.offlineMode && !item.synced ? `
                        <div class="unsynced-indicator mt-1 text-xs text-warning">
                            <i class="fas fa-cloud-upload-alt me-1"></i> Waiting to sync
                        </div>
                    ` : ''}
                </div>
            `;
        }
    }
    
    /**
     * Update history visualization
     */
    _updateHistoryVisualization() {
        const container = this.container.querySelector('#history-viz');
        
        if (!container || this.predictionHistory.length < 2) {
            return;
        }
        
        // Get data for the last 10 predictions
        const lastPredictions = this.predictionHistory.slice(0, 10).reverse();
        
        // Create labels and data points
        const labels = lastPredictions.map((_, i) => `Pred ${i + 1}`);
        
        const dataPoints = lastPredictions.map(pred => {
            return pred.type === 'single' 
                ? pred.result.probability 
                : pred.result.combined_probability;
        });
        
        // Clear previous visualizations
        container.innerHTML = '';
        
        // Create SVG for mini chart
        const width = container.clientWidth || 600;
        const height = 60;
        const margin = { top: 10, right: 10, bottom: 20, left: 30 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(labels)
            .range([margin.left, width - margin.right])
            .padding(0.2);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([height - margin.bottom, margin.top]);
        
        // Create line generator
        const line = d3.line()
            .x((d, i) => xScale(labels[i]) + xScale.bandwidth() / 2)
            .y(d => yScale(d))
            .curve(d3.curveMonotoneX);
        
        // Draw line
        svg.append('path')
            .datum(dataPoints)
            .attr('fill', 'none')
            .attr('stroke', '#4885ed')
            .attr('stroke-width', 2)
            .attr('d', line);
        
        // Draw points
        svg.selectAll('.point')
            .data(dataPoints)
            .enter()
            .append('circle')
            .attr('class', 'point')
            .attr('cx', (d, i) => xScale(labels[i]) + xScale.bandwidth() / 2)
            .attr('cy', d => yScale(d))
            .attr('r', 3)
            .attr('fill', (d, i) => this._getProbabilityColor(d * 100));
        
        // Draw x-axis
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).tickSize(0));
        
        // Draw y-axis
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale).ticks(3).tickFormat(d3.format('.0%')));
        
        // Add title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#666')
            .text('Recent Prediction Probabilities');
    }
    
    /**
     * Filter prediction history
     */
    _filterPredictionHistory(filterType) {
        // Store the current filter
        this.historyFilter = filterType;
        
        // Apply filter to history display
        const historyContainer = this.container.querySelector('#prediction-history');
        
        if (!historyContainer) return;
        
        // Get filtered predictions
        let filteredPredictions = this.predictionHistory;
        
        if (filterType === 'single') {
            filteredPredictions = this.predictionHistory.filter(p => p.type === 'single');
        } else if (filterType === 'multi') {
            filteredPredictions = this.predictionHistory.filter(p => p.type === 'multi');
        } else if (filterType === 'resolved') {
            filteredPredictions = this.predictionHistory.filter(p => p.resolved);
        } else if (filterType === 'unresolved') {
            filteredPredictions = this.predictionHistory.filter(p => !p.resolved);
        }
        
        if (this.currentLeague !== 'all') {
            filteredPredictions = filteredPredictions.filter(prediction => 
                prediction.league === this.currentLeague || !prediction.league
            );
        }
        
        if (filteredPredictions.length === 0) {
            historyContainer.innerHTML = `<p class="text-gray-500 text-sm">No predictions match the selected filter</p>`;
            return;
        }
        
        // Render filtered history items
        historyContainer.innerHTML = `
            <div class="history-items">
                ${filteredPredictions.map((item, index) => this._renderHistoryItem(item, index)).join('')}
            </div>
        `;
        
        // Add event listeners for history items
        historyContainer.querySelectorAll('.history-item').forEach((item) => {
            const predictionId = item.getAttribute('data-prediction-id');
            const prediction = this.predictionHistory.find(p => p.id === predictionId);
            
            item.addEventListener('click', () => {
                if (prediction) {
                    this._displayPredictionResults(prediction.result, prediction.type === 'multi');
                    this._renderPredictionVisualization(prediction.result, prediction.type === 'multi');
                    this._showExportOptions();
                    this.currentPrediction = prediction.result;
                }
            });
            
            // Add to comparison button
            const compareBtn = item.querySelector('.add-to-comparison-history-btn');
            if (compareBtn) {
                compareBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent item click
                    if (prediction) {
                        this._addPredictionToComparison(prediction.result);
                    }
                });
            }
        });
    }
    
    /**
     * Get probability badge class
     */
    _getProbabilityBadgeClass(probability) {
        if (probability >= 80) return 'bg-success text-white';
        if (probability >= 65) return 'bg-primary text-white';
        if (probability >= 50) return 'bg-info text-white';
        if (probability >= 35) return 'bg-warning text-dark';
        return 'bg-danger text-white';
    }
    
    /**
     * Get probability class based on value
     */
    _getProbabilityClass(probability) {
        if (probability >= 80) return 'success';
        if (probability >= 65) return 'primary';
        if (probability >= 50) return 'info';
        if (probability >= 35) return 'warning';
        return 'danger';
    }
    
    /**
     * Get probability color
     */
    _getProbabilityColor(probability) {
        if (probability >= 80) return '#28a745';
        if (probability >= 65) return '#007bff';
        if (probability >= 50) return '#17a2b8';
        if (probability >= 35) return '#ffc107';
        return '#dc3545';
    }
    
    /**
     * Get confidence class based on value
     */
    _getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'success';
        if (confidence >= 0.6) return 'primary';
        if (confidence >= 0.4) return 'info';
        if (confidence >= 0.2) return 'warning';
        return 'danger';
    }
    
    /**
     * Add prediction to comparison
     */
    _addPredictionToComparison(prediction) {
        if (!prediction.id) {
            prediction.id = `pred_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        }
        
        // Check if already in comparisons
        if (this.pendingComparisons.includes(prediction.id)) {
            notificationService.showNotification('This prediction is already in your comparison', 'info');
            return;
        }
        
        // Add to pending comparisons
        this.pendingComparisons.push(prediction.id);
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Enable comparison button if needed
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = this.pendingComparisons.length < 2;
        }
        
        // Enable clear button
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = false;
        }
        
        // Switch to comparison tab
        const comparisonTab = this.container.querySelector('[data-tab="comparison"]');
        if (comparisonTab) {
            comparisonTab.click();
        }
        
        // Show notification
        notificationService.showNotification('Prediction added to comparison', 'success');
        
        // Track analytics
        analyticsService.trackEvent('predictions', 'add_to_comparison', {
            prediction_type: prediction.type,
            comparison_count: this.pendingComparisons.length
        });
    }
    
    /**
     * Update comparison items display
     */
    _updateComparisonItems() {
        const comparisonItems = this.container.querySelector('#comparison-items');
        
        if (!comparisonItems) return;
        
        if (this.pendingComparisons.length === 0) {
            comparisonItems.innerHTML = `
                <p class="text-center text-sm text-blue-200 py-3">
                    <i class="fas fa-info-circle me-1"></i> No predictions selected for comparison.
                    <br>Add predictions from your history or results.
                </p>
            `;
            return;
        }
        
        // Get prediction objects from IDs
        const comparisonPredictions = this.pendingComparisons
            .map(id => this.predictionHistory.find(p => p.id === id || p.result?.id === id))
            .filter(p => p); // Remove any not found
        
        comparisonItems.innerHTML = `
            <div class="selected-comparisons">
                ${comparisonPredictions.map(prediction => this._renderComparisonItem(prediction)).join('')}
            </div>
        `;
        
        // Add event listeners for remove buttons
        comparisonItems.querySelectorAll('.remove-comparison-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const predictionId =                 e.currentTarget.getAttribute('data-prediction-id');
                this._removePredictionFromComparison(predictionId);
            });
        });
    }
    
    /**
     * Render comparison item
     */
    _renderComparisonItem(prediction) {
        const factor = prediction.type === 'single' 
            ? prediction.factor 
            : `Multi-Factor (${prediction.factors?.length || 0} factors)`;
            
        const probability = prediction.type === 'single'
            ? prediction.result.probability * 100
            : prediction.result.combined_probability * 100;
            
        return `
            <div class="comparison-item p-2 mb-2 border rounded bg-light">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="comparison-content">
                        <div class="factor-text text-sm font-weight-medium truncate">
                            ${factor}
                        </div>
                        <div class="text-xs text-muted mt-1 d-flex align-items-center">
                            <div class="probability-badge me-2">
                                <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                                    ${probability.toFixed(1)}%
                                </span>
                            </div>
                            ${prediction.type === 'multi' ? `
                                <span class="badge bg-info text-white">Multi</span>
                            ` : ''}
                        </div>
                    </div>
                    <button class="btn btn-sm btn-link text-danger remove-comparison-btn" 
                        data-prediction-id="${prediction.id || prediction.result?.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Remove prediction from comparison
     */
    _removePredictionFromComparison(predictionId) {
        const index = this.pendingComparisons.indexOf(predictionId);
        if (index !== -1) {
            this.pendingComparisons.splice(index, 1);
        }
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Update button states
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = this.pendingComparisons.length < 2;
        }
        
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = this.pendingComparisons.length === 0;
        }
    }
    
    /**
     * Clear pending comparisons
     */
    _clearPendingComparisons() {
        this.pendingComparisons = [];
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Update button states
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = true;
        }
        
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = true;
        }
    }
    
    /**
     * Show comparison selection modal
     */
    _showComparisonSelectionModal() {
        const modal = document.getElementById('comparisonSelectionModal');
        
        if (!modal) return;
        
        // Get predictions container
        const predictionsContainer = modal.querySelector('.comparison-predictions-container');
        
        if (predictionsContainer) {
            // Show loading state
            predictionsContainer.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p class="mt-2">Loading predictions...</p>
                </div>
            `;
            
            // Load predictions
            setTimeout(() => {
                predictionsContainer.innerHTML = this._renderComparisonSelectionList();
                
                // Add event listeners
                const checkboxes = predictionsContainer.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        // Count selected items
                        const selectedCount = predictionsContainer.querySelectorAll('input[type="checkbox"]:checked').length;
                        
                        // Update add button state
                        const addButton = document.getElementById('add-to-comparison');
                        if (addButton) {
                            addButton.disabled = selectedCount === 0;
                            addButton.textContent = `Add Selected (${selectedCount})`;
                        }
                    });
                });
            }, 500);
        }
        
        // Initialize search
        const searchInput = modal.querySelector('#comparison-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.addEventListener('input', () => {
                this._filterComparisonSelection(searchInput.value);
            });
        }
        
        // Initialize filter
        const filterSelect = modal.querySelector('#comparison-filter');
        if (filterSelect) {
            filterSelect.value = 'all';
            filterSelect.addEventListener('change', () => {
                this._filterComparisonSelection(searchInput.value, filterSelect.value);
            });
        }
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
    
    /**
     * Render comparison selection list
     */
    _renderComparisonSelectionList() {
        // No predictions
        if (this.predictionHistory.length === 0) {
            return `
                <div class="text-center py-3">
                    <p class="text-muted">No predictions found</p>
                </div>
            `;
        }
        
        // Render predictions as checkboxes
        return `
            <div class="comparison-selection-list">
                <div class="list-group">
                    ${this.predictionHistory.map(prediction => {
                        const factor = prediction.type === 'single' 
                            ? prediction.factor 
                            : `Multi-Factor (${prediction.factors?.length || 0} factors)`;
                            
                        const probability = prediction.type === 'single'
                            ? prediction.result.probability * 100
                            : prediction.result.combined_probability * 100;
                        
                        const isAlreadySelected = this.pendingComparisons.includes(prediction.id || prediction.result?.id);
                        
                        return `
                            <label class="list-group-item list-group-item-action d-flex align-items-center">
                                <input type="checkbox" class="form-check-input me-3" 
                                    value="${prediction.id || prediction.result?.id}"
                                    ${isAlreadySelected ? 'checked disabled' : ''}>
                                <div class="flex-grow-1">
                                    <div class="d-flex justify-content-between">
                                        <div class="prediction-text">
                                            ${factor.length > 50 ? factor.substring(0, 47) + '...' : factor}
                                        </div>
                                        <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                                            ${probability.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div class="text-xs text-muted mt-1">
                                        ${new Date(prediction.timestamp || Date.now()).toLocaleString()}
                                        ${prediction.type === 'multi' ? ' • Multi-Factor' : ''}
                                        ${prediction.league ? ` • ${prediction.league.replace('_', ' ').toUpperCase()}` : ''}
                                    </div>
                                </div>
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    /**
     * Filter comparison selection
     */
    _filterComparisonSelection(searchTerm = '', filterType = 'all') {
        const modal = document.getElementById('comparisonSelectionModal');
        
        if (!modal) return;
        
        const items = modal.querySelectorAll('.list-group-item');
        
        items.forEach(item => {
            const predictionText = item.querySelector('.prediction-text')?.textContent.toLowerCase() || '';
            const typeInfo = item.querySelector('.text-muted')?.textContent.toLowerCase() || '';
            
            // Check if matches search
            const matchesSearch = !searchTerm || predictionText.includes(searchTerm.toLowerCase());
            
            // Check if matches filter
            let matchesFilter = true;
            
            if (filterType === 'single') {
                matchesFilter = !typeInfo.includes('multi-factor');
            } else if (filterType === 'multi') {
                matchesFilter = typeInfo.includes('multi-factor');
            } else if (filterType === 'resolved') {
                matchesFilter = item.querySelector('.resolved-indicator') !== null;
            }
            
            // Show or hide based on filters
            item.style.display = matchesSearch && matchesFilter ? 'flex' : 'none';
        });
        
        // Check if no results
        const visibleItems = Array.from(items).filter(item => item.style.display !== 'none');
        
        const predictionsContainer = modal.querySelector('.comparison-predictions-container');
        const noResults = predictionsContainer.querySelector('.no-results');
        
        if (visibleItems.length === 0) {
            if (!noResults) {
                const noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'no-results text-center py-3';
                noResultsMsg.innerHTML = `
                    <p class="text-muted">No predictions match your search</p>
                `;
                predictionsContainer.appendChild(noResultsMsg);
            }
        } else if (noResults) {
            noResults.remove();
        }
    }
    
    /**
     * Add selected predictions to comparison
     */
    _addSelectedToComparison() {
        const modal = document.getElementById('comparisonSelectionModal');
        
        if (!modal) return;
        
        // Get selected checkboxes
        const selectedCheckboxes = modal.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
        
        if (selectedCheckboxes.length === 0) {
            return;
        }
        
        // Add to pending comparisons
        selectedCheckboxes.forEach(checkbox => {
            const predictionId = checkbox.value;
            if (!this.pendingComparisons.includes(predictionId)) {
                this.pendingComparisons.push(predictionId);
            }
        });
        
        // Update comparison items display
        this._updateComparisonItems();
        
        // Update button states
        const generateComparisonButton = this.container.querySelector('#generate-comparison-button');
        if (generateComparisonButton) {
            generateComparisonButton.disabled = this.pendingComparisons.length < 2;
        }
        
        const clearComparisonsButton = this.container.querySelector('#clear-comparisons-button');
        if (clearComparisonsButton) {
            clearComparisonsButton.disabled = false;
        }
        
        // Close modal
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal.hide();
        
        // Show notification
        notificationService.showNotification(`Added ${selectedCheckboxes.length} predictions to comparison`, 'success');
    }
    
    /**
     * Generate comparison analysis
     */
    _generateComparisonAnalysis() {
        try {
            if (this.pendingComparisons.length < 2) {
                notificationService.showNotification('You need at least 2 predictions to compare', 'warning');
                return;
            }
            
            // Get prediction objects from IDs
            const comparisonPredictions = this.pendingComparisons
                .map(id => {
                    const prediction = this.predictionHistory.find(p => p.id === id || p.result?.id === id);
                    return prediction 
                        ? {
                            id: prediction.id || prediction.result?.id,
                            type: prediction.type,
                            factor: prediction.type === 'single' ? prediction.factor : null,
                            factors: prediction.type === 'multi' ? prediction.factors : null,
                            probability: prediction.type === 'single' 
                                ? prediction.result.probability 
                                : prediction.result.combined_probability,
                            confidence: prediction.result.confidence,
                            result: prediction.result,
                            timestamp: prediction.timestamp,
                            league: prediction.league
                        }
                        : null;
                })
                .filter(p => p); // Remove any not found
            
            // Show loading state
            this._setLoadingState(true);
            
            // Generate comparison
            setTimeout(() => {
                // Generate comparison analysis result
                const analysisResult = this._analyzeComparisons(comparisonPredictions);
                
                // Display results
                this._displayComparisonResults(analysisResult);
                
                // Create visualization based on current mode
                this._updateComparisonVisualization(this.visualizationMode);
                
                // End loading state
                this._setLoadingState(false);
                
                // Track analytics
                analyticsService.trackEvent('predictions', 'comparison_generated', {
                    prediction_count: comparisonPredictions.length,
                    visualization_mode: this.visualizationMode
                });
            }, 1500);
            
        } catch (error) {
            Logger.error('Error generating comparison analysis:', error);
            this._setLoadingState(false);
            this._showPredictionError(error);
        }
    }
    
    /**
     * Analyze comparisons
     */
    _analyzeComparisons(predictions) {
        // Calculate average probability
        const avgProbability = predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length;
        
        // Calculate probability spread
        const minProb = Math.min(...predictions.map(p => p.probability));
        const maxProb = Math.max(...predictions.map(p => p.probability));
        const probSpread = maxProb - minProb;
        
        // Calculate average confidence
        const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
        
        // Identify common factors (for multi-factor predictions)
        const allFactors = new Set();
        const factorCounts = {};
        
        predictions.forEach(prediction => {
            if (prediction.type === 'single') {
                const factor = prediction.factor.toLowerCase();
                allFactors.add(factor);
                factorCounts[factor] = (factorCounts[factor] || 0) + 1;
            } else if (prediction.type === 'multi' && prediction.factors) {
                prediction.factors.forEach(factor => {
                    const factorLower = factor.toLowerCase();
                    allFactors.add(factorLower);
                    factorCounts[factorLower] = (factorCounts[factorLower] || 0) + 1;
                });
            }
        });
        
        // Find common factors (present in more than one prediction)
        const commonFactors = Object.entries(factorCounts)
            .filter(([_, count]) => count > 1)
            .map(([factor]) => factor);
        
        // Sort predictions by probability
        const sortedByProbability = [...predictions].sort((a, b) => b.probability - a.probability);
        
        // Calculate correlation between predictions
        // This is simplified; real correlation would be more complex
        let correlationLevel = 'Low';
        if (probSpread < 0.1) {
            correlationLevel = 'High';
        } else if (probSpread < 0.2) {
            correlationLevel = 'Medium';
        }
        
        // Generate insights based on analysis
        const insights = [
            `The average probability across all compared predictions is ${(avgProbability * 100).toFixed(1)}%`,
            `Probability spread between highest and lowest prediction is ${(probSpread * 100).toFixed(1)}%`,
            `The highest probability prediction is ${(maxProb * 100).toFixed(1)}%`
        ];
        
        if (commonFactors.length > 0) {
            insights.push(`Found ${commonFactors.length} common factors across predictions`);
        }
        
        // Generate recommendation
        let recommendation = '';
        if (avgProbability > 0.7) {
            recommendation = 'These predictions show high probability outcomes that are worth strong consideration.';
        } else if (avgProbability > 0.5) {
            recommendation = 'These predictions show moderate probability outcomes with reasonable chance of success.';
        } else {
            recommendation = 'These predictions show lower probability outcomes that carry higher risk.';
        }
        
        // Return analysis result
        return {
            predictions: predictions,
            avgProbability: avgProbability,
            probSpread: probSpread,
            minProb: minProb,
            maxProb: maxProb,
            avgConfidence: avgConfidence,
            commonFactors: commonFactors,
            correlationLevel: correlationLevel,
            insights: insights,
            recommendation: recommendation,
            sortedByProbability: sortedByProbability,
            timestamp: Date.now()
        };
    }
    
    /**
     * Display comparison results
     */
    _displayComparisonResults(analysisResult) {
        const resultsContainer = this.container.querySelector('#comparison-results');
        
        if (!resultsContainer) return;
        
        // Show comparison results container
        resultsContainer.classList.remove('d-none');
        
        // Hide prediction results if visible
        const predictionResults = this.container.querySelector('#prediction-results');
        if (predictionResults) {
            predictionResults.classList.add('d-none');
        }
        
        // Show visualization container
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        if (visualizationContainer) {
            visualizationContainer.classList.remove('d-none');
        }
        
        // Build comparison results HTML
        resultsContainer.innerHTML = `
            <div class="comparison-result-card bg-white rounded-lg shadow-sm p-4">
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-start">
                        <h4 class="comparison-title">Prediction Comparison Analysis</h4>
                        <button class="btn btn-sm btn-outline-primary export-comparison-btn">
                            <i class="fas fa-download"></i> Export
                        </button>
                    </div>
                    <p class="text-muted mb-0 text-sm">
                        Comparing ${analysisResult.predictions.length} predictions
                    </p>
                </div>
                
                <div class="row mb-4">
                    <div class="col-md-4">
                        <div class="stat-card p-3 bg-light rounded mb-3">
                            <h6>Average Probability</h6>
                            <div class="d-flex align-items-center mt-2">
                                <div class="progress flex-grow-1 me-2" style="height: 8px;">
                                    <div class="progress-bar bg-${this._getProbabilityClass(analysisResult.avgProbability * 100)}" 
                                        role="progressbar" 
                                        style="width: ${analysisResult.avgProbability * 100}%;"
                                        aria-valuenow="${analysisResult.avgProbability * 100}" 
                                        aria-valuemin="0" 
                                        aria-valuemax="100">
                                    </div>
                                </div>
                                <span class="font-weight-bold">${(analysisResult.avgProbability * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-4">
                        <div class="stat-card p-3 bg-light rounded mb-3">
                            <h6>Probability Range</h6>
                            <div class="d-flex justify-content-between mt-2">
                                <span class="text-danger">${(analysisResult.minProb * 100).toFixed(1)}%</span>
                                <span class="text-success">${(analysisResult.maxProb * 100).toFixed(1)}%</span>
                            </div>
                            <div class="progress mt-1" style="height: 8px;">
                                <div class="progress-bar bg-danger" 
                                    role="progressbar" 
                                    style="width: ${analysisResult.minProb * 100}%;">
                                </div>
                                <div class="progress-bar bg-warning" 
                                    role="progressbar" 
                                    style="width: ${analysisResult.probSpread * 100}%;">
                                </div>
                            </div>
                            <div class="text-xs text-muted mt-1">
                                Spread: ${(analysisResult.probSpread * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-4">
                        <div class="stat-card p-3 bg-light rounded mb-3">
                            <h6>Correlation</h6>
                            <div class="d-flex align-items-center mt-2">
                                <span class="badge ${
                                    analysisResult.correlationLevel === 'High' ? 'bg-danger' :
                                    analysisResult.correlationLevel === 'Medium' ? 'bg-warning' :
                                    'bg-info'
                                }">
                                    ${analysisResult.correlationLevel}
                                </span>
                                <div class="ms-2 text-sm text-muted">
                                    ${
                                        analysisResult.correlationLevel === 'High' ? 'Highly correlated predictions' :
                                        analysisResult.correlationLevel === 'Medium' ? 'Moderately correlated predictions' :
                                        'Low correlation between predictions'
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mb-4">
                    <h5 class="mb-3">Compared Predictions</h5>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Prediction</th>
                                    <th>Probability</th>
                                    <th>Confidence</th>
                                    ${analysisResult.predictions.some(p => p.league) ? '<th>League</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${analysisResult.sortedByProbability.map(prediction => `
                                    <tr>
                                        <td class="text-sm">
                                            ${prediction.type === 'single' 
                                                ? prediction.factor 
                                                : `Multi-Factor (${prediction.factors?.length || 0} factors)`
                                            }
                                        </td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="progress me-2" style="width: 60px; height: 8px;">
                                                    <div class="progress-bar bg-${this._getProbabilityClass(prediction.probability * 100)}" 
                                                        role="progressbar" 
                                                        style="width: ${prediction.probability * 100}%;"
                                                        aria-valuenow="${prediction.probability * 100}" 
                                                        aria-valuemin="0" 
                                                        aria-valuemax="100">
                                                    </div>
                                                </div>
                                                <span class="text-sm">${(prediction.probability * 100).toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge bg-${this._getConfidenceClass(prediction.confidence)}">
                                                ${(prediction.confidence * 100).toFixed(0)}%
                                            </span>
                                        </td>
                                        ${analysisResult.predictions.some(p => p.league) ? `
                                            <td>
                                                ${prediction.league 
                                                    ? `<span class="badge bg-light text-dark">${prediction.league.replace('_', ' ').toUpperCase()}</span>` 
                                                    : '-'
                                                }
                                            </td>
                                        ` : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                ${analysisResult.commonFactors.length > 0 ? `
                    <div class="common-factors mb-4">
                        <h6>Common Factors</h6>
                        <ul class="common-factors-list text-sm">
                            ${analysisResult.commonFactors.map(factor => `
                                <li>${factor}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                <div class="insights-section border-top pt-3 mt-2">
                    <h6>Analysis Insights</h6>
                    <ul class="text-sm">
                        ${analysisResult.insights.map(insight => `
                            <li>${insight}</li>
                        `).join('')}
                    </ul>
                    <div class="recommendation p-3 mt-3 bg-light rounded">
                        <h6>Recommendation</h6>
                        <p class="text-sm mb-0">${analysisResult.recommendation}</p>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        resultsContainer.querySelector('.export-comparison-btn')?.addEventListener('click', () => {
            this._exportComparisonAnalysis(analysisResult);
        });
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    /**
     * Update comparison visualization based on visualization mode
     */
    _updateComparisonVisualization(visualizationMode) {
        const container = this.container.querySelector('#prediction-visualization');
        
        if (!container || this.pendingComparisons.length === 0) {
            return;
        }
        
        // Get prediction objects from IDs
        const comparisonPredictions = this.pendingComparisons
            .map(id => {
                const prediction = this.predictionHistory.find(p => p.id === id || p.result?.id === id);
                return prediction 
                    ? {
                        id: prediction.id || prediction.result?.id,
                        type: prediction.type,
                        factor: prediction.type === 'single' ? prediction.factor : null,
                        factors: prediction.type === 'multi' ? prediction.factors : null,
                        probability: prediction.type === 'single' 
                            ? prediction.result.probability 
                            : prediction.result.combined_probability,
                        confidence: prediction.result.confidence,
                        result: prediction.result,
                        timestamp: prediction.timestamp,
                        league: prediction.league
                    }
                    : null;
            })
            .filter(p => p); // Remove any not found
        
        // Clear previous visualization
        container.innerHTML = '';
        
        // Create title
        const title = document.createElement('h6');
        title.className = 'text-center mb-3';
        title.textContent = 'Prediction Comparison Visualization';
        container.appendChild(title);
        
        // Create visualization based on mode
        switch (visualizationMode) {
            case 'bar':
                this._createBarChartComparison(comparisonPredictions, container);
                break;
            case 'radar':
                this._createRadarChartComparison(comparisonPredictions, container);
                break;
            case 'probability':
                this._createProbabilityDistributionComparison(comparisonPredictions, container);
                break;
            default:
                this._createBarChartComparison(comparisonPredictions, container);
        }
    }
    
    /**
     * Create bar chart comparison visualization
     */
    _createBarChartComparison(predictions, container) {
        // Create SVG for bar chart
        const width = 600;
        const height = 400;
        const margin = { top: 40, right: 30, bottom: 100, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleBand()
            .domain(predictions.map((_, i) => `Pred ${i + 1}`))
            .range([margin.left, width - margin.right])
            .padding(0.2);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([height - margin.bottom, margin.top]);
        
        // Create axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em');
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale).ticks(10, '%'));
        
        // Create bars
        svg.selectAll('.bar')
            .data(predictions)
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', (d, i) => xScale(`Pred ${i + 1}`))
            .attr('y', d => yScale(d.probability))
            .attr('width', xScale.bandwidth())
            .attr('height', d => height - margin.bottom - yScale(d.probability))
            .attr('fill', d => this._getProbabilityColor(d.probability * 100));
        
        // Add probability labels
        svg.selectAll('.bar-label')
            .data(predictions)
            .enter()
            .append('text')
            .attr('class', 'bar-label')
            .attr('x', (d, i) => xScale(`Pred ${i + 1}`) + xScale.bandwidth() / 2)
            .attr('y', d => yScale(d.probability) - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text(d => `${(d.probability * 100).toFixed(1)}%`);
        
        // Add average line
        const avgProbability = predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length;
        
        svg.append('line')
            .attr('x1', margin.left)
            .attr('y1', yScale(avgProbability))
            .attr('x2', width - margin.right)
            .attr('y2', yScale(avgProbability))
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        svg.append('text')
            .attr('x', width - margin.right)
            .attr('y', yScale(avgProbability) - 5)
            .attr('text-anchor', 'end')
            .attr('font-size', '12px')
            .attr('fill', 'red')
            .text(`Average: ${(avgProbability * 100).toFixed(1)}%`);
        
        // Add tooltips with prediction details
        svg.selectAll('.bar')
            .append('title')
            .text((d, i) => {
                const factor = d.type === 'single' 
                    ? d.factor 
                    : `Multi-Factor (${d.factors?.length || 0} factors)`;
                
                return `${factor}\nProbability: ${(d.probability * 100).toFixed(1)}%\nConfidence: ${(d.confidence * 100).toFixed(0)}%`;
            });
        
        // Add legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width / 2}, ${height - 20})`);
        
        legend.append('text')
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Prediction comparison by probability');
    }
    
    /**
     * Create radar chart comparison visualization
     */
    _createRadarChartComparison(predictions, container) {
        // We need at least 3 data points for a radar chart
        // If fewer, fall back to bar chart
        if (predictions.length < 3) {
            this._createBarChartComparison(predictions, container);
            return;
        }
        
        // Create dimensions for radar chart
        // We'll use probability, confidence, and a calculated "value" metric
        const dimensions = [
            { name: 'Probability', key: 'probability' },
            { name: 'Confidence', key: 'confidence' },
            { name: 'Value', key: 'value' } // Will calculate this
        ];
        
        // Calculate "value" for each prediction (simplified example)
        predictions.forEach(pred => {
            pred.value = pred.probability * pred.confidence;
        });
        
        // Create SVG for radar chart
        const width = 600;
        const height = 500;
        const margin = 60;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - margin;
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales for each dimension
        const angleScale = d3.scaleLinear()
            .domain([0, dimensions.length])
            .range([0, 2 * Math.PI]);
        
        const radiusScale = d3.scaleLinear()
            .domain([0, 1])
            .range([0, radius]);
        
        // Create radar grid lines
        const gridLevels = 5;
        for (let level = 1; level <= gridLevels; level++) {
            const r = radius * level / gridLevels;
            
            svg.append('circle')
                .attr('cx', centerX)
                .attr('cy', centerY)
                .attr('r', r)
                .attr('fill', 'none')
                .attr('stroke', '#ddd')
                .attr('stroke-width', 1);
            
            // Add level labels (percentages)
            svg.append('text')
                .attr('x', centerX)
                .attr('y', centerY - r)
                .attr('dy', -5)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('fill', '#999')
                .text(`${(level / gridLevels * 100).toFixed(0)}%`);
        }
        
        // Create radar axes
        for (let i = 0; i < dimensions.length; i++) {
            const angle = angleScale(i);
            const line = svg.append('line')
                .attr('x1', centerX)
                .attr('y1', centerY)
                .attr('x2', centerX + radius * Math.sin(angle))
                .attr('y2', centerY - radius * Math.cos(angle))
                .attr('stroke', '#999')
                .attr('stroke-width', 1);
            
            // Add axis labels
            svg.append('text')
                .attr('x', centerX + (radius + 15) * Math.sin(angle))
                .attr('y', centerY - (radius + 15) * Math.cos(angle))
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .text(dimensions[i].name);
        }
        
        // Create radar paths for each prediction
        predictions.forEach((prediction, predIndex) => {
            const points = dimensions.map((dim, i) => {
                const angle = angleScale(i);
                const value = prediction[dim.key];
                return {
                    x: centerX + radiusScale(value) * Math.sin(angle),
                    y: centerY - radiusScale(value) * Math.cos(angle)
                };
            });
            
            // Close the path by repeating the first point
            points.push(points[0]);
            
            // Create line generator
            const lineGenerator = d3.line()
                .x(d => d.x)
                .y(d => d.y);
            
            // Draw path
            svg.append('path')
                .datum(points)
                .attr('fill', this._getProbabilityColor(prediction.probability * 100))
                .attr('fill-opacity', 0.3)
                .attr('stroke', this._getProbabilityColor(prediction.probability * 100))
                .attr('stroke-width', 2)
                .attr('d', lineGenerator);
            
            // Add prediction points
            dimensions.forEach((dim, dimIndex) => {
                const angle = angleScale(dimIndex);
                const value = prediction[dim.key];
                
                svg.append('circle')
                    .attr('cx', centerX + radiusScale(value) * Math.sin(angle))
                    .attr('cy', centerY - radiusScale(value) * Math.cos(angle))
                    .attr('r', 4)
                    .attr('fill', this._getProbabilityColor(prediction.probability * 100));
            });
        });
        
        // Add legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - 150}, 20)`);
        
        predictions.forEach((prediction, i) => {
            legend.append('rect')
                .attr('x', 0)
                .attr('y', i * 20)
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', this._getProbabilityColor(prediction.probability * 100));
            
            legend.append('text')
                .attr('x', 20)
                .attr('y', i * 20 + 10)
                .attr('font-size', '12px')
                .text(`Pred ${i + 1}: ${(prediction.probability * 100).toFixed(1)}%`);
        });
    }
    
    /**
     * Create probability distribution comparison visualization
     */
    _createProbabilityDistributionComparison(predictions, container) {
        // Create SVG for distribution chart
        const width = 600;
        const height = 400;
        const margin = { top: 40, right: 100, bottom: 60, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleLinear()
            .domain([0, 1])
            .range([margin.left, width - margin.right]);
        
        const yScale = d3.scaleLinear()
            .domain([0, 1]) // Will adjust later
            .range([height - margin.bottom, margin.top]);
        
        // Create axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(10, '%'));
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale));
        
        // Generate distribution data for each prediction
        const distributionData = predictions.map(prediction => ({
            id: prediction.id,
            label: `Pred ${predictions.indexOf(prediction) + 1}`,
            probability: prediction.probability,
            confidence: prediction.confidence,
            color: this._getProbabilityColor(prediction.probability * 100),
            distribution: this._generateProbabilityDistribution(prediction.probability, prediction.confidence)
        }));
        
        // Update y-scale domain based on max density
        const maxDensity = d3.max(
            distributionData.flatMap(d => d.distribution.map(p => p.density))
        );
        yScale.domain([0, maxDensity]);
        
        // Update y-axis
        svg.select('g').call(d3.axisLeft(yScale));
        
        // Create line generator
        const lineGenerator = d3.line()
            .x(d => xScale(d.probability))
            .y(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Create area generator
        const areaGenerator = d3.area()
            .x(d => xScale(d.probability))
            .y0(height - margin.bottom)
            .y1(d => yScale(d.density))
            .curve(d3.curveBasis);
        
        // Draw distribution curves for each prediction
        distributionData.forEach(data => {
            // Draw area under curve
            svg.append('path')
                .datum(data.distribution)
                .attr('fill', data.color)
                .attr('fill-opacity', 0.2)
                .attr('d', areaGenerator);
            
            // Draw line
            svg.append('path')
                .datum(data.distribution)
                .attr('fill', 'none')
                .attr('stroke', data.color)
                .attr('stroke-width', 2)
                .attr('d', lineGenerator);
            
            // Draw vertical line at probability point
            svg.append('line')
                .attr('x1', xScale(data.probability))
                .attr('y1', height - margin.bottom)
                .attr('x2', xScale(data.probability))
                .attr('y2', yScale(data.distribution.find(p => p.probability === data.probability)?.density || 0))
                .attr('stroke', data.color)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3');
            
            // Add probability label
            svg.append('text')
                .attr('x', xScale(data.probability))
                .attr('y', height - margin.bottom + 15)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('fill', data.color)
                .text(`${(data.probability * 100).toFixed(1)}%`);
        });
        
        // Add legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - 90}, 50)`);
        
        distributionData.forEach((data, i) => {
            legend.append('rect')
                .attr('x', 0)
                .attr('y', i * 20)
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', data.color);
            
            legend.append('text')
                .attr('x', 20)
                .attr('y', i * 20 + 10)
                .attr('font-size', '12px')
                .text(`${data.label}`);
        });
        
        // Add axis labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Probability');
        
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', margin.left - 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .text('Density');
    }
    
    /**
     * Export comparison analysis
     */
    _exportComparisonAnalysis(analysisResult) {
        const exportOptions = [
            { label: 'PDF Report', icon: 'file-pdf', value: 'pdf' },
            { label: 'CSV Data', icon: 'file-csv', value: 'csv' },
            { label: 'PNG Image', icon: 'image', value: 'image' }
        ];
        
        // Create export dialog
        const dialog = document.createElement('div');
        dialog.className = 'export-dialog card position-fixed start-50 top-50 translate-middle shadow-lg rounded-lg';
        dialog.style.zIndex = '1050';
        dialog.style.width = '300px';
        
        dialog.innerHTML = `
            <div class="card-header bg-primary text-white py-2">
                <h6 class="mb-0">Export Comparison</h6>
            </div>
            <div class="card-body">
                <p class="text-sm text-muted mb-3">Choose export format:</p>
                <div class="export-options">
                    ${exportOptions.map(option => `
                        <button class="btn btn-outline-secondary w-100 text-start mb-2 export-option" data-format="${option.value}">
                            <i class="fas fa-${option.icon} me-2"></i> ${option.label}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="card-footer d-flex justify-content-end py-2">
                <button class="btn btn-sm btn-secondary cancel-export-btn">Cancel</button>
            </div>
        `;
        
        // Add dialog to document
        document.body.appendChild(dialog);
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.style.zIndex = '1040';
        document.body.appendChild(backdrop);
        
        // Add event listeners
        dialog.querySelectorAll('.export-option').forEach(button => {
            button.addEventListener('click', () => {
                const format = button.getAttribute('data-format');
                this._performComparisonExport(analysisResult, format);
                
                // Remove dialog and backdrop
                dialog.remove();
                backdrop.remove();
            });
        });
        
        dialog.querySelector('.cancel-export-btn').addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });
    }
    
    /**
     * Perform comparison export
     */
    _performComparisonExport(analysisResult, format) {
        // Show loading notification
        notificationService.showNotification(`Preparing ${format.toUpperCase()} export...`, 'info');
        
        try {
            switch (format) {
                case 'pdf':
                    exportService.exportComparisonToPDF(analysisResult);
                    break;
                case 'csv':
                    exportService.exportComparisonToCSV(analysisResult);
                    break;
                case 'image':
                    exportService.exportComparisonToImage(analysisResult);
                    break;
            }
            
            // Track export analytics
            analyticsService.trackEvent('predictions', 'export_comparison', {
                format: format,
                prediction_count: analysisResult.predictions.length
            });
            
        } catch (error) {
            Logger.error(`Error exporting comparison as ${format}:`, error);
            notificationService.showNotification(`Failed to export as ${format.toUpperCase()}`, 'error');
        }
    }
    
    /**
     * Export prediction
     */
    _exportPrediction(prediction, format = 'pdf') {
        if (!prediction) {
            notificationService.showNotification('No prediction to export', 'warning');
            return;
        }
        
        // Show loading notification
        notificationService.showNotification(`Preparing ${format.toUpperCase()} export...`, 'info');
        
        try {
            switch (format) {
                case 'pdf':
                    exportService.exportPredictionToPDF(prediction);
                    break;
                case 'csv':
                    exportService.exportPredictionToCSV(prediction);
                    break;
                case 'image':
                    exportService.exportPredictionToImage(prediction);
                    break;
            }
            
            // Track export analytics
            analyticsService.trackEvent('predictions', 'export_prediction', {
                format: format,
                prediction_type: prediction.type || 'single'
            });
            
        } catch (error) {
            Logger.error(`Error exporting prediction as ${format}:`, error);
            notificationService.showNotification(`Failed to export as ${format.toUpperCase()}`, 'error');
        }
    }
    
    /**
     * Export all predictions
     */
    _exportAllPredictions() {
        if (this.predictionHistory.length === 0) {
            notificationService.showNotification('No predictions to export', 'warning');
            return;
        }
        
        // Show loading notification
        notificationService.showNotification('Preparing data export...', 'info');
        
        try {
            // Export all prediction history
            exportService.exportAllPredictions(this.predictionHistory);
            
            // Track export analytics
            analyticsService.trackEvent('predictions', 'export_all_predictions', {
                prediction_count: this.predictionHistory.length
            });
            
        } catch (error) {
            Logger.error('Error exporting all predictions:', error);
            notificationService.showNotification('Failed to export predictions', 'error');
        }
    }
    
    /**
     * Share prediction
     */
    _sharePrediction(prediction) {
        if (!prediction) {
            notificationService.showNotification('No prediction to share', 'warning');
            return;
        }
        
        // Show sharing modal
        const modal = document.getElementById('shareModal');
        
        if (!modal) return;
        
        // Generate share preview
        const previewContainer = modal.querySelector('.share-preview');
        if (previewContainer) {
            previewContainer.innerHTML = this._generateSharePreview(prediction);
        }
        
        // Generate share link
        const shareLink = this._generateShareLink(prediction);
        const linkInput = modal.querySelector('#share-link');
        if (linkInput) {
            linkInput.value = shareLink;
        }
        
        // Update share buttons with link
        this._updateShareButtons(shareLink, prediction);
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Track share attempt
        analyticsService.trackEvent('predictions', 'share_prediction_opened', {
            prediction_type: prediction.type || 'single'
        });
    }
    
    /**
     * Generate share preview
     */
    _generateSharePreview(prediction) {
        // Determine if single or multi-factor prediction
        const isSingleFactor = !prediction.combined_probability;
        const probability = isSingleFactor 
            ? prediction.probability * 100 
            : prediction.combined_probability * 100;
        
        // Get prediction content
        const content = isSingleFactor
            ? prediction.raw_factor || prediction.factor || 'Prediction'
            : `Multi-Factor Prediction (${prediction.factors?.length || 0} factors)`;
        
        return `
            <div class="share-preview-card bg-white rounded border p-3">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-1">${content}</h6>
                        <div class="text-sm text-muted">Sports Predictions Ultra</div>
                    </div>
                    <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                        ${probability.toFixed(1)}%
                    </span>
                </div>
                
                <div class="preview-footer d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                    <small class="text-muted">
                        ${new Date().toLocaleDateString()}
                    </small>
                    <img src="/images/logo-small.png" alt="Logo" height="16">
                </div>
            </div>
        `;
    }
    
    /**
     * Generate share link
     */
    _generateShareLink(prediction) {
        // Generate a unique identifier for prediction
        const predictionId = prediction.id || `pred_${Date.now()}`;
        
        // Create sharing parameters
        const params = new URLSearchParams();
        params.append('id', predictionId);
        params.append('type', prediction.combined_probability ? 'multi' : 'single');
        
        // Generate share URL
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/share/prediction?${params.toString()}`;
        
        return shareUrl;
    }
    
    /**
     * Update share buttons with link and data
     */
    _updateShareButtons(shareLink, prediction) {
        // Prepare share message
        const isSingleFactor = !prediction.combined_probability;
        const probability = isSingleFactor 
            ? prediction.probability * 100 
            : prediction.combined_probability * 100;
            
        const content = isSingleFactor
            ? prediction.raw_factor || prediction.factor || 'Prediction'
            : `Multi-Factor Prediction`;
            
        const shareMessage = `Check out my prediction: ${content} - ${probability.toFixed(1)}% probability`;
        
        // Update Twitter share
        const twitterBtn = document.getElementById('share-twitter');
        if (twitterBtn) {
            const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(shareLink)}`;
            twitterBtn.addEventListener('click', () => {
                window.open(twitterUrl, '_blank', 'width=550,height=420');
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'twitter'
                });
            });
        }
        
        // Update Facebook share
        const facebookBtn = document.getElementById('share-facebook');
        if (facebookBtn) {
            const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`;
            facebookBtn.addEventListener('click', () => {
                window.open(facebookUrl, '_blank', 'width=550,height=420');
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'facebook'
                });
            });
        }
        
        // Update WhatsApp share
        const whatsappBtn = document.getElementById('share-whatsapp');
        if (whatsappBtn) {
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage + ' ' + shareLink)}`;
            whatsappBtn.addEventListener('click', () => {
                window.open(whatsappUrl, '_blank');
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'whatsapp'
                });
            });
        }
        
        // Update Email share
        const emailBtn = document.getElementById('share-email');
        if (emailBtn) {
            const subject = 'Check out my sports prediction';
            const body = `${shareMessage}\n\nView the prediction here: ${shareLink}`;
            const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            
            emailBtn.addEventListener('click', () => {
                window.location.href = mailtoUrl;
                
                // Track share
                analyticsService.trackEvent('predictions', 'share_prediction', {
                    platform: 'email'
                });
            });
        }
    }
    
    /**
     * Share prediction result to social media
     */
    _shareToSocialMedia(platform) {
        const modal = document.getElementById('shareModal');
        if (!modal) return;
        
        const shareLink = modal.querySelector('#share-link')?.value;
        if (!shareLink) return;
        
        // Close modal
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal.hide();
        
        // Show success notification
        notificationService.showNotification(`Shared to ${platform}`, 'success');
    }
    
    /**
     * Show settings modal
     */
    _showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        
        if (!modal) return;
        
        // Populate settings with current values
        this._populateSettingsForm();
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
    
    /**
     * Populate settings form with current values
     */
    _populateSettingsForm() {
        // Visualization detail
        const visualizationDetail = document.getElementById('visualization-detail');
        if (visualizationDetail) {
            visualizationDetail.value = this.userPreferences.visualizationPreference || 'standard';
        }
        
        // Theme preference
        const themePreference = document.getElementById('theme-preference');
        if (themePreference) {
            themePreference.value = this.userPreferences.theme || 'auto';
        }
        
        // Default league
        const defaultLeague = document.getElementById('default-league');
        if (defaultLeague) {
            defaultLeague.value = this.userPreferences.defaultLeague || 'all';
        }
        
        // Live updates enabled
        const liveUpdatesEnabled = document.getElementById('live-updates-enabled');
        if (liveUpdatesEnabled) {
            liveUpdatesEnabled.checked = this.userPreferences.liveUpdatesEnabled !== false;
        }
        
        // Notifications enabled
        const notificationsEnabled = document.getElementById('notifications-enabled');
        if (notificationsEnabled) {
            notificationsEnabled.checked = this.userPreferences.notificationsEnabled !== false;
        }
        
        // Accessibility options
        const highContrastMode = document.getElementById('high-contrast-mode');
        if (highContrastMode) {
            highContrastMode.checked = this.userPreferences.highContrastMode === true;
        }
        
        const largerText = document.getElementById('larger-text');
        if (largerText) {
            largerText.checked = this.userPreferences.largerText === true;
        }
    }
    
    /**
     * Save user settings
     */
    async _saveUserSettings() {
        // Collect settings values
        const visualizationDetail = document.getElementById('visualization-detail')?.value || 'standard';
        const themePreference = document.getElementById('theme-preference')?.value || 'auto';
        const defaultLeague = document.getElementById('default-league')?.value || 'all';
        const liveUpdatesEnabled = document.getElementById('live-updates-enabled')?.checked ?? true;
        const notificationsEnabled = document.getElementById('notifications-enabled')?.checked ?? true;
        const highContrastMode = document.getElementById('high-contrast-mode')?.checked ?? false;
        const largerText = document.getElementById('larger-text')?.checked ?? false;
        
        // Update user preferences
        this.userPreferences = {
            ...this.userPreferences,
            visualizationPreference: visualizationDetail,
            theme: themePreference,
            defaultLeague: defaultLeague,
            liveUpdatesEnabled: liveUpdatesEnabled,
            notificationsEnabled: notificationsEnabled,
            highContrastMode: highContrastMode,
            largerText: largerText
        };
        
        // Apply settings
        this._applyUserSettings();
        
        // Save to server if online
        if (!this.offlineMode) {
            try {
                await apiClient.post('/api/users/preferences', {
                    preferences: this.userPreferences
                }, {
                    headers: {
                        'Authorization': `Bearer ${authService.getToken()}`,
                        'X-API-Key': API_CONFIG.predictionApiKey
                    }
                });
            } catch (error) {
                Logger.error('Error saving user preferences:', error);
            }
        }
        
        // Save to IndexedDB for offline access
        try {
            const db = await this._getIndexedDBInstance();
            const transaction = db.transaction(['userPreferences'], 'readwrite');
            const store = transaction.objectStore('userPreferences');
            
            await store.put({
                id: 'userPrefs',
                data: this.userPreferences,
                dashboardConfig: this.customDashboardConfig,
                updatedAt: Date.now()
            });
        } catch (error) {
            Logger.error('Error saving preferences to IndexedDB:', error);
        }
        
        // Close modal
        const modal = document.getElementById('settingsModal');
        if (modal) {
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
        }
        
        // Show notification
        notificationService.showNotification('Settings saved successfully', 'success');
        
        // Track settings update
        analyticsService.trackEvent('predictions', 'settings_updated', {
            theme: themePreference,
            visualization: visualizationDetail,
            accessibility: {
                high_contrast: highContrastMode,
                larger_text: largerText
            }
        });
        
        // Publish event
        eventBus.publish('preferences:updated', this.userPreferences);
    }
    
    /**
     * Apply user settings
     */
    _applyUserSettings() {
        // Apply visualization preference
        this.visualizationMode = this.userPreferences.visualizationPreference || 'standard';
        
        // Apply theme
        const theme = this.userPreferences.theme || 'auto';
        document.documentElement.setAttribute('data-theme', theme);
        
        // Apply accessibility settings
        if (this.userPreferences.highContrastMode) {
            document.body.classList.add('high-contrast-mode');
        } else {
            document.body.classList.remove('high-contrast-mode');
        }
        
        if (this.userPreferences.largerText) {
            document.body.classList.add('larger-text');
        } else {
            document.body.classList.remove('larger-text');
        }
        
        // Apply default league
        if (this.currentLeague === 'all') {
            this.currentLeague = this.userPreferences.defaultLeague || 'all';
            const leagueButton = this.container.querySelector(`[data-league="${this.currentLeague}"]`);
            if (leagueButton) {
                leagueButton.click();
            }
        }
        
        // Apply notification settings
        notificationService.setEnabled(this.userPreferences.notificationsEnabled !== false);
        
        // Apply WebSocket connection based on live updates setting
        if (this.userPreferences.liveUpdatesEnabled === false) {
            if (this.webSocketConnection) {
                this.webSocketConnection.close();
                this.webSocketConnection = null;
            }
        } else if (!this.webSocketConnection && !this.offlineMode) {
            this._connectToWebSocket();
        }
    }
    
    /**
     * Handle preferences updated event
     */
    _handlePreferencesUpdated(preferences) {
        // Update local preferences
        this.userPreferences = preferences;
        
        // Apply settings
        this._applyUserSettings();
        
        // Re-render UI if needed
        if (this.currentPrediction) {
            this._displayPredictionResults(
                this.currentPrediction, 
                this.currentPrediction.combined_probability !== undefined
            );
        }
    }
    
    /**
     * Handle league changed event
     */
    _handleLeagueChanged(league) {
        this.currentLeague = league;
        
        // Update prediction history display
        this._updatePredictionHistory();
        
        // Update league context in prediction inputs
        this._updateLeagueContext(league);
    }
    
    /**
     * Toggle personalized dashboard
     */
    _togglePersonalizedDashboard() {
        const dashboard = this.container.querySelector('#personalized-dashboard');
        
        if (!dashboard) return;
        
        const isVisible = !dashboard.classList.contains('d-none');
        
        if (isVisible) {
            dashboard.classList.add('d-none');
        } else {
            dashboard.classList.remove('d-none');
            this._renderPersonalizedDashboard();
            
            // Scroll to dashboard
            dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Track dashboard view
            analyticsService.trackEvent('predictions', 'dashboard_viewed');
        }
    }
    
    /**
     * Render personalized dashboard
     */
    _renderPersonalizedDashboard() {
        const dashboard = this.container.querySelector('#personalized-dashboard');
        
        if (!dashboard) return;
        
        const dashboardContent = dashboard.querySelector('.dashboard-content');
        
        if (!dashboardContent) return;
        
        // Show loading
        dashboardContent.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-3">Loading your personalized dashboard...</p>
            </div>
        `;
        
        // Get dashboard data
        if (this.offlineMode) {
            // Use cached dashboard
            this._renderDashboardWithLocalData(dashboardContent);
        } else {
            // Fetch from server
            this._fetchAndRenderDashboard(dashboardContent);
        }
    }
    
    /**
     * Render dashboard with local data
     */
    _renderDashboardWithLocalData(container) {
        // Use prediction history to generate insights
        setTimeout(() => {
            if (this.predictionHistory.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-4">
                        <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                        <h5>No Prediction Data Yet</h5>
                        <p class="text-muted">Make some predictions to see your personalized dashboard.</p>
                    </div>
                `;
                return;
            }
            
            // Generate dashboard content
            container.innerHTML = this._generateDashboardContent({
                predictions: this.predictionHistory,
                recentActivity: this.predictionHistory.slice(0, 5),
                trends: this._calculatePredictionTrends(),
                favoriteLeagues: this._calculateFavoriteLeagues(),
                insights: this._generateLocalInsights()
            });
            
            // Initialize dashboard charts
            this._initializeDashboardCharts();
            
        }, 1000);
    }
    
    /**
     * Fetch and render dashboard from server
     */
    async _fetchAndRenderDashboard(container) {
        try {
            const response = await apiClient.get('/api/users/dashboard', {
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'X-API-Key': API_CONFIG.predictionApiKey
                }
            });
            
            if (response.status === 'success') {
                // Render dashboard with server data
                container.innerHTML = this._generateDashboardContent(response.data);
                
                // Initialize dashboard charts
                this._initializeDashboardCharts();
                
                // Cache dashboard data for offline use
                this.customDashboardConfig = response.data.dashboardConfig;
                
                // Save to IndexedDB
                try {
                    const db = await this._getIndexedDBInstance();
                    const transaction = db.transaction(['userPreferences'], 'readwrite');
                    const store = transaction.objectStore('userPreferences');
                    
                    const userPrefs = await store.get('userPrefs');
                    
                    if (userPrefs && userPrefs.result) {
                        userPrefs.result.dashboardConfig = response.data.dashboardConfig;
                        userPrefs.result.dashboardData = response.data;
                        userPrefs.result.updatedAt = Date.now();
                        
                        await store.put(userPrefs.result);
                    } else {
                        await store.put({
                            id: 'userPrefs',
                            data: this.userPreferences,
                            dashboardConfig: response.data.dashboardConfig,
                            dashboardData: response.data,
                            updatedAt: Date.now()
                        });
                    }
                } catch (error) {
                    Logger.error('Error caching dashboard data:', error);
                }
            } else {
                throw new Error(response.message || 'Failed to load dashboard');
            }
        } catch (error) {
            Logger.error('Error fetching dashboard data:', error);
            
            // Show error state
            container.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                    <h5>Could Not Load Dashboard</h5>
                    <p class="text-muted mb-3">${error.message || 'An error occurred while loading your dashboard'}</p>
                    <button class="btn btn-primary retry-dashboard-btn">
                        <i class="fas fa-sync-alt me-2"></i> Retry
                    </button>
                </div>
            `;
            
            // Add retry event listener
            container.querySelector('.retry-dashboard-btn')?.addEventListener('click', () => {
                this._renderPersonalizedDashboard();
            });
            
            // Fall back to local data
            if (this.predictionHistory.length > 0) {
                container.innerHTML += `
                    <div class="mt-4 pt-4 border-top">
                        <h5 class="mb-3">Local Insights</h5>
                        ${this._generateLocalInsightsHTML()}
                    </div>
                `;
            }
        }
    }
    
    /**
     * Generate dashboard content
     */
    _generateDashboardContent(data) {
        return `
            <div class="dashboard-container">
                <!-- Summary stats -->
                <div class="row mb-4">
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Total Predictions</h6>
                            <h3>${data.predictions?.length || 0}</h3>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Avg Probability</h6>
                            <h3>${this._calculateAverageProbability().toFixed(1)}%</h3>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Resolved</h6>
                            <h3>${this._countResolvedPredictions()}</h3>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card p-3 bg-light rounded text-center mb-3">
                            <h6 class="text-muted">Accuracy</h6>
                            <h3>${this._calculateAccuracy().toFixed(0)}%</h3>
                        </div>
                    </div>
                </div>
                
                <!-- Probability trend chart -->
                <div class="row mb-4">
                    <div class="col-md-8">
                        <div class="card shadow-sm h-100">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Prediction Probability Trend</h5>
                            </div>
                            <div class="card-body">
                                <div id="probability-trend-chart" style="height: 300px;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card shadow-sm h-100">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Leagues</h5>
                            </div>
                            <div class="card-body">
                                <div id="leagues-distribution-chart" style="height: 300px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Insights and recent activity -->
                <div class="row">
                    <div class="col-md-6">
                        <div class="card shadow-sm mb-4">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Insights</h5>
                            </div>
                            <div class="card-body">
                                <ul class="insights-list">
                                    ${this._generateDashboardInsights().map(insight => `
                                        <li class="mb-3">
                                            <i class="fas fa-chart-line text-primary me-2"></i>
                                            ${insight}
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card shadow-sm mb-4">
                            <div class="card-header bg-white py-3">
                                <h5 class="mb-0">Recent Activity</h5>
                            </div>
                            <div class="card-body p-0">
                                <div class="list-group list-group-flush">
                                    ${this._generateRecentActivityItems()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Initialize dashboard charts
     */
    _initializeDashboardCharts() {
        // Initialize probability trend chart
        const trendChartContainer = document.getElementById('probability-trend-chart');
        if (trendChartContainer) {
            this._createProbabilityTrendChart(trendChartContainer);
        }
        
        // Initialize leagues distribution chart
        const leaguesChartContainer = document.getElementById('leagues-distribution-chart');
        if (leaguesChartContainer) {
            this._createLeaguesDistributionChart(leaguesChartContainer);
        }
    }
    
    /**
     * Create probability trend chart
     */
    _createProbabilityTrendChart(container) {
        // Get last 15 predictions
        const predictions = this.predictionHistory.slice(0, 15).reverse();
        
        if (predictions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <p>No prediction data available</p>
                </div>
            `;
            return;
        }
        
        // Prepare data
        const data = predictions.map((prediction, index) => {
            const probability = prediction.type === 'single'
                ? prediction.result.probability
                : prediction.result.combined_probability;
                
            return {
                index: index + 1,
                probability: probability * 100,
                date: new Date(prediction.timestamp || Date.now()).toLocaleDateString(),
                isResolved: prediction.resolved || false,
                isCorrect: prediction.resolvedResult?.correct || false
            };
        });
        
        // Create SVG
        const width = container.clientWidth;
        const height = container.clientHeight || 300;
        const margin = { top: 20, right: 30, bottom: 40, left: 40 };
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
        
        // Create scales
        const xScale = d3.scaleLinear()
            .domain([1, data.length])
            .range([margin.left, width - margin.right]);
        
        const yScale = d3.scaleLinear()
            .domain([0, 100])
            .range([height - margin.bottom, margin.top]);
        
        // Create line generator
        const lineGenerator = d3.line()
            .x(d => xScale(d.index))
            .y(d => yScale(d.probability))
            .curve(d3.curveMonotoneX);
        
        // Create axes
        svg.append('g')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(Math.min(data.length, 10)).tickFormat(i => {
                const dataPoint = data[Math.round(i) - 1];
                return dataPoint ? dataPoint.date : '';
            }))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .style('font-size', '10px');
        
        svg.append('g')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d}%`));
        
        // Draw grid lines
        svg.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale)
                .ticks(5)
                .tickSize(-(height - margin.top - margin.bottom))
                .tickFormat('')
            )
            .selectAll('line')
            .style('stroke', '#e0e0e0');
        
        svg.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale)
                .ticks(5)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat('')
            )
            .selectAll('line')
            .style('stroke', '#e0e0e0');
        
        // Draw 50% guideline
        svg.append('line')
            .attr('x1', margin.left)
            .attr('y1', yScale(50))
            .attr('x2', width - margin.right)
            .attr('y2', yScale(50))
            .attr('stroke', '#aaa')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3 3');
        
        // Draw line
        svg.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', '#4885ed')
            .attr('stroke-width', 2)
            .attr('d', lineGenerator);
        
        // Draw points
        svg.selectAll('.point')
            .data(data)
            .enter()
            .append('circle')
            .attr('class', 'point')
            .attr('cx', d => xScale(d.index))
            .attr('cy', d => yScale(d.probability))
            .attr('r', 5)
            .attr('fill', d => {
                if (!d.isResolved) return '#4885ed';
                return d.isCorrect ? '#28a745' : '#dc3545';
            })
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);
        
        // Add tooltips
        svg.selectAll('.point')
            .append('title')
            .text(d => `Date: ${d.date}\nProbability: ${d.probability.toFixed(1)}%${d.isResolved ? '\nResolved: ' + (d.isCorrect ? 'Correct' : 'Incorrect') : ''}`);
        
        // Add trend line
        if (data.length >= 3) {
            // Calculate linear regression
            const xValues = data.map(d => d.index);
            const yValues = data.map(d => d.probability);
            
            const xMean = d3.mean(xValues);
            const yMean = d3.mean(yValues);
            
            const ssxy = d3.sum(data.map((d, i) => (d.index - xMean) * (d.probability - yMean)));
            const ssxx = d3.sum(data.map(d => Math.pow(d.index - xMean, 2)));
            
            const slope = ssxy / ssxx;
            const intercept = yMean - slope * xMean;
            
            const x1 = 1;
            const y1 = slope * x1 + intercept;
            const x2 = data.length;
            const y2 = slope * x2 + intercept;
            
            svg.append('line')
                .attr('x1', xScale(x1))
                .attr('y1', yScale(y1))
                .attr('x2', xScale(x2))
                .attr('y2', yScale(y2))
                .attr('stroke', slope > 0 ? '#28a745' : '#dc3545')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5 5');
        }
    }
    
    /**
     * Create leagues distribution chart
     */
    _createLeaguesDistributionChart(container) {
        // Calculate league distribution
        const leagueCounts = {};
        
        this.predictionHistory.forEach(prediction => {
            const league = prediction.league || 'unknown';
            leagueCounts[league] = (leagueCounts[league] || 0) + 1;
        });
        
        // Convert to array for D3
        const data = Object.entries(leagueCounts).map(([league, count]) => ({
            league: league === 'unknown' ? 'Unspecified' : league.replace('_', ' ').toUpperCase(),
            count: count
        }));
        
        // Sort by count
        data.sort((a, b) => b.count - a.count);
        
        // If no data
        if (data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <p>No league data available</p>
                </div>
            `;
            return;
        }
        
        // Create pie chart
        const width = container.clientWidth;
        const height = container.clientHeight || 300;
        const radius = Math.min(width, height) / 2 * 0.8;
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .append('g')
            .attr('transform', `translate(${width / 2}, ${height / 2})`);
        
        // Create color scale
        const color = d3.scaleOrdinal()
            .domain(data.map(d => d.league))
            .range([
                '#4285F4', '#EA4335', '#FBBC05', '#34A853', 
                '#FF6D00', '#2979FF', '#00BFA5', '#D500F9',
                '#6200EA', '#AEEA00', '#FFD600', '#DD2C00'
            ]);
        
        // Create pie generator
        const pie = d3.pie()
            .value(d => d.count)
            .sort(null);
        
        // Create arc generator
        const arc = d3.arc()
            .innerRadius(radius * 0.5) // Donut chart
            .outerRadius(radius);
        
        // Draw pie
        const paths = svg.selectAll('path')
            .data(pie(data))
            .enter()
            .append('path')
            .attr('d', arc)
            .attr('fill', d => color(d.data.league))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('opacity', 0.8);
        
        // Add tooltips
        paths.append('title')
            .text(d => `${d.data.league}: ${d.data.count} predictions (${(d.data.count / this.predictionHistory.length * 100).toFixed(1)}%)`);
        
        // Add text labels for larger segments
        svg.selectAll('text')
            .data(pie(data))
            .enter()
            .filter(d => d.endAngle - d.startAngle > 0.25) // Only show labels for larger segments
            .append('text')
            .attr('transform', d => `translate(${arc.centroid(d)})`)
            .attr('dy', '.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .text(d => d.data.league);
        
        // Add center text
        svg.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0em')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .text(`${this.predictionHistory.length}`);
        
        svg.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.2em')
            .attr('font-size', '12px')
            .text('Predictions');
    }
    
    /**
     * Generate recent activity items
     */
    _generateRecentActivityItems() {
        const recentPredictions = this.predictionHistory.slice(0, 5);
        
        if (recentPredictions.length === 0) {
            return `
                <div class="list-group-item text-center py-4 text-muted">
                    <p>No recent activity</p>
                </div>
            `;
        }
        
        return recentPredictions.map(prediction => {
            const timestamp = new Date(prediction.timestamp || Date.now()).toLocaleString();
            
            const activity = prediction.type === 'single'
                ? `Created prediction: ${prediction.factor}`
                : `Created multi-factor prediction with ${prediction.factors?.length || 0} factors`;
                
            const probability = prediction.type === 'single'
                ? prediction.result.probability * 100
                : prediction.result.combined_probability * 100;
                
            return `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="activity-content">
                            <div class="activity-text text-sm">
                                ${activity.length > 60 ? activity.substring(0, 57) + '...' : activity}
                            </div>
                            <div class="text-xs text-muted mt-1">
                                ${timestamp}
                                ${prediction.league ? ` • ${prediction.league.replace('_', ' ').toUpperCase()}` : ''}
                            </div>
                        </div>
                        <span class="badge ${this._getProbabilityBadgeClass(probability)}">
                            ${probability.toFixed(1)}%
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Generate dashboard insights
     */
    _generateDashboardInsights() {
        const insights = [];
        
        // Only generate insights if we have enough predictions
        if (this.predictionHistory.length < 3) {
            insights.push('Make more predictions to get personalized insights.');
            return insights;
        }
        
        // Calculate average probability
        const avgProbability = this._calculateAverageProbability();
        
        if (avgProbability > 70) {
            insights.push(`Your predictions show high confidence with an average probability of ${avgProbability.toFixed(1)}%.`);
        } else if (avgProbability > 50) {
            insights.push(`Your predictions show moderate confidence with an average probability of ${avgProbability.toFixed(1)}%.`);
        } else {
            insights.push(`Your predictions tend to be cautious with an average probability of ${avgProbability.toFixed(1)}%.`);
        }
        
        // Find favorite leagues
        const favoriteLeagues = this._calculateFavoriteLeagues();
        
        if (favoriteLeagues.length > 0) {
            const topLeague = favoriteLeagues[0];
            insights.push(`You predict most frequently in ${topLeague.league.replace('_', ' ').toUpperCase()} (${topLeague.percentage.toFixed(0)}% of predictions).`);
        }
        
        // Analyze prediction trends
        const trends = this._calculatePredictionTrends();
        
        if (trends.slope > 0.5) {
            insights.push('Your recent predictions show increasing probability levels, indicating growing confidence.');
        } else if (trends.slope < -0.5) {
            insights.push('Your recent predictions show decreasing probability levels, indicating more caution recently.');
        } else {
            insights.push('Your prediction probability levels have remained relatively consistent.');
        }
        
        // Analyze resolved predictions
        const resolvedCount = this._countResolvedPredictions();
        
        if (resolvedCount > 0) {
            const accuracy = this._calculateAccuracy();
            
            if (accuracy > 70) {
                insights.push(`Your prediction accuracy is excellent at ${accuracy.toFixed(0)}%.`);
            } else if (accuracy > 50) {
                insights.push(`Your prediction accuracy is good at ${accuracy.toFixed(0)}%.`);
            } else if (resolvedCount >= 3) {
                insights.push(`Your prediction accuracy could improve, currently at ${accuracy.toFixed(0)}%.`);
            }
        }
        
        return insights;
    }
    
    /**
     * Generate local insights HTML
     */
    _generateLocalInsightsHTML() {
        const insights = this._generateDashboardInsights();
        
        return `
            <ul class="insights-list">
                ${insights.map(insight => `
                    <li class="mb-3">
                        <i class="fas fa-chart-line text-primary me-2"></i>
                        ${insight}
                    </li>
                `).join('')}
            </ul>
        `;
    }
    
    /**
     * Calculate average probability
     */
    _calculateAverageProbability() {
        if (this.predictionHistory.length === 0) {
            return 0;
        }
        
        const sum = this.predictionHistory.reduce((total, prediction) => {
            const probability = prediction.type === 'single'
                ? prediction.result.probability
                : prediction.result.combined_probability;
                
            return total + probability;
        }, 0);
        
        return (sum / this.predictionHistory.length) * 100;
    }
    
    /**
     * Count resolved predictions
     */
    _countResolvedPredictions() {
        return this.predictionHistory.filter(p => p.resolved).length;
    }
    
    /**
     * Calculate prediction accuracy
     */
    _calculateAccuracy() {
        const resolvedPredictions = this.predictionHistory.filter(p => p.resolved);
        
        if (resolvedPredictions.length === 0) {
            return 0;
        }
        
        const correctPredictions = resolvedPredictions.filter(p => p.resolvedResult?.correct);
        
        return (correctPredictions.length / resolvedPredictions.length) * 100;
    }
    
    /**
     * Calculate favorite leagues
     */
    _calculateFavoriteLeagues() {
        const leagueCounts = {};
        let totalWithLeague = 0;
        
        this.predictionHistory.forEach(prediction => {
            if (prediction.league) {
                const league = prediction.league;
                leagueCounts[league] = (leagueCounts[league] || 0) + 1;
                totalWithLeague++;
            }
        });
        
        if (totalWithLeague === 0) {
            return [];
        }
        
        // Convert to array for sorting
        const leagues = Object.entries(leagueCounts).map(([league, count]) => ({
            league: league,
            count: count,
            percentage: (count / totalWithLeague) * 100
        }));
        
        // Sort by count
        leagues.sort((a, b) => b.count - a.count);
        
        return leagues;
    }
    
    /**
     * Calculate prediction trends
     */
    _calculatePredictionTrends() {
        if (this.predictionHistory.length < 3) {
            return { slope: 0, trend: 'stable' };
        }
        
        // Get last 10 predictions
        const recentPredictions = this.predictionHistory.slice(0, 10);
        
        // Extract probability values
        const values = recentPredictions.map(prediction => {
            return prediction.type === 'single'
                ? prediction.result.probability
                : prediction.result.combined_probability;
        });
        
        // Calculate slope using simple linear regression
        const n = values.length;
        const indices = Array.from({ length: n }, (_, i) => i + 1);
        
        const sumX = indices.reduce((sum, x) => sum + x, 0);
        const sumY = values.reduce((sum, y) => sum + y, 0);
        const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
        const sumXX = indices.reduce((sum, x) => sum + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Determine trend
        let trend = 'stable';
        if (slope > 0.02) {
            trend = 'increasing';
        } else if (slope < -0.02) {
            trend = 'decreasing';
        }
        
        return { slope, trend };
    }
    
    /**
     * Generate local insights
     */
    _generateLocalInsights() {
        const insights = [];
        
        // Add basic insights
        if (this.predictionHistory.length === 0) {
            insights.push('Make your first prediction to get started!');
            return insights;
        }
        
        // Calculate league distribution
        const favoriteLeagues = this._calculateFavoriteLeagues();
        
        if (favoriteLeagues.length > 0) {
            const topLeague = favoriteLeagues[0];
            insights.push(`You predict most often in ${topLeague.league.replace('_', ' ').toUpperCase()}.`);
        }
        
        // Calculate average probability
        const avgProbability = this._calculateAverageProbability();
        
        insights.push(`Average prediction probability: ${avgProbability.toFixed(1)}%`);
        
        // Calculate resolved/accuracy stats
        const resolvedCount = this._countResolvedPredictions();
        
        if (resolvedCount > 0) {
            const accuracy = this._calculateAccuracy();
            insights.push(`Prediction accuracy: ${accuracy.toFixed(1)}% (${resolvedCount} resolved)`);
        } else {
            insights.push('No resolved predictions yet.');
        }
        
        return insights;
    }
    
    /**
     * Clear all prediction data
     */
    async _clearAllPredictionData() {
        // Create confirmation dialog
        const dialog = document.createElement('div');
        dialog.className = 'confirmation-dialog card position-fixed start-50 top-50 translate-middle shadow-lg rounded-lg';
        dialog.style.zIndex = '1050';
        dialog.style.width = '350px';
        
        dialog.innerHTML = `
            <div class="card-header bg-danger text-white py-2">
                <h6 class="mb-0">Clear All Prediction Data</h6>
            </div>
            <div class="card-body">
                <p class="mb-3">Are you sure you want to clear all prediction data? This action cannot be undone.</p>
                <div class="form-check mb-3">
                    <input class="form-check-input" type="checkbox" id="confirm-clear-data">
                    <label class="form-check-label" for="confirm-clear-data">
                        I understand this will delete all my prediction data
                    </label>
                </div>
            </div>
            <div class="card-footer d-flex justify-content-between py-2">
                <button class="btn btn-secondary cancel-clear-btn">Cancel</button>
                <button class="btn btn-danger confirm-clear-btn" disabled>Clear All Data</button>
            </div>
        `;
        
        // Add dialog to document
        document.body.appendChild(dialog);
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.style.zIndex = '1040';
        document.body.appendChild(backdrop);
        
        // Add event listeners
        const checkbox = dialog.querySelector('#confirm-clear-data');
        const confirmBtn = dialog.querySelector('.confirm-clear-btn');
        
        checkbox?.addEventListener('change', () => {
            if (confirmBtn) {
                confirmBtn.disabled = !checkbox.checked;
            }
        });
        
        dialog.querySelector('.cancel-clear-btn')?.addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });
        
        return new Promise((resolve) => {
            confirmBtn?.addEventListener('click', async () => {
                // Clear prediction history
                this.predictionHistory = [];
                this.currentPrediction = null;
                this.pendingComparisons = [];
                
                // Clear IndexedDB
                try {
                    const db = await this._getIndexedDBInstance();
                    const transaction = db.transaction(['predictions'], 'readwrite');
                    const store = transaction.objectStore('predictions');
                    
                    await store.clear();
                    
                    // Clear from server if online
                    if (!this.offlineMode) {
                        await apiClient.delete('/api/predictions/all', {
                            headers: {
                                'Authorization': `Bearer ${authService.getToken()}`,
                                'X-API-Key': API_CONFIG.predictionApiKey
                            }
                        });
                    }
                    
                    // Track analytics
                    analyticsService.trackEvent('predictions', 'clear_all_predictions');
                    
                    // Update UI
                    this._updatePredictionHistory();
                    
                    // Hide results containers
                    const resultsContainer = this.container.querySelector('#prediction-results');
                    if (resultsContainer) {
                        resultsContainer.classList.add('d-none');
                    }
                    
                    const visualizationContainer = this.container.querySelector('#prediction-visualization');
                    if (visualizationContainer) {
                        visualizationContainer.classList.add('d-none');
                    }
                    
                    const exportOptions = this.container.querySelector('#export-options');
                    if (exportOptions) {
                        exportOptions.classList.add('d-none');
                    }
                    
                    // Show notification
                    notificationService.showNotification('All prediction data has been cleared', 'success');
                    
                    resolve(true);
                } catch (error) {
                    Logger.error('Error clearing prediction data:', error);
                    notificationService.showNotification('Error clearing prediction data', 'error');
                    resolve(false);
                } finally {
                    dialog.remove();
                    backdrop.remove();
                }
            });
        });
    }
    
    /**
     * Handle auth status changed event
     */
    _handleAuthStatusChanged(status) {
        Logger.info('Auth status changed:', status);
        
        // Reinitialize if user status changes
        this.initialize(this.container.id);
    }
    
    /**
     * Show settings modal
     */
    _showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        
        if (!modal) return;
        
        // Populate settings with current values
        this._populateSettingsForm();
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
    
    /**
     * Toggle probability distribution visualization
     */
    _toggleProbabilityDistribution(prediction) {
        const visualizationContainer = this.container.querySelector('#prediction-visualization');
        
        if (!visualizationContainer) return;
        
        // Toggle visibility
        const isVisible = !visualizationContainer.classList.contains('d-none');
        
        if (isVisible) {
            visualizationContainer.classList.add('d-none');
        } else {
            visualizationContainer.classList.remove('d-none');
            
            // Render the probability distribution
            this._renderProbabilityDistribution(prediction, visualizationContainer);
        }
    }
    
    /**
     * Destroy the module and clean up
     */
    destroy() {
        // Clean up WebSocket connection
        if (this.webSocketConnection) {
            this.webSocketConnection.close();
            this.webSocketConnection = null;
        }
        
        // Stop speech recognition if active
        if (this.speechRecognitionActive) {
            speechRecognitionService.stop();
            this.speechRecognitionActive = false;
        }
        
        // Remove event listeners
        window.removeEventListener('online', this._handleOfflineStatusChange);
        window.removeEventListener('offline', this._handleOfflineStatusChange);
        
        // Unsubscribe from events
        eventBus.unsubscribe('auth:statusChanged', this._handleAuthStatusChanged);
        eventBus.unsubscribe('preferences:updated', this._handlePreferencesUpdated);
        eventBus.unsubscribe('league:changed', this._handleLeagueChanged);
        
        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
        
        this.isInitialized = false;
        
        // Track destroy event
        analyticsService.trackEvent('predictions_module', 'destroyed');
        
        Logger.info('Custom predictions module destroyed');
    }
}

// Create singleton instance
const customPredictions = new CustomPredictions();

// Export for module systems
export { CustomPredictions, customPredictions };

// Export for global use
window.CustomPredictions = CustomPredictions;
window.customPredictions = customPredictions;