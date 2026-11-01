#!/bin/bash
# Kapital beenden — stoppt den Hintergrund-Server (SIGTERM, notfalls SIGKILL).
set -u
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Eine .app aus einem Shell-Skript startet macOS gern unter Rosetta (x86_64).
# Das Python ist universal und erbt dann x86_64 — die Pakete in .venv sind
# aber arm64 ("incompatible architecture"). Auf Apple Silicon daher nativ.
RUN=()
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then RUN=(/usr/bin/arch -arm64); fi
cd "$PROJECT" && "${RUN[@]}" "$PROJECT/.venv/bin/python" -m kapital.run --stop >> "$HOME/Library/Logs/Kapital.log" 2>&1
osascript -e 'display notification "Server wurde beendet." with title "Kapital"'
