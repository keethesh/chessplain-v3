import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processNextScan, reclaimStaleScanLeases } from '../src/queue/scan-worker.js';
import { ChessComInputError, fetchScanGames } from '../src/analysis/chesscom.js';
import { aggregate, analyzeScanGame } from '../src/analysis/scan.js';
import { enqueuePendingReport } from '../src/db/enqueue-report.js';

const state = vi.hoisted(() => ({
  candidate: null as null | {
    id: string; user_id: string | null; ip: string | null; chesscom_username: string; attempts: number; example_report_id?: string | null;
  },
  claimOk: true,
  patches: [] as unknown[],
  calls: [] as Array<{ method: string; args: unknown[] }>,
  /** Owned updates after this many recorded patches return zero rows. */
  loseLeaseAfter: null as number | null,
  /** null means the re-read found the lease gone. undefined copies the candidate. */
  reread: undefined as { user_id: string | null; example_report_id: string | null } | null | undefined,
}));

vi.mock('../src/config.js', () => ({
  config: { staleLeaseMinutes: 15, nodeEnv: 'test' },
}));

vi.mock('../src/analysis/chesscom.js', () => {
  class ChessComInputError extends Error {
    constructor(message: string, readonly kind = 'input') { super(message); }
  }
  return { ChessComInputError, fetchScanGames: vi.fn() };
});

vi.mock('../src/analysis/scan.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/analysis/scan.js')>();
  return {
    ...actual,
    analyzeScanGame: vi.fn(async () => []),
    aggregate: vi.fn(() => ({ games_scanned: 0, top: null, concept_counts: [], example: null, nothing_decisive: true })),
  };
});

vi.mock('../src/db/enqueue-report.js', () => ({
  enqueuePendingReport: vi.fn(async () => ({ id: 'rep-1', share_id: 'r', status: 'pending', reused: false })),
}));

vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    from: () => {
      const log: Array<[string, unknown[]]> = [];
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'or', 'order', 'limit', 'maybeSingle', 'single', 'update', 'in']) {
        builder[method] = (...args: unknown[]) => { log.push([method, args]); state.calls.push({ method, args }); return builder; };
      }
      builder.then = (ok: (v: unknown) => unknown, bad: (r: unknown) => unknown) => {
        const update = log.find(e => e[0] === 'update');
        const owned = update && log.some(e => e[0] === 'eq' && e[1][0] === 'attempts');
        let result: { data?: unknown; error: unknown; count?: number };
        if (update && log.some(e => e[0] === 'in') && !owned) {
          result = { data: [], count: 2, error: null };
        } else if (update && log.some(e => e[0] === 'single')) {
          result = state.claimOk ? { data: { id: 'scan-1' }, error: null } : { data: null, error: { message: 'lost' } };
        } else if (update) {
          state.patches.push(update[1][0]);
          const lost = state.loseLeaseAfter != null && state.patches.length > state.loseLeaseAfter;
          result = { data: lost ? [] : [{ id: 'scan-1' }], error: null };
        } else if (log.some(e => e[0] === 'eq' && e[1][0] === 'attempts')) {
          const fresh = state.reread === undefined && state.candidate
            ? { user_id: state.candidate.user_id ?? null, example_report_id: state.candidate.example_report_id ?? null }
            : state.reread;
          result = { data: fresh ?? null, error: null };
        } else {
          result = { data: state.candidate, error: null };
        }
        return Promise.resolve(result).then(ok, bad);
      };
      return builder;
    },
  },
}));

const game = {
  pgn: '1. e4 e5 *', url: 'https://www.chess.com/game/live/9', endedAt: '2026-01-01T00:00:00.000Z',
  timeClass: 'blitz' as const, playerColor: 'black' as const, outcome: 'loss' as const,
  playerRating: 1100, opponent: 'opp', opponentRating: 1200, eloBand: '1000_1400' as const,
};

describe('scan worker', () => {
  beforeEach(() => {
    state.candidate = null;
    state.claimOk = true;
    state.patches = [];
    state.calls = [];
    state.loseLeaseAfter = null;
    state.reread = undefined;
    vi.mocked(fetchScanGames).mockReset();
    vi.mocked(analyzeScanGame).mockReset();
    vi.mocked(aggregate).mockReset();
    vi.mocked(enqueuePendingReport).mockClear();
  });

  it('does nothing when the queue is empty', async () => {
    expect(await processNextScan()).toBe(false);
    expect(state.patches).toEqual([]);
  });

  it('fails a Chess.com input error without retrying', async () => {
    state.candidate = { id: 'scan-1', user_id: null, ip: '203.0.113.9', chesscom_username: 'me', attempts: 0 };
    vi.mocked(fetchScanGames).mockRejectedValue(new ChessComInputError('empty', 'no_games'));
    expect(await processNextScan()).toBe(true);
    expect(state.patches.at(-1)).toMatchObject({ status: 'failed', next_attempt_at: null });
  });

  it('puts a transient failure back to pending with backoff', async () => {
    state.candidate = { id: 'scan-1', user_id: 'user-1', ip: null, chesscom_username: 'me', attempts: 0 };
    vi.mocked(fetchScanGames).mockRejectedValue(new Error('chess.com down'));
    expect(await processNextScan()).toBe(true);
    const patch = state.patches.at(-1) as { status: string; next_attempt_at: string };
    expect(patch.status).toBe('pending');
    expect(Date.parse(patch.next_attempt_at)).toBeGreaterThan(Date.now());
  });

  it('writes per-game progress and enqueues the example report as a scan hero', async () => {
    state.candidate = { id: 'scan-1', user_id: 'user-1', ip: '203.0.113.9', chesscom_username: 'me', attempts: 1 };
    vi.mocked(fetchScanGames).mockResolvedValue([game]);
    vi.mocked(analyzeScanGame).mockResolvedValue([{ ply: 8, move_number: 4, san: '4.Nf3', best_move: 'Qh5', eval_swing: -2, concept_id: 'hanging_piece' }]);
    vi.mocked(aggregate).mockReturnValue({
      games_scanned: 1,
      top: null,
      concept_counts: [],
      example: { game_url: game.url, ply: 8, concept_id: 'hanging_piece' },
      nothing_decisive: false,
    });
    expect(await processNextScan()).toBe(true);
    const progress = state.patches.find(p => (p as { progress?: { done: number } }).progress?.done === 1) as { games: Array<{ analyzed: boolean }>; locked_at?: string };
    expect(progress.games[0].analyzed).toBe(true);
    expect(progress.locked_at).toMatch(/^\d{4}-/);
    expect(enqueuePendingReport).toHaveBeenCalledWith(expect.objectContaining({
      heroVariant: 'scan',
      externalId: game.url,
      userId: 'user-1',
      playerColor: 'black',
      blackPlayer: 'me',
      whitePlayer: 'opp',
      eloBand: '1000_1400',
    }));
    expect(state.patches.at(-1)).toMatchObject({ status: 'completed', example_report_id: 'rep-1' });
  });

  it('refreshes the lease on each game and reuses an example report enqueued by an earlier attempt', async () => {
    state.candidate = { id: 'scan-1', user_id: 'user-1', ip: null, chesscom_username: 'me', attempts: 1, example_report_id: 'rep-kept' };
    vi.mocked(fetchScanGames).mockResolvedValue([game]);
    vi.mocked(analyzeScanGame).mockResolvedValue([]);
    vi.mocked(aggregate).mockReturnValue({
      games_scanned: 1, top: null, concept_counts: [],
      example: { game_url: game.url, ply: 8, concept_id: 'hanging_piece' }, nothing_decisive: false,
    });
    expect(await processNextScan()).toBe(true);
    expect(enqueuePendingReport).not.toHaveBeenCalled();
    expect(state.patches.at(-1)).toMatchObject({ status: 'completed', example_report_id: 'rep-kept' });
    expect(state.calls.some(c => c.method === 'eq' && c.args[0] === 'attempts' && c.args[1] === 2)).toBe(true);
    expect(state.calls.some(c => c.method === 'in' && (c.args[1] as string[]).includes('analyzing'))).toBe(true);
  });

  it('enqueues the example for the user who claimed the scan mid-run', async () => {
    state.candidate = { id: 'scan-1', user_id: null, ip: '203.0.113.9', chesscom_username: 'me', attempts: 0 };
    state.reread = { user_id: 'user-claimed', example_report_id: null };
    vi.mocked(fetchScanGames).mockResolvedValue([game]);
    vi.mocked(analyzeScanGame).mockResolvedValue([]);
    vi.mocked(aggregate).mockReturnValue({
      games_scanned: 1, top: null, concept_counts: [],
      example: { game_url: game.url, ply: 4, concept_id: 'hanging_piece' }, nothing_decisive: false,
    });
    expect(await processNextScan()).toBe(true);
    expect(enqueuePendingReport).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-claimed' }));
  });

  it('stops when a progress write loses the lease and does not enqueue', async () => {
    state.candidate = { id: 'scan-1', user_id: 'user-1', ip: null, chesscom_username: 'me', attempts: 0 };
    state.loseLeaseAfter = 0;
    vi.mocked(fetchScanGames).mockResolvedValue([game]);
    expect(await processNextScan()).toBe(true);
    expect(enqueuePendingReport).not.toHaveBeenCalled();
    expect(state.patches.some(p => (p as { status?: string }).status === 'completed')).toBe(false);
    expect(state.patches.some(p => (p as { status?: string }).status === 'failed')).toBe(false);
    expect(state.patches.some(p => (p as { status?: string }).status === 'pending')).toBe(false);
  });

  it('does not enqueue a report when nothing was decisive', async () => {
    state.candidate = { id: 'scan-1', user_id: null, ip: '203.0.113.9', chesscom_username: 'me', attempts: 0 };
    vi.mocked(fetchScanGames).mockResolvedValue([game]);
    vi.mocked(analyzeScanGame).mockResolvedValue([]);
    vi.mocked(aggregate).mockReturnValue({ games_scanned: 1, top: null, concept_counts: [], example: null, nothing_decisive: true });
    expect(await processNextScan()).toBe(true);
    expect(enqueuePendingReport).not.toHaveBeenCalled();
    expect(state.patches.at(-1)).toMatchObject({ status: 'completed', example_report_id: null });
  });

  it('completes when one game throws and aggregates only the games that were read', async () => {
    const games = Array.from({ length: 10 }, (_, i) => ({ ...game, url: `https://www.chess.com/game/live/${i}` }));
    state.candidate = { id: 'scan-1', user_id: 'user-1', ip: null, chesscom_username: 'me', attempts: 0 };
    vi.mocked(fetchScanGames).mockResolvedValue(games);
    let n = 0;
    vi.mocked(analyzeScanGame).mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error("UCI command 'go' timed out");
      return [{ ply: 8, move_number: 4, san: 'Nf3', best_move: 'Qh5', eval_swing: -2, concept_id: 'hanging_piece' }];
    });
    vi.mocked(aggregate).mockReturnValue({ games_scanned: 9, top: null, concept_counts: [], example: null, nothing_decisive: false });

    expect(await processNextScan()).toBe(true);

    expect(analyzeScanGame).toHaveBeenCalledTimes(10);
    const completed = state.patches.at(-1) as { status: string; games: Array<{ url: string; analyzed: boolean; turning_points: unknown[]; error?: boolean }> };
    expect(completed.status).toBe('completed');
    expect(completed.games).toHaveLength(10);
    expect(completed.games.filter((g) => g.analyzed)).toHaveLength(9);
    expect(completed.games[1]).toMatchObject({ analyzed: false, turning_points: [], error: true });
    const counted = vi.mocked(aggregate).mock.calls[0][0] as Array<{ url: string; analyzed: boolean }>;
    expect(counted).toHaveLength(9);
    expect(counted.every((g) => g.analyzed)).toBe(true);
    expect(counted.map((g) => g.url)).not.toContain(games[1].url);
  });

  it('retries when every game fails to analyse', async () => {
    state.candidate = { id: 'scan-1', user_id: 'user-1', ip: null, chesscom_username: 'me', attempts: 0 };
    vi.mocked(fetchScanGames).mockResolvedValue([game, { ...game, url: 'https://www.chess.com/game/live/8' }]);
    vi.mocked(analyzeScanGame).mockRejectedValue(new Error("UCI command 'go' timed out"));

    expect(await processNextScan()).toBe(true);

    expect(aggregate).not.toHaveBeenCalled();
    expect(state.patches.at(-1)).toMatchObject({ status: 'pending', error_message: 'Every game failed to analyse' });
    expect(state.patches.some((p) => (p as { status?: string }).status === 'completed')).toBe(false);
  });

  it('reclaims fetching and analyzing leases older than staleLeaseMinutes', async () => {
    await reclaimStaleScanLeases();
    expect(state.calls.find(c => c.method === 'update')?.args[0]).toEqual({ status: 'pending', locked_at: null });
    expect(state.calls.find(c => c.method === 'in')?.args).toEqual(['status', ['fetching', 'analyzing']]);
    const orFilter = String(state.calls.find(c => c.method === 'or')?.args[0]);
    expect(orFilter).toMatch(/locked_at\.is\.null,locked_at\.lt\.\d{4}-/);
    const cutoffMs = new Date(orFilter.match(/locked_at\.lt\.([^,]+)/)![1]).getTime();
    expect(Math.abs(cutoffMs - (Date.now() - 15 * 60_000))).toBeLessThan(5000);
  });
});
