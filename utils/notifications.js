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

    addNotification(notification) {
        this.notifications.push(notification);
        this.emit('notificationAdded', notification);
        logger.info('Notification added:', notification);
    }

    removeNotification(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.emit('notificationRemoved', id);
        logger.info('Notification removed:', id);
    }

    getNotifications() {
        return this.notifications;
    }
}

module.exports = new NotificationManager();