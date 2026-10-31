import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import type { Database } from '../types/database.js';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
