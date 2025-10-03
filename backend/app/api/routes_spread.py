from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.loader import load_chain_for
from ..services.scanner import scan_buckets


class ScanRequest(BaseModel):
    base: str = Field(..., pattern=r"^(BTC|ETH)$")
    date: str = Field(..., description="YYYY-MM-DD")
    direction: str = Field(..., pattern=r"^(up|down)$")
    tenor: str = Field(..., pattern=r"^(near|mid|far)$")
    return_per_bucket: int = 3
    min_oi: int | None = Field(default=0)
    max_width: float | None = Field(default=None, description="max K2-K1 width in underlying units")


router = APIRouter()


@router.post("/spread/scan")
def scan(req: ScanRequest):
    try:
        chain, meta = load_chain_for(date=req.date, base=req.base)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="data not found for date/base")

    result = scan_buckets(
        chain_df=chain,
        meta=meta,
        tenor=req.tenor,
        direction=req.direction,
        return_per_bucket=req.return_per_bucket,
        min_oi=req.min_oi or 0,
        max_width=req.max_width,
    )
    return result

