// frontend/src/components/relations/RelationDetails.jsx
import React from 'react';
import { Terminal, Server, User } from 'lucide-react';
import EnrichedDetailCards from './EnrichedDetailCards';
import CommandList from './CommandList';
import RelatedEntitiesList from './RelatedEntitiesList';

const RelationDetails = ({ relation, enrichedDetails }) => {
  // Group related items by type for organized display
  const commandItems = relation.related?.filter(item => 
    item.type === 'command' || 
    (item.metadata && (item.metadata.type === 'ip_command' || item.metadata.type === 'hostname_command'))
  ) || [];
  
  const otherItems = relation.related?.filter(item => 
    item.type !== 'command' && 
    (!item.metadata || (item.metadata.type !== 'ip_command' && item.metadata.type !== 'hostname_command'))
  ) || [];
  
  const hasCommands = commandItems.length > 0;
  
  return (
    <div className="border-t border-gray-600">
      {/* Display enriched details first */}
      {enrichedDetails.length > 0 && (
        <EnrichedDetailCards details={enrichedDetails} />
      )}
    
      {/* Display commands executed on this IP/hostname if available */}
      {hasCommands && (
        <div className="border-b border-gray-600">
          <div className="p-3 bg-gray-800/50 text-blue-300 font-medium">
            Commands Executed {relation.type === 'hostname' ? 'on Host' : relation.type === 'ip' ? 'on IP' : relation.type === 'username' ? 'by User' : ''} 
          </div>
          <CommandList 
            commands={commandItems} 
            relationType={relation.type} 
          />
        </div>
      )}
      
      {/* Display other connections */}
      {otherItems.length > 0 && (
        <RelatedEntitiesList entities={otherItems} />
      )}
    </div>
  );
};

export default RelationDetails;