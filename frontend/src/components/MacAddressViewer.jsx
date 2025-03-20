// frontend/src/components/MacAddressViewer.jsx
import React, { useState, useEffect } from 'react';
import { Cpu, Wifi, Server, RefreshCw, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

const MacAddressViewer = () => {
  const [macRelations, setMacRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());

  const fetchMacRelations = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/relation-service/api/relations/mac_address', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Raw MAC relations data:', data);
      
      setMacRelations(data);
    } catch (err) {
      console.error('Error fetching MAC address relations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMacRelations();
  }, []);

  const toggleExpand = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  // Format MAC address to be more readable - just display as is since we're standardizing on dashes
  const formatMacAddress = (mac) => {
    if (!mac) return 'Unknown';
    
    // We're assuming MAC addresses are already in the correct format (with dashes)
    // If we still want to ensure formatting, we can uncomment this code:
    /*
    // Strip any separators and convert to uppercase
    const cleanMac = String(mac).toUpperCase().replace(/[:-]/g, '');
    // Format with dashes
    return cleanMac.match(/.{1,2}/g)?.join('-') || cleanMac;
    */
    
    return mac.toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <RefreshCw className="animate-spin text-blue-400 mr-2" size={20} />
        <span className="text-gray-400">Loading MAC address relations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 text-red-200 p-4 rounded-md">
        <div className="flex items-center gap-2">
          <AlertCircle size={20} />
          <h3 className="font-medium">Error loading MAC address relations:</h3>
        </div>
        <p className="mt-1">{error}</p>
        <button 
          onClick={fetchMacRelations}
          className="mt-4 px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-white text-sm flex items-center gap-1"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  if (macRelations.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <Cpu size={40} className="mx-auto mb-4 opacity-50" />
        <p>No MAC address relationships found.</p>
        <p className="text-sm mt-2">MAC addresses will appear here when devices are logged.</p>
        <p className="text-xs mt-1">Format: XX-XX-XX-XX-XX-XX (with dashes)</p>
        <button
          onClick={fetchMacRelations}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Refresh Data
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <Cpu className="w-5 h-5 text-yellow-400" />
          MAC Address Mappings
        </h2>
        <button
          onClick={fetchMacRelations}
          disabled={loading}
          className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-600 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      
      <div className="p-4">
        <div className="space-y-4">
          {macRelations.map((relation, index) => {
            // Always show the full MAC address
            const macAddress = formatMacAddress(relation.source);
            const relationId = `mac_${relation.source}_${index}`;
            
            // Separate IPs and hostnames
            const ipRelations = relation.related.filter(item => 
              item.type === 'ip' || item.target.match(/^\d+\.\d+\.\d+\.\d+$/)
            );
            
            const hostnameRelations = relation.related.filter(item => 
              item.type === 'hostname' || (!item.target.match(/^\d+\.\d+\.\d+\.\d+$/) && 
                                            !item.target.includes('-'))
            );
            
            return (
              <div key={relationId} className="bg-gray-700/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleExpand(relationId)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-600/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-yellow-400" />
                    <span className="text-white font-medium font-mono">{macAddress}</span>
                    <div className="flex flex-col items-start">
                      <span className="text-sm text-gray-400">
                        {ipRelations.length} IP{ipRelations.length !== 1 ? 's' : ''}
                      </span>
                      {hostnameRelations.length > 0 && (
                        <span className="text-xs text-gray-400">
                          {hostnameRelations.length} hostname{hostnameRelations.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedItems.has(relationId) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {expandedItems.has(relationId) && (
                  <div className="border-t border-gray-600">
                    {ipRelations.length > 0 && (
                      <div>
                        <div className="p-3 text-sm text-gray-300 font-medium border-b border-gray-600">IP Addresses</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                          {ipRelations.map((item, i) => (
                            <div
                              key={i}
                              className="bg-gray-800 p-3 rounded-md space-y-2 hover:bg-gray-700/50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Wifi className="w-4 h-4 text-blue-400" />
                                  <span className="text-gray-200 font-mono text-sm break-all">
                                    {item.target}
                                  </span>
                                </div>
                                {item.metadata?.ipType && (
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    item.metadata.ipType === 'internal' 
                                      ? 'bg-green-900/30 text-green-300' 
                                      : 'bg-orange-900/30 text-orange-300'
                                  }`}>
                                    {item.metadata.ipType}
                                  </span>
                                )}
                              </div>
                              
                              {item.metadata?.hostname && (
                                <div className="flex items-center gap-2 text-sm text-gray-400 pt-1">
                                  <Server className="w-4 h-4 text-green-400" />
                                  <span>{item.metadata.hostname}</span>
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
                    
                    {hostnameRelations.length > 0 && (
                      <div>
                        <div className="p-3 text-sm text-gray-300 font-medium border-b border-gray-600">Hostnames</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                          {hostnameRelations.map((item, i) => (
                            <div
                              key={i}
                              className="bg-gray-800 p-3 rounded-md space-y-2 hover:bg-gray-700/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Server className="w-4 h-4 text-green-400" />
                                <span className="text-gray-200 text-sm break-all">
                                  {item.target}
                                </span>
                              </div>
                              
                              {item.metadata?.internal_ip && (
                                <div className="flex items-center gap-2 text-sm text-gray-400 pt-1">
                                  <Wifi className="w-4 h-4 text-blue-400" />
                                  <span>{item.metadata.internal_ip}</span>
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
      </div>
    </div>
  );
};

export default MacAddressViewer;