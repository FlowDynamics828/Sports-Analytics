// Check if user is authenticated
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        return false;
    }
    return true;
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!checkAuth()) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Handle login form submission
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorMessage = document.getElementById('errorMessage');

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();
                
                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('userEmail', data.user.email);
                    localStorage.setItem('userSubscription', data.user.subscription);
                    window.location.href = '/dashboard';
                } else {
                    errorMessage.textContent = data.error || 'Login failed';
                    errorMessage.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Login error:', error);
                errorMessage.textContent = 'Connection error. Please try again.';
                errorMessage.classList.remove('hidden');
            }
        });
    }

    // Handle logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    await fetch('/api/auth/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                }
                
                localStorage.clear();
                window.location.href = '/login';
            } catch (error) {
                console.error('Logout error:', error);
                localStorage.clear();
                window.location.href = '/login';
            }
        });
    }

    // Check authentication on protected pages
    if (window.location.pathname.startsWith('/dashboard')) {
        if (!requireAuth()) {
            return;
        }
    }
});