// frontend/src/components/RelationFilters.jsx
import React from 'react';

const RelationFilters = ({ filterTypes, selectedFilter, onFilterChange }) => {
  return (
    <>
      {filterTypes.map(filter => (
        <button
          key={filter.id}
          onClick={() => onFilterChange(filter.id)}
          className={`px-3 py-1 rounded-md text-sm ${
            selectedFilter === filter.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </>
  );
};

export default RelationFilters;