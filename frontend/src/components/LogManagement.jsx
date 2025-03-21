// frontend/src/components/LogManagement.jsx
import React, { useState, useEffect } from 'react';
import { 
  HardDrive, 
  RefreshCw, 
  AlertCircle, 
  Check, 
  FileText, 
  Archive, 
  RotateCw,
  Cloud,
  Clock,
  ChevronDown,
  ChevronRight,
  FileWarning // Import missing FileWarning component
} from 'lucide-react';
import S3ConfigPanel from './S3ConfigPanel';
import S3UploadModal from './S3UploadModal';

const LogManagement = ({ csrfToken }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [logStatus, setLogStatus] = useState(null);
  const [rotationInProgress, setRotationInProgress] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showS3Config, setShowS3Config] = useState(false);
  const [s3Enabled, setS3Enabled] = useState(false);
  const [showS3UploadModal, setShowS3UploadModal] = useState(false);
  const [currentArchivePath, setCurrentArchivePath] = useState(null);

  // Fetch log status from the server
  const fetchLogStatus = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      const response = await fetch('/api/health/logs', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch log status: ${response.status}`);
      }

      const data = await response.json();
      setLogStatus(data);
      
      // Check if S3 export is enabled
      try {
        const s3Response = await fetch('/api/logs/s3-config', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (s3Response.ok) {
          const s3Data = await s3Response.json();
          setS3Enabled(s3Data.enabled || false);
        }
      } catch (s3Error) {
        console.error('Error fetching S3 config status:', s3Error);
        // Don't set an error - this is just supplementary information
      }
    } catch (err) {
      console.error('Error fetching log status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Trigger log rotation
  const triggerRotation = async (useS3 = null) => {
    const confirmMessage = useS3 === true 
      ? 'Are you sure you want to rotate logs and export to S3? This will archive current logs, reset log files, and upload archives to the configured S3 bucket.'
      : useS3 === false
        ? 'Are you sure you want to rotate logs WITHOUT S3 export? This will archive current logs and reset log files locally only.'
        : 'Are you sure you want to rotate logs now? This will archive current logs and reset log files.';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setRotationInProgress(true);
      setError(null);
      setMessage(null);
      
      const requestBody = {};
      
      // Only include useS3 param if explicitly specified
      if (useS3 !== null) {
        requestBody.useS3 = useS3;
      }
      
      const response = await fetch('/api/logs/rotate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to trigger log rotation');
      }

      const data = await response.json();
      setMessage(data.message || 'Log rotation completed successfully');
      
      // If S3 export was requested and succeeded, show the S3 upload modal
      if (useS3 === true && data.success && data.archivePath) {
        setCurrentArchivePath(data.archivePath);
        setShowS3UploadModal(true);
      }
      
      // Refresh log status after rotation
      await fetchLogStatus();
    } catch (err) {
      console.error('Error triggering log rotation:', err);
      setError(err.message);
    } finally {
      setRotationInProgress(false);
    }
  };

  // Handle S3 config changes
  const handleS3ConfigSaved = (data) => {
    setS3Enabled(data.config?.enabled || false);
    setMessage('S3 configuration updated successfully');
  };

  // Handle S3 upload success
  const handleS3UploadSuccess = (result) => {
    console.log('S3 upload successful:', result);
    setMessage(`Log archive successfully uploaded to S3: ${result.location}`);
    // After 3 seconds, close the modal
    setTimeout(() => {
      setShowS3UploadModal(false);
    }, 3000);
  };

  // Load log status on component mount
  useEffect(() => {
    fetchLogStatus();
  }, []);

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    return new Date(dateString).toLocaleString();
  };

  if (loading && !refreshing) {
    return (
      <div className="flex justify-center items-center py-8">
        <RefreshCw className="animate-spin text-blue-400 mr-2" size={20} />
        <span className="text-gray-300">Loading log status...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">Log Management</h2>
      </div>

      {/* Error and success messages */}
      {(message || error) && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
          message ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          {message ? <Check size={20} /> : <AlertCircle size={20} />}
          <span>{message || error}</span>
        </div>
      )}

      {/* Actions and info */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2">
            <RotateCw className="text-blue-400" size={18} />
            Log Rotation
          </h3>
          <p className="text-gray-300 text-sm mb-4">
            Logs are automatically rotated daily and when they reach capacity. You can also trigger rotation manually.
          </p>
          {logStatus?.logRotation && (
            <div className="text-sm text-gray-400 mb-4">
              <div className="flex justify-between">
                <span>Rotation interval:</span>
                <span className="text-gray-300">{logStatus.logRotation.rotationIntervalFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span>Maximum logs per file:</span>
                <span className="text-gray-300">{logStatus.logRotation.maxLogsPerFile.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className={`${logStatus.logRotation.isInitialized ? 'text-green-300' : 'text-red-300'}`}>
                  {logStatus.logRotation.isInitialized ? 'Active' : 'Inactive'}
                </span>
              </div>
              {s3Enabled && (
                <div className="flex justify-between">
                  <span>S3 Export:</span>
                  <span className="text-green-300">Enabled</span>
                </div>
              )}
            </div>
          )}
          
          {s3Enabled ? (
            <div className="space-y-2">
              <button
                onClick={() => triggerRotation(true)}
                disabled={rotationInProgress}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {rotationInProgress ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Rotating Logs...
                  </>
                ) : (
                  <>
                    <Cloud size={16} />
                    Rotate Logs with S3 Export
                  </>
                )}
              </button>
              
              <button
                onClick={() => triggerRotation(false)}
                disabled={rotationInProgress}
                className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {rotationInProgress ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Rotating Logs...
                  </>
                ) : (
                  <>
                    <RotateCw size={16} />
                    Rotate Logs (Local Only)
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => triggerRotation()}
              disabled={rotationInProgress}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {rotationInProgress ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Rotating Logs...
                </>
              ) : (
                <>
                  <RotateCw size={16} />
                  Rotate Logs Now
                </>
              )}
            </button>
          )}
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2">
            <Archive className="text-purple-400" size={18} />
            Archives
          </h3>
          {logStatus?.archives ? (
            <>
              <p className="text-gray-300 text-sm mb-2">
                {logStatus.totalArchives} archived log file{logStatus.totalArchives !== 1 ? 's' : ''} available
              </p>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Recent archives:</span>
                <span className="text-gray-300">{logStatus.archives.length}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Location:</span>
                <span className="text-gray-300">backend/data/archives</span>
              </div>
              {s3Enabled && (
                <div className="flex justify-between text-sm text-gray-400 mt-1">
                  <span>S3 Backup:</span>
                  <span className="text-green-300">Enabled</span>
                </div>
              )}
              <div className="mt-4 text-xs text-gray-500">
                View the full list in the Export panel.
              </div>
            </>
          ) : (
            <p className="text-gray-300 text-sm">No archive information available</p>
          )}
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2">
            <Clock className="text-yellow-400" size={18} />
            Status
          </h3>
          {logStatus ? (
            <>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Last check:</span>
                <span className="text-gray-300">{formatDate(logStatus.timestamp)}</span>
              </div>
              <button
                onClick={fetchLogStatus}
                disabled={refreshing}
                className="mt-4 px-3 py-1.5 w-full bg-gray-700 text-gray-300 rounded-md text-sm flex items-center justify-center gap-1 hover:bg-gray-600 disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? 'Refreshing...' : 'Refresh Status'}
              </button>
            </>
          ) : (
            <p className="text-gray-300 text-sm">No status information available</p>
          )}
        </div>
      </div>

      {/* S3 Configuration Section */}
      <div className="mb-6">
        <button
          onClick={() => setShowS3Config(!showS3Config)}
          className="w-full p-4 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Cloud className="text-blue-400" size={18} />
            <h3 className="text-lg font-medium text-white">S3 Export Configuration</h3>
            {s3Enabled && (
              <span className="bg-green-900/50 text-green-300 text-xs px-2 py-0.5 rounded">
                Enabled
              </span>
            )}
          </div>
          {showS3Config ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
        
        {showS3Config && (
          <div className="mt-1 p-1">
            <S3ConfigPanel 
              csrfToken={csrfToken} 
              onConfigSaved={handleS3ConfigSaved}
            />
          </div>
        )}
      </div>

      {/* Log files status */}
      <div className="bg-gray-800 p-4 rounded-lg mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <FileText size={18} />
            Active Log Files
          </h3>
          <div className="text-sm text-gray-400">
            {refreshing && (
              <div className="flex items-center">
                <RefreshCw size={14} className="animate-spin mr-2" />
                <span>Refreshing...</span>
              </div>
            )}
          </div>
        </div>

        {logStatus?.logs ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th className="px-3 py-2">Log File</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Log Entries</th>
                  <th className="px-3 py-2">Capacity</th>
                  <th className="px-3 py-2">Last Modified</th>
                </tr>
              </thead>
              <tbody>
                {logStatus.logs.map((log, index) => (
                  <tr 
                    key={log.file} 
                    className={`${index % 2 === 0 ? 'bg-gray-800/30' : ''} border-b border-gray-700`}
                  >
                    <td className="px-3 py-2 font-medium text-white">
                      {log.file}
                    </td>
                    <td className="px-3 py-2">
                      {log.status === 'ok' ? (
                        <span className="flex items-center gap-1 text-green-300">
                          <Check size={14} />
                          OK
                        </span>
                      ) : log.status === 'corrupted' ? (
                        <span className="flex items-center gap-1 text-red-300">
                          <AlertCircle size={14} />
                          Corrupted
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-yellow-300">
                          <AlertCircle size={14} />
                          {log.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {log.sizeFormatted || formatFileSize(log.size)}
                    </td>
                    <td className="px-3 py-2">
                      {typeof log.logCount === 'number' ? log.logCount.toLocaleString() : log.logCount}
                    </td>
                    <td className="px-3 py-2">
                      {typeof log.percentFull === 'number' && (
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-700 rounded-full h-2.5">
                            <div 
                              className={`h-2.5 rounded-full ${
                                log.percentFull > 90 ? 'bg-red-600' : 
                                log.percentFull > 70 ? 'bg-yellow-500' : 
                                'bg-green-600'
                              }`} 
                              style={{ width: `${log.percentFull}%` }}
                            ></div>
                          </div>
                          <span>{log.percentFull}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {log.lastModified ? formatDate(log.lastModified) : 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <FileWarning size={40} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">No log status information available</p>
            <button
              onClick={fetchLogStatus}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Refresh Status
            </button>
          </div>
        )}
      </div>

      {/* Recent archives */}
      {logStatus?.archives && logStatus.archives.length > 0 && (
        <div className="bg-gray-800 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Archive size={18} />
            Recent Archives
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th className="px-3 py-2">Filename</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">S3 Status</th>
                </tr>
              </thead>
              <tbody>
                {logStatus.archives.map((archive, index) => (
                  <tr 
                    key={archive.file} 
                    className={`${index % 2 === 0 ? 'bg-gray-800/30' : ''} border-b border-gray-700`}
                  >
                    <td className="px-3 py-2 font-medium text-white flex items-center gap-2">
                      <Archive size={14} className="text-purple-400" />
                      {archive.file}
                    </td>
                    <td className="px-3 py-2">
                      {archive.sizeFormatted || formatFileSize(archive.size)}
                    </td>
                    <td className="px-3 py-2">
                      {formatDate(archive.created)}
                    </td>
                    <td className="px-3 py-2">
                      {archive.s3Uploaded ? (
                        <span className="flex items-center gap-1 text-green-300">
                          <Cloud size={14} />
                          Uploaded
                        </span>
                      ) : s3Enabled ? (
                        <span className="flex items-center gap-1 text-yellow-300">
                          <Clock size={14} />
                          Pending
                        </span>
                      ) : (
                        <span className="text-gray-400">Not configured</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-center">
            <p className="text-gray-400 text-sm">
              Archives are stored on the server. Use the export feature to manage archives.
            </p>
          </div>
        </div>
      )}
      
      {/* S3 Upload Modal */}
      {showS3UploadModal && (
        <S3UploadModal
          show={showS3UploadModal}
          onClose={() => setShowS3UploadModal(false)}
          archivePath={currentArchivePath}
          onSuccess={handleS3UploadSuccess}
        />
      )}
    </div>
  );
};

export default LogManagement;