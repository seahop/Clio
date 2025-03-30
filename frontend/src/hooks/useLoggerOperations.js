// frontend/src/hooks/useLoggerOperations.js
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
        setLogs(sortLogs(data));
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
      
      // Make sure we're working with a string to avoid issues with special characters
      setEditingValue(row[field] !== null && row[field] !== undefined ? String(row[field]) : '');
      
      console.log(`Editing ${field} with value:`, row[field]);
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
        // Log what we're about to send to the server
        console.log(`Updating ${field} with value:`, editingValue);
        
        // Send the raw value to the server without any processing
        const result = await updateLog(rowId, { [field]: editingValue });
        
        // Update the local logs state with the exact same value we sent
        setLogs(prevLogs => sortLogs(prevLogs.map(log => 
          log.id === rowId ? { ...log, [field]: editingValue } : log
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
          // Log what we're about to send from tab navigation
          console.log(`Tab updating ${currentField} with value:`, currentValue);
          
          // Send raw value to the server without modifications
          await updateLog(currentRowId, { [currentField]: currentValue });
          
          // Update local state with the exact same value
          setLogs(prevLogs => sortLogs(prevLogs.map(log => 
            log.id === currentRowId ? { ...log, [currentField]: currentValue } : log
          )));
        }
  
        // Set the next cell's value, ensuring it's treated as a string
        const nextValue = nextRow[nextField] !== null && nextRow[nextField] !== undefined 
          ? String(nextRow[nextField]) 
          : '';
          
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

      if (newLockState && editingCell?.rowId === rowId) {
        setEditingCell(null);
        setEditingValue('');
      }

      setLogs(prevLogs => sortLogs(prevLogs.map(log => 
        log.id === rowId ? {
          ...log,
          locked: newLockState,
          locked_by: newLockState ? currentUser.username : null
        } : log
      )));
    } catch (err) {
      console.error('Error toggling lock:', err);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleAddRow = async () => {
    try {
      const newRow = {
        timestamp: new Date().toISOString(),
        internal_ip: '',
        external_ip: '',
        mac_address: '',
        hostname: '',
        domain: '',
        username: '',
        command: '',
        notes: '',
        filename: '',
        status: '',
        pid: '',
        analyst: currentUser.username,
        locked: false,
        locked_by: null
      };
      
      const createdRow = await createLog(newRow);
      setLogs(prevLogs => sortLogs([...prevLogs, createdRow]));
    } catch (err) {
      // Error is handled by useLoggerApi
      console.error('Error creating new row:', err);
    }
  };

  // New handler for adding a row with template data
  const handleAddRowWithTemplate = async (templateData) => {
    try {
      // Make sure we have a new timestamp and the current user as analyst
      const newRow = {
        ...templateData,
        timestamp: new Date().toISOString(),
        analyst: currentUser.username,
        locked: false,
        locked_by: null
      };
      
      console.log('Creating new log with template data:', newRow);
      
      // Create the log with the template data
      const createdRow = await createLog(newRow);
      
      // Update the logs state with the new row
      setLogs(prevLogs => sortLogs([...prevLogs, createdRow]));
      
      // Show success message or notification
      console.log('Successfully created new log from template', createdRow);
      
      return createdRow;
    } catch (err) {
      console.error('Error creating new row from template:', err);
      setError('Failed to create new log from template');
      return null;
    }
  };

  const handleDeleteRow = async (rowId) => {
    if (!isAdmin) return;

    try {
      await deleteLog(rowId);
      setLogs(prevLogs => sortLogs(prevLogs.filter(log => log.id !== rowId)));
    } catch (err) {
      console.error('Error deleting row:', err);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleExpand = (rowId, field) => {
    setExpandedCell(current => 
      current?.rowId === rowId && current?.field === field ? null : { rowId, field }
    );
  };

  const handleUpdateRowWithTemplate = async (rowId, templateData) => {
    try {
      if (!rowId) {
        console.error('Cannot update row: No row ID provided');
        setError('Failed to update log: No row ID provided');
        return null;
      }
  
      console.log('Updating existing log with template data:', templateData);
      console.log('Row ID to update:', rowId);
      
      // Send the update to the server
      const updatedRow = await updateLog(rowId, templateData);
      
      // Update the logs state with the updated row
      setLogs(prevLogs => sortLogs(prevLogs.map(log => 
        log.id === rowId ? { ...log, ...templateData } : log
      )));
      
      console.log('Successfully updated log with template data', updatedRow);
      
      return updatedRow;
    } catch (err) {
      console.error('Error updating row with template:', err);
      setError('Failed to update log with template data');
      return null;
    }
  };

  return {
    logs,
    loading,
    error,
    isAdmin,
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