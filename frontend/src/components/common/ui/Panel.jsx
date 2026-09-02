// frontend/src/components/common/ui/Panel.jsx
import React from 'react';
import Card from './Card';

// A titled section panel: header row (icon + title + optional actions) over a
// bordered surface. Used for the main view containers.
const Panel = ({ title, icon: Icon, actions, bodyClassName = 'p-4', className = '', children }) => (
  <Card className={className}>
    {(title || actions) && (
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-line">
        <h2 className="flex items-center gap-2 text-base font-semibold text-content">
          {Icon && <Icon size={18} className="text-muted" />}
          {title}
        </h2>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    )}
    <div className={bodyClassName}>{children}</div>
  </Card>
);

export default Panel;
