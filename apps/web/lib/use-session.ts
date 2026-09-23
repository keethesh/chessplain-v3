'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Current Supabase session; `ready` is false until the first check finishes. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (active) setSession(data.session); })
      .finally(() => { if (active) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { if (active) { setSession(next); setReady(true); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return { session, ready };
}

/** Only same-origin paths, so a crafted `next` cannot redirect off-site. */
export function safeNextPath(value: string | null | undefined): string {
  return value && /^\/(?!\/)/.test(value) && !value.includes('\\') ? value : '/';
}
