// frontend/src/components/MacAddressViewer.jsx
import React, { useState, useEffect } from 'react';
import { Cpu, Wifi, Server, RefreshCw, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { formatUTC } from '../utils/dateUtils';
import { Button, Skeleton, EmptyState } from './common/ui';

const MacAddressViewer = ({ opQuery = '' }) => {
  const [macRelations, setMacRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());

  const fetchMacRelations = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/relation-service/api/relations/mac_address${opQuery ? `?${opQuery}` : ''}`, {
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
  }, [opQuery]);

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
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-card" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/15 text-danger p-4 rounded-card">
        <div className="flex items-center gap-2">
          <AlertCircle size={20} />
          <h3 className="font-medium">Error loading MAC address relations:</h3>
        </div>
        <p className="mt-1">{error}</p>
        <Button
          variant="danger"
          size="sm"
          icon={RefreshCw}
          onClick={fetchMacRelations}
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (macRelations.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title="No MAC address relationships found."
        message="MAC addresses will appear here when devices are logged. Format: XX-XX-XX-XX-XX-XX (with dashes)."
        action={{ label: 'Refresh Data', icon: RefreshCw, onClick: fetchMacRelations }}
      />
    );
  }

  return (
    <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
      <div className="p-4 border-b border-line flex items-center justify-between">
        <h2 className="text-lg font-medium text-content flex items-center gap-2">
          <Cpu className="w-5 h-5 text-warning" />
          MAC Address Mappings
        </h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchMacRelations}
          disabled={loading}
          loading={loading}
          icon={RefreshCw}
        >
          Refresh
        </Button>
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
              <div key={relationId} className="bg-surface-2/50 rounded-card overflow-hidden">
                <button
                  onClick={() => toggleExpand(relationId)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-3/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-warning" />
                    <span className="text-content font-medium font-mono">{macAddress}</span>
                    <div className="flex flex-col items-start">
                      <span className="text-sm text-muted">
                        {ipRelations.length} IP{ipRelations.length !== 1 ? 's' : ''}
                      </span>
                      {hostnameRelations.length > 0 && (
                        <span className="text-xs text-muted">
                          {hostnameRelations.length} hostname{hostnameRelations.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedItems.has(relationId) ? (
                    <ChevronDown className="w-5 h-5 text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted" />
                  )}
                </button>

                {expandedItems.has(relationId) && (
                  <div className="border-t border-line">
                    {ipRelations.length > 0 && (
                      <div>
                        <div className="p-3 text-sm text-muted font-medium border-b border-line">IP Addresses</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                          {ipRelations.map((item, i) => (
                            <div
                              key={i}
                              className="bg-surface p-3 rounded-card space-y-2 hover:bg-surface-2/50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Wifi className="w-4 h-4 text-accent" />
                                  <span className="text-content font-mono text-sm break-all">
                                    {item.target}
                                  </span>
                                </div>
                                {item.metadata?.ipType && (
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    item.metadata.ipType === 'internal'
                                      ? 'bg-success/15 text-success'
                                      : 'bg-warning/15 text-warning'
                                  }`}>
                                    {item.metadata.ipType}
                                  </span>
                                )}
                              </div>

                              {item.metadata?.hostname && (
                                <div className="flex items-center gap-2 text-sm text-muted pt-1">
                                  <Server className="w-4 h-4 text-success" />
                                  <span>{item.metadata.hostname}</span>
                                </div>
                              )}

                              <div className="text-xs text-faint">
                                Last seen: {formatUTC(item.lastSeen)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {hostnameRelations.length > 0 && (
                      <div>
                        <div className="p-3 text-sm text-muted font-medium border-b border-line">Hostnames</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                          {hostnameRelations.map((item, i) => (
                            <div
                              key={i}
                              className="bg-surface p-3 rounded-card space-y-2 hover:bg-surface-2/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Server className="w-4 h-4 text-success" />
                                <span className="text-content text-sm break-all">
                                  {item.target}
                                </span>
                              </div>

                              {item.metadata?.internal_ip && (
                                <div className="flex items-center gap-2 text-sm text-muted pt-1">
                                  <Wifi className="w-4 h-4 text-accent" />
                                  <span>{item.metadata.internal_ip}</span>
                                </div>
                              )}

                              <div className="text-xs text-faint">
                                Last seen: {formatUTC(item.lastSeen)}
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