"""
Enterprise-Level Predictive Capabilities Test Suite
Validates the integration and functioning of predictive analytics components
"""

import asyncio
import logging
import os
import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# Configure logging to file and console
os.makedirs('logs/tests', exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/tests/predictive_capabilities_test.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("PredictiveTests")

# Import components to test
from scripts.data_fetcher import DataFetcher
from scripts.data_processor import DataProcessor, MarketData
from scripts.predictive_analytics import AdvancedPredictiveAnalytics

class PredictiveCapabilitiesTester:
    """Tests predictive capabilities and integration"""
    
    def __init__(self):
        self.data_fetcher = None
        self.data_processor = None
        self.predictive_analytics = None
        self.tests_run = 0
        self.tests_passed = 0
        
    async def setup(self):
        """Initialize components for testing"""
        logger.info("Initializing predictive components...")
        self.data_fetcher = DataFetcher()
        await self.data_fetcher.initialize()
        
        self.data_processor = DataProcessor()
        self.predictive_analytics = AdvancedPredictiveAnalytics()
        await self.predictive_analytics.initialize()
        
        logger.info("Components initialized successfully")
        
    async def teardown(self):
        """Clean up after tests"""
        logger.info("Cleaning up test resources...")
        if self.data_fetcher:
            await self.data_fetcher.close()
        logger.info("Cleanup complete")
        
    async def run_tests(self):
        """Run all predictive capability tests"""
        try:
            await self.setup()
            
            # Test data processing
            await self.test_data_processing()
            
            # Test technical indicators
            await self.test_technical_indicators()
            
            # Test market regime detection
            await self.test_market_regime_detection()
            
            # Test prediction generation
            await self.test_prediction_generation()
            
            # Test prediction accuracy metrics
            await self.test_prediction_metrics()
            
            # Test feature importance
            await self.test_feature_importance()
            
            # Print results
            logger.info(f"Tests completed: {self.tests_run} run, {self.tests_passed} passed, "
                        f"{self.tests_run - self.tests_passed} failed")
            
            if self.tests_passed == self.tests_run:
                logger.info("All predictive capabilities tests passed!")
                return True
            else:
                logger.warning("Some predictive capabilities tests failed. Review logs for details.")
                return False
                
        except Exception as e:
            logger.error(f"Error running predictive tests: {str(e)}")
            return False
        finally:
            await self.teardown()
            
    async def test_data_processing(self):
        """Test data processing capabilities"""
        logger.info("Testing data processing capabilities...")
        self.tests_run += 1
        
        try:
            # Create sample market data
            sample_data = self._create_sample_market_data()
            
            # Process the data
            processed_data, indicators = self.data_processor.process_market_data(sample_data)
            
            # Verify results
            if processed_data and isinstance(processed_data, dict) and 'timestamp' in processed_data:
                logger.info("✓ Data processing successful")
                self.tests_passed += 1
            else:
                logger.error("✗ Data processing failed to produce valid results")
        except Exception as e:
            logger.error(f"✗ Data processing test failed with exception: {str(e)}")
            
    async def test_technical_indicators(self):
        """Test technical indicator calculation"""
        logger.info("Testing technical indicator calculations...")
        self.tests_run += 1
        
        try:
            # Create sample market data series
            sample_data_series = self._create_sample_market_data_series()
            
            # Calculate technical indicators
            indicators = self.data_processor.calculate_technical_indicators(sample_data_series)
            
            # Verify results
            required_indicators = ['sma', 'ema', 'rsi', 'macd', 'bollinger_bands', 'atr']
            missing_indicators = [ind for ind in required_indicators if ind not in indicators]
            
            if not missing_indicators:
                logger.info("✓ Technical indicators calculation successful")
                self.tests_passed += 1
            else:
                logger.error(f"✗ Technical indicators calculation missing: {missing_indicators}")
        except Exception as e:
            logger.error(f"✗ Technical indicators test failed with exception: {str(e)}")
            
    async def test_market_regime_detection(self):
        """Test market regime detection"""
        logger.info("Testing market regime detection...")
        self.tests_run += 1
        
        try:
            # Create sample market data series
            sample_data_series = self._create_sample_market_data_series()
            
            # Detect market regime
            regimes = self.data_processor.detect_market_regime(sample_data_series)
            
            # Verify results
            if isinstance(regimes, dict) and 'primary_regime' in regimes:
                logger.info("✓ Market regime detection successful")
                self.tests_passed += 1
            else:
                logger.error("✗ Market regime detection failed to produce valid results")
        except Exception as e:
            logger.error(f"✗ Market regime detection test failed with exception: {str(e)}")
            
    async def test_prediction_generation(self):
        """Test prediction generation"""
        logger.info("Testing prediction generation...")
        self.tests_run += 1
        
        try:
            # Create sample market data
            sample_data = self._create_sample_market_data()
            
            # Process the data
            processed_data, indicators = self.data_processor.process_market_data(sample_data)
            
            # Generate predictions
            predictions = await self.predictive_analytics.generate_predictions(processed_data, indicators)
            
            # Verify results
            if isinstance(predictions, dict) and 'prediction' in predictions:
                logger.info("✓ Prediction generation successful")
                logger.info(f"  - Prediction value: {predictions['prediction']}")
                logger.info(f"  - Confidence: {predictions.get('confidence', 'N/A')}")
                self.tests_passed += 1
            else:
                logger.error("✗ Prediction generation failed to produce valid results")
        except Exception as e:
            logger.error(f"✗ Prediction generation test failed with exception: {str(e)}")
            
    async def test_prediction_metrics(self):
        """Test prediction accuracy metrics"""
        logger.info("Testing prediction accuracy metrics...")
        self.tests_run += 1
        
        try:
            # Get prediction metrics
            metrics = await self.predictive_analytics.get_performance_metrics()
            
            # Verify results
            required_metrics = ['accuracy', 'precision', 'recall', 'f1_score']
            missing_metrics = [metric for metric in required_metrics if metric not in metrics]
            
            if not missing_metrics:
                logger.info("✓ Prediction metrics calculation successful")
                self.tests_passed += 1
            else:
                logger.error(f"✗ Prediction metrics calculation missing: {missing_metrics}")
        except Exception as e:
            logger.error(f"✗ Prediction metrics test failed with exception: {str(e)}")
            
    async def test_feature_importance(self):
        """Test feature importance calculation"""
        logger.info("Testing feature importance calculation...")
        self.tests_run += 1
        
        try:
            # Get feature importance
            feature_importance = await self.predictive_analytics.get_feature_importance()
            
            # Verify results
            if isinstance(feature_importance, dict) and len(feature_importance) > 0:
                logger.info("✓ Feature importance calculation successful")
                # Log top 3 features
                top_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:3]
                for feature, importance in top_features:
                    logger.info(f"  - {feature}: {importance:.4f}")
                self.tests_passed += 1
            else:
                logger.error("✗ Feature importance calculation failed to produce valid results")
        except Exception as e:
            logger.error(f"✗ Feature importance test failed with exception: {str(e)}")
            
    def _create_sample_market_data(self):
        """Create a sample market data point for testing"""
        return MarketData(
            timestamp=datetime.now(),
            open=100.0,
            high=102.0,
            low=99.0,
            close=101.5,
            volume=10000.0
        )
        
    def _create_sample_market_data_series(self):
        """Create a sample market data series for testing"""
        data = []
        base_price = 100.0
        timestamp = datetime.now() - timedelta(days=30)
        
        for i in range(30):
            # Add some random variation
            daily_change = np.random.normal(0, 1)
            daily_volume = np.random.normal(10000, 1000)
            
            # Calculate prices
            open_price = base_price
            close_price = base_price + daily_change
            high_price = max(open_price, close_price) + abs(np.random.normal(0, 0.5))
            low_price = min(open_price, close_price) - abs(np.random.normal(0, 0.5))
            
            # Create market data
            market_data = MarketData(
                timestamp=timestamp + timedelta(days=i),
                open=open_price,
                high=high_price,
                low=low_price,
                close=close_price,
                volume=max(0, daily_volume)
            )
            
            data.append(market_data)
            
            # Update base price for next day
            base_price = close_price
            
        return data

class SystemFunctionalityTester:
    """Tests overall system functionality and integration"""
    
    def __init__(self):
        self.predictive_tester = PredictiveCapabilitiesTester()
        self.tests_run = 0
        self.tests_passed = 0
        
    async def run_tests(self):
        """Run comprehensive system functionality tests"""
        try:
            logger.info("Starting comprehensive system functionality tests...")
            
            # Test predictive capabilities
            predictive_success = await self.predictive_tester.run_tests()
            self.tests_run += 1
            if predictive_success:
                self.tests_passed += 1
                
            # Test data pipeline
            await self.test_data_pipeline()
            
            # Test analytics pipeline
            await self.test_analytics_pipeline()
            
            # Test integration points
            await self.test_integration_points()
            
            # Print results
            logger.info(f"System tests completed: {self.tests_run} run, {self.tests_passed} passed, "
                        f"{self.tests_run - self.tests_passed} failed")
            
            if self.tests_passed == self.tests_run:
                logger.info("✓ All system functionality tests passed! The system is operating correctly.")
            else:
                logger.warning("✗ Some system functionality tests failed. Review logs for details.")
                
        except Exception as e:
            logger.error(f"Error running system functionality tests: {str(e)}")
            
    async def test_data_pipeline(self):
        """Test the data pipeline end-to-end"""
        logger.info("Testing data pipeline end-to-end...")
        self.tests_run += 1
        
        try:
            # Initialize components
            data_fetcher = DataFetcher()
            await data_fetcher.initialize()
            
            data_processor = DataProcessor()
            
            # Fetch some data (will use fallback if API unavailable)
            end_time = datetime.now()
            start_time = end_time - timedelta(days=7)
            symbol = "SAMPLE_SYMBOL"
            
            historical_data = await data_fetcher.fetch_historical_data(symbol, start_time, end_time)
            
            # Process the data
            if historical_data:
                processed_series = []
                indicators_series = []
                
                for data_point in historical_data:
                    processed, indicators = data_processor.process_market_data(data_point)
                    processed_series.append(processed)
                    indicators_series.append(indicators)
                
                # Verify results
                if len(processed_series) == len(historical_data):
                    logger.info("✓ Data pipeline test successful")
                    logger.info(f"  - Processed {len(processed_series)} data points")
                    self.tests_passed += 1
                else:
                    logger.error("✗ Data pipeline failed to process all data points")
            else:
                logger.error("✗ Data pipeline failed to fetch historical data")
                
            # Close connections
            await data_fetcher.close()
            
        except Exception as e:
            logger.error(f"✗ Data pipeline test failed with exception: {str(e)}")
            
    async def test_analytics_pipeline(self):
        """Test the analytics pipeline end-to-end"""
        logger.info("Testing analytics pipeline end-to-end...")
        self.tests_run += 1
        
        try:
            # Initialize components
            data_processor = DataProcessor()
            predictive_analytics = AdvancedPredictiveAnalytics()
            await predictive_analytics.initialize()
            
            # Create sample data
            sample_data_series = self._create_sample_market_data_series()
            
            # Process the data
            processed_series = []
            indicators_series = []
            
            for data_point in sample_data_series:
                processed, indicators = data_processor.process_market_data(data_point)
                processed_series.append(processed)
                indicators_series.append(indicators)
                
            # Run analytics
            predictions = []
            for i in range(len(processed_series)):
                prediction = await predictive_analytics.generate_predictions(
                    processed_series[i],
                    indicators_series[i]
                )
                predictions.append(prediction)
                
            # Verify results
            if len(predictions) == len(sample_data_series):
                logger.info("✓ Analytics pipeline test successful")
                logger.info(f"  - Generated {len(predictions)} predictions")
                self.tests_passed += 1
            else:
                logger.error("✗ Analytics pipeline failed to generate all predictions")
                
        except Exception as e:
            logger.error(f"✗ Analytics pipeline test failed with exception: {str(e)}")
            
    async def test_integration_points(self):
        """Test the integration points between system components"""
        logger.info("Testing integration points between system components...")
        self.tests_run += 1
        
        try:
            from scripts.config import config
            
            # Verify configuration is properly loaded
            if hasattr(config, 'database') and hasattr(config, 'api') and hasattr(config, 'websocket'):
                logger.info("✓ Configuration integration successful")
                
                # Verify critical integration points
                integration_points = 0
                
                # Test data fetcher with config integration
                data_fetcher = DataFetcher()
                if hasattr(data_fetcher, 'sources'):
                    logger.info("✓ DataFetcher-Config integration verified")
                    integration_points += 1
                    
                # Test predictive analytics with config integration
                predictive_analytics = AdvancedPredictiveAnalytics()
                if hasattr(predictive_analytics, 'model_params'):
                    logger.info("✓ PredictiveAnalytics-Config integration verified")
                    integration_points += 1
                
                if integration_points >= 2:
                    logger.info("✓ Component integration test successful")
                    self.tests_passed += 1
                else:
                    logger.error("✗ Not all component integrations verified")
            else:
                logger.error("✗ Configuration integration failed")
                
        except Exception as e:
            logger.error(f"✗ Integration points test failed with exception: {str(e)}")
            
    def _create_sample_market_data_series(self):
        """Create a sample market data series for testing"""
        data = []
        base_price = 100.0
        timestamp = datetime.now() - timedelta(days=30)
        
        for i in range(30):
            # Add some random variation
            daily_change = np.random.normal(0, 1)
            daily_volume = np.random.normal(10000, 1000)
            
            # Calculate prices
            open_price = base_price
            close_price = base_price + daily_change
            high_price = max(open_price, close_price) + abs(np.random.normal(0, 0.5))
            low_price = min(open_price, close_price) - abs(np.random.normal(0, 0.5))
            
            # Create market data
            market_data = MarketData(
                timestamp=timestamp + timedelta(days=i),
                open=open_price,
                high=high_price,
                low=low_price,
                close=close_price,
                volume=max(0, daily_volume)
            )
            
            data.append(market_data)
            
            # Update base price for next day
            base_price = close_price
            
        return data

async def main():
    """Main entry point for test suite"""
    logger.info("Starting enterprise-level system testing...")
    system_tester = SystemFunctionalityTester()
    await system_tester.run_tests()
    logger.info("System testing complete")

if __name__ == "__main__":
    asyncio.run(main()) 