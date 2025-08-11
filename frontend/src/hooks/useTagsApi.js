// frontend/src/hooks/useTagsApi.js
import { useState, useCallback } from 'react';

export const useTagsApi = () => {
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Helper to get CSRF token - matching pattern from useLoggerApi
  const getCsrfToken = () => {
    // Try to get from window first (where App.jsx stores it)
    return window.csrfToken || '';
  };

  // Helper to get auth headers - matching pattern from useLoggerApi
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'CSRF-Token': getCsrfToken() // Match the exact header name used in other hooks
    };
  };

  // Execute API request with error handling
  const executeApiRequest = async (url, options = {}) => {
    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Fetch all tags
  const fetchAllTags = useCallback(async () => {
    setIsLoading(true);
    try {
      const options = {
        method: 'GET',
        headers: getAuthHeaders()
      };
      
      const tags = await executeApiRequest('/api/tags', options);
      return tags;
    } catch (err) {
      console.error('Error fetching tags:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch tags for a specific log
  const fetchLogTags = useCallback(async (logId) => {
    try {
      const options = {
        method: 'GET',
        headers: getAuthHeaders()
      };
      
      const tags = await executeApiRequest(`/api/tags/log/${logId}`, options);
      return tags;
    } catch (err) {
      console.error('Error fetching log tags:', err);
      return [];
    }
  }, []);

  // Fetch tags for multiple logs (batch)
  const fetchTagsForLogs = useCallback(async (logIds) => {
    try {
      const options = {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ logIds })
      };
      
      const tagsByLogId = await executeApiRequest('/api/tags/logs/batch', options);
      return tagsByLogId;
    } catch (err) {
      console.error('Error fetching tags for logs:', err);
      return {};
    }
  }, []);

  // Search tags (for autocomplete)
  const searchTags = useCallback(async (query) => {
    try {
      const options = {
        method: 'GET',
        headers: getAuthHeaders()
      };
      
      const tags = await executeApiRequest(`/api/tags/search?q=${encodeURIComponent(query)}`, options);
      return tags;
    } catch (err) {
      console.error('Error searching tags:', err);
      return [];
    }
  }, []);

  // Create a new tag
  const createTag = useCallback(async (tagData) => {
    try {
      const options = {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(tagData)
      };
      
      const newTag = await executeApiRequest('/api/tags', options);
      return newTag;
    } catch (err) {
      console.error('Error creating tag:', err);
      throw err;
    }
  }, []);

  // Add tags to a log - WITH DEBUG LOGGING
  const addTagsToLog = useCallback(async (logId, tagIds = [], tagNames = []) => {
    try {
      console.log('addTagsToLog called with:', { logId, tagIds, tagNames }); // Debug
      
      const requestBody = { 
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        tagNames: tagNames.length > 0 ? tagNames : undefined
      };
      
      console.log('Request body:', requestBody); // Debug
      
      const options = {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody)
      };
      
      const updatedTags = await executeApiRequest(`/api/tags/log/${logId}`, options);
      
      console.log('Response from server:', updatedTags); // Debug
      
      return updatedTags;
    } catch (err) {
      console.error('Error adding tags to log:', err);
      throw err;
    }
  }, []);

  // Remove a tag from a log
  const removeTagFromLog = useCallback(async (logId, tagId) => {
    try {
      const options = {
        method: 'DELETE',
        headers: getAuthHeaders()
      };
      
      await executeApiRequest(`/api/tags/log/${logId}/tag/${tagId}`, options);
      return true;
    } catch (err) {
      console.error('Error removing tag from log:', err);
      throw err;
    }
  }, []);

  // Remove all tags from a log
  const removeAllTagsFromLog = useCallback(async (logId) => {
    try {
      const options = {
        method: 'DELETE',
        headers: getAuthHeaders()
      };
      
      const result = await executeApiRequest(`/api/tags/log/${logId}/all`, options);
      return result;
    } catch (err) {
      console.error('Error removing all tags from log:', err);
      throw err;
    }
  }, []);

  // Update a tag (admin only)
  const updateTag = useCallback(async (tagId, updates) => {
    try {
      const options = {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      };
      
      const updatedTag = await executeApiRequest(`/api/tags/${tagId}`, options);
      return updatedTag;
    } catch (err) {
      console.error('Error updating tag:', err);
      throw err;
    }
  }, []);

  // Delete a tag (admin only)
  const deleteTag = useCallback(async (tagId) => {
    try {
      const options = {
        method: 'DELETE',
        headers: getAuthHeaders()
      };
      
      const result = await executeApiRequest(`/api/tags/${tagId}`, options);
      return result;
    } catch (err) {
      console.error('Error deleting tag:', err);
      throw err;
    }
  }, []);

  // Get tag statistics
  const fetchTagStats = useCallback(async () => {
    try {
      const options = {
        method: 'GET',
        headers: getAuthHeaders()
      };
      
      const stats = await executeApiRequest('/api/tags/stats', options);
      return stats;
    } catch (err) {
      console.error('Error fetching tag stats:', err);
      throw err;
    }
  }, []);

  // Get related tags (co-occurrence)
  const fetchRelatedTags = useCallback(async (tagId) => {
    try {
      const options = {
        method: 'GET',
        headers: getAuthHeaders()
      };
      
      const relatedTags = await executeApiRequest(`/api/tags/${tagId}/related`, options);
      return relatedTags;
    } catch (err) {
      console.error('Error fetching related tags:', err);
      return [];
    }
  }, []);

  // Filter logs by tags
  const filterLogsByTags = useCallback(async (tagIds = [], tagNames = []) => {
    try {
      const options = {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tagIds: tagIds.length > 0 ? tagIds : undefined,
          tagNames: tagNames.length > 0 ? tagNames : undefined
        })
      };
      
      const logs = await executeApiRequest('/api/tags/filter', options);
      return logs;
    } catch (err) {
      console.error('Error filtering logs by tags:', err);
      return [];
    }
  }, []);

  return {
    error,
    setError,
    isLoading,
    
    // Tag operations
    fetchAllTags,
    fetchLogTags,
    fetchTagsForLogs,
    searchTags,
    createTag,
    
    // Log-tag associations
    addTagsToLog,
    removeTagFromLog,
    removeAllTagsFromLog,
    
    // Admin operations
    updateTag,
    deleteTag,
    
    // Analytics
    fetchTagStats,
    fetchRelatedTags,
    
    // Filtering
    filterLogsByTags
  };
};

export default useTagsApi;