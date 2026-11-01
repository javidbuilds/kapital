"""
Krypto-Bestand (Kraken): Menge, Einstand, aktueller Wert, Steuerfreiheit.

Quelle sind die Kraken-Buchungen im Bestand (isin = "CRYPTO:<Kürzel>"). Die
Kurse kommen bei Bedarf von yfinance (BTC-EUR, ETH-EUR); Stablecoins (USDC,
USDT, USDG) werden als 1 USD gerechnet und mit EUR/USD umgerechnet.

Steuer (Deutschland, § 23 EStG): Gewinne aus privaten Krypto-Verkäufen sind
nach mehr als einem Jahr Haltedauer steuerfrei. Gerechnet wird je Kauf-Tranche
nach FIFO — so, wie das Finanzamt es annimmt.
"""
from __future__ import annotations

import logging
from typing import Optional

import pandas as pd

log = logging.getLogger(__name__)

ACCOUNT = "Kraken"
# Kraken hat USDT 2025 zwangsweise in USDC umgetauscht: eine Position.
SUCCESSION = {"USDT": "USDC"}
STABLE_USD = {"USDC", "USDT", "USDG"}
YF_TICKER = {"BTC": "BTC-EUR", "ETH": "ETH-EUR", "SOL": "SOL-EUR"}
NAMES = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana",
         "USDC": "USD Coin", "USDT": "Tether", "USDG": "Global Dollar"}


def _rows(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty or "isin" not in df.columns:
        return pd.DataFrame()
    r = df[(df["account"] == ACCOUNT) & df["isin"].fillna("").str.startswith("CRYPTO:")].copy()
    if r.empty:
        return r
    r["sym"] = r["isin"].str.split(":").str[1].map(lambda s: SUCCESSION.get(s, s))
    r["units"] = pd.to_numeric(r["units"], errors="coerce").fillna(0.0)
    # Bei gleichem Datum Abgänge vor Zugängen (Umtausch: erst raus, dann rein)
    r["_order"] = (r["units"] > 0).astype(int)
    return r.sort_values(["date", "_order"])


def _prices(symbols: list[str]) -> dict[str, Optional[float]]:
    """Aktueller EUR-Kurs je Kürzel (gecacht wie die Depot-Kurse)."""
    from .performance import _cached

    def load():
        out: dict[str, Optional[float]] = {}
        try:
            import yfinance as yf
        except ImportError:
            return {s: None for s in symbols}
        eurusd = None
        if any(s in STABLE_USD for s in symbols):
            try:
                eurusd = float(yf.Ticker("EURUSD=X").fast_info.last_price or 0) or None
            except Exception:
                eurusd = None
        for s in symbols:
            try:
                if s in STABLE_USD:
                    out[s] = (1.0 / eurusd) if eurusd else None
                elif s in YF_TICKER:
                    out[s] = float(yf.Ticker(YF_TICKER[s]).fast_info.last_price or 0) or None
                else:
                    out[s] = None
            except Exception:
                log.info("Kurs für %s nicht ladbar", s)
                out[s] = None
        return out

    return _cached("crypto|" + ",".join(sorted(symbols)), 3600, load)


def positions(df: pd.DataFrame, today: Optional[pd.Timestamp] = None) -> list[dict]:
    """Bestand je Coin mit FIFO-Tranchen, Einstand, Wert und Steuerfreiheit."""
    today = (today or pd.Timestamp.today()).normalize()
    r = _rows(df)
    if r.empty:
        return []

    lots: dict[str, list[dict]] = {}
    realized: dict[str, float] = {}
    carry: dict[str, list[tuple]] = {}   # Einstand aus Umtausch-Abgängen
    for _, x in r.iterrows():
        s, u, amt = x["sym"], float(x["units"]), float(x["amount"])
        book = lots.setdefault(s, [])
        if u > 0:
            if amt < 0:
                cost = -amt
            elif carry.get(s):
                cost = sum(c for c, _ in carry.pop(s))
            else:
                cost = 0.0   # Staking, Bonus: Zugang ohne Kosten
            book.append({"date": x["date"], "units": u, "cost": cost})
        elif u < 0:
            need = -u
            consumed_cost = 0.0
            while need > 1e-12 and book:
                lot = book[0]
                take = min(need, lot["units"])
                part = lot["cost"] * take / lot["units"] if lot["units"] else 0.0
                lot["units"] -= take
                lot["cost"] -= part
                consumed_cost += part
                need -= take
                if lot["units"] <= 1e-12:
                    book.pop(0)
            if amt > 0:      # Verkauf gegen EUR
                realized[s] = realized.get(s, 0.0) + amt - consumed_cost
            else:            # Umtausch: Einstand wandert zum Zugang
                carry.setdefault(s, []).append((consumed_cost, x["date"]))

    syms = [s for s, b in lots.items() if sum(l["units"] for l in b) > 1e-9]
    prices = _prices(syms)
    out = []
    for s in syms:
        book = [l for l in lots[s] if l["units"] > 1e-12]
        units = sum(l["units"] for l in book)
        cost = sum(l["cost"] for l in book)
        price = prices.get(s)
        value = units * price if price else None
        free_from = []
        free_units = 0.0
        for l in book:
            d = l["date"] + pd.DateOffset(years=1) + pd.Timedelta(days=1)
            if d <= today:
                free_units += l["units"]
            else:
                free_from.append({"date": d.strftime("%Y-%m-%d"), "units": l["units"],
                                  "cost": round(l["cost"], 2)})
        out.append({
            "symbol": s,
            "name": NAMES.get(s, s),
            "units": units,
            "cost": round(cost, 2),
            "price": round(price, 2) if price else None,
            "value": round(value, 2) if value is not None else None,
            "pl": round(value - cost, 2) if value is not None else None,
            "pl_pct": round((value - cost) / cost * 100, 1) if value is not None and cost > 0 else None,
            "realized": round(realized.get(s, 0.0), 2),
            "tax_free_units": free_units,
            "tax_free_share": round(free_units / units * 100, 1) if units else 0.0,
            "pending_lots": free_from,
            "is_stable": s in STABLE_USD,
        })
    out.sort(key=lambda p: (p["value"] or p["cost"]), reverse=True)
    return out


def total_value(df: pd.DataFrame) -> Optional[float]:
    """Gesamtwert des Krypto-Bestands in EUR; ohne Kurs zählt der Einstand."""
    try:
        pos = positions(df)
    except Exception:
        log.exception("Krypto-Bestand nicht berechenbar")
        return None
    if not pos:
        return None
    return round(sum(p["value"] if p["value"] is not None else p["cost"] for p in pos), 2)


def sales_by_year(df: pd.DataFrame, year: int) -> dict:
    """Krypto-Verkäufe eines Jahres, getrennt in steuerfrei / steuerpflichtig.

    Steuerpflichtig ist nur der Teil, der zum Verkaufszeitpunkt ein Jahr oder
    kürzer gehalten wurde (FIFO). Freigrenze 1.000 € für alle privaten
    Veräußerungsgeschäfte zusammen (ab 2024).
    """
    r = _rows(df)
    out = {"year": year, "n_sales": 0, "proceeds": 0.0, "gain_taxable": 0.0,
           "gain_tax_free": 0.0, "freigrenze": 1000.0}
    if r.empty:
        return out
    lots: dict[str, list[dict]] = {}
    carry: dict[str, list[float]] = {}
    for _, x in r.iterrows():
        s, u, amt, d = x["sym"], float(x["units"]), float(x["amount"]), x["date"]
        book = lots.setdefault(s, [])
        if u > 0:
            cost = -amt if amt < 0 else (sum(carry.pop(s)) if carry.get(s) else 0.0)
            book.append({"date": d, "units": u, "cost": cost})
            continue
        need, gain_t, gain_f, cost_sum = -u, 0.0, 0.0, 0.0
        sold = need
        while need > 1e-12 and book:
            lot = book[0]
            take = min(need, lot["units"])
            part = lot["cost"] * take / lot["units"] if lot["units"] else 0.0
            share = take / sold if sold else 0.0
            g = amt * share - part if amt > 0 else 0.0
            if amt > 0:
                if d > lot["date"] + pd.DateOffset(years=1):
                    gain_f += g
                else:
                    gain_t += g
            cost_sum += part
            lot["units"] -= take
            lot["cost"] -= part
            need -= take
            if lot["units"] <= 1e-12:
                book.pop(0)
        if amt <= 0:
            carry.setdefault(s, []).append(cost_sum)
        elif d.year == year:
            out["n_sales"] += 1
            out["proceeds"] += amt
            out["gain_taxable"] += gain_t
            out["gain_tax_free"] += gain_f
    for k in ("proceeds", "gain_taxable", "gain_tax_free"):
        out[k] = round(out[k], 2)
    return out


def monthly_values(df: pd.DataFrame, month_ends: list[pd.Timestamp]) -> dict[str, dict]:
    """Krypto-Marktwert und Einstand je Monatsende.

    Rückgabe: {"YYYY-MM": {"value": €, "cost": €}}. Einstand = netto
    investierte Euro (Käufe minus Verkaufserlöse) bis dahin.
    """
    r = _rows(df)
    if r.empty or not month_ends:
        return {}
    from .performance import load_histories, _series

    syms = sorted(set(r["sym"]))
    start = (r["date"].min() - pd.Timedelta(days=10)).strftime("%Y-%m-%d")
    tickers = [YF_TICKER[s] for s in syms if s in YF_TICKER]
    if any(s in STABLE_USD for s in syms):
        tickers.append("EURUSD=X")
    hist = load_histories(tickers, start)
    px = {s: _series(hist[YF_TICKER[s]]) for s in syms if s in YF_TICKER and YF_TICKER[s] in hist}
    eurusd = _series(hist["EURUSD=X"]) if "EURUSD=X" in hist else None

    def price(s, when):
        if s in STABLE_USD:
            if eurusd is None:
                return None
            e = eurusd[eurusd.index <= when]
            return (1.0 / float(e.iloc[-1])) if not e.empty and e.iloc[-1] else None
        ser = px.get(s)
        if ser is None:
            return None
        ser = ser[ser.index <= when]
        return float(ser.iloc[-1]) if not ser.empty else None

    out = {}
    for m in month_ends:
        upto = r[r["date"] <= m]
        if upto.empty:
            continue
        held = upto.groupby("sym")["units"].sum()
        cost = float(-upto["amount"].sum())
        value = 0.0
        for s, u in held.items():
            if u <= 1e-12:
                continue
            p = price(s, m)
            value += u * p if p else 0.0
        out[m.strftime("%Y-%m")] = {"value": round(value, 2), "cost": round(cost, 2)}
    return out
