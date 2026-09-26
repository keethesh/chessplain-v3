import Fastify, { FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Stripe from 'stripe';
import { nanoid } from 'nanoid';
import { Chess } from 'chess.js';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';
import { enginePool } from '../uci/engine-pool.js';
import { startWorker, stopWorker } from '../queue/worker.js';

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

const fastify = Fastify({
  trustProxy: config.trustProxy,
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey, {
  apiVersion: '2025-02-24.acacia',
}) : null;

async function bootstrap() {
  // 1. Plugins
  await fastify.register(cors, {
    // Allowlist: prod web origin (apex + www) + vercel previews + local dev
    origin: [
      config.webOrigin,
      'https://www.getchessplain.com',
      /\.vercel\.app$/,
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Raw body is retained for Stripe webhook signature verification. Replacing
  // Fastify's built-in JSON parser also replaces its error handling, which
  // tags parse failures as 400 — without that a malformed body becomes a 500
  // and looks like the server broke.
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as RawBodyRequest).rawBody = body as Buffer;
      const json = JSON.parse(body.toString());
      done(null, json);
    } catch {
      const err = new Error('Request body is not valid JSON.') as Error & { statusCode?: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // 2. Health check
  fastify.get('/healthz', async (_request, reply) => {
    const healthy = enginePool.totalCount > 0;
    reply.status(healthy ? 200 : 503);
    return {
      status: healthy ? 'ok' : 'unavailable',
      engines: enginePool.totalCount,
      available: enginePool.availableCount,
    };
  });

  // 3. POST /api/reports (Submit game for analysis)
  fastify.post(
    '/api/reports',
    {
      config: {
        rateLimit: {
          // Per-IP. Deliberately well above the free quota (2 per 7 days),
          // because mobile traffic arrives through carrier-grade NAT where
          // hundreds of real users share one address. Quota — not this — is
          // what bounds analysis cost; this only stops hammering.
          max: 30,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      if (!request.body || typeof request.body !== 'object') {
        return reply.status(400).send({ error: 'invalid_input', message: 'Paste a PGN or enter a Chess.com username.' });
      }
      const body = request.body as {
        pgn?: string;
        chesscom_username?: string;
        hero_variant?: string;
        player_color?: 'white' | 'black';
      };

      if ((body.pgn !== undefined && (typeof body.pgn !== 'string' || body.pgn.length > 100_000)) ||
          (body.chesscom_username !== undefined && (typeof body.chesscom_username !== 'string' || !/^[a-zA-Z0-9_-]{3,25}$/.test(body.chesscom_username))) ||
          (body.player_color !== undefined && !['white', 'black'].includes(body.player_color))) {
        return reply.status(400).send({ error: 'invalid_input', message: 'Enter a valid Chess.com username or a PGN under 100 KB, and choose your side.' });
      }

      if (body.pgn && body.chesscom_username) {
        return reply.status(400).send({ error: 'invalid_input', message: 'Submit either a PGN or a Chess.com username, one at a time.' });
      }

      if (!body.pgn && !body.chesscom_username) {
        return reply.status(400).send({ error: 'Must provide either pgn or chesscom_username' });
      }

      if (body.pgn) {
        // Variants carry a shuffled start position and non-standard castling
        // rights (Chess960 uses Shredder-FEN, e.g. "GAga"), which standard
        // chess rules reject with an opaque "castling availability is invalid".
        // Say what is actually wrong instead.
        const variant = body.pgn.match(/^\[Variant\s+"([^"]+)"/m)?.[1];
        if (variant && !/^(standard|chess)$/i.test(variant.trim())) {
          return reply.status(400).send({
            error: 'unsupported_variant',
            message: `Chessplain reviews standard chess games. This game is ${variant}, which is not supported yet.`,
          });
        }

        try {
          const parsed = new Chess();
          parsed.loadPgn(body.pgn);
          if (parsed.history().length === 0) {
            throw new Error('PGN contains no moves');
          }
          if (parsed.history().length > 1000) throw new Error('This game exceeds the 1,000 half-move analysis limit.');
        } catch (err) {
          return reply.status(400).send({
            error: 'invalid_pgn',
            message: err instanceof Error ? err.message : 'Could not parse PGN',
          });
        }
      }

      const clientIp = request.ip;

      // Extract auth token if provided
      const authHeader = request.headers.authorization;
      let userId: string | null = null;
      let isPremium = false;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: userData } = await supabase.auth.getUser(token);
        if (!userData?.user) return reply.status(401).send({ error: 'Please sign in again before submitting this game.' });
        if (userData?.user) {
          userId = userData.user.id;
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', userId)
            .single();
          if (profile?.subscription_tier === 'premium') {
            isPremium = true;
          }
        }
      }

      // Check quota for free/anon users (2 reports in 7 days).
      // Signed-in users are counted by user_id: an IP key punishes everyone
      // behind shared NAT for a stranger's usage, and resets when they change
      // network. Anonymous users have no identifier but the IP.
      // ponytail: exemption is env-gated, not IP-matched — the old 127.0.0.1 check
      // was spoofable via X-Forwarded-For with trustProxy enabled. If NAT collisions
      // bite on the anonymous path, use the plan's fallback (email OTP before report 2).
      const quotaEnforced = config.nodeEnv === 'production' && !config.disableQuota;
      const quotaKey = userId ? { column: 'user_id', value: userId } : (clientIp ? { column: 'ip', value: clientIp } : null);
      if (!isPremium && quotaKey && quotaEnforced) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count, error: countErr } = await supabase
          .from('game_analyses')
          .select('id', { count: 'exact', head: true })
          .eq(quotaKey.column, quotaKey.value)
          .neq('status', 'failed') // abandoned/failed runs don't consume quota
          .gte('created_at', sevenDaysAgo);

        if (countErr) return reply.status(503).send({ error: 'quota_unavailable', message: 'We could not check your report allowance. Please try again shortly.' });
        if (typeof count === 'number' && count >= 2) {
          // Anonymous users are counted by IP, and mobile traffic shares
          // carrier-grade NAT addresses — so a first-time visitor can land here
          // having never run a report. Signing in moves them onto a per-account
          // allowance, so lead with that rather than only offering to charge them.
          return reply.status(402).send({
            error: 'quota_exceeded',
            can_sign_in: !userId,
            message: userId
              ? 'You have used your 2 free reports for this week. Premium removes the limit.'
              : 'That is 2 free reports from your network this week. Sign in to get your own free reports, or go Premium for no limit.',
          });
        }
      }
      const shareId = nanoid(8);

      // Insert source_games
      const { data: sourceGame, error: sourceErr } = await supabase
        .from('source_games')
        .insert({
          user_id: userId,
          ip: clientIp,
          pgn: body.pgn,
          source: body.chesscom_username ? 'chesscom' : 'pgn',
          external_id: body.chesscom_username || null,
          metadata: body.chesscom_username ? { chesscom_username: body.chesscom_username } : { player_color: body.player_color || 'white' },
        })
        .select('id')
        .single();

      if (sourceErr || !sourceGame) {
        fastify.log.error(sourceErr, 'Failed to insert source_games');
        return reply.status(500).send({ error: 'Database error creating source game' });
      }

      // Insert game_analyses
      const { data: analysis, error: analysisErr } = await supabase
        .from('game_analyses')
        .insert({
          user_id: userId,
          source_game_id: sourceGame.id,
          ip: clientIp,
          share_id: shareId,
          hero_variant: body.hero_variant,
          status: 'pending',
        })
        .select('id, share_id, status')
        .single();

      if (analysisErr || !analysis) {
        fastify.log.error(analysisErr, 'Failed to insert game_analyses');
        return reply.status(500).send({ error: 'Database error creating game analysis' });
      }

      return reply.status(201).send({
        id: analysis.id,
        share_id: analysis.share_id,
        status: analysis.status,
      });
    }
  );

  // 4. GET /api/reports/:id (Get Report by ID)
  fastify.get('/api/reports/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: analysis, error } = await supabase
      .from('game_analyses')
      // Explicit column list: never expose submitter ip/user_id on public report endpoints
      .select('id, source_game_id, status, share_id, hero_variant, elo_band, moments, summary, created_at, completed_at, source_games(id, pgn, player_color, white_player, black_player)')
      .eq('id', id)
      .single();

    if (error || !analysis) {
      return reply.status(404).send({ error: 'Report not found' });
    }

    return reply.send(analysis);
  });

  // 5. GET /api/reports/share/:shareId (Get Report by Public Share ID)
  fastify.get('/api/reports/share/:shareId', async (request, reply) => {
    const { shareId } = request.params as { shareId: string };

    const { data: analysis, error } = await supabase
      .from('game_analyses')
      // Explicit column list: never expose submitter ip/user_id on public report endpoints
      .select('id, source_game_id, status, share_id, hero_variant, elo_band, moments, summary, created_at, completed_at, source_games(id, pgn, player_color, white_player, black_player)')
      .eq('share_id', shareId)
      .single();

    if (error || !analysis) {
      return reply.status(404).send({ error: 'Report not found' });
    }

    return reply.send(analysis);
  });

  // 6. GET /api/reports/:id/events (SSE Stream)
  fastify.get('/api/reports/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.flushHeaders?.();

    let lastStatus = '';
    const sentPlies = new Set<number>();
    let isFinished = false;

    let lastPing = Date.now();
    let polling = false;
    const interval = setInterval(async () => {
      if (polling || reply.raw.destroyed) return;
      polling = true;
      try {
        if (Date.now() - lastPing > 15000) {
          // Progress event (not an SSE comment): re-arms the client’s 60s stall
          // watchdog during long silent stages and keeps proxies from idling
          reply.raw.write('data: {"type":"ping"}\n\n');
          lastPing = Date.now();
        }
        const { data: analysis, error } = await supabase
          .from('game_analyses')
          .select('id, status, moments, summary, completed_at')
          .eq('id', id)
          .single();

        if (error || !analysis) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: 'Report not found' })}\n\n`);
          clearInterval(interval);
          reply.raw.end();
          return;
        }

        if (analysis.status !== lastStatus) {
          lastStatus = analysis.status;
          reply.raw.write(`data: ${JSON.stringify({ type: 'stage', status: analysis.status })}\n\n`);
        }

        const moments = Array.isArray(analysis.moments) ? analysis.moments : [];
        for (const moment of moments) {
          if (sentPlies.has(moment.ply)) continue;
          reply.raw.write(`data: ${JSON.stringify({ type: 'moment', moment, count: moments.length })}\n\n`);
          sentPlies.add(moment.ply);
        }

        if (analysis.status === 'completed') {
          reply.raw.write(`data: ${JSON.stringify({ type: 'done', report: analysis })}\n\n`);
          isFinished = true;
          clearInterval(interval);
          reply.raw.end();
        } else if (analysis.status === 'failed') {
          reply.raw.write(`data: ${JSON.stringify({ type: 'failed', error: 'Analysis processing failed' })}\n\n`);
          isFinished = true;
          clearInterval(interval);
          reply.raw.end();
        }
      } catch (err) {
        console.error('[SSE] Polling error:', err);
      } finally {
        polling = false;
      }
    }, 500);

    reply.raw.on('close', () => {
      if (!isFinished) {
        clearInterval(interval);
      }
    });
  });

  // 7. POST /api/reports/:id/claim (Claim anonymous report to user profile)
  fastify.post('/api/reports/:id/claim', async (request, reply) => {
    const { id } = request.params as { id: string };
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing bearer token' });
    }

    const token = authHeader.substring(7);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return reply.status(401).send({ error: 'Invalid auth token' });
    }

    const userId = userData.user.id;

    // Update game_analyses and source_games
    const { data: analysis } = await supabase
      .from('game_analyses')
      .select('source_game_id')
      .eq('id', id)
      .single();

    // Only claim anonymous reports; never reassign one that already has an owner
    const { data: claimed } = await supabase
      .from('game_analyses')
      .update({ user_id: userId })
      .eq('id', id)
      .is('user_id', null)
      .select('id');

    if (!claimed || claimed.length === 0) {
      return reply.status(409).send({ error: 'report_already_claimed' });
    }

    if (analysis?.source_game_id) {
      await supabase.from('source_games').update({ user_id: userId }).eq('id', analysis.source_game_id);
    }

    return reply.send({ success: true, user_id: userId });
  });

  // 8. POST /api/billing/checkout (Stripe Checkout)
  fastify.post('/api/billing/checkout', async (request, reply) => {
    if (!stripe) return reply.status(503).send({ error: 'Billing is not configured yet.' });
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return reply.status(401).send({ error: 'Sign in before subscribing.' });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return reply.status(401).send({ error: 'Please sign in again.' });
    const body = (request.body || {}) as {
      interval?: 'month' | 'year';
      user_id?: string;
      customer_email?: string;
      return_url?: string;
    };

    if (!['month', 'year'].includes(body.interval || '')) return reply.status(400).send({ error: 'Choose monthly or yearly billing.' });
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('stripe_customer_id, stripe_subscription_id').eq('id', auth.user.id).single();
    if (profileError || !profile) return reply.status(503).send({ error: 'Your account is not ready for billing. Please try again shortly.' });
    if (profile.stripe_customer_id) {
      const subscriptions = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 100 });
      if (subscriptions.data.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) {
        return reply.status(409).send({ error: 'You already have a subscription or pending payment. Use Manage subscription below.' });
      }
    }

    const priceId = body.interval === 'year' ? config.stripePriceYearly : config.stripePriceMonthly;
    const origin = config.webOrigin.replace(/\/$/, '');

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        allow_promotion_codes: true,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        ...(profile.stripe_customer_id ? { customer: profile.stripe_customer_id } : { customer_email: auth.user.email }),
        client_reference_id: auth.user.id,
        metadata: {
          user_id: auth.user.id,
        },
        subscription_data: { metadata: { user_id: auth.user.id } },
        success_url: `${origin}/pricing?checkout=success`,
        cancel_url: `${origin}/pricing?checkout=cancelled`,
      }, { idempotencyKey: 'checkout:' + auth.user.id + ':' + priceId + ':' + Math.floor(Date.now() / 1800000) });

      return reply.send({ url: session.url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stripe error';
      fastify.log.error(err, 'Failed to create Stripe Checkout session');
      return reply.status(500).send({ error: msg });
    }
  });

  fastify.post('/api/billing/portal', async (request, reply) => {
    if (!stripe) return reply.status(503).send({ error: 'Billing is not configured yet.' });
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return reply.status(401).send({ error: 'Sign in to manage your subscription.' });
    const { data: auth, error } = await supabase.auth.getUser(token);
    if (error || !auth.user) return reply.status(401).send({ error: 'Please sign in again.' });
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('stripe_customer_id').eq('id', auth.user.id).single();
    if (profileError) return reply.status(503).send({ error: 'Could not load billing details. Try again shortly.' });
    if (!profile?.stripe_customer_id) return reply.status(404).send({ error: 'No subscription found for this account.' });
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${config.webOrigin.replace(/\/$/, '')}/pricing`,
    });
    return reply.send({ url: session.url });
  });

  // 9. POST /api/billing/webhook (Stripe Webhook)
  fastify.post('/api/billing/webhook', async (request, reply) => {
    if (!stripe || !config.stripeWebhookSecret) return reply.status(503).send({ error: 'Billing is not configured yet.' });
    const sig = request.headers['stripe-signature'];
    const rawBody = (request as RawBodyRequest).rawBody;

    if (!sig || !rawBody) {
      return reply.status(400).send({ error: 'Missing stripe signature or raw body' });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, config.stripeWebhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error(err, 'Stripe webhook signature verification failed');
      return reply.status(400).send({ error: `Webhook Error: ${msg}` });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.user_id;
        if (!userId) {
          // Money taken, nobody to credit. Checkout sets client_reference_id
          // and two metadata copies, so this means the session came from
          // somewhere else (a payment link, the dashboard) and needs manual
          // reconciliation. Never fail silently here.
          fastify.log.error(
            { sessionId: session.id, customer: session.customer },
            'Stripe checkout completed with no user id — subscription NOT granted, reconcile manually'
          );
          break;
        }
        const subscription = typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(session.subscription) : null;
        const premium = subscription?.status === 'active' || subscription?.status === 'trialing';
        const { data: updated, error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: premium ? 'premium' : 'free',
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId)
          .select('id');
        if (error) throw error;
        if (!updated || updated.length === 0) {
          // No profiles row for this user: the signup trigger is missing (see
          // migration 20260831000008). The customer has paid and has no access.
          fastify.log.error(
            { userId, sessionId: session.id },
            'Stripe checkout completed but no profiles row matched — customer paid without being upgraded'
          );
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        // Stripe events can arrive out of order; apply current subscription state.
        const current = await stripe.subscriptions.retrieve(sub.id);
        const tier = current.status === 'active' || current.status === 'trialing' ? 'premium' : 'free';

        const { data: updated, error } = await supabase
          .from('profiles')
          .update({ subscription_tier: tier })
          .eq('stripe_subscription_id', sub.id)
          .select('id');
        if (error) throw error;
        if (!updated || updated.length === 0) {
          fastify.log.error(
            { subscriptionId: sub.id, customer: sub.customer, tier },
            'Subscription updated but no profiles row carries this stripe_subscription_id'
          );
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { data: updated, error } = await supabase
          .from('profiles')
          .update({ subscription_tier: 'free' })
          .eq('stripe_subscription_id', sub.id)
          .select('id');
        if (error) throw error;
        if (!updated || updated.length === 0) {
          fastify.log.error(
            { subscriptionId: sub.id, customer: sub.customer },
            'Subscription cancelled but no profiles row matched — a cancelled customer may retain premium'
          );
        }
        break;
      }
    }

    return reply.send({ received: true });
  });

  // 10. Start HTTP server and background worker
  try {
    await enginePool.init();
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`[HTTP] Server listening on http://0.0.0.0:${config.port}`);

    // Start background queue worker in the same process.
    //
    // WORKER_ENABLED=false runs an HTTP-only instance. This matters because
    // there is no separate staging database: an engine started on a laptop
    // polls the same queue as the deployed one and will race it for real
    // users' jobs, producing reports from whichever code version won. Set it
    // to false for local API work.
    if (config.workerEnabled) {
      startWorker().catch((err) => {
        console.error('[Worker] Fatal worker error:', err);
        process.exit(1);
      });
    } else {
      console.warn('[Worker] Disabled via WORKER_ENABLED=false — this instance serves HTTP only and will not analyse queued games.');
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    stopWorker();
    // Stop accepting requests; the next single-worker boot requeues interrupted jobs.
    void fastify.close();
    void enginePool.shutdown().finally(() => process.exit(0));
  });
}

bootstrap();
