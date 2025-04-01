const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware for parsing JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static('public'));

// Handle API requests with mock responses
app.get('/api/narratives/highlights', (req, res) => {
  // Return mock narratives data
  res.json({
    narratives: [
      {
        title: "Lakers vs. Warriors",
        storylines: {
          main: "A clash of basketball dynasties as LeBron James faces Stephen Curry in what could be a preview of the Western Conference Finals."
        },
        metrics: {
          upsetPotential: 0.32
        }
      },
      {
        title: "Chiefs vs. Bills",
        storylines: {
          main: "Patrick Mahomes and Josh Allen continue their rivalry in a game with major playoff implications for both teams."
        },
        metrics: {
          upsetPotential: 0.41
        }
      },
      {
        title: "Yankees vs. Red Sox",
        storylines: {
          main: "Baseball's greatest rivalry heats up as both teams fight for division supremacy in a critical late-season matchup."
        },
        metrics: {
          upsetPotential: 0.28
        }
      }
    ]
  });
});

app.post('/api/predictions/generate', (req, res) => {
  // Get request data
  const { homeTeam, awayTeam, tier, predictionMode } = req.body;
  
  // Get user-defined weights for factors (if available)
  const playerPerformance = parseFloat(req.body.playerPerformance || 80) / 100;
  const homeCourtAdvantage = parseFloat(req.body.homeCourtAdvantage || 65) / 100;
  const recentForm = parseFloat(req.body.recentForm || 75) / 100;
  const h2hHistory = parseFloat(req.body.h2hHistory || 60) / 100;
  const injuryImpact = parseFloat(req.body.injuryImpact || 85) / 100;
  
  // Calculate base win probability
  const baseHomeWinProb = 0.35 + (Math.random() * 0.3);
  
  // Apply modifiers based on tier and factors
  let homeWinProb = baseHomeWinProb;
  
  if (tier === 'ultra') {
    // Apply weighted modifiers (simulating the effect of each factor)
    const perfModifier = (Math.random() * 0.2 - 0.1) * playerPerformance;
    const homeModifier = 0.07 * homeCourtAdvantage;
    const formModifier = (Math.random() * 0.15) * recentForm;
    const h2hModifier = (Math.random() * 0.1 - 0.05) * h2hHistory;
    const injuryModifier = (Math.random() * -0.2) * injuryImpact;
    
    homeWinProb = Math.min(0.95, Math.max(0.05, baseHomeWinProb + 
                                        perfModifier + 
                                        homeModifier + 
                                        formModifier + 
                                        h2hModifier + 
                                        injuryModifier));
  }
  
  // Create base prediction response
  const predictionResponse = {
    homeTeam: homeTeam || 'Lakers',
    awayTeam: awayTeam || 'Warriors',
    homeWinProbability: homeWinProb,
    awayWinProbability: 1 - homeWinProb,
    confidence: 0.7 + (Math.random() * 0.25), // Higher confidence for premium tiers
    tier: tier || 'standard',
    factors: [
      "Recent team performance (last 10 games)",
      "Head-to-head historical matchups",
      "Home court advantage factor",
      "Key player availability",
      "Rest days advantage"
    ]
  };
  
  // Add premium features for premium and ultra tiers
  if (tier === 'premium' || tier === 'ultra') {
    predictionResponse.keyMatchups = [
      {
        players: [`${homeTeam || 'Lakers'} Star Player`, `${awayTeam || 'Warriors'} Star Player`],
        impact: Math.random() * 0.2 + 0.1,
        advantage: Math.random() > 0.5 ? 'home' : 'away'
      },
      {
        players: [`${homeTeam || 'Lakers'} Point Guard`, `${awayTeam || 'Warriors'} Point Guard`],
        impact: Math.random() * 0.15 + 0.05,
        advantage: Math.random() > 0.6 ? 'home' : 'away'
      }
    ];
    
    predictionResponse.momentumFactors = [
      `${homeTeam || 'Lakers'} on ${Math.floor(Math.random() * 5 + 2)}-game winning streak`,
      `${awayTeam || 'Warriors'} scoring efficiency down 8% in last 3 games`
    ];
    
    predictionResponse.gameScenarios = [
      {
        type: 'baseCase',
        homeWin: homeWinProb,
        description: 'Expected game flow with normal performance'
      },
      {
        type: 'upset',
        homeWin: homeWinProb - 0.25,
        description: `${awayTeam || 'Warriors'} shoots above season average from 3PT`
      }
    ];
  }
  
  // Add ultra premium features
  if (tier === 'ultra') {
    // Factor weights (from user input)
    predictionResponse.factorWeights = {
      playerPerformance: playerPerformance,
      homeCourtAdvantage: homeCourtAdvantage,
      recentForm: recentForm,
      h2hHistory: h2hHistory,
      injuryImpact: injuryImpact
    };
    
    // Add any custom factors from the request
    Object.keys(req.body).forEach(key => {
      if (key.startsWith('custom-factor-') && !key.endsWith('_weight')) {
        const weightKey = `${key}_weight`;
        const factorName = req.body[key];
        const factorWeight = parseFloat(req.body[weightKey] || 50) / 100;
        
        if (factorName && factorName.trim() !== '') {
          predictionResponse.factorWeights[factorName] = factorWeight;
        }
      }
    });
    
    // Additional advanced scenario
    predictionResponse.gameScenarios.push({
      type: 'wildcard',
      homeWin: Math.min(0.9, homeWinProb + 0.15),
      description: `${homeTeam || 'Lakers'} successful adjustments after first quarter`
    });
    
    // Monte Carlo simulation results
    predictionResponse.simulationResults = {
      iterations: 10000,
      homeWinPercentage: Math.round(homeWinProb * 100),
      pointsSpread: Math.floor((homeWinProb - 0.5) * 20),
      averageScore: {
        home: Math.floor(Math.random() * 15 + 105),
        away: Math.floor(Math.random() * 15 + 100)
      }
    };
    
    // Add player-specific predictions for ultra premium
    predictionResponse.playerPredictions = [
      {
        player: `${homeTeam || 'Lakers'} Star Player`,
        prediction: {
          points: Math.floor(Math.random() * 10 + 20),
          rebounds: Math.floor(Math.random() * 5 + 5),
          assists: Math.floor(Math.random() * 5 + 3),
          efficiency: Math.random() * 0.2 + 0.4
        }
      },
      {
        player: `${awayTeam || 'Warriors'} Star Player`,
        prediction: {
          points: Math.floor(Math.random() * 10 + 20),
          rebounds: Math.floor(Math.random() * 5 + 5),
          assists: Math.floor(Math.random() * 5 + 3),
          efficiency: Math.random() * 0.2 + 0.4
        }
      }
    ];
    
    // Add quarter-by-quarter prediction
    predictionResponse.quarterPredictions = [
      { quarter: 1, homeScore: Math.floor(Math.random() * 8 + 23), awayScore: Math.floor(Math.random() * 8 + 23) },
      { quarter: 2, homeScore: Math.floor(Math.random() * 8 + 23), awayScore: Math.floor(Math.random() * 8 + 23) },
      { quarter: 3, homeScore: Math.floor(Math.random() * 8 + 23), awayScore: Math.floor(Math.random() * 8 + 23) },
      { quarter: 4, homeScore: Math.floor(Math.random() * 8 + 23), awayScore: Math.floor(Math.random() * 8 + 23) }
    ];
  }
  
  // If single factor mode, only include the main factor
  if (predictionMode === 'single') {
    predictionResponse.factors = ["Player Performance"];
    if (predictionResponse.factorWeights) {
      predictionResponse.factorWeights = {
        playerPerformance: 1.0
      };
    }
  }
  
  // Return the prediction response
  res.json(predictionResponse);
});

// Always return index.html for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`View the landing page at http://localhost:${PORT}/`);
}); 