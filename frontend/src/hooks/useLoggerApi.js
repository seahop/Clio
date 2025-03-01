// hooks/useLoggerApi.js - with CSRF error handling
import { useState, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'https://localhost:3001';

export const useLoggerApi = (csrfToken) => {
  const [error, setError] = useState(null);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  const refreshCsrfToken = useCallback(async () => {
    try {
      setIsRefreshingToken(true);
      console.log("API hook: Refreshing CSRF token...");
      
      const response = await fetch(`${API_URL}/api/csrf-token`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        cache: 'no-cache',
      });
      
      if (!response.ok) {
        console.error("Failed to refresh CSRF token:", response.status);
        return null;
      }
      
      const data = await response.json();
      
      if (data.csrfToken) {
        console.log("New CSRF token received");
        window.csrfToken = data.csrfToken;
        return data.csrfToken;
      }
      
      return null;
    } catch (error) {
      console.error("Error refreshing CSRF token:", error);
      return null;
    } finally {
      setIsRefreshingToken(false);
    }
  }, []);

  const getAuthHeaders = (tokenOverride) => ({
    'Content-Type': 'application/json',
    'CSRF-Token': tokenOverride || csrfToken || window.csrfToken
  });

  const handleAuthError = () => {
    // Clear local storage and reload page
    localStorage.clear();
    window.location.reload();
  };

  const handleResponse = async (response) => {
    // Handle successful response
    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Failed to parse server response');
      }
    }
    
    // Handle specific status codes
    if (response.status === 401) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: 'Authentication required' };
      }
      
      // Show user-friendly message before reload
      alert(errorData.error || 'Your session has expired. Please log in again.');
      handleAuthError();
      throw new Error(errorData.error || 'Authentication required');
    }
    
    if (response.status === 403) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: 'Access denied' };
      }
      
      // If it's a CSRF error, try to refresh the token
      if (errorData.error && (
          errorData.error.includes('CSRF') || 
          errorData.error.includes('csrf') || 
          errorData.message?.includes('CSRF') ||
          errorData.message?.includes('csrf')
      )) {
        console.warn('CSRF token validation failed. Attempting to refresh...');
        return null;  // Signal CSRF refresh needed
      }
      
      throw new Error(errorData.error || 'Access denied');
    }
    
    // Handle other errors
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { error: `Server error: ${response.status}` };
    }
    
    throw new Error(errorData.error || 'An error occurred');
  };

  // Execute a fetch request with automatic CSRF token refresh on 403 errors
  const executeApiRequest = async (url, options, retryCount = 1) => {
    try {
      const response = await fetch(url, options);
      const result = await handleResponse(response);
      
      // If result is null, it's a CSRF error that needs token refresh
      if (result === null && retryCount > 0) {
        const newToken = await refreshCsrfToken();
        if (newToken) {
          // Update the headers with the new token
          const newOptions = {
            ...options,
            headers: {
              ...options.headers,
              'CSRF-Token': newToken
            }
          };
          
          // Retry the request with the new token
          console.log('Retrying request with new CSRF token...');
          return executeApiRequest(url, newOptions, retryCount - 1);
        }
      }
      
      return result;
    } catch (err) {
      // Re-throw the error to be handled by the caller
      throw err;
    }
  };

  const fetchLogs = async () => {
    if (!csrfToken && !window.csrfToken) return null;
    
    try {
      const options = {
        credentials: 'include',
        headers: getAuthHeaders()
      };
      
      return await executeApiRequest(`${API_URL}/api/logs`, options);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err.message);
      return null;
    }
  };

  const updateLog = async (logId, updates) => {
    try {
      const options = {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(updates),
      };
      
      return await executeApiRequest(`${API_URL}/api/logs/${logId}`, options);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const deleteLog = async (logId) => {
    try {
      const options = {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include'
      };
      
      return await executeApiRequest(`${API_URL}/api/logs/${logId}`, options);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const createLog = async (newLog) => {
    try {
      const options = {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(newLog),
      };
      
      return await executeApiRequest(`${API_URL}/api/logs`, options);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return {
    error,
    setError,
    fetchLogs,
    updateLog,
    deleteLog,
    createLog,
    refreshCsrfToken,
    isRefreshingToken
  };
};