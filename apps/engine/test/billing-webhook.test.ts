import { beforeEach, describe, expect, it, vi } from 'vitest';
// Importing the server module triggers bootstrap(), which registers the route
// handlers on the mocked Fastify instance captured below.
import '../src/http/server.js';

const state = vi.hoisted(() => ({
  event: undefined as unknown,
  profileUpdates: [] as Array<Record<string, unknown>>,
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
  config: {
    port: 0,
    nodeEnv: 'production',
    trustProxy: false,
    webOrigin: 'https://getchessplain.com',
    stripeSecretKey: 'sk_test_not_real',
    stripeWebhookSecret: 'whsec_not_real',
  },
}));

// Signature checking is Stripe's code; the event under test is whatever the
// scenario sets. Only real subscription ids can be retrieved, as in Stripe.
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: () => state.event };
    subscriptions = {
      retrieve: async (id: string) => {
        if (!id.startsWith('sub_')) throw new Error(`No such subscription: '${id}'`);
        return { id, status: 'active' };
      },
    };
  },
}));

vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['update', 'eq', 'select']) {
        builder[method] = (...args: unknown[]) => {
          if (method === 'update' && table === 'profiles') state.profileUpdates.push(args[0] as Record<string, unknown>);
          return builder;
        };
      }
      builder.then = (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: 'user-1' }], error: null }).then(onFulfilled);
      return builder;
    },
  },
}));

vi.mock('../src/uci/engine-pool.js', () => ({
  enginePool: { init: vi.fn(async () => {}), shutdown: vi.fn(async () => {}), totalCount: 1, availableCount: 1 },
}));
vi.mock('../src/queue/worker.js', () => ({
  startWorker: vi.fn(async () => {}),
  stopWorker: vi.fn(),
}));

async function webhookHandler(): Promise<(request: unknown, reply: unknown) => Promise<unknown>> {
  for (let i = 0; i < 1000 && !routes.handlers['POST /api/billing/webhook']; i++) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  }
  const handler = routes.handlers['POST /api/billing/webhook'];
  if (typeof handler !== 'function') throw new Error('/api/billing/webhook was never registered');
  return handler as (request: unknown, reply: unknown) => Promise<unknown>;
}

function fakeReply() {
  const reply = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { reply.statusCode = code; return reply; },
    send(payload: unknown) { reply.body = payload; return reply; },
  };
  return reply;
}

describe('Stripe billing webhook', () => {
  beforeEach(() => { state.profileUpdates.length = 0; });

  it('acknowledges a completed checkout and upgrades the buyer exactly once', async () => {
    state.event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', client_reference_id: 'user-1', customer: 'cus_1', subscription: 'sub_1', metadata: {} } },
    };
    const reply = fakeReply();

    await (await webhookHandler())({ headers: { 'stripe-signature': 't=1,v1=sig' }, rawBody: Buffer.from('{}') }, reply);

    // A non-2xx here makes Stripe retry for days and eventually disable the endpoint.
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ received: true });
    expect(state.profileUpdates).toEqual([
      { subscription_tier: 'premium', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' },
    ]);
  });
});
