// Toast notification utility
export class Toast {
    constructor(containerId = 'toast-container') {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.defaultDuration = 5000; // 5 seconds
        
        // Create container if it doesn't exist
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = this.containerId;
            this.container.className = 'fixed top-4 right-4 z-50 space-y-2';
            document.body.appendChild(this.container);
        }
    }
    
    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of notification (success, error, warning, info)
     * @param {number} duration - Duration in milliseconds
     */
    show(message, type = 'info', duration = this.defaultDuration) {
        if (!this.container) return;
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `flex items-center p-4 mb-2 rounded-lg shadow-lg transform transition-all duration-300 ease-in-out translate-x-full opacity-0 ${this.getTypeStyles(type)}`;
        
        // Toast content
        toast.innerHTML = `
            ${this.getTypeIcon(type)}
            <div class="ml-3 mr-4 flex-1">
                <p class="text-sm font-medium">${message}</p>
            </div>
            <button class="text-gray-400 hover:text-white transition-colors ml-auto" aria-label="Close">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        `;
        
        // Add close button functionality
        const closeButton = toast.querySelector('button');
        closeButton.addEventListener('click', () => {
            this.dismissToast(toast);
        });
        
        // Add to container
        this.container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        }, 10);
        
        // Auto dismiss after duration
        if (duration > 0) {
            setTimeout(() => {
                this.dismissToast(toast);
            }, duration);
        }
        
        return toast;
    }
    
    /**
     * Show a success toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    success(message, duration = this.defaultDuration) {
        return this.show(message, 'success', duration);
    }
    
    /**
     * Show an error toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    error(message, duration = this.defaultDuration) {
        return this.show(message, 'error', duration);
    }
    
    /**
     * Show a warning toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    warning(message, duration = this.defaultDuration) {
        return this.show(message, 'warning', duration);
    }
    
    /**
     * Show an info toast
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds
     */
    info(message, duration = this.defaultDuration) {
        return this.show(message, 'info', duration);
    }
    
    /**
     * Dismiss a toast notification
     * @param {HTMLElement} toast - The toast element to dismiss
     */
    dismissToast(toast) {
        if (!toast) return;
        
        // Add exit animation
        toast.classList.add('opacity-0', '-translate-y-2');
        
        // Remove after animation completes
        setTimeout(() => {
            toast.remove();
        }, 300);
    }
    
    /**
     * Get the appropriate styling for the toast type
     * @param {string} type - The type of toast
     * @returns {string} CSS classes
     */
    getTypeStyles(type) {
        switch (type) {
            case 'success':
                return 'bg-green-800 text-white';
            case 'error':
                return 'bg-red-800 text-white';
            case 'warning':
                return 'bg-yellow-800 text-white';
            case 'info':
            default:
                return 'bg-blue-800 text-white';
        }
    }
    
    /**
     * Get the appropriate icon for the toast type
     * @param {string} type - The type of toast
     * @returns {string} HTML for the icon
     */
    getTypeIcon(type) {
        switch (type) {
            case 'success':
                return `
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                `;
            case 'error':
                return `
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </div>
                `;
            case 'warning':
                return `
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                    </div>
                `;
            case 'info':
            default:
                return `
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                `;
        }
    }
    
    /**
     * Clear all toast notifications
     */
    clearAll() {
        if (!this.container) return;
        
        const toasts = this.container.querySelectorAll('div');
        toasts.forEach(toast => {
            this.dismissToast(toast);
        });
    }
}

// Create a singleton instance
export const toast = new Toast();
export default toast; 