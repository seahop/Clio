// frontend/src/components/Tags/TagDisplay.jsx
import React, { useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import Tag from './Tag';

const TagDisplay = ({ 
  tags = [], 
  onTagClick, 
  onRemove, 
  onAddTag,
  canEdit = false,
  maxVisible = 5,
  size = 'sm',
  logAnalyst = null  // Pass the log's analyst to determine native operation
}) => {
  const [showAll, setShowAll] = useState(false);
  
  // Helper function to check if a tag is likely the native operation tag
  // This is a heuristic - the backend has the authoritative check
  const isLikelyNativeOperationTag = (tag) => {
    // If it's not an operation tag, it's definitely not native
    if (tag.category !== 'operation' || !tag.name?.startsWith('OP:')) {
      return false;
    }
    
    // If we know who created the log and who tagged it, we can make a guess
    // Native tags are usually tagged by the same person who created the log
    if (logAnalyst && tag.tagged_by === logAnalyst) {
      // Also check if it was one of the first tags added (lower index = earlier)
      const opTags = tags.filter(t => t.category === 'operation' && t.name?.startsWith('OP:'));
      if (opTags.length > 0 && opTags[0].id === tag.id) {
        return true; // Likely the native tag
      }
    }
    
    // When in doubt, let the backend decide
    return false;
  };
  
  // Sort tags by category for better organization
  const sortedTags = [...tags].sort((a, b) => {
    // Priority order for categories
    const categoryOrder = {
      'operation': 0,  // Operation tags first
      'priority': 1,
      'status': 2,
      'technique': 3,
      'tool': 4,
      'target': 5,
      'workflow': 6,
      'evidence': 7,
      'security': 8,
      'custom': 9
    };
    
    const orderA = categoryOrder[a.category] ?? 10;
    const orderB = categoryOrder[b.category] ?? 10;
    
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
  
  const visibleTags = showAll ? sortedTags : sortedTags.slice(0, maxVisible);
  const hiddenCount = sortedTags.length - maxVisible;
  const hasHiddenTags = !showAll && hiddenCount > 0;
  
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibleTags.map(tag => {
        // For operation tags, we'll be more permissive and let the backend decide
        // Only prevent removal if we're fairly sure it's the native tag
        const isLikelyNative = isLikelyNativeOperationTag(tag);
        const canRemoveThisTag = canEdit && !isLikelyNative;
        
        return (
          <Tag
            key={tag.id}
            tag={tag}
            onClick={onTagClick}
            onRemove={canRemoveThisTag ? onRemove : null}
            size={size}
            showRemove={canRemoveThisTag}
          />
        );
      })}
      
      {/* Show more/less button */}
      {hasHiddenTags && (
        <button
          onClick={() => setShowAll(true)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          title={`Show ${hiddenCount} more tags`}
        >
          <span>+{hiddenCount} more</span>
          <ChevronDown size={12} />
        </button>
      )}
      
      {showAll && sortedTags.length > maxVisible && (
        <button
          onClick={() => setShowAll(false)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          title="Show less tags"
        >
          <span>Show less</span>
          <ChevronUp size={12} />
        </button>
      )}
      
      {/* Add tag button */}
      {canEdit && onAddTag && (
        <button
          onClick={onAddTag}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full transition-colors"
          title="Add tags"
        >
          <Plus size={12} />
          <span>Add Tag</span>
        </button>
      )}
    </div>
  );
};

export default TagDisplay;