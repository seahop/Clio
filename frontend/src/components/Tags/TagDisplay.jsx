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
  size = 'sm'
}) => {
  const [showAll, setShowAll] = useState(false);
  
  // Sort tags by category for better organization
  const sortedTags = [...tags].sort((a, b) => {
    // Priority order for categories
    const categoryOrder = {
      'priority': 0,
      'status': 1,
      'technique': 2,
      'tool': 3,
      'target': 4,
      'workflow': 5,
      'evidence': 6,
      'security': 7,
      'operation': 8,
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
      {visibleTags.map(tag => (
        <Tag
          key={tag.id}
          tag={tag}
          onClick={onTagClick}
          onRemove={canEdit ? onRemove : null}
          size={size}
          showRemove={canEdit}
        />
      ))}
      
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