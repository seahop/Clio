// frontend/src/components/RedTeamLogger.jsx - Updated with Operations tab
import React, { useState } from 'react';
import { Network, File, Database, Users, Key, Book, HardDrive, Settings, Shield, Briefcase } from 'lucide-react';
import LoggerCardView from './LoggerCardView';
import RelationViewer from './RelationViewer';
import FileStatusTracker from './FileStatusTracker';
import ExportDatabasePanel from './export/ExportDatabasePanel';
import SessionManagement from './SessionManagement';
import ApiKeyManager from './api-keys/ApiKeyManager';
import ApiDocumentation from './ApiDocumentation';
import LogManagement from './LogManagement';
import UserSettings from './UserSettings';
import CertificateManager from './CertificateManager';
import { OperationsManagement } from './Operations';
import useLoggerOperations from '../hooks/useLoggerOperations';

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
          <div className="flex space-x-2 flex-wrap gap-y-2">
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
            
            {/* User Settings Button - Available to all users */}
            <button
              onClick={() => setActiveView('settings')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                activeView === 'settings' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="inline">Settings</span>
            </button>
            
            {/* Admin-only buttons */}
            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveView('operations')}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                    activeView === 'operations' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  <Briefcase className="w-5 h-5" />
                  <span className="inline">Operations</span>
                </button>
                
                <button
                  onClick={() => setActiveView('export')}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                    activeView === 'export' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  <Database className="w-5 h-5" />
                  <span className="inline">Export</span>
                </button>
                
                <button
                  onClick={() => setActiveView('logs-management')}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                    activeView === 'logs-management' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  <HardDrive className="w-5 h-5" />
                  <span className="inline">Log Management</span>
                </button>
                
                <button
                  onClick={() => setActiveView('sessions')}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                    activeView === 'sessions' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span className="inline">Sessions</span>
                </button>

                <button
                  onClick={() => setActiveView('api-keys')}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                    activeView === 'api-keys' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  <Key className="w-5 h-5" />
                  <span className="inline">API Keys</span>
                </button>

                <button
                  onClick={() => setActiveView('api-docs')}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                    activeView === 'api-docs' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  <Book className="w-5 h-5" />
                  <span className="inline">API Docs</span>
                </button>
                
                <button
                  onClick={() => setActiveView('certificates')}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors duration-200 ${
                    activeView === 'certificates' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  <Shield className="w-5 h-5" />
                  <span className="inline">Certificates</span>
                </button>
              </>
            )}
          </div>
        </div>

        {activeView === 'logs' && (
          <LoggerCardView 
            logs={logs}
            isAdmin={isAdmin}
            currentUser={currentUser.username}
            tableState={tableState}
            handlers={handlers}
            csrfToken={csrfToken}
          />
        )}

        {activeView === 'relations' && (
          <div className="w-full">
            <RelationViewer csrfToken={csrfToken} />
          </div>
        )}
        
        {activeView === 'files' && (
          <div className="w-full">
            <FileStatusTracker csrfToken={csrfToken} />
          </div>
        )}
        
        {/* User Settings View - Available to all users */}
        {activeView === 'settings' && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <UserSettings currentUser={currentUser} csrfToken={csrfToken} />
            </div>
          </div>
        )}
        
        {/* Admin Views */}
        {activeView === 'operations' && isAdmin && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <OperationsManagement csrfToken={csrfToken} currentUser={currentUser} />
            </div>
          </div>
        )}
        
        {activeView === 'export' && isAdmin && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <ExportDatabasePanel csrfToken={csrfToken} />
            </div>
          </div>
        )}
        
        {activeView === 'logs-management' && isAdmin && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <LogManagement csrfToken={csrfToken} />
            </div>
          </div>
        )}
        
        {activeView === 'sessions' && isAdmin && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <SessionManagement csrfToken={csrfToken} />
            </div>
          </div>
        )}

        {activeView === 'api-keys' && isAdmin && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <ApiKeyManager csrfToken={csrfToken} />
            </div>
          </div>
        )}

        {activeView === 'api-docs' && isAdmin && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <ApiDocumentation csrfToken={csrfToken} />
            </div>
          </div>
        )}
        
        {activeView === 'certificates' && isAdmin && (
          <div className="w-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <CertificateManager csrfToken={csrfToken} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RedTeamLogger;