// frontend/src/components/LogRowCard.jsx
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Lock, Unlock, Trash2, Eye, EyeOff, FileText } from 'lucide-react';
import { COLUMNS } from '../utils/constants';
import EvidenceTab from './EvidenceTab';
import { handleMacAddressInput, formatMacAddress } from '../utils/macAddressUtils';

// Helper function to get status color class
const getStatusColorClass = (status) => {
  const statusColors = {
    'ON_DISK': 'text-yellow-300',
    'IN_MEMORY': 'text-blue-300',
    'ENCRYPTED': 'text-purple-300',
    'REMOVED': 'text-red-300',
    'CLEANED': 'text-green-300',
    'DORMANT': 'text-gray-300',
    'DETECTED': 'text-orange-300',
    'UNKNOWN': 'text-gray-400'
  };
  return statusColors[status] || 'text-gray-400';
};

// This component will display a single log row as a card
const LogRowCard = ({
  row,
  isAdmin,
  currentUser,
  editingCell,
  editingValue,
  expandedCell,
  onCellClick,
  onCellChange,
  onCellBlur,
  onKeyDown,
  onExpand,
  onToggleLock,
  onDelete,
  csrfToken
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [showEvidenceTab, setShowEvidenceTab] = useState(false);
  
  // Row is only editable if it's not locked
  const canEdit = !row.locked;

  // Helper to format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
  };

  // Make sure expanded/collapsed state doesn't interfere with clicking cells
  const [isClickingCell, setIsClickingCell] = useState(false);
  
  // Helper to check if a field should be editable
  const isFieldEditable = (field) => {
    return canEdit && field !== 'analyst';
  };

  // Helper to render field value with appropriate formatting
  const renderFieldValue = (field, value) => {
    if (field === 'timestamp') {
      return formatDate(value);
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

    if (!value) return <span className="text-gray-500">-</span>;
    
    return <span className="text-white break-words whitespace-pre-wrap">{value}</span>;
  };

  // Render the input field when editing
  const renderEditField = (field, value) => {
    if (field === 'status') {
      const statusOptions = [
        'ON_DISK', 'IN_MEMORY', 'ENCRYPTED', 'REMOVED', 
        'CLEANED', 'DORMANT', 'DETECTED', 'UNKNOWN'
      ];
      
      return (
        <select
          value={editingValue || ''}
          onChange={(e) => {
            console.log('Status changed to:', e.target.value);
            onCellChange(e);
          }}
          onBlur={(e) => {
            console.log('Status onBlur with value:', e.target.value);
            onCellBlur(e, parseInt(row.id), field);
          }}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">Select a status</option>
          {statusOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }
    
    // Add hash algorithm dropdown
    if (field === 'hash_algorithm') {
      const hashAlgorithmOptions = [
        'MD5', 'SHA1', 'SHA256', 'SHA512', 'BLAKE2', 
        'RIPEMD160', 'CRC32', 'SHA3', 'OTHER'
      ];
      
      return (
        <select
          value={editingValue || ''}
          onChange={onCellChange}
          onBlur={(e) => onCellBlur(e, parseInt(row.id), field)}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">Select an algorithm</option>
          {hashAlgorithmOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    // MAC address field should use a specialized input with dash format
    if (field === 'mac_address') {
      return (
        <input
          type="text"
          value={editingValue || ''}
          onChange={(e) => {
            // Apply auto-formatting while typing
            handleMacAddressInput(e);
            onCellChange(e);
          }}
          onBlur={(e) => {
            // Format on blur to ensure dash format
            const formattedValue = formatMacAddress(e.target.value);
            // Create a new event with the formatted value
            const newEvent = { ...e, target: { ...e.target, value: formattedValue } };
            onCellBlur(newEvent, parseInt(row.id), field);
          }}
          onKeyDown={(e) => onKeyDown(e, parseInt(row.id), field)}
          onClick={(e) => e.stopPropagation()}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="XX-XX-XX-XX-XX-XX"
          pattern="([0-9A-Fa-f]{2}-){5}([0-9A-Fa-f]{2})"
          title="Please enter a valid MAC address (e.g., AA-BB-CC-DD-EE-FF)"
        />
      );
    }
    
    // Use textarea for notes, command, secrets, and hash_value fields
    if (field === 'notes' || field === 'command' || field === 'secrets' || field === 'hash_value') {
      return (
        <textarea
          value={editingValue || ''}
          onChange={onCellChange}
          onBlur={(e) => onCellBlur(e, parseInt(row.id), field)}
          onKeyDown={(e) => onKeyDown(e, parseInt(row.id), field)}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="w-full p-1 border rounded min-h-[72px] bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ 
            height: editingValue ? `${Math.max(72, editingValue.split('\n').length * 24)}px` : '72px'
          }}
        />
      );
    }
    
    // Default to text input for other fields
    return (
      <input
        type="text"
        value={editingValue || ''}
        onChange={onCellChange}
        onBlur={(e) => onCellBlur(e, parseInt(row.id), field)}
        onKeyDown={(e) => onKeyDown(e, parseInt(row.id), field)}
        onClick={(e) => e.stopPropagation()}
        autoFocus
        className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  };

  // Sort columns into logical groups
  const columnGroups = {
    primary: ['timestamp', 'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain'],
    content: ['username', 'command', 'notes', 'secrets'],
    status: ['filename', 'hash_algorithm', 'hash_value', 'status', 'analyst']
  };

  return (
    <div className={`mb-2 rounded-lg overflow-hidden ${row.locked ? 'bg-gray-900' : 'bg-gray-800'}`}>
      {/* Card Header - Always visible */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-700 transition-colors"
        onClick={() => {
          if (!isClickingCell) {
            setIsExpanded(!isExpanded);
          }
          setIsClickingCell(false);
        }}
      >
        <div className="flex items-center gap-x-3 overflow-hidden">
          {/* Expand/Collapse Icon */}
          {isExpanded ? (
            <ChevronDown className="flex-shrink-0 w-5 h-5 text-white" />
          ) : (
            <ChevronRight className="flex-shrink-0 w-5 h-5 text-white" />
          )}
          
          {/* Lock/Unlock button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsClickingCell(true);
              onToggleLock(row.id);
            }}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-600 transition-colors"
            title={row.locked ? `Locked by ${row.locked_by}` : 'Unlocked'}
            disabled={row.locked && !isAdmin && row.locked_by !== currentUser}
          >
            {row.locked ? 
              <Lock size={16} className="text-red-400" /> : 
              <Unlock size={16} className="text-green-400" />
            }
          </button>
          
          {/* Evidence button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsClickingCell(true);
              setShowEvidenceTab(!showEvidenceTab);
            }}
            className={`flex-shrink-0 p-1 rounded hover:bg-gray-600 transition-colors ${
              showEvidenceTab ? 'text-blue-400' : 'text-gray-400'
            }`}
            title="Toggle evidence"
          >
            <FileText size={16} />
          </button>
          
          {/* Primary Info */}
          <div className="flex-shrink-0 text-sm text-blue-200 font-medium">
            {formatDate(row.timestamp)}
          </div>
          
          <div className="flex items-center ml-4 gap-x-4 overflow-hidden">
            {row.internal_ip && (
              <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-blue-300 whitespace-nowrap font-medium">
                IP: {row.internal_ip}
              </div>
            )}
            
            {row.mac_address && (
              <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-cyan-300 whitespace-nowrap font-medium">
                MAC: {formatMacAddress(row.mac_address)}
              </div>
            )}
            
            {row.hostname && (
              <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-white whitespace-nowrap font-medium">
                Host: {row.hostname}
              </div>
            )}
            
            {row.username && (
              <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-green-300 whitespace-nowrap font-medium">
                User: {row.username}
              </div>
            )}
            
            {row.filename && (
              <div className="hidden md:block flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs text-purple-300 whitespace-nowrap font-medium">
                File: {row.filename}
              </div>
            )}
            
            {row.command && (
              <div className="hidden lg:block flex-shrink-0 text-sm text-yellow-300 truncate max-w-xs font-medium">
                Cmd: {row.command}
              </div>
            )}
            
            {row.status && (
              <div className="flex-shrink-0 px-2 py-1 bg-gray-700 rounded text-xs whitespace-nowrap font-bold">
                <span className={`${getStatusColorClass(row.status)}`}>{row.status}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Delete button (admin only) */}
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsClickingCell(true);
              if (window.confirm('Are you sure you want to delete this row? This action cannot be undone.')) {
                onDelete(row.id);
              }
            }}
            className="flex-shrink-0 p-1 hover:bg-gray-600 rounded text-red-400 transition-colors"
            title="Delete Row"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      
      {/* Expanded Card Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-700">
          {/* Main section - Three column layout on larger screens */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Network section */}
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-white mb-3">Network Information</h3>
            <div className="space-y-3">
              {columnGroups.primary.map(field => {
                // Skip timestamp as it's already in the header
                if (field === 'timestamp') return null;
                
                const column = COLUMNS.find(col => col.field === field);
                const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
                
                return (
                  <div key={field} className="group">
                    <div className="text-xs text-blue-200 mb-1">{column.header}:</div>
                    <div 
                      className={`${isFieldEditable(field) ? 'cursor-pointer hover:bg-gray-600/50' : ''} p-1 rounded`}
                      onClick={(e) => {
                        if (isFieldEditable(field)) {
                          e.stopPropagation(); // Stop event from bubbling up to the parent
                          setIsClickingCell(true);
                          onCellClick(row.id, field);
                        }
                      }}
                    >
                      {isEditing ? 
                        renderEditField(field, row[field]) : 
                        renderFieldValue(field, row[field])}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Content section - Now with secrets */}
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-white mb-3">Command Information</h3>
            <div className="space-y-3">
              {/* Manually specify the fields to ensure the right order */}
              {['username', 'command', 'notes', 'secrets'].map(field => {
                const column = COLUMNS.find(col => col.field === field);
                const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
                
                return (
                  <div key={field} className="group">
                    <div className="text-xs text-blue-200 mb-1">{column.header}:</div>
                    <div 
                      className={`${isFieldEditable(field) ? 'cursor-pointer hover:bg-gray-600/50' : ''} p-1 rounded`}
                      onClick={(e) => {
                        if (isFieldEditable(field)) {
                          e.stopPropagation(); // Stop event from bubbling up to the parent
                          setIsClickingCell(true);
                          onCellClick(row.id, field);
                        }
                      }}
                    >
                      {isEditing ? 
                        renderEditField(field, row[field]) : 
                        renderFieldValue(field, row[field])}
                      
                      {field === 'secrets' && row[field] && !isEditing && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowSecrets(!showSecrets);
                          }}
                          className="ml-2 p-1 text-gray-400 hover:text-gray-200 transition-colors"
                          title={showSecrets ? "Hide secrets" : "Show secrets"}
                        >
                          {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Status section - Now includes filename and hash fields */}
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-white mb-3">File & Status Information</h3>
            <div className="space-y-3">
              {/* Manually specify the fields to ensure the right order */}
              {['filename', 'hash_algorithm', 'hash_value', 'status', 'analyst'].map(field => {
                const column = COLUMNS.find(col => col.field === field);
                const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
                
                return (
                  <div key={field} className="group">
                    <div className="text-xs text-blue-200 mb-1">{column.header}:</div>
                    <div 
                      className={`${isFieldEditable(field) ? 'cursor-pointer hover:bg-gray-600/50' : ''} p-1 rounded`}
                      onClick={(e) => {
                        if (isFieldEditable(field)) {
                          e.stopPropagation(); // Stop event from bubbling up to the parent
                          setIsClickingCell(true);
                          onCellClick(row.id, field);
                        }
                      }}
                    >
                      {isEditing ? 
                        renderEditField(field, row[field]) : 
                        renderFieldValue(field, row[field])}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Evidence Tab */}
        {showEvidenceTab && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <EvidenceTab 
              logId={row.id}
              csrfToken={csrfToken}
              isAdmin={isAdmin}
              currentUser={currentUser}
            />
          </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LogRowCard;