'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { createBillingPortal } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { invalidateMe, useMe } from '../../lib/use-session';
import { ReviewsPanel } from '../../components/ReviewsPanel';

export default function AccountPage() {
  const router = useRouter();
  const { signedIn, ready, me, failed, session, retry } = useMe();
  const [busy, setBusy] = useState<'portal' | 'signout' | null>(null);
  const [error, setError] = useState('');

  // Not while signing out: that also flips `signedIn`, and the user should land on the home page, not on sign-in.
  useEffect(() => { if (ready && !signedIn && busy !== 'signout') router.replace('/login?next=%2Faccount'); }, [ready, signedIn, busy, router]);

  async function openPortal() {
    if (busy || !session) return;
    setBusy('portal'); setError('');
    try {
      const url = new URL((await createBillingPortal(session.access_token)).url);
      if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') throw new Error('We couldn’t open the billing portal. Please try again.');
      window.location.assign(url.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t open billing. Please try again.');
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('signout');
    await supabase.auth.signOut();
    invalidateMe();
    router.replace('/');
  }

  if (!ready || !signedIn) return <div className="page-width account-page"><p role="status" className="text-sm text-[var(--w-ink2)]">Checking your account…</p></div>;

  const premium = me?.tier === 'premium';
  const left = me?.allowance ? Math.max(0, me.allowance.limit - me.allowance.used) : null;

  return (
    <div className="page-width account-page">
      <header className="account-head">
        <p className="hero-kicker">Your account</p>
        <h1>{session?.user.email}</h1>
      </header>

      <div className="account-grid">
        <ReviewsPanel me={me} failed={failed} onRetry={retry} full />

        <div className="account-side">
          <section className="account-card">
            <h2>Plan</h2>
            {!me ? (failed ? <button className="text-link" onClick={openPortal} disabled={!!busy}>Manage subscription</button> : <div className="skeleton h-16" aria-hidden="true" />) : premium ? (
              <>
                <p className="account-plan">Premium</p>
                <p className="account-note">No weekly limit on reviews.</p>
                <button className="secondary-button" onClick={openPortal} disabled={!!busy}>
                  {busy === 'portal' ? <><LoaderCircle size={16} className="spin" />Opening billing…</> : 'Manage subscription'}
                </button>
              </>
            ) : (
              <>
                <p className="account-plan">Free</p>
                <p className="account-note">
                  {left} of {me.allowance?.limit} reviews left this week.
                  {left === 0 && me.allowance?.next_slot_at ? ` Your next one opens ${new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(me.allowance.next_slot_at))}.` : ''}
                </p>
                <Link href="/pricing" className="secondary-button">See Premium <ArrowRight size={16} /></Link>
                <button className="text-link" onClick={openPortal} disabled={!!busy}>{busy === 'portal' ? 'Opening billing…' : 'Already subscribed? Manage subscription'}</button>
              </>
            )}
            {failed && <p className="form-error" role="alert">We couldn’t load your plan. <button className="underline" onClick={retry}>Try again</button></p>}
            {error && <p className="form-error" role="alert">{error}</p>}
          </section>

          <section className="account-card">
            <h2>Next game</h2>
            <p className="account-note">{me?.chesscom_username ? <>Reviewing games from <strong>{me.chesscom_username}</strong> on Chess.com.</> : 'Pick a game from Chess.com, or paste a PGN.'}</p>
            <Link href="/#analyze" className="primary-button">Review a game <ArrowRight size={16} /></Link>
          </section>

          <button className="text-link account-signout" onClick={signOut} disabled={!!busy}>{busy === 'signout' ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </div>
    </div>
  );
}
