// frontend/src/components/relations/index.js
// Export all relation components from a single file for convenience

export { default as RelationFilters } from './RelationFilters';
export { default as RelationList } from './RelationList';
export { default as RelationItem } from './RelationItem';
export { default as RelationDetails } from './RelationDetails';
export { default as EnrichedDetailCards } from './EnrichedDetailCards';
export { default as CommandList } from './CommandList';
export { default as RelatedEntitiesList } from './RelatedEntitiesList';

// Also export utility functions
export * from './relationUtils';