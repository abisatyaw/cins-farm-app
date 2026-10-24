"""Online, transaction-consistent SQLite backups (including committed WAL data)."""

import argparse
import os
import sqlite3
from pathlib import Path

from app.config import ROOT, Settings, now


def backup(source: Path, destination: Path) -> Path:
    if not source.is_file():
        raise FileNotFoundError(f"Database not found: {source}")
    if destination.resolve() == source.resolve():
        raise ValueError("Backup destination must differ from the live database")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects previous backups from accidental overwriting.
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        with sqlite3.connect(f"{source.resolve().as_uri()}?mode=ro", uri=True) as live:
            with sqlite3.connect(destination) as copy:
                live.backup(copy)
                if copy.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("Backup integrity check failed")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    url = Settings().database_url
    if not url.startswith("sqlite:///"):
        parser.error("Only SQLite databases are supported")
    target = args.output or ROOT / "backups" / f"farm-{now():%Y%m%d-%H%M%S-%f}.sqlite3"
    backup(Path(url.removeprefix("sqlite:///")), target)
    print(f"Backup verified: {target}")


if __name__ == "__main__":
    main()
