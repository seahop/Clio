// frontend/src/components/Tags/TagFilter.jsx
import React, { useState, useEffect } from 'react';
import { Filter, X, ChevronDown, ChevronUp, Tag as TagIcon } from 'lucide-react';
import Tag from './Tag';

const TagFilter = ({ 
  availableTags = [], 
  selectedTags = [], 
  onTagToggle,
  onClearAll,
  showStats = true 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Get unique categories
  const categories = [...new Set(availableTags.map(tag => tag.category).filter(Boolean))].sort();
  
  // Filter tags based on category and search
  const filteredTags = availableTags.filter(tag => {
    const matchesCategory = selectedCategory === 'all' || tag.category === selectedCategory;
    const matchesSearch = !searchTerm || 
      tag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tag.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });
  
  // Group filtered tags by category
  const groupedTags = filteredTags.reduce((groups, tag) => {
    const category = tag.category || 'custom';
    if (!groups[category]) groups[category] = [];
    groups[category].push(tag);
    return groups;
  }, {});
  
  // Sort tags within each group by usage
  Object.keys(groupedTags).forEach(category => {
    groupedTags[category].sort((a, b) => {
      // Selected tags first
      const aSelected = selectedTags.some(t => t.id === a.id);
      const bSelected = selectedTags.some(t => t.id === b.id);
      if (aSelected !== bSelected) return bSelected ? 1 : -1;
      
      // Then by usage count
      if (a.usage_count !== undefined && b.usage_count !== undefined) {
        return b.usage_count - a.usage_count;
      }
      
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  });
  
  const handleTagClick = (tag) => {
    onTagToggle(tag);
  };
  
  const isTagSelected = (tagId) => {
    return selectedTags.some(t => t.id === tagId);
  };
  
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-white">Filter by Tags</span>
          {selectedTags.length > 0 && (
            <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
              {selectedTags.length}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {selectedTags.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
            >
              Clear all
            </button>
          )}
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-gray-300 transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      
      {/* Selected Tags */}
      {selectedTags.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700">
          <div className="text-xs text-gray-500 mb-2">Active Filters:</div>
          <div className="flex flex-wrap gap-1">
            {selectedTags.map(tag => (
              <Tag
                key={tag.id}
                tag={tag}
                size="sm"
                showRemove={true}
                onRemove={() => handleTagClick(tag)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tags..."
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          />
          
          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                All Categories
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
          
          {/* Tags Grid */}
          <div className="max-h-64 overflow-y-auto space-y-3">
            {Object.entries(groupedTags).length > 0 ? (
              Object.entries(groupedTags).map(([category, tags]) => (
                <div key={category}>
                  <div className="text-xs text-gray-500 uppercase mb-2">{category}</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => handleTagClick(tag)}
                        className={`p-2 rounded-lg border transition-all ${
                          isTagSelected(tag.id)
                            ? 'bg-blue-900/30 border-blue-600'
                            : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="text-xs text-white truncate">
                              {tag.name}
                            </span>
                          </div>
                          {showStats && tag.usage_count !== undefined && (
                            <span className="text-xs text-gray-500 flex-shrink-0">
                              {tag.usage_count}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                {searchTerm ? 'No tags match your search' : 'No tags available'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagFilter;