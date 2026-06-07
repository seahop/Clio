// backend/tools/seed.js
// Populates the database with fake red-team operation data for testing.
// Run with: node tools/seed.js
// Requires the same env vars as the backend (POSTGRES_HOST, POSTGRES_DB, etc.)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../db');
const RelationAnalyzer = require('../services/relations/relationAnalyzer');
const initRelationTables = require('../services/relations/initRelationTables');

// ── Fake data pools ───────────────────────────────────────────────────────────

const ALPHA_USERS   = ['alice', 'bob'];
const BRAVO_USERS   = ['carol', 'dave'];
const ALPHA_HOSTS   = ['WORKSTATION-01', 'WORKSTATION-02', 'SERVER-01'];
const BRAVO_HOSTS   = ['KALI-01', 'KALI-02'];
const ALPHA_INTIPS  = ['10.0.1.10', '10.0.1.11', '10.0.2.10'];
const BRAVO_INTIPS  = ['192.168.1.100', '192.168.1.101'];
const ALPHA_EXTIPS  = ['203.0.113.5', '203.0.113.6'];
const BRAVO_EXTIPS  = ['198.51.100.1', '198.51.100.2'];
const ALPHA_DOMAINS = ['corp.internal', 'dmz.internal'];
const BRAVO_DOMAINS = ['lab.local', 'range.local'];
const ALPHA_MACS    = ['AA-BB-CC-DD-EE-01', 'AA-BB-CC-DD-EE-02', 'FF-EE-DD-CC-BB-01'];
const BRAVO_MACS    = ['11-22-33-44-55-66', '11-22-33-44-55-77'];

const ALPHA_CMDS = [
  'ls -la', 'cat /etc/passwd', 'whoami', 'id', 'uname -a',
  'net user', 'ipconfig', 'dir C:\\\\', 'tasklist', 'systeminfo'
];
const BRAVO_CMDS = [
  'nmap -sV target', 'masscan 10.0.0.0/8', 'gobuster dir -u http://target',
  'sqlmap -u http://target/login', 'hydra -l admin -P wordlist target ssh',
  'msfconsole', 'searchsploit eternal', 'nc -lvp 4444',
  'python3 exploit.py', 'base64 -d payload.b64'
];

const FILE_NAMES    = ['payload.exe', 'creds.txt', 'implant.dll', 'config.json', 'loot.zip', 'malware.sh', 'exfil.tar.gz'];
const FILE_STATUSES = ['ON_DISK', 'IN_MEMORY', 'ENCRYPTED', 'REMOVED', 'CLEANED', 'DETECTED', 'UNKNOWN'];
const HASH_ALGOS    = ['SHA256', 'MD5', 'SHA1'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(Math.floor(Math.random() * 23), Math.floor(Math.random() * 59));
  return d.toISOString();
}

function fakeHash(algo) {
  const len = algo === 'MD5' ? 32 : algo === 'SHA1' ? 40 : 64;
  return Array.from({ length: len }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Initialising relation tables...');
  await initRelationTables();

  // ── Operations ──────────────────────────────────────────────────────────────
  console.log('Creating operations...');

  const alphaResult = await db.query(`
    INSERT INTO operations (name, description, is_active, created_by)
    VALUES ($1, $2, true, 'admin')
    ON CONFLICT DO NOTHING
    RETURNING id
  `, ['Operation Alpha', 'Internal red team engagement']);

  const bravoResult = await db.query(`
    INSERT INTO operations (name, description, is_active, created_by)
    VALUES ($1, $2, true, 'admin')
    ON CONFLICT DO NOTHING
    RETURNING id
  `, ['Operation Bravo', 'External adversary simulation']);

  // Fetch IDs (may already exist if seed was run before)
  const alphaOp = alphaResult.rows[0] ||
    (await db.query(`SELECT id FROM operations WHERE name = 'Operation Alpha'`)).rows[0];
  const bravoOp = bravoResult.rows[0] ||
    (await db.query(`SELECT id FROM operations WHERE name = 'Operation Bravo'`)).rows[0];

  if (!alphaOp || !bravoOp) throw new Error('Failed to create/find operations');

  // Fetch the operation tags (auto-created by trigger)
  const alphaTag = (await db.query(`SELECT t.id FROM tags t JOIN operations o ON o.tag_id = t.id WHERE o.id = $1`, [alphaOp.id])).rows[0];
  const bravoTag = (await db.query(`SELECT t.id FROM tags t JOIN operations o ON o.tag_id = t.id WHERE o.id = $1`, [bravoOp.id])).rows[0];

  console.log(`Alpha op: id=${alphaOp.id}, tag_id=${alphaTag?.id}`);
  console.log(`Bravo op: id=${bravoOp.id}, tag_id=${bravoTag?.id}`);

  // ── Alpha logs (25) ─────────────────────────────────────────────────────────
  console.log('Inserting Alpha operation logs...');
  const alphaLogIds = [];

  for (let i = 0; i < 25; i++) {
    const isFilelog = i >= 20;
    const user = pick(ALPHA_USERS);
    const host = pick(ALPHA_HOSTS);
    const intIp = pick(ALPHA_INTIPS);
    const extIp = pick(ALPHA_EXTIPS);
    const domain = pick(ALPHA_DOMAINS);
    const mac = pick(ALPHA_MACS);
    const algo = pick(HASH_ALGOS);

    const result = await db.query(`
      INSERT INTO logs (timestamp, username, hostname, internal_ip, external_ip, domain,
        mac_address, command, analyst, filename, status, hash_algorithm, hash_value)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [
      daysAgo(Math.floor(Math.random() * 7)),
      user, host, intIp, extIp, domain, mac,
      isFilelog ? null : pick(ALPHA_CMDS),
      'admin',
      isFilelog ? pick(FILE_NAMES) : null,
      isFilelog ? pick(FILE_STATUSES) : null,
      isFilelog ? algo : null,
      isFilelog ? fakeHash(algo) : null
    ]);
    alphaLogIds.push(result.rows[0].id);
  }

  // ── Bravo logs (15) ─────────────────────────────────────────────────────────
  console.log('Inserting Bravo operation logs...');
  const bravoLogIds = [];

  for (let i = 0; i < 15; i++) {
    const isFilelog = i >= 10;
    const user = pick(BRAVO_USERS);
    const host = pick(BRAVO_HOSTS);
    const intIp = pick(BRAVO_INTIPS);
    const extIp = pick(BRAVO_EXTIPS);
    const domain = pick(BRAVO_DOMAINS);
    const mac = pick(BRAVO_MACS);
    const algo = pick(HASH_ALGOS);

    const result = await db.query(`
      INSERT INTO logs (timestamp, username, hostname, internal_ip, external_ip, domain,
        mac_address, command, analyst, filename, status, hash_algorithm, hash_value)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [
      daysAgo(Math.floor(Math.random() * 7)),
      user, host, intIp, extIp, domain, mac,
      isFilelog ? null : pick(BRAVO_CMDS),
      'admin',
      isFilelog ? pick(FILE_NAMES) : null,
      isFilelog ? pick(FILE_STATUSES) : null,
      isFilelog ? algo : null,
      isFilelog ? fakeHash(algo) : null
    ]);
    bravoLogIds.push(result.rows[0].id);
  }

  // ── Untagged admin logs (10) ─────────────────────────────────────────────
  console.log('Inserting untagged admin logs...');
  for (let i = 0; i < 10; i++) {
    await db.query(`
      INSERT INTO logs (timestamp, username, hostname, internal_ip, command, analyst)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [
      daysAgo(Math.floor(Math.random() * 30)),
      'admin',
      `MGMT-HOST-${i + 1}`,
      `172.16.0.${i + 1}`,
      pick([...ALPHA_CMDS, ...BRAVO_CMDS]),
      'admin'
    ]);
  }

  // ── Apply operation tags ─────────────────────────────────────────────────
  if (alphaTag) {
    console.log(`Tagging ${alphaLogIds.length} Alpha logs with tag_id=${alphaTag.id}...`);
    for (const logId of alphaLogIds) {
      await db.query(`
        INSERT INTO log_tags (log_id, tag_id, tagged_by) VALUES ($1, $2, 'admin')
        ON CONFLICT DO NOTHING
      `, [logId, alphaTag.id]);
    }
  }

  if (bravoTag) {
    console.log(`Tagging ${bravoLogIds.length} Bravo logs with tag_id=${bravoTag.id}...`);
    for (const logId of bravoLogIds) {
      await db.query(`
        INSERT INTO log_tags (log_id, tag_id, tagged_by) VALUES ($1, $2, 'admin')
        ON CONFLICT DO NOTHING
      `, [logId, bravoTag.id]);
    }
  }

  // ── Run relation analysis ────────────────────────────────────────────────
  console.log('Running relation analysis on seed data...');
  await RelationAnalyzer.analyzeLogs({ timeWindow: 30 });

  // ── Summary ─────────────────────────────────────────────────────────────
  const logCount = (await db.query('SELECT COUNT(*) FROM logs')).rows[0].count;
  const relCount = (await db.query('SELECT COUNT(*) FROM relations')).rows[0].count;
  const fsCount  = (await db.query('SELECT COUNT(*) FROM file_status')).rows[0].count;

  console.log('\n── Seed complete ────────────────────────────────');
  console.log(`  Logs:          ${logCount}`);
  console.log(`  Relations:     ${relCount}`);
  console.log(`  File statuses: ${fsCount}`);
  console.log('─────────────────────────────────────────────────\n');

  await db.pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
