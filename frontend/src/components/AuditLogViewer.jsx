// frontend/src/components/AuditLogViewer.jsx
// Admin viewer over the security / audit / data / system events the platform
// records. Read-only; the events themselves are written by eventLogger.
import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { formatUTC } from '../utils/dateUtils';
import { Panel, Button, Badge, Skeleton, EmptyState } from './common/ui';

const CATEGORIES = [
  { id: 'all',      label: 'All' },
  { id: 'security', label: 'Security' },
  { id: 'audit',    label: 'Audit' },
  { id: 'data',     label: 'Data' },
  { id: 'system',   label: 'System' },
];

const SEV_TONE = { high: 'danger', critical: 'danger', warning: 'warning', warn: 'warning', info: 'info' };
const CAT_TONE = { security: 'danger', audit: 'accent', data: 'info', system: 'neutral' };
const PAGE = 100;

const AuditLogViewer = () => {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  const load = useCallback(async (opts = {}) => {
    const nextOffset = opts.offset ?? 0;
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (category !== 'all') params.set('types', category);
      if (query.trim()) params.set('type', query.trim());
      params.set('limit', String(PAGE));
      params.set('offset', String(nextOffset));
      const res = await fetch(`/api/audit/events?${params}`, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
      const data = await res.json();
      setEvents(data.events || []);
      setTotal(data.total || 0);
      setOffset(nextOffset);
      setExpanded(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [category, query]);

  useEffect(() => { load({ offset: 0 }); /* eslint-disable-next-line */ }, [category]);

  const toggle = (i) => setExpanded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const actions = (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load({ offset: 0 }); }}
          placeholder="Filter by event type…"
          className="pl-8 pr-3 py-1.5 rounded-md bg-surface-2 border border-line text-sm text-content placeholder-faint focus:outline-none focus:border-accent w-52"
        />
      </div>
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => load({ offset: 0 })} disabled={loading}>Refresh</Button>
    </div>
  );

  return (
    <Panel title="Audit &amp; Activity Log" icon={ScrollText} actions={actions}>
      <div className="flex gap-1 mb-4 border-b border-line -mt-1">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`px-3 py-2 -mb-px text-sm border-b-2 transition-colors ${
              category === c.id ? 'border-accent text-content' : 'border-transparent text-muted hover:text-content'
            }`}>{c.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)}</div>
      ) : error ? (
        <EmptyState icon={ScrollText} title="Couldn't load events" message={error} action={{ label: 'Retry', icon: RefreshCw, onClick: () => load({ offset: 0 }) }} />
      ) : events.length === 0 ? (
        <EmptyState icon={ScrollText} title="No events" message="No recorded events match the current category or filter." />
      ) : (
        <>
          <div className="border border-line rounded-md divide-y divide-line overflow-hidden">
            {events.map((e, i) => {
              const isOpen = expanded.has(i);
              const meta = e.metadata || Object.fromEntries(Object.entries(e).filter(([k]) =>
                !['id','timestamp','type','username','severity','category','serverInstanceId'].includes(k)));
              const hasMeta = meta && Object.keys(meta).length > 0;
              return (
                <div key={e.id || i}>
                  <button onClick={() => hasMeta && toggle(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left ${hasMeta ? 'hover:bg-surface-3/60' : ''} transition-colors`}>
                    {hasMeta ? (isOpen ? <ChevronDown size={14} className="text-faint flex-shrink-0" /> : <ChevronRight size={14} className="text-faint flex-shrink-0" />) : <span className="w-3.5 flex-shrink-0" />}
                    <span className="font-mono text-xs text-muted tabular whitespace-nowrap">{formatUTC(e.timestamp)}</span>
                    <Badge tone={CAT_TONE[e.category] || 'neutral'}>{e.category}</Badge>
                    <span className="text-xs text-content font-medium truncate">{e.type}</span>
                    {e.username && <span className="text-xs text-info truncate">{e.username}</span>}
                    {e.severity && e.severity !== 'info' && (
                      <span className="ml-auto"><Badge tone={SEV_TONE[e.severity] || 'neutral'}>{e.severity}</Badge></span>
                    )}
                  </button>
                  {isOpen && hasMeta && (
                    <pre className="px-3 pb-3 pl-10 text-2xs text-muted font-mono whitespace-pre-wrap break-all bg-canvas/40">
                      {JSON.stringify(meta, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3 text-xs text-muted">
            <span>{offset + 1}–{Math.min(offset + events.length, total)} of {total}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => load({ offset: Math.max(0, offset - PAGE) })}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={offset + PAGE >= total} onClick={() => load({ offset: offset + PAGE })}>Next</Button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
};

export default AuditLogViewer;
