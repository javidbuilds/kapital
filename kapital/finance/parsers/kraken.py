"""
Kraken Spot-Ledger (CSV-Export "ledgers").

Kraken bucht einen Kauf als zwei Zeilen mit gemeinsamer `refid`: "spend" (EUR
raus, mit Gebühr) und "receive" (Krypto rein). Daraus wird hier EINE
Kaufbuchung wie bei Trade Republic: Betrag = EUR inkl. Gebühr, `units` = Menge,
`isin` = "CRYPTO:<Kürzel>".

Abbildung:
  deposit (EUR)        → Einzahlung (+), Gebühr als eigene Zeile (Kartenzahlung)
  withdrawal (EUR)     → Auszahlung (−)
  spend+receive        → BUY (EUR → Krypto) bzw. SELL (Krypto → EUR)
  earn/reward, Bonus   → Zugang ohne Kosten (Betrag 0, units +)
  delistingconversion  → Umtausch (USDT → USDC), Betrag 0
  earn/autoallocation  → ignoriert (nur Verschiebung zwischen Kraken-Wallets)
  ETHW                 → ignoriert (Fork-Token ohne Handelswert)

Die Konto-Einzahlungen paart transfer_detector danach mit den Abbuchungen auf
dem Girokonto — dieselbe Logik wie bei ING → Trade Republic.
"""
from __future__ import annotations

import hashlib
import io

import pandas as pd

from .utils import empty_df, finalize_df, make_row, read_bytes, decode

ACCOUNT = "Kraken"
_FIAT = {"EUR", "EUR.HOLD", "ZEUR"}
_IGNORE_ASSETS = {"ETHW"}
NAMES = {
    "BTC": "Bitcoin", "XBT": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana",
    "USDC": "USD Coin", "USDT": "Tether", "USDG": "Global Dollar",
}
_REQUIRED = {"txid", "refid", "time", "type", "asset", "amount", "fee"}


def is_kraken(header_line: str) -> bool:
    h = header_line.replace('"', "").lower()
    return all(c in h for c in ("txid", "refid", "aclass", "asset", "wallet"))


def _asset(a: str) -> str:
    a = str(a or "").upper().split(".")[0]
    return {"XBT": "BTC", "XXBT": "BTC", "XETH": "ETH", "ZEUR": "EUR"}.get(a, a)


def _hash(*parts) -> str:
    return hashlib.md5(("KR:" + "|".join(str(p) for p in parts)).encode()).hexdigest()[:12]


def parse_kraken(uploaded_file) -> pd.DataFrame:
    text = decode(read_bytes(uploaded_file))
    first = text.splitlines()[0] if text else ""
    if not is_kraken(first):
        return empty_df()
    raw = pd.read_csv(io.StringIO(text), dtype={"txid": str, "refid": str})
    if not _REQUIRED.issubset(raw.columns):
        return empty_df()
    raw["time"] = pd.to_datetime(raw["time"], errors="coerce")
    raw["asset_n"] = raw["asset"].map(_asset)
    raw["subtype"] = raw.get("subtype", "").fillna("")
    raw["amount"] = pd.to_numeric(raw["amount"], errors="coerce").fillna(0.0)
    raw["fee"] = pd.to_numeric(raw["fee"], errors="coerce").fillna(0.0)
    raw = raw[~raw["asset_n"].isin(_IGNORE_ASSETS)]

    rows = []
    for refid, grp in raw.groupby("refid", sort=False):
        date = grp["time"].iloc[0].normalize()
        types = set(grp["type"])

        # Kauf / Verkauf: spend + receive mit gleicher refid
        if {"spend", "receive"} <= types or "trade" in types:
            fiat = grp[grp["asset"].isin(_FIAT) | (grp["asset_n"] == "EUR")]
            coin = grp[~grp.index.isin(fiat.index)]
            if fiat.empty or coin.empty:
                continue
            eur = float(fiat["amount"].sum())
            fee = float(fiat["fee"].sum())
            units = float(coin["amount"].sum())
            sym = coin["asset_n"].iloc[0]
            name = NAMES.get(sym, sym)
            if eur < 0:   # Kauf
                total = eur - fee
                desc = f"BUY: {name}"
            else:         # Verkauf
                total = eur - fee
                desc = f"SELL: {name}"
            r = make_row(date, round(total, 2), desc, ACCOUNT, ACCOUNT, ACCOUNT,
                         isin=f"CRYPTO:{sym}", units=units,
                         price_per_unit=round(abs(total) / abs(units), 2) if units else 0.0)
            r["category"] = "Investment & Sparen"
            r["tx_hash"] = _hash(refid)
            rows.append(r)
            continue

        for _, x in grp.iterrows():
            t, st, sym = x["type"], x["subtype"], x["asset_n"]
            amt, fee = float(x["amount"]), float(x["fee"])
            if t == "earn" and st == "autoallocation":
                continue
            if sym == "EUR" or x["asset"] in _FIAT:
                if t in ("deposit", "withdrawal"):
                    desc = "TRANSFER_INBOUND: Einzahlung" if amt > 0 else "TRANSFER_OUTBOUND: Auszahlung"
                    r = make_row(date, round(amt, 2), desc, ACCOUNT, ACCOUNT, ACCOUNT)
                    r["tx_hash"] = _hash(x["txid"])
                    rows.append(r)
                    if fee:
                        f = make_row(date, -round(fee, 2), "FEE: Einzahlungsgebühr", ACCOUNT, ACCOUNT, ACCOUNT)
                        f["category"] = "Gebühren & Zinsen"
                        f["tx_hash"] = _hash(x["txid"], "fee")
                        rows.append(f)
                continue
            # Krypto-Zu- und Abgänge ohne Geldfluss
            units = amt - (fee if amt > 0 else 0.0)
            if abs(units) < 1e-12:
                continue
            name = NAMES.get(sym, sym)
            if st == "delistingconversion":
                desc = f"CONVERSION: {name}"
            elif t == "earn" or st == "reward":
                desc = f"STAKING: {name}"
            elif t == "reward":
                desc = f"BONUS: {name}"
            else:
                desc = f"TRANSFER: {name}"
            r = make_row(date, 0.0, desc, ACCOUNT, ACCOUNT, ACCOUNT,
                         isin=f"CRYPTO:{sym}", units=units)
            r["category"] = "Investment & Sparen"
            r["tx_hash"] = _hash(x["txid"])
            rows.append(r)

    return finalize_df(pd.DataFrame(rows)) if rows else empty_df()
