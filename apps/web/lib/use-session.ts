'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getMe, type Me } from './api';

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
  if (!value || typeof window === 'undefined' || /[\u0000-\u001f\u007f]/.test(value)) return '/';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/') ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

// Nav, page and pricing all ask for the account on one page load; share one request.
let cached: { token: string; at: number; promise: Promise<Me> } | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** Call after anything that changes the account (a new review, a plan change); mounted `useMe` hooks refetch. */
export function invalidateMe() {
  cached = null;
  version++;
  listeners.forEach(notify => notify());
}

/** Account data (plan, allowance, reviews) for the signed-in user; `me` is null while loading, signed out or on error. */
export function useMe() {
  const { session, ready } = useSession();
  const token = session?.access_token ?? null;
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [seen, setSeen] = useState(version);
  useEffect(() => {
    const notify = () => setSeen(version);
    listeners.add(notify);
    return () => { listeners.delete(notify); };
  }, []);
  // A different user (or none) must not see the previous account while loading.
  const userId = session?.user.id ?? null;
  useEffect(() => { setMe(null); setFailed(false); }, [userId]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    if (!cached || cached.token !== token || Date.now() - cached.at > 10_000) {
      cached = { token, at: Date.now(), promise: getMe(token) };
    }
    const current = cached.promise;
    current.then(data => { if (active) { setMe(data); setFailed(false); } }).catch(() => { if (cached?.promise === current) cached = null; if (active) setFailed(true); });
    return () => { active = false; };
  }, [token, seen]);
  return { session, ready, me, failed, signedIn: Boolean(session), retry: invalidateMe };
}
