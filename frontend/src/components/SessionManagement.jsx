// frontend/src/components/SessionManagement.jsx
import React, { useState } from 'react';
import { Shield, Users, RefreshCw, AlertCircle, CheckCircle, Clock, Layers, LogOut, Key } from 'lucide-react';
import ActiveSessionsTable from './ActiveSessionsTable';

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
      
      // Force reload after successful revocation
      setTimeout(() => {
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
        <Shield className="text-red-400" size={24} />
        <h2 className="text-xl font-bold text-white">Session Management</h2>
      </div>

      {actionMessage && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
          actionMessage.type === 'success' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          {actionMessage.type === 'success' ? 
            <CheckCircle size={20} /> : 
            <AlertCircle size={20} />
          }
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-4">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2 ${
            activeTab === 'sessions'
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
              : 'text-gray-400 hover:text-gray-300'
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
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers size={16} />
            <span>Settings</span>
          </div>
        </button>
      </div>

      {activeTab === 'sessions' && (
        <div className="bg-gray-800 rounded-lg p-4">
          <ActiveSessionsTable 
            csrfToken={csrfToken} 
            onSessionsRevoked={handleSessionsRevoked}
            onForcePasswordReset={handleUserPasswordReset}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-gray-700/50 p-4 rounded-md">
            <div className="flex items-center gap-2 mb-3">
              <LogOut size={20} className="text-red-400" />
              <h3 className="text-lg font-semibold text-white">Global Session Control</h3>
            </div>
            
            <button
              onClick={handleRevokeAllSessions}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Revoking...</span>
                </>
              ) : (
                <>
                  <Shield size={16} />
                  <span>Revoke All Sessions</span>
                </>
              )}
            </button>
            
            <p className="mt-2 text-sm text-gray-400">
              This will force all users to log out immediately.
            </p>
          </div>
          
          <div className="bg-gray-700/50 p-4 rounded-md">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={20} className="text-green-400" />
              <h3 className="text-lg font-semibold text-white">Session Information</h3>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-600">
                <span className="text-gray-400">Session Duration:</span>
                <span className="text-white">8 hours</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-600">
                <span className="text-gray-400">Idle Timeout:</span>
                <span className="text-white">None</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-600">
                <span className="text-gray-400">Session Storage:</span>
                <span className="text-white">Redis (Encrypted)</span>
              </div>
              
              <div className="flex justify-between py-2">
                <span className="text-gray-400">Token Type:</span>
                <span className="text-white">JWT</span>
              </div>
            </div>
            
            <p className="mt-4 text-xs text-gray-500">
              Additional session management features will be available in a future update.
            </p>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Key className="text-yellow-400" size={20} />
              Force Password Reset
            </h3>
            
            <p className="text-gray-300 mb-4">
              Are you sure you want to force <span className="font-bold text-white">{selectedUsername}</span> to reset their password on next login?
            </p>
            
            <p className="text-sm text-gray-400 mb-6">
              This will require the user to change their password before they can access the application again.
            </p>
            
            <div className="flex justify-end gap-4">
              <button
                onClick={cancelPasswordReset}
                disabled={passwordResetLoading}
                className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              
              <button
                onClick={confirmPasswordReset}
                disabled={passwordResetLoading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors duration-200 disabled:opacity-50 flex items-center gap-2"
              >
                {passwordResetLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Key size={16} />
                    <span>Force Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionManagement;