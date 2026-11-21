#!/bin/bash
# Starts the Pixel Daycare server automatically whenever you log in to this Mac.
#   ./autostart.sh          install and start
#   ./autostart.sh remove   stop and uninstall
set -e
LABEL=com.pixeldaycare.server
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8642
PY="$(command -v python3)"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "$1" = "remove" ]; then rm -f "$PLIST"; echo "Removed. The daycare server no longer starts at login."; exit 0; fi

# Free the port if a manually started server is holding it.
lsof -tiTCP:$PORT -sTCP:LISTEN | xargs kill 2>/dev/null || true

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$DIR/serve.py</string><string>$PORT</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/pixeldaycare.log</string>
</dict>
</plist>
EOF
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 2
if curl -sf -o /dev/null "http://localhost:$PORT/js/main.js"; then
  echo "Running. On the iPad open:  http://$(scutil --get LocalHostName).local:$PORT"
else
  echo "Started, but the page didn't load. macOS may be blocking background apps from reading the Desktop folder."
  echo "Fix: move this folder out of Desktop (e.g. to your home folder) and run ./autostart.sh again."
  echo "Log: $HOME/Library/Logs/pixeldaycare.log"
fi
