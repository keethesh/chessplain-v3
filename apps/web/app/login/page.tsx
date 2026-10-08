'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { safeNextPath, useSession } from '../../lib/use-session';

export default function LoginPage() {
  const router = useRouter();
  const { session, ready } = useSession();
  // Already signed in: carry on to where they were headed, else to their account.
  useEffect(() => {
    if (!session) return;
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
    router.replace(next === '/' ? '/account' : next);
  }, [session, router]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t send your sign-in link. Please try again.');
    } finally { setBusy(false); }
  }

  async function signInWithGoogle() {
    if (busy) return;
    setBusy(true); setError('');
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t start Google sign-in. Please try again.');
      setBusy(false);
    }
  }


  return (
    <div className="page-width login-page">
      {!ready ? (
        <p role="status" className="text-sm text-[var(--w-ink2)]">Checking your account…</p>
      ) : session ? (
        <p role="status" className="text-sm text-[var(--w-ink2)]">Taking you to your account…</p>
      ) : sent ? (
        <div role="status">
          <h1 className="t-heading">Check your inbox.</h1>
          <p className="login-lede">We sent a sign-in link to <strong>{email}</strong>. Open it in this browser to finish.</p>
          <button className="text-link mt-4" onClick={() => setSent(false)}>Use a different email</button>
        </div>
      ) : (
        <>
          <h1 className="t-heading">Sign in or create an account.</h1>
          <p className="login-lede">Use Google, or enter your email and we’ll send you a link. No password. If you’re new, either option creates your account.</p>
          <button type="button" className="secondary-button w-full justify-center" onClick={signInWithGoogle} disabled={busy}>
            {busy ? <><LoaderCircle size={16} className="spin" />Opening Google…</> : <>Continue with Google <ArrowRight size={16} /></>}
          </button>
          <div className="login-divider" aria-hidden="true"><span>or use email</span></div>
          <form onSubmit={sendLink} className="login-form">
            <label htmlFor="login-email" className="block text-sm font-semibold">Email</label>
            <input id="login-email" className="email-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required disabled={busy} autoFocus />
            <button className="primary-button" disabled={busy}>
              {busy ? <><LoaderCircle size={16} className="spin" />Sending link…</> : <>Email me a sign-in link <ArrowRight size={16} /></>}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>
          <ul className="login-perks">
            <li><Check size={16} aria-hidden="true" />Two free reviews every week on your own account, not shared with your network.</li>
            <li><Check size={16} aria-hidden="true" />Your subscription, if you choose one, follows your email.</li>
          </ul>
        </>
      )}
    </div>
  );
}
