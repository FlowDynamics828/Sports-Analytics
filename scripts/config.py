"""
Configuration Module for Sports Analytics Pro
Version 1.0.0
Enterprise-Grade Configuration Management
"""

import os
from dataclasses import dataclass, field
from typing import Optional, List
from dotenv import load_dotenv
from pathlib import Path

# Get the root directory (parent of scripts directory)
ROOT_DIR = Path(__file__).parent.parent

# Load environment variables from root directory
load_dotenv(ROOT_DIR / '.env')

@dataclass
class DatabaseConfig:
    """Database configuration settings"""
    mongodb_url: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    database_name: str = os.getenv("DATABASE_NAME", "sports_analytics")
    collection_prefix: str = os.getenv("COLLECTION_PREFIX", "sap_")
    max_connections: int = int(os.getenv("MAX_DB_CONNECTIONS", "100"))
    connection_timeout: int = int(os.getenv("DB_CONNECTION_TIMEOUT", "30"))

@dataclass
class APIConfig:
    """API configuration settings"""
    primary_url: str = os.getenv("PRIMARY_API_URL", "https://api.sportsanalytics.com/v1")
    primary_key: str = os.getenv("PRIMARY_API_KEY", "")
    backup_url: str = os.getenv("BACKUP_API_URL", "https://backup-api.sportsanalytics.com/v1")
    backup_key: str = os.getenv("BACKUP_API_KEY", "")
    odds_api_key: str = os.getenv("ODDS_API_KEY", "")
    betfair_api_key: str = os.getenv("BETFAIR_API_KEY", "")
    betfair_session_token: str = os.getenv("BETFAIR_SESSION_TOKEN", "")
    sports_db_api_key: str = os.getenv("SPORTS_DB_API_KEY", "")
    max_requests_per_minute: int = int(os.getenv("MAX_REQUESTS_PER_MINUTE", "60"))
    request_timeout: int = int(os.getenv("REQUEST_TIMEOUT", "30"))
    retry_attempts: int = int(os.getenv("RETRY_ATTEMPTS", "3"))
    retry_delay: int = int(os.getenv("RETRY_DELAY", "5"))

@dataclass
class WebSocketConfig:
    """WebSocket configuration settings"""
    server_url: str = os.getenv("WEBSOCKET_SERVER_URL", "ws://localhost:8765")
    client_id: str = os.getenv("CLIENT_ID", "default_client")
    jwt_secret: str = os.getenv("JWT_SECRET", "your-secret-key")
    ssl_cert: Optional[str] = os.getenv("SSL_CERT_PATH")
    ssl_key: Optional[str] = os.getenv("SSL_KEY_PATH")
    host: str = os.getenv("WEBSOCKET_HOST", "0.0.0.0")
    port: int = int(os.getenv("WEBSOCKET_PORT", "8765"))
    max_connections: int = int(os.getenv("MAX_WEBSOCKET_CONNECTIONS", "1000"))
    ping_interval: int = int(os.getenv("WEBSOCKET_PING_INTERVAL", "20"))
    ping_timeout: int = int(os.getenv("WEBSOCKET_PING_TIMEOUT", "10"))
    compression_threshold: int = int(os.getenv("COMPRESSION_THRESHOLD", "1024"))

@dataclass
class AnalyticsConfig:
    """Analytics configuration settings"""
    cache_ttl: int = int(os.getenv("CACHE_TTL", "3600"))
    max_historical_days: int = int(os.getenv("MAX_HISTORICAL_DAYS", "365"))
    confidence_threshold: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
    min_data_points: int = int(os.getenv("MIN_DATA_POINTS", "100"))
    update_interval: int = int(os.getenv("UPDATE_INTERVAL", "60"))
    batch_size: int = int(os.getenv("BATCH_SIZE", "1000"))
    model_path: str = os.getenv("MODEL_PATH", "models/")
    feature_columns: List[str] = field(default_factory=lambda: os.getenv("FEATURE_COLUMNS", "").split(",") if os.getenv("FEATURE_COLUMNS") else [])
    target_column: str = os.getenv("TARGET_COLUMN", "target")
    symbols: List[str] = field(default_factory=lambda: os.getenv("SYMBOLS", "").split(",") if os.getenv("SYMBOLS") else [])

@dataclass
class VisualizationConfig:
    """Visualization configuration settings"""
    theme: str = os.getenv("VISUALIZATION_THEME", "dark")
    color_scheme: str = os.getenv("COLOR_SCHEME", "default")
    layout_template: str = os.getenv("LAYOUT_TEMPLATE", "default")
    animation_duration: int = int(os.getenv("ANIMATION_DURATION", "500"))
    update_interval: int = int(os.getenv("VIS_UPDATE_INTERVAL", "30"))
    max_data_points: int = int(os.getenv("MAX_DATA_POINTS", "1000"))
    chart_height: int = int(os.getenv("CHART_HEIGHT", "400"))
    chart_width: int = int(os.getenv("CHART_WIDTH", "800"))
    font_size: int = int(os.getenv("FONT_SIZE", "12"))
    font_family: str = os.getenv("FONT_FAMILY", "Arial")

@dataclass
class SystemConfig:
    """System configuration settings"""
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    debug_mode: bool = os.getenv("DEBUG_MODE", "false").lower() == "true"
    memory_limit: int = int(os.getenv("MEMORY_LIMIT", "8GB").replace("GB", "000"))  # Convert GB to MB
    cpu_limit: int = int(os.getenv("CPU_LIMIT", "80%").replace("%", ""))  # Store as percentage
    temp_dir: str = os.getenv("TEMP_DIR", "temp/")
    backup_dir: str = os.getenv("BACKUP_DIR", "backups/")
    max_log_size: int = int(os.getenv("MAX_LOG_SIZE", "100MB").replace("MB", "000000"))  # Convert MB to bytes
    max_log_files: int = int(os.getenv("MAX_LOG_FILES", "5"))

class Config:
    """Main configuration class"""
    
    def __init__(self):
        self.database = DatabaseConfig()
        self.api = APIConfig()
        self.websocket = WebSocketConfig()
        self.analytics = AnalyticsConfig()
        self.visualization = VisualizationConfig()
        self.system = SystemConfig()
        
    def validate(self):
        """Validate configuration settings"""
        required_api_keys = [
            self.api.odds_api_key,
            self.api.betfair_api_key,
            self.api.betfair_session_token,
            self.api.sports_db_api_key
        ]
        
        if not any(required_api_keys):
            raise ValueError("At least one API key is required")
            
        if not self.database.mongodb_url:
            raise ValueError("MongoDB URL is required")
            
        if not self.database.redis_url:
            raise ValueError("Redis URL is required")
            
    def get_api_headers(self) -> dict:
        """Get API headers for authentication"""
        headers = {}
        
        if self.api.odds_api_key:
            headers["X-RapidAPI-Key"] = self.api.odds_api_key
            headers["X-RapidAPI-Host"] = "odds.p.rapidapi.com"
            
        if self.api.betfair_api_key:
            headers["X-Authentication"] = self.api.betfair_api_key
            
        if self.api.betfair_session_token:
            headers["X-Session-Token"] = self.api.betfair_session_token
            
        if self.api.sports_db_api_key:
            headers["Authorization"] = f"Bearer {self.api.sports_db_api_key}"
            
        return headers
        
    def get_database_url(self) -> str:
        """Get database URL with authentication"""
        return self.database.mongodb_url
        
    def get_collection_name(self, name: str) -> str:
        """Get collection name with prefix"""
        return f"{self.database.collection_prefix}{name}"

# Create global configuration instance
config = Config() 