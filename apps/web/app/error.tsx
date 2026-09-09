'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { captureEvent } from '../lib/posthog';

// Last line of defence. Without this, an unhandled render error shows Next's
// own error screen — no branding, no way back, and nothing recorded. In-app
// browsers on iOS and Android are where unexpected client failures actually
// happen, and that is most of the traffic.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Analytics must never itself break the error screen.
    try {
      captureEvent('client_error', { message: error.message?.slice(0, 200), digest: error.digest });
    } catch {
      // Ignored on purpose.
    }
    console.error('[Chessplain] Unhandled client error:', error);
  }, [error]);

  return (
    <div className="page-width py-16 max-w-2xl">
      <h1 className="t-display mb-5">Something went wrong on this page.</h1>
      <p className="t-body text-[var(--w-ink2)] mb-7">
        This is on us, not on your game. Trying again usually works — nothing you submitted has been lost, and a
        review that was already running will still be at its own link.
      </p>
      <div className="flex flex-wrap gap-3">
        <button className="primary-button" onClick={reset}>
          <RotateCcw size={16} /> Try again
        </button>
        <Link className="secondary-button" href="/">
          Back to the start
        </Link>
      </div>
    </div>
  );
}
