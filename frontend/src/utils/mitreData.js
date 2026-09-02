// frontend/src/utils/mitreData.js
// Bundled MITRE ATT&CK Enterprise reference (curated, cross-platform subset) —
// no external fetch, so it works in airgapped deployments. Each technique lists
// applicable platforms (W=Windows, L=Linux, M=macOS). Extend TECHNIQUES freely;
// any technique ID used elsewhere still stores/displays even if not listed here
// (it surfaces under "Other techniques used" in the coverage view).

export const TACTICS = [
  { id: 'reconnaissance', name: 'Reconnaissance' },
  { id: 'resource-development', name: 'Resource Development' },
  { id: 'initial-access', name: 'Initial Access' },
  { id: 'execution', name: 'Execution' },
  { id: 'persistence', name: 'Persistence' },
  { id: 'privilege-escalation', name: 'Privilege Escalation' },
  { id: 'defense-evasion', name: 'Defense Evasion' },
  { id: 'credential-access', name: 'Credential Access' },
  { id: 'discovery', name: 'Discovery' },
  { id: 'lateral-movement', name: 'Lateral Movement' },
  { id: 'collection', name: 'Collection' },
  { id: 'command-and-control', name: 'Command and Control' },
  { id: 'exfiltration', name: 'Exfiltration' },
  { id: 'impact', name: 'Impact' },
];

// t(id, name, tactic, platforms) — platforms is a subset of "WLM".
const t = (id, name, tactic, platforms = 'WLM') => ({ id, name, tactic, platforms });

export const TECHNIQUES = [
  // Reconnaissance
  t('T1595', 'Active Scanning', 'reconnaissance'),
  t('T1592', 'Gather Victim Host Information', 'reconnaissance'),
  t('T1589', 'Gather Victim Identity Information', 'reconnaissance'),
  t('T1590', 'Gather Victim Network Information', 'reconnaissance'),
  t('T1598', 'Phishing for Information', 'reconnaissance'),
  // Resource Development
  t('T1583', 'Acquire Infrastructure', 'resource-development'),
  t('T1587', 'Develop Capabilities', 'resource-development'),
  t('T1585', 'Establish Accounts', 'resource-development'),
  t('T1588', 'Obtain Capabilities', 'resource-development'),
  // Initial Access
  t('T1190', 'Exploit Public-Facing Application', 'initial-access'),
  t('T1133', 'External Remote Services', 'initial-access'),
  t('T1566', 'Phishing', 'initial-access'),
  t('T1078', 'Valid Accounts', 'initial-access'),
  t('T1195', 'Supply Chain Compromise', 'initial-access'),
  t('T1199', 'Trusted Relationship', 'initial-access'),
  // Execution
  t('T1059', 'Command and Scripting Interpreter', 'execution'),
  t('T1059.001', 'PowerShell', 'execution', 'W'),
  t('T1059.003', 'Windows Command Shell', 'execution', 'W'),
  t('T1059.004', 'Unix Shell', 'execution', 'LM'),
  t('T1059.006', 'Python', 'execution'),
  t('T1203', 'Exploitation for Client Execution', 'execution'),
  t('T1053', 'Scheduled Task/Job', 'execution'),
  t('T1053.003', 'Cron', 'execution', 'LM'),
  t('T1053.005', 'Scheduled Task', 'execution', 'W'),
  t('T1569', 'System Services', 'execution'),
  t('T1204', 'User Execution', 'execution'),
  t('T1047', 'Windows Management Instrumentation', 'execution', 'W'),
  // Persistence
  t('T1098', 'Account Manipulation', 'persistence'),
  t('T1136', 'Create Account', 'persistence'),
  t('T1543', 'Create or Modify System Process', 'persistence'),
  t('T1543.001', 'Launch Agent', 'persistence', 'M'),
  t('T1543.002', 'Systemd Service', 'persistence', 'L'),
  t('T1543.003', 'Windows Service', 'persistence', 'W'),
  t('T1543.004', 'Launch Daemon', 'persistence', 'M'),
  t('T1546', 'Event Triggered Execution', 'persistence'),
  t('T1546.004', 'Unix Shell Configuration Modification', 'persistence', 'LM'),
  t('T1505.003', 'Web Shell', 'persistence'),
  t('T1547', 'Boot or Logon Autostart Execution', 'persistence'),
  t('T1053.006', 'Systemd Timers', 'persistence', 'L'),
  // Privilege Escalation
  t('T1548', 'Abuse Elevation Control Mechanism', 'privilege-escalation'),
  t('T1548.001', 'Setuid and Setgid', 'privilege-escalation', 'LM'),
  t('T1548.003', 'Sudo and Sudo Caching', 'privilege-escalation', 'LM'),
  t('T1134', 'Access Token Manipulation', 'privilege-escalation', 'W'),
  t('T1068', 'Exploitation for Privilege Escalation', 'privilege-escalation'),
  t('T1055', 'Process Injection', 'privilege-escalation'),
  // Defense Evasion
  t('T1140', 'Deobfuscate/Decode Files or Information', 'defense-evasion'),
  t('T1562', 'Impair Defenses', 'defense-evasion'),
  t('T1070', 'Indicator Removal', 'defense-evasion'),
  t('T1070.002', 'Clear Linux or Mac System Logs', 'defense-evasion', 'LM'),
  t('T1070.003', 'Clear Command History', 'defense-evasion'),
  t('T1070.004', 'File Deletion', 'defense-evasion'),
  t('T1036', 'Masquerading', 'defense-evasion'),
  t('T1027', 'Obfuscated Files or Information', 'defense-evasion'),
  t('T1222.002', 'Linux and Mac File and Directory Permissions Modification', 'defense-evasion', 'LM'),
  t('T1218', 'System Binary Proxy Execution', 'defense-evasion', 'W'),
  // Credential Access
  t('T1110', 'Brute Force', 'credential-access'),
  t('T1555', 'Credentials from Password Stores', 'credential-access'),
  t('T1555.001', 'Keychain', 'credential-access', 'M'),
  t('T1003', 'OS Credential Dumping', 'credential-access'),
  t('T1003.001', 'LSASS Memory', 'credential-access', 'W'),
  t('T1003.008', '/etc/passwd and /etc/shadow', 'credential-access', 'L'),
  t('T1558', 'Steal or Forge Kerberos Tickets', 'credential-access', 'W'),
  t('T1552', 'Unsecured Credentials', 'credential-access'),
  t('T1552.003', 'Bash History', 'credential-access', 'LM'),
  // Discovery
  t('T1087', 'Account Discovery', 'discovery'),
  t('T1083', 'File and Directory Discovery', 'discovery'),
  t('T1046', 'Network Service Discovery', 'discovery'),
  t('T1135', 'Network Share Discovery', 'discovery'),
  t('T1040', 'Network Sniffing', 'discovery'),
  t('T1057', 'Process Discovery', 'discovery'),
  t('T1018', 'Remote System Discovery', 'discovery'),
  t('T1082', 'System Information Discovery', 'discovery'),
  t('T1016', 'System Network Configuration Discovery', 'discovery'),
  t('T1033', 'System Owner/User Discovery', 'discovery'),
  t('T1049', 'System Network Connections Discovery', 'discovery'),
  // Lateral Movement
  t('T1210', 'Exploitation of Remote Services', 'lateral-movement'),
  t('T1570', 'Lateral Tool Transfer', 'lateral-movement'),
  t('T1021', 'Remote Services', 'lateral-movement'),
  t('T1021.001', 'Remote Desktop Protocol', 'lateral-movement', 'W'),
  t('T1021.002', 'SMB/Windows Admin Shares', 'lateral-movement', 'W'),
  t('T1021.004', 'SSH', 'lateral-movement', 'LM'),
  t('T1021.005', 'VNC', 'lateral-movement'),
  // Collection
  t('T1560', 'Archive Collected Data', 'collection'),
  t('T1005', 'Data from Local System', 'collection'),
  t('T1039', 'Data from Network Shared Drive', 'collection'),
  t('T1074', 'Data Staged', 'collection'),
  t('T1113', 'Screen Capture', 'collection'),
  t('T1056', 'Input Capture', 'collection'),
  // Command and Control
  t('T1071', 'Application Layer Protocol', 'command-and-control'),
  t('T1071.001', 'Web Protocols', 'command-and-control'),
  t('T1132', 'Data Encoding', 'command-and-control'),
  t('T1573', 'Encrypted Channel', 'command-and-control'),
  t('T1105', 'Ingress Tool Transfer', 'command-and-control'),
  t('T1090', 'Proxy', 'command-and-control'),
  t('T1219', 'Remote Access Software', 'command-and-control'),
  // Exfiltration
  t('T1048', 'Exfiltration Over Alternative Protocol', 'exfiltration'),
  t('T1041', 'Exfiltration Over C2 Channel', 'exfiltration'),
  t('T1567', 'Exfiltration Over Web Service', 'exfiltration'),
  t('T1567.002', 'Exfiltration to Cloud Storage', 'exfiltration'),
  // Impact
  t('T1485', 'Data Destruction', 'impact'),
  t('T1486', 'Data Encrypted for Impact', 'impact'),
  t('T1490', 'Inhibit System Recovery', 'impact'),
  t('T1489', 'Service Stop', 'impact'),
];

const BY_ID = new Map(TECHNIQUES.map(x => [x.id, x]));
export const techniqueName = (id) => BY_ID.get(id)?.name || '';
export const techniquePlatforms = (id) => BY_ID.get(id)?.platforms || '';
export const tacticName = (id) => TACTICS.find(x => x.id === id)?.name || id;

export const PLATFORM_LABEL = { W: 'Windows', L: 'Linux', M: 'macOS' };

// Parse / serialize the comma-separated storage format.
export const parseTechniques = (v) => String(v || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
export const serializeTechniques = (arr) => [...new Set(arr.map(s => s.trim().toUpperCase()).filter(Boolean))].join(',');
