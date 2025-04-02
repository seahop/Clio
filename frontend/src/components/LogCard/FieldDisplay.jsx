// frontend/src/components/LogCard/FieldDisplay.jsx
import React from 'react';
import { formatMacAddress } from '../../utils/macAddressUtils';
import { formatDate, getStatusColorClass } from './cardUtils';

const FieldDisplay = ({ field, value, showSecrets = false }) => {
  if (field === 'timestamp') {
    return <span className="text-white break-words whitespace-pre-wrap">{formatDate(value)}</span>;
  }
  
  if (field === 'secrets' && !showSecrets && value) {
    return (
      <div className="flex items-center">
        <span className="text-white">••••••••••••</span>
      </div>
    );
  }

  if (field === 'status' && value) {
    return <span className={`font-semibold ${getStatusColorClass(value)}`}>{value}</span>;
  }
  
  if (field === 'mac_address' && value) {
    return <span className="text-white break-words whitespace-pre-wrap">{formatMacAddress(value)}</span>;
  }
  
  if (field === 'pid' && value) {
    return <span className="text-white font-mono">{value}</span>;
  }

  if (!value) return <span className="text-gray-500">-</span>;
  
  return <span className="text-white break-words whitespace-pre-wrap">{value}</span>;
};

export default FieldDisplay;