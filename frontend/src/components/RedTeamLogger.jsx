// components/RedTeamLogger.jsx
import React, { useState } from 'react';
import { Network, File } from 'lucide-react';
import LoggerHeader from './LoggerTable/LoggerHeader';
import LoggerTableHeader from './LoggerTable/LoggerTableHeader';
import LoggerRow from './LoggerTable/LoggerRow';
import TablePagination from './LoggerTable/TablePagination';
import AdminPanel from './AdminPanel';
import RelationViewer from './RelationViewer';
import FileStatusTracker from './FileStatusTracker';
import LoggerCardView from './LoggerCardView';
import { COLUMNS } from '../utils/constants';
import { useLoggerOperations } from '../hooks/useLoggerOperations';

const RedTeamLogger = ({ currentUser, csrfToken }) => {
  const [activeView, setActiveView] = useState('logs');
  
  const {
    logs,
    loading,
    error,
    isAdmin,
    tableState,
    handlers
  } = useLoggerOperations(currentUser, csrfToken);

  if (loading) return <div className="p-4 text-white">Loading...</div>;

  return (
    <div className="w-full px-2 sm:px-4">
      {error && (
        <div className="mb-4 p-3 bg-red-900 text-red-200 rounded-md">
          {error}
        </div>
      )}
      
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-4">
          {/* View Toggle Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveView('logs')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                activeView === 'logs' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              <span className="inline">Logs</span>
            </button>
            
            <button
              onClick={() => setActiveView('relations')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                activeView === 'relations' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              <Network className="w-5 h-5" />
              <span className="inline">Relations</span>
            </button>
            
            <button
              onClick={() => setActiveView('files')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                activeView === 'files' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              <File className="w-5 h-5" />
              <span className="inline">File Status</span>
            </button>
          </div>
        </div>

        {activeView === 'logs' && (
          <LoggerCardView 
            logs={logs}
            isAdmin={isAdmin}
            currentUser={currentUser.username}
            tableState={tableState}
            handlers={handlers}
          />
        )}

        {activeView === 'relations' && (
          <div className="w-full">
            <RelationViewer />
          </div>
        )}
        
        {activeView === 'files' && (
          <div className="w-full">
            <FileStatusTracker />
          </div>
        )}
      </div>

      {isAdmin && activeView === 'logs' && (
        <div className="mt-6">
          <AdminPanel
            csrfToken={csrfToken}
          />
        </div>
      )}
    </div>
  );
};

export default RedTeamLogger;