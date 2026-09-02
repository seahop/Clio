// frontend/src/components/SessionManagement.jsx
import React, { useState } from 'react';
import { Shield, Users, AlertCircle, CheckCircle, Clock, Layers, LogOut, Key } from 'lucide-react';
import ActiveSessionsTable from './ActiveSessionsTable';
import { Button } from './common/ui';

const SessionManagement = ({ csrfToken }) => {
  const [actionMessage, setActionMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' or 'settings'
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);

  const handleRevokeAllSessions = async () => {
    if (!window.confirm('Are you sure you want to revoke all sessions? This will log out all users.')) {
      return;
    }

    setIsLoading(true);
    try {
      // Use relative URL with proxy
      const response = await fetch(`/api/auth/revoke-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({}) // We don't need userId since we're revoking all
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revoke sessions');
      }

      const data = await response.json();
      setActionMessage({ type: 'success', text: data.message });
      
      // All sessions are revoked, including our own — clear local state and
      // reload, which lands on the login page
      setTimeout(() => {
        localStorage.clear();
        window.location.reload();
      }, 1500); // Give time to see success message

    } catch (error) {
      console.error('Revocation error:', error);
      setActionMessage({ type: 'error', text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionsRevoked = (result) => {
    if (result.selfRevoked) {
      // User revoked their own session
      setActionMessage({ 
        type: 'success', 
        text: 'Your session has been revoked. You will be logged out momentarily.'
      });
      
      // Force logout after a short delay
      setTimeout(() => {
        localStorage.clear();
        window.location.reload();
      }, 1500);
    } else {
      // Other sessions were revoked
      setActionMessage({ type: 'success', text: result.message });
    }
  };

  // Force password reset functionality
  const handleUserPasswordReset = (username) => {
    setSelectedUsername(username);
    setShowPasswordResetModal(true);
  };

  const confirmPasswordReset = async () => {
    setPasswordResetLoading(true);
    try {
      const response = await fetch(`/api/auth/force-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          username: selectedUsername
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to force password reset');
      }

      const data = await response.json();
      setActionMessage({ 
        type: 'success', 
        text: `Password reset required for ${selectedUsername} on next login.` 
      });
      setShowPasswordResetModal(false);
    } catch (error) {
      console.error('Password reset error:', error);
      setActionMessage({ type: 'error', text: error.message });
    } finally {
      setPasswordResetLoading(false);
      setSelectedUsername('');
    }
  };

  const cancelPasswordReset = () => {
    setShowPasswordResetModal(false);
    setSelectedUsername('');
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="text-danger" size={24} />
        <h2 className="text-xl font-bold text-content">Session Management</h2>
      </div>

      {actionMessage && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 border ${
          actionMessage.type === 'success'
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-danger/10 border-danger/30 text-danger'
        }`}>
          {actionMessage.type === 'success' ?
            <CheckCircle size={20} /> :
            <AlertCircle size={20} />
          }
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line mb-4">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2 ${
            activeTab === 'sessions'
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-muted hover:text-content'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users size={16} />
            <span>Active Sessions</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 ${
            activeTab === 'settings'
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-muted hover:text-content'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers size={16} />
            <span>Settings</span>
          </div>
        </button>
      </div>

      {activeTab === 'sessions' && (
        <div className="bg-surface border border-line rounded-card p-4">
          <ActiveSessionsTable
            csrfToken={csrfToken} 
            onSessionsRevoked={handleSessionsRevoked}
            onForcePasswordReset={handleUserPasswordReset}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-surface-2/50 border border-line p-4 rounded-md">
            <div className="flex items-center gap-2 mb-3">
              <LogOut size={20} className="text-danger" />
              <h3 className="text-lg font-semibold text-content">Global Session Control</h3>
            </div>

            <Button
              variant="danger"
              icon={isLoading ? undefined : Shield}
              loading={isLoading}
              onClick={handleRevokeAllSessions}
            >
              {isLoading ? 'Revoking...' : 'Revoke All Sessions'}
            </Button>

            <p className="mt-2 text-sm text-muted">
              This will force all users to log out immediately.
            </p>
          </div>

          <div className="bg-surface-2/50 border border-line p-4 rounded-md">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={20} className="text-success" />
              <h3 className="text-lg font-semibold text-content">Session Information</h3>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-line">
                <span className="text-muted">Session Duration:</span>
                <span className="text-content">8 hours</span>
              </div>

              <div className="flex justify-between py-2 border-b border-line">
                <span className="text-muted">Idle Timeout:</span>
                <span className="text-content">None</span>
              </div>

              <div className="flex justify-between py-2 border-b border-line">
                <span className="text-muted">Session Storage:</span>
                <span className="text-content">Redis (Encrypted)</span>
              </div>

              <div className="flex justify-between py-2">
                <span className="text-muted">Token Type:</span>
                <span className="text-content">JWT</span>
              </div>
            </div>

            <p className="mt-4 text-xs text-faint">
              Additional session management features will be available in a future update.
            </p>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-line rounded-card p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-content mb-4 flex items-center gap-2">
              <Key className="text-warning" size={20} />
              Force Password Reset
            </h3>

            <p className="text-muted mb-4">
              Are you sure you want to force <span className="font-bold text-content">{selectedUsername}</span> to reset their password on next login?
            </p>

            <p className="text-sm text-muted mb-6">
              This will require the user to change their password before they can access the application again.
            </p>

            <div className="flex justify-end gap-4">
              <Button
                variant="subtle"
                disabled={passwordResetLoading}
                onClick={cancelPasswordReset}
              >
                Cancel
              </Button>

              <Button
                variant="danger"
                className="bg-warning/90 hover:bg-warning"
                icon={passwordResetLoading ? undefined : Key}
                loading={passwordResetLoading}
                onClick={confirmPasswordReset}
              >
                {passwordResetLoading ? 'Processing...' : 'Force Reset'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionManagement;