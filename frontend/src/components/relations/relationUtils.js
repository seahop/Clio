// frontend/src/components/relations/relationUtils.js
import React from 'react';
import { Wifi, Server, Globe, Cpu, User, Network, Clock, Terminal, Shield } from 'lucide-react';

/**
 * Get icon component based on relation type
 * @param {string} type - Relation type
 * @returns {JSX.Element} - Icon component
 */
export const getRelationIcon = (type) => {
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

/**
 * Format MAC address for display
 * @param {string} mac - MAC address to format
 * @returns {string} - Formatted MAC address
 */
export const formatMacAddress = (mac) => {
  if (!mac) return mac;
  // We're relying on the MAC addresses being stored in the correct format now
  return mac.toUpperCase();
};

/**
 * Generate enriched detail summaries for different relation types
 * @param {Object} relation - Relation object
 * @param {Array} allRelations - All relations (needed for domain details)
 * @returns {Array} - Array of detail objects with label, value, and icon
 */
export const getEnrichedDetails = (relation, allRelations = []) => {
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
      return getIpRelationDetails(relation, details);
    case 'hostname':
      return getHostnameRelationDetails(relation, details);
    case 'domain':
      return getDomainRelationDetails(relation, details, allRelations);
    case 'username':
      return getUsernameRelationDetails(relation, details);
    case 'mac_address':
      return getMacAddressRelationDetails(relation, details);
    default:
      return details;
  }
};

/**
 * Get details specific to IP relations
 * @param {Object} relation - Relation object
 * @param {Array} baseDetails - Base details array to extend
 * @returns {Array} - Extended details array
 */
const getIpRelationDetails = (relation, baseDetails) => {
  const details = [...baseDetails];
  
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
  
  return details;
};

/**
 * Get details specific to hostname relations
 * @param {Object} relation - Relation object
 * @param {Array} baseDetails - Base details array to extend
 * @returns {Array} - Extended details array
 */
const getHostnameRelationDetails = (relation, baseDetails) => {
  const details = [...baseDetails];
  
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
  
  return details;
};

/**
 * Get details specific to domain relations
 * @param {Object} relation - Relation object
 * @param {Array} baseDetails - Base details array to extend
 * @param {Array} allRelations - All relations for deeper analysis
 * @returns {Array} - Extended details array
 */
const getDomainRelationDetails = (relation, baseDetails, allRelations) => {
  const details = [...baseDetails];
  
  // Count unique hostnames in this domain
  const hostsInDomain = relation.related.filter(item => item.type === 'hostname');
  if (hostsInDomain.length > 0) {
    details.push({
      label: "Hosts",
      value: hostsInDomain.length,
      icon: <Server className="w-4 h-4 text-green-400" />
    });
  }
  
  // Determine if any hosts in this domain have commands executed
  let commandCount = 0;
  let userCount = 0;
  const uniqueUsers = new Set();
  
  // For domains, we need to look deeper - check if any of the hostnames have commands
  hostsInDomain.forEach(hostItem => {
    // Find this hostname in the main relations array
    const hostRelation = allRelations.find(rel => 
      rel.type === 'hostname' && rel.source === hostItem.target
    );
    
    if (hostRelation) {
      // Count commands on this hostname
      const hostCommands = hostRelation.related.filter(item => 
        item.type === 'command' || (item.metadata && item.metadata.type === 'hostname_command')
      );
      commandCount += hostCommands.length;
      
      // Count unique users on this hostname
      hostCommands.forEach(cmd => {
        if (cmd.metadata?.username) {
          uniqueUsers.add(cmd.metadata.username);
        }
      });
    }
  });
  
  if (commandCount > 0) {
    details.push({
      label: "Commands executed",
      value: commandCount,
      icon: <Terminal className="w-4 h-4 text-green-400" />
    });
  }
  
  if (uniqueUsers.size > 0) {
    details.push({
      label: "Users",
      value: uniqueUsers.size,
      icon: <User className="w-4 h-4 text-blue-400" />
    });
  }
  
  return details;
};

/**
 * Get details specific to username relations
 * @param {Object} relation - Relation object
 * @param {Array} baseDetails - Base details array to extend
 * @returns {Array} - Extended details array
 */
const getUsernameRelationDetails = (relation, baseDetails) => {
  const details = [...baseDetails];
  
  // Count commands executed by this user
  const userCommands = relation.related.filter(item => item.type === 'command');
  if (userCommands.length > 0) {
    details.push({
      label: "Commands executed",
      value: userCommands.length,
      icon: <Terminal className="w-4 h-4 text-green-400" />
    });
  }
  
  // Count unique hosts accessed by this user
  const hostsAccessedByUser = new Set(relation.related
    .filter(item => item.type === 'hostname' || item.metadata?.hostname)
    .map(item => item.type === 'hostname' ? item.target : item.metadata.hostname));
  
  if (hostsAccessedByUser.size > 0) {
    details.push({
      label: "Hosts accessed",
      value: hostsAccessedByUser.size,
      icon: <Server className="w-4 h-4 text-green-400" />
    });
  }
  
  // Count unique IPs accessed by this user
  const ipsAccessedByUser = new Set(relation.related
    .filter(item => item.type === 'ip' || item.metadata?.internal_ip || item.metadata?.external_ip)
    .map(item => {
      if (item.type === 'ip') return item.target;
      return item.metadata.internal_ip || item.metadata.external_ip;
    }));
  
  if (ipsAccessedByUser.size > 0) {
    details.push({
      label: "IPs accessed",
      value: ipsAccessedByUser.size,
      icon: <Wifi className="w-4 h-4 text-blue-400" />
    });
  }
  
  return details;
};

/**
 * Get details specific to MAC address relations
 * @param {Object} relation - Relation object
 * @param {Array} baseDetails - Base details array to extend
 * @returns {Array} - Extended details array
 */
const getMacAddressRelationDetails = (relation, baseDetails) => {
  const details = [...baseDetails];
  
  // Count unique IPs this MAC address is associated with
  const ipsForMac = new Set(relation.related
    .filter(item => item.type === 'ip' || item.metadata?.internal_ip || item.metadata?.external_ip)
    .map(item => {
      if (item.type === 'ip') return item.target;
      return item.metadata.internal_ip || item.metadata.external_ip;
    }));
  
  if (ipsForMac.size > 0) {
    details.push({
      label: "IP addresses",
      value: ipsForMac.size,
      icon: <Wifi className="w-4 h-4 text-blue-400" />
    });
  }
  
  // Count unique hostnames this MAC address is associated with
  const hostsForMac = new Set(relation.related
    .filter(item => item.type === 'hostname' || item.metadata?.hostname)
    .map(item => item.type === 'hostname' ? item.target : item.metadata.hostname));
  
  if (hostsForMac.size > 0) {
    details.push({
      label: "Hosts",
      value: hostsForMac.size,
      icon: <Server className="w-4 h-4 text-green-400" />
    });
  }
  
  return details;
};