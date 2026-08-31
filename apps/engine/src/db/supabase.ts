import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Fail fast rather than silently degrading to the anon key (RLS would block
// analysis_cache reads/writes and game_analyses updates without surfacing why)
if (config.nodeEnv === 'production' && !config.supabaseServiceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when NODE_ENV=production');
}
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey || config.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
