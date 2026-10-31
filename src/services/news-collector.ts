import Parser from 'rss-parser';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import type { FeedSource } from '../types/article.js';
import { normalizeArticle } from './article-normalizer.js';

const parser = new Parser();

async function getSources(): Promise<FeedSource[]> {
  if (env.rssFeedUrls.length) {
    return env.rssFeedUrls.map((url) => ({ id: '', name: new URL(url).hostname.replace(/^www\./, ''), url }));
  }

  const { data, error } = await supabase.from('sources').select('id,name,url').eq('is_active', true);
  if (error) throw new Error(`Could not load RSS sources: ${error.message}`);
  return data ?? [];
}

export async function collectNews(): Promise<{ fetched: number; stored: number; skipped: number; failedFeeds: number }> {
  const sources = await getSources();
  let fetched = 0;
  let stored = 0;
  let skipped = 0;
  let failedFeeds = 0;

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url);
      const normalized = feed.items
        .map((item) => normalizeArticle(item, env.articleMaxAgeDays))
        .filter((article) => article !== null);
      fetched += feed.items.length;
      skipped += feed.items.length - normalized.length;
      if (!normalized.length) continue;

      const rows = normalized.map((article) => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source_id: source.id,
        published_at: article.publishedAt,
        content_hash: article.contentHash,
      }));
      const urls = rows.map((row) => row.url);
      const hashes = [...new Set(rows.map((row) => row.content_hash))];
      const [urlResult, hashResult] = await Promise.all([
        supabase.from('articles').select('url').in('url', urls),
        supabase.from('articles').select('content_hash').eq('source_id', source.id).in('content_hash', hashes),
      ]);
      if (urlResult.error) throw new Error(urlResult.error.message);
      if (hashResult.error) throw new Error(hashResult.error.message);

      const existingUrls = new Set(urlResult.data.map((row) => row.url));
      const existingHashes = new Set(hashResult.data.map((row) => row.content_hash));
      const seenUrls = new Set<string>();
      const seenHashes = new Set<string>();
      const newRows = rows.filter((row) => {
        if (existingUrls.has(row.url) || existingHashes.has(row.content_hash) || seenUrls.has(row.url) || seenHashes.has(row.content_hash)) {
          return false;
        }
        seenUrls.add(row.url);
        seenHashes.add(row.content_hash);
        return true;
      });
      skipped += rows.length - newRows.length;
      if (!newRows.length) continue;

      const { data, error } = await supabase.from('articles').insert(newRows).select('id');
      if (error) throw new Error(error.message);
      stored += data?.length ?? 0;
    } catch (error) {
      failedFeeds += 1;
      console.warn(`Skipping feed ${source.name} (${source.url}):`, error instanceof Error ? error.message : error);
    }
  }

  return { fetched, stored, skipped, failedFeeds };
}
