// components/LoggerTable/LoggerRow.jsx
import React from 'react';
import { Lock, Unlock, Trash2 } from 'lucide-react';
import LoggerCell from './LoggerCell';

const LoggerRow = ({
    row,
    columns,
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
    onDelete
  }) => {
    // Row is only editable if it's not locked
    const canEdit = !row.locked;
    
    return (
      <tr className={row.locked ? 'bg-gray-900' : 'bg-gray-800'}>
        <td className="border border-gray-600 p-2 sticky left-0 bg-gray-800 z-10">
          <button
            onClick={() => onToggleLock(row.id)}
            className={`p-1 rounded ${!row.locked ? 'hover:bg-gray-700 transition-colors duration-200' : ''}`}
            title={row.locked ? `Locked by ${row.locked_by}` : 'Unlocked'}
            disabled={row.locked && !isAdmin && row.locked_by !== currentUser}
          >
            {row.locked ? 
              <Lock size={16} className="text-red-400" /> : 
              <Unlock size={16} className="text-green-400" />
            }
          </button>
        </td>
        {columns.map(col => {
          // Determine if this cell should be editable
          const isAnalystField = col.field === 'analyst';
          const isCellEditable = canEdit && !isAnalystField;

          return (
            <td
              key={`${row.id}-${col.field}`}
              className={`border border-gray-600 p-2 text-white ${
                !isCellEditable ? 'bg-gray-900/50' : 'cursor-pointer'
              }`}
              onClick={() => isCellEditable ? onCellClick(row.id, col.field) : null}
              title={
                row.locked 
                  ? `This row is locked by ${row.locked_by}`
                  : isAnalystField 
                    ? 'Analyst field cannot be modified'
                    : ''
              }
            >
              <LoggerCell
                row={row}
                col={col}
                isEditing={editingCell?.rowId === row.id && editingCell?.field === col.field}
                editingValue={editingValue}
                expandedCell={expandedCell}
                onCellChange={onCellChange}
                onCellBlur={onCellBlur}
                onKeyDown={onKeyDown}
                onExpand={onExpand}
                disabled={!isCellEditable}
              />
            </td>
          );
        })}
        {isAdmin && (
          <td className="border border-gray-600 p-2 sticky right-0 bg-gray-800 z-10">
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this row? This action cannot be undone.')) {
                  onDelete(row.id);
                }
              }}
              className="p-1 hover:bg-gray-700 rounded text-red-400 transition-colors duration-200"
              title="Delete Row"
            >
              <Trash2 size={16} />
            </button>
          </td>
        )}
      </tr>
    );
  };

export default LoggerRow;