// frontend/src/hooks/usePagination.js
import { useState, useEffect } from 'react';

export const usePagination = (items, currentUser = null) => {
  // Get initial rows per page from local storage if available
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
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(getInitialRowsPerPage());

  // Reset to page 1 if items length changes significantly
  useEffect(() => {
    if (currentPage > 1 && (currentPage - 1) * rowsPerPage >= items.length) {
      setCurrentPage(1);
    }
  }, [items.length, currentPage, rowsPerPage]);

  // Handle page change
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Handle rows per page change
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
  };

  // Calculate pagination values
  const totalPages = Math.ceil(items.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    currentPage,
    totalPages,
    rowsPerPage,
    totalRows: items.length,
    paginatedItems,
    handlePageChange,
    handleRowsPerPageChange
  };
};

export default usePagination;