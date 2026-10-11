import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueuePendingReport } from '../src/db/enqueue-report.js';

const state = vi.hoisted(() => ({
  lookups: [] as Array<{ id: string; game_analyses: unknown } | null>,
  sourceInsertError: null as { code?: string; message?: string } | null,
  analysisInsertError: null as { code?: string; message?: string } | null,
  analysisBySource: null as { id: string; share_id: string; status: string } | null,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
}));

vi.mock('../src/config.js', () => ({
  config: { supabaseUrl: 'https://test.supabase.co', supabaseServiceRoleKey: 'k', supabaseAnonKey: 'a' },
}));
vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    from: (table: string) => {
      const log: Array<[string, unknown[]]> = [];
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'maybeSingle', 'single', 'insert']) {
        builder[method] = (...args: unknown[]) => { log.push([method, args]); return builder; };
      }
      builder.then = (ok: (v: unknown) => unknown, bad: (r: unknown) => unknown) => {
        const inserted = log.find(e => e[0] === 'insert');
        if (inserted) {
          const row = inserted[1][0] as Record<string, unknown>;
          state.inserts.push({ table, row });
          if (table === 'source_games' && state.sourceInsertError) {
            return Promise.resolve({ data: null, error: state.sourceInsertError }).then(ok, bad);
          }
          if (table === 'game_analyses' && state.analysisInsertError) {
            return Promise.resolve({ data: null, error: state.analysisInsertError }).then(ok, bad);
          }
          if (table === 'source_games') return Promise.resolve({ data: { id: 'src-new' }, error: null }).then(ok, bad);
          return Promise.resolve({ data: { id: 'an-new', share_id: 'share-new', status: 'pending' }, error: null }).then(ok, bad);
        }
        if (table === 'source_games') return Promise.resolve({ data: state.lookups.shift() ?? null, error: null }).then(ok, bad);
        return Promise.resolve({ data: state.analysisBySource, error: null }).then(ok, bad);
      };
      return builder;
    },
  },
}));

const input = {
  userId: 'user-1',
  ip: '203.0.113.9',
  pgn: '1. e4 e5 *',
  source: 'chesscom',
  externalId: 'https://www.chess.com/game/live/1',
  metadata: { chesscom_username: 'me' },
  heroVariant: 'scan',
  eloBand: '1000_1400' as const,
  playerColor: 'white' as const,
  whitePlayer: 'me',
  blackPlayer: 'opp',
};

describe('enqueuePendingReport', () => {
  beforeEach(() => {
    state.lookups = [];
    state.sourceInsertError = null;
    state.analysisInsertError = null;
    state.analysisBySource = null;
    state.inserts = [];
  });

  it('reuses the report a signed-in user already has for that game', async () => {
    state.lookups = [{ id: 'src-1', game_analyses: { id: 'an-old', share_id: 'old', status: 'completed' } }];
    const row = await enqueuePendingReport(input);
    expect(row).toEqual({ id: 'an-old', share_id: 'old', status: 'completed', reused: true });
    expect(state.inserts).toEqual([]);
  });

  it('reuses the winner when the source-game unique constraint loses the race', async () => {
    state.sourceInsertError = { code: '23505', message: 'dup' };
    state.lookups = [null, { id: 'src-1', game_analyses: [{ id: 'an-race', share_id: 'race', status: 'pending' }] }];
    const row = await enqueuePendingReport(input);
    expect(row).toMatchObject({ id: 'an-race', reused: true });
  });

  it('reuses the analysis when source_game_id is already taken', async () => {
    state.analysisInsertError = { code: '23505', message: 'dup' };
    state.analysisBySource = { id: 'an-taken', share_id: 'taken', status: 'explaining' };
    const row = await enqueuePendingReport({ ...input, userId: null, externalId: null });
    expect(row).toEqual({ id: 'an-taken', share_id: 'taken', status: 'explaining', reused: true });
  });

  it('inserts a scan example report when the game is new', async () => {
    const row = await enqueuePendingReport(input);
    expect(row).toEqual({ id: 'an-new', share_id: 'share-new', status: 'pending', reused: false });
    expect(state.inserts.map(i => i.table)).toEqual(['source_games', 'game_analyses']);
    expect(state.inserts[1].row).toMatchObject({ hero_variant: 'scan', elo_band: '1000_1400', status: 'pending', source_game_id: 'src-new' });
    expect(state.inserts[0].row).toMatchObject({ player_color: 'white', white_player: 'me', external_id: input.externalId });
  });
});
