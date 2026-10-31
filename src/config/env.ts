import 'dotenv/config';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: requiredEnv('SUPABASE_URL'),
  supabaseAnonKey: requiredEnv('SUPABASE_ANON_KEY'),
  rssFeedUrls: (process.env.RSS_FEED_URLS ?? '').split(',').map((url) => url.trim()).filter(Boolean),
  articleMaxAgeDays: Number.parseInt(process.env.ARTICLE_MAX_AGE_DAYS ?? '7', 10),
};
