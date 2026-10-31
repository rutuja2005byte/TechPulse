import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { createSupabaseAdminClient } from '../config/supabase-admin.js';
import type { Json } from '../types/database.js';
import { isFreeTierExhaustion, redactSensitiveText, requireFreeTierConfirmation, stopForFreeTierExhaustion } from './free-tier-guard.js';

const supabaseAdmin = createSupabaseAdminClient();

interface SourceLink {
  title: string;
  source_name: string;
  url: string;
}

interface NewsletterStory {
  id: string;
  headline: string;
  summary: string;
  why_it_matters: string;
  future_implications: string;
  rank_score: number;
  source_links: SourceLink[];
}

interface StoryRow {
  id: string;
  headline: string;
  summary: string;
  why_it_matters: string;
  future_implications: string;
  rank_score: number;
  source_links: Json;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function parseSourceLinks(value: Json): SourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const link = entry as Record<string, Json | undefined>;
    if (typeof link.url !== 'string' || typeof link.title !== 'string' || typeof link.source_name !== 'string') return [];
    try {
      const url = new URL(link.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
    } catch {
      return [];
    }
    return [{ title: link.title, source_name: link.source_name, url: link.url }];
  });
}

async function loadImportantStories(): Promise<NewsletterStory[]> {
  const rows: StoryRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('id,headline,summary,why_it_matters,future_implications,rank_score,source_links')
      .gte('rank_score', env.newsletterMinImportanceScore)
      .order('rank_score', { ascending: false })
      .range(offset, offset + 499);
    if (error) throw new Error(`Could not load ranked AI stories from Supabase: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }

  const stories: NewsletterStory[] = [];
  for (const row of rows) {
    const sourceLinks = parseSourceLinks(row.source_links);
    if (!row.headline.trim() || !row.summary.trim() || !row.why_it_matters.trim()
      || !row.future_implications.trim() || !Number.isFinite(row.rank_score) || sourceLinks.length === 0) {
      console.warn(`[Newsletter] Skipping malformed story ${row.id}: missing generated content, score, or valid source URL.`);
      continue;
    }
    stories.push({ ...row, source_links: sourceLinks });
  }
  stories.sort((a, b) => b.rank_score - a.rank_score);
  console.info(`[Newsletter] Selected ${stories.length} important story/stories (minimum global score ${env.newsletterMinImportanceScore}).`);
  return stories;
}

export function newsletterSubject(newsletterDate: string): string {
  const date = new Date(`${newsletterDate}T00:00:00.000Z`);
  const formatted = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  return `TechPulse Daily Briefing — ${formatted}`;
}

export function currentNewsletterDate(now = new Date()): string {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.newsletterTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => dateParts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new Error('Could not determine newsletter calendar date.');
  return `${year}-${month}-${day}`;
}

export function renderNewsletterHtml(stories: NewsletterStory[], newsletterDate: string): string {
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' })
    .format(new Date(`${newsletterDate}T00:00:00.000Z`));
  const storySections = stories.map((story) => `
    <article style="padding:24px 0;border-bottom:1px solid #e5e7eb">
      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.35;color:#111827">${escapeHtml(story.headline)}</h2>
      <p style="margin:0 0 14px;color:#374151;line-height:1.65">${escapeHtml(story.summary)}</p>
      <h3 style="margin:18px 0 6px;font-size:14px;color:#111827">Why it matters</h3>
      <p style="margin:0;color:#4b5563;line-height:1.6">${escapeHtml(story.why_it_matters)}</p>
      <h3 style="margin:18px 0 6px;font-size:14px;color:#111827">What could come next</h3>
      <p style="margin:0;color:#4b5563;line-height:1.6">${escapeHtml(story.future_implications)}</p>
      <p style="margin:14px 0 0;color:#6b7280;font-size:13px">Sources: ${story.source_links.map((link) =>
    `<a href="${escapeHtml(link.url)}" style="color:#2563eb" target="_blank" rel="noopener noreferrer">${escapeHtml(link.source_name)}: ${escapeHtml(link.title)}</a>`,
  ).join(' · ')}</p>
    </article>`).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(newsletterSubject(newsletterDate))}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="display:none;max-height:0;overflow:hidden">A concise briefing on important technology developments.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:12px;padding:28px 32px">
      <tr><td style="border-bottom:2px solid #2563eb;padding-bottom:18px"><div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#2563eb">TECHPULSE</div><h1 style="font-size:28px;margin:10px 0 4px">Daily Technology Briefing</h1><p style="margin:0;color:#6b7280">${escapeHtml(date)}</p></td></tr>
      <tr><td>${storySections}</td></tr>
      <tr><td style="padding-top:24px;color:#6b7280;font-size:12px;line-height:1.6">You’re receiving the TechPulse daily technology briefing.<br>© ${new Date(`${newsletterDate}T00:00:00.000Z`).getUTCFullYear()} TechPulse. Curated technology news, delivered with context.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function validatedSendConfiguration(testSender = false): { apiKey: string; from: string; recipients: string[] } {
  const apiKey = env.resendApiKey;
  const from = testSender ? 'onboarding@resend.dev' : env.resendFromEmail;
  const recipients = env.newsletterRecipients;
  if (!apiKey) throw new Error('RESEND_API_KEY is missing from the private .env file.');
  if (!from || !from.includes('@')) throw new Error('RESEND_FROM_EMAIL must be a valid sender address.');
  if (!recipients.length || recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('NEWSLETTER_RECIPIENTS must contain one or more comma-separated email addresses.');
  }
  return { apiKey, from, recipients };
}

export async function previewNewsletter(): Promise<{ storyCount: number; subject: string; html: string }> {
  const newsletterDate = currentNewsletterDate();
  const stories = await loadImportantStories();
  if (!stories.length) throw new Error('No valid stories meet the newsletter importance threshold. No newsletter was created.');
  return { storyCount: stories.length, subject: newsletterSubject(newsletterDate), html: renderNewsletterHtml(stories, newsletterDate) };
}

export async function getTodaysNewsletterStatus(): Promise<{ date: string; status: string | null }> {
  const date = currentNewsletterDate();
  const { data, error } = await supabaseAdmin
    .from('newsletters')
    .select('delivery_status')
    .eq('newsletter_date', date)
    .maybeSingle();
  if (error) throw new Error(`Could not safely check today's newsletter status: ${error.message}`);
  const status = data?.delivery_status ?? null;
  console.info(`[Newsletter] Read-only status check for ${date} (${env.newsletterTimeZone}): ${status ?? 'no record'}.`);
  return { date, status };
}

function senderDomain(from: string): string {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  const domain = address.trim().match(/^[^\s@]+@([^\s@]+)$/)?.[1];
  if (!domain) throw new Error('RESEND_FROM_EMAIL must contain a valid email address.');
  return domain.toLowerCase();
}

export function isResendTestSender(from: string): boolean {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return address.trim().toLowerCase() === 'onboarding@resend.dev';
}

async function assertSenderDomainVerified(apiKey: string, from: string): Promise<void> {
  if (isResendTestSender(from)) {
    console.info('[Newsletter] Using Resend test sender onboarding@resend.dev; Resend will enforce its test-recipient restrictions.');
    return;
  }
  const domain = senderDomain(from);
  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as {
    data?: Array<{ name?: string; status?: string; capabilities?: { sending?: string } }>;
    message?: string;
  };
  if (!response.ok) {
    const message = redactSensitiveText(body.message ?? 'domain lookup failed', apiKey);
    if (isFreeTierExhaustion(response.status, message)) stopForFreeTierExhaustion('Resend', response.status, message);
    throw new Error(`Could not verify sender domain with Resend (HTTP ${response.status}): ${message}`);
  }
  const matching = body.data?.find((entry) => entry.name?.toLowerCase() === domain);
  if (!matching || matching.status !== 'verified' || matching.capabilities?.sending !== 'enabled') {
    throw new Error(`Resend sender domain ${domain} is not verified for sending. Verify it in Resend before sending; no newsletter record was changed.`);
  }
  console.info(`[Newsletter] Resend sender domain ${domain} is verified for sending.`);
}

interface ExistingNewsletter {
  id: string;
  newsletter_date: string;
  subject: string;
  html_content: string;
  delivery_status: string;
  resend_email_id: string | null;
  recipient_count: number | null;
  sent_at: string | null;
  delivery_error: string | null;
}

interface TestNewsletterRecord {
  id: string;
  html_content: string;
  subject: string;
  delivery_status: string;
  resend_email_id: string | null;
}

export async function sendNewsletter(retryFailed = false): Promise<void> {
  requireFreeTierConfirmation(env.freeTierConfirmed, 'Resend');
  const { apiKey, from, recipients } = validatedSendConfiguration();
  const newsletterDate = currentNewsletterDate();
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('newsletters')
    .select('id,newsletter_date,subject,html_content,delivery_status,resend_email_id,recipient_count,sent_at,delivery_error')
    .eq('newsletter_date', newsletterDate)
    .maybeSingle();
  if (lookupError) throw new Error(`Could not check for a newsletter already created today: ${lookupError.message}`);

  let newsletter: Pick<ExistingNewsletter, 'id'>;
  let subject: string;
  let html: string;
  if (retryFailed) {
    if (!existing) throw new Error(`No newsletter record exists for ${newsletterDate}; there is nothing to retry.`);
    const row = existing as ExistingNewsletter;
    if (row.delivery_status !== 'failed' || row.resend_email_id || row.sent_at) {
      throw new Error(`Newsletter ${row.id} is ${row.delivery_status} or has a send ID; retry is allowed only for a definite failed, unsent record.`);
    }
    if (row.recipient_count !== recipients.length) {
      throw new Error(`Configured recipient count (${recipients.length}) differs from the failed record (${row.recipient_count}); refusing to retry with a changed audience.`);
    }
    if (!row.subject || !row.html_content) throw new Error('Failed newsletter record has no stored subject or HTML; refusing to regenerate a different request under the same record.');
    subject = row.subject;
    html = row.html_content;
    await assertSenderDomainVerified(apiKey, from);
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('newsletters')
      .update({ delivery_status: 'queued', delivery_error: null })
      .eq('id', row.id)
      .eq('delivery_status', 'failed')
      .is('resend_email_id', null)
      .is('sent_at', null)
      .select('id')
      .maybeSingle();
    if (claimError) throw new Error(`Could not claim failed newsletter for retry: ${claimError.message}`);
    if (!claimed) throw new Error('Another process changed or claimed this newsletter; refusing a concurrent retry.');
    newsletter = claimed;
    console.info(`[Newsletter] Reusing failed newsletter ${row.id} for ${newsletterDate}; stored subject and HTML are unchanged.`);
  } else {
    if (existing) throw new Error(`Newsletter for ${newsletterDate} already exists (${existing.delivery_status}); use --retry only when it is definitely failed and unsent.`);
    await assertSenderDomainVerified(apiKey, from);
    const stories = await loadImportantStories();
    if (!stories.length) throw new Error('No valid stories meet the newsletter importance threshold. No email was sent.');
    subject = newsletterSubject(newsletterDate);
    html = renderNewsletterHtml(stories, newsletterDate);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('newsletters')
      .insert({ newsletter_date: newsletterDate, subject, html_content: html, delivery_status: 'queued', recipient_count: recipients.length })
      .select('id')
      .single();
    if (insertError) throw new Error(`Could not reserve today's newsletter; no email was sent: ${insertError.message}`);
    newsletter = inserted;
  }

  console.info(`[Newsletter] Sending newsletter ${newsletter.id} to ${recipients.length} configured recipient(s).`);
  const idempotencyHash = createHash('sha256')
    .update(JSON.stringify({ from, recipients, subject, html }))
    .digest('hex');
  const idempotencyKey = `techpulse-newsletter/${newsletter.id}/${idempotencyHash}`;
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });
  } catch (error) {
    const message = redactSensitiveText(error instanceof Error ? error.message : String(error), apiKey);
    const { error: updateError } = await supabaseAdmin.from('newsletters').update({ delivery_error: message }).eq('id', newsletter.id);
    if (updateError) console.error(`[Newsletter] Could not record ambiguous Resend request: ${updateError.message}`);
    throw new Error(`Resend request outcome is unknown; newsletter remains queued to prevent a duplicate send. Check Resend email logs before any manual recovery.`);
  }

  const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !responseBody.id) {
    const message = redactSensitiveText(responseBody.message ?? responseBody.name ?? `Resend returned HTTP ${response.status}.`, apiKey);
    const freeTierBlocked = isFreeTierExhaustion(response.status, message);
    const ambiguous = response.status >= 500 || responseBody.name === 'concurrent_idempotent_requests';
    const { error: updateError } = await supabaseAdmin.from('newsletters')
      .update({ delivery_status: freeTierBlocked ? 'failed' : ambiguous ? 'queued' : 'failed', delivery_error: message })
      .eq('id', newsletter.id);
    if (updateError) console.error(`[Newsletter] Failed to record Resend error in Supabase: ${updateError.message}`);
    if (freeTierBlocked) stopForFreeTierExhaustion('Resend', response.status, message);
    throw new Error(`Resend ${ambiguous ? 'returned an ambiguous' : 'rejected the'} result (HTTP ${response.status}): ${message}${ambiguous ? ' Newsletter remains queued; do not retry until the Resend outcome is checked.' : ' A corrected retry may reuse this newsletter record.'}`);
  }

  const sentAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('newsletters')
    .update({ delivery_status: 'sent', resend_email_id: responseBody.id, sent_at: sentAt, delivery_error: null })
    .eq('id', newsletter.id);
  if (updateError) {
    throw new Error(`Resend accepted email ${responseBody.id}, but Supabase could not record acceptance. The newsletter remains reserved and will not be resent automatically: ${updateError.message}`);
  }
  console.info(`[Newsletter] Resend accepted email ${responseBody.id}; newsletter record ${newsletter.id} updated. Recipient delivery is subject to Resend delivery events.`);
}

/** Sends an existing accepted newsletter to the single configured Gmail as a separate test send. */
export async function sendNewsletterTest(newsletterId: string): Promise<void> {
  requireFreeTierConfirmation(env.freeTierConfirmed, 'Resend');
  const { apiKey, from, recipients } = validatedSendConfiguration(true);
  if (recipients.length !== 1 || !/^[^\s@]+@gmail\.com$/i.test(recipients[0])) {
    throw new Error('Test send requires exactly one Gmail address in NEWSLETTER_RECIPIENTS.');
  }

  const { data: newsletter, error } = await supabaseAdmin
    .from('newsletters')
    .select('id,html_content,subject,delivery_status,resend_email_id')
    .eq('id', newsletterId)
    .single();
  if (error) throw new Error(`Could not load source newsletter ${newsletterId}: ${error.message}`);
  const source = newsletter as TestNewsletterRecord;
  if (source.delivery_status !== 'sent' || !source.resend_email_id || !source.html_content || !source.subject) {
    throw new Error('Test send requires an already accepted newsletter with stored subject and HTML.');
  }

  const requestHash = createHash('sha256')
    .update(JSON.stringify({ newsletterId, from, recipient: recipients[0], subject: source.subject, html: source.html_content }))
    .digest('hex');
  const { error: reserveError } = await supabaseAdmin.from('newsletter_test_sends').upsert({
    newsletter_id: newsletterId,
    request_hash: requestHash,
    recipient_email: recipients[0],
    send_status: 'queued',
  }, { onConflict: 'request_hash', ignoreDuplicates: true });
  if (reserveError) throw new Error(`Could not reserve a unique test-send record: ${reserveError.message}`);

  const { data: testSend, error: lookupError } = await supabaseAdmin
    .from('newsletter_test_sends')
    .select('id,send_status,resend_email_id')
    .eq('request_hash', requestHash)
    .single();
  if (lookupError) throw new Error(`Could not load test-send state: ${lookupError.message}`);
  if (testSend.send_status === 'sent' && testSend.resend_email_id) {
    console.info(`[Newsletter] This test request was already accepted as ${testSend.resend_email_id}; no duplicate email sent.`);
    return;
  }
  if (testSend.send_status !== 'queued' || testSend.resend_email_id) {
    throw new Error(`Test send is ${testSend.send_status} or ambiguous; refusing an automatic duplicate.`);
  }

  console.info(`[Newsletter] Sending existing newsletter ${newsletterId} to the configured single Gmail recipient. The production newsletter record will not be modified.`);
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `techpulse-newsletter-test/${requestHash}`,
      },
      body: JSON.stringify({ from, to: recipients, subject: source.subject, html: source.html_content }),
    });
  } catch (sendError) {
    const message = redactSensitiveText(sendError instanceof Error ? sendError.message : String(sendError), apiKey);
    await supabaseAdmin.from('newsletter_test_sends').update({ delivery_error: message }).eq('id', testSend.id);
    throw new Error('Test-send outcome is ambiguous; the test record remains queued and will not be automatically resent.');
  }

  const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !responseBody.id) {
    const message = redactSensitiveText(responseBody.message ?? responseBody.name ?? `Resend returned HTTP ${response.status}.`, apiKey);
    const freeTierBlocked = isFreeTierExhaustion(response.status, message);
    const ambiguous = response.status >= 500 || responseBody.name === 'concurrent_idempotent_requests';
    await supabaseAdmin.from('newsletter_test_sends').update({
      send_status: freeTierBlocked ? 'failed' : ambiguous ? 'queued' : 'failed',
      delivery_error: message,
    }).eq('id', testSend.id);
    if (freeTierBlocked) stopForFreeTierExhaustion('Resend', response.status, message);
    throw new Error(`Resend ${ambiguous ? 'returned an ambiguous' : 'rejected the test send'} (HTTP ${response.status}): ${message}`);
  }

  const { error: saveError } = await supabaseAdmin.from('newsletter_test_sends').update({
    send_status: 'sent',
    resend_email_id: responseBody.id,
    sent_at: new Date().toISOString(),
    delivery_error: null,
  }).eq('id', testSend.id);
  if (saveError) throw new Error(`Resend accepted test email ${responseBody.id}, but the test record could not be updated: ${saveError.message}`);
  console.info(`[Newsletter] Resend accepted test email ${responseBody.id}; the production newsletter record was not modified.`);
}
