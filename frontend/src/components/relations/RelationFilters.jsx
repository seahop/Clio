// frontend/src/components/RelationFilters.jsx
import React from 'react';
import { Button } from '../common/ui';

const RelationFilters = ({ filterTypes, selectedFilter, onFilterChange }) => {
  return (
    <>
      {filterTypes.map(filter => (
        <Button
          key={filter.id}
          onClick={() => onFilterChange(filter.id)}
          variant={selectedFilter === filter.id ? 'primary' : 'secondary'}
          size="sm"
        >
          {filter.label}
        </Button>
      ))}
    </>
  );
};

export default RelationFilters;