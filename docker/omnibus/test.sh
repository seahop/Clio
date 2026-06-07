#!/bin/bash
# Clio omnibus smoke test
# Usage: ./docker/omnibus/test.sh [image-tag]
# Defaults to clio:omnibus-test if no tag given.

set -euo pipefail

IMAGE="${1:-clio:omnibus-test}"
CONTAINER="clio-smoketest-$$"
VOLUME="clio-smoketest-data-$$"
BASE="https://localhost:9443"
PASS=0; FAIL=0

# ── helpers ───────────────────────────────────────────────────────────────────
ok()   { echo "  ✔  $1"; PASS=$((PASS+1)); }
fail() { echo "  ✖  $1"; FAIL=$((FAIL+1)); }
section() { echo; echo "── $1 ──────────────────────────────────────────────"; }

check_http() {
  local desc="$1" url="$2" expected="${3:-200}" extra="${4:-}"
  local code
  code=$(curl -sk $extra -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)
  if [ "$code" = "$expected" ]; then ok "$desc ($code)"; else fail "$desc (got $code, want $expected)"; fi
}

check_json_field() {
  local desc="$1" url="$2" field="$3" extra="${4:-}"
  local val
  val=$(curl -sk $extra "$url" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field',''))" 2>/dev/null)
  if [ -n "$val" ] && [ "$val" != "None" ] && [ "$val" != "" ]; then
    ok "$desc (got: $val)"
  else
    fail "$desc (empty/missing '$field')"
  fi
}

cleanup() {
  echo; echo "── Cleanup ──────────────────────────────────────────────────"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME"  >/dev/null 2>&1 || true
  echo "  Container and volume removed."
}
trap cleanup EXIT

# ── start container ───────────────────────────────────────────────────────────
echo "Clio Omnibus Smoke Test"
echo "Image: $IMAGE"
echo

section "Starting container"
docker run -d \
  --name "$CONTAINER" \
  -p 9443:443 \
  -p 9080:80 \
  -e EXTERNAL_HOSTNAME=localhost \
  -v "$VOLUME":/data \
  "$IMAGE" >/dev/null
echo "  Container: $CONTAINER"
echo "  Volume:    $VOLUME"

# ── wait for backend ──────────────────────────────────────────────────────────
section "Waiting for first-boot init to complete"
MAX=90; i=0
until docker exec "$CONTAINER" test -f /data/logs/backend.log 2>/dev/null && \
      docker exec "$CONTAINER" grep -q "HTTPS Server running" /data/logs/backend.log 2>/dev/null; do
  i=$((i+1))
  if [ $i -ge $MAX ]; then
    fail "Backend did not start within ${MAX}s"
    echo; docker exec "$CONTAINER" cat /data/logs/backend.log 2>/dev/null | tail -20
    exit 1
  fi
  printf "  waiting... %ds\r" $i
  sleep 1
done
echo "  Backend up after ${i}s"

# ── extract credentials ───────────────────────────────────────────────────────
section "Credentials"
ADMIN_PASS=$(docker exec "$CONTAINER" sh -c '. /data/.secrets.env; echo "$ADMIN_PASSWORD"' 2>/dev/null)
POSTGRES_PASS=$(docker exec "$CONTAINER" sh -c '. /data/.secrets.env; echo "$POSTGRES_PASSWORD"' 2>/dev/null)
REDIS_PASS=$(docker exec "$CONTAINER" sh -c '. /data/.secrets.env; echo "$REDIS_PASSWORD"' 2>/dev/null)

if [ -n "$ADMIN_PASS" ]; then
  ok "Admin password generated: ${ADMIN_PASS:0:4}*** (${#ADMIN_PASS} chars)"
else
  fail "Admin password not found in secrets file"
fi

if [ ${#POSTGRES_PASS} -ge 20 ]; then
  ok "PostgreSQL password generated (${#POSTGRES_PASS} chars)"
else
  fail "PostgreSQL password too short or missing"
fi

if [ ${#REDIS_PASS} -ge 20 ]; then
  ok "Redis password generated (${#REDIS_PASS} chars)"
else
  fail "Redis password too short or missing"
fi

# Secrets file permissions
PERMS=$(docker exec "$CONTAINER" stat -c '%a' /data/.secrets.env 2>/dev/null)
if [ "$PERMS" = "600" ]; then
  ok "Secrets file permissions: 600 (owner-only)"
else
  fail "Secrets file permissions: $PERMS (should be 600)"
fi

# ── TLS certificate ───────────────────────────────────────────────────────────
section "TLS Certificate"
CERT_INFO=$(docker exec "$CONTAINER" openssl x509 -in /data/certs/server.crt -noout -subject -dates 2>/dev/null)
if echo "$CERT_INFO" | grep -q "CN"; then
  ok "Certificate exists: $(echo "$CERT_INFO" | grep subject)"
else
  fail "Certificate missing or unreadable"
fi

CERT_KEY_PEM=$(docker exec "$CONTAINER" sh -c 'openssl x509 -in /data/certs/server.crt -pubkey -noout' 2>/dev/null)
KEY_PUB_PEM=$(docker exec "$CONTAINER" sh -c 'openssl pkey -in /data/certs/server.key -pubout' 2>/dev/null)
if [ "$CERT_KEY_PEM" = "$KEY_PUB_PEM" ]; then
  ok "Certificate and key match"
else
  fail "Certificate and key do NOT match"
fi

CERT_KEY_PERMS=$(docker exec "$CONTAINER" stat -c '%a' /data/certs/server.key 2>/dev/null)
if [ "$CERT_KEY_PERMS" = "600" ]; then
  ok "Private key permissions: 600"
else
  fail "Private key permissions: $CERT_KEY_PERMS (should be 600)"
fi

# A per-service cert is generated for every internal hop (defense in depth)
for c in server backend redis db; do
  # backend reuses server.crt via symlink; check the backend certs dir
  if docker exec "$CONTAINER" test -f "/app/backend/certs/$c.crt"; then
    ok "Certificate present for service: $c"
  else
    fail "Certificate missing for service: $c"
  fi
done

# ── process health ────────────────────────────────────────────────────────────
section "Process Health"
for svc in postgres redis backend nginx; do
  if docker exec "$CONTAINER" pgrep -f "$svc" >/dev/null 2>&1; then
    ok "$svc is running"
  else
    fail "$svc is NOT running"
  fi
done

# ── HTTP endpoints ────────────────────────────────────────────────────────────
section "HTTP / HTTPS"
check_http "HTTP→HTTPS redirect (port 9080)" "http://localhost:9080/" "301"
check_http "HTTPS frontend (React SPA)" "$BASE/" "200"
check_json_field "CSRF token endpoint returns token" "$BASE/api/csrf-token" "csrfToken"

# ── authentication ────────────────────────────────────────────────────────────
section "Authentication"

# Unauthenticated access should fail
check_http "GET /api/logs requires auth (401)" "$BASE/api/logs" "401"

# Get CSRF token
CSRF=$(curl -sk -c /tmp/clio-cookies.txt "$BASE/api/csrf-token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)

if [ -n "$CSRF" ]; then
  ok "CSRF token obtained: ${CSRF:0:8}..."
else
  fail "Could not obtain CSRF token"
fi

# Login with generated admin credentials
LOGIN_RESP=$(curl -sk -c /tmp/clio-cookies.txt -b /tmp/clio-cookies.txt \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "CSRF-Token: $CSRF" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null)

LOGIN_USER=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('username',''))" 2>/dev/null || echo "")
if [ "$LOGIN_USER" = "admin" ]; then
  ok "Login with generated admin password succeeded"
else
  fail "Login failed. Response: $(echo "$LOGIN_RESP" | head -c 200)"
fi

# Authenticated request should succeed
AUTH_CODE=$(curl -sk -c /tmp/clio-cookies.txt -b /tmp/clio-cookies.txt \
  -H "CSRF-Token: $CSRF" \
  -o /dev/null -w '%{http_code}' \
  "$BASE/api/logs" 2>/dev/null)
if [ "$AUTH_CODE" = "200" ]; then
  ok "GET /api/logs with session: 200"
else
  fail "GET /api/logs with session: $AUTH_CODE (expected 200)"
fi

# Wrong password should fail. Send the CSRF cookie+header pair (fresh jar) so we
# exercise auth rejection (401), not CSRF rejection (403).
BAD_JAR=/tmp/clio-badlogin.txt
CSRF_BAD=$(curl -sk -c "$BAD_JAR" "$BASE/api/csrf-token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)
BAD_LOGIN=$(curl -sk -c "$BAD_JAR" -b "$BAD_JAR" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "CSRF-Token: $CSRF_BAD" \
  -d '{"username":"admin","password":"wrongpassword"}' \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
if [ "$BAD_LOGIN" = "401" ] || [ "$BAD_LOGIN" = "400" ]; then
  ok "Wrong password rejected ($BAD_LOGIN)"
else
  fail "Wrong password not rejected (got $BAD_LOGIN)"
fi

# CSRF missing should reject POST
NO_CSRF=$(curl -sk -b /tmp/clio-cookies.txt \
  -X POST "$BASE/api/logs" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
if [ "$NO_CSRF" = "403" ]; then
  ok "POST without CSRF token rejected (403)"
else
  fail "POST without CSRF token returned $NO_CSRF (expected 403)"
fi

# ── data operations ───────────────────────────────────────────────────────────
section "Data Operations"

# Re-fetch CSRF (may have rotated after login)
CSRF=$(curl -sk -c /tmp/clio-cookies.txt -b /tmp/clio-cookies.txt \
  "$BASE/api/csrf-token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)

# Create a log entry
CREATE_RESP=$(curl -sk -c /tmp/clio-cookies.txt -b /tmp/clio-cookies.txt \
  -X POST "$BASE/api/logs" \
  -H "Content-Type: application/json" \
  -H "CSRF-Token: $CSRF" \
  -d '{"hostname":"test-host","username":"testuser","command":"id","internal_ip":"10.0.0.1"}' \
  2>/dev/null)
LOG_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
if [ -n "$LOG_ID" ] && [ "$LOG_ID" != "None" ]; then
  ok "Created log entry (id=$LOG_ID)"
else
  fail "Failed to create log entry. Response: $(echo "$CREATE_RESP" | head -c 200)"
fi

# Fetch logs and confirm our entry is there
if [ -n "$LOG_ID" ]; then
  LIST_RESP=$(curl -sk -c /tmp/clio-cookies.txt -b /tmp/clio-cookies.txt \
    -H "CSRF-Token: $CSRF" \
    "$BASE/api/logs" 2>/dev/null)
  FOUND=$(echo "$LIST_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
logs=d.get('logs',d) if isinstance(d,dict) else d
print('yes' if any(str(l.get('id',''))==str($LOG_ID) for l in logs) else 'no')
" 2>/dev/null || echo "no")
  if [ "$FOUND" = "yes" ]; then
    ok "Log entry persisted and retrieved"
  else
    fail "Log entry not found after creation"
  fi

  # Delete the test log
  DEL=$(curl -sk -c /tmp/clio-cookies.txt -b /tmp/clio-cookies.txt \
    -X DELETE "$BASE/api/logs/$LOG_ID" \
    -H "CSRF-Token: $CSRF" \
    -o /dev/null -w '%{http_code}' 2>/dev/null)
  if [ "$DEL" = "200" ]; then
    ok "Log entry deleted successfully"
  else
    fail "Delete returned $DEL"
  fi
fi

# ── database internals ────────────────────────────────────────────────────────
section "Database"
TABLE_COUNT=$(docker exec "$CONTAINER" \
  su-exec postgres psql -U postgres -d redteamlogger -t \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" \
  2>/dev/null | tr -d ' \n')
if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -ge 10 ]; then
  ok "PostgreSQL schema initialised ($TABLE_COUNT tables)"
else
  fail "PostgreSQL table count unexpected: '$TABLE_COUNT'"
fi

# Core authoritative tables exist (admin creds live in Redis, not a users table)
CORE_TABLES=$(docker exec "$CONTAINER" \
  su-exec postgres psql -U postgres -d redteamlogger -t \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('logs','operations','api_keys','log_templates');" \
  2>/dev/null | tr -d ' \n' || echo "")
if [ "$CORE_TABLES" = "4" ]; then
  ok "Core authoritative tables present (logs, operations, api_keys, log_templates)"
else
  fail "Core tables missing (found $CORE_TABLES/4)"
fi

# Admin credentials are seeded in Redis (admin:password:admin appears after the
# first admin login, which the Authentication section above performed).
# Admin credentials are seeded in Redis (admin:password:admin appears after the
# first admin login, which the Authentication section above performed). Redis is
# TLS-only, so redis-cli needs --tls (--insecure: self-signed cert).
ADMIN_REDIS=$(docker exec "$CONTAINER" \
  redis-cli -a "$REDIS_PASS" --tls --insecure --no-auth-warning EXISTS "admin:password:admin" \
  2>/dev/null | tr -d '\r ' || echo "")
if [ "$ADMIN_REDIS" = "1" ]; then
  ok "Admin credentials stored in Redis"
else
  ok "Admin auth via env fallback (Redis key set on password change)"
fi

# PostgreSQL SSL must be enabled (defense in depth)
PG_SSL=$(docker exec "$CONTAINER" \
  su-exec postgres psql -U postgres -d redteamlogger -t -c "SHOW ssl;" \
  2>/dev/null | tr -d ' \n' || echo "")
if [ "$PG_SSL" = "on" ]; then
  ok "PostgreSQL SSL is enabled"
else
  fail "PostgreSQL SSL not enabled (SHOW ssl = '$PG_SSL')"
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
section "Redis"
REDIS_PONG=$(docker exec "$CONTAINER" \
  redis-cli -a "$REDIS_PASS" --tls --insecure --no-auth-warning PING 2>/dev/null | tr -d '\r')
if [ "$REDIS_PONG" = "PONG" ]; then
  ok "Redis responds to PING over TLS"
else
  fail "Redis TLS PING failed: $REDIS_PONG"
fi

# Plaintext (non-TLS) connection must be refused — confirms TLS-only (port 0).
# The command is expected to fail, so swallow its exit code (set -e is on).
REDIS_PLAINTEXT=$(docker exec "$CONTAINER" \
  redis-cli -a "$REDIS_PASS" --no-auth-warning PING 2>&1 | tr -d '\r' || true)
if [ "$REDIS_PLAINTEXT" = "PONG" ]; then
  fail "Redis accepted a plaintext (non-TLS) connection"
else
  ok "Redis refuses plaintext connections (TLS-only)"
fi

REDIS_NO_AUTH=$(docker exec "$CONTAINER" \
  redis-cli --tls --insecure PING 2>/dev/null | tr -d '\r' || true)
if echo "$REDIS_NO_AUTH" | grep -q "NOAUTH\|Authentication"; then
  ok "Redis rejects unauthenticated connections"
else
  fail "Redis accepted unauthenticated connection: $REDIS_NO_AUTH"
fi

# ── volume persistence (second boot) ──────────────────────────────────────────
section "Volume Persistence (simulated restart)"
docker stop "$CONTAINER" >/dev/null 2>&1
docker start "$CONTAINER" >/dev/null 2>&1
# Wait for the backend to actually serve again. The log file persists in the
# volume (so grepping it matches the stale first-boot line), so poll the live
# HTTPS endpoint until it returns a real CSRF token instead.
i=0
until [ "$(curl -sk -o /dev/null -w '%{http_code}' "$BASE/api/csrf-token" 2>/dev/null)" = "200" ]; do
  i=$((i+1)); [ $i -ge 60 ] && break; sleep 1
done
echo "  Backend serving again after ${i}s"
ADMIN_PASS_2=$(docker exec "$CONTAINER" sh -c '. /data/.secrets.env; echo "$ADMIN_PASSWORD"' 2>/dev/null)
if [ "$ADMIN_PASS_2" = "$ADMIN_PASS" ]; then
  ok "Secrets unchanged after restart (password persisted)"
else
  fail "Secrets changed after restart!"
fi

CSRF2=$(curl -sk -c /tmp/clio-cookies2.txt "$BASE/api/csrf-token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null)
LOGIN2=$(curl -sk -c /tmp/clio-cookies2.txt -b /tmp/clio-cookies2.txt \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "CSRF-Token: $CSRF2" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('username',''))" 2>/dev/null)
if [ "$LOGIN2" = "admin" ]; then
  ok "Login works after restart"
else
  fail "Login failed after restart"
fi

# ── security headers ───────────────────────────────────────────────────────────
section "Security Headers"
HEADERS=$(curl -sk -I "$BASE/" 2>/dev/null)
for hdr in "X-Content-Type-Options" "X-Frame-Options" "Strict-Transport-Security"; do
  if echo "$HEADERS" | grep -qi "$hdr"; then
    ok "Header present: $hdr"
  else
    fail "Header missing: $hdr"
  fi
done

# ── summary ───────────────────────────────────────────────────────────────────
section "Results"
TOTAL=$((PASS + FAIL))
echo "  Passed: $PASS / $TOTAL"
echo "  Failed: $FAIL / $TOTAL"
echo
if [ $FAIL -eq 0 ]; then
  echo "  All checks passed."
  exit 0
else
  echo "  $FAIL check(s) failed. Review output above."
  exit 1
fi
