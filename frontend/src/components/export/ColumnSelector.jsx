// frontend/src/components/export/ColumnSelector.jsx
import React from 'react';
import { CheckSquare, Square, RefreshCw } from 'lucide-react';

/**
 * Component for selecting which database columns to export
 */
const ColumnSelector = ({ columns, selectedColumns, loadingColumns, onColumnToggle }) => {
  if (loadingColumns) {
    return (
      <div className="flex justify-center items-center py-8">
        <RefreshCw className="animate-spin text-blue-400" />
        <span className="ml-2 text-gray-300">Loading columns...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
      {columns.map(column => (
        <div
          key={column.name}
          className={`flex items-center p-2 rounded cursor-pointer hover:bg-gray-600/50 ${
            column.sensitive ? 'border-l-2 border-red-500' : ''
          }`}
          onClick={() => onColumnToggle(column.name)}
        >
          {selectedColumns.includes(column.name) ? (
            <CheckSquare size={18} className="text-blue-400 mr-2" />
          ) : (
            <Square size={18} className="text-gray-400 mr-2" />
          )}
          <div>
            <span className="text-white">{column.name}</span>
            <span className="text-xs text-gray-400 ml-2">({column.type})</span>
            {column.sensitive && (
              <span className="ml-2 text-xs text-red-300">(sensitive)</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ColumnSelector;