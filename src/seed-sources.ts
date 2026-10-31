import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import type { Database } from './types/database.js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Source seeding requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private .env file.');
}

// This privileged client exists only in this one-off server-side seed command.
// The regular collector continues using the anon key and RLS policies.
const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sources = [
  { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', source_type: 'rss', is_active: true },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', source_type: 'rss', is_active: true },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', source_type: 'rss', is_active: true },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', source_type: 'rss', is_active: true },
  { name: 'arXiv CS', url: 'https://rss.arxiv.org/rss/cs', source_type: 'rss', is_active: true },
];
const retiredFeedUrls = [
  'https://hnrss.org/frontpage',
  'https://blog.research.google/feeds/posts/default',
  'https://openai.com/news/rss.xml',
];

async function seedSources(): Promise<void> {
  const { error } = await admin.from('sources').upsert(sources, { onConflict: 'url' });
  if (error) throw new Error(`Could not seed sources: ${error.message}`);

  // Retire the three feeds from the previous seed set that this setup replaces.
  const { error: retireError } = await admin
    .from('sources')
    .update({ is_active: false })
    .in('url', retiredFeedUrls);
  if (retireError) throw new Error(`Could not deactivate replaced seed feeds: ${retireError.message}`);

  const expectedUrls = sources.map(({ url }) => url);
  const { data, error: verifyError } = await admin
    .from('sources')
    .select('name,url,is_active')
    .in('url', expectedUrls);
  if (verifyError) throw new Error(`Could not verify seeded sources: ${verifyError.message}`);

  const verified = data ?? [];
  console.info(`Verified ${verified.filter((source) => source.is_active).length}/${sources.length} seeded sources as active.`);
  for (const source of verified) console.info(`${source.is_active ? 'active' : 'inactive'}: ${source.name} — ${source.url}`);

  if (verified.length !== sources.length || verified.some((source) => !source.is_active)) {
    throw new Error('Source seed verification did not find all five sources active.');
  }
}

seedSources().catch((error: unknown) => {
  console.error('Source seeding failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
