// components/EvidenceToggle.jsx
import React from 'react';
import { FileText } from 'lucide-react';

/**
 * A reusable evidence toggle button component
 * 
 * @param {boolean} isActive - Whether the evidence panel is active/open
 * @param {function} onToggle - Function to call when toggling
 * @param {string} size - Size of the icon (small, medium, default)
 * @param {string} className - Additional CSS classes
 */
const EvidenceToggle = ({ isActive, onToggle, size = 'default', className = '' }) => {
  // Determine icon size based on prop
  const iconSize = size === 'small' ? 14 : size === 'medium' ? 16 : 18;
  
  // Base classes
  const baseClasses = "p-1 rounded transition-colors duration-200";
  
  // Active state classes
  const activeClasses = isActive 
    ? "text-blue-400 bg-blue-500/10" 
    : "text-gray-400 hover:bg-gray-700 hover:text-gray-300";
    
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`${baseClasses} ${activeClasses} ${className}`}
      title={isActive ? "Hide evidence panel" : "Show evidence panel"}
      aria-label={isActive ? "Hide evidence" : "Show evidence"}
      aria-pressed={isActive}
    >
      <FileText size={iconSize} />
    </button>
  );
};

export default EvidenceToggle;