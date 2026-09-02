// frontend/src/components/Presence.jsx
// "Who's viewing" presence for the header — a live roster of connected users,
// driven by the SSE stream. Live lock indicators come for free: lock changes
// already push over SSE, so the log/card views reflect them immediately.
import React, { useState, useEffect } from 'react';

// Deterministic accent per username so avatars are stable and distinguishable.
const AV_COLORS = ['#4f8cf0', '#4ac882', '#e0b052', '#b491e0', '#e08a4a', '#7ea2e0', '#e86a62'];
const colorFor = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
};
const initials = (name) => name.slice(0, 2).toUpperCase();

const Presence = ({ currentUsername }) => {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let es;
    let active = true;
    fetch('/api/events/presence', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setUsers(d.users || []); })
      .catch(() => {});
    try {
      es = new EventSource('/api/events/stream', { withCredentials: true });
      es.addEventListener('presence', (e) => {
        try { const d = JSON.parse(e.data); setUsers(d.users || []); } catch (_) {}
      });
    } catch (_) { /* SSE unsupported */ }
    return () => { active = false; if (es) es.close(); };
  }, []);

  if (users.length === 0) return null;
  const MAX = 4;
  const shown = users.slice(0, MAX);
  const overflow = users.length - shown.length;

  return (
    <div className="hidden sm:flex items-center gap-1.5" title={`Online: ${users.join(', ')}`}>
      <div className="flex -space-x-2">
        {shown.map(u => (
          <span key={u}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white ring-2 ring-surface"
            style={{ background: colorFor(u) }}
          >
            {initials(u)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-muted bg-surface-3 ring-2 ring-surface">
            +{overflow}
          </span>
        )}
      </div>
      <span className="inline-flex items-center gap-1 text-2xs text-faint">
        <span className="w-1.5 h-1.5 rounded-full bg-success" /> {users.length} online
      </span>
    </div>
  );
};

export default Presence;
