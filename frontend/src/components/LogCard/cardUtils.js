// frontend/src/components/LogCard/cardUtils.js
import { statusMeta } from '../common/ui';

/**
 * Format timestamp for display (UTC with a Z suffix).
 */
export const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    // An unparseable timestamp (e.g. a mid-edit value) must not throw during render
    if (isNaN(date.getTime())) return String(timestamp);
    // Format: YYYY-MM-DD HH:MM:SS Z
    return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  };

// Status color helpers now delegate to the single source of truth in
// common/ui/statusMeta.js so the card, file-status view, and legend never drift.
export const getStatusColorClass = (status) => statusMeta(status).text;
export const getStatusChipClass = (status) => statusMeta(status).chip;
export const getStatusAccentClass = (status) => statusMeta(status).stripe;
