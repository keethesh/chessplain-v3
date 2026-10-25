import { afterEach, describe, expect, it, vi } from 'vitest';
import { startWorker, stopWorker } from '../src/queue/worker.js';
import { wakeWorkers } from '../src/queue/wakeup.js';

const db = vi.hoisted(() => ({
  reads: 0,
  row: null as null | Record<string, unknown>,
}));

vi.mock('posthog-node', () => ({ PostHog: vi.fn() }));
vi.mock('../src/config.js', () => ({
  config: { posthogKey: '', llmModel: 'test', staleLeaseMinutes: 15, workerConcurrency: 2 },
}));
vi.mock('../src/db/errors.js', () => ({ recordAnalysisError: vi.fn() }));
vi.mock('../src/uci/engine-pool.js', () => ({
  enginePool: { init: async () => {}, totalCount: 1 },
}));
vi.mock('../src/analysis/pgn.js', () => ({
  parsePgn: () => ({ playerColor: 'white', headers: {} }),
}));
vi.mock('../src/analysis/pipeline.js', () => ({
  runAnalysisPipeline: async () => ({
    report: { moments: [], summary: null }, stageMs: {},
    durationMs: 1, momentsCount: 0, cacheHitRate: 1,
  }),
}));
vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    from: (table: string) => {
      let patch: Record<string, unknown> | undefined;
      let single = false;
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const builder = {
        select: () => builder,
        update: (value: Record<string, unknown>) => { patch = value; return builder; },
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
        or: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => { single = true; return builder; },
        single: () => { single = true; return builder; },
        then: (resolve: (value: unknown) => unknown) => {
          if (table === 'source_games') return Promise.resolve(resolve({ data: { pgn: 'game', metadata: {} }, error: null }));
          if (!patch) db.reads++;
          const row = table === 'game_analyses' ? db.row : null;
          const matches = row && filters.every(filter => filter(row));
          if (matches && patch) Object.assign(row, patch);
          const data = matches ? (single ? { ...row } : [{ ...row }]) : (single ? null : []);
          return Promise.resolve(resolve({ data, error: null, count: matches ? 1 : 0 }));
        },
      };
      return builder;
    },
  },
}));

afterEach(() => {
  stopWorker();
  vi.useRealTimers();
  db.row = null;
  db.reads = 0;
});

describe('worker scheduling', () => {
  it('stays idle without rapid queries, then processes an inserted job immediately on wake', async () => {
    vi.useFakeTimers();
    const running = startWorker();
    await vi.advanceTimersByTimeAsync(0);
    const idleReads = db.reads;
    await vi.advanceTimersByTimeAsync(29_000);
    expect(db.reads).toBe(idleReads);

    db.row = { id: 'report', source_game_id: 'game', status: 'pending', attempts: 0 };
    wakeWorkers();
    await vi.advanceTimersByTimeAsync(0);
    expect(db.row.status).toBe('completed');
    expect(db.row.attempts).toBe(1);

    stopWorker();
    await running;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discovers durable jobs inserted without a local signal at the recovery check', async () => {
    vi.useFakeTimers();
    const running = startWorker();
    await vi.advanceTimersByTimeAsync(0);
    db.row = { id: 'external', source_game_id: 'game', status: 'pending', attempts: 0 };
    await vi.advanceTimersByTimeAsync(29_999);
    expect(db.row.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(db.row.status).toBe('completed');
    stopWorker();
    await running;
  });
});
