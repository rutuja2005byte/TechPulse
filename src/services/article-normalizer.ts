import { createHash } from 'node:crypto';
import type { Item } from 'rss-parser';
import type { ArticleNormalizationResult, NormalizedArticle } from '../types/article.js';

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source']);

function decodeNumericEntity(fullMatch: string, digits: string, radix: number): string {
  const point = Number.parseInt(digits, radix);
  if (point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return fullMatch;
  return String.fromCodePoint(point);
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, value: string) => decodeNumericEntity(match, value, 10))
    .replace(/&#x([\da-f]+);/gi, (match, value: string) => decodeNumericEntity(match, value, 16))
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeArticle(
  item: Item,
  sourceId: string,
  maxAgeDays: number,
  now = new Date(),
): ArticleNormalizationResult {
  const title = typeof item.title === 'string' ? cleanText(item.title) : '';
  if (!title) return { article: null, reason: 'missing or empty title' };

  if (typeof item.link !== 'string' || !item.link.trim()) {
    return { article: null, reason: 'missing article URL' };
  }
  const url = canonicalizeUrl(item.link);
  if (!url) return { article: null, reason: `invalid article URL: ${item.link}` };

  const rawDate = item.isoDate ?? item.pubDate;
  if (!rawDate) return { article: null, reason: 'missing publication date' };
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return { article: null, reason: `invalid publication date: ${rawDate}` };
  if (date.getTime() > now.getTime()) return { article: null, reason: `publication date is in the future: ${rawDate}` };
  if (now.getTime() - date.getTime() > maxAgeDays * 86_400_000) {
    return { article: null, reason: `older than ${maxAgeDays}-day window (${date.toISOString()})` };
  }
  const publishedAt = date.toISOString();

  const descriptionValue = item.contentSnippet ?? item.content ?? item.summary;
  const description = typeof descriptionValue === 'string' ? cleanText(descriptionValue) || null : null;
  const authorValue = (item as Item & { author?: string }).author ?? item.creator;
  const author = typeof authorValue === 'string' ? cleanText(authorValue) || null : null;
  const canonicalContent = `${title.toLowerCase()}\n${(description ?? '').toLowerCase()}`;
  const contentHash = createHash('sha256').update(canonicalContent).digest('hex');

  const article: NormalizedArticle = { title, description, author, url, sourceId, publishedAt, contentHash };
  return { article, reason: null };
}
