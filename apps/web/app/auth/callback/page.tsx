'use client';

import { useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { claimReport } from '../../../lib/api';
import { identifyUser } from '../../../lib/posthog';

// Client-side PKCE exchange: the code_verifier lives in the browser's
// localStorage, so exchangeCodeForSession must run here — a route handler
// has no access to it.
export default function AuthCallbackPage() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const reportId = url.searchParams.get('report_id');
    const next = url.searchParams.get('next') || '/';

    (async () => {
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session) {
          identifyUser(data.session.user.id);
          if (reportId) {
            try {
              await claimReport(reportId, data.session.access_token);
            } catch (err) {
              console.warn('Failed to claim report during auth callback:', err);
            }
          }
        }
      }
      window.location.replace(next);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center t-body muted">
      Signing you in&hellip;
    </div>
  );
}
