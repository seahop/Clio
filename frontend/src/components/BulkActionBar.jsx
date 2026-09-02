// frontend/src/components/BulkActionBar.jsx
// Sticky action bar shown while cards are selected in bulk mode.
import React, { useState } from 'react';
import { X, Trash2, Tag as TagIcon } from 'lucide-react';
import { Button, STATUS_META } from './common/ui';

const BulkActionBar = ({ count, isAdmin, operations = [], onSetStatus, onAssignOp, onDelete, onClear }) => {
  const [status, setStatus] = useState('');
  const [opId, setOpId] = useState('');

  const selectClass = "bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-sm text-content focus:outline-none focus:border-accent";

  return (
    <div className="sticky top-[57px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-surface-2 px-3 py-2 shadow-card animate-fade-in">
      <span className="text-sm font-medium text-content">{count} selected</span>
      <div className="flex-1" />

      {/* Set status */}
      <select className={selectClass} value={status}
        onChange={(e) => { const v = e.target.value; setStatus(''); if (v) onSetStatus(v); }}>
        <option value="">Set status…</option>
        {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
      </select>

      {/* Assign operation (admin) */}
      {isAdmin && operations.length > 0 && (
        <select className={selectClass} value={opId}
          onChange={(e) => { const v = e.target.value; setOpId(''); if (v) onAssignOp(Number(v)); }}>
          <option value="">Assign operation…</option>
          {operations.map(o => <option key={o.operation_id} value={o.operation_id}>{o.operation_name}</option>)}
        </select>
      )}

      {isAdmin && (
        <Button variant="danger" size="sm" icon={Trash2} onClick={onDelete}>Delete</Button>
      )}
      <Button variant="ghost" size="sm" icon={X} onClick={onClear}>Clear</Button>
    </div>
  );
};

export default BulkActionBar;
