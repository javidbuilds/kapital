"""
Verträge: Vermögen, das nicht auf einem Konto oder im Depot liegt.

Private Rentenversicherungen, Lebensversicherungen mit Rückkaufswert und die
Mietkaution. Das Geld geht vom Girokonto ab und war bisher in keiner
Vermögenszahl wieder zu finden.

Wert eines Vertrags:
  - Ist ein Wert mit Stichtag hinterlegt (Rückkaufswert aus der
    Standmitteilung), gilt er — plus alle Beiträge NACH dem Stichtag. Das ist
    eine Schätzung (Kosten und Fondsentwicklung seither fehlen) und wird so
    beschriftet.
  - Ohne hinterlegten Wert: die Summe der Einzahlungen, ausdrücklich als
    "eingezahlt" beschriftet. Bei Policen liegt der echte Rückkaufswert in den
    ersten Jahren meist darunter.
  - Kaution: Summe der Zahlungen an den aktuellen Vermieter — der
    tatsächlich hinterlegte Betrag, kein Schätzwert.

Konfiguration in data/contracts.json, beim ersten Aufruf mit Vorgaben angelegt.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import pandas as pd

_PATH = Path(__file__).parents[2] / "data" / "contracts.json"

# Keine Voreinstellungen — Verträge werden in data/contracts.json angelegt.
# Beispiel (eine Liste solcher Einträge):
#   {"id": "rente1", "name": "Private Rentenversicherung", "kind": "vorsorge",
#    "match": {"field": "both", "pattern": "<Text aus dem Buchungstext>"},
#    "value": null, "value_date": null}
#   {"id": "kaution", "name": "Mietkaution", "kind": "kaution",
#    "match": {"field": "payee", "pattern": "<Vermieter>"},
#    "value": null, "value_date": null}
# "field": payee | description | both | category.
DEFAULTS: list[dict] = []


def load() -> list[dict]:
    if _PATH.exists():
        try:
            return json.loads(_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return [dict(c) for c in DEFAULTS]


def save(contracts: list[dict]) -> None:
    from .storage import write_json_atomic
    write_json_atomic(_PATH, contracts)


def _rows(df: pd.DataFrame, c: dict) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    m = c.get("match") or {}
    field, pat = m.get("field", "payee"), str(m.get("pattern", "")).lower()
    if not pat:
        return df.iloc[0:0]
    not_transfer = ~df["is_transfer"].fillna(False).astype(bool)
    if field == "category":
        sel = df["category"].fillna("").str.lower() == pat
    elif field == "both":
        sel = (df["payee"].fillna("").str.lower().str.contains(pat, regex=False)
               | df["description"].fillna("").str.lower().str.contains(pat, regex=False))
    else:
        sel = df[field].fillna("").str.lower().str.contains(pat, regex=False)
    return df[sel & not_transfer]


def evaluate(df: pd.DataFrame, contracts: Optional[list[dict]] = None) -> list[dict]:
    """Je Vertrag: eingezahlt, aktueller Wert, Herkunft des Werts."""
    out = []
    for c in (contracts if contracts is not None else load()):
        r = _rows(df, c)
        paid = float(-r["amount"].sum()) if r is not None and len(r) else 0.0
        monthly = None
        if r is not None and len(r):
            last = r.sort_values("date").tail(3)
            if (last["amount"] < 0).all():
                monthly = round(float(-last["amount"].iloc[-1]), 2)
        value, source = paid, "eingezahlt"
        if c.get("kind") == "kaution":
            source = "hinterlegt"
        if c.get("value") is not None:
            since = 0.0
            if c.get("value_date") and r is not None and len(r):
                since = float(-r.loc[r["date"] > pd.Timestamp(c["value_date"]), "amount"].sum())
            value = float(c["value"]) + since
            source = "angegeben" if abs(since) < 0.01 else "angegeben + Beiträge seither"
        out.append({
            **c,
            "paid": round(paid, 2),
            "current_value": round(value, 2),
            "source": source,
            "monthly": monthly,
            "n_payments": int(len(r)) if r is not None else 0,
            "first": r["date"].min().strftime("%Y-%m-%d") if r is not None and len(r) else None,
        })
    return out


def total(df: pd.DataFrame, kinds: Optional[set] = None) -> float:
    return round(sum(c["current_value"] for c in evaluate(df)
                     if kinds is None or c.get("kind") in kinds), 2)


def monthly_values(df: pd.DataFrame, month_ends: list[pd.Timestamp]) -> dict[str, float]:
    """Wert aller Verträge je Monatsende.

    Ohne Kursdaten der Policen: kumulierte Einzahlungen bis zum Monat. Ist ein
    Wert hinterlegt, wird die Reihe ab dem Stichtag auf ihn verschoben
    (Differenz Wert − Einzahlungen bis Stichtag), damit sie dort ankommt.
    """
    out: dict[str, float] = {}
    evals = evaluate(df)
    for c in evals:
        r = _rows(df, c)
        if r is None or not len(r):
            continue
        offset = 0.0
        vd = pd.Timestamp(c["value_date"]) if c.get("value") is not None and c.get("value_date") else None
        if vd is not None:
            offset = float(c["value"]) - float(-r.loc[r["date"] <= vd, "amount"].sum())
        for m in month_ends:
            paid = float(-r.loc[r["date"] <= m, "amount"].sum())
            v = paid + (offset if vd is not None and m >= vd else 0.0)
            key = m.strftime("%Y-%m")
            out[key] = round(out.get(key, 0.0) + max(v, 0.0), 2)
    return out
