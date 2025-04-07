// frontend/src/components/CertificateManager.jsx
import React, { useState, useEffect } from 'react';
import { RefreshCw, Shield, AlertTriangle, Check, Clock } from 'lucide-react';

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
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return dateString || 'Unknown';
    }
  };

  // Get status indicator
  const getStatusIndicator = (status) => {
    switch (status) {
      case 'valid':
        return <Check className="w-5 h-5 text-green-500" />;
      case 'expiring-soon':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'expired':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'error':
      case 'missing':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <div className="w-5 h-5" />;
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white">Certificate Management</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => fetchCertificateStatus()}
            disabled={loading}
            className="px-3 py-2 bg-gray-700 text-white rounded-md flex items-center gap-2 hover:bg-gray-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      
      {error && (
        <div className="p-3 bg-red-900 text-red-200 rounded-md">
          {error}
        </div>
      )}
      
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-700">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Certificate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Service
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Valid From
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Valid To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Days Left
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-4 text-center text-gray-400">
                    Loading certificate information...
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-4 text-center text-gray-400">
                    No certificates found
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => (
                  <tr key={cert.name} className="hover:bg-gray-750">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIndicator(cert.status)}
                        <span className="ml-2 text-sm text-gray-300">
                          {cert.status === 'valid' ? 'Valid' : 
                           cert.status === 'expiring-soon' ? 'Expiring Soon' : 
                           cert.status === 'expired' ? 'Expired' : 
                           cert.status === 'missing' ? 'Missing' :
                           cert.status === 'error' ? 'Error' : cert.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {cert.name}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {cert.type === 'lets-encrypt' ? "Let's Encrypt" : "Self-Signed"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {cert.service}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {cert.error ? 'N/A' : formatDate(cert.validFrom)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                      {cert.error ? 'N/A' : formatDate(cert.validTo)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {cert.error ? (
                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900 text-red-200">
                          {cert.status === 'missing' ? 'Missing' : 'Error'}
                        </span>
                      ) : (
                        <span className={`
                          px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full
                          ${cert.daysUntilExpiry <= 0 ? 'bg-red-900 text-red-200' : 
                            cert.daysUntilExpiry <= 30 ? 'bg-yellow-900 text-yellow-200' : 
                            'bg-green-900 text-green-200'}
                        `}>
                          {cert.daysUntilExpiry <= 0 ? 'Expired' : 
                           `${cert.daysUntilExpiry} days`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="bg-gray-800 rounded-lg shadow-lg p-4 text-gray-300 text-sm space-y-3">
        <h3 className="font-semibold">Certificate Information</h3>
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
        
        <div className="border-t border-gray-700 pt-3 mt-3">
          <h4 className="font-semibold mb-2">Certificate Renewal Guide</h4>
          <div className="p-3 bg-gray-900 rounded">
            <p className="mb-2">To renew certificates, run this command on the host system:</p>
            <code className="block p-2 bg-gray-800 rounded font-mono text-blue-300">python3 renew-cert.py [domain-name]</code>
            <p className="mt-2 mb-2">After renewal, apply the new certificates with:</p>
            <code className="block p-2 bg-gray-800 rounded font-mono text-blue-300">docker-compose restart</code>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificateManager;