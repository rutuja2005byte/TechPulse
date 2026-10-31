# TechPulse

TechPulse collects technology RSS feeds, groups and ranks articles with Gemini, and sends an email newsletter through Resend. It is a Node.js + TypeScript + Supabase backend with no frontend or web framework.

## Daily automation (Phase 5)

`.github/workflows/daily-newsletter.yml` runs on a GitHub-hosted `ubuntu-latest` runner. The scheduled pipeline runs these existing commands in order:

1. `npm run collect` fetches, validates, deduplicates, and stores RSS articles.
2. `npm run process:ai` analyzes genuinely unprocessed articles with Gemini and stores story groups, scores, and article relationships.
3. `npm run newsletter -- --preview` confirms that the generated story set contains important, renderable newsletter content.
4. `npm run newsletter -- --send` reserves the date and sends once through Resend.

The workflow sends only when AI creates or updates stories and at least one story meets the configured importance threshold. If there are no new or updated stories, or no qualifying stories, it safely skips email delivery.

The schedule is `30 2 * * *` UTC, which is **8:00 AM India Standard Time (IST)**. The workflow also supports `workflow_dispatch`. Manual runs default to no email; select `send_newsletter` to allow a new production send, or `retry_failed_newsletter` to retry today's existing failed and unsent newsletter. Do not select both. Retry refuses accepted or ambiguous sends.

The scheduled workflow runs only after the workflow file is on the repository's default branch and GitHub Actions is enabled. GitHub notes that scheduled runs can be delayed under load and run from the default branch; public-repository schedules may be disabled after 60 days without repository activity. See [scheduled workflow troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).

## GitHub Actions setup

Add these repository or organization secrets under **Settings → Secrets and variables → Actions**. Do not put secret values in workflow files, commits, or logs.

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Required by the existing application environment configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase reads and writes; never expose to a client |
| `GEMINI_API_KEY` | Server-side AI story analysis |
| `RESEND_API_KEY` | Resend newsletter delivery |
| `RESEND_FROM_EMAIL` | Verified sender address, or Resend's test sender where recipient restrictions permit |
| `NEWSLETTER_RECIPIENTS` | Comma-separated recipient email addresses |

`SUPABASE_SERVICE_ROLE_KEY` is required by the collector, AI processor, and newsletter writer. GitHub passes it only as a job environment secret. The workflow has read-only repository permissions and does not print environment variables.

Apply the Supabase migrations before the first run. The newsletter delivery metadata and test-send tables are added by migrations `20261031004000_add_newsletter_delivery_metadata.sql` and `20261031004100_create_newsletter_test_sends.sql`.

### Manual runs

1. Open the repository's **Actions** tab and select **TechPulse Daily Newsletter**.
2. Choose **Run workflow** on the default branch.
3. Leave both email options unchecked for a safe collect/process run with a preview when new stories qualify.
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
- If no new/updated story qualifies, the workflow reports a safe skip rather than mailing stale content.
- If Resend rejects the sender, verify the sender domain and update `RESEND_FROM_EMAIL`. For Resend's test sender, its test-recipient rules still apply.
- If the newsletter record is `queued`, its send outcome may be ambiguous. Check Resend before any recovery; do not resend blindly.
- If a workflow run fails after the email step, check the same-date newsletter row and its Resend email ID before retrying.

## GitHub Actions usage and limits

The job uses a standard GitHub-hosted Linux runner, a 45-minute timeout, and repository-level concurrency protection. It runs only on the daily schedule or manual dispatch; there are no push or pull-request triggers.

GitHub Free currently includes 2,000 Actions minutes per month for private repositories; public-repository standard runner usage is free. Allowance and billing rules can change or depend on the account plan, so check [GitHub's included usage](https://docs.github.com/en/billing/reference/product-usage-included) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). At a theoretical 45-minute maximum, 30 scheduled runs would consume 1,350 minutes; actual usage is normally lower, while manual runs also count for private repositories. Runner time does not cover any Gemini or Resend API quotas or charges.

## Validation

```sh
npm run typecheck
npm run build
git diff --check
```
