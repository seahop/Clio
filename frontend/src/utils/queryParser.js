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
   * Parse query string into structured conditions
   * @param {string} query - The query string
   * @returns {Array} Array of parsed conditions 
   */
  const parseQueryConditions = (query) => {
    // Handle simple field:value pair without operators
    if (!query.match(/\s(AND|OR|NOT)\s/i) && query.includes(':')) {
      const parts = query.split(':');
      if (parts.length === 2) {
        const field = parts[0].trim();
        const value = parts[1].trim();
        // Handle quoted values
        const actualValue = value.startsWith('"') && value.endsWith('"') 
          ? value.slice(1, -1) 
          : value;
        
        return [{
          type: 'condition',
          field: field,
          value: actualValue,
          negate: false,
          operator: 'AND' // Default operator
        }];
      }
    }
  
    try {
      // Tokenize the query
      const tokens = tokenizeQuery(query);
      
      // Process tokens into a structured AST-like representation
      const conditions = [];
      let currentField = null;
      let currentOp = 'AND'; // Default operator
      let negateNext = false;
      let groupStarted = false;
  
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
                operator: currentOp,
                group: groupStarted
              });
              currentField = null;
            } else {
              // Term without a field - search across all fields
              conditions.push({
                type: 'condition',
                field: 'all',
                value: token.value,
                negate: negateNext,
                operator: currentOp,
                group: groupStarted
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
            
          case 'LPAREN':
            groupStarted = true;
            break;
            
          case 'RPAREN':
            groupStarted = false;
            break;
        }
      }
      
      return conditions;
    } catch (error) {
      console.error('Error parsing query:', error);
      
      // Fallback for simple queries with a single field
      if (query.includes(':')) {
        const parts = query.split(':');
        if (parts.length >= 2) {
          // Handle the case where there might be multiple colons (like in URLs)
          const field = parts[0].trim();
          const value = parts.slice(1).join(':').trim();
          
          return [{
            type: 'condition',
            field,
            value,
            negate: false,
            operator: 'AND'
          }];
        }
      }
      
      // Last resort - search all fields
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
    if (!conditions || conditions.length === 0) {
      return true; // No conditions means match everything
    }
    
    // Create separate stacks for AND and OR groups
    let result = true; // Start assuming everything matches for AND conditions
    let orGroupResult = false; // Start assuming nothing matches for OR conditions
    let isProcessingOrGroup = false;
    
    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const matches = evaluateSingleCondition(log, condition);
      
      // Check if we're starting a new operator group
      if (i > 0 && condition.operator !== conditions[i-1].operator) {
        if (condition.operator === 'OR') {
          // Starting an OR group after AND conditions
          isProcessingOrGroup = true;
          orGroupResult = matches;
        } else if (condition.operator === 'AND') {
          // Starting an AND group after OR conditions
          // Combine previous OR results with the overall result
          if (isProcessingOrGroup) {
            result = result && orGroupResult;
            isProcessingOrGroup = false;
          }
          // Reset for new AND conditions
          result = result && matches;
        }
      } else {
        // Continue with same operator
        if (isProcessingOrGroup || condition.operator === 'OR') {
          isProcessingOrGroup = true;
          orGroupResult = orGroupResult || matches;
        } else {
          result = result && matches;
        }
      }
    }
    
    // Make sure to combine any final OR group with the overall result
    if (isProcessingOrGroup) {
      result = result && orGroupResult;
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
    const actualFieldName = fieldAliases[field.toLowerCase()] || field;
    
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
    
    // Handle exact matches for quoted values vs. partial matches
    let matches;
    if (condition.quoted) {
      // For quoted values, require exact match (case-insensitive)
      matches = String(fieldValue).toLowerCase() === value.toLowerCase();
    } else {
      // For regular terms, check if the field contains the value (case-insensitive)
      matches = String(fieldValue).toLowerCase().includes(value.toLowerCase());
    }
    
    // Apply negation if needed
    return negate ? !matches : matches;
  };
  
  /**
   * Matches log against advanced query
   * @param {Object} log - Log entry to check
   * @param {Object} queryFilter - Query filter object
   * @returns {boolean} Whether the log matches
   */
  export const matchesAdvancedQuery = (log, queryFilter) => {
    if (!queryFilter.query || queryFilter.query.trim() === '') {
      return true; // Empty query matches everything
    }
  
    try {
      const query = queryFilter.query.trim();
      
      // Basic validation for incomplete queries
      if (/^(AND|OR|NOT|\s)*$/i.test(query) || query.endsWith(':') || 
          /:\s*$/.test(query) || /\s+(AND|OR|NOT)$/i.test(query)) {
        return true; // Show all logs for incomplete queries
      }
      
      // Parse query into conditions
      const conditions = parseQueryConditions(query);
      
      if (!conditions || conditions.length === 0) {
        return true; // No valid conditions - show all logs
      }
      
      // Evaluate conditions against the log
      return evaluateConditions(log, conditions);
    } catch (error) {
      console.error('Error evaluating query:', error);
      return true; // On error, show all logs
    }
  };
  
  /**
   * Process a complete search filter
   * @param {Object} filter - The filter object from the search component
   * @returns {Function} Function that takes a log and returns boolean for match
   */
  export const createFilterFunction = (filter) => {
    return (log) => {
      try {
        // First check date range filter
        if (filter.dateRange?.start || filter.dateRange?.end) {
          const logDate = new Date(log.timestamp);
          
          if (filter.dateRange.start && logDate < filter.dateRange.start) {
            return false;
          }
          
          if (filter.dateRange.end && logDate > filter.dateRange.end) {
            return false;
          }
        }
        
        // Then check search filter
        if (!filter.searchFilter || !filter.searchFilter.mode) {
          return true; // No search filter means match everything
        }
        
        if (filter.searchFilter.mode === 'simple') {
          // Simple mode search
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
        
        // Advanced mode search
        if (filter.searchFilter.mode === 'advanced') {
          return matchesAdvancedQuery(log, filter.searchFilter);
        }
        
        return true; // Default to matching everything
      } catch (error) {
        console.error('Error in filter function:', error);
        return true; // On error, include the log (fail open)
      }
    };
  };