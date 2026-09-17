// Dynamic import is intentional: config.ts reads process.env at module load,
// so each test must re-import it with a reset module registry (a static import
// would bind one env snapshot for the whole file).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// config.ts calls dotenv.config() at module load. A developer's local
// apps/engine/.env would repopulate the very variables these tests delete,
// making them pass vacuously. Stub dotenv so "missing" really means missing,
// on every machine and in CI alike.
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }));

const REQUIRED = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };

describe('config', () => {
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => { saved = { ...process.env }; vi.resetModules(); });
  afterEach(() => { process.env = saved; });

  it('throws when SUPABASE_URL is missing instead of defaulting to production', async () => {
    process.env = { ...saved, ...REQUIRED };
    delete process.env.SUPABASE_URL;
    await expect(import('../src/config.js')).rejects.toThrow(/SUPABASE_URL is required/);
  });

  it('throws when SUPABASE_ANON_KEY is missing', async () => {
    process.env = { ...saved, ...REQUIRED };
    delete process.env.SUPABASE_ANON_KEY;
    await expect(import('../src/config.js')).rejects.toThrow(/SUPABASE_ANON_KEY is required/);
  });

  it('does not embed a project-identifying default for optional analytics or billing', async () => {
    process.env = { ...saved, ...REQUIRED };
    delete process.env.POSTHOG_KEY;
    delete process.env.STRIPE_PRICE_MONTHLY;
    const { config } = await import('../src/config.js');
    expect(config.posthogKey).toBe('');
    expect(config.stripePriceMonthly).toBe('');
    expect(config.supabaseUrl).toBe('https://test.supabase.co');
  });

  // Behind Caddy every request arrives over loopback. If trustProxy stays
  // false, request.ip is 127.0.0.1 for the entire internet: the anonymous
  // quota becomes one global bucket and the per-IP rate limiter becomes one
  // shared bucket. Trusting only the proxy keeps the real client IP while
  // still ignoring X-Forwarded-For sent by clients themselves.
  it('defaults trustProxy off so a bare socket address is never mistaken for a client', async () => {
    process.env = { ...saved, ...REQUIRED };
    delete process.env.TRUST_PROXY;
    const { config } = await import('../src/config.js');
    expect(config.trustProxy).toBe(false);
  });

  it('parses a comma-separated proxy allowlist into an array', async () => {
    process.env = { ...saved, ...REQUIRED, TRUST_PROXY: '127.0.0.1, ::1' };
    const { config } = await import('../src/config.js');
    expect(config.trustProxy).toEqual(['127.0.0.1', '::1']);
  });

  it('treats an explicit "true" or "false" string as the boolean it spells', async () => {
    process.env = { ...saved, ...REQUIRED, TRUST_PROXY: 'true' };
    expect((await import('../src/config.js')).config.trustProxy).toBe(true);
    vi.resetModules();
    process.env = { ...saved, ...REQUIRED, TRUST_PROXY: 'false' };
    expect((await import('../src/config.js')).config.trustProxy).toBe(false);
  });
});
