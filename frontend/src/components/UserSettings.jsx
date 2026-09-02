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
        <Settings className="text-accent" size={24} />
        <h2 className="text-xl font-bold text-content">User Settings</h2>
      </div>

      {passwordChanged && (
        <div className="mb-4 p-3 bg-success/10 border border-success/30 text-success rounded-md">
          <p>Your password has been changed successfully.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line mb-4">
        <button
          onClick={() => setActiveTab('password')}
          className={`px-4 py-2 ${
            activeTab === 'password'
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-muted hover:text-content'
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
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-muted hover:text-content'
          }`}
        >
          <div className="flex items-center gap-2">
            <User size={16} />
            <span>Profile</span>
          </div>
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-surface border border-line rounded-card p-6">
        {activeTab === 'password' && (
          <div>
            <div className="mb-6">
              <h3 className="text-lg font-medium text-content">Password Settings</h3>
              <p className="text-muted mt-1">
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
              <h3 className="text-lg font-medium text-content">User Profile</h3>
              <p className="text-muted mt-1">
                Manage your account information.
              </p>
            </div>

            <div className="bg-surface-2/50 border border-line p-4 rounded-md mb-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-12 h-12 bg-accent/20 rounded-full text-accent text-xl font-bold">
                  {currentUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-lg font-medium text-content">{currentUser.username}</div>
                  <div className="text-muted flex items-center gap-1 mt-1">
                    {currentUser.role === 'admin' ? (
                      <>
                        <Shield size={14} className="text-danger" />
                        <span>Administrator</span>
                      </>
                    ) : (
                      <>
                        <User size={14} className="text-success" />
                        <span>Standard User</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="bg-surface-2/50 border border-line p-4 rounded-md">
                <div className="text-content mb-2">Account Details</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted">Username:</div>
                  <div className="text-content">{currentUser.username}</div>
                  <div className="text-muted">Role:</div>
                  <div className="text-content capitalize">{currentUser.role}</div>
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