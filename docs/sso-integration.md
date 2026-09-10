# SSO Integration Guide

Clio supports two SSO methods. Both are optional and can coexist — password login always works regardless.

| Method | Use when |
|---|---|
| **Google OAuth** | Your team uses Google Workspace / Gmail |
| **Generic OIDC** | You have an identity provider: Keycloak, Okta, Auth0, Azure AD, Ping, etc. |

## Table of Contents

- [How SSO works in Clio](#how-sso-works-in-clio)
- [Google OAuth Setup](#google-oauth-setup)
  - [Omnibus (single container)](#google--omnibus)
  - [HA docker compose](#google--ha-docker-compose)
- [Generic OIDC Setup](#generic-oidc-setup)
  - [Omnibus (single container)](#oidc--omnibus)
  - [HA docker compose](#oidc--ha-docker-compose)
  - [Provider-specific notes](#provider-specific-notes)
- [Troubleshooting](#troubleshooting)

---

## How SSO works in Clio

1. User clicks the SSO button on the login page (only shown when the provider is configured).
2. Browser is redirected to the provider's login page.
3. After successful authentication, the provider redirects back to Clio's callback URL.
4. Clio validates the response, creates the user account on first login (regular permissions — never admin), and issues a session cookie.
5. SSO users are never prompted to change their password.

User accounts are keyed to the provider's unique subject identifier (`sub` for OIDC, Google ID for Google). A username is derived from the email address. If that username already exists, a numeric suffix is added (`johndoe`, `johndoe1`, etc.).

---

## Google OAuth Setup

### Register your app with Google

1. Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (anyone with a Google account) or **Internal** (Google Workspace org only).
3. Fill in app name and contact email; add `email` and `profile` scopes.
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID** → **Web application**.
5. Under **Authorized redirect URIs**, add:
   ```
   https://<your-hostname>/api/auth/google/callback
   ```
6. Copy the **Client ID** and **Client Secret**.

### Google — Omnibus

Pass the credentials as environment variables:

**`docker run`:**
```bash
docker run -d --name clio \
  -p 443:443 -p 80:80 \
  -e EXTERNAL_HOSTNAME=your-server-ip \
  -e GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com \
  -e GOOGLE_CLIENT_SECRET=your-client-secret \
  -v clio-data:/data \
  ghcr.io/seahop/clio:latest
```

**`docker-compose.omnibus.yml`** — uncomment and fill in:
```yaml
environment:
  EXTERNAL_HOSTNAME: "your-server-ip"
  GOOGLE_CLIENT_ID: "your-client-id.apps.googleusercontent.com"
  GOOGLE_CLIENT_SECRET: "your-client-secret"
```

The callback URL defaults to `https://<EXTERNAL_HOSTNAME>/api/auth/google/callback`. If you need a different URL (e.g., for ngrok):
```yaml
GOOGLE_CALLBACK_URL: "https://your-ngrok-subdomain.ngrok-free.app/api/auth/google/callback"
```

### Google — HA docker compose

```bash
# Run the setup script with Google credentials
sudo python3 generate-env.py https://yourdomain.com \
  --google-client-id=YOUR_CLIENT_ID \
  --google-client-secret=YOUR_CLIENT_SECRET

# Or with Let's Encrypt
sudo python3 generate-env.py https://yourdomain.com \
  --letsencrypt --domain=yourdomain.com \
  --email=your@email.com \
  --google-client-id=YOUR_CLIENT_ID \
  --google-client-secret=YOUR_CLIENT_SECRET

docker compose build && docker compose up -d
```

---

## Generic OIDC Setup

Works with any provider that implements [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html). Clio uses auto-discovery (`/.well-known/openid-configuration`) — you only need the issuer URL, client ID, and client secret.

### Register Clio as a client in your provider

The exact steps vary by provider, but you will always need to:

1. Create a new **confidential** client (client secret required) with the **Authorization Code** grant type.
2. Add the following as an allowed redirect / callback URI:
   ```
   https://<your-hostname>/api/auth/oidc/callback
   ```
3. Note the **Client ID**, **Client Secret**, and **Issuer URL**.

Clio uses the authorization-code flow with **PKCE (S256)** on every login, so it works with providers that enforce PKCE (Keycloak "enforced PKCE mode", Okta, Auth0, Azure AD, Authentik, Authelia, etc.). No extra configuration is needed; providers that don't require PKCE simply ignore the challenge. The client must still be registered as a *confidential* client (client secret), since Clio also authenticates the token request with `OIDC_CLIENT_SECRET`.

The issuer URL is the base URL of your provider's OIDC metadata endpoint. Examples:

| Provider | Issuer URL format |
|---|---|
| Keycloak | `https://keycloak.example.com/realms/<realm>` |
| Okta | `https://<tenant>.okta.com` or `https://<tenant>.okta.com/oauth2/<authServerId>` |
| Auth0 | `https://<tenant>.auth0.com/` |
| Azure AD | `https://login.microsoftonline.com/<tenantId>/v2.0` |
| Google (via OIDC) | `https://accounts.google.com` |

### OIDC — Omnibus

**`docker run`:**
```bash
docker run -d --name clio \
  -p 443:443 -p 80:80 \
  -e EXTERNAL_HOSTNAME=your-server-ip \
  -e OIDC_ISSUER_URL=https://keycloak.example.com/realms/myrealm \
  -e OIDC_CLIENT_ID=clio \
  -e OIDC_CLIENT_SECRET=your-client-secret \
  -e OIDC_PROVIDER_NAME=Keycloak \
  -v clio-data:/data \
  ghcr.io/seahop/clio:latest
```

**`docker-compose.omnibus.yml`** — uncomment and fill in:
```yaml
environment:
  EXTERNAL_HOSTNAME: "your-server-ip"
  OIDC_ISSUER_URL: "https://keycloak.example.com/realms/myrealm"
  OIDC_CLIENT_ID: "clio"
  OIDC_CLIENT_SECRET: "your-client-secret"
  OIDC_PROVIDER_NAME: "Keycloak"
```

`OIDC_CALLBACK_URL` defaults to `https://<EXTERNAL_HOSTNAME>/api/auth/oidc/callback`. Override it if your deployment URL differs from `EXTERNAL_HOSTNAME`.

#### All OIDC environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_ISSUER_URL` | Yes | — | Provider's issuer URL (used for auto-discovery) |
| `OIDC_CLIENT_ID` | Yes | — | Client ID registered with your provider |
| `OIDC_CLIENT_SECRET` | Yes | — | Client secret from your provider |
| `OIDC_CALLBACK_URL` | No | `https://<EXTERNAL_HOSTNAME>[:<EXTERNAL_PORT>]/api/auth/oidc/callback` | Must match exactly what you registered in the provider |
| `OIDC_PROVIDER_NAME` | No | `SSO` | Label shown on the login button |
| `OIDC_SCOPE` | No | `openid email profile` | Scopes to request; adjust if your provider uses non-standard scope names |
| `OIDC_ID_TOKEN_ALG` | No | auto-detected | ID-token signing algorithm (e.g. `ES256`, `RS256`). Auto-detection reads the provider's discovery document and JWKS; set this only when login fails with an algorithm mismatch (see Troubleshooting) |
| `OIDC_USERNAME_CLAIM` | No | `preferred_username` | Claim whose value becomes the Clio username when an SSO account is first created. Looked up in the UserInfo response, then the ID token; if absent, falls back to `preferred_username` and then the email local part. Examples: `upn`, `sAMAccountName`, `email`. Only affects new accounts — existing accounts are matched by `sub` |
| `OIDC_ADMIN_GROUP` | No | `clio-admin` | Group name in the `groups` claim that grants the admin role. Admin takes precedence if a user is in both groups |
| `OIDC_USER_GROUP` | No | `clio-user` | Group name in the `groups` claim that grants the regular user role. Users in neither group, or with no `groups` claim at all, are denied login |

### OIDC — HA docker compose

After running `generate-env.py`, add the OIDC variables to `backend/.env`:

```env
OIDC_ISSUER_URL=https://keycloak.example.com/realms/myrealm
OIDC_CLIENT_ID=clio
OIDC_CLIENT_SECRET=your-client-secret
OIDC_CALLBACK_URL=https://yourdomain.com/api/auth/oidc/callback
OIDC_PROVIDER_NAME=Keycloak
```

Then rebuild and restart:
```bash
docker compose build backend && docker compose up -d backend
```

### Provider-specific notes

**Keycloak:**
- Create a client with **Client authentication** enabled (confidential).
- Set **Valid redirect URIs** to `https://<your-hostname>/api/auth/oidc/callback`.
- Issuer URL: `https://<keycloak-host>/realms/<realm-name>`.
- Make sure the `email` mapper is enabled in the client scope.

**Okta:**
- Create an **OIDC Web Application** in the Okta developer console.
- Add `https://<your-hostname>/api/auth/oidc/callback` to **Sign-in redirect URIs**.
- If using a custom auth server, use `https://<tenant>.okta.com/oauth2/<authServerId>` as the issuer.

**Azure AD (Entra ID):**
- Register an application, add a **Web** redirect URI.
- Issuer: `https://login.microsoftonline.com/<tenantId>/v2.0`.
- Grant `openid`, `email`, `profile` delegated permissions.
- Azure does not include `email` in the ID token by default for personal accounts — add the **email** optional claim in the token configuration.

**Auth0:**
- Create a **Regular Web Application**.
- Add `https://<your-hostname>/api/auth/oidc/callback` to **Allowed Callback URLs**.
- Issuer: `https://<your-tenant>.auth0.com/`.

---

## Migrating to a new identity provider

Clio matches SSO users by the provider's subject identifier (`sub`). Moving to a
new IdP — or rebuilding the old one — gives every user a new `sub`, so on their
next login Clio sees an unknown subject, tries to create a fresh account under
the same `preferred_username`, finds it taken, and creates `<name>1` instead.
The original account, with its role, active operation, operation assignments
and the analyst name on existing logs, is left orphaned.

`backend/tools/relink-oidc-sub.js` repairs this in place. It only touches Redis.

```bash
# Omnibus — run inside the container. Compose: docker compose exec backend node tools/relink-oidc-sub.js ...
docker exec -w /app/backend clio node tools/relink-oidc-sub.js --list
```

`--list` shows every OIDC account with its `sub` and email, and flags `<name>N`
accounts that share an email with `<name>` as duplicates.

**Option A — after users have logged in once.** Each affected user now has a
`<name>N` duplicate holding their new `sub`. Merge them back:

```bash
docker exec -w /app/backend clio node tools/relink-oidc-sub.js --auto --dry-run   # preview
docker exec -w /app/backend clio node tools/relink-oidc-sub.js --auto             # apply
```

For each duplicate this points the new `sub` at the original account, drops the
stale `sub`, and deletes the duplicate's keys. Accounts whose names merely end
in a digit but belong to a different person (different email) are left alone.

**Option B — before anyone logs in.** If you can read the new subjects from the
IdP (e.g. `kanidm person list`, or the `sub` shown by an OIDC debugger), rebind
directly:

```bash
docker exec -w /app/backend clio node tools/relink-oidc-sub.js \
  --map seanh=92f9be91-da86-44d6-9e65-2131284018f3 \
  --map brandon=87583c47-2e78-4ce2-8407-9900603e09ca --dry-run
```

or put one `<name>=<sub>` per line in a file and pass `--file map.txt`. Both
options can be combined and re-run safely; already-bound accounts are skipped.

**Option C — rename an account.** Accounts created while the IdP still sent
the full `user@domain` form in `preferred_username` end up as
`brandon_idm_example_com`. Rename them once the IdP sends the short name:

```bash
docker exec -w /app/backend clio node tools/relink-oidc-sub.js \
  --rename brandon_idm_example_com=brandon --dry-run
```

This moves the account's Redis keys, rebinds its `sub`, rewrites every
username-bearing PostgreSQL column (log analyst and lock holder, operation
assignments, tag/operation/API-key/template creators, evidence uploader, file
status) in one transaction, and revokes the user's sessions. Target usernames
recorded *inside* log entries are not touched. It refuses a new name that is
already taken or contains characters outside `[A-Za-z0-9_-]`.

**Option D — merge two accounts belonging to the same person.** If a user
already has *both* an original account (say `brandon`, from the old IdP, with
older data) and a second one created later (`brandon_idm_example_com`, holding
the sub the IdP uses now, with recent data), `--rename` refuses because the
target exists. Fold them together instead:

```bash
docker exec -w /app/backend clio node tools/relink-oidc-sub.js \
  --merge brandon_idm_example_com=brandon --dry-run
```

`<into>` keeps its name, role and preferences and adopts `<from>`'s sub;
`<from>`'s PostgreSQL rows are rewritten to `<into>` (operation assignments are
unioned) and its Redis keys removed. Both accounts' sessions are revoked. The
two accounts must have the same email — the tool refuses to merge different
people.

Affected users should sign out and back in afterwards — an existing session keeps
the old username until it does (rename and merge revoke the sessions for you).

## Troubleshooting

**"SSO authentication failed" on the login page**
- Check container logs: `docker logs clio`
- Verify the callback URL registered in your provider exactly matches what Clio uses.
- Ensure your server's clock is synchronized — OIDC token validation is time-sensitive.

**Login button does not appear**
- The button only shows when the provider is fully configured. Check that all three required variables are set (`ISSUER_URL`, `CLIENT_ID`, `CLIENT_SECRET` for OIDC or `CLIENT_ID` + `CLIENT_SECRET` for Google).
- For the omnibus build, verify the env vars were passed correctly: `docker inspect clio | grep -A20 Env`.

**Provider logs "No PKCE code challenge was provided" / `invalid_request`**
- Earlier Clio releases did not send a PKCE challenge. Upgrade; the current release always sends `code_challenge` + `code_challenge_method=S256` on the authorize request.

**"OIDC client initialisation failed" in logs**
- Clio fetches `<OIDC_ISSUER_URL>/.well-known/openid-configuration` at startup. The container must be able to reach your provider over the network.
- Check that the issuer URL is correct (no trailing slash issues) by curling it from the container:
  ```bash
  docker exec clio curl -k <OIDC_ISSUER_URL>/.well-known/openid-configuration
  ```

**"redirect_uri_mismatch" from the provider**
- The `OIDC_CALLBACK_URL` (or `GOOGLE_CALLBACK_URL`) must exactly match the redirect URI registered in the provider — including scheme, hostname, port, and path.
- If you run the omnibus container on a non-standard port (e.g. `-p 8443:443`), set `EXTERNAL_PORT=8443` so the default callback URL includes the port.

**"unexpected JWT alg received" in logs (login fails after the provider redirects back)**
- Your provider signs ID tokens with a different algorithm than Clio expects. Clio auto-detects the algorithm from the provider's discovery document and JWKS, but some providers publish keys for several algorithms at once, making detection ambiguous.
- The container log prints the exact fix, e.g.:
  ```
  OIDC callback error: RPError: unexpected JWT alg received, expected RS256, got: ES256
  Hint: the provider signs ID tokens with ES256. Set OIDC_ID_TOKEN_ALG=ES256 and restart to fix this.
  ```
- Set `OIDC_ID_TOKEN_ALG` to the algorithm named in the hint and restart the container. The startup log confirms what is in effect: `OIDC client initialised (issuer: ..., alg: ES256 via OIDC_ID_TOKEN_ALG)`.

**Provider uses a certificate from an internal CA**
- Clio must be able to verify your provider's TLS certificate when fetching the discovery document, JWKS, and tokens. Mount your CA bundle and set `NODE_EXTRA_CA_CERTS` (omnibus):
  ```bash
  -v /path/to/internal-ca.pem:/run/secrets/internal-ca.pem:ro \
  -e NODE_EXTRA_CA_CERTS=/run/secrets/internal-ca.pem
  ```
- Setting this also enables strict outbound TLS verification; without it, outbound verification is disabled and self-signed provider certificates are accepted as-is.

**SSO user cannot create log rows ("You are not assigned to an operation")**
- This is by design: SSO accounts are created with regular (non-admin) permissions and no operation membership. An admin must assign the user to an operation (Operations panel) before they can create logs. Note that SSO usernames may carry a numeric suffix (`johndoe1`) when the base name was already taken — assign the operation to the exact username shown in the user's session.

**Google: "Error: invalid_client"**
- Verify Client ID and Secret are correct and the OAuth consent screen is fully configured.

**Users created with wrong username**
- By default usernames are derived from the `preferred_username` claim (OIDC) or the email prefix (Google/OIDC fallback). For OIDC, set `OIDC_USERNAME_CLAIM` to use a different claim (e.g. `upn`, `sAMAccountName`); it is read from UserInfo first, then the ID token, so add the relevant mapper/claim in your provider's client configuration. Usernames are sanitised to `[A-Za-z0-9_-]` (other characters become `_`), and the claim is only consulted when the account is first created — an existing account keeps its username.
