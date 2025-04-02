// src/components/templates/TemplateList.jsx
import React from 'react';
import { ChevronRight, ChevronDown, Trash2, Edit, Check, X, RefreshCw, Users } from 'lucide-react';

/**
 * Component for displaying a single template item
 */
export const TemplateItem = ({
  template,
  isEditing,
  editName,
  expandedTemplates,
  templateMode,
  currentCard,
  selectedCards,
  handleEditName,
  handleSaveEdit,
  handleCancelEdit,
  handleDeleteTemplate,
  handleShowApplyDialog,
  toggleTemplateExpand
}) => {
  return (
    <div 
      className={`border border-gray-600 rounded-md transition-all overflow-hidden ${
        templateMode === 'merge' || !currentCard ? 
          'hover:border-blue-500' : 
          ''
      }`}
    >
      {/* Template Header - Always visible */}
      <div
        onClick={() => {
          // Only show apply dialog if we're in merge mode or no card is selected
          if (templateMode === 'merge' || !currentCard) {
            handleShowApplyDialog(template);
          }
        }}
        className={`bg-gray-700 px-3 py-2 flex items-center justify-between ${
          templateMode === 'merge' || !currentCard ? 'cursor-pointer hover:bg-gray-600/60' : ''
        }`}
      >
        {isEditing === template.id ? (
          <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={editName}
              onChange={(e) => handleEditName(e.target.value)}
              className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 flex-grow"
              autoFocus
            />
            <button 
              onClick={(e) => handleSaveEdit(template.id, e)}
              className="p-1 bg-green-800 text-green-200 rounded hover:bg-green-700"
            >
              <Check size={16} />
            </button>
            <button 
              onClick={(e) => handleCancelEdit(e)}
              className="p-1 bg-red-800 text-red-200 rounded hover:bg-red-700"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-grow overflow-hidden">
              {/* Expand/Collapse button */}
              <button 
                onClick={(e) => toggleTemplateExpand(template.id, e)}
                className="p-1 rounded hover:bg-gray-600 transition-colors"
              >
                {expandedTemplates[template.id] ? (
                  <ChevronDown size={14} className="text-gray-400" />
                ) : (
                  <ChevronRight size={14} className="text-gray-400" />
                )}
              </button>
              
              <div className="font-medium text-white truncate">{template.name}</div>
              
              {/* Field count badge */}
              <div className="bg-gray-800 text-xs text-gray-400 px-1.5 py-0.5 rounded-full">
                {Object.keys(template.data).length} fields
              </div>
              
              {/* Add first 3 fields as tags (if space allows) */}
              <div className="hidden sm:flex items-center flex-wrap gap-1 overflow-hidden">
                {Object.keys(template.data).slice(0, 3).map(field => (
                  <span key={field} className="inline-block bg-gray-800 text-blue-300 rounded px-1.5 py-0.5 text-xs">
                    {field}
                  </span>
                ))}
                {Object.keys(template.data).length > 3 && (
                  <span className="text-xs text-gray-400">+{Object.keys(template.data).length - 3}</span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1 flex-shrink-0">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit(template, e);
                }} 
                className="p-1 text-gray-300 hover:text-white"
                title="Rename template"
              >
                <Edit size={14} />
              </button>
              <button 
                onClick={(e) => handleDeleteTemplate(template.id, e)} 
                className="p-1 text-gray-300 hover:text-red-400"
                title="Delete template"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
        
        {/* Indicator for multi-card selection */}
        {templateMode === 'merge' && selectedCards.length > 0 && (
          <div className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4">
            <div className="bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              <Users size={10} />
            </div>
          </div>
        )}
      </div>
      
      {/* Template Details - Expandable */}
      {expandedTemplates[template.id] && (
        <TemplateDetails 
          template={template}
          templateMode={templateMode}
          currentCard={currentCard}
          selectedCards={selectedCards}
          handleShowApplyDialog={handleShowApplyDialog}
        />
      )}
    </div>
  );
};

/**
 * Component for the expanded details of a template
 */
export const TemplateDetails = ({ 
  template, 
  templateMode, 
  currentCard, 
  selectedCards = [],
  handleShowApplyDialog 
}) => {
  return (
    <div className="p-3 bg-gray-800 border-t border-gray-600">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {Object.entries(template.data).map(([field, value]) => (
          <div key={field} className="bg-gray-700/50 p-2 rounded">
            <div className="text-xs text-blue-300 mb-1">{field}:</div>
            <div className="text-sm text-white break-words whitespace-pre-wrap">
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </div>
          </div>
        ))}
      </div>
      
      {/* Quick actions for expanded view */}
      <div className="mt-3 flex justify-end">
        {/* Only show apply buttons if in merge mode or no card is selected */}
        {(templateMode === 'merge' || !currentCard) && (
          <>
            {templateMode === 'merge' && selectedCards.length > 0 ? (
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShowApplyDialog(template, e);
                  }}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  Apply to {selectedCards.length} {selectedCards.length === 1 ? 'Card' : 'Cards'}
                </button>
              </div>
            ) : currentCard ? (
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShowApplyDialog(template, e);
                  }}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  Apply to Card
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowApplyDialog(template, e);
                }}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Create New Card
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Component for the template collection
 */
export const TemplateList = ({
  templates = [],
  loading,
  searchQuery,
  expandedTemplates,
  isEditing,
  editName,
  templateMode,
  currentCard,
  selectedCards,
  handleEditName,
  handleSaveEdit,
  handleCancelEdit,
  handleDeleteTemplate,
  handleShowApplyDialog,
  toggleTemplateExpand,
  handleStartEdit
}) => {
  // Filter templates based on search query
  const getFilteredTemplates = () => {
    if (!searchQuery.trim()) return templates;
    
    return templates.filter(template => {
      // Search in template name
      if (template.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return true;
      }
      
      // Search in template fields
      return Object.keys(template.data).some(field => 
        field.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  };

  const filteredTemplates = getFilteredTemplates();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-4">
        <RefreshCw className="animate-spin text-blue-400 mr-2" size={20} />
        <span className="text-gray-400">Loading templates...</span>
      </div>
    );
  }

  if (filteredTemplates.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400">
        <p>No templates found.</p>
        <p className="text-sm mt-2">
          {templates.length > 0 
            ? "Try adjusting your search query."
            : "Fill out a card and save it as a template to speed up future logging."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {filteredTemplates.map(template => (
        <TemplateItem
          key={template.id}
          template={template}
          isEditing={isEditing}
          editName={editName}
          expandedTemplates={expandedTemplates}
          templateMode={templateMode}
          currentCard={currentCard}
          selectedCards={selectedCards}
          handleEditName={handleEditName}
          handleSaveEdit={handleSaveEdit}
          handleCancelEdit={handleCancelEdit}
          handleDeleteTemplate={handleDeleteTemplate}
          handleShowApplyDialog={handleShowApplyDialog}
          toggleTemplateExpand={toggleTemplateExpand}
          handleStartEdit={handleStartEdit}
        />
      ))}
    </div>
  );
};

/**
 * Helper icons for templates
 */
export const SaveIcon = ({ size, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
    <polyline points="17 21 17 13 7 13 7 21"></polyline>
    <polyline points="7 3 7 8 15 8"></polyline>
  </svg>
);

export const MergeIcon = ({ size, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 7l4-4 4 4"></path>
    <path d="M12 3v8"></path>
    <path d="M8 17l4 4 4-4"></path>
    <path d="M12 21v-8"></path>
    <path d="M3 12h18"></path>
  </svg>
);