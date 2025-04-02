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
  csrfToken,
  visibleFields = {} // New prop for configurable field visibility
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [showEvidenceTab, setShowEvidenceTab] = useState(false);
  
  // Row is only editable if it's not locked
  const canEdit = !row.locked;

  // Helper to format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    
    // Create a date object from the timestamp
    const date = new Date(timestamp);
    
    // Format the date to show in a consistent way with Zulu/UTC indicator
    // Format: YYYY-MM-DD HH:MM:SS Z
    return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
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
    
    if (field === 'pid' && value) {
      return <span className="text-white font-mono">{value}</span>;
    }
  
    if (!value) return <span className="text-gray-500">-</span>;
    
    return <span className="text-white break-words whitespace-pre-wrap">{value}</span>;
  };

  // Modified handleKeyDown to improve tab behavior
  const handleTabKeyDown = (e, rowId, field) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      // Whether Shift+Tab or regular Tab, always save the value
      // Only difference is which direction we move (controlled by e.shiftKey)
      moveToNextCell(rowId, field, editingValue, e.shiftKey, false);
    } else if (e.key === 'Enter') {
      // For textarea fields, shift+enter adds a new line
      if (e.shiftKey && (field === 'notes' || field === 'command' || field === 'secrets' || field === 'hash_value')) {
        e.preventDefault();
        setEditingValue(prev => prev + '\n');
      }
      // For dropdowns, we'll handle it in the dropdown's onKeyDown
      else if (field === 'status' || field === 'hash_algorithm') {
        // Just prevent default, actual handling is in the dropdown
        e.preventDefault();
      }
      // For other fields, Enter key should save and exit edit mode
      else {
        e.preventDefault();
        onCellBlur(e, parseInt(rowId), field);
      }
    }
  };

  // Improved function to move to the next cell in sequence
  const moveToNextCell = async (currentRowId, currentField, currentValue, isReverse = false, skipSave = false) => {
    if (currentField === 'analyst') return;
    
    // Define the tab order explicitly
    const tabOrder = [
      // Network column
      'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
      // Content column
      'username', 'command', 'notes', 'secrets', 'analyst',
      // Status column
      'filename', 'hash_algorithm', 'hash_value', 'pid', 'status'
    ];
    
    // Find the current position in the tab order
    const currentIndex = tabOrder.indexOf(currentField);
    if (currentIndex === -1) return;
    
    // Calculate the next or previous index based on direction
    let nextIndex;
    if (isReverse) {
      // Go to previous field
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) nextIndex = tabOrder.length - 1; // Wrap around
    } else {
      // Go to next field
      nextIndex = currentIndex + 1;
      if (nextIndex >= tabOrder.length) nextIndex = 0; // Wrap around
    }
    
    const nextField = tabOrder[nextIndex];
    
    try {
      // Save the current cell value if not skipping save
      if (!skipSave && currentField !== 'analyst') {
        // Try to save the current value
        await onCellBlur({ target: { value: currentValue } }, currentRowId, currentField);
      }
      
      // Find the next editable cell
      let nextEditableIndex = nextIndex;
      let attempts = 0;
      const maxAttempts = tabOrder.length; // Prevent infinite loops
      
      while (attempts < maxAttempts) {
        // Check if the next field is editable
        if (isFieldEditable(tabOrder[nextEditableIndex])) {
          break;
        }
        
        // Move to the next field in the direction we're going
        if (isReverse) {
          nextEditableIndex--;
          if (nextEditableIndex < 0) nextEditableIndex = tabOrder.length - 1;
        } else {
          nextEditableIndex++;
          if (nextEditableIndex >= tabOrder.length) nextEditableIndex = 0;
        }
        
        attempts++;
      }
      
      // If we found an editable field, focus it
      if (attempts < maxAttempts) {
        const nextEditableField = tabOrder[nextEditableIndex];
        
        // Allow a small delay for the DOM to update
        setTimeout(() => {
          onCellClick(currentRowId, nextEditableField);
        }, 10);
      }
    } catch (err) {
      console.error('Failed to navigate to next cell:', err);
    }
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // When Enter is pressed in a dropdown:
              // 1. Capture the currently selected value (which may have been selected with arrow keys)
              const currentSelection = e.target.value;
              
              // 2. Update the editingValue with the arrow-key selected option
              onCellChange({ target: { value: currentSelection } });
              
              // 3. Save the current value and move to the next field
              // This simulates a regular Tab press
              moveToNextCell(parseInt(row.id), field, currentSelection, false, false);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              // When Tab is pressed in dropdown:
              // 1. Capture the currently selected value (which may have been selected with arrow keys)
              const currentSelection = e.target.value;
              
              // 2. Update the editingValue with the arrow-key selected option
              onCellChange({ target: { value: currentSelection } });
              
              // 3. Move to next/previous field based on shift key
              // Always save the value, whether going forward or backward
              moveToNextCell(parseInt(row.id), field, currentSelection, e.shiftKey, false);
            } else {
              handleTabKeyDown(e, parseInt(row.id), field);
            }
          }}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={(e) => e.stopPropagation()}
          autoFocus
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // When Enter is pressed in a dropdown:
              // 1. Capture the currently selected value (which may have been selected with arrow keys)
              const currentSelection = e.target.value;
              
              // 2. Update the editingValue with the arrow-key selected option
              onCellChange({ target: { value: currentSelection } });
              
              // 3. Save the current value and move to the next field
              // This simulates a regular Tab press
              moveToNextCell(parseInt(row.id), field, currentSelection, false, false);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              // When Tab is pressed in dropdown:
              // 1. Capture the currently selected value (which may have been selected with arrow keys)
              const currentSelection = e.target.value;
              
              // 2. Update the editingValue with the arrow-key selected option
              onCellChange({ target: { value: currentSelection } });
              
              // 3. Move to next/previous field based on shift key
              // Always save the value, whether going forward or backward
              moveToNextCell(parseInt(row.id), field, currentSelection, e.shiftKey, false);
            } else {
              handleTabKeyDown(e, parseInt(row.id), field);
            }
          }}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={(e) => e.stopPropagation()}
          autoFocus
        >
          <option value="">Select an algorithm</option>
          {hashAlgorithmOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }
  
    if (field === 'pid') {
      return (
        <input
          type="text"
          value={editingValue || ''}
          onChange={onCellChange}
          onBlur={(e) => onCellBlur(e, parseInt(row.id), field)}
          onKeyDown={(e) => handleTabKeyDown(e, parseInt(row.id), field)}
          onClick={(e) => e.stopPropagation()}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Process ID"
          pattern="[0-9]+"
          title="Process ID (numeric value)"
          maxLength={20}
          autoFocus
        />
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
          onKeyDown={(e) => handleTabKeyDown(e, parseInt(row.id), field)}
          onClick={(e) => e.stopPropagation()}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="XX-XX-XX-XX-XX-XX"
          pattern="([0-9A-Fa-f]{2}-){5}([0-9A-Fa-f]{2})"
          title="Please enter a valid MAC address (e.g., AA-BB-CC-DD-EE-FF)"
          autoFocus
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
          onKeyDown={(e) => handleTabKeyDown(e, parseInt(row.id), field)}
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
        onKeyDown={(e) => handleTabKeyDown(e, parseInt(row.id), field)}
        onClick={(e) => e.stopPropagation()}
        autoFocus
        className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  };

  // Sort columns into logical groups
  const columnGroups = {
    primary: ['timestamp', 'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain'],
    content: ['username', 'command', 'notes', 'secrets', 'analyst'],
    status: ['filename', 'hash_algorithm', 'hash_value', 'pid', 'status']
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && isFieldEditable(field)) {
                            e.preventDefault();
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
                {['username', 'command', 'notes', 'secrets', 'analyst'].map(field => {
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && isFieldEditable(field)) {
                            e.preventDefault();
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

            {/* Status section - Now includes PID field and analyst removed */}
            <div className="bg-gray-700/50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-white mb-3">File & Status Information</h3>
              <div className="space-y-3">
                {/* Manually specify the fields to ensure the right order */}
                {['filename', 'hash_algorithm', 'hash_value', 'pid', 'status'].map(field => {
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && isFieldEditable(field)) {
                            e.preventDefault();
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