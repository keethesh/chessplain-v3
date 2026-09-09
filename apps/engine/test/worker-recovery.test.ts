import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reclaimStaleLeases } from '../src/queue/worker.js';

// Assert on the query the code builds, not a database: record every filter
// argument the supabase chain receives. Mock style matches quota.test.ts
// (vi.hoisted state + vi.mock factories).
const captured = vi.hoisted(() => ({
  fromTable: undefined as string | undefined,
  updatePatch: undefined as unknown,
  inArgs: undefined as [string, string[]] | undefined,
  orFilter: undefined as string | undefined,
}));
vi.mock('posthog-node', () => ({ PostHog: vi.fn(() => ({ capture: vi.fn() })) }));

vi.mock('../src/config.js', () => ({
  config: {
    nodeEnv: 'test',
    posthogKey: '',
    posthogHost: '',
    llmApiBase: 'https://test.invalid/v1',
    llmApiKey: 'test-key',
    llmModel: 'test-model',
    engineHashMb: 16,
    engineThreads: 1,
    staleLeaseMinutes: 15,
  },
}));

vi.mock('../src/db/supabase.js', () => {
  const select = vi.fn(() => ({ data: [], count: 3, error: null }));
  const or = vi.fn((filter: string) => {
    captured.orFilter = filter;
    return { select };
  });
  const inFn = vi.fn((column: string, values: string[]) => {
    captured.inArgs = [column, values];
    return { or, select };
  });
  const update = vi.fn((patch: unknown) => {
    captured.updatePatch = patch;
    return { in: inFn, or, select };
  });
  return {
    supabase: {
      from: vi.fn((table: string) => {
        captured.fromTable = table;
        return { update };
      }),
    },
  };
});

describe('reclaimStaleLeases', () => {
  beforeEach(() => {
    captured.fromTable = undefined;
    captured.updatePatch = undefined;
    captured.inArgs = undefined;
    captured.orFilter = undefined;
  });

  it('targets only mid-flight statuses and requeues leases older than staleLeaseMinutes', async () => {
    await reclaimStaleLeases();

    expect(captured.fromTable).toBe('game_analyses');
    expect(captured.updatePatch).toEqual({ status: 'pending', locked_at: null });
    expect(captured.inArgs).toEqual(['status', ['sweeping', 'verifying', 'explaining']]);

    // The regression this guards: without the age filter the boot sweep steals
    // jobs another replica is actively running.
    expect(captured.orFilter).toMatch(/locked_at\.is\.null,locked_at\.lt\.\d{4}-/);
    const cutoffMs = new Date(captured.orFilter!.match(/locked_at\.lt\.([^,]+)/)![1]).getTime();
    expect(Math.abs(cutoffMs - (Date.now() - 15 * 60_000))).toBeLessThan(5000);
  });

  it('still includes rows stranded with a NULL locked_at', async () => {
    await reclaimStaleLeases();

    expect(captured.orFilter).toContain('locked_at.is.null');
  });
});
