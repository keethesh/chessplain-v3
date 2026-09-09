import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression guard: the worker module must be importable with no analytics key.
 *
 * posthog-node throws from its constructor on an empty key. Once the hardcoded
 * production PostHog key was removed from config (so a missing env var can no
 * longer silently point at the live project), `new PostHog('')` at module scope
 * crashed the whole engine on startup — before any route was served. The unit
 * suite missed it because nothing imported the worker module, and CI only ran
 * typecheck, tests, and build. Analytics is optional; booting is not.
 */
describe('engine boot', () => {
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = { ...process.env };
    vi.resetModules();
    // The worker touches Supabase and the engine pool at import time only via
    // module construction; stub the network-facing pieces so this stays a
    // pure import check.
    vi.doMock('../src/db/supabase.js', () => ({ supabase: { from: () => ({}) } }));
    vi.doMock('../src/uci/engine-pool.js', () => ({
      enginePool: { init: vi.fn(), totalCount: 0, availableCount: 0 },
    }));
  });

  afterEach(() => {
    process.env = saved;
    vi.doUnmock('../src/db/supabase.js');
    vi.doUnmock('../src/uci/engine-pool.js');
  });

  it('imports the queue worker when POSTHOG_KEY is unset', async () => {
    process.env = { ...saved, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
    delete process.env.POSTHOG_KEY;

    await expect(import('../src/queue/worker.js')).resolves.toBeDefined();
  });

  it('still imports the queue worker when POSTHOG_KEY is set', async () => {
    process.env = {
      ...saved,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      POSTHOG_KEY: 'phc_test_key_not_real',
    };

    await expect(import('../src/queue/worker.js')).resolves.toBeDefined();
  });
});
