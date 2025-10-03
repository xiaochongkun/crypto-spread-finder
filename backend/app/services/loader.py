from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd


DATA_ROOT = Path("data/parquet")


def _date_dir(date: str) -> Path:
    return DATA_ROOT / f"dt={date}"


def get_manifest(date: str) -> Dict:
    mpath = _date_dir(date) / "manifest.json"
    if not mpath.exists():
        raise FileNotFoundError(mpath)
    return json.loads(mpath.read_text())


def list_available_dates() -> List[str]:
    if not DATA_ROOT.exists():
        return []
    dates = []
    for p in sorted(DATA_ROOT.glob("dt=*")):
        if p.is_dir():
            dates.append(p.name.split("=", 1)[1])
    return dates


def list_expiries_for(date: str, base: str) -> List[int]:
    root = _date_dir(date)
    out: List[int] = []
    for p in sorted((root / f"base={base}").glob("expiry=*/chain.parquet")):
        exp = int(p.parent.name.split("=", 1)[1])
        out.append(exp)
    if not out:
        # fall back to manifest if written differently
        manifest = get_manifest(date)
        out = manifest.get("expiries", {}).get(base, [])
    return out


@dataclass
class ChainMeta:
    date: str
    asof_ts: int
    bases: List[str]


def load_chain_for(date: str, base: str) -> Tuple[pd.DataFrame, ChainMeta]:
    root = _date_dir(date)
    # support both layout styles: base/expiry and flat expiry folders
    parquet_paths = list((root / f"base={base}").glob("expiry=*/chain.parquet"))
    if not parquet_paths:
        # try layout: dt=/base=BTC/expiry=... else dt=/expiry=.../base=BTC
        parquet_paths = list(root.glob(f"**/base={base}/expiry=*/chain.parquet"))
    if not parquet_paths:
        raise FileNotFoundError(f"No parquet under {root} for base={base}")

    dfs = [pd.read_parquet(p) for p in parquet_paths]
    df = pd.concat(dfs, ignore_index=True)

    manifest_d = get_manifest(date)
    meta = ChainMeta(
        date=date,
        asof_ts=int(manifest_d.get("asof_ts", 0)),
        bases=manifest_d.get("bases", []),
    )
    return df, meta

