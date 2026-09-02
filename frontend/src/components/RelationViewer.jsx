// frontend/src/components/RelationViewer.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Network, User, RefreshCw, Cpu, Globe, Server, Wifi } from 'lucide-react';
import UserCommandsViewer from './UserCommandsViewer';
import MacAddressViewer from './MacAddressViewer';
import RelationFilters from './relations/RelationFilters';
import RelationList from './relations/RelationList';
import OperationScopeFilter from './relations/OperationScopeFilter';
import { Button, Skeleton } from './common/ui';

// Build the ?operations=&opMatch= query fragment (without leading ?).
// Returns '' when the selection is "everything, union" so the backend applies
// its default (admin: all operations; user: all of their operations).
const buildOpQuery = (allOps, selectedIds, matchMode) => {
  const allSelected = allOps.length > 0 && selectedIds.length === allOps.length;
  if (allSelected && matchMode === 'any') return '';
  return `operations=${selectedIds.join(',')}&opMatch=${matchMode}`;
};

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

  // Operation scoping
  const [availableOps, setAvailableOps] = useState([]);   // active ops
  const [archivedOps, setArchivedOps] = useState([]);     // inactive/archived ops (lazy)
  const [selectedOpIds, setSelectedOpIds] = useState([]);
  const [opMatch, setOpMatch] = useState('any');
  const [includeArchived, setIncludeArchived] = useState(false);

  const mapOps = (data) => (data.operations || [])
    .map(o => ({ id: o.operation_id, name: o.operation_name, isActive: o.is_active !== false }))
    .filter(o => o.id != null);

  // Load the active operations this user can filter by (all active ops for
  // admins, assigned ops for regular users); default to all of them selected.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/operations/my-operations', {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) return;
        const list = mapOps(await res.json()).filter(o => o.isActive);
        setAvailableOps(list);
        setSelectedOpIds(list.map(o => o.id));
      } catch (err) {
        console.error('Failed to load operations for relation scope:', err);
      }
    })();
  }, []);

  // Toggle archived operations into the pick-list. Fetched once on first
  // enable; newly revealed archived ops start selected so their relations
  // appear immediately (the user can then deselect any).
  const handleIncludeArchived = async (next) => {
    setIncludeArchived(next);
    if (next && archivedOps.length === 0) {
      try {
        const res = await fetch('/api/operations/my-operations?includeInactive=true', {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const inactive = mapOps(await res.json()).filter(o => !o.isActive);
          setArchivedOps(inactive);
          setSelectedOpIds(prev => [...new Set([...prev, ...inactive.map(o => o.id)])]);
        }
      } catch (err) {
        console.error('Failed to load archived operations:', err);
      }
    } else if (next && archivedOps.length > 0) {
      setSelectedOpIds(prev => [...new Set([...prev, ...archivedOps.map(o => o.id)])]);
    } else {
      // Hiding archived — drop them from the selection too
      const archivedIds = new Set(archivedOps.map(o => o.id));
      setSelectedOpIds(prev => prev.filter(id => !archivedIds.has(id)));
    }
  };

  const listedOps = includeArchived ? [...availableOps, ...archivedOps] : availableOps;

  const opQuery = buildOpQuery(listedOps, selectedOpIds, opMatch);

  const fetchRelations = useCallback(async () => {
    if (DELEGATED_FILTERS.has(selectedFilter)) {
      setRefreshKey(k => k + 1);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const base = `/relation-service/api/relations${
        selectedFilter !== 'all' ? `/${selectedFilter}` : ''
      }`;
      const apiUrl = opQuery ? `${base}?${opQuery}` : base;

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
  }, [selectedFilter, opQuery]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  // Changing the operation scope should also refresh delegated sub-viewers.
  useEffect(() => {
    if (DELEGATED_FILTERS.has(selectedFilter)) setRefreshKey(k => k + 1);
  }, [opQuery, selectedFilter]);

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
        <div className="bg-danger/15 text-danger p-4 rounded-card">
          <h3 className="font-medium">Error loading data:</h3>
          <p className="mt-1">{error}</p>
        </div>
      );
    }

    if (selectedFilter === 'user')        return <UserCommandsViewer key={refreshKey} opQuery={opQuery} />;
    if (selectedFilter === 'mac_address') return <MacAddressViewer   key={refreshKey} opQuery={opQuery} />;

    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-card" />
          ))}
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

  const titleIcon  = FILTER_ICONS[selectedFilter]  || <Network className="w-5 h-5" />;
  const titleLabel = FILTER_TITLES[selectedFilter] || 'Log Relations';

  return (
    <div className="bg-surface border border-line rounded-card shadow-card w-full">
      <div className="p-4 border-b border-line flex flex-row items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-medium text-content flex items-center gap-2">
          {titleIcon}
          {titleLabel}
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchRelations}
            disabled={loading}
            loading={loading}
            icon={RefreshCw}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          <OperationScopeFilter
            operations={listedOps}
            selectedIds={selectedOpIds}
            matchMode={opMatch}
            includeArchived={includeArchived}
            onIncludeArchivedChange={handleIncludeArchived}
            onChange={({ selectedIds, matchMode }) => { setSelectedOpIds(selectedIds); setOpMatch(matchMode); }}
          />
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
