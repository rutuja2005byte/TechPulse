import { env } from '../config/env.js';
import { createSupabaseAdminClient } from '../config/supabase-admin.js';
import type { Json } from '../types/database.js';

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

function validatedSendConfiguration(): { apiKey: string; from: string; recipients: string[] } {
  const apiKey = env.resendApiKey;
  const from = env.resendFromEmail;
  const recipients = env.newsletterRecipients;
  if (!apiKey) throw new Error('RESEND_API_KEY is missing from the private .env file.');
  if (!from || !from.includes('@')) throw new Error('RESEND_FROM_EMAIL must be a valid sender address.');
  if (!recipients.length || recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('NEWSLETTER_RECIPIENTS must contain one or more comma-separated email addresses.');
  }
  return { apiKey, from, recipients };
}

export async function previewNewsletter(): Promise<{ storyCount: number; subject: string; html: string }> {
  const newsletterDate = new Date().toISOString().slice(0, 10);
  const stories = await loadImportantStories();
  if (!stories.length) throw new Error('No valid stories meet the newsletter importance threshold. No newsletter was created.');
  return { storyCount: stories.length, subject: newsletterSubject(newsletterDate), html: renderNewsletterHtml(stories, newsletterDate) };
}

export async function sendNewsletter(): Promise<void> {
  const { apiKey, from, recipients } = validatedSendConfiguration();
  const newsletterDate = new Date().toISOString().slice(0, 10);
  const stories = await loadImportantStories();
  if (!stories.length) throw new Error('No valid stories meet the newsletter importance threshold. No email was sent.');
  const subject = newsletterSubject(newsletterDate);
  const html = renderNewsletterHtml(stories, newsletterDate);

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('newsletters')
    .select('id,delivery_status')
    .eq('newsletter_date', newsletterDate)
    .maybeSingle();
  if (lookupError) throw new Error(`Could not check for a newsletter already created today: ${lookupError.message}`);
  if (existing) throw new Error(`Newsletter for ${newsletterDate} already exists (${existing.delivery_status}); refusing a duplicate send.`);

  const { data: newsletter, error: insertError } = await supabaseAdmin
    .from('newsletters')
    .insert({ newsletter_date: newsletterDate, subject, html_content: html, delivery_status: 'queued', recipient_count: recipients.length })
    .select('id')
    .single();
  if (insertError) throw new Error(`Could not reserve today's newsletter; no email was sent: ${insertError.message}`);

  console.info(`[Newsletter] Reserved ${newsletterDate} as ${newsletter.id}; sending to ${recipients.length} configured recipient(s).`);
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `techpulse-newsletter/${newsletter.id}`,
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin.from('newsletters').update({ delivery_error: message }).eq('id', newsletter.id);
    throw new Error(`Resend request outcome is unknown; newsletter remains queued to prevent a duplicate send. Check Resend with idempotency key techpulse-newsletter/${newsletter.id}.`);
  }

  const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !responseBody.id) {
    const message = responseBody.message ?? responseBody.name ?? `Resend returned HTTP ${response.status}.`;
    const { error: updateError } = await supabaseAdmin
      .from('newsletters')
      .update({ delivery_status: 'failed', delivery_error: message })
      .eq('id', newsletter.id);
    if (updateError) console.error(`[Newsletter] Failed to record Resend error in Supabase: ${updateError.message}`);
    throw new Error(`Resend rejected the newsletter (HTTP ${response.status}): ${message}`);
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
