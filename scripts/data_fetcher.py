"""
Data Fetcher Module for Sports Analytics Pro
Version 1.1.0
Enterprise-Grade Real-Time Data Acquisition
"""

import aiohttp
import asyncio
import logging
import os
import json
from typing import Dict, List, Optional, Union
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from dataclasses import dataclass
from dotenv import load_dotenv
from scripts.config import config
from scripts.data_processor import MarketData
import time

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class DataSource:
    """Data source configuration"""
    name: str
    url: str
    api_key: str
    rate_limit: int
    timeout: int
    headers: Dict = None
    
    def __post_init__(self):
        if self.headers is None:
            self.headers = {}
        self.headers.update({
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        })

class DataFetcher:
    """Enterprise-grade data fetcher for real-time market data"""
    
    def __init__(self):
        self.sources = {}
        self.session = None
        self.last_fetch = {}
        self.error_counts = {}
        self.max_retries = 3
        self.retry_delay = 1
        self._initialize_sources()
        
    def _initialize_sources(self):
        """Initialize data sources"""
        try:
            # Initialize primary data source
            self.sources['primary'] = DataSource(
                name='primary',
                url=config.api.primary_url,
                api_key=config.api.primary_key,
                rate_limit=config.api.max_requests_per_minute,
                timeout=config.api.request_timeout
            )
            
            # Initialize backup data source
            self.sources['backup'] = DataSource(
                name='backup',
                url=config.api.backup_url,
                api_key=config.api.backup_key,
                rate_limit=config.api.max_requests_per_minute,
                timeout=config.api.request_timeout
            )
            
            logger.info("Data sources initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing data sources: {str(e)}")
            raise
            
    async def initialize(self):
        """Initialize aiohttp session"""
        try:
            if not self.session:
                self.session = aiohttp.ClientSession()
                logger.info("aiohttp session initialized")
        except Exception as e:
            logger.error(f"Error initializing aiohttp session: {str(e)}")
            raise
            
    async def close(self):
        """Close aiohttp session"""
        try:
            if self.session:
                await self.session.close()
                self.session = None
                logger.info("aiohttp session closed")
        except Exception as e:
            logger.error(f"Error closing aiohttp session: {str(e)}")
            raise
            
    async def fetch_market_data(self, symbol: str, source: str = 'primary') -> Optional[MarketData]:
        """Fetch market data for a symbol"""
        try:
            if not self.session:
                await self.initialize()
                
            # Check rate limit
            if not self._check_rate_limit(source):
                logger.warning(f"Rate limit reached for source {source}")
                return None
                
            # Prepare request
            url = f"{self.sources[source].url}/market-data/{symbol}"
            headers = self.sources[source].headers
            
            # Make request with retries
            for attempt in range(self.max_retries):
                try:
                    async with self.session.get(url, headers=headers, timeout=self.sources[source].timeout) as response:
                        if response.status == 200:
                            data = await response.json()
                            self._update_fetch_time(source)
                            return self._parse_market_data(data)
                        elif response.status == 429:  # Rate limit
                            logger.warning(f"Rate limit hit for source {source}")
                            await asyncio.sleep(self.retry_delay * (attempt + 1))
                        else:
                            logger.error(f"Error fetching data: {response.status}")
                            self._increment_error_count(source)
                            break
                            
                except asyncio.TimeoutError:
                    logger.error(f"Timeout fetching data from {source}")
                    self._increment_error_count(source)
                    break
                except Exception as e:
                    logger.error(f"Error in fetch attempt {attempt + 1}: {str(e)}")
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(self.retry_delay * (attempt + 1))
                    else:
                        self._increment_error_count(source)
                        break
                        
            # Try backup source if primary fails
            if source == 'primary' and self.error_counts['primary'] >= self.max_retries:
                logger.info("Switching to backup source")
                return await self.fetch_market_data(symbol, 'backup')
                
            return None
            
        except Exception as e:
            logger.error(f"Error fetching market data: {str(e)}")
            raise
            
    async def fetch_historical_data(self, symbol: str, start_time: datetime, end_time: datetime, source: str = 'primary') -> List[Dict]:
        """Fetch historical market data"""
        try:
            if not self.session:
                await self.initialize()
                
            # Check rate limit
            if not self._check_rate_limit(source):
                logger.warning(f"Rate limit reached for source {source}")
                await self._log_data_fetch_failure(symbol, source, "Rate limit exceeded")
                return self._generate_fallback_historical_data(symbol, start_time, end_time)
                
            # Prepare request
            url = f"{self.sources[source].url}/historical-data/{symbol}"
            params = {
                'start_time': start_time.isoformat(),
                'end_time': end_time.isoformat()
            }
            headers = self.sources[source].headers
            
            # Make request with retries
            for attempt in range(self.max_retries):
                try:
                    async with self.session.get(url, params=params, headers=headers, timeout=self.sources[source].timeout) as response:
                        if response.status == 200:
                            data = await response.json()
                            self._update_fetch_time(source)
                            
                            # Parse the data and convert to dictionaries with symbol
                            result = []
                            for item in data:
                                market_data = self._parse_market_data(item)
                                result.append({
                                    "symbol": symbol,
                                    "timestamp": market_data.timestamp.isoformat(),
                                    "open": market_data.open,
                                    "high": market_data.high,
                                    "low": market_data.low,
                                    "close": market_data.close,
                                    "volume": market_data.volume
                                })
                            
                            # If we got an empty result from API but it returned 200, generate fallback data
                            if not result:
                                logger.warning(f"API returned empty data set for {symbol} with status 200")
                                return self._generate_fallback_historical_data(symbol, start_time, end_time)
                                
                            return result
                            
                        elif response.status == 429:  # Rate limit
                            logger.warning(f"Rate limit hit for source {source}")
                            await asyncio.sleep(self.retry_delay * (attempt + 1))
                        else:
                            logger.error(f"Error fetching historical data: {response.status}")
                            self._increment_error_count(source)
                            break
                            
                except asyncio.TimeoutError:
                    logger.error(f"Timeout fetching historical data from {source}")
                    self._increment_error_count(source)
                    break
                except Exception as e:
                    logger.error(f"Error in fetch attempt {attempt + 1}: {str(e)}")
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(self.retry_delay * (attempt + 1))
                    else:
                        self._increment_error_count(source)
                        break
                        
            # Try backup source if primary fails
            if source == 'primary' and self.error_counts['primary'] >= self.max_retries:
                logger.info("Switching to backup source for historical data")
                return await self.fetch_historical_data(symbol, start_time, end_time, 'backup')
            
            # If we got here, both sources failed
            logger.error(f"Failed to fetch historical data for {symbol} from all sources")
            await self._log_data_fetch_failure(symbol, source, "All sources failed")
            return self._generate_fallback_historical_data(symbol, start_time, end_time)
            
        except Exception as e:
            error_id = f"{int(time.time())}"
            logger.error(f"[{error_id}] Error fetching historical data: {str(e)}")
            await self._log_data_fetch_failure(symbol, source, f"Exception: {str(e)}")
            return self._generate_fallback_historical_data(symbol, start_time, end_time)
            
    def _parse_market_data(self, data: Dict) -> MarketData:
        """Parse market data from API response"""
        try:
            return MarketData(
                timestamp=datetime.fromisoformat(data['timestamp']),
                open=float(data['open']),
                high=float(data['high']),
                low=float(data['low']),
                close=float(data['close']),
                volume=float(data['volume'])
            )
        except Exception as e:
            logger.error(f"Error parsing market data: {str(e)}")
            raise
            
    def _check_rate_limit(self, source: str) -> bool:
        """Check if rate limit is exceeded"""
        try:
            if source not in self.last_fetch:
                return True
                
            time_since_last = (datetime.now() - self.last_fetch[source]).total_seconds()
            return time_since_last >= (60 / self.sources[source].rate_limit)
            
        except Exception as e:
            logger.error(f"Error checking rate limit: {str(e)}")
            return False
            
    def _update_fetch_time(self, source: str):
        """Update last fetch time for a source"""
        self.last_fetch[source] = datetime.now()
        
    def _increment_error_count(self, source: str):
        """Increment error count for a source"""
        if source not in self.error_counts:
            self.error_counts[source] = 0
        self.error_counts[source] += 1
        
    @property
    def error_rates(self) -> Dict[str, float]:
        """Get error rates for all sources"""
        return {
            source: count / (len(self.last_fetch) if source in self.last_fetch else 1)
            for source, count in self.error_counts.items()
        }
        
    def _generate_fallback_historical_data(self, symbol: str, start_time: datetime, end_time: datetime) -> List[Dict]:
        """Generate fallback historical data when real data is unavailable"""
        logger.warning(f"Generating fallback historical data for {symbol}")
        
        # Calculate number of days between start and end
        days_diff = (end_time - start_time).days
        
        # Ensure at least one day of data
        num_days = max(days_diff, 1)
        
        # Generate synthetic data
        fallback_data = []
        
        # Base values - would be better if these were based on symbol specifics in production
        base_open = 100.0
        base_close = 101.0
        base_high = 102.0
        base_low = 99.0
        base_volume = 10000.0
        
        # Generate one data point per day
        current_time = start_time
        for i in range(num_days):
            # Add some variation to make it look realistic
            variation = (i % 5 - 2) / 100  # -2% to +2% variation
            
            # Create a dictionary instead of MarketData object to ensure consistent format
            data_point = {
                "symbol": symbol,
                "timestamp": current_time.isoformat(),
                "open": base_open * (1 + variation),
                "high": base_high * (1 + variation * 1.5),
                "low": base_low * (1 + variation * 0.5),
                "close": base_close * (1 + variation * 1.2),
                "volume": base_volume * (1 + abs(variation) * 5),
                "is_fallback": True  # Flag indicating this is synthetic data
            }
            
            fallback_data.append(data_point)
            current_time += timedelta(days=1)
            
        # Log details about fallback data
        logger.info(f"Generated {len(fallback_data)} fallback data points for {symbol}")
        
        return fallback_data
        
    async def _log_data_fetch_failure(self, symbol: str, source: str, reason: str):
        """Log data fetch failure to monitoring system"""
        try:
            # In production, this would send to a centralized monitoring system
            failure_data = {
                "symbol": symbol,
                "source": source,
                "reason": reason,
                "timestamp": datetime.now().isoformat(),
                "component": "DataFetcher"
            }
            
            # Log to file
            os.makedirs('logs/data_fetch_failures', exist_ok=True)
            date_str = datetime.now().strftime('%Y-%m-%d')
            file_path = f'logs/data_fetch_failures/failures_{date_str}.log'
            
            with open(file_path, 'a') as f:
                f.write(f"{json.dumps(failure_data)}\n")
                
        except Exception as e:
            logger.error(f"Error logging data fetch failure: {str(e)}")
        
async def test_fetcher():
    """Test the data fetcher"""
    fetcher = DataFetcher()
    await fetcher.initialize()
    try:
        # Test market data fetch
        data = await fetcher.fetch_market_data('AAPL')
        if data:
            print(f"Market data: {data}")
            
        # Test historical data fetch
        end_time = datetime.now()
        start_time = end_time - timedelta(days=7)
        historical_data = await fetcher.fetch_historical_data('AAPL', start_time, end_time)
        if historical_data:
            print(f"Historical data count: {len(historical_data)}")
            # Print sample data point
            if len(historical_data) > 0:
                print(f"Sample data point: {json.dumps(historical_data[0], indent=2)}")
                
        # Test fallback data generation
        fallback_data = await fetcher.fetch_historical_data('INVALID_SYMBOL', start_time, end_time)
        if fallback_data:
            print(f"Fallback data count: {len(fallback_data)}")
            # Print sample fallback data point
            if len(fallback_data) > 0:
                print(f"Sample fallback data point: {json.dumps(fallback_data[0], indent=2)}")
            
    finally:
        await fetcher.close() 