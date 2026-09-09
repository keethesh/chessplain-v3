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

vi.mock('../src/db/supabase.js', () => {
  type Log = Array<[string, unknown[]]>;
  function resultFor(table: string, log: Log) {
    const select = log.find(e => e[0] === 'select');
    // The quota query is the only one selecting with { count: 'exact', head: true }
    if (table === 'game_analyses' && (select?.[1]?.[1] as { count?: string } | undefined)?.count === 'exact') {
      return { count: state.quotaCount, error: null };
    }
    if (table === 'profiles') return { data: { subscription_tier: 'free' }, error: null };
    if (table === 'source_games') return { data: { id: 'source-1' }, error: null };
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
        for (const method of ['select', 'eq', 'neq', 'gte', 'is', 'in', 'single', 'insert', 'update', 'order', 'limit']) {
          builder[method] = (...args: unknown[]) => { log.push([method, args]); return builder; };
        }
        builder.then = (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) => {
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
});
