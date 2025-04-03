// frontend/src/components/api-keys/ApiKeyManager.jsx
import React, { useState } from 'react';
import { Key } from 'lucide-react';
import ApiKeyHeader from './ApiKeyHeader';
import ApiKeyList from './ApiKeyList';
import CreateApiKeyForm from './CreateApiKeyForm';
import NewApiKeyDisplay from './NewApiKeyDisplay';
import MessageBanner from '../common/MessageBanner';
import useApiKeys from '../../hooks/useApiKeys';

/**
 * API Key Manager Component
 * Top-level component for managing API keys with CRUD operations
 */
const ApiKeyManager = ({ csrfToken }) => {
  // State for UI interactions
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newApiKey, setNewApiKey] = useState(null);
  const [keyDetailOpen, setKeyDetailOpen] = useState({});

  // Custom hook for API key operations
  const {
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
    deleteApiKey
  } = useApiKeys(csrfToken);

  // Toggle API key details panel
  const toggleKeyDetail = (id) => {
    setKeyDetailOpen(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Handle creating a new API key
  const handleCreateApiKey = async (keyData) => {
    try {
      const data = await createApiKey(keyData);
      // Store the new API key to display to the user
      setNewApiKey(data.apiKey);
      // Hide the create form
      setShowCreateForm(false);
      return true;
    } catch (error) {
      return false;
    }
  };

  // Handle revoking an API key
  const handleRevokeApiKey = async (id, name) => {
    if (!window.confirm(`Are you sure you want to revoke the API key "${name}"? This action cannot be undone.`)) {
      return;
    }
    await revokeApiKey(id, name);
  };

  // Handle deleting an API key
  const handleDeleteApiKey = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the API key "${name}"? This action cannot be undone.`)) {
      return;
    }
    await deleteApiKey(id, name);
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

  return (
    <div className="w-full">
      <ApiKeyHeader 
        showCreateForm={showCreateForm}
        setShowCreateForm={setShowCreateForm}
      />

      {/* Error and success messages */}
      <MessageBanner message={message} error={error} />

      {/* Create new API key form */}
      {showCreateForm && (
        <CreateApiKeyForm
          onSubmit={handleCreateApiKey}
          onCancel={() => setShowCreateForm(false)}
          loading={loading}
        />
      )}

      {/* Newly created API key display */}
      {newApiKey && (
        <NewApiKeyDisplay
          newApiKey={newApiKey}
          onClose={() => setNewApiKey(null)}
          onCopy={copyToClipboard}
        />
      )}

      {/* API Keys List */}
      <ApiKeyList
        apiKeys={apiKeys}
        keyDetailOpen={keyDetailOpen}
        toggleKeyDetail={toggleKeyDetail}
        onRevoke={handleRevokeApiKey}
        onDelete={handleDeleteApiKey}
        onCopy={copyToClipboard}
        loading={loading}
        refreshing={refreshing}
        onRefresh={fetchApiKeys}
      />
    </div>
  );
};

export default ApiKeyManager;