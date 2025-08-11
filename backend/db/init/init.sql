DO $$
BEGIN
    -- Check SSL status
    IF current_setting('ssl') = 'on' THEN
        RAISE NOTICE 'SSL is enabled and certificates are properly configured';
    ELSE
        RAISE WARNING 'SSL is not properly enabled - check your configuration';
        -- Cannot use ALTER SYSTEM inside a function
    END IF;
END $$;

-- Then initialize the database schema
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    internal_ip VARCHAR(45),
    external_ip VARCHAR(45),
    mac_address VARCHAR(17), 
    hostname VARCHAR(75),
    domain VARCHAR(75),
    username VARCHAR(75),
    command TEXT CHECK (LENGTH(command) <= 254),
    notes TEXT CHECK (LENGTH(notes) <= 254),
    filename VARCHAR(254),
    status VARCHAR(75),
    secrets TEXT CHECK (LENGTH(secrets) <= 254),
    hash_algorithm VARCHAR(50),
    hash_value VARCHAR(128),
    pid VARCHAR(20),
    analyst VARCHAR(100),
    locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tags table to store all unique tags
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#6B7280',
    category VARCHAR(50),
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for many-to-many relationship between logs and tags
CREATE TABLE IF NOT EXISTS log_tags (
    id SERIAL PRIMARY KEY,
    log_id INTEGER NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    tagged_by VARCHAR(100),
    tagged_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(log_id, tag_id)
);

-- Evidence files table
CREATE TABLE IF NOT EXISTS evidence_files (
    id SERIAL PRIMARY KEY,
    log_id INTEGER NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    upload_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(100),
    description TEXT,
    md5_hash VARCHAR(32),
    filepath VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- API keys table for managing API authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    key_id VARCHAR(50) NOT NULL UNIQUE,
    key_hash VARCHAR(255) NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    permissions JSONB DEFAULT '["logs:write"]'::jsonb,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    last_used TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create log templates table
CREATE TABLE IF NOT EXISTS log_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_analyst ON logs(analyst);
CREATE INDEX IF NOT EXISTS idx_logs_hostname ON logs(hostname);
CREATE INDEX IF NOT EXISTS idx_logs_hash_value ON logs(hash_value);
CREATE INDEX IF NOT EXISTS idx_logs_mac_address ON logs(mac_address);
CREATE INDEX IF NOT EXISTS idx_logs_pid ON logs(pid);

-- Create indexes for tags
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
CREATE INDEX IF NOT EXISTS idx_tags_is_default ON tags(is_default);
CREATE INDEX IF NOT EXISTS idx_log_tags_log_id ON log_tags(log_id);
CREATE INDEX IF NOT EXISTS idx_log_tags_tag_id ON log_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_log_tags_tagged_at ON log_tags(tagged_at);

-- Create evidence index
CREATE INDEX IF NOT EXISTS idx_evidence_log_id ON evidence_files(log_id);

-- Insert default red team operation tags
INSERT INTO tags (name, color, category, description, is_default) VALUES
-- MITRE ATT&CK Techniques
('reconnaissance', '#3B82F6', 'technique', 'T1595 - Active Scanning, T1592 - Gather Victim Host Information', TRUE),
('initial-access', '#06B6D4', 'technique', 'T1078 - Valid Accounts, T1190 - Exploit Public-Facing Application', TRUE),
('execution', '#14B8A6', 'technique', 'T1059 - Command and Scripting Interpreter', TRUE),
('persistence', '#F59E0B', 'technique', 'T1547 - Boot or Logon Autostart Execution', TRUE),
('privilege-escalation', '#EF4444', 'technique', 'T1548 - Abuse Elevation Control Mechanism', TRUE),
('defense-evasion', '#6366F1', 'technique', 'T1070 - Indicator Removal on Host', TRUE),
('credential-access', '#10B981', 'technique', 'T1003 - OS Credential Dumping', TRUE),
('discovery', '#A855F7', 'technique', 'T1082 - System Information Discovery', TRUE),
('lateral-movement', '#8B5CF6', 'technique', 'T1021 - Remote Services', TRUE),
('collection', '#F472B6', 'technique', 'T1005 - Data from Local System', TRUE),
('command-control', '#EC4899', 'technique', 'T1071 - Application Layer Protocol', TRUE),
('exfiltration', '#F97316', 'technique', 'T1041 - Exfiltration Over C2 Channel', TRUE),
('impact', '#DC2626', 'technique', 'T1486 - Data Encrypted for Impact', TRUE),

-- Common Red Team Tools
('mimikatz', '#DC2626', 'tool', 'Credential dumping tool', TRUE),
('cobalt-strike', '#7C3AED', 'tool', 'Command and Control framework', TRUE),
('metasploit', '#059669', 'tool', 'Exploitation framework', TRUE),
('empire', '#9333EA', 'tool', 'PowerShell post-exploitation framework', TRUE),
('bloodhound', '#BE185D', 'tool', 'Active Directory enumeration', TRUE),
('sharphound', '#DB2777', 'tool', 'BloodHound data collector', TRUE),
('rubeus', '#C026D3', 'tool', 'Kerberos abuse tool', TRUE),
('powershell', '#1E40AF', 'tool', 'Scripting and execution', TRUE),
('wmi', '#B45309', 'tool', 'Windows Management Instrumentation', TRUE),
('psexec', '#7C2D12', 'tool', 'Remote execution tool', TRUE),
('wmic', '#92400E', 'tool', 'WMI command-line utility', TRUE),
('smbexec', '#78350F', 'tool', 'SMB remote execution', TRUE),
('crackmapexec', '#451A03', 'tool', 'Network protocol enumeration', TRUE),
('impacket', '#1C1917', 'tool', 'Network protocol toolkit', TRUE),
('nmap', '#0EA5E9', 'tool', 'Network discovery and scanning', TRUE),

-- Target Types
('domain-controller', '#991B1B', 'target', 'Active Directory Domain Controller', TRUE),
('workstation', '#166534', 'target', 'User workstation', TRUE),
('server', '#1E3A8A', 'target', 'Server system', TRUE),
('database', '#701A75', 'target', 'Database server', TRUE),
('web-application', '#EA580C', 'target', 'Web application or API', TRUE),
('firewall', '#7F1D1D', 'target', 'Firewall or security appliance', TRUE),
('router', '#18181B', 'target', 'Network router', TRUE),
('switch', '#27272A', 'target', 'Network switch', TRUE),
('iot-device', '#0891B2', 'target', 'IoT device', TRUE),
('cloud-resource', '#7DD3FC', 'target', 'Cloud infrastructure', TRUE),

-- Status Indicators
('compromised', '#DC2626', 'status', 'System fully compromised', TRUE),
('partial-access', '#F59E0B', 'status', 'Limited access obtained', TRUE),
('failed-attempt', '#6B7280', 'status', 'Unsuccessful attempt', TRUE),
('in-progress', '#3B82F6', 'status', 'Currently being worked', TRUE),
('cleaned', '#10B981', 'status', 'Artifacts removed/cleaned', TRUE),

-- Priority Levels
('critical', '#991B1B', 'priority', 'Critical finding or action', TRUE),
('high', '#DC2626', 'priority', 'High priority', TRUE),
('medium', '#F59E0B', 'priority', 'Medium priority', TRUE),
('low', '#10B981', 'priority', 'Low priority', TRUE),

-- Workflow Tags
('needs-review', '#8B5CF6', 'workflow', 'Requires team review', TRUE),
('follow-up', '#A78BFA', 'workflow', 'Needs follow-up action', TRUE),
('documented', '#34D399', 'workflow', 'Properly documented', TRUE),
('reported', '#60A5FA', 'workflow', 'Reported to client', TRUE),

-- Evidence Tags
('screenshot', '#06B6D4', 'evidence', 'Has screenshot evidence', TRUE),
('packet-capture', '#0E7490', 'evidence', 'Has network capture', TRUE),
('memory-dump', '#7C2D12', 'evidence', 'Has memory dump', TRUE),
('log-file', '#065F46', 'evidence', 'Has log file evidence', TRUE),

-- Security Classification
('sensitive', '#EF4444', 'security', 'Contains sensitive data', TRUE),
('pii', '#F87171', 'security', 'Contains PII data', TRUE),
('classified', '#B91C1C', 'security', 'Classified information', TRUE),

-- Custom Operation Tags
('phishing', '#F59E0B', 'operation', 'Phishing campaign', TRUE),
('physical', '#6B7280', 'operation', 'Physical security test', TRUE),
('social-engineering', '#8B5CF6', 'operation', 'Social engineering attack', TRUE),
('wireless', '#06B6D4', 'operation', 'Wireless network attack', TRUE),
('web-exploit', '#EF4444', 'operation', 'Web application exploit', TRUE),
('supply-chain', '#10B981', 'operation', 'Supply chain attack', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_logs_updated_at ON logs;
CREATE TRIGGER update_logs_updated_at BEFORE UPDATE ON logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_log_templates_updated_at ON log_templates;
CREATE TRIGGER update_log_templates_updated_at BEFORE UPDATE ON log_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();