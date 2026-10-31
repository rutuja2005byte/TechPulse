import { createHash } from 'node:crypto';
import type { Item } from 'rss-parser';
import type { NormalizedArticle } from '../types/article.js';

const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();

export function normalizeArticle(item: Item, maxAgeDays: number, now = new Date()): NormalizedArticle | null {
  const title = typeof item.title === 'string' ? stripHtml(item.title) : '';
  const rawUrl = item.link;
  if (!title || typeof rawUrl !== 'string') return null;

  let url: string;
  try {
    const parsedUrl = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
    parsedUrl.hash = '';
    url = parsedUrl.toString();
  } catch {
    return null;
  }

  const descriptionValue = item.contentSnippet ?? item.content ?? item.summary;
  const description = typeof descriptionValue === 'string' ? stripHtml(descriptionValue) || null : null;
  const rawDate = item.isoDate ?? item.pubDate;
  const date = rawDate ? new Date(rawDate) : null;
  if (date && Number.isNaN(date.getTime())) return null;
  if (date && date.getTime() > now.getTime()) return null;
  if (maxAgeDays >= 0 && date && now.getTime() - date.getTime() > maxAgeDays * 86_400_000) return null;

  const canonicalContent = `${title.toLocaleLowerCase()}\n${(description ?? '').toLocaleLowerCase()}`;
  const contentHash = createHash('sha256').update(canonicalContent).digest('hex');

  return { title, description, url, publishedAt: date?.toISOString() ?? null, contentHash };
}
