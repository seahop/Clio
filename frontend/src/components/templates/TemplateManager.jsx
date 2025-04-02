// src/components/templates/TemplateManager.jsx
import React, { useState } from 'react';
import { FileText, Save, RefreshCw, ChevronRight, ChevronDown, ChevronUp, AlertCircle, Users } from 'lucide-react';
import useTemplates from '../../hooks/useTemplates';
import { SaveTemplateDialog, ApplyTemplateDialog } from './TemplateDialogs';
import { TemplateList, SaveIcon, MergeIcon } from './TemplateList';

const TemplateManager = ({ 
  currentCard, 
  selectedCards = [], 
  templateMode, 
  onApplyTemplate, 
  csrfToken 
}) => {
  // UI State
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
  const [isSaving, setIsSaving] = useState(false);
  
  // Use template hook for API operations
  const { 
    templates, 
    loading, 
    error, 
    fetchTemplates, 
    createTemplate, 
    updateTemplate, 
    deleteTemplate,
    refreshCsrfToken 
  } = useTemplates(csrfToken);
  
  // Fields that can be templatized
  const templateFields = [
    'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
    'username', 'command', 'status', 'filename', 'hash_algorithm', 'hash_value', 'pid', 
    'notes'
  ];
  
  // Fields that need special handling (encrypted or complex data)
  const specialFields = ['secrets'];
  
  // HANDLER FUNCTIONS
  
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
      setIsSaving(true);
      
      // Refresh CSRF token before saving
      await refreshCsrfToken();
      
      // Log what we're saving
      console.log('Saving template with data:', templateData);
      
      // Save to server with fresh token
      await createTemplate(templateName.trim(), templateData);
      
      // Reset form
      setShowSaveDialog(false);
      setTemplateName('');
      setSelectedFields({});
    } catch (err) {
      // Error is already handled by the hook
      console.error('Error saving template:', err);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Show confirm dialog before applying a template
  const handleShowApplyDialog = (template, event) => {
    event?.stopPropagation();
    setSelectedTemplate(template);
    setShowApplyDialog(true);
  };
  
  // Apply a template to one or more cards
  const handleApplyTemplate = async (template, shouldMerge = false) => {
    // First refresh the CSRF token
    await refreshCsrfToken();
    
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
        // Refresh the token before deleting
        await refreshCsrfToken();
        
        // Delete with fresh token
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
        // Refresh token before updating
        await refreshCsrfToken();
        
        // Update with fresh token
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

  // Handle refresh button click - with token refresh
  const handleRefreshTemplates = async () => {
    // First refresh the CSRF token
    await refreshCsrfToken();
    // Then fetch templates with the fresh token
    await fetchTemplates();
  };
  
  // Handle editing template name
  const handleEditName = (value) => {
    setEditName(value);
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
            onClick={handleRefreshTemplates}
            className="px-2 py-1.5 bg-gray-700 text-gray-300 rounded-md flex items-center gap-1 hover:bg-gray-600 transition-colors duration-200"
            title="Refresh templates"
            disabled={loading}
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
          
          {/* Template List Component */}
          <TemplateList
            templates={templates}
            loading={loading}
            searchQuery={searchQuery}
            expandedTemplates={expandedTemplates}
            isEditing={isEditing}
            editName={editName}
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
        </>
      )}
      
      {/* Save Template Dialog */}
      <SaveTemplateDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        templateName={templateName}
        setTemplateName={setTemplateName}
        selectedFields={selectedFields}
        setSelectedFields={setSelectedFields}
        currentCard={currentCard}
        templateFields={templateFields}
        onSave={handleSaveTemplate}
        isSaving={isSaving}
      />
      
      {/* Apply Template Dialog */}
      <ApplyTemplateDialog
        isOpen={showApplyDialog}
        onClose={() => setShowApplyDialog(false)}
        template={selectedTemplate}
        onApply={handleApplyTemplate}
        currentCard={currentCard}
        selectedCards={selectedCards}
      />
    </div>
  );
};

export default TemplateManager;