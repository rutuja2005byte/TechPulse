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

function scoreThresholdEnv(name: string, fallback: number): number {
  const value = positiveIntegerEnv(name, fallback);
  if (value > 100) throw new Error(`${name} must be between 1 and 100.`);
  return value;
}

function freeGeminiModel(): string {
  const freeModel = 'gemini-2.5-flash';
  const configured = process.env.GEMINI_MODEL;
  if (configured && configured !== freeModel) {
    throw new Error(`[TECHPULSE_FREE_TIER_STOP] GEMINI_MODEL must be ${freeModel}; paid or unverified model overrides are blocked.`);
  }
  return freeModel;
}

export const env = {
  supabaseUrl: requiredEnv('SUPABASE_URL'),
  supabaseAnonKey: requiredEnv('SUPABASE_ANON_KEY'),
  // Server-only. Never pass this key to frontend or client-side code.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  freeTierConfirmed: process.env.TECHPULSE_FREE_TIER_CONFIRMED === 'true',
  rssFeedUrls: (process.env.RSS_FEED_URLS ?? '').split(',').map((url) => url.trim()).filter(Boolean),
  articleMaxAgeDays: positiveIntegerEnv('ARTICLE_MAX_AGE_DAYS', 7),
  feedTimeoutMs: positiveIntegerEnv('RSS_FEED_TIMEOUT_MS', 15_000),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: freeGeminiModel(),
  geminiTimeoutMs: positiveIntegerEnv('GEMINI_TIMEOUT_MS', 180_000),
  aiMaxArticlesPerRun: positiveIntegerEnv('AI_MAX_ARTICLES_PER_RUN', 100),
  aiArticlesPerRequest: positiveIntegerEnv('AI_ARTICLES_PER_REQUEST', 10),
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
  newsletterRecipients: (process.env.NEWSLETTER_RECIPIENTS ?? '').split(',').map((email) => email.trim()).filter(Boolean),
  newsletterMinImportanceScore: scoreThresholdEnv('NEWSLETTER_MIN_IMPORTANCE_SCORE', 70),
};
