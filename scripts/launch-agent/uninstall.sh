#!/bin/bash
set -euo pipefail

LABEL='com.techpulse.daily-newsletter'
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl disable "${DOMAIN}/${LABEL}"
rm -f "$PLIST_PATH"
echo 'TechPulse LaunchAgent removed and disabled. Local logs/state and all Supabase records were preserved.'
