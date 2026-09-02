// frontend/src/components/ActiveSessionsTable.jsx
import React, { useState, useEffect } from 'react';
import { RefreshCw, LogOut, UserCheck, AlertCircle, Users, Shield, CheckSquare, Square, Key } from 'lucide-react';
import { formatUTC } from '../utils/dateUtils';
import { Button, Badge, Skeleton, EmptyState } from './common/ui';

const ActiveSessionsTable = ({ csrfToken, onSessionsRevoked, onForcePasswordReset }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [revoking, setRevoking] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Group sessions by username for password reset feature
  const sessionsByUser = sessions.reduce((acc, session) => {
    if (!acc[session.username]) {
      acc[session.username] = [];
    }
    acc[session.username].push(session);
    return acc;
  }, {});

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

  const revokeSessions = async (sessionIds) => {
    if (sessionIds.length === 0) return;

    // Check if current session is included
    const currentSessionIds = sessions
      .filter(s => s.isCurrentSession)
      .map(s => s.id);

    const isRevokingSelf = sessionIds.some(id =>
      currentSessionIds.includes(id)
    );

    let confirmMessage = `Are you sure you want to revoke ${sessionIds.length} selected session(s)?`;

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
          sessionIds
        })
      });

      if (!response.ok) {
        throw new Error('Failed to revoke sessions');
      }

      const result = await response.json();
      
      setSuccessMessage(result.message);
      setSelectedSessions(prev => prev.filter(id => !sessionIds.includes(id)));
      
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

  const handleRevokeSelected = () => revokeSessions(selectedSessions);

  // Handle Force Password Reset action
  const handleForcePasswordReset = (username) => {
    if (onForcePasswordReset) {
      onForcePasswordReset(username);
    }
  };

  const formatDate = (dateString) => formatUTC(dateString);

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-md">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={20} />
          <h3 className="font-medium">Failed to load active sessions</h3>
        </div>
        <p>{error}</p>
        <Button
          variant="danger"
          size="sm"
          icon={RefreshCw}
          className="mt-4"
          onClick={fetchSessions}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {successMessage && (
        <div className="bg-success/10 border border-success/30 text-success p-4 rounded-md mb-4 flex items-center gap-2">
          <CheckSquare size={20} />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium text-content flex items-center gap-2">
            <Users size={18} />
            Active Sessions ({sessions.length})
          </h3>
          <button
            onClick={fetchSessions}
            className="p-1 text-muted hover:text-content rounded"
            title="Refresh session list"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={sessions.length > 0 && selectedSessions.length === sessions.length ? Square : CheckSquare}
            disabled={sessions.length === 0}
            onClick={handleSelectAll}
          >
            {sessions.length > 0 && selectedSessions.length === sessions.length ? 'Deselect All' : 'Select All'}
          </Button>

          <Button
            variant="danger"
            size="sm"
            icon={revoking ? undefined : LogOut}
            loading={revoking}
            disabled={selectedSessions.length === 0 || revoking}
            onClick={handleRevokeSelected}
          >
            {revoking ? 'Revoking...' : `Revoke Selected (${selectedSessions.length})`}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-muted">
          <thead className="text-xs text-muted uppercase bg-surface-2/50">
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
                <td colSpan="6" className="px-3 py-4">
                  <EmptyState icon={Users} title="No active sessions" message="Signed-in sessions will appear here." />
                </td>
              </tr>
            ) : (
              /* Group sessions by username and only show reset option once per user */
              Object.entries(sessionsByUser).map(([username, userSessions]) => (
                userSessions.map((session, idx) => (
                  <tr
                    key={session.id}
                    className={`${idx % 2 === 0 ? 'bg-surface/30' : ''} ${session.isCurrentSession ? 'bg-accent/10' : ''} border-b border-line`}
                  >
                    <td className="px-3 py-2">
                      <div
                        className="cursor-pointer"
                        onClick={() => handleSelectSession(session.id)}
                      >
                        {selectedSessions.includes(session.id) ? (
                          <CheckSquare size={18} className="text-accent" />
                        ) : (
                          <Square size={18} className="text-muted" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium text-content">
                      {session.username}
                      {session.isCurrentSession && (
                        <Badge tone="accent" className="ml-2">current</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {session.role === 'admin' ? (
                        <span className="flex items-center">
                          <Shield size={14} className="text-danger mr-1" />
                          Admin
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <UserCheck size={14} className="text-success mr-1" />
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatDate(session.issuedAt)}</td>
                    <td className="px-3 py-2">
                      <Badge tone="success">Active</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {/* Only show password reset button for the first session of each user */}
                        {idx === 0 && (
                          <button
                            onClick={() => handleForcePasswordReset(username)}
                            className="text-warning hover:opacity-80 p-1 rounded"
                            title="Force password reset on next login"
                          >
                            <Key size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => revokeSessions([session.id])}
                          disabled={revoking}
                          className="text-danger hover:opacity-80 p-1 rounded"
                          title={`Revoke ${session.isCurrentSession ? 'your' : 'this'} session`}
                        >
                          <LogOut size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActiveSessionsTable;