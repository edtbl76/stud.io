#!/usr/bin/env bash
# B127 — nightly backup of STUD.io's PRODUCTION masterdb → weyland MinIO studio-backups.
#
# Targets the LIVE studio_db via the ACTIVE docker context (Docker Desktop pre-cutover, native post-cutover), so it
# backs up live production across the B127 migration with NO change. Override with DOCKER_HOST if ever needed.
# Uploads via the scoped `studio-svc` MinIO user (creds in ~/.config/studio/minio.env). Retention is server-side
# (MinIO ILM 180d on studio-backups). masterdb is the only production data on the laptop; photos live in weyland MinIO.
set -euo pipefail

MINIO_ENV="${MINIO_ENV:-$HOME/.config/studio/minio.env}"
[ -f "$MINIO_ENV" ] && { set -a; . "$MINIO_ENV"; set +a; }
: "${MINIO_ACCESS_KEY:?set MINIO_ACCESS_KEY in $MINIO_ENV}"
: "${MINIO_SECRET_KEY:?set MINIO_SECRET_KEY in $MINIO_ENV}"

WL_ENDPOINT="${WL_MINIO_ENDPOINT:-http://192.168.1.243:30990}"
MC="${MC:-$HOME/.local/bin/mc}"; command -v "$MC" >/dev/null 2>&1 || MC="$(command -v mc || true)"
[ -n "$MC" ] || { echo "[backup] mc not found on PATH or ~/.local/bin" >&2; exit 1; }

DB_CONTAINER="${DB_CONTAINER:-studio_db}"
DB_USER="${DB_USER:-studio}"
DB_NAME="${DB_NAME:-masterdb}"
BUCKET="studio-backups"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OBJ="masterdb/masterdb-${TS}.dump"

# The live DB must be up on the active docker context; skip cleanly if not (the timer's Persistent=true retries at
# the next schedule/boot) rather than fail the unit.
if ! docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
  echo "[backup] $DB_CONTAINER not ready on the active docker context — skipping this run"
  exit 0
fi

# scoped studio-svc user can't ListAllMyBuckets, so `alias set`'s probe may warn but still writes the alias — tolerate it
"$MC" alias set wlbak "$WL_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null 2>&1 || true

# consistent -Fc snapshot streamed straight to MinIO — no temp file on the laptop
echo "[backup] pg_dump $DB_NAME → $BUCKET/$OBJ"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" | "$MC" pipe "wlbak/$BUCKET/$OBJ"

# verify the object landed and is non-trivial (a 0-byte upload is a silent failure)
SIZE="$("$MC" stat --json "wlbak/$BUCKET/$OBJ" 2>/dev/null | grep -o '"size":[0-9]*' | head -1 | cut -d: -f2)"
if [ -z "${SIZE:-}" ] || [ "${SIZE:-0}" -lt 1000 ]; then
  echo "[backup] ERROR: uploaded object missing or too small (size=${SIZE:-none})" >&2
  exit 1
fi
echo "[backup] done: $OBJ (${SIZE} bytes)"

# optional freshness alerting: ping an Uptime Kuma push monitor on success (set KUMA_PUSH_URL in ~/.config/studio/minio.env)
[ -n "${KUMA_PUSH_URL:-}" ] && curl -fsS "$KUMA_PUSH_URL" >/dev/null 2>&1 || true
