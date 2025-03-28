// frontend/src/components/TemplateManager.jsx
import React, { useState, useEffect } from 'react';
import { Save, FileText, Plus, Trash2, Edit, X } from 'lucide-react';

const TemplateManager = ({ currentCard, onApplyTemplate, csrfToken }) => {
  const [templates, setTemplates] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedFields, setSelectedFields] = useState({});
  const [isEditing, setIsEditing] = useState(null);
  const [editName, setEditName] = useState('');
  
  // Fields that can be templatized
  const templateFields = [
    'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
    'username', 'command', 'status', 'filename', 'hash_algorithm'
  ];
  
  // Load templates from localStorage on component mount
  useEffect(() => {
    const savedTemplates = localStorage.getItem('logTemplates');
    if (savedTemplates) {
      try {
        setTemplates(JSON.parse(savedTemplates));
      } catch (error) {
        console.error('Error loading templates:', error);
        setTemplates([]);
      }
    }
  }, []);
  
  // Save templates to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('logTemplates', JSON.stringify(templates));
  }, [templates]);
  
  // Initialize selected fields when opening the save dialog
  const handleOpenSaveDialog = () => {
    const initialSelection = {};
    templateFields.forEach(field => {
      initialSelection[field] = currentCard && currentCard[field] ? true : false;
    });
    setSelectedFields(initialSelection);
    setShowSaveDialog(true);
  };
  
  // Save a new template
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }
    
    // Create template object with only selected fields
    const templateData = {};
    Object.keys(selectedFields).forEach(field => {
      if (selectedFields[field] && currentCard && currentCard[field]) {
        templateData[field] = currentCard[field];
      }
    });
    
    const newTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      data: templateData,
      createdAt: new Date().toISOString()
    };
    
    setTemplates(prev => [...prev, newTemplate]);
    setShowSaveDialog(false);
    setTemplateName('');
    setSelectedFields({});
  };
  
  // Apply a template to a new card
  const handleApplyTemplate = (template) => {
    if (onApplyTemplate) {
      onApplyTemplate(template.data);
    }
  };
  
  // Delete a template
  const handleDeleteTemplate = (id, event) => {
    event.stopPropagation();
    if (window.confirm('Are you sure you want to delete this template?')) {
      setTemplates(prev => prev.filter(t => t.id !== id));
    }
  };
  
  // Start editing a template name
  const handleStartEdit = (template, event) => {
    event.stopPropagation();
    setIsEditing(template.id);
    setEditName(template.name);
  };
  
  // Save edited template name
  const handleSaveEdit = (id, event) => {
    event.stopPropagation();
    if (editName.trim()) {
      setTemplates(prev => prev.map(t => 
        t.id === id ? { ...t, name: editName.trim() } : t
      ));
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

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Log Templates
        </h3>
        
        <button
          onClick={handleOpenSaveDialog}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md flex items-center gap-2 hover:bg-blue-700 transition-colors duration-200"
          disabled={!currentCard}
          title={!currentCard ? "Select a card to create a template" : "Save current card as template"}
        >
          <Save size={16} />
          <span>Save As Template</span>
        </button>
      </div>
      
      {/* Template List */}
      {templates.length === 0 ? (
        <div className="text-center py-6 text-gray-400">
          <p>No templates saved yet.</p>
          <p className="text-sm mt-2">Fill out a card and save it as a template to speed up future logging.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(template => (
            <div
              key={template.id}
              onClick={() => handleApplyTemplate(template)}
              className="bg-gray-700 p-3 rounded-md hover:bg-gray-600 transition-all cursor-pointer border border-gray-600 hover:border-blue-500"
            >
              <div className="flex items-center justify-between mb-2">
                {isEditing === template.id ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 flex-grow"
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                    <button 
                      onClick={(e) => handleSaveEdit(template.id, e)}
                      className="p-1 bg-green-800 text-green-200 rounded hover:bg-green-700"
                    >
                      <CheckIcon size={16} />
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
                    <h4 className="font-medium text-white">{template.name}</h4>
                    <div className="flex items-center gap-1">
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
              </div>
              
              <div className="text-xs text-gray-400">
                {Object.keys(template.data).length} fields • Created {new Date(template.createdAt).toLocaleDateString()}
              </div>
              
              <div className="mt-2 text-xs">
                {Object.keys(template.data).map(field => (
                  <span key={field} className="inline-block bg-gray-800 text-blue-300 rounded px-2 py-1 mr-1 mb-1">
                    {field}
                  </span>
                ))}
              </div>
            </div>
          ))}
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

// Helper icons
const CheckIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export default TemplateManager;