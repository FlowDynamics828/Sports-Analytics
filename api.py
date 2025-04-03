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

# Sports API configuration from environment variables
SPORTS_API_KEY = os.getenv('SPORTS_API_KEY')
THESPORTSDB_API_KEY = os.getenv('THESPORTSDB_API_KEY')
ODDS_API_KEY = os.getenv('ODDS_API_KEY')
SPORTS_API_BASE_URL = os.getenv('SPORTS_API_BASE_URL', 'https://www.thesportsdb.com/api/v1/json')

# League IDs from environment variables
LEAGUE_IDS = {
    'NFL': os.getenv('NFL_LEAGUE_ID', '4391'),
    'NBA': os.getenv('NBA_LEAGUE_ID', '4387'),
    'MLB': os.getenv('MLB_LEAGUE_ID', '4424'),
    'NHL': os.getenv('NHL_LEAGUE_ID', '4380'),
    'PREMIER_LEAGUE': os.getenv('PREMIER_LEAGUE_ID', '4328'),
    'LA_LIGA': os.getenv('LA_LIGA_ID', '4335'),
    'BUNDESLIGA': os.getenv('BUNDESLIGA_ID', '4331'),
    'SERIE_A': os.getenv('SERIE_A_ID', '4332')
}

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

@app.route('/api/status', methods=['GET'])
def api_status():
    """Return API status information"""
    return jsonify({
        'status': 'online',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat(),
        'apiReady': bool(THESPORTSDB_API_KEY),
        'modelReady': predictor is not None,
        'dataServiceReady': bool(THESPORTSDB_API_KEY)
    })

@app.route('/api/config', methods=['GET'])
def api_config():
    """Return API configuration for client"""
    return jsonify({
        'apiKey': THESPORTSDB_API_KEY,
        'apiUrl': SPORTS_API_BASE_URL,
        'version': '1.0.0'
    })

@app.route('/api/config/sports-api', methods=['GET'])
def sports_api_config():
    """Return Sports API configuration"""
    return jsonify({
        'apiKey': THESPORTSDB_API_KEY,
        'baseUrl': SPORTS_API_BASE_URL,
        'useNewApiService': True,
        'apiServiceUrl': '/api',
        'leagueIds': LEAGUE_IDS
    })

@app.route('/api/config/predictions', methods=['GET'])
def predictions_config():
    """Return predictions configuration"""
    # Use environment variables for defaults or fallback to reasonable values
    return jsonify({
        'defaultValues': {
            'sportType': os.getenv('DEFAULT_SPORT_TYPE', 'soccer'),
            'homeTeam': os.getenv('DEFAULT_HOME_TEAM', 'Liverpool'),
            'awayTeam': os.getenv('DEFAULT_AWAY_TEAM', 'Manchester City')
        },
        'supportedLeagues': list(LEAGUE_IDS.keys()),
        'leagueIds': LEAGUE_IDS,
        'predictionFactors': {
            'pointSpread': os.getenv('ENABLE_POINT_SPREAD', 'true').lower() == 'true',
            'overUnder': os.getenv('ENABLE_OVER_UNDER', 'true').lower() == 'true',
            'moneyline': os.getenv('ENABLE_MONEYLINE', 'true').lower() == 'true',
            'props': os.getenv('ENABLE_PROPS', 'true').lower() == 'true'
        }
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
            league_id = LEAGUE_IDS.get(league, LEAGUE_IDS['NBA'])
            
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
                # Default factors from environment variables
                factors = [
                    os.getenv('DEFAULT_FACTOR_1', "Recent team performance"),
                    os.getenv('DEFAULT_FACTOR_2', "Head-to-head record"),
                    os.getenv('DEFAULT_FACTOR_3', "Home advantage")
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
            # No model available, use API-based prediction
            logger.warning("Predictive model not available, using external API")
            
            # Try to get prediction from external API
            try:
                if SPORTS_API_KEY:
                    # Use external sports prediction API
                    external_prediction = get_external_prediction(
                        data['homeTeam'], 
                        data['awayTeam'],
                        data.get('league', 'NBA')
                    )
                    
                    if external_prediction:
                        return jsonify(external_prediction)
            except Exception as api_error:
                logger.error(f"External API prediction failed: {str(api_error)}")
            
            # Return error with clear indication data is not available
            return jsonify({
                'error': 'Prediction services temporarily unavailable',
                'status': 'error',
                'message': 'Please try again later'
            }), 503
            
    except Exception as e:
        logger.error(f"Error generating prediction: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'source': 'error'
        }), 500

def get_external_prediction(home_team, away_team, league):
    """Get prediction from external API if available"""
    # Implement external API call here if needed
    # This is a placeholder for integration with a third-party prediction service
    return None

@app.route('/api/predictions/fallback', methods=['POST'])
def fallback_prediction():
    """Provide fallback prediction using simple statistics"""
    try:
        data = request.json
        if not data or 'homeTeam' not in data or 'awayTeam' not in data:
            return jsonify({'error': 'Invalid request data'}), 400
            
        # This is a simplified statistical fallback when no other prediction is available
        # In a production environment, this would use cached data or simplified models
        league = data.get('league', 'NBA')
        
        # Return a simple response with clear indication this is backup data
        return jsonify({
            'homeTeam': data['homeTeam'],
            'awayTeam': data['awayTeam'],
            'homeWinProbability': 0.55,  # Simple home advantage
            'awayWinProbability': 0.45,
            'confidence': 0.6,  # Lower confidence since this is just a fallback
            'factors': [
                "Basic home advantage statistics",
                "Historical league averages",
                "Simplified statistical model"
            ],
            'source': 'fallback',
            'isBackupPrediction': True
        })
    except Exception as e:
        logger.error(f"Fallback prediction error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    host = os.environ.get('HOST', '0.0.0.0')
    debug = os.environ.get('DEBUG', 'true').lower() == 'true'
    app.run(host=host, port=port, debug=debug) 