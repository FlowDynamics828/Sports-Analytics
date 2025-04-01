/**
 * Type definitions for Database Manager module
 */

/**
 * DatabaseManager configuration options
 */
export interface DatabaseManagerOptions {
  uri: string;
  name: string;
  options?: Record<string, any>;
}

/**
 * DatabaseManager class for handling MongoDB connections and operations
 */
export class DatabaseManager {
  /**
   * MongoDB client instance
   */
  client: import('mongodb').MongoClient;
  
  /**
   * Database name
   */
  dbName: string;
  
  /**
   * Database instance
   */
  db: import('mongodb').Db;
  
  /**
   * Connection URI
   */
  uri: string;
  
  /**
   * Connection options
   */
  options: Record<string, any>;
  
  /**
   * Constructor for DatabaseManager
   * @param options Configuration options
   */
  constructor(options: DatabaseManagerOptions);
  
  /**
   * Initialize the database connection
   * @returns Promise that resolves when the connection is established
   */
  initialize(): Promise<void>;
  
  /**
   * Get the database instance
   * @returns MongoDB database instance
   */
  getDb(): import('mongodb').Db;
  
  /**
   * Check if the database is connected
   * @returns Boolean indicating if connected
   */
  isConnected(): boolean;
  
  /**
   * Connect to the database
   * @returns Promise that resolves when connected
   */
  connect(): Promise<void>;
  
  /**
   * Disconnect from the database
   * @returns Promise that resolves when disconnected
   */
  disconnect(): Promise<void>;
} 