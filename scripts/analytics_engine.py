"""
Advanced Analytics Engine for Sports Analytics Pro
Version 1.0.0
Enterprise-Grade Machine Learning and Analytics Pipeline
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import logging
from datetime import datetime, timedelta
import asyncio
from dataclasses import dataclass
import os
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
import xgboost as xgb
import lightgbm as lgb
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, LSTM
from tensorflow.keras.optimizers import Adam
import torch
import torch.nn as nn
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from scipy import stats
import joblib
import json
from .config import config
from .websocket_client import WebSocketClient, WebSocketClientConfig

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ModelMetrics:
    """Data structure for model performance metrics"""
    accuracy: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    f1_score: float = 0.0
    auc: float = 0.0
    last_update: datetime = None

@dataclass
class FeatureImportance:
    """Data structure for feature importance scores"""
    scores: Dict[str, float] = None
    last_update: datetime = None

class AdvancedAnalyticsEngine:
    """Enterprise-grade analytics engine for sports analytics"""
    
    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.metrics = ModelMetrics()
        self.feature_importance = FeatureImportance()
        self.websocket_client = None
        self.setup_models()
        self.setup_scalers()
        
    def setup_models(self):
        """Initialize machine learning models"""
        try:
            # Random Forest
            self.models['rf'] = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                min_samples_split=5,
                min_samples_leaf=2,
                random_state=42
            )
            
            # XGBoost
            self.models['xgb'] = xgb.XGBClassifier(
                n_estimators=100,
                max_depth=6,
                learning_rate=0.1,
                random_state=42
            )
            
            # LightGBM
            self.models['lgb'] = lgb.LGBMClassifier(
                n_estimators=100,
                max_depth=6,
                learning_rate=0.1,
                random_state=42
            )
            
            # Neural Network
            self.models['nn'] = Sequential([
                Dense(64, activation='relu', input_shape=(None,)),
                Dropout(0.3),
                Dense(32, activation='relu'),
                Dropout(0.3),
                Dense(16, activation='relu'),
                Dense(1, activation='sigmoid')
            ])
            self.models['nn'].compile(
                optimizer=Adam(learning_rate=0.001),
                loss='binary_crossentropy',
                metrics=['accuracy']
            )
            
            # LSTM
            self.models['lstm'] = Sequential([
                LSTM(64, return_sequences=True, input_shape=(None, 1)),
                Dropout(0.3),
                LSTM(32),
                Dropout(0.3),
                Dense(16, activation='relu'),
                Dense(1, activation='sigmoid')
            ])
            self.models['lstm'].compile(
                optimizer=Adam(learning_rate=0.001),
                loss='binary_crossentropy',
                metrics=['accuracy']
            )
            
            # BERT for text analysis
            self.models['bert'] = AutoModelForSequenceClassification.from_pretrained('bert-base-uncased')
            self.tokenizer = AutoTokenizer.from_pretrained('bert-base-uncased')
            
            logger.info("All models initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing models: {str(e)}")
            raise
            
    def setup_scalers(self):
        """Initialize data scalers"""
        try:
            self.scalers['standard'] = StandardScaler()
            logger.info("Data scalers initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing scalers: {str(e)}")
            raise
            
    async def initialize(self):
        """Initialize the analytics engine"""
        try:
            # Initialize WebSocket client
            ws_config = WebSocketClientConfig(
                server_url=config.websocket.server_url,
                client_id=config.websocket.client_id,
                jwt_token=os.getenv("JWT_TOKEN")
            )
            self.websocket_client = WebSocketClient(ws_config, self)
            
            # Connect to WebSocket server
            await self.websocket_client.connect()
            
            # Subscribe to channels
            await self.websocket_client.subscribe("market_data")
            await self.websocket_client.subscribe("system_status")
            
            logger.info("Analytics engine initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing analytics engine: {str(e)}")
            raise
            
    async def process_market_data(self, data: Dict):
        """Process market data and generate predictions"""
        try:
            # Extract features
            features = self.extract_features(data)
            
            # Scale features
            scaled_features = self.scale_features(features)
            
            # Generate predictions from all models
            predictions = {}
            for model_name, model in self.models.items():
                if model_name in ['nn', 'lstm']:
                    pred = self.predict_deep_learning(model, scaled_features)
                elif model_name == 'bert':
                    pred = self.predict_text_analysis(model, data.get('text_data', ''))
                else:
                    pred = model.predict_proba(scaled_features)[:, 1]
                predictions[model_name] = pred
                
            # Calculate ensemble prediction
            ensemble_pred = np.mean([pred for pred in predictions.values()], axis=0)
            
            # Calculate risk score
            risk_score = self.calculate_risk_score(ensemble_pred, data)
            
            # Update feature importance
            self.update_feature_importance(features, ensemble_pred)
            
            # Prepare analytics data
            analytics_data = {
                'predictions': predictions,
                'ensemble_prediction': ensemble_pred.tolist(),
                'risk_score': risk_score,
                'feature_importance': self.feature_importance.scores,
                'performance_metrics': {
                    'accuracy': self.metrics.accuracy,
                    'precision': self.metrics.precision,
                    'recall': self.metrics.recall,
                    'f1_score': self.metrics.f1_score,
                    'auc': self.metrics.auc
                },
                'timestamp': datetime.now().isoformat()
            }
            
            # Send analytics data to WebSocket server
            await self.websocket_client.send_message({
                'type': 'analytics',
                'data': analytics_data
            })
            
            logger.info("Market data processed successfully")
            
        except Exception as e:
            logger.error(f"Error processing market data: {str(e)}")
            
    def extract_features(self, data: Dict) -> np.ndarray:
        """Extract features from market data"""
        try:
            features = []
            
            # Market metrics
            features.extend([
                data.get('volume', 0),
                data.get('volatility', 0),
                data.get('momentum', 0),
                data.get('trend_strength', 0)
            ])
            
            # Technical indicators
            features.extend([
                data.get('rsi', 50),
                data.get('macd', 0),
                data.get('macd_signal', 0),
                data.get('macd_hist', 0),
                data.get('bb_upper', 0),
                data.get('bb_middle', 0),
                data.get('bb_lower', 0)
            ])
            
            # Historical data
            if 'historical_data' in data:
                hist_data = data['historical_data']
                features.extend([
                    np.mean(hist_data.get('prices', [])),
                    np.std(hist_data.get('prices', [])),
                    np.mean(hist_data.get('volumes', [])),
                    np.std(hist_data.get('volumes', []))
                ])
                
            return np.array(features).reshape(1, -1)
            
        except Exception as e:
            logger.error(f"Error extracting features: {str(e)}")
            return np.zeros((1, 20))  # Return zero features as fallback
            
    def scale_features(self, features: np.ndarray) -> np.ndarray:
        """Scale features using StandardScaler"""
        try:
            return self.scalers['standard'].fit_transform(features)
        except Exception as e:
            logger.error(f"Error scaling features: {str(e)}")
            return features
            
    def predict_deep_learning(self, model, features: np.ndarray) -> np.ndarray:
        """Generate predictions using deep learning models"""
        try:
            if isinstance(model, Sequential):
                return model.predict(features)
            return np.zeros((features.shape[0], 1))
        except Exception as e:
            logger.error(f"Error in deep learning prediction: {str(e)}")
            return np.zeros((features.shape[0], 1))
            
    def predict_text_analysis(self, model, text: str) -> np.ndarray:
        """Generate predictions using BERT model"""
        try:
            if not text:
                return np.zeros((1, 1))
                
            inputs = self.tokenizer(text, return_tensors="pt", padding=True, truncation=True)
            outputs = model(**inputs)
            return torch.sigmoid(outputs.logits).detach().numpy()
            
        except Exception as e:
            logger.error(f"Error in text analysis prediction: {str(e)}")
            return np.zeros((1, 1))
            
    def calculate_risk_score(self, predictions: np.ndarray, data: Dict) -> float:
        """Calculate risk score based on predictions and market data"""
        try:
            # Base risk from prediction confidence
            prediction_risk = 1 - np.mean(predictions)
            
            # Market volatility risk
            volatility_risk = data.get('volatility', 0.5)
            
            # Volume risk (lower volume = higher risk)
            volume = data.get('volume', 0)
            volume_risk = 1 - (volume / (volume + 1))
            
            # Combine risks with weights
            risk_score = (
                0.4 * prediction_risk +
                0.3 * volatility_risk +
                0.3 * volume_risk
            )
            
            return float(risk_score)
            
        except Exception as e:
            logger.error(f"Error calculating risk score: {str(e)}")
            return 0.5
            
    def update_feature_importance(self, features: np.ndarray, predictions: np.ndarray):
        """Update feature importance scores"""
        try:
            # Calculate correlation between features and predictions
            feature_names = [
                'volume', 'volatility', 'momentum', 'trend_strength',
                'rsi', 'macd', 'macd_signal', 'macd_hist',
                'bb_upper', 'bb_middle', 'bb_lower',
                'price_mean', 'price_std', 'volume_mean', 'volume_std'
            ]
            
            importance_scores = {}
            for i, feature in enumerate(features[0]):
                correlation = stats.pearsonr(feature, predictions)[0]
                importance_scores[feature_names[i]] = abs(correlation)
                
            self.feature_importance.scores = importance_scores
            self.feature_importance.last_update = datetime.now()
            
        except Exception as e:
            logger.error(f"Error updating feature importance: {str(e)}")
            
    def update_model_metrics(self, y_true: np.ndarray, y_pred: np.ndarray):
        """Update model performance metrics"""
        try:
            self.metrics.accuracy = accuracy_score(y_true, y_pred)
            self.metrics.precision = precision_score(y_true, y_pred)
            self.metrics.recall = recall_score(y_true, y_pred)
            self.metrics.f1_score = f1_score(y_true, y_pred)
            self.metrics.auc = roc_auc_score(y_true, y_pred)
            self.metrics.last_update = datetime.now()
            
        except Exception as e:
            logger.error(f"Error updating model metrics: {str(e)}")
            
    def save_models(self, path: str):
        """Save trained models to disk"""
        try:
            for model_name, model in self.models.items():
                if model_name in ['nn', 'lstm']:
                    model.save(f"{path}/{model_name}.h5")
                elif model_name == 'bert':
                    model.save_pretrained(f"{path}/{model_name}")
                else:
                    joblib.dump(model, f"{path}/{model_name}.joblib")
                    
            # Save scalers
            for scaler_name, scaler in self.scalers.items():
                joblib.dump(scaler, f"{path}/{scaler_name}_scaler.joblib")
                
            logger.info("Models and scalers saved successfully")
            
        except Exception as e:
            logger.error(f"Error saving models: {str(e)}")
            
    def load_models(self, path: str):
        """Load trained models from disk"""
        try:
            for model_name in self.models.keys():
                if model_name in ['nn', 'lstm']:
                    self.models[model_name] = load_model(f"{path}/{model_name}.h5")
                elif model_name == 'bert':
                    self.models[model_name] = AutoModelForSequenceClassification.from_pretrained(f"{path}/{model_name}")
                else:
                    self.models[model_name] = joblib.load(f"{path}/{model_name}.joblib")
                    
            # Load scalers
            for scaler_name in self.scalers.keys():
                self.scalers[scaler_name] = joblib.load(f"{path}/{scaler_name}_scaler.joblib")
                
            logger.info("Models and scalers loaded successfully")
            
        except Exception as e:
            logger.error(f"Error loading models: {str(e)}")

if __name__ == "__main__":
    # Create and run analytics engine
    engine = AdvancedAnalyticsEngine()
    asyncio.run(engine.initialize()) 