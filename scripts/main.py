"""
Main application module for Sports Analytics Pro
Version 2.0.0
Enterprise-Grade Sports Analytics Platform
"""

import asyncio
import logging
import signal
import sys
import os
from datetime import datetime, timedelta
import json
import traceback
from typing import Dict, List, Optional, Callable, Any
from dotenv import load_dotenv

# Set up asyncio policy for Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(
    level=getattr(logging, os.getenv('LOG_LEVEL', 'INFO')),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.getenv('LOG_FILE', 'logs/sports_analytics.log'))
    ]
)
logger = logging.getLogger(__name__)

# Import application modules
from .data_fetcher import DataFetcher
from .data_processor import DataProcessor
from .websocket_client import WebSocketClient
from .websocket_server import WebSocketServer
from .advanced_analytics import AdvancedPredictiveAnalytics
from .models import MarketData, AnalyticsRequest, WebSocketMessage
from .config import config


class SportsAnalyticsApp:
    """Main application class for Sports Analytics Pro"""
    
    def __init__(self):
        """Initialize the application"""
        logger.info("Initializing Sports Analytics Pro...")
        self.data_fetcher = None
        self.data_processor = None
        self.websocket_client = None
        self.websocket_server = None
        self.advanced_analytics = None
        self.running = False
        self.loop = None
        self.background_tasks = set()
        self.shutdown_event = None
        
    async def initialize(self):
        """Initialize all components"""
        try:
            logger.info("Initializing components...")
            
            # Initialize shutdown event
            self.shutdown_event = asyncio.Event()
            
            # Initialize data fetcher
            self.data_fetcher = DataFetcher()
            await self.data_fetcher.initialize()
            logger.info("Data fetcher initialized")
            
            # Initialize data processor
            self.data_processor = DataProcessor()
            await self.data_processor.initialize()
            logger.info("Data processor initialized")
            
            # Initialize WebSocket client
            self.websocket_client = WebSocketClient(
                uri=config.websocket.uri,
                client_id=config.client.id
            )
            logger.info("WebSocket client initialized")
            
            # Initialize WebSocket server if enabled
            if config.websocket.enable_server:
                self.websocket_server = WebSocketServer()
                logger.info("WebSocket server initialized")
            
            # Initialize advanced analytics
            self.advanced_analytics = AdvancedPredictiveAnalytics()
            await self.advanced_analytics.initialize()
            logger.info("Advanced analytics initialized")
            
            # Register WebSocket message handlers
            self._register_message_handlers()
            
            logger.info("All components initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing components: {str(e)}")
            logger.error(traceback.format_exc())
            return False
        
    async def start(self):
        """Start the application"""
        try:
            logger.info("Starting Sports Analytics Pro...")
            
            # Set running flag
            self.running = True
            
            # Connect to WebSocket
            await self.websocket_client.connect()
            logger.info("WebSocket client connected")
            
            # Start WebSocket server if enabled
            if config.websocket.enable_server and self.websocket_server:
                await self.websocket_server.start()
                logger.info("WebSocket server started")
            
            # Subscribe to market data
            await self.websocket_client.subscribe(['market_data', 'analytics_requests', 'system_status'])
            
            # Start background tasks
            self._start_background_tasks()
            
            logger.info("Sports Analytics Pro started successfully")
            return True
        except Exception as e:
            logger.error(f"Error starting application: {str(e)}")
            logger.error(traceback.format_exc())
            self.running = False
            return False
    
    def _start_background_tasks(self):
        """Start background tasks"""
        try:
            self.loop = asyncio.get_running_loop()
            
            # Start market data fetching task
            task = self.loop.create_task(self._fetch_market_data_task())
            task.add_done_callback(self._task_done_callback)
            self.background_tasks.add(task)
            
            # Start analytics update task
            task = self.loop.create_task(self._update_analytics_task())
            task.add_done_callback(self._task_done_callback)
            self.background_tasks.add(task)
            
            # Start visualization update task (if applicable)
            if hasattr(config, 'visualization') and config.visualization.enabled:
                task = self.loop.create_task(self._update_visualization_task())
                task.add_done_callback(self._task_done_callback)
                self.background_tasks.add(task)
            
            logger.info(f"Started {len(self.background_tasks)} background tasks")
        except Exception as e:
            logger.error(f"Error starting background tasks: {str(e)}")
    
    def _task_done_callback(self, task):
        """Callback for when a task is done"""
        try:
            self.background_tasks.discard(task)
            exception = task.exception()
            if exception:
                logger.error(f"Background task raised exception: {str(exception)}")
                # Don't reraise the exception, just log it to prevent application crash
        except asyncio.CancelledError:
            # Task was cancelled, this is expected during shutdown
            pass
        except Exception as e:
            logger.error(f"Error in task done callback: {str(e)}")
    
    async def stop(self):
        """Stop the application"""
        try:
            logger.info("Stopping Sports Analytics Pro...")
            
            # Set running flag to False
            self.running = False
            
            # Set shutdown event
            if self.shutdown_event:
                self.shutdown_event.set()
            
            # Cancel all background tasks
            for task in self.background_tasks:
                if not task.done():
                    task.cancel()
            
            # Wait for all tasks to complete with a timeout
            if self.background_tasks:
                try:
                    await asyncio.wait(self.background_tasks, timeout=5)
                except Exception as e:
                    logger.error(f"Error waiting for background tasks to complete: {str(e)}")
            
            # Close WebSocket connection
            if self.websocket_client:
                await self.websocket_client.disconnect()
                logger.info("WebSocket client disconnected")
            
            # Stop WebSocket server
            if self.websocket_server:
                await self.websocket_server.stop()
                logger.info("WebSocket server stopped")
            
            logger.info("Sports Analytics Pro stopped successfully")
        except Exception as e:
            logger.error(f"Error stopping application: {str(e)}")
            logger.error(traceback.format_exc())
    
    def _register_message_handlers(self):
        """Register WebSocket message handlers"""
        if self.websocket_client:
            self.websocket_client.register_handler('market_data', self._handle_market_data)
            self.websocket_client.register_handler('analytics_request', self._handle_analytics_request)
            self.websocket_client.register_handler('system_status', self._handle_system_status)
            self.websocket_client.register_handler('heartbeat', self._handle_heartbeat)
            logger.info("WebSocket message handlers registered")
    
    async def _handle_market_data(self, message):
        """Handle market data message"""
        try:
            logger.debug(f"Received market data message: {message.get('type')}")
            
            # Process market data
            if 'data' in message:
                market_data = MarketData.from_dict(message['data'])
                processed_data = await self.data_processor.process_market_data(market_data)
                
                # Generate analytics
                indicators = await self.data_processor.calculate_technical_indicators(market_data)
                predictions = await self.advanced_analytics.generate_predictions(processed_data, indicators)
                
                # Store or broadcast results
                # TODO: Implement storage/broadcasting
                logger.debug(f"Processed market data and generated predictions: {predictions.get('prediction')}")
        except Exception as e:
            logger.error(f"Error handling market data message: {str(e)}")
    
    async def _handle_analytics_request(self, message):
        """Handle analytics request message"""
        try:
            logger.debug(f"Received analytics request message: {message.get('type')}")
            
            # Process analytics request
            if 'data' in message:
                request = AnalyticsRequest.from_dict(message['data'])
                result = await self.advanced_analytics.process_request(request)
                
                # Send response
                if self.websocket_client:
                    await self.websocket_client.send_message({
                        'type': 'analytics_response',
                        'data': result
                    })
                    
                logger.debug(f"Processed analytics request: {request.request_type}")
        except Exception as e:
            logger.error(f"Error handling analytics request message: {str(e)}")
    
    async def _handle_system_status(self, message):
        """Handle system status message"""
        try:
            logger.debug(f"Received system status message: {message.get('type')}")
            
            # Process system status
            if 'data' in message and 'status' in message['data']:
                status = message['data']['status']
                logger.info(f"System status: {status}")
                
                # Handle different status types
                if status == 'warning':
                    logger.warning(f"System warning: {message['data'].get('message')}")
                elif status == 'error':
                    logger.error(f"System error: {message['data'].get('message')}")
                elif status == 'critical':
                    logger.critical(f"System critical error: {message['data'].get('message')}")
                    # Initiate emergency procedures if needed
                    if message['data'].get('shutdown', False):
                        logger.critical("Emergency shutdown initiated")
                        await self.stop()
        except Exception as e:
            logger.error(f"Error handling system status message: {str(e)}")
    
    async def _handle_heartbeat(self, message):
        """Handle heartbeat message"""
        try:
            logger.debug("Received heartbeat message")
            
            # Send heartbeat response
            if self.websocket_client:
                await self.websocket_client.send_message({
                    'type': 'heartbeat_response',
                    'data': {'timestamp': datetime.now().isoformat()}
                })
        except Exception as e:
            logger.error(f"Error handling heartbeat message: {str(e)}")
    
    async def _fetch_market_data_task(self):
        """Background task to fetch market data"""
        try:
            logger.info("Starting market data fetch task")
            
            while self.running and not self.shutdown_event.is_set():
                try:
                    # Get symbols from configuration
                    symbols = config.market_data.symbols
                    
                    for symbol in symbols:
                        # Fetch historical data
                        market_data = await self.data_fetcher.fetch_historical_data(symbol)
                        
                        # Process data
                        if market_data:
                            for data_point in market_data:
                                processed_data = await self.data_processor.process_market_data(data_point)
                                indicators = await self.data_processor.calculate_technical_indicators(data_point)
                                
                                # Generate analytics
                                predictions = await self.advanced_analytics.generate_predictions(processed_data, indicators)
                                
                                # Broadcast results
                                if self.websocket_server:
                                    await self.websocket_server.manager.broadcast({
                                        'type': 'market_update',
                                        'data': {
                                            'symbol': symbol,
                                            'processed_data': processed_data,
                                            'indicators': indicators,
                                            'predictions': predictions
                                        }
                                    }, 'market_data')
                    
                    # Wait for next fetch interval
                    await asyncio.sleep(config.market_data.fetch_interval)
                    
                except asyncio.CancelledError:
                    logger.info("Market data fetch task cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in market data fetch task: {str(e)}")
                    # Wait before retrying
                    await asyncio.sleep(10)
                    
            logger.info("Market data fetch task stopped")
        except asyncio.CancelledError:
            logger.info("Market data fetch task cancelled")
        except Exception as e:
            logger.error(f"Fatal error in market data fetch task: {str(e)}")
    
    async def _update_analytics_task(self):
        """Background task to update analytics"""
        try:
            logger.info("Starting analytics update task")
            
            while self.running and not self.shutdown_event.is_set():
                try:
                    # Update analytics models
                    await self.advanced_analytics.update_models()
                    
                    # Check monitoring alerts
                    alerts = await self.advanced_analytics.check_monitoring_alerts()
                    if alerts:
                        logger.warning(f"Monitoring alerts detected: {len(alerts)} alerts")
                        
                        # Process alerts
                        for alert in alerts:
                            logger.warning(f"Alert: {alert.get('message')} - Severity: {alert.get('severity')}")
                            
                            # Broadcast alerts
                            if self.websocket_server:
                                await self.websocket_server.manager.broadcast({
                                    'type': 'alert',
                                    'data': alert
                                }, 'alerts')
                    
                    # Wait for next update interval
                    await asyncio.sleep(config.analytics.update_interval)
                    
                except asyncio.CancelledError:
                    logger.info("Analytics update task cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in analytics update task: {str(e)}")
                    # Wait before retrying
                    await asyncio.sleep(10)
                    
            logger.info("Analytics update task stopped")
        except asyncio.CancelledError:
            logger.info("Analytics update task cancelled")
        except Exception as e:
            logger.error(f"Fatal error in analytics update task: {str(e)}")
    
    async def _update_visualization_task(self):
        """Background task to update visualizations"""
        try:
            logger.info("Starting visualization update task")
            
            while self.running and not self.shutdown_event.is_set():
                try:
                    # Update visualizations
                    # TODO: Implement visualization updates
                    
                    # Wait for next update interval
                    await asyncio.sleep(config.visualization.update_interval)
                    
                except asyncio.CancelledError:
                    logger.info("Visualization update task cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in visualization update task: {str(e)}")
                    # Wait before retrying
                    await asyncio.sleep(10)
                    
            logger.info("Visualization update task stopped")
        except asyncio.CancelledError:
            logger.info("Visualization update task cancelled")
        except Exception as e:
            logger.error(f"Fatal error in visualization update task: {str(e)}")


# Signal handler for graceful shutdown
def signal_handler(app):
    """Handle termination signals"""
    def _handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        
        # Create a new task to stop the application
        if app and hasattr(app, 'loop') and app.loop:
            app.loop.create_task(app.stop())
        else:
            logger.warning("Unable to stop application gracefully")
    
    return _handler


async def startup():
    """Startup function to initialize and start the application"""
    try:
        # Create application instance
        app = SportsAnalyticsApp()
        
        # Register signal handlers
        signal.signal(signal.SIGINT, signal_handler(app))
        signal.signal(signal.SIGTERM, signal_handler(app))
        
        # Initialize application
        initialized = await app.initialize()
        if not initialized:
            logger.error("Failed to initialize application")
            return 1
        
        # Start application
        started = await app.start()
        if not started:
            logger.error("Failed to start application")
            await app.stop()
            return 1
        
        # Keep application running until stopped
        while app.running:
            await asyncio.sleep(1)
        
        # Return success
        return 0
    except Exception as e:
        logger.error(f"Fatal error in startup: {str(e)}")
        logger.error(traceback.format_exc())
        return 1


def main():
    """Main entry point"""
    try:
        # Create logs directory if it doesn't exist
        os.makedirs('logs', exist_ok=True)
        
        # Set up async event loop
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
        # Create event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run startup function
        exit_code = loop.run_until_complete(startup())
        
        # Clean up
        loop.close()
        
        return exit_code
    except KeyboardInterrupt:
        logger.info("Application interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.error(traceback.format_exc())
        return 1


if __name__ == "__main__":
    sys.exit(main()) 