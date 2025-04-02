// src/components/SearchFilter.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { COLUMNS } from '../utils/constants';

const SearchFilter = ({ onFilterChange }) => {
  const [searchMode, setSearchMode] = useState('simple'); // 'simple' or 'advanced'
  const [simpleQuery, setSimpleQuery] = useState('');
  const [simpleField, setSimpleField] = useState('all');
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState(null);
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
    { value: 'analyst', label: 'Analyst' },
    { value: 'mac_address', label: 'MAC Address' },
    { value: 'hash_algorithm', label: 'Hash Algorithm' },
    { value: 'hash_value', label: 'Hash Value' },
    { value: 'pid', label: 'PID' },
    { value: 'secrets', label: 'Secrets' }
  ];

  // Use debounced search to avoid excessive filtering
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      if (searchMode === 'simple') {
        onFilterChange({ 
          mode: 'simple',
          query: simpleQuery, 
          field: simpleField 
        });
      } else {
        // For advanced mode, we'll validate the query first
        try {
          if (advancedQuery.trim()) {
            // This is where we'll parse the advanced query
            onFilterChange({ 
              mode: 'advanced',
              query: advancedQuery
            });
          } else {
            // Empty query - reset filtering
            onFilterChange({ 
              mode: 'simple',
              query: '', 
              field: 'all' 
            });
          }
          setError(null);
        } catch (err) {
          setError(err.message);
        }
      }
    }, 300);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [simpleQuery, simpleField, advancedQuery, searchMode, onFilterChange]);

  const clearSearch = () => {
    if (searchMode === 'simple') {
      setSimpleQuery('');
    } else {
      setAdvancedQuery('');
    }
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-col space-y-2">
        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchMode('simple')}
            className={`px-2 py-1 text-sm rounded ${
              searchMode === 'simple' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Simple Search
          </button>
          <button
            onClick={() => setSearchMode('advanced')}
            className={`px-2 py-1 text-sm rounded ${
              searchMode === 'advanced' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Advanced Search
          </button>
          
          {searchMode === 'advanced' && (
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="ml-auto text-gray-400 hover:text-white flex items-center gap-1"
              title={showHelp ? "Hide help" : "Show search help"}
            >
              <Info size={16} />
              <span className="text-sm">Help</span>
              {showHelp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
      
        {/* Simple Search UI */}
        {searchMode === 'simple' && (
          <div className="relative flex items-stretch w-full">
            <div className="relative flex-grow">
              <input
                ref={inputRef}
                type="text"
                value={simpleQuery}
                onChange={(e) => setSimpleQuery(e.target.value)}
                placeholder="Search logs..."
                className="w-full pl-10 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-l-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              
              {simpleQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            
            <select
              value={simpleField}
              onChange={(e) => setSimpleField(e.target.value)}
              className="bg-gray-700 border-l-0 border border-gray-600 rounded-r-md text-white px-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {searchFields.map(field => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {/* Advanced Search UI */}
        {searchMode === 'advanced' && (
          <div className="w-full">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={advancedQuery}
                onChange={(e) => setAdvancedQuery(e.target.value)}
                placeholder="hostname:server AND status:ON_DISK NOT username:admin"
                className={`w-full pl-10 pr-8 py-2 bg-gray-700 border ${
                  error ? 'border-red-500' : 'border-gray-600'
                } rounded-md text-white focus:outline-none focus:ring-2 ${
                  error ? 'focus:ring-red-500' : 'focus:ring-blue-500'
                }`}
              />
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              
              {advancedQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            
            {error && (
              <div className="text-red-400 text-xs mt-1">
                {error}
              </div>
            )}
          </div>
        )}
        
        {/* Advanced Search Help */}
        {searchMode === 'advanced' && showHelp && (
          <div className="mt-2 p-3 bg-gray-700 rounded-md text-sm text-gray-300">
            <h4 className="font-medium text-white mb-1">Advanced Search Syntax</h4>
            <p className="mb-2">Use the following operators for complex searches:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><code className="bg-gray-800 px-1 rounded">field:value</code> - Search for logs where the field contains the value</li>
              <li><code className="bg-gray-800 px-1 rounded">AND</code> - Both conditions must match</li>
              <li><code className="bg-gray-800 px-1 rounded">OR</code> - Either condition can match</li>
              <li><code className="bg-gray-800 px-1 rounded">NOT</code> - Exclude logs that match this condition</li>
              <li><code className="bg-gray-800 px-1 rounded">"exact phrase"</code> - Match exact phrase in a field</li>
            </ul>
            <div className="mt-2 bg-gray-800 p-2 rounded text-xs">
              <p className="font-medium text-blue-300">Examples:</p>
              <p className="mt-1"><code>hostname:server AND status:ON_DISK</code> - Find logs with hostname containing "server" AND status "ON_DISK"</p>
              <p className="mt-1"><code>command:"sudo rm" OR command:"sudo mv"</code> - Find logs with commands containing exactly "sudo rm" OR "sudo mv"</p>
              <p className="mt-1"><code>hostname:web NOT status:CLEANED</code> - Find logs with hostname containing "web" but NOT having status "CLEANED"</p>
              <p className="mt-1"><code>domain:example.com AND (status:ON_DISK OR status:IN_MEMORY)</code> - Find logs matching domain with status "ON_DISK" or "IN_MEMORY"</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchFilter;