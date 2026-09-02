// frontend/src/components/SavedViews.jsx
// Per-user saved filter presets (search + date range + tag selection). Storage
// is handled by the parent; this is the dropdown UI.
import React, { useState, useRef, useEffect } from 'react';
import { Bookmark, ChevronDown, Plus, Trash2, Check } from 'lucide-react';

const SavedViews = ({ views = [], onSave, onApply, onDelete, canSave }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const save = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="px-3 py-1.5 rounded-md flex items-center gap-2 text-sm bg-surface-2 border border-line text-content hover:bg-surface-3 transition-colors"
        title="Saved views"
      >
        <Bookmark size={16} />
        <span className="hidden sm:inline">Views</span>
        {views.length > 0 && <span className="text-2xs text-faint">({views.length})</span>}
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-72 bg-surface border border-line rounded-card shadow-pop z-30 p-3 animate-fade-in">
          <div className="text-2xs uppercase tracking-wider text-faint mb-2">Saved views</div>
          {views.length === 0 ? (
            <p className="text-sm text-muted mb-3">No saved views yet. Set up a filter, then save it below.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-0.5 mb-3">
              {views.map(v => (
                <div key={v.name} className="flex items-center gap-1 group">
                  <button onClick={() => { onApply(v); setOpen(false); }}
                    className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left text-content hover:bg-surface-3 truncate">
                    <Check size={13} className="text-accent flex-shrink-0 opacity-0 group-hover:opacity-100" />
                    <span className="truncate">{v.name}</span>
                  </button>
                  <button onClick={() => onDelete(v.name)} title="Delete view"
                    className="p-1.5 rounded text-faint hover:text-danger hover:bg-surface-3">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-2 border-t border-line">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder={canSave ? 'Name this view…' : 'Set a filter first'}
              disabled={!canSave}
              maxLength={40}
              className="flex-1 bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-sm text-content placeholder-faint focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button onClick={save} disabled={!canSave || !name.trim()}
              className="p-1.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40">
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavedViews;
