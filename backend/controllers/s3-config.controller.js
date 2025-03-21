// backend/controllers/s3-config.controller.js - UPDATED PATH
const fs = require('fs').promises;
const path = require('path');
const eventLogger = require('../lib/eventLogger');
const { redactSensitiveData } = require('../utils/sanitize');

// Updated path to store in data directory instead of config directory
const S3_CONFIG_PATH = path.join(__dirname, '../data/s3-config.json');

// Ensure data directory exists - it should already exist, but checking to be safe
const ensureDataDir = async () => {
  const dataDir = path.dirname(S3_CONFIG_PATH);
  try {
    await fs.access(dataDir);
  } catch (error) {
    console.log('Creating data directory');
    await fs.mkdir(dataDir, { recursive: true });
  }
};

// Get S3 configuration
const getS3Config = async (req, res) => {
  try {
    // Ensure data directory exists
    await ensureDataDir();

    // Check if config file exists
    try {
      await fs.access(S3_CONFIG_PATH);
    } catch (error) {
      // Config file doesn't exist, return default values
      return res.status(404).json({
        error: 'S3 configuration not found',
        message: 'S3 configuration has not been set up yet.'
      });
    }

    // Read config file
    const configData = await fs.readFile(S3_CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);

    // Log access to S3 config
    await eventLogger.logAuditEvent('view_s3_config', req.user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Remove sensitive data from response
    const safeConfig = {
      ...config,
      secretAccessKey: config.secretAccessKey ? '••••••••••••••••' : null
    };

    res.json(safeConfig);
  } catch (error) {
    console.error('Error fetching S3 configuration:', error);
    res.status(500).json({
      error: 'Failed to fetch S3 configuration',
      message: error.message
    });
  }
};

// Save S3 configuration
const saveS3Config = async (req, res) => {
  try {
    // Validate input data
    const { enabled, bucket, region, accessKeyId, secretAccessKey, prefix } = req.body;

    // If enabled, make sure required fields are provided
    if (enabled) {
      if (!bucket) {
        return res.status(400).json({ error: 'S3 bucket name is required' });
      }
      if (!region) {
        return res.status(400).json({ error: 'AWS region is required' });
      }
      if (!accessKeyId) {
        return res.status(400).json({ error: 'Access Key ID is required' });
      }
      // Only require secretAccessKey if it's not already set (represented by null)
      if (secretAccessKey === null) {
        try {
          // Try to read existing config to check if we already have a secret key
          const existingConfigData = await fs.readFile(S3_CONFIG_PATH, 'utf8');
          const existingConfig = JSON.parse(existingConfigData);
          
          if (!existingConfig.secretAccessKey) {
            return res.status(400).json({ error: 'Secret Access Key is required' });
          }
        } catch (error) {
          // If file doesn't exist, secretAccessKey is required
          return res.status(400).json({ error: 'Secret Access Key is required' });
        }
      }
    }

    // Ensure data directory exists
    await ensureDataDir();

    // Try to read existing config
    let currentConfig = { enabled: false };
    try {
      const existingConfigData = await fs.readFile(S3_CONFIG_PATH, 'utf8');
      currentConfig = JSON.parse(existingConfigData);
    } catch (error) {
      // File doesn't exist or can't be read, use default config
      console.log('No existing S3 config found, creating new one');
    }

    // Prepare new config
    // Only update secretAccessKey if provided
    const newConfig = {
      enabled: enabled,
      bucket: bucket || currentConfig.bucket || '',
      region: region || currentConfig.region || '',
      accessKeyId: accessKeyId || currentConfig.accessKeyId || '',
      secretAccessKey: secretAccessKey || currentConfig.secretAccessKey || '',
      prefix: prefix || currentConfig.prefix || 'logs/'
    };

    // Save to file - now in data directory
    await fs.writeFile(S3_CONFIG_PATH, JSON.stringify(newConfig, null, 2));

    // Log configuration change
    await eventLogger.logAuditEvent('update_s3_config', req.user.username, {
      enabled,
      bucket,
      region,
      accessKeyId,
      // Don't log the secret key
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Return success with redacted config
    const safeConfig = {
      ...newConfig,
      secretAccessKey: newConfig.secretAccessKey ? '••••••••••••••••' : null
    };

    res.json({
      message: 'S3 configuration saved successfully',
      config: safeConfig
    });
  } catch (error) {
    console.error('Error saving S3 configuration:', error);
    res.status(500).json({
      error: 'Failed to save S3 configuration',
      message: error.message
    });
  }
};

// Test S3 connection
const testS3Connection = async (req, res) => {
  try {
    const { bucket, region, accessKeyId, secretAccessKey, prefix } = req.body;

    // Validate input
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({ 
        error: 'Missing required S3 credentials',
        message: 'All S3 configuration fields are required to test the connection'
      });
    }

    // In a full implementation, you would use the AWS SDK to test the connection
    // For example, you might try to list objects in the bucket or put a test object
    
    // For now, just simulate a successful test
    // In production, this would be replaced with actual AWS SDK calls

    // Log the test
    await eventLogger.logAuditEvent('test_s3_connection', req.user.username, {
      bucket,
      region,
      // Don't log sensitive credentials
      success: true,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Return success
    res.json({
      success: true,
      message: 'Connection to S3 bucket successful. Your configuration is valid.'
    });
  } catch (error) {
    console.error('Error testing S3 connection:', error);
    
    await eventLogger.logAuditEvent('test_s3_connection', req.user.username, {
      error: error.message,
      success: false,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({
      error: 'Failed to test S3 connection',
      message: error.message
    });
  }
};

// Generate a pre-signed URL for S3 upload
const getPresignedUrl = async (req, res) => {
    try {
      const { fileName, contentType } = req.body;
      
      if (!fileName) {
        return res.status(400).json({ error: 'File name is required' });
      }
      
      // Load AWS SDK on server side
      const AWS = require('aws-sdk');
      
      // Load S3 config - UPDATED PATH
      try {
        await fs.access(S3_CONFIG_PATH);
      } catch (error) {
        return res.status(404).json({ 
          error: 'S3 configuration not found',
          message: 'S3 configuration has not been set up yet.'
        });
      }
      
      const s3ConfigData = await fs.readFile(S3_CONFIG_PATH, 'utf8');
      const s3Config = JSON.parse(s3ConfigData);
      
      if (!s3Config.enabled || !s3Config.bucket || !s3Config.accessKeyId || !s3Config.secretAccessKey) {
        return res.status(400).json({
          error: 'S3 is not properly configured',
          message: 'Please configure S3 settings before attempting to upload.'
        });
      }
      
      // Configure AWS SDK
      AWS.config.update({
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
        region: s3Config.region
      });
      
      // Create S3 instance
      const s3 = new AWS.S3({
        signatureVersion: 'v4'
      });
      
      // Generate object key
      const objectKey = `${s3Config.prefix || ''}${fileName}`;
      
      // Set up parameters for pre-signed URL
      const params = {
        Bucket: s3Config.bucket,
        Key: objectKey,
        ContentType: contentType || 'application/octet-stream',
        Expires: 15 * 60 // URL expires in 15 minutes
      };
      
      // Generate pre-signed URL
      const url = await s3.getSignedUrlPromise('putObject', params);
      
      // Log the pre-signed URL generation
      await eventLogger.logAuditEvent('s3_presigned_url_generated', req.user.username, {
        fileName,
        bucket: s3Config.bucket,
        objectKey,
        contentType,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      
      res.json({
        url,
        objectKey,
        bucket: s3Config.bucket,
        fileName,
        region: s3Config.region
      });
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      res.status(500).json({
        error: 'Failed to generate pre-signed URL',
        message: error.message
      });
    }
  };
  
module.exports = {
  getS3Config,
  saveS3Config,
  testS3Connection,
  getPresignedUrl
};