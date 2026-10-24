import sqlite3

import pytest
from app.backup import backup


def test_online_backup_contains_wal_data_and_does_not_overwrite(tmp_path):
    live = tmp_path / "farm.sqlite3"
    target = tmp_path / "copy.sqlite3"
    with sqlite3.connect(live) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("CREATE TABLE eggs (kg INTEGER)")
        db.execute("INSERT INTO eggs VALUES (12)")
        db.commit()
        backup(live, target)
        with sqlite3.connect(target) as copy:
            assert copy.execute("SELECT kg FROM eggs").fetchone()[0] == 12
            assert copy.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        with pytest.raises(FileExistsError):
            backup(live, target)
