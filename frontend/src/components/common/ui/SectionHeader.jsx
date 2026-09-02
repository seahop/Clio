// frontend/src/components/common/ui/SectionHeader.jsx
import React from 'react';

// Uppercase eyebrow label used to title groups of fields/rows.
const SectionHeader = ({ icon: Icon, children, className = '' }) => (
  <h3 className={`flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-faint ${className}`}>
    {Icon && <Icon size={13} className="text-faint" />}
    {children}
  </h3>
);

export default SectionHeader;
