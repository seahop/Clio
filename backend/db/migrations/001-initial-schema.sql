-- 001-initial-schema.sql
-- Complete baseline schema for Clio.
--
-- This is the single source of truth for the starting state of the database.
-- Every future schema change gets its own numbered file (002-*, 003-*, …).
--
-- All DDL uses IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS so this file is
-- safe to apply against both a blank database and an existing one that was set
-- up before the migration system was introduced.

-- ── Core application tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logs (
    id           SERIAL PRIMARY KEY,
    timestamp    TIMESTAMPTZ NOT NULL,
    internal_ip  VARCHAR(45),
    external_ip  VARCHAR(45),
    mac_address  VARCHAR(17),
    hostname     VARCHAR(75),
    domain       VARCHAR(75),
    username     VARCHAR(75),
    command      TEXT CHECK (LENGTH(command) <= 254),
    notes        TEXT CHECK (LENGTH(notes)   <= 254),
    filename     VARCHAR(254),
    status       VARCHAR(75),
    secrets      TEXT CHECK (LENGTH(secrets) <= 254),
    hash_algorithm VARCHAR(50),
    hash_value   VARCHAR(128),
    pid          VARCHAR(20),
    analyst      VARCHAR(100),
    locked       BOOLEAN DEFAULT FALSE,
    locked_by    VARCHAR(100),
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    color       VARCHAR(7)  DEFAULT '#6B7280',
    category    VARCHAR(50),
    description TEXT,
    is_default  BOOLEAN     DEFAULT FALSE,
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS log_tags (
    id        SERIAL PRIMARY KEY,
    log_id    INTEGER NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    tagged_by VARCHAR(100),
    tagged_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(log_id, tag_id)
);

CREATE TABLE IF NOT EXISTS operations (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    tag_id      INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    is_active   BOOLEAN     DEFAULT true,
    created_by  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_operations (
    id           SERIAL PRIMARY KEY,
    username     VARCHAR(100) NOT NULL,
    operation_id INTEGER      NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    is_primary   BOOLEAN      DEFAULT false,
    assigned_by  VARCHAR(100) NOT NULL,
    assigned_at  TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, operation_id)
);

CREATE TABLE IF NOT EXISTS evidence_files (
    id                SERIAL PRIMARY KEY,
    log_id            INTEGER      NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    filename          VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type         VARCHAR(100),
    file_size         INTEGER,
    upload_date       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    uploaded_by       VARCHAR(100),
    description       TEXT,
    md5_hash          VARCHAR(32),
    filepath          VARCHAR(255) NOT NULL,
    metadata          JSONB        DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS api_keys (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    key_id       VARCHAR(50)  NOT NULL UNIQUE,
    key_hash     VARCHAR(255) NOT NULL,
    created_by   VARCHAR(100) NOT NULL,
    permissions  JSONB        DEFAULT '["logs:write"]'::jsonb,
    description  TEXT,
    created_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMPTZ,
    is_active    BOOLEAN      DEFAULT TRUE,
    last_used    TIMESTAMPTZ,
    metadata     JSONB        DEFAULT '{}'::jsonb,
    operation_id INTEGER      REFERENCES operations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS log_templates (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    template_data JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_by    VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
);

-- ── Relation-analysis tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS relations (
    id               SERIAL PRIMARY KEY,
    source_type      VARCHAR(50) NOT NULL,
    source_value     TEXT        NOT NULL,
    target_type      VARCHAR(50) NOT NULL,
    target_value     TEXT        NOT NULL,
    strength         INTEGER     DEFAULT 1,
    connection_count INTEGER     DEFAULT 1,
    first_seen       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata         JSONB       DEFAULT '{}'::jsonb,
    operation_tags   INTEGER[]   DEFAULT '{}',
    source_log_ids   INTEGER[]   DEFAULT '{}',
    UNIQUE(source_type, source_value, target_type, target_value)
);

CREATE TABLE IF NOT EXISTS file_status (
    id             SERIAL PRIMARY KEY,
    filename       VARCHAR(100) NOT NULL,
    status         VARCHAR(50)  NOT NULL,
    hostname       VARCHAR(75),
    internal_ip    VARCHAR(45),
    external_ip    VARCHAR(45),
    mac_address    VARCHAR(17),
    username       VARCHAR(75),
    analyst        VARCHAR(100),
    hash_algorithm VARCHAR(50),
    hash_value     VARCHAR(128),
    first_seen     TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    last_seen      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    metadata       JSONB        DEFAULT '{}'::jsonb,
    operation_tags INTEGER[]    DEFAULT '{}',
    source_log_ids INTEGER[]    DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS file_status_history (
    id              SERIAL PRIMARY KEY,
    filename        VARCHAR(100) NOT NULL,
    status          VARCHAR(50)  NOT NULL,
    previous_status VARCHAR(50),
    hostname        VARCHAR(75),
    internal_ip     VARCHAR(45),
    external_ip     VARCHAR(45),
    mac_address     VARCHAR(17),
    username        VARCHAR(75),
    analyst         VARCHAR(100) NOT NULL,
    notes           TEXT,
    command         TEXT,
    secrets         TEXT,
    hash_algorithm  VARCHAR(50),
    hash_value      VARCHAR(128),
    timestamp       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    operation_tags  INTEGER[]    DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS log_relationships (
    id           SERIAL PRIMARY KEY,
    source_id    INTEGER REFERENCES logs(id) ON DELETE CASCADE,
    target_id    INTEGER REFERENCES logs(id) ON DELETE CASCADE,
    relationship VARCHAR(100),
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(100),
    notes        TEXT,
    UNIQUE(source_id, target_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp   ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_analyst      ON logs(analyst);
CREATE INDEX IF NOT EXISTS idx_logs_hostname     ON logs(hostname);
CREATE INDEX IF NOT EXISTS idx_logs_hash_value   ON logs(hash_value);
CREATE INDEX IF NOT EXISTS idx_logs_mac_address  ON logs(mac_address);
CREATE INDEX IF NOT EXISTS idx_logs_pid          ON logs(pid);

-- tags / log_tags
CREATE INDEX IF NOT EXISTS idx_tags_name         ON tags(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tags_category     ON tags(category);
CREATE INDEX IF NOT EXISTS idx_tags_is_default   ON tags(is_default);
CREATE INDEX IF NOT EXISTS idx_log_tags_log_id   ON log_tags(log_id);
CREATE INDEX IF NOT EXISTS idx_log_tags_tag_id   ON log_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_log_tags_tagged_at ON log_tags(tagged_at);

-- operations / user_operations
CREATE INDEX IF NOT EXISTS idx_user_operations_username     ON user_operations(username);
CREATE INDEX IF NOT EXISTS idx_user_operations_operation_id ON user_operations(operation_id);
CREATE INDEX IF NOT EXISTS idx_operations_tag_id            ON operations(tag_id);
CREATE INDEX IF NOT EXISTS idx_operations_is_active         ON operations(is_active);

-- evidence_files
CREATE INDEX IF NOT EXISTS idx_evidence_log_id      ON evidence_files(log_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence_files(uploaded_by);

-- api_keys
CREATE INDEX IF NOT EXISTS idx_api_keys_key_id       ON api_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by   ON api_keys(created_by);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active     ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_operation_id  ON api_keys(operation_id);

-- relations
CREATE INDEX IF NOT EXISTS idx_relations_source       ON relations(source_type, source_value);
CREATE INDEX IF NOT EXISTS idx_relations_target       ON relations(target_type, target_value);
CREATE INDEX IF NOT EXISTS idx_relations_last_seen    ON relations(last_seen);
CREATE INDEX IF NOT EXISTS idx_relations_compound     ON relations(source_type, source_value, target_type, target_value);
CREATE INDEX IF NOT EXISTS idx_relations_metadata_gin ON relations USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_relations_operation_tags ON relations USING GIN (operation_tags);
CREATE INDEX IF NOT EXISTS idx_relations_source_log_ids ON relations USING GIN (source_log_ids);
CREATE INDEX IF NOT EXISTS idx_relations_mac_address_source ON relations(source_value) WHERE source_type = 'mac_address';
CREATE INDEX IF NOT EXISTS idx_relations_mac_address_target ON relations(target_value) WHERE target_type = 'mac_address';
CREATE INDEX IF NOT EXISTS idx_relations_command_sequence   ON relations(source_type, target_type, source_value, target_value)
    WHERE source_type = 'command' AND target_type = 'command';
CREATE INDEX IF NOT EXISTS idx_relations_metadata_type_gin  ON relations USING GIN ((metadata -> 'type'));

-- file_status
ALTER TABLE file_status DROP CONSTRAINT IF EXISTS file_status_filename_key;
DO $$ BEGIN
    BEGIN
        ALTER TABLE file_status ADD CONSTRAINT file_status_composite_key
            UNIQUE (filename, hostname, internal_ip);
    EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
    END;
END $$;

CREATE INDEX IF NOT EXISTS idx_file_status_filename      ON file_status(filename);
CREATE INDEX IF NOT EXISTS idx_file_status_status        ON file_status(status);
CREATE INDEX IF NOT EXISTS idx_file_status_hostname      ON file_status(hostname);
CREATE INDEX IF NOT EXISTS idx_file_status_last_seen     ON file_status(last_seen);
CREATE INDEX IF NOT EXISTS idx_file_status_hash_value    ON file_status(hash_value);
CREATE INDEX IF NOT EXISTS idx_file_status_combined      ON file_status(filename, hostname, internal_ip);
CREATE INDEX IF NOT EXISTS idx_file_status_mac_address   ON file_status(mac_address);
CREATE INDEX IF NOT EXISTS idx_file_status_operation_tags ON file_status USING GIN (operation_tags);
CREATE INDEX IF NOT EXISTS idx_file_status_source_log_ids ON file_status USING GIN (source_log_ids);

-- file_status_history
CREATE INDEX IF NOT EXISTS idx_file_status_history_filename       ON file_status_history(filename);
CREATE INDEX IF NOT EXISTS idx_file_status_history_timestamp      ON file_status_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_file_status_history_mac_address    ON file_status_history(mac_address);
CREATE INDEX IF NOT EXISTS idx_file_status_history_operation_tags ON file_status_history USING GIN (operation_tags);

-- log_relationships
CREATE INDEX IF NOT EXISTS idx_log_relationships_source ON log_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_log_relationships_target ON log_relationships(target_id);

-- ── Functions and triggers ────────────────────────────────────────────────────

-- Auto-create an operation tag when a new operation is inserted
CREATE OR REPLACE FUNCTION create_operation_tag()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tag_id IS NULL THEN
        INSERT INTO tags (name, color, category, description, is_default, created_by)
        VALUES (
            'OP:' || NEW.name,
            '#3B82F6',
            'operation',
            'Auto-generated tag for operation: ' || NEW.name,
            false,
            NEW.created_by
        )
        RETURNING id INTO NEW.tag_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_operation_tag ON operations;
CREATE TRIGGER trigger_create_operation_tag
    BEFORE INSERT ON operations
    FOR EACH ROW EXECUTE FUNCTION create_operation_tag();

-- Maintain updated_at on every mutating UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_logs_updated_at ON logs;
CREATE TRIGGER update_logs_updated_at
    BEFORE UPDATE ON logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_log_templates_updated_at ON log_templates;
CREATE TRIGGER update_log_templates_updated_at
    BEFORE UPDATE ON log_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_operations_updated_at ON operations;
CREATE TRIGGER update_operations_updated_at
    BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Views ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW user_operations_view AS
SELECT
    uo.id,
    uo.username,
    uo.operation_id,
    o.name           AS operation_name,
    o.description    AS operation_description,
    o.tag_id,
    t.name           AS tag_name,
    t.color          AS tag_color,
    uo.is_primary,
    uo.assigned_by,
    uo.assigned_at,
    uo.last_accessed,
    o.is_active      AS operation_is_active
FROM user_operations uo
JOIN operations o ON uo.operation_id = o.id
LEFT JOIN tags t   ON o.tag_id = t.id
WHERE o.is_active = true;

-- ── Helper functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_active_operation(p_username VARCHAR)
RETURNS TABLE (
    operation_id   INTEGER,
    operation_name VARCHAR,
    tag_id         INTEGER,
    tag_name       VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id   AS operation_id,
        o.name AS operation_name,
        o.tag_id,
        t.name AS tag_name
    FROM user_operations uo
    JOIN operations o ON uo.operation_id = o.id
    LEFT JOIN tags t  ON o.tag_id = t.id
    WHERE uo.username = p_username
      AND o.is_active = true
    ORDER BY uo.is_primary DESC, uo.last_accessed DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ── Seed data — default red-team tags ─────────────────────────────────────────
-- ON CONFLICT (name) DO NOTHING means re-running this migration never
-- overwrites user edits to existing tags.

INSERT INTO tags (name, color, category, description, is_default, created_by) VALUES
-- MITRE ATT&CK Techniques
('reconnaissance',     '#3B82F6', 'technique', 'T1595 - Active Scanning, T1592 - Gather Victim Host Information',   TRUE, 'system'),
('initial-access',     '#06B6D4', 'technique', 'T1078 - Valid Accounts, T1190 - Exploit Public-Facing Application', TRUE, 'system'),
('execution',          '#14B8A6', 'technique', 'T1059 - Command and Scripting Interpreter',                         TRUE, 'system'),
('persistence',        '#F59E0B', 'technique', 'T1547 - Boot or Logon Autostart Execution',                         TRUE, 'system'),
('privilege-escalation','#EF4444','technique', 'T1548 - Abuse Elevation Control Mechanism',                         TRUE, 'system'),
('defense-evasion',    '#6366F1', 'technique', 'T1070 - Indicator Removal on Host',                                 TRUE, 'system'),
('credential-access',  '#10B981', 'technique', 'T1003 - OS Credential Dumping',                                     TRUE, 'system'),
('discovery',          '#A855F7', 'technique', 'T1082 - System Information Discovery',                              TRUE, 'system'),
('lateral-movement',   '#8B5CF6', 'technique', 'T1021 - Remote Services',                                           TRUE, 'system'),
('collection',         '#F472B6', 'technique', 'T1005 - Data from Local System',                                    TRUE, 'system'),
('command-control',    '#EC4899', 'technique', 'T1071 - Application Layer Protocol',                                TRUE, 'system'),
('exfiltration',       '#F97316', 'technique', 'T1041 - Exfiltration Over C2 Channel',                              TRUE, 'system'),
('impact',             '#DC2626', 'technique', 'T1486 - Data Encrypted for Impact',                                 TRUE, 'system'),
-- Common Red Team Tools
('mimikatz',           '#DC2626', 'tool', 'Credential dumping tool',                        TRUE, 'system'),
('cobalt-strike',      '#7C3AED', 'tool', 'Command and Control framework',                  TRUE, 'system'),
('metasploit',         '#059669', 'tool', 'Exploitation framework',                         TRUE, 'system'),
('empire',             '#9333EA', 'tool', 'PowerShell post-exploitation framework',         TRUE, 'system'),
('bloodhound',         '#BE185D', 'tool', 'Active Directory enumeration',                   TRUE, 'system'),
('sharphound',         '#DB2777', 'tool', 'BloodHound data collector',                      TRUE, 'system'),
('rubeus',             '#C026D3', 'tool', 'Kerberos abuse tool',                            TRUE, 'system'),
('powershell',         '#1E40AF', 'tool', 'Scripting and execution',                        TRUE, 'system'),
('wmi',                '#B45309', 'tool', 'Windows Management Instrumentation',             TRUE, 'system'),
('psexec',             '#7C2D12', 'tool', 'Remote execution tool',                          TRUE, 'system'),
('wmic',               '#92400E', 'tool', 'WMI command-line utility',                       TRUE, 'system'),
('smbexec',            '#78350F', 'tool', 'SMB remote execution',                           TRUE, 'system'),
('crackmapexec',       '#451A03', 'tool', 'Network protocol enumeration',                   TRUE, 'system'),
('impacket',           '#1C1917', 'tool', 'Network protocol toolkit',                       TRUE, 'system'),
('nmap',               '#0EA5E9', 'tool', 'Network discovery and scanning',                 TRUE, 'system'),
-- Target Types
('domain-controller',  '#991B1B', 'target', 'Active Directory Domain Controller',           TRUE, 'system'),
('workstation',        '#166534', 'target', 'User workstation',                             TRUE, 'system'),
('server',             '#1E3A8A', 'target', 'Server system',                                TRUE, 'system'),
('database',           '#701A75', 'target', 'Database server',                              TRUE, 'system'),
('web-application',    '#EA580C', 'target', 'Web application or API',                       TRUE, 'system'),
('firewall',           '#7F1D1D', 'target', 'Firewall or security appliance',               TRUE, 'system'),
('router',             '#18181B', 'target', 'Network router',                               TRUE, 'system'),
('switch',             '#27272A', 'target', 'Network switch',                               TRUE, 'system'),
('iot-device',         '#0891B2', 'target', 'IoT device',                                   TRUE, 'system'),
('cloud-resource',     '#7DD3FC', 'target', 'Cloud infrastructure',                         TRUE, 'system'),
-- Status Indicators
('compromised',        '#DC2626', 'status', 'System fully compromised',                     TRUE, 'system'),
('partial-access',     '#F59E0B', 'status', 'Limited access obtained',                      TRUE, 'system'),
('failed-attempt',     '#6B7280', 'status', 'Unsuccessful attempt',                         TRUE, 'system'),
('in-progress',        '#3B82F6', 'status', 'Currently being worked',                       TRUE, 'system'),
('cleaned',            '#10B981', 'status', 'Artifacts removed/cleaned',                    TRUE, 'system'),
-- Priority Levels
('critical',           '#991B1B', 'priority', 'Critical finding or action',                 TRUE, 'system'),
('high',               '#DC2626', 'priority', 'High priority',                              TRUE, 'system'),
('medium',             '#F59E0B', 'priority', 'Medium priority',                            TRUE, 'system'),
('low',                '#10B981', 'priority', 'Low priority',                               TRUE, 'system'),
-- Workflow Tags
('needs-review',       '#8B5CF6', 'workflow', 'Requires team review',                       TRUE, 'system'),
('follow-up',          '#A78BFA', 'workflow', 'Needs follow-up action',                     TRUE, 'system'),
('documented',         '#34D399', 'workflow', 'Properly documented',                        TRUE, 'system'),
('reported',           '#60A5FA', 'workflow', 'Reported to client',                         TRUE, 'system'),
-- Evidence Tags
('screenshot',         '#06B6D4', 'evidence', 'Has screenshot evidence',                    TRUE, 'system'),
('packet-capture',     '#0E7490', 'evidence', 'Has network capture',                        TRUE, 'system'),
('memory-dump',        '#7C2D12', 'evidence', 'Has memory dump',                            TRUE, 'system'),
('log-file',           '#065F46', 'evidence', 'Has log file evidence',                      TRUE, 'system'),
-- Security Classification
('sensitive',          '#EF4444', 'security', 'Contains sensitive data',                    TRUE, 'system'),
('pii',                '#F87171', 'security', 'Contains PII data',                          TRUE, 'system'),
('classified',         '#B91C1C', 'security', 'Classified information',                     TRUE, 'system'),
-- Operation Types
('phishing',           '#F59E0B', 'operation', 'Phishing campaign',                         TRUE, 'system'),
('physical',           '#6B7280', 'operation', 'Physical security test',                    TRUE, 'system'),
('social-engineering', '#8B5CF6', 'operation', 'Social engineering attack',                 TRUE, 'system'),
('wireless',           '#06B6D4', 'operation', 'Wireless network attack',                   TRUE, 'system'),
('web-exploit',        '#EF4444', 'operation', 'Web application exploit',                   TRUE, 'system'),
('supply-chain',       '#10B981', 'operation', 'Supply chain attack',                       TRUE, 'system')
ON CONFLICT (name) DO NOTHING;
