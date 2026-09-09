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
});
