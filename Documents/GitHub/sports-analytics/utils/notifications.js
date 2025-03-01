const EventEmitter = require('events');
const logger = require('./logger');

class NotificationManager extends EventEmitter {
    constructor() {
        super();
        this.notifications = [];
    }

    async sendNotification(userId, message, type = 'info') {
        const notification = {
            userId,
            message,
            type,
            timestamp: new Date(),
            read: false
        };

        this.notifications.push(notification);
        this.emit('notificationSent', notification);
        logger.info('Notification sent:', notification);
        return notification;
    }

    async markAsRead(userId, notificationId) {
        const notification = this.notifications.find(n => 
            n.userId === userId && n._id === notificationId);
        
        if (notification) {
            notification.read = true;
            this.emit('notificationRead', notification);
        }
    }

    async getUnreadNotifications(userId) {
        return this.notifications.filter(n => 
            n.userId === userId && !n.read);
    }
}

module.exports = new NotificationManager();