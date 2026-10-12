import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/http/server.js';

const state = vi.hoisted(() => ({
  signedIn: false,
  userId: 'user-1',
  premium: false,
  fetchMode: 'ok' as 'ok' | 'unknown' | 'none' | 'down',
  quotaCount: 0,
  quotaHits: 0,
  quotaEq: [] as unknown[],
  unfinished: null as { id: string; share_id: string; status: string } | null,
  dedupeEq: [] as unknown[],
  scan: null as unknown,
  priors: [] as unknown[],
  report: null as unknown,
  claimRows: [] as unknown[],
  lastInsert: null as unknown,
  lastUpdate: null as unknown,
}));

const routes = vi.hoisted(() => ({ handlers: {} as Record<string, unknown> }));
vi.mock('fastify', () => {
  const instance = {
    register: vi.fn(async () => {}),
    addContentTypeParser: vi.fn(),
    log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    post: vi.fn((route: string, ...rest: unknown[]) => { routes.handlers[`POST ${route}`] = rest[rest.length - 1]; }),
    get: vi.fn((route: string, ...rest: unknown[]) => { routes.handlers[`GET ${route}`] = rest[rest.length - 1]; }),
    patch: vi.fn(),
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  return { default: vi.fn(() => instance) };
});

vi.mock('../src/config.js', () => ({
  config: { port: 0, host: '127.0.0.1', nodeEnv: 'production', disableQuota: false, trustProxy: false, stripeSecretKey: '', webOrigin: 'https://getchessplain.com', workerEnabled: false },
}));

vi.mock('../src/analysis/chesscom.js', () => {
  class ChessComInputError extends Error {
    constructor(message: string, readonly kind = 'input') { super(message); }
  }
  return {
    ChessComInputError,
    listRecentChessComGames: vi.fn(),
    fetchRecentChessComGame: vi.fn(),
    fetchScanGames: vi.fn(async () => {
      if (state.fetchMode === 'unknown') throw new ChessComInputError('missing', 'unknown_username');
      if (state.fetchMode === 'none') throw new ChessComInputError('empty', 'no_games');
      if (state.fetchMode === 'down') throw new Error('down');
      return [{ url: 'https://www.chess.com/game/live/1' }];
    }),
  };
});

vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    auth: { getUser: async () => state.signedIn ? { data: { user: { id: state.userId, email: 'a@b.c' } } } : { data: { user: null } } },
    from: (table: string) => {
      const log: Array<[string, unknown[]]> = [];
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'neq', 'gte', 'lt', 'in', 'is', 'or', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'update']) {
        builder[method] = (...args: unknown[]) => { log.push([method, args]); return builder; };
      }
      builder.then = (ok: (v: unknown) => unknown, bad: (r: unknown) => unknown) => {
        const select = log.find(e => e[0] === 'select');
        const head = (select?.[1]?.[1] as { count?: string } | undefined)?.count === 'exact';
        let result: { data?: unknown; error: unknown; count?: number };
        if (log.some(e => e[0] === 'insert')) {
          state.lastInsert = log.find(e => e[0] === 'insert')![1][0];
          result = { data: { id: 'scan-new', share_id: 'newshare', status: 'pending' }, error: null };
        } else if (log.some(e => e[0] === 'update')) {
          state.lastUpdate = log.find(e => e[0] === 'update')![1][0];
          result = log.some(e => e[0] === 'select') ? { data: state.claimRows, error: null } : { error: null };
        } else if (head) {
          state.quotaHits++;
          state.quotaEq = log.filter(e => e[0] === 'eq').map(e => e[1]);
          result = { count: state.quotaCount, error: null };
        } else if (table === 'profiles') {
          result = { data: { subscription_tier: state.premium ? 'premium' : 'free' }, error: null };
        } else if (table === 'game_analyses') {
          result = { data: state.report, error: null };
        } else if (table === 'scans' && log.some(e => e[0] === 'in')) {
          state.dedupeEq = log.filter(e => e[0] === 'eq').map(e => e[1]);
          result = { data: state.unfinished, error: null };
        } else if (table === 'scans' && log.some(e => e[0] === 'lt')) {
          result = { data: state.priors, error: null };
        } else if (table === 'scans') {
          result = { data: state.scan, error: null };
        } else {
          result = { data: null, error: null };
        }
        return Promise.resolve(result).then(ok, bad);
      };
      return builder;
    },
  },
}));

vi.mock('../src/uci/engine-pool.js', () => ({
  enginePool: { init: vi.fn(async () => {}), shutdown: vi.fn(async () => {}), totalCount: 1, availableCount: 1 },
}));
vi.mock('../src/queue/worker.js', () => ({ startWorker: vi.fn(async () => {}), stopWorker: vi.fn() }));

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;
async function handler(key: string): Promise<Handler> {
  for (let i = 0; i < 1000 && !routes.handlers[key]; i++) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  }
  const found = routes.handlers[key];
  if (typeof found !== 'function') throw new Error(`${key} was never registered`);
  return found as Handler;
}

function replyFor() {
  const reply = { statusCode: 200, body: undefined as unknown, status(code: number) { reply.statusCode = code; return reply; }, send(payload: unknown) { reply.body = payload; return reply; } };
  return reply;
}

function request(over: Record<string, unknown> = {}) {
  return {
    body: { chesscom_username: 'Mek' },
    ip: '203.0.113.9',
    headers: state.signedIn ? { authorization: 'Bearer t' } : {},
    params: {},
    ...over,
  };
}

const SCAN_ID = '11111111-1111-4111-8111-111111111111';

describe('POST /api/scans', () => {
  beforeEach(() => {
    state.signedIn = false;
    state.userId = 'user-1';
    state.premium = false;
    state.fetchMode = 'ok';
    state.quotaCount = 0;
    state.quotaHits = 0;
    state.quotaEq = [];
    state.unfinished = null;
    state.dedupeEq = [];
    state.lastInsert = null;
    state.lastUpdate = null;
  });

  it('rejects a username Chess.com would not accept', async () => {
    const reply = replyFor();
    await (await handler('POST /api/scans'))(request({ body: { chesscom_username: 'no' } }), reply);
    expect(reply.statusCode).toBe(400);
    expect(reply.body).toMatchObject({ error: 'invalid_username' });
    expect(state.lastInsert).toBeNull();
  });

  it('returns unknown_username when Chess.com has no such player', async () => {
    state.fetchMode = 'unknown';
    const reply = replyFor();
    await (await handler('POST /api/scans'))(request(), reply);
    expect(reply.statusCode).toBe(400);
    expect(reply.body).toMatchObject({ error: 'unknown_username' });
  });

  it('returns no_games when nothing rapid, blitz, or daily is eligible', async () => {
    state.fetchMode = 'none';
    const reply = replyFor();
    await (await handler('POST /api/scans'))(request(), reply);
    expect(reply.statusCode).toBe(400);
    expect(reply.body).toMatchObject({ error: 'no_games' });
  });

  it('returns 402 once the free scan allowance is used, keyed like reports', async () => {
    state.quotaCount = 2;
    const anon = replyFor();
    await (await handler('POST /api/scans'))(request(), anon);
    expect(anon.statusCode).toBe(402);
    expect(anon.body).toMatchObject({ error: 'quota_exceeded', can_sign_in: true });
    expect(state.quotaEq).toContainEqual(['ip', '203.0.113.9']);

    state.signedIn = true;
    state.quotaHits = 0;
    const signed = replyFor();
    await (await handler('POST /api/scans'))(request(), signed);
    expect(signed.statusCode).toBe(402);
    expect(signed.body).toMatchObject({ error: 'quota_exceeded', can_sign_in: false });
    expect(state.quotaEq).toContainEqual(['user_id', 'user-1']);
  });

  it('returns an unfinished scan for the same player instead of creating another', async () => {
    state.signedIn = true;
    state.unfinished = { id: 'scan-open', share_id: 'open', status: 'analyzing' };
    const reply = replyFor();
    await (await handler('POST /api/scans'))(request(), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual(state.unfinished);
    expect(state.quotaHits).toBe(0);
    expect(state.lastInsert).toBeNull();
    expect(state.dedupeEq).toContainEqual(['chesscom_username', 'mek']);
    expect(state.dedupeEq).toContainEqual(['user_id', 'user-1']);
  });

  it('creates a pending scan', async () => {
    const reply = replyFor();
    await (await handler('POST /api/scans'))(request(), reply);
    expect(reply.statusCode).toBe(201);
    expect(reply.body).toEqual({ id: 'scan-new', share_id: 'newshare', status: 'pending' });
    expect(state.lastInsert).toMatchObject({ chesscom_username: 'mek', status: 'pending', ip: '203.0.113.9', user_id: null });
  });
});

describe('scan check-in, claim, and report concepts', () => {
  beforeEach(() => {
    state.signedIn = true;
    state.userId = 'user-1';
    state.scan = null;
    state.priors = [];
    state.report = null;
    state.claimRows = [];
    state.lastUpdate = null;
  });

  async function checkin(body: unknown, scan: unknown) {
    state.scan = scan;
    const reply = replyFor();
    await (await handler('POST /api/scans/:id/checkin'))(request({ body, params: { id: SCAN_ID } }), reply);
    return reply;
  }

  it('lets the owner store a check-in', async () => {
    const reply = await checkin(
      { concept_id: 'hanging_piece', answer: 'forgot' },
      { id: SCAN_ID, user_id: 'user-1', ip: '198.51.100.1', created_at: new Date().toISOString() },
    );
    expect(reply.statusCode).toBe(200);
    const body = reply.body as { checkin: { concept_id: string; answer: string; at: string } };
    expect(body.checkin.concept_id).toBe('hanging_piece');
    expect(body.checkin.answer).toBe('forgot');
    expect(Number.isNaN(Date.parse(body.checkin.at))).toBe(false);
    expect(state.lastUpdate).toMatchObject({ checkin: body.checkin });
  });

  it('rejects a different signed-in user', async () => {
    const reply = await checkin(
      { concept_id: 'hanging_piece', answer: 'remembered' },
      { id: SCAN_ID, user_id: 'user-2', ip: '203.0.113.9', created_at: new Date().toISOString() },
    );
    expect(reply.statusCode).toBe(403);
    expect(state.lastUpdate).toBeNull();
  });

  it('lets the anonymous submitter check in from the same address for a day', async () => {
    state.signedIn = false;
    const fresh = await checkin(
      { concept_id: 'double_attack', answer: 'did_not_come_up' },
      { id: SCAN_ID, user_id: null, ip: '203.0.113.9', created_at: new Date().toISOString() },
    );
    expect(fresh.statusCode).toBe(200);

    state.lastUpdate = null;
    const other = await checkin(
      { concept_id: 'double_attack', answer: 'did_not_come_up' },
      { id: SCAN_ID, user_id: null, ip: '198.51.100.8', created_at: new Date().toISOString() },
    );
    expect(other.statusCode).toBe(403);
  });

  it('rejects a bad check-in body', async () => {
    const reply = await checkin({ concept_id: 'hanging_piece', answer: 'maybe' }, { id: SCAN_ID, user_id: 'user-1' });
    expect(reply.statusCode).toBe(400);
  });

  it('decorates report moments with concept info', async () => {
    state.report = { id: 'r', moments: [{ ply: 1, concept_id: 'hanging_piece' }, { ply: 2, concept_id: 'not_a_concept' }, { ply: 3 }] };
    const reply = replyFor();
    await (await handler('GET /api/reports/:id'))(request({ params: { id: 'r' } }), reply);
    const moments = (reply.body as { moments: Array<{ concept: { id: string } | null }> }).moments;
    expect(moments[0].concept?.id).toBe('hanging_piece');
    expect(moments[0].concept).toMatchObject({ name: 'Hanging piece', gremlin: 'The Hanger' });
    expect(moments[1].concept).toBeNull();
    expect(moments[2].concept).toBeNull();
  });

  it('returns a scan without the submitter ip and with the previous top concept', async () => {
    state.scan = {
      id: SCAN_ID, share_id: 's', user_id: 'user-1', ip: '203.0.113.9', status: 'completed',
      chesscom_username: 'me', progress: { done: 10, total: 10 }, games: [], result: null,
      example_report_id: null, checkin: null, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    };
    state.priors = [{
      id: '22222222-2222-4222-8222-222222222222',
      result: { games_scanned: 10, top: { concept: { id: 'weak_back_rank' }, games_with_concept: 3 }, nothing_decisive: false, concept_counts: [], example: null },
      completed_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
    }];
    const reply = replyFor();
    await (await handler('GET /api/scans/:id'))(request({ params: { id: SCAN_ID } }), reply);
    expect(reply.statusCode).toBe(200);
    const body = reply.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('ip');
    expect(body).not.toHaveProperty('user_id');
    expect(body.previous).toMatchObject({
      scan_id: '22222222-2222-4222-8222-222222222222',
      concept: { id: 'weak_back_rank', gremlin: 'The Back-Rank Sleeper' },
      scanned_at: '2026-01-01T00:00:00.000Z',
      games_with_concept: 3,
      games_scanned: 10,
    });
  });

  it('returns null counts when an earlier scan result omits them', async () => {
    state.scan = {
      id: SCAN_ID, share_id: 's', user_id: 'user-1', ip: '203.0.113.9', status: 'completed',
      chesscom_username: 'me', progress: { done: 10, total: 10 }, games: [], result: null,
      example_report_id: null, checkin: null, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    };
    state.priors = [{
      id: '22222222-2222-4222-8222-222222222222',
      result: { top: { concept: { id: 'weak_back_rank' } }, nothing_decisive: false, concept_counts: [], example: null },
      completed_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
    }];
    const reply = replyFor();
    await (await handler('GET /api/scans/:id'))(request({ params: { id: SCAN_ID } }), reply);
    expect(reply.body).toMatchObject({
      previous: { games_with_concept: null, games_scanned: null },
    });
  });
});
