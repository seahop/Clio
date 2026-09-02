// frontend/src/components/CertificateManager.jsx
import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, Check, Clock, ShieldOff } from 'lucide-react';
import { formatUTC } from '../utils/dateUtils';
import { Button, Badge, Skeleton, EmptyState } from './common/ui';

const CertificateManager = ({ csrfToken }) => {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch certificate status on load
  useEffect(() => {
    fetchCertificateStatus();
  }, []);

  // Function to fetch certificate status
  const fetchCertificateStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/certificates/status', {
        credentials: 'include',
        headers: {
          'CSRF-Token': csrfToken
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch certificate status: ${response.status}`);
      }

      const data = await response.json();
      setCertificates(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return formatUTC(dateString);
  };

  // Get status indicator
  const getStatusIndicator = (status) => {
    switch (status) {
      case 'valid':
        return <Check className="w-5 h-5 text-success" />;
      case 'expiring-soon':
        return <Clock className="w-5 h-5 text-warning" />;
      case 'expired':
        return <AlertTriangle className="w-5 h-5 text-danger" />;
      case 'error':
      case 'missing':
        return <AlertTriangle className="w-5 h-5 text-danger" />;
      default:
        return <div className="w-5 h-5" />;
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-content">Certificate Management</h2>
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={() => fetchCertificateStatus()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/30 text-danger rounded-md">
          {error}
        </div>
      )}

      <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-surface-2">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Certificate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Service
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Valid From
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Valid To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Days Left
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-4">
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-6" />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-4">
                    <EmptyState icon={ShieldOff} title="No certificates found" message="Certificate status will appear here once services report their certificates." />
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => (
                  <tr key={cert.name} className="hover:bg-surface-3/40">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIndicator(cert.status)}
                        <span className="ml-2 text-sm text-muted">
                          {cert.status === 'valid' ? 'Valid' :
                           cert.status === 'expiring-soon' ? 'Expiring Soon' :
                           cert.status === 'expired' ? 'Expired' :
                           cert.status === 'missing' ? 'Missing' :
                           cert.status === 'error' ? 'Error' : cert.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-muted">
                      {cert.name}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-muted">
                      {cert.type === 'lets-encrypt' ? "Let's Encrypt" : "Self-Signed"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-muted">
                      {cert.service}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-muted">
                      {cert.error ? 'N/A' : formatDate(cert.validFrom)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-muted">
                      {cert.error ? 'N/A' : formatDate(cert.validTo)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {cert.error ? (
                        <Badge tone="danger">
                          {cert.status === 'missing' ? 'Missing' : 'Error'}
                        </Badge>
                      ) : (
                        <Badge tone={cert.daysUntilExpiry <= 0 ? 'danger' : cert.daysUntilExpiry <= 30 ? 'warning' : 'success'}>
                          {cert.daysUntilExpiry <= 0 ? 'Expired' :
                           `${cert.daysUntilExpiry} days`}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="bg-surface border border-line rounded-card shadow-card p-4 text-muted text-sm space-y-3">
        <h3 className="font-semibold text-content">Certificate Information</h3>
        <p>
          <strong>Self-signed certificates</strong> are used for internal service communication and typically have a 1-year validity.
        </p>
        <p>
          <strong>Let's Encrypt certificates</strong> are used for external connections and have a 90-day validity period.
        </p>
        <p>
          To renew certificates, please run the renewal script directly on the host system.
          After renewal, you'll need to restart all Docker services to apply the new certificates.
        </p>

        <div className="border-t border-line pt-3 mt-3">
          <h4 className="font-semibold mb-2 text-content">Certificate Renewal Guide</h4>
          <div className="p-3 bg-canvas rounded">
            <p className="mb-2">To renew certificates, run this command on the host system:</p>
            <code className="block p-2 bg-surface-2 rounded font-mono text-accent">python3 renew-cert.py [domain-name]</code>
            <p className="mt-2 mb-2">After renewal, apply the new certificates with:</p>
            <code className="block p-2 bg-surface-2 rounded font-mono text-accent">docker-compose restart</code>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificateManager;