// frontend/src/components/relations/CommandList.jsx
import React from 'react';
import { Terminal, User, Server } from 'lucide-react';
import { formatUTC } from '../../utils/dateUtils';

const CommandList = ({ commands, relationType }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
      {commands.map((item, i) => (
        <div
          key={`cmd-${i}`}
          className="bg-surface p-3 rounded-card hover:bg-surface-2/50 transition-colors"
        >
          <div className="flex items-start gap-2 mb-2">
            <Terminal className="w-4 h-4 text-success mt-1 flex-shrink-0" />
            <div className="font-mono text-sm text-content break-all whitespace-pre-wrap">
              {item.target}
            </div>
          </div>

          {/* Show user who ran the command if available */}
          {item.metadata?.username && relationType !== 'username' && (
            <div className="flex items-center gap-2 text-xs text-muted ml-6 mt-2">
              <User className="w-3 h-3 text-accent" />
              <span>Run by: {item.metadata.username}</span>
            </div>
          )}

          {/* Show hostname where command was run if available */}
          {item.metadata?.hostname && relationType !== 'hostname' && (
            <div className="flex items-center gap-2 text-xs text-muted ml-6 mt-2">
              <Server className="w-3 h-3 text-success" />
              <span>Host: {item.metadata.hostname}</span>
            </div>
          )}

          <div className="text-xs text-faint ml-6 mt-1">
            {formatUTC(item.lastSeen)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CommandList;