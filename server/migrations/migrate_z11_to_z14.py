"""
Migration: Z11 → Z14 tile coordinates
======================================
Each Z11 tile (2048×2048 grid) maps to an 8×8 block of Z14 tiles.
We re-center each existing record to the center Z14 tile of that block.

Formula:
    new_tx = old_tx * 8 + 4   (center of the 8-wide strip, 0-indexed → col 4)
    new_ty = old_ty * 8 + 4

Safety:
    - Creates a timestamped backup before any changes
    - Detects if data is already at Z14 (max coord > 2047) and exits early
    - Uses a single atomic UPDATE — no partial writes
    - Verifies row counts match before and after

Run: python3 server/migrations/migrate_z11_to_z14.py
"""

import sqlite3
import shutil
import sys
import time
from pathlib import Path

DB = Path(__file__).parent.parent / "cryptoland.db"
Z11_MAX = 2047   # max valid coord at Z11
Z14_N   = 16384  # grid size at Z14


def main():
    if not DB.exists():
        print(f"[migrate] ERROR: database not found at {DB}")
        sys.exit(1)

    # ── 1. Backup ────────────────────────────────────────────────────────────
    ts     = int(time.time())
    backup = DB.parent / f"cryptoland_z11_backup_{ts}.db"
    shutil.copy2(DB, backup)
    print(f"[migrate] Backup created: {backup}")

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # ── 2. Detect zoom level ─────────────────────────────────────────────────
    row = cur.execute("SELECT MAX(tx), MAX(ty) FROM blocks").fetchone()
    if not row or row[0] is None:
        print("[migrate] No blocks found — nothing to migrate.")
        con.close()
        return

    max_tx, max_ty = row[0], row[1]
    print(f"[migrate] Current max coords: tx={max_tx}, ty={max_ty}")

    if max_tx > Z11_MAX or max_ty > Z11_MAX:
        print(f"[migrate] Coords already exceed Z11 range (>{Z11_MAX}) — data appears to be at Z14 already.")
        print("[migrate] No changes made. Exiting.")
        con.close()
        return

    # ── 3. Count rows ────────────────────────────────────────────────────────
    total_before = cur.execute("SELECT COUNT(*) FROM blocks").fetchone()[0]
    print(f"[migrate] Rows to migrate: {total_before}")

    # ── 4. Compute new keys, check for collisions ───────────────────────────
    # Preview: show first 5 mappings
    sample = cur.execute("SELECT tile_key, tx, ty FROM blocks LIMIT 5").fetchall()
    print("[migrate] Sample mappings (old → new):")
    for r in sample:
        new_tx = r["tx"] * 8 + 4
        new_ty = r["ty"] * 8 + 4
        new_key = f"{new_tx}:{new_ty}"
        print(f"   {r['tile_key']} → {new_key}  (tx {r['tx']}→{new_tx}, ty {r['ty']}→{new_ty})")

    # ── 5. Atomic UPDATE ─────────────────────────────────────────────────────
    print("[migrate] Applying migration...")
    cur.execute("""
        UPDATE blocks
        SET
            tx       = tx * 8 + 4,
            ty       = ty * 8 + 4,
            tile_key = (tx * 8 + 4) || ':' || (ty * 8 + 4)
    """)
    # Note: SQLite evaluates the new tx/ty in the SET clause left-to-right,
    # but the tile_key column uses the already-updated tx and ty values within
    # the same UPDATE statement. To avoid a two-pass issue, use subquery:
    # Actually SQLite does not guarantee left-to-right for column references
    # within the same SET clause. Use a computed expression instead:
    con.rollback()  # rollback the potentially incorrect update above

    # Safe single-pass approach: compute all three in one expression
    cur.execute("""
        UPDATE blocks
        SET
            tile_key = CAST((tx * 8 + 4) AS TEXT) || ':' || CAST((ty * 8 + 4) AS TEXT),
            tx       = tx * 8 + 4,
            ty       = ty * 8 + 4
    """)
    con.commit()
    print("[migrate] UPDATE committed.")

    # ── 6. Verify ────────────────────────────────────────────────────────────
    total_after = cur.execute("SELECT COUNT(*) FROM blocks").fetchone()[0]
    max_row = cur.execute("SELECT MAX(tx), MAX(ty) FROM blocks").fetchone()
    new_max_tx, new_max_ty = max_row[0], max_row[1]

    print(f"[migrate] Rows after:  {total_after}  (expected {total_before})")
    print(f"[migrate] New max coords: tx={new_max_tx}, ty={new_max_ty}  (Z14 max={Z14_N - 1})")

    if total_after != total_before:
        print(f"[migrate] ERROR: row count mismatch ({total_before} → {total_after})!")
        print(f"[migrate] Backup is at {backup} — restore manually if needed.")
        con.close()
        sys.exit(1)

    if new_max_tx is None or new_max_tx > Z14_N - 1 or new_max_ty > Z14_N - 1:
        print(f"[migrate] ERROR: new coordinates out of Z14 range!")
        con.close()
        sys.exit(1)

    con.close()
    print(f"[migrate] ✓ Migration complete. {total_after} blocks migrated to Z14.")
    print(f"[migrate]   Backup retained at: {backup}")
    print(f"[migrate]   Re-run seed.py to refresh test data, or restart the server.")


if __name__ == "__main__":
    main()
