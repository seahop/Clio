// src/components/TemplateManager.jsx
import React, { useState, useEffect } from 'react';
import { Save, FileText, Plus, Trash2, Edit, X, AlertCircle, RefreshCw, Check, Shield, Users, ChevronDown, ChevronRight, ChevronUp, LayersIcon } from 'lucide-react';
import useTemplates from '../hooks/useTemplates';

const TemplateManager = ({ 
  currentCard, 
  selectedCards = [], // For multi-selection
  templateMode, 
  onApplyTemplate, 
  csrfToken 
}) => {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [selectedFields, setSelectedFields] = useState({});
  const [isEditing, setIsEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [expandedTemplates, setExpandedTemplates] = useState({});
  
  // Use our templates hook instead of local state + localStorage
  const { 
    templates, 
    loading, 
    error, 
    fetchTemplates, 
    createTemplate, 
    updateTemplate, 
    deleteTemplate 
  } = useTemplates(csrfToken);
  
  // Fields that can be templatized
  const templateFields = [
    'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
    'username', 'command', 'status', 'filename', 'hash_algorithm', 'hash_value', 'pid', 
    'notes' // Added notes which was missing
  ];
  
  // Fields that need special handling (encrypted or complex data)
  const specialFields = ['secrets'];
  
  // Initialize selected fields when opening the save dialog
  const handleOpenSaveDialog = () => {
    const initialSelection = {};
    templateFields.forEach(field => {
      initialSelection[field] = currentCard && currentCard[field] ? true : false;
    });
    setSelectedFields(initialSelection);
    setShowSaveDialog(true);
  };
  
  // Save a new template to the server
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }
    
    // Create template object with only selected fields
    const templateData = {};
    Object.keys(selectedFields).forEach(field => {
      if (selectedFields[field] && currentCard && currentCard[field]) {
        // Special handling for encrypted or complex fields
        if (field === 'secrets') {
          // If it's a complex object (likely encrypted), don't include it
          // Only include secrets if it's a simple string
          if (typeof currentCard[field] === 'string' || currentCard[field] === null) {
            templateData[field] = currentCard[field];
          }
        } else {
          templateData[field] = currentCard[field];
        }
      }
    });
    
    try {
      // Log what we're saving
      console.log('Saving template with data:', templateData);
      
      // Save to server instead of local state
      await createTemplate(templateName.trim(), templateData);
      
      // Reset form
      setShowSaveDialog(false);
      setTemplateName('');
      setSelectedFields({});
    } catch (err) {
      // Error is already handled by the hook
      console.error('Error saving template:', err);
    }
  };
  
  // Show confirm dialog before applying a template
  const handleShowApplyDialog = (template, event) => {
    event?.stopPropagation();
    setSelectedTemplate(template);
    setShowApplyDialog(true);
  };
  
  // Apply a template to one or more cards
  const handleApplyTemplate = (template, shouldMerge = false) => {
    if (onApplyTemplate) {
      if (templateMode === 'merge' && selectedCards.length > 0) {
        // Process each card individually for merging
        selectedCards.forEach(card => {
          if (!card) return; // Skip if card is null/undefined
          
          // Prepare data specific to this card
          let updateData = {};
          
          if (shouldMerge) {
            // Smart merge: only include template values for fields that are empty in THIS card
            Object.keys(template.data).forEach(field => {
              // Only update empty fields in the current card
              if (!card[field]) {
                // Special handling for encrypted fields like 'secrets'
                if (field === 'secrets') {
                  // Only include if it's a string or simple value
                  if (typeof template.data[field] === 'string' || template.data[field] === null) {
                    updateData[field] = template.data[field];
                  }
                } else {
                  updateData[field] = template.data[field];
                }
              }
            });
          } else {
            // Full replace: include all template fields (except for special fields)
            Object.keys(template.data).forEach(field => {
              // Special handling for encrypted fields
              if (field === 'secrets') {
                if (typeof template.data[field] === 'string' || template.data[field] === null) {
                  updateData[field] = template.data[field];
                }
              } else {
                updateData[field] = template.data[field];
              }
            });
          }
          
          // Skip if there's nothing to update
          if (Object.keys(updateData).length === 0) {
            console.log(`No fields to update for card ${card.id}`);
            return;
          }
          
          // Call the callback for this specific card
          console.log(`Updating card ${card.id} with fields:`, updateData);
          onApplyTemplate(updateData, card.id); // Pass card ID as second parameter
        });
      } else if (currentCard) {
        // Single card mode
        let updateData = {};
        
        if (shouldMerge) {
          // Smart merge: only include template values for fields that are empty in current card
          Object.keys(template.data).forEach(field => {
            // Only update empty fields in the current card
            if (!currentCard[field]) {
              // Special handling for encrypted fields like 'secrets'
              if (field === 'secrets') {
                // Only include if it's a string or simple value
                if (typeof template.data[field] === 'string' || template.data[field] === null) {
                  updateData[field] = template.data[field];
                }
              } else {
                updateData[field] = template.data[field];
              }
            }
          });
        } else {
          // Full replace: include all template fields (except for special fields)
          Object.keys(template.data).forEach(field => {
            // Special handling for encrypted fields
            if (field === 'secrets') {
              if (typeof template.data[field] === 'string' || template.data[field] === null) {
                updateData[field] = template.data[field];
              }
            } else {
              updateData[field] = template.data[field];
            }
          });
        }
        
        // Call the callback with ONLY the fields to update
        console.log('Updating single card with fields:', updateData);
        onApplyTemplate(updateData, currentCard.id); // Pass card ID as second parameter
      } else {
        // No card selected, create a new one from template
        const safeTemplateData = { ...template.data };
        
        // Handle encrypted fields to prevent constraint violations
        if (safeTemplateData.secrets && typeof safeTemplateData.secrets === 'object') {
          delete safeTemplateData.secrets;
        }
        
        console.log('Creating new card from template data:', safeTemplateData);
        onApplyTemplate(safeTemplateData);
      }
    }
    
    // Close the dialog
    setShowApplyDialog(false);
  };
  
  // Delete a template
  const handleDeleteTemplate = async (id, event) => {
    event.stopPropagation();
    if (window.confirm('Are you sure you want to delete this template?')) {
      try {
        await deleteTemplate(id);
      } catch (err) {
        // Error is already handled by the hook
        console.error('Error deleting template:', err);
      }
    }
  };
  
  // Start editing a template name
  const handleStartEdit = (template, event) => {
    event.stopPropagation();
    setIsEditing(template.id);
    setEditName(template.name);
  };
  
  // Save edited template name
  const handleSaveEdit = async (id, event) => {
    event.stopPropagation();
    if (editName.trim()) {
      try {
        await updateTemplate(id, { name: editName.trim() });
      } catch (err) {
        // Error is already handled by the hook
        console.error('Error updating template name:', err);
      }
    }
    setIsEditing(null);
    setEditName('');
  };
  
  // Cancel editing
  const handleCancelEdit = (event) => {
    event.stopPropagation();
    setIsEditing(null);
    setEditName('');
  };
  
  // Toggle expand/collapse for a specific template
  const toggleTemplateExpand = (templateId, event) => {
    event.stopPropagation();
    setExpandedTemplates(prev => ({
      ...prev,
      [templateId]: !prev[templateId]
    }));
  };
  
  // Toggle expand/collapse all templates
  const toggleAllTemplates = () => {
    if (Object.values(expandedTemplates).some(value => value)) {
      // If any are expanded, collapse all
      setExpandedTemplates({});
    } else {
      // If all are collapsed, expand all
      const newExpandedState = {};
      templates.forEach(template => {
        newExpandedState[template.id] = true;
      });
      setExpandedTemplates(newExpandedState);
    }
  };

  // Toggle general section collapse/expand
  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

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

  // Get the total number of empty fields across all selected cards
  const getTotalEmptyFieldsCount = (template) => {
    if (!selectedCards.length || !template) return 0;
    
    // Track which fields are empty in at least one card
    const emptyFieldsInAnyCard = {};
    
    selectedCards.forEach(card => {
      if (card) {
        Object.keys(template.data).forEach(field => {
          if (!card[field]) {
            emptyFieldsInAnyCard[field] = true;
          }
        });
      }
    });
    
    return Object.keys(emptyFieldsInAnyCard).length;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-4">
      {/* Template Section Header - Always visible */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleCollapse}
            className="p-1 rounded-md hover:bg-gray-700 transition-colors duration-200"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 text-white" />
            ) : (
              <ChevronDown className="w-5 h-5 text-white" />
            )}
          </button>
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Log Templates
            <span className="text-sm text-gray-400">({templates.length})</span>
          </h3>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={fetchTemplates}
            className="px-2 py-1.5 bg-gray-700 text-gray-300 rounded-md flex items-center gap-1 hover:bg-gray-600 transition-colors duration-200"
            title="Refresh templates"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline text-sm">Refresh</span>
          </button>
          
          {/* Only show "Save as Template" button when in save mode */}
          {templateMode === 'save' && currentCard && (
            <button
              onClick={handleOpenSaveDialog}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md flex items-center gap-2 hover:bg-blue-700 transition-colors duration-200"
              title="Save selected card as template"
            >
              <Save size={16} />
              <span>Save As Template</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Collapsible content */}
      {!isCollapsed && (
        <>
          {/* Search input */}
          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates by name or field..."
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          
          {/* Visual indicator when a card is selected for different actions */}
          {templateMode === 'save' && currentCard && (
            <div className="bg-blue-800/50 p-3 rounded-md mb-3 flex items-center gap-2">
              <SaveIcon size={18} className="text-blue-400" />
              <div>
                <h4 className="text-white font-medium">Card Selected for Template Creation</h4>
                <p className="text-sm text-blue-300">
                  Click "Save As Template" to create a new template from this card.
                </p>
              </div>
            </div>
          )}
          
          {/* Visual indicator for multiple card selection */}
          {templateMode === 'merge' && selectedCards.length > 0 && (
            <div className="bg-green-800/50 p-3 rounded-md mb-3 flex items-center gap-2">
              <Users size={18} className="text-green-400" />
              <div>
                <h4 className="text-white font-medium">
                  {selectedCards.length} {selectedCards.length === 1 ? 'Card' : 'Cards'} Selected for Merging
                </h4>
                <p className="text-sm text-green-300">
                  Click on any template below to merge it with the selected {selectedCards.length === 1 ? 'card' : 'cards'}.
                </p>
              </div>
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <div className="mb-3 p-3 bg-red-900/50 text-red-200 rounded-md flex items-center gap-2">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}
          
          {/* Loading state */}
          {loading && (
            <div className="flex justify-center items-center py-4">
              <RefreshCw className="animate-spin text-blue-400 mr-2" size={20} />
              <span className="text-gray-400">Loading templates...</span>
            </div>
          )}
          
          {/* Template Actions - Expand/Collapse All */}
          {!loading && templates.length > 0 && (
            <div className="flex justify-end mb-3">
              <button
                onClick={toggleAllTemplates}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700"
              >
                {Object.values(expandedTemplates).some(value => value) ? (
                  <>
                    <ChevronUp size={14} />
                    <span>Collapse All</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    <span>Expand All</span>
                  </>
                )}
              </button>
            </div>
          )}
          
          {/* Template List */}
          {!loading && templates.length === 0 ? (
            <div className="text-center py-4 text-gray-400">
              <p>No templates saved yet.</p>
              <p className="text-sm mt-2">Fill out a card and save it as a template to speed up future logging.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {getFilteredTemplates().map(template => (
                <div 
                  key={template.id} 
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
                          onChange={(e) => setEditName(e.target.value)}
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
                          onClick={handleCancelEdit}
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
                            onClick={(e) => handleStartEdit(template, e)} 
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
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      
      {/* Apply Template Dialog - UPDATED for multi-card support */}
      {showApplyDialog && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-white mb-4">Apply Template: {selectedTemplate.name}</h3>
            
            {selectedCards.length > 0 ? (
              <>
                <p className="text-gray-300 mb-4">
                  This will update {selectedCards.length} selected {selectedCards.length === 1 ? 'card' : 'cards'} with template data.
                </p>
                
                <div className="mb-4 p-3 bg-gray-700 rounded-md">
                  <div className="flex items-center gap-2 text-sm text-green-400 mb-2">
                    <Users size={14} />
                    <span>{selectedCards.length} {selectedCards.length === 1 ? 'card' : 'cards'} selected for updating</span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-3 mt-6">
                  <button
                    onClick={() => handleApplyTemplate(selectedTemplate, true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <Shield size={16} />
                    Update Cards (Fill Empty Fields Only)
                  </button>
                  
                  <button
                    onClick={() => handleApplyTemplate(selectedTemplate, false)}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} />
                    Update Cards (Replace All Fields)
                  </button>
                  
                  <button
                    onClick={() => setShowApplyDialog(false)}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : currentCard ? (
              <>
                <p className="text-gray-300 mb-4">
                  This will update your current card with template data.
                </p>
                
                <div className="flex flex-col gap-3 mt-6">
                  <button
                    onClick={() => handleApplyTemplate(selectedTemplate, true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <Shield size={16} />
                    Update Card (Fill Empty Fields Only)
                  </button>
                  
                  <button
                    onClick={() => handleApplyTemplate(selectedTemplate, false)}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} />
                    Update Card (Replace Matching Fields)
                  </button>
                  
                  <button
                    onClick={() => setShowApplyDialog(false)}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-300 mb-4">
                  This will create a new log entry with these template values.
                </p>
                
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowApplyDialog(false)}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleApplyTemplate(selectedTemplate)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Apply Template
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Save Template Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-white mb-4">Save as Template</h3>
            
            <div className="mb-4">
              <label className="block text-gray-300 mb-1">Template Name</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                placeholder="Enter a name for this template"
                autoFocus
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-gray-300 mb-2">Select Fields to Include</label>
              <div className="grid grid-cols-2 gap-2">
                {templateFields.map(field => (
                  <div key={field} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`field-${field}`}
                      checked={selectedFields[field] || false}
                      onChange={(e) => setSelectedFields(prev => ({
                        ...prev,
                        [field]: e.target.checked
                      }))}
                      disabled={!currentCard || !currentCard[field]}
                      className="mr-2"
                    />
                    <label 
                      htmlFor={`field-${field}`} 
                      className={`text-sm ${!currentCard || !currentCard[field] ? 'text-gray-500' : 'text-gray-300'}`}
                    >
                      {field}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper icons for templates
const SaveIcon = ({ size, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
    <polyline points="17 21 17 13 7 13 7 21"></polyline>
    <polyline points="7 3 7 8 15 8"></polyline>
  </svg>
);

// Helper icon for merge visualization
const MergeIcon = ({ size, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 7l4-4 4 4"></path>
    <path d="M12 3v8"></path>
    <path d="M8 17l4 4 4-4"></path>
    <path d="M12 21v-8"></path>
    <path d="M3 12h18"></path>
  </svg>
);

export default TemplateManager;