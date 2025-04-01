// scripts/auth.js - Simplified authentication script for login/signup pages
// This file should be included in login.html and signup.html

document.addEventListener('DOMContentLoaded', () => {
    // Initialize login form handling if it exists
    initLoginForm();
    
    // Initialize signup form handling if it exists
    initSignupForm();
    
    // Handle logout button
    initLogoutButton();
    
    // Check if we need to perform auth verification
    checkRequiredAuth();
    
    // Update UI for authenticated state
    updateAuthUI();
});

/**
 * Initialize login form handling
 */
function initLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get form fields
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');
        
        // Reset error message
        if (errorMessage) {
            errorMessage.classList.add('hidden');
        }
        
        // Simple validation
        if (!email || !password) {
            showError(errorMessage, 'Please enter both email and password');
            return;
        }
        
        // Update UI to loading state
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        setButtonLoading(submitButton, 'Signing in...');
        
        try {
            // Make login request
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Store auth data
                localStorage.setItem('token', data.token);
                
                // Store user data if available
                if (data.user) {
                    localStorage.setItem('userEmail', data.user.email);
                    if (data.user.subscription) {
                        localStorage.setItem('userSubscription', data.user.subscription);
                    }
                }
                
                // Check for redirect parameter
                const urlParams = new URLSearchParams(window.location.search);
                const redirectTo = urlParams.get('return_to') || '/dashboard';
                
                // Redirect to destination
                window.location.href = redirectTo;
            } else {
                // Show error message
                showError(errorMessage, data.error || 'Login failed');
                
                // Reset button
                setButtonLoading(submitButton, originalButtonText, false);
            }
        } catch (error) {
            console.error('Login error:', error);
            showError(errorMessage, 'Connection error. Please try again.');
            setButtonLoading(submitButton, originalButtonText, false);
        }
    });
}

/**
 * Initialize signup form handling
 */
function initSignupForm() {
    const signupForm = document.getElementById('signupForm');
    if (!signupForm) return;
    
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get form fields
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');
        
        // Reset error message
        if (errorMessage) {
            errorMessage.classList.add('hidden');
        }
        
        // Simple validation
        if (!email || !password) {
            showError(errorMessage, 'Please enter both email and password');
            return;
        }
        
        if (password.length < 8) {
            showError(errorMessage, 'Password must be at least 8 characters');
            return;
        }
        
        // Update UI to loading state
        const submitButton = signupForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        setButtonLoading(submitButton, 'Creating account...');
        
        try {
            // Determine subscription plan if selected
            const subscriptionRadios = document.querySelectorAll('input[name="subscription"]');
            let selectedPlan = null;
            let priceId = null;
            
            subscriptionRadios.forEach(radio => {
                if (radio.checked) {
                    selectedPlan = radio.value;
                    priceId = radio.dataset.price;
                }
            });
            
            // Make signup request
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    email, 
                    password,
                    subscription: selectedPlan,
                    priceId
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Store auth data
                localStorage.setItem('token', data.token);
                
                // Store user data if available
                if (data.user) {
                    localStorage.setItem('userEmail', data.user.email);
                    if (data.user.subscription) {
                        localStorage.setItem('userSubscription', data.user.subscription);
                    }
                }
                
                // Redirect to dashboard
                window.location.href = '/dashboard';
            } else {
                // Show error message
                showError(errorMessage, data.error || 'Signup failed');
                
                // Reset button
                setButtonLoading(submitButton, originalButtonText, false);
            }
        } catch (error) {
            console.error('Signup error:', error);
            showError(errorMessage, 'Connection error. Please try again.');
            setButtonLoading(submitButton, originalButtonText, false);
        }
    });
}

/**
 * Initialize logout button
 */
function initLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        try {
            // Attempt to notify server about logout
            const token = localStorage.getItem('token');
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }).catch(() => {
                    // Ignore errors during logout request
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear auth data
            localStorage.removeItem('token');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userSubscription');
            
            // Redirect to login
            window.location.href = '/login';
        }
    });
}

/**
 * Check if page requires authentication and redirect if needed
 */
function checkRequiredAuth() {
    const requiresAuth = document.body.hasAttribute('data-requires-auth');
    if (!requiresAuth) return;
    
    const token = localStorage.getItem('token');
    if (!token) {
        // Redirect to login with return URL
        const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?return_to=${currentUrl}`;
    }
}

/**
 * Update UI elements based on authentication state
 */
function updateAuthUI() {
    const token = localStorage.getItem('token');
    const isAuthenticated = !!token;
    
    // Update login/logout buttons
    const loginButtons = document.querySelectorAll('[data-auth="login"]');
    const logoutButtons = document.querySelectorAll('[data-auth="logout"]');
    const authOnlyElements = document.querySelectorAll('[data-auth="required"]');
    const guestOnlyElements = document.querySelectorAll('[data-auth="guest-only"]');
    const userNameElements = document.querySelectorAll('[data-auth="username"]');
    
    if (isAuthenticated) {
        // Show elements for authenticated users
        loginButtons.forEach(el => el.classList.add('hidden'));
        logoutButtons.forEach(el => el.classList.remove('hidden'));
        authOnlyElements.forEach(el => el.classList.remove('hidden'));
        guestOnlyElements.forEach(el => el.classList.add('hidden'));
        
        // Update username displays
        const email = localStorage.getItem('userEmail');
        if (email && userNameElements.length) {
            const displayName = email.split('@')[0];
            userNameElements.forEach(el => {
                el.textContent = displayName;
            });
        }
    } else {
        // Show elements for guests
        loginButtons.forEach(el => el.classList.remove('hidden'));
        logoutButtons.forEach(el => el.classList.add('hidden'));
        authOnlyElements.forEach(el => el.classList.add('hidden'));
        guestOnlyElements.forEach(el => el.classList.remove('hidden'));
    }
}

/**
 * Show error message
 * @param {HTMLElement} element - Error message element
 * @param {string} message - Error message text
 */
function showError(element, message) {
    if (!element) return;
    
    element.textContent = message;
    element.classList.remove('hidden');
    
    // Add shake animation
    element.classList.add('animate-shake');
    setTimeout(() => {
        element.classList.remove('animate-shake');
    }, 500);
}

/**
 * Set button loading state
 * @param {HTMLElement} button - Button element
 * @param {string} text - Button text while loading
 * @param {boolean} isLoading - Whether button is in loading state
 */
function setButtonLoading(button, text, isLoading = true) {
    if (!button) return;
    
    button.textContent = text;
    button.disabled = isLoading;
    
    if (isLoading) {
        button.classList.add('opacity-75');
    } else {
        button.classList.remove('opacity-75');
    }
}