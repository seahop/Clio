// File path: frontend/src/components/EvidenceUploader.jsx
import React, { useState, useRef } from 'react';
import { Upload, File, AlertCircle, X, Check } from 'lucide-react';
import { useEvidenceApi } from '../hooks/useEvidenceApi';

const EvidenceUploader = ({ logId, onUploadSuccess, csrfToken }) => {
  const [files, setFiles] = useState([]);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef(null);
  
  const {
    uploadEvidenceFiles,
    error,
    setError
  } = useEvidenceApi(csrfToken);

  const handleFileChange = (e) => {
    setUploadSuccess(false);
    setUploadError(null);
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setUploadSuccess(false);
    setUploadError(null);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleRemoveFile = (index) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (files.length === 0) {
      setUploadError('Please select at least one file to upload');
      return;
    }
    
    setUploading(true);
    setUploadError(null);
    
    try {
      const result = await uploadEvidenceFiles(logId, files, description);
      setUploadSuccess(true);
      setFiles([]);
      setDescription('');
      
      if (onUploadSuccess) {
        onUploadSuccess(result);
      }
    } catch (err) {
      setUploadError(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow p-4">
      <h3 className="text-lg font-medium text-white mb-4 flex items-center">
        <Upload size={20} className="mr-2" />
        Upload Evidence
      </h3>
      
      {uploadSuccess && (
        <div className="mb-4 p-3 bg-green-900/50 text-green-200 rounded-md flex items-center">
          <Check size={18} className="mr-2" />
          <span>Files uploaded successfully!</span>
        </div>
      )}
      
      {(uploadError || error) && (
        <div className="mb-4 p-3 bg-red-900/50 text-red-200 rounded-md flex items-center">
          <AlertCircle size={18} className="mr-2" />
          <span>{uploadError || error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        {/* Drag and drop area */}
        <div 
          className="border-2 border-dashed border-gray-600 rounded-md p-6 mb-4 text-center cursor-pointer hover:border-blue-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
            accept="image/jpeg,image/png,image/gif,application/pdf,text/plain,application/octet-stream"
          />
          
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-400">
            Drag and drop files here, or click to select files
          </p>
          <p className="mt-1 text-xs text-gray-500">
            (JPG, PNG, GIF, PDF, TXT, PCAP - Max 5 files, 10MB each)
          </p>
        </div>
        
        {/* File list */}
        {files.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Selected Files ({files.length})</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-gray-700/50 rounded-md">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-700 p-2 rounded-md">
                  <div className="flex items-center overflow-hidden">
                    <File size={16} className="text-blue-400 mr-2 flex-shrink-0" />
                    <span className="text-sm text-white truncate">{file.name}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs text-gray-400 mr-2">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(i)}
                      className="text-gray-400 hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Description */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows="2"
            placeholder="Enter a description of the evidence..."
          />
        </div>
        
        {/* Submit button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading || files.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EvidenceUploader;