import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import type { Database } from '../types/database.js';
import { createFreeTierGuardedFetch, requireFreeTierConfirmation } from '../services/free-tier-guard.js';

export function createSupabaseAdminClient() {
  requireFreeTierConfirmation(env.freeTierConfirmed, 'Supabase');
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side collection writes. Keep it private; never use it in frontend code.');
  }

  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: createFreeTierGuardedFetch() },
  });
}
