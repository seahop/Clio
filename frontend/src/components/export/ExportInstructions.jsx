// frontend/src/components/export/ExportInstructions.jsx
import React from 'react';

/**
 * Component for displaying collapsible export instructions
 */
const ExportInstructions = ({ 
  expanded, 
  toggleExpanded, 
  exportMode, 
  includeRelations,
  uploadToS3,
  decryptSensitiveData
}) => {
  return (
    <div className="mt-4">
      <button 
        onClick={toggleExpanded}
        className="text-sm text-blue-300 hover:text-blue-400 underline flex items-center"
      >
        {expanded ? "Hide Instructions" : "Show Export Instructions"}
      </button>
      
      {expanded && (
        <div className="mt-2 p-3 bg-gray-800/50 rounded text-sm text-gray-300">
          <p className="mb-2">This feature exports logs to CSV files on the server. The files are <strong>not</strong> downloaded to your browser.</p>
          <p className="mb-2">Files are saved to the <code className="bg-gray-700 px-1 py-0.5 rounded">backend/exports</code> directory on the host system.</p>
          {exportMode === 'evidence' && (
            <>
              <p className="mb-2">The evidence export creates a ZIP file containing all logs and related evidence files, along with an HTML viewer for easy browsing.</p>
              {includeRelations && (
                <p className="mb-2">Including relation data will add network relationships, user commands, and other correlation data from the relation service to your export.</p>
              )}
            </>
          )}
          {uploadToS3 && (
            <p className="mb-2">The export will be automatically uploaded to your configured S3 bucket after creation.</p>
          )}
          {decryptSensitiveData && (
            <p className="mb-2 text-yellow-300">Decrypted exports will contain sensitive data in plaintext. Handle with appropriate security precautions.</p>
          )}
          <p>Use care when selecting sensitive columns like "secrets" that may contain credentials.</p>
        </div>
      )}
    </div>
  );
};

export default ExportInstructions;