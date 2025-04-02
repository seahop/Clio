// frontend/src/components/CardFieldSettings.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Settings, X, RotateCcw } from 'lucide-react';
import { COLUMNS } from '../utils/constants';

// Fields that can potentially be shown in the card header
const HEADER_FIELDS = [
  'internal_ip',
  'external_ip',
  'mac_address',
  'hostname',
  'domain',
  'username',
  'command',
  'filename',
  'pid',
  'status'
];

const CardFieldSettings = ({ currentUser, onSettingsChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState({});
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  
  // Load saved settings from localStorage on component mount
  useEffect(() => {
    try {
      const username = currentUser?.username;
      if (username) {
        const savedSettings = localStorage.getItem(`${username}_cardFields`);
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          setSelectedFields(settings);
          
          // Apply loaded settings immediately
          if (onSettingsChange) {
            onSettingsChange(settings);
          }
        } else {
          // Default settings if none found
          const defaults = {
            internal_ip: true,
            mac_address: true,
            pid: true,
            hostname: true,
            username: true,
            filename: true,
            command: true,
            status: true
          };
          setSelectedFields(defaults);
          
          // Apply default settings immediately
          if (onSettingsChange) {
            onSettingsChange(defaults);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load card field settings:', error);
    }
  }, [currentUser, onSettingsChange]);

  // Handle toggling a field selection - immediately apply changes
  const handleToggleField = (field) => {
    const updated = { 
      ...selectedFields,
      [field]: !selectedFields[field] 
    };
    
    // Update state
    setSelectedFields(updated);
    
    // Apply changes immediately
    if (onSettingsChange) {
      onSettingsChange(updated);
    }
    
    // Save to localStorage
    try {
      const username = currentUser?.username;
      if (username) {
        localStorage.setItem(`${username}_cardFields`, JSON.stringify(updated));
      }
    } catch (error) {
      console.error('Failed to save card field settings:', error);
    }
  };
  
  // Reset to default settings
  const resetToDefaults = () => {
    const defaults = {
      internal_ip: true,
      mac_address: true,
      pid: true,
      hostname: true,
      username: true,
      filename: true,
      command: true,
      status: true
    };
    
    // Update state
    setSelectedFields(defaults);
    
    // Apply changes immediately
    if (onSettingsChange) {
      onSettingsChange(defaults);
    }
    
    // Save to localStorage
    try {
      const username = currentUser?.username;
      if (username) {
        localStorage.setItem(`${username}_cardFields`, JSON.stringify(defaults));
      }
    } catch (error) {
      console.error('Failed to save default card field settings:', error);
    }
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" style={{ zIndex: 9999 }}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors duration-200 bg-gray-700 text-gray-300 hover:bg-gray-600"
        title="Card Field Settings"
      >
        <Settings size={16} />
        <span className="hidden sm:inline">Card Fields</span>
      </button>

      {isOpen && (
        // Using fixed positioning instead of absolute to ensure it's not limited by parent containers
        <div 
          ref={dropdownRef}
          className="fixed shadow-lg rounded-lg"
          style={{ 
            zIndex: 9999,
            backgroundColor: '#1f2937', // bg-gray-800
            border: '1px solid #374151', // border-gray-700
            padding: '1rem',
            width: '280px',
            top: buttonRef.current ? buttonRef.current.getBoundingClientRect().bottom + 5 : 0,
            left: buttonRef.current ? buttonRef.current.getBoundingClientRect().left : 0,
            overflow: 'auto',
            maxHeight: '90vh'
          }}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-white">Card Header Fields</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          
          <p className="text-xs text-gray-400 mb-3">
            Select which fields to display in the card header summary.
          </p>
          
          <div className="space-y-2 mb-4">
            {HEADER_FIELDS.map(field => {
              const column = COLUMNS.find(col => col.field === field);
              
              return (
                <div key={field} className="flex items-center">
                  <input
                    id={`field-${field}`}
                    type="checkbox"
                    checked={!!selectedFields[field]}
                    onChange={() => handleToggleField(field)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600"
                  />
                  <label
                    htmlFor={`field-${field}`}
                    className="ml-2 text-sm text-gray-300 cursor-pointer"
                  >
                    {column?.header || field}
                  </label>
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 flex justify-end border-t border-gray-700 pt-3">
            <button
              onClick={resetToDefaults}
              className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm flex items-center gap-1 hover:bg-gray-600"
            >
              <RotateCcw size={14} />
              <span>Reset to Default</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardFieldSettings;