const { MongoClient } = require('mongodb');

class DatabasePool {
    constructor() {
        this.client = null;
        this.connecting = false;
        this.waitingPromises = [];
    }

    async getConnection() {
        if (this.client) {
            return this.client;
        }

        if (this.connecting) {
            return new Promise((resolve, reject) => {
                this.waitingPromises.push({ resolve, reject });
            });
        }

        this.connecting = true;
        try {
            this.client = await MongoClient.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                poolSize: 10
            });

            this.waitingPromises.forEach(promise => promise.resolve(this.client));
            this.waitingPromises = [];
            return this.client;
        } catch (error) {
            this.waitingPromises.forEach(promise => promise.reject(error));
            this.waitingPromises = [];
            throw error;
        } finally {
            this.connecting = false;
        }
    }

    async closeConnection() {
        if (this.client) {
            await this.client.close();
            this.client = null;
        }
    }

    // Helper method for executing database operations
    async executeQuery(operation) {
        let client;
        try {
            client = await this.getConnection();
            return await operation(client);
        } catch (error) {
            console.error('Database operation failed:', error);
            throw error;
        }
    }
}

module.exports = new DatabasePool();