#!/bin/sh
# Clio omnibus entrypoint
# Runs on every container start; handles first-boot init then launches supervisord.
set -e

DATA_DIR="${DATA_DIR:-/data}"
SECRETS_FILE="$DATA_DIR/.secrets.env"
CERTS_DIR="$DATA_DIR/certs"
PGDATA="$DATA_DIR/pgdata"

# Ensure persistent data directories exist with correct ownership
mkdir -p "$CERTS_DIR" "$DATA_DIR/redis" "$DATA_DIR/logs" \
         "$DATA_DIR/exports" "$DATA_DIR/evidence" "$DATA_DIR/backend-data"
# Make logs world-writable so postgres/redis/nginx can all write there
chmod 777 "$DATA_DIR/logs"

# ── First-boot: generate secrets ──────────────────────────────────────────────
FIRST_BOOT=false
if [ ! -f "$SECRETS_FILE" ]; then
  FIRST_BOOT=true
  echo "[clio] First boot — generating secrets..."

  _ADMIN="${ADMIN_PASSWORD:-$(openssl rand -hex 12)}"
  _USER="${USER_PASSWORD:-$(openssl rand -hex 12)}"
  _REDIS="$(openssl rand -hex 24)"
  _JWT="$(openssl rand -hex 32)"
  _FIELD="$(openssl rand -hex 32)"
  _RENC="$(openssl rand -hex 16)"
  _PG="$(openssl rand -hex 24)"

  cat > "$SECRETS_FILE" <<EOF
ADMIN_PASSWORD=$_ADMIN
USER_PASSWORD=$_USER
REDIS_PASSWORD=$_REDIS
JWT_SECRET=$_JWT
FIELD_ENCRYPTION_KEY=$_FIELD
REDIS_ENCRYPTION_KEY=$_RENC
POSTGRES_PASSWORD=$_PG
EOF
  chmod 600 "$SECRETS_FILE"
fi

# Load persisted secrets into environment
# shellcheck disable=SC1090
. "$SECRETS_FILE"

# ── TLS certificates ─────────────────────────────────────────────────────────
# Generate a self-signed cert per internal service so every hop is encrypted
# (defense in depth), consistent with the multi-container HA deployment which
# uses server/backend/redis/db certs. The backend connects to Redis and Postgres
# with rejectUnauthorized=false, so independent self-signed certs are sufficient.
_HOST="${EXTERNAL_HOSTNAME:-localhost}"
gen_cert() {
  # $1 = cert basename (server|redis|db)
  # Regenerates the cert if it doesn't exist OR if EXTERNAL_HOSTNAME changed
  # since the cert was issued (stored in a sidecar .hostname file).
  # Uses IP: SAN when the hostname is an IPv4 address so browsers accept it.
  _name="$1"
  _host_file="$CERTS_DIR/$_name.hostname"
  _prev_host=""
  [ -f "$_host_file" ] && _prev_host="$(cat "$_host_file")"

  if [ ! -f "$CERTS_DIR/$_name.crt" ] || [ "$_prev_host" != "$_HOST" ]; then
    echo "[clio] Generating self-signed certificate: $_name (host: $_HOST)"
    if echo "$_HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
      _SAN="DNS:localhost,IP:127.0.0.1,IP:$_HOST"
    else
      _SAN="DNS:localhost,DNS:$_HOST,IP:127.0.0.1"
    fi
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$CERTS_DIR/$_name.key" \
      -out    "$CERTS_DIR/$_name.crt" \
      -days   3650 \
      -subj   "/CN=$_HOST" \
      -addext "subjectAltName=$_SAN" \
      2>/dev/null
    chmod 600 "$CERTS_DIR/$_name.key"
    echo "$_HOST" > "$_host_file"
  fi
}
gen_cert server
gen_cert redis
gen_cert db

# Symlink certs into the locations the backend hardcodes (path.join(__dirname, 'certs', ...)).
# backend.crt reuses the server cert (the backend's own HTTPS listener); redis/db
# are exposed so the Certificate Management page reflects every service's cert.
mkdir -p /app/backend/certs
ln -sf "$CERTS_DIR/server.crt" /app/backend/certs/backend.crt
ln -sf "$CERTS_DIR/server.key" /app/backend/certs/backend.key
ln -sf "$CERTS_DIR/server.crt" /app/backend/certs/server.crt
ln -sf "$CERTS_DIR/server.key" /app/backend/certs/server.key
ln -sf "$CERTS_DIR/redis.crt"  /app/backend/certs/redis.crt
ln -sf "$CERTS_DIR/redis.key"  /app/backend/certs/redis.key
ln -sf "$CERTS_DIR/db.crt"     /app/backend/certs/db.crt
ln -sf "$CERTS_DIR/db.key"     /app/backend/certs/db.key

# ── PostgreSQL init ────────────────────────────────────────────────────────────
if [ ! -d "$PGDATA/global" ]; then
  echo "[clio] Initialising PostgreSQL database..."

  # Create and own the data directory before initdb
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su-exec postgres initdb -D "$PGDATA" \
    --auth-local=trust \
    --auth-host=md5 \
    --username=postgres \
    2>&1 | grep -v "^$" | sed 's/^/[pg-init] /'

  # Accept local trust + loopback md5
  cat > "$PGDATA/pg_hba.conf" <<'HBAEOF'
local all all trust
host  all all 127.0.0.1/32 md5
HBAEOF

  # Temp start on loopback for init. Logs go under $DATA_DIR/logs (chmod 777
  # above) so they are writable regardless of which user owns them. We use a
  # separate file per writer: pg_ctl writes pg-bootstrap.log as the postgres
  # user, while the init.sql loop below appends to pg-init.log as root. Sharing
  # one file fails under podman+SELinux (container root lacks DAC_OVERRIDE), and
  # a failed redirection in POSIX sh silently skips the command it guards.
  su-exec postgres pg_ctl -D "$PGDATA" \
    -o "-c listen_addresses=127.0.0.1" \
    -l "$DATA_DIR/logs/pg-bootstrap.log" \
    start

  # Poll until postgres is ready to accept connections
  echo "[pg-init] Waiting for postgres to be ready..."
  for i in $(seq 1 30); do
    su-exec postgres pg_isready -U postgres -h 127.0.0.1 -q && break
    sleep 1
  done

  # Use the Unix socket (local trust auth) to bootstrap the password and DB.
  # Then all subsequent connections from the backend use TCP + md5.
  su-exec postgres psql -U postgres <<SQLEOF
ALTER ROLE postgres PASSWORD '$POSTGRES_PASSWORD';
CREATE DATABASE redteamlogger OWNER postgres;
SQLEOF

  # Run SQL init scripts via TCP now that the password is set. Redirect to a
  # root-owned file in the world-writable logs dir (see note above) and fail
  # loudly if any script errors — a missing schema must not boot silently.
  for f in /app/backend/db/init/*.sql; do
    echo "[clio] Running init script: $(basename "$f")..."
    if ! PGPASSWORD="$POSTGRES_PASSWORD" su-exec postgres psql \
        -U postgres -h 127.0.0.1 -d redteamlogger -v ON_ERROR_STOP=1 -f "$f" \
        >> "$DATA_DIR/logs/pg-init.log" 2>&1; then
      echo "[clio] ERROR: init script $(basename "$f") failed — see $DATA_DIR/logs/pg-init.log" >&2
      su-exec postgres pg_ctl -D "$PGDATA" stop -m fast || true
      exit 1
    fi
  done

  su-exec postgres pg_ctl -D "$PGDATA" stop -m fast

  echo "[clio] PostgreSQL initialised."
fi

# Ensure postgres owns its data directory (e.g. after volume remount)
chown -R postgres:postgres "$PGDATA"

# ── PostgreSQL SSL ──────────────────────────────────────────────────────────────
# Serve TLS using the db cert. The private key must be owned by the postgres user
# with 0600 perms or postgres refuses to start. Enable ssl in postgresql.conf if
# not already present (idempotent — also upgrades volumes created before TLS).
chown postgres:postgres "$CERTS_DIR/db.crt" "$CERTS_DIR/db.key"
chmod 600 "$CERTS_DIR/db.key"
chmod 644 "$CERTS_DIR/db.crt"
if [ -f "$PGDATA/postgresql.conf" ] && ! grep -q '^ssl = on' "$PGDATA/postgresql.conf"; then
  echo "[clio] Enabling PostgreSQL SSL..."
  cat >> "$PGDATA/postgresql.conf" <<EOF

# TLS enabled by Clio omnibus entrypoint (defense in depth on loopback)
ssl = on
ssl_cert_file = '$CERTS_DIR/db.crt'
ssl_key_file = '$CERTS_DIR/db.key'
EOF
fi

# ── Redis config ───────────────────────────────────────────────────────────────
# TLS-only (port 0 disables the plaintext listener), matching the HA deployment.
# tls-auth-clients no — the backend authenticates with a password over TLS and
# does not present a client cert.
cat > /run/clio/redis.conf <<EOF
requirepass $REDIS_PASSWORD
appendonly yes
save 60 1
maxmemory 512mb
maxmemory-policy noeviction
dir $DATA_DIR/redis
bind 127.0.0.1
loglevel notice
port 0
tls-port 6379
tls-cert-file $CERTS_DIR/redis.crt
tls-key-file $CERTS_DIR/redis.key
tls-ca-cert-file $CERTS_DIR/server.crt
tls-auth-clients no
EOF

# ── Backend .env ───────────────────────────────────────────────────────────────
# The backend reads env vars from its working directory's .env via dotenv.
# If dotenv isn't called in server.js, export these so supervisord inherits them.
_EXT_HOST="${EXTERNAL_HOSTNAME:-localhost}"
# EXTERNAL_PORT lets users running on non-standard ports (e.g. -p 8443:443) set
# FRONTEND_URL correctly so CORS allows the actual browser origin.
_EXT_PORT="${EXTERNAL_PORT:-443}"
if [ "$_EXT_PORT" = "443" ]; then
  _FRONTEND_URL="https://$_EXT_HOST"
else
  _FRONTEND_URL="https://$_EXT_HOST:$_EXT_PORT"
fi
cat > /app/backend/.env <<EOF
REDIS_ENCRYPTION_KEY=$REDIS_ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET
ADMIN_PASSWORD=$ADMIN_PASSWORD
USER_PASSWORD=$USER_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_SSL=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
FIELD_ENCRYPTION_KEY=$FIELD_ENCRYPTION_KEY
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=redteamlogger
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_SSL=true
PORT=3001
NODE_ENV=production
FRONTEND_URL=$_FRONTEND_URL
HOSTNAME=$_EXT_HOST
HTTPS=true
SSL_CRT_FILE=$CERTS_DIR/server.crt
SSL_KEY_FILE=$CERTS_DIR/server.key
NODE_TLS_REJECT_UNAUTHORIZED=0
TZ=UTC
PGTZ=UTC
EOF
chmod 600 /app/backend/.env

# ── Optional SSO config ─────────────────────────────────────────────────────
# Callback URLs default to the external URL ($_FRONTEND_URL) so they honour
# EXTERNAL_PORT on non-standard port mappings, matching what CORS allows.

# Google SSO: pass through if provided as container env vars
if [ -n "$GOOGLE_CLIENT_ID" ]; then
  echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"                                          >> /app/backend/.env
  echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"                                  >> /app/backend/.env
  _GOOGLE_CB="${GOOGLE_CALLBACK_URL:-$_FRONTEND_URL/api/auth/google/callback}"
  echo "GOOGLE_CALLBACK_URL=$_GOOGLE_CB"                                             >> /app/backend/.env
fi

# Generic OIDC: pass through if provided; auto-generate callback URL
if [ -n "$OIDC_ISSUER_URL" ]; then
  echo "OIDC_ISSUER_URL=$OIDC_ISSUER_URL"                                            >> /app/backend/.env
  echo "OIDC_CLIENT_ID=$OIDC_CLIENT_ID"                                              >> /app/backend/.env
  echo "OIDC_CLIENT_SECRET=$OIDC_CLIENT_SECRET"                                      >> /app/backend/.env
  _OIDC_CB="${OIDC_CALLBACK_URL:-$_FRONTEND_URL/api/auth/oidc/callback}"
  echo "OIDC_CALLBACK_URL=$_OIDC_CB"                                                 >> /app/backend/.env
  [ -n "$OIDC_PROVIDER_NAME" ] && echo "OIDC_PROVIDER_NAME=$OIDC_PROVIDER_NAME"     >> /app/backend/.env
  [ -n "$OIDC_SCOPE"         ] && echo "OIDC_SCOPE=$OIDC_SCOPE"                     >> /app/backend/.env
  [ -n "$OIDC_ID_TOKEN_ALG"  ] && echo "OIDC_ID_TOKEN_ALG=$OIDC_ID_TOKEN_ALG"       >> /app/backend/.env
fi

# Also export them so that supervisord child processes inherit them directly
# (belt-and-suspenders: dotenv + env inheritance)
export REDIS_ENCRYPTION_KEY REDIS_ENCRYPTION_KEY JWT_SECRET ADMIN_PASSWORD \
       USER_PASSWORD REDIS_PASSWORD FIELD_ENCRYPTION_KEY POSTGRES_PASSWORD
export REDIS_SSL=true REDIS_HOST=127.0.0.1 REDIS_PORT=6379
export POSTGRES_USER=postgres POSTGRES_DB=redteamlogger \
       POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 POSTGRES_SSL=true
export PORT=3001 NODE_ENV=production
export FRONTEND_URL="$_FRONTEND_URL" HOSTNAME="$_EXT_HOST"
export HTTPS=true
export SSL_CRT_FILE="$CERTS_DIR/server.crt" SSL_KEY_FILE="$CERTS_DIR/server.key"
export NODE_TLS_REJECT_UNAUTHORIZED=0 TZ=UTC PGTZ=UTC

# Symlink backend data directories so exports and event logs persist to the volume.
# backend/exports and backend/data ship as real directories in the Docker image
# (they contain .gitkeep / seed JSON files). ln -sf on an existing directory puts
# the symlink *inside* it rather than replacing it, so we must remove the real
# directory first. Any image-seeded files that are NOT already on the volume are
# moved over (idempotent migration for users upgrading from a pre-fix container).
_replace_dir_with_symlink() {
  _app_dir="$1"   # e.g. /app/backend/exports
  _vol_dir="$2"   # e.g. /data/exports
  mkdir -p "$_vol_dir"
  if [ -d "$_app_dir" ] && [ ! -L "$_app_dir" ]; then
    # Migrate files that don't already exist on the volume
    find "$_app_dir" -maxdepth 1 -mindepth 1 | while read _f; do
      _base="$(basename "$_f")"
      [ -e "$_vol_dir/$_base" ] || mv "$_f" "$_vol_dir/$_base" 2>/dev/null || true
    done
    rm -rf "$_app_dir"
  fi
  # Create or repair the symlink on every boot
  [ -L "$_app_dir" ] || ln -sf "$_vol_dir" "$_app_dir"
}
_replace_dir_with_symlink /app/backend/exports  "$DATA_DIR/exports"
_replace_dir_with_symlink /app/backend/data     "$DATA_DIR/backend-data"
_replace_dir_with_symlink /app/backend/evidence "$DATA_DIR/evidence"

# ── First-boot message ─────────────────────────────────────────────────────────
if [ "$FIRST_BOOT" = "true" ]; then
  echo ""
  echo "┌──────────────────────────────────────────────────┐"
  echo "│             Clio — First Boot                    │"
  echo "│                                                   │"
  printf "│  Admin password : %-33s│\n" "$ADMIN_PASSWORD"
  printf "│  Access         : https://%-27s│\n" "$_EXT_HOST"
  echo "│                                                   │"
  echo "│  These credentials are saved to:                 │"
  printf "│    %-47s│\n" "$SECRETS_FILE"
  echo "└──────────────────────────────────────────────────┘"
fi

echo "[clio] Starting services via supervisord..."
exec supervisord -c /etc/supervisord.conf
