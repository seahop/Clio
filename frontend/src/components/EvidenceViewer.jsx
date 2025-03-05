// File path: frontend/src/components/EvidenceViewer.jsx
import React, { useState, useEffect } from 'react';
import { FileText, Download, Trash2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { useEvidenceApi } from '../hooks/useEvidenceApi';

const EvidenceViewer = ({ logId, csrfToken, isAdmin, currentUser }) => {
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const {
    loading,
    error,
    fetchEvidenceFiles,
    getEvidenceFileUrl,
    getEvidenceFileDownloadUrl,
    deleteEvidenceFile
  } = useEvidenceApi(csrfToken);

  useEffect(() => {
    const loadEvidenceFiles = async () => {
      if (logId) {
        const files = await fetchEvidenceFiles(logId);
        setEvidenceFiles(files || []);
      }
    };
    
    loadEvidenceFiles();
  }, [logId, refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this evidence file? This action cannot be undone.')) {
      return;
    }
    
    try {
      await deleteEvidenceFile(fileId);
      // Remove from local state
      setEvidenceFiles(prev => prev.filter(file => file.id !== fileId));
      // If this was the selected file, deselect it
      if (selectedFile && selectedFile.id === fileId) {
        setSelectedFile(null);
      }
    } catch (err) {
      console.error('Failed to delete evidence file:', err);
      // The error will be shown via the error state from the hook
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Determine if file is an image that can be previewed
  const isPreviewable = (file) => {
    return file.file_type.startsWith('image/');
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-medium text-white flex items-center">
          <FileText size={20} className="mr-2" />
          Evidence Files {evidenceFiles.length > 0 && `(${evidenceFiles.length})`}
        </h3>
        
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 text-gray-400 hover:text-white rounded-full"
          title="Refresh evidence files"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      
      {error && (
        <div className="p-4 bg-red-900/50 text-red-200 rounded-md m-4 flex items-center">
          <AlertCircle size={18} className="mr-2" />
          <span>{error}</span>
        </div>
      )}
      
      <div className="p-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            <p>Loading evidence files...</p>
          </div>
        ) : evidenceFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No evidence files attached to this log.</p>
            <p className="text-sm mt-2">Use the uploader to attach files as evidence.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* File list */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Evidence Files</h4>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {evidenceFiles.map(file => (
                  <div 
                    key={file.id} 
                    className={`flex items-center justify-between p-2 rounded-md hover:bg-gray-700 cursor-pointer transition-colors ${
                      selectedFile?.id === file.id ? 'bg-gray-700 ring-1 ring-blue-500' : 'bg-gray-800'
                    }`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <div className="flex items-center overflow-hidden">
                      <FileText size={16} className="text-blue-400 mr-2 flex-shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-sm text-white truncate">
                          {file.original_filename}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(file.upload_date)} by {file.uploaded_by}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs text-gray-400 mr-2">
                        {formatFileSize(file.file_size)}
                      </span>
                      
                      <a
                        href={getEvidenceFileDownloadUrl(file.id)}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-blue-400 p-1"
                        title="Download file"
                      >
                        <Download size={16} />
                      </a>
                      
                      {(isAdmin || currentUser === file.uploaded_by) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file.id);
                          }}
                          className="text-gray-400 hover:text-red-400 p-1"
                          title="Delete file"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* File preview */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">
                {selectedFile ? 'File Preview' : 'Select a file to preview'}
              </h4>
              
              {selectedFile ? (
                <div>
                  <div className="mb-3 flex justify-between items-center">
                    <h5 className="text-white font-medium truncate">
                      {selectedFile.original_filename}
                    </h5>
                    <a
                      href={getEvidenceFileUrl(selectedFile.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 flex items-center text-xs"
                    >
                      Open in new tab
                      <ExternalLink size={12} className="ml-1" />
                    </a>
                  </div>
                  
                  <div className="bg-gray-800 rounded-md p-2 mb-3">
                    {isPreviewable(selectedFile) ? (
                      <div className="flex justify-center">
                        <img 
                          src={getEvidenceFileUrl(selectedFile.id)} 
                          alt={selectedFile.original_filename}
                          className="max-h-72 max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <FileText size={48} className="mx-auto mb-2 opacity-50" />
                        <p>Preview not available for this file type.</p>
                        <a
                          href={getEvidenceFileUrl(selectedFile.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-2 px-3 py-1 bg-gray-700 text-blue-400 rounded-md text-sm hover:bg-gray-600"
                        >
                          Open file
                        </a>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-800 p-2 rounded-md">
                      <p className="text-gray-400">Upload Date</p>
                      <p className="text-white">{formatDate(selectedFile.upload_date)}</p>
                    </div>
                    <div className="bg-gray-800 p-2 rounded-md">
                      <p className="text-gray-400">File Size</p>
                      <p className="text-white">{formatFileSize(selectedFile.file_size)}</p>
                    </div>
                    <div className="bg-gray-800 p-2 rounded-md">
                      <p className="text-gray-400">File Type</p>
                      <p className="text-white">{selectedFile.file_type}</p>
                    </div>
                    <div className="bg-gray-800 p-2 rounded-md">
                      <p className="text-gray-400">Uploaded By</p>
                      <p className="text-white">{selectedFile.uploaded_by}</p>
                    </div>
                  </div>
                  
                  {selectedFile.description && (
                    <div className="mt-3 bg-gray-800 p-2 rounded-md">
                      <p className="text-gray-400 text-xs">Description</p>
                      <p className="text-white text-sm mt-1">{selectedFile.description}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <FileText size={48} className="mx-auto mb-4 opacity-30" />
                  <p>Select a file from the list to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvidenceViewer;