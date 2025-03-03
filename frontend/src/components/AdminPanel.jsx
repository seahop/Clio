// /components/AdminPanel.jsx
import React, { useState } from 'react';
import { AlertCircle, Shield, Users } from 'lucide-react';

const AdminPanel = ({ csrfToken }) => {
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
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="text-red-400" size={24} />
        <h2 className="text-xl font-bold text-white">Admin Panel</h2>
      </div>

      {actionMessage && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
          actionMessage.type === 'success' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          <AlertCircle size={20} />
          <span>{actionMessage.text}</span>
        </div>
      )}

      <div className="grid gap-4">
        <div className="bg-gray-700/50 p-4 rounded-md">
          <div className="flex items-center gap-2 mb-3">
            <Users size={20} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Session Management</h3>
          </div>
          <button
            onClick={handleRevokeAllSessions}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Revoking...' : 'Revoke All Sessions'}
          </button>
          <p className="mt-2 text-sm text-gray-400">
            This will force all users to log out immediately.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;