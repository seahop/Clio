// frontend/src/components/api-keys/ApiKeyListItem.jsx
import React from 'react';
import { Key, Calendar, Clock, Shield, Lock, Trash2, MoreHorizontal, ChevronDown, Copy } from 'lucide-react';
import { formatDate, generateCurlExample, generatePythonExample } from './apiKeyUtils';

// Available permissions for reference
const PERMISSION_OPTIONS = [
  { id: 'logs:write', label: 'Write Logs', description: 'Submit new logs via API' },
  { id: 'logs:read', label: 'Read Logs', description: 'Read existing logs via API' },
  { id: 'logs:admin', label: 'Admin Access', description: 'Full admin privileges via API' }
];

/**
 * Single API key item with details
 */
const ApiKeyListItem = ({ 
  apiKey, 
  isDetailOpen, 
  onToggleDetail, 
  onRevoke, 
  onDelete,
  onCopy
}) => {
  return (
    <div 
      className={`border rounded-lg ${apiKey.isActive 
        ? 'border-gray-600 bg-gray-700/30' 
        : 'border-red-900/50 bg-red-900/10'}`}
    >
      <div className="p-3 flex flex-wrap justify-between items-start gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Key size={16} className={apiKey.isActive ? "text-purple-400" : "text-red-400"} />
            <h4 className="font-medium text-white">{apiKey.name}</h4>
            {!apiKey.isActive && (
              <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded">
                Revoked
              </span>
            )}
            {apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date() && (
              <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 text-xs rounded">
                Expired
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-400 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              Created: {formatDate(apiKey.createdAt)}
            </span>
            {apiKey.expiresAt && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                Expires: {formatDate(apiKey.expiresAt)}
              </span>
            )}
            {apiKey.lastUsed && (
              <span className="flex items-center gap-1">
                <Shield size={12} />
                Last used: {formatDate(apiKey.lastUsed)}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-xs flex-shrink-0 text-gray-300 bg-gray-800 px-2 py-1 rounded">
            ID: <span className="font-mono">{apiKey.keyId}</span>
          </div>
          <button
            onClick={onToggleDetail}
            title={isDetailOpen ? "Hide details" : "Show details"}
            className="p-1 text-gray-400 hover:text-white rounded"
          >
            <MoreHorizontal size={16} />
          </button>
          {apiKey.isActive && (
            <button
              onClick={onRevoke}
              title="Revoke key"
              className="p-1 text-gray-400 hover:text-red-400 rounded"
            >
              <Lock size={16} />
            </button>
          )}
          <button
            onClick={onDelete}
            title="Delete key"
            className="p-1 text-gray-400 hover:text-red-400 rounded"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      {isDetailOpen && (
        <KeyDetails 
          apiKey={apiKey} 
          onCopy={onCopy} 
        />
      )}
    </div>
  );
};

/**
 * Expanded details panel for an API key
 */
const KeyDetails = ({ apiKey, onCopy }) => {
  return (
    <div className="p-3 border-t border-gray-600 bg-gray-700/50">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h5 className="text-sm font-medium text-gray-300 mb-2">API Key Details</h5>
          <div className="space-y-1 text-sm">
            {apiKey.description && (
              <div>
                <span className="text-gray-400">Description:</span>{' '}
                <span className="text-gray-200">{apiKey.description}</span>
              </div>
            )}
            <div>
              <span className="text-gray-400">Created by:</span>{' '}
              <span className="text-gray-200">{apiKey.createdBy}</span>
            </div>
            <div>
              <span className="text-gray-400">Permissions:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {apiKey.permissions.map(perm => {
                  const permission = PERMISSION_OPTIONS.find(p => p.id === perm);
                  return (
                    <span 
                      key={perm} 
                      className="px-2 py-0.5 bg-gray-600 text-gray-200 text-xs rounded"
                      title={permission?.description}
                    >
                      {permission?.label || perm}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        {apiKey.isActive && (
          <div>
            <h5 className="text-sm font-medium text-gray-300 mb-2">Integration Examples</h5>
            <div className="space-y-2">
              {/* cURL Example dropdown */}
              <CodeExample 
                title="cURL Example"
                code={generateCurlExample(`${apiKey.keyId}_YOUR_API_KEY`)}
                onCopy={onCopy}
              />
              
              {/* Python Example dropdown */}
              <CodeExample 
                title="Python Example"
                code={generatePythonExample(`${apiKey.keyId}_YOUR_API_KEY`)}
                onCopy={onCopy}
              />
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Remember to replace <code className="bg-gray-800 px-1 rounded">{apiKey.keyId}_YOUR_API_KEY</code> with the actual API key value.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Code example with collapsible content
 */
const CodeExample = ({ title, code, onCopy }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  
  return (
    <div className="border border-gray-600 rounded overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm text-left flex items-center justify-between"
      >
        <span>{title}</span>
        <ChevronDown size={14} className={isOpen ? "transform rotate-180" : ""} />
      </button>
      {isOpen && (
        <div className="bg-gray-900 p-3 relative">
          <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
            {code}
          </pre>
          <button 
            onClick={() => onCopy(code)}
            className="absolute top-2 right-2 p-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
            title="Copy to clipboard"
          >
            <Copy size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ApiKeyListItem;