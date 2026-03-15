#!/usr/bin/env python3
"""
STUD.io — Reseed

Drops and recreates the studio database, applies schema, then runs all seed files.
Safe to re-run at any time.

Usage:
    python reseed.py
"""

import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    print("ERROR: Run:  pip install psycopg2-binary")
    sys.exit(1)

DB_NAME = "studio"
DB_USER = "studio"
DB_PASS = "studio"
DB_HOST = "localhost"
DB_PORT = 5432

BASE_DIR  = Path(__file__).parent.parent
SQL_DIR   = BASE_DIR / "sql"
SEED_DIR  = SQL_DIR / "seeds"
SCHEMA    = SQL_DIR / "schema.sql"


def log(msg):
    print(f"  {msg}")


def reset_database():
    print("\n[1/3] Dropping and recreating database...")
    conn = psycopg2.connect(
        dbname="postgres", user=DB_USER, password=DB_PASS,
        host=DB_HOST, port=DB_PORT
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '{DB_NAME}' AND pid <> pg_backend_pid()
        """)
        cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
        cur.execute(f"CREATE DATABASE {DB_NAME}")
    conn.close()
    log(f"Database '{DB_NAME}' recreated")


def apply_schema():
    print("\n[2/3] Applying schema...")
    conn = psycopg2.connect(
        dbname=DB_NAME, user=DB_USER, password=DB_PASS,
        host=DB_HOST, port=DB_PORT
    )
    with conn:
        with conn.cursor() as cur:
            log(f"Applying {SCHEMA.name}")
            cur.execute(SCHEMA.read_text())
    conn.close()
    log("Schema applied")


def apply_seeds():
    print("\n[3/3] Applying seed files...")
    seed_files = sorted(SEED_DIR.glob("*.sql"))
    if not seed_files:
        log("No seed files found in sql/seeds/ — skipping")
        return

    conn = psycopg2.connect(
        dbname=DB_NAME, user=DB_USER, password=DB_PASS,
        host=DB_HOST, port=DB_PORT
    )
    with conn:
        with conn.cursor() as cur:
            for seed_file in seed_files:
                log(f"Applying {seed_file.name}")
                cur.execute(seed_file.read_text())
    conn.close()
    log(f"{len(seed_files)} seed files applied")


def main():
    print("=" * 60)
    print("  STUD.io — Reseed")
    print("=" * 60)

    try:
        reset_database()
        apply_schema()
        apply_seeds()
    except psycopg2.OperationalError as e:
        print(f"\nERROR: Could not connect to database.\n{e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        raise

    print("\n" + "=" * 60)
    print("  Done. Database is ready.")
    print("=" * 60)


if __name__ == "__main__":
    main()
