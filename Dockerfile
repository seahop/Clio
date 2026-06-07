# ─────────────────────────────────────────────────────────────────────────────
# Clio — Multi-stage Dockerfile
#
# Targets:
#   backend   Production backend image for HA / docker-compose deployments.
#             Identical to backend/Dockerfile but built from the project root.
#
#   omnibus   All-in-one single-container image for simple deployments.
#             Bundles Nginx, Node.js backend, Redis, and PostgreSQL.
#             Data persists in a single /data volume.
#
# Build examples:
#   docker build --target omnibus -t clio .
#   docker build --target backend -t clio-backend .
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build React frontend into static files ───────────────────────────
# CRA's webpack plugins (ajv-keywords) require Node ≤18; Node 23 breaks them.
FROM node:18-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps && \
    # ajv-keywords@5 requires ajv@8; force-hoist it so the production build resolves correctly
    npm install ajv@^8.8.2 --legacy-peer-deps
COPY frontend/ ./
# Disable source maps to keep the image lean
RUN GENERATE_SOURCEMAP=false npm run build


# ── Stage 2: Backend production dependencies (no devDeps) ────────────────────
FROM node:23-alpine AS backend-deps
WORKDIR /build
COPY backend/package*.json ./
RUN npm install --omit=dev


# ── Stage 3: backend — standalone backend image for HA deployments ───────────
FROM node:23-alpine AS backend
RUN apk add --no-cache openssl
ENV NODE_OPTIONS="--tls-cipher-list=DEFAULT@SECLEVEL=0"
ENV OPENSSL_CONF=/app/openssl.cnf
WORKDIR /app
COPY --from=backend-deps /build/node_modules ./node_modules
COPY backend/ .
RUN echo "[system_default_sect]"       > /app/openssl.cnf && \
    echo "MinProtocol = TLSv1"        >> /app/openssl.cnf && \
    echo "CipherString = DEFAULT@SECLEVEL=0" >> /app/openssl.cnf
EXPOSE 3001
CMD ["node", "server.js"]


# ── Stage 4: omnibus — all-in-one single-container image ─────────────────────
FROM postgres:17-alpine AS omnibus

# Install: Node.js, Redis, Nginx, Supervisor (process manager), OpenSSL, tini (PID 1)
RUN apk add --no-cache \
        nodejs \
        npm \
        redis \
        nginx \
        supervisor \
        openssl \
        su-exec \
        tini \
        curl \
    && rm -rf /var/cache/apk/*

# ── Backend ───────────────────────────────────────────────────────────────────
ENV NODE_OPTIONS="--tls-cipher-list=DEFAULT@SECLEVEL=0"
ENV OPENSSL_CONF=/app/backend/openssl.cnf
WORKDIR /app/backend
COPY --from=backend-deps /build/node_modules ./node_modules
COPY backend/ .
RUN echo "[system_default_sect]"       > /app/backend/openssl.cnf && \
    echo "MinProtocol = TLSv1"        >> /app/backend/openssl.cnf && \
    echo "CipherString = DEFAULT@SECLEVEL=0" >> /app/backend/openssl.cnf

# ── Frontend static files ─────────────────────────────────────────────────────
COPY --from=frontend-build /build/build /app/frontend/build

# ── Omnibus config files ──────────────────────────────────────────────────────
COPY docker/omnibus/supervisord.conf /etc/supervisord.conf
COPY docker/omnibus/nginx.conf       /etc/nginx/nginx.conf
COPY docker/omnibus/entrypoint.sh    /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create runtime directories that must survive outside the volume
RUN mkdir -p /run/clio /var/log/nginx

# ── Persistent storage ────────────────────────────────────────────────────────
VOLUME /data

# 80 = HTTP (redirect to HTTPS), 443 = HTTPS
EXPOSE 80 443

# tini handles PID 1 signal forwarding; entrypoint does first-boot init
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
