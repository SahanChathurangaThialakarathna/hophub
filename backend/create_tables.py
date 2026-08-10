"""DEPRECATED — schema is now managed by Alembic.

Use `alembic upgrade head` to apply migrations.
Retained for reference only; do not run against a migrated database.
"""

if __name__ == "__main__":
    raise SystemExit(
        "create_tables.py is deprecated. Run 'alembic upgrade head' instead."
    )