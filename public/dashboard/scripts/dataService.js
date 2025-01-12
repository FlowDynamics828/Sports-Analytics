class DataService {
    static async fetchStats(league, team = '') {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/stats/${league}${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch stats');
            return await response.json();
        } catch (error) {
            console.error('Error fetching stats:', error);
            throw error;
        }
    }

    static async fetchGames(league, team = '') {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/games/${league}${team ? `?team=${team}` : ''}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch games');
            return await response.json();
        } catch (error) {
            console.error('Error fetching games:', error);
            throw error;
        }
    }

    static async fetchTeams(league) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/leagues/${league}/teams`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch teams');
            return await response.json();
        } catch (error) {
            console.error('Error fetching teams:', error);
            throw error;
        }
    }
}

window.DataService = DataService;