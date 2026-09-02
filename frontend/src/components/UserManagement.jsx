import React, { useState, useEffect, useCallback } from 'react';
import { Shield, UserPlus, Users, RefreshCw, AlertCircle, CheckCircle, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button, Badge, SkeletonText, EmptyState } from './common/ui';

const ROLE_TONE = {
  admin: 'danger',
  user:  'neutral',
};

const SSO_TONE = {
  oidc:   'info',
  google: 'warning',
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
        <Users className="text-accent" size={24} />
        <h2 className="text-xl font-bold text-content">User Management</h2>
      </div>

      {actionMsg && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 border ${
          actionMsg.type === 'success'
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-danger/10 border-danger/30 text-danger'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span>{actionMsg.text}</span>
          <button onClick={clearMsg} className="ml-auto text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line mb-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 ${activeTab === 'users'
            ? 'text-accent border-b-2 border-accent -mb-px'
            : 'text-muted hover:text-content'}`}
        >
          <div className="flex items-center gap-2">
            <Users size={16} />
            <span>All Users</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 ${activeTab === 'create'
            ? 'text-accent border-b-2 border-accent -mb-px'
            : 'text-muted hover:text-content'}`}
        >
          <div className="flex items-center gap-2">
            <UserPlus size={16} />
            <span>Create Admin</span>
          </div>
        </button>
      </div>

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-muted text-sm">
              Local users with custom passwords and SSO accounts. Users who have never logged in
              or not yet changed their initial password are not listed.
            </p>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="p-2 text-muted hover:text-content transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {loading ? (
            <SkeletonText lines={5} className="py-4" />
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="No users found" message="Local and SSO accounts appear here once users have logged in and set a password." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2 pr-4 font-medium">Username</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Auth</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.username} className="border-b border-line/50 hover:bg-surface-3/40">
                      <td className="py-2 pr-4 font-mono text-content">{u.username}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {u.ssoType ? (
                          <Badge tone={SSO_TONE[u.ssoType] || 'neutral'}>{u.ssoType.toUpperCase()}</Badge>
                        ) : (
                          <span className="text-faint text-xs">local</span>
                        )}
                      </td>
                      <td className="py-2">
                        {u.role === 'user' && !u.ssoType && (
                          showConfirm === u.username ? (
                            <div className="flex items-center gap-2">
                              <span className="text-warning text-xs">Promote to admin?</span>
                              <Button
                                variant="danger"
                                size="sm"
                                icon={ShieldCheck}
                                loading={promoting === u.username}
                                onClick={() => handlePromote(u.username)}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="subtle"
                                size="sm"
                                onClick={() => setShowConfirm(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={ShieldCheck}
                              onClick={() => setShowConfirm(u.username)}
                            >
                              Promote to admin
                            </Button>
                          )
                        )}
                        {u.role === 'admin' && (
                          <span className="flex items-center gap-1 text-faint text-xs">
                            <Shield size={12} /> Admin
                          </span>
                        )}
                        {u.ssoType && u.role === 'user' && (
                          <span className="flex items-center gap-1 text-faint text-xs">
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

          <p className="text-faint text-xs mt-3">
            Promoting a user copies their password to the admin store and revokes their current sessions.
            They must log in again to receive their admin token.
          </p>
        </div>
      )}

      {/* Create admin tab */}
      {activeTab === 'create' && (
        <div className="bg-surface border border-line rounded-card p-4 max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={20} className="text-accent" />
            <h3 className="text-lg font-semibold text-content">Create Admin User</h3>
          </div>
          <p className="text-muted text-sm mb-4">
            Creates a new local admin account. The user can log in immediately with the password you set.
          </p>

          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Username</label>
              <input
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                required
                autoComplete="off"
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-md text-content placeholder-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="e.g. alice"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Password</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-md text-content placeholder-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="Must meet password policy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Confirm Password</label>
              <input
                type="password"
                value={createForm.confirm}
                onChange={(e) => setCreateForm((f) => ({ ...f, confirm: e.target.value }))}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-md text-content placeholder-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="Repeat password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              icon={createLoading ? undefined : UserPlus}
              loading={createLoading}
            >
              {createLoading ? 'Creating...' : 'Create Admin User'}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
