// frontend/src/components/LogCard/FieldEditor.jsx
import React from 'react';
import { handleMacAddressInput } from '../../utils/macAddressUtils';

const FieldEditor = ({ 
  field, 
  value, 
  onChange, 
  onBlur, 
  onKeyDown,
  moveToNextCell,
  rowId
}) => {
  // Handle dropdown changes specifically
  const handleDropdownChange = (e) => {
    console.log(`${field} changed to:`, e.target.value);
    onChange(e);
  };

  // Handle dropdown key events for better navigation
  const handleDropdownKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // When Enter is pressed in a dropdown:
      // 1. Capture the currently selected value (which may have been selected with arrow keys)
      const currentSelection = e.target.value;
      
      // 2. Update the editingValue with the arrow-key selected option
      onChange({ target: { value: currentSelection } });
      
      // 3. Save the current value and move to the next field
      // This simulates a regular Tab press
      moveToNextCell(parseInt(rowId), field, currentSelection, false, false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // When Tab is pressed in dropdown:
      // 1. Capture the currently selected value (which may have been selected with arrow keys)
      const currentSelection = e.target.value;
      
      // 2. Update the editingValue with the arrow-key selected option
      onChange({ target: { value: currentSelection } });
      
      // 3. Move to next/previous field based on shift key
      // Always save the value, whether going forward or backward
      moveToNextCell(parseInt(rowId), field, currentSelection, e.shiftKey, false);
    } else {
      onKeyDown && onKeyDown(e);
    }
  };

  // Render different inputs based on field type
  switch (field) {
    case 'status':
      const statusOptions = [
        'ON_DISK', 'IN_MEMORY', 'ENCRYPTED', 'REMOVED', 
        'CLEANED', 'DORMANT', 'DETECTED', 'UNKNOWN'
      ];
      
      return (
        <select
          value={value || ''}
          onChange={handleDropdownChange}
          onBlur={onBlur}
          onKeyDown={handleDropdownKeyDown}
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
    
    case 'hash_algorithm':
      const hashAlgorithmOptions = [
        'MD5', 'SHA1', 'SHA256', 'SHA512', 'BLAKE2', 
        'RIPEMD160', 'CRC32', 'SHA3', 'OTHER'
      ];
      
      return (
        <select
          value={value || ''}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={handleDropdownKeyDown}
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
  
    case 'pid':
      return (
        <input
          type="text"
          value={value || ''}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Process ID"
          pattern="[0-9]+"
          title="Process ID (numeric value)"
          maxLength={20}
          autoFocus
        />
      );

    case 'mac_address':
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            // Apply auto-formatting while typing
            handleMacAddressInput(e);
            onChange(e);
          }}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="XX-XX-XX-XX-XX-XX"
          pattern="([0-9A-Fa-f]{2}-){5}([0-9A-Fa-f]{2})"
          title="Please enter a valid MAC address (e.g., AA-BB-CC-DD-EE-FF)"
          autoFocus
        />
      );
    
    case 'notes':
    case 'command':
    case 'secrets':
    case 'hash_value':
      return (
        <textarea
          value={value || ''}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="w-full p-1 border rounded min-h-[72px] bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ 
            height: value ? `${Math.max(72, value.split('\n').length * 24)}px` : '72px'
          }}
        />
      );
    
    // Default to text input for other fields
    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );
  }
};

export default FieldEditor;