// frontend/src/components/S3UploadModal.jsx
import React, { useState, useEffect } from 'react';
import { X, CloudUpload, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import s3UploadService from '../services/s3UploadService';

const S3UploadModal = ({ show, onClose, archivePath, onSuccess }) => {
  const [uploadStatus, setUploadStatus] = useState('preparing'); // preparing, uploading, success, error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [s3Config, setS3Config] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [usePresignedUrl, setUsePresignedUrl] = useState(true); // Set to true to use pre-signed URL by default

  useEffect(() => {
    if (show && archivePath) {
      startUpload();
    }
  }, [show, archivePath]);

  const startUpload = async () => {
    try {
      setUploadStatus('preparing');
      setProgress(0);
      setError(null);
      
      // Extract file name from path for status tracking
      const archiveFileName = archivePath.split('/').pop();
      
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
      
      // Choose upload method based on flag
      let result;
      if (usePresignedUrl) {
        // Use pre-signed URL approach (more reliable)
        result = await s3UploadService.uploadToS3UsingPresignedUrl(
          archivePath,
          handleProgress
        );
      } else {
        // Use direct SDK approach
        result = await s3UploadService.uploadToS3(
          archivePath,
          config,
          handleProgress
        );
      }
      
      setUploadResult(result);
      setUploadStatus('success');
      
      // Update status on the backend - THIS IS THE NEW CODE
      try {
        await s3UploadService.updateUploadStatus(archiveFileName, 'success', {
          location: result.location,
          bucket: result.bucket,
          objectKey: result.objectKey,
          uploadMethod: usePresignedUrl ? 'presigned-url' : 'direct-sdk',
          uploadedAt: new Date().toISOString()
        });
        console.log('Updated S3 upload status on backend');
      } catch (statusError) {
        // Don't fail the whole operation if status update fails
        console.error('Failed to update S3 upload status on backend:', statusError);
      }
      
      // Notify parent component of success
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      console.error('S3 upload error:', err);
      setError(err.message);
      setUploadStatus('error');
      
      // Update failure status on backend if possible
      try {
        const archiveFileName = archivePath.split('/').pop();
        await s3UploadService.updateUploadStatus(archiveFileName, 'failed', {
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
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="animate-spin text-blue-400 mr-2" size={24} />
              <span className="text-gray-300">Preparing upload...</span>
            </div>
          )}
          
          {uploadStatus === 'uploading' && (
            <div className="space-y-4">
              <div className="text-center text-gray-300">
                Uploading log archive to S3
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
                  onClick={() => {
                    // Toggle the upload method on retry
                    setUsePresignedUrl(!usePresignedUrl);
                    startUpload();
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Retry with {usePresignedUrl ? 'Direct SDK' : 'Pre-signed URL'}
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