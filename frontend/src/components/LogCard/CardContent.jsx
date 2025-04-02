// frontend/src/components/LogCard/CardContent.jsx
import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { COLUMNS } from '../../utils/constants';
import FieldEditor from './FieldEditor';
import FieldDisplay from './FieldDisplay';

const CardContent = ({
  row,
  isAdmin,
  canEdit,
  editingCell,
  editingValue,
  isFieldEditable,
  onCellClick,
  onCellChange,
  onCellBlur,
  onCellKeyDown,
  showSecrets,
  onToggleSecrets,
  moveToNextCell
}) => {
  // Sort columns into logical groups
  const columnGroups = {
    primary: ['timestamp', 'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain'],
    content: ['username', 'command', 'notes', 'secrets', 'analyst'],
    status: ['filename', 'hash_algorithm', 'hash_value', 'pid', 'status']
  };

  return (
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
                    onClick={onCellClick(field)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isFieldEditable(field)) {
                        e.preventDefault();
                        onCellClick(field)(e);
                      }
                    }}
                  >
                    {isEditing ? (
                      <FieldEditor
                        field={field}
                        value={editingValue}
                        onChange={onCellChange}
                        onBlur={(e) => onCellBlur(e, parseInt(row.id), field)}
                        onKeyDown={onCellKeyDown(field)}
                        moveToNextCell={moveToNextCell}
                        rowId={row.id}
                      />
                    ) : (
                      <FieldDisplay 
                        field={field} 
                        value={row[field]} 
                      />
                    )}
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
                    onClick={onCellClick(field)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isFieldEditable(field)) {
                        e.preventDefault();
                        onCellClick(field)(e);
                      }
                    }}
                  >
                    {isEditing ? (
                      <FieldEditor
                        field={field}
                        value={editingValue}
                        onChange={onCellChange}
                        onBlur={(e) => onCellBlur(e, parseInt(row.id), field)}
                        onKeyDown={onCellKeyDown(field)}
                        moveToNextCell={moveToNextCell}
                        rowId={row.id}
                      />
                    ) : (
                      <>
                        <FieldDisplay 
                          field={field} 
                          value={row[field]} 
                          showSecrets={showSecrets}
                        />
                        
                        {field === 'secrets' && row[field] && !isEditing && (
                          <button
                            onClick={onToggleSecrets}
                            className="ml-2 p-1 text-gray-400 hover:text-gray-200 transition-colors"
                            title={showSecrets ? "Hide secrets" : "Show secrets"}
                          >
                            {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        )}
                      </>
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
                    onClick={onCellClick(field)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isFieldEditable(field)) {
                        e.preventDefault();
                        onCellClick(field)(e);
                      }
                    }}
                  >
                    {isEditing ? (
                      <FieldEditor
                        field={field}
                        value={editingValue}
                        onChange={onCellChange}
                        onBlur={(e) => onCellBlur(e, parseInt(row.id), field)}
                        onKeyDown={onCellKeyDown(field)}
                        moveToNextCell={moveToNextCell}
                        rowId={row.id}
                      />
                    ) : (
                      <FieldDisplay 
                        field={field} 
                        value={row[field]} 
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardContent;