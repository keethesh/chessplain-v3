'use client';

import { useEffect, useState } from 'react';
import { analyticsOptedOut, setAnalyticsOptOut } from '../lib/posthog';

export function AnalyticsOptOut() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  useEffect(() => setOptedOut(analyticsOptedOut()), []);
  if (optedOut === null) return null;

  return (
    <p className="text-sm text-[var(--w-ink2)] mt-3">
      Analytics is <strong>{optedOut ? 'off' : 'on'}</strong> in this browser.{' '}
      <button
        type="button"
        className="underline text-[var(--w-accent)] min-h-11"
        onClick={() => { setAnalyticsOptOut(!optedOut); setOptedOut(analyticsOptedOut()); }}
      >
        {optedOut ? 'Turn analytics back on' : 'Turn analytics off'}
      </button>
    </p>
  );
}
