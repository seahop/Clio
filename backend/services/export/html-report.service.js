// backend/services/export/html-report.service.js
const fs = require('fs').promises;
const path = require('path');
const { formatFileSize } = require('../../utils/export/formatter');

/**
 * Creates an HTML report for the exported data
 * @param {String} exportDir - Export directory path
 * @param {Array} logs - Logs data
 * @param {Array} evidenceManifest - Evidence files manifest
 * @param {Array} selectedColumns - Selected columns to display
 * @param {Object} relationData - Relation data
 * @param {Boolean} includeHashes - Whether to include hash information
 * @returns {String} Path to the created HTML file
 */
const createHtmlReport = async (exportDir, logs, evidenceManifest, selectedColumns, relationData = null, includeHashes = true) => {
  try {
    // Group evidence by log ID for easier lookup
    const evidenceByLogId = evidenceManifest.reduce((acc, evidence) => {
      if (!acc[evidence.log_id]) {
        acc[evidence.log_id] = [];
      }
      acc[evidence.log_id].push(evidence);
      return acc;
    }, {});
    
    // Prepare relation statistics if relations are available
    let relationStats = null;
    if (relationData) {
      relationStats = {
        ipRelations: relationData.ip ? relationData.ip.length : 0,
        hostnameRelations: relationData.hostname ? relationData.hostname.length : 0,
        domainRelations: relationData.domain ? relationData.domain.length : 0,
        userCommands: relationData.userCommands ? relationData.userCommands.length : 0,
        totalRelations: 0
      };
      
      relationStats.totalRelations = 
        relationStats.ipRelations + 
        relationStats.hostnameRelations + 
        relationStats.domainRelations;
        
      // Count unique usernames with commands
      const usersWithCommands = new Set();
      if (relationData.userCommands) {
        relationData.userCommands.forEach(cmd => {
          if (cmd.username) {
            usersWithCommands.add(cmd.username);
          }
        });
      }
      relationStats.uniqueUsers = usersWithCommands.size;
    }
    
    // Create HTML content with header styles
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Clio Logging Export</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        h1, h2, h3 {
          color: #2c3e50;
        }
        .header {
          background-color: #263144;
          color: white;
          padding: 20px;
          border-radius: 5px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .header h1 {
          color: #ffffff;
          font-size: 28px;
          margin-bottom: 5px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
        .header p {
          color: #e0e0e0;
          margin-top: 5px;
          font-size: 15px;
        }
        .log-entry {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .log-header {
          background-color: #f9f9f9;
          padding: 10px;
          margin: -15px -15px 15px -15px;
          border-bottom: 1px solid #ddd;
          border-radius: 5px 5px 0 0;
        }
        .log-data {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 10px;
        }
        .log-field {
          margin-bottom: 5px;
        }
        .field-name {
          font-weight: bold;
          color: #7f8c8d;
        }
        .field-value {
          font-family: monospace;
          background-color: #f9f9f9;
          padding: 3px 6px;
          border-radius: 3px;
          word-break: break-all;
        }
        .evidence-section {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px dashed #ddd;
        }
        .evidence-items {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }
        .evidence-item {
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 10px;
          background-color: #f9f9f9;
        }
        .evidence-thumbnail {
          text-align: center;
          margin-bottom: 10px;
        }
        .evidence-thumbnail img {
          max-width: 100%;
          max-height: 100px;
          border-radius: 3px;
        }
        .thumbnail-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100px;
          background-color: #ecf0f1;
          color: #7f8c8d;
          font-size: 24px;
          border-radius: 3px;
        }
        .evidence-meta {
          font-size: 12px;
          color: #7f8c8d;
        }
        .status-indicator {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .status-on-disk { background-color: #f1c40f; color: #fff; }
        .status-in-memory { background-color: #3498db; color: #fff; }
        .status-encrypted { background-color: #9b59b6; color: #fff; }
        .status-removed { background-color: #e74c3c; color: #fff; }
        .status-cleaned { background-color: #2ecc71; color: #fff; }
        .status-dormant { background-color: #95a5a6; color: #fff; }
        .status-detected { background-color: #e67e22; color: #fff; }
        .status-unknown { background-color: #7f8c8d; color: #fff; }
        .export-info {
          background-color: #d5e9f5;
          padding: 10px 15px;
          border-radius: 5px;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .tab-container {
          margin-top: 20px;
        }
        .tab-buttons {
          display: flex;
          border-bottom: 1px solid #ddd;
          margin-bottom: 15px;
          flex-wrap: wrap;
        }
        .tab-button {
          padding: 8px 16px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-weight: bold;
          color: #7f8c8d;
          margin-bottom: -1px;
        }
        .tab-button.active {
          border-bottom-color: #3498db;
          color: #3498db;
        }
        .tab-content {
          display: none;
        }
        .tab-content.active {
          display: block;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        table, th, td {
          border: 1px solid #ddd;
        }
        th, td {
          padding: 8px 12px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .btn {
          display: inline-block;
          padding: 6px 12px;
          background-color: #3498db;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-size: 12px;
          text-align: center;
          margin-top: 5px;
          border: none;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        .btn:hover {
          background-color: #2980b9;
        }
        .btn-view {
          background-color: #3498db;
        }
        .btn-view:hover {
          background-color: #2980b9;
        }
        .relation-container {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .relation-header {
          font-size: 16px;
          font-weight: bold;
          color: #2c3e50;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #eee;
          display: flex;
          align-items: center;
        }
        .relation-icon {
          width: 24px;
          height: 24px;
          margin-right: 10px;
          background-color: #3498db;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-weight: bold;
        }
        .relation-ip .relation-icon { background-color: #3498db; }
        .relation-hostname .relation-icon { background-color: #2ecc71; }
        .relation-domain .relation-icon { background-color: #9b59b6; }
        .relation-user .relation-icon { background-color: #e74c3c; }
        .relation-connections {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 10px;
        }
        .relation-connection {
          background-color: #f9f9f9;
          border: 1px solid #eee;
          border-radius: 3px;
          padding: 8px;
          position: relative;
        }
        .relation-target {
          font-family: monospace;
          word-break: break-all;
          margin-bottom: 5px;
        }
        .relation-metadata {
          font-size: 11px;
          color: #7f8c8d;
        }
        .relation-strength {
          position: absolute;
          top: 8px;
          right: 8px;
          background-color: #3498db;
          color: white;
          border-radius: 10px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: bold;
        }
        .user-commands {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 15px;
        }
        .user-command-group {
          background-color: #f9f9f9;
          border: 1px solid #eee;
          border-radius: 5px;
          overflow: hidden;
        }
        .user-command-header {
          background-color: #ecf0f1;
          padding: 8px 12px;
          font-weight: bold;
          border-bottom: 1px solid #ddd;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .user-command-list {
          max-height: 400px;
          overflow-y: auto;
        }
        .user-command-item {
          padding: 8px 12px;
          border-bottom: 1px solid #eee;
        }
        .user-command-item:last-child {
          border-bottom: none;
        }
        .user-command-code {
          font-family: monospace;
          background-color: #f1f1f1;
          padding: 4px 6px;
          border-radius: 3px;
          margin-bottom: 4px;
          display: block;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .user-command-time {
          font-size: 11px;
          color: #7f8c8d;
        }
        .relation-count {
          display: inline-block;
          background-color: rgba(0,0,0,0.1);
          border-radius: 10px;
          padding: 0 8px;
          margin-left: 8px;
          font-size: 12px;
        }
        .hash-info {
          margin-top: 10px;
          border-top: 1px dotted #ddd;
          padding-top: 10px;
        }
        .hash-container {
          background-color: #f1f1f1;
          padding: 8px;
          border-radius: 5px;
          margin-top: 5px;
        }
        .hash-algorithm {
          font-weight: bold;
          color: #9b59b6;
          font-size: 13px;
          margin-bottom: 3px;
        }
        .hash-value {
          font-family: monospace;
          word-break: break-all;
          font-size: 12px;
          color: #333;
          background: #e8e8e8;
          padding: 5px;
          border-radius: 3px;
          max-width: 100%;
          overflow-x: auto;
        }
        .hash-section {
          margin-top: 15px;
          border-top: 1px dashed #ccc;
          padding-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Clio Logging Export</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>
      
      <div class="export-info">
        <strong>Export Summary:</strong>
        <ul>
          <li>Total Logs: ${logs.length}</li>
          <li>Total Evidence Files: ${evidenceManifest.length}</li>
          <li>Logs with Evidence: ${Object.keys(evidenceByLogId).length}</li>
          ${includeHashes ? '<li>Hash information included</li>' : ''}
          ${relationData ? `<li>Total Relations: ${relationStats.totalRelations}</li>` : ''}
          ${relationData ? `<li>User Commands: ${relationStats.userCommands} (from ${relationStats.uniqueUsers} users)</li>` : ''}
        </ul>
      </div>
      
      <div class="tab-container">
        <div class="tab-buttons">
          <button class="tab-button active" onclick="openTab(event, 'tab-logs')">Logs View</button>
          <button class="tab-button" onclick="openTab(event, 'tab-table')">Table View</button>
          <button class="tab-button" onclick="openTab(event, 'tab-evidence')">Evidence Gallery</button>
          ${includeHashes ? `<button class="tab-button" onclick="openTab(event, 'tab-hashes')">Hash Information</button>` : ''}
          ${relationData ? `<button class="tab-button" onclick="openTab(event, 'tab-relations')">Relations</button>` : ''}
          ${relationData && relationData.userCommands ? `<button class="tab-button" onclick="openTab(event, 'tab-commands')">User Commands</button>` : ''}
        </div>
        
        <div id="tab-logs" class="tab-content active">
          <h2>All Logs</h2>
    `;
    
    // Add each log entry
    logs.forEach(log => {
      const hasEvidence = evidenceByLogId[log.id] && evidenceByLogId[log.id].length > 0;
      const evidenceCount = hasEvidence ? evidenceByLogId[log.id].length : 0;
      
      const logDate = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown Date';
      let statusClass = 'status-unknown';
      
      if (log.status) {
        statusClass = `status-${log.status.toLowerCase().replace('_', '-')}`;
      }
      
      htmlContent += `
        <div class="log-entry" id="log-${log.id}">
          <div class="log-header">
            <h3>Log #${log.id} - ${logDate}</h3>
            ${log.status ? `<span class="status-indicator ${statusClass}">${log.status}</span>` : ''}
            ${hasEvidence ? `<span style="float: right;">${evidenceCount} Evidence Files</span>` : ''}
          </div>
          
          <div class="log-data">
      `;
      
      // Add log fields
      selectedColumns.forEach(column => {
        if (log[column] !== undefined && log[column] !== null) {
          let displayValue = log[column];
          
          // Format timestamp
          if (column === 'timestamp' && displayValue) {
            displayValue = new Date(displayValue).toLocaleString();
          }
          
          // Skip hash fields here as we'll display them in a separate section
          if ((column === 'hash_algorithm' || column === 'hash_value') && includeHashes) {
            return;
          }
          
          htmlContent += `
            <div class="log-field">
              <div class="field-name">${column}:</div>
              <div class="field-value">${displayValue}</div>
            </div>
          `;
        }
      });
      
      htmlContent += `
          </div>
      `;
      
      // Add hash information if requested and available
      if (includeHashes && (log.hash_algorithm || log.hash_value)) {
        htmlContent += `
          <div class="hash-info">
            <div class="field-name">Hash Information:</div>
            <div class="hash-container">
              ${log.hash_algorithm ? `<div class="hash-algorithm">Algorithm: ${log.hash_algorithm}</div>` : ''}
              ${log.hash_value ? `<div class="hash-value">${log.hash_value}</div>` : ''}
            </div>
          </div>
        `;
      }
      
      // Add evidence section if there is any
      if (hasEvidence) {
        htmlContent += `
          <div class="evidence-section">
            <h4>Evidence Files (${evidenceCount})</h4>
            <div class="evidence-items">
        `;
        
        evidenceByLogId[log.id].forEach(evidence => {
          const isImage = evidence.file_type && evidence.file_type.startsWith('image/');
          
          htmlContent += `
            <div class="evidence-item">
              <div class="evidence-thumbnail">
          `;
          
          if (isImage) {
            htmlContent += `
              <img src="evidence/${evidence.export_filename}" alt="${evidence.original_filename}">
            `;
          } else {
            // For non-images, show a placeholder with file extension
            const fileExt = path.extname(evidence.original_filename).toUpperCase().substring(1);
            htmlContent += `
              <div class="thumbnail-placeholder">
                ${fileExt || 'FILE'}
              </div>
            `;
          }
          
          htmlContent += `
              </div>
              <div>${evidence.original_filename}</div>
              <div class="evidence-meta">
                ${evidence.file_type || 'Unknown Type'} - ${formatFileSize(evidence.file_size)}
              </div>
              <div class="evidence-meta">
                Uploaded by ${evidence.uploaded_by} on ${new Date(evidence.upload_date).toLocaleString()}
              </div>
              ${evidence.description ? `<div class="evidence-meta">${evidence.description}</div>` : ''}
              <a href="evidence/${evidence.export_filename}" class="btn btn-view" target="_blank">View File</a>
            </div>
          `;
        });
        
        htmlContent += `
            </div>
          </div>
        `;
      }
      
      htmlContent += `
        </div>
      `;
    });
    
    // Add table view tab
    htmlContent += `
        </div>
        
        <div id="tab-table" class="tab-content">
          <h2>Logs Table (All ${logs.length} logs)</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                ${selectedColumns.filter(col => col !== 'hash_algorithm' && col !== 'hash_value' || !includeHashes).map(col => `<th>${col}</th>`).join('')}
                ${includeHashes ? '<th>Hash Information</th>' : ''}
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    logs.forEach(log => {
      const hasEvidence = evidenceByLogId[log.id] && evidenceByLogId[log.id].length > 0;
      const evidenceCount = hasEvidence ? evidenceByLogId[log.id].length : 0;
      
      htmlContent += `
        <tr>
          <td><a href="#log-${log.id}">${log.id}</a></td>
      `;
      
      selectedColumns.forEach(column => {
        // Skip hash columns if they'll be displayed in their own column
        if ((column === 'hash_algorithm' || column === 'hash_value') && includeHashes) {
          return;
        }
        
        let displayValue = log[column] !== undefined && log[column] !== null ? log[column] : '';
        
        // Format timestamp
        if (column === 'timestamp' && displayValue) {
          displayValue = new Date(displayValue).toLocaleString();
        }
        
        // Add status indicator
        if (column === 'status' && displayValue) {
          const statusClass = `status-${displayValue.toLowerCase().replace('_', '-')}`;
          displayValue = `<span class="status-indicator ${statusClass}">${displayValue}</span>`;
        }
        
        htmlContent += `<td>${displayValue}</td>`;
      });
      
      // Add hash information column if requested
      if (includeHashes) {
        htmlContent += `
          <td>
            ${log.hash_algorithm || log.hash_value ? `
              <div>
                ${log.hash_algorithm ? `<div style="font-weight:bold;color:#9b59b6">${log.hash_algorithm}</div>` : ''}
                ${log.hash_value ? `<div style="font-family:monospace;font-size:11px;word-break:break-all">${log.hash_value}</div>` : ''}
              </div>
            ` : '-'}
          </td>
        `;
      }
      
      htmlContent += `
          <td>${evidenceCount > 0 ? `<a href="#log-${log.id}">${evidenceCount} files</a>` : 'None'}</td>
        </tr>
      `;
    });
    
    htmlContent += `
            </tbody>
          </table>
        </div>
        
        <div id="tab-evidence" class="tab-content">
          <h2>Evidence Gallery (${evidenceManifest.length} files)</h2>
          
          <div class="evidence-items">
    `;
    
    // Add evidence gallery
    evidenceManifest.forEach(evidence => {
      const isImage = evidence.file_type && evidence.file_type.startsWith('image/');
      
      htmlContent += `
        <div class="evidence-item">
          <div class="evidence-thumbnail">
      `;
      
      if (isImage) {
        htmlContent += `
          <img src="evidence/${evidence.export_filename}" alt="${evidence.original_filename}">
        `;
      } else {
        // For non-images, show a placeholder with file extension
        const fileExt = path.extname(evidence.original_filename).toUpperCase().substring(1);
        htmlContent += `
          <div class="thumbnail-placeholder">
            ${fileExt || 'FILE'}
          </div>
        `;
      }
      
      htmlContent += `
          </div>
          <div>${evidence.original_filename}</div>
          <div class="evidence-meta">
            For Log <a href="#log-${evidence.log_id}">#${evidence.log_id}</a>
          </div>
          <div class="evidence-meta">
            ${evidence.file_type || 'Unknown Type'} - ${formatFileSize(evidence.file_size)}
          </div>
          <div class="evidence-meta">
            Uploaded by ${evidence.uploaded_by} on ${new Date(evidence.upload_date).toLocaleString()}
          </div>
          ${evidence.description ? `<div class="evidence-meta">${evidence.description}</div>` : ''}
          <a href="evidence/${evidence.export_filename}" class="btn btn-view" target="_blank">View File</a>
        </div>
      `;
    });
    
    htmlContent += `
          </div>
        </div>
    `;
    
    // Add hash information tab if requested
    if (includeHashes) {
      htmlContent += `
        <div id="tab-hashes" class="tab-content">
          <h2>File Hash Information</h2>
          
          <div class="export-info">
            <p>This section shows hash information for files mentioned in the logs.</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Filename</th>
                <th>Algorithm</th>
                <th>Hash Value</th>
                <th>Status</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      // Filter logs with hash information
      const logsWithHashes = logs.filter(log => log.hash_algorithm || log.hash_value);
      
      if (logsWithHashes.length === 0) {
        htmlContent += `
          <tr>
            <td colspan="6" style="text-align:center">No hash information found in the logs</td>
          </tr>
        `;
      } else {
        logsWithHashes.forEach(log => {
          const logDate = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown Date';
          let statusClass = 'status-unknown';
          
          if (log.status) {
            statusClass = `status-${log.status.toLowerCase().replace('_', '-')}`;
          }
          
          htmlContent += `
            <tr>
              <td><a href="#log-${log.id}">${log.id}</a></td>
              <td>${log.filename || '-'}</td>
              <td>${log.hash_algorithm || '-'}</td>
              <td style="font-family:monospace;word-break:break-all">${log.hash_value || '-'}</td>
              <td>${log.status ? `<span class="status-indicator ${statusClass}">${log.status}</span>` : '-'}</td>
              <td>${logDate}</td>
            </tr>
          `;
        });
      }
      
      htmlContent += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Add relations tab if relation data is available
    if (relationData) {
      htmlContent += `
        <div id="tab-relations" class="tab-content">
          <h2>Relations Data</h2>
          
          <div class="export-info">
            <p>This section shows the relationships between different entities discovered in the logs. 
            Relations are grouped by type and show the connections between various network components.</p>
          </div>
          
          <!-- IP Relations -->
          <h3>IP Relations (${relationData.ip ? relationData.ip.length : 0})</h3>
          <div class="relation-containers">
      `;
      
      // Add IP relations
      if (relationData.ip && relationData.ip.length > 0) {
        relationData.ip.forEach(relation => {
          htmlContent += `
            <div class="relation-container relation-ip">
              <div class="relation-header">
                <div class="relation-icon">IP</div>
                <div>${relation.source} <span class="relation-count">${relation.related.length} connections</span></div>
              </div>
              
              <div class="relation-connections">
          `;
          
          relation.related.forEach(connection => {
            htmlContent += `
              <div class="relation-connection">
                <div class="relation-target">${connection.target}</div>
                <div class="relation-metadata">Last seen: ${new Date(connection.lastSeen).toLocaleString()}</div>
                <div class="relation-strength">${Math.round(connection.strength || 0)}</div>
              </div>
            `;
          });
          
          htmlContent += `
              </div>
            </div>
          `;
        });
      } else {
        htmlContent += `<p>No IP relations found</p>`;
      }
      
      // Add hostname relations
      htmlContent += `
          </div>
          
          <h3>Hostname Relations (${relationData.hostname ? relationData.hostname.length : 0})</h3>
          <div class="relation-containers">
      `;
      
      if (relationData.hostname && relationData.hostname.length > 0) {
        relationData.hostname.forEach(relation => {
          htmlContent += `
            <div class="relation-container relation-hostname">
              <div class="relation-header">
                <div class="relation-icon">H</div>
                <div>${relation.source} <span class="relation-count">${relation.related.length} connections</span></div>
              </div>
              
              <div class="relation-connections">
          `;
          
          relation.related.forEach(connection => {
            htmlContent += `
              <div class="relation-connection">
                <div class="relation-target">${connection.target}</div>
                <div class="relation-metadata">Last seen: ${new Date(connection.lastSeen).toLocaleString()}</div>
                <div class="relation-strength">${Math.round(connection.strength || 0)}</div>
              </div>
            `;
          });
          
          htmlContent += `
              </div>
            </div>
          `;
        });
      } else {
        htmlContent += `<p>No hostname relations found</p>`;
      }
      
      // Add domain relations
      htmlContent += `
          </div>
          
          <h3>Domain Relations (${relationData.domain ? relationData.domain.length : 0})</h3>
          <div class="relation-containers">
      `;
      
      if (relationData.domain && relationData.domain.length > 0) {
        relationData.domain.forEach(relation => {
          htmlContent += `
            <div class="relation-container relation-domain">
              <div class="relation-header">
                <div class="relation-icon">D</div>
                <div>${relation.source} <span class="relation-count">${relation.related.length} connections</span></div>
              </div>
              
              <div class="relation-connections">
          `;
          
          relation.related.forEach(connection => {
            htmlContent += `
              <div class="relation-connection">
                <div class="relation-target">${connection.target}</div>
                <div class="relation-metadata">Last seen: ${new Date(connection.lastSeen).toLocaleString()}</div>
                <div class="relation-strength">${Math.round(connection.strength || 0)}</div>
              </div>
            `;
          });
          
          htmlContent += `
              </div>
            </div>
          `;
        });
      } else {
        htmlContent += `<p>No domain relations found</p>`;
      }
      
      htmlContent += `
          </div>
        </div>
      `;
      
      // Add user commands tab if available
      if (relationData.userCommands && relationData.userCommands.length > 0) {
        htmlContent += `
          <div id="tab-commands" class="tab-content">
            <h2>User Command History</h2>
            
            <div class="export-info">
              <p>This section shows all commands executed by users, organized by username.</p>
            </div>
        `;
        
        // Group commands by username
        const commandsByUser = {};
        relationData.userCommands.forEach(cmd => {
          if (!cmd.username || !cmd.command) return;
          
          if (!commandsByUser[cmd.username]) {
            commandsByUser[cmd.username] = [];
          }
          
          commandsByUser[cmd.username].push({
            command: cmd.command,
            first_seen: cmd.first_seen,
            last_seen: cmd.last_seen,
            timestamp: cmd.timestamp || cmd.metadata?.timestamp
          });
        });
        
        // Sort users
        const usernames = Object.keys(commandsByUser).sort();
        
        htmlContent += `<div class="user-commands">`;
        
        usernames.forEach(username => {
          const commands = commandsByUser[username];
          
          // Sort commands by timestamp (newest first)
          commands.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          
          htmlContent += `
            <div class="user-command-group">
              <div class="user-command-header">
                <div>${username}</div>
                <div class="relation-count">${commands.length} commands</div>
              </div>
              
              <div class="user-command-list">
          `;
          
          commands.forEach(cmd => {
            htmlContent += `
              <div class="user-command-item">
                <code class="user-command-code">${cmd.command}</code>
                <div class="user-command-time">
                    ${cmd.last_seen ? new Date(cmd.last_seen).toLocaleString() : (cmd.first_seen ? new Date(cmd.first_seen).toLocaleString() : 'Unknown time')}
                </div>
              </div>
            `;
          });
          
          htmlContent += `
              </div>
            </div>
          `;
        });
        
        htmlContent += `
            </div>
          </div>
        `;
      }
    }
    
    // Close the HTML
    htmlContent += `
      </div>
      
      <script>
        function openTab(evt, tabName) {
          // Hide all tab contents
          var tabContents = document.getElementsByClassName("tab-content");
          for (var i = 0; i < tabContents.length; i++) {
            tabContents[i].classList.remove("active");
          }
          
          // Remove active class from all tab buttons
          var tabButtons = document.getElementsByClassName("tab-button");
          for (var i = 0; i < tabButtons.length; i++) {
            tabButtons[i].classList.remove("active");
          }
          
          // Show the specific tab content
          document.getElementById(tabName).classList.add("active");
          
          // Add active class to the button that opened the tab
          evt.currentTarget.classList.add("active");
        }
        
        // Check if there's a hash in the URL and scroll to that element
        document.addEventListener('DOMContentLoaded', function() {
          if (window.location.hash) {
            const element = document.querySelector(window.location.hash);
            if (element) {
              element.scrollIntoView();
            }
          }
        });
      </script>
    </body>
    </html>
    `;
    
    // Write the HTML file
    const htmlFilePath = path.join(exportDir, 'index.html');
    await fs.writeFile(htmlFilePath, htmlContent);
    
    return htmlFilePath;
  } catch (error) {
    console.error('Error creating HTML report:', error);
    throw error;
  }
};

module.exports = {
  createHtmlReport
};