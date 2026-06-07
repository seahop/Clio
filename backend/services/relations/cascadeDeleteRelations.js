// backend/services/relations/cascadeDeleteRelations.js
// Removes relation and file_status rows whose source_log_ids only contain deleted log IDs.
// Used by logs.routes.js delete handlers and relations.routes.js notify/log-delete endpoint.

const db = require('../../db');

async function cascadeDeleteRelations(logIds) {
  const idsToProcess = Array.isArray(logIds) ? logIds : [logIds];
  if (idsToProcess.length === 0) return { relationsRemoved: 0, fileStatusesRemoved: 0 };

  console.log(`Processing cascade delete for ${idsToProcess.length} log(s)`);

  await db.query(`
    UPDATE relations
    SET source_log_ids = ARRAY(
      SELECT unnest(source_log_ids)
      EXCEPT
      SELECT unnest($1::INTEGER[])
    )
    WHERE source_log_ids && $1::INTEGER[]
  `, [idsToProcess]);

  const relationsDeleted = await db.query(`
    DELETE FROM relations WHERE source_log_ids = '{}' RETURNING id
  `);

  await db.query(`
    UPDATE file_status
    SET source_log_ids = ARRAY(
      SELECT unnest(source_log_ids)
      EXCEPT
      SELECT unnest($1::INTEGER[])
    )
    WHERE source_log_ids && $1::INTEGER[]
  `, [idsToProcess]);

  const filesDeleted = await db.query(`
    DELETE FROM file_status WHERE source_log_ids = '{}' RETURNING id
  `);

  const relationsRemoved = relationsDeleted.rows.length;
  const fileStatusesRemoved = filesDeleted.rows.length;

  console.log(`Cascade delete complete: ${relationsRemoved} relations, ${fileStatusesRemoved} file statuses removed`);
  return { relationsRemoved, fileStatusesRemoved };
}

module.exports = cascadeDeleteRelations;
