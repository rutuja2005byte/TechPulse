import Parser from 'rss-parser';
import { env } from '../config/env.js';
import { createSupabaseAdminClient } from '../config/supabase-admin.js';
import type { FeedSource, NormalizedArticle } from '../types/article.js';
import { normalizeArticle } from './article-normalizer.js';
import { isFreeTierStopError } from './free-tier-guard.js';

const parser = new Parser({
  timeout: env.feedTimeoutMs,
  customFields: { item: [['author', 'author']] },
});
const supabaseAdmin = createSupabaseAdminClient();

interface CollectionResult {
  fetched: number;
  stored: number;
  skipped: number;
  failedFeeds: number;
  failedArticles: number;
  failedDatabaseOperations: number;
}

function logSkipped(source: FeedSource, articleLabel: string, reason: string): void {
  console.info(`Skipped [${source.name}] ${articleLabel}: ${reason}`);
}

async function getSources(): Promise<FeedSource[]> {
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id,name,url,source_type')
    .eq('is_active', true);
  if (error) throw new Error(`Could not load active RSS sources from Supabase: ${error.message}`);

  const activeSources = (data ?? []).map(({ id, name, url, source_type }) => ({
    id,
    name,
    url,
    sourceType: source_type,
  }));
  if (!env.rssFeedUrls.length) return activeSources;

  const configuredUrls = new Set<string>();
  for (const rawUrl of env.rssFeedUrls) {
    try {
      configuredUrls.add(new URL(rawUrl).toString());
    } catch {
      console.warn(`Ignoring invalid RSS_FEED_URLS entry: ${rawUrl}`);
    }
  }
  const matchedSources = activeSources.filter((source) => configuredUrls.has(new URL(source.url).toString()));
  const matchedUrls = new Set(matchedSources.map((source) => new URL(source.url).toString()));
  const missingUrls = [...configuredUrls].filter((url) => !matchedUrls.has(url));
  for (const url of missingUrls) console.warn(`RSS_FEED_URLS entry is not an active source in Supabase: ${url}`);
  return matchedSources;
}

function uniqueArticlesForSource(
  source: FeedSource,
  articles: NormalizedArticle[],
  seenUrls: Set<string>,
  seenSourceHashes: Set<string>,
): NormalizedArticle[] {
  const unique: NormalizedArticle[] = [];
  for (const article of articles) {
    const sourceHashKey = `${article.sourceId}:${article.contentHash}`;
    if (seenUrls.has(article.url)) {
      logSkipped(source, article.title, `duplicate canonical URL ${article.url} in this collection`);
      continue;
    }
    if (seenSourceHashes.has(sourceHashKey)) {
      logSkipped(source, article.title, 'duplicate content hash in this collection');
      continue;
    }
    seenUrls.add(article.url);
    seenSourceHashes.add(sourceHashKey);
    unique.push(article);
  }
  return unique;
}

export async function collectNews(): Promise<CollectionResult> {
  const sources = await getSources();
  console.info(`Loaded ${sources.length} active news source(s) from Supabase sources${env.rssFeedUrls.length ? ' (filtered by RSS_FEED_URLS)' : ''}.`);
  if (sources.length === 0) {
    console.warn('No active RSS sources found. Seed sources or mark existing source rows active in Supabase.');
  }

  const result: CollectionResult = {
    fetched: 0,
    stored: 0,
    skipped: 0,
    failedFeeds: 0,
    failedArticles: 0,
    failedDatabaseOperations: 0,
  };
  const seenUrls = new Set<string>();
  const seenSourceHashes = new Set<string>();

  for (const source of sources) {
    const sourceStart = { stored: result.stored, skipped: result.skipped, failedArticles: result.failedArticles };
    console.info(`Fetching ${source.name}: ${source.url}`);
    let feedItems: Awaited<ReturnType<typeof parser.parseURL>>['items'];
    try {
      const parsedFeed = await parser.parseURL(source.url);
      feedItems = Array.isArray(parsedFeed.items) ? parsedFeed.items : [];
      result.fetched += feedItems.length;
      console.info(`${source.name}: fetched ${feedItems.length} item(s).`);
    } catch (error) {
      result.failedFeeds += 1;
      console.error(`Feed error [${source.name}] ${source.url}: ${error instanceof Error ? error.message : String(error)}`);
      console.info(`${source.name}: fetched=0, stored=0, skipped=0, failedFeeds=1, failedArticles=0.`);
      continue;
    }
    if (feedItems.length === 0) console.info(`${source.name}: feed returned zero items (valid empty feed).`);

    const validArticles: NormalizedArticle[] = [];
    for (const [index, item] of feedItems.entries()) {
      const label = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `item ${index + 1}`;
      const normalized = normalizeArticle(item, source.id, env.articleMaxAgeDays);
      if (!normalized.article) {
        result.skipped += 1;
        logSkipped(source, label, normalized.reason ?? 'failed validation');
        continue;
      }
      validArticles.push(normalized.article);
    }

    const uniqueArticles = uniqueArticlesForSource(source, validArticles, seenUrls, seenSourceHashes);
    result.skipped += validArticles.length - uniqueArticles.length;
    if (uniqueArticles.length === 0) {
      console.info(`${source.name}: fetched=${feedItems.length}, stored=0, skipped=${result.skipped - sourceStart.skipped}, failedFeeds=0, failedArticles=0.`);
      continue;
    }

    const urls = uniqueArticles.map(({ url }) => url);
    const hashes = [...new Set(uniqueArticles.map(({ contentHash }) => contentHash))];
    const [urlResult, hashResult] = await Promise.all([
      supabaseAdmin.from('articles').select('url').in('url', urls),
      supabaseAdmin.from('articles').select('content_hash').eq('source_id', source.id).in('content_hash', hashes),
    ]);
    if (urlResult.error) {
      if (isFreeTierStopError(urlResult.error)) throw urlResult.error;
      result.failedDatabaseOperations += 1;
      console.error(`Database duplicate check failed [${source.name}]: ${urlResult.error.message}`);
      console.info(`${source.name}: fetched=${feedItems.length}, stored=0, skipped=${result.skipped - sourceStart.skipped}, failedFeeds=0, failedArticles=0, failedDatabaseOperations=1.`);
      continue;
    }
    if (hashResult.error) {
      if (isFreeTierStopError(hashResult.error)) throw hashResult.error;
      result.failedDatabaseOperations += 1;
      console.error(`Database content-hash check failed [${source.name}]: ${hashResult.error.message}`);
      console.info(`${source.name}: fetched=${feedItems.length}, stored=0, skipped=${result.skipped - sourceStart.skipped}, failedFeeds=0, failedArticles=0, failedDatabaseOperations=1.`);
      continue;
    }

    const existingUrls = new Set(urlResult.data.map(({ url }) => url));
    const existingHashes = new Set(hashResult.data.map(({ content_hash }) => content_hash));
    const rowsToInsert: NormalizedArticle[] = [];
    for (const article of uniqueArticles) {
      if (existingUrls.has(article.url)) {
        result.skipped += 1;
        logSkipped(source, article.title, `canonical URL already exists in Supabase: ${article.url}`);
      } else if (existingHashes.has(article.contentHash)) {
        result.skipped += 1;
        logSkipped(source, article.title, 'content hash already exists in Supabase for this source');
      } else {
        rowsToInsert.push(article);
      }
    }

    // Insert one row at a time so one unexpected constraint or schema error does not
    // discard otherwise valid articles from this source. Unique races are duplicates.
    let sourceStored = 0;
    for (const article of rowsToInsert) {
      const { error } = await supabaseAdmin.from('articles').insert({
        title: article.title,
        description: article.description,
        author: article.author,
        url: article.url,
        source_id: article.sourceId,
        published_at: article.publishedAt,
        content_hash: article.contentHash,
      });
      if (!error) {
        result.stored += 1;
        sourceStored += 1;
        continue;
      }
      if (isFreeTierStopError(error)) throw error;
      if (error.code === '23505') {
        result.skipped += 1;
        logSkipped(source, article.title, 'duplicate rejected by Supabase unique constraint');
        continue;
      }
      result.failedArticles += 1;
      console.error(`Article insert failed [${source.name}] ${article.url}: ${error.message} (code ${error.code ?? 'unknown'})`);
    }
    console.info(`${source.name}: fetched=${feedItems.length}, stored=${sourceStored}, skipped=${result.skipped - sourceStart.skipped}, failedFeeds=0, failedArticles=${result.failedArticles - sourceStart.failedArticles}, insertCandidates=${rowsToInsert.length}.`);
  }

  console.info(`Collection totals: fetched=${result.fetched}, stored=${result.stored}, skipped=${result.skipped}, failedFeeds=${result.failedFeeds}, failedArticles=${result.failedArticles}, failedDatabaseOperations=${result.failedDatabaseOperations}.`);
  return result;
}
