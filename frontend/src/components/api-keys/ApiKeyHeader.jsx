// frontend/src/components/api-keys/ApiKeyHeader.jsx
import React from 'react';
import { Key, Plus } from 'lucide-react';

/**
 * Header component for the API key manager with create button
 */
const ApiKeyHeader = ({ showCreateForm, setShowCreateForm }) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Key className="text-purple-400" size={24} />
        <h2 className="text-xl font-bold text-white">API Key Management</h2>
      </div>

      {/* Intro text and create button */}
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
    </div>
  );
};

export default ApiKeyHeader;