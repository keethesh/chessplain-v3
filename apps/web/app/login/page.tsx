'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { safeNextPath, useSession } from '../../lib/use-session';

export default function LoginPage() {
  const { session, ready } = useSession();
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

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  }

  return (
    <div className="page-width login-page">
      {!ready ? (
        <p role="status" className="text-sm text-[var(--w-ink2)]">Checking your account…</p>
      ) : session ? (
        <>
          <h1 className="t-heading">You’re signed in.</h1>
          <p className="login-lede">Signed in as <strong>{session.user.email}</strong>. Your free reviews are counted on this account, not your network.</p>
          <div className="login-actions">
            <Link href="/#analyze" className="primary-button">Review a game <ArrowRight size={16} /></Link>
            <Link href="/pricing" className="secondary-button">Plan and billing</Link>
          </div>
          <button className="text-link mt-6" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </>
      ) : sent ? (
        <div role="status">
          <h1 className="t-heading">Check your inbox.</h1>
          <p className="login-lede">We sent a sign-in link to <strong>{email}</strong>. Open it in this browser to finish.</p>
          <button className="text-link mt-4" onClick={() => setSent(false)}>Use a different email</button>
        </div>
      ) : (
        <>
          <h1 className="t-heading">Sign in or create an account.</h1>
          <p className="login-lede">Enter your email and we’ll send you a link. No password. If you’re new, the same link creates your account.</p>
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
