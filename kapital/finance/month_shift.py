"""
Verspätete Monatszahlungen dem richtigen Monat zuordnen.

Die Miete geht normalerweise um den 29. raus. Fällt das aufs Wochenende,
bucht die Bank sie am 1.–3. des Folgemonats: ein Monat hat dann keine Miete,
der nächste zwei. Jede Monatsauswertung —
Grundlast, Monatsabschluss, Jahresübersicht — war dadurch verzerrt.

Regel, bewusst eng:
  - Ausgabe (kein Übertrag), gebucht am 1.–3. eines Monats,
  - derselbe Empfänger zahlt regelmäßig (mind. 3 weitere Zahlungen in
    ähnlicher Höhe, ±25 %) und typischerweise am Monatsende (Median-Tag ≥ 25),
  - sie kam in mind. 4 der 5 Monate davor vor (wirklich monatlich),
  - im Vormonat gibt es noch KEINE solche Zahlung dieses Empfängers.
Dann zählt die Buchung für den letzten Tag des Vormonats. Das echte
Buchungsdatum bleibt in `booking_date` erhalten und wird in der
Buchungsliste angezeigt.

Der Fingerabdruck (tx_hash) wird beim Import aus dem Originaldatum gebildet
und hier nicht verändert — ein erneuter Import derselben Datei erkennt die
Buchung also weiterhin als Duplikat.
"""
from __future__ import annotations

import pandas as pd

from .review import group_key

MAX_DAY = 3
MIN_OCCURRENCES = 3
MIN_MEDIAN_DAY = 25
AMOUNT_TOLERANCE = 0.25
REGULAR_MONTHS = 4


def _booking(df: pd.DataFrame) -> pd.Series:
    """Echtes Buchungsdatum: booking_date, wo gesetzt, sonst date."""
    if "booking_date" not in df.columns:
        return df["date"]
    bd = pd.to_datetime(df["booking_date"], errors="coerce")
    return bd.where(bd.notna(), df["date"])


def find_shifts(df: pd.DataFrame) -> pd.Series:
    """Index → neues Auswertungsdatum für alle Buchungen, die die Regel trifft."""
    if df.empty:
        return pd.Series(dtype="datetime64[ns]")
    booked = _booking(df)
    already = pd.Series(False, index=df.index)
    if "booking_date" in df.columns:
        already = pd.to_datetime(df["booking_date"], errors="coerce").notna()

    out = df[(df["amount"] < 0) & ~df["is_transfer"].fillna(False).astype(bool)].copy()
    if out.empty:
        return pd.Series(dtype="datetime64[ns]")
    out["_key"] = [group_key(p, d) for p, d in zip(out["payee"].fillna(""), out["description"].fillna(""))]
    out = out[~out["_key"].isin(["", "nan", "none"])]
    out["_booked"] = booked.loc[out.index]

    shifts = {}
    for key, grp in out.groupby("_key"):
        if len(grp) < MIN_OCCURRENCES + 1:
            continue
        cands = grp[(grp["_booked"].dt.day <= MAX_DAY) & ~already.loc[grp.index]]
        for idx, row in cands.iterrows():
            amt = abs(float(row["amount"]))
            similar = grp[(grp.index != idx)
                          & ((grp["amount"].abs() - amt).abs() <= AMOUNT_TOLERANCE * amt)]
            if len(similar) < MIN_OCCURRENCES:
                continue
            if similar["_booked"].dt.day.median() < MIN_MEDIAN_DAY:
                continue
            prev = row["_booked"].to_period("M") - 1
            eff = grp["date"].where(~grp.index.isin(list(shifts)), pd.Series(shifts))
            eff_m = eff.loc[similar.index].dt.to_period("M")
            if (eff_m == prev).any():
                continue
            # Wirklich monatlich: in mind. 4 der 5 Monate davor gezahlt. Sonst
            # träfe es Zufälle wie eine Bahnfahrkarte, die öfter um den 29. fiel.
            window = {prev - k for k in range(1, 6)}
            if len(set(eff_m) & window) < REGULAR_MONTHS:
                continue
            shifts[idx] = prev.end_time.normalize()
    return pd.Series(shifts, dtype="datetime64[ns]")


def apply_shifts(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Regel anwenden. Gibt (df, anzahl_verschoben) zurück; idempotent."""
    s = find_shifts(df)
    if s.empty:
        return df, 0
    df = df.copy()
    if "booking_date" not in df.columns:
        df["booking_date"] = pd.NaT
    df["booking_date"] = pd.to_datetime(df["booking_date"], errors="coerce")
    df.loc[s.index, "booking_date"] = df.loc[s.index, "date"]
    df.loc[s.index, "date"] = s.values
    return df, int(len(s))
