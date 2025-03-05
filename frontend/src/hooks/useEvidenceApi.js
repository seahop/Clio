// File path: frontend/src/hooks/useEvidenceApi.js
import { useState, useCallback } from 'react';

export const useEvidenceApi = (csrfToken) => {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getAuthHeaders = (tokenOverride) => ({
    'CSRF-Token': tokenOverride || csrfToken || window.csrfToken
  });

  const handleResponse = async (response) => {
    if (response.ok) {
      try {
        // Check if the response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }
        // For file downloads, return the response directly
        return response;
      } catch (error) {
        console.error('Failed to parse response:', error);
        throw new Error('Failed to parse server response');
      }
    }
    
    // Handle error responses
    try {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server error: ${response.status}`);
    } catch (e) {
      throw new Error(`Server error: ${response.status}`);
    }
  };

  const fetchEvidenceFiles = async (logId) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/evidence/${logId}`, {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      
      const result = await handleResponse(response);
      return result;
    } catch (err) {
      console.error('Error fetching evidence files:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const uploadEvidenceFiles = async (logId, files, description) => {
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      
      // Add each file to the form data
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      
      // Add description if provided
      if (description) {
        formData.append('description', description);
      }
      
      const response = await fetch(`/api/evidence/${logId}/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken || window.csrfToken
          // Don't set Content-Type here, it will be set automatically with the boundary
        },
        body: formData
      });
      
      return await handleResponse(response);
    } catch (err) {
      console.error('Error uploading evidence files:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getEvidenceFileUrl = (fileId) => {
    return `/api/evidence/file/${fileId}`;
  };

  const getEvidenceFileDownloadUrl = (fileId) => {
    return `/api/evidence/file/${fileId}/download`;
  };

  const updateEvidenceFile = async (fileId, updates) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/evidence/file/${fileId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(updates)
      });
      
      return await handleResponse(response);
    } catch (err) {
      console.error('Error updating evidence file:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteEvidenceFile = async (fileId) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/evidence/file/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders()
      });
      
      return await handleResponse(response);
    } catch (err) {
      console.error('Error deleting evidence file:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    error,
    loading,
    setError,
    fetchEvidenceFiles,
    uploadEvidenceFiles,
    getEvidenceFileUrl,
    getEvidenceFileDownloadUrl,
    updateEvidenceFile,
    deleteEvidenceFile
  };
};