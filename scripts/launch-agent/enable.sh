#!/bin/bash
set -euo pipefail

LABEL='com.techpulse.daily-newsletter'
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"
if [[ ! -f "$PLIST_PATH" ]]; then
  echo "LaunchAgent plist not found at ${PLIST_PATH}; run install.sh first." >&2
  exit 1
fi
if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  echo 'TechPulse LaunchAgent is already loaded; no new run was started.'
  exit 0
fi
launchctl enable "${DOMAIN}/${LABEL}"
launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
echo 'TechPulse LaunchAgent enabled. RunAtLoad starts a run now; it may send today’s email if no newsletter record exists.'
