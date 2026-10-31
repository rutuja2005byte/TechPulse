import { supabase } from '../config/supabase.js';

export async function checkDatabaseConnection(): Promise<boolean> {
  const { error } = await supabase.from('sources').select('id').limit(1);
  return !error;
}
