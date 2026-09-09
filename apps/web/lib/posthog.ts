import posthog from 'posthog-js';

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

let isInitialized = false;

export function initPostHog(): void {
  if (typeof window === 'undefined' || isInitialized) return;

  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
  if (!POSTHOG_KEY) return;
  try { posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: true, // SPA auto-capture; init is eager via PostHogProvider
  });

  isInitialized = true;
  } catch { /* Analytics is optional; never block the product. */ }
}

export function captureEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  initPostHog();
  if (isInitialized) { try { posthog.capture(eventName, properties); } catch { /* Non-critical telemetry. */ } }
}

export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  initPostHog();
  if (isInitialized) { try { posthog.identify(userId, properties); } catch { /* Non-critical telemetry. */ } }
}

export function getDistinctId(): string {
  if (typeof window === 'undefined') return 'anon-visitor';
  initPostHog();
  return posthog.get_distinct_id() || 'anon-visitor';
}
