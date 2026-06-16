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

## Troubleshooting

**"SSO authentication failed" on the login page**
- Check container logs: `docker logs clio`
- Verify the callback URL registered in your provider exactly matches what Clio uses.
- Ensure your server's clock is synchronized — OIDC token validation is time-sensitive.

**Login button does not appear**
- The button only shows when the provider is fully configured. Check that all three required variables are set (`ISSUER_URL`, `CLIENT_ID`, `CLIENT_SECRET` for OIDC or `CLIENT_ID` + `CLIENT_SECRET` for Google).
- For the omnibus build, verify the env vars were passed correctly: `docker inspect clio | grep -A20 Env`.

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
- Usernames are derived from the `preferred_username` claim (OIDC) or the email prefix (Google/OIDC fallback). The claim must be present in the ID token. Add the relevant mapper/claim in your provider's client configuration.
