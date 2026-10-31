import 'dotenv/config';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export const env = {
  supabaseUrl: requiredEnv('SUPABASE_URL'),
  supabaseAnonKey: requiredEnv('SUPABASE_ANON_KEY'),
  // Server-only. Never pass this key to frontend or client-side code.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  rssFeedUrls: (process.env.RSS_FEED_URLS ?? '').split(',').map((url) => url.trim()).filter(Boolean),
  articleMaxAgeDays: positiveIntegerEnv('ARTICLE_MAX_AGE_DAYS', 7),
  feedTimeoutMs: positiveIntegerEnv('RSS_FEED_TIMEOUT_MS', 15_000),
};
