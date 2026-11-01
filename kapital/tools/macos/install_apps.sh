#!/bin/bash
# Legt ~/Applications/Kapital.app und "Kapital beenden.app" an.
# Die Apps rufen nur die Skripte hier im Projekt auf — Änderungen an den
# Skripten wirken also ohne Neuinstallation. Erneut ausführen, wenn der
# Projektordner verschoben wurde.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Applications"
mkdir -p "$DEST"

make_app() {   # name, bundle-id, script
  local name="$1" bid="$2" script="$3"
  local app="$DEST/$name.app"
  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  cp "$HERE/Kapital.icns" "$app/Contents/Resources/Kapital.icns"
  cat > "$app/Contents/MacOS/launcher" <<SH
#!/bin/bash
exec "$HERE/$script"
SH
  chmod +x "$app/Contents/MacOS/launcher"
  cat > "$app/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundleDisplayName</key><string>$name</string>
  <key>CFBundleIdentifier</key><string>$bid</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>Kapital</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSArchitecturePriority</key><array><string>arm64</string><string>x86_64</string></array>
  <key>LSRequiresNativeExecution</key><true/>
</dict></plist>
PL
  touch "$app"
  echo "angelegt: $app"
}

make_app "Kapital" "local.kapital.open" "kapital_open.sh"
make_app "Kapital beenden" "local.kapital.stop" "kapital_stop.sh"
