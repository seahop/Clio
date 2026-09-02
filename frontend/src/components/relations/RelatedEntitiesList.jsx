// frontend/src/components/relations/RelatedEntitiesList.jsx
import React from 'react';
import { Server } from 'lucide-react';
import { formatUTC } from '../../utils/dateUtils';

const RelatedEntitiesList = ({ entities }) => {
  return (
    <div>
      <div className="p-3 bg-surface/50 text-accent font-medium">
        Related Entities
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {entities.map((item, i) => (
          <div
            key={`rel-${i}`}
            className="bg-surface p-3 rounded-card space-y-2 hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-content font-mono text-sm break-all">
                {item.target}
              </span>
              <span className="text-xs px-2 py-1 bg-accent/15 text-accent rounded">
                {item.type}
              </span>
            </div>
            {item.metadata && (
              <div className="text-sm text-muted border-t border-line pt-2">
                {item.metadata.hostname && (
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-success" />
                    <span>{item.metadata.hostname}</span>
                  </div>
                )}
                {item.metadata.ipType && (
                  <div className="mt-1 text-xs">
                    <span className={`px-1.5 py-0.5 rounded ${
                      item.metadata.ipType === 'internal'
                        ? 'bg-success/15 text-success'
                        : 'bg-warning/15 text-warning'
                    }`}>
                      {item.metadata.ipType} IP
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="text-xs text-faint">
              Last seen: {formatUTC(item.lastSeen)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RelatedEntitiesList;