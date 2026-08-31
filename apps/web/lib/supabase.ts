import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jgtxprfulkbtzkcvinph.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndHhwcmZ1bGtidHprY3ZpbnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyODk0ODIsImV4cCI6MjA3Njg2NTQ4Mn0.E8eXXrpiAiA_T0wz5yh_u6m2USL7QMs7IfSDc80bIKI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' }, // /auth/callback exchanges ?code= — requires PKCE, not the implicit default
});
