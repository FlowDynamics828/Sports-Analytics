class ErrorBoundary {
    constructor(targetElement) {
        this.targetElement = targetElement;
        this.originalContent = targetElement.innerHTML;
    }

    static catchError(error, errorInfo) {
        console.error('Dashboard Error:', error);
        
        const errorMessage = `
            <div class="bg-red-500/10 border border-red-500 rounded-lg p-4 m-4">
                <h3 class="text-red-500 font-bold mb-2">Something went wrong</h3>
                <p class="text-gray-300">${error.message}</p>
                <button onclick="window.location.reload()" 
                        class="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">
                    Refresh Page
                </button>
            </div>
        `;

        return errorMessage;
    }

    wrap(callback) {
        try {
            return callback();
        } catch (error) {
            this.targetElement.innerHTML = ErrorBoundary.catchError(error);
        }
    }

    async wrapAsync(callback) {
        try {
            return await callback();
        } catch (error) {
            this.targetElement.innerHTML = ErrorBoundary.catchError(error);
        }
    }

    reset() {
        this.targetElement.innerHTML = this.originalContent;
    }
}

export default ErrorBoundary;