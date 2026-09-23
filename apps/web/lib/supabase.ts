import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. Set them in .env.local (see .env.example): there is no default, on purpose.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce', // /auth/callback exchanges ?code=: requires PKCE, not the implicit default
    // /auth/callback owns the exchange. Left on, the client exchanges ?code= itself on
    // load, so the callback's second exchange fails and shows an error to a signed-in user.
    detectSessionInUrl: false,
  },
});
