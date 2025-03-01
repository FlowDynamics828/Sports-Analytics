const EventEmitter = require('events');
const logger = require('./logger');

class QueueManager extends EventEmitter {
  constructor() {
    super();
    this.queues = new Map();
  }

  async addToQueue(queueName, item) {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    this.queues.get(queueName).push(item);
    this.emit('itemAdded', { queueName, item });
  }

  async processQueue(queueName) {
    if (!this.queues.has(queueName)) {
      return;
    }
    const queue = this.queues.get(queueName);
    while (queue.length > 0) {
      const item = queue.shift();
      try {
        await this.processItem(item);
      } catch (error) {
        logger.error('Error processing queue item:', error);
      }
    }
  }

  async processItem(item) {
    // Implement specific processing logic
    logger.info('Processing queue item:', item);
  }

  async shutdown() {
    this.queues.clear();
    logger.info('Queue manager shut down');
  }
}

module.exports = QueueManager;
