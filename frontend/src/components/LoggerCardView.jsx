// frontend/src/components/LoggerCardView.jsx
import React, { useState } from 'react';
import { Layout, Table, List, Plus } from 'lucide-react';
import LogRowCard from './LogRowCard';
import TablePagination from './LoggerTable/TablePagination';
import LoggerTableHeader from './LoggerTable/LoggerTableHeader';
import LoggerRow from './LoggerTable/LoggerRow';
import { COLUMNS } from '../utils/constants';

const LoggerCardView = ({
  logs,
  isAdmin,
  currentUser,
  tableState,
  handlers
}) => {
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'
  
  return (
    <div className="bg-gray-800 shadow-lg rounded-lg w-full">
      {/* Header with view toggle and add button */}
      <div className="flex justify-between items-center p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('card')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors duration-200 ${
              viewMode === 'card' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title="Card View"
          >
            <List size={16} />
            <span className="hidden sm:inline">Card View</span>
          </button>
          
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors duration-200 ${
              viewMode === 'table' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title="Table View"
          >
            <Layout size={16} />
            <span className="hidden sm:inline">Table View</span>
          </button>
        </div>
        
        <button 
          onClick={handlers.handleAddRow}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md flex items-center gap-2 hover:bg-blue-700 transition-colors duration-200"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Add Row</span>
        </button>
      </div>
      
      {viewMode === 'card' ? (
        <div className="p-4">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No logs found. Click "Add Row" to create your first log entry.</p>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {logs.map(row => (
                <LogRowCard
                  key={row.id}
                  row={row}
                  isAdmin={isAdmin}
                  currentUser={currentUser}
                  editingCell={tableState.editingCell}
                  editingValue={tableState.editingValue}
                  expandedCell={tableState.expandedCell}
                  onCellClick={handlers.handleCellClick}
                  onCellChange={handlers.handleCellChange}
                  onCellBlur={handlers.handleCellBlur}
                  onKeyDown={handlers.handleKeyDown}
                  onExpand={handlers.handleExpand}
                  onToggleLock={handlers.handleToggleLock}
                  onDelete={handlers.handleDeleteRow}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-max">
            <LoggerTableHeader 
              columns={COLUMNS}
              isAdmin={isAdmin}
            />
            <tbody>
              {logs.map(row => (
                <LoggerRow
                  key={row.id}
                  row={row}
                  columns={COLUMNS}
                  isAdmin={isAdmin}
                  currentUser={currentUser}
                  editingCell={tableState.editingCell}
                  editingValue={tableState.editingValue}
                  expandedCell={tableState.expandedCell}
                  onCellClick={handlers.handleCellClick}
                  onCellChange={handlers.handleCellChange}
                  onCellBlur={handlers.handleCellBlur}
                  onKeyDown={handlers.handleKeyDown}
                  onExpand={handlers.handleExpand}
                  onToggleLock={handlers.handleToggleLock}
                  onDelete={handlers.handleDeleteRow}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <TablePagination
        currentPage={tableState.currentPage}
        totalPages={tableState.totalPages}
        rowsPerPage={tableState.rowsPerPage}
        totalRows={tableState.totalRows}
        onPageChange={handlers.handlePageChange}
        onRowsPerPageChange={handlers.handleRowsPerPageChange}
      />
    </div>
  );
};

export default LoggerCardView;