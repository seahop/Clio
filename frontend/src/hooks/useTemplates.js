// src/hooks/useTemplates.js with token refresh
import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to manage log templates with token refresh
 * @param {string} csrfToken - CSRF token for API requests
 * @returns {Object} Template operations and state
 */
export const useTemplates = (initialCsrfToken) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [csrfToken, setCsrfToken] = useState(initialCsrfToken);

  // Function to refresh the CSRF token
  const refreshCsrfToken = useCallback(async () => {
    try {
      console.log("Refreshing CSRF token before template operation...");
      const response = await fetch('/api/csrf-token', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        cache: 'no-cache',
      });

      if (!response.ok) {
        console.error('Failed to refresh CSRF token:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.csrfToken) {
        console.log("CSRF token refreshed successfully");
        setCsrfToken(data.csrfToken);
        // Also update the global token
        window.csrfToken = data.csrfToken;
        return data.csrfToken;
      }
      return null;
    } catch (error) {
      console.error('Error refreshing CSRF token:', error);
      return null;
    }
  }, []);

  // Ensure we have a fresh token before performing operations
  const getLatestToken = useCallback(async () => {
    // Refresh the token to ensure it's fresh
    const freshToken = await refreshCsrfToken();
    // Return the fresh token, fall back to stored token if refresh fails
    return freshToken || csrfToken || window.csrfToken;
  }, [csrfToken, refreshCsrfToken]);

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
  }, [initialCsrfToken]);

  // Fetch all templates from the server
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the latest token before fetching
      const tokenToUse = await getLatestToken();
      
      const response = await fetch('/api/templates', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'CSRF-Token': tokenToUse
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch templates');
      }
      
      const data = await response.json();
      
      // Transform the data to match the format used by the TemplateManager component
      const formattedTemplates = data.map(template => ({
        id: template.id.toString(),
        name: template.name,
        // If template_data is a string, parse it, otherwise use the data field
        data: typeof template.template_data === 'string' 
          ? JSON.parse(template.template_data) 
          : template.data || {},
        createdAt: template.created_at
      }));
      
      setTemplates(formattedTemplates);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Create a new template
  const createTemplate = async (templateName, templateData) => {
    try {
      setError(null);
      
      // Get the latest token before creating
      const tokenToUse = await getLatestToken();
      
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': tokenToUse
        },
        credentials: 'include',
        body: JSON.stringify({
          name: templateName,
          data: templateData
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create template');
      }
      
      const newTemplate = await response.json();
      
      // Format the new template to match our existing structure
      const formattedTemplate = {
        id: newTemplate.id.toString(),
        name: newTemplate.name,
        data: typeof newTemplate.template_data === 'string'
          ? JSON.parse(newTemplate.template_data)
          : newTemplate.data || {},
        createdAt: newTemplate.created_at
      };
      
      // Update templates state
      setTemplates(prev => [...prev, formattedTemplate]);
      
      return formattedTemplate;
    } catch (err) {
      console.error('Error creating template:', err);
      setError(err.message);
      throw err;
    }
  };

  // Update an existing template
  const updateTemplate = async (templateId, updates) => {
    try {
      setError(null);
      
      // Get the latest token before updating
      const tokenToUse = await getLatestToken();
      
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': tokenToUse
        },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update template');
      }
      
      const updatedTemplate = await response.json();
      
      // Format the updated template
      const formattedTemplate = {
        id: updatedTemplate.id.toString(),
        name: updatedTemplate.name,
        data: typeof updatedTemplate.template_data === 'string'
          ? JSON.parse(updatedTemplate.template_data)
          : updatedTemplate.data || {},
        createdAt: updatedTemplate.created_at
      };
      
      // Update templates state
      setTemplates(prev => prev.map(t => 
        t.id === templateId.toString() ? formattedTemplate : t
      ));
      
      return formattedTemplate;
    } catch (err) {
      console.error('Error updating template:', err);
      setError(err.message);
      throw err;
    }
  };

  // Delete a template
  const deleteTemplate = async (templateId) => {
    try {
      setError(null);
      
      // Get the latest token before deleting
      const tokenToUse = await getLatestToken();
      
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          'CSRF-Token': tokenToUse
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete template');
      }
      
      // Update templates state by removing the deleted template
      setTemplates(prev => prev.filter(t => t.id !== templateId.toString()));
      
      return true;
    } catch (err) {
      console.error('Error deleting template:', err);
      setError(err.message);
      throw err;
    }
  };

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    refreshCsrfToken
  };
};

export default useTemplates;