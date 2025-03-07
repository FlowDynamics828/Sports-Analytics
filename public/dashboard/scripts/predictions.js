// Professional Sports Analytics Prediction System
// Production Version 3.0

import { DataService } from '/scripts/dataService.js';
import { Toast } from '/scripts/toast.js';

class PredictionManager {
    constructor() {
        this.currentLeague = 'nba';
        this.predictionModels = new Map();
        this.confidenceThresholds = {
            high: 0.75,
            medium: 0.6,
            low: 0.5
        };
        this.updateInterval = null;
        this.dataCache = new Map();
    }

    async initialize() {
        try {
            await this.initializePredictionModels();
            await this.loadHistoricalData();
            await this.setupRealTimeUpdates();
            this.startAutoRefresh();
            console.log('Prediction system initialized');
        } catch (error) {
            console.error('Prediction system initialization error:', error);
            throw error;
        }
    }

    async initializePredictionModels() {
        const models = {
            nba: {
                gameOutcome: this.createNBAGamePredictor(),
                playerPerformance: this.createNBAPlayerPredictor(),
                teamTrends: this.createNBATeamTrendAnalyzer()
            },
            nfl: {
                gameOutcome: this.createNFLGamePredictor(),
                scoring: this.createNFLScoringPredictor(),
                playerProps: this.createNFLPlayerPropsPredictor()
            },
            mlb: {
                gameOutcome: this.createMLBGamePredictor(),
                pitchingAnalysis: this.createMLBPitchingPredictor(),
                battingAnalysis: this.createMLBBattingPredictor()
            },
            nhl: {
                gameOutcome: this.createNHLGamePredictor(),
                goalScoring: this.createNHLScoringPredictor(),
                playerImpact: this.createNHLPlayerImpactPredictor()
            },
            premierleague: {
                matchOutcome: this.createSoccerMatchPredictor(),
                scoreline: this.createSoccerScorelinePredictor(),
                playerPerformance: this.createSoccerPlayerPredictor()
            },
            laliga: {
                matchOutcome: this.createSoccerMatchPredictor(),
                scoreline: this.createSoccerScorelinePredictor(),
                playerPerformance: this.createSoccerPlayerPredictor()
            },
            bundesliga: {
                matchOutcome: this.createSoccerMatchPredictor(),
                scoreline: this.createSoccerScorelinePredictor(),
                playerPerformance: this.createSoccerPlayerPredictor()
            },
            seriea: {
                matchOutcome: this.createSoccerMatchPredictor(),
                scoreline: this.createSoccerScorelinePredictor(),
                playerPerformance: this.createSoccerPlayerPredictor()
            }
        };

        for (const [league, modelSet] of Object.entries(models)) {
            this.predictionModels.set(league, modelSet);
        }
    }

    async loadHistoricalData() {
        try {
            const response = await fetch('/api/predictions/historical', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) throw new Error('Failed to load historical data');
            
            const data = await response.json();
            this.processHistoricalData(data);
        } catch (error) {
            console.error('Historical data loading error:', error);
            throw error;
        }
    }

    async getPredictions(league, team = null) {
        try {
            const models = this.predictionModels.get(league);
            if (!models) throw new Error(`No prediction models available for ${league}`);

            const predictions = await Promise.all([
                this.getGamePrediction(league, team),
                this.getPlayerPredictions(league, team),
                this.getTeamTrendPrediction(league, team)
            ]);

            return this.aggregatePredictions(predictions);
        } catch (error) {
            console.error('Prediction error:', error);
            throw error;
        }
    }

    async getGamePrediction(league, team) {
        const url = `/api/predictions/${league}/game${team ? `?team=${team}` : ''}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch game prediction');
            
           const data = await response.json();
            
            return this.processGamePrediction(data);
        } catch (error) {
            console.error('Game prediction error:', error);
            throw error;
        }
    }

    async getPlayerPredictions(league, team) {
        try {
            const response = await fetch(`/api/predictions/${league}/players${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch player predictions');
            const data = await response.json();
            
            return this.processPlayerPredictions(data);
        } catch (error) {
            console.error('Player predictions error:', error);
            throw error;
        }
    }

    async getTeamTrendPrediction(league, team) {
        try {
            const response = await fetch(`/api/predictions/${league}/trends${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch team trends');
            const data = await response.json();
            
            return this.processTeamTrends(data);
        } catch (error) {
            console.error('Team trends error:', error);
            throw error;
        }
    }

    processGamePrediction(data) {
        const { homeTeam, awayTeam, probabilities, factors } = data;
        
        return {
            matchup: {
                home: homeTeam,
                away: awayTeam
            },
            prediction: {
                homeWin: probabilities.home,
                awayWin: probabilities.away,
                draw: probabilities.draw,
                confidence: this.calculateConfidence(probabilities),
                recommendedBet: this.generateBetRecommendation(probabilities)
            },
            keyFactors: this.analyzeKeyFactors(factors)
        };
    }

    processPlayerPredictions(data) {
        return data.players.map(player => ({
            name: player.name,
            predictions: {
                points: this.predictStatLine(player, 'points'),
                assists: this.predictStatLine(player, 'assists'),
                rebounds: this.predictStatLine(player, 'rebounds'),
                efficiency: this.calculateEfficiencyRating(player)
            },
            form: this.analyzePlayerForm(player),
            matchupAdvantage: this.calculateMatchupAdvantage(player)
        }));
    }

    processTeamTrends(data) {
        return {
            overall: this.analyzeTrendData(data.overall),
            recent: this.analyzeTrendData(data.recent),
            situational: this.analyzeSituationalTrends(data.situational),
            projection: this.generateTeamProjection(data)
        };
    }

    calculateConfidence(probabilities) {
        const maxProb = Math.max(...Object.values(probabilities));
        
        if (maxProb >= this.confidenceThresholds.high) return 'high';
        if (maxProb >= this.confidenceThresholds.medium) return 'medium';
        return 'low';
    }

    generateBetRecommendation(probabilities) {
        const threshold = 0.6; // 60% probability threshold
        const margin = 0.1; // 10% margin for value bets

        return Object.entries(probabilities)
            .filter(([outcome, prob]) => prob > threshold)
            .map(([outcome, prob]) => ({
                outcome,
                confidence: prob,
                value: this.calculateBetValue(prob, outcome)
            }))
            .filter(bet => bet.value > margin);
    }

    calculateBetValue(probability, outcome) {
        // Compare predicted probability with implied odds
        const impliedOdds = this.getImpliedOdds(outcome);
        return probability - impliedOdds;
    }

    predictStatLine(player, stat) {
        const history = player.recentGames || [];
        const average = this.calculateWeightedAverage(history, stat);
        const trend = this.calculateTrend(history, stat);
        const matchupFactor = this.getMatchupFactor(player, stat);

        return {
            predicted: Math.round((average * matchupFactor + trend) * 10) / 10,
            range: this.calculatePredictionRange(average, history, stat),
            confidence: this.calculateStatPredictionConfidence(history, stat)
        };
    }

    calculateWeightedAverage(games, stat) {
        const weights = games.map((_, index) => 1 / (index + 1));
        const weightSum = weights.reduce((a, b) => a + b, 0);

        return games.reduce((sum, game, index) => {
            return sum + (game[stat] * weights[index] / weightSum);
        }, 0);
    }

    calculateTrend(games, stat) {
        if (games.length < 5) return 0;
        
        const recentGames = games.slice(-5);
        const values = recentGames.map(game => game[stat]);
        
        return this.calculateLinearRegression(values);
    }

    calculateLinearRegression(values) {
        const n = values.length;
        const x = Array.from({length: n}, (_, i) => i);
        
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = values.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    }

    startAutoRefresh() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.refreshPredictions();
            }
        }, 60000); // Update every minute
    }

    async refreshPredictions() {
        try {
            const predictions = await this.getPredictions(this.currentLeague);
            this.updatePredictionDisplay(predictions);
        } catch (error) {
            console.error('Prediction refresh error:', error);
        }
    }

    updatePredictionDisplay(predictions) {
        // Update each prediction section in the UI
        this.updateGamePredictionUI(predictions.game);
        this.updatePlayerPredictionsUI(predictions.players);
        this.updateTeamTrendsUI(predictions.trends);
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.predictionModels.clear();
        this.dataCache.clear();
    }
}

export default PredictionManager;