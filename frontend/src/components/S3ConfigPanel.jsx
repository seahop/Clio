// frontend/src/components/S3ConfigPanel.jsx
import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Check, Lock, Key, Database, CloudUpload } from 'lucide-react';

const S3ConfigPanel = ({ csrfToken, onConfigSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    enabled: false,
    bucket: '',
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    prefix: 'logs/'
  });
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Fetch existing S3 configuration
  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/logs/s3-config', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No config exists yet, use defaults
          return;
        }
        throw new Error(`Failed to fetch S3 configuration: ${response.status}`);
      }

      const data = await response.json();
      setConfig({
        enabled: data.enabled || false,
        bucket: data.bucket || '',
        region: data.region || '',
        accessKeyId: data.accessKeyId || '',
        secretAccessKey: data.secretAccessKey ? '••••••••••••••••' : '',
        prefix: data.prefix || 'logs/'
      });
    } catch (err) {
      console.error('Error fetching S3 config:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Save S3 configuration
  const saveConfig = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      // Validate inputs
      if (config.enabled) {
        if (!config.bucket) {
          throw new Error('S3 bucket name is required');
        }
        if (!config.region) {
          throw new Error('AWS region is required');
        }
        if (!config.accessKeyId) {
          throw new Error('Access Key ID is required');
        }
        if (!config.secretAccessKey) {
          throw new Error('Secret Access Key is required');
        }
      }

      // Don't send the masked password back to the server
      const configToSend = {
        ...config,
        secretAccessKey: config.secretAccessKey === '••••••••••••••••' ? null : config.secretAccessKey
      };

      const response = await fetch('/api/logs/s3-config', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(configToSend)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save S3 configuration');
      }

      const data = await response.json();
      setMessage('S3 configuration saved successfully');
      
      if (onConfigSaved) {
        onConfigSaved(data);
      }
    } catch (err) {
      console.error('Error saving S3 config:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Test S3 connection
  const testConnection = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      // Validate inputs
      if (!config.bucket || !config.region || !config.accessKeyId || !config.secretAccessKey) {
        throw new Error('All S3 configuration fields are required to test the connection');
      }

      // Don't send the masked password back to the server
      const configToSend = {
        ...config,
        secretAccessKey: config.secretAccessKey === '••••••••••••••••' ? null : config.secretAccessKey
      };

      const response = await fetch('/api/logs/s3-config/test', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(configToSend)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to test S3 connection');
      }

      const data = await response.json();
      setMessage(`S3 connection test successful! ${data.message || ''}`);
    } catch (err) {
      console.error('Error testing S3 connection:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Load config on component mount
  useEffect(() => {
    fetchConfig();
  }, []);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig({
      ...config,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  return (
    <div className="bg-gray-800 p-5 rounded-lg border border-gray-700">
      <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
        <CloudUpload className="text-blue-400" size={20} />
        S3 Export Configuration
      </h3>

      {/* Error and success messages */}
      {(error || message) && (
        <div className={`p-3 mb-4 rounded-md flex items-center gap-2 ${
          message ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
        }`}>
          {message ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{message || error}</span>
        </div>
      )}

      <div className="mb-4">
        <label className="flex items-center gap-2 text-gray-300 mb-1 cursor-pointer">
          <input
            type="checkbox"
            name="enabled"
            checked={config.enabled}
            onChange={handleChange}
            className="rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-700"
          />
          <span className="select-none">Enable S3 Export for Log Rotation</span>
        </label>
        <p className="text-sm text-gray-400 mt-1">
          When enabled, log files will be automatically uploaded to the specified S3 bucket during rotation.
        </p>
      </div>

      <div className={config.enabled ? "space-y-4" : "space-y-4 opacity-50 pointer-events-none"}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">S3 Bucket Name</label>
            <input
              type="text"
              name="bucket"
              value={config.bucket}
              onChange={handleChange}
              placeholder="my-logs-bucket"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">AWS Region</label>
            <input
              type="text"
              name="region"
              value={config.region}
              onChange={handleChange}
              placeholder="us-east-1"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Access Key ID</label>
            <div className="relative">
              <input
                type="text"
                name="accessKeyId"
                value={config.accessKeyId}
                onChange={handleChange}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
              />
              <Key size={16} className="absolute right-3 top-2.5 text-gray-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Secret Access Key</label>
            <div className="relative">
              <input
                type="password"
                name="secretAccessKey"
                value={config.secretAccessKey}
                onChange={handleChange}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
              />
              <Lock size={16} className="absolute right-3 top-2.5 text-gray-500" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">S3 Path Prefix</label>
          <input
            type="text"
            name="prefix"
            value={config.prefix}
            onChange={handleChange}
            placeholder="logs/"
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
          />
          <p className="text-xs text-gray-500 mt-1">
            Optional prefix for the S3 object key, e.g., "logs/" will store files as "logs/filename.zip"
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={fetchConfig}
          disabled={loading}
          className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        
        {config.enabled && (
          <button
            onClick={testConnection}
            disabled={saving || loading}
            className="px-3 py-2 bg-green-700 text-white rounded-md text-sm flex items-center gap-1 hover:bg-green-600 disabled:opacity-50"
          >
            <Database size={16} />
            Test Connection
          </button>
        )}
        
        <button
          onClick={saveConfig}
          disabled={saving || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm flex items-center gap-1 hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} />
              Save Configuration
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default S3ConfigPanel;