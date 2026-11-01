import io
import traceback
from fastapi import APIRouter, UploadFile, File, HTTPException

from ..deps import set_df

router = APIRouter()

_FORMAT_NAMES = {
    "giro":           "Girokonto CSV",
    "trade_republic": "Trade Republic CSV",
    "paypal":         "PayPal CSV",
    "tr_pdf":         "Trade Republic PDF",
    "depot_snapshot": "Depot-Snapshot PDF",
    "kraken":         "Kraken CSV",
}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

    from kapital.finance.parsers.giro import parse_giro, extract_balance
    from kapital.finance.parsers.trade_republic import parse_trade_republic
    from kapital.finance.parsers.paypal import parse_paypal
    from kapital.finance.parsers.kraken import parse_kraken
    from kapital.finance.parsers.trade_republic_pdf import (
        parse_tr_pdf, parse_depot_snapshot, is_account_statement,
    )
    from kapital.finance.categorizer import categorize_df
    from kapital.finance.transfer_detector import detect_transfers
    from kapital.finance.custom_rules import apply_custom_rules, load_rules
    from kapital.finance import storage
    from kapital.finance.storage import save_depot_snapshot

    raw = await file.read()
    filename = (file.filename or "").lower()

    # Wrap raw bytes in BytesIO so parsers can call .seek() / .read()
    def make_file():
        f = io.BytesIO(raw)
        f.name = filename
        return f

    try:
        parsed_df = None
        parse_type = "unknown"
        parser_errors: list[str] = []

        # ── PDF ──────────────────────────────────────────────────────────────
        if filename.endswith(".pdf"):
            # Try depot snapshot first
            try:
                snap = parse_depot_snapshot(make_file())
                if snap is not None and not snap.empty:
                    # Stichtag mitgeben, sonst kann später niemand entscheiden,
                    # ob Snapshot oder Buchungen aktueller sind.
                    _as_of = ""
                    if "as_of" in snap.columns and len(snap):
                        _as_of = str(snap["as_of"].iloc[0] or "")
                    _stored = storage.load_depot_snapshot_date()
                    _base = {
                        "ok": True,
                        "type": "depot_snapshot",
                        "format_name": _FORMAT_NAMES["depot_snapshot"],
                        "n_new": 0,
                        "n_parsed": len(snap),
                        "n_duplicates": 0,
                        "n_total": 0,
                    }
                    # Ein älterer Auszug darf einen neueren nicht ersetzen.
                    if _as_of and _stored and _as_of < _stored:
                        return {**_base, "message": (
                            f"Depotauszug vom {_as_of} ist älter als der gespeicherte "
                            f"vom {_stored} — nicht übernommen."
                        )}
                    save_depot_snapshot(snap, as_of=_as_of)
                    return {**_base, "message": (
                        f"Depotstand aktualisiert: {len(snap)} Positionen"
                        + (f" zum {_as_of}" if _as_of else "")
                    )}
            except Exception as e:
                parser_errors.append(f"Depot-Snapshot: {e}")

            # TR-Kontoauszug als PDF: enthält dieselben Buchungen wie der
            # CSV-Export, aber mit anderem Buchungstext — die Deduplizierung
            # erkennt sie nicht, jede Buchung käme doppelt. Der PDF-Parser
            # liest zudem die Geldmarktfonds-Umschichtungen als Käufe über
            # 1,00 €. Solange CSV-Daten vorliegen, ist der CSV der Weg.
            _existing = storage.load()
            _has_tr = (not _existing.empty) and bool((_existing["account"] == "Trade Republic").any())
            if _has_tr and is_account_statement(make_file()):
                return {
                    "ok": True,
                    "type": "tr_pdf_skipped",
                    "format_name": "Trade Republic Kontoauszug (PDF)",
                    "n_new": 0, "n_parsed": 0, "n_duplicates": 0, "n_total": len(_existing),
                    "message": (
                        "TR-Kontoauszug (PDF) nicht importiert: deine Trade-Republic-Buchungen "
                        "stammen aus dem CSV-Export, beides zusammen würde jede Buchung doppelt "
                        "zählen. Bitte den CSV-Export (transactions_….csv) hochladen."
                    ),
                }

            # Try TR PDF transactions
            try:
                parsed_df = parse_tr_pdf(make_file())
                if parsed_df is not None and not parsed_df.empty:
                    parse_type = "tr_pdf"
                else:
                    parser_errors.append("TR-PDF: Keine Transaktionen gefunden")
                    parsed_df = None
            except Exception as e:
                parser_errors.append(f"TR-PDF: {e}")

            if parsed_df is None or parsed_df.empty:
                detail = "PDF konnte nicht geparst werden."
                if parser_errors:
                    detail += " Fehler: " + " | ".join(parser_errors)
                raise HTTPException(400, detail)

        # ── CSV ──────────────────────────────────────────────────────────────
        elif filename.endswith(".csv"):
            for parser_fn, ptype in [
                (parse_kraken,         "kraken"),
                (parse_trade_republic, "trade_republic"),
                (parse_giro,           "giro"),
                (parse_paypal,         "paypal"),
            ]:
                try:
                    result = parser_fn(make_file())
                    if result is not None and not result.empty:
                        parsed_df = result
                        parse_type = ptype
                        break
                    else:
                        parser_errors.append(f"{ptype}: leer")
                except Exception as e:
                    parser_errors.append(f"{ptype}: {e}")

            if parsed_df is None or parsed_df.empty:
                detail = "CSV-Format nicht erkannt."
                if parser_errors:
                    detail += " Versucht: " + " | ".join(parser_errors)
                raise HTTPException(400, detail)

        else:
            raise HTTPException(400, f"Nicht unterstütztes Dateiformat: {filename!r}. Nur .csv und .pdf erlaubt.")

        # ── Nothing parsed ───────────────────────────────────────────────────
        if parsed_df is None or parsed_df.empty:
            return {
                "ok": True,
                "type": parse_type,
                "format_name": _FORMAT_NAMES.get(parse_type, parse_type),
                "n_new": 0, "n_parsed": 0, "n_duplicates": 0, "n_total": 0,
                "message": "Keine Buchungen in der Datei gefunden.",
            }

        n_parsed = len(parsed_df)

        # ── Kontostand aus dem Dateikopf (ING) mit Stichtag merken ───────────
        # Vorher kam der Saldo nur aus einer einmaligen Eingabe ohne Datum und
        # blieb danach für immer stehen — die App zeigte im Oktober noch den
        # Stand vom April.
        balance_saved = None
        if parse_type == "giro":
            bal = extract_balance(make_file())
            if bal is not None and len(parsed_df):
                raw_label = str(parsed_df["account_label"].iloc[0])
                labels = storage.load_iban_labels() or {}
                norm = lambda v: str(v or "").replace(" ", "").upper()
                display = next((v for k, v in labels.items() if norm(k) == norm(raw_label)), raw_label)
                storage.save_giro_balance(display, bal[0], bal[1])
                balance_saved = {"account": display, "balance": bal[0], "date": bal[1]}

        # ── Categorize + rules ───────────────────────────────────────────────
        # Der Kraken-Parser vergibt die Kategorien selbst (Kauf, Gebühr, Staking);
        # die Stichwortregeln würden sie über den Empfänger "Kraken" wieder
        # überschreiben — eine Einzahlungsgebühr landete so als Investment.
        if parse_type != "kraken":
            parsed_df = categorize_df(parsed_df)
            rules = load_rules()
            if rules:
                parsed_df = apply_custom_rules(parsed_df, rules)

        # ── Merge + deduplicate ──────────────────────────────────────────────
        existing = storage.load()
        existing_hashes = set(existing["tx_hash"].dropna()) if not existing.empty else set()
        merged_df, n_added, n_dupes = storage.merge(existing, parsed_df)

        # ── Transfer detection ───────────────────────────────────────────────
        merged_df = detect_transfers(merged_df)

        # ── Aus der Historie lernen ──────────────────────────────────────────
        # Nur neue Zeilen: ein Händler, den der User schon eindeutig zugeordnet
        # hat, kommt nicht jeden Monat wieder als "Sonstiges" in die Zuordnung.
        from kapital.finance import review as review_core
        n_learned = 0
        if n_added:
            merged_df, n_learned = review_core.apply_learned(
                merged_df, scope=~merged_df["tx_hash"].isin(existing_hashes),
            )

        # ── Verspätete Monatszahlungen (Miete am 1.) dem Vormonat zuordnen ───
        from kapital.finance.month_shift import apply_shifts
        merged_df, n_shifted = apply_shifts(merged_df)

        storage.save(merged_df)
        set_df(merged_df)

        # ── Betroffene Monate + offene Zuordnungen (für das Review-Gate) ──────
        new_rows = merged_df[~merged_df["tx_hash"].isin(existing_hashes)]
        affected_months = sorted(
            new_rows["date"].dt.to_period("M").astype(str).unique().tolist(), reverse=True
        ) if not new_rows.empty else []

        open_counts = review_core.open_counts_by_month(merged_df)
        n_open_affected = int(sum(open_counts.get(m, 0) for m in affected_months))

        format_name = _FORMAT_NAMES.get(parse_type, parse_type)
        parts = [f"{n_added} neue Buchungen"]
        if n_dupes:
            parts.append(f"{n_dupes} Duplikate übersprungen")
        if n_learned:
            parts.append(f"{n_learned} aus deiner Historie zugeordnet")
        message = f"{format_name} · " + ", ".join(parts)

        return {
            "ok": True,
            "type": parse_type,
            "format_name": format_name,
            "n_parsed": n_parsed,
            "n_new": n_added,
            "n_duplicates": n_dupes,
            "n_total": len(merged_df),
            "message": message,
            "affected_months": affected_months,
            "n_open_affected": n_open_affected,
            "n_learned": n_learned,
            "balance": balance_saved,
        }

    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        # surrogate-/nicht-UTF-8-sicher machen, sonst kann die JSON-Antwort selbst
        # fehlschlagen → Starlette liefert dann Plaintext "Internal Server Error".
        detail = f"Import-Fehler: {e}\n{tb[:600]}".encode("utf-8", "replace").decode("utf-8")
        raise HTTPException(500, detail)
