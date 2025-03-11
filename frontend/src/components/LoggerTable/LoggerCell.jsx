// components/LoggerTable/LoggerCell.jsx
import React, { useEffect, useRef, useState } from 'react';
import { ExpandIcon, Eye, EyeOff } from 'lucide-react';

// Define maxLengths at component scope
const maxLengths = {
  internal_ip: 45,
  external_ip: 45,
  hostname: 75,
  domain: 75,
  username: 75,
  command: 254,
  notes: 254,  // Increased from 150 to 254
  filename: 254,
  status: 75,
  secrets: 254,
  analyst: 100,
  locked_by: 100
};

// Define predefined status options for file tracking
const statusOptions = [
  'ON_DISK',
  'IN_MEMORY',
  'ENCRYPTED',
  'REMOVED',
  'CLEANED',
  'DORMANT',
  'DETECTED',
  'UNKNOWN'
];

const validateFieldLength = (value, field) => {
  return !value || value.length <= maxLengths[field];
};

const LoggerCell = ({ 
    row, 
    col, 
    isEditing, 
    editingValue, 
    expandedCell,
    onCellChange,
    onCellBlur,
    onKeyDown,
    onExpand,
    disabled
  }) => {
    const textareaRef = useRef(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showSecrets, setShowSecrets] = useState(false);
    const isExpanded = expandedCell?.rowId === row.id && expandedCell?.field === col.field;
    const isStatusField = col.field === 'status';
    const isSecretsField = col.field === 'secrets';
    const isNotesField = col.field === 'notes';
    
    const getContent = () => {
      const value = row[col.field];
      
      if (col.field === 'timestamp' && value) {
        return new Date(value).toLocaleString();
      }
      
      if (value === null || value === undefined || value === '') {
        // For status field, show placeholder text
        if (isStatusField) {
          return "Select Status";
        }
        if (isSecretsField) {
          return "Enter credentials";
        }
        return '';
      }
      
      // For secrets field, mask the content when not showing
      if (isSecretsField && !showSecrets && !isEditing) {
        return "••••••••••••";
      }
      
      return value.toString();
    };
    
    const content = getContent();
  
    useEffect(() => {
      if (isEditing && !disabled && textareaRef.current) {
        textareaRef.current.focus();
        // Only set selection range for textarea elements
        if (textareaRef.current.type !== 'select-one') {
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
        }
      }
    }, [isEditing, disabled]);
  
    const handleBlur = (e) => {
      onCellBlur(e, parseInt(row.id), col.field);
    };
    
    const handleKeyDown = (e) => {
      onKeyDown(e, parseInt(row.id), col.field);
    };

    const handleChange = (e) => {
      const newValue = e.target.value;
      const maxLength = maxLengths[col.field];
      
      if (!validateFieldLength(newValue, col.field)) {
        alert(`Maximum length for ${col.field} is ${maxLength} characters`);
        e.target.value = newValue.substring(0, maxLength);
        return;
      }
      onCellChange(e);
    };

    const handleStatusSelect = (status) => {
      const fakeEvent = { target: { value: status } };
      onCellChange(fakeEvent);
      setShowDropdown(false);
    };

    const toggleShowSecrets = (e) => {
      e.stopPropagation(); // Prevent cell click handler
      setShowSecrets(!showSecrets);
    };

    if (isEditing && !disabled) {
      if (isStatusField) {
        return (
          <div className="relative">
            <input
              ref={textareaRef}
              type="text"
              value={editingValue ?? ''}
              onChange={handleChange}
              onBlur={(e) => {
                // Short delay to allow click events on dropdown
                setTimeout(() => {
                  handleBlur(e);
                  setShowDropdown(false);
                }, 150);
              }}
              onKeyDown={handleKeyDown}
              onClick={() => setShowDropdown(true)}
              className="w-full p-1 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Select Status"
            />
            {showDropdown && (
              <div className="fixed z-50 w-[200px] bg-gray-700 border border-gray-600 rounded shadow-lg" 
                   style={{
                     top: textareaRef.current?.getBoundingClientRect().bottom + 'px',
                     left: textareaRef.current?.getBoundingClientRect().left + 'px'
                   }}>
                {statusOptions.map(option => (
                  <div
                    key={option}
                    className={`px-3 py-1 cursor-pointer hover:bg-gray-600 ${getStatusColorClass(option)}`}
                    onMouseDown={() => handleStatusSelect(option)}
                  >
                    {option}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      // For secrets field, use textarea
      if (isSecretsField) {
        return (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={editingValue ?? ''}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full p-1 border rounded min-h-[24px] bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ 
                height: editingValue ? `${Math.max(24, editingValue.split('\n').length * 24)}px` : '24px'
              }}
              placeholder="Enter credentials used (passwords, API keys, etc.)"
            />
          </div>
        );
      }

      // Make notes field larger when editing
      if (isNotesField) {
        return (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={editingValue ?? ''}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full p-1 border rounded min-h-[72px] bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ 
                height: editingValue ? `${Math.max(72, editingValue.split('\n').length * 24)}px` : '72px',
                minWidth: '250px'
              }}
              placeholder="Enter notes"
            />
          </div>
        );
      }

      return (
        <textarea
          ref={textareaRef}
          value={editingValue ?? ''}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full p-1 border rounded min-h-[24px] bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ 
            height: editingValue ? `${Math.max(24, editingValue.split('\n').length * 24)}px` : '24px'
          }}
        />
      );
    }
  
    const shouldTruncate = content.length > 100 && !isExpanded;
    const displayContent = shouldTruncate ? `${content.substring(0, 100)}...` : content;

    // Add special styling for status values that match our predefined options
    const isPlaceholderText = isStatusField && (row[col.field] === null || row[col.field] === undefined || row[col.field] === '');
    const isKnownStatus = !isPlaceholderText && statusOptions.includes(row[col.field]);
    const statusClasses = isStatusField 
      ? (isPlaceholderText 
          ? 'text-gray-500 italic' 
          : (isKnownStatus 
              ? 'font-semibold ' + getStatusColorClass(row[col.field])
              : ''))
      : '';
    
    // Make notes cell display larger even when not editing
    const cellClasses = isNotesField 
      ? 'whitespace-pre-wrap min-h-[60px]' 
      : 'whitespace-pre-wrap';
  
    return (
      <div className={`relative group min-h-8 w-full ${disabled ? 'opacity-75' : ''}`}>
        <div 
          className={`${cellClasses} ${shouldTruncate && !disabled ? 'cursor-pointer' : ''} ${statusClasses}`}
          onClick={() => !disabled && onExpand && (shouldTruncate ? onExpand(row.id, col.field) : null)}
        >
          {displayContent || '\u00A0'}
          
          {/* Add eye icon for secrets field */}
          {isSecretsField && row[col.field] && (
            <button
              onClick={toggleShowSecrets}
              className="ml-2 p-1 text-gray-400 hover:text-gray-200 transition-colors"
              title={showSecrets ? "Hide secrets" : "Show secrets"}
            >
              {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {content.length > 100 && !disabled && (
          <button
            onClick={() => onExpand && onExpand(row.id, col.field)}
            className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <ExpandIcon size={14} />
          </button>
        )}
      </div>
    );
  };

// Helper function to get color class based on status
function getStatusColorClass(status) {
  switch (status) {
    case 'ON_DISK':
      return 'text-yellow-300';
    case 'IN_MEMORY':
      return 'text-blue-300';
    case 'ENCRYPTED':
      return 'text-purple-300';
    case 'REMOVED':
      return 'text-red-300';
    case 'CLEANED':
      return 'text-green-300';
    case 'DORMANT':
      return 'text-gray-300';
    case 'DETECTED':
      return 'text-orange-300';
    case 'UNKNOWN':
      return 'text-gray-400';
    default:
      return '';
  }
}

export default LoggerCell;