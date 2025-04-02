// frontend/src/components/RelationList.jsx
import React from 'react';
import { ChevronRight, ChevronDown, Wifi, Server, Globe, Cpu, User, Network, Clock, Terminal, Shield } from 'lucide-react';

// Format MAC address for display
const formatMacAddress = (mac) => {
  if (!mac) return mac;
  return mac.toUpperCase();
};

// Get icon component based on relation type
const getRelationIcon = (type) => {
  switch (type) {
    case 'ip':
      return <Wifi className="w-5 h-5 text-blue-400" />;
    case 'hostname':
      return <Server className="w-5 h-5 text-green-400" />;
    case 'domain':
      return <Globe className="w-5 h-5 text-purple-400" />;
    case 'mac_address':
      return <Cpu className="w-5 h-5 text-yellow-400" />;
    case 'username':
      return <User className="w-5 h-5 text-blue-400" />;
    default:
      return <Network className="w-5 h-5 text-gray-400" />;
  }
};

// Get enriched details for a relation
const getEnrichedDetails = (relation) => {
  // Base details that every relation type should show
  let details = [];
  
  // Compute first and last seen if we have related items with timestamps
  if (relation.related && relation.related.length > 0) {
    const timestamps = relation.related
      .filter(item => item.lastSeen)
      .map(item => new Date(item.lastSeen).getTime());
    
    if (timestamps.length > 0) {
      const firstSeen = new Date(Math.min(...timestamps));
      const lastSeen = new Date(Math.max(...timestamps));
      
      details.push({
        label: "First seen",
        value: firstSeen.toLocaleString(),
        icon: <Clock className="w-4 h-4 text-blue-400" />
      });
      
      details.push({
        label: "Last seen",
        value: lastSeen.toLocaleString(),
        icon: <Clock className="w-4 h-4 text-blue-400" />
      });
    }
  }
  
  // Get type-specific details
  switch (relation.type) {
    case 'ip':
      // Count unique hostnames this IP is associated with
      const hostnames = new Set(relation.related
        .filter(item => item.type === 'hostname' || item.metadata?.hostname)
        .map(item => item.type === 'hostname' ? item.target : item.metadata.hostname));
      
      if (hostnames.size > 0) {
        details.push({
          label: "Unique hosts",
          value: hostnames.size,
          icon: <Server className="w-4 h-4 text-green-400" />
        });
      }
      
      // Count commands executed on this IP
      const commandsForIP = relation.related
        .filter(item => item.type === 'command' || (item.metadata && item.metadata.type === 'ip_command'));
      
      if (commandsForIP.length > 0) {
        details.push({
          label: "Commands executed",
          value: commandsForIP.length,
          icon: <Terminal className="w-4 h-4 text-green-400" />
        });
      }
      
      // Determine if this is an internal or external IP
      const internalIPRelation = relation.related.find(item => item.metadata?.ipType === 'internal');
      const externalIPRelation = relation.related.find(item => item.metadata?.ipType === 'external');
      
      if (internalIPRelation) {
        details.push({
          label: "IP type",
          value: "Internal",
          icon: <Shield className="w-4 h-4 text-green-400" />
        });
      } else if (externalIPRelation) {
        details.push({
          label: "IP type",
          value: "External",
          icon: <Shield className="w-4 h-4 text-orange-400" />
        });
      }
      break;
      
    case 'hostname':
      // Count unique IPs this hostname is associated with
      const ipAddresses = new Set(relation.related
        .filter(item => item.type === 'ip' || item.metadata?.internal_ip || item.metadata?.external_ip)
        .map(item => {
          if (item.type === 'ip') return item.target;
          return item.metadata.internal_ip || item.metadata.external_ip;
        }));
      
      if (ipAddresses.size > 0) {
        details.push({
          label: "IP addresses",
          value: ipAddresses.size,
          icon: <Wifi className="w-4 h-4 text-blue-400" />
        });
      }
      
      // Count domains this hostname is part of
      const domainsForHost = relation.related.filter(item => item.type === 'domain');
      if (domainsForHost.length > 0) {
        details.push({
          label: "Domains",
          value: domainsForHost.length,
          icon: <Globe className="w-4 h-4 text-purple-400" />
        });
      }
      
      // Count commands executed on this hostname
      const commandsForHost = relation.related
        .filter(item => item.type === 'command' || (item.metadata && item.metadata.type === 'hostname_command'));
      
      if (commandsForHost.length > 0) {
        details.push({
          label: "Commands executed",
          value: commandsForHost.length,
          icon: <Terminal className="w-4 h-4 text-green-400" />
        });
      }
      
      // Count users who have accessed this hostname
      const usersOnHost = new Set(relation.related
        .filter(item => item.metadata?.username)
        .map(item => item.metadata.username));
      
      if (usersOnHost.size > 0) {
        details.push({
          label: "Users",
          value: usersOnHost.size,
          icon: <User className="w-4 h-4 text-blue-400" />
        });
      }
      break;
      
    default:
      // Basic details for other types
      break;
  }
  
  return details;
};

const RelationList = ({ relations, expandedItems, toggleExpand }) => {
  if (relations.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p>No relationships found.</p>
        <p className="text-sm mt-2">Create relationships between logs to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {relations.map((relation, index) => {
        const relationId = `${relation.source}_${index}`;
        const isExpanded = expandedItems.has(relationId);
        
        // Format MAC addresses for display
        const displaySource = relation.type === 'mac_address' 
          ? formatMacAddress(relation.source)  
          : relation.source;
        
        // Get enriched details for this relation
        const enrichedDetails = getEnrichedDetails(relation);
        
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
          <div key={relationId} className="bg-gray-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleExpand(relationId)}
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
              <div className="border-t border-gray-600">
                {/* Display enriched details first */}
                {enrichedDetails.length > 0 && (
                  <div className="border-b border-gray-600 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {enrichedDetails.map((detail, i) => (
                        <div key={i} className="bg-gray-800/50 rounded-md p-3 flex flex-col items-center justify-center text-center">
                          <div className="mb-2">{detail.icon}</div>
                          <div className="text-sm font-medium text-gray-300">{detail.label}</div>
                          <div className="text-lg font-bold text-white">{detail.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              
                {/* Display commands executed on this IP/hostname if available */}
                {hasCommands && (
                  <div className="border-b border-gray-600">
                    <div className="p-3 bg-gray-800/50 text-blue-300 font-medium">
                      Commands Executed {relation.type === 'hostname' ? 'on Host' : relation.type === 'ip' ? 'on IP' : relation.type === 'username' ? 'by User' : ''} 
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                      {commandItems.map((item, i) => (
                        <div
                          key={`cmd-${i}`}
                          className="bg-gray-800 p-3 rounded-md hover:bg-gray-700/50 transition-colors"
                        >
                          <div className="flex items-start gap-2 mb-2">
                            <Terminal className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
                            <div className="font-mono text-sm text-gray-200 break-all whitespace-pre-wrap">
                              {item.target}
                            </div>
                          </div>
                          
                          {/* Show user who ran the command if available */}
                          {item.metadata?.username && relation.type !== 'username' && (
                            <div className="flex items-center gap-2 text-xs text-gray-400 ml-6 mt-2">
                              <User className="w-3 h-3 text-blue-400" />
                              <span>Run by: {item.metadata.username}</span>
                            </div>
                          )}
                          
                          {/* Show hostname where command was run if available */}
                          {item.metadata?.hostname && relation.type !== 'hostname' && (
                            <div className="flex items-center gap-2 text-xs text-gray-400 ml-6 mt-2">
                              <Server className="w-3 h-3 text-green-400" />
                              <span>Host: {item.metadata.hostname}</span>
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-500 ml-6 mt-1">
                            {new Date(item.lastSeen).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Display other connections */}
                {otherItems.length > 0 && (
                  <div>
                    <div className="p-3 bg-gray-800/50 text-blue-300 font-medium">
                      Related Entities
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                      {otherItems.map((item, i) => (
                        <div
                          key={`rel-${i}`}
                          className="bg-gray-800 p-3 rounded-md space-y-2 hover:bg-gray-700/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-gray-200 font-mono text-sm break-all">
                              {item.target}
                            </span>
                            <span className="text-xs px-2 py-1 bg-blue-600/20 text-blue-300 rounded">
                              {item.type}
                            </span>
                          </div>
                          {item.metadata && (
                            <div className="text-sm text-gray-400 border-t border-gray-700 pt-2">
                              {item.metadata.hostname && (
                                <div className="flex items-center gap-2">
                                  <Server className="w-4 h-4 text-green-400" />
                                  <span>{item.metadata.hostname}</span>
                                </div>
                              )}
                              {item.metadata.ipType && (
                                <div className="mt-1 text-xs">
                                  <span className={`px-1.5 py-0.5 rounded ${
                                    item.metadata.ipType === 'internal' 
                                      ? 'bg-green-900/30 text-green-300' 
                                      : 'bg-orange-900/30 text-orange-300'
                                  }`}>
                                    {item.metadata.ipType} IP
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            Last seen: {new Date(item.lastSeen).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RelationList;