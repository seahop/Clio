// frontend/src/services/s3UploadService.js
import AWS from 'aws-sdk';

/**
 * Service to handle uploading files to S3 from the frontend
 */
class S3UploadService {
  /**
   * Upload a file to S3
   * @param {string} serverFilePath - Path to the file on the server
   * @param {Object} s3Config - S3 configuration
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Upload result
   */
  async uploadToS3(serverFilePath, s3Config, onProgress = null) {
    try {
      // Make sure the path is an absolute URL
      let fullPath = serverFilePath;
      if (serverFilePath.startsWith('/')) {
        // Convert relative path to absolute URL
        const baseUrl = window.location.origin;
        fullPath = `${baseUrl}${serverFilePath}`;
      }
      
      console.log(`Fetching file from: ${fullPath}`);
      
      // First, we need to get the file from the server
      const fileResponse = await fetch(fullPath, {
        method: 'GET',
        credentials: 'include',
        mode: 'cors', // Ensure CORS mode is set
        cache: 'no-cache'
      });
      
      if (!fileResponse.ok) {
        console.error(`Failed to fetch file: ${fileResponse.status} ${fileResponse.statusText}`);
        throw new Error(`Failed to fetch file from server: ${fileResponse.status}`);
      }
      
      console.log('File fetched successfully, getting as blob...');
      
      // Get the file as a blob
      const fileBlob = await fileResponse.blob();
      console.log(`Blob size: ${fileBlob.size} bytes, type: ${fileBlob.type}`);
      
      // If the blob is empty, something went wrong
      if (fileBlob.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      
      // Extract filename from the path
      const filename = serverFilePath.split('/').pop();
      
      // Construct the S3 object key
      const objectKey = `${s3Config.prefix || ''}${filename}`;
      
      console.log(`Uploading to S3 as: ${objectKey}`);
      
      // Configure AWS SDK
      AWS.config.update({
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
        region: s3Config.region
      });
      
      // Create S3 instance with appropriate configuration for browser
      const s3 = new AWS.S3({
        apiVersion: '2006-03-01',
        signatureVersion: 'v4', // Added signature version v4
        params: { Bucket: s3Config.bucket }
      });
      
      // Set up upload parameters
      const uploadParams = {
        Bucket: s3Config.bucket,
        Key: objectKey,
        Body: fileBlob,
        ContentType: fileBlob.type || 'application/zip'
      };
      
      console.log('Starting S3 upload with params:', {
        Bucket: uploadParams.Bucket,
        Key: uploadParams.Key,
        ContentType: uploadParams.ContentType,
        Size: fileBlob.size
      });
      
      // Implement progress tracking
      if (onProgress) {
        const upload = s3.upload(uploadParams);
        upload.on('httpUploadProgress', (progress) => {
          const percentage = Math.round((progress.loaded / progress.total) * 100);
          console.log(`Upload progress: ${percentage}%`);
          onProgress(percentage);
        });
        
        const data = await upload.promise();
        console.log('Upload complete:', data);
        return {
          success: true,
          bucket: s3Config.bucket,
          objectKey,
          etag: data.ETag,
          location: data.Location
        };
      } else {
        const data = await s3.upload(uploadParams).promise();
        console.log('Upload complete:', data);
        return {
          success: true,
          bucket: s3Config.bucket,
          objectKey,
          etag: data.ETag,
          location: data.Location
        };
      }
    } catch (error) {
      console.error('S3 upload error details:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        requestId: error.requestId,
        time: error.time,
        retryable: error.retryable,
        originalError: error.originalError
      });
      throw error;
    }
  }
  
  /**
   * Upload a file using pre-signed URL (more reliable than direct SDK upload)
   * @param {string} serverFilePath - Path to the file on the server 
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Upload result
   */
  async uploadToS3UsingPresignedUrl(serverFilePath, onProgress = null) {
    try {
      // First fetch the file from server
      const fullPath = serverFilePath.startsWith('/') ? 
        `${window.location.origin}${serverFilePath}` : serverFilePath;
      
      console.log(`Fetching file from: ${fullPath}`);
      
      const fileResponse = await fetch(fullPath, {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file from server: ${fileResponse.status}`);
      }
      
      const fileBlob = await fileResponse.blob();
      const filename = serverFilePath.split('/').pop();
      
      console.log(`File fetched successfully: ${filename}, size: ${fileBlob.size} bytes`);
      
      // Request pre-signed URL from server
      const presignedUrlResponse = await fetch('/api/logs/s3-config/presigned-url', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': window.csrfToken
        },
        body: JSON.stringify({
          fileName: filename,
          contentType: fileBlob.type || 'application/zip'
        })
      });
      
      if (!presignedUrlResponse.ok) {
        throw new Error('Failed to get pre-signed upload URL');
      }
      
      const { url, objectKey, bucket } = await presignedUrlResponse.json();
      
      console.log('Received pre-signed URL:', url.substring(0, 100) + '...');
      
      // Upload directly to S3 using the pre-signed URL
      if (onProgress) {
        // For progress tracking with XMLHttpRequest
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentage = Math.round((event.loaded / event.total) * 100);
              console.log(`Upload progress: ${percentage}%`);
              onProgress(percentage);
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              console.log('Upload complete via pre-signed URL');
              resolve({
                success: true,
                bucket,
                objectKey,
                location: `https://${bucket}.s3.amazonaws.com/${objectKey}`
              });
            } else {
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
            }
          };
          
          xhr.onerror = () => {
            reject(new Error('Network error during upload'));
          };
          
          xhr.open('PUT', url);
          xhr.setRequestHeader('Content-Type', fileBlob.type || 'application/zip');
          xhr.send(fileBlob);
        });
      } else {
        // Without progress tracking, use fetch
        const uploadResponse = await fetch(url, {
          method: 'PUT',
          body: fileBlob,
          headers: {
            'Content-Type': fileBlob.type || 'application/zip'
          }
        });
        
        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.status}`);
        }
        
        console.log('Upload complete via pre-signed URL');
        return {
          success: true,
          bucket,
          objectKey,
          location: `https://${bucket}.s3.amazonaws.com/${objectKey}`
        };
      }
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  }
  
  /**
   * Fetch S3 configuration from the backend
   * @returns {Promise<Object>} S3 configuration
   */
  async getS3Config() {
    try {
      const response = await fetch('/api/logs/s3-config', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // No config exists yet, return default values
          return {
            enabled: false,
            bucket: '',
            region: '',
            accessKeyId: '',
            secretAccessKey: '',
            prefix: 'logs/'
          };
        }
        throw new Error(`Failed to fetch S3 configuration: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching S3 config:', error);
      throw error;
    }
  }

  /**
   * Update the S3 upload status on the backend
   * @param {string} archiveFileName - The name of the archive file
   * @param {string} status - The status (success, failed)
   * @param {Object} details - Additional details about the upload
   * @returns {Promise<Object>} Status update result
   */
  async updateUploadStatus(archiveFileName, status, details = {}) {
    try {
      const response = await fetch('/api/logs/s3-config/upload-status', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': window.csrfToken
        },
        body: JSON.stringify({
          archiveFileName,
          status,
          details
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update upload status');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating S3 upload status:', error);
      throw error;
    }
  }
  
  /**
   * Test the S3 connection using the provided credentials
   * @param {Object} s3Config - The S3 configuration to test
   * @returns {Promise<Object>} Test result
   */
  async testS3Connection(s3Config) {
    try {
      console.log('Testing S3 connection...');
      
      // Configure AWS SDK
      AWS.config.update({
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
        region: s3Config.region
      });
      
      // Create S3 instance
      const s3 = new AWS.S3({
        signatureVersion: 'v4' // Added signature version v4
      });
      
      // Test by listing objects with a prefix (this is a minimal permission operation)
      console.log(`Listing objects in bucket: ${s3Config.bucket} with prefix: ${s3Config.prefix || ''}`);
      const data = await s3.listObjectsV2({
        Bucket: s3Config.bucket,
        MaxKeys: 1,
        Prefix: s3Config.prefix || ''
      }).promise();
      
      console.log('S3 connection test successful:', data);
      return {
        success: true,
        message: 'Successfully connected to S3 bucket',
        bucketExists: true
      };
    } catch (error) {
      console.error('S3 connection test error details:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        requestId: error.requestId,
        time: error.time,
        retryable: error.retryable
      });
      
      // Process common AWS errors
      if (error.code === 'NoSuchBucket') {
        throw new Error(`Bucket "${s3Config.bucket}" does not exist or you don't have access to it`);
      } else if (error.code === 'AccessDenied') {
        throw new Error('Access denied. Check your IAM permissions for this bucket');
      } else if (error.code === 'InvalidAccessKeyId') {
        throw new Error('Invalid Access Key ID. Please check your credentials');
      } else if (error.code === 'SignatureDoesNotMatch') {
        throw new Error('Invalid Secret Access Key. Please check your credentials');
      }
      
      throw error;
    }
  }
}

export default new S3UploadService();