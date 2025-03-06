// frontend/src/components/ExportDatabasePanel.jsx
import React, { useState, useEffect } from 'react';
import { 
  Download, 
  CheckSquare, 
  Square, 
  Trash2, 
  RefreshCw, 
  FileText, 
  AlertCircle,
  Image,
  Database,
  Archive,
  Network,
  Lock
} from 'lucide-react';

const ExportDatabasePanel = ({ csrfToken }) => {
  const [loading, setLoading] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(true);
  const [loadingExports, setLoadingExports] = useState(true);
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [exports, setExports] = useState([]);
  const [expandInstructions, setExpandInstructions] = useState(false);
  const [exportMode, setExportMode] = useState('csv'); // 'csv' or 'evidence'
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [includeRelations, setIncludeRelations] = useState(true); // New state for relations toggle
  const [includeHashes, setIncludeHashes] = useState(true);

  useEffect(() => {
    fetchColumns();
    fetchExports();
  }, []);

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
      setExports(data);
    } catch (error) {
      console.error('Error fetching exports:', error);
      setError('Failed to fetch existing exports. Please try again.');
    } finally {
      setLoadingExports(false);
    }
  };

  const handleColumnToggle = (columnName) => {
    setSelectedColumns(prev => {
      if (prev.includes(columnName)) {
        return prev.filter(col => col !== columnName);
      } else {
        return [...prev, columnName];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedColumns(columns.map(col => col.name));
  };

  const handleSelectNone = () => {
    setSelectedColumns([]);
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      setError('Please select at least one column to export');
      return;
    }
  
    try {
      setLoading(true);
      setMessage(null);
      setError(null);
  
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
          includeHashes: exportMode === 'evidence' ? includeHashes : false
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
        setMessage(successMessage);
      } else {
        setMessage(`CSV export completed successfully! ${data.details.rowCount} rows exported to ${data.details.filePath}`);
      }
      
      // Refresh the exports list
      fetchExports();
    } catch (error) {
      console.error('Error exporting data:', error);
      setError(error.message || 'Failed to export data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString) => {
    try {
      // Return a clear message for undefined/null dates
      if (!dateString) return 'Unknown date';
  
      // Try to create a proper date object
      const date = new Date(dateString);
      
      // Detect invalid dates (including epoch time around Jan 1, 1970)
      if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
        // If we get a very old date or invalid date, just show the current time
        return new Date().toLocaleString();
      }
      
      // Otherwise return a properly formatted date
      return date.toLocaleString();
    } catch (error) {
      console.error('Date formatting error:', error);
      // Return current time as fallback
      return new Date().toLocaleString();
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Download className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">Export Database</h2>
      </div>

      {(message || error) && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
          message ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          {message ? <CheckSquare size={20} /> : <AlertCircle size={20} />}
          <span>{message || error}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left panel - Column Selection */}
        <div className="bg-gray-700/50 p-4 rounded-md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Select Columns</h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1 bg-blue-600/30 text-blue-200 rounded text-xs hover:bg-blue-600/50"
              >
                Select All
              </button>
              <button
                onClick={handleSelectNone}
                className="px-3 py-1 bg-gray-600/30 text-gray-200 rounded text-xs hover:bg-gray-600/50"
              >
                Clear
              </button>
            </div>
          </div>
          
          {/* Export mode selection */}
          <div className="mb-4 bg-gray-800/50 p-3 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Export Type:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setExportMode('csv')}
                  className={`px-3 py-1 rounded text-xs flex items-center gap-1 ${
                    exportMode === 'csv' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <Database size={14} />
                  CSV Only
                </button>
                <button
                  onClick={() => setExportMode('evidence')}
                  className={`px-3 py-1 rounded text-xs flex items-center gap-1 ${
                    exportMode === 'evidence' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <Archive size={14} />
                  With Evidence
                </button>
              </div>
            </div>
            
            {exportMode === 'evidence' && (
              <div className="mt-2 pt-2 border-t border-gray-700">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={includeEvidence}
                    onChange={(e) => setIncludeEvidence(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  Include evidence files in the export
                </label>
                
                {/* New checkbox for hash information */}
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={includeHashes}
                    onChange={(e) => setIncludeHashes(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-1">
                    <Lock size={14} className="text-purple-400" />
                    Include hash information in the export
                  </div>
                </label>
                
                {/* Existing relations checkbox */}
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeRelations}
                    onChange={(e) => setIncludeRelations(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-1">
                    <Network size={14} className="text-blue-400" />
                    Include relation data in the export
                  </div>
                </label>

                <p className="text-xs text-gray-400 mt-2">
                  Creates an HTML viewer and ZIP package with all logs, evidence files, and optional relation data
                </p>
              </div>
            )}
          </div>
          
          {/* Column selection */}
          {loadingColumns ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="animate-spin text-blue-400" />
              <span className="ml-2 text-gray-300">Loading columns...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
              {columns.map(column => (
                <div
                  key={column.name}
                  className={`flex items-center p-2 rounded cursor-pointer hover:bg-gray-600/50 ${
                    column.sensitive ? 'border-l-2 border-red-500' : ''
                  }`}
                  onClick={() => handleColumnToggle(column.name)}
                >
                  {selectedColumns.includes(column.name) ? (
                    <CheckSquare size={18} className="text-blue-400 mr-2" />
                  ) : (
                    <Square size={18} className="text-gray-400 mr-2" />
                  )}
                  <div>
                    <span className="text-white">{column.name}</span>
                    <span className="text-xs text-gray-400 ml-2">({column.type})</span>
                    {column.sensitive && (
                      <span className="ml-2 text-xs text-red-300">(sensitive)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-4">
            <button
              onClick={handleExport}
              disabled={loading || selectedColumns.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  {exportMode === 'evidence' ? (
                    <>
                      <Archive size={16} className="mr-2" />
                      Export with Evidence
                      {includeRelations && <Network size={14} className="ml-2" />}
                    </>
                  ) : (
                    <>
                      <Download size={16} className="mr-2" />
                      Export Selected Columns
                    </>
                  )}
                </>
              )}
            </button>
          </div>
          
          <div className="mt-4">
            <button 
              onClick={() => setExpandInstructions(!expandInstructions)}
              className="text-sm text-blue-300 hover:text-blue-400 underline flex items-center"
            >
              {expandInstructions ? "Hide Instructions" : "Show Export Instructions"}
            </button>
            
            {expandInstructions && (
              <div className="mt-2 p-3 bg-gray-800/50 rounded text-sm text-gray-300">
                <p className="mb-2">This feature exports logs to CSV files on the server. The files are <strong>not</strong> downloaded to your browser.</p>
                <p className="mb-2">Files are saved to the <code className="bg-gray-700 px-1 py-0.5 rounded">backend/exports</code> directory on the host system.</p>
                {exportMode === 'evidence' && (
                  <>
                    <p className="mb-2">The evidence export creates a ZIP file containing all logs and related evidence files, along with an HTML viewer for easy browsing.</p>
                    {includeRelations && (
                      <p className="mb-2">Including relation data will add network relationships, user commands, and other correlation data from the relation service to your export.</p>
                    )}
                  </>
                )}
                <p>Use care when selecting sensitive columns like "secrets" that may contain credentials.</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Right panel - Existing Exports */}
        <div className="bg-gray-700/50 p-4 rounded-md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <FileText size={18} className="mr-2" />
              Existing Exports
            </h3>
            <button 
              onClick={fetchExports} 
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
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.map((file, index) => (
                    <tr key={file.name} className={`border-b border-gray-700 ${index % 2 === 0 ? 'bg-gray-800/30' : ''}`}>
                      <td className="px-3 py-2">
                        {file.type === 'evidence' ? (
                          <Archive size={16} className="text-purple-400" title="Evidence Export" />
                        ) : (
                          <FileText size={16} className="text-blue-400" title="CSV Export" />
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-white">
                        {file.name}
                      </td>
                      <td className="px-3 py-2">{formatFileSize(file.size)}</td>
                      <td className="px-3 py-2">{formatDate(file.created)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleDeleteExport(file.name)}
                          className="text-red-400 hover:text-red-300 p-1 rounded"
                          title="Delete export"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-400">
            <p>File path: <code className="bg-gray-800 px-1 py-0.5 rounded">/app/exports/</code> inside container</p>
            <p className="mt-1">Host path: mounted volume location on your system</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportDatabasePanel;