#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Roadie
#
# Manages the local Docker stack.
#
# Usage:
#   ./roadie.sh <command> [--dev]
#
# Commands:
#   start    Start the stack and wait for all services to be healthy
#   stop     Stop the stack (data is preserved)
#   restart  Stop then start
#   status   Show running containers
#
# Flags:
#   --dev    Include dev tools (SonarQube, Structurizr) alongside production stack
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND=""
WITH_DEV=false

for arg in "$@"; do
  case "$arg" in
    start|stop|restart|status) COMMAND="$arg" ;;
    --dev) WITH_DEV=true ;;
    *) echo "[roadie] Unknown argument: $arg"; echo "Run with no arguments for usage."; exit 1 ;;
  esac
done

if [ -z "$COMMAND" ]; then
  sed -n '/^# Usage:/,/^# ======/{ /^# ======/d; s/^# \{0,1\}//; p }' "$0"
  exit 0
fi

cd "$SCRIPT_DIR"

do_start() {
  echo "[roadie] Starting production stack..."
  docker compose up -d

  echo -n "[roadie] PostgreSQL "
  until docker compose exec db pg_isready -U studio -q 2>/dev/null; do
    echo -n "."; sleep 1
  done
  echo " ready"

  echo -n "[roadie] API        "
  until curl -sfk https://localhost:5150/health > /dev/null 2>&1; do
    echo -n "."; sleep 1
  done
  echo " ready"

  echo -n "[roadie] Frontend   "
  until curl -sfk https://localhost:2112 > /dev/null 2>&1; do
    echo -n "."; sleep 2
  done
  echo " ready"

  if $WITH_DEV; then
    echo "[roadie] Starting dev stack..."
    bash "$SCRIPT_DIR/scripts/dev.sh" up
  fi

  echo "[roadie] All services ready."
}

do_stop() {
  if $WITH_DEV; then
    echo "[roadie] Stopping dev stack..."
    bash "$SCRIPT_DIR/scripts/dev.sh" down
  fi

  echo "[roadie] Stopping production stack..."
  docker compose down
  echo "[roadie] Done."
}

case "$COMMAND" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; do_start ;;
  status)  docker compose ps ;;
esac
