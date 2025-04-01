/**
 * Toast notification system
 * Provides simple toast notifications for the dashboard
 */

class Toast {
    constructor(options = {}) {
        this.defaultOptions = {
            duration: 3000,
            position: 'bottom-right',
            maxToasts: 3,
            closeButton: true
        };
        
        this.options = { ...this.defaultOptions, ...options };
        this.toasts = [];
        this.container = null;
        
        this._initContainer();
    }
    
    /**
     * Initialize the toast container
     * @private
     */
    _initContainer() {
        // Check if container already exists
        let container = document.getElementById('toast-container');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = `toast-container ${this.options.position}`;
            document.body.appendChild(container);
        }
        
        this.container = container;
    }
    
    /**
     * Create a new toast element
     * @param {string} message - Message to display
     * @param {string} type - Type of toast (success, error, warning, info)
     * @param {number} duration - Duration in ms
     * @returns {HTMLElement} The created toast element
     * @private
     */
    _createToastElement(message, type, duration) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        
        let icon = '';
        switch (type) {
            case 'success':
                icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="toast-icon"><path fill="none" d="M0 0h24v24H0z"/><path d="M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z" fill="currentColor"/></svg>';
                break;
            case 'error':
                icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="toast-icon"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" fill="currentColor"/></svg>';
                break;
            case 'warning':
                icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="toast-icon"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" fill="currentColor"/></svg>';
                break;
            case 'info':
                icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="toast-icon"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" fill="currentColor"/></svg>';
                break;
        }
        
        let closeButton = '';
        if (this.options.closeButton) {
            closeButton = '<button class="toast-close" aria-label="Close toast">&times;</button>';
        }
        
        toast.innerHTML = `
            <div class="toast-content">
                ${icon}
                <div class="toast-message">${message}</div>
                ${closeButton}
            </div>
            <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
        `;
        
        // Add click event for close button
        if (this.options.closeButton) {
            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => {
                this.dismiss(toast);
            });
        }
        
        return toast;
    }
    
    /**
     * Show a toast notification
     * @param {string} message - Message to display
     * @param {string} type - Type of toast (success, error, warning, info)
     * @param {object} options - Custom options for this toast
     * @returns {HTMLElement} The created toast element
     */
    show(message, type = 'info', options = {}) {
        // Merge default options with custom options
        const toastOptions = { ...this.options, ...options };
        
        // Create toast element
        const toast = this._createToastElement(message, type, toastOptions.duration);
        
        // Manage maximum number of toasts
        if (this.toasts.length >= toastOptions.maxToasts) {
            this.dismiss(this.toasts[0].element);
        }
        
        // Add to DOM
        this.container.appendChild(toast);
        
        // Force reflow to enable animations
        toast.offsetHeight;
        
        // Activate the toast
        toast.classList.add('show');
        
        // Set up automatic dismissal
        const timeoutId = setTimeout(() => {
            this.dismiss(toast);
        }, toastOptions.duration);
        
        // Store toast reference
        this.toasts.push({
            element: toast,
            timeoutId: timeoutId
        });
        
        return toast;
    }
    
    /**
     * Dismiss a toast notification
     * @param {HTMLElement} toast - The toast element to dismiss
     */
    dismiss(toast) {
        // Find toast in array
        const index = this.toasts.findIndex(t => t.element === toast);
        
        if (index !== -1) {
            // Clear timeout
            clearTimeout(this.toasts[index].timeoutId);
            
            // Remove from array
            this.toasts.splice(index, 1);
        }
        
        // Animate out
        toast.classList.add('hiding');
        
        // Remove after animation
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }
    
    /**
     * Show a success toast
     * @param {string} message - Message to display
     * @param {object} options - Custom options for this toast
     * @returns {HTMLElement} The created toast element
     */
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }
    
    /**
     * Show an error toast
     * @param {string} message - Message to display
     * @param {object} options - Custom options for this toast
     * @returns {HTMLElement} The created toast element
     */
    error(message, options = {}) {
        return this.show(message, 'error', options);
    }
    
    /**
     * Show a warning toast
     * @param {string} message - Message to display
     * @param {object} options - Custom options for this toast
     * @returns {HTMLElement} The created toast element
     */
    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }
    
    /**
     * Show an info toast
     * @param {string} message - Message to display
     * @param {object} options - Custom options for this toast
     * @returns {HTMLElement} The created toast element
     */
    info(message, options = {}) {
        return this.show(message, 'info', options);
    }
}

// Create global toast instance
const toast = new Toast();

// Export for ES modules
export { Toast, toast };

// Export for global use
window.Toast = Toast;
window.toast = toast; 