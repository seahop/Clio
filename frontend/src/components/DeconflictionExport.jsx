// frontend/src/components/DeconflictionExport.jsx
// Blue-team deconfliction export: a time-windowed, sanitized activity list to
// hand to defenders. Only network/host identifiers + timing — no commands,
// notes, secrets, filenames, or hashes.
import React, { useState } from 'react';
import { ShieldCheck, Download } from 'lucide-react';
import { Panel, Button, SectionHeader } from './common/ui';

// datetime-local has no zone; treat the entered value as UTC to match the app.
const toUtcParam = (v) => (v ? encodeURIComponent(`${v}:00Z`) : '');

const DeconflictionExport = () => {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const download = (format) => {
    const params = [`format=${format}`];
    if (start) params.push(`start=${toUtcParam(start)}`);
    if (end) params.push(`end=${toUtcParam(end)}`);
    const url = `/api/export/deconfliction?${params.join('&')}`;
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const inputClass = 'bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-content focus:outline-none focus:border-accent';

  return (
    <Panel title="Blue-Team Deconfliction Export" icon={ShieldCheck}>
      <p className="text-sm text-muted mb-4">
        A sanitized, time-windowed record of authorized activity for handing to defenders — timestamps and
        source/target identifiers only. It deliberately <strong className="text-content">excludes</strong> commands,
        notes, secrets, filenames, and hashes, so your TTPs stay with the team.
      </p>

      <SectionHeader className="mb-2">Time window (UTC — leave blank for the whole engagement)</SectionHeader>
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-2xs uppercase tracking-wide text-faint mb-1">Start</label>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-2xs uppercase tracking-wide text-faint mb-1">End</label>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={Download} onClick={() => download('csv')}>Download CSV</Button>
        <Button variant="secondary" size="sm" icon={Download} onClick={() => download('json')}>Download JSON</Button>
      </div>

      <p className="mt-4 text-2xs text-faint">
        Included columns: timestamp, internal_ip, external_ip, mac_address, hostname, domain, username, status.
        Scoped to your operation.
      </p>
    </Panel>
  );
};

export default DeconflictionExport;
