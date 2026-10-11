'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Gremlin } from '../../components/Gremlin';
import { supabase } from '../../lib/supabase';
import { safeNextPath, useSession } from '../../lib/use-session';
import './login.css';

export default function LoginPage() {
  const router = useRouter();
  const { session, ready } = useSession();
  const emailRef = useRef<HTMLInputElement>(null);
  const googleRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
    router.replace(next === '/' ? '/account' : next);
  }, [session, router]);

  function nextPath() {
    return safeNextPath(new URLSearchParams(window.location.search).get('next'));
  }

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('email');
    setError('');
    const next = nextPath();
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (authError) throw authError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oops, we couldn’t send that link. Try again?');
      emailRef.current?.focus();
    } finally { setBusy(null); }
  }

  async function signInWithGoogle() {
    if (busy) return;
    setBusy('google');
    setError('');
    const next = nextPath();
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oops, Google didn’t open. Try again?');
      setBusy(null);
      googleRef.current?.focus();
    }
  }

  return (
    <div className="page login">
      <div className="panel login-panel bg-concept" data-concept="hanging_piece">
        {!ready ? (
          <p role="status">Chessplain is checking your sign-in…</p>
        ) : session ? (
          <p role="status">You’re in. Taking you to your account…</p>
        ) : sent ? (
          <div className="login-copy" role="status">
            <h1 className="h1">Check your inbox!</h1>
            <p className="lede">We sent a sign-in link to <strong translate="no">{email}</strong>. Open it in this browser.</p>
            <button type="button" className="btn btn--quiet" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <div className="login-copy">
            <h1 className="h1 login-title">Want the gremlin to stay?</h1>
            <p className="lede">Use Google, or get an email link. No password. New here? Either one creates your account.</p>
            <button ref={googleRef} type="button" className="btn btn--key" onClick={signInWithGoogle} disabled={!!busy}>
              Continue with Google
            </button>
            {busy === 'google' && <p className="field-note" role="status">Opening Google…</p>}
            <div className="login-or" aria-hidden="true">or email</div>
            <form onSubmit={sendLink} className="login-form">
              <label htmlFor="login-email">Email</label>
              <input
                ref={emailRef}
                id="login-email"
                className="input"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                spellCheck={false}
                required
                disabled={!!busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
              <button className="btn" disabled={!!busy} aria-busy={busy === 'email'}>
                Email me a sign-in link <span className="arrow" aria-hidden="true">→</span>
              </button>
              {busy === 'email' && <p className="field-note" role="status">Sending your link…</p>}
              {error && <p id="login-error" className="field-note" data-tone="error" role="alert">{error}</p>}
            </form>
            <ul className="login-points small muted">
              <li>Two scans and two reviews every 7 days stay on your account, not your network.</li>
              <li>A subscription follows this email.</li>
            </ul>
          </div>
        )}
        <Gremlin className="login-gremlin" concept="hanging_piece" size={220} priority />
      </div>
    </div>
  );
}
