"""
Offene Zuordnungen: Buchungen, die der User noch kategorisieren muss.

Als "offen" gilt eine Buchung, wenn sie kein interner Übertrag ist und
entweder in 'Sonstiges' liegt oder keinen erkannten Empfänger hat.
"""

from __future__ import annotations

import re

import pandas as pd

OPEN_CATEGORY = "Sonstiges"

# Zahlungsdienstleister: bei ihnen ist der Empfänger für jede Buchung derselbe,
# der echte Händler steht im Buchungstext. Wer hier auf den Empfänger gruppiert,
# wirft alle Zahlungen über diesen Dienst in einen Topf — im Bestand sind das
# 739 PayPal-Buchungen mit 538 verschiedenen Buchungstexten.
_AGGREGATOR_PAYEES = (
    "paypal", "klarna", "amazon payments", "stripe", "sumup",
    "adyen", "mollie", "shopify", "ratepay",
)

# "PP.4657.PP . SPOTIFY, Ihr Einkauf bei SPOTIFY" → SPOTIFY
_PP_MERCHANT_RE = re.compile(r"PP\.\d+\.PP\s*\.\s*([^,]+)", re.IGNORECASE)
# Generischer Fallback für andere Dienstleister.
_EINKAUF_RE = re.compile(r"Ihr Einkauf bei\s+(.+?)\s*$", re.IGNORECASE)


def is_aggregator(payee: str) -> bool:
    """Ist dieser Empfänger ein Zahlungsdienstleister und kein echter Händler?"""
    p = (payee or "").lower()
    return any(a in p for a in _AGGREGATOR_PAYEES)


def extract_merchant(payee: str, description: str) -> str:
    """Den echten Händler bestimmen.

    Für normale Buchungen ist das der Empfänger. Für Zahlungsdienstleister wird
    er aus dem Buchungstext gezogen; gelingt das nicht (etwa beim
    AWV-Meldepflicht-Boilerplate), bleibt das Ergebnis leer — dann darf auch
    NICHT gruppiert werden, statt auf den Dienstleister zurückzufallen.
    """
    payee = (payee or "").strip()
    desc = (description or "").strip()
    if not is_aggregator(payee):
        return payee

    for rx in (_PP_MERCHANT_RE, _EINKAUF_RE):
        m = rx.search(desc)
        if m:
            merchant = m.group(1).strip(" .,-")
            if merchant and merchant.lower() not in ("privat", "unbekannt"):
                return merchant
    return ""


def group_key(payee: str, description: str) -> str:
    """Schlüssel für „gleiche Buchung, gleiche Kategorie".

    Leerer Schlüssel heisst ausdrücklich: diese Buchung mit keiner anderen
    zusammenfassen.
    """
    merchant = extract_merchant(payee, description)
    return merchant.strip().lower()


def open_mask(df: pd.DataFrame) -> pd.Series:
    """Boolean-Maske aller Buchungen, die noch zugeordnet werden müssen."""
    if df.empty:
        return pd.Series([], dtype=bool)
    not_transfer = ~df["is_transfer"].astype(bool) & (df["category"] != "Umbuchung")
    is_sonstiges = df["category"].fillna("") == OPEN_CATEGORY
    no_payee = df["payee"].fillna("").str.strip() == ""
    # Vom User ausdrücklich zugeordnet — auch wenn die Wahl "Sonstiges" war.
    # Ohne dieses Flag war "Sonstiges" nicht wählbar: die Buchung blieb offen
    # und tauchte nach jedem Abschluss sofort wieder im Zähler auf.
    if "reviewed" in df.columns:
        reviewed = df["reviewed"].replace("", False).fillna(False).astype(bool)
    else:
        reviewed = pd.Series(False, index=df.index)
    return not_transfer & (is_sonstiges | no_payee) & ~reviewed


def open_items(df: pd.DataFrame, months: list[str] | None = None) -> pd.DataFrame:
    """Offene Buchungen, optional auf bestimmte Monate ('YYYY-MM') begrenzt."""
    if df.empty:
        return df
    sub = df[open_mask(df)]
    if months:
        ym = sub["date"].dt.to_period("M").astype(str)
        sub = sub[ym.isin(months)]
    return sub.sort_values("date", ascending=False)


def open_counts_by_month(df: pd.DataFrame) -> dict[str, int]:
    """Anzahl offener Buchungen je Monat."""
    if df.empty:
        return {}
    sub = df[open_mask(df)]
    if sub.empty:
        return {}
    return sub.groupby(sub["date"].dt.to_period("M").astype(str)).size().astype(int).to_dict()


def month_is_clean(df: pd.DataFrame, ym: str) -> bool:
    return open_counts_by_month(df).get(ym, 0) == 0


def suggest_category(df: pd.DataFrame, payee: str, description: str) -> tuple[str, int]:
    """Vorschlag aus der eigenen Historie: häufigste Kategorie desselben Empfängers.

    Returns (kategorie, n_treffer); ("", 0) wenn nichts Passendes gefunden wurde.
    """
    key = group_key(payee, description)
    if not key or df.empty:
        return "", 0

    categorised = df[
        (df["category"] != OPEN_CATEGORY)
        & (df["category"] != "Umbuchung")
        & (~df["is_transfer"].fillna(False).astype(bool))
    ]
    if categorised.empty:
        return "", 0

    if is_aggregator(payee):
        # Beim Zahlungsdienstleister zählt der Händler aus dem Buchungstext.
        # Der `description`-Parameter war bisher da und wurde nie benutzt —
        # deshalb schlug die Funktion für alle 739 PayPal-Zeilen dieselbe
        # Kategorie mit dreistelliger Trefferzahl vor.
        cand = categorised[categorised["payee"].fillna("").str.lower().str.contains(
            "|".join(_AGGREGATOR_PAYEES), na=False, regex=True)]
        if cand.empty:
            return "", 0
        keys = cand.apply(
            lambda r: group_key(str(r.get("payee", "")), str(r.get("description", ""))),
            axis=1,
        )
        hits = cand[keys == key]
    else:
        hits = categorised[categorised["payee"].fillna("").str.strip().str.lower() == key]

    if hits.empty:
        return "", 0
    counts = hits["category"].value_counts()
    return str(counts.index[0]), int(counts.iloc[0])


# ── Aus der eigenen Historie lernen ───────────────────────────────────────────
#
# Ohne das kam jeder wiederkehrende Händler (Streaming-Abo, der Bäcker
# um die Ecke) mit jedem Import wieder als "Sonstiges" in die Zuordnung — der
# Zähler oben rechts füllte sich nach jedem Abschluss von neuem.

# Leere Empfänger kommen aus Parquet teils als Text "nan"/"none" zurück — das
# ist kein Händler, unter dem man lernen darf.
_NO_KEY = {"", "nan", "none"}

# Ab diesem Anteil gilt die häufigste Kategorie eines Händlers als eindeutig.
LEARN_MIN_SHARE = 0.75


def _group_keys(df: pd.DataFrame) -> pd.Series:
    payee = df["payee"].fillna("").astype(str)
    desc = df["description"].fillna("").astype(str)
    return pd.Series(
        [group_key(p, d) for p, d in zip(payee, desc)], index=df.index, dtype=object,
    )


def learned_categories(df: pd.DataFrame) -> dict[str, str]:
    """Händler-Schlüssel → Kategorie, die der Bestand eindeutig belegt."""
    if df.empty:
        return {}
    done = df[
        (df["category"].fillna("") != OPEN_CATEGORY)
        & (df["category"].fillna("") != "Umbuchung")
        & (df["category"].fillna("") != "")
        & (~df["is_transfer"].fillna(False).astype(bool))
    ]
    if done.empty:
        return {}
    keys = _group_keys(done)
    tab = pd.DataFrame({"key": keys, "cat": done["category"]})
    tab = tab[~tab["key"].isin(_NO_KEY)]
    if tab.empty:
        return {}
    counts = tab.groupby(["key", "cat"]).size().rename("n").reset_index()
    totals = counts.groupby("key")["n"].transform("sum")
    counts["share"] = counts["n"] / totals
    best = counts.sort_values("n", ascending=False).drop_duplicates("key")
    best = best[best["share"] >= LEARN_MIN_SHARE]
    return dict(zip(best["key"], best["cat"]))


def apply_learned(df: pd.DataFrame, scope: pd.Series | None = None) -> tuple[pd.DataFrame, int]:
    """Offene Buchungen (optional nur innerhalb `scope`) aus der Historie zuordnen.

    Gibt (df, anzahl_zugeordnet) zurück. Rührt nur offene Buchungen an —
    eine bestehende Zuordnung wird nie überschrieben.
    """
    if df.empty:
        return df, 0
    target = open_mask(df)
    if scope is not None:
        target = target & scope.reindex(df.index, fill_value=False).astype(bool)
    if not target.any():
        return df, 0
    learned = learned_categories(df)
    if not learned:
        return df, 0
    keys = _group_keys(df[target])
    keys = keys[~keys.isin(_NO_KEY)]
    cats = keys.map(learned).dropna()
    if cats.empty:
        return df, 0
    df = df.copy()
    df.loc[cats.index, "category"] = cats.values
    return df, int(len(cats))
