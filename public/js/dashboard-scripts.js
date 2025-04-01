// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
                // Enable background sync
                registration.sync.register('sync-data');
            })
            .catch(error => {
                console.error('ServiceWorker registration failed:', error);
                logError(error);
            });
    });
}

// ... rest of your existing code ... 