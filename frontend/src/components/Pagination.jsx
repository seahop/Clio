// frontend/src/components/Pagination.jsx
import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const rowsPerPageOptions = [25, 50, 100, 150, 200];

const Pagination = ({ 
  currentPage, 
  totalPages, 
  rowsPerPage, 
  totalRows,
  onPageChange,
  onRowsPerPageChange
}) => {
  // Treat an empty result set (totalPages < 1) as a single page so the label
  // reads "1 / 1" and navigation stays disabled
  const displayTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-2 sm:px-4 sm:py-3 bg-surface border-t border-line">
      <div className="flex items-center text-sm text-muted mb-2 sm:mb-0">
        <span className="mr-2 sm:mr-4">Rows per page:</span>
        <select
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
          className="bg-surface-2 border border-line text-content px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {rowsPerPageOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <span className="ml-2 sm:ml-4 text-xs sm:text-sm">
          Showing {Math.min((currentPage - 1) * rowsPerPage + 1, totalRows)} - {Math.min(currentPage * rowsPerPage, totalRows)} of {totalRows}
        </span>
      </div>

      <div className="flex items-center space-x-1 sm:space-x-2">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-muted hover:bg-surface-2"
          title="First Page"
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-muted hover:bg-surface-2"
          title="Previous Page"
        >
          <ChevronLeft size={18} />
        </button>

        <span className="text-muted px-1">
          {currentPage} / {displayTotalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= displayTotalPages}
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-muted hover:bg-surface-2"
          title="Next Page"
        >
          <ChevronRight size={18} />
        </button>
        <button
          onClick={() => onPageChange(displayTotalPages)}
          disabled={currentPage >= displayTotalPages}
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-muted hover:bg-surface-2"
          title="Last Page"
        >
          <ChevronsRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;