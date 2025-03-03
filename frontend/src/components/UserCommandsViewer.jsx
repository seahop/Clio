import React, { useState, useEffect } from 'react';
import { User, Terminal, ChevronDown, ChevronRight, Clock } from 'lucide-react';

const UserCommandsViewer = () => {
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
          `/relation-service/api/relations/user`,
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
        console.log('Raw user commands data:', data);
        
        // Group commands by user and filter out empty commands
        const groupedCommands = data.reduce((acc, relation) => {
          // Skip empty or whitespace-only commands
          if (!relation.command || relation.command.trim() === '') {
            return acc;
          }
          
          const username = relation.username;
          if (!acc[username]) {
            acc[username] = [];
          }
          
          // Check if this command already exists for this user
          const commandExists = acc[username].some(cmd => 
            cmd.command === relation.command
          );
          
          // Only add commands that don't already exist
          if (!commandExists) {
            acc[username].push({
              command: relation.command,
              timestamp: relation.last_seen,
              firstSeen: relation.first_seen
            });
          }
          
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
  }, []);

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
      <div className="min-h-[200px] flex items-center justify-center">
        <div className="text-gray-400">Loading user command history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 text-red-200 p-4 rounded-md">
        <h3 className="font-medium">Error loading user commands:</h3>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <User className="w-5 h-5" />
          User Command History
        </h2>
      </div>

      <div className="p-4">
        {Object.entries(userCommands).length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p>No user command history found.</p>
            <p className="text-sm mt-2">Command history will appear here as users perform actions.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(userCommands).map(([username, commands]) => (
              <div key={username} className="bg-gray-700/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleUserExpand(username)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-600/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-blue-400" />
                    <span className="text-white font-medium">{username}</span>
                    <span className="text-sm text-gray-400">
                      ({commands.length} command{commands.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  {expandedUsers.has(username) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {expandedUsers.has(username) && (
                  <div className="border-t border-gray-600">
                    {commands.map((cmd, index) => (
                      <div
                        key={index}
                        className="px-4 py-3 flex flex-col gap-2 border-b border-gray-600/50 last:border-0 hover:bg-gray-600/25"
                      >
                        <div className="flex items-start gap-3">
                          <Terminal className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
                          <div className="flex-1 font-mono text-sm text-gray-200 break-all">
                            {cmd.command}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 ml-7 text-xs text-gray-400">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(cmd.timestamp).toLocaleString()}
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