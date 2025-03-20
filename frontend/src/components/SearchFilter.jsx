// src/components/SearchFilter.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

const SearchFilter = ({ onFilterChange }) => {
  const [query, setQuery] = useState('');
  const [searchField, setSearchField] = useState('all');
  const inputRef = useRef(null);
  const debounceTimeout = useRef(null);
  
  // Define searchable fields
  const searchFields = [
    { value: 'all', label: 'All Fields' },
    { value: 'hostname', label: 'Hostname' },
    { value: 'internal_ip', label: 'Internal IP' },
    { value: 'external_ip', label: 'External IP' },
    { value: 'domain', label: 'Domain' },
    { value: 'username', label: 'Username' },
    { value: 'command', label: 'Command' },
    { value: 'notes', label: 'Notes' },
    { value: 'filename', label: 'Filename' },
    { value: 'status', label: 'Status' },
    { value: 'analyst', label: 'Analyst' }
  ];

  // Use debounced search to avoid excessive filtering
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      onFilterChange({ query, field: searchField });
    }, 300);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [query, searchField, onFilterChange]);

  const clearSearch = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex items-stretch w-full max-w-md">
      <div className="relative flex-grow">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search logs..."
          className="w-full pl-10 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-l-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>
      
      <select
        value={searchField}
        onChange={(e) => setSearchField(e.target.value)}
        className="bg-gray-700 border-l-0 border border-gray-600 rounded-r-md text-white px-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {searchFields.map(field => (
          <option key={field.value} value={field.value}>
            {field.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SearchFilter;