// frontend/src/components/api-keys/CreateApiKeyForm.jsx
import React, { useState, useEffect } from 'react';
import { Key, RefreshCw } from 'lucide-react';

// Available permissions
const PERMISSION_OPTIONS = [
  { id: 'logs:write', label: 'Write Logs', description: 'Submit new logs via API' },
  { id: 'logs:read', label: 'Read Logs', description: 'Read existing logs via API' },
  { id: 'logs:admin', label: 'Admin Access', description: 'Full admin privileges via API' }
];

/**
 * Form for creating new API keys
 */
const CreateApiKeyForm = ({ onSubmit, onCancel, loading, csrfToken }) => {
  const [keyData, setKeyData] = useState({
    name: '',
    description: '',
    permissions: ['logs:write'],
    expiresAt: '',
    operation_id: null
  });

  const [operations, setOperations] = useState([]);
  const [loadingOperations, setLoadingOperations] = useState(true);

  // Fetch operations on mount
  useEffect(() => {
    const fetchOperations = async () => {
      try {
        const response = await fetch('/api/operations', {
          credentials: 'include',
          headers: {
            'CSRF-Token': csrfToken
          }
        });

        if (response.ok) {
          const data = await response.json();
          setOperations(data || []);
        } else {
          console.error('Error fetching operations:', response.statusText);
        }
      } catch (error) {
        console.error('Error fetching operations:', error);
      } finally {
        setLoadingOperations(false);
      }
    };

    if (csrfToken) {
      fetchOperations();
    }
  }, [csrfToken]);

  // Handle permission checkbox change
  const handlePermissionChange = (permission) => {
    setKeyData(prev => {
      const currentPermissions = [...prev.permissions];
      
      if (currentPermissions.includes(permission)) {
        // Remove permission
        return {
          ...prev,
          permissions: currentPermissions.filter(p => p !== permission)
        };
      } else {
        // Add permission
        return {
          ...prev,
          permissions: [...currentPermissions, permission]
        };
      }
    });
  };

  // Form submission handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Fix the date offset issue by adjusting the date
    let adjustedExpiresAt = null;
    if (keyData.expiresAt) {
      // Create a date object from the input value
      const dateObj = new Date(keyData.expiresAt);
      // Add one day to fix the offset issue
      dateObj.setDate(dateObj.getDate() + 1);
      adjustedExpiresAt = dateObj.toISOString().split('T')[0];
    }
    
    const success = await onSubmit({
      name: keyData.name,
      description: keyData.description,
      permissions: keyData.permissions,
      expires_at: adjustedExpiresAt || null,
      operation_id: keyData.operation_id ? parseInt(keyData.operation_id) : null
    });
    
    if (success) {
      // Reset form if successful
      setKeyData({
        name: '',
        description: '',
        permissions: ['logs:write'],
        expiresAt: '',
        operation_id: null
      });
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700">
      <h3 className="text-lg font-medium text-white mb-3">Create New API Key</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={keyData.name}
              onChange={(e) => setKeyData({...keyData, name: e.target.value})}
              required
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="e.g., Cobalt_Strike_Key1"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Operation (Optional)</label>
            <select
              value={keyData.operation_id || ''}
              onChange={(e) => setKeyData({...keyData, operation_id: e.target.value || null})}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
              disabled={loadingOperations}
            >
              <option value="">No operation (unrestricted)</option>
              {operations.map(op => (
                <option key={op.id} value={op.id}>
                  {op.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Scope API key to a specific operation
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Expiration Date (Optional)</label>
            <input
              type="date"
              value={keyData.expiresAt}
              onChange={(e) => setKeyData({...keyData, expiresAt: e.target.value})}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Description (Optional)</label>
            <textarea
              value={keyData.description}
              onChange={(e) => setKeyData({...keyData, description: e.target.value})}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="What will this API key be used for?"
              rows="2"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-2">Permissions</label>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {PERMISSION_OPTIONS.map(permission => (
                <div 
                  key={permission.id}
                  className="flex items-start p-2 bg-gray-700/50 rounded border border-gray-600"
                >
                  <input
                    type="checkbox"
                    id={`perm-${permission.id}`}
                    checked={keyData.permissions.includes(permission.id)}
                    onChange={() => handlePermissionChange(permission.id)}
                    className="mt-1 mr-2"
                  />
                  <div>
                    <label htmlFor={`perm-${permission.id}`} className="text-white font-medium cursor-pointer">
                      {permission.label}
                    </label>
                    <p className="text-xs text-gray-400">{permission.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Key size={16} />
                Generate API Key
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateApiKeyForm;