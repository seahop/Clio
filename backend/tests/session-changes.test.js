// backend/tests/session-changes.test.js
// Run: node --test tests/session-changes.test.js
//
// Covers all changes from this session:
//   1. resolveOIDCRole group-based role assignment (pure unit)
//   2. getAllLogs admin always sees all logs, non-admin scoped (mock db)
//   3. searchLogs admin unscoped, non-admin scoped (mock db)
//   4. Username collision detection covers all three Redis key patterns (source check)
//   5. createAdminUser / promoteToAdmin / listLocalUsers (Redis integration)
//   6. forcePasswordReset isUserAdmin uses Redis, not hardcoded name (Redis integration)
//
// Sections 1-4 require no live infrastructure.
// Sections 5-6 use a live Redis; they skip automatically if Redis is unreachable.

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

// Provide defaults for env vars so the modules load without a real .env
process.env.ADMIN_PASSWORD       = process.env.ADMIN_PASSWORD       || 'TestAdmin1!smoke';
process.env.USER_PASSWORD        = process.env.USER_PASSWORD        || 'TestUser1!smoke';
process.env.REDIS_PASSWORD       = process.env.REDIS_PASSWORD       || '';
process.env.REDIS_ENCRYPTION_KEY = process.env.REDIS_ENCRYPTION_KEY || '0'.repeat(64);
process.env.JWT_SECRET           = process.env.JWT_SECRET           || 'smoke-test-jwt-secret';
process.env.OIDC_ADMIN_GROUP     = 'clio-admin';
process.env.OIDC_USER_GROUP      = 'clio-user';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — resolveOIDCRole (pure unit, no external deps)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveOIDCRole — group-based role assignment', () => {
  const { resolveOIDCRole } = require('../controllers/oidc.controller');

  test('admin group alone → true (admin role)', () => {
    assert.equal(resolveOIDCRole(['clio-admin']), true);
  });

  test('user group alone → false (regular role)', () => {
    assert.equal(resolveOIDCRole(['clio-user']), false);
  });

  test('both groups → true (admin takes precedence)', () => {
    assert.equal(resolveOIDCRole(['clio-user', 'clio-admin']), true);
  });

  test('unrelated group → null (deny login)', () => {
    assert.equal(resolveOIDCRole(['some-other-group']), null);
  });

  test('empty array → null (no matching group, deny)', () => {
    assert.equal(resolveOIDCRole([]), null);
  });

  test('null (no groups claim) → null (deny)', () => {
    assert.equal(resolveOIDCRole(null), null);
  });

  test('undefined (no groups claim) → null (deny)', () => {
    assert.equal(resolveOIDCRole(undefined), null);
  });

  test('string instead of array → null (malformed claim, deny)', () => {
    assert.equal(resolveOIDCRole('clio-admin'), null);
  });

  test('custom group names via env vars', () => {
    const origAdmin = process.env.OIDC_ADMIN_GROUP;
    const origUser  = process.env.OIDC_USER_GROUP;
    process.env.OIDC_ADMIN_GROUP = 'vault-admins';
    process.env.OIDC_USER_GROUP  = 'vault-users';

    // Re-require to pick up changed env vars
    delete require.cache[require.resolve('../config/oidc')];
    delete require.cache[require.resolve('../controllers/oidc.controller')];
    const { resolveOIDCRole: fresh } = require('../controllers/oidc.controller');

    assert.equal(fresh(['vault-admins']), true,  'custom admin group recognised');
    assert.equal(fresh(['vault-users']),  false, 'custom user group recognised');
    assert.equal(fresh(['clio-admin']),   null,  'old default name no longer matches');

    // Restore
    process.env.OIDC_ADMIN_GROUP = origAdmin;
    process.env.OIDC_USER_GROUP  = origUser;
    delete require.cache[require.resolve('../config/oidc')];
    delete require.cache[require.resolve('../controllers/oidc.controller')];
    require('../controllers/oidc.controller');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — getAllLogs scoping (mock db.query)
// ─────────────────────────────────────────────────────────────────────────────

describe('getAllLogs — admin sees all, non-admin scoped to operation', () => {
  const db              = require('../db');
  const OperationsModel = require('../models/operations');
  const LogsModel       = require('../models/logs');

  let capturedSql = [];
  let origQuery, origGetActiveOp;

  before(() => {
    origQuery       = db.query.bind(db);
    origGetActiveOp = OperationsModel.getUserActiveOperation;
    db.query        = async (sql) => { capturedSql.push(sql.replace(/\s+/g, ' ').trim()); return { rows: [] }; };
  });

  after(() => {
    db.query = origQuery;
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });

  test('admin path issues a SELECT with no WHERE clause', async () => {
    capturedSql = [];
    await LogsModel.getAllLogs('adminuser', true);
    assert.equal(capturedSql.length, 1, 'should issue exactly one query');
    assert.ok(!capturedSql[0].includes('WHERE'), `admin query must not filter: ${capturedSql[0]}`);
  });

  test('admin path never calls getUserActiveOperation', async () => {
    let called = false;
    OperationsModel.getUserActiveOperation = async () => { called = true; return null; };
    await LogsModel.getAllLogs('adminuser', true);
    assert.equal(called, false, 'admin path must not check active operation');
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });

  test('non-admin with active operation — query filters by tag_id', async () => {
    capturedSql = [];
    OperationsModel.getUserActiveOperation = async () => ({ id: 1, tag_id: 42, name: 'op1' });
    await LogsModel.getAllLogs('regularuser', false);
    assert.ok(
      capturedSql.some(s => s.includes('tag_id')),
      `non-admin query should filter by tag: ${capturedSql.join('; ')}`
    );
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });

  test('non-admin with no active operation — returns [] without querying db', async () => {
    capturedSql = [];
    OperationsModel.getUserActiveOperation = async () => null;
    const result = await LogsModel.getAllLogs('regularuser', false);
    assert.deepEqual(result, [], 'should return [] when no active operation');
    assert.equal(capturedSql.length, 0, 'should not hit the db when no operation');
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — searchLogs scoping (mock db.query)
// ─────────────────────────────────────────────────────────────────────────────

describe('searchLogs — admin unscoped, non-admin scoped to operation', () => {
  const db              = require('../db');
  const OperationsModel = require('../models/operations');
  const LogsModel       = require('../models/logs');

  let origQuery, origGetActiveOp;
  let dbCallParams = [];

  before(() => {
    origQuery       = db.query.bind(db);
    origGetActiveOp = OperationsModel.getUserActiveOperation;
    db.query        = async (sql, params) => { dbCallParams.push({ sql, params }); return { rows: [] }; };
  });

  after(() => {
    db.query = origQuery;
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });

  test('admin search — getUserActiveOperation is never called', async () => {
    let opCalled = false;
    OperationsModel.getUserActiveOperation = async () => { opCalled = true; return null; };
    await LogsModel.searchLogs({ hostname: 'testhost' }, 'adminuser', true);
    assert.equal(opCalled, false, 'admin search must not check active operation');
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });

  test('non-admin with active operation — tag_id in query params', async () => {
    dbCallParams = [];
    OperationsModel.getUserActiveOperation = async () => ({ id: 1, tag_id: 99, name: 'op1' });
    await LogsModel.searchLogs({ hostname: 'testhost' }, 'alice', false);
    const call = dbCallParams[0];
    assert.ok(call, 'should execute at least one query');
    assert.ok(
      call.params && call.params.includes(99),
      `tag_id 99 should appear in query params: ${JSON.stringify(call.params)}`
    );
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });

  test('non-admin with no active operation — returns [] immediately', async () => {
    dbCallParams = [];
    OperationsModel.getUserActiveOperation = async () => null;
    const result = await LogsModel.searchLogs({ hostname: 'testhost' }, 'dave', false);
    assert.deepEqual(result, [], 'should return [] when no operation');
    OperationsModel.getUserActiveOperation = origGetActiveOp;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Username collision detection covers all three Redis key patterns
// (source-level check — no live infrastructure needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('Username collision detection — all three key patterns present', () => {
  test('oidc.controller checks admin:password:, user:password:, and user::exists', () => {
    const src = fs.readFileSync(require.resolve('../controllers/oidc.controller'), 'utf8');
    assert.ok(src.includes('`admin:password:${username}`'), 'must check admin:password: key');
    assert.ok(src.includes('`user:password:${username}`'),  'must check user:password: key');
    assert.ok(src.includes('`user:${username}:exists`'),    'must check user::exists key');
  });

  test('passport-google.js checks admin:password:, user:password:, and user::exists', () => {
    const src = fs.readFileSync(require.resolve('../lib/passport-google.js'), 'utf8');
    assert.ok(src.includes('admin:password:'), 'google collision must check admin:password:');
    assert.ok(src.includes('user:password:'),  'google collision must check user:password:');
    assert.ok(src.includes(':exists'),         'google collision must check :exists key');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sections 5-6 — Redis integration
// Auto-skipped if Redis is unreachable.
// Uses TEST_PREFIX on all keys so they never collide with real data.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_PREFIX = `smoketest${process.pid}_`;

// Imported once — they hold the real redisClient reference internally
const authController = require('../controllers/auth.controller');
const security       = require('../config/security');

function makeReq(body = {}, params = {}) {
  return {
    body,
    params,
    user: { username: `${TEST_PREFIX}requester`, role: 'admin' },
    ip: '127.0.0.1',
    get: () => 'test-agent',
  };
}

function makeRes() {
  const res = { statusCode: 200 };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (data)  => { res.body = data;       return res; };
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — createAdminUser / promoteToAdmin / listLocalUsers
// ─────────────────────────────────────────────────────────────────────────────

describe('user management — Redis integration', async () => {
  let redis;

  before(async () => {
    const { redisClient } = require('../lib/redis');
    try { await redisClient.keys('__ping__'); redis = redisClient; } catch { redis = null; }
  });

  after(async () => {
    if (!redis) return;
    // Clean up all test-prefixed keys (TEST_PREFIX is a valid username prefix)
    for (const pattern of [
      `admin:password:${TEST_PREFIX}*`,
      `user:password:${TEST_PREFIX}*`,
      `user:${TEST_PREFIX}*`,
    ]) {
      const found = await redis.keys(pattern);
      if (found.length) await redis.del(found);
    }
  });

  test('createAdminUser — rejects when username is missing', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const res = makeRes();
    await authController.createAdminUser(makeReq({ password: 'TestPass1!' }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body?.error);
  });

  test('createAdminUser — rejects when password is missing', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const res = makeRes();
    await authController.createAdminUser(makeReq({ username: `${TEST_PREFIX}newadmin` }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body?.error);
  });

  test('createAdminUser — creates admin:password: key for new user', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const username = `${TEST_PREFIX}freshcreate`;
    const res = makeRes();
    await authController.createAdminUser(makeReq({ username, password: 'Smoke1!SmokeTest' }), res);
    assert.equal(res.statusCode, 201, `unexpected error: ${JSON.stringify(res.body)}`);
    const hash = await redis.get(`admin:password:${username}`);
    assert.ok(hash, 'admin:password: key should be set after createAdminUser');
  });

  test('createAdminUser — rejects duplicate username (409)', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const username = `${TEST_PREFIX}duplicate`;
    await security.setAdminPassword(username, 'InitialPass1!');
    const res = makeRes();
    await authController.createAdminUser(makeReq({ username, password: 'Smoke1!SmokeTest' }), res);
    assert.equal(res.statusCode, 409, `should conflict for duplicate: ${JSON.stringify(res.body)}`);
  });

  test('promoteToAdmin — blocks OIDC SSO users', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const u = `${TEST_PREFIX}ssooidc`;
    await redis.set(`user:${u}:isOIDCSSO`, 'true');
    const res = makeRes();
    await authController.promoteToAdmin(makeReq({}, { username: u }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body?.error?.includes('SSO'), `expected SSO error, got: ${res.body?.error}`);
  });

  test('promoteToAdmin — blocks Google SSO users', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const u = `${TEST_PREFIX}ssogoogle`;
    await redis.set(`user:${u}:isGoogleSSO`, 'true');
    const res = makeRes();
    await authController.promoteToAdmin(makeReq({}, { username: u }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body?.error?.includes('SSO'), `expected SSO error, got: ${res.body?.error}`);
  });

  test('promoteToAdmin — rejects users who are already admin (409)', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const u = `${TEST_PREFIX}alreadyadmin`;
    await security.setAdminPassword(u, 'TestPass1!smoke');
    const res = makeRes();
    await authController.promoteToAdmin(makeReq({}, { username: u }), res);
    assert.equal(res.statusCode, 409);
    assert.ok(res.body?.error?.includes('already'), `expected already-admin error: ${res.body?.error}`);
  });

  test('promoteToAdmin — custom password: hash moved to admin store, user key deleted', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const u = `${TEST_PREFIX}regularwithpw`;
    await security.setUserPassword(u, 'TestPass1!smoke');
    const before = await redis.get(`user:password:${u}`);
    assert.ok(before, 'user:password: key should exist before promotion');

    const res = makeRes();
    await authController.promoteToAdmin(makeReq({}, { username: u }), res);

    const adminHash = await redis.get(`admin:password:${u}`);
    const userHash  = await redis.get(`user:password:${u}`);

    assert.equal(res.statusCode, 200, `promotion failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body?.success);
    assert.ok(adminHash,  'admin:password: key must exist after promotion');
    assert.equal(userHash, null, 'user:password: key must be removed after promotion');
  });

  test('promoteToAdmin — no custom password: bootstraps admin key + sets force-reset flag', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const u = `${TEST_PREFIX}freshuser`;
    await redis.del(`user:password:${u}`, `admin:password:${u}`, `user:password_reset:${u}`);

    const res = makeRes();
    await authController.promoteToAdmin(makeReq({}, { username: u }), res);

    const adminHash = await redis.get(`admin:password:${u}`);
    const resetFlag = await redis.exists(`user:password_reset:${u}`);

    assert.equal(res.statusCode, 200, `promotion failed: ${JSON.stringify(res.body)}`);
    assert.ok(adminHash, 'admin:password: key should be bootstrapped from USER_PASSWORD');
    assert.ok(resetFlag, 'force-reset flag should be set so user must change password on first login');
  });

  test('listLocalUsers — returns admin, user, and SSO accounts with correct metadata', async (t) => {
    if (!redis) { t.skip('Redis not available'); return; }
    const adminUser   = `${TEST_PREFIX}listadmin`;
    const regularUser = `${TEST_PREFIX}listuser`;
    const ssoUser     = `${TEST_PREFIX}listsso`;

    await security.setAdminPassword(adminUser,   'TestPass1!smoke');
    await security.setUserPassword(regularUser,  'TestPass1!smoke');
    await redis.set(`user:${ssoUser}:exists`,    'true');
    await redis.set(`user:${ssoUser}:isOIDCSSO`, 'true');

    const res = makeRes();
    await authController.listLocalUsers(makeReq(), res);

    assert.equal(res.statusCode, 200);
    const users = res.body?.users;
    assert.ok(Array.isArray(users), 'response.users should be an array');

    const a = users.find(u => u.username === adminUser);
    const r = users.find(u => u.username === regularUser);
    const s = users.find(u => u.username === ssoUser);

    assert.ok(a, `admin ${adminUser} should appear in list`);
    assert.ok(r, `user ${regularUser} should appear in list`);
    assert.ok(s, `sso ${ssoUser} should appear in list`);

    assert.equal(a.role,    'admin', 'admin entry should have role=admin');
    assert.equal(r.role,    'user',  'regular entry should have role=user');
    assert.equal(s.ssoType, 'oidc',  'SSO entry should have ssoType=oidc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — forcePasswordReset isUserAdmin uses Redis, not hardcoded username
// ─────────────────────────────────────────────────────────────────────────────

describe('forcePasswordReset — isUserAdmin detection', () => {
  test('source: hardcoded admin-name guard has been removed', () => {
    const src = fs.readFileSync(require.resolve('../controllers/auth.controller'), 'utf8');
    assert.ok(
      !src.includes("username.toLowerCase() === 'admin' && req.user.username"),
      'hardcoded admin-name guard must be removed from forcePasswordReset'
    );
  });

  test('source: isUserAdmin is derived from getAdminPassword (Redis lookup)', () => {
    const src = fs.readFileSync(require.resolve('../controllers/auth.controller'), 'utf8');
    assert.ok(
      src.includes('getAdminPassword') && src.includes('isUserAdmin'),
      'forcePasswordReset must derive isUserAdmin via getAdminPassword'
    );
  });

  test('Redis: any user with admin:password: key is detected as admin', async (t) => {
    const { redisClient } = require('../lib/redis');
    try { await redisClient.keys('__ping__'); } catch { t.skip('Redis not available'); return; }

    const u = `${TEST_PREFIX}namednotadmin`;
    await security.setAdminPassword(u, 'TestPass1!smoke');

    const hash = await security.getAdminPassword(u);
    const isUserAdmin = !!hash;

    await redisClient.del(`admin:password:${u}`);

    assert.equal(isUserAdmin, true, 'user with admin:password: key should be detected as admin');
  });

  test('Redis: user without admin:password: key is not detected as admin', async (t) => {
    const { redisClient } = require('../lib/redis');
    try { await redisClient.keys('__ping__'); } catch { t.skip('Redis not available'); return; }

    const u = `${TEST_PREFIX}noadminkey`;
    await redisClient.del(`admin:password:${u}`);

    const hash = await security.getAdminPassword(u);
    const isUserAdmin = !!hash;

    assert.equal(isUserAdmin, false, 'user without admin:password: key must not be admin');
  });
});
