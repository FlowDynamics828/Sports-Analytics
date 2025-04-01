"""
Advanced Visualization Module for Sports Analytics Pro
Version 1.1.0
Enterprise-Grade Real-Time Analytics Dashboard
"""

import dash
from dash import html, dcc, Input, Output, State, callback
import plotly.graph_objects as go
import plotly.express as px
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging
from typing import Dict, List, Optional
import json
import asyncio
from dataclasses import dataclass
import os
from dotenv import load_dotenv
from .predictive_analytics import AdvancedPredictiveAnalytics
from .websocket_client import WebSocketClient
from .config import config

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class VisualizationData:
    """Data structure for visualization state"""
    market_data: Dict = None
    predictions: Dict = None
    risk_metrics: Dict = None
    feature_importance: Dict = None
    performance_metrics: Dict = None
    system_status: Dict = None
    last_update: datetime = None

class AdvancedVisualizer:
    """Enterprise-grade visualization dashboard"""
    
    def __init__(self):
        self.app = dash.Dash(
            __name__,
            title="Sports Analytics Pro Dashboard",
            update_title=None,
            suppress_callback_exceptions=True
        )
        
        # Initialize components
        self.analytics_engine = AdvancedPredictiveAnalytics()
        self.websocket_client = WebSocketClient()
        self.data = VisualizationData()
        
        # Setup layout and callbacks
        self.setup_layout()
        self.setup_callbacks()
        
        # Start WebSocket connection
        asyncio.create_task(self.websocket_client.connect())
        
    def setup_layout(self):
        """Setup dashboard layout"""
        self.app.layout = html.Div([
            # Header
            html.Div([
                html.H1("Sports Analytics Pro Dashboard", className="header-title"),
                html.Div(id="system-status", className="system-status")
            ], className="header"),
            
            # Main content
            html.Div([
                # Market Data Section
                html.Div([
                    html.H2("Market Data"),
                    html.Div([
                        dcc.Graph(id="market-chart", className="chart-container"),
                        dcc.Graph(id="volume-chart", className="chart-container"),
                        dcc.Graph(id="technical-indicators", className="chart-container")
                    ], className="charts-grid")
                ], className="section"),
                
                # Predictions Section
                html.Div([
                    html.H2("Predictions"),
                    html.Div([
                        dcc.Graph(id="ensemble-predictions", className="chart-container"),
                        dcc.Graph(id="model-predictions", className="chart-container"),
                        dcc.Graph(id="confidence-intervals", className="chart-container")
                    ], className="charts-grid")
                ], className="section"),
                
                # Risk Analysis Section
                html.Div([
                    html.H2("Risk Analysis"),
                    html.Div([
                        dcc.Graph(id="risk-radar", className="chart-container"),
                        dcc.Graph(id="portfolio-risk", className="chart-container"),
                        dcc.Graph(id="scenario-analysis", className="chart-container")
                    ], className="charts-grid")
                ], className="section"),
                
                # Feature Importance Section
                html.Div([
                    html.H2("Feature Importance"),
                    html.Div([
                        dcc.Graph(id="shap-values", className="chart-container"),
                        dcc.Graph(id="lime-values", className="chart-container"),
                        dcc.Graph(id="hierarchical-importance", className="chart-container")
                    ], className="charts-grid")
                ], className="section"),
                
                # Performance Metrics Section
                html.Div([
                    html.H2("Performance Metrics"),
                    html.Div([
                        dcc.Graph(id="accuracy-gauge", className="gauge-container"),
                        dcc.Graph(id="risk-gauge", className="gauge-container"),
                        dcc.Graph(id="profit-gauge", className="gauge-container")
                    ], className="gauges-grid")
                ], className="section"),
                
                # System Health Section
                html.Div([
                    html.H2("System Health"),
                    html.Div([
                        dcc.Graph(id="cpu-gauge", className="gauge-container"),
                        dcc.Graph(id="memory-gauge", className="gauge-container"),
                        dcc.Graph(id="latency-gauge", className="gauge-container")
                    ], className="gauges-grid")
                ], className="section")
            ], className="content"),
            
            # Update interval
            dcc.Interval(
                id='interval-component',
                interval=1*1000,  # 1 second
                n_intervals=0
            )
        ], className="dashboard")
        
    def setup_callbacks(self):
        """Setup dashboard callbacks"""
        
        @self.app.callback(
            [Output("market-chart", "figure"),
             Output("volume-chart", "figure"),
             Output("technical-indicators", "figure")],
            [Input("interval-component", "n_intervals")]
        )
        def update_market_charts(n):
            """Update market data charts"""
            try:
                if not self.data.market_data:
                    return {}, {}, {}
                    
                # Market price chart
                market_fig = go.Figure()
                market_fig.add_trace(go.Candlestick(
                    x=self.data.market_data.get('timestamps', []),
                    open=self.data.market_data.get('open_prices', []),
                    high=self.data.market_data.get('high_prices', []),
                    low=self.data.market_data.get('low_prices', []),
                    close=self.data.market_data.get('close_prices', []),
                    name="Price"
                ))
                market_fig.update_layout(
                    title="Market Price",
                    yaxis_title="Price",
                    template="plotly_dark",
                    height=400
                )
                
                # Volume chart
                volume_fig = go.Figure()
                volume_fig.add_trace(go.Bar(
                    x=self.data.market_data.get('timestamps', []),
                    y=self.data.market_data.get('volumes', []),
                    name="Volume"
                ))
                volume_fig.update_layout(
                    title="Trading Volume",
                    yaxis_title="Volume",
                    template="plotly_dark",
                    height=400
                )
                
                # Technical indicators
                tech_fig = go.Figure()
                tech_fig.add_trace(go.Scatter(
                    x=self.data.market_data.get('timestamps', []),
                    y=self.data.market_data.get('rsi', []),
                    name="RSI"
                ))
                tech_fig.add_trace(go.Scatter(
                    x=self.data.market_data.get('timestamps', []),
                    y=self.data.market_data.get('macd', []),
                    name="MACD"
                ))
                tech_fig.update_layout(
                    title="Technical Indicators",
                    yaxis_title="Value",
                    template="plotly_dark",
                    height=400
                )
                
                return market_fig, volume_fig, tech_fig
                
            except Exception as e:
                logger.error(f"Error updating market charts: {str(e)}")
                return {}, {}, {}
                
        @self.app.callback(
            [Output("ensemble-predictions", "figure"),
             Output("model-predictions", "figure"),
             Output("confidence-intervals", "figure")],
            [Input("interval-component", "n_intervals")]
        )
        def update_prediction_charts(n):
            """Update prediction charts"""
            try:
                if not self.data.predictions:
                    return {}, {}, {}
                    
                # Ensemble predictions
                ensemble_fig = go.Figure()
                ensemble_fig.add_trace(go.Scatter(
                    x=self.data.predictions.get('timestamps', []),
                    y=self.data.predictions.get('ensemble', []),
                    name="Ensemble"
                ))
                ensemble_fig.update_layout(
                    title="Ensemble Predictions",
                    yaxis_title="Probability",
                    template="plotly_dark",
                    height=400
                )
                
                # Individual model predictions
                model_fig = go.Figure()
                for model_name, predictions in self.data.predictions.get('models', {}).items():
                    model_fig.add_trace(go.Scatter(
                        x=self.data.predictions.get('timestamps', []),
                        y=predictions,
                        name=model_name
                    ))
                model_fig.update_layout(
                    title="Model Predictions",
                    yaxis_title="Probability",
                    template="plotly_dark",
                    height=400
                )
                
                # Confidence intervals
                conf_fig = go.Figure()
                conf_fig.add_trace(go.Scatter(
                    x=self.data.predictions.get('timestamps', []),
                    y=self.data.predictions.get('upper_bound', []),
                    fill=None,
                    mode='lines',
                    line_color='rgba(0,100,80,0.2)',
                    name="Upper Bound"
                ))
                conf_fig.add_trace(go.Scatter(
                    x=self.data.predictions.get('timestamps', []),
                    y=self.data.predictions.get('lower_bound', []),
                    fill='tonexty',
                    mode='lines',
                    line_color='rgba(0,100,80,0.2)',
                    name="Lower Bound"
                ))
                conf_fig.update_layout(
                    title="Confidence Intervals",
                    yaxis_title="Probability",
                    template="plotly_dark",
                    height=400
                )
                
                return ensemble_fig, model_fig, conf_fig
                
            except Exception as e:
                logger.error(f"Error updating prediction charts: {str(e)}")
                return {}, {}, {}
                
        @self.app.callback(
            [Output("risk-radar", "figure"),
             Output("portfolio-risk", "figure"),
             Output("scenario-analysis", "figure")],
            [Input("interval-component", "n_intervals")]
        )
        def update_risk_charts(n):
            """Update risk analysis charts"""
            try:
                if not self.data.risk_metrics:
                    return {}, {}, {}
                    
                # Risk radar chart
                risk_fig = go.Figure()
                risk_fig.add_trace(go.Scatterpolar(
                    r=[
                        self.data.risk_metrics.get('prediction_risk', 0),
                        self.data.risk_metrics.get('volatility_risk', 0),
                        self.data.risk_metrics.get('volume_risk', 0),
                        self.data.risk_metrics.get('sentiment_risk', 0),
                        self.data.risk_metrics.get('tail_risk', 0),
                        self.data.risk_metrics.get('portfolio_risk', 0)
                    ],
                    theta=[
                        'Prediction Risk',
                        'Volatility Risk',
                        'Volume Risk',
                        'Sentiment Risk',
                        'Tail Risk',
                        'Portfolio Risk'
                    ],
                    fill='toself',
                    name='Risk Profile'
                ))
                risk_fig.update_layout(
                    polar=dict(radialaxis=dict(visible=True, range=[0, 1])),
                    showlegend=False,
                    title="Risk Analysis",
                    template="plotly_dark",
                    height=400
                )
                
                # Portfolio risk
                port_fig = go.Figure()
                port_fig.add_trace(go.Heatmap(
                    z=self.data.risk_metrics.get('correlation_matrix', []),
                    x=self.data.risk_metrics.get('asset_names', []),
                    y=self.data.risk_metrics.get('asset_names', []),
                    colorscale='RdBu'
                ))
                port_fig.update_layout(
                    title="Portfolio Correlation",
                    template="plotly_dark",
                    height=400
                )
                
                # Scenario analysis
                scenario_fig = go.Figure()
                scenarios = self.data.risk_metrics.get('scenario_risks', {})
                scenario_fig.add_trace(go.Bar(
                    x=list(scenarios.keys()),
                    y=list(scenarios.values()),
                    name="Scenario Probabilities"
                ))
                scenario_fig.update_layout(
                    title="Scenario Analysis",
                    yaxis_title="Probability",
                    template="plotly_dark",
                    height=400
                )
                
                return risk_fig, port_fig, scenario_fig
                
            except Exception as e:
                logger.error(f"Error updating risk charts: {str(e)}")
                return {}, {}, {}
                
        @self.app.callback(
            [Output("shap-values", "figure"),
             Output("lime-values", "figure"),
             Output("hierarchical-importance", "figure")],
            [Input("interval-component", "n_intervals")]
        )
        def update_feature_charts(n):
            """Update feature importance charts"""
            try:
                if not self.data.feature_importance:
                    return {}, {}, {}
                    
                # SHAP values
                shap_fig = go.Figure()
                shap_fig.add_trace(go.Bar(
                    x=list(self.data.feature_importance.get('shap_values', {}).keys()),
                    y=list(self.data.feature_importance.get('shap_values', {}).values()),
                    name="SHAP Values"
                ))
                shap_fig.update_layout(
                    title="SHAP Feature Importance",
                    yaxis_title="Importance",
                    template="plotly_dark",
                    height=400
                )
                
                # LIME values
                lime_fig = go.Figure()
                lime_fig.add_trace(go.Bar(
                    x=list(self.data.feature_importance.get('lime_values', {}).keys()),
                    y=list(self.data.feature_importance.get('lime_values', {}).values()),
                    name="LIME Values"
                ))
                lime_fig.update_layout(
                    title="LIME Feature Importance",
                    yaxis_title="Importance",
                    template="plotly_dark",
                    height=400
                )
                
                # Hierarchical importance
                hier_fig = go.Figure()
                hier_fig.add_trace(go.Sunburst(
                    ids=list(self.data.feature_importance.get('hierarchical_importance', {}).keys()),
                    labels=list(self.data.feature_importance.get('hierarchical_importance', {}).keys()),
                    parents=[''] * len(self.data.feature_importance.get('hierarchical_importance', {})),
                    values=list(self.data.feature_importance.get('hierarchical_importance', {}).values()),
                    name="Hierarchical Importance"
                ))
                hier_fig.update_layout(
                    title="Hierarchical Feature Importance",
                    template="plotly_dark",
                    height=400
                )
                
                return shap_fig, lime_fig, hier_fig
                
            except Exception as e:
                logger.error(f"Error updating feature charts: {str(e)}")
                return {}, {}, {}
                
        @self.app.callback(
            [Output("accuracy-gauge", "figure"),
             Output("risk-gauge", "figure"),
             Output("profit-gauge", "figure")],
            [Input("interval-component", "n_intervals")]
        )
        def update_performance_gauges(n):
            """Update performance metric gauges"""
            try:
                if not self.data.performance_metrics:
                    return {}, {}, {}
                    
                # Accuracy gauge
                acc_fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=self.data.performance_metrics.get('accuracy', 0),
                    title={'text': "Accuracy"},
                    gauge={'axis': {'range': [0, 1]},
                          'bar': {'color': "darkblue"},
                          'steps': [
                              {'range': [0, 0.3], 'color': "lightgray"},
                              {'range': [0.3, 0.7], 'color': "gray"},
                              {'range': [0.7, 1], 'color': "darkgray"}
                          ],
                          'threshold': {'line': {'color': "red", 'width': 4},
                                      'thickness': 0.75,
                                      'value': 0.7}}
                ))
                acc_fig.update_layout(template="plotly_dark", height=300)
                
                # Risk gauge
                risk_fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=self.data.performance_metrics.get('risk_score', 0),
                    title={'text': "Risk Score"},
                    gauge={'axis': {'range': [0, 1]},
                          'bar': {'color': "darkred"},
                          'steps': [
                              {'range': [0, 0.3], 'color': "lightgray"},
                              {'range': [0.3, 0.7], 'color': "gray"},
                              {'range': [0.7, 1], 'color': "darkgray"}
                          ],
                          'threshold': {'line': {'color': "red", 'width': 4},
                                      'thickness': 0.75,
                                      'value': 0.7}}
                ))
                risk_fig.update_layout(template="plotly_dark", height=300)
                
                # Profit gauge
                profit_fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=self.data.performance_metrics.get('profit_factor', 0),
                    title={'text': "Profit Factor"},
                    gauge={'axis': {'range': [0, 2]},
                          'bar': {'color': "darkgreen"},
                          'steps': [
                              {'range': [0, 0.7], 'color': "lightgray"},
                              {'range': [0.7, 1.3], 'color': "gray"},
                              {'range': [1.3, 2], 'color': "darkgray"}
                          ],
                          'threshold': {'line': {'color': "red", 'width': 4},
                                      'thickness': 0.75,
                                      'value': 1.5}}
                ))
                profit_fig.update_layout(template="plotly_dark", height=300)
                
                return acc_fig, risk_fig, profit_fig
                
            except Exception as e:
                logger.error(f"Error updating performance gauges: {str(e)}")
                return {}, {}, {}
                
        @self.app.callback(
            [Output("cpu-gauge", "figure"),
             Output("memory-gauge", "figure"),
             Output("latency-gauge", "figure")],
            [Input("interval-component", "n_intervals")]
        )
        def update_system_gauges(n):
            """Update system health gauges"""
            try:
                if not self.data.system_status:
                    return {}, {}, {}
                    
                # CPU gauge
                cpu_fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=self.data.system_status.get('cpu_usage', 0),
                    title={'text': "CPU Usage"},
                    gauge={'axis': {'range': [0, 100]},
                          'bar': {'color': "darkblue"},
                          'steps': [
                              {'range': [0, 30], 'color': "lightgray"},
                              {'range': [30, 70], 'color': "gray"},
                              {'range': [70, 100], 'color': "darkgray"}
                          ],
                          'threshold': {'line': {'color': "red", 'width': 4},
                                      'thickness': 0.75,
                                      'value': 80}}
                ))
                cpu_fig.update_layout(template="plotly_dark", height=300)
                
                # Memory gauge
                mem_fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=self.data.system_status.get('memory_usage', 0),
                    title={'text': "Memory Usage"},
                    gauge={'axis': {'range': [0, 100]},
                          'bar': {'color': "darkred"},
                          'steps': [
                              {'range': [0, 30], 'color': "lightgray"},
                              {'range': [30, 70], 'color': "gray"},
                              {'range': [70, 100], 'color': "darkgray"}
                          ],
                          'threshold': {'line': {'color': "red", 'width': 4},
                                      'thickness': 0.75,
                                      'value': 80}}
                ))
                mem_fig.update_layout(template="plotly_dark", height=300)
                
                # Latency gauge
                lat_fig = go.Figure(go.Indicator(
                    mode="gauge+number",
                    value=self.data.system_status.get('latency', 0),
                    title={'text': "Latency (ms)"},
                    gauge={'axis': {'range': [0, 1000]},
                          'bar': {'color': "darkgreen"},
                          'steps': [
                              {'range': [0, 300], 'color': "lightgray"},
                              {'range': [300, 700], 'color': "gray"},
                              {'range': [700, 1000], 'color': "darkgray"}
                          ],
                          'threshold': {'line': {'color': "red", 'width': 4},
                                      'thickness': 0.75,
                                      'value': 800}}
                ))
                lat_fig.update_layout(template="plotly_dark", height=300)
                
                return cpu_fig, mem_fig, lat_fig
                
            except Exception as e:
                logger.error(f"Error updating system gauges: {str(e)}")
                return {}, {}, {}
                
    async def process_websocket_message(self, message: Dict):
        """Process incoming WebSocket messages"""
        try:
            message_type = message.get('type')
            
            if message_type == 'market_data':
                self.data.market_data = message.get('data')
                self.data.last_update = datetime.now()
                
            elif message_type == 'predictions':
                self.data.predictions = message.get('data')
                self.data.last_update = datetime.now()
                
            elif message_type == 'risk_metrics':
                self.data.risk_metrics = message.get('data')
                self.data.last_update = datetime.now()
                
            elif message_type == 'feature_importance':
                self.data.feature_importance = message.get('data')
                self.data.last_update = datetime.now()
                
            elif message_type == 'performance_metrics':
                self.data.performance_metrics = message.get('data')
                self.data.last_update = datetime.now()
                
            elif message_type == 'system_status':
                self.data.system_status = message.get('data')
                self.data.last_update = datetime.now()
                
        except Exception as e:
            logger.error(f"Error processing WebSocket message: {str(e)}")
            
    def run(self, host: str = '0.0.0.0', port: int = 8050, debug: bool = False):
        """Run the dashboard server"""
        try:
            self.app.run_server(host=host, port=port, debug=debug)
        except Exception as e:
            logger.error(f"Error running dashboard server: {str(e)}")
            raise

if __name__ == "__main__":
    # Create and run visualization dashboard
    dashboard = AdvancedVisualizer()
    dashboard.run() 