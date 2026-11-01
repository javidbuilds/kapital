"""Verträge (private Rentenversicherungen, Kaution) — Wert hinterlegen."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..deps import get_df

router = APIRouter()


class ValueBody(BaseModel):
    value: float | None = None       # None = Angabe löschen, wieder "eingezahlt"
    value_date: str | None = None    # YYYY-MM-DD


@router.get("/contracts")
def get_contracts():
    from kapital.finance import contracts
    return {"contracts": contracts.evaluate(get_df())}


@router.put("/contracts/{cid}")
def set_contract_value(cid: str, body: ValueBody):
    import pandas as pd
    from kapital.finance import contracts
    items = contracts.load()
    for c in items:
        if c["id"] == cid:
            if body.value is None:
                c["value"], c["value_date"] = None, None
            else:
                d = pd.to_datetime(body.value_date or pd.Timestamp.today(), errors="coerce")
                if pd.isna(d):
                    raise HTTPException(400, "Ungültiges Datum")
                c["value"], c["value_date"] = round(float(body.value), 2), d.strftime("%Y-%m-%d")
            contracts.save(items)
            return {"ok": True, "contracts": contracts.evaluate(get_df())}
    raise HTTPException(404, f"Unbekannter Vertrag: {cid}")
