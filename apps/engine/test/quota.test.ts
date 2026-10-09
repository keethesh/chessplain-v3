import { beforeEach, describe, expect, it, vi } from 'vitest';
// Importing the server module triggers bootstrap(), which registers the route
// handlers on the mocked Fastify instance captured below.
import '../src/http/server.js';

// Shared mutable state: the mock factories below are hoisted and read this at
// call time, so each test configures the scenario before invoking the handler.
const state = vi.hoisted(() => ({
  signedIn: false,
  quotaCount: 0,
  quotaBuilders: [] as Array<{ log: Array<[string, unknown[]]> }>,
  // game_analyses rows inserted during the test; the quota count sees them,
  // like the real table does.
  insertedAnalyses: 0,
  // Status of the signed-in user's earlier review of the submitted Chess.com game, if any.
  priorStatus: null as string | null,
  requeueUpdate: undefined as Record<string, unknown> | undefined,
}));

// server.ts builds a module-private Fastify instance and starts listening
// inside bootstrap(). Replace Fastify with a recorder so the route handlers
// can be invoked directly — no real listen, no plugins, no engine pool.
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
  config: {
    port: 0,
    nodeEnv: 'production', // quota enforcement is production-gated
    disableQuota: false,
    trustProxy: false,
    stripeSecretKey: '',
  },
}));


vi.mock('../src/analysis/chesscom.js', () => ({
  ChessComInputError: class extends Error {},
  listRecentChessComGames: vi.fn(),
  fetchRecentChessComGame: vi.fn(async (_user: string, url?: string) => ({
    pgn: '1. e4 e5 2. Nf3 Nc6 *', eloBand: 'intermediate', rating: 1200, playerColor: 'white', opponentUsername: 'x', gameUrl: url ?? null,
  })),
}));
vi.mock('../src/db/supabase.js', () => {
  type Log = Array<[string, unknown[]]>;
  function resultFor(table: string, log: Log) {
    const select = log.find(e => e[0] === 'select');
    // The quota query is the only one selecting with { count: 'exact', head: true }
    if (table === 'game_analyses' && (select?.[1]?.[1] as { count?: string } | undefined)?.count === 'exact') {
      return { count: state.quotaCount + state.insertedAnalyses, error: null };
    }
    if (table === 'profiles') return { data: { subscription_tier: 'free' }, error: null };
    if (table === 'source_games') {
      return { data: { id: 'source-1', game_analyses: state.priorStatus ? [{ id: 'old-1', share_id: 'share-old', status: state.priorStatus }] : [] }, error: null };
    }
    return { data: { id: 'analysis-1', share_id: 'share-1', status: 'pending' }, error: null };
  }
  return {
    supabase: {
      auth: {
        getUser: async () => state.signedIn
          ? { data: { user: { id: 'user-1' } } }
          : { data: { user: null } },
      },
      from: (table: string) => {
        const log: Log = [];
        const builder: Record<string, unknown> & { log: Log } = { log };
        for (const method of ['select', 'eq', 'neq', 'or', 'gte', 'is', 'in', 'single', 'maybeSingle', 'insert', 'update', 'order', 'limit']) {
          builder[method] = (...args: unknown[]) => {
            log.push([method, args]);
            if (method === 'update' && table === 'game_analyses') state.requeueUpdate = args[0] as Record<string, unknown>;
            return builder;
          };
        }
        builder.then = (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) => {
          if (table === 'game_analyses' && log.some(e => e[0] === 'insert')) state.insertedAnalyses++;
          const result = resultFor(table, log);
          if (result.count !== undefined) state.quotaBuilders.push(builder);
          return Promise.resolve(result).then(onFulfilled, onRejected);
        };
        return builder;
      },
    },
  };
});

vi.mock('../src/uci/engine-pool.js', () => ({
  enginePool: { init: vi.fn(async () => {}), shutdown: vi.fn(async () => {}), totalCount: 1, availableCount: 1 },
}));
vi.mock('../src/queue/worker.js', () => ({
  startWorker: vi.fn(async () => {}),
  stopWorker: vi.fn(),
}));

// bootstrap() runs entirely on microtasks (all its awaits are mocked no-ops), so
// yielding event-loop turns deterministically suffices; no real-timer wait.
// There is no exposed completion signal — the module registers routes privately —
// hence the bounded turn poll on the awaited condition itself.
async function reportsHandler(): Promise<(request: unknown, reply: unknown) => Promise<unknown>> {
  for (let i = 0; i < 1000 && !routes.handlers['POST /api/reports']; i++) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  }
  const handler = routes.handlers['POST /api/reports'];
  if (typeof handler !== 'function') throw new Error('/api/reports was never registered');
  return handler as (request: unknown, reply: unknown) => Promise<unknown>;
}

function fakeReply() {
  const reply: { statusCode: number; body: unknown; status: (code: number) => unknown; send: (payload: unknown) => unknown } = {
    statusCode: 0, body: undefined, status: () => reply, send: () => reply,
  };
  reply.status = (code: number) => { reply.statusCode = code; return reply; };
  reply.send = (payload: unknown) => { reply.body = payload; return reply; };
  return reply;
}

function fakeRequest(signedIn: boolean) {
  return {
    body: { pgn: '1. e4 e5 2. Nf3 Nc6 *' },
    ip: '203.0.113.9',
    headers: signedIn ? { authorization: 'Bearer test-token' } : {},
  };
}

describe('free-report quota keying', () => {
  beforeEach(() => {
    state.signedIn = false;
    state.quotaCount = 0;
    state.quotaBuilders.length = 0;
    state.insertedAnalyses = 0;
  });

  async function run(signedIn: boolean) {
    state.signedIn = signedIn;
    const reply = fakeReply();
    await (await reportsHandler())(fakeRequest(signedIn), reply);
    expect(state.quotaBuilders).toHaveLength(1);
    const quotaLog = state.quotaBuilders[0].log;
    const eqColumns = quotaLog.filter(e => e[0] === 'eq').map(e => e[1][0]);
    return { reply, quotaLog, eqColumns };
  }

  it('counts a signed-in free user by user_id, not ip', async () => {
    const { reply, quotaLog, eqColumns } = await run(true);
    expect(eqColumns).toEqual(['user_id']);
    expect(quotaLog).toContainEqual(['neq', ['status', 'failed']]);
    expect(quotaLog.find(e => e[0] === 'gte')?.[1][0]).toBe('created_at');
    expect(reply.statusCode).toBe(201); // count 0 → allowed through to insert
  });

  it('counts an anonymous user by ip', async () => {
    const { reply, quotaLog, eqColumns } = await run(false);
    expect(eqColumns).toEqual(['ip']);
    expect(quotaLog).toContainEqual(['neq', ['status', 'failed']]);
    expect(quotaLog.find(e => e[0] === 'gte')?.[1][0]).toBe('created_at');
    expect(reply.statusCode).toBe(201);
  });

  it('never lets parallel anonymous submits exceed the free allowance', async () => {
    const handler = await reportsHandler();
    const replies = [fakeReply(), fakeReply(), fakeReply()];
    await Promise.all(replies.map(reply => handler(fakeRequest(false), reply)));
    expect(replies.map(r => r.statusCode).sort()).toEqual([201, 201, 402]);
  });
});

describe('retrying a failed report', () => {
  beforeEach(() => {
    state.signedIn = true;
    state.quotaCount = 2; // allowance used up
    state.quotaBuilders.length = 0;
    state.insertedAnalyses = 0;
    state.priorStatus = 'failed';
    state.requeueUpdate = undefined;
  });

  async function submit() {
    const reply = fakeReply();
    const request = { ...fakeRequest(true), body: { chesscom_username: 'someone', chesscom_game_url: 'https://www.chess.com/game/live/1' } };
    await (await reportsHandler())(request, reply);
    return reply;
  }

  it('is free when the allowance is used up, and keeps its original date', async () => {
    const reply = await submit();
    expect(reply.statusCode).toBe(201);
    expect(state.quotaBuilders).toHaveLength(0); // the quota was never consulted
    expect(state.requeueUpdate).toMatchObject({ status: 'pending', attempts: 0 });
    expect(state.requeueUpdate).not.toHaveProperty('created_at');
  });

  it('does not make a different game free', async () => {
    state.priorStatus = null;
    expect((await submit()).statusCode).toBe(402);
  });
});
