// scripts/setup-teams-collection.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

// Complete teams data for all 8 leagues
const TEAMS_DATA = {
  NFL: [
    { id: 'nfl_ari', name: 'Arizona Cardinals', league: 'NFL', stats: {} },
    { id: 'nfl_atl', name: 'Atlanta Falcons', league: 'NFL', stats: {} },
    { id: 'nfl_bal', name: 'Baltimore Ravens', league: 'NFL', stats: {} },
    { id: 'nfl_buf', name: 'Buffalo Bills', league: 'NFL', stats: {} },
    { id: 'nfl_car', name: 'Carolina Panthers', league: 'NFL', stats: {} },
    { id: 'nfl_chi', name: 'Chicago Bears', league: 'NFL', stats: {} },
    { id: 'nfl_cin', name: 'Cincinnati Bengals', league: 'NFL', stats: {} },
    { id: 'nfl_cle', name: 'Cleveland Browns', league: 'NFL', stats: {} },
    { id: 'nfl_dal', name: 'Dallas Cowboys', league: 'NFL', stats: {} },
    { id: 'nfl_den', name: 'Denver Broncos', league: 'NFL', stats: {} },
    { id: 'nfl_det', name: 'Detroit Lions', league: 'NFL', stats: {} },
    { id: 'nfl_gb', name: 'Green Bay Packers', league: 'NFL', stats: {} },
    { id: 'nfl_hou', name: 'Houston Texans', league: 'NFL', stats: {} },
    { id: 'nfl_ind', name: 'Indianapolis Colts', league: 'NFL', stats: {} },
    { id: 'nfl_jax', name: 'Jacksonville Jaguars', league: 'NFL', stats: {} },
    { id: 'nfl_kc', name: 'Kansas City Chiefs', league: 'NFL', stats: {} },
    { id: 'nfl_lv', name: 'Las Vegas Raiders', league: 'NFL', stats: {} },
    { id: 'nfl_lac', name: 'Los Angeles Chargers', league: 'NFL', stats: {} },
    { id: 'nfl_lar', name: 'Los Angeles Rams', league: 'NFL', stats: {} },
    { id: 'nfl_mia', name: 'Miami Dolphins', league: 'NFL', stats: {} },
    { id: 'nfl_min', name: 'Minnesota Vikings', league: 'NFL', stats: {} },
    { id: 'nfl_ne', name: 'New England Patriots', league: 'NFL', stats: {} },
    { id: 'nfl_no', name: 'New Orleans Saints', league: 'NFL', stats: {} },
    { id: 'nfl_nyg', name: 'New York Giants', league: 'NFL', stats: {} },
    { id: 'nfl_nyj', name: 'New York Jets', league: 'NFL', stats: {} },
    { id: 'nfl_phi', name: 'Philadelphia Eagles', league: 'NFL', stats: {} },
    { id: 'nfl_pit', name: 'Pittsburgh Steelers', league: 'NFL', stats: {} },
    { id: 'nfl_sf', name: 'San Francisco 49ers', league: 'NFL', stats: {} },
    { id: 'nfl_sea', name: 'Seattle Seahawks', league: 'NFL', stats: {} },
    { id: 'nfl_tb', name: 'Tampa Bay Buccaneers', league: 'NFL', stats: {} },
    { id: 'nfl_ten', name: 'Tennessee Titans', league: 'NFL', stats: {} },
    { id: 'nfl_was', name: 'Washington Commanders', league: 'NFL', stats: {} }
  ],
  NBA: [
    { id: 'nba_atl', name: 'Atlanta Hawks', league: 'NBA', stats: {} },
    { id: 'nba_bos', name: 'Boston Celtics', league: 'NBA', stats: {} },
    { id: 'nba_bkn', name: 'Brooklyn Nets', league: 'NBA', stats: {} },
    { id: 'nba_cha', name: 'Charlotte Hornets', league: 'NBA', stats: {} },
    { id: 'nba_chi', name: 'Chicago Bulls', league: 'NBA', stats: {} },
    { id: 'nba_cle', name: 'Cleveland Cavaliers', league: 'NBA', stats: {} },
    { id: 'nba_dal', name: 'Dallas Mavericks', league: 'NBA', stats: {} },
    { id: 'nba_den', name: 'Denver Nuggets', league: 'NBA', stats: {} },
    { id: 'nba_det', name: 'Detroit Pistons', league: 'NBA', stats: {} },
    { id: 'nba_gsw', name: 'Golden State Warriors', league: 'NBA', stats: {} },
    { id: 'nba_hou', name: 'Houston Rockets', league: 'NBA', stats: {} },
    { id: 'nba_ind', name: 'Indiana Pacers', league: 'NBA', stats: {} },
    { id: 'nba_lac', name: 'Los Angeles Clippers', league: 'NBA', stats: {} },
    { id: 'nba_lal', name: 'Los Angeles Lakers', league: 'NBA', stats: {} },
    { id: 'nba_mem', name: 'Memphis Grizzlies', league: 'NBA', stats: {} },
    { id: 'nba_mia', name: 'Miami Heat', league: 'NBA', stats: {} },
    { id: 'nba_mil', name: 'Milwaukee Bucks', league: 'NBA', stats: {} },
    { id: 'nba_min', name: 'Minnesota Timberwolves', league: 'NBA', stats: {} },
    { id: 'nba_nop', name: 'New Orleans Pelicans', league: 'NBA', stats: {} },
    { id: 'nba_nyk', name: 'New York Knicks', league: 'NBA', stats: {} },
    { id: 'nba_okc', name: 'Oklahoma City Thunder', league: 'NBA', stats: {} },
    { id: 'nba_orl', name: 'Orlando Magic', league: 'NBA', stats: {} },
    { id: 'nba_phi', name: 'Philadelphia 76ers', league: 'NBA', stats: {} },
    { id: 'nba_phx', name: 'Phoenix Suns', league: 'NBA', stats: {} },
    { id: 'nba_por', name: 'Portland Trail Blazers', league: 'NBA', stats: {} },
    { id: 'nba_sac', name: 'Sacramento Kings', league: 'NBA', stats: {} },
    { id: 'nba_sas', name: 'San Antonio Spurs', league: 'NBA', stats: {} },
    { id: 'nba_tor', name: 'Toronto Raptors', league: 'NBA', stats: {} },
    { id: 'nba_uta', name: 'Utah Jazz', league: 'NBA', stats: {} },
    { id: 'nba_was', name: 'Washington Wizards', league: 'NBA', stats: {} }
  ],
  MLB: [
    { id: 'mlb_ari', name: 'Arizona Diamondbacks', league: 'MLB', stats: {} },
    { id: 'mlb_atl', name: 'Atlanta Braves', league: 'MLB', stats: {} },
    { id: 'mlb_bal', name: 'Baltimore Orioles', league: 'MLB', stats: {} },
    { id: 'mlb_bos', name: 'Boston Red Sox', league: 'MLB', stats: {} },
    { id: 'mlb_chc', name: 'Chicago Cubs', league: 'MLB', stats: {} },
    { id: 'mlb_chw', name: 'Chicago White Sox', league: 'MLB', stats: {} },
    { id: 'mlb_cin', name: 'Cincinnati Reds', league: 'MLB', stats: {} },
    { id: 'mlb_cle', name: 'Cleveland Guardians', league: 'MLB', stats: {} },
    { id: 'mlb_col', name: 'Colorado Rockies', league: 'MLB', stats: {} },
    { id: 'mlb_det', name: 'Detroit Tigers', league: 'MLB', stats: {} },
    { id: 'mlb_hou', name: 'Houston Astros', league: 'MLB', stats: {} },
    { id: 'mlb_kc', name: 'Kansas City Royals', league: 'MLB', stats: {} },
    { id: 'mlb_laa', name: 'Los Angeles Angels', league: 'MLB', stats: {} },
    { id: 'mlb_lad', name: 'Los Angeles Dodgers', league: 'MLB', stats: {} },
    { id: 'mlb_mia', name: 'Miami Marlins', league: 'MLB', stats: {} },
    { id: 'mlb_mil', name: 'Milwaukee Brewers', league: 'MLB', stats: {} },
    { id: 'mlb_min', name: 'Minnesota Twins', league: 'MLB', stats: {} },
    { id: 'mlb_nyy', name: 'New York Yankees', league: 'MLB', stats: {} },
    { id: 'mlb_nym', name: 'New York Mets', league: 'MLB', stats: {} },
    { id: 'mlb_oak', name: 'Oakland Athletics', league: 'MLB', stats: {} },
    { id: 'mlb_phi', name: 'Philadelphia Phillies', league: 'MLB', stats: {} },
    { id: 'mlb_pit', name: 'Pittsburgh Pirates', league: 'MLB', stats: {} },
    { id: 'mlb_sd', name: 'San Diego Padres', league: 'MLB', stats: {} },
    { id: 'mlb_sf', name: 'San Francisco Giants', league: 'MLB', stats: {} },
    { id: 'mlb_sea', name: 'Seattle Mariners', league: 'MLB', stats: {} },
    { id: 'mlb_stl', name: 'St. Louis Cardinals', league: 'MLB', stats: {} },
    { id: 'mlb_tb', name: 'Tampa Bay Rays', league: 'MLB', stats: {} },
    { id: 'mlb_tex', name: 'Texas Rangers', league: 'MLB', stats: {} },
    { id: 'mlb_tor', name: 'Toronto Blue Jays', league: 'MLB', stats: {} },
    { id: 'mlb_wsh', name: 'Washington Nationals', league: 'MLB', stats: {} }
  ],
  NHL: [
    { id: 'nhl_ana', name: 'Anaheim Ducks', league: 'NHL', stats: {} },
    { id: 'nhl_ari', name: 'Arizona Coyotes', league: 'NHL', stats: {} },
    { id: 'nhl_bos', name: 'Boston Bruins', league: 'NHL', stats: {} },
    { id: 'nhl_buf', name: 'Buffalo Sabres', league: 'NHL', stats: {} },
    { id: 'nhl_cgy', name: 'Calgary Flames', league: 'NHL', stats: {} },
    { id: 'nhl_car', name: 'Carolina Hurricanes', league: 'NHL', stats: {} },
    { id: 'nhl_chi', name: 'Chicago Blackhawks', league: 'NHL', stats: {} },
    { id: 'nhl_col', name: 'Colorado Avalanche', league: 'NHL', stats: {} },
    { id: 'nhl_cbj', name: 'Columbus Blue Jackets', league: 'NHL', stats: {} },
    { id: 'nhl_dal', name: 'Dallas Stars', league: 'NHL', stats: {} },
    { id: 'nhl_det', name: 'Detroit Red Wings', league: 'NHL', stats: {} },
    { id: 'nhl_edm', name: 'Edmonton Oilers', league: 'NHL', stats: {} },
    { id: 'nhl_fla', name: 'Florida Panthers', league: 'NHL', stats: {} },
    { id: 'nhl_lak', name: 'Los Angeles Kings', league: 'NHL', stats: {} },
    { id: 'nhl_min', name: 'Minnesota Wild', league: 'NHL', stats: {} },
    { id: 'nhl_mtl', name: 'Montreal Canadiens', league: 'NHL', stats: {} },
    { id: 'nhl_nsh', name: 'Nashville Predators', league: 'NHL', stats: {} },
    { id: 'nhl_njd', name: 'New Jersey Devils', league: 'NHL', stats: {} },
    { id: 'nhl_nyi', name: 'New York Islanders', league: 'NHL', stats: {} },
    { id: 'nhl_nyr', name: 'New York Rangers', league: 'NHL', stats: {} },
    { id: 'nhl_ott', name: 'Ottawa Senators', league: 'NHL', stats: {} },
    { id: 'nhl_phi', name: 'Philadelphia Flyers', league: 'NHL', stats: {} },
    { id: 'nhl_pit', name: 'Pittsburgh Penguins', league: 'NHL', stats: {} },
    { id: 'nhl_sjs', name: 'San Jose Sharks', league: 'NHL', stats: {} },
    { id: 'nhl_sea', name: 'Seattle Kraken', league: 'NHL', stats: {} },
    { id: 'nhl_stl', name: 'St. Louis Blues', league: 'NHL', stats: {} },
    { id: 'nhl_tbl', name: 'Tampa Bay Lightning', league: 'NHL', stats: {} },
    { id: 'nhl_tor', name: 'Toronto Maple Leafs', league: 'NHL', stats: {} },
    { id: 'nhl_van', name: 'Vancouver Canucks', league: 'NHL', stats: {} },
    { id: 'nhl_vgk', name: 'Vegas Golden Knights', league: 'NHL', stats: {} },
    { id: 'nhl_wsh', name: 'Washington Capitals', league: 'NHL', stats: {} },
    { id: 'nhl_wpg', name: 'Winnipeg Jets', league: 'NHL', stats: {} }
  ],
  PREMIER_LEAGUE: [
    { id: 'pl_ars', name: 'Arsenal', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_avl', name: 'Aston Villa', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_bou', name: 'Bournemouth', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_bre', name: 'Brentford', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_bha', name: 'Brighton & Hove Albion', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_bur', name: 'Burnley', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_che', name: 'Chelsea', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_cry', name: 'Crystal Palace', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_eve', name: 'Everton', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_ful', name: 'Fulham', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_liv', name: 'Liverpool', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_lut', name: 'Luton Town', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_mci', name: 'Manchester City', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_mun', name: 'Manchester United', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_new', name: 'Newcastle United', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_nfo', name: 'Nottingham Forest', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_shu', name: 'Sheffield United', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_tot', name: 'Tottenham Hotspur', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_whu', name: 'West Ham United', league: 'PREMIER_LEAGUE', stats: {} },
    { id: 'pl_wol', name: 'Wolverhampton Wanderers', league: 'PREMIER_LEAGUE', stats: {} }
  ],
  LA_LIGA: [
    { id: 'laliga_alm', name: 'Almería', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_ath', name: 'Athletic Bilbao', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_atm', name: 'Atlético Madrid', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_bar', name: 'Barcelona', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_bet', name: 'Real Betis', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_cad', name: 'Cádiz', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_cel', name: 'Celta Vigo', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_elc', name: 'Elche', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_esp', name: 'Espanyol', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_get', name: 'Getafe', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_gir', name: 'Girona', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_gra', name: 'Granada', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_las', name: 'Las Palmas', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_mal', name: 'Mallorca', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_osa', name: 'Osasuna', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_ray', name: 'Rayo Vallecano', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_rma', name: 'Real Madrid', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_rso', name: 'Real Sociedad', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_sev', name: 'Sevilla', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_val', name: 'Valencia', league: 'LA_LIGA', stats: {} },
    { id: 'laliga_vil', name: 'Villarreal', league: 'LA_LIGA', stats: {} }
  ],
  BUNDESLIGA: [
    { id: 'bun_fcab', name: 'FC Augsburg', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_bay', name: 'Bayern München', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_boch', name: 'VfL Bochum', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_bvb', name: 'Borussia Dortmund', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_ein', name: 'Eintracht Frankfurt', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_fcu', name: 'FC Union Berlin', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_fre', name: 'Sport-Club Freiburg', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_hei', name: 'TSG Hoffenheim', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_her', name: 'Hertha BSC', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_koe', name: '1. FC Köln', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_lev', name: 'Bayer 04 Leverkusen', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_mai', name: '1. FSV Mainz 05', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_mgla', name: 'Borussia Mönchengladbach', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_rbl', name: 'RB Leipzig', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_sch', name: 'FC Schalke 04', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_stu', name: 'VfB Stuttgart', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_wer', name: 'SV Werder Bremen', league: 'BUNDESLIGA', stats: {} },
    { id: 'bun_wol', name: 'VfL Wolfsburg', league: 'BUNDESLIGA', stats: {} }
  ],
  SERIE_A: [
    { id: 'sa_ata', name: 'Atalanta', league: 'SERIE_A', stats: {} },
    { id: 'sa_bol', name: 'Bologna', league: 'SERIE_A', stats: {} },
    { id: 'sa_cag', name: 'Cagliari', league: 'SERIE_A', stats: {} },
    { id: 'sa_emp', name: 'Empoli', league: 'SERIE_A', stats: {} },
    { id: 'sa_fio', name: 'Fiorentina', league: 'SERIE_A', stats: {} },
    { id: 'sa_gen', name: 'Genoa', league: 'SERIE_A', stats: {} },
    { id: 'sa_hel', name: 'Hellas Verona', league: 'SERIE_A', stats: {} },
    { id: 'sa_int', name: 'Inter Milan', league: 'SERIE_A', stats: {} },
    { id: 'sa_juv', name: 'Juventus', league: 'SERIE_A', stats: {} },
    { id: 'sa_laz', name: 'Lazio', league: 'SERIE_A', stats: {} },
    { id: 'sa_lec', name: 'Lecce', league: 'SERIE_A', stats: {} },
    { id: 'sa_mil', name: 'AC Milan', league: 'SERIE_A', stats: {} },
    { id: 'sa_mon', name: 'Monza', league: 'SERIE_A', stats: {} },
    { id: 'sa_nap', name: 'Napoli', league: 'SERIE_A', stats: {} },
    { id: 'sa_rom', name: 'Roma', league: 'SERIE_A', stats: {} },
    { id: 'sa_sal', name: 'Salernitana', league: 'SERIE_A', stats: {} },
    { id: 'sa_sas', name: 'Sassuolo', league: 'SERIE_A', stats: {} },
    { id: 'sa_tor', name: 'Torino', league: 'SERIE_A', stats: {} },
    { id: 'sa_udi', name: 'Udinese', league: 'SERIE_A', stats: {} },
    { id: 'sa_ven', name: 'Venezia', league: 'SERIE_A', stats: {} }
  ]
};

async function setupTeamsCollection() {
  let client;

  try {
    // Connect to MongoDB
    client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    const db = client.db(DB_NAME);
    
    // Check if teams collection already exists
    const collections = await db.listCollections({ name: 'teams' }).toArray();
    const collectionExists = collections.length > 0;
    
    if (collectionExists) {
      // Drop existing collection to ensure clean data
      console.log('Dropping existing teams collection...');
      await db.collection('teams').drop();
    }
    
    // Create teams collection
    await db.createCollection('teams');
    console.log('Created teams collection');
    
    // Insert teams for each league
    let totalTeams = 0;
    for (const [league, teams] of Object.entries(TEAMS_DATA)) {
      if (teams.length > 0) {
        const result = await db.collection('teams').insertMany(teams);
        console.log(`Added ${result.insertedCount} teams for ${league}`);
        totalTeams += result.insertedCount;
      }
    }
    
    // Create indexes
    await db.collection('teams').createIndex({ id: 1 }, { unique: true });
    await db.collection('teams').createIndex({ league: 1 });
    await db.collection('teams').createIndex({ name: 1 });
    
    console.log(`Setup complete! Total teams in collection: ${totalTeams}`);
    
    // Count teams per league
    for (const league of Object.keys(TEAMS_DATA)) {
      const count = await db.collection('teams').countDocuments({ league });
      console.log(`${league}: ${count} teams`);
    }
    
  } catch (error) {
    console.error('Setup failed:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('Database connection closed');
    }
  }
}

setupTeamsCollection()
  .then(() => console.log('Teams collection setup completed'))
  .catch(error => console.error('Teams collection setup failed:', error));