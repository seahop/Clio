// frontend/src/components/api-keys/ApiKeyList.jsx
import React from 'react';
import { Key, RefreshCw } from 'lucide-react';
import ApiKeyListItem from './ApiKeyListItem';

/**
 * Component to display list of API keys
 */
const ApiKeyList = ({
  apiKeys,
  keyDetailOpen,
  toggleKeyDetail,
  onRevoke,
  onDelete,
  onCopy,
  loading,
  refreshing,
  onRefresh
}) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-medium text-white">API Keys</h3>
        <button 
          onClick={onRefresh} 
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
            <ApiKeyListItem
              key={key.id}
              apiKey={key}
              isDetailOpen={keyDetailOpen[key.id] || false}
              onToggleDetail={() => toggleKeyDetail(key.id)}
              onRevoke={() => onRevoke(key.id, key.name)}
              onDelete={() => onDelete(key.id, key.name)}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ApiKeyList;