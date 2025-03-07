// frontend/src/components/ApiKeyManager.jsx
import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Plus, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  Check, 
  Calendar, 
  Copy, 
  MoreHorizontal,
  Shield,
  Clock,
  Lock,
  Download
} from 'lucide-react';

const ApiKeyManager = ({ csrfToken }) => {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyData, setNewKeyData] = useState({
    name: '',
    description: '',
    permissions: ['logs:write'],
    expiresAt: ''
  });
  const [newApiKey, setNewApiKey] = useState(null);
  const [keyDetailOpen, setKeyDetailOpen] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  // Available permissions
  const permissionOptions = [
    { id: 'logs:write', label: 'Write Logs', description: 'Submit new logs via API' },
    { id: 'logs:read', label: 'Read Logs', description: 'Read existing logs via API' },
    { id: 'logs:admin', label: 'Admin Access', description: 'Full admin privileges via API' }
  ];

  // Fetch API keys from the server
  const fetchApiKeys = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/api-keys', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'CSRF-Token': csrfToken
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch API keys: ${response.status}`);
      }

      const data = await response.json();
      setApiKeys(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching API keys:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load API keys on component mount
  useEffect(() => {
    fetchApiKeys();
  }, [csrfToken]);

  // Handle creating a new API key
  const handleCreateApiKey = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          name: newKeyData.name,
          description: newKeyData.description,
          permissions: newKeyData.permissions,
          expires_at: newKeyData.expiresAt || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create API key');
      }

      const data = await response.json();
      
      // Clear form and show success message
      setNewKeyData({
        name: '',
        description: '',
        permissions: ['logs:write'],
        expiresAt: ''
      });
      
      // Store the new API key to display to the user
      setNewApiKey(data.apiKey);
      
      // Set success message
      setMessage('API key created successfully. Be sure to save the key, as it won\'t be shown again!');
      
      // Refresh the API key list
      fetchApiKeys();
      
      // Hide the create form
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating API key:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle revoking an API key
  const handleRevokeApiKey = async (id, name) => {
    if (!window.confirm(`Are you sure you want to revoke the API key "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/api-keys/${id}/revoke`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to revoke API key');
      }

      // Show success message
      setMessage(`API key "${name}" has been revoked successfully`);
      
      // Refresh the API key list
      fetchApiKeys();
    } catch (err) {
      console.error('Error revoking API key:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle deleting an API key
  const handleDeleteApiKey = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the API key "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete API key');
      }

      // Show success message
      setMessage(`API key "${name}" has been deleted successfully`);
      
      // Refresh the API key list
      fetchApiKeys();
    } catch (err) {
      console.error('Error deleting API key:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle API key details
  const toggleKeyDetail = (id) => {
    setKeyDetailOpen(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Handle permission checkbox change
  const handlePermissionChange = (permission) => {
    setNewKeyData(prev => {
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

  // Copy text to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setMessage('Copied to clipboard!');
        setTimeout(() => setMessage(null), 2000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
        setError('Failed to copy to clipboard');
      }
    );
  };

  // Function to generate a cURL command example for a given API key
  const generateCurlExample = (apiKey) => {
    return `curl -k -X POST https://your-IP-or-Host:3000/ingest/logs \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "internal_ip": "192.168.1.100",
    "external_ip": "203.0.113.1",
    "hostname": "victim-host",
    "domain": "example.org",
    "username": "jsmith",
    "command": "cat /etc/passwd",
    "notes": "Privilege escalation attempt",
    "filename": "passwd",
    "status": "ON_DISK"
  }'`;
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  // Generate a code snippet for Python
  const generatePythonExample = (apiKey) => {
    return `import requests
import urllib3

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

url = "https://your-IP-or-Host:3000/ingest/logs"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "${apiKey}"
}
payload = {
    "internal_ip": "192.168.1.100",
    "external_ip": "203.0.113.1",
    "hostname": "victim-host",
    "domain": "example.org",
    "username": "jsmith",
    "command": "cat /etc/passwd",
    "notes": "Privilege escalation attempt",
    "filename": "passwd",
    "status": "ON_DISK"
}

response = requests.post(url, headers=headers, json=payload, verify=False)
print(f"Status code: {response.status_code}")
print(f"Response: {response.json()}")`;
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Key className="text-purple-400" size={24} />
        <h2 className="text-xl font-bold text-white">API Key Management</h2>
      </div>

      {/* Error and success messages */}
      {(message || error) && (
        <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
          message ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          {message ? <Check size={20} /> : <AlertCircle size={20} />}
          <span>{message || error}</span>
        </div>
      )}

      {/* Create button and intro text */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-gray-300">
          Manage API keys for automated log submission from external tools and scripts.
        </p>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors duration-200 ${
            showCreateForm 
              ? 'bg-gray-700 text-white' 
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          {showCreateForm ? 'Cancel' : (
            <>
              <Plus size={16} />
              Create API Key
            </>
          )}
        </button>
      </div>

      {/* Create new API key form */}
      {showCreateForm && (
        <div className="bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700">
          <h3 className="text-lg font-medium text-white mb-3">Create New API Key</h3>
          
          <form onSubmit={handleCreateApiKey}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newKeyData.name}
                  onChange={(e) => setNewKeyData({...newKeyData, name: e.target.value})}
                  required
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="e.g., Splunk Integration"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Expiration Date (Optional)</label>
                <input
                  type="date"
                  value={newKeyData.expiresAt}
                  onChange={(e) => setNewKeyData({...newKeyData, expiresAt: e.target.value})}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">Description (Optional)</label>
                <textarea
                  value={newKeyData.description}
                  onChange={(e) => setNewKeyData({...newKeyData, description: e.target.value})}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="What will this API key be used for?"
                  rows="2"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-2">Permissions</label>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {permissionOptions.map(permission => (
                    <div 
                      key={permission.id}
                      className="flex items-start p-2 bg-gray-700/50 rounded border border-gray-600"
                    >
                      <input
                        type="checkbox"
                        id={`perm-${permission.id}`}
                        checked={newKeyData.permissions.includes(permission.id)}
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
      )}

      {/* Newly created API key display */}
      {newApiKey && (
        <div className="bg-purple-900/30 border border-purple-500/50 p-4 rounded-lg mb-6 relative">
          <div className="absolute top-2 right-2">
            <button 
              onClick={() => setNewApiKey(null)}
              className="text-gray-400 hover:text-white p-1"
              title="Close"
            >
              ×
            </button>
          </div>
          
          <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
            <Key size={18} className="text-purple-300" />
            New API Key Generated
          </h3>
          
          <div className="bg-gray-800 p-3 rounded mb-3 flex items-center justify-between">
            <div className="font-mono text-green-300 text-sm overflow-x-auto whitespace-nowrap">
              {newApiKey.key}
            </div>
            <button 
              onClick={() => copyToClipboard(newApiKey.key)}
              className="ml-2 p-1.5 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
              title="Copy API key"
            >
              <Copy size={16} />
            </button>
          </div>
          
          <div className="bg-yellow-900/30 text-yellow-200 p-3 rounded mb-3 text-sm">
            <strong>Important:</strong> This key will not be shown again. Please copy and store it securely.
          </div>
          
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-1">Key Details</h4>
              <div className="bg-gray-800 p-3 rounded text-sm">
                <div className="mb-1">
                  <span className="text-gray-400">Name:</span> {newApiKey.name}
                </div>
                {newApiKey.description && (
                  <div className="mb-1">
                    <span className="text-gray-400">Description:</span> {newApiKey.description}
                  </div>
                )}
                <div className="mb-1">
                  <span className="text-gray-400">Created:</span> {formatDate(newApiKey.createdAt)}
                </div>
                {newApiKey.expiresAt && (
                  <div>
                    <span className="text-gray-400">Expires:</span> {formatDate(newApiKey.expiresAt)}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-1">Sample Usage</h4>
              <div className="bg-gray-800 p-3 rounded">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
                  {generateCurlExample(newApiKey.key)}
                </pre>
                <button 
                  onClick={() => copyToClipboard(generateCurlExample(newApiKey.key))}
                  className="mt-2 px-2 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded text-xs flex items-center gap-1"
                >
                  <Copy size={12} />
                  Copy Example
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys List */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-medium text-white">API Keys</h3>
          <button 
            onClick={fetchApiKeys} 
            disabled={refreshing}
            className="p-1 text-gray-400 hover:text-white rounded"
            title="Refresh API keys"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
        
        {loading && !refreshing ? (
          <div className="flex justify-center items-center py-8">
            <RefreshCw className="animate-spin text-purple-400 mr-2" size={20} />
            <span className="text-gray-300">Loading API keys...</span>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="bg-gray-700/30 rounded-lg p-8 text-center">
            <Key className="text-gray-500 mx-auto mb-2" size={36} />
            <p className="text-gray-300 mb-2">No API keys found</p>
            <p className="text-sm text-gray-400">
              Create an API key to allow external tools to submit logs to the system.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys.map(key => (
              <div 
                key={key.id} 
                className={`border rounded-lg ${key.isActive 
                  ? 'border-gray-600 bg-gray-700/30' 
                  : 'border-red-900/50 bg-red-900/10'}`}
              >
                <div className="p-3 flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Key size={16} className={key.isActive ? "text-purple-400" : "text-red-400"} />
                      <h4 className="font-medium text-white">{key.name}</h4>
                      {!key.isActive && (
                        <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded">
                          Revoked
                        </span>
                      )}
                      {key.expiresAt && new Date(key.expiresAt) < new Date() && (
                        <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 text-xs rounded">
                          Expired
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-400 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        Created: {formatDate(key.createdAt)}
                      </span>
                      {key.expiresAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          Expires: {formatDate(key.expiresAt)}
                        </span>
                      )}
                      {key.lastUsed && (
                        <span className="flex items-center gap-1">
                          <Shield size={12} />
                          Last used: {formatDate(key.lastUsed)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="text-xs flex-shrink-0 text-gray-300 bg-gray-800 px-2 py-1 rounded">
                      ID: <span className="font-mono">{key.keyId}</span>
                    </div>
                    <button
                      onClick={() => toggleKeyDetail(key.id)}
                      title={keyDetailOpen[key.id] ? "Hide details" : "Show details"}
                      className="p-1 text-gray-400 hover:text-white rounded"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {key.isActive && (
                      <button
                        onClick={() => handleRevokeApiKey(key.id, key.name)}
                        title="Revoke key"
                        className="p-1 text-gray-400 hover:text-red-400 rounded"
                      >
                        <Lock size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteApiKey(key.id, key.name)}
                      title="Delete key"
                      className="p-1 text-gray-400 hover:text-red-400 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                {keyDetailOpen[key.id] && (
                  <div className="p-3 border-t border-gray-600 bg-gray-700/50">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h5 className="text-sm font-medium text-gray-300 mb-2">API Key Details</h5>
                        <div className="space-y-1 text-sm">
                          {key.description && (
                            <div>
                              <span className="text-gray-400">Description:</span> {key.description}
                            </div>
                          )}
                          <div>
                            <span className="text-gray-400">Created by:</span> {key.createdBy}
                          </div>
                          <div>
                            <span className="text-gray-400">Permissions:</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {key.permissions.map(perm => {
                                const permission = permissionOptions.find(p => p.id === perm);
                                return (
                                  <span 
                                    key={perm} 
                                    className="px-2 py-0.5 bg-gray-600 text-gray-200 text-xs rounded"
                                    title={permission?.description}
                                  >
                                    {permission?.label || perm}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {key.isActive && (
                        <div>
                          <h5 className="text-sm font-medium text-gray-300 mb-2">Integration Examples</h5>
                          <div className="space-y-2">
                            <button
                              onClick={() => copyToClipboard(generateCurlExample(`[YOUR_API_KEY]`))}
                              className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm text-left flex items-center justify-between"
                            >
                              <span>cURL Example</span>
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => copyToClipboard(generatePythonExample(`[YOUR_API_KEY]`))}
                              className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm text-left flex items-center justify-between"
                            >
                              <span>Python Example</span>
                              <Download size={14} />
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-gray-400">
                            Remember to replace <code className="bg-gray-800 px-1 rounded">[YOUR_API_KEY]</code> with the actual API key value.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiKeyManager;