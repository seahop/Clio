// frontend/src/components/common/ui/Card.jsx
import React from 'react';

// Surface container with the standard border/radius/shadow. `accent` draws a
// left status stripe (pass a semantic/status color class like 'border-l-danger').
const Card = ({ as: Tag = 'div', accent, interactive = false, className = '', children, ...props }) => (
  <Tag
    className={`bg-surface border border-line rounded-card shadow-card
      ${accent ? `border-l-[3px] ${accent}` : ''}
      ${interactive ? 'transition-colors hover:border-line-strong' : ''} ${className}`}
    {...props}
  >
    {children}
  </Tag>
);

export default Card;
