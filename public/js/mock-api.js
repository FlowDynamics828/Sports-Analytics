/**
 * Mock API for Sports Analytics Pro
 * Simulates server responses for development and testing
 */

class MockAPI {
    constructor() {
        // League data for selections
        this.leagues = [
            { id: '4328', name: 'Premier League', country: 'England', logo: 'https://www.thesportsdb.com/images/media/league/badge/i6o0kh1549879062.png' },
            { id: '4331', name: 'La Liga', country: 'Spain', logo: 'https://www.thesportsdb.com/images/media/league/badge/7onmyv1534768460.png' },
            { id: '4332', name: 'Serie A', country: 'Italy', logo: 'https://www.thesportsdb.com/images/media/league/badge/ocy2fe1566486228.png' },
            { id: '4335', name: 'Bundesliga', country: 'Germany', logo: 'https://www.thesportsdb.com/images/media/league/badge/0j55yv1534764799.png' },
            { id: '4334', name: 'Ligue 1', country: 'France', logo: 'https://www.thesportsdb.com/images/media/league/badge/5bp6cr1573937446.png' }
        ];
        
        // Teams data organized by league
        this.teams = {
            '4328': [
                { id: '133602', name: 'Arsenal', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/a1af2i1557005128.png' },
                { id: '133604', name: 'Chelsea', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/yvwvtu1448813215.png' },
                { id: '133600', name: 'Liverpool', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/xzqdr21575276578.png' },
                { id: '133615', name: 'Manchester City', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/vuspxr1467462651.png' },
                { id: '133613', name: 'Manchester United', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/uyhbfe1612467562.png' },
                { id: '133616', name: 'Tottenham', league: 'Premier League', logo: 'https://www.thesportsdb.com/images/media/team/badge/30bphv1604179364.png' }
            ],
            '4331': [
                { id: '133932', name: 'Barcelona', league: 'La Liga', logo: 'https://www.thesportsdb.com/images/media/team/badge/xzqdr21575276710.png' },
                { id: '133739', name: 'Real Madrid', league: 'La Liga', logo: 'https://www.thesportsdb.com/images/media/team/badge/4pqiur1594664648.png' },
                { id: '133726', name: 'Atletico Madrid', league: 'La Liga', logo: 'https://www.thesportsdb.com/images/media/team/badge/rijqaz1594464246.png' },
                { id: '133728', name: 'Valencia', league: 'La Liga', logo: 'https://www.thesportsdb.com/images/media/team/badge/jtcn8a1594993441.png' }
            ],
            '4332': [
                { id: '133670', name: 'Juventus', league: 'Serie A', logo: 'https://www.thesportsdb.com/images/media/team/badge/4hfich1617714426.png' },
                { id: '133798', name: 'AC Milan', league: 'Serie A', logo: 'https://www.thesportsdb.com/images/media/team/badge/m6io891581669890.png' },
                { id: '133800', name: 'Inter Milan', league: 'Serie A', logo: 'https://www.thesportsdb.com/images/media/team/badge/qtprsm1424434867.png' },
                { id: '133647', name: 'Napoli', league: 'Serie A', logo: 'https://www.thesportsdb.com/images/media/team/badge/7qzn801635764953.png' }
            ],
            '4335': [
                { id: '133657', name: 'Bayern Munich', league: 'Bundesliga', logo: 'https://www.thesportsdb.com/images/media/team/badge/ypeiba1595767945.png' },
                { id: '133656', name: 'Borussia Dortmund', league: 'Bundesliga', logo: 'https://www.thesportsdb.com/images/media/team/badge/qwyvxr1473502868.png' },
                { id: '133662', name: 'RB Leipzig', league: 'Bundesliga', logo: 'https://www.thesportsdb.com/images/media/team/badge/tuwyvr1634661158.png' },
                { id: '133664', name: 'Bayer Leverkusen', league: 'Bundesliga', logo: 'https://www.thesportsdb.com/images/media/team/badge/l9yxby1510235953.png' }
            ],
            '4334': [
                { id: '133702', name: 'Paris SG', league: 'Ligue 1', logo: 'https://www.thesportsdb.com/images/media/team/badge/ocy2fe1566486215.png' },
                { id: '133699', name: 'Monaco', league: 'Ligue 1', logo: 'https://www.thesportsdb.com/images/media/team/badge/b54ydh1591431052.png' },
                { id: '133691', name: 'Lyon', league: 'Ligue 1', logo: 'https://www.thesportsdb.com/images/media/team/badge/wyswvy1594991387.png' },
                { id: '133693', name: 'Marseille', league: 'Ligue 1', logo: 'https://www.thesportsdb.com/images/media/team/badge/vvatxq1598627567.png' }
            ]
        };
        
        // Mock players for each team
        this.players = {};
        
        // Generate standings for each league
        this.standings = {};
        
        // Generate upcoming matches
        this.matches = [];
        
        // Initialize mock data
        this.initializeMockData();
    }
    
    // Initialize additional mock data
    initializeMockData() {
        // Generate standings for each league
        for (const leagueId in this.teams) {
            this.standings[leagueId] = this.generateStandings(this.teams[leagueId]);
        }
        
        // Generate upcoming matches across leagues
        for (const leagueId in this.teams) {
            const leagueTeams = this.teams[leagueId];
            
            // Generate 2 matches per league
            for (let i = 0; i < 2; i++) {
                const homeIndex = Math.floor(Math.random() * leagueTeams.length);
                let awayIndex;
                
                do {
                    awayIndex = Math.floor(Math.random() * leagueTeams.length);
                } while (homeIndex === awayIndex);
                
                const homeTeam = leagueTeams[homeIndex];
                const awayTeam = leagueTeams[awayIndex];
                
                // Set match date in the future
                const matchDate = new Date();
                matchDate.setDate(matchDate.getDate() + Math.floor(Math.random() * 14) + 1);
                
                this.matches.push({
                    id: `match-${this.matches.length + 1}`,
                    leagueId: leagueId,
                    league: this.leagues.find(l => l.id === leagueId).name,
                    homeTeam: homeTeam,
                    awayTeam: awayTeam,
                    date: matchDate.toISOString(),
                    status: 'scheduled',
                    venue: `${homeTeam.name} Stadium`
                });
            }
        }
        
        // Generate some past matches
        for (const leagueId in this.teams) {
            const leagueTeams = this.teams[leagueId];
            
            // Generate 2 past matches per league
            for (let i = 0; i < 2; i++) {
                const homeIndex = Math.floor(Math.random() * leagueTeams.length);
                let awayIndex;
                
                do {
                    awayIndex = Math.floor(Math.random() * leagueTeams.length);
                } while (homeIndex === awayIndex);
                
                const homeTeam = leagueTeams[homeIndex];
                const awayTeam = leagueTeams[awayIndex];
                
                // Set match date in the past
                const matchDate = new Date();
                matchDate.setDate(matchDate.getDate() - Math.floor(Math.random() * 10) - 1);
                
                // Generate random scores
                const homeScore = Math.floor(Math.random() * 4);
                const awayScore = Math.floor(Math.random() * 3);
                
                this.matches.push({
                    id: `match-${this.matches.length + 1}`,
                    leagueId: leagueId,
                    league: this.leagues.find(l => l.id === leagueId).name,
                    homeTeam: homeTeam,
                    awayTeam: awayTeam,
                    date: matchDate.toISOString(),
                    status: 'completed',
                    venue: `${homeTeam.name} Stadium`,
                    score: {
                        home: homeScore,
                        away: awayScore
                    }
                });
            }
        }
    }
    
    // Generate standings for a league
    generateStandings(teams) {
        return teams.map((team, index) => {
            const position = index + 1;
            const played = 10 + Math.floor(Math.random() * 10);
            const won = Math.floor(Math.random() * played);
            const drawn = Math.floor(Math.random() * (played - won));
            const lost = played - won - drawn;
            const goalsFor = won * 2 + drawn + Math.floor(Math.random() * 10);
            const goalsAgainst = lost * 2 + Math.floor(Math.random() * 8);
            const points = won * 3 + drawn;
            
            return {
                position,
                team: {
                    id: team.id,
                    name: team.name,
                    logo: team.logo
                },
                played,
                won,
                drawn,
                lost,
                goalsFor,
                goalsAgainst,
                goalDifference: goalsFor - goalsAgainst,
                points
            };
        }).sort((a, b) => {
            // Sort by points, then goal difference
            if (b.points !== a.points) {
                return b.points - a.points;
            }
            return b.goalDifference - a.goalDifference;
        }).map((item, index) => {
            // Update positions after sorting
            item.position = index + 1;
            return item;
        });
    }
    
    // Simulate API response delay
    async simulateDelay(minMs = 300, maxMs = 800) {
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        return new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Simulate network errors randomly
    shouldSimulateError() {
        // 5% chance of error
        return Math.random() < 0.05;
    }
    
    // API endpoint: Get all leagues
    async getLeagues() {
        await this.simulateDelay();
        
        if (this.shouldSimulateError()) {
            return {
                status: 'error',
                message: 'Failed to fetch leagues. Server error.'
            };
        }
        
        return {
            status: 'success',
            data: {
                leagues: this.leagues
            }
        };
    }
    
    // API endpoint: Get teams by league
    async getTeams(leagueId) {
        await this.simulateDelay();
        
        if (this.shouldSimulateError()) {
            return {
                status: 'error',
                message: 'Failed to fetch teams. Server error.'
            };
        }
        
        if (!this.teams[leagueId]) {
            return {
                status: 'error',
                message: 'League not found'
            };
        }
        
        return {
            status: 'success',
            data: {
                teams: this.teams[leagueId]
            }
        };
    }
    
    // API endpoint: Get standings by league
    async getStandings(leagueId) {
        await this.simulateDelay();
        
        if (this.shouldSimulateError()) {
            return {
                status: 'error',
                message: 'Failed to fetch standings. Server error.'
            };
        }
        
        if (!this.standings[leagueId]) {
            return {
                status: 'error',
                message: 'Standings not found for this league'
            };
        }
        
        return {
            status: 'success',
            data: {
                standings: this.standings[leagueId]
            }
        };
    }
    
    // API endpoint: Get all matches
    async getMatches() {
        await this.simulateDelay();
        
        if (this.shouldSimulateError()) {
            return {
                status: 'error',
                message: 'Failed to fetch matches. Server error.'
            };
        }
        
        return {
            status: 'success',
            data: {
                matches: this.matches
            }
        };
    }
    
    // API endpoint: Get match predictions
    async getPredictions(matchId, type = 'single') {
        await this.simulateDelay();
        
        if (this.shouldSimulateError()) {
            return {
                status: 'error',
                message: 'Failed to fetch predictions. Server error.'
            };
        }
        
        const match = this.matches.find(m => m.id === matchId);
        
        if (!match) {
            return {
                status: 'error',
                message: 'Match not found'
            };
        }
        
        // Generate different probabilities based on prediction type
        let homeWinProb, drawProb, awayWinProb;
        
        switch (type) {
            case 'form':
                homeWinProb = 35 + Math.floor(Math.random() * 30);
                drawProb = Math.floor(Math.random() * (100 - homeWinProb) / 2);
                awayWinProb = 100 - homeWinProb - drawProb;
                break;
            case 'historical':
                homeWinProb = 30 + Math.floor(Math.random() * 25);
                drawProb = 20 + Math.floor(Math.random() * 15);
                awayWinProb = 100 - homeWinProb - drawProb;
                break;
            case 'injuries':
                homeWinProb = 20 + Math.floor(Math.random() * 50);
                drawProb = Math.floor(Math.random() * 30);
                awayWinProb = 100 - homeWinProb - drawProb;
                break;
            case 'composite':
                homeWinProb = 40 + Math.floor(Math.random() * 20);
                drawProb = 15 + Math.floor(Math.random() * 15);
                awayWinProb = 100 - homeWinProb - drawProb;
                break;
            default: // single
                homeWinProb = Math.floor(Math.random() * 100);
                drawProb = Math.floor(Math.random() * (100 - homeWinProb));
                awayWinProb = 100 - homeWinProb - drawProb;
        }
        
        return {
            status: 'success',
            data: {
                matchId,
                type,
                probabilities: {
                    homeWin: homeWinProb,
                    draw: drawProb,
                    awayWin: awayWinProb
                },
                factors: type === 'composite' ? [
                    { name: 'Recent Form', weight: 0.3 },
                    { name: 'Head-to-Head', weight: 0.2 },
                    { name: 'Home Advantage', weight: 0.15 },
                    { name: 'Player Availability', weight: 0.25 },
                    { name: 'Tactical Analysis', weight: 0.1 }
                ] : null
            }
        };
    }
    
    // API endpoint: Get player stats by team
    async getPlayerStats(teamId) {
        await this.simulateDelay();
        
        if (this.shouldSimulateError()) {
            return {
                status: 'error',
                message: 'Failed to fetch player stats. Server error.'
            };
        }
        
        // Find the team
        let team = null;
        let leagueId = null;
        
        for (const lid in this.teams) {
            const teamFound = this.teams[lid].find(t => t.id === teamId);
            if (teamFound) {
                team = teamFound;
                leagueId = lid;
                break;
            }
        }
        
        if (!team) {
            return {
                status: 'error',
                message: 'Team not found'
            };
        }
        
        // Check if we already generated players for this team
        if (!this.players[teamId]) {
            // Generate player data for this team
            this.players[teamId] = this.generatePlayersForTeam(team, leagueId);
        }
        
        return {
            status: 'success',
            data: {
                players: this.players[teamId]
            }
        };
    }
    
    // Generate realistic player data for a team
    generatePlayersForTeam(team, leagueId) {
        const firstNames = [
            "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Charles",
            "Marcus", "Carlos", "Daniel", "Matthew", "Anthony", "Donald", "Mark", "Paul", "Steven", "George",
            "Kenneth", "Andrew", "Edward", "Brian", "Joshua", "Kevin", "Ronald", "Timothy", "Jason", "Jeffrey",
            "Frank", "Gary", "Ryan", "Nicholas", "Eric", "Stephen", "Jacob", "Larry", "Jonathan", "Scott",
            "Luis", "Sergio", "Juan", "Diego", "Miguel", "Raphael", "Gabriel", "Andres", "Jose", "Pedro",
            "Bruno", "Tiago", "Antonio", "Francesco", "Marco", "Luca", "Giovanni", "Mario", "Roberto", "Alessandro"
        ];
        
        const lastNames = [
            "Smith", "Johnson", "Williams", "Jones", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor",
            "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson",
            "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "Hernandez", "King",
            "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Baker", "Gonzalez", "Nelson", "Carter",
            "Sanchez", "Ramirez", "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards",
            "Silva", "Fernandez", "Rodriguez", "Torres", "Martin", "Gonzales", "Hernandez", "Diaz", "Morales", "Alvarez",
            "Rossi", "Ferrari", "Esposito", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo"
        ];
        
        const positions = [
            { name: "Goalkeeper", abbr: "GK", qty: 3 },
            { name: "Defender", abbr: "DEF", qty: 8 },
            { name: "Midfielder", abbr: "MID", qty: 8 },
            { name: "Forward", abbr: "FWD", qty: 5 }
        ];
        
        // Generate random number with preference toward higher skilled players for bigger teams
        const getSkillBias = (teamId) => {
            const topTeams = ['133615', '133600', '133602', '133739', '133932', '133657', '133670', '133702'];
            const bias = topTeams.includes(teamId) ? 20 : 0;
            return Math.floor(Math.random() * (85 - bias)) + bias;
        };
        
        const players = [];
        let playerCount = 0;
        
        // Create players for each position
        positions.forEach(position => {
            for (let i = 0; i < position.qty; i++) {
                playerCount++;
                const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
                const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
                const name = `${firstName} ${lastName}`;
                
                const baseSkill = getSkillBias(team.id);
                const skillVariance = Math.floor(Math.random() * 15) - 5; // -5 to +10 variance
                const rating = Math.min(Math.max(baseSkill + skillVariance, 50), 99) / 10; // Scale to 5.0-9.9
                
                const playerId = `${team.id}-player-${playerCount}`;
                
                // Generate position-specific stats
                let stats = {
                    rating: rating.toFixed(1),
                    games: 5 + Math.floor(Math.random() * 25),
                    minutes: 100 + Math.floor(Math.random() * 2000)
                };
                
                switch (position.name) {
                    case "Goalkeeper":
                        stats = {
                            ...stats,
                            cleanSheets: Math.floor(Math.random() * 15),
                            saves: 10 + Math.floor(Math.random() * 90),
                            goalsAgainst: Math.floor(Math.random() * 30),
                            assists: Math.floor(Math.random() * 2),
                            goals: Math.floor(Math.random() * 1)
                        };
                        break;
                    case "Defender":
                        stats = {
                            ...stats,
                            goals: Math.floor(Math.random() * 5),
                            assists: Math.floor(Math.random() * 7),
                            tackles: 10 + Math.floor(Math.random() * 90),
                            interceptions: 10 + Math.floor(Math.random() * 80),
                            blocks: 5 + Math.floor(Math.random() * 50),
                            clearances: 20 + Math.floor(Math.random() * 150)
                        };
                        break;
                    case "Midfielder":
                        stats = {
                            ...stats,
                            goals: Math.floor(Math.random() * 10),
                            assists: 2 + Math.floor(Math.random() * 15),
                            keyPasses: 10 + Math.floor(Math.random() * 90),
                            passSuccess: 70 + Math.floor(Math.random() * 25),
                            tackles: 5 + Math.floor(Math.random() * 70),
                            chances: 5 + Math.floor(Math.random() * 50)
                        };
                        break;
                    case "Forward":
                        stats = {
                            ...stats,
                            goals: 3 + Math.floor(Math.random() * 25),
                            assists: Math.floor(Math.random() * 12),
                            shots: 20 + Math.floor(Math.random() * 80),
                            shotsOnTarget: 10 + Math.floor(Math.random() * 40),
                            dribbles: 10 + Math.floor(Math.random() * 50),
                            chances: 5 + Math.floor(Math.random() * 40)
                        };
                        break;
                }
                
                players.push({
                    id: playerId,
                    name: name,
                    position: position.name,
                    positionAbbr: position.abbr,
                    nationality: ["England", "Spain", "Italy", "Germany", "France", "Brazil", "Argentina", "Portugal"][Math.floor(Math.random() * 8)],
                    age: 18 + Math.floor(Math.random() * 17),
                    height: 170 + Math.floor(Math.random() * 25),
                    weight: 65 + Math.floor(Math.random() * 25),
                    photo: `https://www.thesportsdb.com/images/media/player/thumb/player${Math.floor(Math.random() * 50) + 1}.jpg`,
                    stats: stats,
                    form: Array.from({ length: 5 }, () => (Math.random() * 3 + 6).toFixed(1))
                });
            }
        });
        
        return players;
    }
}

// Create and export a singleton instance
const mockAPI = new MockAPI();
export default mockAPI; 