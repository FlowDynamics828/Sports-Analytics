/**
 * MongoDB Initialization Script for Sports Analytics Platform
 * 
 * This script creates required collections and indexes in MongoDB
 * for the sports analytics platform.
 */

const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// Required collections with their schema and indexes
const collections = [
  {
    name: 'users',
    indexes: [
      { fields: { email: 1 }, options: { unique: true } },
      { fields: { username: 1 }, options: { unique: true } }
    ],
    sampleDocuments: [
      {
        username: 'admin',
        email: 'admin@sportsanalytics.com',
        password: '$2b$10$XdUf3q0sCD5jjJJpbchlteuxUcQjx/h5j9eKqJeP/zsa1d2Oy4VjC', // hashed 'admin123'
        role: 'admin',
        subscription: 'enterprise',
        created_at: new Date(),
        last_login: new Date()
      }
    ]
  },
  {
    name: 'players',
    indexes: [
      { fields: { player_id: 1 }, options: { unique: true } },
      { fields: { name: 1 }, options: { background: true } },
      { fields: { team: 1 }, options: { background: true } },
      { fields: { league: 1 }, options: { background: true } },
      { fields: { position: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        player_id: 'lbj23',
        name: 'LeBron James',
        team: 'Lakers',
        league: 'NBA',
        position: 'SF',
        jersey_number: 23,
        height: '6\'9"',
        weight: 250,
        age: 39,
        country: 'USA',
        is_active: true,
        career_start: 2003,
        stats: {
          points_per_game: 27.2,
          rebounds_per_game: 7.5,
          assists_per_game: 8.3,
          steals_per_game: 1.5,
          blocks_per_game: 0.8,
          field_goal_percentage: 0.504,
          three_point_percentage: 0.345,
          free_throw_percentage: 0.734
        },
        recent_games: [
          {
            date: '2023-12-15',
            opponent: 'Warriors',
            points: 32,
            rebounds: 8,
            assists: 10,
            minutes: 36,
            result: 'W'
          },
          {
            date: '2023-12-13',
            opponent: 'Suns',
            points: 28,
            rebounds: 6,
            assists: 12,
            minutes: 38,
            result: 'L'
          }
        ],
        trends: {
          points: 'increasing',
          assists: 'stable',
          minutes: 'decreasing'
        },
        rating: 97,
        tags: ['All-Star', 'MVP', 'Champion']
      },
      {
        player_id: 'sc30',
        name: 'Stephen Curry',
        team: 'Warriors',
        league: 'NBA',
        position: 'PG',
        jersey_number: 30,
        height: '6\'2"',
        weight: 185,
        age: 35,
        country: 'USA',
        is_active: true,
        career_start: 2009,
        stats: {
          points_per_game: 24.8,
          rebounds_per_game: 4.7,
          assists_per_game: 6.5,
          steals_per_game: 1.6,
          blocks_per_game: 0.2,
          field_goal_percentage: 0.473,
          three_point_percentage: 0.428,
          free_throw_percentage: 0.908
        },
        recent_games: [
          {
            date: '2023-12-15',
            opponent: 'Lakers',
            points: 27,
            rebounds: 5,
            assists: 8,
            minutes: 34,
            result: 'L'
          },
          {
            date: '2023-12-13',
            opponent: 'Clippers',
            points: 33,
            rebounds: 4,
            assists: 7,
            minutes: 36,
            result: 'W'
          }
        ],
        trends: {
          points: 'stable',
          three_pointers: 'increasing',
          minutes: 'stable'
        },
        rating: 96,
        tags: ['All-Star', 'MVP', 'Champion', '3-Point Specialist']
      },
      {
        player_id: 'pm15',
        name: 'Patrick Mahomes',
        team: 'Chiefs',
        league: 'NFL',
        position: 'QB',
        jersey_number: 15,
        height: '6\'3"',
        weight: 230,
        age: 28,
        country: 'USA',
        is_active: true,
        career_start: 2017,
        stats: {
          pass_yards_per_game: 294.5,
          pass_touchdowns: 37,
          interceptions: 14,
          completion_percentage: 67.2,
          passer_rating: 105.8,
          rush_yards_per_game: 21.3,
          rush_touchdowns: 4
        },
        recent_games: [
          {
            date: '2023-12-17',
            opponent: 'Raiders',
            pass_yards: 328,
            pass_touchdowns: 3,
            interceptions: 1,
            rush_yards: 45,
            result: 'W'
          },
          {
            date: '2023-12-10',
            opponent: 'Bills',
            pass_yards: 287,
            pass_touchdowns: 2,
            interceptions: 0,
            rush_yards: 28,
            result: 'W'
          }
        ],
        trends: {
          pass_yards: 'increasing',
          touchdowns: 'stable',
          interceptions: 'decreasing'
        },
        rating: 99,
        tags: ['All-Pro', 'MVP', 'Super Bowl Champion']
      }
    ]
  },
  {
    name: 'player_stats',
    indexes: [
      { fields: { player_id: 1, date: 1 }, options: { unique: true } },
      { fields: { team: 1 }, options: { background: true } },
      { fields: { league: 1 }, options: { background: true } },
      { fields: { opponent: 1 }, options: { background: true } },
      { fields: { date: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        player_id: 'lbj23',
        name: 'LeBron James',
        team: 'Lakers',
        league: 'NBA',
        date: '2023-12-18',
        opponent: 'Knicks',
        home_game: true,
        minutes_played: 38,
        points: 30,
        rebounds: 9,
        assists: 12,
        steals: 2,
        blocks: 1,
        turnovers: 3,
        field_goals_made: 11,
        field_goals_attempted: 20,
        three_pointers_made: 3,
        three_pointers_attempted: 8,
        free_throws_made: 5,
        free_throws_attempted: 7,
        plus_minus: 15,
        fantasy_points: 62.5,
        result: 'W'
      },
      {
        player_id: 'sc30',
        name: 'Stephen Curry',
        team: 'Warriors',
        league: 'NBA',
        date: '2023-12-18',
        opponent: 'Clippers',
        home_game: true,
        minutes_played: 35,
        points: 32,
        rebounds: 5,
        assists: 7,
        steals: 3,
        blocks: 0,
        turnovers: 2,
        field_goals_made: 10,
        field_goals_attempted: 19,
        three_pointers_made: 8,
        three_pointers_attempted: 14,
        free_throws_made: 4,
        free_throws_attempted: 4,
        plus_minus: 22,
        fantasy_points: 58.5,
        result: 'W'
      },
      {
        player_id: 'pm15',
        name: 'Patrick Mahomes',
        team: 'Chiefs',
        league: 'NFL',
        date: '2023-12-17',
        opponent: 'Raiders',
        home_game: false,
        stats_category: 'passing',
        completions: 29,
        attempts: 42,
        passing_yards: 328,
        passing_touchdowns: 3,
        interceptions: 1,
        sacks: 2,
        rushing_attempts: 5,
        rushing_yards: 45,
        rushing_touchdowns: 0,
        fumbles: 0,
        passer_rating: 112.3,
        qbr: 83.5,
        fantasy_points: 31.6,
        result: 'W'
      }
    ]
  },
  {
    name: 'teams',
    indexes: [
      { fields: { name: 1, league: 1 }, options: { unique: true } }
    ],
    sampleDocuments: [
      { 
        name: 'Lakers', 
        league: 'NBA', 
        location: 'Los Angeles',
        win_rate: 0.65,
        logo_url: 'https://example.com/lakers.png'
      },
      { 
        name: 'Warriors', 
        league: 'NBA', 
        location: 'Golden State',
        win_rate: 0.70,
        logo_url: 'https://example.com/warriors.png'
      },
      { 
        name: 'Chiefs', 
        league: 'NFL', 
        location: 'Kansas City',
        win_rate: 0.75,
        logo_url: 'https://example.com/chiefs.png'
      }
    ]
  },
  {
    name: 'leagues',
    indexes: [
      { fields: { name: 1 }, options: { unique: true } }
    ],
    sampleDocuments: [
      { 
        name: 'NBA', 
        sport: 'Basketball',
        teams_count: 30,
        season_start: '2023-10-24',
        season_end: '2024-04-14'
      },
      { 
        name: 'NFL', 
        sport: 'American Football',
        teams_count: 32,
        season_start: '2023-09-07',
        season_end: '2024-01-07'
      },
      { 
        name: 'PREMIER_LEAGUE', 
        sport: 'Soccer',
        teams_count: 20,
        season_start: '2023-08-11',
        season_end: '2024-05-19'
      }
    ]
  },
  {
    name: 'matches',
    indexes: [
      { fields: { match_date: 1 } },
      { fields: { home_team: 1, away_team: 1, match_date: 1 }, options: { unique: true } }
    ],
    sampleDocuments: [
      {
        home_team: 'Lakers',
        away_team: 'Warriors',
        league: 'NBA',
        match_date: new Date('2023-12-12'),
        home_score: 112,
        away_score: 106,
        status: 'completed'
      }
    ]
  },
  {
    name: 'predictions',
    indexes: [
      { fields: { user_id: 1 } },
      { fields: { created_at: 1 } }
    ],
    sampleDocuments: [
      {
        user_id: 'admin',
        factor: 'LeBron James scores more than 25 points',
        league: 'NBA',
        probability: 0.78,
        confidence: 0.85,
        created_at: new Date(),
        actual_outcome: true,
        model_used: 'xgboost_player_points'
      }
    ]
  },
  {
    name: 'odds',
    indexes: [
      { fields: { match_id: 1 }, options: { background: true } },
      { fields: { event_date: 1 }, options: { background: true } },
      { fields: { provider: 1 }, options: { background: true } },
      { fields: { league: 1 }, options: { background: true } },
      { fields: { updated_at: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        match_id: 'lal_vs_gsw_20231215',
        home_team: 'Lakers',
        away_team: 'Warriors',
        league: 'NBA',
        event_date: new Date('2023-12-15'),
        provider: 'DraftKings',
        market_type: 'spread',
        home_line: -3.5,
        away_line: 3.5,
        home_odds: -110,
        away_odds: -110,
        vig: 4.55,
        implied_probability_home: 0.5238,
        implied_probability_away: 0.5238,
        consensus_probability_home: 0.58,
        line_movement: [
          {
            timestamp: new Date('2023-12-14T12:00:00Z'),
            home_line: -4.0,
            away_line: 4.0,
            home_odds: -110,
            away_odds: -110
          },
          {
            timestamp: new Date('2023-12-15T01:00:00Z'),
            home_line: -3.5,
            away_line: 3.5,
            home_odds: -110,
            away_odds: -110
          }
        ],
        updated_at: new Date(),
        sharp_money_indicator: 'home',
        public_betting_percentage: {
          home: 45,
          away: 55
        }
      },
      {
        match_id: 'lal_vs_gsw_20231215',
        home_team: 'Lakers',
        away_team: 'Warriors',
        league: 'NBA',
        event_date: new Date('2023-12-15'),
        provider: 'DraftKings',
        market_type: 'moneyline',
        home_odds: -160,
        away_odds: +140,
        implied_probability_home: 0.6154,
        implied_probability_away: 0.4167,
        consensus_probability_home: 0.62,
        line_movement: [
          {
            timestamp: new Date('2023-12-14T12:00:00Z'),
            home_odds: -155,
            away_odds: +135
          },
          {
            timestamp: new Date('2023-12-15T01:00:00Z'),
            home_odds: -160,
            away_odds: +140
          }
        ],
        updated_at: new Date(),
        sharp_money_indicator: 'home',
        public_betting_percentage: {
          home: 60,
          away: 40
        }
      }
    ]
  },
  {
    name: 'analytics',
    indexes: [
      { fields: { entity_id: 1, entity_type: 1 }, options: { background: true } },
      { fields: { date: 1 }, options: { background: true } },
      { fields: { league: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        entity_id: 'lbj23',
        entity_type: 'player',
        name: 'LeBron James',
        league: 'NBA',
        date: new Date('2023-12-20'),
        advanced_metrics: {
          player_efficiency_rating: 24.7,
          true_shooting_percentage: 0.585,
          usage_rate: 31.2,
          win_shares: 5.4,
          win_shares_per_48: 0.178,
          box_plus_minus: 7.8,
          value_over_replacement: 2.5
        },
        scoring_tendencies: {
          paint_percentage: 0.42,
          midrange_percentage: 0.18,
          three_point_percentage: 0.28,
          free_throw_percentage: 0.12
        },
        situation_stats: {
          clutch_time_points_per_game: 3.8,
          clutch_time_field_goal_percentage: 0.47,
          fourth_quarter_points_per_game: 7.2
        },
        contextual_data: {
          rest_advantage_performance_boost: 0.08,
          home_court_performance_boost: 0.05,
          back_to_back_performance_penalty: -0.12
        },
        projections: {
          next_game_projection: {
            points: 27.5,
            assists: 8.2,
            rebounds: 7.4,
            range_low: 22,
            range_high: 33
          },
          rest_of_season_projection: {
            points_per_game: 26.8,
            assists_per_game: 8.0,
            rebounds_per_game: 7.2
          }
        }
      },
      {
        entity_id: 'lakers',
        entity_type: 'team',
        name: 'Lakers',
        league: 'NBA',
        date: new Date('2023-12-20'),
        advanced_metrics: {
          offensive_rating: 114.2,
          defensive_rating: 111.5,
          net_rating: 2.7,
          pace: 100.8,
          true_shooting_percentage: 0.573,
          effective_field_goal_percentage: 0.538
        },
        lineup_data: {
          most_effective_lineup: {
            players: ['LeBron James', 'Anthony Davis', 'D\'Angelo Russell', 'Austin Reaves', 'Rui Hachimura'],
            net_rating: 12.4,
            minutes_played: 87
          },
          worst_lineup: {
            players: ['LeBron James', 'Anthony Davis', 'D\'Angelo Russell', 'Cam Reddish', 'Taurean Prince'],
            net_rating: -8.7,
            minutes_played: 32
          }
        },
        situational_performance: {
          home_record: [10, 5],
          away_record: [8, 7],
          vs_winning_teams: [6, 8],
          vs_losing_teams: [12, 4],
          in_clutch_time: [7, 4]
        },
        scoring_distribution: {
          paint_points_percentage: 0.48,
          midrange_percentage: 0.12,
          three_point_percentage: 0.32,
          free_throw_percentage: 0.08
        }
      }
    ]
  },
  {
    name: 'user_analytics',
    indexes: [
      { fields: { user_id: 1 }, options: { background: true } },
      { fields: { date: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        user_id: 'admin',
        date: new Date('2023-12-20'),
        prediction_activity: {
          total_predictions: 127,
          accurate_predictions: 82,
          accuracy_rate: 0.6457,
          average_confidence: 0.72
        },
        favorite_leagues: [
          { league: 'NBA', predictions_count: 64 },
          { league: 'NFL', predictions_count: 42 },
          { league: 'PREMIER_LEAGUE', predictions_count: 21 }
        ],
        favorite_teams: [
          { team: 'Lakers', predictions_count: 18 },
          { team: 'Chiefs', predictions_count: 12 },
          { team: 'Warriors', predictions_count: 8 }
        ],
        favorite_players: [
          { player: 'LeBron James', predictions_count: 15 },
          { player: 'Patrick Mahomes', predictions_count: 10 },
          { player: 'Stephen Curry', predictions_count: 7 }
        ],
        prediction_types: {
          player_performance: 65,
          team_results: 48,
          game_props: 14
        },
        session_data: {
          average_session_duration: 1258, // in seconds
          sessions_per_week: 4.2,
          devices: {
            mobile: 0.52,
            desktop: 0.42,
            tablet: 0.06
          }
        },
        subscription_info: {
          tier: 'enterprise',
          renewal_date: new Date('2024-06-20'),
          feature_usage: {
            advanced_analytics: 37,
            multi_factor_predictions: 24,
            data_exports: 5
          }
        }
      }
    ]
  },
  {
    name: 'transactions',
    indexes: [
      { fields: { transaction_id: 1 }, options: { unique: true } },
      { fields: { user_id: 1 }, options: { background: true } },
      { fields: { date: 1 }, options: { background: true } },
      { fields: { status: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        transaction_id: 'txn_' + new Date().getTime().toString(),
        user_id: 'admin',
        date: new Date(),
        amount: 199.99,
        currency: 'USD',
        description: 'Enterprise subscription - Annual',
        payment_method: 'credit_card',
        status: 'completed',
        subscription: {
          plan: 'enterprise',
          period: 'annual',
          start_date: new Date(),
          end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        },
        billing_address: {
          name: 'Admin User',
          address_line1: '123 Enterprise St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94105',
          country: 'US'
        },
        metadata: {
          promotion_code: 'LAUNCH2023',
          discount_applied: 20
        }
      }
    ]
  },
  {
    name: 'audit_logs',
    indexes: [
      { fields: { timestamp: 1 }, options: { background: true } },
      { fields: { user_id: 1 }, options: { background: true } },
      { fields: { action: 1 }, options: { background: true } },
      { fields: { resource_type: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        timestamp: new Date(),
        user_id: 'admin',
        action: 'login',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        status: 'success',
        details: {
          location: 'San Francisco, CA, US',
          device_type: 'desktop'
        }
      },
      {
        timestamp: new Date(new Date().getTime() - 3600000),
        user_id: 'admin',
        action: 'prediction_generated',
        resource_type: 'prediction',
        resource_id: 'pred_123456',
        status: 'success',
        details: {
          model_used: 'xgboost_player_points',
          execution_time_ms: 156,
          factor: 'LeBron James scores more than 25 points'
        }
      }
    ]
  },
  {
    name: 'model_registry',
    indexes: [
      { fields: { model_id: 1 }, options: { unique: true } },
      { fields: { model_type: 1 }, options: { background: true } },
      { fields: { league: 1 }, options: { background: true } },
      { fields: { version: 1 }, options: { background: true } },
      { fields: { active: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        model_id: 'xgboost_player_points_nba_v1',
        model_name: 'Player Points Prediction',
        model_type: 'xgboost',
        league: 'NBA',
        entity_type: 'player',
        prediction_target: 'points',
        version: '1.0.0',
        created_at: new Date(new Date().getTime() - 86400000 * 30), // 30 days ago
        last_trained: new Date(new Date().getTime() - 86400000 * 7), // 7 days ago
        feature_count: 42,
        training_samples: 12580,
        metrics: {
          accuracy: 0.78,
          precision: 0.81,
          recall: 0.75,
          f1_score: 0.79,
          roc_auc: 0.84,
          log_loss: 0.42
        },
        hyperparameters: {
          max_depth: 6,
          learning_rate: 0.01,
          n_estimators: 500,
          objective: 'binary:logistic'
        },
        active: true,
        file_path: '/models/xgboost_player_points_nba_v1.joblib'
      },
      {
        model_id: 'neural_network_team_win_nfl_v1',
        model_name: 'Team Win Prediction',
        model_type: 'neural_network',
        league: 'NFL',
        entity_type: 'team',
        prediction_target: 'win',
        version: '1.0.0',
        created_at: new Date(new Date().getTime() - 86400000 * 45), // 45 days ago
        last_trained: new Date(new Date().getTime() - 86400000 * 10), // 10 days ago
        feature_count: 38,
        training_samples: 8250,
        metrics: {
          accuracy: 0.72,
          precision: 0.74,
          recall: 0.71,
          f1_score: 0.72,
          roc_auc: 0.78,
          log_loss: 0.51
        },
        architecture: {
          layers: [64, 32, 16],
          activation: 'relu',
          dropout_rate: 0.3
        },
        hyperparameters: {
          batch_size: 32,
          epochs: 100,
          learning_rate: 0.001,
          optimizer: 'adam'
        },
        active: true,
        file_path: '/models/neural_network_team_win_nfl_v1.h5'
      }
    ]
  },
  {
    name: 'data_sources',
    indexes: [
      { fields: { source_id: 1 }, options: { unique: true } },
      { fields: { data_type: 1 }, options: { background: true } },
      { fields: { league: 1 }, options: { background: true } },
      { fields: { last_updated: 1 }, options: { background: true } }
    ],
    sampleDocuments: [
      {
        source_id: 'nba_official_stats',
        name: 'NBA Official Statistics',
        data_type: 'player_stats',
        leagues: ['NBA'],
        provider: 'nba.com',
        api_endpoint: 'https://stats.nba.com/stats/',
        update_frequency: 'daily',
        last_updated: new Date(),
        status: 'active',
        credentials: {
          api_key_reference: 'NBA_STATS_API_KEY',
          auth_type: 'header_key'
        },
        data_quality: {
          accuracy: 0.99,
          completeness: 0.98,
          timeliness: 0.95
        },
        schema_version: '2023.1'
      },
      {
        source_id: 'odds_api_premium',
        name: 'Odds API Premium',
        data_type: 'betting_odds',
        leagues: ['NBA', 'NFL', 'MLB', 'NHL', 'PREMIER_LEAGUE'],
        provider: 'oddsapi.io',
        api_endpoint: 'https://api.oddsapi.io/v4/',
        update_frequency: 'realtime',
        last_updated: new Date(),
        status: 'active',
        credentials: {
          api_key_reference: 'ODDS_API_KEY',
          auth_type: 'query_param'
        },
        data_quality: {
          accuracy: 0.98,
          completeness: 0.99,
          timeliness: 0.99
        },
        cost_per_month: 299.99,
        schema_version: '4.2.1'
      }
    ]
  },
  {
    name: 'system_config',
    indexes: [
      { fields: { config_key: 1 }, options: { unique: true } }
    ],
    sampleDocuments: [
      {
        config_key: 'system_parameters',
        description: 'Global system parameters',
        updated_at: new Date(),
        updated_by: 'admin',
        parameters: {
          max_concurrent_predictions: 500,
          cache_ttl_seconds: 300,
          rate_limits: {
            basic: 50,
            premium: 200,
            enterprise: 1000
          },
          maintenance_mode: false,
          debug_mode: false
        }
      },
      {
        config_key: 'model_parameters',
        description: 'Model training and prediction parameters',
        updated_at: new Date(),
        updated_by: 'admin',
        parameters: {
          retraining_schedule: {
            daily_models: '0 3 * * *', // 3 AM daily
            weekly_models: '0 2 * * 1', // 2 AM on Mondays
            monthly_models: '0 1 1 * *' // 1 AM on the 1st of each month
          },
          prediction_thresholds: {
            high_confidence: 0.75,
            medium_confidence: 0.6,
            low_confidence: 0.5
          },
          ensemble_weights: {
            xgboost: 0.35,
            neural_network: 0.3,
            random_forest: 0.2,
            logistic_regression: 0.15
          }
        }
      }
    ]
  }
];

/**
 * Initialize MongoDB with required collections and indexes
 */
async function initializeMongoDB() {
  // Get URI from environment
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  
  // Create a MongoClient with a MongoClientOptions object to set the Stable API version
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true, 
      deprecationErrors: true,
    }
  });
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    
    // Connect the client to the server
    await client.connect();
    
    // Verify connection with ping
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB successfully! Pinged your deployment.");
    
    // Get database
    const db = client.db(dbName);
    
    // Get existing collections
    const existingCollections = await db.listCollections().toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);
    
    console.log(`\n📊 Found ${existingCollectionNames.length} existing collections: ${existingCollectionNames.join(', ') || "none"}`);
    
    // Create each collection and its indexes
    for (const collection of collections) {
      if (!existingCollectionNames.includes(collection.name)) {
        console.log(`\n📝 Creating collection: ${collection.name}`);
        await db.createCollection(collection.name);
        console.log(`✅ Created collection: ${collection.name}`);
      } else {
        console.log(`\n📋 Collection ${collection.name} already exists`);
      }
      
      // Create indexes
      if (collection.indexes && collection.indexes.length > 0) {
        const coll = db.collection(collection.name);
        
        for (const index of collection.indexes) {
          console.log(`  📌 Creating index on ${JSON.stringify(index.fields)} for ${collection.name}`);
          await coll.createIndex(index.fields, index.options);
          console.log(`  ✅ Created index successfully`);
        }
      }
      
      // Add sample data if collection is empty
      const count = await db.collection(collection.name).countDocuments();
      
      if (count === 0 && collection.sampleDocuments && collection.sampleDocuments.length > 0) {
        console.log(`  📥 Adding sample data to ${collection.name}`);
        await db.collection(collection.name).insertMany(collection.sampleDocuments);
        console.log(`  ✅ Added ${collection.sampleDocuments.length} sample documents`);
      } else {
        console.log(`  ℹ️ Collection ${collection.name} already has ${count} documents, skipping sample data`);
      }
    }
    
    console.log('\n🎉 MongoDB initialization completed successfully');
  } catch (error) {
    console.error(`❌ MongoDB initialization failed: ${error.message}`);
    if (error.message.includes('whitelist') || error.message.includes('ENOTFOUND')) {
      console.log('⚠️ This may be due to IP whitelist issues. Please ensure your IP is whitelisted in MongoDB Atlas.');
    }
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the initialization function
initializeMongoDB()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 