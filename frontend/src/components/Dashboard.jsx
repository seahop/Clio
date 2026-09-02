// frontend/src/components/Dashboard.jsx
// Operation overview: at-a-glance counts, 30-day activity, status mix, and the
// top hosts / users / commands for the viewer's operation scope. Charts are
// inline SVG/CSS (no chart library — airgap-safe) using the app's tokens.
import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, Server, User, Lock, RefreshCw, Activity, Terminal, FileText } from 'lucide-react';
import { Card, Button, Skeleton, EmptyState, SectionHeader, statusMeta } from './common/ui';

const StatTile = ({ icon: Icon, label, value, tone = 'text-content' }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between">
      <span className="text-2xs uppercase tracking-wider text-faint">{label}</span>
      <Icon size={16} className="text-faint" />
    </div>
    <div className={`mt-2 text-3xl font-bold tabular ${tone}`}>{value}</div>
  </Card>
);

// Horizontal bar list for top-N categoricals.
const BarList = ({ items, mono = false, colorClass = 'bg-accent' }) => {
  const max = Math.max(1, ...items.map(i => i.count));
  if (items.length === 0) return <p className="text-sm text-faint py-3">No data yet.</p>;
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline gap-2">
              <span className={`text-xs text-content truncate ${mono ? 'font-mono' : ''}`}>{it.name}</span>
              <span className="text-2xs text-faint tabular flex-shrink-0">{it.count}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${(it.count / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// 30-day activity bar chart in SVG.
const ActivityChart = ({ activity }) => {
  const days = 30;
  const today = new Date();
  const byDay = new Map(activity.map(a => [a.day, a.count]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ day: key, count: byDay.get(key) || 0 });
  }
  const max = Math.max(1, ...series.map(s => s.count));
  const W = 100, H = 34, gap = 0.6, bw = (W / days) - gap;
  if (activity.length === 0) return <p className="text-sm text-faint py-6 text-center">No activity in the last 30 days.</p>;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-24" role="img" aria-label="Activity over the last 30 days">
        {series.map((s, i) => {
          const h = s.count === 0 ? 0.5 : (s.count / max) * (H - 2);
          return <rect key={i} x={i * (W / days)} y={H - h} width={bw} height={h} rx="0.4"
            className="fill-accent" opacity={s.count === 0 ? 0.25 : 0.85} />;
        })}
      </svg>
      <div className="flex justify-between text-2xs text-faint mt-1 tabular">
        <span>{series[0].day}</span><span>{series[series.length - 1].day}</span>
      </div>
    </div>
  );
};

const StatusBars = ({ byStatus }) => {
  const total = byStatus.reduce((s, x) => s + x.count, 0);
  if (total === 0) return <p className="text-sm text-faint py-3">No status data.</p>;
  return (
    <div className="space-y-2">
      {byStatus.map((s) => {
        const m = statusMeta(s.status);
        const Icon = m.icon;
        return (
          <div key={s.status} className="flex items-center gap-2">
            <Icon size={13} className={`${m.text} flex-shrink-0`} />
            <span className={`text-xs w-24 flex-shrink-0 ${m.text}`}>{m.label}</span>
            <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className={`h-full rounded-full ${m.text}`} style={{ width: `${(s.count / total) * 100}%`, background: 'currentColor' }} />
            </div>
            <span className="text-2xs text-faint tabular w-8 text-right">{s.count}</span>
          </div>
        );
      })}
    </div>
  );
};

const Dashboard = ({ currentUser }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch('/api/logs/stats', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
      setStats(await res.json());
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
        <Skeleton className="h-40 rounded-card" />
        <div className="grid md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-card" />)}</div>
      </div>
    );
  }
  if (error) return <EmptyState icon={Activity} title="Couldn't load the dashboard" message={error} action={{ label: 'Retry', icon: RefreshCw, onClick: load }} />;
  if (!stats || stats.total === 0) {
    return <EmptyState icon={Activity} title="No activity yet"
      message="Once logs are recorded for this operation, an overview of activity, hosts, users, and file status appears here." />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-content flex items-center gap-2"><Activity size={18} className="text-muted" /> Overview</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={FileText} onClick={() => window.open('/api/export/report', '_blank', 'noopener')}>Report</Button>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={ScrollText} label="Total logs" value={stats.total} />
        <StatTile icon={Server} label="Hosts" value={stats.distinctHosts} />
        <StatTile icon={User} label="Users" value={stats.distinctUsers} />
        <StatTile icon={Lock} label="Locked" value={stats.locked} tone="text-warning" />
      </div>

      <Card className="p-4">
        <SectionHeader icon={Activity} className="mb-3">Activity — last 30 days</SectionHeader>
        <ActivityChart activity={stats.activity} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionHeader className="mb-3">File status mix</SectionHeader>
          <StatusBars byStatus={stats.byStatus} />
        </Card>
        <Card className="p-4">
          <SectionHeader icon={Terminal} className="mb-3">Top commands</SectionHeader>
          <BarList items={stats.topCommands} mono colorClass="bg-info" />
        </Card>
        <Card className="p-4">
          <SectionHeader icon={Server} className="mb-3">Top hosts</SectionHeader>
          <BarList items={stats.topHosts} />
        </Card>
        <Card className="p-4">
          <SectionHeader icon={User} className="mb-3">Top users</SectionHeader>
          <BarList items={stats.topUsers} colorClass="bg-success" />
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
