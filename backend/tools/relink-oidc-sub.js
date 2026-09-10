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
// Run inside the backend container (omnibus: `docker exec -w /app/backend clio
// node tools/relink-oidc-sub.js ...`). Requires the backend's .env.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const { redisClient } = require('../lib/redis');

const USER_KEYS = ['exists', 'isOIDCSSO', 'email', 'role', 'oidcSub', 'active_operation', 'admin_view_filter'];

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

  if (!has('--auto') && !mappings.length) {
    log('Nothing to do. Use --list, --auto, --map <name>=<sub> or --file <path>.');
    return;
  }
  log(`\n${dryRun ? 'Would change' : 'Changed'} ${changed} account(s).${dryRun ? ' Re-run without --dry-run to apply.' : ''}`);
  if (changed && !dryRun) log('Affected users should sign out and back in; existing sessions keep the old username until then.');
};

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
