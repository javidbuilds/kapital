"""Vermögen — die eine Quelle für "wie viel habe ich" und "wie viel kann ich sparen".

Vorher beantworteten drei Seiten dieselbe Frage verschieden: die Übersicht mit
kalibrierten Salden, die Prognose mit dem rohen Zahlungsstrom (deutlich daneben),
und FIRE gar nicht — die fragte den Nutzer. Genau wie bei den vier
Ausgaben-Definitionen gilt: eine Zahl, eine Funktion, alle Seiten fragen dort.

Was hier NICHT passiert: eine Depotwert-Historie erfinden. Der Depotauszug ist
eine Momentaufnahme ohne Verlauf, und Kurse rückwirkend zu beschaffen wäre
geraten. Die Historie zeigt deshalb liquides Vermögen exakt und eingesetztes
Kapital zum Einstand — beides beschriftet, damit niemand einen Marktwert
hineinliest, der nicht da ist.
"""
from __future__ import annotations

import logging
from typing import Optional

import pandas as pd

from . import storage

log = logging.getLogger(__name__)


def _norm(v) -> str:
    return str(v or "").replace(" ", "").upper()


def account_display_groups(df: pd.DataFrame) -> dict[str, list[str]]:
    """Anzeigename -> alle rohen account_label, die dasselbe Konto bezeichnen.

    Der in der Parquet gespeicherte `account_label` ist der Wert vom
    Importzeitpunkt und friert ein: derselbe Bestand trägt dasselbe Konto als
    "Giro", als IBAN mit Leerzeichen und als IBAN ohne Leerzeichen. Eine
    spätere Umbenennung landet nur in iban_labels.json und erreicht die
    gespeicherten Zeilen nie.

    Deshalb wird der Anzeigename immer hier aufgelöst und nie aus der Parquet
    gelesen — sonst zeigt ein Kontofilter rohe IBANs an und zerlegt ein Konto
    in mehrere Einträge, von denen jeder nur einen Teil der Buchungen trifft.
    """
    if df is None or df.empty or "account_label" not in df.columns:
        return {}
    labels = storage.load_iban_labels() or {}
    label_by_norm = {_norm(k): v for k, v in labels.items()}
    groups: dict[str, list[str]] = {}
    for raw in df["account_label"].dropna().unique():
        display = label_by_norm.get(_norm(raw)) or str(raw)
        groups.setdefault(display, []).append(raw)
    return groups


def account_balances(df: pd.DataFrame) -> list[dict]:
    """Salden je Konto — zusammengeführt und kalibriert.

    Zusammenführung über den ANZEIGENAMEN: dasselbe Konto liegt im Bestand
    unter mehreren Bezeichnungen (IBAN mit und ohne Leerzeichen, bei
    Altimporten auch als blosser Name). Ohne die Auflösung über
    iban_labels.json erscheint ein Konto mehrfach und ein hinterlegter Saldo
    wird doppelt gezählt.

    Der Saldo läuft immer über die GESAMTE Historie, nie über einen
    Datumsfilter — ein Kontostand, der sich beim Umschalten des Zeitraums
    ändert, ist keiner.
    """
    if df is None or df.empty:
        return []

    balances = storage.load_giro_balances() or {}

    # Je Konto der jüngste Eintrag. Ein Saldo mit Stichtag wird um alle
    # Buchungen DANACH fortgeschrieben; ohne Stichtag gilt er wie bisher als
    # aktueller Stand (dann steht er still, bis ein neuer Import ihn ersetzt).
    cal_by_norm: dict[str, tuple[float, str]] = {}
    for k, v in balances.items():
        bal = v.get("balance") if isinstance(v, dict) else v
        when = (v.get("date") or "") if isinstance(v, dict) else ""
        if bal is None:
            continue
        prev = cal_by_norm.get(_norm(k))
        if prev is None or when > prev[1]:
            cal_by_norm[_norm(k)] = (float(bal), when)

    groups = account_display_groups(df)

    out = []
    for display, raw_labels in groups.items():
        sub = df[df["account_label"].isin(raw_labels)]
        flow = float(sub["amount"].sum())
        cal = cal_by_norm.get(_norm(display)) or cal_by_norm.get(_norm(raw_labels[0]))
        bal = None
        if cal is not None:
            bal, when = cal
            if when:
                # Echtes Buchungsdatum: eine Miete vom 1.11., die für Oktober
                # zählt, ist trotzdem erst nach einem Saldo vom Monatsletzten gebucht.
                booked = sub["date"]
                if "booking_date" in sub.columns:
                    bd = pd.to_datetime(sub["booking_date"], errors="coerce")
                    booked = bd.where(bd.notna(), sub["date"])
                bal += float(sub.loc[booked > pd.Timestamp(when), "amount"].sum())
        acc_type = sub["account"].iloc[0] if len(sub) else "Giro"
        # Trade Republic: der CSV-Export reicht bis zur Kontoeröffnung zurück,
        # die Summe aller Buchungen IST der Saldo (centgenau mit dem
        # Kontoauszug abgeglichen). Kein Grund, ihn als unsicher zu markieren.
        if bal is None and acc_type in ("Trade Republic", "Kraken"):
            bal = flow
        out.append({
            "id": raw_labels[0],
            "name": display,
            "raw_labels": raw_labels,
            "type": acc_type,
            "balance": bal if bal is not None else flow,
            "flow": round(flow, 2),
            "calibrated": bal is not None,
            # Differenz zwischen hinterlegtem Stand und importiertem Fluss:
            # das ist der Anfangssaldo vor dem ersten Import.
            "opening": round(bal - flow, 2) if bal is not None else 0.0,
        })
    # Ein Krypto-Konto ist fast immer 0 € Bargeld — der Wert steckt im Bestand.
    # Ohne dieses Feld zeigte jede Kontoliste "Kraken 0,00 €". `balance` bleibt
    # bewusst das Bargeld (Summen über Konten zählen den Bestand nicht doppelt),
    # `holdings` ist der Krypto-Wert dazu.
    if any(a["type"] == "Kraken" for a in out):
        from . import crypto as _crypto
        hv = _crypto.total_value(df)
        for a in out:
            if a["type"] == "Kraken":
                a["holdings"] = hv
    out.sort(key=lambda a: abs(a["balance"] + (a.get("holdings") or 0)), reverse=True)
    return out


def depot_value() -> Optional[float]:
    """Aktueller Depotwert laut Depotauszug. None, wenn keiner importiert ist."""
    snap = storage.load_depot_snapshot()
    if snap is None or snap.empty or "current_value" not in snap.columns:
        return None
    val = pd.to_numeric(snap["current_value"], errors="coerce").sum()
    return round(float(val), 2) if pd.notna(val) else None


def current(df: pd.DataFrame) -> dict:
    """Aktuelles Vermögen: liquide Konten + Depot."""
    accounts = account_balances(df)
    # Trade Republic ist ein Verrechnungskonto, kein Girokonto — sein Saldo ist
    # freies Guthaben und wird separat ausgewiesen, damit er nicht doppelt
    # neben dem Depotwert steht.
    brokers = ("Trade Republic", "Kraken")
    liquid = sum(a["balance"] for a in accounts if a["type"] not in brokers)
    broker_cash = sum(a["balance"] for a in accounts if a["type"] in brokers)
    depot = depot_value()
    snap_date = storage.load_depot_snapshot_date()
    from . import crypto as _crypto
    crypto = _crypto.total_value(df)
    from . import contracts as _contracts
    contract_list = _contracts.evaluate(df)
    contracts_total = round(sum(c["current_value"] for c in contract_list), 2)

    total = liquid + broker_cash + (depot or 0.0) + (crypto or 0.0) + contracts_total
    return {
        "liquid": round(liquid, 2),
        "broker_cash": round(broker_cash, 2),
        "depot": depot,
        "depot_as_of": snap_date,
        "crypto": crypto,
        "contracts": contracts_total,
        "contracts_vorsorge": round(sum(c["current_value"] for c in contract_list if c.get("kind") == "vorsorge"), 2),
        "contract_list": contract_list,
        "total": round(total, 2),
        "accounts": accounts,
        "uncalibrated": [a["name"] for a in accounts if not a["calibrated"]],
    }


def history(df: pd.DataFrame, months: int = 36) -> dict:
    """Vermögensverlauf je Monat.

    Rückwärts gerechnet: der heutige kalibrierte Saldo ist der Anker, davon
    werden die bekannten Bewegungen abgezogen. Das ist genauer als vorwärts zu
    kumulieren, weil der Anfangssaldo vor dem ersten Import unbekannt ist —
    genau daran ist die Prognose bisher gescheitert.

    `invested` ist das eingesetzte Kapital zum EINSTAND, kein Marktwert. Eine
    Marktwert-Historie gibt der Depotauszug nicht her, und sie zu schätzen
    hiesse, eine Zahl zu erfinden.
    """
    if df is None or df.empty:
        return {"months": [], "series": [], "note": ""}

    accounts = account_balances(df)
    anchor = sum(a["balance"] for a in accounts)

    real = df.copy()
    real["ym"] = real["date"].dt.to_period("M")
    all_months = sorted(real["ym"].unique())
    if not all_months:
        return {"months": [], "series": [], "note": ""}
    window = all_months[-months:]

    # Netto-Zufluss je Monat über alle Konten (Umbuchungen heben sich auf).
    per_month = real.groupby("ym")["amount"].sum()

    # Vom heutigen Stand rückwärts: Stand am Ende von Monat m.
    end_balance: dict[pd.Period, float] = {}
    running = anchor
    for m in reversed(all_months):
        end_balance[m] = running
        running -= float(per_month.get(m, 0.0))

    # Depot und Krypto zum MARKTWERT je Monatsende. Vorher zeigte der Verlauf
    # nur die Konten — die Linie endete weit unter der Kennzahl darüber.
    # Die Depot-Reihe kommt aus derselben Rechnung wie Portfolio → Entwicklung
    # (Stück × Monatsendkurs, Splits berücksichtigt, am Stichtag = Depotauszug).
    depot_by_m: dict[str, dict] = {}
    try:
        from . import performance as _perf
        tr = df[df["account"] == "Trade Republic"]
        if not tr.empty:
            p = _perf.performance(tr, storage.load_depot_snapshot(),
                                  storage.load_depot_snapshot_date())
            depot_by_m = {r["month"]: r for r in p.get("months", [])}
    except Exception:
        log.exception("Depot-Verlauf nicht berechenbar")
    crypto_by_m: dict[str, dict] = {}
    try:
        from . import crypto as _crypto
        ends = [min(m.end_time.normalize(), pd.Timestamp.today().normalize()) for m in window]
        crypto_by_m = _crypto.monthly_values(df, ends)
    except Exception:
        log.exception("Krypto-Verlauf nicht berechenbar")

    contracts_by_m: dict[str, float] = {}
    try:
        from . import contracts as _contracts
        ends = [min(m.end_time.normalize(), pd.Timestamp.today().normalize()) for m in window]
        contracts_by_m = _contracts.monthly_values(df, ends)
    except Exception:
        log.exception("Vertrags-Verlauf nicht berechenbar")

    rows = []
    for m in window:
        key = str(m)
        cash = float(end_balance.get(m, 0.0))
        d = depot_by_m.get(key) or {}
        c = crypto_by_m.get(key) or {}
        depot_v = float(d.get("value") or 0.0)
        crypto_v = float(c.get("value") or 0.0)
        # Einstand: was in Depot und Krypto netto hineingeflossen ist. Konten +
        # Einstand = Vermögen OHNE Kursgewinne; der Abstand zur Oberkante ist
        # das, was der Markt dazugegeben (oder genommen) hat.
        cost = float(d.get("invested") or 0.0) + float(c.get("cost") or 0.0)
        contr_v = float(contracts_by_m.get(key, 0.0))
        rows.append({
            "month": key,
            "wealth": round(cash, 2),                 # Konten (wie bisher)
            "depot": round(depot_v, 2),
            "crypto": round(crypto_v, 2),
            "contracts": round(contr_v, 2),
            "total": round(cash + depot_v + crypto_v + contr_v, 2),
            # Verträge stehen ohnehin zum Einzahlungs-/Angabewert, nicht zum Kurs
            "without_market": round(cash + cost + contr_v, 2),
            "invested": round(cost, 2),
        })

    # Letzter Punkt = die Kennzahl oben auf der Seite (Depotauszug, aktueller
    # Krypto-Kurs) — sonst endet die Kurve ein paar hundert Euro daneben.
    if rows:
        cur = current(df)
        last = rows[-1]
        last["depot"] = round(float(cur["depot"] or last["depot"]), 2)
        last["crypto"] = round(float(cur.get("crypto") or last["crypto"]), 2)
        shift = float(cur.get("contracts") or 0.0) - last.get("contracts", 0.0)
        last["contracts"] = round(float(cur.get("contracts") or 0.0), 2)
        last["without_market"] = round(last["without_market"] + shift, 2)
        last["total"] = round(last["wealth"] + last["depot"] + last["crypto"] + last["contracts"], 2)

    note = ""
    if any(not a["calibrated"] for a in accounts):
        names = ", ".join(a["name"] for a in accounts if not a["calibrated"])
        note = (f"Für {names} ist kein Kontostand hinterlegt — dort zählt nur der "
                f"importierte Zahlungsstrom, der Verlauf ist um den unbekannten "
                f"Anfangssaldo verschoben.")
    return {"months": [r["month"] for r in rows], "series": rows, "note": note,
            "anchor": round(anchor, 2)}


def savings_capacity(df: pd.DataFrame, months: int = 6) -> dict:
    """Monatliche Sparfähigkeit — die Grundlast-Zahl, nicht der Rohschnitt.

    Prognose und FIRE haben bisher `ersparnis` aus monthly_summary gemittelt.
    Diese Zahl enthält den Erstattungsterm und schwankt mit jedem Urlaubsmonat;
    als Grundlage einer Hochrechnung über Jahrzehnte taugt sie nicht.
    """
    from . import budgets
    b = budgets.baseline(df, months=months)
    return {
        "monthly_savings": b["avg_savings"],
        "monthly_expenses": b["avg_spend"],
        "monthly_income": b["avg_income"],
        "basis_months": b["n_months"],
        "window": b["months"],
        "excluded_categories": b["excluded_categories"],
        "excluded_avg": b["excluded_avg"],
    }


def darlehen(df: pd.DataFrame) -> dict:
    """Offene Darlehen je Person.

    Geliehenes Geld ist eine Forderung und gehört damit zum Vermögen — es ist
    nur gerade nicht auf dem Konto. Deshalb steht das hier und nicht in den
    Ausgaben.

    Vorzeichen: eine Zahlung AN jemanden (negativ) erhöht die Forderung, eine
    Tilgung VON jemandem (positiv) senkt sie. Der Saldo ist das, was noch
    offen ist.
    """
    from .models import LOAN_CATEGORY

    if df is None or df.empty:
        return {"total_offen": 0.0, "personen": [], "n_bookings": 0}

    r = df[(df["category"] == LOAN_CATEGORY)
           & ~df["is_transfer"].fillna(False).astype(bool)].copy()
    if r.empty:
        return {"total_offen": 0.0, "personen": [], "n_bookings": 0}

    personen = []
    for payee, g in r.groupby(r["payee"].fillna("").str.strip()):
        if not payee:
            payee = "ohne Empfänger"
        verliehen = float(abs(g[g["amount"] < 0]["amount"].sum()))
        getilgt = float(g[g["amount"] > 0]["amount"].sum())
        offen = verliehen - getilgt
        letzte = g["date"].max()
        # Tilgt jemand regelmässig, lässt sich abschätzen, wann er durch ist.
        tilgungen = g[g["amount"] > 0].sort_values("date")
        rate = float(tilgungen["amount"].tail(6).median()) if len(tilgungen) >= 3 else 0.0
        monate_rest = int(round(offen / rate)) if rate > 0 and offen > 0 else None
        personen.append({
            "person": str(payee),
            "verliehen": round(verliehen, 2),
            "getilgt": round(getilgt, 2),
            "offen": round(offen, 2),
            "n": int(len(g)),
            "letzte_bewegung": letzte.strftime("%Y-%m-%d") if pd.notna(letzte) else None,
            "tilgungsrate": round(rate, 2) if rate else None,
            "monate_bis_getilgt": monate_rest,
        })
    personen.sort(key=lambda p: abs(p["offen"]), reverse=True)
    return {
        "total_offen": round(sum(p["offen"] for p in personen), 2),
        "personen": personen,
        "n_bookings": int(len(r)),
    }
