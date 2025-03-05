// frontend/src/components/ActiveSessionsTable.jsx
import React, { useState, useEffect } from 'react';
import { RefreshCw, LogOut, UserCheck, AlertCircle, Users, Shield, CheckSquare, Square } from 'lucide-react';

const ActiveSessionsTable = ({ csrfToken, onSessionsRevoked }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [revoking, setRevoking] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/sessions/active', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch active sessions');
      }

      const data = await response.json();
      setSessions(data);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      // If all are selected, deselect all
      setSelectedSessions([]);
    } else {
      // Otherwise, select all (except current session if desired)
      setSelectedSessions(sessions.map(session => session.id));
    }
  };

  const handleSelectSession = (sessionId) => {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        return prev.filter(id => id !== sessionId);
      } else {
        return [...prev, sessionId];
      }
    });
  };

  const handleRevokeSelected = async () => {
    if (selectedSessions.length === 0) return;
    
    // Check if current session is included
    const currentSessionIds = sessions
      .filter(s => s.isCurrentSession)
      .map(s => s.id);
    
    const isRevokingSelf = selectedSessions.some(id => 
      currentSessionIds.includes(id)
    );
    
    let confirmMessage = `Are you sure you want to revoke ${selectedSessions.length} selected session(s)?`;
    
    if (isRevokingSelf) {
      confirmMessage += ' WARNING: Your current session is included and you will be logged out!';
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      setRevoking(true);
      
      const response = await fetch('/api/sessions/revoke', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          sessionIds: selectedSessions
        })
      });

      if (!response.ok) {
        throw new Error('Failed to revoke sessions');
      }

      const result = await response.json();
      
      setSuccessMessage(result.message);
      setSelectedSessions([]);
      
      // Refresh the sessions list
      await fetchSessions();
      
      // Notify parent component
      if (onSessionsRevoked) {
        onSessionsRevoked(result);
      }
      
      // If we revoked our own session, we'll be redirected by the parent component
      if (result.selfRevoked) {
        // Parent component should handle the logout/redirect
      }
      
      // Clear success message after some time
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
    } catch (err) {
      console.error('Error revoking sessions:', err);
      setError(err.message);
    } finally {
      setRevoking(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <RefreshCw className="animate-spin text-blue-400 mr-2" size={20} />
        <span className="text-gray-400">Loading active sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 text-red-200 p-4 rounded-md">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={20} />
          <h3 className="font-medium">Failed to load active sessions</h3>
        </div>
        <p>{error}</p>
        <button 
          onClick={fetchSessions}
          className="mt-4 px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-white text-sm flex items-center gap-1"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {successMessage && (
        <div className="bg-green-900/50 text-green-200 p-4 rounded-md mb-4 flex items-center gap-2">
          <CheckSquare size={20} />
          <span>{successMessage}</span>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Users size={18} />
            Active Sessions ({sessions.length})
          </h3>
          <button
            onClick={fetchSessions}
            className="p-1 text-gray-400 hover:text-white rounded"
            title="Refresh session list"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600"
          >
            {selectedSessions.length === sessions.length ? (
              <>
                <Square size={16} />
                Deselect All
              </>
            ) : (
              <>
                <CheckSquare size={16} />
                Select All
              </>
            )}
          </button>
          
          <button
            onClick={handleRevokeSelected}
            disabled={selectedSessions.length === 0 || revoking}
            className="px-3 py-1 bg-red-600 text-white rounded-md text-sm flex items-center gap-1 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {revoking ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Revoking...
              </>
            ) : (
              <>
                <LogOut size={16} />
                Revoke Selected ({selectedSessions.length})
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
            <tr>
              <th className="px-3 py-2 w-10"></th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-3 py-4 text-center text-gray-400">
                  No active sessions found
                </td>
              </tr>
            ) : (
              sessions.map((session, index) => (
                <tr 
                  key={session.id} 
                  className={`${index % 2 === 0 ? 'bg-gray-800/30' : ''} ${session.isCurrentSession ? 'bg-blue-900/20' : ''} border-b border-gray-700`}
                >
                  <td className="px-3 py-2">
                    <div 
                      className="cursor-pointer" 
                      onClick={() => handleSelectSession(session.id)}
                    >
                      {selectedSessions.includes(session.id) ? (
                        <CheckSquare size={18} className="text-blue-400" />
                      ) : (
                        <Square size={18} className="text-gray-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-white">
                    {session.username}
                    {session.isCurrentSession && (
                      <span className="ml-2 text-xs bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded">
                        current
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {session.role === 'admin' ? (
                      <span className="flex items-center">
                        <Shield size={14} className="text-red-400 mr-1" />
                        Admin
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <UserCheck size={14} className="text-green-400 mr-1" />
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{formatDate(session.issuedAt)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-1 bg-green-900/30 text-green-300 rounded text-xs">
                      Active
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => {
                        handleSelectSession(session.id);
                        setTimeout(() => handleRevokeSelected(), 100);
                      }}
                      disabled={revoking}
                      className="text-red-400 hover:text-red-300 p-1 rounded"
                      title={`Revoke ${session.isCurrentSession ? 'your' : 'this'} session`}
                    >
                      <LogOut size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActiveSessionsTable;