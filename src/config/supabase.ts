import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import type { Database } from '../types/database.js';
import { requireFreeTierConfirmation } from '../services/free-tier-guard.js';

requireFreeTierConfirmation(env.freeTierConfirmed, 'Supabase');

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
