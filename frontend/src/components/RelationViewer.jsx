import React, { useState, useEffect } from 'react';
import { Network, AlertCircle, User, ChevronDown, ChevronRight, Globe, Wifi, Server, RefreshCw } from 'lucide-react';
import UserCommandsViewer from './UserCommandsViewer';

const RelationViewer = () => {
  const [relations, setRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [debugInfo, setDebugInfo] = useState(null);

  const filterTypes = [
    { id: 'all', label: 'All Relations' },
    { id: 'ip', label: 'IP Relations' },
    { id: 'hostname', label: 'Hostname Relations' },
    { id: 'domain', label: 'Domain Relations' },
    { id: 'user', label: 'User Commands' }
  ];

  // Get icon based on relation type
  const getRelationIcon = (type) => {
    switch (type) {
      case 'ip':
        return <Wifi className="w-5 h-5 text-blue-400" />;
      case 'hostname':
        return <Server className="w-5 h-5 text-green-400" />;
      case 'domain':
        return <Globe className="w-5 h-5 text-purple-400" />;
      default:
        return <Network className="w-5 h-5 text-gray-400" />;
    }
  };

  const fetchRelations = async () => {
    if (selectedFilter === 'user') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Use proxy instead of direct service URL - proxied to relation-service
      const apiUrl = `/relation-service/api/relations${
        selectedFilter !== 'all' ? `/${selectedFilter}` : ''
      }`;
      
      const response = await fetch(apiUrl, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Deduplicate relations by source
      const deduplicatedData = data.reduce((acc, relation) => {
        const key = `${relation.source}_${relation.type}`;
        
        if (!acc.has(key)) {
          // Initialize new relation
          acc.set(key, {
            ...relation,
            related: [...(relation.related || [])]
          });
        } else {
          // Merge related items if they don't already exist
          const existing = acc.get(key);
          const existingTargets = new Set(existing.related.map(r => r.target));
          
          relation.related?.forEach(item => {
            if (!existingTargets.has(item.target)) {
              existing.related.push(item);
            }
          });
        }
        
        return acc;
      }, new Map());

      // Convert back to array and update the connections count
      const processedData = Array.from(deduplicatedData.values()).map(relation => ({
        ...relation,
        connections: relation.related?.length || 0
      }));

      // Sort by type and then by source name
      const sortedData = processedData.sort((a, b) => {
        // Sort by type first
        const typeOrder = { domain: 1, ip: 2, hostname: 3, username: 4 };
        const typeCompare = (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
        if (typeCompare !== 0) return typeCompare;
        
        // Then by source name
        return a.source.localeCompare(b.source);
      });

      setRelations(sortedData);
    } catch (err) {
      console.error('Error fetching relations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRelations();
    // Remove interval - we'll use manual refresh instead
  }, [selectedFilter]);

  const toggleExpand = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const renderRelations = () => {
    if (relations.length === 0) {
      return (
        <div className="text-center text-gray-400 py-8">
          <p>No relationships found.</p>
          <p className="text-sm mt-2">Create relationships between logs to see them here.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {relations.map((relation, index) => {
          const relationId = `${relation.source}_${index}`;
          return (
            <div key={relationId} className="bg-gray-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleExpand(relationId)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-600/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getRelationIcon(relation.type)}
                  <span className="text-white font-medium">{relation.source}</span>
                  <span className="text-sm text-gray-400">
                    ({relation.related?.length || 0} connection{relation.related?.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {expandedItems.has(relationId) ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {expandedItems.has(relationId) && (
                <div className="border-t border-gray-600">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {relation.related?.map((item, i) => (
                      <div
                        key={i}
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
                          <p className="text-sm text-gray-400 border-t border-gray-700 pt-2">
                            {JSON.stringify(item.metadata)}
                          </p>
                        )}
                        <div className="text-xs text-gray-500">
                          Last seen: {new Date(item.lastSeen).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderContent = () => {
    if (error) {
      return (
        <div className="bg-red-900/50 text-red-200 p-4 rounded-md">
          <h3 className="font-medium">Error loading data:</h3>
          <p className="mt-1">{error}</p>
        </div>
      );
    }

    if (selectedFilter === 'user') {
      return <UserCommandsViewer />;
    }

    if (loading) {
      return (
        <div className="text-center text-gray-400 py-8">
          <p>Loading relationships...</p>
        </div>
      );
    }

    return renderRelations();
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg w-full">
      <div className="p-4 border-b border-gray-700 flex flex-row items-center justify-between">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          {selectedFilter === 'user' ? (
            <User className="w-5 h-5" />
          ) : (
            <Network className="w-5 h-5" />
          )}
          {selectedFilter === 'user' ? 'User Command Analysis' : 'Log Relations'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={fetchRelations}
            disabled={loading}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {filterTypes.map(filter => (
            <button
              key={filter.id}
              onClick={() => {
                setSelectedFilter(filter.id);
                setExpandedItems(new Set()); // Reset expanded state on filter change
              }}
              className={`px-3 py-1 rounded-md text-sm ${
                selectedFilter === filter.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="p-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default RelationViewer;