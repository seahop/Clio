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

| Mesh       | How to enable                                           |
|------------|---------------------------------------------------------|
| Linkerd    | Set `linkerd.enabled: true` in values (see [Cloud provider deployment](#cloud-provider-deployment-gke--eks--aks)) |
| Istio      | `PeerAuthentication` policy in the `clio` namespace     |
| Cilium     | `CiliumNetworkPolicy` with `encryption: wireguard`      |

The service mesh handles cert issuance and rotation transparently — no
application code changes needed. **NetworkPolicy alone is sufficient for most
deployments** and is already included in the chart.

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

The **only required field** is `ingress.host` — every secret and password is
auto-generated on first install and preserved across upgrades.  Create a file
you **do not commit to git** (e.g. `my-clio-values.yaml`):

```yaml
ingress:
  host: clio.yourcompany.com          # DNS name users will visit — also drives FRONTEND_URL
  tls:
    certManagerIssuer: letsencrypt-prod   # or your ClusterIssuer name
```

That's it for a basic deployment. See the sections below for optional extras
(SSO, storage class overrides, NetworkPolicy, etc.).

> **How `FRONTEND_URL` is derived:** The chart automatically sets
> `FRONTEND_URL=https://<ingress.host>` in the backend config. You only need to
> set `config.frontendUrl` explicitly if your external URL differs from the
> ingress hostname — for example if a CDN in front uses a different domain.

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

All secrets (including the admin password) are auto-generated on first install
and stored in the `clio-secrets` Kubernetes Secret:

```bash
kubectl get secret clio-secrets -n clio \
  -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d && echo
```

> Secrets are preserved across `helm upgrade` — rotating them requires either
> deleting the Secret (rotates everything) or patching individual keys (see
> [Rotating secrets](#rotating-secrets)).

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

## Database migrations

### How it works

Clio uses a file-based migration system with a `schema_migrations` table that
tracks exactly which migrations have been applied:

```
backend/db/migrations/
  001-initial-schema.sql          ← tables, indexes, triggers, seed data
  002-relation-tables.sql         ← relation analysis tables
  003-add-operation-to-api-keys.sql
  004-your-next-change.sql        ← you add new files here
```

**Every time the backend starts** it calls the migration runner before serving
traffic.  The runner reads every `.sql` file in order, skips files already
recorded in `schema_migrations`, and applies the rest — each in its own
transaction so a failure rolls back cleanly and the backend refuses to start
rather than serving requests against a broken schema.

**On `helm upgrade`**, the Helm chart runs a Kubernetes Job with the hook
annotation `helm.sh/hook: pre-upgrade`.  That Job runs the migration runner
from the new image *before* any new pods are deployed.  The sequence is:

```
helm upgrade
  │
  ├─ 1. Helm runs clio-migrate Job (pre-upgrade hook)
  │      └─ node db/migrate.js → applies any new .sql files
  │         ✓ success → continues
  │         ✗ failure → upgrade aborted; old pods keep running
  │
  └─ 2. Helm rolls out new Deployment pods (new image tag)
         └─ migration runner runs again at startup (idempotent — nothing to do)
```

This means old pods are still serving traffic while the migration runs.
**Write migrations that are backwards-compatible with the running version of
the code** — see the additive-changes guideline below.

### Writing a new migration

Create the next numbered file in `backend/db/migrations/`:

```sql
-- 004-add-target-url-to-logs.sql
ALTER TABLE logs ADD COLUMN IF NOT EXISTS target_url TEXT;
CREATE INDEX IF NOT EXISTS idx_logs_target_url ON logs(target_url);
```

Rules:
- **Always use `IF NOT EXISTS` / `OR REPLACE`.**  The runner skips applied
  migrations but if something goes wrong and a migration is re-run against a
  database that already has the change, it must not crash.
- **One concern per file.**  Don't bundle unrelated changes.
- **Pad the number to three digits** (`004-`, not `4-`), so lexicographic
  sort matches logical order for filenames up to 999.
- **Never edit an applied migration.**  If you need to fix something, write a
  new migration that corrects it.

### Full-stack change walkthrough

Suppose you need to add a `target_url` field to log entries.

**1. Write the migration**

```sql
-- backend/db/migrations/004-add-target-url-to-logs.sql
ALTER TABLE logs ADD COLUMN IF NOT EXISTS target_url TEXT;
```

**2. Update the backend model**

In [backend/db/models/logs.js](../backend/db/models/logs.js) (and any route
that inserts/selects logs), add `target_url` to the field list.

**3. Update the frontend**

Add the field to the relevant component (e.g. [LogCard](../frontend/src/components/LogCard/)).

**4. Test locally with docker-compose**

```bash
docker compose build backend
docker compose up -d
# Migration runs automatically on backend startup:
docker compose logs backend | grep -E "Applying|up to date"
```

**5. Deploy to Kubernetes**

```bash
helm upgrade clio ./k8s \
  --namespace clio \
  --values my-clio-values.yaml \
  --set backend.image.tag=v1.3.0 \
  --set frontend.image.tag=v1.3.0
```

Watch the migration job and rollout:
```bash
kubectl get job -n clio clio-migrate -w          # wait for Completed
kubectl rollout status -n clio deploy/clio-backend
kubectl rollout status -n clio deploy/clio-frontend
```

### Backwards-compatible migrations (zero-downtime deploys)

During a rolling deploy there is a brief window where old and new pods run
simultaneously.  **Adding a column** is always safe — old code ignores it,
new code can use it.  Other changes need care:

| Change | Safe? | Pattern |
|--------|-------|---------|
| `ADD COLUMN` with `DEFAULT` | ✅ Yes | One migration, one deploy |
| `ADD COLUMN NOT NULL` (no default) | ⚠️ Careful | Add as `NULL` first, backfill, then add constraint |
| `DROP COLUMN` | ⚠️ Careful | Deploy code that ignores the column first, then drop it |
| `RENAME COLUMN` | ❌ No | Add the new column, migrate data, deprecate old, then drop |
| Add index `CONCURRENTLY` | ✅ Yes | Postgres builds it without locking the table |
| `ALTER COLUMN TYPE` (compatible cast) | ⚠️ Careful | Test row count / nullability impact first |

For a red-team ops tool with one writer at a time, these edge cases rarely
matter — but the pattern above is good to know.

### Checking migration status

```bash
# Which migrations have been applied?
kubectl exec -n clio \
  $(kubectl get pod -n clio -l app.kubernetes.io/component=postgres -o name | head -1) \
  -- psql -U clio redteamlogger \
     -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"

# Run migrations manually (useful for debugging)
kubectl run migrate-debug --rm -it \
  --image=ghcr.io/seahop/clio-backend:latest \
  --restart=Never \
  --namespace=clio \
  --env-from=secret/clio-secrets \
  --env-from=configmap/clio-config \
  -- node db/migrate.js
```

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

## NetworkPolicy

The chart ships a `NetworkPolicy` resource for each workload that restricts
pod-to-pod traffic to only the paths that are actually needed:

| Source | Destination | Port |
|--------|------------|------|
| Ingress controller (kube-system) | frontend | 80 |
| frontend | backend | 3001 |
| backend | postgres | 5432 |
| backend | redis | 6379 |

All other pod-to-pod traffic is denied by default.

### Enable / disable

```yaml
# values.yaml (or your override file)
networkPolicy:
  enabled: true    # default — recommended for production
```

### Requirements

NetworkPolicy enforcement requires a CNI plugin that supports it. Most managed
Kubernetes distributions ship one by default:

| Platform | CNI / Policy enforcement |
|----------|--------------------------|
| GKE | Calico (enable at cluster creation) or Dataplane V2 |
| EKS | VPC CNI + Network Policy controller (enable in add-ons) |
| AKS | Azure CNI or Calico (enable at cluster creation) |
| k3s / Rancher Desktop | flannel — policy enforcement built in since k3s 1.21 |
| Rancher RKE2 | Canal (flannel + Calico) — enabled by default |

If your CNI does not enforce NetworkPolicy, setting `networkPolicy.enabled: true`
is harmless — the resources are created but have no effect.

---

## Ingress controller

The chart defaults to `ingress.className: nginx`. Change this to match your
cluster's ingress controller:

| Controller | `ingress.className` value |
|------------|--------------------------|
| ingress-nginx | `nginx` |
| Traefik (k3s default) | `traefik` |
| AWS ALB | `alb` |
| GCE (GKE) | `gce` |
| Azure Application Gateway | `azure/application-gateway` |
| HAProxy | `haproxy` |

```yaml
ingress:
  className: traefik    # example for k3s / Rancher Desktop
```

---

## Local development (Rancher Desktop / k3s)

Rancher Desktop ships k3s with Traefik as the default ingress controller. The
Lima VM that k3s runs in is not directly routable from the host on Linux, so
use `kubectl port-forward` to access the cluster.

### One-time setup

```bash
# 1. Create namespace
kubectl create namespace clio

# 2. Create a self-signed TLS certificate for clio.local
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/clio-tls.key -out /tmp/clio-tls.crt \
  -subj "/CN=clio.local" \
  -addext "subjectAltName=DNS:clio.local,IP:127.0.0.1"

kubectl create secret tls clio-tls \
  --cert=/tmp/clio-tls.crt --key=/tmp/clio-tls.key -n clio

# 3. Point clio.local to localhost
echo "127.0.0.1 clio.local" | sudo tee -a /etc/hosts
```

### Install

Use the provided `k8s/local-values.yaml` which pre-configures Traefik, local
image overrides, and `clio.local` as the hostname:

```bash
helm install clio ./k8s -n clio -f k8s/local-values.yaml
```

### Access via port-forward

The Lima VM IP is not directly routable from the host on Linux. Run a
port-forward to Traefik instead:

```bash
sudo kubectl port-forward -n kube-system svc/traefik 443:443 --address 127.0.0.1
```

Then visit `https://clio.local` in your browser (accept the self-signed cert warning).

### Building local images

If you want to test local code changes without pushing to a registry:

```bash
# Build images into the Rancher Desktop Docker context
docker build --target frontend-prod -t clio-k8s-frontend:latest .
docker build --target backend       -t clio-k8s-backend:latest  .

# local-values.yaml already sets pullPolicy: Never for these image names
helm upgrade clio ./k8s -n clio -f k8s/local-values.yaml
```

### Teardown

```bash
helm uninstall clio -n clio
kubectl delete namespace clio
```

---

## Cloud provider deployment (GKE / EKS / AKS)

The chart is cloud-agnostic. These notes cover the most common cloud-specific
configuration.

### Google Kubernetes Engine (GKE)

```yaml
ingress:
  className: gce          # or nginx if you installed ingress-nginx
  host: clio.example.com
  tls:
    enabled: true
    certManagerIssuer: letsencrypt-prod
    secretName: clio-tls

networkPolicy:
  enabled: true   # requires Calico or Dataplane V2 at cluster creation
```

cert-manager with Let's Encrypt requires a public DNS record. For internal
deployments, use a manual cert or GCP Certificate Manager.

### Amazon Elastic Kubernetes Service (EKS)

```yaml
ingress:
  className: alb          # AWS Load Balancer Controller required
  host: clio.example.com
  tls:
    enabled: false        # ALB handles TLS via ACM — set cert ARN in annotation instead

networkPolicy:
  enabled: true   # requires Network Policy controller enabled in EKS add-ons
```

For ALB TLS, add the cert ARN annotation outside the chart (or use a values
override to add ingress annotations).

### Azure Kubernetes Service (AKS)

```yaml
ingress:
  className: nginx        # or azure/application-gateway
  host: clio.example.com
  tls:
    enabled: true
    certManagerIssuer: letsencrypt-prod
    secretName: clio-tls

networkPolicy:
  enabled: true   # requires Azure CNI or Calico selected at cluster creation
```

### Storage class recommendations

| Platform | Recommended `storageClass` |
|----------|---------------------------|
| GKE | `standard-rwo` (balanced PD) or `premium-rwo` (SSD) |
| EKS | `gp3` |
| AKS | `managed-premium` (SSD) or `managed` (HDD) |
| k3s | leave blank — uses `local-path` provisioner |

```yaml
postgres:
  storage:
    storageClass: "gp3"

redis:
  storage:
    storageClass: "gp3"

backend:
  evidenceStorage:
    storageClass: "gp3"
```

### Non-root pod security context

The published `ghcr.io` images run as root. If your cluster enforces a
non-root pod policy (OPA/Gatekeeper, Pod Security Standards), build the images
from source — the Dockerfile's `backend` stage sets `USER node`:

```bash
docker build --target backend       -t your-registry/clio-backend:latest .
docker build --target frontend-prod -t your-registry/clio-frontend:latest .
docker push your-registry/clio-backend:latest
docker push your-registry/clio-frontend:latest
```

Then enable the security context in your values file:

```yaml
backend:
  image:
    repository: your-registry/clio-backend
    tag: latest
  podSecurityContext:
    enabled: true
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000

frontend:
  image:
    repository: your-registry/clio-frontend
    tag: latest
```

### mTLS between pods (service mesh)

If your threat model requires encrypted pod-to-pod traffic (e.g. multi-tenant
cluster, PCI-DSS), a service mesh like Linkerd adds automatic mTLS with no
application changes.  On cloud providers this is straightforward:

```bash
# Install Linkerd (no extra flags needed — cloud clusters use containerd)
curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install | sh
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -
linkerd check
```

Then enable injection in your values file:

```yaml
linkerd:
  enabled: true
```

> **Note:** Some versions of Linkerd (edge-26.x) have a transport-header
> protocol incompatibility with Redis and PostgreSQL that causes persistent
> connection resets. If you see Redis ECONNRESET errors after enabling Linkerd,
> the chart already includes the workaround annotation
> (`config.linkerd.io/skip-outbound-ports: "6379,5432"` on the backend pod).
> Linkerd stable releases (2.14+) do not have this issue.

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

1. **Check `ingress.host` matches the URL in the browser.**  The chart sets
   `FRONTEND_URL=https://<ingress.host>` automatically.  If users are hitting a
   different hostname (e.g. a CDN alias), override it explicitly:
   ```yaml
   config:
     frontendUrl: "https://clio-cdn.example.com"
   ```

2. **Check `X-Forwarded-Proto` is reaching the backend.**  The frontend nginx
   passes the upstream `X-Forwarded-Proto` header through to the backend.  If
   you have an extra proxy layer between Traefik/nginx and the frontend, ensure
   it sets this header correctly so the backend sees `https`.

3. **Confirm the TLS secret exists.**
   ```bash
   kubectl get secret clio-tls -n clio
   ```

### Evidence file uploads fail

The evidence PVC uses `ReadWriteOnce` access mode, meaning only one pod can mount
it at a time. If you scale `backend.replicas > 1`, you need a `ReadWriteMany`
storage class (e.g. NFS, EFS, Azure Files, GCS Fuse) and to update the PVC
access mode in `k8s/templates/pvc.yaml`.
