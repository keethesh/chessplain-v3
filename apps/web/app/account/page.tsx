'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, CHESSCOM_USERNAME_RE, createBillingPortal, type Allowance } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { invalidateMe, saveChesscomUsername, useMe } from '../../lib/use-session';
import './account.css';

function formatWeekday(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function allowanceCopy(kind: string, allowance: Allowance | null, premium: boolean): string {
  if (premium) return `No weekly limit on ${kind}.`;
  if (!allowance) return `Oops, we couldn’t read how many ${kind} you have left.`;
  const left = Math.max(0, allowance.limit - allowance.used);
  const when = left === 0 && allowance.next_slot_at ? formatWeekday(allowance.next_slot_at) : '';
  return when
    ? `${left} of ${allowance.limit} ${kind} left this week. Next one opens ${when}.`
    : `${left} of ${allowance.limit} ${kind} left this week.`;
}

function UsernameField({ initial, token }: { initial: string; token: string }) {
  const [name, setName] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => { if (!dirty) setName(initial); }, [initial, dirty]);
  useEffect(() => {
    if (window.location.hash === '#chesscom') document.getElementById('chesscom')?.focus();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const username = name.trim();
    if (!CHESSCOM_USERNAME_RE.test(username)) {
      setError('Enter a valid Chess.com username.');
      setSaved('');
      return;
    }
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const res = await saveChesscomUsername(token, username);
      setSaved(`Saved ${res.chesscom_username}.`);
      setName(res.chesscom_username);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t save that username. Try again?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="acct-user" onSubmit={onSubmit}>
      <label className="label" htmlFor="chesscom">Username</label>
      <div className="acct-user-row">
        <input
          id="chesscom"
          className="input"
          name="username"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={name}
          aria-invalid={error ? true : undefined}
          aria-describedby="chesscom-note"
          onChange={(event) => { setDirty(true); setName(event.target.value); if (error) setError(''); }}
        />
        <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Checking…' : 'Save'}
        </button>
      </div>
      <p id="chesscom-note" className="field-note" data-tone={error ? 'error' : undefined} role={error ? 'alert' : saved ? 'status' : undefined}>
        {error || saved || 'Used when you scan. You won’t type it on the home page.'}
      </p>
    </form>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { signedIn, ready, me, failed, session, retry } = useMe();
  const [busy, setBusy] = useState<'portal' | 'signout' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && !signedIn && busy !== 'signout') router.replace('/login?next=%2Faccount');
  }, [ready, signedIn, busy, router]);

  async function openPortal() {
    if (busy || !session) return;
    setBusy('portal');
    setError('');
    try {
      const url = new URL((await createBillingPortal(session.access_token)).url);
      if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') throw new Error('Oops, we couldn’t open billing. Try again?');
      window.location.assign(url.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oops, we couldn’t open billing. Try again?');
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('signout');
    await supabase.auth.signOut();
    invalidateMe();
    router.replace('/');
  }

  if (!ready || !signedIn) {
    return <div className="page acct"><p role="status">Chessplain is checking your sign-in…</p></div>;
  }

  const premium = me?.tier === 'premium';
  const email = me?.email || session?.user.email;

  return (
    <div className="page acct">
      <header className="acct-mast">
        <p className="label">Account</p>
        <h1 className="acct-title">Settings</h1>
      </header>

      {!me && !failed ? (
        <div>
          <p className="sr-only" role="status">Chessplain is opening your account…</p>
          <div className="acct-skel" aria-hidden="true">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        </div>
      ) : failed && !me ? (
        <p role="alert">Oops, we couldn’t load your account. <button type="button" className="btn btn--quiet" onClick={retry}>Try again</button></p>
      ) : me && session && (
        <>
          <section className="surface acct-block" aria-labelledby="acct-plan">
            <h2 id="acct-plan" className="h3">{premium ? 'Premium' : 'Free'}</h2>
            {email ? <p className="small">Signed in as <span translate="no">{email}</span></p> : null}
            <p>{allowanceCopy('reviews', me.allowance, premium)}</p>
            <p>{allowanceCopy('scans', me.scan_allowance, premium)}</p>
            <div className="acct-actions">
              {premium ? (
                <button type="button" className="btn" onClick={openPortal} disabled={!!busy}>
                  {busy === 'portal' ? 'Opening billing…' : 'Manage subscription'}
                </button>
              ) : (
                <>
                  <Link className="btn" href="/pricing">See Premium <span className="arrow" aria-hidden="true">→</span></Link>
                  <button type="button" className="btn btn--quiet" onClick={openPortal} disabled={!!busy}>
                    {busy === 'portal' ? 'Opening billing…' : 'Already subscribed? Manage'}
                  </button>
                </>
              )}
            </div>
            {error && <p className="field-note" data-tone="error" role="alert">{error}</p>}
          </section>

          <section className="surface acct-block" aria-labelledby="acct-chess">
            <h2 id="acct-chess" className="h3">Chess.com</h2>
            <UsernameField initial={me.chesscom_username ?? ''} token={session.access_token} />
          </section>

          <button type="button" className="btn btn--quiet acct-signout" onClick={signOut} disabled={!!busy}>
            {busy === 'signout' ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}
    </div>
  );
}
