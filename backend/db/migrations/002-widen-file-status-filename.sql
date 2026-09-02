-- 002-widen-file-status-filename.sql
-- Widen file_status.filename and file_status_history.filename from VARCHAR(100)
-- to VARCHAR(254) to match logs.filename (VARCHAR(254)), so long filenames from
-- logs no longer overflow the analysis tables.
--
-- ALTER COLUMN ... TYPE is safe to re-apply against a database that already has
-- the wider column.

ALTER TABLE file_status ALTER COLUMN filename TYPE VARCHAR(254);
ALTER TABLE file_status_history ALTER COLUMN filename TYPE VARCHAR(254);
