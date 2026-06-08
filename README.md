<h1 align="center">Clio Logging Platform</h1>
<p align="center">
<img src="./images/Clio_Logging_Platform_Logo.png" alt="Clio Logo" width="400"/>
</p>

A secure, collaborative logging system designed for red team operations and security assessments. Provides real-time logging with role-based access control, automatic operation tagging, relational analysis, evidence management, and C2 ingest integration.

## Key Features

- **Operations scoping** — users are assigned to operations and only see logs for their own engagement
- **Relational analysis** — automatic correlation of IPs, hostnames, domains, users, MAC addresses, and commands
- **Real-time collaborative logging** — multiple operators view and edit simultaneously with row-level locking
- **Role-based access control** — admin and user roles with per-operation data isolation
- **Secure authentication** — JWT in httpOnly cookies, CSRF protection, per-user passwords
- **Evidence attachments** — upload and track evidence files tied to individual log entries
- **Log templates** — reusable field presets for common activity types
- **API key ingest** — push logs from C2 frameworks via `/api/ingest`
- **Export** — CSV and database export with filtering
- **File status tracking** — monitor file state across systems (ON_DISK, IN_MEMORY, ENCRYPTED, etc.)

---

## Deployment

### Option A — Single container (recommended, simplest)

Pull and run the all-in-one image. Nginx, backend, Redis, and PostgreSQL are all bundled. Everything persists in a single Docker volume.

```bash
docker run -d --name clio \
  -p 443:443 -p 80:80 \
  -e EXTERNAL_HOSTNAME=your-server-ip \
  -v clio-data:/data \
  ghcr.io/seahop/clio:latest
```

Or with docker compose:

```bash
# Edit EXTERNAL_HOSTNAME in docker-compose.omnibus.yml first, then:
docker compose -f docker-compose.omnibus.yml up -d
```

#### Getting your credentials

On first boot Clio generates random passwords for every service and prints them to the container logs:

```bash
docker logs clio
```

Look for the first-boot banner:

```
┌──────────────────────────────────────────────────┐
│             Clio — First Boot                    │
│                                                   │
│  Admin password : <generated>                    │
│  Access         : https://your-server-ip         │
└──────────────────────────────────────────────────┘
```

To retrieve credentials at any time after first boot:

```bash
# Admin and shared user bootstrap password
docker exec clio sh -c '. /data/.secrets.env; echo "admin / $ADMIN_PASSWORD"; echo "user  / $USER_PASSWORD"'
```

> **Note on the user password:** Clio does not have a user registry. Any username combined with the shared `USER_PASSWORD` creates an account on first login — the user is then prompted to set their own password. The admin password works the same way.

#### EXTERNAL_HOSTNAME

Set this to your server's IP address or domain name. It is written into the self-signed TLS certificate SAN and the CORS allowed-origins list. Defaults to `localhost` if not set (fine for local testing, wrong for remote access).

---

### Option B — Multi-container HA (docker compose)

Separate containers for Nginx, frontend, backend, Redis, and PostgreSQL. Suitable for production or when you need to scale components independently.

```bash
# First-time setup — generates .env files, TLS certs, and initial passwords
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
sudo python generate-env.py https://<your-ip-or-host>

# For Let's Encrypt + Google SSO:
sudo python3 generate-env.py https://yourdomain.com \
  --letsencrypt --domain=yourdomain.com \
  --email=your@email.com \
  --google-client-id=YOUR_CLIENT_ID \
  --google-client-secret=YOUR_SECRET \
  --google-callback-url=https://yourdomain.com/api/auth/google/callback

# Build and run
docker compose build
docker compose up -d
```

Generated passwords are printed to stdout on first run and saved to `credentials-backup-*.txt`.

---

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [Security Features](./docs/security.md)
- [User Guide](./docs/user-guide.md)
- [API Documentation](./docs/api-guide.md)
- [Using Log Forwarders](./log_exporter/README.md)
- [Google OAuth Integration](./docs/sso-integration.md)

## License

This software is provided as-is for use by red team professionals.
