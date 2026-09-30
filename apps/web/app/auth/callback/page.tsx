'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { claimReport } from '../../../lib/api';
import { identifyUser } from '../../../lib/posthog';
import { safeNextPath } from '../../../lib/use-session';

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
        ? 'This sign-in link has expired or was already used. Request a new one.'
        : authError === 'access_denied'
          ? 'Sign-in was cancelled. You can try again with Google or email.'
          : 'We couldn’t sign you in. Try again with Google or email.');
      return;
    }
    void (async () => {
      try {
        if (!code) throw new Error('This sign-in link is incomplete or expired. Request a new link in the same browser.');
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.session) throw new Error('This link could not sign you in. Open it in the browser where you requested it, or request a new one.');
        identifyUser(data.session.user.id);
        if (reportId && reportId !== 'demo') {
          try { await claimReport(reportId, data.session.access_token); }
          catch { /* Claiming is optional; the signed-in user can still read the report link. */ }
        }
        window.location.replace(next);
      } catch (error) { setError(error instanceof Error ? error.message : 'We couldn’t sign you in. Please request a new link.'); }
    })();
  }, []);
  return <div className="page-width py-20 max-w-xl"><h1 className="t-heading mb-5">{error ? 'Let’s try that link again.' : 'Signing you in…'}</h1><p className="t-body text-[var(--w-ink2)]" role="status">{error || 'We’ll bring you back to where you left off.'}</p>{error && <Link href={loginHref} className="primary-button mt-7">Back to sign in</Link>}</div>;
}
