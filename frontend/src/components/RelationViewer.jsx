// frontend/src/components/RelationViewer.jsx
import React, { useState, useEffect } from 'react';
import { Network, AlertCircle, User, RefreshCw, Cpu } from 'lucide-react';
import UserCommandsViewer from './UserCommandsViewer';
import MacAddressViewer from './MacAddressViewer';
import RelationFilters from './relations/RelationFilters';
import RelationList from './relations/RelationList';

const RelationViewer = () => {
  const [relations, setRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [expandedItems, setExpandedItems] = useState(new Set());

  const filterTypes = [
    { id: 'all', label: 'All Relations' },
    { id: 'ip', label: 'IP Relations' },
    { id: 'hostname', label: 'Hostname Relations' },
    { id: 'domain', label: 'Domain Relations' },
    { id: 'mac_address', label: 'MAC Address Relations' },
    { id: 'user', label: 'User Commands' }
  ];

  const fetchRelations = async () => {
    if (selectedFilter === 'user' || selectedFilter === 'mac_address') {
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
        const typeOrder = { domain: 1, ip: 2, hostname: 3, username: 4, mac_address: 5 };
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

  const handleFilterChange = (filterId) => {
    setSelectedFilter(filterId);
    setExpandedItems(new Set()); // Reset expanded state on filter change
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
    
    if (selectedFilter === 'mac_address') {
      return <MacAddressViewer />;
    }

    if (loading) {
      return (
        <div className="text-center text-gray-400 py-8">
          <p>Loading relationships...</p>
        </div>
      );
    }

    return (
      <RelationList 
        relations={relations}
        expandedItems={expandedItems}
        toggleExpand={toggleExpand}
      />
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg w-full">
      <div className="p-4 border-b border-gray-700 flex flex-row items-center justify-between">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          {selectedFilter === 'user' ? (
            <User className="w-5 h-5" />
          ) : selectedFilter === 'mac_address' ? (
            <Cpu className="w-5 h-5" />
          ) : (
            <Network className="w-5 h-5" />
          )}
          {selectedFilter === 'user' ? 'User Command Analysis' : 
           selectedFilter === 'mac_address' ? 'MAC Address Relations' : 
           'Log Relations'}
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
          <RelationFilters 
            filterTypes={filterTypes}
            selectedFilter={selectedFilter}
            onFilterChange={handleFilterChange}
          />
        </div>
      </div>
      
      <div className="p-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default RelationViewer;