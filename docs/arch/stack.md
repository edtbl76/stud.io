# Stack & Services

## Docker services

The studio stack (`./build.sh`) runs four containers in a single Docker network:

| Container | Image | Port | Role |
|---|---|---|---|
| `studio_db` | `pgvector/pgvector:pg17` | 5432 | PostgreSQL 17 with pgvector — all three databases |
| `controlroom_backend` | custom (Python 3.12-slim) | 5150 | FastAPI REST API |
| `controlroom_frontend` | custom (Node 20-alpine) | 2112 | Next.js app (dev server) |
| `controlroom_nginx` | `nginx:alpine` | 2112, 5150 | HTTPS reverse proxy |

The SonarQube stack (`./scripts/dev.sh`) runs separately in its own Docker network and does not interact with the studio stack at runtime.

---

## Ports

| Port | Service | Exposure | Protocol |
|---|---|---|---|
| 2112 | nginx → Next.js (app) | External | HTTPS |
| 5150 | nginx → FastAPI (API / Swagger) | External | HTTPS |
| 5432 | PostgreSQL | Internal | TCP |
| 9000 | SonarQube (dev stack only) | External | HTTP |

nginx terminates TLS on both external ports. Port 2112 proxies to the Next.js container; port 5150 proxies to the FastAPI container. There is no port 443 — this is a local dev stack using mkcert certificates, and the ports are chosen to avoid requiring root privileges.

---

## Environment variables

### Backend (`controlroom_backend`)

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `db` | PostgreSQL hostname (Docker service name) |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `controlroomdb` | Application database name |
| `DB_USER` | `studio` | Database user |
| `DB_PASSWORD` | `studio` | Database password |
| `JWT_SECRET` | `change-me-in-production` | HMAC secret for JWT signing |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm (HS256 only) |
| `JWT_EXPIRE_MINUTES` | `480` | Token lifetime (8 hours) |
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth client ID — leave empty to disable Google Sign-In |
| `APP_HOST` | `0.0.0.0` | FastAPI bind address |
| `APP_PORT` | `5150` | FastAPI bind port |

### Frontend (`controlroom_frontend`)

| Variable | Description |
|---|---|
| `BACKEND_URL` | Internal URL of the FastAPI backend (e.g. `http://controlroom_backend:5150`) — server-side only, never sent to the browser |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID — baked into the client bundle; must match the backend value |

`NEXT_PUBLIC_API_URL` was removed when the app was rewritten as a BFF. All API calls are now relative `/api/...` paths routed through the Next.js server, so there is no browser-visible backend URL.

---

## Startup sequence

`build.sh` brings up services in dependency order and gates each on a health check before proceeding:

1. **`studio_db`** — waits for `pg_isready`
2. **`controlroom_backend`** — waits for `/health` to return 200; applies schema + views to `controlroomdb` and `controlroomdb_test` on first run
3. **`controlroom_frontend`** — waits for the Next.js dev server to respond
4. **`controlroom_nginx`** — starts last; no separate health check
5. Backend test suite runs after all services are healthy

---

## HTTPS

nginx terminates TLS using a mkcert-generated certificate stored in `nginx/certs/` (gitignored). The certificate covers `localhost`, `127.0.0.1`, the machine's local IP/hostname, and the `.sslip.io` alias used for Google OAuth.

nginx runs two server blocks, both with TLS:
- Port **2112** → proxies to Next.js (`http://frontend:2112`) — the main application entry point; also handles Next.js WebSocket (HMR) via upgrade headers
- Port **5150** → proxies to FastAPI (`http://controlroom_backend:5150`) — used for direct Swagger UI access only

Browsers only talk to the Next.js server (port 2112). The Next.js BFF routes all `/api/...` calls to FastAPI internally over the Docker network, so FastAPI is never called directly from browser code.

For Google OAuth to work from other devices on the network, the certificate must include the machine's local IP and the `.sslip.io` hostname (e.g. `192.168.1.230.sslip.io`) — Google OAuth requires a public TLD. See [setup.md](../setup.md) for details.
