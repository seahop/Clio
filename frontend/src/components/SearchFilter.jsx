// src/components/SearchFilter.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Info, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { COLUMNS } from '../utils/constants';
import { tokenizeQuery } from '../utils/queryParser';

const SearchFilter = ({ onFilterChange }) => {
  const [searchMode, setSearchMode] = useState('simple'); // 'simple' or 'advanced'
  const [simpleQuery, setSimpleQuery] = useState('');
  const [simpleField, setSimpleField] = useState('all');
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState(null);
  const [syntaxValid, setSyntaxValid] = useState(true);
  const [tokens, setTokens] = useState([]);
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

  // Validate the advanced query syntax
  const validateAdvancedQuery = (query) => {
    if (!query.trim()) {
      setSyntaxValid(true);
      setTokens([]);
      return true;
    }
    
    try {
      // Tokenize the query to check for syntax errors
      const queryTokens = tokenizeQuery(query);
      setTokens(queryTokens);
      
      // Basic syntax validation rules
      let hasErrors = false;
      let lastTokenType = null;
      
      for (let i = 0; i < queryTokens.length; i++) {
        const token = queryTokens[i];
        
        // Rule: operator followed by another operator is invalid
        if (['AND', 'OR'].includes(token.type) && ['AND', 'OR'].includes(lastTokenType)) {
          hasErrors = true;
          setError(`Invalid syntax: Cannot have multiple operators (${lastTokenType}, ${token.type}) in sequence`);
          break;
        }
        
        // Rule: query can't end with an operator
        if (i === queryTokens.length - 1 && ['AND', 'OR', 'NOT'].includes(token.type)) {
          hasErrors = true;
          setError(`Invalid syntax: Query cannot end with an operator (${token.type})`);
          break;
        }
        
        // Rule: field must be followed by a value
        if (token.type === 'FIELD') {
          if (i === queryTokens.length - 1) {
            hasErrors = true;
            setError(`Invalid syntax: Field '${token.value}:' must be followed by a value`);
            break;
          }
        }
        
        // Check for unmatched parentheses
        if (token.type === 'LPAREN' || token.type === 'RPAREN') {
          // This would need a more sophisticated check for balancing, omitted for simplicity
        }
        
        lastTokenType = token.type;
      }
      
      if (!hasErrors) {
        setError(null);
      }
      
      setSyntaxValid(!hasErrors);
      return !hasErrors;
    } catch (err) {
      setSyntaxValid(false);
      setError(`Syntax error: ${err.message}`);
      return false;
    }
  };

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
        // For advanced mode, validate the query first
        const isValid = validateAdvancedQuery(advancedQuery);
        
        if (isValid || !advancedQuery.trim()) {
          // Even if syntax is invalid but query is empty, we should reset filtering
          onFilterChange({ 
            mode: 'advanced',
            query: advancedQuery
          });
        }
      }
    }, 350); // Slightly longer debounce for more complex queries

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
      setError(null);
      setSyntaxValid(true);
      setTokens([]);
    }
    inputRef.current?.focus();
  };

  const handleAdvancedQueryChange = (e) => {
    setAdvancedQuery(e.target.value);
  };

  // Helper for inserting syntax at cursor
  const insertSyntaxHelper = (syntax) => {
    const input = inputRef.current;
    if (!input) return;
    
    const startPos = input.selectionStart;
    const endPos = input.selectionEnd;
    const currentValue = advancedQuery;
    
    // Insert the syntax at cursor position with spacing
    let newValue;
    if (startPos === endPos) {
      // If no text is selected, just insert the syntax
      if (syntax === 'AND' || syntax === 'OR' || syntax === 'NOT') {
        // For operators, ensure spaces around them
        const needsSpaceBefore = startPos > 0 && currentValue[startPos - 1] !== ' ';
        const needsSpaceAfter = startPos < currentValue.length && currentValue[startPos] !== ' ';
        
        newValue = currentValue.substring(0, startPos) + 
                   (needsSpaceBefore ? ' ' : '') + 
                   syntax + 
                   (needsSpaceAfter ? ' ' : '') + 
                   currentValue.substring(endPos);
        
        // New cursor position after inserted syntax and any spaces
        const newCursorPos = startPos + syntax.length + 
                           (needsSpaceBefore ? 1 : 0) + 
                           (needsSpaceAfter ? 1 : 0);
                           
        setAdvancedQuery(newValue);
        
        // Set cursor position after the inserted syntax
        setTimeout(() => {
          input.focus();
          input.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
      } else {
        // For field:value template, position cursor inside
        newValue = currentValue.substring(0, startPos) + 
                   syntax +
                   currentValue.substring(endPos);
        
        // Position cursor after the colon in field:
        const colonPos = startPos + syntax.indexOf(':') + 1;
        
        setAdvancedQuery(newValue);
        
        // Set cursor after the colon
        setTimeout(() => {
          input.focus();
          input.setSelectionRange(colonPos, colonPos);
        }, 0);
      }
    } else {
      // If text is selected, wrap it or replace it
      if (syntax === 'AND' || syntax === 'OR' || syntax === 'NOT') {
        // If it's an operator, prepend it to selection with space
        newValue = currentValue.substring(0, startPos) + 
                   syntax + ' ' + 
                   currentValue.substring(startPos);
        
        // Position cursor after the operator and space
        const newCursorPos = startPos + syntax.length + 1;
        
        setAdvancedQuery(newValue);
        
        setTimeout(() => {
          input.focus();
          input.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
      } else if (syntax.includes(':')) {
        // Field:value pattern - replace selection with field: and selected text as value
        const field = syntax.split(':')[0];
        newValue = currentValue.substring(0, startPos) + 
                   field + ':' + currentValue.substring(startPos, endPos) + 
                   currentValue.substring(endPos);
        
        setAdvancedQuery(newValue);
        
        // Keep the same selection
        setTimeout(() => {
          input.focus();
          input.setSelectionRange(endPos + field.length + 1, endPos + field.length + 1);
        }, 0);
      }
    }
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
                onChange={handleAdvancedQueryChange}
                placeholder="hostname:server AND status:ON_DISK NOT username:admin"
                className={`w-full pl-10 pr-8 py-2 bg-gray-700 border ${
                  !syntaxValid ? 'border-red-500' : 'border-gray-600'
                } rounded-md text-white focus:outline-none focus:ring-2 ${
                  !syntaxValid ? 'focus:ring-red-500' : 'focus:ring-blue-500'
                }`}
                spellCheck={false}
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
              <div className="flex items-center gap-1 text-red-400 text-xs mt-1">
                <AlertCircle size={12} />
                <span>{error}</span>
              </div>
            )}
            
            {/* Quick syntax helpers */}
            <div className="flex flex-wrap gap-1 mt-2">
              <button 
                onClick={() => insertSyntaxHelper('AND')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                AND
              </button>
              <button 
                onClick={() => insertSyntaxHelper('OR')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                OR
              </button>
              <button 
                onClick={() => insertSyntaxHelper('NOT')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                NOT
              </button>
              
              {/* Field shortcuts */}
              <button 
                onClick={() => insertSyntaxHelper('hostname:')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                hostname:
              </button>
              <button 
                onClick={() => insertSyntaxHelper('username:')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                username:
              </button>
              <button 
                onClick={() => insertSyntaxHelper('status:')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                status:
              </button>
              <button 
                onClick={() => insertSyntaxHelper('command:')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                command:
              </button>
              <button 
                onClick={() => insertSyntaxHelper('internal_ip:')}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                internal_ip:
              </button>
            </div>
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
              <p className="mt-1"><code>internal_ip:192.168 AND username:admin AND NOT status:CLEANED</code> - Find logs with IP starting with 192.168, username admin, excluding cleaned status</p>
            </div>
            
            {/* New: Common search patterns section */}
            <div className="mt-3">
              <h5 className="font-medium text-white">Common Search Patterns</h5>
              <div className="mt-1 space-y-1">
                <button 
                  onClick={() => setAdvancedQuery('status:ON_DISK AND username:admin')}
                  className="block px-2 py-1 text-xs bg-gray-800 hover:bg-gray-600 rounded w-full text-left"
                >
                  Find admin user's files on disk
                </button>
                <button 
                  onClick={() => setAdvancedQuery('command:"sudo" AND NOT status:CLEANED')}
                  className="block px-2 py-1 text-xs bg-gray-800 hover:bg-gray-600 rounded w-full text-left"
                >
                  Find sudo commands that haven't been cleaned
                </button>
                <button 
                  onClick={() => setAdvancedQuery('internal_ip:192.168 AND external_ip:10.')}
                  className="block px-2 py-1 text-xs bg-gray-800 hover:bg-gray-600 rounded w-full text-left"
                >
                  Find specific internal/external IP pattern
                </button>
              </div>
            </div>
            
            {/* Tips for complex queries */}
            <div className="mt-3 bg-blue-900/30 p-2 rounded border border-blue-800">
              <h5 className="font-medium text-blue-300">Tips for Complex Queries</h5>
              <ul className="list-disc pl-5 mt-1 text-xs">
                <li>Use quick buttons above to insert operators and fields</li>
                <li>Queries are evaluated from left to right</li>
                <li>Use multiple AND/OR operators for complex filters (more than 2 conditions)</li>
                <li>Be specific with field names to avoid ambiguity</li>
                <li>Query syntax works with more than 3 conditions (e.g., <code>field1:value1 AND field2:value2 AND field3:value3 AND field4:value4</code>)</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchFilter;