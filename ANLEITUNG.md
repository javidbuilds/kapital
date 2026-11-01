# Kapital – Einrichtung in VS Code

Kapital ist eine lokale Finanz-App: Kontoauszüge (CSV/PDF) hochladen, die App
kategorisiert Umsätze, zeigt Cashflow, Abos, Depot, Vermögen und Steuer-Infos.
**Alles bleibt auf deinem Rechner** – es gibt keinen Server und keine Datenbank,
die Daten liegen als Dateien im Ordner `data/`.

Die App startet komplett leer. Du lädst deine eigenen Auszüge hoch.

---

## 1. Voraussetzungen (einmalig)

| Was | Wofür | Prüfen mit |
|---|---|---|
| **VS Code** + Erweiterung **Python** (Microsoft) | Editor, Start-Button | – |
| **Git** | Repo herunterladen | `git --version` |
| **uv** | installiert Python 3.11 und alle Pakete | `uv --version` |

uv installieren, falls noch nicht vorhanden:

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Danach das Terminal einmal neu öffnen. Python selbst musst du **nicht**
installieren – uv holt sich Python 3.11 automatisch.

## 2. Repo klonen und in VS Code öffnen

```bash
git clone <REPO-URL> kapital
cd kapital
code .
```

(Oder in VS Code: *Datei → Ordner öffnen…* und den `kapital`-Ordner wählen.)

## 3. Umgebung einrichten

Im VS-Code-Terminal (*Terminal → Neues Terminal*), im Projektordner:

```bash
uv venv --python 3.11
uv pip sync requirements.lock
```

Das legt einen `.venv`-Ordner an und installiert alle Pakete. Dauert beim ersten
Mal ein paar Minuten – `torch` (für die KI-Kursprognose) ist ca. 1 GB groß.

> **Windows oder Fehler bei `sync`?** Die Lock-Datei wurde auf einem Mac erzeugt.
> Dann stattdessen: `uv pip install -r requirements.txt`

Danach in VS Code den Interpreter wählen:
`Cmd/Strg + Shift + P` → **Python: Select Interpreter** → den Eintrag mit
`.venv` auswählen. (Meist erkennt VS Code ihn von selbst.)

## 4. App starten

**Variante A – per Klick:** Links auf *Ausführen und Debuggen* (▷ mit Käfer),
oben **„Kapital starten“** wählen, grünen Pfeil drücken (oder `F5`).

**Variante B – im Terminal:**

```bash
# macOS / Linux
.venv/bin/python -m kapital.run

# Windows
.venv\Scripts\python -m kapital.run
```

Der Browser öffnet sich automatisch auf **http://localhost:8502**.
Beenden mit **Strg + C** im Terminal (bzw. dem roten Stopp-Knopf in VS Code).

Port belegt? → `KAPITAL_PORT=8600` davor setzen, oder auf macOS/Linux
`python -m kapital.run --restart` (beendet eine hängengebliebene Instanz).

**Variante C – als App im Dock (macOS):** einmalig

```bash
kapital/tools/macos/install_apps.sh
```

Das legt in `~/Applications` die Apps **Kapital** (startet den Server im
Hintergrund und öffnet ein eigenes Fenster) und **Kapital beenden** an.
Beim ersten Öffnen ggf. Rechtsklick → *Öffnen* (die App ist nicht signiert).
Protokoll: `~/Library/Logs/Kapital.log`.

## 5. Erste Schritte in der App

1. Tab **Daten importieren**: Kontoauszug als CSV hochladen. Erkannt werden
   **DKB, ING, Sparkasse, Comdirect** (Giro-CSV), **PayPal** (CSV) und
   **Trade Republic** (CSV-Export; PDF nur der *Depotauszug* für den aktuellen
   Depotstand) und **Kraken** (Ledger-Export als CSV, für Krypto).
   Mehrfach hochladen ist unkritisch – doppelte Buchungen werden erkannt.
2. Nach dem Upload öffnet sich die **Zuordnung**: Buchungen, die keiner
   Kategorie zugeordnet werden konnten, einmal zuweisen. Daraus lernt die App
   Regeln für die Zukunft (Tab **Kategorien-Regeln**).
3. Kontostände: Bei ING-Exporten übernimmt die App den Saldo aus dem Dateikopf
   automatisch. Sonst im Tab **Vermögen** echte Kontostände eintragen.
4. Optional **Verträge** (private Renten-/Lebensversicherungen, Mietkaution):
   in `data/contracts.json` anlegen (Format siehe `kapital/finance/contracts.py`),
   danach im Tab **Vermögen** den Rückkaufswert eintragen.
5. Tab **Ziele**: Notgroschen, Eigenkapital und finanzielle Unabhängigkeit
   planen – für Letzteres die Werte aus der Renteninformation eintragen
   („bereits erreicht“ und „bei Fortsetzung der Beiträge“).

### Optional: KI-Monatsbewertung

Im Tab **Monatsabschluss** kann ein Monat von Claude bewertet werden. Dafür
brauchst du einen eigenen API-Key von https://console.anthropic.com (kostet ein
paar Cent pro Bewertung). Den Key trägst du direkt in der App ein; er wird nur
lokal in `data/settings.json` gespeichert.
Gesendet werden dabei **nur aggregierte Zahlen** (Kategoriesummen, Top-Händler),
keine IBANs, keine Kontoauszüge. Ohne Key funktioniert alles andere normal.

### Online-Abrufe

Für Kursverläufe (Portfolio → Entwicklung, Krypto, Vermögensverlauf) fragt die
App **yfinance** nach öffentlichen Kursen, für die Inflation **Eurostat**
(HVPI Deutschland). Dabei werden nur Ticker bzw. ISINs abgefragt – keine
Beträge, keine Kontodaten. Die Ergebnisse werden in `data/` zwischengespeichert.

## 6. Deine Daten

- Alles landet in `data/`. Dieser Ordner ist per `.gitignore` vom Repo
  ausgeschlossen – **deine Finanzdaten werden nie mit committet oder gepusht.**
- Backup = den Ordner `data/` kopieren.
- Komplett neu anfangen = Inhalt von `data/` löschen (außer `.gitkeep`).

## 7. Updates holen

```bash
git pull
uv pip sync requirements.lock   # nur nötig, wenn sich Pakete geändert haben
```

`.jsx`-Änderungen (Oberfläche) brauchen nur einen Browser-Reload,
Python-Änderungen einen Neustart der App.

## Häufige Probleme

| Problem | Lösung |
|---|---|
| `ModuleNotFoundError: fastapi` o. ä. | Falscher Interpreter → Schritt 3, `.venv` auswählen |
| `address already in use` | Läuft schon / hängt noch → `--restart`, oder anderen Port via `KAPITAL_PORT` |
| Seite bleibt weiß | Browser-Konsole öffnen (`F12`) – die Oberfläche wird im Browser übersetzt, Fehler stehen dort |
| Bank wird nicht erkannt | Format wird nicht unterstützt – Beispielzeile (anonymisiert) an mich schicken |
