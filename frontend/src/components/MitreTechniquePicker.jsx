// frontend/src/components/MitreTechniquePicker.jsx
// Per-log MITRE ATT&CK technique tagger: chips + a searchable add dropdown.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Crosshair, Plus, X, Search } from 'lucide-react';
import { TECHNIQUES, techniqueName, tacticName } from '../utils/mitreData';

// Small platform indicator (Windows / Linux / macOS).
const PlatformTags = ({ ids }) => (
  <span className="inline-flex gap-0.5">
    {ids.split('').map(c => (
      <span key={c} className="w-3.5 h-3.5 rounded-sm bg-surface-3 text-faint text-[9px] font-semibold flex items-center justify-center" title={{ W: 'Windows', L: 'Linux', M: 'macOS' }[c]}>{c}</span>
    ))}
  </span>
);

const MitreTechniquePicker = ({ techniques = [], onChange, canEdit = false }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return TECHNIQUES
      .filter(t => !techniques.includes(t.id))
      .filter(t => !term || t.id.toLowerCase().includes(term) || t.name.toLowerCase().includes(term))
      .slice(0, 40);
  }, [q, techniques]);

  const add = (id) => { onChange([...techniques, id]); setQ(''); };
  const remove = (id) => onChange(techniques.filter(t => t !== id));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Crosshair size={13} className="text-faint flex-shrink-0" />
        {techniques.length === 0 && <span className="text-xs text-faint">No techniques mapped</span>}
        {techniques.map(id => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-accent/30 bg-accent/10 text-2xs">
            <span className="font-mono text-accent">{id}</span>
            {techniqueName(id) && <span className="text-muted">{techniqueName(id)}</span>}
            {canEdit && (
              <button onClick={() => remove(id)} className="text-faint hover:text-danger ml-0.5" title="Remove">
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-line bg-surface-2 text-2xs text-muted hover:text-content hover:bg-surface-3">
              <Plus size={11} /> Add
            </button>
            {open && (
              <div className="absolute left-0 mt-1 w-80 z-30 bg-surface border border-line rounded-card shadow-pop p-2 animate-fade-in">
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Search technique or ID (e.g. T1059)"
                    className="w-full pl-7 pr-2 py-1.5 rounded-md bg-surface-2 border border-line text-xs text-content placeholder-faint focus:outline-none focus:border-accent" />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5">
                  {results.length === 0 ? (
                    <p className="text-xs text-faint px-2 py-2">No matches.</p>
                  ) : results.map(t => (
                    <button key={t.id} onClick={() => add(t.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-surface-3">
                      <span className="font-mono text-2xs text-accent w-20 flex-shrink-0">{t.id}</span>
                      <span className="text-xs text-content flex-1 truncate">{t.name}</span>
                      {t.platforms && <PlatformTags ids={t.platforms} />}
                      <span className="text-2xs text-faint flex-shrink-0 w-24 text-right truncate">{tacticName(t.tactic)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MitreTechniquePicker;
