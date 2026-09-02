// frontend/src/components/common/ui/StatusLegend.jsx
import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { STATUS_META } from './statusMeta';

// Compact, dismissable key explaining the status colors. Encodes real meaning
// (each status + what it means), not decoration.
const StatusLegend = ({ className = '' }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted hover:text-content hover:bg-surface-3 transition-colors"
        title="Status legend"
      >
        <Info size={14} /> Legend
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 z-20 bg-surface border border-line rounded-card shadow-pop p-3 animate-fade-in">
            <div className="text-2xs uppercase tracking-wider text-faint mb-2">File status</div>
            <ul className="space-y-1.5">
              {Object.entries(STATUS_META).map(([key, m]) => {
                const Icon = m.icon;
                return (
                  <li key={key} className="flex items-start gap-2 text-xs">
                    <Icon size={13} className={`${m.text} mt-0.5 flex-shrink-0`} />
                    <span className={`font-medium ${m.text} w-20 flex-shrink-0`}>{m.label}</span>
                    <span className="text-muted">{m.desc}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default StatusLegend;
