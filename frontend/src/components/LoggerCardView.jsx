// frontend/src/components/LoggerCardView.jsx
import React, { useState, useEffect } from 'react';
import { Layout, List, Plus, Filter, AlertCircle, FileText } from 'lucide-react';
import LogRowCard from './LogRowCard';
import Pagination from './Pagination';
import DateRangeFilter from './DateRangeFilter';
import SearchFilter from './SearchFilter';
import TemplateManager from './TemplateManager'; // Import the template manager
import { COLUMNS } from '../utils/constants';
import usePagination from '../hooks/usePagination';

const LoggerCardView = ({
  logs,
  isAdmin,
  currentUser,
  tableState,
  handlers,
  csrfToken
}) => {
  const [viewMode, setViewMode] = useState('card');
  const [filteredLogs, setFilteredLogs] = useState(logs);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [searchFilter, setSearchFilter] = useState({ query: '', field: 'all' });
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false); // State for templates visibility
  const [selectedCardId, setSelectedCardId] = useState(null); // State for template selection
  
  // Find the currently selected card based on ID
  const selectedCard = selectedCardId ? logs.find(log => log.id === selectedCardId) : null;
  
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
  
  // Use our custom pagination hook
  const pagination = usePagination(filteredLogs, { username: currentUser });
  
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
  
  // Handle selecting a row for template creation
  const handleSelectCard = (rowId) => {
    setSelectedCardId(rowId === selectedCardId ? null : rowId);
  };
  
  // NEW FUNCTION: Handle template applications
  // This determines whether to update an existing card or create a new one
  const handleTemplateAction = (templateData) => {
    if (selectedCardId) {
      // If a card is selected, update the existing card with template data
      console.log('Updating existing card', selectedCardId, 'with template data:', templateData);
      handlers.handleUpdateRowWithTemplate(selectedCardId, templateData);
    } else {
      // If no card is selected, create a new card from template
      console.log('Creating new card from template:', templateData);
      handlers.handleAddRowWithTemplate(templateData);
    }
  };
  
  return (
    <div className="bg-gray-800 shadow-lg rounded-lg w-full">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('card')}
            className="px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors duration-200 bg-blue-600 text-white"
            title="Card View"
          >
            <List size={16} />
            <span className="hidden sm:inline">Card View</span>
          </button>
          
          {/* Add Templates Button */}
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors duration-200 ${
              showTemplates ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Toggle Templates"
          >
            <FileText size={16} />
            <span className="hidden sm:inline">Templates</span>
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
      
      {/* Templates Section */}
      {showTemplates && (
        <TemplateManager 
          currentCard={selectedCard}
          onApplyTemplate={handleTemplateAction}
          csrfToken={csrfToken}
        />
      )}
      
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
            {pagination.paginatedItems.map(row => (
              <div 
                key={row.id} 
                className={`relative ${selectedCardId === row.id ? 'ring-2 ring-blue-500' : ''}`}
              >
                {showTemplates && (
                  <button
                    onClick={() => handleSelectCard(row.id)}
                    className={`absolute -left-2 top-2 p-1.5 rounded-full z-10 border border-gray-600 transition-colors duration-200 ${
                      selectedCardId === row.id 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title={selectedCardId === row.id ? "Deselect card" : "Select for template"}
                  >
                    {selectedCardId === row.id ? (
                      <CheckIcon size={14} />
                    ) : (
                      <SaveIcon size={14} />
                    )}
                  </button>
                )}
                <LogRowCard
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
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Pagination */}
      <Pagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        rowsPerPage={pagination.rowsPerPage}
        totalRows={pagination.totalRows}
        onPageChange={pagination.handlePageChange}
        onRowsPerPageChange={pagination.handleRowsPerPageChange}
      />
    </div>
  );
};

// Helper icons for template selection
const SaveIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
    <polyline points="17 21 17 13 7 13 7 21"></polyline>
    <polyline points="7 3 7 8 15 8"></polyline>
  </svg>
);

const CheckIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export default LoggerCardView;