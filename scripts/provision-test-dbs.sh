#!/bin/bash
# Provisions N clones of the source test database.
# Usage: ./scripts/provision-test-dbs.sh <n_workers>
# Creates: controlroomdb_test_0 ... controlroomdb_test_<N-1>
set -e

ROOT="$(git rev-parse --show-toplevel)"
source "$ROOT/scripts/cfg.sh"

N="${1:-$(cfg pytest_workers)}"
CONTAINER="$(cfg db_container)"
USER="$(cfg db_user)"
PASS="$(cfg db_password)"
SOURCE="$(cfg test_db_source)"

run_sql() {
    docker exec -e PGPASSWORD="$PASS" "$CONTAINER" \
        psql -U "$USER" -d postgres -c "$1" -q
}

echo "[provision-dbs] Provisioning $N databases from $SOURCE..."

# Terminate all connections to the source before using it as a template.
# CREATE DATABASE WITH TEMPLATE requires zero active connections to the source.
run_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$SOURCE' AND pid <> pg_backend_pid();"

for i in $(seq 0 $((N - 1))); do
    DB="${SOURCE}_${i}"
    echo "[provision-dbs] Creating $DB..."
    run_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();"
    run_sql "DROP DATABASE IF EXISTS $DB;"
    run_sql "CREATE DATABASE $DB WITH TEMPLATE $SOURCE OWNER $USER;"
done
echo "[provision-dbs] Done — $N databases ready."
