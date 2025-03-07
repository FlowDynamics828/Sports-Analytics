export class NavigationManager {
    constructor() {
        this.currentLeague = 'nba';
        this.leagues = {
            basketball: {
                name: 'Basketball',
                leagues: {
                    nba: 'NBA',
                    euroleague: 'EuroLeague',
                    fiba: 'FIBA World Cup',
                    wnba: 'WNBA',
                    nbl: 'Australian NBL'
                }
            },
            football: {
                name: 'Football',
                leagues: {
                    nfl: 'NFL',
                    ncaaf: 'NCAA Football',
                    cfl: 'Canadian Football',
                    xfl: 'XFL'
                }
            },
            baseball: {
                name: 'Baseball',
                leagues: {
                    mlb: 'MLB',
                    npb: 'Nippon Baseball',
                    kbo: 'Korean Baseball',
                    milb: 'Minor League Baseball'
                }
            },
            hockey: {
                name: 'Hockey',
                leagues: {
                    nhl: 'NHL',
                    khl: 'Kontinental Hockey League',
                    shl: 'Swedish Hockey League',
                    ahl: 'American Hockey League'
                }
            },
            soccer: {
                name: 'Soccer',
                leagues: {
                    premierleague: 'Premier League',
                    laliga: 'La Liga',
                    bundesliga: 'Bundesliga',
                    seriea: 'Serie A',
                    ligue1: 'Ligue 1',
                    mls: 'MLS',
                    ligamx: 'Liga MX',
                    eredivisie: 'Eredivisie',
                    primeiraliga: 'Primeira Liga',
                    champions: 'Champions League',
                    europa: 'Europa League',
                    libertadores: 'Copa Libertadores'
                }
            },
            basketball_international: {
                name: 'International Basketball',
                leagues: {
                    acb: 'Spanish ACB',
                    lnb: 'French LNB',
                    lega: 'Italian Lega Basket',
                    bbl: 'British Basketball',
                    vtb: 'VTB United League'
                }
            },
            cricket: {
                name: 'Cricket',
                leagues: {
                    ipl: 'Indian Premier League',
                    bbl_cricket: 'Big Bash League',
                    cpl: 'Caribbean Premier League',
                    psl: 'Pakistan Super League'
                }
            },
            rugby: {
                name: 'Rugby',
                leagues: {
                    premiership: 'Premiership Rugby',
                    top14: 'Top 14',
                    super_rugby: 'Super Rugby',
                    pro14: 'United Rugby Championship'
                }
            }
        };

        this.initializeUI();
        this.initializeEventListeners();
    }

    initializeUI() {
        // Create main navigation bar
        const navContainer = document.querySelector('.nav-container');
        if (!navContainer) return;

        // Create primary sports tabs
        const primaryNav = document.createElement('div');
        primaryNav.className = 'flex space-x-1 bg-gray-800 p-2 rounded-lg';
        
        // Add major leagues as primary tabs
        const majorLeagues = ['nba', 'nfl', 'mlb', 'nhl', 'premierleague'];
        majorLeagues.forEach(league => {
            const button = document.createElement('button');
            button.className = 'px-4 py-2 text-white hover:bg-gray-700 rounded-lg transition-colors';
            button.dataset.league = league;
            button.textContent = this.getLeagueName(league);
            primaryNav.appendChild(button);
        });

        // Create sports dropdown
        const sportsDropdown = this.createSportsDropdown();
        primaryNav.appendChild(sportsDropdown);

        navContainer.appendChild(primaryNav);
    }

    createSportsDropdown() {
        const container = document.createElement('div');
        container.className = 'relative';

        const button = document.createElement('button');
        button.id = 'moreSportsBtn';
        button.className = 'px-4 py-2 text-white hover:bg-gray-700 rounded-lg transition-colors flex items-center';
        button.innerHTML = `More Sports <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>`;

        const dropdown = document.createElement('div');
        dropdown.id = 'sportsDropdown';
        dropdown.className = 'hidden absolute top-full left-0 mt-1 bg-gray-800 rounded-lg shadow-xl py-2 w-64 z-50';

        // Add all sports and leagues
        Object.entries(this.leagues).forEach(([sportKey, sport]) => {
            const sportSection = document.createElement('div');
            sportSection.className = 'px-4 py-2';

            const sportHeader = document.createElement('div');
            sportHeader.className = 'font-bold text-white mb-2';
            sportHeader.textContent = sport.name;
            sportSection.appendChild(sportHeader);

            Object.entries(sport.leagues).forEach(([leagueKey, leagueName]) => {
                const leagueButton = document.createElement('button');
                leagueButton.className = 'w-full text-left px-2 py-1 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors';
                leagueButton.dataset.league = leagueKey;
                leagueButton.textContent = leagueName;
                sportSection.appendChild(leagueButton);
            });

            dropdown.appendChild(sportSection);
        });

        container.appendChild(button);
        container.appendChild(dropdown);
        return container;
    }

    initializeEventListeners() {
        // League selection
        document.addEventListener('click', (e) => {
            const leagueButton = e.target.closest('[data-league]');
            if (leagueButton) {
                this.handleLeagueChange(leagueButton.dataset.league);
                this.highlightActiveLeague(leagueButton);
            }
        });

        // Dropdown handling
        const moreSportsBtn = document.getElementById('moreSportsBtn');
        const sportsDropdown = document.getElementById('sportsDropdown');
        
        if (moreSportsBtn && sportsDropdown) {
            moreSportsBtn.addEventListener('click', () => {
                sportsDropdown.classList.toggle('hidden');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#moreSportsBtn') && !e.target.closest('#sportsDropdown')) {
                    sportsDropdown.classList.add('hidden');
                }
            });
        }

        // Team select handling
        const teamSelect = document.getElementById('teamSelect');
        if (teamSelect) {
            teamSelect.addEventListener('change', (e) => {
                this.handleTeamChange(e.target.value);
            });
        }
    }

    async handleLeagueChange(league) {
        this.currentLeague = league;
        try {
            await this.loadTeams(league);
            // Dispatch event for dashboard update
            window.dispatchEvent(new CustomEvent('leagueChange', { 
                detail: { 
                    league,
                    leagueName: this.getLeagueName(league)
                }
            }));
        } catch (error) {
            console.error('Error changing league:', error);
        }
    }

    highlightActiveLeague(activeButton) {
        document.querySelectorAll('[data-league]').forEach(button => {
            button.classList.remove('bg-gray-700');
        });
        activeButton.classList.add('bg-gray-700');
    }

    async loadTeams(league) {
        try {
            const response = await fetch(`/api/leagues/${league}/teams`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) throw new Error('Failed to fetch teams');
            
            const teams = await response.json();
            this.updateTeamSelect(teams);
            return teams;
        } catch (error) {
            console.error('Error loading teams:', error);
            throw error;
        }
    }

    updateTeamSelect(teams) {
        const teamSelect = document.getElementById('teamSelect');
        if (!teamSelect) return;

        teamSelect.innerHTML = '<option value="">All Teams</option>' +
            teams.map(team => `
                <option value="${team.id}">${team.name}</option>
            `).join('');
    }

    handleTeamChange(teamId) {
        window.dispatchEvent(new CustomEvent('teamChange', { 
            detail: { 
                teamId,
                league: this.currentLeague
            }
        }));
    }

    getLeagueName(leagueKey) {
        for (const sport of Object.values(this.leagues)) {
            if (sport.leagues[leagueKey]) {
                return sport.leagues[leagueKey];
            }
        }
        return leagueKey.toUpperCase();
    }
}

// Initialize navigation
const navigationManager = new NavigationManager();
export default navigationManager;