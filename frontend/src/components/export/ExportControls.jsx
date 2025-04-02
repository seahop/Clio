// frontend/src/components/export/ExportControls.jsx
import React from 'react';
import { 
  RefreshCw, 
  Database, 
  Archive, 
  Network, 
  Lock, 
  Unlock, 
  Shield, 
  CloudUpload, 
  Download 
} from 'lucide-react';
import ColumnSelector from './ColumnSelector';
import ExportOptionsPanel from './ExportOptionsPanel';
import ExportInstructions from './ExportInstructions';

/**
 * Component to control export settings and start the export process
 */
const ExportControls = ({
  columns,
  selectedColumns,
  loadingColumns,
  onColumnToggle,
  onSelectAll,
  onSelectNone,
  exportMode,
  setExportMode,
  includeEvidence,
  setIncludeEvidence,
  includeRelations,
  setIncludeRelations,
  includeHashes,
  setIncludeHashes,
  decryptSensitiveData,
  setDecryptSensitiveData,
  uploadToS3,
  setUploadToS3,
  isS3Configured,
  loadingS3Config,
  hasSensitiveData,
  loading,
  onExport,
  expandInstructions,
  toggleInstructions
}) => {
  return (
    <div className="bg-gray-700/50 p-4 rounded-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">Select Columns</h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="px-3 py-1 bg-blue-600/30 text-blue-200 rounded text-xs hover:bg-blue-600/50"
          >
            Select All
          </button>
          <button
            onClick={onSelectNone}
            className="px-3 py-1 bg-gray-600/30 text-gray-200 rounded text-xs hover:bg-gray-600/50"
          >
            Clear
          </button>
        </div>
      </div>
      
      {/* Export mode selection and options */}
      <div className="mb-4 bg-gray-800/50 p-3 rounded-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-300">Export Type:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setExportMode('csv')}
              className={`px-3 py-1 rounded text-xs flex items-center gap-1 ${
                exportMode === 'csv' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Database size={14} />
              CSV Only
            </button>
            <button
              onClick={() => setExportMode('evidence')}
              className={`px-3 py-1 rounded text-xs flex items-center gap-1 ${
                exportMode === 'evidence' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Archive size={14} />
              With Evidence
            </button>
          </div>
        </div>
        
        {/* S3 Export Option */}
        {!loadingS3Config && (
          <div className="mb-2 pt-2 border-t border-gray-700">
            <label className={`flex items-center gap-2 text-sm ${isS3Configured ? 'cursor-pointer text-gray-300' : 'text-gray-500 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={uploadToS3}
                onChange={(e) => setUploadToS3(e.target.checked)}
                disabled={!isS3Configured}
                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 disabled:opacity-50"
              />
              <div className="flex items-center gap-1">
                <CloudUpload size={14} className={isS3Configured ? "text-blue-400" : "text-gray-500"} />
                Upload to S3 after export
              </div>
            </label>
            
            {!isS3Configured && (
              <p className="text-xs text-gray-500 mt-1 ml-6">
                S3 is not configured. Please configure S3 in Log Management to use this feature.
              </p>
            )}
          </div>
        )}
        
        {/* Export options section */}
        <ExportOptionsPanel 
          exportMode={exportMode}
          hasSensitiveData={hasSensitiveData}
          decryptSensitiveData={decryptSensitiveData}
          setDecryptSensitiveData={setDecryptSensitiveData}
          includeEvidence={includeEvidence}
          setIncludeEvidence={setIncludeEvidence}
          includeHashes={includeHashes}
          setIncludeHashes={setIncludeHashes}
          includeRelations={includeRelations}
          setIncludeRelations={setIncludeRelations}
        />
      </div>
      
      {/* Column selection */}
      <ColumnSelector 
        columns={columns}
        selectedColumns={selectedColumns}
        loadingColumns={loadingColumns}
        onColumnToggle={onColumnToggle}
      />
      
      {/* Export button */}
      <div className="mt-4">
        <button
          onClick={onExport}
          disabled={loading || selectedColumns.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <RefreshCw size={16} className="animate-spin mr-2" />
              Exporting...
            </>
          ) : (
            <>
              {exportMode === 'evidence' ? (
                <>
                  <Archive size={16} className="mr-2" />
                  Export with Evidence
                  {includeRelations && <Network size={14} className="ml-2" />}
                  {decryptSensitiveData && <Unlock size={14} className="ml-2" />}
                  {uploadToS3 && <CloudUpload size={14} className="ml-2" />}
                </>
              ) : (
                <>
                  <Download size={16} className="mr-2" />
                  Export Selected Columns
                  {decryptSensitiveData && <Unlock size={14} className="ml-2" />}
                  {uploadToS3 && <CloudUpload size={14} className="ml-2" />}
                </>
              )}
            </>
          )}
        </button>
      </div>
      
      {/* Export instructions */}
      <ExportInstructions 
        expanded={expandInstructions}
        toggleExpanded={toggleInstructions}
        exportMode={exportMode}
        includeRelations={includeRelations}
        uploadToS3={uploadToS3}
        decryptSensitiveData={decryptSensitiveData}
      />
    </div>
  );
};

export default ExportControls;