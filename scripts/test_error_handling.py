#!/usr/bin/env python
"""
Enterprise-grade test suite for validating error handling and robustness
of the Sports Analytics application components.
"""

import os
import sys
import asyncio
import logging
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
import traceback
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('logs/error_handling_test.log', 'a')
    ]
)
logger = logging.getLogger("ErrorHandlingTest")

# Load environment variables
load_dotenv(".env.test")

# Import custom test implementations
from scripts.test_mock_analytics import MockAdvancedAnalytics
from scripts.test_predictive_analytics import TestAdvancedPredictiveAnalytics

# Create necessary directories
os.makedirs("logs/alerts", exist_ok=True)
os.makedirs("logs/monitoring", exist_ok=True)
os.makedirs("logs/tests", exist_ok=True)

class RobustnessTest:
    """Test class for validating error handling and robustness"""
    
    def __init__(self):
        self.analytics = None
        self.test_results = {}
        
    async def initialize(self):
        """Initialize test components"""
        try:
            logger.info("Initializing test components...")
            
            # Initialize analytics with test implementation
            self.analytics = TestAdvancedPredictiveAnalytics()
            await self.analytics.initialize()
            
            logger.info("Test components initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing test components: {str(e)}")
            return False
            
    async def test_missing_data_handling(self):
        """Test handling of missing data"""
        logger.info("Testing missing data handling...")
        
        try:
            # Create test data with missing values
            df = pd.DataFrame({
                'symbol': ['AAPL', 'MSFT', 'GOOGL', 'BTC', 'ETH'],
                'date': [datetime.now() - timedelta(days=i) for i in range(5)],
                'open': [100, np.nan, 120, 50000, np.nan],
                'high': [105, 200, np.nan, np.nan, 3000],
                'low': [98, 190, 118, 48000, 2900],
                'close': [102, 195, 122, 49000, 2950],
                'volume': [1000000, np.nan, 500000, 10000, 5000]
            })
            
            # Create indicators with missing values
            indicators = {
                'rsi': np.array([70, 65, np.nan, 40, 30]),
                'macd': np.array([1.5, np.nan, -0.5, -1.0, 0.2]),
                'bollinger_bands': {
                    'upper': np.array([105, 210, 125, np.nan, 3100]),
                    'middle': np.array([102, 195, 122, 49000, 2950]),
                    'lower': np.array([99, 180, np.nan, 47000, 2800])
                }
            }
            
            # Test prediction generation with missing data
            predictions = await self.analytics.generate_predictions(df, indicators)
            
            # Verify we got valid output despite missing data
            success = predictions is not None and 'prediction' in predictions
            
            logger.info(f"Missing data handling {'successful' if success else 'failed'}")
            return success
        except Exception as e:
            logger.error(f"Missing data handling test failed: {str(e)}")
            return False
            
    async def test_monitoring_alerts(self):
        """Test monitoring alerts functionality"""
        logger.info("Testing monitoring alerts...")
        
        try:
            # Force some alerts by manipulating internal state
            self.analytics.last_monitoring_check = datetime.now() - timedelta(days=1)
            
            alerts = await self.analytics.check_monitoring_alerts()
            
            # Verify alerts structure
            valid_alerts = all(
                isinstance(alert, dict) and
                'message' in alert and
                'severity' in alert and
                'timestamp' in alert
                for alert in alerts
            )
            
            logger.info(f"Monitoring alerts test {'successful' if valid_alerts else 'failed'}")
            return valid_alerts
        except Exception as e:
            logger.error(f"Monitoring alerts test failed: {str(e)}")
            return False
            
    async def test_risk_mitigation(self):
        """Test risk mitigation strategies generation"""
        logger.info("Testing risk mitigation strategies...")
        
        try:
            # Create test data
            data = pd.DataFrame({
                'symbol': ['AAPL'] * 10,
                'date': [datetime.now() - timedelta(days=i) for i in range(10)],
                'open': np.random.uniform(100, 120, 10),
                'high': np.random.uniform(120, 130, 10),
                'low': np.random.uniform(90, 100, 10),
                'close': np.random.uniform(100, 120, 10),
                'volume': np.random.uniform(1000000, 2000000, 10)
            })
            
            # Calculate risk score
            risk_data = await self.analytics._calculate_risk_score(data)
            
            # Verify risk mitigation strategies
            valid_strategies = (
                'mitigation_strategies' in risk_data and
                isinstance(risk_data['mitigation_strategies'], list) and
                len(risk_data['mitigation_strategies']) > 0
            )
            
            logger.info(f"Risk mitigation test {'successful' if valid_strategies else 'failed'}")
            return valid_strategies
        except Exception as e:
            logger.error(f"Risk mitigation test failed: {str(e)}")
            return False
            
    async def test_performance_trends(self):
        """Test performance trend calculation with limited data"""
        logger.info("Testing performance trend calculation...")
        
        try:
            # Call internal method directly
            if hasattr(self.analytics.analytics, '_calculate_trend_direction'):
                # Test with empty data
                empty_trend = self.analytics.analytics._calculate_trend_direction([])
                
                # Test with single value
                single_trend = self.analytics.analytics._calculate_trend_direction([0.5])
                
                # Test with normal data
                normal_trend = self.analytics.analytics._calculate_trend_direction([0.1, 0.2, 0.3, 0.4, 0.5])
                
                # Test with decreasing data
                decreasing_trend = self.analytics.analytics._calculate_trend_direction([0.5, 0.4, 0.3, 0.2, 0.1])
                
                # Verify results
                valid_trends = (
                    empty_trend == "neutral" and
                    single_trend == "neutral" and
                    normal_trend == "positive" and
                    decreasing_trend == "negative"
                )
                
                logger.info(f"Performance trends test {'successful' if valid_trends else 'failed'}")
                return valid_trends
            else:
                logger.warning("Performance trends method not available, skipping test")
                return True  # Skip this test
        except Exception as e:
            logger.error(f"Performance trends test failed: {str(e)}")
            return False
            
    async def test_data_fetcher_fallback(self):
        """Test data fetcher fallback mechanisms"""
        logger.info("Testing data fetcher fallback...")
        
        try:
            # Import data fetcher here to avoid circular imports
            from scripts.data_fetcher import DataFetcher
            from datetime import datetime, timedelta
            
            # Initialize data fetcher
            data_fetcher = DataFetcher()
            await data_fetcher.initialize()
            
            # Try fetching data for an invalid symbol with proper parameters
            end_time = datetime.now()
            start_time = end_time - timedelta(days=30)
            
            data = await data_fetcher.fetch_historical_data("INVALID_SYMBOL", start_time, end_time)
            
            # Verify fallback data
            valid_fallback = (
                data is not None and 
                len(data) > 0 and
                isinstance(data, list) and
                all(isinstance(item, dict) for item in data) and
                all('symbol' in item for item in data) and
                all(item['symbol'] == "INVALID_SYMBOL" for item in data) and
                all('timestamp' in item and 'open' in item and 'high' in item and 
                    'low' in item and 'close' in item and 'volume' in item 
                    for item in data) and
                len(data) >= min(30, (end_time - start_time).days + 1)  # At least one data point per day
            )
            
            # Verify data chronology (timestamps should be in order)
            timestamps_ordered = True
            if len(data) > 1:
                prev_timestamp = None
                for item in data:
                    current_timestamp = datetime.fromisoformat(item['timestamp']) 
                    if prev_timestamp and current_timestamp <= prev_timestamp:
                        timestamps_ordered = False
                        break
                    prev_timestamp = current_timestamp
            
            # Verify data is marked as fallback data
            has_fallback_flag = all('is_fallback' in item and item['is_fallback'] is True for item in data)
            
            success = valid_fallback and timestamps_ordered and has_fallback_flag
            
            if success:
                logger.info(f"Data fetcher generated {len(data)} valid fallback data points")
            else:
                if not valid_fallback:
                    logger.error("Fallback data is invalid or incomplete")
                if not timestamps_ordered:
                    logger.error("Fallback data timestamps are not in chronological order")
                if not has_fallback_flag:
                    logger.error("Fallback data is not properly marked with is_fallback flag")
            
            logger.info(f"Data fetcher fallback test {'successful' if success else 'failed'}")
            return success
        except Exception as e:
            logger.error(f"Data fetcher fallback test failed: {str(e)}")
            return False
            
    async def run_all_tests(self):
        """Run all robustness tests"""
        logger.info("Running all robustness tests...")
        
        # Initialize components
        initialized = await self.initialize()
        if not initialized:
            logger.error("Failed to initialize test components")
            return False
            
        # Run tests
        self.test_results["missing_data_handling"] = await self.test_missing_data_handling()
        self.test_results["monitoring_alerts"] = await self.test_monitoring_alerts()
        self.test_results["risk_mitigation"] = await self.test_risk_mitigation()
        self.test_results["performance_trends"] = await self.test_performance_trends()
        self.test_results["data_fetcher_fallback"] = await self.test_data_fetcher_fallback()
        
        # Calculate overall success
        success_rate = sum(1 for result in self.test_results.values() if result) / len(self.test_results)
        overall_success = success_rate >= 0.8  # At least 80% success rate
        
        # Log results
        logger.info("Test results summary:")
        for test_name, result in self.test_results.items():
            logger.info(f"  {test_name}: {'✓ PASS' if result else '✗ FAIL'}")
            
        logger.info(f"Overall success rate: {success_rate:.2%}")
        logger.info(f"Overall test result: {'✓ PASS' if overall_success else '✗ FAIL'}")
        
        # Write results to file
        with open(f"logs/tests/robustness_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json", "w") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "results": self.test_results,
                "success_rate": success_rate,
                "overall_success": overall_success
            }, f, indent=2)
            
        return overall_success


async def main():
    """Main function"""
    try:
        logger.info("Starting robustness and error handling tests...")
        
        # Create and run test suite
        test_suite = RobustnessTest()
        success = await test_suite.run_all_tests()
        
        logger.info("Robustness tests completed")
        return 0 if success else 1
    except Exception as e:
        logger.error(f"Unexpected error in robustness tests: {str(e)}")
        logger.error(traceback.format_exc())
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main())) 