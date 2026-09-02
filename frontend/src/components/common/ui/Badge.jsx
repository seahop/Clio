// frontend/src/components/common/ui/Badge.jsx
import React from 'react';

const TONES = {
  neutral: 'bg-surface-3 text-muted border-line',
  accent:  'bg-accent/15 text-accent border-accent/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger:  'bg-danger/15 text-danger border-danger/30',
  info:    'bg-info/15 text-info border-info/30',
};

// Small pill for state/role labels.
const Badge = ({ tone = 'neutral', className = '', children }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-2xs font-semibold uppercase tracking-wide ${TONES[tone] || TONES.neutral} ${className}`}>
    {children}
  </span>
);

export default Badge;
