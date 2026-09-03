// frontend/src/hooks/useApiKeys.js
import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for API key operations
 * @param {string} csrfToken - CSRF token for API requests
 * @returns {Object} API key operations and state
 */
const useApiKeys = (csrfToken) => {
  // State
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Fetch API keys from the server
  const fetchApiKeys = useCallback(async () => {
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
  }, [csrfToken]);

  // Load API keys on component mount
  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  // Create a new API key
  const createApiKey = async (keyData) => {
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
        body: JSON.stringify(keyData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create API key');
      }

      const data = await response.json();
      
      // Set success message
      setMessage('API key created successfully. Be sure to save the key, as it won\'t be shown again!');

      // Refresh the API key list
      await fetchApiKeys();
      
      return data;
    } catch (err) {
      console.error('Error creating API key:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Revoke an API key
  const revokeApiKey = async (id, name) => {
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
      await fetchApiKeys();
    } catch (err) {
      console.error('Error revoking API key:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete an API key
  const deleteApiKey = async (id, name) => {
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
      await fetchApiKeys();
    } catch (err) {
      console.error('Error deleting API key:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Rotate an API key: issue a replacement (returned once) and grace-expire the old one
  const rotateApiKey = async (id, name) => {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      const response = await fetch(`/api/api-keys/${id}/rotate`, {
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
        throw new Error(errorData.error || 'Failed to rotate API key');
      }

      const data = await response.json();
      setMessage(
        `API key "${name}" rotated. Save the new key — it won't be shown again. ` +
        `The old key keeps working briefly so you can update anything still using it.`
      );
      await fetchApiKeys();
      return data;
    } catch (err) {
      console.error('Error rotating API key:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    apiKeys,
    loading,
    refreshing,
    error,
    message,
    setError,
    setMessage,
    fetchApiKeys,
    createApiKey,
    revokeApiKey,
    deleteApiKey,
    rotateApiKey
  };
};

export default useApiKeys;