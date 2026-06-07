// backend/utils/tagHelpers.js
const db = require('../db');

/**
 * Fetch operation tag IDs for a set of log IDs.
 * @param {number[]} logIds
 * @returns {Promise<Map<number, number[]>>} Map of logId -> tag ID array
 */
async function fetchOperationTagsForLogs(logIds) {
  if (!logIds || logIds.length === 0) {
    return new Map();
  }

  try {
    const result = await db.query(`
      SELECT
        lt.log_id,
        ARRAY_AGG(DISTINCT lt.tag_id) AS tag_ids
      FROM log_tags lt
      WHERE lt.log_id = ANY($1)
      GROUP BY lt.log_id
    `, [logIds]);

    const tagMap = new Map();
    result.rows.forEach(row => {
      tagMap.set(row.log_id, row.tag_ids || []);
    });
    return tagMap;
  } catch (error) {
    console.error('Error fetching operation tags:', error);
    return new Map();
  }
}

module.exports = { fetchOperationTagsForLogs };
