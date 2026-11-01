#!/bin/bash
# Kapital öffnen — Server starten, falls er nicht läuft, dann das Fenster.
#
# Wird von ~/Applications/Kapital.app aufgerufen (Dock-Symbol). Eine .app
# startet ohne Terminal-Umgebung: kein direnv, minimaler PATH. Deshalb hier
# alles mit absoluten Pfaden.
set -u
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"

PROJECT="$(cd "$(dirname "$0")/../../.." && pwd)"
PY="$PROJECT/.venv/bin/python"
PORT="${KAPITAL_PORT:-8502}"
URL="http://localhost:$PORT"
LOG="$HOME/Library/Logs/Kapital.log"

# Eine .app aus einem Shell-Skript startet macOS gern unter Rosetta (x86_64).
# Das Python ist universal und erbt dann x86_64 — die Pakete in .venv sind
# aber arm64 ("incompatible architecture"). Auf Apple Silicon daher nativ.
RUN=()
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then RUN=(/usr/bin/arch -arm64); fi

up() { curl -s -o /dev/null -m 2 "$URL/api/review/status"; }

if ! up; then
  if [ ! -x "$PY" ]; then
    osascript -e "display alert \"Kapital\" message \"Python-Umgebung nicht gefunden: $PY\""
    exit 1
  fi
  echo "=== Start $(date '+%F %T') ===" >> "$LOG"
  cd "$PROJECT" && nohup "${RUN[@]}" "$PY" -m kapital.run --no-browser >> "$LOG" 2>&1 &
  for _ in $(seq 1 60); do
    up && break
    sleep 0.5
  done
  if ! up; then
    # Meldung im Hintergrund: sonst bleibt die App bis zum "OK" offen und
    # macOS startet sie bei einem erneuten Klick nicht neu.
    open -a Console "$LOG"
    osascript -e "display alert \"Kapital startet nicht\" message \"Details im Protokoll: $LOG\"" >/dev/null 2>&1 &
    exit 1
  fi
fi

# Nur zum Testen: Server starten, aber kein Fenster öffnen.
[ "${KAPITAL_NO_WINDOW:-}" = "1" ] && exit 0

# Eigenes Fenster ohne Adressleiste (Chrome-App-Modus); sonst Standardbrowser.
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL" --window-size=1440,960
else
  open "$URL"
fi
