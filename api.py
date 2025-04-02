from flask import Flask, jsonify, request, send_from_directory
import os

app = Flask(__name__, static_folder='public')

# TheSportsDB API key
API_KEY = "447279"

@app.route('/api/config', methods=['GET'])
def get_config():
    config = {
        "apiBaseUrl": "/api",
        "isDevelopment": True,
        "version": "1.0.0"
    }
    return jsonify(config)

@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_files(path):
    if path == "":
        path = "index.html"
    return send_from_directory('public', path)

@app.route('/api/config')
def api_config():
    """Return API configuration"""
    config = {
        "apiKey": API_KEY,
        "baseUrl": "https://www.thesportsdb.com/api/v1/json",
        "version": "1.0.0",
        "refreshInterval": 60000,
        "features": {
            "liveScores": True,
            "predictions": True,
            "aiInsights": True,
            "stats": True
        }
    }
    return jsonify(config)

if __name__ == '__main__':
    print("Starting server on http://localhost:8000")
    app.run(debug=True, port=8000) 