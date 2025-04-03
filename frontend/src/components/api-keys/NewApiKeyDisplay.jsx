// frontend/src/components/api-keys/NewApiKeyDisplay.jsx
import React from 'react';
import { Key, Copy } from 'lucide-react';
import { formatDate, generateCurlExample, generatePythonExample } from './apiKeyUtils';

/**
 * Component to display newly created API key with examples
 */
const NewApiKeyDisplay = ({ newApiKey, onClose, onCopy }) => {
  if (!newApiKey) return null;

  return (
    <div className="bg-purple-900/30 border border-purple-500/50 p-4 rounded-lg mb-6 relative">
      <div className="absolute top-2 right-2">
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1"
          title="Close"
        >
          ×
        </button>
      </div>
      
      <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
        <Key size={18} className="text-purple-300" />
        New API Key Generated
      </h3>
      
      <div className="bg-gray-800 p-3 rounded mb-3 flex items-center justify-between">
        <div className="font-mono text-green-300 text-sm overflow-x-auto whitespace-nowrap">
          {newApiKey.key}
        </div>
        <button 
          onClick={() => onCopy(newApiKey.key)}
          className="ml-2 p-1.5 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
          title="Copy API key"
        >
          <Copy size={16} />
        </button>
      </div>
      
      <div className="bg-yellow-900/30 text-yellow-200 p-3 rounded mb-3 text-sm">
        <strong>Important:</strong> This key will not be shown again. Please copy and store it securely.
      </div>
      
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-1">Key Details</h4>
          <div className="bg-gray-800 p-3 rounded text-sm">
            <div className="mb-1">
              <span className="text-gray-400">Name:</span>{' '}
              <span className="text-gray-200">{newApiKey.name}</span>
            </div>
            {newApiKey.description && (
              <div className="mb-1">
                <span className="text-gray-400">Description:</span>{' '}
                <span className="text-gray-200">{newApiKey.description}</span>
              </div>
            )}
            <div className="mb-1">
              <span className="text-gray-400">Created:</span>{' '}
              <span className="text-gray-200">{formatDate(newApiKey.createdAt)}</span>
            </div>
            {newApiKey.expiresAt && (
              <div>
                <span className="text-gray-400">Expires:</span>{' '}
                <span className="text-gray-200">{formatDate(newApiKey.expiresAt)}</span>
              </div>
            )}
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-1">Sample Usage</h4>
          <div className="bg-gray-800 p-3 rounded">
            <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
              {generateCurlExample(newApiKey.key)}
            </pre>
            <button 
              onClick={() => onCopy(generateCurlExample(newApiKey.key))}
              className="mt-2 px-2 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded text-xs flex items-center gap-1"
            >
              <Copy size={12} />
              Copy Example
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewApiKeyDisplay;