-- 004-long-commands.sql
-- Long commands, stored verbatim.
--
-- 1. logs.command: the 254-character limit becomes 32768 (encoded PowerShell
--    and pasted one-liners routinely exceed 254).
-- 2. relations: B-tree index entries are capped at ~2.7 KB, so a long command
--    in source_value/target_value would make relation upserts fail.
--    Uniqueness moves to md5() of the values, and equality lookups use hash
--    indexes, which have no size limit. models/relations.js targets the new
--    unique index in its ON CONFLICT clauses.
--
--    Backward compatible on purpose: this migration only ADDS the new
--    indexes. The Helm chart runs it as a pre-upgrade Job while the previous
--    backend is still serving, and that version's ON CONFLICT clauses need
--    the old (source_type, source_value, target_type, target_value) unique
--    constraint. The new backend drops the old constraint and B-tree indexes
--    at startup (initRelationTables), once the old code is gone.
-- 3. Earlier versions HTML-escaped < > and ':' (in "data:"/"javascript:")
--    when saving command-like fields, so ">> $PROFILE" was stored as
--    "&gt;&gt; $PROFILE". Values are now stored verbatim (output is escaped
--    where it is rendered); decode what was written before. The encrypted
--    secrets column cannot be decoded in SQL and is left as is.
-- Idempotent.

-- ── 1. logs.command length ──────────────────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'logs'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%length(command)%'
  LOOP
    EXECUTE format('ALTER TABLE logs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE logs ADD CONSTRAINT logs_command_length_check CHECK (length(command) <= 32768);

-- ── 2. relations indexes safe for long values ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS relations_values_unique
  ON relations (source_type, md5(source_value), target_type, md5(target_value));
CREATE INDEX IF NOT EXISTS idx_relations_source_value ON relations USING hash (source_value);
CREATE INDEX IF NOT EXISTS idx_relations_target_value ON relations USING hash (target_value);
CREATE INDEX IF NOT EXISTS idx_relations_types        ON relations (source_type, target_type);

-- ── 3. Decode HTML entities written by earlier versions ─────────────────────
CREATE OR REPLACE FUNCTION pg_temp.clio_decode(v text) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$$ SELECT replace(replace(replace(v, '&lt;', '<'), '&gt;', '>'), '&#58;', ':') $$;

UPDATE logs SET command  = pg_temp.clio_decode(command)  WHERE command  ~ '&(lt|gt|#58);';
UPDATE logs SET notes    = pg_temp.clio_decode(notes)    WHERE notes    ~ '&(lt|gt|#58);';
UPDATE logs SET filename = pg_temp.clio_decode(filename) WHERE filename ~ '&(lt|gt|#58);';

UPDATE file_status_history SET command = pg_temp.clio_decode(command) WHERE command ~ '&(lt|gt|#58);';
UPDATE file_status_history SET notes   = pg_temp.clio_decode(notes)   WHERE notes   ~ '&(lt|gt|#58);';

UPDATE log_templates t
   SET template_data = t.template_data
         || CASE WHEN t.template_data->>'command' ~ '&(lt|gt|#58);'
                 THEN jsonb_build_object('command', pg_temp.clio_decode(t.template_data->>'command')) ELSE '{}' END
         || CASE WHEN t.template_data->>'notes' ~ '&(lt|gt|#58);'
                 THEN jsonb_build_object('notes', pg_temp.clio_decode(t.template_data->>'notes')) ELSE '{}' END
 WHERE t.template_data->>'command' ~ '&(lt|gt|#58);'
    OR t.template_data->>'notes'   ~ '&(lt|gt|#58);';

-- Relations are an analysis cache keyed on these values. Decode them too so
-- new (verbatim) commands match existing relations; a row whose decoded key
-- already exists is left as is rather than violating the unique index.
UPDATE relations r
   SET source_value = pg_temp.clio_decode(r.source_value)
 WHERE r.source_value ~ '&(lt|gt|#58);'
   AND NOT EXISTS (
     SELECT 1 FROM relations x
      WHERE x.source_type = r.source_type AND md5(x.source_value) = md5(pg_temp.clio_decode(r.source_value))
        AND x.target_type = r.target_type AND md5(x.target_value) = md5(r.target_value));
UPDATE relations r
   SET target_value = pg_temp.clio_decode(r.target_value)
 WHERE r.target_value ~ '&(lt|gt|#58);'
   AND NOT EXISTS (
     SELECT 1 FROM relations x
      WHERE x.source_type = r.source_type AND md5(x.source_value) = md5(r.source_value)
        AND x.target_type = r.target_type AND md5(x.target_value) = md5(pg_temp.clio_decode(r.target_value)));
UPDATE relations
   SET metadata = jsonb_set(metadata, '{originalCommand}', to_jsonb(pg_temp.clio_decode(metadata->>'originalCommand')))
 WHERE metadata->>'originalCommand' ~ '&(lt|gt|#58);';
