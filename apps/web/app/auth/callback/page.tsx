'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { claimReport } from '../../../lib/api';
import { identifyUser } from '../../../lib/posthog';
import { safeNextPath } from '../../../lib/use-session';
import './callback.css';

export default function AuthCallbackPage() {
  const started = useRef(false);
  const [error, setError] = useState('');
  const [loginHref, setLoginHref] = useState('/login');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const reportId = url.searchParams.get('report_id');
    const requested = url.searchParams.get('next');
    const next = reportId ? '/report/' + encodeURIComponent(reportId) : safeNextPath(requested);
    setLoginHref(next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
    // Supabase reports provider cancellations and expired email links the same
    // way (error=access_denied); error_code tells them apart. The description
    // is not echoed: it arrives in a URL anyone can craft.
    const authError = url.searchParams.get('error');
    if (authError) {
      setError(url.searchParams.get('error_code') === 'otp_expired'
        ? 'Oops, that link expired or was already used. Request a new one?'
        : authError === 'access_denied'
          ? 'Sign-in was cancelled. Try Google or email again?'
          : 'Oops, that didn\u2019t work. Try Google or email again?');
      return;
    }
    void (async () => {
      try {
        if (!code) throw new Error('Oops, that link is incomplete. Request a new one in this browser?');
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.session) throw new Error('This link couldn\u2019t sign you in. Open it where you requested it, or ask for a new one.');
        identifyUser(data.session.user.id);
        if (reportId && reportId !== 'demo') {
          try { await claimReport(reportId, data.session.access_token); }
          catch { /* Claiming is optional; the signed-in user can still read the report link. */ }
        }
        window.location.replace(next);
      } catch (error) { setError(error instanceof Error ? error.message : 'Oops, we couldn\u2019t sign you in. Request a new link?'); }
    })();
  }, []);
  return (
    <div className="page auth-page">
      <h1 className="h1">{error ? 'Can\u2019t get in?' : 'Signing you in…'}</h1>
      <p className="lede" role="status">{error || 'Chessplain is bringing you back to where you left off.'}</p>
      {error && <Link href={loginHref} className="btn">Back to sign in <span className="arrow" aria-hidden="true">→</span></Link>}
    </div>
  );
}
