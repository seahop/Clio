// backend/services/export/csv.service.js
const { formatValue } = require('../../utils/export/formatter');

/**
 * Generate CSV content from data and columns
 * @param {Array} rows - Data rows from database
 * @param {Array} columns - Columns to include in CSV
 * @returns {String} CSV content
 */
const generateCsv = async (rows, columns) => {
  if (!rows || !rows.length) {
    return columns.join(',') + '\n'; // Return header only
  }
  
  // Create the header
  const header = columns.join(',') + '\n';
  let csvContent = header;

  // Process each row
  for (const row of rows) {
    const csvRow = columns.map(col => {
      return formatValue(row[col], col);
    }).join(',');
    
    csvContent += csvRow + '\n';
  }

  return csvContent;
};

module.exports = {
  generateCsv
};