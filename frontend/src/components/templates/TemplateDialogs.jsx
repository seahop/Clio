// src/components/templates/TemplateDialogs.jsx
import React from 'react';
import { Save, Shield, RefreshCw, Users } from 'lucide-react';

/**
 * Dialog for saving a template
 */
export const SaveTemplateDialog = ({ 
  isOpen, 
  onClose, 
  templateName, 
  setTemplateName, 
  selectedFields, 
  setSelectedFields, 
  currentCard, 
  templateFields, 
  onSave, 
  isSaving 
}) => {
  if (!isOpen) return null;

  return (
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
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save Template</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Dialog for applying a template
 */
export const ApplyTemplateDialog = ({ 
  isOpen, 
  onClose, 
  template, 
  onApply, 
  currentCard, 
  selectedCards = [] 
}) => {
  if (!isOpen || !template) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-white mb-4">Apply Template: {template.name}</h3>
        
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
                onClick={() => onApply(template, true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Shield size={16} />
                Update Cards (Fill Empty Fields Only)
              </button>
              
              <button
                onClick={() => onApply(template, false)}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} />
                Update Cards (Replace All Fields)
              </button>
              
              <button
                onClick={onClose}
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
                onClick={() => onApply(template, true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Shield size={16} />
                Update Card (Fill Empty Fields Only)
              </button>
              
              <button
                onClick={() => onApply(template, false)}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} />
                Update Card (Replace Matching Fields)
              </button>
              
              <button
                onClick={onClose}
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
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => onApply(template)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Apply Template
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};