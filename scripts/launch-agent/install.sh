#!/bin/bash
set -euo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL='com.techpulse.daily-newsletter'
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/TechPulse"
DRY_RUN=false
if [[ "${1:-}" == '--dry-run' ]]; then DRY_RUN=true; fi

if [[ "$(uname -s)" != 'Darwin' ]]; then
  echo 'This installer only supports macOS.' >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
if [[ -z "$NODE_BIN" || -z "$NPM_BIN" ]]; then
  echo 'Node.js and npm must be available in this terminal PATH before installing.' >&2
  exit 1
fi
if [[ ! -f "${REPO_ROOT}/.env" ]]; then
  echo "Missing private ${REPO_ROOT}/.env. Copy .env.example and configure it without sharing the values." >&2
  exit 1
fi
if [[ ! -x "${REPO_ROOT}/node_modules/.bin/tsx" ]]; then
  echo 'Project dependencies are missing. Run npm ci manually from the project directory first.' >&2
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  PLIST_PATH="$(mktemp "${TMPDIR:-/tmp}/${LABEL}.XXXXXX")"
else
  if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
    echo 'LaunchAgent is already loaded. Disable it before replacing the installed plist.' >&2
    exit 1
  fi
  mkdir -p "${HOME}/Library/LaunchAgents" "$LOG_DIR"
  chmod 700 "$LOG_DIR"
  # Keep the local environment file readable only by this macOS account.
  chmod 600 "${REPO_ROOT}/.env"
  touch "${LOG_DIR}/launchd.stdout.log" "${LOG_DIR}/launchd.stderr.log"
  chmod 600 "${LOG_DIR}/launchd.stdout.log" "${LOG_DIR}/launchd.stderr.log"
fi

python3 - "$PLIST_PATH" "$REPO_ROOT" "$NODE_BIN" "$NPM_BIN" "$LOG_DIR" <<'PY'
import plistlib
import sys

plist_path, repo, node_bin, npm_bin, log_dir = sys.argv[1:]
label = 'com.techpulse.daily-newsletter'
node_dir = node_bin.rsplit('/', 1)[0]
value = {
    'Label': label,
    'ProgramArguments': ['/bin/bash', f'{repo}/scripts/launch-agent/run-daily-newsletter.sh'],
    'WorkingDirectory': repo,
    'RunAtLoad': True,
    'KeepAlive': False,
    'LimitLoadToSessionType': 'Aqua',
    'EnvironmentVariables': {
        'PATH': f'{node_dir}:/usr/bin:/bin:/usr/sbin:/sbin:{repo}/node_modules/.bin',
        'TECHPULSE_NPM_BIN': npm_bin,
    },
    'StandardOutPath': f'{log_dir}/launchd.stdout.log',
    'StandardErrorPath': f'{log_dir}/launchd.stderr.log',
}
with open(plist_path, 'wb') as stream:
    plistlib.dump(value, stream, fmt=plistlib.FMT_XML, sort_keys=False)
PY

if command -v plutil >/dev/null 2>&1; then plutil -lint "$PLIST_PATH"; fi
if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run valid. Detected Node: ${NODE_BIN}; npm: ${NPM_BIN}. No files outside /tmp were changed and the agent was not loaded."
  rm -f "$PLIST_PATH"
  exit 0
fi

chmod 600 "$PLIST_PATH"
echo "Installed plist at ${PLIST_PATH}; it is not loaded or enabled yet."
echo 'Enabling it will immediately run the status check and may send today’s newsletter if no record exists.'
echo 'Use scripts/launch-agent/enable.sh only after approving the first possible real email send.'
