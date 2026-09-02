// frontend/src/components/LogCard/CardContent.jsx
import React from 'react';
import { Eye, EyeOff, Network, Terminal, FileText } from 'lucide-react';
import { COLUMNS } from '../../utils/constants';
import FieldEditor from './FieldEditor';
import FieldDisplay from './FieldDisplay';

// One section panel rendering a titled group of fields; replaces the three
// copies of identical markup that used to live here.
const FieldGroup = ({
  title,
  icon: Icon,
  fields,
  row,
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
}) => (
  <div className="bg-gray-900/40 border border-gray-700/50 p-4 rounded-md">
    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
      <Icon size={13} className="text-gray-500" />
      {title}
    </h3>
    <div className="space-y-3">
      {fields.map(field => {
        const column = COLUMNS.find(col => col.field === field);
        const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
        const editable = isFieldEditable(field);

        return (
          <div key={field} className="group">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{column.header}</div>
            <div
              className={`p-1 rounded ${editable ? 'cursor-pointer hover:bg-gray-700/60 group-hover:ring-1 group-hover:ring-gray-600/60' : ''}`}
              onClick={onCellClick(field)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editable) {
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
);

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
  const groupProps = {
    row,
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
  };

  return (
    <div className="p-4 border-t border-gray-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <FieldGroup
          title="Network"
          icon={Network}
          fields={['timestamp', 'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain']}
          {...groupProps}
        />

        <FieldGroup
          title="Command"
          icon={Terminal}
          fields={['username', 'command', 'notes', 'secrets', 'analyst']}
          {...groupProps}
        />

        <FieldGroup
          title="File & Status"
          icon={FileText}
          fields={['filename', 'hash_algorithm', 'hash_value', 'pid', 'status']}
          {...groupProps}
        />
      </div>
    </div>
  );
};

export default CardContent;
