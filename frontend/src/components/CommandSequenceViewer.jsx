// frontend/src/components/CommandSequenceViewer.jsx
import React, { useState, useEffect } from 'react';
import { Terminal, Clock, ChevronDown, ChevronRight, RefreshCw, User, Server, AlertCircle, ArrowRight, ArrowDown } from 'lucide-react';

const CommandSequenceViewer = () => {
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedUsers, setExpandedUsers] = useState(new Set());

  const fetchCommandSequences = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/relation-service/api/relations/command-sequences', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Command sequence data:', data);
      
      // Sort users by their most confident sequence
      const sortedData = [...data].sort((a, b) => {
        const maxConfidenceA = Math.max(...a.sequences.map(s => s.confidence), 0);
        const maxConfidenceB = Math.max(...b.sequences.map(s => s.confidence), 0);
        return maxConfidenceB - maxConfidenceA;
      });
      
      setSequences(sortedData);
    } catch (err) {
      console.error('Error fetching command sequences:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommandSequences();
    
    // Refresh every 5 minutes
    const interval = setInterval(() => {
      fetchCommandSequences();
    }, 5 * 60 * 1000);
    
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

  // Format time difference in a human-readable way
  const formatTimeDiff = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  // Render a confidence indicator based on the confidence score
  const ConfidenceIndicator = ({ confidence }) => {
    // Calculate width based on confidence (0-100%)
    const width = `${Math.round(confidence * 100)}%`;
    
    // Determine color based on confidence
    let bgColor = 'bg-red-500';
    if (confidence >= 0.7) bgColor = 'bg-green-500';
    else if (confidence >= 0.5) bgColor = 'bg-yellow-500';
    
    return (
      <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${bgColor} rounded-full`} 
          style={{ width }}
        ></div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <RefreshCw className="animate-spin text-blue-400 mr-2" size={20} />
        <span className="text-gray-400">Loading command sequence patterns...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 text-red-200 p-4 rounded-md">
        <div className="flex items-center gap-2">
          <AlertCircle size={20} />
          <h3 className="font-medium">Error loading command sequences:</h3>
        </div>
        <p className="mt-1">{error}</p>
        <button 
          onClick={fetchCommandSequences}
          className="mt-4 px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-white text-sm flex items-center gap-1"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <Terminal size={40} className="mx-auto mb-4 opacity-50" />
        <p>No command sequence patterns detected.</p>
        <p className="text-sm mt-2">Patterns will appear here as users execute commands.</p>
        <button
          onClick={fetchCommandSequences}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Refresh Data
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          Command Sequence Patterns
        </h2>
        <button
          onClick={fetchCommandSequences}
          disabled={loading}
          className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      
      <div className="p-4">
        <div className="space-y-4">
          {sequences.map((userSequences) => (
            <div key={userSequences.username} className="bg-gray-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleUserExpand(userSequences.username)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-600/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-medium">{userSequences.username}</span>
                  <span className="text-sm text-gray-400">
                    ({userSequences.sequences.length} pattern{userSequences.sequences.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {expandedUsers.has(userSequences.username) ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {expandedUsers.has(userSequences.username) && (
                <div className="border-t border-gray-600">
                  <div className="p-3 text-xs text-gray-400 bg-gray-800/30">
                    Showing sequence patterns where commands are frequently executed in a specific order
                  </div>
                  
                  <div className="space-y-3 p-4">
                    {userSequences.sequences.map((sequence, idx) => (
                      <div 
                        key={idx} 
                        className="bg-gray-800 rounded-md p-4 hover:bg-gray-700/50 transition-colors"
                      >
                        {/* Command sequence details - modified to support long sequences */}
                        <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
                          <div className="flex items-center flex-grow gap-2 font-mono text-sm">
                            {sequence.fullSequence ? (
                              // Display longer command sequences with connecting arrows
                              <div className="flex flex-col w-full">
                                <div className="flex items-center gap-2 text-blue-300 text-xs mb-1">
                                  {sequence.length}-Command Sequence (Confidence: {Math.round(sequence.confidence * 100)}%)
                                </div>
                                <div className="flex flex-col gap-1">
                                  {sequence.fullSequence.map((cmd, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <div className={`${i === 0 ? 'text-green-400' : i === sequence.fullSequence.length - 1 ? 'text-blue-400' : 'text-yellow-300'} break-all`}>
                                        {cmd}
                                      </div>
                                      {i < sequence.fullSequence.length - 1 && (
                                        <ArrowDown className="mx-2 flex-shrink-0 text-gray-500" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              // Original 2-command sequence display
                              <>
                                <div className="text-green-400 flex-grow break-all">
                                  {sequence.command1}
                                </div>
                                <ArrowRight className="mx-2 flex-shrink-0 text-gray-500" />
                                <div className="text-blue-400 flex-grow break-all">
                                  {sequence.command2}
                                </div>
                              </>
                            )}
                          </div>
                          
                          <div className="flex-shrink-0 text-xs px-2 py-1 rounded-full bg-blue-900/30 text-blue-300">
                            {sequence.occurrences} occurrence{sequence.occurrences !== 1 ? 's' : ''}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
                          <div>
                            <div className="mb-1">Pattern Confidence</div>
                            <div className="flex items-center gap-2">
                              <ConfidenceIndicator confidence={sequence.confidence} />
                              <span>{Math.round(sequence.confidence * 100)}%</span>
                            </div>
                          </div>
                          
                          <div>
                            <div className="mb-1">Avg. Time Between Commands</div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-blue-400" />
                              {formatTimeDiff(sequence.avgTimeDiff)}
                            </div>
                          </div>
                          
                          {sequence.hostname && (
                            <div>
                              <div className="mb-1">Most Common Host</div>
                              <div className="flex items-center gap-2">
                                <Server className="w-4 h-4 text-green-400" />
                                {sequence.hostname}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-3 pt-3 text-xs text-gray-500 border-t border-gray-700">
                          Last observed: {new Date(sequence.lastSeen).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandSequenceViewer;