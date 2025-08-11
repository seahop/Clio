// frontend/src/components/Tags/TagInput.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Tag as TagIcon, Check } from 'lucide-react';
import Tag from './Tag';

const TagInput = ({ 
  existingTags = [], 
  selectedTags = [], 
  onAddTags, 
  onClose,
  allowCreate = true,
  placeholder = "Search or create tags...",
  maxSelection = null
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  // Initialize with both IDs and names for existing selected tags and new tags to be created
  const [selectedExistingTagIds, setSelectedExistingTagIds] = useState(new Set(selectedTags.map(t => t.id)));
  const [newTagNames, setNewTagNames] = useState(new Set()); // Track new tag names to create
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const inputRef = useRef(null);
  
  // Get unique categories from existing tags
  const categories = [...new Set(existingTags.map(tag => tag.category).filter(Boolean))].sort();
  
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  useEffect(() => {
    // Filter suggestions based on input and category
    let filtered = existingTags;
    
    // Filter by category if selected
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(tag => tag.category === selectedCategory);
    }
    
    // Filter by search term
    if (inputValue.trim()) {
      const searchTerm = inputValue.toLowerCase().trim();
      filtered = filtered.filter(tag => 
        tag.name.toLowerCase().includes(searchTerm) ||
        tag.description?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sort suggestions
    filtered.sort((a, b) => {
      // Selected tags first
      const aSelected = selectedExistingTagIds.has(a.id);
      const bSelected = selectedExistingTagIds.has(b.id);
      if (aSelected !== bSelected) return bSelected ? 1 : -1;
      
      // Then by usage count if available
      if (a.usage_count !== undefined && b.usage_count !== undefined) {
        return b.usage_count - a.usage_count;
      }
      
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
    
    setSuggestions(filtered);
    
    // Check if we should show "create new" option
    if (inputValue.trim() && allowCreate) {
      const normalizedInput = inputValue.toLowerCase().trim();
      // Check if this tag already exists or is already marked for creation
      const existsInExisting = existingTags.some(tag => tag.name.toLowerCase() === normalizedInput);
      const existsInNew = newTagNames.has(normalizedInput);
      setIsCreatingNew(!existsInExisting && !existsInNew);
    } else {
      setIsCreatingNew(false);
    }
  }, [inputValue, existingTags, selectedCategory, selectedExistingTagIds, allowCreate, newTagNames]);
  
  const handleSelectExistingTag = (tag) => {
    const newSelectedIds = new Set(selectedExistingTagIds);
    
    if (newSelectedIds.has(tag.id)) {
      newSelectedIds.delete(tag.id);
    } else {
      if (maxSelection && (newSelectedIds.size + newTagNames.size) >= maxSelection) {
        return; // Max selection reached
      }
      newSelectedIds.add(tag.id);
    }
    
    setSelectedExistingTagIds(newSelectedIds);
  };
  
  const handleCreateTag = () => {
    if (!inputValue.trim()) return;
    
    const normalizedName = inputValue.toLowerCase().trim();
    
    // Check if we've reached max selection
    if (maxSelection && (selectedExistingTagIds.size + newTagNames.size) >= maxSelection) {
      return;
    }
    
    // Add to new tags set
    setNewTagNames(prev => new Set([...prev, normalizedName]));
    
    // Clear the input
    setInputValue('');
  };
  
  const handleRemoveNewTag = (tagName) => {
    setNewTagNames(prev => {
      const newSet = new Set(prev);
      newSet.delete(tagName);
      return newSet;
    });
  };
  
  const handleApplyTags = () => {
    // Prepare the data for the parent component
    // The parent will handle creating the new tags and then adding all tags to the log
    
    // Get selected existing tags
    const selectedExistingTags = existingTags.filter(tag => selectedExistingTagIds.has(tag.id));
    
    // Create tag objects for new tags (with isNew flag)
    const newTags = Array.from(newTagNames).map(name => ({
      name,
      isNew: true
    }));
    
    // Combine all tags
    const allTags = [...selectedExistingTags, ...newTags];
    
    if (allTags.length > 0) {
      onAddTags(allTags);
    }
    
    // Reset state and close
    setInputValue('');
    setSelectedExistingTagIds(new Set());
    setNewTagNames(new Set());
    onClose?.();
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (isCreatingNew) {
        handleCreateTag();
      } else if (suggestions.length > 0 && !selectedExistingTagIds.has(suggestions[0].id)) {
        // Select first suggestion if not already selected
        handleSelectExistingTag(suggestions[0]);
      }
    } else if (e.key === 'Escape') {
      onClose?.();
    }
  };
  
  // Group suggestions by category for display
  const groupedSuggestions = suggestions.reduce((groups, tag) => {
    const category = tag.category || 'custom';
    if (!groups[category]) groups[category] = [];
    groups[category].push(tag);
    return groups;
  }, {});
  
  // Calculate total selected count
  const totalSelectedCount = selectedExistingTagIds.size + newTagNames.size;
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 shadow-xl border border-gray-700">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <TagIcon size={16} />
            Add Tags
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        
        {/* Category filter */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Filter:</span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}
        
        {/* Selected tags section */}
        {totalSelectedCount > 0 && (
          <div className="border-t border-gray-700 pt-3">
            <div className="text-xs text-gray-400 mb-2">
              Selected ({totalSelectedCount}{maxSelection ? `/${maxSelection}` : ''})
            </div>
            <div className="flex flex-wrap gap-1">
              {/* Show existing selected tags */}
              {existingTags
                .filter(tag => selectedExistingTagIds.has(tag.id))
                .map(tag => (
                  <Tag
                    key={tag.id}
                    tag={tag}
                    size="sm"
                    showRemove={true}
                    onRemove={() => handleSelectExistingTag(tag)}
                  />
                ))}
              {/* Show new tags to be created */}
              {Array.from(newTagNames).map(name => (
                <div key={name} className="flex items-center gap-1">
                  <Tag
                    tag={{ name, color: '#10B981', id: `new-${name}` }} // Green color for new tags
                    size="sm"
                    showRemove={true}
                    onRemove={() => handleRemoveNewTag(name)}
                  />
                  <span className="text-xs text-green-400">(new)</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Suggestions and create new option */}
        <div className="border-t border-gray-700 pt-3 max-h-64 overflow-y-auto">
          {isCreatingNew && (
            <button
              onClick={handleCreateTag}
              className="w-full px-3 py-2 bg-green-900/30 hover:bg-green-900/50 border border-green-700 rounded-lg flex items-center gap-2 text-green-400 text-sm transition-colors mb-2"
            >
              <Plus size={16} />
              <span>Create new tag: <strong>{inputValue.toLowerCase()}</strong></span>
            </button>
          )}
          
          {Object.entries(groupedSuggestions).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(groupedSuggestions).map(([category, tags]) => (
                <div key={category}>
                  <div className="text-xs text-gray-500 uppercase mb-1 px-1">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => handleSelectExistingTag(tag)}
                        className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-sm transition-colors ${
                          selectedExistingTagIds.has(tag.id)
                            ? 'bg-blue-900/30 border border-blue-700 text-blue-300'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Tag tag={tag} size="xs" />
                          {tag.description && (
                            <span className="text-xs text-gray-500 truncate max-w-[200px]">
                              {tag.description}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {tag.usage_count !== undefined && (
                            <span className="text-xs text-gray-500">
                              Used {tag.usage_count}x
                            </span>
                          )}
                          {selectedExistingTagIds.has(tag.id) && (
                            <Check size={14} className="text-blue-400" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500 text-sm">
              {inputValue ? 'No matching tags found' : 'Start typing to search tags'}
              {newTagNames.size > 0 && !inputValue && (
                <div className="mt-2 text-xs text-green-400">
                  {newTagNames.size} new tag(s) ready to create
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Apply button */}
        {totalSelectedCount > 0 && (
          <div className="border-t border-gray-700 pt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setSelectedExistingTagIds(new Set());
                setNewTagNames(new Set());
                setInputValue('');
              }}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleApplyTags}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
            >
              <Check size={14} />
              Apply Tags ({totalSelectedCount})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagInput;