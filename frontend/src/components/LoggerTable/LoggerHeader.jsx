// components/LoggerTable/LoggerHeader.jsx
import React from 'react';
import { Plus } from 'lucide-react';

const LoggerHeader = ({ isAdmin, onAddRow }) => {
  return (
    <div className="flex flex-wrap items-center justify-between p-2 sm:p-4 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
      <div className="flex items-center gap-2 sm:gap-4">
        <h2 className="text-lg sm:text-xl font-bold text-white"></h2>
        {isAdmin && (
          <span className="bg-red-900 text-red-200 text-xs font-medium px-2.5 py-0.5 rounded">
            Admin
          </span>
        )}
      </div>
      <button 
        onClick={onAddRow}
        className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-md flex items-center gap-2 hover:bg-blue-700 transition-colors duration-200"
      >
        <Plus size={16} /> <span>Add Row</span>
      </button>
    </div>
  );
};

export default LoggerHeader;