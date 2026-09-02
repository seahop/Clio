// frontend/src/components/relations/OperationScopeFilter.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Briefcase, ChevronDown, Check, Layers, GitMerge, Archive } from 'lucide-react';

/**
 * Operation-scope control for the relation view.
 *
 * Lets a user narrow relations to any combination of the operations they can
 * access, choose whether multiple selections are combined broadly (ANY /
 * union) or narrowly (ALL / intersection), and optionally include archived
 * (soft-deleted / inactive) operations in the pick-list.
 *
 * Props:
 *   operations   [{ id, name, isActive }]  operations the user may filter by
 *   selectedIds  number[]                  currently selected operation ids
 *   matchMode    'any' | 'all'
 *   includeArchived           bool
 *   onIncludeArchivedChange   (bool) => void
 *   onChange     ({ selectedIds, matchMode }) => void
 */
const OperationScopeFilter = ({
  operations = [], selectedIds = [], matchMode = 'any',
  includeArchived = false, onIncludeArchivedChange, onChange
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const allSelected = operations.length > 0 && selectedIds.length === operations.length;
  const noneSelected = selectedIds.length === 0;

  const toggleOp = (id) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id];
    onChange({ selectedIds: next, matchMode });
  };

  const selectAll = () => onChange({ selectedIds: operations.map(o => o.id), matchMode });
  const clearAll = () => onChange({ selectedIds: [], matchMode });
  const setMode = (mode) => onChange({ selectedIds, matchMode: mode });

  // Nothing to filter (e.g. user assigned to a single operation, with no
  // archived toggle available) — hide entirely.
  if (operations.length <= 1 && !onIncludeArchivedChange) return null;

  const summary = allSelected
    ? 'All operations'
    : noneSelected
      ? 'No operations'
      : `${selectedIds.length} of ${operations.length} ops`;

  const narrow = matchMode === 'all' && selectedIds.length > 1;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1 rounded-md text-sm flex items-center gap-2 border transition-colors ${
          narrow
            ? 'bg-warning/15 border-warning/50 text-warning'
            : 'bg-surface-2 border-line text-content hover:bg-surface-3'
        }`}
        title="Filter relations by operation"
      >
        <Briefcase size={15} />
        <span>{summary}</span>
        {selectedIds.length > 1 && (
          <span className="text-2xs uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/30">
            {matchMode === 'all' ? 'intersection' : 'union'}
          </span>
        )}
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-surface border border-line rounded-card shadow-pop z-20 p-3">
          {/* Combine mode */}
          <div className="mb-3">
            <div className="text-2xs uppercase tracking-wide text-faint mb-1.5">Combine selected ops</div>
            <div className="flex gap-1 bg-canvas/60 rounded-md p-1">
              <button
                onClick={() => setMode('any')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  matchMode === 'any' ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2'
                }`}
                title="Broad: relations appearing in ANY selected operation"
              >
                <Layers size={13} /> Any (broad)
              </button>
              <button
                onClick={() => setMode('all')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  matchMode === 'all' ? 'bg-warning text-canvas' : 'text-muted hover:bg-surface-2'
                }`}
                title="Narrow: only relations shared across ALL selected operations"
              >
                <GitMerge size={13} /> All (narrow)
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-faint leading-snug">
              {matchMode === 'all'
                ? 'Showing only entities that appear in every selected operation.'
                : 'Showing entities from any selected operation.'}
            </p>
          </div>

          {/* Select all / clear */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs uppercase tracking-wide text-faint">Operations</span>
            <div className="flex gap-2 text-[11px]">
              <button onClick={selectAll} className="text-accent hover:text-accent-hover">All</button>
              <button onClick={clearAll} className="text-muted hover:text-content">None</button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {operations.map(op => {
              const checked = selectedIds.includes(op.id);
              const archived = op.isActive === false;
              return (
                <button
                  key={op.id}
                  onClick={() => toggleOp(op.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left text-content hover:bg-surface-2"
                >
                  <span className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${
                    checked ? 'bg-accent border-accent' : 'border-line-strong'
                  }`}>
                    {checked && <Check size={12} className="text-accent-fg" />}
                  </span>
                  <span className={`truncate ${archived ? 'text-muted italic' : ''}`}>{op.name}</span>
                  {archived && (
                    <span className="ml-auto flex items-center gap-1 text-2xs uppercase tracking-wide text-warning">
                      <Archive size={11} /> archived
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Include archived operations */}
          {onIncludeArchivedChange && (
            <label className="mt-2 pt-2 border-t border-line flex items-center gap-2 px-1 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => onIncludeArchivedChange(e.target.checked)}
                className="accent-warning"
              />
              <Archive size={13} className="text-warning" />
              Include archived (deleted) operations
            </label>
          )}
        </div>
      )}
    </div>
  );
};

export default OperationScopeFilter;
