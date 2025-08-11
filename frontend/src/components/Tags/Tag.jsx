// frontend/src/components/Tags/Tag.jsx
import React from 'react';
import { X } from 'lucide-react';

const Tag = ({ tag, onClick, onRemove, size = 'sm', showRemove = false }) => {
  // Size classes
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-xs',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  };

  // Calculate text color based on background color for better contrast
  const getTextColor = (bgColor) => {
    // Convert hex to RGB
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return white for dark backgrounds, dark gray for light backgrounds
    return luminance > 0.5 ? '#1F2937' : '#FFFFFF';
  };

  const textColor = getTextColor(tag.color || '#6B7280');
  
  const handleClick = (e) => {
    if (onClick) {
      e.stopPropagation();
      onClick(tag);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(tag.id);
    }
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${sizeClasses[size]}
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
        transition-all duration-200 hover:scale-105
      `}
      style={{
        backgroundColor: tag.color || '#6B7280',
        color: textColor,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
      }}
      onClick={handleClick}
      title={tag.description || tag.name}
    >
      <span className="truncate max-w-[120px]">{tag.name}</span>
      
      {showRemove && onRemove && (
        <button
          onClick={handleRemove}
          className="ml-0.5 hover:opacity-100 opacity-70 transition-opacity"
          aria-label={`Remove ${tag.name} tag`}
        >
          <X size={size === 'xs' ? 10 : size === 'sm' ? 12 : 14} />
        </button>
      )}
    </span>
  );
};

export default Tag;