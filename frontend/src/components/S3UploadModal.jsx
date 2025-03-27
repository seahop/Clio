// frontend/src/components/S3UploadModal.jsx - Updated with CSRF Handling
import React, { useState, useEffect } from 'react';
import { X, CloudUpload, CheckCircle, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import s3UploadService from '../services/s3UploadService';

const S3UploadModal = ({ show, onClose, archivePath, onSuccess }) => {
  const [uploadStatus, setUploadStatus] = useState('preparing'); // preparing, uploading, success, error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [s3Config, setS3Config] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [usePresignedUrl, setUsePresignedUrl] = useState(true); // Set to true to use pre-signed URL by default
  const [useEncryption, setUseEncryption] = useState(true); // New state for encryption option

  useEffect(() => {
    if (show && archivePath) {
      // Refresh CSRF token before starting upload
      refreshCsrfToken().then(() => {
        startUpload();
      });
    }
  }, [show, archivePath]);

  // Function to refresh CSRF token
  const refreshCsrfToken = async () => {
    try {
      const token = await s3UploadService.refreshCsrfToken();
      console.log('CSRF token refreshed before upload');
      return token;
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error);
      setError('Failed to refresh security token. Please try refreshing the page.');
      return null;
    }
  };

  const startUpload = async () => {
    try {
      setUploadStatus('preparing');
      setProgress(0);
      setError(null);
      
      // Extract file name from path for status tracking
      const archiveFileName = archivePath.split('/').pop();
      
      console.log('Starting upload for archive:', {
        originalPath: archivePath,
        fileName: archiveFileName,
        withEncryption: useEncryption
      });
      
      // Process the archive path to ensure it's in the correct format
      let processedPath = archivePath;
      
      // Handle paths based on where the file is coming from
      if (processedPath.includes('/app/data/archives/')) {
        // For files in the archives directory
        const filename = processedPath.split('/').pop();
        processedPath = `/archives/${filename}`;
        console.log('Corrected archives path to:', processedPath);
      } else if (!processedPath.startsWith('/exports/') && !processedPath.startsWith('/archives/') && processedPath.includes('.zip')) {
        // For other ZIP files that don't have proper prefixes
        const filename = processedPath.split('/').pop();
        // Try the archives path first
        processedPath = `/archives/${filename}`;
        console.log('Using archives path:', processedPath);
      }
      
      // Fetch S3 configuration
      const config = await s3UploadService.getS3Config();
      setS3Config(config);
      
      if (!config.enabled || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
        throw new Error('S3 is not properly configured. Please check your settings.');
      }
      
      // Start upload
      setUploadStatus('uploading');
      
      // Handle upload progress
      const handleProgress = (progressPercent) => {
        setProgress(progressPercent);
      };
      
      // Make sure we have a valid CSRF token
      await refreshCsrfToken();
      
      // Choose upload method based on encryption and URL preferences
      let result;
      if (useEncryption) {
        // Use encryption with presigned URL (recommended approach)
        console.log('Using encrypted upload with presigned URL');
        result = await s3UploadService.uploadEncryptedToS3UsingPresignedUrl(
          processedPath,
          handleProgress
        );
      } else if (usePresignedUrl) {
        // Use pre-signed URL approach without encryption
        console.log('Using standard upload with presigned URL');
        result = await s3UploadService.uploadToS3UsingPresignedUrl(
          processedPath,
          handleProgress
        );
      } else {
        // Use direct SDK approach without encryption
        console.log('Using direct SDK upload without encryption');
        result = await s3UploadService.uploadToS3(
          processedPath,
          config,
          handleProgress
        );
      }
      
      setUploadResult(result);
      setUploadStatus('success');
      
      // Refresh CSRF token before status updates
      await refreshCsrfToken();
      
      // Update both status tracking systems
      try {
        // Add encryption info to status tracking
        const statusDetails = {
          location: result.location,
          bucket: result.bucket,
          objectKey: result.objectKey,
          uploadedAt: new Date().toISOString(),
          encrypted: result.encrypted || false
        };
        
        // If encrypted, add key file info
        if (result.keyFile) {
          statusDetails.keyFile = result.keyFile;
        }
        
        // Update the log rotation S3 status tracking (for Log Management view)
        await s3UploadService.updateUploadStatus(archiveFileName, 'success', statusDetails);
        
        // Also update the export status tracking (for Export view)
        await s3UploadService.updateExportStatus(archiveFileName, 'success', statusDetails);
        
        console.log('Updated both status tracking systems for S3 upload');
      } catch (statusError) {
        // Don't fail the whole operation if status updates fail
        console.error('Failed to update one or more status systems:', statusError);
      }
      
      // Notify parent component of success
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      console.error('S3 upload error:', err);
      setError(err.message);
      setUploadStatus('error');
      
      // Refresh CSRF token before status updates
      await refreshCsrfToken();
      
      // Update failure status on backend if possible
      try {
        const archiveFileName = archivePath.split('/').pop();
        
        // Update both status tracking systems
        await s3UploadService.updateUploadStatus(archiveFileName, 'failed', {
          error: err.message,
          errorCode: err.code,
          failedAt: new Date().toISOString()
        });
        
        await s3UploadService.updateExportStatus(archiveFileName, 'failed', {
          error: err.message, 
          errorCode: err.code,
          failedAt: new Date().toISOString()
        });
      } catch (statusError) {
        console.error('Failed to update error status on backend:', statusError);
      }
    }
  };

  // If not showing, return null
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X size={20} />
        </button>
        
        {/* Title */}
        <div className="mb-4 flex items-center gap-2">
          <CloudUpload className="text-blue-400" size={24} />
          <h2 className="text-xl font-bold text-white">S3 Upload</h2>
        </div>
        
        {/* Content */}
        <div className="space-y-4">
          {uploadStatus === 'preparing' && (
            <div className="flex flex-col space-y-4">
              <div className="flex justify-center items-center py-4">
                <RefreshCw className="animate-spin text-blue-400 mr-2" size={24} />
                <span className="text-gray-300">Preparing upload...</span>
              </div>
              
              {/* Encryption option */}
              <div className="p-3 bg-gray-700 rounded-md">
                <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useEncryption}
                    onChange={(e) => setUseEncryption(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-1">
                    <Lock size={16} className={useEncryption ? "text-green-400" : "text-gray-400"} />
                    <span>Encrypt file before upload</span>
                  </div>
                </label>
                <p className="text-xs text-gray-400 mt-1 ml-6">
                  Encrypts the archive with a unique key stored in a separate file in the same bucket
                </p>
              </div>
              
              <button
                onClick={async () => {
                  // Refresh token before starting upload
                  await refreshCsrfToken();
                  startUpload();
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <CloudUpload size={18} />
                {useEncryption ? "Encrypt & Upload" : "Upload to S3"}
              </button>
            </div>
          )}
          
          {uploadStatus === 'uploading' && (
            <div className="space-y-4">
              <div className="text-center text-gray-300">
                {useEncryption ? "Encrypting and uploading archive to S3" : "Uploading archive to S3"}
              </div>
              
              {s3Config && (
                <div className="bg-gray-700 p-3 rounded-md text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Bucket:</span>
                    <span className="text-white">{s3Config.bucket}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Region:</span>
                    <span className="text-white">{s3Config.region}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Prefix:</span>
                    <span className="text-white">{s3Config.prefix || 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Method:</span>
                    <span className="text-white">{usePresignedUrl ? 'Pre-signed URL' : 'Direct SDK'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Encryption:</span>
                    <span className={useEncryption ? "text-green-300" : "text-gray-300"}>
                      {useEncryption ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              )}
              
              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              
              <div className="text-center text-gray-400">
                {progress}% complete
              </div>
            </div>
          )}
          
          {uploadStatus === 'success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="text-green-400" size={48} />
              </div>
              
              <div className="text-center text-green-300 font-medium">
                Upload Successful!
              </div>
              
              <div className="bg-gray-700 p-3 rounded-md text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>Location:</span>
                  <span className="text-white break-all">{uploadResult?.location || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Object Key:</span>
                  <span className="text-white break-all">{uploadResult?.objectKey || 'Unknown'}</span>
                </div>
                {uploadResult?.encrypted && (
                  <div className="flex justify-between">
                    <span>Key File:</span>
                    <span className="text-white break-all">{uploadResult?.keyFile || 'Unknown'}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Encryption:</span>
                  <span className={uploadResult?.encrypted ? "text-green-300" : "text-gray-300"}>
                    {uploadResult?.encrypted ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>ETag:</span>
                  <span className="text-white">{uploadResult?.etag || 'Unknown'}</span>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}
          
          {uploadStatus === 'error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <AlertCircle className="text-red-400" size={48} />
              </div>
              
              <div className="text-center text-red-300 font-medium">
                Upload Failed
              </div>
              
              <div className="bg-red-900/30 p-3 rounded-md text-sm text-red-200">
                {error || 'An unknown error occurred during the upload process.'}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    // Refresh token before retry
                    await refreshCsrfToken();
                    
                    // Toggle options on retry
                    if (useEncryption) {
                      // If encryption failed, try without it
                      setUseEncryption(false);
                    } else if (usePresignedUrl) {
                      // If presigned URL failed, try direct SDK
                      setUsePresignedUrl(false);
                    } else {
                      // If all failed, try with encryption again
                      setUseEncryption(true);
                      setUsePresignedUrl(true);
                    }
                    startUpload();
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Retry with {
                    useEncryption ? "No Encryption" : 
                    usePresignedUrl ? "Direct SDK" : 
                    "Encryption & Presigned URL"
                  }
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default S3UploadModal;