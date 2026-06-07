// frontend/src/components/RelationViewer.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Network, User, RefreshCw, Cpu, Globe, Server, Wifi } from 'lucide-react';
import UserCommandsViewer from './UserCommandsViewer';
import MacAddressViewer from './MacAddressViewer';
import RelationFilters from './relations/RelationFilters';
import RelationList from './relations/RelationList';

// Filters backed by dedicated sub-viewers (they fetch their own data)
const DELEGATED_FILTERS = new Set(['user', 'mac_address']);

const FILTER_TYPES = [
  { id: 'all',         label: 'All Relations' },
  { id: 'ip',          label: 'IP' },
  { id: 'hostname',    label: 'Hostname' },
  { id: 'hostname_ip', label: 'Host↔IP' },
  { id: 'domain',      label: 'Domain' },
  { id: 'user_domain', label: 'User↔Domain' },
  { id: 'user_mac',    label: 'User↔MAC' },
  { id: 'mac_address', label: 'MAC Address' },
  { id: 'user',        label: 'User Commands' },
];

const FILTER_TITLES = {
  user:        'User Command Analysis',
  mac_address: 'MAC Address Relations',
  hostname_ip: 'Hostname ↔ IP Mapping',
  user_domain: 'User ↔ Domain Relations',
  user_mac:    'User ↔ MAC Address Relations',
};

const FILTER_ICONS = {
  user:        <User className="w-5 h-5" />,
  mac_address: <Cpu className="w-5 h-5" />,
  hostname_ip: <Server className="w-5 h-5" />,
  user_domain: <Globe className="w-5 h-5" />,
  user_mac:    <Cpu className="w-5 h-5" />,
  ip:          <Wifi className="w-5 h-5" />,
  hostname:    <Server className="w-5 h-5" />,
  domain:      <Globe className="w-5 h-5" />,
};

const TYPE_SORT_ORDER = {
  domain: 1, ip: 2, hostname: 3, hostname_ip: 4,
  username: 5, user_domain: 6, user_mac: 7, mac_address: 8
};

const RelationViewer = () => {
  const [relations, setRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [expandedItems, setExpandedItems] = useState(new Set());
  // Bump this to force-remount delegated sub-viewers on Refresh
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRelations = useCallback(async () => {
    if (DELEGATED_FILTERS.has(selectedFilter)) {
      setRefreshKey(k => k + 1);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const apiUrl = `/relation-service/api/relations${
        selectedFilter !== 'all' ? `/${selectedFilter}` : ''
      }`;

      const response = await fetch(apiUrl, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();

      // Deduplicate relations by source+type key
      const deduplicatedData = data.reduce((acc, relation) => {
        const key = `${relation.source}_${relation.type}`;
        if (!acc.has(key)) {
          acc.set(key, { ...relation, related: [...(relation.related || [])] });
        } else {
          const existing = acc.get(key);
          const existingTargets = new Set(existing.related.map(r => r.target));
          relation.related?.forEach(item => {
            if (!existingTargets.has(item.target)) existing.related.push(item);
          });
        }
        return acc;
      }, new Map());

      const sortedData = Array.from(deduplicatedData.values())
        .map(r => ({ ...r, connections: r.related?.length || 0 }))
        .sort((a, b) => {
          const typeCompare = (TYPE_SORT_ORDER[a.type] || 99) - (TYPE_SORT_ORDER[b.type] || 99);
          return typeCompare !== 0 ? typeCompare : a.source.localeCompare(b.source);
        });

      setRelations(sortedData);
    } catch (err) {
      console.error('Error fetching relations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedFilter]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  const toggleExpand = (id) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleFilterChange = (filterId) => {
    setSelectedFilter(filterId);
    setExpandedItems(new Set());
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

    if (selectedFilter === 'user')        return <UserCommandsViewer key={refreshKey} />;
    if (selectedFilter === 'mac_address') return <MacAddressViewer   key={refreshKey} />;

    if (loading) {
      return <div className="text-center text-gray-400 py-8"><p>Loading relationships...</p></div>;
    }

    return (
      <RelationList
        relations={relations}
        expandedItems={expandedItems}
        toggleExpand={toggleExpand}
      />
    );
  };

  const titleIcon  = FILTER_ICONS[selectedFilter]  || <Network className="w-5 h-5" />;
  const titleLabel = FILTER_TITLES[selectedFilter] || 'Log Relations';

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg w-full">
      <div className="p-4 border-b border-gray-700 flex flex-row items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          {titleIcon}
          {titleLabel}
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={fetchRelations}
            disabled={loading}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <RelationFilters
            filterTypes={FILTER_TYPES}
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
