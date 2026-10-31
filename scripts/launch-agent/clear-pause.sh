#!/bin/bash
set -euo pipefail

PAUSE_FILE="${HOME}/Library/Application Support/TechPulse/paused"
if [[ ! -f "$PAUSE_FILE" ]]; then
  echo 'No safety pause is set.'
  exit 0
fi
printf 'This only clears the local stop flag; it does not enable the LaunchAgent or send email.\n'
printf 'Confirm provider free-tier access and quotas first. Clear pause? [y/N] '
read -r answer
if [[ "$answer" != 'y' && "$answer" != 'Y' ]]; then
  echo 'Pause remains in place.'
  exit 0
fi
rm -f "$PAUSE_FILE"
echo 'Local pause cleared. The LaunchAgent remains in its current enabled/disabled state.'
