// frontend/src/components/Operations.jsx
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Shield, Users, ChevronDown, Plus, X, Edit2, Check, AlertCircle, Briefcase } from 'lucide-react';

// Operations Context for global state management
const OperationsContext = createContext(null);

export const useOperations = () => {
  const context = useContext(OperationsContext);
  if (!context) {
    throw new Error('useOperations must be used within OperationsProvider');
  }
  return context;
};

// Operations Provider Component
export const OperationsProvider = ({ children, csrfToken }) => {
  const [operations, setOperations] = useState([]);
  const [activeOperationId, setActiveOperationId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMyOperations = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/my-operations', {
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOperations(data.operations || []);
        setActiveOperationId(data.activeOperationId);
        
        // Store in localStorage for persistence
        if (data.activeOperationId) {
          localStorage.setItem('activeOperationId', data.activeOperationId);
        }
      }
    } catch (error) {
      console.error('Error fetching operations:', error);
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  const setActiveOperation = useCallback(async (operationId) => {
    try {
      const response = await fetch('/api/operations/set-active', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ operationId })
      });
      
      if (response.ok) {
        setActiveOperationId(operationId);
        localStorage.setItem('activeOperationId', operationId);
        
        // Reload the page to refresh all data with new operation context
        window.location.reload();
      }
    } catch (error) {
      console.error('Error setting active operation:', error);
    }
  }, [csrfToken]);

  useEffect(() => {
    if (csrfToken) {
      fetchMyOperations();
    }
  }, [fetchMyOperations, csrfToken]);

  const value = {
    operations,
    activeOperationId,
    activeOperation: operations.find(op => op.operation_id === activeOperationId),
    loading,
    setActiveOperation,
    refreshOperations: fetchMyOperations
  };

  return (
    <OperationsContext.Provider value={value}>
      {children}
    </OperationsContext.Provider>
  );
};

// Operation Switcher Component (for header/navbar)
export const OperationSwitcher = () => {
  const { operations, activeOperation, setActiveOperation, loading } = useOperations();
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event.target.closest('.operation-switcher')) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded-md">
        <Briefcase size={16} className="text-gray-400" />
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    );
  }

  if (!operations || operations.length === 0) {
    return null; // Don't show switcher if user has no operations
  }

  return (
    <div className="relative operation-switcher">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
      >
        <Briefcase size={16} className="text-blue-400" />
        <span className="text-white text-sm font-medium">
          {activeOperation ? activeOperation.operation_name : 'Select Operation'}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-[9999]">
          <div className="p-2">
            <div className="text-xs text-gray-500 px-2 py-1 uppercase tracking-wide">
              Your Operations
            </div>
            {operations.map((op) => (
              <button
                key={op.operation_id}
                onClick={() => {
                  setActiveOperation(op.operation_id);
                  setIsOpen(false);
                }}
                className={`
                  w-full text-left px-3 py-2 rounded-md transition-colors
                  ${activeOperation?.operation_id === op.operation_id
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-700 text-gray-300'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{op.operation_name}</div>
                    {op.operation_description && (
                      <div className="text-xs opacity-75 mt-0.5">
                        {op.operation_description}
                      </div>
                    )}
                  </div>
                  {op.is_primary && (
                    <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded">
                      Primary
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          
          {activeOperation && (
            <div className="border-t border-gray-700 p-2">
              <div className="px-2 py-1 text-xs text-gray-500">
                Active: <span className="text-blue-400">{activeOperation.tag_name}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Admin Operations Management Component
export const OperationsManagement = ({ csrfToken, currentUser }) => {
  const [operations, setOperations] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchOperations = useCallback(async () => {
    try {
      const response = await fetch('/api/operations?includeInactive=true', {
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOperations(data);
      }
    } catch (error) {
      console.error('Error fetching operations:', error);
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={20} />
          <span>Admin access required</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Operations Management</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
        >
          <Plus size={16} />
          Create Operation
        </button>
      </div>

      {showCreateForm && (
        <CreateOperationForm
          csrfToken={csrfToken}
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => {
            setShowCreateForm(false);
            fetchOperations();
          }}
        />
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading operations...</div>
      ) : operations.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No operations created yet. Click "Create Operation" to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {operations.map((operation) => (
            <OperationCard
              key={operation.id}
              operation={operation}
              csrfToken={csrfToken}
              onUpdate={fetchOperations}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Create Operation Form Component
const CreateOperationForm = ({ csrfToken, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Operation name is required');
      return;
    }
    
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      
      if (response.ok) {
        onSuccess();
      } else {
        setError(data.error || 'Failed to create operation');
      }
    } catch (error) {
      setError('Network error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Operation Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Q1 2025 Assessment"
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Description (Optional)</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:border-blue-500 focus:outline-none"
            placeholder="Brief description of the operation"
            rows={3}
          />
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-md p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Operation'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Operation Card Component
const OperationCard = ({ operation, csrfToken, onUpdate }) => {
  const [users, setUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/operations/${operation.id}/users`, {
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching operation users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUsername.trim()) return;

    try {
      const response = await fetch(`/api/operations/${operation.id}/users`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ username: newUsername, isPrimary: false })
      });

      if (response.ok) {
        setNewUsername('');
        setAddingUser(false);
        fetchUsers();
        onUpdate(); // Refresh operation counts
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to add user');
      }
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Failed to add user');
    }
  };

  const handleRemoveUser = async (username) => {
    if (!confirm(`Remove ${username} from this operation?`)) return;
    
    try {
      const response = await fetch(`/api/operations/${operation.id}/users/${username}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });

      if (response.ok) {
        fetchUsers();
        onUpdate(); // Refresh operation counts
      }
    } catch (error) {
      console.error('Error removing user:', error);
    }
  };

  const togglePrimary = async (username, currentPrimary) => {
    try {
      const response = await fetch(`/api/operations/${operation.id}/users`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ username, isPrimary: !currentPrimary })
      });

      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Error updating primary status:', error);
    }
  };

  useEffect(() => {
    if (showUsers && users.length === 0) {
      fetchUsers();
    }
  }, [showUsers]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-white">{operation.name}</h3>
            {operation.tag_name && (
              <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                {operation.tag_name}
              </span>
            )}
            {!operation.is_active && (
              <span className="text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded">
                Inactive
              </span>
            )}
          </div>
          {operation.description && (
            <p className="text-gray-400 text-sm mt-1">{operation.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span>Created by {operation.created_by}</span>
            <span>{operation.user_count || 0} users assigned</span>
          </div>
        </div>
        
        <button
          onClick={() => setShowUsers(!showUsers)}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
          title="Manage users"
        >
          <Users size={16} className="text-gray-400" />
        </button>
      </div>

      {showUsers && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-400">Assigned Users</h4>
            <button
              onClick={() => setAddingUser(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
            >
              Add User
            </button>
          </div>

          {addingUser && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter username"
                className="flex-1 px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleAddUser()}
              />
              <button
                onClick={handleAddUser}
                className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => {
                  setAddingUser(false);
                  setNewUsername('');
                }}
                className="p-1 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 text-sm">Loading users...</p>
          ) : (
            <div className="space-y-1">
              {users.length === 0 ? (
                <p className="text-gray-500 text-sm">No users assigned</p>
              ) : (
                users.map((user) => (
                  <div
                    key={user.username}
                    className="flex items-center justify-between px-2 py-1 bg-gray-700/50 rounded"
                  >
                    <span className="text-sm text-gray-300">{user.username}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePrimary(user.username, user.is_primary)}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                          user.is_primary 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                        }`}
                      >
                        {user.is_primary ? 'Primary' : 'Set Primary'}
                      </button>
                      <button
                        onClick={() => handleRemoveUser(user.username)}
                        className="p-1 hover:bg-red-600/20 rounded transition-colors"
                        title="Remove user"
                      >
                        <X size={14} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OperationsManagement;