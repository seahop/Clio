import React, { useState, useEffect, useCallback } from 'react';
import { Shield, UserPlus, Users, RefreshCw, AlertCircle, CheckCircle, ShieldCheck, ShieldOff } from 'lucide-react';

const ROLE_BADGE = {
  admin: 'bg-red-900/60 text-red-300 border border-red-700',
  user:  'bg-gray-700 text-gray-300 border border-gray-600',
};

const SSO_BADGE = {
  oidc:   'bg-blue-900/60 text-blue-300 border border-blue-700',
  google: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700',
};

const UserManagement = ({ csrfToken }) => {
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [actionMsg, setActionMsg]     = useState(null);
  const [activeTab, setActiveTab]     = useState('users');
  const [promoting, setPromoting]     = useState(null);
  const [createForm, setCreateForm]   = useState({ username: '', password: '', confirm: '' });
  const [createLoading, setCreateLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const clearMsg = () => setActionMsg(null);

  const handlePromote = async (username) => {
    setPromoting(username);
    setShowConfirm(null);
    clearMsg();
    try {
      const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Promotion failed');
      setActionMsg({ type: 'success', text: data.message });
      fetchUsers();
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message });
    } finally {
      setPromoting(null);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    clearMsg();
    if (createForm.password !== createForm.confirm) {
      setActionMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch('/api/auth/users/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        credentials: 'include',
        body: JSON.stringify({ username: createForm.username, password: createForm.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create admin user');
      setActionMsg({ type: 'success', text: data.message });
      setCreateForm({ username: '', password: '', confirm: '' });
      fetchUsers();
      setActiveTab('users');
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Users className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">User Management</h2>
      </div>

      {actionMsg && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
          actionMsg.type === 'success' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span>{actionMsg.text}</span>
          <button onClick={clearMsg} className="ml-auto text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 ${activeTab === 'users'
            ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
            : 'text-gray-400 hover:text-gray-300'}`}
        >
          <div className="flex items-center gap-2">
            <Users size={16} />
            <span>All Users</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 ${activeTab === 'create'
            ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
            : 'text-gray-400 hover:text-gray-300'}`}
        >
          <div className="flex items-center gap-2">
            <UserPlus size={16} />
            <span>Create Admin</span>
          </div>
        </button>
      </div>

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-400 text-sm">
              Local users with custom passwords and SSO accounts. Users who have never logged in
              or not yet changed their initial password are not listed.
            </p>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw size={24} className="animate-spin text-gray-400" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="py-2 pr-4 font-medium">Username</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Auth</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.username} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                      <td className="py-2 pr-4 font-mono text-white">{u.username}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[u.role]}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {u.ssoType ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SSO_BADGE[u.ssoType]}`}>
                            {u.ssoType.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">local</span>
                        )}
                      </td>
                      <td className="py-2">
                        {u.role === 'user' && !u.ssoType && (
                          showConfirm === u.username ? (
                            <div className="flex items-center gap-2">
                              <span className="text-yellow-300 text-xs">Promote to admin?</span>
                              <button
                                onClick={() => handlePromote(u.username)}
                                disabled={promoting === u.username}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded disabled:opacity-50 flex items-center gap-1"
                              >
                                {promoting === u.username
                                  ? <RefreshCw size={12} className="animate-spin" />
                                  : <ShieldCheck size={12} />}
                                Confirm
                              </button>
                              <button
                                onClick={() => setShowConfirm(null)}
                                className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowConfirm(u.username)}
                              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-xs rounded flex items-center gap-1 transition-colors"
                            >
                              <ShieldCheck size={12} />
                              Promote to admin
                            </button>
                          )
                        )}
                        {u.role === 'admin' && (
                          <span className="flex items-center gap-1 text-gray-500 text-xs">
                            <Shield size={12} /> Admin
                          </span>
                        )}
                        {u.ssoType && u.role === 'user' && (
                          <span className="flex items-center gap-1 text-gray-500 text-xs">
                            <ShieldOff size={12} /> Via IdP group
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-gray-600 text-xs mt-3">
            Promoting a user copies their password to the admin store and revokes their current sessions.
            They must log in again to receive their admin token.
          </p>
        </div>
      )}

      {/* Create admin tab */}
      {activeTab === 'create' && (
        <div className="bg-gray-800 rounded-lg p-4 max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={20} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Create Admin User</h3>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Creates a new local admin account. The user can log in immediately with the password you set.
          </p>

          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
              <input
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                required
                autoComplete="off"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="e.g. alice"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="Must meet password policy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
              <input
                type="password"
                value={createForm.confirm}
                onChange={(e) => setCreateForm((f) => ({ ...f, confirm: e.target.value }))}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="Repeat password"
              />
            </div>
            <button
              type="submit"
              disabled={createLoading}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {createLoading ? (
                <><RefreshCw size={16} className="animate-spin" /><span>Creating...</span></>
              ) : (
                <><UserPlus size={16} /><span>Create Admin User</span></>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
