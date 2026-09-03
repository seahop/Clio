# Upgrading Clio

Clio is designed for safe in-place upgrades. Two mechanisms make this work:

1. **Persistent storage.** All state — the PostgreSQL database (logs, tags,
   operations, relations, API keys), Redis (sessions, generated passwords), and
   evidence files — lives in Docker volumes / Kubernetes PVCs that survive
   container and image replacement.
2. **An idempotent migration runner.** On every backend start, `db/migrate.js`
   applies any numbered SQL migrations that haven't run yet, tracked in a
   `schema_migrations` table. Already-applied migrations are skipped, so
   starting a newer version against an existing database only applies what's
   new and never re-runs or reverts anything.

Because of this, upgrading is: **back up → pull/rebuild the new version → start
it against the same volumes.** Your data ports over automatically.

---

## ⚠️ Before every upgrade: back up

A backup costs nothing and is your safety net if anything goes wrong. Take one
**before** you start the new version.

**Multi-container compose** (database in the `postgres_data` volume):

```bash
docker compose exec -T db pg_dump -U postgres redteamlogger > clio-db-backup-$(date +%F).sql
# evidence files (optional but recommended)
docker run --rm -v clio_evidence_files:/data -v "$PWD":/backup alpine \
  tar czf /backup/clio-evidence-$(date +%F).tgz -C /data .
```

**Omnibus** (everything in the single `clio-data` volume):

```bash
docker run --rm -v clio-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/clio-data-$(date +%F).tgz -C /data .
```

**Kubernetes:** snapshot the PVCs (`kubectl get pvc -n clio`) with your cluster's
volume-snapshot tooling, or `pg_dump` from the postgres pod.

> ### The one rule that matters
> **Never run `docker compose down -v` as part of an upgrade.** The `-v` flag
> deletes the named volumes — that *is* your data. Use `docker compose up -d`
> (optionally `down` **without** `-v` first). `helm upgrade` never deletes PVCs.

---

## Upgrade steps by deployment

### Multi-container compose

```bash
# 1. Get the new code (git pull, or copy the new tree over the old one)
git pull

# 2. Rebuild the images (the frontend MUST rebuild — see version notes) and
#    restart against the same volumes. No -v anywhere.
docker compose build
docker compose up -d
```

The backend runs outstanding migrations on start; watch it with
`docker compose logs -f backend` (you'll see `Applying migration:` lines, or
`Database schema is up to date`).

### Omnibus (single container)

```bash
# Pull the new image, then recreate the container against the same clio-data volume
docker compose -f docker-compose.omnibus.yml pull      # or: build
docker compose -f docker-compose.omnibus.yml up -d
```

The omnibus entrypoint only initializes PostgreSQL when the data directory is
absent, so an existing `clio-data` volume is preserved and the bundled backend
runs any new migrations on boot. Generated secrets and admin credentials in the
volume are kept.

### Kubernetes (Helm)

```bash
helm upgrade clio ./k8s -n clio -f your-values.yaml
```

A `pre-upgrade` Helm hook Job runs the migration runner before the new backend
pods roll out, so the schema is current when they start. PVCs and the
auto-generated Secret are preserved across the upgrade. See
[kubernetes.md](kubernetes.md) for details.

---

## Verifying the upgrade

```bash
# Applied migrations (should include everything, newest last)
docker compose exec -T db psql -U postgres -d redteamlogger \
  -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"

# Your data is still there
docker compose exec -T db psql -U postgres -d redteamlogger \
  -c "SELECT count(*) FROM logs;"
```

Then log in and confirm the log list, relations, and exports look right.

---

## Rolling back

Because migrations are additive and forward-only, the clean rollback is:
**restore the pre-upgrade backup, then start the previous version's images
against it.** If a version added a migration your old code doesn't expect, the
old code simply ignores the extra column/table — but restoring the matching
backup is the safe path.

---

## Version-specific notes

**Skipping versions is supported.** The migration runner applies every
intervening migration in order, so you can upgrade directly from an older
release — you do not have to step through each version.

### Upgrading to 1.0.4 from 1.0.2

1.0.2 predates migrations 002 and 003, so this upgrade **applies them on first
boot** (you'll see `Applying migration: 002…` / `003…` in the backend log):

- **002** widens `file_status.filename` to `VARCHAR(254)` — a non-destructive
  widening; existing filenames are preserved.
- **003** adds the `logs.mitre_techniques` column (`ADD COLUMN IF NOT EXISTS`) —
  additive; existing logs are untouched and simply get an empty value.

Verified with a clean-room 1.0.2 → 1.0.4 run: 50 logs / 318 relations / 10
file-status rows all survived, the column was added, the filename column widened
with filenames intact, and a 1.0.2-era API key kept working. Everything in the
"from 1.0.3" notes below also applies.

### Upgrading to 1.0.4 from 1.0.3

- **No database schema changes.** 1.0.4 adds no migrations, so the runner is a
  no-op against a 1.0.3 database — every existing log, tag, operation, relation,
  and API key is carried over untouched.
- **The frontend moved from Create React App to Vite.** If you build images
  locally (compose or a local image build), the frontend image **must be
  rebuilt** so it serves the new bundle — `docker compose build` handles this.
  Pulling published images needs no special action.
- **API keys switched from SHA-256 to HMAC hashing, backward-compatibly.**
  Existing keys keep working: they validate against the legacy hash and are
  transparently re-hashed to HMAC the first time they're used. Nothing you've
  already deployed in agents or scripts needs to change. (Optionally set
  `API_KEY_HMAC_SECRET` to pin a dedicated HMAC secret; if unset, one is derived
  from an existing server secret.)
- **No new required environment variables** — your existing `.env` / secrets
  work as-is.
