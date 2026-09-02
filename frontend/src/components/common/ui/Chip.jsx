// frontend/src/components/common/ui/Chip.jsx
import React from 'react';

// Labeled key/value chip for the log-card header and dense metadata rows.
const Chip = ({ label, value, mono = false, className = '' }) => (
  <span className={`inline-flex items-baseline gap-1.5 px-2 py-0.5 rounded border border-line bg-canvas/50 max-w-full ${className}`}>
    {label && <span className="text-2xs uppercase tracking-wide text-faint">{label}</span>}
    <span className={`text-xs text-content truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
  </span>
);

export default Chip;
