-- 003-add-mitre-techniques.sql
-- Adds a per-log MITRE ATT&CK technique field: a comma-separated list of
-- technique IDs (e.g. "T1059.001,T1003"). Nullable; populated after the fact
-- via the technique picker. Idempotent.
ALTER TABLE logs ADD COLUMN IF NOT EXISTS mitre_techniques TEXT;
