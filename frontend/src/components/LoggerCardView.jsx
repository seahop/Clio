// frontend/src/components/LoggerCardView.jsx
import React, { useState, useEffect } from 'react';
import { Layout, Table, List, Plus, Filter, AlertCircle } from 'lucide-react';
import LogRowCard from './LogRowCard';
import TablePagination from './LoggerTable/TablePagination';
import LoggerTableHeader from './LoggerTable/LoggerTableHeader';
import LoggerRow from './LoggerTable/LoggerRow';
import DateRangeFilter from './DateRangeFilter';
import SearchFilter from './SearchFilter';
import { COLUMNS } from '../utils/constants';

const LoggerCardView = ({
  logs,
  isAdmin,
  currentUser,
  tableState,
  handlers,
  csrfToken
}) => {
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'
  const [filteredLogs, setFilteredLogs] = useState(logs);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [searchFilter, setSearchFilter] = useState({ query: '', field: 'all' });
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  
  // Apply filters whenever logs, dateRange, or searchFilter changes
  useEffect(() => {
    // Start with all logs
    let filtered = [...logs];
    let filtersActive = false;
    
    // Apply date filter if active
    if (dateRange.start || dateRange.end) {
      filtersActive = true;
      filtered = filtered.filter(log => {
        const logDate = new Date(log.timestamp);
        
        // Check if log date is within range
        if (dateRange.start && logDate < dateRange.start) {
          return false;
        }
        
        if (dateRange.end && logDate > dateRange.end) {
          return false;
        }
        
        return true;
      });
    }
    
    // Apply search filter if active
    if (searchFilter.query) {
      filtersActive = true;
      const query = searchFilter.query.toLowerCase();
      
      filtered = filtered.filter(log => {
        // If searching all fields
        if (searchFilter.field === 'all') {
          // Check all searchable text fields
          return [
            'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
            'username', 'command', 'notes', 'filename', 'status', 'analyst'
          ].some(field => {
            const value = log[field];
            return value && String(value).toLowerCase().includes(query);
          });
        }
        
        // Searching specific field
        const value = log[searchFilter.field];
        return value && String(value).toLowerCase().includes(query);
      });
    }
    
    setHasActiveFilters(filtersActive);
    setFilteredLogs(filtered);
  }, [logs, dateRange, searchFilter]);
  
  // Handle date range filter changes
  const handleDateFilterChange = (range) => {
    setDateRange(range);
  };
  
  // Handle search filter changes
  const handleSearchFilterChange = (filter) => {
    setSearchFilter(filter);
  };
  
  // Clear all filters
  const clearAllFilters = () => {
    setDateRange({ start: null, end: null });
    setSearchFilter({ query: '', field: 'all' });
  };
  
  return (
    <div className="bg-gray-800 shadow-lg rounded-lg w-full">
      {/* Header with view toggle buttons */}
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
      
      {/* Filter section */}
      <div className="p-4 border-b border-gray-700 bg-gray-900/30">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Date filter - moved to the left */}
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          
          {/* Search filter */}
          <div className="flex-grow">
            <SearchFilter onFilterChange={handleSearchFilterChange} />
          </div>
        </div>
        
        {/* Filter status and clear all button */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
            <div className="text-gray-300 text-sm flex items-center gap-2">
              <Filter size={16} className="text-blue-400" />
              <span>
                Showing {filteredLogs.length} of {logs.length} logs
              </span>
            </div>
            
            <button
              onClick={clearAllFilters}
              className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm hover:bg-gray-600 transition-colors duration-200"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
      
      {/* Content area */}
      {viewMode === 'card' ? (
        <div className="p-4">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {logs.length === 0 ? (
                <p>No logs found. Click "Add Row" to create your first log entry.</p>
              ) : (
                <div>
                  <AlertCircle className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
                  <p>No logs match your current filters.</p>
                  <button
                    onClick={clearAllFilters}
                    className="mt-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {filteredLogs.map(row => (
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
                  csrfToken={csrfToken}
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
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="text-center py-8 text-gray-400">
                    {logs.length === 0 ? (
                      <p>No logs found. Click "Add Row" to create your first log entry.</p>
                    ) : (
                      <div>
                        <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                        <p>No logs match your current filters.</p>
                        <button
                          onClick={clearAllFilters}
                          className="mt-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                        >
                          Clear Filters
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLogs.map(row => (
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
                    csrfToken={csrfToken}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Pagination */}
      <TablePagination
        currentPage={tableState.currentPage}
        totalPages={tableState.totalPages}
        rowsPerPage={tableState.rowsPerPage}
        totalRows={filteredLogs.length}
        onPageChange={handlers.handlePageChange}
        onRowsPerPageChange={handlers.handleRowsPerPageChange}
      />
    </div>
  );
};

export default LoggerCardView;