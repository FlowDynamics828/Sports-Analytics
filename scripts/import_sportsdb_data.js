/**
 * TheSportsDB API Data Importer
 * 
 * This script imports data from TheSportsDB API into our MongoDB collections.
 * It handles leagues, teams, players, and matches data.
 */

const { MongoClient, ServerApiVersion } = require('mongodb');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// API Configuration
const SPORTSDB_API_KEY = '447279'; // Your API key from screenshot
const API_BASE_URL_V1 = 'https://www.thesportsdb.com/api/v1/json';
const API_BASE_URL_V2 = 'https://www.thesportsdb.com/api/v2/json';
const API_DELAY_MS = 1500; // Delay between API calls to avoid rate limits

// MongoDB Configuration
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

// Command line arguments parsing
const args = process.argv.slice(2);
const LIVE_ONLY = args.includes('--live-only');
const MATCHES_ONLY = args.includes('--matches-only');

// Set up MongoDB client
const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Supported leagues (based on premium API file)
const SUPPORTED_LEAGUES = [
  { name: 'NBA', id: '4387', sport: 'Basketball' },
  { name: 'NFL', id: '4391', sport: 'American Football' },
  { name: 'NHL', id: '4380', sport: 'Ice Hockey' },
  { name: 'MLB', id: '4424', sport: 'Baseball' },
  { name: 'PREMIER_LEAGUE', id: '4328', sport: 'Soccer' },
  { name: 'SERIE_A', id: '4332', sport: 'Soccer' },
  { name: 'BUNDESLIGA', id: '4331', sport: 'Soccer' },
  { name: 'LA_LIGA', id: '4335', sport: 'Soccer' }
];

// Add this helper function to delay API calls
/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an API call with rate limiting
 */
async function apiCall(url) {
  try {
    // Make the API call
    const response = await axios.get(url);
    // Delay to avoid rate limiting
    await sleep(API_DELAY_MS);
    return response;
  } catch (error) {
    // If we hit a rate limit, wait longer and try again
    if (error.response && error.response.status === 429) {
      console.log(`  ⚠️ Rate limit hit, waiting 5 seconds...`);
      await sleep(5000);
      return await apiCall(url);
    }
    throw error;
  }
}

/**
 * Import all leagues data
 */
async function importLeagues(db) {
  console.log('\n📊 Importing leagues data...');
  
  const leaguesCollection = db.collection('leagues');
  
  // First, get all leagues from API
  try {
    const response = await apiCall(`${API_BASE_URL_V1}/${SPORTSDB_API_KEY}/all_leagues.php`);
    
    if (response.data && response.data.leagues) {
      // Filter only our supported leagues
      const supportedLeagueIds = SUPPORTED_LEAGUES.map(l => l.id);
      const leagues = response.data.leagues.filter(l => supportedLeagueIds.includes(l.idLeague));
      
      if (leagues.length > 0) {
        // Transform league data to our schema
        const transformedLeagues = leagues.map(league => {
          const supportedLeague = SUPPORTED_LEAGUES.find(sl => sl.id === league.idLeague);
          
          return {
            name: supportedLeague.name,
            sport: league.strSport || supportedLeague.sport,
            api_id: league.idLeague,
            country: league.strCountry,
            teams_count: 0, // To be updated later
            current_season: league.strCurrentSeason,
            season_start: league.strSeason && league.strSeason.includes('/') ? 
              `${league.strSeason.split('/')[0]}-08-01` : null, // Approximate start date
            season_end: league.strSeason && league.strSeason.includes('/') ? 
              `${league.strSeason.split('/')[1]}-06-30` : null, // Approximate end date
            logo_url: league.strLogo || league.strBadge,
            fanart_url: league.strFanart1,
            website: league.strWebsite,
            description: league.strDescriptionEN,
            social: {
              facebook: league.strFacebook,
              twitter: league.strTwitter,
              youtube: league.strYoutube
            },
            last_updated: new Date()
          };
        });
        
        // Bulk upsert operation
        const bulkOps = transformedLeagues.map(league => ({
          updateOne: {
            filter: { name: league.name },
            update: { $set: league },
            upsert: true
          }
        }));
        
        const result = await leaguesCollection.bulkWrite(bulkOps);
        console.log(`✅ Imported ${transformedLeagues.length} leagues (${result.upsertedCount} new, ${result.modifiedCount} updated)`);
        
        return transformedLeagues;
      } else {
        console.log('⚠️ No matching supported leagues found');
        return [];
      }
    } else {
      console.log('⚠️ No leagues data received from API');
      return [];
    }
  } catch (error) {
    console.error(`❌ Error importing leagues: ${error.message}`);
    return [];
  }
}

/**
 * Import teams for specified leagues
 */
async function importTeams(db, leagues) {
  console.log('\n📊 Importing teams data...');
  
  const teamsCollection = db.collection('teams');
  const leaguesCollection = db.collection('leagues');
  
  let totalTeamsImported = 0;
  
  for (const league of leagues) {
    try {
      console.log(`  📋 Fetching teams for ${league.name}...`);
      
      const response = await apiCall(`${API_BASE_URL_V1}/${SPORTSDB_API_KEY}/lookup_all_teams.php?id=${league.api_id}`);
      
      if (response.data && response.data.teams) {
        const teams = response.data.teams;
        
        // Transform team data to our schema
        const transformedTeams = teams.map(team => {
          return {
            name: team.strTeam,
            league: league.name,
            api_id: team.idTeam,
            alternate_name: team.strAlternate,
            location: team.strStadiumLocation,
            country: team.strCountry,
            founding_year: parseInt(team.intFormedYear) || null,
            stadium: {
              name: team.strStadium,
              capacity: parseInt(team.intStadiumCapacity) || null,
              location: team.strStadiumLocation,
              description: team.strStadiumDescription,
              image: team.strStadiumThumb
            },
            colors: {
              primary: team.strPrimaryColor,
              secondary: team.strSecondaryColor,
              tertiary: team.strTertiaryColor
            },
            logo_url: team.strTeamBadge,
            jersey_url: team.strTeamJersey,
            banner_url: team.strTeamBanner,
            website: team.strWebsite,
            social: {
              facebook: team.strFacebook,
              twitter: team.strTwitter,
              instagram: team.strInstagram,
              youtube: team.strYoutube
            },
            description: team.strDescriptionEN,
            last_updated: new Date()
          };
        });
        
        if (transformedTeams.length > 0) {
          // Bulk upsert operation
          const bulkOps = transformedTeams.map(team => ({
            updateOne: {
              filter: { name: team.name, league: team.league },
              update: { $set: team },
              upsert: true
            }
          }));
          
          const result = await teamsCollection.bulkWrite(bulkOps);
          
          // Update league with team count
          await leaguesCollection.updateOne(
            { name: league.name },
            { $set: { teams_count: transformedTeams.length } }
          );
          
          console.log(`    ✅ Imported ${transformedTeams.length} teams for ${league.name} (${result.upsertedCount} new, ${result.modifiedCount} updated)`);
          totalTeamsImported += transformedTeams.length;
        } else {
          console.log(`    ⚠️ No teams found for ${league.name}`);
        }
      } else {
        console.log(`    ⚠️ No teams data received for ${league.name}`);
      }
    } catch (error) {
      console.error(`    ❌ Error importing teams for ${league.name}: ${error.message}`);
    }
  }
  
  console.log(`✅ Total teams imported: ${totalTeamsImported}`);
  return totalTeamsImported;
}

/**
 * Import players for each team
 */
async function importPlayers(db) {
  console.log('\n📊 Importing players data...');
  
  const playersCollection = db.collection('players');
  const playerStatsCollection = db.collection('player_stats');
  const teamsCollection = db.collection('teams');
  
  let totalPlayersImported = 0;
  
  // Get all teams
  const teams = await teamsCollection.find({}).toArray();
  
  for (const team of teams) {
    try {
      console.log(`  📋 Fetching players for ${team.name} (${team.league})...`);
      
      const response = await apiCall(`${API_BASE_URL_V1}/${SPORTSDB_API_KEY}/lookup_all_players.php?id=${team.api_id}`);
      
      if (response.data && response.data.player) {
        const players = response.data.player;
        
        // Transform player data to our schema
        const transformedPlayers = players.map(player => {
          const playerId = player.idPlayer;
          // Create a normalized player_id that's easier to work with
          const normalizedName = player.strPlayer.toLowerCase().replace(/[^a-z0-9]/g, '');
          const customPlayerId = `${normalizedName}_${playerId.substr(-4)}`;
          
          // Map sports-specific positions to a standard format
          let position = player.strPosition;
          if (team.league === 'NBA') {
            // Map NBA positions
            if (position.includes('Point Guard') || position.includes('PG')) position = 'PG';
            else if (position.includes('Shooting Guard') || position.includes('SG')) position = 'SG';
            else if (position.includes('Small Forward') || position.includes('SF')) position = 'SF';
            else if (position.includes('Power Forward') || position.includes('PF')) position = 'PF';
            else if (position.includes('Center') || position.includes('C')) position = 'C';
          } else if (team.league === 'NFL') {
            // Keep NFL positions as is or map them if needed
          }
          
          return {
            player_id: customPlayerId,
            api_id: playerId,
            name: player.strPlayer,
            team: team.name,
            league: team.league,
            position: position,
            jersey_number: player.strNumber ? parseInt(player.strNumber.replace(/\D/g, '')) : null,
            height: player.strHeight,
            weight: player.strWeight,
            birthdate: player.dateBorn,
            birthplace: player.strBirthLocation,
            nationality: player.strNationality,
            thumb_url: player.strThumb,
            cutout_url: player.strCutout,
            render_url: player.strRender,
            banner_url: player.strBanner,
            is_active: true,
            career_start: player.strSigning ? new Date(player.strSigning).getFullYear() : null,
            description: player.strDescriptionEN,
            stats: {}, // Basic stats placeholder, to be populated separately
            last_updated: new Date()
          };
        });
        
        if (transformedPlayers.length > 0) {
          // Bulk upsert operation
          const bulkOps = transformedPlayers.map(player => ({
            updateOne: {
              filter: { player_id: player.player_id },
              update: { $set: player },
              upsert: true
            }
          }));
          
          const result = await playersCollection.bulkWrite(bulkOps);
          console.log(`    ✅ Imported ${transformedPlayers.length} players for ${team.name} (${result.upsertedCount} new, ${result.modifiedCount} updated)`);
          totalPlayersImported += transformedPlayers.length;
          
          // For each player, fetch additional statistics if possible
          await importPlayerStats(db, transformedPlayers, team);
        } else {
          console.log(`    ⚠️ No players found for ${team.name}`);
        }
      } else {
        console.log(`    ⚠️ No players data received for ${team.name}`);
      }
    } catch (error) {
      console.error(`    ❌ Error importing players for ${team.name}: ${error.message}`);
    }
  }
  
  console.log(`✅ Total players imported: ${totalPlayersImported}`);
  return totalPlayersImported;
}

/**
 * Import player statistics
 */
async function importPlayerStats(db, players, team) {
  const playerStatsCollection = db.collection('player_stats');
  
  for (const player of players) {
    try {
      // For V2 endpoint, need to supplement with player stats if available
      if (team.league === 'NBA' || team.league === 'NFL' || team.league === 'NHL' || team.league === 'MLB') {
        // Check if we can get the stats using V2 (player stats)
        const statsResponse = await apiCall(`${API_BASE_URL_V2}/${SPORTSDB_API_KEY}/lookupplayer.php?id=${player.api_id}`);
        
        if (statsResponse.data && statsResponse.data.players && statsResponse.data.players.length > 0) {
          const playerStats = statsResponse.data.players[0];
          
          // Prepare stats based on league
          let statsData = {};
          
          if (team.league === 'NBA') {
            statsData = {
              points_per_game: parseFloat(playerStats.strPoints) || null,
              rebounds_per_game: parseFloat(playerStats.strRebounds) || null,
              assists_per_game: parseFloat(playerStats.strAssists) || null,
              field_goal_percentage: parseFloat(playerStats.strFGP) || null,
              three_point_percentage: parseFloat(playerStats.strThreeP) || null,
              free_throw_percentage: parseFloat(playerStats.strFTP) || null,
              blocks_per_game: parseFloat(playerStats.strBlocks) || null,
              steals_per_game: parseFloat(playerStats.strSteals) || null
            };
          } else if (team.league === 'NFL') {
            // Parse relevant NFL stats
            statsData = {
              passing_yards: parseInt(playerStats.strPassingYards) || null,
              rushing_yards: parseInt(playerStats.strRushingYards) || null,
              receiving_yards: parseInt(playerStats.strReceivingYards) || null,
              touchdowns: parseInt(playerStats.strTouchdowns) || null,
              interceptions: parseInt(playerStats.strInterceptions) || null,
              tackles: parseInt(playerStats.strTackles) || null,
              sacks: parseFloat(playerStats.strSacks) || null
            };
          } else if (team.league === 'NHL') {
            statsData = {
              goals: parseInt(playerStats.strGoals) || null,
              assists: parseInt(playerStats.strAssists) || null,
              points: parseInt(playerStats.strPoints) || null,
              plus_minus: parseInt(playerStats.strPlusMinus) || null,
              penalty_minutes: parseInt(playerStats.strPenaltyMinutes) || null
            };
          } else if (team.league === 'MLB') {
            statsData = {
              batting_average: parseFloat(playerStats.strBattingAverage) || null,
              home_runs: parseInt(playerStats.strHomeRuns) || null,
              runs_batted_in: parseInt(playerStats.strRBI) || null,
              earned_run_average: parseFloat(playerStats.strERA) || null,
              wins: parseInt(playerStats.strWins) || null,
              strikeouts: parseInt(playerStats.strStrikeouts) || null
            };
          }
          
          // Update player with stats
          await db.collection('players').updateOne(
            { player_id: player.player_id },
            { $set: { stats: statsData } }
          );
          
          // Create a player_stats entry for the current season/latest data point
          const today = new Date();
          const statRecord = {
            player_id: player.player_id,
            name: player.name,
            team: team.name,
            league: team.league,
            date: today.toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
            season: `${today.getFullYear() - 1}-${today.getFullYear()}`, // Current season format
            stats_type: 'season_average',
            ...statsData,
            created_at: new Date(),
            updated_at: new Date()
          };
          
          // Upsert the stats record
          await playerStatsCollection.updateOne(
            { 
              player_id: player.player_id,
              stats_type: 'season_average',
              season: statRecord.season
            },
            { $set: statRecord },
            { upsert: true }
          );
        }
      }
    } catch (error) {
      // Just log the error but continue with other players
      console.error(`      ⚠️ Error importing stats for ${player.name}: ${error.message}`);
    }
  }
}

/**
 * Import upcoming and recent events/matches
 */
async function importEvents(db, leagues) {
  console.log('\n📊 Importing events/matches data...');
  
  const matchesCollection = db.collection('matches');
  
  let totalEventsImported = 0;
  
  for (const league of leagues) {
    try {
      console.log(`  📋 Fetching events for ${league.name}...`);
      
      // Get past events (last 15 events)
      const pastResponse = await apiCall(`${API_BASE_URL_V1}/${SPORTSDB_API_KEY}/eventspastleague.php?id=${league.api_id}`);
      
      // Add delay between requests
      await sleep(API_DELAY_MS);
      
      // Get upcoming events (next 15 events)
      const upcomingResponse = await apiCall(`${API_BASE_URL_V1}/${SPORTSDB_API_KEY}/eventsnextleague.php?id=${league.api_id}`);
      
      let events = [];
      
      if (pastResponse.data && pastResponse.data.events) {
        events = events.concat(pastResponse.data.events);
      }
      
      if (upcomingResponse.data && upcomingResponse.data.events) {
        events = events.concat(upcomingResponse.data.events);
      }
      
      if (events.length > 0) {
        // Transform events data to our schema
        const transformedEvents = events.map(event => {
          let homeScore = null;
          let awayScore = null;
          
          // Parse scores if available
          if (event.intHomeScore !== null && event.intHomeScore !== undefined) {
            homeScore = parseInt(event.intHomeScore);
          }
          
          if (event.intAwayScore !== null && event.intAwayScore !== undefined) {
            awayScore = parseInt(event.intAwayScore);
          }
          
          // Determine status
          let status = 'scheduled';
          if (event.strStatus === 'Match Finished' || (homeScore !== null && awayScore !== null)) {
            status = 'completed';
          } else if (event.strStatus === 'Not Started' || event.strStatus === null) {
            status = 'scheduled';
          } else {
            status = 'in_progress';
          }
          
          return {
            match_id: event.idEvent,
            league: league.name,
            home_team: event.strHomeTeam,
            away_team: event.strAwayTeam,
            match_date: event.dateEvent,
            match_time: event.strTime,
            venue: event.strVenue,
            home_score: homeScore,
            away_score: awayScore,
            round: event.intRound,
            season: event.strSeason,
            status: status,
            thumb_url: event.strThumb,
            banner_url: event.strBanner,
            video_url: event.strVideo,
            details: {
              attendance: event.intAttendance,
              home_formation: event.strHomeFormation,
              away_formation: event.strAwayFormation,
              home_yellow_cards: event.intHomeYellowCards,
              home_red_cards: event.intHomeRedCards,
              away_yellow_cards: event.intAwayYellowCards,
              away_red_cards: event.intAwayRedCards,
              home_lineup_goalkeeper: event.strHomeLineupGoalkeeper,
              home_lineup_defense: event.strHomeLineupDefense,
              home_lineup_midfield: event.strHomeLineupMidfield,
              home_lineup_forward: event.strHomeLineupForward,
              home_lineup_substitutes: event.strHomeLineupSubstitutes,
              away_lineup_goalkeeper: event.strAwayLineupGoalkeeper,
              away_lineup_defense: event.strAwayLineupDefense,
              away_lineup_midfield: event.strAwayLineupMidfield,
              away_lineup_forward: event.strAwayLineupForward,
              away_lineup_substitutes: event.strAwayLineupSubstitutes
            },
            last_updated: new Date()
          };
        });
        
        // Bulk upsert operation
        const bulkOps = transformedEvents.map(event => ({
          updateOne: {
            filter: { match_id: event.match_id },
            update: { $set: event },
            upsert: true
          }
        }));
        
        const result = await matchesCollection.bulkWrite(bulkOps);
        console.log(`    ✅ Imported ${transformedEvents.length} events for ${league.name} (${result.upsertedCount} new, ${result.modifiedCount} updated)`);
        totalEventsImported += transformedEvents.length;
      } else {
        console.log(`    ⚠️ No events found for ${league.name}`);
      }
    } catch (error) {
      console.error(`    ❌ Error importing events for ${league.name}: ${error.message}`);
    }
  }
  
  console.log(`✅ Total events imported: ${totalEventsImported}`);
  return totalEventsImported;
}

/**
 * Import live scores if available
 */
async function importLiveScores(db) {
  console.log('\n📊 Checking for live events...');
  
  const matchesCollection = db.collection('matches');
  
  try {
    // Get all live events
    const response = await apiCall(`${API_BASE_URL_V1}/${SPORTSDB_API_KEY}/livescore.php`);
    
    if (response.data && response.data.events && response.data.events.length > 0) {
      const liveEvents = response.data.events;
      
      console.log(`  📋 Found ${liveEvents.length} live events`);
      
      // Update each live event
      for (const event of liveEvents) {
        try {
          const result = await matchesCollection.updateOne(
            { match_id: event.idEvent },
            { 
              $set: {
                status: 'in_progress',
                home_score: parseInt(event.intHomeScore) || 0,
                away_score: parseInt(event.intAwayScore) || 0,
                live_minute: event.strProgress,
                last_updated: new Date()
              }
            }
          );
          
          if (result.matchedCount > 0) {
            console.log(`    ✅ Updated live score for ${event.strEvent}`);
          } else {
            // If event doesn't exist yet, create it
            const leagueMatch = SUPPORTED_LEAGUES.find(l => l.id === event.idLeague);
            
            if (leagueMatch) {
              const newEvent = {
                match_id: event.idEvent,
                league: leagueMatch.name,
                home_team: event.strHomeTeam,
                away_team: event.strAwayTeam,
                match_date: event.dateEvent,
                match_time: event.strTime,
                venue: event.strVenue,
                home_score: parseInt(event.intHomeScore) || 0,
                away_score: parseInt(event.intAwayScore) || 0,
                status: 'in_progress',
                live_minute: event.strProgress,
                last_updated: new Date()
              };
              
              await matchesCollection.insertOne(newEvent);
              console.log(`    ✅ Created new live event for ${event.strEvent}`);
            }
          }
        } catch (error) {
          console.error(`    ❌ Error updating live event ${event.strEvent}: ${error.message}`);
        }
      }
      
      console.log(`✅ Live scores updated`);
    } else {
      console.log(`  ℹ️ No live events currently in progress`);
    }
  } catch (error) {
    console.error(`❌ Error checking live scores: ${error.message}`);
  }
}

/**
 * Import TheSportsDB data into our database
 */
async function importAllData() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await client.connect();
    console.log("✅ Connected to MongoDB successfully!");
    
    const db = client.db(MONGO_DB_NAME);
    
    // Create data sources entry for thesportsdb
    const dataSourcesCollection = db.collection('data_sources');
    await dataSourcesCollection.updateOne(
      { source_id: 'thesportsdb' },
      { 
        $set: {
          source_id: 'thesportsdb',
          name: 'TheSportsDB',
          data_type: 'sports_data',
          leagues: SUPPORTED_LEAGUES.map(l => l.name),
          provider: 'thesportsdb.com',
          api_endpoint: 'https://www.thesportsdb.com/api/',
          update_frequency: 'daily',
          last_updated: new Date(),
          status: 'active',
          credentials: {
            api_key_reference: SPORTSDB_API_KEY,
            auth_type: 'query_param'
          },
          data_quality: {
            accuracy: 0.95,
            completeness: 0.9,
            timeliness: 0.95
          }
        }
      },
      { upsert: true }
    );
    
    let leagues = [];
    
    // If updating only live scores, skip other imports
    if (LIVE_ONLY) {
      console.log('🔴 Live-only mode: Importing only live scores...');
      await importLiveScores(db);
    } 
    // If updating only matches, get leagues then import matches
    else if (MATCHES_ONLY) {
      console.log('🏆 Matches-only mode: Importing only matches/events...');
      // Get leagues from database if they exist
      leagues = await db.collection('leagues').find({}).toArray();
      
      // If no leagues in database, fetch them
      if (leagues.length === 0) {
        leagues = await importLeagues(db);
      }
      
      // Import events
      await importEvents(db, leagues);
      
      // Check for live scores
      await importLiveScores(db);
    }
    // Otherwise do a full import
    else {
      console.log('🔄 Full import mode: Importing all data...');
      // Step 1: Import leagues
      leagues = await importLeagues(db);
      
      // Step 2: Import teams for each league
      await importTeams(db, leagues);
      
      // Step 3: Import players for each team
      await importPlayers(db);
      
      // Step 4: Import events/matches
      await importEvents(db, leagues);
      
      // Step 5: Check for live scores
      await importLiveScores(db);
    }
    
    // Update last import timestamp in system config
    const systemConfigCollection = db.collection('system_config');
    await systemConfigCollection.updateOne(
      { config_key: 'data_import' },
      { 
        $set: {
          last_import: new Date(),
          import_status: 'success',
          import_mode: LIVE_ONLY ? 'live-only' : (MATCHES_ONLY ? 'matches-only' : 'full')
        }
      },
      { upsert: true }
    );
    
    console.log('\n🎉 Data import completed successfully');
  } catch (error) {
    console.error(`❌ Error importing data: ${error.message}`);
  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Execute the import process
importAllData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 