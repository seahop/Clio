// frontend/src/components/LogRowCard.jsx
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Lock, Unlock, Trash2, Eye, EyeOff, FileText, Tag as TagIcon } from 'lucide-react';
import CardHeader from './LogCard/CardHeader';
import CardContent from './LogCard/CardContent';
import EvidenceTab from './EvidenceTab';
import TagDisplay from './Tags/TagDisplay';
import TagInput from './Tags/TagInput';
import { useCardNavigation } from '../hooks/useCardNavigation';
import { useTagsApi } from '../hooks/useTagsApi';

const LogRowCard = ({
  row,
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
  csrfToken,
  visibleFields = {},
  availableTags = [],
  onTagsUpdate
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [showEvidenceTab, setShowEvidenceTab] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tags, setTags] = useState([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  
  // Use tags API hook
  const { fetchLogTags, addTagsToLog, removeTagFromLog } = useTagsApi();
  
  // Row is only editable if it's not locked
  const canEdit = !row.locked;

  // Make sure expanded/collapsed state doesn't interfere with clicking cells
  const [isClickingCell, setIsClickingCell] = useState(false);
  
  // Use the navigation hook
  const { moveToNextCell } = useCardNavigation({
    row,
    onCellBlur,
    onCellClick,
    onCellChange
  });

  // Load tags when component mounts or row changes
  useEffect(() => {
    loadTags();
  }, [row.id]);

  const loadTags = async () => {
    try {
      setIsLoadingTags(true);
      const logTags = await fetchLogTags(row.id);
      setTags(logTags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setIsLoadingTags(false);
    }
  };

  // Helper to check if a field should be editable
  const isFieldEditable = (field) => {
    return canEdit && field !== 'analyst';
  };

  // Toggle card expansion
  const toggleExpansion = () => {
    if (!isClickingCell) {
      setIsExpanded(!isExpanded);
    }
    setIsClickingCell(false);
  };

  // Toggle evidence panel
  const toggleEvidencePanel = (e) => {
    e.stopPropagation();
    setIsClickingCell(true);
    setShowEvidenceTab(!showEvidenceTab);
  };

  // Handle lock toggle
  const handleToggleLock = (e) => {
    e.stopPropagation();
    setIsClickingCell(true);
    onToggleLock(row.id);
  };

  // Handle delete
  const handleDelete = (e) => {
    e.stopPropagation();
    setIsClickingCell(true);
    if (window.confirm('Are you sure you want to delete this row? This action cannot be undone.')) {
      onDelete(row.id);
    }
  };

  // Handle cell click
  const handleCellClick = (field) => (e) => {
    if (isFieldEditable(field)) {
      e.stopPropagation(); // Stop event from bubbling up to the parent
      setIsClickingCell(true);
      onCellClick(row.id, field);
    }
  };

  // Handle key events for navigation
  const handleCellKeyDown = (field) => (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      // Whether Shift+Tab or regular Tab, always save the value
      // Only difference is which direction we move (controlled by e.shiftKey)
      moveToNextCell(row.id, field, editingValue, e.shiftKey, false);
    } else if (e.key === 'Enter') {
      // For textarea fields, shift+enter adds a new line
      if (e.shiftKey && (field === 'notes' || field === 'command' || field === 'secrets' || field === 'hash_value')) {
        e.preventDefault();
        onCellChange({ target: { value: editingValue + '\n' } });
      }
      // For dropdowns, we'll handle it in the dropdown's onKeyDown
      else if (field === 'status' || field === 'hash_algorithm') {
        // Just prevent default, actual handling is in the dropdown
        e.preventDefault();
      }
      // For other fields, Enter key should save and exit edit mode
      else {
        e.preventDefault();
        onCellBlur({ target: { value: editingValue } }, parseInt(row.id), field);
      }
    } else {
      // Pass through any other key events
      onKeyDown && onKeyDown(e, row.id, field);
    }
  };

  // Toggle show/hide secrets
  const toggleShowSecrets = () => {
    setShowSecrets(!showSecrets);
  };

  // Handle tag click
  const handleTagClick = (tag) => {
    // Could implement tag-based filtering here
    console.log('Tag clicked:', tag);
    // You could emit an event to filter by this tag
    if (window.onTagFilter) {
      window.onTagFilter(tag);
    }
  };

  // Handle adding tags
  const handleAddTags = async (selectedTags) => {
    try {
      // Separate new tags from existing ones
      const newTags = selectedTags.filter(t => t.isNew);
      const existingTags = selectedTags.filter(t => !t.isNew);
      
      // Prepare tag data
      const tagNames = newTags.map(t => t.name);
      const tagIds = existingTags.map(t => t.id);
      
      // Add tags to log (this will create new tags if needed and add all to the log)
      const updatedTags = await addTagsToLog(row.id, tagIds, tagNames);
      setTags(updatedTags);
      
      // Notify parent component to refresh available tags if new tags were created
      if (newTags.length > 0 && window.refreshAvailableTags) {
        window.refreshAvailableTags();
      }
      
      // Notify parent component about tag updates
      if (onTagsUpdate) {
        onTagsUpdate(row.id, updatedTags);
      }
      
      setShowTagInput(false);
    } catch (error) {
      console.error('Failed to add tags:', error);
    }
  };

  // Handle removing a tag
  const handleRemoveTag = async (tagId) => {
    try {
      await removeTagFromLog(row.id, tagId);
      const updatedTags = tags.filter(t => t.id !== tagId);
      setTags(updatedTags);
      
      // Notify parent component
      if (onTagsUpdate) {
        onTagsUpdate(row.id, updatedTags);
      }
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  };

  return (
    <div className={`mb-2 rounded-lg transition-colors ${row.locked ? 'bg-gray-900' : 'bg-gray-800'}`}>
      {/* Card Header - Always visible */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-700 transition-colors"
        onClick={toggleExpansion}>
        <CardHeader 
          row={row}
          isExpanded={isExpanded}
          onToggleLock={handleToggleLock}
          onToggleEvidence={toggleEvidencePanel}
          showEvidenceTab={showEvidenceTab}
          visibleFields={visibleFields}
        />

        {/* Delete button (admin only) */}
        {isAdmin && (
          <button
            onClick={handleDelete}
            className="flex-shrink-0 p-1 hover:bg-gray-600 rounded text-red-400 transition-colors"
            title="Delete Row"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      
      {/* Tags Section - Always visible */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2">
          <TagIcon size={14} className="text-gray-500" />
          <TagDisplay
            tags={tags}
            onTagClick={handleTagClick}
            onRemove={handleRemoveTag}
            onAddTag={() => setShowTagInput(true)}
            canEdit={canEdit}
            maxVisible={isExpanded ? 20 : 5}
            size="sm"
          />
        </div>
        
        {/* Tag Input Modal */}
        {showTagInput && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="max-w-2xl w-full">
              <TagInput
                existingTags={availableTags}
                selectedTags={tags}
                onAddTags={handleAddTags}
                onClose={() => setShowTagInput(false)}
                allowCreate={true}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Expanded Card Content */}
      {isExpanded && (
        <CardContent 
          row={row}
          isAdmin={isAdmin}
          canEdit={canEdit}
          editingCell={editingCell}
          editingValue={editingValue}
          isFieldEditable={isFieldEditable}
          onCellClick={handleCellClick}
          onCellChange={onCellChange}
          onCellBlur={onCellBlur}
          onCellKeyDown={handleCellKeyDown}
          showSecrets={showSecrets}
          onToggleSecrets={toggleShowSecrets}
          moveToNextCell={moveToNextCell}
        />
      )}

      {/* Evidence Tab */}
      {isExpanded && showEvidenceTab && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <EvidenceTab 
            logId={row.id}
            csrfToken={csrfToken}
            isAdmin={isAdmin}
            currentUser={currentUser}
          />
        </div>
      )}
    </div>
  );
};

export default LogRowCard;