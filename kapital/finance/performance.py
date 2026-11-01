"""
Depot-Wertentwicklung über die Zeit — gegen einen Index-ETF und gegen die
Inflation in Deutschland.

Drei Fragen, eine Rechnung:
  1. Was war das Depot an jedem Monatsende wert?  (Stück × Kurs, in EUR)
  2. Was wäre es wert, hätte man JEDE Ein- und Auszahlung am selben Tag in
     einen Vergleichs-ETF gesteckt?  (gleiche Cashflows, anderer Inhalt)
  3. Was müsste das eingesetzte Geld wert sein, nur um seine Kaufkraft zu
     halten?  (jede Einzahlung mit dem HVPI Deutschland fortgeschrieben)

Der Vergleich über identische Cashflows ist der faire: er bewertet die
Auswahl der Papiere, nicht das Timing der Sparraten.

Datenquellen (nur bei Bedarf, mit Cache in data/):
  - Kurse und Splits: yfinance
  - Inflation: Eurostat, HVPI Deutschland (prc_hicp_minr, TOTAL, 2015=100)
"""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

import pandas as pd

from . import portfolio as pf

log = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).parents[2] / "data"
_AUTO_TICKER_PATH = _DATA_DIR / "isin_tickers_auto.json"
_PRICE_CACHE_PATH = _DATA_DIR / "price_history_cache.json"
_HICP_CACHE_PATH = _DATA_DIR / "inflation_de.json"

# Vergleichs-ETFs: alle in EUR an Xetra gehandelt, thesaurierend (bis auf den
# DAX-ETF) — damit ist der Kurs schon die Gesamtrendite.
BENCHMARKS: dict[str, dict] = {
    "msci_world": {"ticker": "EUNL.DE", "label": "MSCI World",
                   "desc": "iShares Core MSCI World (1.500 Firmen, 23 Industrieländer)"},
    "ftse_all_world": {"ticker": "VWCE.DE", "label": "FTSE All-World",
                       "desc": "Vanguard FTSE All-World (Industrie- + Schwellenländer)"},
    "sp500": {"ticker": "SXR8.DE", "label": "S&P 500",
              "desc": "iShares Core S&P 500 (500 größte US-Firmen)"},
    "dax": {"ticker": "EXS1.DE", "label": "DAX",
            "desc": "iShares Core DAX (40 größte deutsche Firmen)"},
}

_EUROSTAT_URL = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
    "prc_hicp_minr?geo=DE&coicop18=TOTAL&unit=I15&sinceTimePeriod=2015-01"
)

# Kurse ändern sich während einer Sitzung kaum — einmal je 6 h laden reicht.
_PRICE_TTL_S = 6 * 3600
_HICP_TTL_S = 7 * 24 * 3600
_mem: dict[str, tuple[float, object]] = {}


# ── Kleine Helfer ─────────────────────────────────────────────────────────────

def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except Exception:
        log.warning("%s ist nicht lesbar — wird neu aufgebaut", path.name)
        return {}


def _write_json(path: Path, data) -> None:
    from .storage import write_json_atomic
    try:
        write_json_atomic(path, data)
    except Exception:
        log.warning("Cache %s konnte nicht geschrieben werden", path.name)


def _cached(key: str, ttl: float, fn):
    hit = _mem.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _mem[key] = (time.time(), val)
    return val


# ── Ticker-Auflösung ──────────────────────────────────────────────────────────

def resolve_tickers(isins: list[str]) -> dict[str, Optional[str]]:
    """ISIN → Yahoo-Ticker. Feste Zuordnung zuerst, dann Yahoo-Suche (gecacht)."""
    fixed = pf.load_ticker_map()
    auto = _read_json(_AUTO_TICKER_PATH)
    out: dict[str, Optional[str]] = {}
    missing = []
    for isin in isins:
        if isin in fixed:
            out[isin] = fixed[isin]
        elif isin in auto:
            out[isin] = auto[isin] or None
        else:
            missing.append(isin)

    if missing:
        try:
            import yfinance as yf
        except ImportError:
            return {**out, **{i: None for i in missing}}

        def _search(isin: str) -> tuple[str, str]:
            try:
                quotes = yf.Search(isin, max_results=6).quotes or []
            except Exception:
                return isin, ""
            # Xetra bevorzugen (EUR, keine Pence-Falle), sonst den ersten Treffer.
            for q in quotes:
                if str(q.get("symbol", "")).endswith(".DE"):
                    return isin, q["symbol"]
            return isin, (quotes[0].get("symbol", "") if quotes else "")

        with ThreadPoolExecutor(max_workers=8) as ex:
            for isin, sym in ex.map(_search, missing):
                auto[isin] = sym          # "" merkt sich: gesucht, nichts gefunden
                out[isin] = sym or None
        _write_json(_AUTO_TICKER_PATH, auto)
    return out


# ── Kurse ─────────────────────────────────────────────────────────────────────

def _fetch_history(ticker: str, start: str) -> Optional[dict]:
    """Tagesschlusskurse (splitbereinigt, NICHT dividendenbereinigt) + Splits."""
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        h = t.history(start=start, interval="1d", auto_adjust=False, actions=True)
        if h is None or h.empty:
            return None
        cur = str((t.history_metadata or {}).get("currency") or "EUR")
        h.index = pd.to_datetime(h.index).tz_localize(None).normalize()
        close = h["Close"].dropna()
        splits = h.get("Stock Splits")
        splits = splits[splits.fillna(0) > 0] if splits is not None else pd.Series(dtype=float)
        return {
            "currency": cur,
            "close": {d.strftime("%Y-%m-%d"): float(v) for d, v in close.items()},
            "splits": {d.strftime("%Y-%m-%d"): float(v) for d, v in splits.items()},
        }
    except Exception as exc:
        log.info("Kurshistorie für %s nicht ladbar: %s", ticker, exc)
        return None


def load_histories(tickers: list[str], start: str) -> dict[str, dict]:
    """Kurshistorien für viele Ticker, mit Speicher- und Datei-Cache.

    Fällt Yahoo aus, wird der letzte Datei-Stand benutzt — lieber ein paar Tage
    alte Kurse als gar keine Kurve.
    """
    tickers = sorted({t for t in tickers if t})
    key = f"hist|{start}|{','.join(tickers)}"

    def _load():
        disk = _read_json(_PRICE_CACHE_PATH)
        out: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=8) as ex:
            fetched = dict(zip(tickers, ex.map(lambda t: _fetch_history(t, start), tickers)))
        for t in tickers:
            if fetched.get(t):
                out[t] = fetched[t]
                disk[t] = fetched[t]
            elif t in disk:
                out[t] = disk[t]
        _write_json(_PRICE_CACHE_PATH, disk)
        return out

    return _cached(key, _PRICE_TTL_S, _load)


def _series(hist: dict) -> pd.Series:
    s = pd.Series(hist.get("close", {}), dtype=float)
    s.index = pd.to_datetime(s.index)
    return s.sort_index()


def _to_eur(close: pd.Series, currency: str, fx: dict[str, pd.Series]) -> Optional[pd.Series]:
    """Kursreihe in EUR umrechnen. GBp (Pence) zuerst in GBP."""
    cur = (currency or "EUR")
    if cur in ("GBp", "GBX"):
        close, cur = close / 100.0, "GBP"
    cur = cur.upper()
    if cur == "EUR":
        return close
    rate = fx.get(cur)
    if rate is None or rate.empty:
        return None
    # EURxxx=X notiert "xxx je 1 EUR" → Kurs / Rate
    r = rate.reindex(close.index.union(rate.index)).sort_index().ffill().reindex(close.index)
    return close / r


def _split_factor_after(splits: dict, when: pd.Timestamp) -> float:
    """Produkt aller Split-Verhältnisse NACH `when`.

    Kurse von Yahoo sind auf heute splitbereinigt; die Stückzahlen im
    TR-Export nicht (z. B. 4 → 20 nach einem 5:1-Split). Mit diesem Faktor passen
    beide zusammen: Wert = Stück × Faktor × bereinigter Kurs.
    """
    f = 1.0
    for d, ratio in (splits or {}).items():
        if pd.Timestamp(d) > when and ratio and ratio > 0:
            f *= float(ratio)
    return f


# ── Inflation ─────────────────────────────────────────────────────────────────

def load_hicp() -> pd.Series:
    """HVPI Deutschland, Monatsindex (2015=100). Leere Serie, wenn nicht ladbar."""
    def _load():
        disk = _read_json(_HICP_CACHE_PATH)
        fresh = disk.get("fetched_at") and (
            time.time() - float(disk.get("fetched_ts", 0)) < _HICP_TTL_S)
        values = disk.get("values", {})
        if not fresh:
            try:
                import ssl
                import urllib.request
                try:
                    import certifi
                    ctx = ssl.create_default_context(cafile=certifi.where())
                except ImportError:
                    ctx = ssl.create_default_context()
                # Python.org-Builds auf macOS haben keinen System-CA-Speicher —
                # ohne certifi scheitert jeder HTTPS-Abruf an der Zertifikatsprüfung.
                with urllib.request.urlopen(_EUROSTAT_URL, timeout=20, context=ctx) as r:
                    d = json.loads(r.read().decode("utf-8"))
                idx = d["dimension"]["time"]["category"]["index"]
                vals = d.get("value", {})
                by_pos = {int(k): float(v) for k, v in vals.items()}
                values = {ym: by_pos[pos] for ym, pos in idx.items() if pos in by_pos}
                _write_json(_HICP_CACHE_PATH, {
                    "source": "Eurostat prc_hicp_minr · HVPI Deutschland · 2015=100",
                    "fetched_at": pd.Timestamp.now().isoformat(timespec="seconds"),
                    "fetched_ts": time.time(),
                    "values": values,
                })
            except Exception as exc:
                log.info("HVPI nicht ladbar (%s) — nutze Cache", exc)
        s = pd.Series(values, dtype=float)
        if s.empty:
            return s
        s.index = pd.PeriodIndex(s.index, freq="M")
        return s.sort_index()

    return _cached("hicp", _HICP_TTL_S, _load)


def _cpi_at(cpi: pd.Series, when) -> Optional[float]:
    """Index für den Monat von `when`; nach dem letzten Wert: letzter Wert."""
    if cpi.empty:
        return None
    p = pd.Timestamp(when).to_period("M")
    if p in cpi.index:
        return float(cpi[p])
    if p > cpi.index[-1]:
        return float(cpi.iloc[-1])
    if p < cpi.index[0]:
        return float(cpi.iloc[0])
    return float(cpi[:p].iloc[-1])


# ── Hauptrechnung ─────────────────────────────────────────────────────────────

def _trades(tr_df: pd.DataFrame) -> pd.DataFrame:
    succ = pf.load_isin_succession()
    t = tr_df[(tr_df["units"].fillna(0) != 0) & (tr_df["isin"].fillna("") != "")].copy()
    t["isin"] = t["isin"].map(lambda i: pf.resolve_isin(str(i), succ))
    return t.sort_values("date")


def _dividends(tr_df: pd.DataFrame) -> pd.DataFrame:
    d = tr_df[
        (tr_df["units"].fillna(0) == 0)
        & tr_df["description"].str.upper().str.contains("DIVIDEND|DISTRIBUTION|AUSSCHÜTTUNG", na=False)
    ]
    return d[["date", "amount"]].sort_values("date")


def performance(
    tr_df: pd.DataFrame,
    snapshot: Optional[pd.DataFrame] = None,
    snapshot_date: Optional[str] = None,
    benchmark: str = "msci_world",
    today: Optional[pd.Timestamp] = None,
) -> dict:
    """Monatliche Depotwerte, Vergleichs-ETF, Kaufkraft-Linie und Kennzahlen."""
    today = (today or pd.Timestamp.today()).normalize()
    bench = BENCHMARKS.get(benchmark, BENCHMARKS["msci_world"])
    trades = _trades(tr_df)
    if trades.empty:
        return {"months": [], "warnings": ["Keine Käufe/Verkäufe mit ISIN vorhanden."]}

    start = trades["date"].min().normalize()
    month_ends = pd.date_range(start.to_period("M").to_timestamp("M"), today, freq="ME")
    if len(month_ends) == 0 or month_ends[-1] < today:
        month_ends = month_ends.append(pd.DatetimeIndex([today]))
    # Stichtag je Monat: Monatsende, im laufenden Monat heute.
    points = [min(m, today) for m in month_ends]

    isins = sorted(trades["isin"].unique())
    tickers = resolve_tickers(isins)
    hist_start = (start - pd.Timedelta(days=10)).strftime("%Y-%m-%d")
    hists = load_histories(list(tickers.values()) + [bench["ticker"]], hist_start)

    # FX-Reihen für alle vorkommenden Fremdwährungen
    currencies = set()
    for tk in tickers.values():
        h = hists.get(tk) if tk else None
        if h:
            c = str(h.get("currency") or "EUR")
            c = "GBP" if c in ("GBp", "GBX") else c.upper()
            if c != "EUR":
                currencies.add(c)
    fx_h = load_histories([f"EUR{c}=X" for c in sorted(currencies)], hist_start)
    fx = {c: _series(fx_h[f"EUR{c}=X"]) for c in currencies if f"EUR{c}=X" in fx_h}

    price_eur: dict[str, pd.Series] = {}
    for isin, tk in tickers.items():
        h = hists.get(tk) if tk else None
        if not h:
            continue
        s = _to_eur(_series(h), str(h.get("currency") or "EUR"), fx)
        if s is not None and not s.dropna().empty:
            price_eur[isin] = s.dropna()

    def _px(isin: str, when: pd.Timestamp) -> Optional[float]:
        s = price_eur.get(isin)
        if s is None:
            return None
        s = s[s.index <= when]
        if s.empty:
            return None
        # Ein Kurs, der älter als 10 Tage ist, ist kein Monatsendkurs mehr
        # (Delisting) — dann lieber zum Einstand bewerten.
        if (when - s.index[-1]).days > 10:
            return None
        return float(s.iloc[-1])

    # Stückzahlen splitbereinigt je Trade
    trades["adj_units"] = [
        float(u) * _split_factor_after((hists.get(tickers.get(i) or "") or {}).get("splits", {}), d)
        for u, i, d in zip(trades["units"], trades["isin"], trades["date"])
    ]

    snap_units: dict[str, float] = {}
    snap_value_total = None
    if snapshot is not None and not snapshot.empty and snapshot_date:
        s = snapshot.copy()
        s["units"] = pd.to_numeric(s["units"], errors="coerce")
        s = s[s["units"] > 0]
        snap_units = dict(zip(s["isin"], s["units"]))
        snap_value_total = float(pd.to_numeric(s["current_value"], errors="coerce").fillna(0).sum())
    snap_ts = pd.Timestamp(snapshot_date) if snapshot_date else None

    divs = _dividends(tr_df)
    cpi = load_hicp()

    bench_px = None
    if bench["ticker"] in hists:
        bench_px = _series(hists[bench["ticker"]])

    def _bench_at(when: pd.Timestamp) -> Optional[float]:
        if bench_px is None:
            return None
        s = bench_px[bench_px.index <= when]
        return float(s.iloc[-1]) if not s.empty else None

    # Cashflows: Kauf = Geld ins Depot (+), Verkauf = Geld heraus (−)
    flows = trades[["date", "amount"]].copy()
    flows["invest"] = -flows["amount"]

    rows = []
    priced_share_last = 1.0
    unpriced_last: list[str] = []
    for p in points:
        upto = trades[trades["date"] <= p]
        held = upto.groupby("isin")["adj_units"].sum()
        net_cost = (-upto.groupby("isin")["amount"].sum()).clip(lower=0)
        value = 0.0
        priced = 0.0
        unpriced = []
        for isin, units in held.items():
            if units <= 1e-6:
                continue
            # Ab dem Snapshot-Stichtag gilt der Depotauszug: was dort fehlt,
            # ist nicht mehr im Depot (verfallen, ausgebucht).
            if snap_ts is not None and p >= snap_ts and snap_units and isin not in snap_units:
                continue
            px = _px(isin, p)
            if px is not None:
                v = units * px
                priced += v
            else:
                v = float(net_cost.get(isin, 0.0))
                unpriced.append(isin)
            value += v
        # Im Monat des Depotauszugs ist sein Kurswert die Wahrheit.
        if snap_value_total is not None and snap_ts is not None and p >= snap_ts \
                and p.to_period("M") == snap_ts.to_period("M"):
            value = snap_value_total
            priced = value
            unpriced = []

        invested = float(flows.loc[flows["date"] <= p, "invest"].sum())
        div_cum = float(divs.loc[divs["date"] <= p, "amount"].sum())

        # Vergleichs-ETF mit identischen Cashflows
        bench_val = None
        bpx_now = _bench_at(p)
        if bpx_now:
            units_b = 0.0
            ok = True
            for d, inv in zip(flows.loc[flows["date"] <= p, "date"], flows.loc[flows["date"] <= p, "invest"]):
                bpx = _bench_at(d)
                if not bpx:
                    ok = False
                    break
                units_b += inv / bpx
            bench_val = units_b * bpx_now if ok else None

        # Kaufkraft-Linie: jede Einzahlung mit dem HVPI fortgeschrieben
        infl_val = None
        c_now = _cpi_at(cpi, p)
        if c_now:
            infl_val = 0.0
            for d, inv in zip(flows.loc[flows["date"] <= p, "date"], flows.loc[flows["date"] <= p, "invest"]):
                c_then = _cpi_at(cpi, d)
                infl_val += inv * (c_now / c_then) if c_then else inv

        rows.append({
            "date": p.strftime("%Y-%m-%d"),
            "month": p.strftime("%Y-%m"),
            "value": round(value, 2),
            "invested": round(invested, 2),
            "dividends_cum": round(div_cum, 2),
            "total_return_value": round(value + div_cum, 2),
            "benchmark": round(bench_val, 2) if bench_val is not None else None,
            "inflation_line": round(infl_val, 2) if infl_val is not None else None,
            "priced_share": round(priced / value, 3) if value else 1.0,
        })
        priced_share_last = (priced / value) if value else 1.0
        unpriced_last = unpriced

    last = rows[-1]

    # ── Kennzahlen (geldgewichtet, XIRR) ─────────────────────────────────────
    cf = [(d.to_pydatetime(), -float(inv)) for d, inv in zip(flows["date"], flows["invest"])]
    cf_div = [(d.to_pydatetime(), float(a)) for d, a in zip(divs["date"], divs["amount"])]
    end = pd.Timestamp(last["date"]).to_pydatetime()

    def _x(terminal: Optional[float], with_divs: bool) -> Optional[float]:
        if terminal is None:
            return None
        r = pf._xirr(cf + (cf_div if with_divs else []) + [(end, float(terminal))])
        return round(r * 100, 2) if r is not None else None

    xirr_pf = _x(last["value"], True)
    xirr_bench = _x(last["benchmark"], False)
    xirr_infl = _x(last["inflation_line"], False)
    real = None
    if xirr_pf is not None and xirr_infl is not None:
        real = round(((1 + xirr_pf / 100) / (1 + xirr_infl / 100) - 1) * 100, 2)

    cpi_last = None
    if not cpi.empty:
        cpi_last = str(cpi.index[-1])
    infl_12m = None
    if len(cpi) >= 13:
        infl_12m = round((cpi.iloc[-1] / cpi.iloc[-13] - 1) * 100, 2)

    # Kumulierte Teuerung vom Monat des ersten Kaufs bis zum letzten HVPI-Wert
    infl_cum = None
    cpi_first = _cpi_at(cpi, start)
    if cpi_first and not cpi.empty:
        infl_cum = round((float(cpi.iloc[-1]) / cpi_first - 1) * 100, 1)

    # Einfache Gesamtrendite wie in der TR-App: Gewinn / netto eingezahlt
    simple = None
    if last["invested"] > 0:
        simple = round((last["value"] + last["dividends_cum"] - last["invested"]) / last["invested"] * 100, 1)

    warnings = []
    if unpriced_last:
        warnings.append(
            f"{len(unpriced_last)} Position(en) ohne Kurshistorie — zum Einstand bewertet: "
            + ", ".join(unpriced_last[:6])
        )
    if bench_px is None:
        warnings.append(f"Kurse für {bench['label']} ({bench['ticker']}) nicht ladbar.")
    if cpi.empty:
        warnings.append("Inflationsdaten (Eurostat) nicht ladbar und kein Cache vorhanden.")

    return {
        "months": rows,
        "benchmark": {"key": benchmark if benchmark in BENCHMARKS else "msci_world", **bench},
        "benchmarks": [{"key": k, "label": v["label"], "desc": v["desc"]} for k, v in BENCHMARKS.items()],
        "kpis": {
            "value": last["value"],
            "invested": last["invested"],
            "dividends": last["dividends_cum"],
            "gain": round(last["value"] + last["dividends_cum"] - last["invested"], 2),
            "benchmark_value": last["benchmark"],
            "vs_benchmark": round(last["value"] + last["dividends_cum"] - last["benchmark"], 2)
                            if last["benchmark"] is not None else None,
            "inflation_value": last["inflation_line"],
            "vs_inflation": round(last["value"] + last["dividends_cum"] - last["inflation_line"], 2)
                            if last["inflation_line"] is not None else None,
            "xirr": xirr_pf,
            "xirr_benchmark": xirr_bench,
            "xirr_inflation": xirr_infl,
            "real_xirr": real,
            "inflation_12m": infl_12m,
            "inflation_cum": infl_cum,
            "cpi_first_month": start.strftime("%Y-%m"),
            "simple_return": simple,
            "cpi_last_month": cpi_last,
            "priced_share": round(priced_share_last, 3),
            "since": start.strftime("%Y-%m-%d"),
        },
        "warnings": warnings,
    }


# ── Einordnung ────────────────────────────────────────────────────────────────

def _eur(v: float) -> str:
    s = f"{abs(v):,.0f}".replace(",", ".")
    return f"{'−' if v < 0 else ''}{s} €"


def _pct(v: float, digits: int = 1) -> str:
    return f"{v:.{digits}f}".replace(".", ",") + " %"


def insights(perf: dict, positions: list[dict], tr_cash: float, interest_rate: Optional[float]) -> list[dict]:
    """Konkrete Hinweise zum Depot — jeder mit Zahl und Handlungsoption.

    tone: pos | neg | neutral. Reihenfolge = Wichtigkeit.
    """
    out: list[dict] = []
    k = perf.get("kpis", {})
    bench = perf.get("benchmark", {}).get("label", "Index")

    # 1. Gegen den Index
    if k.get("vs_benchmark") is not None and k.get("xirr") is not None and k.get("xirr_benchmark") is not None:
        diff = k["vs_benchmark"]
        gap = k["xirr"] - k["xirr_benchmark"]
        if diff < 0:
            out.append({
                "tone": "neg", "title": f"{bench} hätte {_eur(-diff)} mehr gebracht",
                "text": (f"Mit exakt denselben Käufen und Verkäufen in einen {bench}-ETF "
                         f"stündest du heute bei {_eur(k['benchmark_value'])} statt "
                         f"{_eur(k['value'] + k['dividends'])} (inkl. Ausschüttungen). "
                         f"Das sind {_pct(-gap)} Rendite pro Jahr, die die Einzelauswahl kostet."),
            })
        else:
            out.append({
                "tone": "pos", "title": f"Du schlägst den {bench} um {_eur(diff)}",
                "text": (f"Dein Depot rentiert mit {_pct(k['xirr'])} p.a., derselbe Geldfluss im "
                         f"{bench} mit {_pct(k['xirr_benchmark'])} p.a."),
            })

    # 2. Gegen die Inflation
    if k.get("real_xirr") is not None:
        r = k["real_xirr"]
        out.append({
            "tone": "pos" if r > 0 else "neg",
            "title": (f"Real {'+' if r >= 0 else ''}{_pct(r)} pro Jahr nach Inflation"),
            "text": ((f"Die Preise in Deutschland (HVPI) stiegen seit {k['cpi_first_month']} um "
                      f"{_pct(k['inflation_cum'])} insgesamt. " if k.get("inflation_cum") is not None else "")
                     + f"Weil dein Geld nach und nach eingezahlt wurde, wirkt auf das eingezahlte Geld "
                     f"im Schnitt eine Teuerung von {_pct(k['xirr_inflation'])} p.a. Um nur die Kaufkraft zu halten, müsste dein "
                     f"Depot {_eur(k['inflation_value'])} wert sein — es sind "
                     f"{_eur(k['value'] + k['dividends'])}."),
        })

    # 3. Einzelaktien vs. ETFs
    stocks = [p for p in positions if not p.get("is_etf")]
    etfs = [p for p in positions if p.get("is_etf")]
    total = sum(p.get("value", 0) for p in positions) or 0
    if stocks and total:
        s_val = sum(p["value"] for p in stocks)
        s_pl = sum(p.get("pl", 0) or 0 for p in stocks)
        e_pl = sum(p.get("pl", 0) or 0 for p in etfs)
        losers = sorted([p for p in stocks if (p.get("pl") or 0) < 0], key=lambda p: p["pl"])[:3]
        out.append({
            "tone": "neg" if s_pl < 0 else "neutral",
            "title": f"Einzelaktien: {_pct(s_val / total * 100, 0)} des Depots, {_eur(s_pl)} Buchergebnis",
            "text": (f"Die ETFs liegen zusammen bei {_eur(e_pl)}. "
                     + (f"Größte Verlierer: " + ", ".join(
                         f"{p['name'].split(' Registered')[0].split(' Reg.')[0][:28]} ({_eur(p['pl'])})"
                         for p in losers) + ". " if losers else "")
                     + "Einzeltitel erhöhen das Risiko, ohne dass die Rendite im Schnitt steigt."),
        })

    # 4. Überschneidungen
    names = {p["isin"]: (p.get("name") or "").lower() for p in positions}
    has_world = any("msci world" in n or "msci wo" in n for n in names.values())
    has_acwi = any("all cnt" in n or "acwi" in n or "all-world" in n or "all world" in n for n in names.values())
    has_em = any("em imi" in n or "emerging" in n or "msci em" in n for n in names.values())
    if has_world and has_acwi:
        out.append({
            "tone": "neutral", "title": "MSCI World und MSCI ACWI überschneiden sich zu ~90 %",
            "text": ("Der ACWI enthält den kompletten MSCI World plus Schwellenländer. "
                     + ("Zusammen mit dem EM-IMI-ETF hältst du Schwellenländer doppelt. " if has_em else "")
                     + "Ein Welt-ETF (oder World + EM im Verhältnis 88/12) deckt dasselbe ab."),
        })

    # 5. Kleinstpositionen
    if total:
        small = [p for p in positions if p.get("value", 0) < 0.03 * total]
        if len(small) >= 5:
            out.append({
                "tone": "neutral",
                "title": f"{len(small)} Positionen unter 3 % des Depots",
                "text": (f"Zusammen {_eur(sum(p['value'] for p in small))} "
                         f"({_pct(sum(p['value'] for p in small) / total * 100, 0)}). "
                         "Sie bewegen das Gesamtergebnis kaum, machen das Depot aber "
                         "unübersichtlich. Zusammenlegen spart Aufwand bei Steuer und Überblick."),
            })

    # 6. Cash-Anteil
    invested_total = total + max(tr_cash, 0)
    if tr_cash > 0 and invested_total:
        share = tr_cash / invested_total * 100
        rate = interest_rate
        infl = k.get("inflation_12m")
        if share >= 25:
            txt = (f"{_eur(tr_cash)} liegen als Guthaben bei Trade Republic ({_pct(share, 0)} von "
                   f"TR-Depot + TR-Cash; ING-Konten nicht eingerechnet).")
            if rate is not None and infl is not None:
                txt += (f" Gutgeschrieben wurden zuletzt ca. {_pct(rate)} p.a. (nach Steuer, gemessen am "
                        f"Ø Saldo des Vormonats), die Inflation liegt bei {_pct(infl)} — real verliert "
                        f"das Geld {'an' if rate < infl else 'nicht an'} Wert.")
            txt += " Was nicht als Notgroschen gebraucht wird, kann per Sparplan schrittweise investiert werden."
            out.append({"tone": "neg" if (rate is not None and infl is not None and rate < infl) else "neutral",
                        "title": f"{_pct(share, 0)} deines TR-Vermögens liegt als Cash", "text": txt})
    return out
