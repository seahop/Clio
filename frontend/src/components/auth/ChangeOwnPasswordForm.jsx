// frontend/src/components/auth/ChangeOwnPasswordForm.jsx
import React, { useState } from 'react';
import { Key, Eye, EyeOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { validateNewPassword } from '../../utils/passwordValidation';

const ChangeOwnPasswordForm = ({ csrfToken, onPasswordChanged }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [success, setSuccess] = useState(false);

  const validateForm = () => {
    // Only validate if we have values
    if (!newPassword) return false;
    
    const errors = validateNewPassword(newPassword);
    setValidationErrors(errors);
    
    if (errors.length > 0) return false;
    if (newPassword !== confirmPassword) {
      setValidationErrors(['Passwords do not match']);
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/change-own-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.detail || 'Failed to change password');
      }
      
      const data = await response.json();
      
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Notify parent component that password was changed (if callback exists)
      if (onPasswordChanged) {
        setTimeout(() => {
          onPasswordChanged(data.user);
        }, 1500);
      }
      
    } catch (err) {
      console.error('Error changing password:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-gray-800 shadow-md rounded-md p-6">
        <div className="flex items-center gap-2 mb-6">
          <Key className="text-blue-400" size={24} />
          <h2 className="text-xl font-semibold text-white">Change Your Password</h2>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 text-red-200 rounded-md flex items-center gap-2">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-3 bg-green-900/50 text-green-200 rounded-md flex items-center gap-2">
            <CheckCircle size={20} />
            <span>Password changed successfully!</span>
          </div>
        )}
        
        {validationErrors.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-900/50 text-yellow-200 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={20} />
              <span className="font-semibold">Password requirements not met:</span>
            </div>
            <ul className="ml-6 list-disc">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-gray-300 mb-1">
              Current Password
            </label>
            <div className="relative">
              <input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-300"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <div>
            <label htmlFor="newPassword" className="block text-gray-300 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setValidationErrors([]);
                }}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-300"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <div>
            <label htmlFor="confirmPassword" className="block text-gray-300 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setValidationErrors([]);
                }}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-300"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 px-4 rounded-md text-white font-medium 
                ${loading ? 'bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'} 
                transition-colors duration-200 flex items-center justify-center gap-2`}
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Changing Password...</span>
                </>
              ) : (
                <>
                  <Key size={18} />
                  <span>Change Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangeOwnPasswordForm;