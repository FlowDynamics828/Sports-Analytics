// Toast Notification Service for Sports Analytics Dashboard
class ToastService {
    constructor() {
        this.createContainer();
        this.queue = [];
        this.isProcessing = false;
        this.maxVisible = 3;
        this.visibleToasts = 0;
    }

    createContainer() {
        // Check if container already exists
        if (document.getElementById('toast-container')) return;
        
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-4 right-4 z-50 space-y-2 flex flex-col items-end';
        document.body.appendChild(container);
    }

    show(message, type = 'info', duration = 3000) {
        // Add to queue
        this.queue.push({ message, type, duration });
        
        // Start processing if not already
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    processQueue() {
        if (this.queue.length === 0 || this.visibleToasts >= this.maxVisible) {
            this.isProcessing = false;
            return;
        }
        
        this.isProcessing = true;
        
        // Get next toast from queue
        const { message, type, duration } = this.queue.shift();
        
        // Create and show toast
        this.createToast(message, type, duration);
        
        // Continue processing
        if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 250);
        } else {
            this.isProcessing = false;
        }
    }

    createToast(message, type, duration) {
        const container = document.getElementById('toast-container');
        if (!container) {
            this.createContainer();
        }
        
        // Create toast element
        const toast = document.createElement('div');
        
        // Set appearance based on type
        const bgColor = this.getTypeColor(type);
        toast.className = `${bgColor} text-white px-4 py-3 rounded shadow-lg transform transition-all duration-300 opacity-0 translate-x-4 max-w-md`;
        
        // Create toast content
        toast.innerHTML = `
            <div class="flex items-center">
                ${this.getTypeIcon(type)}
                <span class="ml-2">${message}</span>
            </div>
        `;
        
        // Add to container
        container.appendChild(toast);
        this.visibleToasts++;
        
        // Animate in
        setTimeout(() => {
            toast.classList.remove('opacity-0', 'translate-x-4');
        }, 10);
        
        // Set timeout to remove
        setTimeout(() => {
            // Animate out
            toast.classList.add('opacity-0', 'translate-x-4');
            
            // Remove after animation completes
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                    this.visibleToasts--;
                    
                    // Check if we can process more toasts
                    if (this.visibleToasts < this.maxVisible && this.queue.length > 0) {
                        this.processQueue();
                    }
                }
            }, 300);
        }, duration);
    }

    getTypeColor(type) {
        switch (type.toLowerCase()) {
            case 'success':
                return 'bg-green-500';
            case 'error':
                return 'bg-red-500';
            case 'warning':
                return 'bg-yellow-500';
            case 'info':
            default:
                return 'bg-blue-500';
        }
    }

    getTypeIcon(type) {
        switch (type.toLowerCase()) {
            case 'success':
                return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>`;
            case 'error':
                return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>`;
            case 'warning':
                return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>`;
            case 'info':
            default:
                return `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>`;
        }
    }

    // Clear all toasts
    clear() {
        const container = document.getElementById('toast-container');
        if (container) {
            container.innerHTML = '';
            this.visibleToasts = 0;
        }
        this.queue = [];
        this.isProcessing = false;
    }
}

// Export singleton instance
const Toast = new ToastService();
export default Toast;