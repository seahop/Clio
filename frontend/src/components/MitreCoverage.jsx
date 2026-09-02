// frontend/src/components/MitreCoverage.jsx
// ATT&CK coverage matrix for the current operation scope — tactics as columns,
// techniques colored by how many logs reference them, plus a Navigator export.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Crosshair, RefreshCw, Download } from 'lucide-react';
import { Panel, Button, Skeleton, EmptyState } from './common/ui';
import { TACTICS, TECHNIQUES } from '../utils/mitreData';

const MitreCoverage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch('/api/mitre/coverage', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Failed to load coverage (${res.status})`);
      setData(await res.json());
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => new Map((data?.techniques || []).map(t => [t.id, t.count])), [data]);
  const max = useMemo(() => Math.max(1, ...(data?.techniques || []).map(t => t.count)), [data]);

  // Any used technique not in the bundled reference, so nothing is hidden.
  const extraUsed = useMemo(() => {
    const known = new Set(TECHNIQUES.map(t => t.id));
    return (data?.techniques || []).filter(t => !known.has(t.id));
  }, [data]);

  const cellStyle = (count) => {
    if (!count) return {};
    const a = 0.18 + 0.62 * (count / max);
    return { background: `rgba(79,140,240,${a.toFixed(3)})`, borderColor: 'rgba(79,140,240,0.5)' };
  };

  const actions = (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" icon={Download}
        onClick={() => { const a = document.createElement('a'); a.href = '/api/mitre/navigator'; a.click(); }}>
        Navigator layer
      </Button>
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Button>
    </div>
  );

  return (
    <Panel title="ATT&CK Coverage" icon={Crosshair} actions={actions}>
      {loading ? (
        <div className="flex gap-3 overflow-hidden">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 w-40 flex-shrink-0 rounded-card" />)}</div>
      ) : error ? (
        <EmptyState icon={Crosshair} title="Couldn't load coverage" message={error} action={{ label: 'Retry', icon: RefreshCw, onClick: load }} />
      ) : (
        <>
          <p className="text-sm text-muted mb-4">
            {data.logsWithTechniques} of {data.totalLogs} logs are mapped to ATT&CK techniques
            ({data.techniques.length} distinct). Map techniques on any expanded log card. Export the layer to view it in
            the MITRE ATT&CK Navigator.
          </p>

          <div className="overflow-x-auto pb-2">
            <div className="flex gap-2 min-w-max">
              {TACTICS.map(tactic => {
                const techs = TECHNIQUES.filter(t => t.tactic === tactic.id);
                const usedInTactic = techs.filter(t => counts.get(t.id)).length;
                return (
                  <div key={tactic.id} className="w-44 flex-shrink-0">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-faint mb-1.5 px-1 leading-tight h-8 flex items-start">
                      {tactic.name}{usedInTactic > 0 && <span className="ml-1 text-accent">· {usedInTactic}</span>}
                    </div>
                    <div className="space-y-1">
                      {techs.map(t => {
                        const c = counts.get(t.id) || 0;
                        return (
                          <div key={t.id}
                            className={`px-2 py-1 rounded border text-2xs ${c ? 'text-content' : 'border-line bg-surface-2/40 text-faint'}`}
                            style={cellStyle(c)}
                            title={`${t.id} — ${t.name}${c ? ` · ${c} log${c !== 1 ? 's' : ''}` : ''}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono truncate">{t.id}</span>
                              {c > 0 && <span className="tabular font-semibold">{c}</span>}
                            </div>
                            <div className="truncate opacity-80">{t.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {extraUsed.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <div className="text-2xs uppercase tracking-wide text-faint mb-2">Other techniques used (not in the bundled reference)</div>
              <div className="flex flex-wrap gap-1.5">
                {extraUsed.map(t => (
                  <span key={t.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-accent/30 bg-accent/10 text-2xs">
                    <span className="font-mono text-accent">{t.id}</span>
                    <span className="text-muted tabular">{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
};

export default MitreCoverage;
