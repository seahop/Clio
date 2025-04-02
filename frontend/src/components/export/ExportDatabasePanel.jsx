// frontend/src/components/export/ExportDatabasePanel.jsx
import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import MessageBanner from './MessageBanner';
import ExportControls from './ExportControls';
import ExportList from './ExportList';
import S3UploadModal from '../S3UploadModal';
import s3UploadService from '../../services/s3UploadService';

const ExportDatabasePanel = ({ csrfToken }) => {
  // Main component state
  const [loading, setLoading] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(true);
  const [loadingExports, setLoadingExports] = useState(true);
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [exports, setExports] = useState([]);
  
  // Export configuration state
  const [exportMode, setExportMode] = useState('csv'); // 'csv' or 'evidence'
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [includeRelations, setIncludeRelations] = useState(true);
  const [includeHashes, setIncludeHashes] = useState(true);
  const [decryptSensitiveData, setDecryptSensitiveData] = useState(false);
  
  // S3 state
  const [s3Config, setS3Config] = useState(null);
  const [loadingS3Config, setLoadingS3Config] = useState(true);
  const [uploadToS3, setUploadToS3] = useState(false);
  const [showS3Modal, setShowS3Modal] = useState(false);
  const [currentExportPath, setCurrentExportPath] = useState(null);
  const [currentExportFilename, setCurrentExportFilename] = useState(null);
  
  // UI state
  const [expandInstructions, setExpandInstructions] = useState(false);

  // Fetch initial data on component mount
  useEffect(() => {
    fetchColumns();
    fetchExports();
    fetchS3Config();
  }, []);

  // Fetch S3 configuration to determine if S3 uploads are available
  const fetchS3Config = async () => {
    try {
      setLoadingS3Config(true);
      const config = await s3UploadService.getS3Config();
      setS3Config(config);
      // Default to off, let user explicitly enable it
      setUploadToS3(false);
    } catch (error) {
      console.error('Error fetching S3 config:', error);
      // Don't show an error to the user, just disable S3 option
      setS3Config(null);
    } finally {
      setLoadingS3Config(false);
    }
  };

  // Fetch available columns for export
  const fetchColumns = async () => {
    try {
      setLoadingColumns(true);
      const response = await fetch('/api/export/columns', {
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch columns');
      }

      const data = await response.json();
      setColumns(data);
      
      // Pre-select recommended columns
      const recommended = data
        .filter(col => col.recommended)
        .map(col => col.name);
      
      setSelectedColumns(recommended);
    } catch (error) {
      console.error('Error fetching columns:', error);
      setError('Failed to fetch columns. Please try again.');
    } finally {
      setLoadingColumns(false);
    }
  };

  // Fetch existing exports
  const fetchExports = async () => {
    try {
      setLoadingExports(true);
      const response = await fetch('/api/export/list', {
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });
  
      if (!response.ok) {
        throw new Error('Failed to fetch exports');
      }
  
      const data = await response.json();
      
      // Fetch S3 status information separately
      let s3StatusData = {};
      let fileRelationships = {};
      try {
        const s3StatusResponse = await fetch('/api/export/s3-status', {
          credentials: 'include',
          headers: {
            'CSRF-Token': csrfToken
          }
        });
        
        if (s3StatusResponse.ok) {
          s3StatusData = await s3StatusResponse.json();
          console.log('Fetched S3 status information:', Object.keys(s3StatusData).length);
  
          // Extract file relationships from the status data
          Object.keys(s3StatusData).forEach(filename => {
            const fileStatus = s3StatusData[filename];
            
            // If this is an original file that has been encrypted
            if (fileStatus.status === 'encrypted' && fileStatus.encryptedFiles) {
              fileRelationships[filename] = fileStatus.encryptedFiles;
            }
            
            // If this is an encrypted or key file
            if (fileStatus.originalFile) {
              if (!fileRelationships[fileStatus.originalFile]) {
                fileRelationships[fileStatus.originalFile] = {};
              }
              
              // Determine if this is an encrypted or key file based on filename or details
              if (filename.includes('.encrypted.') || 
                  (fileStatus.details && fileStatus.details.isEncrypted)) {
                fileRelationships[fileStatus.originalFile].encryptedFile = filename;
              } else if (filename.includes('.key.') || 
                        (fileStatus.details && fileStatus.details.isKeyFile)) {
                fileRelationships[fileStatus.originalFile].keyFile = filename;
              }
            }
          });
        }
      } catch (s3StatusError) {
        console.error('Error fetching S3 status information:', s3StatusError);
        // Continue with empty S3 status data
      }
      
      // Process exports to include S3 status information
      const processedExports = data.map(exportFile => {
        // Default S3 status display (will be overridden if status exists)
        let s3Status = null;
        let s3StatusClass = '';
        let fileType = exportFile.type || 'unknown';
        let isValid = true; // Assume all files are valid by default
        
        // Check if this file has been encrypted and replaced by encrypted versions
        const isEncrypted = fileRelationships[exportFile.name] !== undefined;
        if (isEncrypted) {
          // This is an original file that has been encrypted
          fileType = 'original-encrypted';
          s3Status = 'Encrypted';
          s3StatusClass = 'text-purple-300';
          isValid = false; // Mark original as invalid since it's been encrypted
        }
        
        // Check if this file is an encrypted version or key file
        const isEncryptedVersion = exportFile.name.includes('.encrypted.');
        const isKeyFile = exportFile.name.includes('.key.');
        
        if (isEncryptedVersion) {
          fileType = 'encrypted';
        } else if (isKeyFile) {
          fileType = 'key';
        }
        
        // Check for explicit status from the S3 status endpoint
        if (s3StatusData[exportFile.name]) {
          const fileStatus = s3StatusData[exportFile.name];
          
          // Only apply status if this file is still valid (not replaced by encrypted versions)
          if (isValid || fileType === 'encrypted' || fileType === 'key') {
            // Set appropriate style based on status
            switch (fileStatus.status) {
              case 'success':
                s3Status = 'Uploaded';
                s3StatusClass = 'text-green-300';
                break;
              case 'pending':
                s3Status = 'Pending';
                s3StatusClass = 'text-yellow-300';
                break;
              case 'failed':
                s3Status = 'Failed';
                s3StatusClass = 'text-red-300';
                break;
              case 'encrypted':
                s3Status = 'Encrypted';
                s3StatusClass = 'text-purple-300';
                isValid = false; // Mark as invalid since it's been encrypted
                break;
              default:
                s3Status = fileStatus.status;
                s3StatusClass = 'text-blue-300';
            }
          }
        } 
        // Then check the export file's own properties
        else if (exportFile.s3Status) {
          // Only apply status if this file is still valid
          if (isValid) {
            s3Status = exportFile.s3Status;
            // Set appropriate style based on status
            switch (exportFile.s3Status) {
              case 'success':
              case 'uploaded':
                s3Status = 'Uploaded';
                s3StatusClass = 'text-green-300';
                break;
              case 'pending':
                s3Status = 'Pending';
                s3StatusClass = 'text-yellow-300';
                break;
              case 'failed':
                s3Status = 'Failed';
                s3StatusClass = 'text-red-300';
                break;
              default:
                s3Status = exportFile.s3Status;
                s3StatusClass = 'text-blue-300';
            }
          }
        }
        
        return {
          ...exportFile,
          s3Status,
          s3StatusClass,
          fileType,
          isValid,
          isEncrypted,
          isEncryptedVersion,
          isKeyFile,
          s3Details: s3StatusData[exportFile.name]?.details || exportFile.s3Details,
          relationshipInfo: isEncrypted ? fileRelationships[exportFile.name] : null,
          originalFile: (isEncryptedVersion || isKeyFile) && s3StatusData[exportFile.name]?.originalFile 
            ? s3StatusData[exportFile.name].originalFile 
            : null
        };
      });
      
      // Sort exports by creation time, but keep related files together
      const sortedExports = [...processedExports].sort((a, b) => {
        // If a is related to b or vice versa, keep them together
        if (a.originalFile === b.name || b.originalFile === a.name) {
          return 0;
        }
        
        // Otherwise sort by timestamp (newest first)
        return new Date(b.timestamp || b.created) - new Date(a.timestamp || a.created);
      });
      
      setExports(sortedExports);
    } catch (error) {
      console.error('Error fetching exports:', error);
      setError('Failed to fetch existing exports. Please try again.');
    } finally {
      setLoadingExports(false);
    }
  };

  // Handle column selection toggling
  const handleColumnToggle = (columnName) => {
    setSelectedColumns(prev => {
      if (prev.includes(columnName)) {
        return prev.filter(col => col !== columnName);
      } else {
        return [...prev, columnName];
      }
    });
  };

  // Helper function to select/deselect all columns
  const handleSelectAll = () => {
    setSelectedColumns(columns.map(col => col.name));
  };

  const handleSelectNone = () => {
    setSelectedColumns([]);
  };

  // Export data based on selected options
  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      setError('Please select at least one column to export');
      return;
    }
  
    try {
      setLoading(true);
      setMessage(null);
      setError(null);
      
      // Clear any previous export path
      setCurrentExportPath(null);
      setCurrentExportFilename(null);
  
      // Determine endpoint based on export mode
      const endpoint = exportMode === 'evidence' ? '/api/export/evidence' : '/api/export/csv';
  
      // Make sure hash columns are included if the hash option is selected
      let columnsToExport = [...selectedColumns];
      if (exportMode === 'evidence' && includeHashes) {
        // Add hash columns if they're not already selected
        if (!columnsToExport.includes('hash_algorithm')) {
          columnsToExport.push('hash_algorithm');
        }
        if (!columnsToExport.includes('hash_value')) {
          columnsToExport.push('hash_value');
        }
      }
  
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ 
          selectedColumns: columnsToExport,
          includeEvidence: exportMode === 'evidence' ? includeEvidence : false,
          includeRelations: exportMode === 'evidence' ? includeRelations : false,
          includeHashes: exportMode === 'evidence' ? includeHashes : false,
          decryptSensitiveData: decryptSensitiveData
        })
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }
  
      const data = await response.json();
      
      // Set specific message based on export type
      if (exportMode === 'evidence') {
        let successMessage = `Evidence export completed successfully! Created ${data.details.filename} with ${data.details.logCount} logs and ${data.details.evidenceCount} evidence files.`;
        if (data.details.includesRelations) {
          successMessage += ' Relations data included.';
        }
        if (data.details.includesHashes) {
          successMessage += ' Hash information included.';
        }
        if (data.details.includesDecryptedData) {
          successMessage += ' Sensitive data was decrypted.';
        }
        setMessage(successMessage);
      } else {
        let successMessage = `CSV export completed successfully! ${data.details.rowCount} rows exported to ${data.details.filename || data.details.filePath.split('/').pop()}`;
        if (data.details.includedDecryptedData) {
          successMessage += ' with decrypted sensitive data.';
        }
        setMessage(successMessage);
      }
      
      // Refresh the exports list
      await fetchExports();
      
      // If uploadToS3 is enabled and we have valid file details, prepare for S3 upload
      if (uploadToS3 && data.details) {
        // Extract filename from path and store for S3 upload
        const fullPath = data.details.filePath;
        const filename = data.details.filename || fullPath.split('/').pop();
        
        console.log('Export completed, preparing for S3 upload:', {
          path: fullPath,
          filename: filename
        });
        
        // Store both the web path and the filename
        setCurrentExportPath(`/exports/${filename}`);
        setCurrentExportFilename(filename);
        
        // Add a longer delay to ensure the file is completely written and accessible
        // and refresh the CSRF token before showing the modal
        setTimeout(async () => {
          try {
            console.log('Refreshing CSRF token before S3 upload...');
            
            // Refresh CSRF token to ensure it's still valid
            const csrfResponse = await fetch('/api/csrf-token', {
              credentials: 'include',
              headers: {
                'Accept': 'application/json'
              }
            });
            
            if (csrfResponse.ok) {
              const csrfData = await csrfResponse.json();
              // Update the global CSRF token in the window object
              if (csrfData.csrfToken) {
                window.csrfToken = csrfData.csrfToken;
                console.log('CSRF token refreshed successfully');
              }
            }
            
            console.log('Initiating S3 upload after delay for file:', filename);
            setShowS3Modal(true);
          } catch (tokenError) {
            console.error('Error refreshing CSRF token:', tokenError);
            setError('Failed to prepare S3 upload. Please try uploading manually.');
          }
        }, 1500); // 1.5 seconds for filesystem operations to complete
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      setError(error.message || 'Failed to export data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Delete an export file
  const handleDeleteExport = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/export/${filename}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete export');
      }

      setMessage(`Deleted ${filename} successfully`);
      fetchExports();
    } catch (error) {
      console.error('Error deleting export:', error);
      setError(`Failed to delete ${filename}. Please try again.`);
    }
  };

  // Handle S3 upload success
  const handleS3UploadSuccess = async (result) => {
    setMessage(prev => `${prev} Successfully uploaded to S3 bucket: ${result.bucket}.`);
    
    // Update the status in the backend if we have a filename
    if (currentExportFilename) {
      try {
        // Update the S3 status on the backend
        await s3UploadService.updateExportStatus(currentExportFilename, 'success', {
          location: result.location,
          bucket: result.bucket,
          objectKey: result.objectKey,
          uploadedAt: new Date().toISOString()
        });
        
        // Refresh exports list to show updated status
        fetchExports();
      } catch (statusError) {
        console.error('Failed to update export S3 status:', statusError);
        // Don't show an error, this is a non-critical operation
      }
    }
    
    setShowS3Modal(false);
  };

  // Start the S3 upload for an existing export
  const handleUploadToS3 = (filename) => {
    setCurrentExportPath(`/exports/${filename}`);
    setCurrentExportFilename(filename);
    setShowS3Modal(true);
  };

  // Determine if export has sensitive data
  const hasSensitiveData = selectedColumns.includes('secrets');

  // Check if S3 is properly configured
  const isS3Configured = s3Config && s3Config.enabled && s3Config.bucket && s3Config.accessKeyId && s3Config.secretAccessKey;

  // Toggle export instructions visibility
  const toggleInstructions = () => {
    setExpandInstructions(!expandInstructions);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Download className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">Export Database</h2>
      </div>

      {/* Message/Error Banner */}
      <MessageBanner 
        message={message} 
        error={error} 
      />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left panel - Export Controls */}
        <ExportControls
          columns={columns}
          selectedColumns={selectedColumns}
          loadingColumns={loadingColumns}
          onColumnToggle={handleColumnToggle}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          exportMode={exportMode}
          setExportMode={setExportMode}
          includeEvidence={includeEvidence}
          setIncludeEvidence={setIncludeEvidence}
          includeRelations={includeRelations}
          setIncludeRelations={setIncludeRelations}
          includeHashes={includeHashes}
          setIncludeHashes={setIncludeHashes}
          decryptSensitiveData={decryptSensitiveData}
          setDecryptSensitiveData={setDecryptSensitiveData}
          uploadToS3={uploadToS3}
          setUploadToS3={setUploadToS3}
          isS3Configured={isS3Configured}
          loadingS3Config={loadingS3Config}
          hasSensitiveData={hasSensitiveData}
          loading={loading}
          onExport={handleExport}
          expandInstructions={expandInstructions}
          toggleInstructions={toggleInstructions}
        />
        
        {/* Right panel - Export List */}
        <ExportList
          exports={exports}
          loadingExports={loadingExports}
          onDeleteExport={handleDeleteExport}
          onUploadToS3={handleUploadToS3}
          isS3Configured={isS3Configured}
          onRefresh={fetchExports}
        />
      </div>

      {/* S3 Upload Modal */}
      {showS3Modal && (
        <S3UploadModal
          show={showS3Modal}
          onClose={() => setShowS3Modal(false)}
          archivePath={currentExportPath}
          onSuccess={handleS3UploadSuccess}
        />
      )}
    </div>
  );
};

export default ExportDatabasePanel;