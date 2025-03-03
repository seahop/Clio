// frontend/src/components/auth/PasswordChangeForm.jsx
import React, { useState } from 'react';
import { Key } from 'lucide-react';
import { validateNewPassword } from '../../utils/passwordValidation';

// No need for API_URL with proxy
// const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const PasswordChangeForm = ({ username, onPasswordChanged }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    const passwordErrors = validateNewPassword(newPassword);
    if (passwordErrors.length > 0) {
      setError('Password Requirements Not Met:\n• ' + passwordErrors.join('\n• '));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Use relative URL with proxy
      const response = await fetch(`/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': window.csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: password,
          newPassword: newPassword.trim()
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (Array.isArray(data.detail)) {
          setError('Password Requirements Not Met:\n• ' + data.detail.join('\n• '));
        } else {
          throw new Error(data.error || data.detail || 'Failed to change password');
        }
        return;
      }

      console.log('Password change successful, user data:', data.user);
      localStorage.removeItem('passwordChangeRequired');
      onPasswordChanged(data.user);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Change Your Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            First time login - please set a new password
          </p>
          <div className="mt-4 text-sm text-gray-300 bg-gray-800 p-4 rounded-md">
            <p className="font-medium mb-2">Password Requirements:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>At least 12 characters long</li>
              <li>At least one uppercase letter</li>
              <li>At least one lowercase letter</li>
              <li>At least one number</li>
              <li>At least one special character (!@#$%^&*()_+-=&#91;&#93;&#123;&#125;|;:,.&lt;&gt;/?)</li>
              <li>Cannot be just letters followed by numbers</li>
              <li>Cannot contain repeated characters (3 or more times)</li>
            </ul>
          </div>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handlePasswordChange}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-gray-700"
                placeholder="Current Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-gray-700"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                maxLength={128}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-gray-700"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                maxLength={128}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm whitespace-pre-line bg-red-900/50 p-3 rounded">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <Key className="h-5 w-5 text-blue-500 group-hover:text-blue-400" />
              </span>
              {loading ? 'Changing password...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordChangeForm;