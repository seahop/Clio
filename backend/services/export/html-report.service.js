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
 * @returns {String} Path to the created HTML file
 */
const createHtmlReport = async (exportDir, logs, evidenceManifest, selectedColumns) => {
  try {
    // Group evidence by log ID for easier lookup
    const evidenceByLogId = evidenceManifest.reduce((acc, evidence) => {
      if (!acc[evidence.log_id]) {
        acc[evidence.log_id] = [];
      }
      acc[evidence.log_id].push(evidence);
      return acc;
    }, {});
    
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
        }
        .tab-button {
          padding: 8px 16px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-weight: bold;
          color: #7f8c8d;
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
        </ul>
      </div>
      
      <div class="tab-container">
        <div class="tab-buttons">
          <button class="tab-button active" onclick="openTab(event, 'tab-logs')">Logs View</button>
          <button class="tab-button" onclick="openTab(event, 'tab-table')">Table View</button>
          <button class="tab-button" onclick="openTab(event, 'tab-evidence')">Evidence Gallery</button>
        </div>
        
        <div id="tab-logs" class="tab-content active">
          <h2>Logs with Evidence</h2>
    `;
    
    // Add each log entry
    logs.forEach(log => {
      const hasEvidence = evidenceByLogId[log.id] && evidenceByLogId[log.id].length > 0;
      const evidenceCount = hasEvidence ? evidenceByLogId[log.id].length : 0;
      
      // Skip logs without evidence in the card view
      if (!hasEvidence) return;
      
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
                ${selectedColumns.map(col => `<th>${col}</th>`).join('')}
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
    
    // Close the HTML
    htmlContent += `
          </div>
        </div>
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