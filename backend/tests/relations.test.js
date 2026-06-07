// backend/tests/relations.test.js
// Run with: node --test tests/relations.test.js
// Requires live DB connection via POSTGRES_* env vars.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const { validateInputLengths } = require('../middleware/sanitize.middleware');
const RelationsModel = require('../models/relations');
const RelationAnalyzer = require('../services/relations/relationAnalyzer');
const { UserCommandAnalyzer } = require('../services/relations/analyzers');
const initRelationTables = require('../services/relations/initRelationTables');

// ── Ensure tables exist before tests run ─────────────────────────────────────

before(async () => {
  await initRelationTables();
});

// ── Suite 1: validateInputLengths (unit — no DB) ─────────────────────────────

describe('validateInputLengths', () => {
  test('detects violation at top level', () => {
    const errors = validateInputLengths({ hostname: 'x'.repeat(76) });
    assert.ok(errors.length > 0, 'expected an error');
    assert.ok(errors[0].includes('hostname'), `error should mention field name, got: ${errors[0]}`);
  });

  test('detects violation in nested object with qualified key', () => {
    const errors = validateInputLengths({ metadata: { hostname: 'x'.repeat(76) } });
    assert.ok(errors.length > 0, 'expected an error for nested hostname');
    assert.ok(errors[0].includes('metadata.hostname'), `error should include path, got: ${errors[0]}`);
  });

  test('detects deeply nested violation', () => {
    const errors = validateInputLengths({ outer: { inner: { hostname: 'x'.repeat(76) } } });
    assert.ok(errors.length > 0, 'expected an error');
    assert.ok(errors[0].includes('outer.inner.hostname'), `error should include full path, got: ${errors[0]}`);
  });

  test('passes for valid nested values', () => {
    const errors = validateInputLengths({ metadata: { hostname: 'short-host' } });
    assert.equal(errors.length, 0, 'expected no errors for valid data');
  });

  test('returns empty array for null input', () => {
    assert.deepEqual(validateInputLengths(null), []);
  });

  test('returns empty array for array input', () => {
    assert.deepEqual(validateInputLengths([]), []);
  });
});

// ── Suite 2: Stale-command removal (integration) ─────────────────────────────

describe('stale command removal', () => {
  const TEST_USER = 't_stale_user_' + Date.now();

  before(async () => {
    // Insert two command relations with unique suffixes (mimicking what upsertRelation does)
    await db.query(`
      INSERT INTO relations (source_type, source_value, target_type, target_value, metadata, operation_tags, source_log_ids)
      VALUES
        ('username', $1, 'command', 'ls -la#1234_keep', '{"originalCommand":"ls -la"}'::jsonb, '{}', '{}'),
        ('username', $1, 'command', 'cat /etc/passwd#5678_delete', '{"originalCommand":"cat /etc/passwd"}'::jsonb, '{}', '{}')
    `, [TEST_USER]);
  });

  after(async () => {
    await db.query(`DELETE FROM relations WHERE source_value = $1`, [TEST_USER]);
  });

  test('removes stale command and keeps active command', async () => {
    const analyzer = new UserCommandAnalyzer();

    // existingUserCommandSet matches what _getExistingUserCommands would return:
    // it uses metadata->>'originalCommand', so the set contains clean commands
    const existingSet = new Set([
      `${TEST_USER}§ls -la`,
      `${TEST_USER}§cat /etc/passwd`
    ]);

    // Only 'ls -la' is active
    const activeCommands = [{ username: TEST_USER, command: 'ls -la' }];

    await analyzer._removeStaleCommands(activeCommands, existingSet);

    // 'cat /etc/passwd' row should be gone
    const remaining = await db.query(
      `SELECT metadata->>'originalCommand' as cmd FROM relations WHERE source_value = $1 AND target_type = 'command'`,
      [TEST_USER]
    );

    const cmds = remaining.rows.map(r => r.cmd);
    assert.ok(!cmds.includes('cat /etc/passwd'), `stale command should be removed, found: ${cmds}`);
    assert.ok(cmds.includes('ls -la'), `active command should remain, found: ${cmds}`);
  });
});

// ── Suite 3: RelationAnalyzer integration ────────────────────────────────────

describe('RelationAnalyzer integration', () => {
  const TS = Date.now();
  const TEST_PREFIX = 't_ra_' + TS;
  let logIds = [];

  before(async () => {
    const now = new Date().toISOString();
    // Insert 5 controlled logs
    const rows = await db.query(`
      INSERT INTO logs (timestamp, username, hostname, internal_ip, external_ip, domain, mac_address, command, analyst, filename, status)
      VALUES
        ($1, '${TEST_PREFIX}_alice', '${TEST_PREFIX}_host1', '10.99.1.1', '1.2.3.4', '${TEST_PREFIX}.corp', 'AA-00-BB-00-CC-01', '${TEST_PREFIX}_whoami', 'admin', null, null),
        ($1, '${TEST_PREFIX}_alice', '${TEST_PREFIX}_host1', '10.99.1.1', '1.2.3.4', null, null, '${TEST_PREFIX}_id', 'admin', null, null),
        ($1, '${TEST_PREFIX}_bob',   '${TEST_PREFIX}_host2', '10.99.1.2', null, '${TEST_PREFIX}.corp', null, null, 'admin', null, null),
        ($1, '${TEST_PREFIX}_alice', '${TEST_PREFIX}_host1', '10.99.1.1', null, null, null, null, 'admin', '${TEST_PREFIX}_payload.exe', 'ON_DISK'),
        ($1, '${TEST_PREFIX}_alice', '${TEST_PREFIX}_host1', null, null, null, null, null, 'admin', null, null)
      RETURNING id
    `, [now]);
    logIds = rows.rows.map(r => r.id);
  });

  after(async () => {
    if (logIds.length) {
      await db.query(`DELETE FROM relations WHERE source_value LIKE $1 OR target_value LIKE $1`, [`${TEST_PREFIX}%`]);
      await db.query(`DELETE FROM file_status WHERE filename LIKE $1`, [`${TEST_PREFIX}%`]);
      await db.query(`DELETE FROM logs WHERE id = ANY($1)`, [logIds]);
    }
  });

  test('user→command relation is created', async () => {
    const testLogs = (await db.query(`SELECT * FROM logs WHERE id = ANY($1)`, [logIds])).rows;
    await RelationAnalyzer.analyzeSpecificLogs(testLogs, { types: ['user'] });

    const result = await db.query(`
      SELECT metadata->>'originalCommand' as cmd
      FROM relations
      WHERE source_type = 'username' AND source_value = $1
    `, [`${TEST_PREFIX}_alice`]);

    const cmds = result.rows.map(r => r.cmd);
    assert.ok(cmds.some(c => c === `${TEST_PREFIX}_whoami`), `expected whoami relation, found: ${cmds}`);
    assert.ok(cmds.some(c => c === `${TEST_PREFIX}_id`), `expected id relation, found: ${cmds}`);
  });

  test('ip→ip relation is created for internal→external pair', async () => {
    const testLogs = (await db.query(`SELECT * FROM logs WHERE id = ANY($1)`, [logIds])).rows;
    await RelationAnalyzer.analyzeSpecificLogs(testLogs, { types: ['ip'] });

    const result = await db.query(`
      SELECT * FROM relations
      WHERE source_type = 'ip' AND source_value = '10.99.1.1' AND target_type = 'ip' AND target_value = '1.2.3.4'
    `);
    assert.ok(result.rows.length > 0, 'expected ip→ip relation');
  });

  test('hostname→domain relation is created', async () => {
    const testLogs = (await db.query(`SELECT * FROM logs WHERE id = ANY($1)`, [logIds])).rows;
    await RelationAnalyzer.analyzeSpecificLogs(testLogs, { types: ['hostname'] });

    const result = await db.query(`
      SELECT * FROM relations
      WHERE source_type = 'hostname' AND source_value = $1 AND target_type = 'domain' AND target_value = $2
    `, [`${TEST_PREFIX}_host1`, `${TEST_PREFIX}.corp`]);
    assert.ok(result.rows.length > 0, 'expected hostname→domain relation');
  });

  test('mac→ip relation is created', async () => {
    const testLogs = (await db.query(`SELECT * FROM logs WHERE id = ANY($1)`, [logIds])).rows;
    await RelationAnalyzer.analyzeSpecificLogs(testLogs, { types: ['mac_address'] });

    const result = await db.query(`
      SELECT * FROM relations
      WHERE source_type = 'mac_address' AND target_type = 'ip'
        AND source_value = 'AA-00-BB-00-CC-01' AND target_value = '10.99.1.1'
    `);
    assert.ok(result.rows.length > 0, 'expected mac→ip relation');
  });

  test('file_status row is created for log with filename', async () => {
    const testLogs = (await db.query(`SELECT * FROM logs WHERE id = ANY($1)`, [logIds])).rows;
    await RelationAnalyzer.analyzeSpecificLogs(testLogs, { types: ['file'] });

    const result = await db.query(`
      SELECT * FROM file_status WHERE filename = $1
    `, [`${TEST_PREFIX}_payload.exe`]);
    assert.ok(result.rows.length > 0, 'expected file_status row');
    assert.equal(result.rows[0].status, 'ON_DISK');
  });
});

// ── Suite 4: Operation-tag filtering ─────────────────────────────────────────

describe('operation-tag filtering on getRelations', () => {
  before(async () => {
    await db.query(`
      INSERT INTO relations (source_type, source_value, target_type, target_value, metadata, operation_tags, source_log_ids)
      VALUES
        ('ip', 't_filter_ip_9999', 'ip', 't_filter_ext', '{}'::jsonb, '{9999}', '{}'),
        ('ip', 't_filter_ip_8888', 'ip', 't_filter_ext', '{}'::jsonb, '{8888}', '{}')
    `);
  });

  after(async () => {
    await db.query(`DELETE FROM relations WHERE source_value IN ('t_filter_ip_9999','t_filter_ip_8888')`);
  });

  test('non-admin with tag 9999 sees only tag-9999 rows', async () => {
    const results = await RelationsModel.getRelations('ip', 100, 9999, false);
    const sources = results.map(r => r.source);
    assert.ok(sources.some(s => s === 't_filter_ip_9999'), 'expected tag-9999 row');
    assert.ok(!sources.some(s => s === 't_filter_ip_8888'), 'should not see tag-8888 row');
  });

  test('non-admin with tag 8888 sees only tag-8888 rows', async () => {
    const results = await RelationsModel.getRelations('ip', 100, 8888, false);
    const sources = results.map(r => r.source);
    assert.ok(sources.some(s => s === 't_filter_ip_8888'), 'expected tag-8888 row');
    assert.ok(!sources.some(s => s === 't_filter_ip_9999'), 'should not see tag-9999 row');
  });

  test('admin with no operationTagId sees all rows', async () => {
    const results = await RelationsModel.getRelations('ip', 100, null, true);
    const sources = results.map(r => r.source);
    assert.ok(sources.some(s => s === 't_filter_ip_9999'), 'admin should see tag-9999');
    assert.ok(sources.some(s => s === 't_filter_ip_8888'), 'admin should see tag-8888');
  });

  test('non-admin with unmatched tag gets no rows', async () => {
    const results = await RelationsModel.getRelations('ip', 100, 7777, false);
    const sources = results.map(r => r.source);
    assert.ok(!sources.some(s => s === 't_filter_ip_9999'), 'should not see tag-9999');
    assert.ok(!sources.some(s => s === 't_filter_ip_8888'), 'should not see tag-8888');
  });
});

// ── Cleanup DB pool after all tests ──────────────────────────────────────────

after(async () => {
  await db.pool.end();
});
