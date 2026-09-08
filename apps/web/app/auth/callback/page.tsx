'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { claimReport } from '../../../lib/api';
import { identifyUser } from '../../../lib/posthog';

export default function AuthCallbackPage() {
  const started = useRef(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState('/');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const reportId = url.searchParams.get('report_id');
    const requested = url.searchParams.get('next');
    const next = reportId ? '/report/' + encodeURIComponent(reportId) : requested === '/pricing' ? '/pricing' : '/';
    setDestination(next);
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
  return <div className="page-width py-20 max-w-xl"><h1 className="t-heading mb-5">{error ? 'Let’s try that link again.' : 'Signing you in…'}</h1><p className="t-body text-[var(--w-ink2)]" role="status">{error || 'We’ll bring you back to where you left off.'}</p>{error && <Link href={destination} className="primary-button mt-7">Go back and request a new link</Link>}</div>;
}
