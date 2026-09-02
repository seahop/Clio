// frontend/src/components/LoggerCardView.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Filter, FileText, Check, CheckSquare, Square } from 'lucide-react';
import LogRowCard from './LogRowCard';
import Pagination from './Pagination';
import DateRangeFilter from './DateRangeFilter';
import SearchFilter from './SearchFilter';
import TemplateManager from './templates';
import CardFieldSettings from './CardFieldSettings';
import SavedViews from './SavedViews';
import BulkActionBar from './BulkActionBar';
import { TagFilter } from './Tags';
import { useTagsApi } from '../hooks/useTagsApi';
import { COLUMNS } from '../utils/constants';
import usePagination from '../hooks/usePagination';
import useCardFields from '../hooks/useCardFields';
import { createFilterFunction } from '../utils/queryParser';
import { EmptyState } from './common/ui';

const savedViewsKey = (user) => `clio:savedViews:${user || 'anon'}`;
const loadSavedViews = (user) => {
  try { return JSON.parse(localStorage.getItem(savedViewsKey(user))) || []; }
  catch { return []; }
};

const LoggerCardView = ({
  logs,
  isAdmin,
  currentUser,
  tableState,
  handlers,
  csrfToken
}) => {
  const [filteredLogs, setFilteredLogs] = useState(logs);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [searchFilter, setSearchFilter] = useState({ mode: 'simple', query: '', field: 'all' });
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  
  // Tags state
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [logTags, setLogTags] = useState({});
  const [showTagFilter, setShowTagFilter] = useState(false);
  
  // Use tags API hook
const { fetchAllTags, fetchTagsForLogs } = useTagsApi(csrfToken);
  
  // State for template operations
  const [selectedCardForSave, setSelectedCardForSave] = useState(null);
  const [selectedCardsForMerge, setSelectedCardsForMerge] = useState([]);
  const [templateMode, setTemplateMode] = useState(null);

  // Bulk selection + saved views
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState(new Set());
  const [operations, setOperations] = useState([]);
  const [savedViews, setSavedViews] = useState(() => loadSavedViews(currentUser));

  useEffect(() => { setSavedViews(loadSavedViews(currentUser)); }, [currentUser]);

  const persistViews = (next) => {
    setSavedViews(next);
    try { localStorage.setItem(savedViewsKey(currentUser), JSON.stringify(next)); } catch (_) {}
  };
  const handleSaveView = (name) => {
    const next = [...savedViews.filter(v => v.name !== name), { name, searchFilter, dateRange, selectedTags }];
    persistViews(next);
  };
  const handleApplyView = (v) => {
    setSearchFilter(v.searchFilter || { mode: 'simple', query: '', field: 'all' });
    setDateRange(v.dateRange || { start: null, end: null });
    setSelectedTags(v.selectedTags || []);
  };
  const handleDeleteView = (name) => persistViews(savedViews.filter(v => v.name !== name));

  // Admins can bulk-assign operations; load the list once for the bulk bar.
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/operations/my-operations', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOperations((d.operations || []).filter(o => o.is_active !== false)); })
      .catch(() => {});
  }, [isAdmin]);

  const toggleBulk = (id) => setSelectedForBulk(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const clearBulk = () => setSelectedForBulk(new Set());
  const exitBulk = () => { setBulkMode(false); clearBulk(); };

  const bulkRequest = async (path, body) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return res.ok;
  };
  const bulkIds = () => [...selectedForBulk];
  const handleBulkStatus = async (status) => {
    if (await bulkRequest('/api/logs/bulk-status', { logIds: bulkIds(), status })) exitBulk();
  };
  const handleBulkAssignOp = async (operationId) => {
    if (await bulkRequest('/api/logs/bulk-operation-tag', { logIds: bulkIds(), operationId })) exitBulk();
  };
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedForBulk.size} selected log(s)? This cannot be undone.`)) return;
    if (await bulkRequest('/api/logs/bulk-delete', { ids: bulkIds() })) exitBulk();
  };

  // Use our custom hook for card field visibility settings
  const { visibleFields, updateVisibleFields } = useCardFields(currentUser);
  
  // Track last loaded IDs to prevent duplicate requests
  const lastLoadedIdsRef = useRef('');
  
  // Load available tags on mount
  useEffect(() => {
    if (currentUser) {
      loadTags();
    }
  }, [currentUser]);
  
  // Load all available tags
  const loadTags = async () => {
    // Only load if user is authenticated
    if (!currentUser) return;
    
    try {
      const tags = await fetchAllTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };
  
  // Make refresh function available globally for child components
  useEffect(() => {
    window.refreshAvailableTags = loadTags;
    return () => {
      delete window.refreshAvailableTags;
    };
  }, []);
  
  // Load tags for specific logs
  const loadLogTags = async (logIds) => {
    // Only load if user is authenticated
    if (!currentUser || logIds.length === 0) return;
    
    try {
      const tagsData = await fetchTagsForLogs(logIds);
      setLogTags(tagsData);
    } catch (error) {
      console.error('Failed to load log tags:', error);
    }
  };
  
  // Apply filters whenever logs, dateRange, searchFilter, or selectedTags changes
  useEffect(() => {
    // Create a filter function based on all filter criteria
    const filterFunction = createFilterFunction({
      dateRange,
      searchFilter
    });
    
    // Apply the filter function to the logs
    let filtered = logs.filter(filterFunction);
    
    // Apply tag filter if tags are selected
    if (selectedTags.length > 0) {
      const selectedTagIds = selectedTags.map(t => t.id);
      filtered = filtered.filter(log => {
        const logTagIds = (logTags[log.id] || []).map(t => t.id);
        return selectedTagIds.some(tagId => logTagIds.includes(tagId));
      });
    }
    
    // Determine if any filters are active
    const filtersActive = 
      (dateRange.start || dateRange.end) || 
      (searchFilter.query && searchFilter.query.trim() !== '') ||
      selectedTags.length > 0;
    
    setHasActiveFilters(filtersActive);
    setFilteredLogs(filtered);
  }, [logs, dateRange, searchFilter, selectedTags, logTags]);
  
  // Use our custom pagination hook
  const pagination = usePagination(filteredLogs, { username: currentUser });
  
  // Load tags for current page of logs with debouncing
  useEffect(() => {
    // Only load tags if we have logs and user is authenticated
    if (!currentUser || pagination.paginatedItems.length === 0) return;
    
    // Debounce the API call to prevent spam
    const timeoutId = setTimeout(() => {
      const logIds = pagination.paginatedItems.map(log => log.id);
      // Only load if we have IDs and they've changed
      const idsKey = logIds.sort().join(',');
      if (idsKey !== lastLoadedIdsRef.current) {
        lastLoadedIdsRef.current = idsKey;
        loadLogTags(logIds);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [pagination.paginatedItems, currentUser]);
  
  // Handle date range filter changes
  const handleDateFilterChange = (range) => {
    setDateRange(range);
  };
  
  // Handle search filter changes
  const handleSearchFilterChange = (filter) => {
    setSearchFilter(filter);
  };
  
  // Handle tag selection in filter
  const handleTagToggle = (tag) => {
    setSelectedTags(prev => {
      const exists = prev.some(t => t.id === tag.id);
      if (exists) {
        return prev.filter(t => t.id !== tag.id);
      } else {
        return [...prev, tag];
      }
    });
  };
  
  // Handle tags update for a specific log
  const handleLogTagsUpdate = (logId, updatedTags) => {
    setLogTags(prev => ({
      ...prev,
      [logId]: updatedTags
    }));
    
    // Check if there are new tags that aren't in our available tags list
    const hasNewTags = updatedTags.some(tag => 
      !availableTags.find(existing => existing.id === tag.id)
    );
    
    // If we detected new tags, refresh the available tags list
    if (hasNewTags) {
      loadTags();
    }
  };
  
  // Clear all filters
  const clearAllFilters = () => {
    setDateRange({ start: null, end: null });
    setSearchFilter({ mode: 'simple', query: '', field: 'all' });
    setSelectedTags([]);
  };
  
  // Handle selecting a card for saving as template
  const handleSelectCardForSave = (rowId, event) => {
    event.stopPropagation();
    
    // Clear any merge selections
    setSelectedCardsForMerge([]);
    
    // Toggle selection for save
    if (selectedCardForSave === rowId) {
      setSelectedCardForSave(null);
      setTemplateMode(null);
    } else {
      setSelectedCardForSave(rowId);
      setTemplateMode('save');
    }
    
    // Make sure templates are visible
    if (!showTemplates) {
      setShowTemplates(true);
    }
  };
  
  // Handle selecting multiple cards for merging with template
  const handleSelectCardForMerge = (rowId, event) => {
    event.stopPropagation();
    
    // Clear any save selection
    setSelectedCardForSave(null);
    
    // Update merge selections (toggle logic)
    setSelectedCardsForMerge(prevSelected => {
      const isCurrentlySelected = prevSelected.includes(rowId);
      
      if (isCurrentlySelected) {
        // Remove if already selected
        const updatedSelection = prevSelected.filter(id => id !== rowId);
        
        // If no items are left selected, reset template mode
        if (updatedSelection.length === 0) {
          setTemplateMode(null);
        }
        
        return updatedSelection;
      } else {
        // Add to selection
        setTemplateMode('merge');
        return [...prevSelected, rowId];
      }
    });
    
    // Make sure templates are visible
    if (!showTemplates) {
      setShowTemplates(true);
    }
  };
  
  // Clear all selected cards
  const clearSelectedCards = () => {
    setSelectedCardForSave(null);
    setSelectedCardsForMerge([]);
    setTemplateMode(null);
  };
  
  // Template action handler for multi-select
  const handleTemplateAction = (templateData, specificCardId = null) => {
    if (specificCardId) {
      console.log(`Updating specific card ${specificCardId} with template data:`, templateData);
      handlers.handleUpdateRowWithTemplate(specificCardId, templateData);
    } else if (selectedCardsForMerge.length > 0 && !specificCardId) {
      console.log(`Processing ${selectedCardsForMerge.length} cards with template data:`, templateData);
      
      // Process each selected card
      selectedCardsForMerge.forEach(cardId => {
        const cardData = logs.find(log => log.id === cardId);
        if (!cardData) return;
        
        // Create card-specific update data
        const cardUpdateData = {};
        
        // Only add fields to update that are empty in this specific card
        Object.keys(templateData).forEach(field => {
          if (!cardData[field]) {
            cardUpdateData[field] = templateData[field];
          }
        });
        
        // Only update if there are fields to update
        if (Object.keys(cardUpdateData).length > 0) {
          handlers.handleUpdateRowWithTemplate(cardId, cardUpdateData);
        }
      });
      
      // Clear selection after action
      setSelectedCardsForMerge([]);
      setTemplateMode(null);
    } else if (selectedCardForSave) {
      console.log('Card is selected for saving as template, not for merging');
    } else {
      // No card selected, create a new one from template
      console.log('Creating new card from template:', templateData);
      handlers.handleAddRowWithTemplate(templateData);
    }
  };
  
  // Get the current card for save mode
  const getCurrentCard = () => {
    if (templateMode === 'save' && selectedCardForSave) {
      return logs.find(log => log.id === selectedCardForSave);
    }
    return null;
  };
  
  // Get selected cards for merge mode
  const getSelectedCards = () => {
    if (templateMode === 'merge' && selectedCardsForMerge.length > 0) {
      return selectedCardsForMerge.map(cardId => 
        logs.find(log => log.id === cardId)
      ).filter(Boolean);
    }
    return [];
  };
  
  // Handle card field visibility changes
  const handleCardFieldsChange = (newFieldSettings) => {
    console.log('Card field settings changed:', newFieldSettings);
    updateVisibleFields(newFieldSettings);
  };
  
  return (
    <div className="bg-surface border border-line shadow-card rounded-card w-full">
      {/* Toolbar: search is the hero; "find" controls and "tools" are grouped below */}
      <div className="p-4 border-b border-line space-y-3">
        {/* Row 1 — search + primary action */}
        <div className="flex items-start gap-3">
          <div className="flex-grow min-w-0">
            <SearchFilter onFilterChange={handleSearchFilterChange} />
          </div>
          <button
            onClick={handlers.handleAddRow}
            className="flex-shrink-0 px-3 py-2 bg-accent text-accent-fg rounded-md flex items-center gap-2 hover:bg-accent-hover transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Row</span>
          </button>
        </div>

        {/* Row 2 — left: find controls (date, saved views) · right: tools */}
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter onFilterChange={handleDateFilterChange} />
            <SavedViews
              views={savedViews}
              onSave={handleSaveView}
              onApply={handleApplyView}
              onDelete={handleDeleteView}
              canSave={hasActiveFilters}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { if (showTemplates) clearSelectedCards(); setShowTemplates(!showTemplates); }}
              className={`px-3 py-1.5 rounded-md flex items-center gap-2 border text-sm transition-colors ${
                showTemplates ? 'bg-success/20 border-success/40 text-success' : 'bg-surface-2 border-line text-content hover:bg-surface-3'
              }`}
              title="Save cards as reusable templates"
            >
              <FileText size={16} />
              <span className="hidden sm:inline">Templates</span>
            </button>
            <button
              onClick={() => (bulkMode ? exitBulk() : setBulkMode(true))}
              className={`px-3 py-1.5 rounded-md flex items-center gap-2 border text-sm transition-colors ${
                bulkMode ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-surface-2 border-line text-content hover:bg-surface-3'
              }`}
              title="Select multiple logs for bulk actions"
            >
              <CheckSquare size={16} />
              <span className="hidden sm:inline">Select</span>
            </button>
            <CardFieldSettings
              currentUser={currentUser}
              onSettingsChange={handleCardFieldsChange}
            />
          </div>
        </div>

        {/* Row 3 — tag filter */}
        <TagFilter
          availableTags={availableTags}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
          onClearAll={() => setSelectedTags([])}
          showStats={true}
        />

        {/* Active-filter summary */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-3 border-t border-line">
            <div className="text-muted text-sm flex items-center gap-2">
              <Filter size={16} className="text-accent" />
              <span>
                Showing {filteredLogs.length} of {logs.length} logs
                {selectedTags.length > 0 && (
                  <span className="ml-2 text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
                    {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} applied
                  </span>
                )}
              </span>
            </div>
            <button
              onClick={clearAllFilters}
              className="px-3 py-1 bg-surface-2 text-muted rounded-md text-sm hover:bg-surface-3 transition-colors duration-200"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Templates panel — appears under the toolbar when toggled on */}
      {showTemplates && (
        <TemplateManager
          currentCard={getCurrentCard()}
          selectedCards={getSelectedCards()}
          templateMode={templateMode}
          onApplyTemplate={handleTemplateAction}
          csrfToken={csrfToken}
        />
      )}

      {/* Content area */}
      <div className="p-4">
        {bulkMode && selectedForBulk.size > 0 && (
          <BulkActionBar
            count={selectedForBulk.size}
            isAdmin={isAdmin}
            operations={operations}
            onSetStatus={handleBulkStatus}
            onAssignOp={handleBulkAssignOp}
            onDelete={handleBulkDelete}
            onClear={exitBulk}
          />
        )}
        {filteredLogs.length === 0 ? (
          logs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No logs yet"
              message='Click "Add Row" to create your first log entry for this operation.'
              action={{ label: 'Add Row', icon: Plus, onClick: handlers.handleAddRow }}
            />
          ) : (
            <EmptyState
              icon={Filter}
              title="No logs match your filters"
              message="Try widening your search, date range, or tag selection."
              action={{ label: 'Clear all filters', onClick: clearAllFilters }}
            />
          )
        ) : (
          <div className="space-y-2 mb-4">
            {pagination.paginatedItems.map(row => (
              <div
                key={row.id}
                className={`relative rounded-card ${
                  bulkMode && selectedForBulk.has(row.id) ?
                    'ring-2 ring-accent' :
                  selectedCardForSave === row.id ?
                    'ring-2 ring-accent' :
                    selectedCardsForMerge.includes(row.id) ?
                    'ring-2 ring-success' :
                    ''
                }`}
              >
                {bulkMode && (
                  <button
                    onClick={() => toggleBulk(row.id)}
                    className="absolute -left-2 top-2 z-10 p-1 rounded-md bg-surface-2 border border-line text-muted hover:text-content shadow-card"
                    title="Select for bulk action"
                  >
                    {selectedForBulk.has(row.id)
                      ? <CheckSquare size={16} className="text-accent" />
                      : <Square size={16} />}
                  </button>
                )}
                {showTemplates && !bulkMode && (
                  <div className="absolute -left-2 top-2 z-10 flex flex-col gap-.5">
                    {/* Template Save Button */}
                    <button
                      onClick={(e) => handleSelectCardForSave(row.id, e)}
                      className={`p-1.5 rounded-full border border-gray-600 transition-colors duration-200 ${
                        selectedCardForSave === row.id 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      title="Select to save as template"
                    >
                      <SaveIcon size={14} />
                    </button>
                    
                    {/* Template Merge Button */}
                    <button
                      onClick={(e) => handleSelectCardForMerge(row.id, e)}
                      className={`p-1.5 rounded-full border border-gray-600 transition-colors duration-200 ${
                        selectedCardsForMerge.includes(row.id) 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      title="Select to merge with template"
                    >
                      <MergeIcon size={14} />
                    </button>
                  </div>
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
                  visibleFields={visibleFields}
                  availableTags={availableTags}
                  tags={logTags[row.id] || []}
                  onTagsUpdate={handleLogTagsUpdate}
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

// Merge icon
const MergeIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 7l4-4 4 4"></path>
    <path d="M12 3v8"></path>
    <path d="M8 17l4 4 4-4"></path>
    <path d="M12 21v-8"></path>
    <path d="M3 12h18"></path>
  </svg>
);

export default LoggerCardView;