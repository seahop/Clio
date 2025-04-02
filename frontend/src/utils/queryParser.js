// src/utils/queryParser.js

/**
 * Tokenizes a query string into individual terms
 * @param {string} query - The query string to tokenize
 * @returns {Array} Array of tokens with type and value
 */
export const tokenizeQuery = (query) => {
    // Define regex patterns for different token types
    const patterns = [
      { type: 'AND', regex: /^AND(?!\w)/i },
      { type: 'OR', regex: /^OR(?!\w)/i },
      { type: 'NOT', regex: /^NOT(?!\w)/i },
      { type: 'LPAREN', regex: /^\(/ },
      { type: 'RPAREN', regex: /^\)/ },
      { type: 'FIELD', regex: /^(\w+):/ },
      { type: 'QUOTED', regex: /^"([^"]*)"/ },
      { type: 'TERM', regex: /^[\w\d*.\-_]+/ },
      { type: 'WHITESPACE', regex: /^\s+/ },
    ];
  
    const tokens = [];
    let remainingQuery = query.trim();
  
    // Continue tokenizing until the query is empty
    while (remainingQuery.length > 0) {
      let matched = false;
  
      // Try each pattern in order
      for (const pattern of patterns) {
        const match = remainingQuery.match(pattern.regex);
        
        if (match) {
          const value = match[0];
          
          // Skip whitespace but track all other tokens
          if (pattern.type !== 'WHITESPACE') {
            // For field tokens, extract just the field name without the colon
            if (pattern.type === 'FIELD') {
              tokens.push({
                type: pattern.type,
                value: value.slice(0, -1), // Remove the colon
              });
            } 
            // For quoted strings, extract just the content without quotes
            else if (pattern.type === 'QUOTED') {
              tokens.push({
                type: pattern.type,
                value: match[1], // The captured group without quotes
              });
            } else {
              tokens.push({
                type: pattern.type,
                value,
              });
            }
          }
          
          // Remove the matched portion from the query
          remainingQuery = remainingQuery.substring(value.length);
          matched = true;
          break;
        }
      }
  
      // If no patterns matched, there's an invalid character
      if (!matched) {
        throw new Error(`Invalid character in query: ${remainingQuery[0]}`);
      }
    }
  
    return tokens;
  };
  
  /**
   * Parses tokenized query into a structured query object
   * @param {Array} tokens - Tokenized query
   * @returns {Object} Structured query object
   */
  export const parseTokensToQuery = (tokens) => {
    // Skip implementation for now
    // In a full implementation, this would build an AST from the tokens
    return { tokens };
  };
  
  /**
   * Evaluates if a log entry matches the query
   * @param {Object} log - Log entry to check
   * @param {Object} queryFilter - Query filter object
   * @returns {boolean} Whether the log matches the query
   */
  export const matchesAdvancedQuery = (log, queryFilter) => {
    if (!queryFilter.query || queryFilter.query.trim() === '') {
      return true; // Empty query matches everything
    }
  
    try {
      const query = queryFilter.query.trim();
      
      // Check if the query is an incomplete or operators-only query
      // This allows users to see results while typing advanced queries
      const operatorsOnly = /^(AND|OR|NOT|\s)*$/i.test(query);
      if (operatorsOnly) {
        return true; // Show all logs for operator-only queries (incomplete queries)
      }
      
      // Check for incomplete field:value pair (typing in progress)
      if (query.endsWith(':') || /:\s*$/.test(query)) {
        return true; // Show all logs when user has typed "field:" but not the value yet
      }
      
      // Check for value-less operators (e.g., "field:value AND" without second condition)
      if (/\s+(AND|OR|NOT)$/i.test(query)) {
        return true; // Show all logs when user has typed "AND", "OR", or "NOT" at the end
      }
      
      // Split the query into conditions
      const conditions = parseQueryConditions(query);
      
      // If no valid conditions were parsed, show all logs
      if (!conditions || conditions.length === 0) {
        return true;
      }
      
      // Evaluate all conditions
      return evaluateConditions(log, conditions);
    } catch (error) {
      console.error('Error evaluating query:', error);
      // For parser errors, show all logs rather than filtering everything out
      return true; 
    }
  };
  
  /**
   * Parse query string into structured conditions
   * @param {string} query - The query string
   * @returns {Object} Parsed conditions object
   */
  const parseQueryConditions = (query) => {
    // Special case: If the query doesn't contain any operators but does have a colon,
    // it might be a simple field:value pair
    if (!query.match(/\s(AND|OR|NOT)\s/i) && query.includes(':')) {
      const parts = query.split(':');
      if (parts.length === 2) {
        const field = parts[0].trim();
        const value = parts[1].trim();
        return [{
          type: 'condition',
          field: field,
          value: value,
          negate: false,
          operator: 'AND'
        }];
      }
    }
  
    // For more complex queries, use the tokenizer
    try {
      // First tokenize the query
      const tokens = tokenizeQuery(query);
      
      // Simple parsing strategy:
      // 1. Group tokens into field:value pairs and operators
      // 2. Process NOT operators
      // 3. Process AND operators
      // 4. Process OR operators
      
      // For this simplified version, we'll just create an array of conditions
      const conditions = [];
      let currentField = null;
      let currentOp = 'AND'; // Default operator between terms is AND
      let negateNext = false;
  
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        switch (token.type) {
          case 'FIELD':
            currentField = token.value;
            break;
            
          case 'TERM':
          case 'QUOTED':
            // If we have a field, this is a field:value pair
            if (currentField) {
              conditions.push({
                type: 'condition',
                field: currentField,
                value: token.value,
                negate: negateNext,
                operator: currentOp
              });
              currentField = null;
            } else {
              // This is a term without a field - search all fields
              conditions.push({
                type: 'condition',
                field: 'all',
                value: token.value,
                negate: negateNext,
                operator: currentOp
              });
            }
            negateNext = false;
            break;
            
          case 'AND':
            currentOp = 'AND';
            break;
            
          case 'OR':
            currentOp = 'OR';
            break;
            
          case 'NOT':
            negateNext = true;
            break;
        }
      }
      
      // Add a simplified log to help debugging
      console.log('Parsed conditions:', conditions);
      
      return conditions;
    } catch (error) {
      console.error('Error parsing query:', error);
      
      // Fallback to a very basic parser for simple queries
      if (query.includes(':')) {
        const parts = query.split(':');
        if (parts.length === 2) {
          return [{
            type: 'condition',
            field: parts[0].trim(),
            value: parts[1].trim(),
            negate: false,
            operator: 'AND'
          }];
        }
      }
      
      // Return a condition that matches all as last resort
      return [{
        type: 'condition',
        field: 'all',
        value: query,
        negate: false,
        operator: 'AND'
      }];
    }
  };
  
  /**
   * Evaluate if a log matches the given conditions
   * @param {Object} log - Log entry to check
   * @param {Array} conditions - Parsed conditions 
   * @returns {boolean} Whether the log matches
   */
  const evaluateConditions = (log, conditions) => {
    if (conditions.length === 0) {
      return true; // No conditions means match everything
    }
    
    let result = true; // Start with true for AND operations
    let currentOp = 'AND';
    
    for (const condition of conditions) {
      // Check if this is the start of a new set of conditions with a different operator
      if (condition.operator && condition.operator !== currentOp) {
        // If we're switching to OR and the result is already true, we can short-circuit
        if (condition.operator === 'OR' && result === true) {
          continue;
        }
        
        // If switching to AND and result is false, we need to reset because this is a new clause
        if (condition.operator === 'AND' && currentOp === 'OR' && result === false) {
          result = true;
        }
        
        currentOp = condition.operator;
      }
      
      // Evaluate this condition
      const matches = evaluateSingleCondition(log, condition);
      
      // Combine with previous results based on operator
      if (currentOp === 'AND') {
        result = result && matches;
      } else if (currentOp === 'OR') {
        result = result || matches;
      }
    }
    
    return result;
  };
  
  /**
   * Evaluate a single condition against a log
   * @param {Object} log - Log entry to check
   * @param {Object} condition - Single condition to evaluate
   * @returns {boolean} Whether the condition matches
   */
  const evaluateSingleCondition = (log, condition) => {
    const { field, value, negate } = condition;
    
    // Handle field aliases - map user-friendly names to actual data model field names
    const fieldAliases = {
      'user': 'username',
      'ip': 'internal_ip',
      'ext_ip': 'external_ip',
      'external': 'external_ip',
      'internal': 'internal_ip',
      'mac': 'mac_address',
      'cmd': 'command',
      'host': 'hostname',
      'file': 'filename',
      'hash': 'hash_value',
      'algo': 'hash_algorithm',
      'algorithm': 'hash_algorithm',
      'note': 'notes'
    };
    
    // Resolve the actual field name, taking into account potential aliases
    const actualFieldName = fieldAliases[field] || field;
    
    // Check if searching all fields
    if (actualFieldName === 'all') {
      // Search across all text fields
      const allFieldsMatch = [
        'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
        'username', 'command', 'notes', 'filename', 'status', 'analyst', 
        'hash_algorithm', 'hash_value', 'pid', 'secrets'
      ].some(fieldName => {
        const fieldValue = log[fieldName];
        return fieldValue && 
          String(fieldValue).toLowerCase().includes(value.toLowerCase());
      });
      
      return negate ? !allFieldsMatch : allFieldsMatch;
    }
    
    // Check specific field
    const fieldValue = log[actualFieldName];
    if (!fieldValue) {
      return negate ? true : false; // If field doesn't exist, it's a non-match
    }
    
    // Case-insensitive comparison for text fields
    const matches = String(fieldValue).toLowerCase().includes(value.toLowerCase());
    
    // Apply negation if needed
    return negate ? !matches : matches;
  };
  
  /**
   * Process a complete search filter
   * @param {Object} filter - The filter object from the search component
   * @returns {Function} Function that takes a log and returns boolean for match
   */
  export const createFilterFunction = (filter) => {
    return (log) => {
      try {
        // For date filtering, handle separately
        if (filter.dateRange?.start || filter.dateRange?.end) {
          const logDate = new Date(log.timestamp);
          
          if (filter.dateRange.start && logDate < filter.dateRange.start) {
            return false;
          }
          
          if (filter.dateRange.end && logDate > filter.dateRange.end) {
            return false;
          }
        }
        
        // Handle based on search mode
        if (!filter.searchFilter || !filter.searchFilter.mode) {
          return true; // No search filter, match everything
        }
        
        if (filter.searchFilter.mode === 'simple') {
          // Simple mode uses field:query matching
          const { query, field } = filter.searchFilter;
          if (!query) {
            return true; // Empty query matches everything
          }
          
          // Searching all fields
          if (field === 'all') {
            return [
              'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
              'username', 'command', 'notes', 'filename', 'status', 'analyst',
              'hash_algorithm', 'hash_value', 'pid', 'secrets'
            ].some(fieldName => {
              const value = log[fieldName];
              return value && String(value).toLowerCase().includes(query.toLowerCase());
            });
          }
          
          // Searching specific field
          const value = log[field];
          return value && String(value).toLowerCase().includes(query.toLowerCase());
        }
        
        // Advanced mode
        if (filter.searchFilter.mode === 'advanced') {
          // Add some debug logging
          if (filter.searchFilter.query && !matchesAdvancedQuery(log, filter.searchFilter)) {
            // Only log for logs that are filtered out with a non-empty query
            // console.log('Filtered out log:', log.id, log.username);
            return false;
          }
          return matchesAdvancedQuery(log, filter.searchFilter);
        }
        
        return true; // Default to matching everything
      } catch (error) {
        console.error('Error in filter function:', error);
        return true; // In case of error, include the log (fail open)
      }
    };
  };