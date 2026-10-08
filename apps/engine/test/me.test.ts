import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/http/server.js';

const state = vi.hoisted(() => ({
  signedIn: true,
  tier: 'free',
  rows: [] as unknown[],
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
      const result = table === 'profiles'
        ? { data: { subscription_tier: state.tier }, error: null }
        : { data: state.rows, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'limit', 'maybeSingle']) builder[method] = () => builder;
      builder.then = (ok: (v: unknown) => unknown, bad: (r: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
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
    state.signedIn = true; state.tier = 'free'; state.rows = [];
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
    expect(body.chesscom_username).toBe('me');
  });

  it('surfaces only concepts seen in two or more completed reviews', async () => {
    state.rows = [
      row({ id: '1', moments: [{ concept_name: 'Loose pieces' }, { concept_name: 'Once' }, { concept_name: 'Position to review' }] }),
      row({ id: '2', moments: [{ concept_name: ' loose Pieces ' }, { concept_name: 'loose pieces' }, { concept_name: 'Position to review' }] }),
      row({ id: '3', status: 'failed', moments: [{ concept_name: 'Once' }] }),
    ];
    const { body } = await call();
    expect(body.patterns).toEqual([{ concept: 'Loose pieces', count: 2 }]);
  });

  it('rejects an unauthenticated caller', async () => {
    state.signedIn = false;
    expect((await call()).status).toBe(401);
  });
});
