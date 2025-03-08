// frontend/src/components/UserSettings.jsx
import React, { useState } from 'react';
import { User, Key, Settings, Shield } from 'lucide-react';
import ChangeOwnPasswordForm from './auth/ChangeOwnPasswordForm';

const UserSettings = ({ currentUser, csrfToken }) => {
  const [activeTab, setActiveTab] = useState('password');
  const [passwordChanged, setPasswordChanged] = useState(false);

  const handlePasswordChanged = (userData) => {
    setPasswordChanged(true);
    
    // Reset after a delay
    setTimeout(() => {
      setPasswordChanged(false);
    }, 3000);
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">User Settings</h2>
      </div>

      {passwordChanged && (
        <div className="mb-4 p-3 bg-green-900/50 text-green-200 rounded-md">
          <p>Your password has been changed successfully.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-4">
        <button
          onClick={() => setActiveTab('password')}
          className={`px-4 py-2 ${
            activeTab === 'password'
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Key size={16} />
            <span>Change Password</span>
          </div>
        </button>
        
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 ${
            activeTab === 'profile'
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <User size={16} />
            <span>Profile</span>
          </div>
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-gray-800 rounded-lg p-6">
        {activeTab === 'password' && (
          <div>
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white">Password Settings</h3>
              <p className="text-gray-400 mt-1">
                Change your password to keep your account secure.
              </p>
            </div>
            
            <ChangeOwnPasswordForm 
              csrfToken={csrfToken} 
              onPasswordChanged={handlePasswordChanged}
            />
          </div>
        )}
        
        {activeTab === 'profile' && (
          <div>
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white">User Profile</h3>
              <p className="text-gray-400 mt-1">
                Manage your account information.
              </p>
            </div>
            
            <div className="bg-gray-700/50 p-4 rounded-md mb-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-800/60 rounded-full text-blue-200 text-xl font-bold">
                  {currentUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-lg font-medium text-white">{currentUser.username}</div>
                  <div className="text-gray-400 flex items-center gap-1 mt-1">
                    {currentUser.role === 'admin' ? (
                      <>
                        <Shield size={14} className="text-red-400" />
                        <span>Administrator</span>
                      </>
                    ) : (
                      <>
                        <User size={14} className="text-green-400" />
                        <span>Standard User</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="grid gap-4">
              <div className="bg-gray-700/50 p-4 rounded-md">
                <div className="text-white mb-2">Account Details</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-400">Username:</div>
                  <div className="text-white">{currentUser.username}</div>
                  <div className="text-gray-400">Role:</div>
                  <div className="text-white capitalize">{currentUser.role}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSettings;