// frontend/src/utils/dateUtils.js

/**
 * Format a timestamp for display in UTC with a Zulu indicator.
 * Matches the log card format from components/LogCard/cardUtils.js.
 * @param {string|number|Date} timestamp - Timestamp to format
 * @returns {string} - Formatted date string (YYYY-MM-DD HH:MM:SS Z), '' for falsy input,
 *                     or the raw input as a string if it cannot be parsed as a date
 */
export const formatUTC = (timestamp) => {
  if (!timestamp) return '';

  const date = new Date(timestamp);

  // Guard against invalid dates - show the raw value rather than "Invalid Date"
  if (isNaN(date.getTime())) return String(timestamp);

  // Format: YYYY-MM-DD HH:MM:SS Z
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
};
