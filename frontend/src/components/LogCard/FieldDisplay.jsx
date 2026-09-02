// frontend/src/components/LogCard/FieldDisplay.jsx
import React from 'react';
import { formatMacAddress } from '../../utils/macAddressUtils';
import { formatDate, getStatusColorClass } from './cardUtils';

// Fields whose values read best in a monospace face
const MONO_FIELDS = ['internal_ip', 'external_ip', 'command', 'hash_value', 'filename'];

const FieldDisplay = ({ field, value, showSecrets = false }) => {
  if (field === 'timestamp') {
    return <span className="text-gray-100 font-mono tabular-nums break-words whitespace-pre-wrap">{formatDate(value)}</span>;
  }

  if (field === 'secrets' && !showSecrets && value) {
    return (
      <div className="flex items-center">
        <span className="text-gray-100">••••••••••••</span>
      </div>
    );
  }

  if (field === 'status' && value) {
    return <span className={`font-semibold ${getStatusColorClass(value)}`}>{value}</span>;
  }

  if (field === 'mac_address' && value) {
    return <span className="text-gray-100 font-mono break-words whitespace-pre-wrap">{formatMacAddress(value)}</span>;
  }

  if (field === 'pid' && value) {
    return <span className="text-gray-100 font-mono">{value}</span>;
  }

  if (!value) return <span className="text-gray-600">—</span>;

  return (
    <span className={`text-gray-100 break-words whitespace-pre-wrap ${MONO_FIELDS.includes(field) ? 'font-mono text-[13px]' : ''}`}>
      {value}
    </span>
  );
};

export default FieldDisplay;