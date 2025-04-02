// frontend/src/components/relations/RelationItem.jsx
import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import RelationDetails from './RelationDetails';
import { getRelationIcon, formatMacAddress, getEnrichedDetails } from './relationUtils';

const RelationItem = ({ relation, relationId, isExpanded, toggleExpand, allRelations }) => {
  // Format MAC addresses for display
  const displaySource = relation.type === 'mac_address' 
    ? formatMacAddress(relation.source)  
    : relation.source;
  
  // Get enriched details for this relation
  const enrichedDetails = getEnrichedDetails(relation, allRelations);
  
  return (
    <div className="bg-gray-700/50 rounded-lg overflow-hidden">
      <button
        onClick={toggleExpand}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-600/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {getRelationIcon(relation.type)}
          <span className="text-white font-medium">{displaySource}</span>
          
          {/* Show enriched details summary */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-2">
            <span className="text-sm text-gray-400">
              {relation.related?.length || 0} connection{relation.related?.length !== 1 ? 's' : ''}
            </span>
            
            {enrichedDetails.slice(0, 3).map((detail, i) => (
              <div key={i} className="flex items-center gap-1 text-xs">
                {detail.icon}
                <span className={`${i === 0 ? 'text-green-400' : i === 1 ? 'text-blue-400' : 'text-purple-400'}`}>
                  {detail.label}: {detail.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <RelationDetails 
          relation={relation}
          enrichedDetails={enrichedDetails}
        />
      )}
    </div>
  );
};

export default RelationItem;