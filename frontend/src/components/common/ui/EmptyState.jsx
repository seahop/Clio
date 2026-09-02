// frontend/src/components/common/ui/EmptyState.jsx
import React from 'react';
import Button from './Button';

// Consistent empty/zero state with an optional call to action.
const EmptyState = ({ icon: Icon, title, message, action }) => (
  <div className="text-center py-12 px-4 animate-fade-in">
    {Icon && (
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center">
        <Icon className="w-6 h-6 text-faint" />
      </div>
    )}
    {title && <p className="text-content font-medium">{title}</p>}
    {message && <p className="mt-1 text-sm text-muted max-w-md mx-auto">{message}</p>}
    {action && (
      <div className="mt-4">
        <Button variant="secondary" size="sm" icon={action.icon} onClick={action.onClick}>
          {action.label}
        </Button>
      </div>
    )}
  </div>
);

export default EmptyState;
