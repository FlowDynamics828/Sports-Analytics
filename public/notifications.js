// Notification System
class NotificationSystem {
    constructor() {
        this.notifications = [];
        this.initializeWebSocket();
    }

    initializeWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${wsProtocol}//${window.location.host}`);
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleNotification(data);
        };

        this.ws.onclose = () => {
            setTimeout(() => this.initializeWebSocket(), 3000);
        };
    }

    handleNotification(data) {
        const notification = {
            id: Date.now(),
            message: data.message,
            type: data.type,
            timestamp: new Date()
        };

        this.notifications.push(notification);
        this.showNotification(notification);
    }

    showNotification(notification) {
        const container = document.getElementById('notificationContainer') || this.createNotificationContainer();
        
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification bg-gray-800 p-4 mb-2 rounded-lg shadow-lg flex justify-between items-center
            ${notification.type === 'error' ? 'border-red-500' : 'border-blue-500'} border`;
        
        notificationElement.innerHTML = `
            <div>
                <p class="text-white">${notification.message}</p>
                <p class="text-gray-400 text-sm">${notification.timestamp.toLocaleTimeString()}</p>
            </div>
            <button class="text-gray-400 hover:text-white" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(notificationElement);

        setTimeout(() => {
            notificationElement.remove();
        }, 5000);
    }

    createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'fixed top-4 right-4 z-50 w-80 space-y-2';
        document.body.appendChild(container);
        return container;
    }

    sendNotification(message, type = 'info') {
        this.handleNotification({ message, type });
    }
}

// Initialize notification system
const notifications = new NotificationSystem();

// Export for use in other files
window.notifications = notifications;