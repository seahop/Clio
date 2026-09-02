// src/components/DateRangeFilter.jsx
import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronDown, X } from 'lucide-react';
import { Button } from './common/ui';

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
    <div className="relative bg-surface rounded-card shadow-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 text-sm ${
          isFiltering
            ? 'bg-accent text-accent-fg'
            : 'bg-surface-2 border border-line text-muted hover:bg-surface-3'
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
            className="ml-2 p-1 hover:bg-surface-3 rounded-full"
            title="Clear filters"
          >
            <X size={14} />
          </button>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 p-4 bg-surface border border-line rounded-card shadow-pop w-72">
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Start Date & Time</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="date"
                    value={pendingStartDate}
                    onChange={(e) => setPendingStartDate(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-surface-2 border border-line rounded-md text-content text-sm"
                  />
                  <Calendar size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted" />
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={pendingStartTime}
                    onChange={(e) => setPendingStartTime(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-surface-2 border border-line rounded-md text-content text-sm"
                  />
                  <Clock size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">End Date & Time</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="date"
                    value={pendingEndDate}
                    onChange={(e) => setPendingEndDate(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-surface-2 border border-line rounded-md text-content text-sm"
                  />
                  <Calendar size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted" />
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={pendingEndTime}
                    onChange={(e) => setPendingEndTime(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 bg-surface-2 border border-line rounded-md text-content text-sm"
                  />
                  <Clock size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted" />
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-2">
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear
              </Button>
              <Button variant="primary" size="sm" onClick={applyFilter}>
                Apply Filter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;