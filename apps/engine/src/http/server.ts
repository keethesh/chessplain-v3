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
import { ChessComInputError, fetchRecentChessComGame, fetchScanGames, listRecentChessComGames, type ChessComGameResult } from '../analysis/chesscom.js';
import { CONCEPT_IDS, conceptInfo, type ConceptId } from '../analysis/concepts.js';
import type { Checkin, ScanGame, ScanResult } from '../analysis/scan.js';
import { enqueuePendingReport } from '../db/enqueue-report.js';

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

function isQuotaEnforced(): boolean {
  return config.nodeEnv === 'production' && !config.disableQuota;
}

function quotaIdentity(userId: string | null, ip: string | undefined): { column: 'user_id' | 'ip'; value: string } | null {
  if (userId) return { column: 'user_id', value: userId };
  if (ip) return { column: 'ip', value: ip };
  return null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKIN_ANSWERS = ['remembered', 'forgot', 'did_not_come_up'] as const;

function isConceptId(value: unknown): value is ConceptId {
  return typeof value === 'string' && (CONCEPT_IDS as readonly string[]).includes(value);
}

function withConcept<T extends { moments?: unknown }>(row: T): T {
  if (!Array.isArray(row.moments)) return row;
  return {
    ...row,
    moments: row.moments.map((moment) => {
      const id = moment && typeof moment === 'object' && 'concept_id' in moment
        ? (moment as { concept_id?: unknown }).concept_id
        : null;
      return { ...(moment as object), concept: conceptInfo(isConceptId(id) ? id : null) };
    }),
  };
}

async function bearerUser(request: FastifyRequest): Promise<{ userId: string | null; invalid: boolean; premium: boolean }> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return { userId: null, invalid: false, premium: false };
  const { data } = await supabase.auth.getUser(header.slice(7));
  if (!data?.user) return { userId: null, invalid: true, premium: false };
  const { data: profile } = await supabase.from('profiles').select('subscription_tier').eq('id', data.user.id).maybeSingle();
  return { userId: data.user.id, invalid: false, premium: profile?.subscription_tier === 'premium' };
}

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
          (body.hero_variant !== undefined && (typeof body.hero_variant !== 'string' || body.hero_variant === 'scan' || !/^[a-z0-9_]{1,32}$/.test(body.hero_variant))) ||
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
      let freeRetry = false;

      // Free/anon users get 2 reports in 7 days. Signed-in users are counted by
      // user_id: an IP key punishes everyone behind shared NAT for a stranger's
      // usage, and resets when they change network. Anonymous users have no
      // identifier but the IP.
      // ponytail: exemption is env-gated, not IP-matched — the old 127.0.0.1 check
      // was spoofable via X-Forwarded-For with trustProxy enabled. If NAT collisions
      // bite on the anonymous path, use the plan's fallback (email OTP before report 2).
      const enforced = isQuotaEnforced();
      const quotaKey = quotaIdentity(userId, clientIp);

      const createReport = async () => {
        if (userId && externalId) {
          const { data: existing } = await supabase.from('source_games').select('id, game_analyses(id, share_id, status, created_at)')
            .eq('user_id', userId).eq('source', 'chesscom').eq('external_id', externalId).maybeSingle();
          sourceGameId = existing?.id;
          // PostgREST embeds a one-to-one relation as an object, one-to-many as an array.
          const prior = [existing?.game_analyses].flat()[0] as { id: string; share_id: string; status: string; created_at: string } | null | undefined;
          if (prior && prior.status !== 'failed') {
            return reply.status(200).send({ id: prior.id, share_id: prior.share_id, status: prior.status });
          }
          failedAnalysisId = prior?.id;
          // A failure from this week is retried free: the failure was ours, and failed runs never counted.
          // An older one goes through the normal quota check and gets a fresh date, or keeping its old
          // date would make it a free review that never counts.
          freeRetry = Boolean(prior) && Date.parse(prior!.created_at) >= Date.now() - WEEK_MS;
        }

        if (!freeRetry && !isPremium && quotaKey && enforced) {
          const sevenDaysAgo = new Date(Date.now() - WEEK_MS).toISOString();
          const { count, error: countErr } = await supabase
            .from('game_analyses')
            .select('id', { count: 'exact', head: true })
            .eq(quotaKey.column, quotaKey.value)
            .neq('status', 'failed') // abandoned/failed runs don't consume quota
            .or('status.neq.completed,moments.neq.[]') // nor do reports with nothing to review
            // neq alone drops NULL hero_variant, which is every normal report.
            .or('hero_variant.is.null,hero_variant.neq.scan')
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
          // Re-queue the failed report in place. A free retry keeps its date so it is not
          // counted as a new review; any other retry has just passed the quota check, so it
          // counts from now.
          const { data: requeued, error: requeueErr } = await supabase.from('game_analyses').update({
            status: 'pending', attempts: 0, next_attempt_at: null, locked_at: null,
            error_message: null,
            // A non-free retry is a normal review from now, so a leftover scan hero must not keep it off the quota.
            ...(freeRetry ? {} : { created_at: new Date().toISOString(), hero_variant: null }),
          }).eq('id', failedAnalysisId).select('id, share_id, status').single();
          if (requeueErr || !requeued) {
            fastify.log.error(requeueErr, 'Failed to re-queue game_analyses');
            return reply.status(500).send({ error: 'Database error re-queuing game analysis' });
          }
          return reply.status(201).send({ id: requeued.id, share_id: requeued.share_id, status: requeued.status });
        }

        try {
          const analysis = await enqueuePendingReport({
            userId,
            ip: clientIp,
            pgn: body.pgn ?? chesscomGame?.pgn,
            source: body.chesscom_username ? 'chesscom' : 'pgn',
            externalId,
            metadata: body.chesscom_username ? { chesscom_username: body.chesscom_username } : { player_color: body.player_color || 'white' },
            heroVariant: body.hero_variant,
            eloBand: chesscomGame?.eloBand,
            sourceGameId,
          });
          return reply.status(analysis.reused ? 200 : 201).send({ id: analysis.id, share_id: analysis.share_id, status: analysis.status });
        } catch (err) {
          fastify.log.error(err, 'Failed to insert game analysis');
          return reply.status(500).send({ error: 'Database error creating game analysis' });
        }
      };

      // Count-then-insert must not interleave for one quota key, or parallel
      // submits all pass the count and get ~30 reports instead of 2.
      return !isPremium && quotaKey && enforced
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

    return reply.send(withConcept(analysis));
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

    return reply.send(withConcept(analysis));
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

  // GET /api/me: everything the signed-in home and account pages need in one
  // call. The Chess.com username is the one last used on a submitted game, so
  // no profile column (or migration) is required.
  fastify.get('/api/me', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return reply.status(401).send({ error: 'Sign in to see your account.' });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return reply.status(401).send({ error: 'Please sign in again.' });
    const userId = auth.user.id;

    const weekAgo = Date.now() - WEEK_MS;
    const weekIso = new Date(weekAgo).toISOString();
    const [profileRes, reviewsRes, scansRes, scanOpenRes, scanWeekRes] = await Promise.all([
      supabase.from('profiles').select('subscription_tier').eq('id', userId).maybeSingle(),
      supabase.from('game_analyses')
        .select('id, share_id, status, summary, moments, hero_variant, created_at, source_games(external_id, source, player_color, white_player, black_player, metadata)')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('scans')
        .select('id, status, created_at, completed_at, result, example_report_id, checkin, chesscom_username')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      // ponytail: first top concept among the 20 newest completed scans
      supabase.from('scans')
        .select('id, status, created_at, completed_at, result, example_report_id, checkin, chesscom_username')
        .eq('user_id', userId).eq('status', 'completed').order('created_at', { ascending: false }).limit(20),
      supabase.from('scans')
        .select('created_at')
        .eq('user_id', userId).neq('status', 'failed').gte('created_at', weekIso),
    ]);
    if (reviewsRes.error || scansRes.error || scanOpenRes.error || scanWeekRes.error) {
      fastify.log.error(reviewsRes.error || scansRes.error || scanOpenRes.error || scanWeekRes.error, 'Failed to load /api/me');
      return reply.status(503).send({ error: 'We could not load your reviews. Please try again shortly.' });
    }

    type Moment = { concept_id?: string | null };
    const rows = (reviewsRes.data ?? []) as unknown as Array<{
      id: string; share_id: string; status: string; created_at: string; hero_variant?: string | null;
      summary: { headline?: string; focus_habit?: string } | null;
      moments: Moment[] | null;
      source_games: { external_id: string | null; source: string; player_color: string | null; white_player: string | null; black_player: string | null; metadata: { chesscom_username?: string } | null } | null;
    }>;
    type ScanMeRow = {
      id: string; status: string; created_at: string; completed_at: string | null;
      chesscom_username: string; example_report_id: string | null; checkin: Checkin | null;
      result: ScanResult | null;
    };
    const scanRows = (scansRes.data ?? []) as unknown as ScanMeRow[];
    const openRows = (scanOpenRes.data ?? []) as unknown as ScanMeRow[];

    const reviews = rows.map(r => ({
      id: r.id,
      share_id: r.share_id,
      status: r.status,
      created_at: r.created_at,
      headline: r.summary?.headline ?? null,
      moment_count: r.moments?.length ?? 0,
      game_url: r.source_games?.external_id ?? null,
      player_color: r.source_games?.player_color ?? null,
      white_player: r.source_games?.white_player ?? null,
      black_player: r.source_games?.black_player ?? null,
    }));

    // One count per completed review per concept. Scan example reports are reviews too;
    // a single report cannot reach the threshold of 2 on its own.
    const patternsById = new Map<ConceptId, { concept: NonNullable<ReturnType<typeof conceptInfo>>; count: number }>();
    for (const r of rows) {
      if (r.status !== 'completed') continue;
      const seen = new Set<string>();
      for (const id of (r.moments ?? []).map(m => m.concept_id)) {
        if (!isConceptId(id) || seen.has(id)) continue;
        const concept = conceptInfo(id);
        if (!concept) continue;
        seen.add(id);
        const entry = patternsById.get(id) ?? { concept, count: 0 };
        entry.count++;
        patternsById.set(id, entry);
      }
    }
    const patterns = [...patternsById.values()].filter(p => p.count >= 2).sort((a, b) => b.count - a.count);

    const premium = profileRes.data?.subscription_tier === 'premium';
    // Same rule as the submit quota: failed runs, empty completed reports, and scan examples are free.
    const counted = rows.filter(r => r.hero_variant !== 'scan' && r.status !== 'failed' && (r.status !== 'completed' || (r.moments?.length ?? 0) > 0) && Date.parse(r.created_at) >= weekAgo);
    const oldest = counted.length ? Math.min(...counted.map(r => Date.parse(r.created_at))) : null;
    const countedScans = (scanWeekRes.data ?? []) as Array<{ created_at: string }>;
    const scanTimes = countedScans.map(s => Date.parse(s.created_at)).filter(n => !Number.isNaN(n));
    const oldestScan = scanTimes.length ? Math.min(...scanTimes) : null;

    const open = openRows.find(s => s.status === 'completed' && conceptInfo(s.result?.top?.concept?.id));
    const openConcept = open ? conceptInfo(open.result?.top?.concept?.id) : null;

    return reply.send({
      email: auth.user.email ?? null,
      tier: premium ? 'premium' : 'free',
      allowance: premium ? null : {
        limit: 2,
        used: Math.min(counted.length, 2),
        // A slot frees up 7 days after the oldest counted review.
        next_slot_at: counted.length >= 2 && oldest !== null ? new Date(oldest + WEEK_MS).toISOString() : null,
      },
      scan_allowance: premium ? null : {
        limit: 2,
        used: Math.min(countedScans.length, 2),
        next_slot_at: countedScans.length >= 2 && oldestScan !== null ? new Date(oldestScan + WEEK_MS).toISOString() : null,
      },
      chesscom_username: rows.find(r => r.source_games?.source === 'chesscom' && r.source_games.metadata?.chesscom_username)?.source_games?.metadata?.chesscom_username
        ?? scanRows.find(s => s.chesscom_username)?.chesscom_username
        ?? null,
      open_idea: open && openConcept ? {
        scan_id: open.id,
        concept: openConcept,
        games_with_concept: open.result?.top?.games_with_concept ?? 0,
        games_scanned: open.result?.games_scanned ?? 0,
        example_report_id: open.example_report_id,
        scanned_at: open.completed_at ?? open.created_at,
        last_checkin: open.checkin,
        chesscom_username: open.chesscom_username,
      } : null,
      scans: scanRows.slice(0, 10).map(s => ({
        id: s.id,
        created_at: s.created_at,
        status: s.status,
        top_concept_id: isConceptId(s.result?.top?.concept?.id) ? s.result?.top?.concept?.id ?? null : null,
        games_with_concept: s.result?.top?.games_with_concept ?? 0,
      })),
      reviews,
      patterns,
    });
  });

  fastify.post('/api/scans', {
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const raw = (request.body ?? {}) as { chesscom_username?: unknown };
    const username = typeof raw.chesscom_username === 'string' ? raw.chesscom_username.trim() : '';
    if (!/^[a-zA-Z0-9_-]{3,25}$/.test(username)) {
      return reply.status(400).send({ error: 'invalid_username', message: 'Enter a valid Chess.com username.' });
    }
    const clean = username.toLowerCase();
    const auth = await bearerUser(request);
    if (auth.invalid) return reply.status(401).send({ error: 'Please sign in again before submitting this game.' });

    try {
      const games = await fetchScanGames(clean);
      if (games.length === 0) {
        return reply.status(400).send({ error: 'no_games', message: `'${username}' has no rapid, blitz, or daily games in the last 4 months.` });
      }
    } catch (err) {
      if (err instanceof ChessComInputError) {
        const error = err.kind === 'unknown_username' ? 'unknown_username' : 'no_games';
        return reply.status(400).send({ error, message: err.message });
      }
      fastify.log.warn(err, 'Chess.com scan fetch failed');
      return reply.status(502).send({ error: 'chesscom_unavailable', message: 'Chess.com did not respond. Try again in a moment.' });
    }

    const clientIp = request.ip;
    const enforced = isQuotaEnforced();
    const quotaKey = quotaIdentity(auth.userId, clientIp);
    const createScan = async () => {
      const unfinishedBase = supabase.from('scans').select('id, share_id, status')
        .eq('chesscom_username', clean)
        .in('status', ['pending', 'fetching', 'analyzing'])
        .order('created_at', { ascending: false })
        .limit(1);
      const unfinishedQuery = auth.userId ? unfinishedBase.eq('user_id', auth.userId) : unfinishedBase.eq('ip', clientIp);
      const { data: unfinished, error: unfinishedErr } = await unfinishedQuery.maybeSingle();
      if (unfinishedErr) return reply.status(503).send({ error: 'scan_unavailable', message: 'We could not start your scan. Please try again shortly.' });
      if (unfinished) return reply.status(200).send(unfinished);

      if (!auth.premium && quotaKey && enforced) {
        const { count, error: countErr } = await supabase.from('scans')
          .select('id', { count: 'exact', head: true })
          .eq(quotaKey.column, quotaKey.value)
          .neq('status', 'failed')
          .gte('created_at', new Date(Date.now() - WEEK_MS).toISOString());
        if (countErr) return reply.status(503).send({ error: 'quota_unavailable', message: 'We could not check your scan allowance. Please try again shortly.' });
        if (typeof count === 'number' && count >= 2) {
          return reply.status(402).send({
            error: 'quota_exceeded',
            can_sign_in: !auth.userId,
            message: auth.userId
              ? 'You have used your 2 free scans for this week. Premium removes the limit.'
              : 'That is 2 free scans from your network this week. Sign in to get your own free scans, or go Premium for no limit.',
          });
        }
      }

      const { data: scan, error } = await supabase.from('scans').insert({
        share_id: nanoid(8),
        user_id: auth.userId,
        ip: clientIp,
        chesscom_username: clean,
        status: 'pending',
      }).select('id, share_id, status').single();
      if (error || !scan) {
        fastify.log.error(error, 'Failed to insert scan');
        return reply.status(500).send({ error: 'Database error creating scan' });
      }
      return reply.status(201).send(scan);
    };

    return !auth.premium && quotaKey && enforced
      ? withQuotaLock(`scan:${quotaKey.column}:${quotaKey.value}`, createScan)
      : createScan();
  });

  fastify.get('/api/scans/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: 'Scan not found' });
    const { data, error } = await supabase.from('scans')
      .select('id, share_id, user_id, ip, status, chesscom_username, progress, games, result, example_report_id, checkin, created_at, completed_at')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return reply.status(404).send({ error: 'Scan not found' });
    const scan = data as {
      id: string; share_id: string; user_id: string | null; ip: string | null;
      status: 'pending' | 'fetching' | 'analyzing' | 'completed' | 'failed';
      chesscom_username: string; progress: { done: number; total: number } | null;
      games: ScanGame[] | null; result: ScanResult | null; example_report_id: string | null;
      checkin: Checkin | null; created_at: string; completed_at: string | null;
    };

    const previousBase = supabase.from('scans')
      .select('id, result, completed_at, created_at')
      .eq('status', 'completed')
      .neq('id', scan.id)
      .lt('created_at', scan.created_at)
      .order('created_at', { ascending: false })
      .limit(20);
    const previousQuery = scan.user_id
      ? previousBase.eq('user_id', scan.user_id)
      : scan.ip
        ? previousBase.eq('chesscom_username', scan.chesscom_username).eq('ip', scan.ip)
        : previousBase.eq('chesscom_username', scan.chesscom_username).is('ip', null);
    const { data: priors, error: priorErr } = await previousQuery;
    if (priorErr) throw priorErr;
    let previous: { scan_id: string; concept: NonNullable<ReturnType<typeof conceptInfo>>; scanned_at: string } | null = null;
    for (const row of (priors ?? []) as Array<{ id: string; result: ScanResult | null; completed_at: string | null; created_at: string }>) {
      const concept = conceptInfo(row.result?.top?.concept?.id);
      if (!concept) continue;
      previous = { scan_id: row.id, concept, scanned_at: row.completed_at ?? row.created_at };
      break;
    }

    return reply.send({
      id: scan.id,
      share_id: scan.share_id,
      status: scan.status,
      chesscom_username: scan.chesscom_username,
      progress: scan.progress ?? { done: 0, total: 0 },
      games: scan.games ?? [],
      result: scan.result,
      example_report_id: scan.example_report_id,
      checkin: scan.checkin,
      previous,
      created_at: scan.created_at,
      completed_at: scan.completed_at,
    });
  });

  fastify.post('/api/scans/:id/checkin', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { concept_id?: unknown; answer?: unknown };
    if (!isConceptId(body.concept_id) || typeof body.answer !== 'string' || !(CHECKIN_ANSWERS as readonly string[]).includes(body.answer)) {
      return reply.status(400).send({ error: 'invalid_input', message: 'Choose a concept and whether you remembered, forgot, or it did not come up.' });
    }
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: 'Scan not found' });
    const auth = await bearerUser(request);
    if (auth.invalid) return reply.status(401).send({ error: 'Invalid auth token' });
    const { data, error } = await supabase.from('scans').select('id, user_id, ip, created_at').eq('id', id).maybeSingle();
    if (error) throw error;
    const scan = data as { id: string; user_id: string | null; ip: string | null; created_at: string } | null;
    if (!scan) return reply.status(404).send({ error: 'Scan not found' });
    const owns = Boolean(auth.userId && scan.user_id === auth.userId);
    const anon = !scan.user_id && scan.ip === request.ip && Date.parse(scan.created_at) >= Date.now() - DAY_MS;
    if (!owns && !anon) return reply.status(403).send({ error: 'forbidden' });
    const checkin: Checkin = { concept_id: body.concept_id, answer: body.answer as Checkin['answer'], at: new Date().toISOString() };
    const { error: updateErr } = await supabase.from('scans').update({ checkin }).eq('id', scan.id);
    if (updateErr) return reply.status(500).send({ error: 'Database error saving check-in' });
    return reply.send({ checkin });
  });

  fastify.post('/api/scans/:id/claim', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: 'Scan not found' });
    const auth = await bearerUser(request);
    if (!auth.userId) {
      return reply.status(401).send({ error: auth.invalid ? 'Invalid auth token' : 'Missing bearer token' });
    }
    const { data: claimed, error } = await supabase.from('scans')
      .update({ user_id: auth.userId })
      .eq('id', id)
      .eq('ip', request.ip)
      .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
      .is('user_id', null)
      .select('id, example_report_id');
    if (error) throw error;
    if (!claimed || claimed.length === 0) return reply.status(409).send({ error: 'scan_already_claimed' });

    const exampleId = (claimed[0] as { example_report_id: string | null }).example_report_id;
    if (exampleId) {
      const { data: example } = await supabase.from('game_analyses')
        .update({ user_id: auth.userId })
        .eq('id', exampleId)
        .is('user_id', null)
        .select('source_game_id');
      const sourceId = (example?.[0] as { source_game_id?: string } | undefined)?.source_game_id;
      if (sourceId) await supabase.from('source_games').update({ user_id: auth.userId }).eq('id', sourceId).is('user_id', null);
    }
    return reply.send({ success: true });
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
