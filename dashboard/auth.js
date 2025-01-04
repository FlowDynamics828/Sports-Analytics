// Global variables
let selectedTeam = '';
let currentGames = [];
let ws;
let currentChart;

// Authentication check function
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No authentication token found');
        window.location.href = '/login';
        return;
    }

    fetch('/api/user/profile', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).catch(error => {
        console.error('Auth verification failed:', error);
        localStorage.clear();
        window.location.href = '/login';
    });
}

// Add authentication to all fetch requests
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    const token = localStorage.getItem('token');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    return originalFetch(url, options);
};

// Logout function
function logout() {
    localStorage.clear();
    window.location.href = '/login';
}

// Run authentication check when page loads
checkAuth();