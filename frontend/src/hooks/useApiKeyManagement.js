// frontend/src/hooks/useApiKeyManagement.js
import { useState, useCallback } from 'react';

export const useApiKeyManagement = (csrfToken) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const fetchApiKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/api-keys', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'CSRF-Token': csrfToken
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch API keys: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error fetching API keys:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  const createApiKey = useCallback(async (keyData) => {
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
          name: keyData.name,
          description: keyData.description,
          permissions: keyData.permissions,
          expires_at: keyData.expiresAt || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create API key');
      }

      const data = await response.json();
      setMessage('API key created successfully');
      return data;
    } catch (err) {
      console.error('Error creating API key:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  const updateApiKey = useCallback(async (id, updates) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update API key');
      }

      const data = await response.json();
      setMessage(`API key "${data.apiKey.name}" updated successfully`);
      return data;
    } catch (err) {
      console.error('Error updating API key:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  const revokeApiKey = useCallback(async (id, name) => {
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to revoke API key');
      }

      const data = await response.json();
      setMessage(`API key "${name}" has been revoked successfully`);
      return data;
    } catch (err) {
      console.error('Error revoking API key:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  const deleteApiKey = useCallback(async (id, name) => {
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete API key');
      }

      setMessage(`API key "${name}" has been deleted successfully`);
      return true;
    } catch (err) {
      console.error('Error deleting API key:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  const resetMessages = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);

  return {
    loading,
    error,
    message,
    fetchApiKeys,
    createApiKey,
    updateApiKey,
    revokeApiKey,
    deleteApiKey,
    resetMessages
  };
};

export default useApiKeyManagement;