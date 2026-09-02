// frontend/src/components/common/ui/Skeleton.jsx
import React from 'react';

// Shimmering placeholder (see .skeleton in index.css). Use while data loads
// instead of a spinner or a layout-shifting "Loading…".
const Skeleton = ({ className = '', style }) => (
  <div className={`skeleton ${className}`} style={style} aria-hidden />
);

// A stack of skeleton lines approximating a block of text/rows.
export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-hidden>
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="skeleton h-3.5" style={{ width: `${90 - i * 12}%` }} />
    ))}
  </div>
);

export default Skeleton;
