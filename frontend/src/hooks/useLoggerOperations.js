// frontend/src/hooks/useLoggerOperations.js - Updated with operations support
import { useState, useEffect } from 'react';
import { useLoggerApi } from './useLoggerApi';
import { COLUMNS } from '../utils/constants';

export const useLoggerOperations = (currentUser, csrfToken) => {
  // Get user role from both localStorage and props
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = storedUser.role === 'admin' || currentUser?.role === 'admin';

  // State
  const [logs, setLogs] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCell, setExpandedCell] = useState(null);
  const [activeOperation, setActiveOperation] = useState(null); // NEW: Add active operation state

  const {
    error,
    setError,
    fetchLogs,
    updateLog,
    deleteLog,
    createLog
  } = useLoggerApi(csrfToken);

  // Sorting function
  const sortLogs = (logs) => {
    return [...logs].sort((a, b) => {
      const timeCompare = new Date(b.timestamp) - new Date(a.timestamp);
      if (timeCompare !== 0) return timeCompare;
      return b.id - a.id;
    });
  };

  // Fetch logs
  useEffect(() => {
    const loadLogs = async () => {
      const data = await fetchLogs();
      if (data) {
        // NEW: Handle new response format with operations
        if (data.logs && data.activeOperation !== undefined) {
          setLogs(sortLogs(data.logs));
          setActiveOperation(data.activeOperation);
        } else if (Array.isArray(data)) {
          // Fallback for old format
          setLogs(sortLogs(data));
          setActiveOperation(null);
        } else {
          // Handle unexpected format
          console.warn('Unexpected data format from fetchLogs:', data);
          setLogs([]);
        }
      }
      setLoading(false);
    };

    loadLogs();
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [csrfToken]); // Removed fetchLogs from the dependency array to prevent infinite loops

  // Cell editing handlers
  const handleCellClick = (rowId, field) => {
    if (field === 'analyst') return;
    const row = logs.find(log => log.id === rowId);
    if (row && !row.locked) {
      setEditingCell({ rowId, field });
      
      // FIXED: Handle all field values properly
      let initialValue = row[field];
      
      // Convert null/undefined to empty string for editing
      if (initialValue === null || initialValue === undefined) {
        initialValue = '';
      }
      // Check for object representations and convert to empty string
      else if (typeof initialValue === 'object') {
        console.warn(`Field ${field} contains object:`, initialValue);
        initialValue = '';
      }
      // Ensure we're working with a string
      else {
        initialValue = String(initialValue);
      }
      
      setEditingValue(initialValue);
      console.log(`Editing ${field} with value:`, initialValue);
    }
  };

  const handleCellChange = (e) => {
    // Directly use the event target value without any transformation
    setEditingValue(e.target.value);
  };

  const handleCellBlur = async (e, rowId, field) => {
    const isMovingToAnotherInput = e.relatedTarget && e.relatedTarget.tagName === 'INPUT';
    if (isMovingToAnotherInput) return;

    try {
      if (field !== 'analyst') {
        // FIXED: Handle empty strings properly for the secrets field
        let valueToSend = editingValue;
        
        // Special handling for the secrets field
        if (field === 'secrets') {
          // If the value is empty string, null, or undefined, send null
          if (valueToSend === '' || valueToSend === null || valueToSend === undefined) {
            valueToSend = null;
          }
          // Ensure we're not sending any object representations
          else if (typeof valueToSend === 'object') {
            console.error('Attempting to send object for secrets field:', valueToSend);
            valueToSend = null;
          }
        }
        
        console.log(`Updating ${field} with value:`, valueToSend);
        
        // Send the value to the server
        const result = await updateLog(rowId, { [field]: valueToSend });
        
        // Update the local logs state with the exact same value
        setLogs(prevLogs => sortLogs(prevLogs.map(log => 
          log.id === rowId ? { ...log, [field]: valueToSend } : log
        )));
        
        console.log('Update result:', result);
      }
      setEditingCell(null);
      setEditingValue('');
    } catch (err) {
      console.error('Error updating cell:', err);
      setEditingCell(null);
      setEditingValue('');
    }
  };

  const handleKeyDown = (e, rowId, field) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      moveToNextCell(rowId, field, editingValue);
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      setEditingValue(prev => prev + '\n');
    }
  };

  const moveToNextCell = async (currentRowId, currentField, currentValue) => {
    if (currentField === 'analyst') return;
    
    const currentRowIndex = logs.findIndex(log => log.id === currentRowId);
    const currentColumnIndex = COLUMNS.findIndex(col => col.field === currentField);
    
    let nextRowId = currentRowId;
    let nextField = currentField;
    let nextColumnIndex = currentColumnIndex;
    
    do {
      nextColumnIndex++;
      if (nextColumnIndex >= COLUMNS.length) {
        nextColumnIndex = 0;
        nextRowId = logs[currentRowIndex + 1]?.id;
        if (!nextRowId) return;
      }
      nextField = COLUMNS[nextColumnIndex].field;
    } while (nextField === 'analyst');

    const nextRow = logs.find(log => log.id === nextRowId);
  
    if (nextRow && !nextRow.locked) {
      try {
        if (currentField !== 'analyst') {
          // FIXED: Handle empty values properly when tabbing
          let valueToSend = currentValue;
          
          if (currentField === 'secrets') {
            if (valueToSend === '' || valueToSend === null || valueToSend === undefined) {
              valueToSend = null;
            }
          }
          
          console.log(`Tab updating ${currentField} with value:`, valueToSend);
          
          await updateLog(currentRowId, { [currentField]: valueToSend });
          
          setLogs(prevLogs => sortLogs(prevLogs.map(log => 
            log.id === currentRowId ? { ...log, [currentField]: valueToSend } : log
          )));
        }
  
        // Set the next cell's value, ensuring proper handling
        let nextValue = nextRow[nextField];
        
        if (nextValue === null || nextValue === undefined) {
          nextValue = '';
        } else if (typeof nextValue === 'object') {
          console.warn(`Next field ${nextField} contains object:`, nextValue);
          nextValue = '';
        } else {
          nextValue = String(nextValue);
        }
        
        setEditingCell({ rowId: nextRowId, field: nextField });
        setEditingValue(nextValue);
      } catch (err) {
        console.error('Failed to update cell:', err);
      }
    }
  };

  const handleToggleLock = async (rowId) => {
    try {
      const row = logs.find(log => log.id === rowId);
      
      if (row.locked && !isAdmin && row.locked_by !== currentUser.username) {
        setError(`Only ${row.locked_by} or an admin can unlock this record`);
        return;
      }

      const newLockState = !row.locked;
      await updateLog(rowId, {
        locked: newLockState,
        locked_by: newLockState ? currentUser.username : null
      });

      setLogs(prevLogs => sortLogs(prevLogs.map(log => 
        log.id === rowId 
          ? { ...log, locked: newLockState, locked_by: newLockState ? currentUser.username : null }
          : log
      )));
    } catch (err) {
      console.error('Error toggling lock:', err);
      setError('Failed to toggle lock status');
    }
  };

  const handleAddRow = async () => {
    try {
      const newLog = await createLog({
        analyst: currentUser.username
      });

      if (newLog) {
        setLogs(prevLogs => sortLogs([newLog, ...prevLogs]));
        
        // Notify relation service about new row with timeout
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
          
          await fetch('/relation-service/api/relations/analyze', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'CSRF-Token': csrfToken
            },
            body: JSON.stringify({ logId: newLog.id }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          console.log('Analysis triggered for new row');
        } catch (analyzeError) {
          if (analyzeError.name === 'AbortError') {
            console.log('Analysis request timed out, but processing continues on server');
          } else {
            console.error('Error triggering analysis:', analyzeError);
          }
        }
      }
    } catch (err) {
      console.error('Error adding new row:', err);
      setError('Failed to add new row');
    }
  };

  const handleAddRowWithTemplate = async (templateData) => {
    try {
      // Remove any fields that shouldn't be sent to the API
      const cleanTemplateData = { ...templateData };
      delete cleanTemplateData.id;
      delete cleanTemplateData.timestamp;
      delete cleanTemplateData.created_at;
      delete cleanTemplateData.updated_at;
      
      // Add the current user as analyst
      cleanTemplateData.analyst = currentUser.username;
      
      const newLog = await createLog(cleanTemplateData);

      if (newLog) {
        setLogs(prevLogs => sortLogs([newLog, ...prevLogs]));
        
        // Notify relation service about new row with timeout
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
          
          await fetch('/relation-service/api/relations/analyze', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'CSRF-Token': csrfToken
            },
            body: JSON.stringify({ logId: newLog.id }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          console.log('Analysis triggered for new row from template');
        } catch (analyzeError) {
          if (analyzeError.name === 'AbortError') {
            console.log('Analysis request timed out, but processing continues on server');
          } else {
            console.error('Error triggering analysis:', analyzeError);
          }
        }
      }
      
      return newLog;
    } catch (err) {
      console.error('Error adding new row with template:', err);
      setError('Failed to add new row with template');
      return null;
    }
  };

  const handleUpdateRowWithTemplate = async (templateData, rowId) => {
    try {
      // Clean up template data before sending
      const cleanTemplateData = { ...templateData };
      delete cleanTemplateData.id;
      delete cleanTemplateData.timestamp;
      delete cleanTemplateData.created_at;
      delete cleanTemplateData.updated_at;
      delete cleanTemplateData.analyst;
      delete cleanTemplateData.locked;
      delete cleanTemplateData.locked_by;
      
      // Update the row with template data
      const updatedRow = await updateLog(rowId, cleanTemplateData);
      
      // Update local state
      setLogs(prevLogs => sortLogs(prevLogs.map(log => 
        log.id === rowId ? { ...log, ...templateData } : log
      )));
      
      console.log('Successfully updated log with template data', updatedRow);
      
      // Notify relation service about template updates with timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
        
        await fetch('/relation-service/api/relations/notify/template-update', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'CSRF-Token': csrfToken
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log('Template update notification sent after row update');
      } catch (analyzeError) {
        if (analyzeError.name === 'AbortError') {
          console.log('Template update notification timed out, but processing continues on server');
        } else {
          console.error('Error triggering relation analysis:', analyzeError);
        }
      }
      
      return updatedRow;
    } catch (err) {
      console.error('Error updating row with template:', err);
      setError('Failed to update log with template data');
      return null;
    }
  };

  const handleDeleteRow = async (rowId) => {
    try {
      await deleteLog(rowId);
      setLogs(prevLogs => prevLogs.filter(log => log.id !== rowId));
    } catch (err) {
      console.error('Error deleting row:', err);
      setError('Failed to delete row');
    }
  };

  const handleExpand = (rowId, field) => {
    if (expandedCell?.rowId === rowId && expandedCell?.field === field) {
      setExpandedCell(null);
    } else {
      setExpandedCell({ rowId, field });
    }
  };

  return {
    logs,
    loading,
    error,
    isAdmin,
    activeOperation, // NEW: Include active operation in return
    tableState: {
      editingCell,
      editingValue,
      expandedCell
    },
    handlers: {
      handleCellClick,
      handleCellChange,
      handleCellBlur,
      handleKeyDown,
      handleToggleLock,
      handleAddRow,
      handleAddRowWithTemplate,
      handleUpdateRowWithTemplate,
      handleDeleteRow,
      handleExpand
    }
  };
};

export default useLoggerOperations;