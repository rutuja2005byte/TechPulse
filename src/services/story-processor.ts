import { createHash } from 'node:crypto';
import { createSupabaseAdminClient } from '../config/supabase-admin.js';
import { env } from '../config/env.js';
import type { Json } from '../types/database.js';
import type { StoryGroup } from '../types/story-analysis.js';
import { analyzeArticles, type AnalysisArticle, type ExistingStoryContext } from './gemini-story-analyzer.js';

const supabaseAdmin = createSupabaseAdminClient();
const MAX_ARTICLE_PAGE = 500;
const EXISTING_STORY_LOOKBACK_DAYS = 90;
const MAX_EXISTING_STORY_CANDIDATES = 50;

interface StoredStory extends ExistingStoryContext {
  source_links: Json;
  verified_facts: Json;
  story_key: string | null;
}

interface ProcessingResult {
  articlesFetched: number;
  storiesCreated: number;
  storiesUpdated: number;
  articlesLinked: number;
  articlesExcluded: number;
  failedStories: number;
  failedDatabaseOperations: number;
}

function storyKey(articleIds: string[]): string {
  return createHash('sha256').update([...articleIds].sort().join('\n')).digest('hex');
}

function rankScore(group: StoryGroup): number {
  return Math.round((
    group.importance_score * 0.3
    + group.relevance_score * 0.25
    + group.impact_score * 0.3
    + group.credibility_score * 0.15
  ) * 100) / 100;
}

function sourceLinksFor(articleIds: string[], articleById: Map<string, AnalysisArticle>): Array<Record<string, string | null>> {
  return articleIds.map((id) => {
    const article = articleById.get(id);
    if (!article) throw new Error(`Cannot create source link for unknown article ${id}.`);
    return {
      article_id: article.id,
      title: article.title,
      source_name: article.source_name,
      url: article.url,
      published_at: article.published_at,
    };
  });
}

function asObjectArray(value: Json): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => entry as Record<string, unknown>);
}

function mergeJsonRecords(oldValue: Json, newValues: Array<Record<string, unknown>>, uniqueKey: string): Json {
  const merged = new Map<string, Record<string, unknown>>();
  for (const item of [...asObjectArray(oldValue), ...newValues]) {
    const key = typeof item[uniqueKey] === 'string' ? item[uniqueKey] as string : JSON.stringify(item);
    merged.set(key, item);
  }
  return [...merged.values()] as Json;
}

function verifyAssignments(
  response: Awaited<ReturnType<typeof analyzeArticles>>,
  articleIds: Set<string>,
  existingStoryIds: Set<string>,
): void {
  const assignments = new Map<string, string>();
  const usedExistingStories = new Set<string>();
  const normalizedHeadlines = new Set<string>();

  for (const group of response.groups) {
    if (group.existing_story_id) {
      if (!existingStoryIds.has(group.existing_story_id)) throw new Error(`Gemini referenced unknown existing story ${group.existing_story_id}.`);
      if (usedExistingStories.has(group.existing_story_id)) throw new Error(`Gemini split articles into multiple groups for existing story ${group.existing_story_id}.`);
      usedExistingStories.add(group.existing_story_id);
    }
    const headlineKey = group.headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (normalizedHeadlines.has(headlineKey)) throw new Error(`Gemini returned duplicate story headlines: ${group.headline}`);
    normalizedHeadlines.add(headlineKey);

    for (const articleId of group.article_ids) {
      if (!articleIds.has(articleId)) throw new Error(`Gemini referenced unknown article ${articleId}.`);
      if (assignments.has(articleId)) throw new Error(`Gemini assigned article ${articleId} more than once.`);
      assignments.set(articleId, 'grouped');
    }
    for (const fact of group.verified_facts) {
      for (const evidenceId of fact.article_ids) {
        if (!group.article_ids.includes(evidenceId)) {
          throw new Error(`Fact evidence article ${evidenceId} is not a member of story group ${group.headline}.`);
        }
      }
    }
  }

  for (const excluded of response.excluded_articles) {
    if (!articleIds.has(excluded.article_id)) throw new Error(`Gemini excluded unknown article ${excluded.article_id}.`);
    if (assignments.has(excluded.article_id)) throw new Error(`Gemini both grouped and excluded article ${excluded.article_id}.`);
    assignments.set(excluded.article_id, 'excluded');
  }

  const unassigned = [...articleIds].filter((id) => !assignments.has(id));
  if (unassigned.length) throw new Error(`Gemini left ${unassigned.length} article(s) unassigned; no results were written.`);
}

async function fetchUnprocessedArticles(limit: number): Promise<AnalysisArticle[]> {
  console.info('[Supabase] Checking article processing relationships.');
  const { data: linkedRows, error: linkedError } = await supabaseAdmin.from('story_articles').select('article_id');
  if (linkedError) throw new Error(`Could not load processed article IDs (story_articles migration/table required): ${linkedError.message}`);
  const processed = new Set((linkedRows ?? []).map(({ article_id }) => article_id));
  console.info(`[Supabase] Found ${processed.size} article(s) already assigned or excluded.`);
  const candidates: Array<{ id: string; title: string; description: string | null; author: string | null; url: string; published_at: string | null; source_id: string }> = [];

  console.info('[Supabase] Loading unprocessed articles.');
  for (let offset = 0; ; offset += MAX_ARTICLE_PAGE) {
    const { data, error } = await supabaseAdmin
      .from('articles')
      .select('id,title,description,author,url,published_at,source_id')
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + MAX_ARTICLE_PAGE - 1);
    if (error) throw new Error(`Could not load articles for AI processing: ${error.message}`);

    for (const article of data ?? []) {
      if (!processed.has(article.id)) candidates.push(article);
      if (candidates.length >= limit) break;
    }
    if (candidates.length >= limit || (data ?? []).length < MAX_ARTICLE_PAGE) break;
  }

  if (!candidates.length) return [];
  console.info(`[Supabase] Selected ${candidates.length} unprocessed article(s); resolving source names.`);
  const sourceIds = [...new Set(candidates.map(({ source_id }) => source_id))];
  const { data: sources, error: sourceError } = await supabaseAdmin.from('sources').select('id,name').in('id', sourceIds);
  if (sourceError) throw new Error(`Could not resolve article source names: ${sourceError.message}`);
  const sourceNames = new Map((sources ?? []).map(({ id, name }) => [id, name]));

  return candidates.map((article) => ({
    ...article,
    source_name: sourceNames.get(article.source_id) ?? 'Unknown source',
    description: article.description?.slice(0, 3_000) ?? null,
  }));
}

async function fetchExistingStoryContext(): Promise<StoredStory[]> {
  const cutoff = new Date(Date.now() - EXISTING_STORY_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('stories')
    .select('id,headline,summary,detailed_content,source_links,verified_facts,story_key')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(MAX_EXISTING_STORY_CANDIDATES);
  if (error) throw new Error(`Could not load existing stories for duplicate grouping (AI story migration required): ${error.message}`);
  console.info(`[Supabase] Existing story query completed with ${(data ?? []).length} candidate(s).`);
  return data ?? [];
}

function detailedContent(group: StoryGroup, verifiedFacts: Array<Record<string, unknown>>): string {
  const factLines = verifiedFacts.map((fact) => `- ${String(fact.claim)}`).join('\n');
  return [
    'Why it matters', group.why_it_matters,
    'Potential future implications', group.future_implications,
    'Analysis', group.analysis,
    'Source-reported facts', factLines || '- No source-supported facts were returned.',
  ].join('\n\n');
}

function emptyResult(): ProcessingResult {
  return {
    articlesFetched: 0,
    storiesCreated: 0,
    storiesUpdated: 0,
    articlesLinked: 0,
    articlesExcluded: 0,
    failedStories: 0,
    failedDatabaseOperations: 0,
  };
}

function addResult(target: ProcessingResult, source: ProcessingResult): void {
  target.articlesFetched += source.articlesFetched;
  target.storiesCreated += source.storiesCreated;
  target.storiesUpdated += source.storiesUpdated;
  target.articlesLinked += source.articlesLinked;
  target.articlesExcluded += source.articlesExcluded;
  target.failedStories += source.failedStories;
  target.failedDatabaseOperations += source.failedDatabaseOperations;
}

async function processArticleBatch(articles: AnalysisArticle[]): Promise<ProcessingResult> {
  const result = emptyResult();
  result.articlesFetched = articles.length;
  const existingStories = await fetchExistingStoryContext();
  console.info(`Loaded ${existingStories.length} recent existing story candidate(s) for duplicate grouping.`);
  const modelContext = existingStories.map(({ id, headline, summary, detailed_content }) => ({
    id,
    headline,
    summary: summary.slice(0, 500),
    detailed_content: detailed_content.slice(0, 700),
  }));
  console.info(`[AI] Calling Gemini model ${env.geminiModel} for cross-article grouping and global scoring.`);
  const analysis = await analyzeArticles(articles, modelContext);
  console.info('[AI] Gemini returned; validating article assignments and evidence references.');
  verifyAssignments(analysis, new Set(articles.map(({ id }) => id)), new Set(existingStories.map(({ id }) => id)));
  console.info('[AI] Assignment validation passed; ranking all story groups together.');

  const articleById = new Map(articles.map((article) => [article.id, article]));
  const existingById = new Map(existingStories.map((story) => [story.id, story]));
  const rankedGroups = analysis.groups
    .map((group) => ({ group, rankScore: rankScore(group) }))
    .sort((left, right) => right.rankScore - left.rankScore);

  for (const [index, { group, rankScore: score }] of rankedGroups.entries()) {
    console.info(`Global rank ${index + 1}: ${group.headline} (score ${score.toFixed(2)}).`);
    const groupLinks = sourceLinksFor(group.article_ids, articleById);
    const groupFacts = group.verified_facts.map((fact) => ({
      claim: fact.claim,
      source_article_ids: fact.article_ids,
      source_urls: fact.article_ids.map((id) => articleById.get(id)!.url),
    }));
    const existing = group.existing_story_id ? existingById.get(group.existing_story_id) : undefined;
    const links = existing
      ? mergeJsonRecords(existing.source_links, groupLinks, 'article_id')
      : groupLinks as Json;
    const facts = existing
      ? mergeJsonRecords(existing.verified_facts, groupFacts, 'claim')
      : groupFacts as Json;

    const storyPayload = {
      headline: group.headline,
      summary: group.summary,
      detailed_content: detailedContent(group, asObjectArray(facts)),
      importance_score: group.importance_score,
      why_it_matters: group.why_it_matters,
      future_implications: group.future_implications,
      analysis: group.analysis,
      verified_facts: facts,
      source_links: links,
      relevance_score: group.relevance_score,
      impact_score: group.impact_score,
      credibility_score: group.credibility_score,
      rank_score: score,
    };

    let storyId: string;
    try {
      console.info(`[Supabase] Saving ${existing ? 'update' : 'new story'}: ${group.headline}.`);
      if (existing) {
        const { data, error } = await supabaseAdmin
          .from('stories')
          .update(storyPayload)
          .eq('id', existing.id)
          .select('id')
          .single();
        if (error) throw error;
        storyId = data.id;
        result.storiesUpdated += 1;
      } else {
        const { data, error } = await supabaseAdmin
          .from('stories')
          .upsert({ ...storyPayload, story_key: storyKey(group.article_ids) }, { onConflict: 'story_key' })
          .select('id')
          .single();
        if (error) throw error;
        storyId = data.id;
        result.storiesCreated += 1;
      }

      console.info(`[Supabase] Saving ${group.article_ids.length} article relationship(s) for story ${storyId}.`);
      const { error: linkError } = await supabaseAdmin.from('story_articles').upsert(
        group.article_ids.map((article_id) => ({ article_id, story_id: storyId, is_relevant: true, exclusion_reason: null })),
        { onConflict: 'article_id', ignoreDuplicates: true },
      );
      if (linkError) throw linkError;

      const { data: linked, error: verifyError } = await supabaseAdmin
        .from('story_articles')
        .select('article_id,story_id,is_relevant')
        .in('article_id', group.article_ids);
      if (verifyError) throw verifyError;
      const linkedByArticle = new Map((linked ?? []).map((row) => [row.article_id, row]));
      const inconsistent = group.article_ids.filter((id) => {
        const row = linkedByArticle.get(id);
        return !row || row.story_id !== storyId || !row.is_relevant;
      });
      if (inconsistent.length) throw new Error(`Article relationships conflict for ${inconsistent.length} article(s).`);
      result.articlesLinked += group.article_ids.length;
      console.info(`Stored story ${storyId} with ${group.article_ids.length} source article(s).`);
    } catch (error) {
      result.failedStories += 1;
      result.failedDatabaseOperations += 1;
      console.error(`Story storage failed [${group.headline}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (analysis.excluded_articles.length) {
    const { error } = await supabaseAdmin.from('story_articles').upsert(
      analysis.excluded_articles.map(({ article_id, reason }) => ({
        article_id,
        story_id: null,
        is_relevant: false,
        exclusion_reason: reason,
      })),
      { onConflict: 'article_id', ignoreDuplicates: true },
    );
    if (error) {
      result.failedDatabaseOperations += 1;
      console.error(`Could not record excluded article decisions: ${error.message}`);
    } else {
      result.articlesExcluded = analysis.excluded_articles.length;
      for (const excluded of analysis.excluded_articles) console.info(`Excluded article ${excluded.article_id}: ${excluded.reason}`);
    }
  }
  return result;
}

export async function processUnprocessedArticles(): Promise<ProcessingResult> {
  console.info('[AI] Checking Gemini configuration.');
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required. Add it to the private .env file; do not put it in source code or share it in chat.');
  }
  console.info('[AI] Gemini API key is configured; value is not logged.');

  const totals = emptyResult();
  let batchNumber = 0;
  console.info(`[AI] Will process up to ${env.aiMaxArticlesPerRun} article(s), in requests of at most ${env.aiArticlesPerRequest}.`);

  while (totals.articlesFetched < env.aiMaxArticlesPerRun) {
    const batchLimit = Math.min(env.aiArticlesPerRequest, env.aiMaxArticlesPerRun - totals.articlesFetched);
    console.info(`[AI] Starting batch ${batchNumber + 1}; loading up to ${batchLimit} unprocessed article(s).`);
    const articles = await fetchUnprocessedArticles(batchLimit);
    if (!articles.length) {
      if (batchNumber === 0) console.info('No unprocessed articles; Gemini was not called.');
      break;
    }

    console.info(`[AI] Batch ${batchNumber + 1}: loaded ${articles.length} unprocessed article(s).`);
    const batchResult = await processArticleBatch(articles);
    addResult(totals, batchResult);
    batchNumber += 1;
    console.info(`[AI] Batch ${batchNumber} complete: storiesCreated=${batchResult.storiesCreated}, storiesUpdated=${batchResult.storiesUpdated}, linked=${batchResult.articlesLinked}, excluded=${batchResult.articlesExcluded}, failedStories=${batchResult.failedStories}, failedDatabaseOperations=${batchResult.failedDatabaseOperations}.`);

    if (batchResult.failedStories || batchResult.failedDatabaseOperations) {
      console.error('[AI] Stopping after this batch because storage failed; unprocessed articles will remain available for a safe retry.');
      break;
    }
  }

  console.info(`AI processing totals: articles=${totals.articlesFetched}, storiesCreated=${totals.storiesCreated}, storiesUpdated=${totals.storiesUpdated}, articlesLinked=${totals.articlesLinked}, articlesExcluded=${totals.articlesExcluded}, failedStories=${totals.failedStories}, failedDatabaseOperations=${totals.failedDatabaseOperations}.`);
  return totals;
}
