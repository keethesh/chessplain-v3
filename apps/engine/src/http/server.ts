import Fastify, { FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Stripe from 'stripe';
import { nanoid } from 'nanoid';
import { Chess } from 'chess.js';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';
import { enginePool } from '../uci/engine-pool.js';
import { startWorker } from '../queue/worker.js';

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

const fastify = Fastify({
  trustProxy: true,
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

const stripe = new Stripe(config.stripeSecretKey, {
  apiVersion: '2025-02-24.acacia',
});

async function bootstrap() {
  // 1. Plugins
  await fastify.register(cors, {
    // Allowlist: prod web origin + vercel preview deployments
    origin: [config.webOrigin, /\.vercel\.app$/],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Stripe webhook raw body parser
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as RawBodyRequest).rawBody = body as Buffer;
      const json = JSON.parse(body.toString());
      done(null, json);
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)), undefined);
    }
  });

  // 2. Health check
  fastify.get('/healthz', async () => {
    return {
      status: 'ok',
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
          max: 10,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        pgn?: string;
        chesscom_username?: string;
        hero_variant?: string;
      };

      if (!body.pgn && !body.chesscom_username) {
        return reply.status(400).send({ error: 'Must provide either pgn or chesscom_username' });
      }

      if (body.pgn) {
        try {
          const parsed = new Chess();
          parsed.loadPgn(body.pgn);
          if (parsed.history().length === 0) {
            throw new Error('PGN contains no moves');
          }
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

      // Check quota for free/anon users (2 reports in 7 days per IP)
      // ponytail: exemption is env-gated, not IP-matched — the old 127.0.0.1 check
      // was spoofable via X-Forwarded-For with trustProxy enabled. If NAT collisions
      // bite, use the plan's fallback (email OTP before report 2).
      const quotaEnforced = config.nodeEnv === 'production';
      if (!isPremium && clientIp && quotaEnforced) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count, error: countErr } = await supabase
          .from('game_analyses')
          .select('id', { count: 'exact', head: true })
          .eq('ip', clientIp)
          .neq('status', 'failed') // abandoned/failed runs don't consume quota
          .gte('created_at', sevenDaysAgo);

        if (!countErr && typeof count === 'number' && count >= 2) {
          return reply.status(402).send({
            error: 'quota_exceeded',
            message: 'Free quota reached (2 free reports per 7 days). Upgrade to Premium for unlimited reports.',
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
          metadata: body.chesscom_username ? { chesscom_username: body.chesscom_username } : {},
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
    let sentMomentsCount = 0;
    let isFinished = false;

    let lastPing = Date.now();
    const interval = setInterval(async () => {
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
        if (moments.length > sentMomentsCount) {
          for (let i = sentMomentsCount; i < moments.length; i++) {
            reply.raw.write(`data: ${JSON.stringify({ type: 'moment', moment: moments[i], count: moments.length })}\n\n`);
          }
          sentMomentsCount = moments.length;
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
      }
    }, 500);

    request.raw.on('close', () => {
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
    const body = request.body as {
      interval?: 'month' | 'year';
      user_id?: string;
      customer_email?: string;
      return_url?: string;
    };

    const priceId = body.interval === 'year' ? config.stripePriceYearly : config.stripePriceMonthly;
    const origin = body.return_url || config.webOrigin;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        customer_email: body.customer_email,
        client_reference_id: body.user_id,
        metadata: {
          user_id: body.user_id || '',
        },
        success_url: `${origin}/pricing?session_id={CHECKOUT_SESSION_ID}&status=success`,
        cancel_url: `${origin}/pricing?status=cancelled`,
      });

      return reply.send({ url: session.url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stripe error';
      fastify.log.error(err, 'Failed to create Stripe Checkout session');
      return reply.status(500).send({ error: msg });
    }
  });

  // 9. POST /api/billing/webhook (Stripe Webhook)
  fastify.post('/api/billing/webhook', async (request, reply) => {
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
        if (userId) {
          await supabase
            .from('profiles')
            .update({
              subscription_tier: 'premium',
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
            })
            .eq('id', userId);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const status = sub.status;
        const customerId = sub.customer as string;
        const tier = status === 'active' || status === 'trialing' ? 'premium' : 'free';

        await supabase
          .from('profiles')
          .update({ subscription_tier: tier })
          .eq('stripe_customer_id', customerId);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await supabase
          .from('profiles')
          .update({ subscription_tier: 'free' })
          .eq('stripe_customer_id', customerId);
        break;
      }
    }

    return reply.send({ received: true });
  });

  // 10. Start HTTP server and background worker
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`[HTTP] Server listening on http://0.0.0.0:${config.port}`);

    // Start background queue worker in the same process
    startWorker().catch((err) => {
      console.error('[Worker] Fatal worker error:', err);
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
