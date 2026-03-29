#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Reset test database
#
# Clones the current state of controlroomdb into a target test database so
# that tests always run against a mirror of production.
#
# Usage:
#   ./scripts/reset-test-db.sh [target_db]
# Default target: controlroomdb_test
# =============================================================================
set -e

ROOT="$(git rev-parse --show-toplevel)"
source "$ROOT/scripts/cfg.sh"

DB_CONTAINER="$(cfg db_container)"
DB_USER="$(cfg db_user)"
DB_PASS="$(cfg db_password)"
SRC_DB="controlroomdb"
TEST_DB="${1:-controlroomdb_test}"

export PGPASSWORD="$DB_PASS"

run_sql() {
    local db="$1"
    local sql="$2"
    docker exec -e PGPASSWORD="$DB_PASS" "$DB_CONTAINER" \
        psql -U "$DB_USER" -d "$db" -c "$sql" -q
}

echo "[reset-test-db] Dropping $TEST_DB..."
run_sql postgres "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TEST_DB' AND pid <> pg_backend_pid();"
run_sql postgres "DROP DATABASE IF EXISTS $TEST_DB;"

echo "[reset-test-db] Cloning $SRC_DB → $TEST_DB..."
docker exec -e PGPASSWORD="$DB_PASS" "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" --clean --if-exists "$SRC_DB" \
    | docker exec -i -e PGPASSWORD="$DB_PASS" "$DB_CONTAINER" \
        bash -c "createdb -U $DB_USER $TEST_DB && psql -U $DB_USER -d $TEST_DB -q"

echo "[reset-test-db] Done — $TEST_DB mirrors current $SRC_DB."
