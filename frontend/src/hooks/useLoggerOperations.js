// frontend/src/hooks/useLoggerOperations.js
import { useState, useEffect } from 'react';
import { useLoggerApi } from './useLoggerApi';
import { COLUMNS } from '../utils/constants';

export const useLoggerOperations = (currentUser, csrfToken) => {
  // Get user role from both localStorage and props
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = storedUser.role === 'admin' || currentUser?.role === 'admin';

  const getInitialRowsPerPage = () => {
    try {
      const username = currentUser?.username;
      if (!username) return 25;
      const savedPreference = localStorage.getItem(`${username}_rowsPerPage`);
      return savedPreference ? parseInt(savedPreference) : 25;
    } catch {
      return 25;
    }
  };

  // State
  const [logs, setLogs] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCell, setExpandedCell] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(getInitialRowsPerPage());

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
  }, [csrfToken]);

  // Handlers
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    setEditingCell(null);
    setEditingValue('');
    setExpandedCell(null);
  };

  const handleRowsPerPageChange = (newRowsPerPage) => {
    try {
      const username = currentUser?.username;
      if (username) {
        localStorage.setItem(`${username}_rowsPerPage`, newRowsPerPage.toString());
      }
    } catch (error) {
      console.error('Failed to save row preference:', error);
    }
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1);
    setEditingCell(null);
    setEditingValue('');
    setExpandedCell(null);
  };

  const handleCellClick = (rowId, field) => {
    if (field === 'analyst') return;
    const row = logs.find(log => log.id === rowId);
    if (row && !row.locked) {
      setEditingCell({ rowId, field });
      setEditingValue(row[field]);
    }
  };

  const handleCellChange = (e) => {
    setEditingValue(e.target.value);
  };

  const handleCellBlur = async (e, rowId, field) => {
    const isMovingToAnotherInput = e.relatedTarget && e.relatedTarget.tagName === 'INPUT';
    if (isMovingToAnotherInput) return;

    try {
      if (field !== 'analyst') {
        await updateLog(rowId, { [field]: editingValue });
        setLogs(prevLogs => sortLogs(prevLogs.map(log => 
          log.id === rowId ? { ...log, [field]: editingValue } : log
        )));
      }
      setEditingCell(null);
      setEditingValue('');
    } catch (err) {
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
          await updateLog(currentRowId, { [currentField]: currentValue });
          setLogs(prevLogs => sortLogs(prevLogs.map(log => 
            log.id === currentRowId ? { ...log, [currentField]: currentValue } : log
          )));
        }
  
        const nextValue = nextRow[nextField] || '';
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
        hostname: '',
        domain: '',
        user: '',
        command: '',
        notes: '',
        filename: '',
        status: '',
        analyst: currentUser.username,
        locked: false,
        locked_by: null
      };
      
      const createdRow = await createLog(newRow);
      setLogs(prevLogs => sortLogs([...prevLogs, createdRow]));
    } catch (err) {
      // Error is handled by useLoggerApi
    }
  };

  const handleDeleteRow = async (rowId) => {
    if (!isAdmin) return;

    try {
      await deleteLog(rowId);
      setLogs(prevLogs => sortLogs(prevLogs.filter(log => log.id !== rowId)));
    } catch (err) {
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleExpand = (rowId, field) => {
    setExpandedCell(current => 
      current?.rowId === rowId && current?.field === field ? null : { rowId, field }
    );
  };

  // Calculate pagination values
  const totalPages = Math.ceil(logs.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentLogs = logs.slice(startIndex, endIndex);

  return {
    logs: currentLogs,
    loading,
    error,
    isAdmin,
    tableState: {
      editingCell,
      editingValue,
      expandedCell,
      currentPage,
      totalPages,
      rowsPerPage,
      totalRows: logs.length
    },
    handlers: {
      handlePageChange,
      handleRowsPerPageChange,
      handleCellClick,
      handleCellChange,
      handleCellBlur,
      handleKeyDown,
      handleToggleLock,
      handleAddRow,
      handleDeleteRow,
      handleExpand
    }
  };
};