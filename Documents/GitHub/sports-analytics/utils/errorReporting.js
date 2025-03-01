class ErrorReporting {
    constructor() {
        this.errorQueue = [];
        this.isProcessing = false;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
    }

    async reportError(error, context = {}) {
        const errorReport = {
            error: {
                message: error.message,
                stack: error.stack,
                type: error.name
            },
            context: {
                url: window.location.href,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                ...context
            }
        };

        this.errorQueue.push(errorReport);
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.errorQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const errorReport = this.errorQueue[0];
        let retries = 0;

        while (retries < this.maxRetries) {
            try {
                await fetch('/api/error-logging', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify(errorReport)
                });

                this.errorQueue.shift(); // Remove successfully reported error
                break;
            } catch (error) {
                retries++;
                if (retries === this.maxRetries) {
                    console.error('Failed to report error after maximum retries:', error);
                    this.errorQueue.shift(); // Remove failed error report
                } else {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * retries));
                }
            }
        }

        // Process next error in queue
        this.processQueue();
    }

    handleGlobalErrors() {
        window.addEventListener('error', (event) => {
            this.reportError(event.error, {
                type: 'uncaught_error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.reportError(event.reason, {
                type: 'unhandled_promise_rejection'
            });
        });
    }
}

const errorReporting = new ErrorReporting();
errorReporting.handleGlobalErrors();

export default errorReporting;