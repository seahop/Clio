// src/components/DateRangeFilter.jsx
import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronDown, X } from 'lucide-react';

const DateRangeFilter = ({ onFilterChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Track pending filter changes
  const [pendingStartDate, setPendingStartDate] = useState('');
  const [pendingEndDate, setPendingEndDate] = useState('');
  const [pendingStartTime, setPendingStartTime] = useState('00:00');
  const [pendingEndTime, setPendingEndTime] = useState('23:59');
  
  // Initialize pending values when opening the filter
  useEffect(() => {
    if (isOpen) {
      setPendingStartDate(startDate);
      setPendingEndDate(endDate);
      setPendingStartTime(startTime);
      setPendingEndTime(endTime);
    }
  }, [isOpen, startDate, endDate, startTime, endTime]);

  // Apply the filter based on current pending values
  const applyFilter = () => {
    // Update the actual filter values from pending values
    setStartDate(pendingStartDate);
    setEndDate(pendingEndDate);
    setStartTime(pendingStartTime);
    setEndTime(pendingEndTime);
    
    // Only apply filter if at least one field has a value
    if (pendingStartDate || pendingEndDate) {
      setIsFiltering(true);
      
      // Convert inputs to Date objects for comparison
      let start = null;
      let end = null;
      
      if (pendingStartDate) {
        start = new Date(`${pendingStartDate}T${pendingStartTime}`);
      }
      
      if (pendingEndDate) {
        end = new Date(`${pendingEndDate}T${pendingEndTime}`);
      }
      
      onFilterChange({ start, end });
    } else {
      // Clear the filter if no dates
      setIsFiltering(false);
      onFilterChange({ start: null, end: null });
    }
    
    // Close the dropdown
    setIsOpen(false);
  };

  const clearFilters = () => {
    // Clear both actual and pending values
    setStartDate('');
    setEndDate('');
    setStartTime('00:00');
    setEndTime('23:59');
    setPendingStartDate('');
    setPendingEndDate('');
    setPendingStartTime('00:00');
    setPendingEndTime('23:59');
    setIsFiltering(false);
    onFilterChange({ start: null, end: null });
  };

  return (
    <div className="relative bg-gray-800 rounded-lg shadow-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-4 py-2 ${
          isFiltering 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        } rounded-md flex items-center gap-2 transition-colors duration-200`}
      >
        <Calendar size={16} />
        <span>{isFiltering ? 'Date Filter Active' : 'Date Filter'}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        
        {isFiltering && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearFilters();
            }}
            className="ml-2 p-1 hover:bg-gray-700 rounded-full"
            title="Clear filters"
          >
            <X size={14} />
          </button>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute z-30 mt-2 p-4 bg-gray-800 border border-gray-700 rounded-lg shadow-lg w-72">
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date & Time</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="date"
                    value={pendingStartDate}
                    onChange={(e) => setPendingStartDate(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
                  />
                  <Calendar size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={pendingStartTime}
                    onChange={(e) => setPendingStartTime(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
                  />
                  <Clock size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Date & Time</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="date"
                    value={pendingEndDate}
                    onChange={(e) => setPendingEndDate(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
                  />
                  <Calendar size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={pendingEndTime}
                    onChange={(e) => setPendingEndTime(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
                  />
                  <Clock size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-2">
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-md text-sm hover:bg-gray-600"
              >
                Clear
              </button>
              <button
                onClick={applyFilter}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                Apply Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;