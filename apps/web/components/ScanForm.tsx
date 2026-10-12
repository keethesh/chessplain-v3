'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, startScan } from '../lib/api';
import { captureEvent } from '../lib/posthog';
import { supabase } from '../lib/supabase';
import { invalidateMe } from '../lib/use-session';
import './ScanForm.css';

export interface ScanProblem {
  text: string;
  href?: string;
  hrefLabel?: string;
}

/** Map a startScan failure to the sentence and the one next step. */
export function explainScanError(err: unknown, signedIn: boolean, nextSlot: string | null): ScanProblem {
  if (!(err instanceof ApiError) || err.status === 0) {
    return { text: 'Oops, that didn’t go through. Check your connection and try again?' };
  }
  const code = err.message;
  if (err.status === 402 || code === 'quota_exceeded') {
    if (!signedIn) {
      return { text: 'You’ve used the free scans from this network.', href: '/login?next=/', hrefLabel: 'Sign in' };
    }
    const slot = nextSlot ? Date.parse(nextSlot) : Number.NaN;
    const when = Number.isNaN(slot) ? '' : ` The next one frees up ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(slot)}.`;
    return { text: `You’ve used your free scans for this week.${when}`, href: '/pricing', hrefLabel: 'See Premium' };
  }
  if (code === 'no_games' || /bullet/i.test(code)) {
    return { text: 'No rapid, blitz or daily games yet. Bullet games are too fast to learn from.' };
  }
  if (code === 'invalid_username' || code === 'unknown_username' || (err.status === 400 && !code.includes(' '))) {
    return { text: 'We couldn’t find that Chess.com username.' };
  }
  if (code.includes(' ')) return { text: code };
  return { text: 'Something went wrong. Please try again.' };
}

export function ScanForm({ id, initial = '', submitLabel = 'Find my gremlin', note = 'Free. No signup. No Chess.com password.', nextSlot = null }: {
  id: string;
  initial?: string;
  submitLabel?: string;
  note?: string;
  nextSlot?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const dirty = useRef(false);
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<ScanProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const noteId = `${id}-note`;

  useEffect(() => {
    if (!dirty.current && initial) setName(initial);
  }, [initial]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const username = name.trim();
    if (!username) {
      setProblem({ text: 'Type your Chess.com username.' });
      inputRef.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setProblem(null);
    let signedInNow = false;
    try {
      const { data } = await supabase.auth.getSession();
      signedInNow = Boolean(data.session);
      const res = await startScan(username, data.session?.access_token);
      captureEvent('scan_started', { username_length: username.length, signed_in: signedInNow });
      invalidateMe();
      router.push('/scan/' + res.id, { transitionTypes: ['nav-forward'] });
    } catch (err) {
      setProblem(explainScanError(err, signedInNow, nextSlot));
      lock.current = false;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form id={id} className="home-form" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={`${id}-user`}>Chess.com username</label>
      <input
        ref={inputRef}
        id={`${id}-user`}
        className="input"
        name="username"
        placeholder="Your Chess.com username"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={name}
        aria-invalid={problem ? true : undefined}
        aria-describedby={noteId}
        onChange={(event) => { dirty.current = true; setName(event.target.value); if (problem) setProblem(null); }}
      />
      <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
        {submitLabel} <span className="arrow" aria-hidden="true">→</span>
      </button>
      <p id={noteId} className="field-note" data-tone={problem ? 'error' : undefined} role={problem ? 'alert' : undefined}>
        {problem ? problem.text : note}
        {problem?.href && <> <Link href={problem.href}>{problem.hrefLabel}</Link></>}
      </p>
    </form>
  );
}
