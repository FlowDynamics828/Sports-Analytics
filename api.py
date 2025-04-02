import os
import json
import sys
import logging
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import numpy as np
import pandas as pd
from dotenv import load_dotenv
import requests
import traceback

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='public')
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Sports API configuration
SPORTS_API_KEY = os.getenv('SPORTS_API_KEY')
THESPORTSDB_API_KEY = os.getenv('THESPORTSDB_API_KEY', '447279')
ODDS_API_KEY = os.getenv('ODDS_API_KEY')

# Import the predictive model
try:
    sys.path.append(os.path.join(os.path.dirname(__file__), 'scripts'))
    from scripts.predictive_model import TheAnalyzerPredictiveModel
    predictor = TheAnalyzerPredictiveModel()
    logger.info("Predictive model loaded successfully")
except Exception as e:
    logger.error(f"Error loading predictive model: {str(e)}")
    logger.error(traceback.format_exc())
    predictor = None

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def static_files(path):
    return app.send_static_file(path)

@app.route('/api/config', methods=['GET'])
def api_config():
    """Return API configuration for client"""
    return jsonify({
        'apiKey': THESPORTSDB_API_KEY,
        'apiUrl': 'https://www.thesportsdb.com/api/v1/json',
        'version': '1.0.0'
    })

@app.route('/api/config/sports-api', methods=['GET'])
def sports_api_config():
    """Return Sports API configuration"""
    return jsonify({
        'apiKey': THESPORTSDB_API_KEY,
        'baseUrl': 'https://www.thesportsdb.com/api/v1/json',
        'useNewApiService': True,
        'apiServiceUrl': '/api'
    })

@app.route('/api/predictions/generate', methods=['POST'])
def generate_prediction():
    """Generate prediction using the trained model"""
    try:
        # Parse request data
        data = request.json
        logger.info(f"Prediction request: {data}")
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Required fields
        required_fields = ['homeTeam', 'awayTeam']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Get prediction from model
        if predictor:
            # Determine league if not provided
            league = data.get('league', 'NBA')  # Default to NBA if not specified
            
            # Convert league name to ID if needed
            league_id = predictor.LEAGUE_IDS.get(league, predictor.LEAGUE_IDS['NBA'])
            
            # Prepare input data for prediction
            input_data = {
                'strHomeTeam': data['homeTeam'],
                'strAwayTeam': data['awayTeam'],
                'intHomeScore': None,  # Not available for prediction
                'intAwayScore': None,  # Not available for prediction
                'dateEvent': datetime.now().strftime('%Y-%m-%d'),
                'league': league,
                'league_id': league_id
            }
            
            # Add additional factors if provided
            for key, value in data.items():
                if key not in input_data and key != 'factors':
                    input_data[key] = value
            
            # Get prediction result
            prediction_result = predictor.predict_match(league, input_data)
            
            if not prediction_result:
                raise ValueError("Failed to generate prediction with the model")
                
            # Format response
            home_win_prob = prediction_result.get('homeWinProbability', 0)
            away_win_prob = prediction_result.get('awayWinProbability', 0)
            
            # If the probabilities don't add up to 1, normalize them
            total_prob = home_win_prob + away_win_prob
            if total_prob > 0 and total_prob != 1:
                home_win_prob = home_win_prob / total_prob
                away_win_prob = away_win_prob / total_prob
            
            # Build factors list from input data and model
            factors = []
            if 'factors' in data and isinstance(data['factors'], list):
                factors = data['factors']
            elif 'factors' in prediction_result and prediction_result['factors']:
                factors = prediction_result['factors']
            else:
                # Default factors
                factors = [
                    "Recent team performance",
                    "Head-to-head record",
                    "Home court advantage"
                ]
            
            response = {
                'homeTeam': data['homeTeam'],
                'awayTeam': data['awayTeam'],
                'homeWinProbability': home_win_prob,
                'awayWinProbability': away_win_prob,
                'confidence': prediction_result.get('confidence', 0.75),
                'factors': factors,
                'source': 'model',
                'timestamp': datetime.now().isoformat()
            }
            
            return jsonify(response)
        else:
            # No model available, return error
            return jsonify({
                'error': 'Predictive model not available',
                'homeTeam': data['homeTeam'],
                'awayTeam': data['awayTeam'],
                'homeWinProbability': 0.5,
                'awayWinProbability': 0.5,
                'confidence': 0.5,
                'factors': [
                    "Basic statistical analysis",
                    "Home team advantage",
                    "Historical matchup data"
                ],
                'source': 'fallback'
            }), 200
            
    except Exception as e:
        logger.error(f"Error generating prediction: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'source': 'error'
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True) 