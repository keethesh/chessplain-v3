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
import { ChessComInputError, fetchRecentChessComGame, listRecentChessComGames, type ChessComGameResult } from '../analysis/chesscom.js';

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

const fastify = Fastify({
  trustProxy: config.trustProxy,
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

// Managed Payments (Stripe as merchant of record, handling VAT/GST/sales tax)
// needs API version 2025-03-31.basil or later.
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey, {
  apiVersion: '2026-08-26.dahlia',
}) : null;

const quotaLocks = new Map<string, Promise<void>>();
const streamsByIp = new Map<string, number>();
let activeStreams = 0;

// ponytail: this single-process lock closes the check-then-insert race; move
// the critical section to a Postgres function with pg_advisory_xact_lock when
// the API runs more than one process.
async function withQuotaLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = quotaLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  quotaLocks.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (quotaLocks.get(key) === tail) quotaLocks.delete(key);
  }
}

async function bootstrap() {
  // 1. Plugins
  await fastify.register(cors, {
    // Bearer auth is used; no cookies are sent cross-origin.
    origin: [
      config.webOrigin,
      'https://www.getchessplain.com',
      ...(config.nodeEnv === 'production' ? [] : [
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
      ]),
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
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

  fastify.get('/api/chesscom/:username/games', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { username } = request.params as { username: string };
    if (!/^[a-zA-Z0-9_-]{3,25}$/.test(username)) {
      return reply.status(400).send({ error: 'invalid_input', message: 'Enter a valid Chess.com username.' });
    }
    try {
      return reply.send({ games: await listRecentChessComGames(username) });
    } catch (err) {
      if (err instanceof ChessComInputError) return reply.status(400).send({ error: 'chesscom_input', message: err.message });
      fastify.log.warn(err, 'Chess.com game list failed');
      return reply.status(502).send({ error: 'chesscom_unavailable', message: 'Chess.com did not respond. Try again in a moment, or paste the game’s PGN.' });
    }
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
        chesscom_game_url?: string;
        hero_variant?: string;
        player_color?: 'white' | 'black';
      };

      if ((body.pgn !== undefined && (typeof body.pgn !== 'string' || body.pgn.length > 100_000)) ||
          (body.chesscom_username !== undefined && (typeof body.chesscom_username !== 'string' || !/^[a-zA-Z0-9_-]{3,25}$/.test(body.chesscom_username))) ||
          (body.player_color !== undefined && !['white', 'black'].includes(body.player_color)) ||
          (body.hero_variant !== undefined && (typeof body.hero_variant !== 'string' || !/^[a-z0-9_]{1,32}$/.test(body.hero_variant))) ||
          (body.chesscom_game_url !== undefined && (typeof body.chesscom_game_url !== 'string' || body.chesscom_game_url.length > 200))) {
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

      // Resolve the username now, not in the worker: a typo must show on the form
      // immediately rather than after three background retries.
      let chesscomGame: ChessComGameResult | null = null;
      if (body.chesscom_username) {
        try {
          chesscomGame = await fetchRecentChessComGame(body.chesscom_username, body.chesscom_game_url);
        } catch (err) {
          if (err instanceof ChessComInputError) return reply.status(400).send({ error: 'chesscom_input', message: err.message });
          fastify.log.warn(err, 'Chess.com fetch failed');
          return reply.status(502).send({ error: 'chesscom_unavailable', message: 'Chess.com did not respond. Try again in a moment, or paste the game’s PGN.' });
        }
      }

      // Production carries legacy UNIQUE constraints on source_games
      // (user_id, source, external_id) and game_analyses (source_game_id): one
      // report per game per user. A signed-in user resubmitting the same
      // Chess.com game gets that report back without spending quota.
      const externalId = chesscomGame?.gameUrl ?? null;
      let sourceGameId: string | undefined;
      let failedAnalysisId: string | undefined;

      // Free/anon users get 2 reports in 7 days. Signed-in users are counted by
      // user_id: an IP key punishes everyone behind shared NAT for a stranger's
      // usage, and resets when they change network. Anonymous users have no
      // identifier but the IP.
      // ponytail: exemption is env-gated, not IP-matched — the old 127.0.0.1 check
      // was spoofable via X-Forwarded-For with trustProxy enabled. If NAT collisions
      // bite on the anonymous path, use the plan's fallback (email OTP before report 2).
      const quotaEnforced = config.nodeEnv === 'production' && !config.disableQuota;
      const quotaKey = userId ? { column: 'user_id', value: userId } : (clientIp ? { column: 'ip', value: clientIp } : null);

      const createReport = async () => {
        if (userId && externalId) {
          const { data: existing } = await supabase.from('source_games').select('id, game_analyses(id, share_id, status)')
            .eq('user_id', userId).eq('source', 'chesscom').eq('external_id', externalId).maybeSingle();
          sourceGameId = existing?.id;
          // PostgREST embeds a one-to-one relation as an object, one-to-many as an array.
          const prior = [existing?.game_analyses].flat()[0] as { id: string; share_id: string; status: string } | null | undefined;
          if (prior && prior.status !== 'failed') {
            return reply.status(200).send({ id: prior.id, share_id: prior.share_id, status: prior.status });
          }
          failedAnalysisId = prior?.id;
        }

        if (!isPremium && quotaKey && quotaEnforced) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { count, error: countErr } = await supabase
            .from('game_analyses')
            .select('id', { count: 'exact', head: true })
            .eq(quotaKey.column, quotaKey.value)
            .neq('status', 'failed') // abandoned/failed runs don't consume quota
            .or('status.neq.completed,moments.neq.[]') // nor do reports with nothing to review
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

        if (failedAnalysisId) {
          // Re-queue the failed report in place; created_at resets so quota counts it this week.
          const { data: requeued, error: requeueErr } = await supabase.from('game_analyses').update({
            status: 'pending', attempts: 0, next_attempt_at: null, locked_at: null,
            error_message: null, created_at: new Date().toISOString(),
          }).eq('id', failedAnalysisId).select('id, share_id, status').single();
          if (requeueErr || !requeued) {
            fastify.log.error(requeueErr, 'Failed to re-queue game_analyses');
            return reply.status(500).send({ error: 'Database error re-queuing game analysis' });
          }
          return reply.status(201).send({ id: requeued.id, share_id: requeued.share_id, status: requeued.status });
        }

        if (!sourceGameId) {
          const { data: sourceGame, error: sourceErr } = await supabase.from('source_games').insert({
            user_id: userId,
            ip: clientIp,
            pgn: body.pgn ?? chesscomGame?.pgn,
            source: body.chesscom_username ? 'chesscom' : 'pgn',
            external_id: externalId,
            metadata: body.chesscom_username ? { chesscom_username: body.chesscom_username } : { player_color: body.player_color || 'white' },
          }).select('id').single();
          // A concurrent submit of the same game by the same user can win the
          // production-only UNIQUE (user_id, source, external_id); reuse its row.
          if (sourceErr?.code === '23505' && userId && externalId) {
            const { data: existing } = await supabase.from('source_games').select('id')
              .eq('user_id', userId).eq('source', 'chesscom').eq('external_id', externalId).maybeSingle();
            sourceGameId = existing?.id;
          } else {
            sourceGameId = sourceGame?.id;
          }
          if (!sourceGameId) {
            fastify.log.error(sourceErr, 'Failed to insert source_games');
            return reply.status(500).send({ error: 'Database error creating source game' });
          }
        }

        const { data: analysis, error: analysisErr } = await supabase.from('game_analyses').insert({
          user_id: userId,
          source_game_id: sourceGameId,
          ip: clientIp,
          share_id: nanoid(8),
          hero_variant: body.hero_variant,
          elo_band: chesscomGame?.eloBand,
          status: 'pending',
        }).select('id, share_id, status').single();
        if (analysisErr || !analysis) {
          // Same race on the production-only UNIQUE (source_game_id): return the winner's report.
          if (analysisErr?.code === '23505') {
            const { data: existing } = await supabase.from('game_analyses')
              .select('id, share_id, status').eq('source_game_id', sourceGameId).maybeSingle();
            if (existing) return reply.status(200).send(existing);
          }
          fastify.log.error(analysisErr, 'Failed to insert game_analyses');
          return reply.status(500).send({ error: 'Database error creating game analysis' });
        }
        return reply.status(201).send({ id: analysis.id, share_id: analysis.share_id, status: analysis.status });
      };

      // Count-then-insert must not interleave for one quota key, or parallel
      // submits all pass the count and get ~30 reports instead of 2.
      return !isPremium && quotaKey && quotaEnforced
        ? withQuotaLock(`${quotaKey.column}:${quotaKey.value}`, createReport)
        : createReport();
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
      .select('status, share_id, hero_variant, elo_band, moments, summary, created_at, completed_at, source_games(pgn, player_color, white_player, black_player)')
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
    const streamsForIp = streamsByIp.get(request.ip) ?? 0;
    if (streamsForIp >= 4 || activeStreams >= 100) {
      return reply.status(429).send({ error: 'stream_limit', message: 'Too many open report streams. Close another review tab; polling will continue.' });
    }
    streamsByIp.set(request.ip, streamsForIp + 1);
    activeStreams++;
    const lifetime = setTimeout(() => { reply.raw.end(); }, 10 * 60_000);
    lifetime.unref();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
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
      clearInterval(interval);
      clearTimeout(lifetime);
      const remaining = (streamsByIp.get(request.ip) ?? 1) - 1;
      if (remaining > 0) streamsByIp.set(request.ip, remaining);
      else streamsByIp.delete(request.ip);
      activeStreams--;
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
      .eq('ip', request.ip)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
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
        // Stripe (sold through Onelink) is merchant of record and remits tax.
        // It also picks payment methods, so payment_method_types is not allowed.
        managed_payments: { enabled: true },
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
      fastify.log.error(err, 'Failed to create Stripe Checkout session');
      return reply.status(500).send({ error: 'Checkout could not be opened. Please try again shortly.' });
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
          // Retry so a transient missing profile/trigger does not permanently
          // lose the upgrade after Stripe has taken payment.
          fastify.log.error(
            { userId, sessionId: session.id },
            'Stripe checkout completed but no profiles row matched'
          );
          return reply.status(500).send({ error: 'Webhook could not update the account' });
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
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`[HTTP] Server listening on ${config.host}:${config.port}`);

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
