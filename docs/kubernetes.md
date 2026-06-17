# Kubernetes Deployment Guide

This guide covers deploying Clio to Kubernetes using the Helm chart in `k8s/`.

---

## Architecture

```
Internet
    │  HTTPS (TLS terminated here)
    ▼
┌─────────────────────────────────────────────────┐
│  Ingress (nginx / traefik / ALB / GCE …)        │
│  cert-manager issues and renews TLS cert        │
└─────────────────────────────────────────────────┘
    │  HTTP (plain, internal cluster network)
    ▼
┌────────────────────┐
│  clio-frontend     │  nginx — serves React SPA, proxies API calls
│  (port 80)         │
└────────────────────┘
    │  HTTP
    ▼
┌────────────────────┐     ┌──────────────────────┐
│  clio-backend      │────▶│  clio-postgres:5432   │
│  (port 3001)       │     │  (StatefulSet + PVC)  │
└────────────────────┘     └──────────────────────┘
    │                      ┌──────────────────────┐
    └─────────────────────▶│  clio-redis:6379      │
                           │  (StatefulSet + PVC)  │
                           └──────────────────────┘
```

---

## Why HTTP inside the cluster?

**TLS is terminated at the Ingress — internal services communicate over plain HTTP.
This is the standard, universally-adopted Kubernetes pattern and is not a security
shortcut.**

Here is why:

- **The cluster network is isolated.** Pod-to-pod traffic stays inside the cluster's
  internal network namespace. It never traverses the public internet.
- **The Ingress encrypts everything visible to users.** All browser traffic is HTTPS.
  The HTTPS handshake happens at the Ingress controller before traffic enters the
  cluster.
- **Cert management per-pod is operationally expensive.** Every pod that needs TLS
  requires a cert, a key, a mount, and a rotation process. The Ingress centralises
  this to one cert (automatically renewed by cert-manager).
- **This is how GKE, EKS, AKS, OpenShift, and every major managed K8s platform
  expects you to work.**

### When you *would* want mTLS between pods

If your threat model requires zero-trust networking inside the cluster (e.g. multi-tenant
clusters, strict compliance requirements like PCI-DSS Level 1), add a **service mesh**:

| Mesh       | How to enable mTLS                                      |
|------------|---------------------------------------------------------|
| Istio      | `PeerAuthentication` policy in the `clio` namespace     |
| Linkerd    | Automatic with the `linkerd.io/inject: enabled` annotation |
| Cilium     | `CiliumNetworkPolicy` with `encryption: wireguard`      |

The service mesh handles cert issuance and rotation transparently — you do not
need to change the application code. Clio's `BACKEND_HTTP=true` mode works correctly
behind a mesh sidecar.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Kubernetes ≥ 1.24 | Any distribution: GKE, EKS, AKS, k3s, RKE2, Rancher, etc. |
| Helm 3.x | `helm version` to confirm |
| cert-manager | Recommended for automatic TLS. [Install guide](https://cert-manager.io/docs/installation/). Skip if you manage certs manually. |
| Ingress controller | nginx-ingress is assumed. Change `ingress.className` for other controllers. |
| A `ReadWriteOnce` storage class | For postgres, redis, and evidence file PVCs |
| A DNS record pointing to your Ingress | Required for Let's Encrypt validation |

---

## Quick Start

### 1. Create the namespace

```bash
kubectl create namespace clio
```

### 2. Create a values file for your deployment

Copy `k8s/values.yaml` to a file that you **do not commit to git** (e.g. `my-clio-values.yaml`)
and fill in the required fields:

```yaml
ingress:
  host: clio.yourcompany.com   # the DNS name users will visit
  tls:
    certManagerIssuer: letsencrypt-prod   # or your ClusterIssuer name

secrets:
  postgresPassword:    "$(openssl rand -hex 24)"
  redisPassword:       "$(openssl rand -hex 24)"
  jwtSecret:           "$(openssl rand -hex 32)"
  csrfSecret:          "$(openssl rand -hex 32)"
  sessionSecret:       "$(openssl rand -hex 32)"
  redisEncryptionKey:  "$(openssl rand -hex 32)"
```

> **Tip:** Generate all secrets at once:
> ```bash
> for s in postgresPassword redisPassword jwtSecret csrfSecret sessionSecret redisEncryptionKey; do
>   echo "$s: $(openssl rand -hex 32)"; done
> ```

### 3. Install

```bash
helm install clio ./k8s \
  --namespace clio \
  --values my-clio-values.yaml
```

### 4. Verify

```bash
kubectl get pods -n clio          # all should reach Running
kubectl get ingress -n clio       # check ADDRESS is populated
kubectl get certificate -n clio   # TLS cert should reach Ready=True
```

### 5. Get the initial admin password

On the very first boot the backend creates an admin account and prints the
password to its logs:

```bash
kubectl logs -n clio \
  -l app.kubernetes.io/component=backend \
  --tail=80 | grep -iE "admin|password|credential"
```

---

## TLS Options

### Option 1 — cert-manager with Let's Encrypt (recommended for public deployments)

Requires cert-manager and a public DNS record.

```bash
# Install cert-manager (if not already present)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Create a ClusterIssuer for Let's Encrypt production
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your@email.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

In `values.yaml`:
```yaml
ingress:
  tls:
    enabled: true
    certManagerIssuer: letsencrypt-prod
    secretName: clio-tls
```

### Option 2 — Manual TLS certificate

Use when you already have a cert (corporate CA, wildcard cert, self-signed, etc.).

```bash
# Create the TLS Secret from your cert files
kubectl create secret tls clio-tls \
  --namespace clio \
  --cert=path/to/server.crt \
  --key=path/to/server.key
```

In `values.yaml`:
```yaml
ingress:
  tls:
    enabled: true
    certManagerIssuer: ""      # leave blank — you created the Secret manually
    secretName: clio-tls
```

### Option 3 — No TLS (internal / air-gapped / dev)

```yaml
ingress:
  tls:
    enabled: false
```

> Note: browsers will show a security warning on HTTP. Cookie security flags are
> relaxed automatically when the backend detects non-HTTPS origins. Not recommended
> for production.

---

## Authentication Options

Clio supports local accounts plus optional SSO. Multiple providers can be active
simultaneously — the login page shows a button for each configured method.

### Local accounts (always available)

No additional configuration needed. The initial admin account is created on first boot.
Additional users and operations are managed in the Clio admin UI.

---

### Generic OIDC (Keycloak, Okta, Azure AD, Auth0, Authentik, Zitadel, Dex …)

Any OIDC-compliant provider works. The setup is identical for all of them:

#### Step 1 — Register the client in your provider

| Field | Value |
|-------|-------|
| Client type | Confidential (server-side) |
| Redirect / Callback URI | `https://<ingress.host>/api/auth/oidc/callback` |
| Scopes | `openid`, `email`, `profile` (add `groups` if you want group-based roles) |

#### Step 2 — Add to your values file

```yaml
oidc:
  enabled: true
  issuerUrl: "https://keycloak.example.com/realms/my-realm"
  clientId:  "clio-app"
  providerName: "Keycloak"     # shown on the login button

secrets:
  oidcClientSecret: "paste-client-secret-here"
```

#### Optional — group-based role assignment

If your provider includes a `groups` claim in the ID token, Clio can map groups
to admin / user roles:

```yaml
oidc:
  adminGroup: "clio-admin"   # users in this group get admin rights
  userGroup:  "clio-user"    # users in this group get standard access
  # Users in neither group are denied login
```

> **Provider-specific notes for the groups claim:**
>
> | Provider | How to add groups claim |
> |----------|------------------------|
> | Keycloak | Add "groups" mapper to the client scope |
> | Okta | Add "groups" claim to the ID token in the Authorization Server |
> | Azure AD | Set `groupMembershipClaims: "SecurityGroup"` in the app manifest |
> | Auth0 | Add a custom action/rule that sets `event.idToken["groups"]` |
> | Authentik | Property mapping on the provider |

#### Provider-specific issuer URLs

| Provider | `oidc.issuerUrl` |
|----------|-----------------|
| Keycloak | `https://keycloak.example.com/realms/<realm-name>` |
| Okta | `https://<tenant>.okta.com` |
| Azure AD (v2) | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Auth0 | `https://<tenant>.auth0.com` |
| Google Workspace (via OIDC) | `https://accounts.google.com` |
| Authentik | `https://authentik.example.com/application/o/<slug>/` |
| Zitadel | `https://your-instance.zitadel.cloud` |
| Dex | `https://dex.example.com` |

#### Troubleshooting ID token algorithm mismatches

Some providers (certain Azure AD tenants, older Okta configs) advertise multiple
signing algorithms in their discovery document. If login fails with an algorithm error:

```bash
# Check the provider's discovery document for supported algorithms
curl -s https://YOUR-ISSUER/.well-known/openid-configuration | jq '.id_token_signing_alg_values_supported'
```

Then pin the algorithm:
```yaml
oidc:
  idTokenAlg: "RS256"
```

---

### Google OAuth (Google Workspace / personal Google accounts)

Use this for direct Google OAuth integration — simpler than going through OIDC
if your team already uses Google accounts.

#### Step 1 — Create credentials in Google Cloud Console

1. Go to **APIs & Services → Credentials → Create credentials → OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Authorised redirect URI: `https://<ingress.host>/api/auth/google/callback`
4. Copy the **Client ID** and **Client Secret**

#### Step 2 — Add to your values file

```yaml
googleSso:
  enabled: true
  clientId: "123456789-abc.apps.googleusercontent.com"

secrets:
  googleClientSecret: "paste-client-secret-here"
```

> The callback URL is auto-derived as `https://<ingress.host>/api/auth/google/callback`.
> If your external URL differs from `ingress.host`, set it explicitly:
> ```yaml
> googleSso:
>   callbackUrl: "https://custom-url.example.com/api/auth/google/callback"
> ```

---

### Combining multiple providers

All three methods (local, OIDC, Google) can be active at the same time:

```yaml
oidc:
  enabled: true
  issuerUrl: "https://keycloak.example.com/realms/ops"
  clientId:  "clio"
  providerName: "Keycloak"

googleSso:
  enabled: true
  clientId: "123.apps.googleusercontent.com"

secrets:
  oidcClientSecret:   "..."
  googleClientSecret: "..."
```

The login page will show buttons for each active provider as well as the
local username/password form.

---

## Upgrading

### Standard upgrade (new config values)

```bash
helm upgrade clio ./k8s \
  --namespace clio \
  --values my-clio-values.yaml
```

### Pinning image versions (recommended for production)

```bash
helm upgrade clio ./k8s \
  --namespace clio \
  --values my-clio-values.yaml \
  --set backend.image.tag=v1.2.3 \
  --set frontend.image.tag=v1.2.3
```

Available image tags are listed on the
[GitHub Container Registry](https://github.com/seahop/Clio/pkgs/container/clio-backend).

### Rolling back

```bash
helm rollback clio --namespace clio          # rollback to previous release
helm rollback clio 3 --namespace clio        # rollback to revision 3
helm history clio --namespace clio           # list all revisions
```

---

## Rotating secrets

Secrets are stored in the `clio-secrets` K8s Secret. To rotate a value:

```bash
# 1. Patch the secret
kubectl patch secret -n clio clio-secrets \
  --type=merge \
  -p '{"stringData":{"REDIS_PASSWORD":"new-strong-password"}}'

# 2. Restart the backend to pick up the new value
kubectl rollout restart deployment -n clio clio-backend
```

> For JWT rotation: rotating `JWT_SECRET` invalidates all active sessions.
> Users will be logged out and need to sign in again.

---

## External secrets management

For production clusters, avoid storing secrets in values files. Integrate with an
external secrets manager instead:

**External Secrets Operator** (works with AWS Secrets Manager, GCP Secret Manager,
HashiCorp Vault, Azure Key Vault):

```yaml
# Instead of the Helm-managed Secret, create an ExternalSecret
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: clio-secrets
  namespace: clio
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: my-vault-store
    kind: ClusterSecretStore
  target:
    name: clio-secrets
  data:
    - secretKey: POSTGRES_PASSWORD
      remoteRef:
        key: clio/postgres
        property: password
    # ... repeat for each secret key
```

Then install Helm with secrets disabled (the ExternalSecret creates the K8s Secret):
```bash
helm install clio ./k8s --values my-values.yaml
# The ExternalSecret will create clio-secrets independently
```

---

## Storage

Three PersistentVolumeClaims are created:

| PVC | Purpose | Default size |
|-----|---------|-------------|
| `data-clio-postgres-0` | PostgreSQL data | 20 Gi |
| `data-clio-redis-0` | Redis AOF persistence | 2 Gi |
| `clio-evidence` | Evidence file uploads | 10 Gi |

### Changing storage class

```yaml
postgres:
  storage:
    storageClass: "gp3"   # AWS EBS

redis:
  storage:
    storageClass: "premium-rwo"   # Azure Disk

backend:
  evidenceStorage:
    storageClass: "standard"
```

### Backup

**PostgreSQL:**
```bash
kubectl exec -n clio \
  $(kubectl get pod -n clio -l app.kubernetes.io/component=postgres -o name | head -1) \
  -- pg_dump -U clio redteamlogger | gzip > clio-backup-$(date +%Y%m%d).sql.gz
```

**Redis:**
```bash
kubectl exec -n clio \
  $(kubectl get pod -n clio -l app.kubernetes.io/component=redis -o name | head -1) \
  -- redis-cli -a "$REDIS_PASSWORD" SAVE
# Then copy /data/dump.rdb from the pod
```

---

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod -n clio <pod-name>   # events section shows the cause
kubectl logs -n clio <pod-name>           # application logs
```

### Backend fails to connect to postgres / redis

The backend waits for both services on startup (30 retries, 1 s apart). Check:

```bash
# Is postgres ready?
kubectl get pod -n clio -l app.kubernetes.io/component=postgres

# Can the backend reach postgres?
kubectl exec -n clio deploy/clio-backend -- \
  env | grep POSTGRES_HOST
# Should print: POSTGRES_HOST=clio-postgres
```

### TLS certificate not issuing

```bash
kubectl describe certificate -n clio clio-tls
kubectl describe certificaterequest -n clio
kubectl logs -n cert-manager deploy/cert-manager | tail -50
```

Common causes: DNS not pointing to the cluster, HTTP-01 challenge port 80 blocked,
wrong ClusterIssuer name.

### OIDC login failing

1. Verify the callback URL registered with your provider **exactly** matches:
   `https://<ingress.host>/api/auth/oidc/callback`

2. Check backend logs during a login attempt:
   ```bash
   kubectl logs -n clio -l app.kubernetes.io/component=backend -f
   # Then attempt a login in the browser
   ```

3. If you see an algorithm error, pin `oidc.idTokenAlg` (see the OIDC section above).

4. Verify the OIDC issuer URL is reachable from inside the cluster:
   ```bash
   kubectl exec -n clio deploy/clio-backend -- \
     wget -qO- https://YOUR-ISSUER/.well-known/openid-configuration | head -5
   ```

### Session cookies not persisting (CSRF errors)

Ensure `ingress.host` and `config.frontendUrl` resolve to the same origin that
users are actually hitting in their browser. A mismatch causes CSRF token
validation to fail.

### Evidence file uploads fail

The evidence PVC uses `ReadWriteOnce` access mode, meaning only one pod can mount
it at a time. If you scale `backend.replicas > 1`, you need a `ReadWriteMany`
storage class (e.g. NFS, EFS, Azure Files, GCS Fuse) and to update the PVC
access mode in `k8s/templates/pvc.yaml`.
