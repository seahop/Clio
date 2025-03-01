// components/LoggerTable/TablePagination.jsx
import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const rowsPerPageOptions = [25, 50, 100, 150, 200];

const TablePagination = ({ 
  currentPage, 
  totalPages, 
  rowsPerPage, 
  totalRows,
  onPageChange, 
  onRowsPerPageChange 
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-2 sm:px-4 sm:py-3 bg-gray-800 border-t border-gray-700">
      <div className="flex items-center text-sm text-gray-400 mb-2 sm:mb-0">
        <span className="mr-2 sm:mr-4">Rows per page:</span>
        <select
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
          className="bg-gray-700 border border-gray-600 text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-700"
          title="First Page"
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-700"
          title="Previous Page"
        >
          <ChevronLeft size={18} />
        </button>
        
        <span className="text-gray-400 px-1">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-700"
          title="Next Page"
        >
          <ChevronRight size={18} />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-700"
          title="Last Page"
        >
          <ChevronsRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;