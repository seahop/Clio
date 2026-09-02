// frontend/src/components/UntaggedTriage.jsx
// Admin triage for logs that carry no operation tag. These produce relations
// with no operation scope (invisible to per-operation filtering), so this view
// surfaces them and lets an admin assign an operation after the fact.
import React, { useState, useEffect, useCallback } from 'react';
import { Tags, RefreshCw, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import { formatUTC } from '../utils/dateUtils';
import { Button, Panel, Skeleton, EmptyState, Badge } from './common/ui';

const UntaggedTriage = ({ csrfToken }) => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [operations, setOperations] = useState([]);
  const [operationId, setOperationId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/logs/untagged', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Failed to load untagged logs (${res.status})`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/operations/my-operations', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOperations((d.operations || []).filter(o => o.is_active !== false)); })
      .catch(() => {});
  }, []);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allSelected = logs.length > 0 && selected.size === logs.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(logs.map(l => l.id)));

  const assign = async () => {
    if (!operationId || selected.size === 0) return;
    setAssigning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/logs/bulk-operation-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        credentials: 'include',
        body: JSON.stringify({ logIds: [...selected], operationId: Number(operationId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Assignment failed');
      setMessage({ type: 'success', text: `Assigned ${data.tagged} log(s) to ${data.operation}. Relations will re-analyze shortly.` });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAssigning(false);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      {total > 0 && <Badge tone="warning">{total} untagged</Badge>}
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Button>
    </div>
  );

  return (
    <Panel title="Untagged Logs" icon={Tags} actions={headerActions}>
      <p className="text-sm text-muted mb-4">
        These logs have no operation assigned, so their relations are not attributable to any
        operation. Select logs and assign an operation to fold them back into scope.
      </p>

      {message && (
        <div className={`mb-4 px-3 py-2 rounded-md text-sm border ${
          message.type === 'success' ? 'bg-success/10 text-success border-success/30' : 'bg-danger/10 text-danger border-danger/30'
        }`}>{message.text}</div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
      ) : error ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load untagged logs" message={error}
          action={{ label: 'Retry', icon: RefreshCw, onClick: load }} />
      ) : logs.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nothing untagged" message="Every log is assigned to an operation." />
      ) : (
        <>
          {/* Assignment bar */}
          <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-md bg-surface-2 border border-line">
            <button onClick={toggleAll} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-content">
              {allSelected ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </button>
            <div className="flex-1" />
            <select
              value={operationId}
              onChange={(e) => setOperationId(e.target.value)}
              className="bg-surface-2 border border-line rounded-md px-3 py-1.5 text-sm text-content focus:outline-none focus:border-accent"
            >
              <option value="">Assign to operation…</option>
              {operations.map(o => <option key={o.operation_id} value={o.operation_id}>{o.operation_name}</option>)}
            </select>
            <Button variant="primary" size="sm" onClick={assign}
              loading={assigning} disabled={!operationId || selected.size === 0}>
              Assign operation
            </Button>
          </div>

          {/* Log rows */}
          <div className="border border-line rounded-md divide-y divide-line overflow-hidden">
            {logs.map(l => (
              <button key={l.id} onClick={() => toggle(l.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-3/60 transition-colors">
                {selected.has(l.id) ? <CheckSquare size={16} className="text-accent flex-shrink-0" /> : <Square size={16} className="text-faint flex-shrink-0" />}
                <span className="font-mono text-xs text-muted tabular whitespace-nowrap">{formatUTC(l.timestamp)}</span>
                {l.hostname && <span className="text-xs text-content truncate">{l.hostname}</span>}
                {l.username && <span className="text-xs text-info truncate">{l.username}</span>}
                {l.command && <span className="font-mono text-xs text-muted truncate flex-1">{l.command}</span>}
              </button>
            ))}
          </div>
          {logs.length < total && (
            <p className="mt-2 text-2xs uppercase tracking-wide text-faint">
              Showing {logs.length} of {total} — assign these, then refresh for more.
            </p>
          )}
        </>
      )}
    </Panel>
  );
};

export default UntaggedTriage;
