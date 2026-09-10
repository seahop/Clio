#!/usr/bin/env node
// backend/tools/relink-oidc-sub.js
//
// Re-bind existing OIDC SSO accounts to new subject identifiers after an
// identity-provider migration.
//
// Clio matches SSO users by the provider's `sub`. When you move to a new IdP
// (or rebuild the old one) every user gets a new `sub`, so on their next login
// Clio sees an unknown subject, tries to create a fresh account under the same
// preferred_username, finds it taken, and creates `<name>1` instead. The
// original account — with its role, active operation, operation assignments
// and the analyst name on existing logs — is left orphaned.
//
// This tool fixes that in place. It never touches PostgreSQL.
//
//   node tools/relink-oidc-sub.js --list
//       Show every OIDC SSO account, its sub/email, and flag `<name>N`
//       duplicates that share an email with `<name>`.
//
//   node tools/relink-oidc-sub.js --auto [--dry-run]
//       For each `<name>N` duplicate whose email matches `<name>`: point the
//       duplicate's sub at `<name>`, drop `<name>`'s stale sub, delete the
//       duplicate's keys. Use after users have logged in once with the new IdP.
//
//   node tools/relink-oidc-sub.js --map <name>=<new-sub> [--map ...] [--dry-run]
//   node tools/relink-oidc-sub.js --file <path> [--dry-run]
//       Re-bind named accounts to known subs before anyone logs in (e.g. from
//       `kanidm person list`). --file takes one `<name>=<sub>` or `<name> <sub>`
//       per line; `#` comments allowed. If a `<name>N` duplicate already holds
//       that sub, it is removed too.
//
//   node tools/relink-oidc-sub.js --rename <old>=<new> [--rename ...] [--dry-run]
//       Rename an SSO account (e.g. one created as `brandon_idm_example_com`
//       before the IdP sent a short preferred_username). Moves the Redis keys,
//       rebinds the sub, rewrites every username-bearing PostgreSQL column
//       (analyst, created_by, user_operations, …) in one transaction, and
//       revokes the user's sessions so they sign back in under the new name.
//       Refuses if <new> is taken or contains characters outside [A-Za-z0-9_-].
//
//   node tools/relink-oidc-sub.js --merge <from>=<into> [--merge ...] [--dry-run]
//       Fold one SSO account into another belonging to the same person (same
//       email), e.g. `brandon_idm_example_com` (holds the live sub, has recent
//       data) into `brandon` (older account, older data). <into> keeps its
//       name and preferences and adopts <from>'s sub; <from>'s PostgreSQL rows
//       are rewritten to <into> and its Redis keys removed. Both users'
//       sessions are revoked. Operation assignments are unioned.
//
// Run inside the backend container (omnibus: `docker exec -w /app/backend clio
// node tools/relink-oidc-sub.js ...`). Requires the backend's .env.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const { redisClient } = require('../lib/redis');

// Plain string keys carried across a rename. `tokens`/`sessions` (sets) and
// `operations` (a cache) are deleted instead, forcing a clean re-login.
const USER_STRING_KEYS = ['exists', 'isOIDCSSO', 'email', 'role', 'oidcSub', 'active_operation', 'admin_view_filter'];
const USER_DROP_KEYS   = ['tokens', 'sessions', 'operations', 'password_reset'];

// Every column that stores a Clio username (who did something). Columns named
// `username` on logs/relations/file_status are *target* usernames from log
// entries and are deliberately not listed.
const PG_USERNAME_COLUMNS = [
  ['logs', 'analyst'], ['logs', 'locked_by'],
  ['tags', 'created_by'], ['log_tags', 'tagged_by'],
  ['operations', 'created_by'],
  ['user_operations', 'username'], ['user_operations', 'assigned_by'],
  ['evidence_files', 'uploaded_by'],
  ['api_keys', 'created_by'],
  ['log_templates', 'created_by'],
  ['file_status', 'analyst'], ['file_status_history', 'analyst'],
  ['log_relationships', 'created_by'],
];
const USERNAME_RE = /^[A-Za-z0-9_-]{1,100}$/;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const vals = (f) => argv.flatMap((a, i) => (a === f && argv[i + 1] ? [argv[i + 1]] : []));
const dryRun = has('--dry-run');

const log = (...a) => console.log(...a);
const act = (...a) => console.log(dryRun ? '[dry-run]' : '[apply]  ', ...a);

// ── Inventory ────────────────────────────────────────────────────────────────
const loadAccounts = async () => {
  const keys = await redisClient.keys('user:*:isOIDCSSO');
  const accounts = new Map();
  for (const k of keys) {
    const username = k.slice('user:'.length, -':isOIDCSSO'.length);
    const [sub, email, role] = await Promise.all([
      redisClient.get(`user:${username}:oidcSub`),
      redisClient.get(`user:${username}:email`),
      redisClient.get(`user:${username}:role`),
    ]);
    accounts.set(username, { username, sub: sub ? String(sub) : null, email: email ? String(email) : null, role: role ? String(role) : null });
  }
  return accounts;
};

// `<base><digits>` whose base is also an OIDC account with the same email.
const findDuplicates = (accounts) => {
  const dups = [];
  for (const a of accounts.values()) {
    const m = /^(.+?)(\d+)$/.exec(a.username);
    if (!m) continue;
    const base = accounts.get(m[1]);
    if (!base || base.username === a.username) continue;
    if (!a.email || !base.email || a.email.toLowerCase() !== base.email.toLowerCase()) continue;
    dups.push({ dup: a, base });
  }
  return dups;
};

// ── Mutations ────────────────────────────────────────────────────────────────
const deleteAccount = async (username) => {
  const keys = await redisClient.keys(`user:${username}:*`);
  act(`delete ${keys.length} key(s) for '${username}'`);
  if (!dryRun) for (const k of keys) await redisClient.del(k);
};

// Bind `base` to `newSub`, dropping the stale mapping and any duplicate account
// that currently holds `newSub`.
const rebind = async (accounts, baseName, newSub) => {
  const base = accounts.get(baseName);
  if (!base) { log(`  ! '${baseName}' is not an OIDC SSO account — skipped`); return false; }
  if (base.sub === newSub) { log(`  = '${baseName}' already bound to ${newSub}`); return false; }

  const holder = await redisClient.get(`oidc:${newSub}`);
  if (holder && String(holder) !== baseName) {
    const h = accounts.get(String(holder));
    const isDup = h && /^(.+?)\d+$/.test(h.username) && h.username.startsWith(baseName)
               && h.email && base.email && h.email.toLowerCase() === base.email.toLowerCase();
    if (!isDup) {
      log(`  ! sub ${newSub} is already bound to '${holder}', which does not look like a duplicate of '${baseName}' — skipped`);
      return false;
    }
    await deleteAccount(h.username);
  }

  act(`oidc:${newSub} => '${baseName}'`);
  act(`user:${baseName}:oidcSub => ${newSub}`);
  if (base.sub) act(`del oidc:${base.sub} (stale)`);
  if (!dryRun) {
    await redisClient.set(`oidc:${newSub}`, baseName);
    await redisClient.set(`user:${baseName}:oidcSub`, newSub);
    if (base.sub) await redisClient.del(`oidc:${base.sub}`);
  }
  return true;
};

// Rewrite every username-bearing PostgreSQL column from -> to, in one
// transaction. user_operations is UNIQUE(username, operation_id): rows for
// operations the target already has are dropped instead of updated.
const rewritePostgres = async (fromName, toName) => {
  const db = require('../db');
  const counts = {};
  for (const [table, col] of PG_USERNAME_COLUMNS) {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`, [fromName]);
    if (rows[0].n) counts[`${table}.${col}`] = rows[0].n;
  }
  act(`postgres: ${Object.keys(counts).length ? Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(', ') : 'no rows reference this user'}`);
  if (dryRun || !Object.keys(counts).length) return;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM user_operations a USING user_operations b
        WHERE a.username = $1 AND b.username = $2 AND a.operation_id = b.operation_id`,
      [fromName, toName]
    );
    for (const [table, col] of PG_USERNAME_COLUMNS) {
      await client.query(`UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2`, [toName, fromName]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const revokeSessions = async (username) => {
  const tokenIds = await redisClient.sMembers(`user:${username}:tokens`).catch(() => []);
  act(`revoke ${tokenIds.length} session token(s) for '${username}'`);
  if (!dryRun) for (const id of tokenIds) await redisClient.del(`jwt:${id}`);
};

const renameAccount = async (accounts, oldName, newName) => {
  const acct = accounts.get(oldName);
  if (!acct) { log(`  ! '${oldName}' is not an OIDC SSO account — skipped`); return false; }
  if (!USERNAME_RE.test(newName)) { log(`  ! '${newName}' must match [A-Za-z0-9_-] — skipped`); return false; }
  if (oldName === newName) { log('  = names are identical — skipped'); return false; }
  const taken = await redisClient.exists(`user:${newName}:exists`, `admin:password:${newName}`, `user:password:${newName}`);
  if (taken) {
    const other = accounts.get(newName);
    const hint = other && other.email && acct.email && other.email.toLowerCase() === acct.email.toLowerCase()
      ? ` (same email as '${oldName}' — use --merge ${oldName}=${newName} to fold them together)` : '';
    log(`  ! '${newName}' is already taken${hint} — skipped`);
    return false;
  }

  // PostgreSQL first (transactional); Redis after, so a DB failure leaves the
  // account untouched and the command can simply be re-run.
  await rewritePostgres(oldName, newName);

  await revokeSessions(oldName);
  for (const k of USER_STRING_KEYS) {
    const v = await redisClient.get(`user:${oldName}:${k}`);
    if (v === null || v === undefined) continue;
    act(`user:${newName}:${k} <= user:${oldName}:${k}`);
    if (!dryRun) { await redisClient.set(`user:${newName}:${k}`, v); await redisClient.del(`user:${oldName}:${k}`); }
  }
  for (const k of USER_DROP_KEYS) {
    if (!dryRun) await redisClient.del(`user:${oldName}:${k}`);
  }
  if (acct.sub) {
    act(`oidc:${acct.sub} => '${newName}'`);
    if (!dryRun) await redisClient.set(`oidc:${acct.sub}`, newName);
  }
  return true;
};

// Fold <from> into <into> (same person, same email). <into> keeps its name and
// preferences and adopts <from>'s sub — the one the IdP is using now.
const mergeAccounts = async (accounts, fromName, intoName) => {
  const from = accounts.get(fromName);
  const into = accounts.get(intoName);
  if (!from) { log(`  ! '${fromName}' is not an OIDC SSO account — skipped`); return false; }
  if (!into) { log(`  ! '${intoName}' is not an OIDC SSO account — skipped`); return false; }
  if (fromName === intoName) { log('  = names are identical — skipped'); return false; }
  if (!from.email || !into.email || from.email.toLowerCase() !== into.email.toLowerCase()) {
    log(`  ! emails differ ('${from.email}' vs '${into.email}') — refusing to merge different people`);
    return false;
  }
  if (!from.sub) { log(`  ! '${fromName}' has no sub — skipped`); return false; }

  const [intoOp, fromOp] = await Promise.all([
    redisClient.get(`user:${intoName}:active_operation`),
    redisClient.get(`user:${fromName}:active_operation`),
  ]);
  log(`  '${intoName}' keeps its name and preferences (role=${into.role}, active_operation=${intoOp}) and adopts sub ${from.sub}`);
  log(`  '${fromName}' (role=${from.role}, active_operation=${fromOp}) is folded in and removed`);

  await rewritePostgres(fromName, intoName);
  await revokeSessions(fromName);
  await revokeSessions(intoName);

  act(`oidc:${from.sub} => '${intoName}'`);
  act(`user:${intoName}:oidcSub => ${from.sub}`);
  if (into.sub && into.sub !== from.sub) act(`del oidc:${into.sub} (stale)`);
  if (!dryRun) {
    await redisClient.set(`oidc:${from.sub}`, intoName);
    await redisClient.set(`user:${intoName}:oidcSub`, from.sub);
    if (into.sub && into.sub !== from.sub) await redisClient.del(`oidc:${into.sub}`);
  }
  await deleteAccount(fromName);
  return true;
};

// ── Modes ────────────────────────────────────────────────────────────────────
const parseMappings = () => {
  const pairs = [];
  for (const m of vals('--map')) pairs.push(m);
  for (const f of vals('--file')) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const t = line.replace(/#.*/, '').trim();
      if (t) pairs.push(t);
    }
  }
  return pairs.map((p) => {
    const m = /^([^=\s]+)[=\s]+(\S+)$/.exec(p);
    if (!m) throw new Error(`Bad mapping '${p}' — expected <name>=<sub>`);
    return { name: m[1], sub: m[2] };
  });
};

const main = async () => {
  const accounts = await loadAccounts();
  const dups = findDuplicates(accounts);

  if (has('--list') || argv.length === 0) {
    log(`OIDC SSO accounts (${accounts.size}):`);
    for (const a of [...accounts.values()].sort((x, y) => x.username.localeCompare(y.username))) {
      const flag = dups.find((d) => d.dup.username === a.username) ? '  <-- duplicate of ' + dups.find((d) => d.dup.username === a.username).base.username : '';
      log(`  ${a.username.padEnd(28)} role=${(a.role || '-').padEnd(6)} email=${(a.email || '-').padEnd(32)} sub=${a.sub || '-'}${flag}`);
    }
    if (argv.length === 0) log('\nNothing changed. Use --auto, --map or --file (add --dry-run to preview).');
    return;
  }

  let changed = 0;
  if (has('--auto')) {
    if (!dups.length) log('No <name>N duplicates found.');
    for (const { dup, base } of dups) {
      log(`\n${base.username}  <=  ${dup.username} (sub ${dup.sub})`);
      if (!dup.sub) { log('  ! duplicate has no sub — skipped'); continue; }
      if (await rebind(accounts, base.username, dup.sub)) changed++;
    }
  }

  const mappings = parseMappings();
  for (const { name, sub } of mappings) {
    log(`\n${name}  =>  ${sub}`);
    if (await rebind(accounts, name, sub)) changed++;
  }

  const renames = vals('--rename').map((r) => {
    const m = /^([^=\s]+)=(\S+)$/.exec(r);
    if (!m) throw new Error(`Bad rename '${r}' — expected <old>=<new>`);
    return { oldName: m[1], newName: m[2] };
  });
  for (const { oldName, newName } of renames) {
    log(`\nrename ${oldName}  ->  ${newName}`);
    if (await renameAccount(accounts, oldName, newName)) changed++;
  }

  const merges = vals('--merge').map((r) => {
    const m = /^([^=\s]+)=(\S+)$/.exec(r);
    if (!m) throw new Error(`Bad merge '${r}' — expected <from>=<into>`);
    return { fromName: m[1], intoName: m[2] };
  });
  for (const { fromName, intoName } of merges) {
    log(`\nmerge ${fromName}  ->  ${intoName}`);
    if (await mergeAccounts(accounts, fromName, intoName)) changed++;
  }

  if (!has('--auto') && !mappings.length && !renames.length && !merges.length) {
    log('Nothing to do. Use --list, --auto, --map <name>=<sub>, --file <path>, --rename <old>=<new> or --merge <from>=<into>.');
    return;
  }
  log(`\n${dryRun ? 'Would change' : 'Changed'} ${changed} account(s).${dryRun ? ' Re-run without --dry-run to apply.' : ''}`);
  if (changed && !dryRun) log('Affected users should sign out and back in; existing sessions keep the old username until then.');
};

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
