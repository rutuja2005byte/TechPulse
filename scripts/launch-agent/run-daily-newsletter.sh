#!/bin/bash
set -uo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/TechPulse"
STATE_DIR="${HOME}/Library/Application Support/TechPulse"
PAUSE_FILE="${STATE_DIR}/paused"
LOCK_DIR="${STATE_DIR}/run.lock"
NPM_BIN="${TECHPULSE_NPM_BIN:-$(command -v npm || true)}"

if [[ "${1:-}" == "--dry-run" ]]; then
  printf 'Dry run only; no provider or database access and no email will be sent.\n'
  printf 'Repository: %s\n' "$REPO_ROOT"
  printf 'npm: %s\n' "${NPM_BIN:-not found}"
  printf 'LaunchAgent label: com.techpulse.daily-newsletter\n'
  exit 0
fi

mkdir -p "$LOG_DIR" "$STATE_DIR"
chmod 700 "$LOG_DIR" "$STATE_DIR"
LOG_FILE="${LOG_DIR}/daily-$(date +%F).log"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"
exec >> "$LOG_FILE" 2>&1

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }

if [[ -f "$PAUSE_FILE" ]]; then
  log 'Automation is paused after a free-tier/quota safety stop. Review account limits and clear the pause file manually before enabling again.'
  exit 0
fi

if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
  log 'npm executable not found. Reinstall the LaunchAgent from a terminal where Node.js and npm are available.'
  exit 1
fi
if [[ ! -f "${REPO_ROOT}/.env" ]]; then
  log 'Private .env file is missing; stopping without printing environment values.'
  exit 1
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [[ -f "${LOCK_DIR}/pid" ]]; then
    read -r lock_pid < "${LOCK_DIR}/pid"
    if [[ "$lock_pid" =~ ^[0-9]+$ ]] && kill -0 "$lock_pid" 2>/dev/null; then
      log "Another TechPulse run (PID ${lock_pid}) is active; skipping this login trigger."
      exit 0
    fi
  fi
  rm -rf "$LOCK_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log 'Could not obtain the local run lock; skipping to prevent overlapping sends.'
    exit 0
  fi
fi
printf '%s\n' "$$" > "${LOCK_DIR}/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ ! -x "${REPO_ROOT}/node_modules/.bin/tsx" ]]; then
  log 'Project dependencies are missing. Run npm ci manually from the repository before enabling automation.'
  exit 1
fi

cd "$REPO_ROOT" || exit 1
export PATH="$(dirname "$NPM_BIN"):/usr/bin:/bin:/usr/sbin:/sbin:${REPO_ROOT}/node_modules/.bin"
export TECHPULSE_NPM_BIN="$NPM_BIN"

LAST_OUTPUT=''
run_step() {
  local label="$1"
  shift
  local output_file
  output_file="$(mktemp "${STATE_DIR}/step.XXXXXX")"
  chmod 600 "$output_file"
  log "Starting: ${label}"
  "$@" > "$output_file" 2>&1
  local result=$?
  cat "$output_file"
  LAST_OUTPUT="$output_file"
  if grep -Fq '[TECHPULSE_FREE_TIER_STOP]' "$output_file"; then
    printf 'Paused after a provider quota/payment or free-tier confirmation stop. Review the daily log; no automatic retry will be attempted.\n' > "$PAUSE_FILE"
    chmod 600 "$PAUSE_FILE"
    log 'Free-tier stop detected; future login-triggered runs are paused until manually reviewed.'
  fi
  if [[ $result -eq 0 ]]; then
    log "Completed: ${label}"
  else
    log "Failed: ${label} (exit ${result}); the pipeline will not continue."
  fi
  return "$result"
}

if ! run_step 'Read today newsletter status' "$NPM_BIN" run newsletter -- --status; then
  exit 1
fi
newsletter_status="$(sed -n 's/^NEWSLETTER_STATUS=//p' "$LAST_OUTPUT" | tail -n 1)"
newsletter_date="$(sed -n 's/^NEWSLETTER_DATE=//p' "$LAST_OUTPUT" | tail -n 1)"
rm -f "$LAST_OUTPUT"
if [[ -z "$newsletter_status" || -z "$newsletter_date" ]]; then
  log 'Status response was incomplete; refusing to continue or send.'
  exit 1
fi
if [[ "$newsletter_status" != 'none' ]]; then
  log "Newsletter date ${newsletter_date} already has status '${newsletter_status}'; skipping all pipeline work. No automatic retry or resend will occur."
  exit 0
fi

if ! run_step 'Collect RSS articles' "$NPM_BIN" run collect; then exit 1; fi
rm -f "$LAST_OUTPUT"
if ! run_step 'Analyze unprocessed articles with Gemini' "$NPM_BIN" run process:ai; then exit 1; fi
rm -f "$LAST_OUTPUT"

if run_step 'Generate newsletter preview from all eligible stored stories' "$NPM_BIN" run newsletter -- --preview; then
  rm -f "$LAST_OUTPUT"
else
  if grep -Fq 'No valid stories meet the newsletter importance threshold' "$LAST_OUTPUT"; then
    log 'No eligible stories are available; safely skipping email delivery.'
    rm -f "$LAST_OUTPUT"
    exit 0
  fi
  rm -f "$LAST_OUTPUT"
  exit 1
fi

if ! run_step 'Send the date-reserved newsletter through Resend' "$NPM_BIN" run newsletter -- --send; then exit 1; fi
rm -f "$LAST_OUTPUT"
log 'Daily pipeline finished. Supabase newsletter date uniqueness and Resend idempotency remain authoritative duplicate protections.'
