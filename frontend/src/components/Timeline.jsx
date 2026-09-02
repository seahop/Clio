// frontend/src/components/Timeline.jsx
// Chronological engagement timeline for the current operation scope. Reuses the
// operation-scoped /api/logs data and lays it out as a day-grouped vertical
// timeline — the view you reconstruct an engagement from for reporting.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, RefreshCw, ArrowDownUp, Server, User, Terminal } from 'lucide-react';
import { Panel, Button, Skeleton, EmptyState, statusMeta } from './common/ui';

const dayOf = (ts) => { const d = new Date(ts); return isNaN(d) ? 'Unknown' : d.toISOString().slice(0, 10); };
const timeOf = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : d.toISOString().slice(11, 19) + 'Z'; };
const dayLabel = (day) => {
  if (day === 'Unknown') return 'Unknown date';
  const d = new Date(day + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const Timeline = ({ csrfToken }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newestFirst, setNewestFirst] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch('/api/logs', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Failed to load timeline (${res.status})`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : (data.logs || []));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live: refresh when the backend pushes a change.
  useEffect(() => {
    let es;
    try {
      es = new EventSource('/api/events/stream', { withCredentials: true });
      es.addEventListener('logs:changed', () => load());
    } catch (_) { /* ignore */ }
    return () => { if (es) es.close(); };
  }, [load]);

  const groups = useMemo(() => {
    const sorted = [...logs].sort((a, b) => {
      const d = new Date(b.timestamp) - new Date(a.timestamp);
      return newestFirst ? d : -d;
    });
    const byDay = new Map();
    for (const l of sorted) {
      const day = dayOf(l.timestamp);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(l);
    }
    return [...byDay.entries()];
  }, [logs, newestFirst]);

  const actions = (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" icon={ArrowDownUp} onClick={() => setNewestFirst(v => !v)}>
        {newestFirst ? 'Newest first' : 'Oldest first'}
      </Button>
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Button>
    </div>
  );

  return (
    <Panel title="Engagement Timeline" icon={Clock} actions={actions}>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
      ) : error ? (
        <EmptyState icon={Clock} title="Couldn't load the timeline" message={error} action={{ label: 'Retry', icon: RefreshCw, onClick: load }} />
      ) : logs.length === 0 ? (
        <EmptyState icon={Clock} title="No activity to plot" message="Logs for this operation appear here on a chronological timeline." />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, entries]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-content">{dayLabel(day)}</h3>
                <div className="flex-1 h-px bg-line" />
                <span className="text-2xs uppercase tracking-wide text-faint">{entries.length} event{entries.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="relative pl-6 border-l border-line ml-1 space-y-3">
                {entries.map((l) => {
                  const m = statusMeta(l.status);
                  return (
                    <div key={l.id} className="relative">
                      {/* node on the spine, colored by status */}
                      <span className={`absolute -left-[27px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-canvas ${l.status ? m.text : 'text-faint'}`}
                        style={{ background: 'currentColor' }} />
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-xs text-muted tabular">{timeOf(l.timestamp)}</span>
                        {l.status && <span className={`text-2xs uppercase tracking-wide ${m.text}`}>{m.label}</span>}
                        {l.hostname && <span className="inline-flex items-center gap-1 text-xs text-content"><Server size={11} className="text-faint" />{l.hostname}</span>}
                        {l.username && <span className="inline-flex items-center gap-1 text-xs text-info"><User size={11} />{l.username}</span>}
                      </div>
                      {l.command && (
                        <div className="mt-0.5 flex items-start gap-1.5 text-xs text-muted font-mono break-all">
                          <Terminal size={11} className="text-faint mt-0.5 flex-shrink-0" />{l.command}
                        </div>
                      )}
                      {l.notes && <div className="mt-0.5 text-xs text-faint italic break-words">{l.notes}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};

export default Timeline;
