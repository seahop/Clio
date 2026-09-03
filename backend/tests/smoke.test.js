// backend/tests/smoke.test.js
//
// HTTP-level smoke and regression suite, run against a LIVE backend.
// Validates the security and correctness fixes from the 2026-09 audit
// (AUDIT-CHECKLIST.md) plus a baseline of how the API is supposed to behave.
//
// Run inside the backend container so the DB, Redis, and self-signed TLS
// environment match production wiring:
//
//   docker compose exec backend node --test tests/smoke.test.js
//
// Environment:
//   SMOKE_BASE_URL        default https://localhost:3001
//   SMOKE_ADMIN_PASSWORD  current admin password (falls back to ADMIN_PASSWORD,
//                         then ADMIN_PASSWORD + '.r1' — the suite's own rotation)
//   SMOKE_USER_PASSWORD   current password for the built-in 'user' account
//                         (falls back to USER_PASSWORD, then USER_PASSWORD + '.r1')
//
// First-login forced password changes are handled automatically: when a login
// succeeds with the bootstrap password but requires a change, the suite rotates
// to '<bootstrap>.r1' and continues; later runs find it via the fallback list.
//
// The login rate limiter (5/15min per IP) is dodged by sending a unique
// X-Forwarded-For per session — honoured because requests originate from
// loopback, which trust proxy accepts.

// Test process only: the backend serves a self-signed cert in-container.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const BASE = process.env.SMOKE_BASE_URL || 'https://localhost:3001';
const RUN_ID = crypto.randomBytes(4).toString('hex');

// ── HTTP session with cookie jar + CSRF handling ─────────────────────────────

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    this.csrfToken = null;
    // Unique client IP per session so the login limiter never bleeds
    // between runs (loopback is a trusted proxy, so XFF is honoured).
    this.ip = `172.31.${1 + crypto.randomInt(254)}.${1 + crypto.randomInt(254)}`;
  }

  _storeCookies(res) {
    for (const line of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some(a => /expires=Thu, 01 Jan 1970/i.test(a)) || value === '';
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, path, body, extraHeaders = {}) {
    const headers = {
      'X-Forwarded-For': this.ip,
      'Cookie': this.cookieHeader(),
      ...extraHeaders
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.csrfToken && !('CSRF-Token' in extraHeaders)) headers['CSRF-Token'] = this.csrfToken;

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual'
    });
    this._storeCookies(res);

    let json = null;
    const text = await res.text();
    try { json = JSON.parse(text); } catch { /* non-JSON body */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  async fetchCsrf() {
    const res = await this.request('GET', '/api/csrf-token');
    assert.equal(res.status, 200, 'csrf-token endpoint should be reachable');
    this.csrfToken = res.json.csrfToken;
    return this.csrfToken;
  }

  async login(username, password) {
    await this.fetchCsrf();
    return this.request('POST', '/api/auth/login', { username, password });
  }

  // Try candidate passwords in order; transparently complete a forced
  // first-login password change by rotating to `${bootstrap}.r1`.
  async loginResilient(username, candidates) {
    const tried = [];
    for (const pw of candidates.filter(Boolean)) {
      const res = await this.login(username, pw);
      tried.push(res.status);
      if (res.status !== 200) continue;

      if (res.json?.requiresPasswordChange) {
        const rotated = pw.endsWith('.r1') ? pw : pw + '.r1';
        const change = await this.request('POST', '/api/auth/change-password', {
          currentPassword: pw,
          newPassword: rotated
        });
        assert.equal(change.status, 200,
          `forced password change for ${username} should succeed: ${change.text}`);
        const relogin = await this.login(username, rotated);
        assert.equal(relogin.status, 200, `re-login after rotation for ${username}`);
        console.log(`  [smoke] ${username}: bootstrap password rotated to '<bootstrap>.r1'`);
        return relogin;
      }
      return res;
    }
    assert.fail(`could not log in as ${username} (statuses: ${tried.join(', ')}) — ` +
      `pass SMOKE_${username.toUpperCase()}_PASSWORD`);
  }
}

// ── Fixtures shared across suites ────────────────────────────────────────────

const admin = new Session('admin');
const user = new Session('user');
const anon = new Session('anon');

const fx = {
  opA: null, opB: null,           // operations (A: user's, B: foreign)
  userLog: null, adminLog: null,  // logs (userLog in A, adminLog tagged B)
  template: null
};

before(async () => {
  await admin.loginResilient('admin', [
    process.env.SMOKE_ADMIN_PASSWORD,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD + '.r1'
  ]);

  await user.loginResilient('user', [
    process.env.SMOKE_USER_PASSWORD,
    process.env.USER_PASSWORD,
    process.env.USER_PASSWORD && process.env.USER_PASSWORD + '.r1'
  ]);
});

after(async () => {
  // Best-effort cleanup of fixtures (admin session may already be revoked
  // by the final revoke-all test — that's fine, next run creates fresh ones).
  const cleanup = new Session('cleanup');
  try {
    await cleanup.loginResilient('admin', [
      process.env.SMOKE_ADMIN_PASSWORD,
      process.env.ADMIN_PASSWORD,
      process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD + '.r1'
    ]);
    const ids = [fx.userLog?.id, fx.adminLog?.id].filter(Boolean);
    if (ids.length) await cleanup.request('POST', '/api/logs/bulk-delete', { ids });
    if (fx.template) await cleanup.request('DELETE', `/api/templates/${fx.template.id}`);
    // Operations (smoke_op_a / smoke_op_b) are intentionally NOT deleted — they
    // are stable, reused fixtures. Deleting them only soft-deletes (is_active=
    // false), which would accumulate inactive operations and orphan relations.
  } catch (e) {
    console.log('  [smoke] cleanup skipped:', e.message);
  }
});

// ── 1. Public surface & unauthenticated access ───────────────────────────────

describe('unauthenticated surface', () => {
  test('GET /api/auth/providers is public', async () => {
    const res = await anon.request('GET', '/api/auth/providers');
    assert.equal(res.status, 200);
  });

  test('login with a wrong password is rejected', async () => {
    const s = new Session('badpw');
    const res = await s.login('admin', 'definitely-wrong-password-' + RUN_ID);
    assert.equal(res.status, 401);
  });

  test('protected APIs demand a session', async () => {
    for (const path of ['/api/logs', '/api/tags', '/api/operations/my-operations',
                        '/api/sessions/active', '/api/logs/s3-config']) {
      const res = await anon.request('GET', path);
      assert.equal(res.status, 401, `${path} should 401 without a session`);
    }
  });

  test('export and archive downloads demand a session (regression: unauthenticated /exports)', async () => {
    for (const path of ['/exports/anything.zip', '/archives/anything.zip']) {
      const res = await anon.request('GET', path);
      assert.equal(res.status, 401, `${path} should 401 without a session`);
    }
  });
});

// ── 2. Auth session behavior ─────────────────────────────────────────────────

describe('auth and CSRF', () => {
  test('admin login set both auth cookies and /me reflects the session', async () => {
    assert.ok(admin.cookies.has('token'), 'primary token cookie set');
    assert.ok(admin.cookies.has('auth_token'), 'legacy auth_token cookie set');
    const me = await admin.request('GET', '/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.username, 'admin');
    assert.equal(me.json.role, 'admin');
  });

  test('mutating request without a CSRF header is rejected', async () => {
    const res = await admin.request('POST', '/api/operations',
      { name: 'x' }, { 'CSRF-Token': '' });
    assert.equal(res.status, 403);
  });

  test('x-api-request header no longer bypasses CSRF (regression)', async () => {
    const res = await admin.request('POST', '/api/operations',
      { name: 'x' }, { 'CSRF-Token': '', 'x-api-request': 'true' });
    assert.equal(res.status, 403);
  });
});

// ── 3. Admin session management ──────────────────────────────────────────────

describe('session management (admin)', () => {
  test('active session list includes the current admin session', async () => {
    const res = await admin.request('GET', '/api/sessions/active');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json));
    assert.ok(res.json.some(s => s.username === 'admin' && s.isCurrentSession === true),
      'current session flagged (regression: legacy-cookie-only jti check)');
  });

  test('session revoke rejects non-hex ids, including "*" (regression: Redis glob wipe)', async () => {
    for (const bad of ['*', 'jwt:*', '../etc', 'ZZZZZZZZ']) {
      const res = await admin.request('POST', '/api/sessions/revoke', { sessionIds: [bad] });
      assert.equal(res.status, 400, `sessionIds ["${bad}"] should be rejected`);
    }
  });

  test('non-admin cannot view or revoke sessions', async () => {
    const list = await user.request('GET', '/api/sessions/active');
    assert.equal(list.status, 403);
    const revoke = await user.request('POST', '/api/sessions/revoke',
      { sessionIds: ['deadbeef'] });
    assert.equal(revoke.status, 403);
  });
});

// ── 4. Fixtures: two operations, one scoped user, two logs ──────────────────

// Reuse two stable operations across runs (create once, reactivate if a prior
// run left them soft-deleted) instead of creating a fresh random pair every
// time — the latter accumulates inactive operations and orphan relations in
// the DB. Operations use fixed names; per-run data (logs, hosts) still uses
// RUN_ID for isolation.
const ensureOperation = async (name, description) => {
  const list = await admin.request('GET', '/api/operations?includeInactive=true');
  assert.equal(list.status, 200, list.text);
  const rows = Array.isArray(list.json) ? list.json : (list.json.operations || []);
  const existing = rows.find(o => o.name === name);
  if (existing) {
    if (existing.is_active === false) {
      const re = await admin.request('PUT', `/api/operations/${existing.id}`, { is_active: true });
      assert.ok([200, 201].includes(re.status), `reactivate ${name}: ${re.text}`);
    }
    return existing;
  }
  const created = await admin.request('POST', '/api/operations', { name, description });
  assert.equal(created.status, 201, created.text);
  return created.json.operation || created.json;
};

describe('fixture setup (operation scoping)', () => {
  test('admin ensures two operations and assigns the user to one', async () => {
    fx.opA = await ensureOperation('smoke_op_a', 'smoke test op A (reused)');
    fx.opB = await ensureOperation('smoke_op_b', 'smoke test op B (reused)');
    assert.ok(fx.opA.id && fx.opB.id, 'operations have ids');
    assert.ok(fx.opA.tag_id && fx.opB.tag_id, 'operations have tags');

    const assign = await admin.request('POST', `/api/operations/${fx.opA.id}/users`,
      { username: 'user', isPrimary: true });
    assert.ok([200, 201, 409].includes(assign.status), assign.text);
  });

  test('user activates their operation and creates a log (auto-tagged)', async () => {
    const act = await user.request('POST', '/api/operations/set-active',
      { operationId: fx.opA.id });
    assert.equal(act.status, 200, act.text);

    const log = await user.request('POST', '/api/logs', {
      hostname: `smoke-host-${RUN_ID}`,
      command: 'whoami',
      notes: 'smoke test row (op A)'
    });
    assert.equal(log.status, 200, log.text);
    fx.userLog = log.json;
    assert.ok(fx.userLog.id, 'log created');
  });

  test('admin creates a log and tags it into the foreign operation', async () => {
    const log = await admin.request('POST', '/api/logs', {
      hostname: `smoke-foreign-${RUN_ID}`,
      command: 'id',
      notes: 'smoke test row (op B)'
    });
    assert.equal(log.status, 200, log.text);
    fx.adminLog = log.json;

    const tag = await admin.request('POST', `/api/tags/log/${fx.adminLog.id}`,
      { tagIds: [fx.opB.tag_id] });
    assert.equal(tag.status, 200, tag.text);
  });
});

// ── 5. Operation scoping enforcement ─────────────────────────────────────────

describe('operation scoping (non-admin)', () => {
  test('log list is scoped: own operation visible, foreign invisible', async () => {
    const res = await user.request('GET', '/api/logs');
    assert.equal(res.status, 200);
    const rows = res.json.logs || res.json;
    assert.ok(rows.some(l => l.id === fx.userLog.id), 'own log visible');
    assert.ok(!rows.some(l => l.id === fx.adminLog.id), 'foreign log hidden');
  });

  test('tag filter cannot pull foreign-operation rows (regression: tags leak)', async () => {
    const res = await user.request('POST', '/api/tags/filter',
      { tagIds: [fx.opB.tag_id] });
    assert.equal(res.status, 200);
    const rows = res.json.logs || res.json;
    assert.equal(rows.filter(l => l.id === fx.adminLog.id).length, 0,
      'foreign rows must not be returned');
  });

  test('cannot tag or untag a foreign log (regression: tag write scoping)', async () => {
    const res = await user.request('POST', `/api/tags/log/${fx.adminLog.id}`,
      { tagNames: ['smoke-should-fail'] });
    assert.equal(res.status, 403);
  });

  test('cannot read evidence of a foreign log (regression: evidence IDOR)', async () => {
    const res = await user.request('GET', `/api/evidence/${fx.adminLog.id}`);
    assert.equal(res.status, 403);
  });

  test('cannot enumerate all operations (regression)', async () => {
    const res = await user.request('GET', '/api/operations');
    assert.equal(res.status, 403);
    const mine = await user.request('GET', '/api/operations/my-operations');
    assert.equal(mine.status, 200, 'scoped equivalent still works');
  });

  test('cannot edit or delete another user\'s template (regression)', async () => {
    const created = await admin.request('POST', '/api/templates',
      { name: `smoke_tpl_${RUN_ID}`, data: { hostname: 'tpl-host' } });
    assert.ok([200, 201].includes(created.status), created.text);
    fx.template = created.json.template || created.json;

    const put = await user.request('PUT', `/api/templates/${fx.template.id}`,
      { name: 'hijacked', data: {} });
    assert.equal(put.status, 403);
    const del = await user.request('DELETE', `/api/templates/${fx.template.id}`);
    assert.equal(del.status, 403);
  });

  test('relation delete-notify is admin-only (regression)', async () => {
    const res = await user.request('POST', '/api/relations/notify/log-delete',
      { logIds: [fx.adminLog.id] });
    assert.equal(res.status, 403);
  });

  // ── by-id / bulk isolation (regression: 2026-09 audit C1/H2/H4/M6/H3) ──
  // These guard the crown-jewel invariant on the single-log and bulk write
  // paths, which previously skipped the operation-scope gate that the list,
  // tag, and evidence paths already enforce.

  test('cannot read a foreign log by id (regression: getLogById IDOR / C1)', async () => {
    const res = await user.request('GET', `/api/logs/${fx.adminLog.id}`);
    assert.equal(res.status, 404, 'a foreign log fetched by id must 404 for a non-admin');
    assert.ok(!res.text.includes('smoke-foreign'), 'no foreign log data may leak in the body');
  });

  test('can read own log by id (positive control)', async () => {
    const res = await user.request('GET', `/api/logs/${fx.userLog.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.id, fx.userLog.id);
  });

  test('cannot update a foreign log by id (regression: PUT IDOR / H2)', async () => {
    const res = await user.request('PUT', `/api/logs/${fx.adminLog.id}`,
      { command: 'tampered-by-smoke' });
    assert.equal(res.status, 404, 'a foreign log update must 404');
    const check = await admin.request('GET', `/api/logs/${fx.adminLog.id}`);
    assert.equal(check.status, 200);
    assert.notEqual(check.json.command, 'tampered-by-smoke', 'foreign log must be unchanged');
  });

  test('bulk-status cannot touch a foreign log (regression: H4)', async () => {
    const before = await admin.request('GET', `/api/logs/${fx.adminLog.id}`);
    const res = await user.request('POST', '/api/logs/bulk-status',
      { logIds: [fx.adminLog.id], status: 'CLEANED' });
    assert.equal(res.status, 200);
    assert.equal(res.json.updated, 0, 'no foreign rows may be updated');
    const after = await admin.request('GET', `/api/logs/${fx.adminLog.id}`);
    assert.equal(after.json.status, before.json.status, 'foreign log status unchanged');
  });

  test('cannot lock a foreign log (regression: M6)', async () => {
    const res = await user.request('POST', `/api/logs/${fx.adminLog.id}/lock`, { lock: true });
    assert.equal(res.status, 404, 'a foreign log lock must 404');
    const check = await admin.request('GET', `/api/logs/${fx.adminLog.id}`);
    assert.equal(check.json.locked, false, 'foreign log must remain unlocked');
  });

  test('global relation rename (field-update) is admin-only (regression: H3)', async () => {
    const res = await user.request('POST', '/api/updates/field-update',
      { fieldType: 'hostname', oldValue: `smoke-foreign-${RUN_ID}`, newValue: 'x' });
    assert.equal(res.status, 403, 'cross-operation relation rename must be admin-only');
  });
});

// ── 5b. Server-side pagination ───────────────────────────────────────────────

describe('log pagination (server-side)', () => {
  test('limit/offset return a bounded page plus a total count', async () => {
    const page = await user.request('GET', '/api/logs?limit=1&offset=0');
    assert.equal(page.status, 200, page.text);
    assert.ok(Array.isArray(page.json.logs), 'logs array present');
    assert.ok(page.json.logs.length <= 1, 'page honours the limit');
    assert.equal(typeof page.json.total, 'number', 'total count present');
    assert.ok(page.json.total >= page.json.logs.length, 'total is at least the page size');
    assert.equal(page.json.limit, 1, 'echoes the applied limit');
  });

  test('paged results stay operation-scoped (no foreign logs)', async () => {
    const page = await user.request('GET', '/api/logs?limit=500&offset=0');
    assert.equal(page.status, 200);
    assert.ok(!page.json.logs.some((l) => l.id === fx.adminLog.id),
      'foreign log must not appear in paged results');
  });

  test('no limit returns the full scoped set (backward compatible)', async () => {
    const all = await user.request('GET', '/api/logs');
    assert.equal(all.status, 200);
    assert.equal(typeof all.json.total, 'number', 'total present on unpaged response too');
    assert.ok(all.json.logs.some((l) => l.id === fx.userLog.id),
      'own log present in the unpaged response');
  });
});

// ── 5c. API keys (management validation + ingest scoping) ────────────────────

describe('API key management + ingest', () => {
  let created = null;

  test('rejects an unknown permission on create (regression: allowlist)', async () => {
    const res = await admin.request('POST', '/api/api-keys', {
      name: `smoke_badperm_${RUN_ID}`,
      permissions: ['logs:wrote'],
    });
    assert.equal(res.status, 400, 'an unknown permission must be rejected');
  });

  test('rejects a non-existent operation_id on create', async () => {
    const res = await admin.request('POST', '/api/api-keys', {
      name: `smoke_badop_${RUN_ID}`,
      operation_id: 999999,
    });
    assert.equal(res.status, 400, 'a bogus operation_id must be rejected');
  });

  test('non-admin cannot manage API keys', async () => {
    const res = await user.request('POST', '/api/api-keys', { name: 'nope' });
    assert.equal(res.status, 403);
  });

  test('creates a valid operation-scoped key (full key returned once)', async () => {
    const res = await admin.request('POST', '/api/api-keys', {
      name: `smoke_key_${RUN_ID}`,
      permissions: ['logs:write'],
      operation_id: fx.opA.id,
    });
    assert.equal(res.status, 201, res.text);
    assert.ok(res.json.apiKey?.key?.startsWith('rtl_'), 'the full key is returned once');
    created = res.json.apiKey;
  });

  test('the key ingests a log tagged into its operation', async () => {
    assert.ok(created, 'key was created');
    const ingest = await fetch(`${BASE}/api/ingest/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': created.key,
        'X-Forwarded-For': `10.20.30.${1 + crypto.randomInt(254)}`,
      },
      body: JSON.stringify({
        hostname: `smoke-ingest-${RUN_ID}`,
        command: 'ingested via api key',
      }),
    });
    assert.ok([200, 201].includes(ingest.status), `ingest should succeed: ${await ingest.text()}`);

    // Visible to the op-A-scoped user — proves the key's operation tag was applied.
    const list = await user.request('GET', '/api/logs?limit=500');
    const rows = list.json.logs || list.json;
    assert.ok(
      rows.some((l) => l.hostname === `smoke-ingest-${RUN_ID}`),
      "ingested log must be visible within the key's operation scope"
    );
  });

  test('cleanup: delete the smoke key', async () => {
    if (created) {
      const res = await admin.request('DELETE', `/api/api-keys/${created.id}`);
      assert.ok([200, 404].includes(res.status), res.text);
    }
  });
});

// ── 6. Injection regressions ─────────────────────────────────────────────────

describe('injection hardening', () => {
  test('log update ignores SQL-in-key payloads (regression: updateLog SQLi)', async () => {
    const before = await admin.request('GET', `/api/logs/${fx.userLog.id}`);
    assert.equal(before.status, 200);

    const res = await admin.request('PUT', `/api/logs/${fx.userLog.id}`, {
      notes: 'updated-by-smoke',
      'locked = true, hostname': 'evil'
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.notes, 'updated-by-smoke', 'legit column updated');
    assert.equal(res.json.hostname, before.json.hostname, 'hostname untouched');
    assert.equal(res.json.locked, before.json.locked, 'locked untouched');
  });

  test('CSV export rejects non-allowlisted columns (regression: export SQLi)', async () => {
    const res = await admin.request('POST', '/api/export/csv', {
      selectedColumns: ['id, (SELECT string_agg(username, \',\') FROM users) as x']
    });
    assert.equal(res.status, 400);
  });

  test('CSV export works with valid columns and unguessable filename', async () => {
    const res = await admin.request('POST', '/api/export/csv', {
      selectedColumns: ['timestamp', 'hostname', 'command']
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.success, true);
    assert.match(res.json.details.filename, /_[0-9a-f]{16}\.csv$/,
      'filename carries a random suffix');
  });

  test('evidence export rejects non-allowlisted columns (regression)', async () => {
    const res = await admin.request('POST', '/api/export/evidence', {
      selectedColumns: ['hostname; DROP TABLE logs;--']
    });
    assert.equal(res.status, 400);
  });
});

// ── 7. Assorted regressions ──────────────────────────────────────────────────

describe('assorted regressions', () => {
  test('GET /api/logs/s3-config responds (regression: shadowed by /:id)', async () => {
    // 200 when configured; a clean 404 when not. The regression was a 500
    // from GET /:id trying to query logs for id 's3-config'.
    const res = await admin.request('GET', '/api/logs/s3-config');
    assert.ok([200, 404].includes(res.status),
      `expected 200 or a clean 404, got ${res.status}: ${res.text}`);
    if (res.status === 404) {
      assert.match(res.json?.error || '', /S3 configuration/i,
        'the 404 comes from the s3-config route, not the logs /:id route');
    }
  });

  test('authenticated /exports miss is 404, not a crash', async () => {
    const res = await admin.request('GET', `/exports/nope-${RUN_ID}.zip`);
    assert.equal(res.status, 404);
  });

  test('/archives is admin-only', async () => {
    const res = await user.request('GET', `/archives/nope-${RUN_ID}.zip`);
    assert.equal(res.status, 403);
  });

  test('log timestamps round-trip as UTC ISO', async () => {
    const res = await admin.request('GET', `/api/logs/${fx.userLog.id}`);
    assert.equal(res.status, 200);
    const d = new Date(res.json.timestamp);
    assert.ok(!isNaN(d.getTime()), 'timestamp parses');
  });
});

// ── 7b. Relation operation-scope filter ─────────────────────────────────────

describe('relation operation-scope filter', () => {
  const asArray = (r) => { assert.equal(r.status, 200, r.text); assert.ok(Array.isArray(r.json), 'body is an array'); return r.json; };

  test('admin can filter relations to a chosen operation (any + all modes)', async () => {
    asArray(await admin.request('GET', `/api/relations?operations=${fx.opA.id}`));
    asArray(await admin.request('GET', `/api/relations?operations=${fx.opA.id},${fx.opB.id}&opMatch=any`));
    asArray(await admin.request('GET', `/api/relations?operations=${fx.opA.id},${fx.opB.id}&opMatch=all`));
  });

  test('per-type and user/mac endpoints accept the operation filter', async () => {
    asArray(await admin.request('GET', `/api/relations/ip?operations=${fx.opA.id}`));
    asArray(await admin.request('GET', `/api/relations/user?operations=${fx.opA.id}`));
    asArray(await admin.request('GET', `/api/relations/mac_address?operations=${fx.opA.id}`));
  });

  test('user filtering to their own operation works', async () => {
    asArray(await user.request('GET', `/api/relations?operations=${fx.opA.id}`));
  });

  test('user requesting a foreign operation gets nothing (regression: cannot widen scope via op id)', async () => {
    // opB belongs to admin; the user is not a member. The requested id is
    // dropped server-side, leaving an explicit-empty selection → [].
    const rows = asArray(await user.request('GET', `/api/relations?operations=${fx.opB.id}`));
    assert.equal(rows.length, 0, 'foreign-operation relations must not be returned');
    const perType = asArray(await user.request('GET', `/api/relations/ip?operations=${fx.opB.id}`));
    assert.equal(perType.length, 0);
  });

  test('an explicitly empty operation selection returns nothing, not the default', async () => {
    const rows = asArray(await admin.request('GET', '/api/relations?operations='));
    assert.equal(rows.length, 0, 'empty selection = no results');
  });
});

// ── 7g. Bulk status ─────────────────────────────────────────────────────────

describe('bulk status update', () => {
  test('validates input and applies a status to selected logs', async () => {
    const bad = await admin.request('POST', '/api/logs/bulk-status', { logIds: [fx.userLog.id], status: 'NOPE' });
    assert.equal(bad.status, 400, 'invalid status rejected');
    const empty = await admin.request('POST', '/api/logs/bulk-status', { logIds: [], status: 'CLEANED' });
    assert.equal(empty.status, 400);

    const ok = await admin.request('POST', '/api/logs/bulk-status', { logIds: [fx.userLog.id], status: 'CLEANED' });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.updated, 1);
    const check = await admin.request('GET', `/api/logs/${fx.userLog.id}`);
    assert.equal(check.json.status, 'CLEANED');
  });
});

// ── 7d. Dashboard stats ─────────────────────────────────────────────────────

describe('dashboard stats', () => {
  test('GET /api/logs/stats returns the aggregate shape and respects scope', async () => {
    const res = await admin.request('GET', '/api/logs/stats');
    assert.equal(res.status, 200, res.text);
    for (const k of ['total', 'locked', 'distinctHosts', 'distinctUsers']) {
      assert.equal(typeof res.json[k], 'number', `${k} is a number`);
    }
    for (const k of ['byStatus', 'topHosts', 'topUsers', 'topCommands', 'activity']) {
      assert.ok(Array.isArray(res.json[k]), `${k} is an array`);
    }
    // Non-admin scoped to opA sees their own log reflected, not the whole DB.
    const userRes = await user.request('GET', '/api/logs/stats');
    assert.equal(userRes.status, 200, userRes.text);
    assert.ok(userRes.json.total >= 1, 'scoped user sees their operation activity');
  });
});

// ── 7c. Untagged-log triage ─────────────────────────────────────────────────

describe('untagged-log triage', () => {
  test('GET /api/logs/untagged is admin-only and returns the {total, logs} shape', async () => {
    const res = await admin.request('GET', '/api/logs/untagged');
    assert.equal(res.status, 200, res.text);
    assert.equal(typeof res.json.total, 'number');
    assert.ok(Array.isArray(res.json.logs));

    const denied = await user.request('GET', '/api/logs/untagged');
    assert.equal(denied.status, 403, 'non-admin cannot triage');
  });

  test('bulk-operation-tag validates input and is admin-only', async () => {
    const empty = await admin.request('POST', '/api/logs/bulk-operation-tag', { logIds: [], operationId: fx.opA.id });
    assert.equal(empty.status, 400);
    const badOp = await admin.request('POST', '/api/logs/bulk-operation-tag', { logIds: [fx.userLog.id], operationId: 99999999 });
    assert.equal(badOp.status, 400, 'unknown operation rejected');
    const denied = await user.request('POST', '/api/logs/bulk-operation-tag', { logIds: [fx.userLog.id], operationId: fx.opA.id });
    assert.equal(denied.status, 403);
  });

  test('assigning an operation to an untagged log removes it from the untagged set', async () => {
    // Create an admin log with no operation, confirm it is untagged, then tag it.
    const created = await admin.request('POST', '/api/logs', { hostname: `untagged-${RUN_ID}`, command: 'id' });
    assert.equal(created.status, 200, created.text);
    const id = created.json.id;
    try {
      const before = await admin.request('GET', '/api/logs/untagged');
      assert.ok(before.json.logs.some(l => l.id === id), 'new admin log should be untagged');

      const assign = await admin.request('POST', '/api/logs/bulk-operation-tag', { logIds: [id], operationId: fx.opA.id });
      assert.equal(assign.status, 200, assign.text);
      assert.equal(assign.json.tagged, 1);

      const after = await admin.request('GET', '/api/logs/untagged');
      assert.ok(!after.json.logs.some(l => l.id === id), 'log should no longer be untagged');
    } finally {
      await admin.request('POST', '/api/logs/bulk-delete', { ids: [id] });
    }
  });
});

// ── 7j. MITRE ATT&CK mapping ────────────────────────────────────────────────

describe('MITRE ATT&CK mapping', () => {
  test('a technique set persists on a log via update', async () => {
    const upd = await admin.request('PUT', `/api/logs/${fx.userLog.id}`, { mitre_techniques: 'T1059.001,T1003' });
    assert.equal(upd.status, 200, upd.text);
    const check = await admin.request('GET', `/api/logs/${fx.userLog.id}`);
    assert.equal(check.json.mitre_techniques, 'T1059.001,T1003');
  });

  test('coverage reflects the mapped technique', async () => {
    const res = await admin.request('GET', '/api/mitre/coverage');
    assert.equal(res.status, 200, res.text);
    assert.equal(typeof res.json.totalLogs, 'number');
    assert.ok(Array.isArray(res.json.techniques));
    assert.ok(res.json.techniques.some(t => t.id === 'T1059.001'), 'T1059.001 appears in coverage');
  });

  test('Navigator layer export is a valid attack layer', async () => {
    const res = await admin.request('GET', '/api/mitre/navigator');
    assert.equal(res.status, 200);
    assert.equal(res.json.domain, 'enterprise-attack');
    assert.ok(Array.isArray(res.json.techniques));
    assert.ok(res.json.techniques.some(t => t.techniqueID === 'T1059.001' && t.score >= 1));
  });
});

// ── 7i. Deconfliction export ────────────────────────────────────────────────

describe('blue-team deconfliction export', () => {
  test('CSV export is sanitized (network/host identifiers only, no TTPs)', async () => {
    const res = await admin.request('GET', '/api/export/deconfliction?format=csv');
    assert.equal(res.status, 200, res.text?.slice(0, 200));
    assert.match(res.headers.get('content-type') || '', /text\/csv/);
    const header = res.text.split('\n')[0].trim();
    assert.equal(header, 'timestamp,internal_ip,external_ip,mac_address,hostname,domain,username,status');
    // TTP columns must NOT be present.
    for (const forbidden of ['command', 'notes', 'secrets', 'hash_value', 'filename']) {
      assert.ok(!header.includes(forbidden), `header must not expose ${forbidden}`);
    }
  });

  test('JSON export carries the sanitized note and rejects a bad date', async () => {
    const res = await admin.request('GET', '/api/export/deconfliction?format=json');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.activity));
    assert.match(res.json.note, /deconfliction/i);
    if (res.json.activity[0]) {
      assert.ok(!('command' in res.json.activity[0]), 'activity rows must not include command');
    }
    const bad = await admin.request('GET', '/api/export/deconfliction?start=not-a-date');
    assert.equal(bad.status, 400);
  });
});

// ── 7h. Presence ────────────────────────────────────────────────────────────

describe('presence (collaboration cues)', () => {
  test('an open SSE connection shows the user in the presence roster', async () => {
    const ac = new AbortController();
    const stream = await fetch(`${BASE}/api/events/stream`, {
      headers: { Cookie: admin.cookieHeader(), 'X-Forwarded-For': admin.ip, Accept: 'text/event-stream' },
      signal: ac.signal,
    });
    assert.equal(stream.status, 200);
    // Drain a little so the connection is fully established and registered.
    const reader = stream.body.getReader();
    await reader.read();
    await new Promise(r => setTimeout(r, 200));

    const roster = await admin.request('GET', '/api/events/presence');
    assert.equal(roster.status, 200, roster.text);
    assert.ok(roster.json.users.includes('admin'), 'admin appears in the roster while connected');

    ac.abort();
    try { await reader.cancel(); } catch { /* aborted */ }
  });
});

// ── 7f. Engagement report ───────────────────────────────────────────────────

describe('engagement report', () => {
  test('GET /api/export/report returns a self-contained HTML document', async () => {
    const res = await admin.request('GET', '/api/export/report');
    assert.equal(res.status, 200, res.text?.slice(0, 200));
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    assert.match(res.text, /<!doctype html>/i);
    assert.match(res.text, /Clio · Engagement Report/);
    assert.match(res.text, /Engagement Timeline/);
    // A scoped user can also generate their own report.
    const userRes = await user.request('GET', '/api/export/report');
    assert.equal(userRes.status, 200, userRes.text?.slice(0, 200));
  });
});

// ── 7e. Real-time SSE stream ────────────────────────────────────────────────

describe('real-time updates (SSE)', () => {
  test('the event stream pushes logs:changed when a log is created', async () => {
    const ac = new AbortController();
    const res = await fetch(`${BASE}/api/events/stream`, {
      headers: { Cookie: admin.cookieHeader(), 'X-Forwarded-For': admin.ip, Accept: 'text/event-stream' },
      signal: ac.signal,
    });
    assert.equal(res.status, 200, 'stream connects');
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);

    const reader = res.body.getReader();
    const dec = new TextDecoder();

    const waitForEvent = (async () => {
      let buf = '';
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (buf.includes('logs:changed')) return true;
      }
      return false;
    })();

    await new Promise(r => setTimeout(r, 300));
    const created = await admin.request('POST', '/api/logs', { hostname: `sse-${RUN_ID}`, command: 'id' });

    const got = await waitForEvent;
    ac.abort();
    try { await reader.cancel(); } catch { /* already aborted */ }
    if (created.json?.id) await admin.request('POST', '/api/logs/bulk-delete', { ids: [created.json.id] });

    assert.ok(got, 'expected a logs:changed event on the SSE stream after creating a log');
  });
});

// ── 8. Revoke All Sessions — runs LAST (destroys the admin session) ─────────

describe('revoke all sessions (the original bug)', () => {
  test('admin is logged out along with everyone else (regression)', async () => {
    const res = await admin.request('POST', '/api/auth/revoke-all', {});
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.selfRevoked, true, 'response declares self-revocation');

    const me = await admin.request('GET', '/api/auth/me');
    assert.equal(me.status, 401, 'admin session is dead after revoke-all');

    const userMe = await user.request('GET', '/api/auth/me');
    assert.equal(userMe.status, 401, 'other sessions are dead too');
  });
});
