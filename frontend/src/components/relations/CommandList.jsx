// frontend/src/components/relations/CommandList.jsx
import React from 'react';
import { Terminal, User, Server } from 'lucide-react';

const CommandList = ({ commands, relationType }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
      {commands.map((item, i) => (
        <div
          key={`cmd-${i}`}
          className="bg-gray-800 p-3 rounded-md hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-start gap-2 mb-2">
            <Terminal className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
            <div className="font-mono text-sm text-gray-200 break-all whitespace-pre-wrap">
              {item.target}
            </div>
          </div>
          
          {/* Show user who ran the command if available */}
          {item.metadata?.username && relationType !== 'username' && (
            <div className="flex items-center gap-2 text-xs text-gray-400 ml-6 mt-2">
              <User className="w-3 h-3 text-blue-400" />
              <span>Run by: {item.metadata.username}</span>
            </div>
          )}
          
          {/* Show hostname where command was run if available */}
          {item.metadata?.hostname && relationType !== 'hostname' && (
            <div className="flex items-center gap-2 text-xs text-gray-400 ml-6 mt-2">
              <Server className="w-3 h-3 text-green-400" />
              <span>Host: {item.metadata.hostname}</span>
            </div>
          )}
          
          <div className="text-xs text-gray-500 ml-6 mt-1">
            {new Date(item.lastSeen).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CommandList;