let selectedTeam = '';
let currentGames = [];
let ws;
let currentChart;

// Initialize auth check
function initAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token found, redirecting to login');
        window.location.replace('/login');
        return false;
    }

    // Verify token immediately
    verifyToken(token);
    setupAuthHeaders();
    return true;
}

// Verify token with backend
async function verifyToken(token) {
    try {
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Token verification failed');
        }

        const userData = await response.json();
        updateUserInfo(userData);
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.clear();
        window.location.replace('/login');
    }
}

// Update user information in the UI
function updateUserInfo(userData) {
    if (userData) {
        const welcomeName = document.getElementById('welcomeName');
        const userSubscription = document.getElementById('userSubscription');
        
        if (welcomeName) {
            welcomeName.textContent = userData.email.split('@')[0];
        }
        if (userSubscription) {
            userSubscription.textContent = userData.subscription;
        }
    }
}

// Setup auth headers for all fetch requests
function setupAuthHeaders() {
    const token = localStorage.getItem('token');
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options = {}) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        return originalFetch(url, options);
    };
}

// Handle logout
function logout() {
    localStorage.clear();
    window.location.replace('/login');
}

// Run authentication immediately
document.addEventListener('DOMContentLoaded', initAuth);