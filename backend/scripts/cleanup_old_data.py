#!/usr/bin/env python3
"""清理前一天的期权数据"""
from __future__ import annotations

import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA_ROOT = Path(__file__).parent.parent / "data" / "parquet"


def cleanup_old_data():
    """删除前一天的数据目录"""
    yesterday = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    target_dir = DATA_ROOT / f"dt={yesterday}"

    if target_dir.exists():
        shutil.rmtree(target_dir)
        print(f"[CLEANUP] Deleted: {target_dir}")
    else:
        print(f"[CLEANUP] Not found: {target_dir}")


if __name__ == "__main__":
    cleanup_old_data()
