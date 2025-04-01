/**
 * Model Registry for ML Model Storage
 * 
 * Handles saving, loading, and versioning machine learning models
 * with integration to cloud storage systems
 * 
 * @author Sports Analytics Platform Team
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

class ModelRegistry {
  /**
   * Initialize model registry
   * @param {Object} config Configuration parameters
   */
  constructor(config = {}) {
    // Storage configuration
    this.bucketName = config.bucketName || 'sports-analytics-ml-models';
    this.localCachePath = config.localCachePath || './model_cache';
    this.registryBasePath = config.registryBasePath || 'models';
    
    // AWS client
    this.s3Client = null;
    
    // Cache management
    this.cacheEnabled = config.cacheEnabled !== false;
    this.maxCacheSize = config.maxCacheSize || 1024 * 1024 * 1024; // 1GB
    this.currentCacheSize = 0;
    
    // Version management
    this.versionRegistry = new Map();
    this.modelListCacheTime = 0;
    this.modelListCacheTTL = config.modelListCacheTTL || 60 * 60 * 1000; // 1 hour
    
    // Performance tracking
    this.uploadCount = 0;
    this.downloadCount = 0;
    this.totalUploadBytes = 0;
    this.totalDownloadBytes = 0;
    
    // Initialize S3 client
    this.initializeS3Client(config);
    
    // Create local cache directory if needed
    this.ensureCacheDirectory();
    
    // Bind methods
    this.uploadModel = this.uploadModel.bind(this);
    this.downloadModel = this.downloadModel.bind(this);
    this.listModels = this.listModels.bind(this);
    this.modelExists = this.modelExists.bind(this);
  }

  /**
   * Initialize S3 client
   * @param {Object} config Configuration options
   * @private
   */
  initializeS3Client(config) {
    try {
      // Configure AWS
      const awsConfig = {
        region: config.awsRegion || process.env.AWS_REGION || 'us-east-1'
      };
      
      // Add credentials if provided
      if (config.awsAccessKey && config.awsSecretKey) {
        awsConfig.accessKeyId = config.awsAccessKey;
        awsConfig.secretAccessKey = config.awsSecretKey;
      } else if (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY) {
        awsConfig.accessKeyId = process.env.AWS_ACCESS_KEY;
        awsConfig.secretAccessKey = process.env.AWS_SECRET_KEY;
      }
      
      // Initialize S3 client
      this.s3Client = new AWS.S3(awsConfig);
      
      logger.info('ModelRegistry: S3 client initialized');
    } catch (error) {
      logger.error(`ModelRegistry: Error initializing S3 client: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensure local cache directory exists
   * @private
   */
  ensureCacheDirectory() {
    try {
      if (!fs.existsSync(this.localCachePath)) {
        fs.mkdirSync(this.localCachePath, { recursive: true });
        logger.info(`ModelRegistry: Created local cache directory: ${this.localCachePath}`);
      }
    } catch (error) {
      logger.error(`ModelRegistry: Error creating cache directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload a model to the registry
   * @param {string} modelType Type of model
   * @param {string} version Version identifier
   * @param {string} modelPath Path to model directory or file
   * @returns {Promise<string>} S3 registry path
   */
  async uploadModel(modelType, version, modelPath) {
    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      if (!modelType || !version || !modelPath) {
        throw new Error('Model type, version, and path are required');
      }
      
      // Validate path exists
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model path does not exist: ${modelPath}`);
      }
      
      logger.info(`ModelRegistry: Uploading ${modelType} model version ${version} from ${modelPath}`);
      
      // Generate registry path
      const registryPath = `${this.registryBasePath}/${modelType}/${version}`;
      
      // Determine if path is file or directory
      const stats = fs.statSync(modelPath);
      
      if (stats.isDirectory()) {
        // Upload directory contents
        const files = this.getAllFiles(modelPath);
        
        for (const file of files) {
          const relativePath = path.relative(modelPath, file);
          const s3Key = `${registryPath}/${relativePath}`;
          
          // Read file content
          const fileContent = fs.readFileSync(file);
          
          // Upload to S3
          await this.s3Client.putObject({
            Bucket: this.bucketName,
            Key: s3Key,
            Body: fileContent,
            ContentType: this.getContentType(file)
          }).promise();
          
          // Update metrics
          this.totalUploadBytes += fileContent.length;
        }
      } else {
        // Upload single file
        const fileName = path.basename(modelPath);
        const s3Key = `${registryPath}/${fileName}`;
        
        // Read file content
        const fileContent = fs.readFileSync(modelPath);
        
        // Upload to S3
        await this.s3Client.putObject({
          Bucket: this.bucketName,
          Key: s3Key,
          Body: fileContent,
          ContentType: this.getContentType(modelPath)
        }).promise();
        
        // Update metrics
        this.totalUploadBytes += fileContent.length;
      }
      
      // Update version registry
      if (!this.versionRegistry.has(modelType)) {
        this.versionRegistry.set(modelType, new Map());
      }
      
      this.versionRegistry.get(modelType).set(version, {
        path: registryPath,
        uploadTime: new Date().toISOString()
      });
      
      // Update latest pointer
      this.versionRegistry.get(modelType).set('latest', {
        path: registryPath,
        actualVersion: version,
        uploadTime: new Date().toISOString()
      });
      
      // Increment upload count
      this.uploadCount++;
      
      logger.info(`ModelRegistry: Successfully uploaded ${modelType} model version ${version} to ${registryPath}`);
      
      return registryPath;
    } catch (error) {
      logger.error(`ModelRegistry: Error uploading model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download a model from the registry
   * @param {string} modelType Type of model
   * @param {string} version Version identifier (or 'latest')
   * @returns {Promise<string>} Local path to downloaded model
   */
  async downloadModel(modelType, version = 'latest') {
    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      if (!modelType) {
        throw new Error('Model type is required');
      }
      
      logger.info(`ModelRegistry: Downloading ${modelType} model version ${version}`);
      
      // Resolve version if 'latest'
      let resolvedVersion = version;
      let registryPath;
      
      if (version === 'latest') {
        const versionInfo = await this.getLatestVersion(modelType);
        resolvedVersion = versionInfo.actualVersion;
        registryPath = versionInfo.path;
      } else {
        registryPath = `${this.registryBasePath}/${modelType}/${version}`;
      }
      
      // Create local directory for model
      const localModelDir = path.join(
        this.localCachePath, 
        modelType, 
        resolvedVersion
      );
      
      // Check if model already exists locally
      if (this.cacheEnabled && fs.existsSync(localModelDir)) {
        logger.info(`ModelRegistry: Found cached model at ${localModelDir}`);
        return localModelDir;
      }
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(localModelDir)) {
        fs.mkdirSync(localModelDir, { recursive: true });
      }
      
      // List all objects in registry path
      const listResponse = await this.s3Client.listObjectsV2({
        Bucket: this.bucketName,
        Prefix: registryPath
      }).promise();
      
      // Check if any objects were found
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        throw new Error(`No objects found for ${modelType} model version ${resolvedVersion}`);
      }
      
      // Download each object
      for (const object of listResponse.Contents) {
        // Skip directory prefixes
        if (object.Key.endsWith('/')) {
          continue;
        }
        
        // Calculate relative path
        const relativePath = object.Key.substring(registryPath.length + 1);
        const localFilePath = path.join(localModelDir, relativePath);
        
        // Create directory for file if needed
        const localFileDir = path.dirname(localFilePath);
        if (!fs.existsSync(localFileDir)) {
          fs.mkdirSync(localFileDir, { recursive: true });
        }
        
        // Download file
        const response = await this.s3Client.getObject({
          Bucket: this.bucketName,
          Key: object.Key
        }).promise();
        
        // Write to local file
        fs.writeFileSync(localFilePath, response.Body);
        
        // Update metrics
        this.totalDownloadBytes += response.Body.length;
      }
      
      // Update cache size
      this.updateCacheSize();
      
      // Increment download count
      this.downloadCount++;
      
      logger.info(`ModelRegistry: Successfully downloaded ${modelType} model version ${resolvedVersion} to ${localModelDir}`);
      
      return localModelDir;
    } catch (error) {
      logger.error(`ModelRegistry: Error downloading model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the latest version info for a model type
   * @param {string} modelType Type of model
   * @returns {Promise<Object>} Latest version info
   * @private
   */
  async getLatestVersion(modelType) {
    try {
      // Check cache first
      if (this.versionRegistry.has(modelType) && 
          this.versionRegistry.get(modelType).has('latest')) {
        return this.versionRegistry.get(modelType).get('latest');
      }
      
      // List all versions in S3
      const listResponse = await this.s3Client.listObjectsV2({
        Bucket: this.bucketName,
        Prefix: `${this.registryBasePath}/${modelType}/`,
        Delimiter: '/'
      }).promise();
      
      // Extract version folders
      const versionPrefixes = listResponse.CommonPrefixes || [];
      
      if (versionPrefixes.length === 0) {
        throw new Error(`No versions found for model type: ${modelType}`);
      }
      
      // Get metadata for each version to find the latest by timestamp
      const versionMetadata = [];
      
      for (const prefix of versionPrefixes) {
        const version = prefix.Prefix.split('/').filter(Boolean).pop();
        
        // Skip 'latest' directory
        if (version === 'latest') {
          continue;
        }
        
        // Check if metadata file exists
        const metadataKey = `${prefix.Prefix}metadata.json`;
        
        try {
          const metadataResponse = await this.s3Client.getObject({
            Bucket: this.bucketName,
            Key: metadataKey
          }).promise();
          
          const metadata = JSON.parse(metadataResponse.Body.toString());
          
          versionMetadata.push({
            version,
            path: prefix.Prefix.slice(0, -1), // Remove trailing slash
            timestamp: metadata.timestamp || metadata.savedAt || prefix.Prefix,
            metadata
          });
        } catch (err) {
          // Metadata file doesn't exist, use the prefix as fallback
          versionMetadata.push({
            version,
            path: prefix.Prefix.slice(0, -1),
            timestamp: prefix.Prefix
          });
        }
      }
      
      // Sort by timestamp (descending)
      versionMetadata.sort((a, b) => {
        if (typeof a.timestamp === 'string' && typeof b.timestamp === 'string') {
          return b.timestamp.localeCompare(a.timestamp);
        }
        return 0;
      });
      
      // Get the latest version
      const latestVersion = versionMetadata[0];
      
      // Update version registry
      if (!this.versionRegistry.has(modelType)) {
        this.versionRegistry.set(modelType, new Map());
      }
      
      this.versionRegistry.get(modelType).set('latest', {
        path: latestVersion.path,
        actualVersion: latestVersion.version,
        uploadTime: latestVersion.timestamp
      });
      
      return {
        path: latestVersion.path,
        actualVersion: latestVersion.version,
        uploadTime: latestVersion.timestamp
      };
    } catch (error) {
      logger.error(`ModelRegistry: Error getting latest version: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a model exists in the registry
   * @param {string} modelType Type of model
   * @param {string} version Version identifier (or 'latest')
   * @returns {Promise<boolean>} True if model exists
   */
  async modelExists(modelType, version = 'latest') {
    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      if (!modelType) {
        throw new Error('Model type is required');
      }
      
      let registryPath;
      
      if (version === 'latest') {
        try {
          const versionInfo = await this.getLatestVersion(modelType);
          registryPath = versionInfo.path;
        } catch (err) {
          return false;
        }
      } else {
        registryPath = `${this.registryBasePath}/${modelType}/${version}`;
      }
      
      // Check if any objects exist with this prefix
      const listResponse = await this.s3Client.listObjectsV2({
        Bucket: this.bucketName,
        Prefix: registryPath,
        MaxKeys: 1
      }).promise();
      
      return !!(listResponse.Contents && listResponse.Contents.length > 0);
    } catch (error) {
      logger.error(`ModelRegistry: Error checking if model exists: ${error.message}`);
      return false;
    }
  }

  /**
   * List all available models and versions
   * @param {Object} options Listing options
   * @returns {Promise<Object>} Models and versions
   */
  async listModels(options = {}) {
    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      // Check if we have a recent cache
      const now = Date.now();
      if (this.modelListCacheTime > 0 && 
          now - this.modelListCacheTime < this.modelListCacheTTL &&
          this.cachedModelList) {
        return this.cachedModelList;
      }
      
      logger.info('ModelRegistry: Listing available models');
      
      // List all prefixes in the registry
      const listResponse = await this.s3Client.listObjectsV2({
        Bucket: this.bucketName,
        Prefix: `${this.registryBasePath}/`,
        Delimiter: '/'
      }).promise();
      
      // Extract model type directories
      const modelPrefixes = listResponse.CommonPrefixes || [];
      const models = {};
      
      // For each model type, list available versions
      for (const modelPrefix of modelPrefixes) {
        const modelType = modelPrefix.Prefix.split('/').filter(Boolean).pop();
        
        // List versions for this model type
        const versionsResponse = await this.s3Client.listObjectsV2({
          Bucket: this.bucketName,
          Prefix: modelPrefix.Prefix,
          Delimiter: '/'
        }).promise();
        
        // Extract version directories
        const versionPrefixes = versionsResponse.CommonPrefixes || [];
        const versions = [];
        
        for (const versionPrefix of versionPrefixes) {
          const version = versionPrefix.Prefix.split('/').filter(Boolean).pop();
          
          // Skip 'latest' directory
          if (version === 'latest') {
            continue;
          }
          
          versions.push(version);
        }
        
        // Add to models object
        models[modelType] = {
          versions: versions.sort(),
          count: versions.length
        };
        
        // Try to get latest version info
        try {
          const latestVersion = await this.getLatestVersion(modelType);
          models[modelType].latest = latestVersion.actualVersion;
        } catch (err) {
          // No latest version available
        }
      }
      
      // Cache the result
      this.cachedModelList = models;
      this.modelListCacheTime = now;
      
      return models;
    } catch (error) {
      logger.error(`ModelRegistry: Error listing models: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a model version from the registry
   * @param {string} modelType Type of model
   * @param {string} version Version identifier
   * @returns {Promise<boolean>} Success flag
   */
  async deleteModel(modelType, version) {
    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      if (!modelType || !version) {
        throw new Error('Model type and version are required');
      }
      
      // Don't allow deleting 'latest'
      if (version === 'latest') {
        throw new Error('Cannot delete latest version pointer');
      }
      
      logger.info(`ModelRegistry: Deleting ${modelType} model version ${version}`);
      
      // Calculate registry path
      const registryPath = `${this.registryBasePath}/${modelType}/${version}`;
      
      // List all objects with this prefix
      const listResponse = await this.s3Client.listObjectsV2({
        Bucket: this.bucketName,
        Prefix: registryPath
      }).promise();
      
      // Check if any objects were found
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        logger.warn(`ModelRegistry: No objects found for ${modelType} model version ${version}`);
        return false;
      }
      
      // Create delete objects array
      const deleteObjects = listResponse.Contents.map(obj => ({
        Key: obj.Key
      }));
      
      // Delete all objects
      await this.s3Client.deleteObjects({
        Bucket: this.bucketName,
        Delete: {
          Objects: deleteObjects,
          Quiet: false
        }
      }).promise();
      
      // Update version registry
      if (this.versionRegistry.has(modelType)) {
        this.versionRegistry.get(modelType).delete(version);
        
        // Check if we need to update latest pointer
        const latestInfo = this.versionRegistry.get(modelType).get('latest');
        if (latestInfo && latestInfo.actualVersion === version) {
          // Need to find new latest version
          this.versionRegistry.get(modelType).delete('latest');
          this.modelListCacheTime = 0; // Invalidate cache
        }
      }
      
      // Delete local cache if it exists
      const localModelDir = path.join(
        this.localCachePath, 
        modelType, 
        version
      );
      
      if (fs.existsSync(localModelDir)) {
        this.deleteDirectory(localModelDir);
      }
      
      logger.info(`ModelRegistry: Successfully deleted ${modelType} model version ${version}`);
      
      return true;
    } catch (error) {
      logger.error(`ModelRegistry: Error deleting model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new version from an existing model
   * @param {string} modelType Type of model
   * @param {string} sourceVersion Source version
   * @param {string} targetVersion Target version
   * @returns {Promise<string>} New version registry path
   */
  async copyModel(modelType, sourceVersion, targetVersion) {
    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      
      if (!modelType || !sourceVersion || !targetVersion) {
        throw new Error('Model type, source version, and target version are required');
      }
      
      logger.info(`ModelRegistry: Copying ${modelType} model from version ${sourceVersion} to ${targetVersion}`);
      
      // Resolve source version if 'latest'
      let resolvedSourceVersion = sourceVersion;
      let sourceRegistryPath;
      
      if (sourceVersion === 'latest') {
        const versionInfo = await this.getLatestVersion(modelType);
        resolvedSourceVersion = versionInfo.actualVersion;
        sourceRegistryPath = versionInfo.path;
      } else {
        sourceRegistryPath = `${this.registryBasePath}/${modelType}/${sourceVersion}`;
      }
      
      // Check if source model exists
      const sourceExists = await this.modelExists(modelType, resolvedSourceVersion);
      if (!sourceExists) {
        throw new Error(`Source model not found: ${modelType} version ${resolvedSourceVersion}`);
      }
      
      // Calculate target registry path
      const targetRegistryPath = `${this.registryBasePath}/${modelType}/${targetVersion}`;
      
      // Check if target already exists
      const targetExists = await this.modelExists(modelType, targetVersion);
      if (targetExists) {
        throw new Error(`Target version already exists: ${modelType} version ${targetVersion}`);
      }
      
      // List all objects in source path
      const listResponse = await this.s3Client.listObjectsV2({
        Bucket: this.bucketName,
        Prefix: sourceRegistryPath
      }).promise();
      
      // Check if any objects were found
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        throw new Error(`No objects found for source model: ${modelType} version ${resolvedSourceVersion}`);
      }
      // Copy each object to target path
      for (const object of listResponse.Contents) {
        // Skip directory prefixes
        if (object.Key.endsWith('/')) {
          continue;
        }
        
        // Calculate relative path
        const relativePath = object.Key.substring(sourceRegistryPath.length);
        const targetKey = `${targetRegistryPath}${relativePath}`;
        
        // Copy object within S3
        await this.s3Client.copyObject({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${object.Key}`,
          Key: targetKey
        }).promise();
      }
      
      // Update version registry
      if (!this.versionRegistry.has(modelType)) {
        this.versionRegistry.set(modelType, new Map());
      }
      
      this.versionRegistry.get(modelType).set(targetVersion, {
        path: targetRegistryPath,
        uploadTime: new Date().toISOString()
      });
      
      logger.info(`ModelRegistry: Successfully copied ${modelType} model from version ${resolvedSourceVersion} to ${targetVersion}`);
      
      return targetRegistryPath;
    } catch (error) {
      logger.error(`ModelRegistry: Error copying model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update cache size and cleanup if needed
   * @private
   */
  updateCacheSize() {
    try {
      if (!this.cacheEnabled) {
        return;
      }
      
      // Calculate current cache size
      this.currentCacheSize = this.calculateDirectorySize(this.localCachePath);
      
      // Check if we need to clean up
      if (this.currentCacheSize > this.maxCacheSize) {
        this.cleanupCache();
      }
    } catch (error) {
      logger.error(`ModelRegistry: Error updating cache size: ${error.message}`);
    }
  }

  /**
   * Clean up local cache when it exceeds maximum size
   * @private
   */
  cleanupCache() {
    try {
      // Get all model directories
      const modelDirs = fs.readdirSync(this.localCachePath)
        .filter(item => fs.statSync(path.join(this.localCachePath, item)).isDirectory());
      
      // Get info for all version directories
      const versionDirs = [];
      
      for (const modelType of modelDirs) {
        const modelPath = path.join(this.localCachePath, modelType);
        
        const versions = fs.readdirSync(modelPath)
          .filter(item => fs.statSync(path.join(modelPath, item)).isDirectory());
        
        for (const version of versions) {
          const versionPath = path.join(modelPath, version);
          const stats = fs.statSync(versionPath);
          
          versionDirs.push({
            modelType,
            version,
            path: versionPath,
            size: this.calculateDirectorySize(versionPath),
            lastAccessed: stats.atime
          });
        }
      }
      
      // Sort by last accessed time (oldest first)
      versionDirs.sort((a, b) => a.lastAccessed - b.lastAccessed);
      
      // Remove oldest directories until we're under the limit
      let currentSize = this.currentCacheSize;
      
      for (const dir of versionDirs) {
        // Keep if we're under the limit
        if (currentSize <= this.maxCacheSize) {
          break;
        }
        
        // Remove directory
        this.deleteDirectory(dir.path);
        
        // Update size
        currentSize -= dir.size;
        
        logger.info(`ModelRegistry: Removed cached model ${dir.modelType} version ${dir.version} to free up space`);
      }
      
      // Update current cache size
      this.currentCacheSize = currentSize;
      
      logger.info(`ModelRegistry: Cache cleanup complete, current size: ${this.formatBytes(this.currentCacheSize)}`);
    } catch (error) {
      logger.error(`ModelRegistry: Error cleaning up cache: ${error.message}`);
    }
  }

  /**
   * Calculate size of a directory recursively
   * @param {string} dirPath Directory path
   * @returns {number} Size in bytes
   * @private
   */
  calculateDirectorySize(dirPath) {
    let size = 0;
    
    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      return 0;
    }
    
    // Get all files in directory
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        // Recursively get directory size
        size += this.calculateDirectorySize(itemPath);
      } else {
        // Add file size
        size += stats.size;
      }
    }
    
    return size;
  }

  /**
   * Delete a directory recursively
   * @param {string} dirPath Directory path
   * @private
   */
  deleteDirectory(dirPath) {
    try {
      // Check if directory exists
      if (!fs.existsSync(dirPath)) {
        return;
      }
      
      // Get all files in directory
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          // Recursively delete directory
          this.deleteDirectory(itemPath);
        } else {
          // Delete file
          fs.unlinkSync(itemPath);
        }
      }
      
      // Delete empty directory
      fs.rmdirSync(dirPath);
    } catch (error) {
      logger.error(`ModelRegistry: Error deleting directory ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all files in a directory recursively
   * @param {string} dirPath Directory path
   * @returns {Array<string>} Array of file paths
   * @private
   */
  getAllFiles(dirPath) {
    let files = [];
    
    // Get all items in directory
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        // Recursively get files from subdirectory
        files = files.concat(this.getAllFiles(itemPath));
      } else {
        // Add file path
        files.push(itemPath);
      }
    }
    
    return files;
  }

  /**
   * Get content type for a file based on extension
   * @param {string} filePath File path
   * @returns {string} Content type
   * @private
   */
  getContentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    
    switch (extension) {
      case '.json':
        return 'application/json';
      case '.txt':
        return 'text/plain';
      case '.bin':
        return 'application/octet-stream';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.js':
        return 'application/javascript';
      case '.html':
        return 'text/html';
      case '.css':
        return 'text/css';
      case '.csv':
        return 'text/csv';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Format bytes into human readable string
   * @param {number} bytes Bytes to format
   * @returns {string} Formatted string
   * @private
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get performance metrics for the model registry
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      uploadCount: this.uploadCount,
      downloadCount: this.downloadCount,
      totalUploadBytes: this.formatBytes(this.totalUploadBytes),
      totalDownloadBytes: this.formatBytes(this.totalDownloadBytes),
      cacheSize: this.formatBytes(this.currentCacheSize),
      modelTypes: this.versionRegistry.size
    };
  }
}

module.exports = ModelRegistry;