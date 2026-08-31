'use client';

import { useEffect } from 'react';
import { captureEvent } from '../lib/posthog';

export function ShareViewTracker({ shareId }: { shareId: string }) {
  useEffect(() => {
    captureEvent('report_viewed', { report_id: shareId, is_shared: true });
  }, [shareId]);
  return null;
}
