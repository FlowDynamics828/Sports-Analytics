const EventEmitter = require('events');
const logger = require('./logger');

class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.running = false;
  }

  async addTask(taskId, task) {
    this.tasks.set(taskId, {
      task,
      status: 'pending',
      createdAt: new Date()
    });
    this.emit('taskAdded', taskId);
  }

  async startTask(taskId) {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      throw new Error('Task not found');
    }

    try {
      taskInfo.status = 'running';
      await taskInfo.task();
      taskInfo.status = 'completed';
      this.emit('taskCompleted', taskId);
    } catch (error) {
      taskInfo.status = 'failed';
      taskInfo.error = error.message;
      this.emit('taskFailed', { taskId, error });
      logger.error('Task failed:', { taskId, error });
    }
  }

  async shutdown() {
    this.running = false;
    this.tasks.clear();
    logger.info('Task manager shut down');
  }
}

module.exports = TaskManager;
