// frontend/src/components/export/ExportOptionsPanel.jsx
import React from 'react';
import { Lock, Unlock, Shield, Network } from 'lucide-react';

/**
 * Panel for configuring export options based on selected export mode
 */
const ExportOptionsPanel = ({
  exportMode,
  hasSensitiveData,
  decryptSensitiveData,
  setDecryptSensitiveData,
  includeEvidence,
  setIncludeEvidence,
  includeHashes,
  setIncludeHashes,
  includeRelations,
  setIncludeRelations
}) => {
  return (
    <div className="mt-2 pt-2 border-t border-gray-700">
      {/* Decryption option - available regardless of export mode */}
      {hasSensitiveData && (
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={decryptSensitiveData}
            onChange={(e) => setDecryptSensitiveData(e.target.checked)}
            className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
          />
          <div className="flex items-center gap-1">
            {decryptSensitiveData ? (
              <Unlock size={14} className="text-green-400" />
            ) : (
              <Lock size={14} className="text-red-400" />
            )}
            Decrypt sensitive data in export
          </div>
        </label>
      )}
      
      {exportMode === 'evidence' && (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={includeEvidence}
              onChange={(e) => setIncludeEvidence(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            Include evidence files in the export
          </label>
          
          {/* Hash information checkbox */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={includeHashes}
              onChange={(e) => setIncludeHashes(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <div className="flex items-center gap-1">
              <Lock size={14} className="text-purple-400" />
              Include hash information in the export
            </div>
          </label>
          
          {/* Relations checkbox */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRelations}
              onChange={(e) => setIncludeRelations(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <div className="flex items-center gap-1">
              <Network size={14} className="text-blue-400" />
              Include relation data in the export
            </div>
          </label>

          <p className="text-xs text-gray-400 mt-2">
            Creates an HTML viewer and ZIP package with all logs, evidence files, and optional relation data
          </p>
        </>
      )}
      
      {/* Security warning about decryption */}
      {decryptSensitiveData && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-800 rounded-md">
          <div className="flex items-center gap-2 text-red-300">
            <Shield size={14} />
            <span className="text-xs font-medium">Security Warning</span>
          </div>
          <p className="text-xs text-red-300 mt-1">
            Decrypted exports contain sensitive data in plaintext. Handle with caution and delete after use.
          </p>
        </div>
      )}
    </div>
  );
};

export default ExportOptionsPanel;