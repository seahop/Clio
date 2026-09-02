// frontend/src/components/LogCard/CardHeader.jsx
import React from 'react';
import { ChevronRight, ChevronDown, Lock, Unlock, FileText } from 'lucide-react';
import { formatMacAddress } from '../../utils/macAddressUtils';
import { formatDate, getStatusChipClass } from './cardUtils';

// One quiet chip style for every field; technical values get a mono face.
// Only the status pill carries color, so it reads at a glance.
const HeaderChip = ({ label, value, mono = false, className = '' }) => (
  <div className={`flex-shrink-0 inline-flex items-baseline gap-1.5 px-2 py-0.5 rounded border border-gray-700/70 bg-gray-900/50 ${className}`}>
    <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
    <span className={`text-xs text-gray-200 whitespace-nowrap ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);

const CardHeader = ({
  row,
  isExpanded,
  onToggleLock,
  onToggleEvidence,
  showEvidenceTab,
  visibleFields
}) => {
  return (
    <div className="flex items-center gap-x-3 overflow-hidden">
      {/* Expand/Collapse Icon */}
      {isExpanded ? (
        <ChevronDown className="flex-shrink-0 w-4 h-4 text-gray-400" />
      ) : (
        <ChevronRight className="flex-shrink-0 w-4 h-4 text-gray-400" />
      )}

      {/* Lock/Unlock button */}
      <button
        onClick={onToggleLock}
        className="flex-shrink-0 p-1 rounded hover:bg-gray-600 transition-colors"
        title={row.locked ? `Locked by ${row.locked_by}` : 'Unlocked'}
      >
        {row.locked ?
          <Lock size={15} className="text-red-400" /> :
          <Unlock size={15} className="text-gray-500 hover:text-gray-300" />
        }
      </button>

      {/* Evidence button */}
      <button
        onClick={onToggleEvidence}
        className={`flex-shrink-0 p-1 rounded hover:bg-gray-600 transition-colors ${
          showEvidenceTab ? 'text-blue-400' : 'text-gray-500'
        }`}
        title="Toggle evidence"
      >
        <FileText size={15} />
      </button>

      {/* Primary Info - Timestamp is always shown */}
      <div className="flex-shrink-0 text-[13px] text-gray-300 font-mono tabular-nums">
        {formatDate(row.timestamp)}
      </div>

      {/* Customizable Fields in Card Header */}
      <div className="flex items-center ml-2 gap-x-2 overflow-hidden flex-wrap gap-y-1.5">
        {row.internal_ip && visibleFields.internal_ip && (
          <HeaderChip label="IP" value={row.internal_ip} mono />
        )}

        {row.external_ip && visibleFields.external_ip && (
          <HeaderChip label="Ext" value={row.external_ip} mono />
        )}

        {row.mac_address && visibleFields.mac_address && (
          <HeaderChip label="MAC" value={formatMacAddress(row.mac_address)} mono />
        )}

        {row.pid && visibleFields.pid && (
          <HeaderChip label="PID" value={row.pid} mono />
        )}

        {row.hostname && visibleFields.hostname && (
          <HeaderChip label="Host" value={row.hostname} />
        )}

        {row.domain && visibleFields.domain && (
          <HeaderChip label="Domain" value={row.domain} />
        )}

        {row.username && visibleFields.username && (
          <HeaderChip label="User" value={row.username} />
        )}

        {row.filename && visibleFields.filename && (
          <HeaderChip label="File" value={row.filename} mono className="max-w-[16rem] [&>span:last-child]:overflow-hidden [&>span:last-child]:text-ellipsis" />
        )}

        {row.command && visibleFields.command && (
          <HeaderChip label="Cmd" value={row.command} mono className="max-w-xs [&>span:last-child]:overflow-hidden [&>span:last-child]:text-ellipsis" />
        )}

        {row.status && visibleFields.status && (
          <div className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-semibold tracking-wide whitespace-nowrap ${getStatusChipClass(row.status)}`}>
            {row.status}
          </div>
        )}
      </div>
    </div>
  );
};

export default CardHeader;
