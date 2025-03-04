// frontend/src/components/FileStatusTracker.jsx
import React, { useState, useEffect } from 'react';
import { 
  File, 
  FileX, 
  FileCheck, 
  FileWarning, 
  Shield, 
  HardDrive, 
  MemoryStick, 
  Lock, 
  ChevronDown,
  ChevronRight,
  Filter,
  Calendar,
  User,
  RefreshCw
} from 'lucide-react';

const FileStatusTracker = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [filters, setFilters] = useState({
    status: 'all',
    hostname: '',
    analyst: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Status definitions with icons and colors
  const statusConfig = {
    'ON_DISK': { 
      icon: <HardDrive className="w-5 h-5" />, 
      color: 'bg-yellow-600/20 text-yellow-300',
      description: 'File is still on the target system'
    },
    'IN_MEMORY': { 
      icon: <MemoryStick className="w-5 h-5" />, 
      color: 'bg-blue-600/20 text-blue-300',
      description: 'Running only in memory'
    },
    'ENCRYPTED': { 
      icon: <Lock className="w-5 h-5" />, 
      color: 'bg-purple-600/20 text-purple-300',
      description: 'File is present but encrypted'
    },
    'REMOVED': { 
      icon: <FileX className="w-5 h-5" />, 
      color: 'bg-red-600/20 text-red-300',
      description: 'File has been deleted'
    },
    'CLEANED': { 
      icon: <FileCheck className="w-5 h-5" />, 
      color: 'bg-green-600/20 text-green-300',
      description: 'File and any traces have been removed'
    },
    'DORMANT': { 
      icon: <File className="w-5 h-5" />, 
      color: 'bg-gray-600/20 text-gray-300',
      description: 'Inactive but still present'
    },
    'DETECTED': { 
      icon: <Shield className="w-5 h-5" />, 
      color: 'bg-orange-600/20 text-orange-300',
      description: 'AV/EDR has flagged the file'
    },
    'UNKNOWN': { 
      icon: <FileWarning className="w-5 h-5" />, 
      color: 'bg-gray-600/20 text-gray-300',
      description: 'Status needs verification'
    }
  };

  // Get icon and color based on status
  const getStatusDisplay = (status) => {
    if (!status) return {
      icon: <FileWarning className="w-5 h-5" />,
      color: 'bg-gray-600/20 text-gray-300',
      component: (
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-gray-600/20 text-gray-300">
          <FileWarning className="w-5 h-5" />
          <span>UNKNOWN</span>
        </div>
      )
    };
    
    const config = statusConfig[status] || {
      icon: <File className="w-5 h-5" />,
      color: 'bg-gray-600/20 text-gray-300',
      description: 'Custom status'
    };
    
    return {
      ...config,
      component: (
        <div className={`flex items-center gap-2 px-2 py-1 rounded ${config.color}`}>
          {config.icon}
          <span>{status}</span>
        </div>
      )
    };
  };

  const fetchFiles = async () => {
    try {
      setRefreshing(true);
      
      // Use relative URL with proxy
      const response = await fetch(`/relation-service/api/file-status`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      setFiles(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const toggleExpand = (filename) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(filename)) {
      newExpanded.delete(filename);
    } else {
      newExpanded.add(filename);
    }
    setExpandedItems(newExpanded);
  };

  // Filter files based on current filters
  const filteredFiles = files.filter(file => {
    if (filters.status !== 'all' && file.status !== filters.status) {
      return false;
    }
    if (filters.hostname && (!file.hostname || !file.hostname.toLowerCase().includes(filters.hostname.toLowerCase()))) {
      return false;
    }
    if (filters.analyst && (!file.analyst || !file.analyst.toLowerCase().includes(filters.analyst.toLowerCase()))) {
      return false;
    }
    return true;
  });

  // Group files by status
  const filesByStatus = filteredFiles.reduce((acc, file) => {
    const status = file.status || 'UNKNOWN';
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(file);
    return acc;
  }, {});

  // Sort status groups by priority
  const priorityOrder = [
    'DETECTED', 'ON_DISK', 'IN_MEMORY', 'ENCRYPTED', 
    'DORMANT', 'UNKNOWN', 'REMOVED', 'CLEANED'
  ];
  
  const sortedStatusGroups = Object.keys(filesByStatus).sort((a, b) => {
    const indexA = priorityOrder.indexOf(a);
    const indexB = priorityOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-gray-400">Loading file status data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 text-red-200 p-4 rounded-md">
        <h3 className="font-medium flex items-center gap-2">
          <FileWarning size={20} />
          Error loading file data
        </h3>
        <p className="mt-1">{error}</p>
        <button 
          onClick={fetchFiles}
          className="mt-4 px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-white text-sm flex items-center gap-1"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg">
      <div className="p-4 border-b border-gray-700 flex flex-row items-center justify-between">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <File className="w-5 h-5" />
          File Status Tracker
        </h2>
        
        <div className="flex gap-2">
          <button
            onClick={fetchFiles}
            disabled={refreshing}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600"
          >
            <Filter size={16} />
            Filters {showFilters ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>
      
      {showFilters && (
        <div className="p-4 bg-gray-800 border-b border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
              >
                <option value="all">All Statuses</option>
                {priorityOrder.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Hostname</label>
              <input
                type="text"
                value={filters.hostname}
                onChange={(e) => setFilters({...filters, hostname: e.target.value})}
                placeholder="Filter by hostname"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Analyst</label>
              <input
                type="text"
                value={filters.analyst}
                onChange={(e) => setFilters({...filters, analyst: e.target.value})}
                placeholder="Filter by analyst"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
              />
            </div>
          </div>
        </div>
      )}
      
      <div className="p-4">
        {filteredFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <FileWarning size={40} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">No files found matching the current filters</p>
            {filters.status !== 'all' || filters.hostname || filters.analyst ? (
              <button
                onClick={() => setFilters({status: 'all', hostname: '', analyst: ''})}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
            ) : (
              <p className="mt-2 text-sm">Try creating some logs with filenames to see them tracked here</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {sortedStatusGroups.map(status => (
              <div key={status} className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  {statusConfig[status]?.icon || <File className="w-5 h-5" />}
                  <h3 className="text-lg font-medium text-white">{status}</h3>
                  <span className="text-sm text-gray-400">
                    ({filesByStatus[status].length} file{filesByStatus[status].length !== 1 ? 's' : ''})
                  </span>
                  <div className="text-xs text-gray-500">{statusConfig[status]?.description}</div>
                </div>
                
                <div className="space-y-2">
                  {filesByStatus[status].map(file => (
                    <div 
                      key={file.filename} 
                      className="bg-gray-700/50 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => toggleExpand(file.filename)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-600/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <File className="w-5 h-5 text-gray-400" />
                          <span className="text-white font-medium font-mono text-sm break-all">
                            {file.filename}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Calendar size={12} />
                            {new Date(file.last_seen).toLocaleString()}
                          </div>
                        </div>
                        {expandedItems.has(file.filename) ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {expandedItems.has(file.filename) && (
                        <div className="border-t border-gray-600 p-4">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <h4 className="text-sm text-gray-400 mb-1">Host Information</h4>
                              <div className="bg-gray-800 p-3 rounded-md space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">Hostname:</span>
                                  <span className="text-white">{file.hostname || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">Internal IP:</span>
                                  <span className="text-white">{file.internal_ip || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">External IP:</span>
                                  <span className="text-white">{file.external_ip || 'N/A'}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="text-sm text-gray-400 mb-1">File Information</h4>
                              <div className="bg-gray-800 p-3 rounded-md space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">Analyst:</span>
                                  <span className="text-white">{file.analyst || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">First Seen:</span>
                                  <span className="text-white">{new Date(file.first_seen).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">Status Updates:</span>
                                  <span className="text-white">{file.history_count || 0}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {file.history && file.history.length > 0 ? (
                            <>
                              <h4 className="text-sm text-gray-400 mb-2">Status History</h4>
                              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                                {file.history.map((entry, index) => (
                                  <div 
                                    key={index}
                                    className="bg-gray-800 p-3 rounded-md border-l-4 border-gray-600"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        {getStatusDisplay(entry.status).component}
                                        <span className="text-xs text-gray-400">
                                          by {entry.analyst}
                                        </span>
                                      </div>
                                      <span className="text-xs text-gray-500">
                                        {new Date(entry.timestamp).toLocaleString()}
                                      </span>
                                    </div>
                                    
                                    {entry.command && (
                                      <div className="mt-2">
                                        <div className="text-xs text-gray-400 mb-1">Command:</div>
                                        <div className="bg-gray-900 p-2 rounded text-gray-300 font-mono text-xs overflow-x-auto">
                                          {entry.command}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {entry.notes && (
                                      <div className="mt-2">
                                        <div className="text-xs text-gray-400 mb-1">Notes:</div>
                                        <div className="text-gray-300 text-sm italic">
                                          {entry.notes}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-4 text-gray-400">
                              <p>No detailed history available</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileStatusTracker;