'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Gremlin } from '../components/Gremlin';
import { captureEvent } from '../lib/posthog';
import './status.css';

// Last line of defence. Without this, an unhandled render error shows Next's
// own error screen: no branding, no way back, and nothing recorded. In-app
// browsers on iOS and Android are where unexpected client failures actually
// happen, and that is most of the traffic.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      captureEvent('client_error', { message: error.message?.slice(0, 200), digest: error.digest });
    } catch {
      // Analytics must never itself break the error screen.
    }
    console.error('[Chessplain] Unhandled client error:', error);
  }, [error]);

  return (
    <div className="page status-page">
      <div className="panel status-panel bg-concept" data-concept="missed_mate_threat">
        <Gremlin className="status-gremlin" concept="missed_mate_threat" size={200} priority />
        <div className="status-copy">
          <h1 className="h1">Oops!</h1>
          <p className="lede">The Mate Misser looked everywhere. This page failed before it could finish. Try again, or go back and scan a username.</p>
          <div className="status-actions">
            <button type="button" className="btn" onClick={reset}>Try again</button>
            <Link className="btn btn--key" href="/">Back home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
