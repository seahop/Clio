// frontend/src/components/common/ui/BrandMark.jsx
import React from 'react';

// Clio's mark: a small node-and-edge glyph — a nod to the relation graph at the
// heart of the platform. Uses the accent token so it re-themes with the app.
const BrandMark = ({ size = 28, className = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 32 32" fill="none"
    className={className} role="img" aria-label="Clio"
  >
    <rect x="1" y="1" width="30" height="30" rx="8"
      className="fill-surface-2 stroke-line" strokeWidth="1.5" />
    {/* edges */}
    <g className="stroke-accent" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
      <line x1="9" y1="11" x2="20" y2="8" />
      <line x1="9" y1="11" x2="12" y2="22" />
      <line x1="20" y1="8" x2="23" y2="19" />
      <line x1="12" y1="22" x2="23" y2="19" />
    </g>
    {/* nodes */}
    <g className="fill-accent">
      <circle cx="9" cy="11" r="2.6" />
      <circle cx="20" cy="8" r="2.2" />
      <circle cx="23" cy="19" r="2.2" />
      <circle cx="12" cy="22" r="2.2" />
    </g>
  </svg>
);

export default BrandMark;
