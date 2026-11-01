"""
Ziele: Wann ist welches Geld wofür da?

Ersetzt FIRE-Rechner und Prognose. Beide rechneten dasselbe (Vermögen +
Sparrate × Rendite), nur mit anderer Zielzahl. Hier gibt es eine Rechnung
und mehrere Ziele auf einer Zeitachse.

Modell, bewusst einfach und offen gelegt:
  - Zwei Töpfe: Cash (Konten + TR-Guthaben, verzinst mit `cash_rate`) und
    investiert (Depot, verzinst mit der Szenario-Rendite).
  - Die monatliche Sparrate geht zu `invest_share` ins Depot, der Rest bleibt Cash.
  - Gerechnet wird in heutiger Kaufkraft: jede Rendite wird um die Inflation
    bereinigt. Ein Ziel über 75.000 € heißt also 75.000 € heutiger Kaufkraft.
  - Ziele werden in Reihenfolge gestapelt: Notgroschen zuerst, dann jedes
    weitere Ziel ZUSÄTZLICH. "Erreicht" heißt: das Vermögen deckt dieses Ziel
    und alle davor.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

_DATA_DIR = Path(__file__).parents[2] / "data"
_GOALS_PATH = _DATA_DIR / "ziele.json"

SCENARIOS = {
    # nominale Depotrendite p. a. — Spanne langfristiger Welt-Aktien-Renditen
    "pessimistisch": 4.0,
    "mittel": 6.5,
    "optimistisch": 8.5,
}

DEFAULT_ASSUMPTIONS = {
    "inflation": 2.5,       # % p. a. — Zielwert EZB 2 %, die letzten 12 Monate lagen höher
    "cash_rate": 1.5,       # % p. a. netto auf Cash (Mischung ING/TR nach Steuer)
    "invest_share": 50,     # % der Sparrate, die ins Depot geht
    "loan_rate": 3.5,       # % Sollzins für die Immobilienfinanzierung
    "loan_repayment": 2.0,  # % anfängliche Tilgung
    "age": 30,              # Alter heute — für die Überbrückung bis zur Rente
    "retirement_age": 67,   # Beginn gesetzliche Rente und Rentenverträge
    "state_pension": 0,     # €/Monat gesetzliche Rente, heutige Kaufkraft (Renteninformation)
    "vorsorge_return": 4.0, # % p. a. nominal für die Rentenverträge
    "pension_earned": None,         # €/Monat brutto "bereits erreicht" (Renteninformation)
    "pension_at_retirement": None,  # €/Monat brutto bei Weiterarbeit bis Rentenbeginn
    "pension_deduction_pct": 11,    # KV/PV-Abzug auf die Rente
}


def default_goals(monthly_expenses: float) -> list[dict]:
    return [
        {"id": "notgroschen", "type": "notgroschen", "name": "Notgroschen",
         "months": 6, "amount": round(monthly_expenses * 6, -2)},
        {"id": "immobilie", "type": "immobilie", "name": "Eigenkapital Immobilie",
         "price": 250_000, "equity_pct": 20, "costs_pct": 10, "max_depot_pct": 20},
        {"id": "fire", "type": "fire", "name": "Finanzielle Unabhängigkeit",
         "swr": 3.5},
    ]


def load_config() -> dict:
    try:
        if _GOALS_PATH.exists():
            return json.loads(_GOALS_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def save_config(cfg: dict) -> None:
    from .storage import write_json_atomic
    write_json_atomic(_GOALS_PATH, cfg)


def goal_amount(goal: dict, monthly_expenses: float) -> float:
    """Zielbetrag in heutigen Euro."""
    t = goal.get("type")
    if t == "notgroschen":
        months = float(goal.get("months") or 6)
        return round(monthly_expenses * months, 2)
    if t == "immobilie":
        price = float(goal.get("price") or 0)
        return round(price * (float(goal.get("equity_pct") or 0) + float(goal.get("costs_pct") or 0)) / 100, 2)
    if t == "fire":
        swr = float(goal.get("swr") or 3.5)
        return round(monthly_expenses * 12 / (swr / 100), 2) if swr > 0 else 0.0
    return float(goal.get("amount") or 0)


def _real(nominal_pct: float, inflation_pct: float) -> float:
    """Monatliche reale Rendite aus nominalem Jahreszins und Inflation."""
    r = (1 + nominal_pct / 100) / (1 + inflation_pct / 100) - 1
    return (1 + r) ** (1 / 12) - 1


def simulate(cash: float, invested: float, monthly_savings: float, invest_share: float,
             depot_return: float, cash_rate: float, inflation: float, months: int,
             vorsorge: float = 0.0, vorsorge_monthly: float = 0.0,
             vorsorge_return: float = 4.0) -> tuple[list[float], list[float], list[float]]:
    """Freies Vermögen und Rentenverträge (heutige Kaufkraft) für Monat 0..months.

    Die Vertragsbeiträge stecken in der Sparrate (Kategorie Investment) — sie
    gehen hier in den Vorsorge-Topf, der Rest in Cash und Depot.
    """
    rc, ri = _real(cash_rate, inflation), _real(depot_return, inflation)
    rv = _real(vorsorge_return, inflation)
    share = max(0.0, min(100.0, invest_share)) / 100
    free_save = max(0.0, monthly_savings - vorsorge_monthly)
    cs, inv, vors = [cash], [invested], [vorsorge]
    for _ in range(months):
        cash = cash * (1 + rc) + free_save * (1 - share)
        invested = invested * (1 + ri) + free_save * share
        vorsorge = vorsorge * (1 + rv) + vorsorge_monthly
        cs.append(cash)
        inv.append(invested)
        vors.append(vorsorge)
    return cs, inv, vors


def _first_month(series: list[float], target: float) -> Optional[int]:
    for m, v in enumerate(series):
        if v >= target:
            return m
    return None


def state_pension_net(a: dict, exit_age: float) -> float:
    """Gesetzliche Rente (netto nach KV/PV, €/Monat) bei Ausstieg mit `exit_age`.

    Aus der Renteninformation: "bereits erreicht" (bei Stopp heute) und "bei
    Weiterarbeit bis Rentenbeginn". Dazwischen linear nach Arbeitsjahren —
    jedes weitere Beitragsjahr bringt etwa gleich viel Rente dazu. Ohne diese
    Angaben gilt die feste Zahl `state_pension` (alte Eingabe).
    """
    at_end = a.get("pension_at_retirement")
    if at_end in (None, "", 0):
        return float(a.get("state_pension") or 0)
    earned = float(a.get("pension_earned") or 0)
    age = float(a.get("age") or 0)
    ret = float(a.get("retirement_age") or 67)
    frac = 1.0 if ret <= age else max(0.0, min(1.0, (exit_age - age) / (ret - age)))
    gross = earned + (float(at_end) - earned) * frac
    return gross * (1 - float(a.get("pension_deduction_pct", 11)) / 100)


def fire_required(month: int, exp_monthly: float, a: dict, depot_return: float,
                  vorsorge_at_month: float, swr: float) -> float:
    """Nötiges FREIES Vermögen, um im Monat `month` aufzuhören (heutige Kaufkraft).

    Zwei Phasen:
      1. Bis Rentenbeginn trägt das freie Vermögen die vollen Ausgaben
         (Überbrückung, Barwert einer Rente über n Jahre).
      2. Ab Rentenbeginn deckt die gesetzliche Rente einen Teil; die Lücke
         trägt ein Kapitalstock nach Entnahmerate — abzüglich dessen, was die
         Rentenverträge bis dahin wert sind. Abgezinst auf heute.
    """
    r = (1 + depot_return / 100) / (1 + a["inflation"] / 100) - 1
    rv = (1 + a.get("vorsorge_return", 4.0) / 100) / (1 + a["inflation"] / 100) - 1
    age_now = float(a.get("age") or 0) + month / 12
    n = max(0.0, float(a.get("retirement_age") or 67) - age_now)
    annual = exp_monthly * 12
    gap_after = max(0.0, annual - state_pension_net(a, age_now) * 12)
    vorsorge_at_rente = vorsorge_at_month * (1 + rv) ** n
    needed_at_rente = max(0.0, gap_after / (swr / 100) - vorsorge_at_rente) if swr > 0 else 0.0
    if n <= 0:
        return needed_at_rente
    bridge = annual * ((1 - (1 + r) ** -n) / r if r > 0 else n)
    return bridge + needed_at_rente / (1 + r) ** n


def plan(start: dict, goals: list[dict], a: dict, horizon_years: int = 35) -> dict:
    """Szenarien, Zielerreichung und Hebel."""
    months = horizon_years * 12
    exp = float(start["monthly_expenses"])
    cash0 = float(start["cash"])
    inv0 = float(start["invested"])
    save = float(start["monthly_savings"])
    vors0 = float(start.get("vorsorge") or 0.0)
    vors_m = float(start.get("vorsorge_monthly") or 0.0)

    def run(depot_return, cash=cash0, inv=inv0, savings=save, share=None):
        return simulate(cash, inv, savings, a["invest_share"] if share is None else share,
                        depot_return, a["cash_rate"], a["inflation"], months,
                        vors0, vors_m, a.get("vorsorge_return", 4.0))

    runs = {k: run(v) for k, v in SCENARIOS.items()}
    series = {k: [c + i for c, i in zip(r[0], r[1])] for k, r in runs.items()}

    def reach(goal: dict, before: float, cash: list[float], inv: list[float],
              vors: list[float], dep_ret: float):
        """(Monat, nötiger Betrag dann) — None, wenn nicht im Horizont."""
        free = [c + i for c, i in zip(cash, inv)]
        if goal.get("type") == "immobilie":
            # Aus dem Depot nur bis zum eingestellten Anteil — der Rest muss aus
            # Cash kommen (Vorgabe: höchstens 20 % des Depots verkaufen).
            amt = goal_amount(goal, exp)
            share = float(goal.get("max_depot_pct", 100)) / 100
            for m in range(len(cash)):
                if (cash[m] - before) + inv[m] * share >= amt:
                    return m, amt
            return None, amt
        if goal.get("type") != "fire":
            amt = goal_amount(goal, exp)
            m = _first_month(free, before + amt)
            return m, amt
        swr = float(goal.get("swr") or 3.5)
        for m in range(len(free)):
            need = fire_required(m, exp, a, dep_ret, vors[m], swr)
            if free[m] - before >= need:
                return m, need
        return None, fire_required(0, exp, a, dep_ret, vors[0], swr)

    # Ziele stapeln
    cum = 0.0
    goal_rows = []
    for g in goals:
        res = {k: reach(g, cum, *runs[k], SCENARIOS[k]) for k in SCENARIOS}
        amt = res["mittel"][1]
        row = {**g, "amount": round(amt, 2), "cumulative": round(cum + amt, 2),
               "reached_months": {k: res[k][0] for k in SCENARIOS}}
        if g.get("type") == "immobilie":
            price = float(g.get("price") or 0)
            loan = price * (1 + float(g.get("costs_pct") or 0) / 100) - amt
            rate = loan * (a["loan_rate"] + a["loan_repayment"]) / 100 / 12
            row["loan"] = round(loan, 2)
            row["monthly_rate"] = round(rate, 2)
        if g.get("type") == "fire":
            m = res["mittel"][0]
            swr = float(g.get("swr") or 3.5)
            row["passive_income"] = round(exp, 2)
            row["age_at"] = round(float(a.get("age") or 0) + m / 12, 1) if m is not None and a.get("age") else None
            exit_age = (float(a.get("age") or 0) + m / 12) if m is not None else float(a.get("retirement_age") or 67)
            row["state_pension"] = round(state_pension_net(a, exit_age), 2)
            row["state_pension_mode"] = "renteninformation" if a.get("pension_at_retirement") else "fest"
            row["vorsorge_now"] = round(vors0, 2)
            row["simple_target"] = round(goal_amount(g, exp), 2)   # alte Rechnung, zum Vergleich
        goal_rows.append(row)
        cum += amt

    # Hebel: Effekt auf das letzte Ziel im mittleren Szenario
    last = goals[-1] if goals else None
    before_last = sum(r["amount"] for r in goal_rows[:-1]) if goal_rows else 0.0

    def last_month(cash, inv, vors):
        return reach(last, before_last, cash, inv, vors, SCENARIOS["mittel"])[0] if last else None

    base_m = last_month(*runs["mittel"])
    levers = []
    notgroschen = next((goal_amount(g, exp) for g in goals if g.get("type") == "notgroschen"), 0.0)
    surplus_cash = max(0.0, cash0 - notgroschen)

    def lever(label, detail, r):
        m = last_month(*r)
        delta = (base_m - m) if (base_m is not None and m is not None) else None
        levers.append({"label": label, "detail": detail, "months": m, "delta_months": delta})

    if surplus_cash > 1000:
        lever("Cash über den Notgroschen investieren",
              f"{surplus_cash:,.0f} € vom Cash ins Depot".replace(",", "."),
              run(SCENARIOS["mittel"], cash=cash0 - surplus_cash, inv=inv0 + surplus_cash))
    if a["invest_share"] < 100:
        lever("Ganze Sparrate investieren", "100 % statt "
              f"{a['invest_share']:.0f} % der Sparrate ins Depot",
              run(SCENARIOS["mittel"], share=100))
    lever("200 € mehr sparen", "Sparrate +200 € im Monat",
          run(SCENARIOS["mittel"], savings=save + 200))
    lever("200 € weniger sparen", "Sparrate −200 € im Monat",
          run(SCENARIOS["mittel"], savings=max(0.0, save - 200)))

    yearly = [
        {"year": y, **{k: round(series[k][y * 12], 2) for k in SCENARIOS}}
        for y in range(horizon_years + 1)
    ]
    return {"yearly": yearly, "goals": goal_rows, "levers": levers,
            "scenarios": SCENARIOS, "target_total": round(cum, 2),
            "base_months": base_m}
