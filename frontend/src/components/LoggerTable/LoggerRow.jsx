// components/LoggerTable/LoggerRow.jsx
import React, { useState } from 'react';
import { Lock, Unlock, Trash2, FileText } from 'lucide-react';
import LoggerCell from './LoggerCell';
import EvidenceTab from '../EvidenceTab';

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
    onDelete,
    csrfToken
  }) => {
    // Row is only editable if it's not locked
    const canEdit = !row.locked;
    
    // Add state for evidence panel visibility
    const [showEvidencePanel, setShowEvidencePanel] = useState(false);
    
    // Simple toggle function
    const toggleEvidencePanel = (e) => {
      e.stopPropagation();
      setShowEvidencePanel(!showEvidencePanel);
    };
    
    return (
      <>
        <tr className={row.locked ? 'bg-gray-900' : 'bg-gray-800'}>
          <td className="border border-gray-600 p-2 sticky left-0 bg-gray-800 z-10 flex items-center space-x-2">
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
            
            {/* Simple evidence button */}
            <button
              onClick={toggleEvidencePanel}
              className={`p-1 rounded hover:bg-gray-700 transition-colors duration-200 ${
                showEvidencePanel ? 'text-blue-400' : 'text-gray-400'
              }`}
              title="Toggle evidence panel"
            >
              <FileText size={16} />
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
        
        {/* Simple conditional rendering for evidence panel */}
        {showEvidencePanel && (
          <tr className="bg-gray-800">
            <td colSpan={columns.length + (isAdmin ? 2 : 1)} className="p-0 border border-gray-600">
              <div className="p-4 bg-gray-800 border-t border-gray-700">
                <EvidenceTab 
                  logId={row.id}
                  csrfToken={csrfToken}
                  isAdmin={isAdmin}
                  currentUser={currentUser}
                  isTableView={true}
                />
              </div>
            </td>
          </tr>
        )}
      </>
    );
  };

export default LoggerRow;