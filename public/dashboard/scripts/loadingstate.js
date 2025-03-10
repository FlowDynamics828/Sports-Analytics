// Loading State Manager for Sports Analytics Dashboard
class LoadingStateManager {
    constructor() {
        this.loadingElements = new Map();
        this.globalLoadingElement = null;
        this.activeLoadingStates = new Set();
    }

    /**
     * Shows a loading indicator for a specific element
     * @param {string} elementId - The ID of the element to show loading for
     * @param {string} message - Optional loading message
     */
    show(elementId, message = 'Loading...') {
        if (elementId === 'global') {
            this.showGlobalLoading(message);
            return;
        }

        const element = document.getElementById(elementId);
        if (!element) return;

        // Save original content if not already saved
        if (!this.loadingElements.has(elementId)) {
            this.loadingElements.set(elementId, {
                originalContent: element.innerHTML,
                originalPosition: element.style.position
            });
        }

        // Add loading state to active set
        this.activeLoadingStates.add(elementId);

        // Apply loading overlay
        element.style.position = 'relative';
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay absolute inset-0 bg-gray-900/50 flex items-center justify-center z-10';
        loadingOverlay.innerHTML = `
            <div class="bg-gray-800 p-6 rounded-lg shadow-lg text-center">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
                <p class="mt-3 text-white">${message}</p>
            </div>
        `;

        // Add a unique ID for this loading overlay
        loadingOverlay.id = `loading-overlay-${elementId}`;
        
        // Remove any existing loading overlay
        const existingOverlay = element.querySelector(`#loading-overlay-${elementId}`);
        if (existingOverlay) {
            element.removeChild(existingOverlay);
        }
        
        element.appendChild(loadingOverlay);
    }

    /**
     * Hides the loading indicator for a specific element
     * @param {string} elementId - The ID of the element to hide loading for
     */
    hide(elementId) {
        if (elementId === 'global') {
            this.hideGlobalLoading();
            return;
        }

        const element = document.getElementById(elementId);
        if (!element) return;

        // Remove loading state from active set
        this.activeLoadingStates.delete(elementId);

        // Find and remove loading overlay
        const loadingOverlay = element.querySelector(`#loading-overlay-${elementId}`);
        if (loadingOverlay) {
            // Add fade-out animation
            loadingOverlay.classList.add('transition-opacity', 'duration-300', 'opacity-0');
            
            // Remove after animation
            setTimeout(() => {
                if (element.contains(loadingOverlay)) {
                    element.removeChild(loadingOverlay);
                }
            }, 300);
        }

        // Restore original position
        const originalData = this.loadingElements.get(elementId);
        if (originalData) {
            element.style.position = originalData.originalPosition;
        }
    }

    /**
     * Shows a global loading overlay
     * @param {string} message - Loading message to display
     */
    showGlobalLoading(message = 'Loading...') {
        // Check if global loading overlay already exists
        if (this.globalLoadingElement) {
            this.updateGlobalLoadingMessage(message);
            return;
        }

        // Add loading state to active set
        this.activeLoadingStates.add('global');

        // Create global loading overlay
        const overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.className = 'fixed inset-0 bg-gray-900/70 flex items-center justify-center z-50 transition-opacity duration-300';
        overlay.innerHTML = `
            <div class="bg-gray-800 p-8 rounded-lg shadow-lg text-center max-w-md">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p id="global-loading-message" class="mt-4 text-white">${message}</p>
            </div>
        `;

        document.body.appendChild(overlay);
        this.globalLoadingElement = overlay;

        // Prevent scrolling while loading overlay is active
        document.body.style.overflow = 'hidden';
    }

    /**
     * Updates the message in the global loading overlay
     * @param {string} message - New loading message
     */
    updateGlobalLoadingMessage(message) {
        if (!this.globalLoadingElement) return;
        
        const messageElement = document.getElementById('global-loading-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    /**
     * Hides the global loading overlay
     */
    hideGlobalLoading() {
        if (!this.globalLoadingElement) return;

        // Remove loading state from active set
        this.activeLoadingStates.delete('global');

        // Add fade-out animation
        this.globalLoadingElement.classList.add('opacity-0');
        
        // Remove after animation
        setTimeout(() => {
            if (document.body.contains(this.globalLoadingElement)) {
                document.body.removeChild(this.globalLoadingElement);
            }
            this.globalLoadingElement = null;
            
            // Restore scrolling
            document.body.style.overflow = '';
        }, 300);
    }

    /**
     * Reset a specific element back to its original state
     * @param {string} elementId - The ID of the element to reset
     */
    reset(elementId) {
        if (elementId === 'global') {
            this.hideGlobalLoading();
            return;
        }

        const element = document.getElementById(elementId);
        if (!element) return;

        const originalData = this.loadingElements.get(elementId);
        if (originalData) {
            element.innerHTML = originalData.originalContent;
            element.style.position = originalData.originalPosition;
            this.loadingElements.delete(elementId);
        }

        // Remove from active loading states
        this.activeLoadingStates.delete(elementId);
    }

    /**
     * Reset all elements back to original state
     */
    resetAll() {
        // Create a copy of the set to avoid modification during iteration
        const activeStates = [...this.activeLoadingStates];
        activeStates.forEach(elementId => this.reset(elementId));
        
        this.hideGlobalLoading();
        this.loadingElements.clear();
        this.activeLoadingStates.clear();
    }

    /**
     * Check if any loading state is active
     * @returns {boolean} True if any loading state is active
     */
    isLoading() {
        return this.activeLoadingStates.size > 0;
    }
}

// Export singleton instance
const LoadingState = new LoadingStateManager();
export default LoadingState;