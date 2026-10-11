import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conceptInfo } from '../src/analysis/concepts.js';
import '../src/http/server.js';

const state = vi.hoisted(() => ({
  signedIn: true,
  tier: 'free',
  rows: [] as unknown[],
  scans: [] as Array<Record<string, unknown>>,
}));
const routes = vi.hoisted(() => ({ handlers: {} as Record<string, unknown> }));

vi.mock('fastify', () => {
  const instance = {
    register: vi.fn(async () => {}),
    addContentTypeParser: vi.fn(),
    log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    post: vi.fn((route: string, ...rest: unknown[]) => { routes.handlers[`POST ${route}`] = rest[rest.length - 1]; }),
    get: vi.fn((route: string, ...rest: unknown[]) => { routes.handlers[`GET ${route}`] = rest[rest.length - 1]; }),
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  return { default: vi.fn(() => instance) };
});

vi.mock('../src/config.js', () => ({
  config: { port: 0, nodeEnv: 'production', disableQuota: false, trustProxy: false, stripeSecretKey: '' },
}));

vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: async () => state.signedIn ? { data: { user: { id: 'user-1', email: 'a@b.c' } } } : { data: { user: null } },
    },
    from: (table: string) => {
      const log: Array<[string, unknown[]]> = [];
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'neq', 'gte', 'order', 'limit', 'maybeSingle']) {
        builder[method] = (...args: unknown[]) => { log.push([method, args]); return builder; };
      }
      builder.then = (ok: (v: unknown) => unknown, bad: (r: unknown) => unknown) => {
        let result: { data: unknown; error: null };
        if (table === 'profiles') result = { data: { subscription_tier: state.tier }, error: null };
        else if (table === 'scans' && log.some(e => e[0] === 'gte')) {
          const since = Date.parse(String(log.find(e => e[0] === 'gte')![1][1]));
          let scans = state.scans.filter(s => Date.parse(String(s.created_at)) >= since);
          if (log.some(e => e[0] === 'neq' && e[1][0] === 'status' && e[1][1] === 'failed')) {
            scans = scans.filter(s => s.status !== 'failed');
          }
          result = { data: scans.map(s => ({ created_at: s.created_at })), error: null };
        } else if (table === 'scans') result = { data: state.scans, error: null };
        else result = { data: state.rows, error: null };
        return Promise.resolve(result).then(ok, bad);
      };
      return builder;
    },
  },
}));

vi.mock('../src/queue/worker.js', () => ({ startWorker: vi.fn(async () => {}), stopWorker: vi.fn() }));
vi.mock('../src/uci/engine-pool.js', () => ({
  enginePool: { init: vi.fn(async () => {}), shutdown: vi.fn(async () => {}), totalCount: 1, availableCount: 1 },
}));

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;
async function call() {
  // bootstrap() runs on microtasks only; yield event-loop turns until it has registered routes.
  for (let i = 0; i < 1000 && !routes.handlers['GET /api/me']; i++) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  }
  let status = 200;
  let body: unknown;
  const reply = { status(code: number) { status = code; return reply; }, send(payload: unknown) { body = payload; return reply; } };
  await (routes.handlers['GET /api/me'] as Handler)({ headers: { authorization: 'Bearer t' } }, reply);
  return { status, body: body as Record<string, any> };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const row = (over: Record<string, unknown>) => ({
  id: 'a', share_id: 's', status: 'completed', created_at: daysAgo(1), summary: { headline: 'h' },
  moments: [{ concept_name: 'Loose pieces' }],
  source_games: { external_id: 'https://chess.com/game/1', source: 'chesscom', player_color: 'white', white_player: 'me', black_player: 'them', metadata: { chesscom_username: 'me' } },
  ...over,
});

describe('GET /api/me', () => {
  beforeEach(() => {
    state.signedIn = true; state.tier = 'free'; state.rows = []; state.scans = [];
  });

  it('counts the weekly allowance like the submit quota and reports when a slot frees', async () => {
    state.rows = [
      row({ id: '1', created_at: daysAgo(1) }),
      row({ id: '2', created_at: daysAgo(3) }),
      row({ id: '3', status: 'failed', created_at: daysAgo(0) }),
      row({ id: '4', moments: [], created_at: daysAgo(0) }),
      row({ id: '5', created_at: daysAgo(9) }),
    ];
    const { body } = await call();
    expect(body.allowance.used).toBe(2);
    expect(Date.parse(body.allowance.next_slot_at)).toBeCloseTo(Date.now() + 4 * 86_400_000, -4);
  });

  it('has no allowance for premium and finds the last Chess.com username', async () => {
    state.tier = 'premium';
    state.rows = [row({ source_games: { external_id: null, source: 'pgn', metadata: {} } }), row({ id: 'z' })];
    const { body } = await call();
    expect(body.allowance).toBeNull();
    expect(body.scan_allowance).toBeNull();
    expect(body.open_idea).toBeNull();
    expect(body.chesscom_username).toBe('me');
  });

  it('does not count a scan example report toward the review allowance', async () => {
    state.rows = [
      row({ id: 'scan-report', hero_variant: 'scan', created_at: daysAgo(0) }),
      row({ id: 'real', created_at: daysAgo(1) }),
    ];
    const { body } = await call();
    expect(body.allowance.used).toBe(1);
    expect(body.allowance.next_slot_at).toBeNull();
  });

  it('groups completed reviews by concept_id, once per review, from two reviews up', async () => {
    state.rows = [
      row({ id: '1', moments: [{ concept_id: 'hanging_piece' }, { concept_id: 'double_attack' }, { concept_id: null }] }),
      row({ id: '2', moments: [{ concept_id: 'hanging_piece' }, { concept_id: 'hanging_piece' }] }),
      row({ id: '3', status: 'failed', moments: [{ concept_id: 'double_attack' }] }),
    ];
    const { body } = await call();
    expect(body.patterns).toEqual([{ concept: conceptInfo('hanging_piece'), count: 2 }]);
  });

  it('opens on the latest completed scan that has a top concept', async () => {
    state.scans = [
      { id: 'bad', status: 'failed', created_at: daysAgo(0), result: null, chesscom_username: 'me' },
      {
        id: 'new', status: 'completed', created_at: daysAgo(1), completed_at: daysAgo(1), chesscom_username: 'me',
        example_report_id: 'ex', checkin: { concept_id: 'hanging_piece', answer: 'forgot', at: daysAgo(1) },
        result: { games_scanned: 10, top: { concept: { id: 'hanging_piece' }, games_with_concept: 4 } },
      },
      {
        id: 'old', status: 'completed', created_at: daysAgo(9), completed_at: daysAgo(9), chesscom_username: 'me',
        result: { games_scanned: 8, top: { concept: { id: 'double_attack' }, games_with_concept: 2 } },
      },
    ];
    const { body } = await call();
    expect(body.open_idea).toMatchObject({
      scan_id: 'new',
      concept: conceptInfo('hanging_piece'),
      games_with_concept: 4,
      games_scanned: 10,
      example_report_id: 'ex',
      chesscom_username: 'me',
      last_checkin: { answer: 'forgot' },
    });
    expect(body.scans.map((s: { id: string }) => s.id)).toEqual(['bad', 'new', 'old']);
    expect(body.scans[1]).toMatchObject({ top_concept_id: 'hanging_piece', games_with_concept: 4 });
    expect(body.scan_allowance.used).toBe(1);
    expect(body.scan_allowance.next_slot_at).toBeNull();
  });

  it('rejects an unauthenticated caller', async () => {
    state.signedIn = false;
    expect((await call()).status).toBe(401);
  });
});
