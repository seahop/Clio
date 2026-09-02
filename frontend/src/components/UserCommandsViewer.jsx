// frontend/src/components/UserCommandsViewer.jsx
import React, { useState, useEffect } from 'react';
import { User, Terminal, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { formatUTC } from '../utils/dateUtils';
import { Skeleton, EmptyState } from './common/ui';

const UserCommandsViewer = ({ opQuery = '' }) => {
  const [userCommands, setUserCommands] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedUsers, setExpandedUsers] = useState(new Set());

  useEffect(() => {
    const fetchUserCommands = async () => {
      try {
        setLoading(true);
        // Use proxy instead of direct service URL
        const response = await fetch(
          `/relation-service/api/relations/user${opQuery ? `?${opQuery}` : ''}`,
          {
            credentials: 'include',
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch user commands');
        }

        const data = await response.json();
        
        // Group commands by user and filter out empty commands - without de-duplication
        const groupedCommands = data.reduce((acc, relation) => {
          // Skip empty or whitespace-only commands
          if (!relation.command || relation.command.trim() === '') {
            return acc;
          }
          
          const username = relation.username;
          if (!acc[username]) {
            acc[username] = [];
          }
          
          // Add each command instance with a unique ID
          acc[username].push({
            id: `${username}_${relation.command}_${relation.last_seen}`, // Unique ID
            command: relation.command,
            timestamp: relation.last_seen,
            firstSeen: relation.first_seen
          });
          
          return acc;
        }, {});

        // Sort commands by timestamp for each user
        Object.keys(groupedCommands).forEach(username => {
          groupedCommands[username].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          );
        });

        console.log('Processed user commands:', groupedCommands);
        setUserCommands(groupedCommands);
      } catch (err) {
        console.error('Error fetching user commands:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserCommands();
    const interval = setInterval(fetchUserCommands, 30000);
    return () => clearInterval(interval);
  }, [opQuery]);

  const toggleUserExpand = (username) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(username)) {
      newExpanded.delete(username);
    } else {
      newExpanded.add(username);
    }
    setExpandedUsers(newExpanded);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-card" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/15 text-danger p-4 rounded-card">
        <h3 className="font-medium">Error loading user commands:</h3>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-card shadow-card">
      <div className="p-4 border-b border-line">
        <h2 className="text-lg font-medium text-content flex items-center gap-2">
          <User className="w-5 h-5" />
          User Command History
        </h2>
      </div>

      <div className="p-4">
        {Object.entries(userCommands).length === 0 ? (
          <EmptyState
            icon={Terminal}
            title="No user command history found."
            message="Command history will appear here as users perform actions."
          />
        ) : (
          <div className="space-y-4">
            {Object.entries(userCommands).map(([username, commands]) => (
              <div key={username} className="bg-surface-2/50 rounded-card overflow-hidden">
                <button
                  onClick={() => toggleUserExpand(username)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-3/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-accent" />
                    <span className="text-content font-medium">{username}</span>
                    <span className="text-sm text-muted">
                      ({commands.length} command{commands.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  {expandedUsers.has(username) ? (
                    <ChevronDown className="w-5 h-5 text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted" />
                  )}
                </button>

                {expandedUsers.has(username) && (
                  <div className="border-t border-line">
                    {commands.map((cmd) => (
                      <div
                        key={cmd.id}
                        className="px-4 py-3 flex flex-col gap-2 border-b border-line/50 last:border-0 hover:bg-surface-3/25"
                      >
                        <div className="flex items-start gap-3">
                          <Terminal className="w-4 h-4 text-success mt-1 flex-shrink-0" />
                          <div className="flex-1 font-mono text-sm text-content break-all whitespace-pre-wrap">
                            {cmd.command}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 ml-7 text-xs text-muted">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatUTC(cmd.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserCommandsViewer;