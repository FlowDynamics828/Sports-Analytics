// Advanced Login Management System
// Production Version 4.1
import Auth from './auth.js';
import { Toast } from './toast.js';
import { LoadingState } from './loadingstate.js';
import { SecurityManager } from './security.js';

class LoginManager {
    constructor() {
        this.form = null;
        this.emailInput = null;
        this.passwordInput = null;
        this.submitButton = null;
        this.errorMessage = null;
        this.loadingOverlay = null;
        this.submitSpinner = null;
        this.togglePasswordBtn = null;
        this.isProcessing = false;
        this.auth = null;
        this.security = null;
        this.maxRetryAttempts = 3;
        this.retryDelay = 1000;
    }

    async initialize() {
        try {
            // Initialize core components
            this.security = new SecurityManager();
            this.auth = new Auth(this.security);
            await this.auth.initialize();

            // Clear any existing sessions
            await this.security.clearSecureStorage();

            // Initialize DOM elements
            this.initializeElements();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Attempt session recovery
            await this.attemptSessionRecovery();

            // Setup automatic token refresh
            this.setupTokenRefresh();

        } catch (error) {
            console.error('Login initialization failed:', error);
            this.showError('System initialization failed. Please refresh the page.');
        }
    }

    initializeElements() {
        this.form = document.getElementById('loginForm');
        this.emailInput = document.getElementById('emailInput');
        this.passwordInput = document.getElementById('passwordInput');
        this.submitButton = document.getElementById('submitButton');
        this.errorMessage = document.getElementById('errorMessage');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.submitSpinner = document.getElementById('submitSpinner');
        this.togglePasswordBtn = document.getElementById('togglePassword');

        if (!this.form || !this.emailInput || !this.passwordInput || !this.submitButton) {
            throw new Error('Required login elements not found');
        }
    }

    setupEventListeners() {
        // Form submission
        this.form.addEventListener('submit', this.handleSubmit.bind(this));

        // Real-time email validation
        this.emailInput.addEventListener('input', this.handleEmailValidation.bind(this));

        // Password visibility toggle
        if (this.togglePasswordBtn) {
            this.togglePasswordBtn.addEventListener('click', this.togglePasswordVisibility.bind(this));
        }

        // Enter key handling
        this.form.addEventListener('keydown', this.handleKeyPress.bind(this));
    }

    async handleSubmit(e) {
        e.preventDefault();
        if (this.isProcessing) return;

        try {
            if (!this.validateForm()) return;

            this.setLoadingState(true);
            
            const loginData = {
                email: this.emailInput.value.trim(),
                password: this.passwordInput.value,
                deviceInfo: await this.security.getDeviceInfo()
            };

            const result = await this.performLogin(loginData);
            
            if (result.success) {
                this.handleSuccessfulLogin(result);
            } else {
                throw new Error(result.error || 'Login failed');
            }
        } catch (error) {
            await this.handleLoginError(error);
        } finally {
            this.setLoadingState(false);
        }
    }

    async performLogin(loginData, attempt = 1) {
        try {
            const hashedPassword = await this.security.hashPassword(loginData.password);
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-Info': JSON.stringify(loginData.deviceInfo),
                    'X-Request-ID': this.security.generateRequestId()
                },
                body: JSON.stringify({
                    email: loginData.email,
                    password: hashedPassword
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429 && attempt < this.maxRetryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                    return this.performLogin(loginData, attempt + 1);
                }
                throw new Error(data.error || 'Authentication failed');
            }

            return { success: true, data };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    validateForm() {
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;
        
        if (!email || !password) {
            this.showError('Please enter both email and password');
            return false;
        }

        if (!this.validateEmail(email)) {
            this.showError('Please enter a valid email address');
            return false;
        }

        if (!this.validatePassword(password)) {
            this.showError('Password must be at least 8 characters');
            return false;
        }

        return true;
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    validatePassword(password) {
        return password.length >= 8;
    }

    setLoadingState(isLoading) {
        this.isProcessing = isLoading;
        this.submitButton.disabled = isLoading;
        this.submitSpinner.classList.toggle('hidden', !isLoading);
        this.loadingOverlay.classList.toggle('hidden', !isLoading);
        
        if (isLoading) {
            this.loadingOverlay.querySelector('#loadingMessage').textContent = 'Authenticating...';
        }
    }

    async handleLoginError(error) {
        console.error('Login error:', error);
        this.showError(error.message || 'Login failed. Please try again.');
        
        if (error.message.includes('network') || error.message.includes('connection')) {
            Toast.show('Connection error. Please check your internet connection.', 'error');
        }
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.remove('hidden');
        
        // Shake animation
        this.errorMessage.animate(
            [
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(0)' }
            ],
            { duration: 500, iterations: 1 }
        );
    }

    handleSuccessfulLogin(result) {
        // Store authentication data securely
        this.security.setSecureItem('auth_token', result.data.token);
        this.security.setSecureItem('user_data', JSON.stringify(result.data.user));
        
        Toast.show('Login successful', 'success');
        
        // Delayed redirect for smooth animation
        setTimeout(() => {
            window.location.replace('/dashboard');
        }, 300);
    }

    setupTokenRefresh() {
        const refreshInterval = 15 * 60 * 1000; // 15 minutes
        setInterval(async () => {
            const token = await this.security.getSecureItem('auth_token');
            if (token) {
                try {
                    await this.auth.refreshToken(token);
                } catch (error) {
                    console.error('Token refresh failed:', error);
                }
            }
        }, refreshInterval);
    }

    async attemptSessionRecovery() {
        try {
            const savedToken = await this.security.getSecureItem('auth_token');
            if (savedToken) {
                const isValid = await this.auth.validateToken(savedToken);
                if (isValid) {
                    window.location.replace('/dashboard');
                }
            }
        } catch (error) {
            console.error('Session recovery failed:', error);
            await this.security.clearSecureStorage();
        }
    }

    handleEmailValidation() {
        const isValid = this.validateEmail(this.emailInput.value);
        document.getElementById('emailValidIcon').style.opacity = isValid ? '1' : '0';
        document.getElementById('emailError').textContent = isValid ? '' : 'Please enter a valid email address';
        document.getElementById('emailError').classList.toggle('hidden', isValid);
    }

    togglePasswordVisibility() {
        const newType = this.passwordInput.type === 'password' ? 'text' : 'password';
        this.passwordInput.type = newType;
        this.updatePasswordToggleIcon(newType);
    }

    updatePasswordToggleIcon(type) {
        this.togglePasswordBtn.innerHTML = type === 'password' ? 
            this.getVisibleIcon() : 
            this.getHiddenIcon();
    }

    handleKeyPress(e) {
        if (e.key === 'Enter' && !this.isProcessing) {
            e.preventDefault();
            this.submitButton.click();
        }
    }

    getVisibleIcon() {
        return `<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>`;
    }

    getHiddenIcon() {
        return `<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>`;
    }
}

// Initialize login manager when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const loginManager = new LoginManager();
    await loginManager.initialize();
});