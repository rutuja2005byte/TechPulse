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
};
