// frontend/src/components/LogRowCard.jsx
import React, { useState, useEffect } from 'react';
import { Trash2, Tag } from 'lucide-react';
import CardHeader from './LogCard/CardHeader';
import CardContent from './LogCard/CardContent';
import EvidenceTab from './EvidenceTab';
import TagDisplay from './Tags/TagDisplay';
import TagInput from './Tags/TagInput';
import MitreTechniquePicker from './MitreTechniquePicker';
import { useCardNavigation } from '../hooks/useCardNavigation';
import { useTagsApi } from '../hooks/useTagsApi';
import { getStatusAccentClass } from './LogCard/cardUtils';
import { parseTechniques, serializeTechniques } from '../utils/mitreData';

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
  tags = [],
  onTagsUpdate
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [showEvidenceTab, setShowEvidenceTab] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);

  // Tag state lives in the parent (LoggerCardView) which batch-fetches tags
  // for the visible page — this component only mutates and notifies.
  const { addTagsToLog, removeTagFromLog } = useTagsApi(csrfToken);

  // Row is only editable if it's not locked
  const canEdit = !row.locked;

  // Make sure expanded/collapsed state doesn't interfere with clicking cells
  const [isClickingCell, setIsClickingCell] = useState(false);

  // ATT&CK techniques for this log (seeded from the row; re-synced when the
  // parent refreshes the row, e.g. via SSE).
  const [techniques, setTechniques] = useState(parseTechniques(row.mitre_techniques));
  useEffect(() => { setTechniques(parseTechniques(row.mitre_techniques)); }, [row.mitre_techniques]);

  const handleTechniquesChange = async (next) => {
    setTechniques(next); // optimistic
    try {
      await fetch(`/api/logs/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        credentials: 'include',
        body: JSON.stringify({ mitre_techniques: serializeTechniques(next) }),
      });
      // The PUT publishes an SSE event → the list re-fetches and re-seeds us.
    } catch (err) {
      console.error('Failed to update ATT&CK techniques:', err);
    }
  };

  // Use the navigation hook
  const { moveToNextCell } = useCardNavigation({
    row,
    onCellBlur,
    onCellClick,
    onCellChange
  });

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
    if (!isExpanded) {
      setIsExpanded(true);
    }
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

      // Notify parent component to refresh available tags if new tags were created
      if (newTags.length > 0 && window.refreshAvailableTags) {
        window.refreshAvailableTags();
      }

      // Parent owns tag state — it flows back down as the `tags` prop
      if (onTagsUpdate) {
        onTagsUpdate(row.id, updatedTags);
      }

      setShowTagInput(false);
    } catch (error) {
      console.error('Failed to add tags:', error);
    }
  };

  // Handle removing a tag - SMART PROTECTION for native operation tags only
  const handleRemoveTag = async (tagId) => {
    try {
      // Attempt to remove the tag - let the backend decide if it's allowed
      await removeTagFromLog(row.id, tagId);

      const updatedTags = tags.filter(t => t.id !== tagId);
      if (onTagsUpdate) {
        onTagsUpdate(row.id, updatedTags);
      }
    } catch (error) {
      console.error('Failed to remove tag:', error);

      // Check the actual error to determine what happened
      if (error.message?.includes('native operation tag')) {
        alert('This is the primary operation tag for this log and cannot be removed. You can remove other operation tags that were manually added.');
      } else if (error.response?.status === 403) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || 'This tag cannot be removed as it is protected.';
        alert(errorMsg);
      } else {
        alert('Failed to remove tag. Please try again.');
      }
    }
  };

  return (
    <div
      className={`mb-2 rounded-card border border-l-[3px] overflow-hidden transition-colors ${
        getStatusAccentClass(row.status)
      } ${
        row.locked
          ? 'bg-canvas/80 border-line'
          : 'bg-surface border-line hover:border-line-strong'
      }`}
    >
      {/* Card Header - Always visible */}
      <div
        className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-surface-3/60 transition-colors"
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
            className="flex-shrink-0 p-1 hover:bg-surface-3 rounded text-faint hover:text-danger transition-colors"
            title="Delete Row"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Tags Section - shown when the row has tags or can accept them */}
      {(tags.length > 0 || canEdit) && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <Tag size={13} className="text-gray-600 flex-shrink-0" />
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
      )}

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

      {/* ATT&CK techniques */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="text-2xs uppercase tracking-wider text-faint mb-2">ATT&amp;CK Techniques</div>
          <MitreTechniquePicker
            techniques={techniques}
            onChange={handleTechniquesChange}
            canEdit={canEdit}
          />
        </div>
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
