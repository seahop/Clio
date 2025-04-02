// frontend/src/components/export/ExportList.jsx
import React from 'react';
import { 
  FileText, 
  RefreshCw, 
  Archive, 
  Trash2, 
  CloudUpload,
  Lock,
  Key,
  CheckSquare,
  Clock,
  AlertCircle
} from 'lucide-react';
import { formatFileSize, formatDate } from './exportUtils';

/**
 * Component for displaying the list of existing exports and their properties
 */
const ExportList = ({ 
  exports, 
  loadingExports, 
  onDeleteExport, 
  onUploadToS3, 
  isS3Configured,
  onRefresh
}) => {
  return (
    <div className="bg-gray-700/50 p-4 rounded-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FileText size={18} className="mr-2" />
          Existing Exports
        </h3>
        <button 
          onClick={onRefresh} 
          className="p-1 text-gray-400 hover:text-white rounded"
          title="Refresh exports list"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      
      {loadingExports ? (
        <div className="flex justify-center items-center py-8">
          <RefreshCw className="animate-spin text-blue-400" />
          <span className="ml-2 text-gray-300">Loading exports...</span>
        </div>
      ) : exports.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="mb-2">No exports found</div>
          <div className="text-sm">Exported files will appear here</div>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
              <tr>
                <th className="px-3 py-2 w-6"></th>
                <th className="px-3 py-2">Filename</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">S3 Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((file, index) => {
                // Decide what icon and class to use based on file type and status
                let fileIcon = <FileText size={16} className="text-blue-400" title="CSV Export" />;
                let rowClass = index % 2 === 0 ? 'bg-gray-800/30' : '';
                
                if (file.fileType === 'evidence') {
                  fileIcon = <Archive size={16} className="text-purple-400" title="Evidence Export" />;
                } else if (file.fileType === 'encrypted') {
                  fileIcon = <Lock size={16} className="text-green-400" title="Encrypted File" />;
                } else if (file.fileType === 'key') {
                  fileIcon = <Key size={16} className="text-yellow-400" title="Encryption Key" />;
                } else if (file.fileType === 'original-encrypted') {
                  fileIcon = <Lock size={16} className="text-gray-400" title="Original (Encrypted Version Available)" />;
                  rowClass += ' opacity-50'; // Dim the original file since it's been replaced by encrypted version
                }
                
                // Don't show upload option for files that have been encrypted or already uploaded
                // Also ensure S3 is properly configured before showing the upload option
                const showUploadOption = isS3Configured && 
                                        !file.s3Status && 
                                        file.isValid !== false && 
                                        !file.isEncrypted &&
                                        file.size > 0;
                
                return (
                  <tr key={file.name} className={`border-b border-gray-700 ${rowClass}`}>
                    <td className="px-3 py-2">
                      {fileIcon}
                    </td>
                    <td className="px-3 py-2 font-medium text-white">
                      {file.name}
                      {file.isEncryptedVersion && file.originalFile && (
                        <span className="ml-1 text-xs text-gray-400">
                          (encrypted from {file.originalFile})
                        </span>
                      )}
                      {file.isKeyFile && file.originalFile && (
                        <span className="ml-1 text-xs text-gray-400">
                          (key for {file.originalFile})
                        </span>
                      )}
                      {file.isEncrypted && (
                        <span className="ml-1 text-xs text-gray-400">
                          (encrypted version available)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatFileSize(file.size)}</td>
                    <td className="px-3 py-2">{formatDate(file.created)}</td>
                    <td className="px-3 py-2">
                      {file.s3Status ? (
                        <span className={`flex items-center gap-1 ${file.s3StatusClass || 'text-green-300'}`}>
                          {file.s3Status === 'Uploaded' && <CheckSquare size={14} />}
                          {file.s3Status === 'Pending' && <Clock size={14} />}
                          {file.s3Status === 'Failed' && <AlertCircle size={14} />}
                          {file.s3Status === 'Encrypted' && <Lock size={14} />}
                          {file.s3Status}
                        </span>
                      ) : (
                        <span className="text-gray-400">Not uploaded</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-2 justify-end">
                        {/* S3 Upload button - only for valid files if S3 is configured */}
                        {showUploadOption && (
                          <button
                            onClick={() => onUploadToS3(file.name)}
                            className="text-blue-400 hover:text-blue-300 p-1 rounded"
                            title="Upload to S3"
                          >
                            <CloudUpload size={16} />
                          </button>
                        )}
                        
                        <button
                          onClick={() => onDeleteExport(file.name)}
                          className="text-red-400 hover:text-red-300 p-1 rounded"
                          title="Delete export"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="mt-4 text-xs text-gray-400">
        <p>File path: <code className="bg-gray-800 px-1 py-0.5 rounded">/app/exports/</code> inside container</p>
        <p className="mt-1">Host path: mounted volume location on your system</p>
      </div>
    </div>
  );
};

export default ExportList;