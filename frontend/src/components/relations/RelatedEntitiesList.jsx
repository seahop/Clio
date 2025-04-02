// frontend/src/components/relations/RelatedEntitiesList.jsx
import React from 'react';
import { Server } from 'lucide-react';

const RelatedEntitiesList = ({ entities }) => {
  return (
    <div>
      <div className="p-3 bg-gray-800/50 text-blue-300 font-medium">
        Related Entities
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {entities.map((item, i) => (
          <div
            key={`rel-${i}`}
            className="bg-gray-800 p-3 rounded-md space-y-2 hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-200 font-mono text-sm break-all">
                {item.target}
              </span>
              <span className="text-xs px-2 py-1 bg-blue-600/20 text-blue-300 rounded">
                {item.type}
              </span>
            </div>
            {item.metadata && (
              <div className="text-sm text-gray-400 border-t border-gray-700 pt-2">
                {item.metadata.hostname && (
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-green-400" />
                    <span>{item.metadata.hostname}</span>
                  </div>
                )}
                {item.metadata.ipType && (
                  <div className="mt-1 text-xs">
                    <span className={`px-1.5 py-0.5 rounded ${
                      item.metadata.ipType === 'internal' 
                        ? 'bg-green-900/30 text-green-300' 
                        : 'bg-orange-900/30 text-orange-300'
                    }`}>
                      {item.metadata.ipType} IP
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="text-xs text-gray-500">
              Last seen: {new Date(item.lastSeen).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RelatedEntitiesList;