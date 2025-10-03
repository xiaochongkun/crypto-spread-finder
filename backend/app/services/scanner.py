from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import math
import numpy as np
import pandas as pd

from .bs import pop_for_vertical
from .quality import compute_mid, spread_flag


TENOR_NEAR = (7, 21)
TENOR_MID = (22, 60)
TENOR_FAR = (61, 180)


def _tenor_window(tenor: str) -> Tuple[int, int]:
    tenor = tenor.lower()
    if tenor == "near":
        return TENOR_NEAR
    if tenor == "mid":
        return TENOR_MID
    return TENOR_FAR


def _prep_chain(df: pd.DataFrame) -> pd.DataFrame:
    # Ensure minimal columns are present and compute mid/quality
    req = [
        "date",
        "base",
        "instrument",
        "expiry_ts",
        "strike",
        "option_type",
        "bid",
        "ask",
        "mark_price",
        "mark_iv",
        "underlying",
        "oi",
        "asof_ts",
    ]
    for c in req:
        if c not in df.columns:
            df[c] = np.nan

    mids = []
    qflags = []
    for bid, ask, mark in zip(df["bid"].tolist(), df["ask"].tolist(), df["mark_price"].tolist()):
        mid = compute_mid(_nan_to_none(bid), _nan_to_none(ask), _nan_to_none(mark))
        mids.append(mid)
        qflags.append(spread_flag(_nan_to_none(bid), _nan_to_none(ask), _nan_to_none(mid)))
    df = df.copy()
    df["mid"] = mids
    df["quality_flag"] = qflags
    return df


def _nan_to_none(x):
    return None if (x is None or (isinstance(x, float) and math.isnan(x))) else x


def _within_tenor(dte: float, tw: Tuple[int, int]) -> bool:
    return tw[0] <= dte <= tw[1]


def _calc_vertical_metrics(kind: str, side: str, k1: float, k2: float, long_px: float, short_px: float,
                           s: float, iv: float, t_years: float) -> Dict:
    # Premium: debit: long - short; credit: short - long
    if side == "DEBIT":
        premium = (long_px - short_px)
        max_profit = max(0.0, (k2 - k1)) - premium
        max_loss = premium
    else:
        premium = (short_px - long_px)
        max_profit = premium
        max_loss = max(0.0, (k2 - k1)) - premium

    # Guard against invalid values
    if max_loss <= 0:
        odds = float("inf") if max_profit > 0 else float("nan")
    else:
        odds = max_profit / max_loss

    pop = pop_for_vertical(kind=kind, side=side, s=s, k1=k1, k2=k2, premium=premium, vol=max(iv, 1e-6), t_years=max(t_years, 1e-6))

    return {
        "premium": float(premium),
        "max_profit": float(max_profit),
        "max_loss": float(max_loss),
        "odds": float(odds),
        "pop": None if (isinstance(pop, float) and (math.isnan(pop) or pop < 0 or pop > 1)) else float(pop),
    }


def scan_buckets(
    chain_df: pd.DataFrame,
    meta,
    tenor: str,
    direction: str,
    return_per_bucket: int = 3,
    min_oi: int = 0,
    max_width: float | None = None,
):
    df = _prep_chain(chain_df)
    asof = int(meta.asof_ts)
    date = meta.date

    df = df[df["mid"].notna()].copy()
    if min_oi:
        df = df[df["oi"].fillna(0) >= min_oi]

    # dte days
    df["dte"] = (df["expiry_ts"] - asof) / (1000 * 60 * 60 * 24)
    tmin, tmax = _tenor_window(tenor)
    df = df[(df["dte"] >= tmin) & (df["dte"] <= tmax)].copy()
    if df.empty:
        return {"asof_date": date, "base": df["base"].iloc[0] if not df.empty else "", "tenor": tenor, "buckets": []}

    out_buckets = []
    for kind in ["CALL", "PUT"]:
        sub = df[df["option_type"].str.upper() == ("C" if kind == "CALL" else "P")].copy()
        if sub.empty:
            continue
        # group by expiry
        for exp_ts, grp in sub.groupby("expiry_ts"):
            grp = grp.sort_values("strike")
            strikes = grp["strike"].values
            mids = grp["mid"].values
            ivs = grp["mark_iv"].values
            s_vals = grp["underlying"].values
            s = float(np.nanmean(s_vals)) if len(s_vals) else float("nan")
            iv = float(np.nanmean(ivs)) if len(ivs) else float("nan")
            t_years = max(((exp_ts - asof) / (1000 * 60 * 60 * 24)) / 365.0, 1e-6)

            legs_debit = []
            legs_credit = []
            n = len(strikes)
            for i in range(n):
                for j in range(i + 1, n):
                    k1 = float(strikes[i])
                    k2 = float(strikes[j])
                    if max_width is not None and (k2 - k1) > max_width:
                        continue
                    # For calls: debit long k1, short k2; credit short k1, long k2
                    # For puts (put debit defined as buy K2 sell K1 in doc), we keep same K ordering (k1<k2)
                    m1 = float(mids[i])
                    m2 = float(mids[j])

                    # Quality: if either flag wide/missing/invalid mark it
                    q1 = grp.iloc[i]["quality_flag"]
                    q2 = grp.iloc[j]["quality_flag"]
                    qflag = "ok"
                    for q in (q1, q2):
                        if q in ("missing", "invalid", "wide_spread"):
                            qflag = q
                            break

                    if kind == "CALL":
                        debit = _calc_vertical_metrics("CALL", "DEBIT", k1, k2, long_px=m1, short_px=m2, s=s, iv=iv, t_years=t_years)
                        credit = _calc_vertical_metrics("CALL", "CREDIT", k1, k2, long_px=m2, short_px=m1, s=s, iv=iv, t_years=t_years)
                    else:
                        # Puts: for debit in doc: Buy Put(K2) (higher), Sell Put(K1) (lower)
                        # With k1<k2, debit long m2 short m1; credit short m2 long m1
                        debit = _calc_vertical_metrics("PUT", "DEBIT", k1, k2, long_px=m2, short_px=m1, s=s, iv=iv, t_years=t_years)
                        credit = _calc_vertical_metrics("PUT", "CREDIT", k1, k2, long_px=m1, short_px=m2, s=s, iv=iv, t_years=t_years)

                    legs_debit.append({"K1": k1, "K2": k2, **debit, "quality": qflag})
                    legs_credit.append({"K1": k1, "K2": k2, **credit, "quality": qflag})

            # Rank by odds
            def _rank(lst: List[Dict]):
                lst = [x for x in lst if not math.isnan(x["odds"]) and x["odds"] != float("inf")]
                lst.sort(key=lambda x: x["odds"], reverse=True)
                top = lst[:return_per_bucket]
                bottom = lst[-return_per_bucket:][::-1] if return_per_bucket > 0 else []
                return top, bottom

            top_d, bot_d = _rank(legs_debit)
            top_c, bot_c = _rank(legs_credit)

            out_buckets.append({"leg_type": kind, "side": "DEBIT", "top": top_d, "bottom": bot_d})
            out_buckets.append({"leg_type": kind, "side": "CREDIT", "top": top_c, "bottom": bot_c})

    # Optionally filter by direction: up → CALL focus; down → PUT focus (but keep both for completeness)
    if direction == "up":
        filtered = [b for b in out_buckets if b["leg_type"] == "CALL"]
    elif direction == "down":
        filtered = [b for b in out_buckets if b["leg_type"] == "PUT"]
    else:
        filtered = out_buckets

    base = chain_df["base"].iloc[0] if not chain_df.empty else ""
    return {"asof_date": date, "base": base, "tenor": tenor, "buckets": filtered}

