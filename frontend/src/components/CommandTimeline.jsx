// frontend/src/components/CommandTimeline.jsx
import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Filter, RefreshCw, Search, User, Terminal } from 'lucide-react';

const CommandTimeline = ({ username }) => {
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('24h'); // Default to 24 hours
  const [filteredCommands, setFilteredCommands] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch user commands
  const fetchUserCommands = async () => {
    try {
      setLoading(true);
      
      // Use the existing user commands endpoint, filter server-side by username if provided
      const endpoint = username
        ? `/relation-service/api/relations/user?username=${encodeURIComponent(username)}`
        : '/relation-service/api/relations/user';
        
      const response = await fetch(endpoint, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user commands: ${response.status}`);
      }

      const data = await response.json();
      
      // Process the commands data to ensure it has timestamps
      const processedCommands = data
        .filter(cmd => cmd.timestamp || cmd.last_seen)
        .map(cmd => ({
          ...cmd,
          timestamp: cmd.timestamp || cmd.last_seen
        }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setCommands(processedCommands);
      
      // Apply initial filtering based on time range
      filterCommandsByTimeRange(processedCommands, timeRange);
    } catch (err) {
      console.error('Error fetching user commands:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserCommands();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchUserCommands, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [username]);

  // Apply time range filter
  const filterCommandsByTimeRange = (cmds, range) => {
    const now = new Date();
    let cutoff = new Date();
    
    switch (range) {
      case '1h':
        cutoff.setHours(now.getHours() - 1);
        break;
      case '6h':
        cutoff.setHours(now.getHours() - 6);
        break;
      case '12h':
        cutoff.setHours(now.getHours() - 12);
        break;
      case '24h':
        cutoff.setDate(now.getDate() - 1);
        break;
      case '7d':
        cutoff.setDate(now.getDate() - 7);
        break;
      case '30d':
        cutoff.setDate(now.getDate() - 30);
        break;
      default:
        cutoff.setDate(now.getDate() - 1); // Default to 24 hours
    }
    
    const filtered = cmds.filter(cmd => {
      const cmdDate = new Date(cmd.timestamp);
      return cmdDate >= cutoff;
    });
    
    // Apply search query if it exists
    let searchFiltered = filtered;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      searchFiltered = filtered.filter(cmd => 
        cmd.command?.toLowerCase().includes(query) || 
        cmd.username?.toLowerCase().includes(query)
      );
    }
    
    setFilteredCommands(searchFiltered);
  };

  // Handle time range change
  const handleTimeRangeChange = (range) => {
    setTimeRange(range);
    filterCommandsByTimeRange(commands, range);
  };

  // Handle search query change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Reapply filters with the new search query
    filterCommandsByTimeRange(commands, timeRange);
  };

  // Group commands by hour/day for the timeline visualization
  const groupCommandsByTime = () => {
    // Map to store hourly/daily buckets
    const timeMap = new Map();
    
    // Determine if we should group by hour or day
    const groupByHour = ['1h', '6h', '12h', '24h'].includes(timeRange);
    
    // Create time buckets
    filteredCommands.forEach(cmd => {
      const date = new Date(cmd.timestamp);
      
      // Create a bucket key based on hour or day
      let bucketKey;
      if (groupByHour) {
        // For hourly grouping, use YYYY-MM-DD-HH format
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
      } else {
        // For daily grouping, use YYYY-MM-DD format
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
      
      // Add to or create the bucket
      if (!timeMap.has(bucketKey)) {
        timeMap.set(bucketKey, []);
      }
      timeMap.get(bucketKey).push(cmd);
    });
    
    // Convert map to array and sort by time
    return Array.from(timeMap.entries())
      .map(([key, cmds]) => {
        // Determine display format
        let displayTime;
        const [year, month, day, hour] = key.split('-');
        
        if (groupByHour) {
          // For hourly, show day and hour
          const date = new Date(year, month - 1, day, hour);
          displayTime = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            hour12: true
          }).format(date);
        } else {
          // For daily, show month and day
          const date = new Date(year, month - 1, day);
          displayTime = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric'
          }).format(date);
        }
        
        return {
          time: key,
          displayTime,
          commands: cmds,
          count: cmds.length
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const timeGroups = groupCommandsByTime();

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <RefreshCw className="animate-spin text-blue-400 mr-2" size={20} />
        <span className="text-gray-400">Loading command timeline...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 text-red-200 p-4 rounded-md">
        <h3 className="font-medium">Error loading command timeline:</h3>
        <p className="mt-1">{error}</p>
        <button
          onClick={fetchUserCommands}
          className="mt-3 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Command Timeline
          </h2>
          <button
            onClick={fetchUserCommands}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Time range filter */}
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div className="text-sm text-gray-400">Time Range:</div>
            {['1h', '6h', '12h', '24h', '7d', '30d'].map(range => (
              <button
                key={range}
                onClick={() => handleTimeRangeChange(range)}
                className={`px-2 py-1 text-xs rounded-md ${
                  timeRange === range 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          
          {/* Search input */}
          <div className="relative w-full md:w-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search commands..."
              className="pl-10 py-2 bg-gray-700 text-gray-200 rounded-md w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>
      
      {/* Timeline visualization */}
      <div className="p-4">
        {filteredCommands.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p>No commands found for the selected time range.</p>
            <p className="text-sm mt-2">Try adjusting your filters or time range.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline axis */}
            <div className="absolute left-[42px] top-0 bottom-0 w-[2px] bg-gray-600"></div>
            
            {/* Timeline groups */}
            <div className="space-y-1 relative">
              {timeGroups.map((group, index) => (
                <div key={group.time} className="ml-[60px] relative group">
                  {/* Time marker */}
                  <div className="absolute -left-[60px] flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center z-10">
                      <Clock className="w-3 h-3 text-white" />
                    </div>
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      {group.displayTime}
                    </div>
                  </div>
                  
                  {/* Commands box */}
                  <div className="bg-gray-700/50 rounded-md p-3 hover:bg-gray-700 transition-colors">
                    <div className="text-xs text-gray-400 mb-2 flex items-center justify-between">
                      <span>{group.count} command{group.count !== 1 ? 's' : ''}</span>
                    </div>
                    
                    {/* Command list - limit to max 5 with "show more" option */}
                    <div className="space-y-2">
                      {group.commands.slice(0, 5).map((cmd, cmdIndex) => (
                        <div key={cmdIndex} className="flex items-start gap-2">
                          <Terminal className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-mono text-sm text-gray-200 break-all">
                              {cmd.command}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              {!username && cmd.username && (
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {cmd.username}
                                </div>
                              )}
                              <div>
                                {new Date(cmd.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Show more button if there are more than 5 commands */}
                      {group.commands.length > 5 && (
                        <button className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                          Show {group.commands.length - 5} more commands...
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandTimeline;