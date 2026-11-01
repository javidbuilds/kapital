"""Ziele: FIRE-Rechner und Prognose in einer Seite."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..deps import get_df

router = APIRouter()


def _start() -> dict:
    from kapital.finance import networth as nw, budgets

    from kapital.backend.app_settings import load_settings

    df = get_df()
    cur = nw.current(df)
    # Dieselbe Auswahl "was ist einmalig" wie die Grundlast auf der Übersicht —
    # sonst zeigen beide Seiten verschiedene Grundlasten.
    settings = load_settings()
    cats = settings.get("baseline_excluded_categories")
    if cats is None:
        cats = list(budgets.DEFAULT_BASELINE_EXCLUDED)
    b = budgets.baseline(df, months=6, exclude_categories=cats)
    income = float(b.get("avg_income") or 0)
    spend_all = float(b.get("avg_spend_incl_all") or 0)
    return {
        "cash": round(cur["liquid"] + cur["broker_cash"], 2),
        "liquid": round(cur["liquid"], 2),
        "broker_cash": round(cur["broker_cash"], 2),
        # Rentenversicherungen und Kaution NICHT: bis zur Rente bzw. bis zum
        # Auszug gebunden — für Notgroschen oder Eigenkapital nicht verfügbar.
        "invested": round((cur["depot"] or 0.0) + (cur.get("crypto") or 0.0), 2),
        "crypto": round(cur.get("crypto") or 0.0, 2),
        "total": round(cur["liquid"] + cur["broker_cash"] + (cur["depot"] or 0.0)
                       + (cur.get("crypto") or 0.0), 2),
        "gebunden": round(cur.get("contracts") or 0.0, 2),
        # Rentenverträge zählen NUR für die finanzielle Unabhängigkeit, ab Rentenbeginn
        "vorsorge": round(cur.get("contracts_vorsorge") or 0.0, 2),
        "vorsorge_monthly": round(sum((c.get("monthly") or 0.0) for c in cur.get("contract_list", [])
                                      if c.get("kind") == "vorsorge"), 2),
        "monthly_income": round(income, 2),
        "monthly_expenses": round(float(b.get("avg_spend") or 0), 2),
        "monthly_expenses_all": round(spend_all, 2),
        # Realistisch: Einnahmen minus ALLE Ausgaben, Urlaube und Sonderausgaben
        # eingeschlossen — die kommen jedes Jahr wieder. Die Grundlast-Sparrate
        # (ohne Einmaliges) wäre die Obergrenze.
        "monthly_savings_real": round(max(income - spend_all, 0), 2),
        "monthly_savings_max": round(float(b.get("avg_savings") or 0), 2),
        "window": b.get("months", []),
    }


class PlanBody(BaseModel):
    goals: list[dict] | None = None
    assumptions: dict | None = None
    monthly_savings: float | None = None
    save: bool = True


@router.get("/ziele")
def get_ziele():
    from kapital.finance import ziele as z
    start = _start()
    cfg = z.load_config()
    goals = cfg.get("goals") or z.default_goals(start["monthly_expenses"])
    a = {**z.DEFAULT_ASSUMPTIONS, **(cfg.get("assumptions") or {})}
    savings = cfg.get("monthly_savings")
    if savings is None:
        savings = start["monthly_savings_real"]
    result = z.plan({**start, "monthly_savings": savings}, goals, a)
    return {"start": start, "goals_config": goals, "assumptions": a,
            "monthly_savings": savings, **result}


@router.post("/ziele")
def post_ziele(body: PlanBody):
    from kapital.finance import ziele as z
    start = _start()
    cfg = z.load_config()
    goals = body.goals if body.goals is not None else (cfg.get("goals") or z.default_goals(start["monthly_expenses"]))
    a = {**z.DEFAULT_ASSUMPTIONS, **(cfg.get("assumptions") or {}), **(body.assumptions or {})}
    # Kein Wert im Body = "realistisch" (aus den Daten), nicht der alte gespeicherte.
    savings = body.monthly_savings
    if savings is None:
        savings = start["monthly_savings_real"]
    if body.save:
        z.save_config({"goals": goals, "assumptions": a,
                       "monthly_savings": body.monthly_savings})
    result = z.plan({**start, "monthly_savings": savings}, goals, a)
    return {"start": start, "goals_config": goals, "assumptions": a,
            "monthly_savings": savings, **result}
