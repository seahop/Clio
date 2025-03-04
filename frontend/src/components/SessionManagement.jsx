// frontend/src/components/SessionManagement.jsx
import React, { useState } from 'react';
import { Shield, Users, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';

const SessionManagement = ({ csrfToken }) => {
  const [actionMessage, setActionMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-gray-700/50 p-4 rounded-md">
          <div className="flex items-center gap-2 mb-3">
            <Users size={20} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Active Sessions</h3>
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
            This will force all users to log out immediately. You'll need to log back in after this action.
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
    </div>
  );
};

export default SessionManagement;