# TechPulse

TechPulse collects technology RSS feeds, groups and ranks articles with Gemini, and sends an email newsletter through Resend. It is a Node.js + TypeScript + Supabase backend with no frontend or web framework.

## Zero-cost policy and limits

TechPulse is configured to fail closed, but application code cannot inspect or control provider billing plans, attached payment methods, account trials, or overage switches. **Do not enable the workflow until the account checks below are complete.** `TECHPULSE_FREE_TIER_CONFIRMED=true` is an operator acknowledgement only; it is not proof of account billing state.

- **GitHub Actions:** Check the repository owner’s billing settings. Set an Actions budget with **Stop usage when budget limit is reached** enabled; set the limit to $0 if GitHub permits it. Also disable paid usage/overages. If you cannot make a hard stop, disable Actions and do not use the schedule. GitHub can bill usage above included amounts without a blocking budget. See [included usage](https://docs.github.com/en/billing/reference/product-usage-included) and [budget controls](https://docs.github.com/en/billing/how-tos/set-up-budgets).
- **Supabase:** Confirm the project’s organization is on the Free plan and has no paid add-ons or subscription. Supabase says Free-plan over-usage is restricted rather than billed, but an organization on a paid plan can incur plan/usage charges. Keep it on Free; never upgrade to restore a paused or restricted project. See [billing](https://supabase.com/docs/guides/platform/billing-on-supabase) and [cost controls](https://supabase.com/docs/guides/platform/cost-control).
- **Gemini:** Confirm the API key belongs to a Free-tier AI Studio project and that no Cloud Billing account is linked to that project. Google states that disabling/unlinking billing downgrades an AI Studio project to its Free usage tier; paid-tier requests are billable. Do not use a trial that requires a payment method unless billing is disabled before trial expiry. This may affect other resources in a shared Cloud project, so check before unlinking. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [billing](https://ai.google.dev/gemini-api/docs/billing), and [disable project billing](https://docs.cloud.google.com/billing/docs/how-to/modify-project).
- **Resend:** Confirm the account is on the Free plan and turn **Transactional Overages / pay-as-you-go OFF**. Do not leave an expiring paid trial or paid subscription attached. Resend says overages can be billed when enabled; its free-plan terms can change and reserve rights around limits, so disable TechPulse email delivery if you cannot verify the account will stop without payment. See [pricing and overages](https://resend.com/pricing) and [terms](https://resend.com/legal/terms-of-service).

Usage caps, free eligibility, limits, and trial terms can change. An API key alone does not establish that an account is on a no-cost tier. If any provider requires billing, an upgrade, or a payment method to continue, leave the relevant service disabled. Never add a card or upgrade just to restore TechPulse.

### Application and workflow stop behavior

- All app commands that access Supabase require `TECHPULSE_FREE_TIER_CONFIRMED=true`; otherwise they stop before database access. Gemini model overrides are rejected unless they equal `gemini-2.5-flash`; there is no model fallback.
- Supabase HTTP 402/429 and quota/payment responses, Gemini quota/rate/payment responses, and Resend 402/429/quota responses stop the current operation. Gemini 429 is not retried. No paid provider fallback is attempted. Resend’s rejected quota send is recorded as failed and does not count as accepted; accepted or ambiguous newsletters remain protected by the existing idempotency rules.
- On a logged `[TECHPULSE_FREE_TIER_STOP]` marker, the workflow uses its job-scoped `GITHUB_TOKEN` with `actions: write` to disable the entire TechPulse workflow. It does not change billing settings. Re-enable the workflow only after checking account settings and usage. If Actions cannot start because its own included allowance is exhausted, no job can run to disable itself; the account-level budget is essential.
- Providers do not expose a common, authoritative “this next request is guaranteed free” check. In particular, application code cannot verify account plan state, remaining monthly allowance, or provider billing switches. The safeguards reduce accidental continuation but **cannot guarantee zero charges without the manual account controls above**.

## Daily automation (Phase 5)

`.github/workflows/daily-newsletter.yml` runs on a GitHub-hosted `ubuntu-latest` runner. The scheduled pipeline runs these existing commands in order:

1. `npm run collect` fetches, validates, deduplicates, and stores RSS articles.
2. `npm run process:ai` analyzes genuinely unprocessed articles with Gemini and stores story groups, scores, and article relationships.
3. `npm run newsletter -- --preview` confirms that the generated story set contains important, renderable newsletter content.
4. `npm run newsletter -- --send` reserves the date and sends once through Resend.

The newsletter preview always loads all eligible AI-generated stories already stored in Supabase, including stories from earlier days, sorts them by global importance score, and applies the configured minimum score. New articles are not required for a send. If no stories meet the threshold, the workflow logs that outcome and skips delivery; no empty email is sent unless a future explicit notification option is added.

The schedule is `30 2 * * *` UTC, which is **8:00 AM India Standard Time (IST)**. The workflow also supports `workflow_dispatch`. Manual runs default to no email; select `send_newsletter` to allow a new production send, or `retry_failed_newsletter` to retry today's existing failed and unsent newsletter. Do not select both. Retry refuses accepted or ambiguous sends.

The scheduled workflow runs only after the workflow file is on the repository's default branch and GitHub Actions is enabled. GitHub notes that scheduled runs can be delayed under load and run from the default branch; public-repository schedules may be disabled after 60 days without repository activity. See [scheduled workflow troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).

## GitHub Actions setup

Add these repository or organization secrets under **Settings → Secrets and variables → Actions**. Do not put secret values in workflow files, commits, or logs.

Also add repository variable `TECHPULSE_FREE_TIER_CONFIRMED` with value `true` **only after completing and rechecking every provider billing control above**. If missing/false, a workflow run stops before checkout or API use and automatically disables the workflow. Local `.env` uses the same setting and defaults to `false`.

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Required by the existing application environment configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase reads and writes; never expose to a client |
| `GEMINI_API_KEY` | Server-side AI story analysis |
| `RESEND_API_KEY` | Resend newsletter delivery |
| `RESEND_FROM_EMAIL` | Verified sender address, or Resend's test sender where recipient restrictions permit |
| `NEWSLETTER_RECIPIENTS` | Comma-separated recipient email addresses |

`SUPABASE_SERVICE_ROLE_KEY` is required by the collector, AI processor, and newsletter writer. GitHub passes it only as a job environment secret. The workflow does not print environment variables.

The workflow needs `actions: write` solely so it can disable itself after a detected free-tier stop condition. This permission applies only to the workflow token; it is not a billing permission. If you do not want this repository permission, remove that auto-disable step and disable the workflow manually when a stop marker appears.

Apply the Supabase migrations before the first run. The newsletter delivery metadata and test-send tables are added by migrations `20261031004000_add_newsletter_delivery_metadata.sql` and `20261031004100_create_newsletter_test_sends.sql`.

### Manual runs

1. Open the repository's **Actions** tab and select **TechPulse Daily Newsletter**.
2. Choose **Run workflow** on the default branch.
3. Leave both email options unchecked for a safe collect/process/preview run. It will not send email.
4. Select `send_newsletter` only when you intend to send a new newsletter, or `retry_failed_newsletter` only when today's Supabase record is definitely failed and unsent. A retry-only run skips collection and AI so unrelated errors cannot interfere with the guarded resend.

A new send is unique per newsletter date. Resend request idempotency and the Supabase date reservation protect retries and overlapping runs. A queued/ambiguous record is not automatically retried. Use the Resend dashboard to reconcile it first.

## Local setup and commands

```sh
npm ci
cp .env.example .env
# Fill in the private .env values
npm run collect
npm run process:ai
npm run newsletter -- --preview
npm run newsletter -- --send
```

To retry a known failed, unsent newsletter for today:

```sh
npm run newsletter -- --retry
```

The test-send command uses a separate database table and does not change a production newsletter record:

```sh
npm run newsletter -- --test-send <accepted-newsletter-id>
```

`RSS_FEED_URLS` is optional; when empty, all active `sources` rows are used. `ARTICLE_MAX_AGE_DAYS` defaults to 7 and `NEWSLETTER_MIN_IMPORTANCE_SCORE` defaults to 70. Keep `.env` local; it is ignored by Git.

## Failures and logs

- Open **Actions → TechPulse Daily Newsletter → a run** to inspect each step's logs. Collection, Gemini, preview, and Resend errors fail the relevant step; secrets are provided through GitHub's masked secret environment.
- If collection reports feed or database failures, inspect the source URL, Supabase source rows, and database constraints before rerunning.
- If Gemini fails or returns invalid structured output, the AI command exits unsuccessfully and delivery does not run.
- If no stored story meets the importance threshold, the workflow reports a safe skip rather than sending an empty newsletter.
- If Resend rejects the sender, verify the sender domain and update `RESEND_FROM_EMAIL`. For Resend's test sender, its test-recipient rules still apply.
- If the newsletter record is `queued`, its send outcome may be ambiguous. Check Resend before any recovery; do not resend blindly.
- If a workflow run fails after the email step, check the same-date newsletter row and its Resend email ID before retrying.

## GitHub Actions usage and limits

The job uses a standard GitHub-hosted Linux runner, a 45-minute timeout, and repository-level concurrency protection. It runs only on the daily schedule or manual dispatch; there are no push or pull-request triggers. Included minutes, plan limits, free quotas, trials, and pricing can change; use each provider’s billing page before enabling the workflow. A timeout and concurrency setting limit execution but are not billing caps.

RSS feeds used here are public feeds; their operators can change availability or terms. A scheduled GitHub run may be delayed or dropped during high load, and schedules must remain enabled on the default branch. Runner time does not cover Gemini or Resend API quotas. See the **Zero-cost policy and limits** section before starting or restarting automation.

### Disable and safely restart TechPulse

- **Stop all automation now:** In GitHub, open **Actions → TechPulse Daily Newsletter → … → Disable workflow**. Also set `TECHPULSE_FREE_TIER_CONFIRMED` to `false` or remove it. This does not delete data or change billing.
- **Stop email only:** Remove `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `NEWSLETTER_RECIPIENTS` from GitHub Actions secrets. Collection and AI can still consume their provider quotas, so disable the workflow too if you want TechPulse fully stopped.
- **Stop all local processing:** Set `TECHPULSE_FREE_TIER_CONFIRMED=false` and do not run project commands. Remove/revoke provider API keys if you no longer need them; do not delete Supabase data as a shutdown step.
- **Restart without upgrading:** First verify every account is still on its no-cost plan, paid overages are disabled, and no expiring trial can convert to paid. Set `TECHPULSE_FREE_TIER_CONFIRMED=true` in the local `.env` or GitHub Actions variable, then re-enable the workflow in GitHub. Start with a manual run leaving both email options unchecked. Review logs before allowing scheduled sends. If any provider asks for payment or an upgrade, stop and leave the workflow disabled.

## Validation

```sh
npm run typecheck
npm run build
git diff --check
```
