# TechPulse

TechPulse collects technology RSS feeds, groups and ranks articles with Gemini, and emails a daily briefing through Resend. It is a Node.js + TypeScript + Supabase backend.

## Local macOS login automation

The LaunchAgent runs after the user logs in (`RunAtLoad`) and uses the Mac's local calendar date. It does not use a fixed hour, GitHub Actions, a cloud host, or a paid scheduler. LaunchAgent installation only writes a plist; it does not load or start it.

On each login, the script:

1. Reads today's newsletter status from Supabase. If any record exists (`sent`, `queued`, or `failed`), it skips the entire pipeline. Ambiguous/failed records are never retried automatically.
2. If no record exists, runs `npm run collect`, `npm run process:ai` (the project's actual AI processing script), and `npm run newsletter -- --preview`.
3. Sends with `npm run newsletter -- --send` only if the preview has eligible stories. The existing Supabase unique newsletter date, Resend idempotency key, and a local lock protect concurrent/repeated logins.

The preview uses all eligible AI-ranked stories already stored in Supabase, including older stories when no new feed articles arrive. Empty eligible-story results safely skip email. A failure stops the remaining steps. Quota/payment stop markers create a local pause file so another login does not retry that provider until you manually review and clear the pause.

Newsletter dates use `NEWSLETTER_TIME_ZONE` if configured; otherwise Node uses the Mac's current timezone. This keeps the status check and the existing Supabase newsletter date reservation aligned. Do not change the timezone while an automation run is in progress.

### Prepare and test without sending

From the repository root, first create a private `.env` from `.env.example`, fill required values locally, and set `TECHPULSE_FREE_TIER_CONFIRMED=true` only after verifying the account-level no-cost protections in the next section. Never paste credentials into chat or commit `.env`.

```sh
npm ci
npm run typecheck
npm run build
bash scripts/launch-agent/install.sh --dry-run
bash scripts/launch-agent/run-daily-newsletter.sh --dry-run
```

Both LaunchAgent dry runs avoid provider/database access and cannot send email. `npm run newsletter -- --status` is a read-only Supabase status check. The first command below writes a LaunchAgent plist but leaves it unloaded; **enabling it starts a real pipeline immediately and may send today's email**. Wait for explicit approval before enabling it for real delivery.

```sh
bash scripts/launch-agent/install.sh
bash scripts/launch-agent/enable.sh
```

### Disable, enable, clear a safety pause, and uninstall

```sh
# Stop/unload future login runs
bash scripts/launch-agent/disable.sh

# Re-enable and load; RunAtLoad starts immediately (may send if today's record is absent)
bash scripts/launch-agent/enable.sh

# After checking provider quota/access and billing, interactively clear the quota pause
bash scripts/launch-agent/clear-pause.sh

# Remove and disable the LaunchAgent; keeps local logs/state and all database records
bash scripts/launch-agent/uninstall.sh
```

Logs are private files in `~/Library/Logs/TechPulse/`. Local pause/lock state is in `~/Library/Application Support/TechPulse/`. To inspect status use `launchctl print gui/$(id -u)/com.techpulse.daily-newsletter`. The agent only starts at login; if the Mac remains logged in across a date change, it does not run at midnight. Log out and back in (or restart/login) to trigger that day's check.

### Existing GitHub workflow

This project previously had a scheduled GitHub Actions workflow. Its workflow file has been removed locally to avoid maintaining two schedulers. Local edits do not disable a workflow already present in GitHub: **disable “TechPulse Daily Newsletter” in the repository's Actions tab before enabling this LaunchAgent.** No GitHub settings have been changed by these local edits.

## Zero-cost controls and account checks

Code cannot verify a provider plan, remaining quota, attached payment method, trial expiry, or overage switch. `TECHPULSE_FREE_TIER_CONFIRMED=true` is only your local acknowledgement; it is not proof of billing status. If a provider asks for billing, a card, an upgrade, or paid access, leave TechPulse disabled.

- **Supabase:** Keep the project organization on Free and use no paid add-ons. Supabase states Free-plan over-usage is restricted rather than billed, while paid plans/add-ons can incur charges. Never upgrade to restore a paused/restricted project. [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Cost controls](https://supabase.com/docs/guides/platform/cost-control)
- **Gemini:** Use a Free-tier AI Studio project with no Cloud Billing account linked. The app pins `gemini-2.5-flash` and rejects other model overrides. Google says disabling billing downgrades an AI Studio project to its limited Free usage tier; check for effects on other resources before unlinking a shared project. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Billing](https://ai.google.dev/gemini-api/docs/billing) · [Disable project billing](https://docs.cloud.google.com/billing/docs/how-to/modify-project)
- **Resend:** Use Free plan only; turn Transactional Overages/pay-as-you-go off, and avoid a paid trial/subscription that may renew. If you cannot verify that exceeding free limits stops without payment, leave Resend delivery disabled. [Pricing](https://resend.com/pricing) · [Terms](https://resend.com/legal/terms-of-service)
- **Mac:** This uses your existing Mac; there is no runner-minute billing. Network/API usage still consumes provider quotas. Never enable paid APIs or overages as a fallback.

Supabase/Gemini/Resend quota, payment-required, and free-tier restriction responses stop the current pipeline. Gemini 429 is not retried. Resend idempotency and the date-unique newsletter reservation remain in place. Provider error logs redact API credentials. No application code can guarantee that an account configured for paid access will not charge; confirm account settings before enabling the agent.

## Local commands

```sh
npm ci
cp .env.example .env
# Edit .env privately and verify account protections before setting TECHPULSE_FREE_TIER_CONFIRMED=true
npm run collect
npm run process:ai
npm run newsletter -- --status
npm run newsletter -- --preview
# Only run --send after explicitly approving a real email
npm run newsletter -- --send
```

`RSS_FEED_URLS` is optional. `ARTICLE_MAX_AGE_DAYS` defaults to 7, `NEWSLETTER_MIN_IMPORTANCE_SCORE` defaults to 70, and `NEWSLETTER_TIME_ZONE` defaults to the machine's local timezone. `.env` is ignored by Git.

## Validation

```sh
npm run typecheck
npm run build
npm run test:free-tier-guard
git diff --check
```
