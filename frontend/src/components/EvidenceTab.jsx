// File path: frontend/src/components/EvidenceTab.jsx
import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import EvidenceUploader from './EvidenceUploader';
import EvidenceViewer from './EvidenceViewer';

const EvidenceTab = ({ logId, csrfToken, isAdmin, currentUser, isTableView = false }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    // Trigger a refresh of the evidence viewer
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">Evidence</h2>
      </div>

      <div className={`grid grid-cols-1 ${isTableView ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6`}>
        {/* Upload panel (narrower in table view) */}
        <div className={isTableView ? "lg:col-span-1" : "lg:col-span-1"}>
          <EvidenceUploader 
            logId={logId} 
            csrfToken={csrfToken}
            onUploadSuccess={handleUploadSuccess}
          />
        </div>
        
        {/* Viewer panel (wider in table view) */}
        <div className={isTableView ? "lg:col-span-1" : "lg:col-span-2"}>
          <EvidenceViewer 
            logId={logId} 
            csrfToken={csrfToken}
            isAdmin={isAdmin}
            currentUser={currentUser}
            key={refreshTrigger} // Force re-render when files are uploaded
          />
        </div>
      </div>
    </div>
  );
};

export default EvidenceTab;