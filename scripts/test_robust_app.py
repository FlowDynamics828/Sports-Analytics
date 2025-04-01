#!/usr/bin/env python
"""
Test script to verify the robustness of the Sports Analytics application
with the new mock/fallback mechanisms.
"""

import os
import sys
import asyncio
import logging
from dotenv import load_dotenv
import time
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('logs/robust_test.log', 'a')
    ]
)
logger = logging.getLogger(__name__)

# Load test environment variables
load_dotenv('.env.test')

# Set testing mode explicitly
os.environ["TESTING_MODE"] = "true"

# Import app components after setting environment variables
from scripts.main import SportsAnalyticsApp
from scripts.websocket_client import WebSocketClient
from scripts.websocket_server import WebSocketServer
from scripts.data_fetcher import DataFetcher
from scripts.data_processor import DataProcessor
from scripts.advanced_analytics import AdvancedPredictiveAnalytics


async def test_component_initialization():
    """Test initializing individual components"""
    logger.info("Testing component initialization...")
    
    try:
        # Initialize WebSocket client
        logger.info("Initializing WebSocket client...")
        ws_client = WebSocketClient(
            uri=os.getenv("WS_URI", "ws://localhost:8000/ws"),
            client_id=os.getenv("CLIENT_ID", "test-client")
        )
        await ws_client.connect()
        logger.info("✓ WebSocket client initialized successfully")
        
        # Initialize WebSocket server
        logger.info("Initializing WebSocket server...")
        ws_server = WebSocketServer()
        await ws_server.start()
        logger.info("✓ WebSocket server initialized successfully")
        
        # Initialize data fetcher
        logger.info("Initializing data fetcher...")
        data_fetcher = DataFetcher()
        await data_fetcher.initialize()
        logger.info("✓ Data fetcher initialized successfully")
        
        # Initialize data processor
        logger.info("Initializing data processor...")
        data_processor = DataProcessor()
        await data_processor.initialize()
        logger.info("✓ Data processor initialized successfully")
        
        # Initialize advanced analytics
        logger.info("Initializing advanced analytics...")
        analytics = AdvancedPredictiveAnalytics()
        await analytics.initialize()
        logger.info("✓ Advanced analytics initialized successfully")
        
        # Cleanup
        await ws_client.disconnect()
        await ws_server.stop()
        
        return True
    except Exception as e:
        logger.error(f"Component initialization test failed: {str(e)}")
        return False


async def test_app_lifecycle():
    """Test full application lifecycle"""
    logger.info("Testing full application lifecycle...")
    
    try:
        # Initialize app
        logger.info("Initializing application...")
        app = SportsAnalyticsApp()
        await app.initialize()
        logger.info("✓ Application initialized successfully")
        
        # Start app
        logger.info("Starting application...")
        await app.start()
        logger.info("✓ Application started successfully")
        
        # Let it run for a bit
        logger.info("Running application for 10 seconds...")
        await asyncio.sleep(10)
        
        # Stop app
        logger.info("Stopping application...")
        await app.stop()
        logger.info("✓ Application stopped successfully")
        
        return True
    except Exception as e:
        logger.error(f"Application lifecycle test failed: {str(e)}")
        return False


async def test_websocket_fallback():
    """Test WebSocket fallback mechanism"""
    logger.info("Testing WebSocket fallback mechanism...")
    
    try:
        # Set an invalid URI to force fallback
        os.environ["WS_URI"] = "ws://invalid-host:9999/ws"
        
        ws_client = WebSocketClient(
            uri=os.getenv("WS_URI"),
            client_id=os.getenv("CLIENT_ID", "test-client")
        )
        
        # Connect should still succeed with fallback
        await ws_client.connect()
        if ws_client.connected:
            logger.info("✓ WebSocket client fallback mechanism working")
            
        # Try sending a message
        await ws_client.send_message({
            "type": "test",
            "data": {"timestamp": datetime.now().isoformat()}
        })
        logger.info("✓ WebSocket message sending with fallback working")
        
        # Disconnect
        await ws_client.disconnect()
        logger.info("✓ WebSocket client disconnected successfully")
        
        # Reset URI
        os.environ["WS_URI"] = "ws://localhost:8000/ws"
        
        return True
    except Exception as e:
        logger.error(f"WebSocket fallback test failed: {str(e)}")
        return False


async def test_data_fetcher_fallback():
    """Test data fetcher fallback mechanism"""
    logger.info("Testing data fetcher fallback mechanism...")
    
    try:
        # Set an invalid API key to force fallback
        original_api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
        os.environ["ALPHA_VANTAGE_API_KEY"] = "invalid-key"
        
        data_fetcher = DataFetcher()
        await data_fetcher.initialize()
        
        # Fetch data for an invalid symbol to trigger fallback
        market_data = await data_fetcher.fetch_historical_data("INVALID_SYMBOL")
        
        # Check if fallback data was generated
        if market_data and len(market_data) > 0:
            logger.info(f"✓ Data fetcher fallback generated {len(market_data)} data points")
        else:
            logger.warning("Data fetcher fallback mechanism failed to generate data")
            
        # Restore original API key
        if original_api_key:
            os.environ["ALPHA_VANTAGE_API_KEY"] = original_api_key
            
        return bool(market_data and len(market_data) > 0)
    except Exception as e:
        logger.error(f"Data fetcher fallback test failed: {str(e)}")
        return False


async def run_all_tests():
    """Run all robustness tests"""
    logger.info("Starting robustness tests...")
    
    test_results = {
        "component_initialization": await test_component_initialization(),
        "app_lifecycle": await test_app_lifecycle(),
        "websocket_fallback": await test_websocket_fallback(),
        "data_fetcher_fallback": await test_data_fetcher_fallback()
    }
    
    # Log results
    logger.info("Test Results:")
    all_passed = True
    for test_name, result in test_results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        logger.info(f"{status} - {test_name}")
        if not result:
            all_passed = False
    
    if all_passed:
        logger.info("✓ All robustness tests passed successfully!")
    else:
        logger.warning("✗ Some robustness tests failed. Check the logs for details.")
    
    return all_passed


def main():
    """Entry point for running robustness tests"""
    # Create logs directory if it doesn't exist
    os.makedirs("logs", exist_ok=True)
    
    # Run the tests
    start_time = time.time()
    try:
        result = asyncio.run(run_all_tests())
        elapsed_time = time.time() - start_time
        logger.info(f"Tests completed in {elapsed_time:.2f} seconds")
        return 0 if result else 1
    except KeyboardInterrupt:
        logger.info("Tests interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Unexpected error during tests: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(main()) 