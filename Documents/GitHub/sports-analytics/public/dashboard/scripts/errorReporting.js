class ErrorReporting {
    static async reportError(error, context = {}) {
        try {
            await fetch('/api/error-logging', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    error: {
                        message: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString(),
                        context
                    }
                })
            });
        } catch (e) {
            console.error('Failed to report error:', e);
        }
    }
}

export default ErrorReporting;