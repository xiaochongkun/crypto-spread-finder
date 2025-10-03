#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import httpx
import numpy as np
import pandas as pd


DATA_ROOT = Path("data/parquet")


DERIBIT = "https://www.deribit.com/api/v2"


def parse_instrument(name: str) -> Tuple[str, int, float, str]:
    # e.g., BTC-27DEC24-50000-C
    parts = name.split("-")
    if len(parts) < 4:
        raise ValueError(f"unrecognized instrument: {name}")
    base = parts[0]
    # Deribit also has timestamp in ms available from API; we keep redundancy by trusting API fields later.
    # We'll not parse date string here except as a fallback.
    strike = float(parts[2])
    opt = parts[3].upper()
    return base, 0, strike, opt


async def fetch_book_summary(client: httpx.AsyncClient, currency: str) -> List[Dict]:
    r = await client.get(
        f"{DERIBIT}/public/get_book_summary_by_currency",
        params={"currency": currency, "kind": "option"},
        timeout=30.0,
    )
    r.raise_for_status()
    d = r.json()
    return d.get("result", [])


async def fetch_instruments(client: httpx.AsyncClient, currency: str) -> Dict[str, Dict]:
    r = await client.get(
        f"{DERIBIT}/public/get_instruments",
        params={"currency": currency, "kind": "option", "expired": False},
        timeout=30.0,
    )
    r.raise_for_status()
    ins = r.json().get("result", [])
    out = {}
    for it in ins:
        out[it["instrument_name"]] = it
    return out


async def run_once(date_str: str, bases: List[str]) -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    dt_dir = DATA_ROOT / f"dt={date_str}"
    dt_dir.mkdir(parents=True, exist_ok=True)

    asof_ts = int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    async with httpx.AsyncClient() as client:
        tasks = [fetch_book_summary(client, b) for b in bases]
        book_by_base = await asyncio.gather(*tasks)

        ins_tasks = [fetch_instruments(client, b) for b in bases]
        ins_by_base = await asyncio.gather(*ins_tasks)

    manifest = {"date": date_str, "asof_ts": asof_ts, "bases": bases, "rows": 0, "expiries": {}}

    total_rows = 0
    for base, rows, ins_map in zip(bases, book_by_base, ins_by_base):
        if not rows:
            continue
        df = pd.DataFrame(rows)
        # Normalize fields presence
        # Expected fields: instrument_name, bid_price, ask_price, mark_price, mark_iv, open_interest, underlying_price, expiration_timestamp, creation_timestamp
        df = df.rename(
            columns={
                "instrument_name": "instrument",
                "bid_price": "bid",
                "ask_price": "ask",
                "open_interest": "oi",
                "underlying_price": "underlying",
            }
        )
        # Enrich with instrument metadata: expiry_ts, strike, option_type
        strikes: List[float] = []
        types: List[str] = []
        expiries: List[int] = []
        bases_parsed: List[str] = []
        for name in df["instrument"].tolist():
            meta = ins_map.get(name)
            if meta:
                strikes.append(float(meta.get("strike")))
                types.append("C" if str(meta.get("option_type", "")).lower().startswith("c") else "P")
                expiries.append(int(meta.get("expiration_timestamp")))
                bases_parsed.append(str(meta.get("base_currency", base)))
            else:
                # Fallback to parsing
                b, _, k, t = parse_instrument(name)
                strikes.append(float(k))
                types.append("C" if t.startswith("C") else "P")
                expiries.append(0)
                bases_parsed.append(b)
        df["strike"] = strikes
        df["option_type"] = types
        df["expiry_ts"] = expiries
        df["base"] = bases_parsed
        df["date"] = date_str
        df["asof_ts"] = asof_ts

        # Partition by expiry
        exp_map: Dict[int, pd.DataFrame] = {}
        for exp_ts, grp in df.groupby("expiry_ts"):
            exp_map[int(exp_ts)] = grp

        # Write parquet partitions
        for exp_ts, grp in exp_map.items():
            out_dir = dt_dir / f"base={base}" / f"expiry={int(exp_ts)}"
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "chain.parquet").unlink(missing_ok=True)
            grp.to_parquet(out_dir / "chain.parquet", index=False)

        manifest["expiries"][base] = sorted(list(exp_map.keys()))
        total_rows += int(df.shape[0])

    manifest["rows"] = total_rows
    (dt_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"date": date_str, "rows": total_rows, "bases": bases}, indent=2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="YYYY-MM-DD (default today UTC)")
    ap.add_argument("--bases", nargs="*", default=["BTC", "ETH"], help="Bases to fetch")
    args = ap.parse_args()

    date_str = args.date
    if not date_str:
        date_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    asyncio.run(run_once(date_str, bases=args.bases))


if __name__ == "__main__":
    main()
