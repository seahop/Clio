// frontend/src/components/LogCard/CardHeader.jsx
import React from 'react';
import { ChevronRight, ChevronDown, Lock, Unlock, FileText } from 'lucide-react';
import { formatMacAddress } from '../../utils/macAddressUtils';
import { formatDate, getStatusColorClass } from './cardUtils';

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
        <ChevronDown className="flex-shrink-0 w-5 h-5 text-white" />
      ) : (
        <ChevronRight className="flex-shrink-0 w-5 h-5 text-white" />
      )}
      
      {/* Lock/Unlock button */}
      <button
        onClick={onToggleLock}
        className="flex-shrink-0 p-1 rounded hover:bg-gray-600 transition-colors"
        title={row.locked ? `Locked by ${row.locked_by}` : 'Unlocked'}
      >
        {row.locked ? 
          <Lock size={16} className="text-red-400" /> : 
          <Unlock size={16} className="text-green-400" />
        }
      </button>
      
      {/* Evidence button */}
      <button
        onClick={onToggleEvidence}
        className={`flex-shrink-0 p-1 rounded hover:bg-gray-600 transition-colors ${
          showEvidenceTab ? 'text-blue-400' : 'text-gray-400'
        }`}
        title="Toggle evidence"
      >
        <FileText size={16} />
      </button>
      
      {/* Primary Info - Timestamp is always shown */}
      <div className="flex-shrink-0 text-sm text-blue-200 font-medium">
        {formatDate(row.timestamp)}
      </div>
      
      {/* Customizable Fields in Card Header */}
      <div className="flex items-center ml-4 gap-x-4 overflow-hidden flex-wrap gap-y-2">
        {/* Internal IP - Shown only if enabled in visibleFields */}
        {row.internal_ip && visibleFields.internal_ip && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-blue-300 whitespace-nowrap font-medium">
            IP: {row.internal_ip}
          </div>
        )}
        
        {/* External IP - Shown only if enabled in visibleFields */}
        {row.external_ip && visibleFields.external_ip && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-blue-300 whitespace-nowrap font-medium">
            Ext IP: {row.external_ip}
          </div>
        )}
        
        {/* MAC Address - Shown only if enabled in visibleFields */}
        {row.mac_address && visibleFields.mac_address && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-cyan-300 whitespace-nowrap font-medium">
            MAC: {formatMacAddress(row.mac_address)}
          </div>
        )}
        
        {/* PID - Shown only if enabled in visibleFields */}
        {row.pid && visibleFields.pid && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-cyan-300 whitespace-nowrap font-medium">
            PID: {row.pid}
          </div>
        )}
        
        {/* Hostname - Shown only if enabled in visibleFields */}
        {row.hostname && visibleFields.hostname && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-white whitespace-nowrap font-medium">
            Host: {row.hostname}
          </div>
        )}
        
        {/* Domain - Shown only if enabled in visibleFields */}
        {row.domain && visibleFields.domain && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-white whitespace-nowrap font-medium">
            Domain: {row.domain}
          </div>
        )}
        
        {/* Username - Shown only if enabled in visibleFields */}
        {row.username && visibleFields.username && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-green-300 whitespace-nowrap font-medium">
            User: {row.username}
          </div>
        )}
        
        {/* Filename - Shown only if enabled in visibleFields */}
        {row.filename && visibleFields.filename && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-purple-300 whitespace-nowrap font-medium">
            File: {row.filename}
          </div>
        )}
        
        {/* Command - Shown only if enabled in visibleFields */}
        {row.command && visibleFields.command && (
          <div className="flex-shrink-0 px-2 py-1 max-w-xs bg-gray-700 rounded text-xs text-yellow-300 whitespace-nowrap overflow-hidden text-ellipsis font-medium">
            Cmd: {row.command}
          </div>
        )}
        
        {/* Status - Shown only if enabled in visibleFields */}
        {row.status && visibleFields.status && (
          <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs whitespace-nowrap font-bold">
            <span className={`${getStatusColorClass(row.status)}`}>{row.status}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CardHeader;