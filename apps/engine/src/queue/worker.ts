import { PostHog } from 'posthog-node';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';
import { enginePool } from '../uci/engine-pool.js';
import { runAnalysisPipeline } from '../analysis/pipeline.js';
import { fetchRecentChessComGame } from '../analysis/chesscom.js';
import { EloBand } from '../types.js';

const posthog = new PostHog(config.posthogKey, {
  host: config.posthogHost,
  flushAt: 1,
  flushInterval: 0,
});

let isRunning = false;

interface GameAnalysisRow {
  id: string;
  source_game_id?: string;
  user_id?: string | null;
  status: 'pending' | 'sweeping' | 'verifying' | 'explaining' | 'completed' | 'failed';
  attempts?: number;
  share_id?: string;
  elo_band?: EloBand;
  hero_variant?: string;
}

interface SourceGameRow {
  id: string;
  pgn?: string;
  source?: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
  user_id?: string;
}

export async function processNextJob(): Promise<boolean> {
  const { data: candidate, error: fetchErr } = await supabase
    .from('game_analyses')
    .select('id, source_game_id, user_id, status, attempts, share_id, elo_band, hero_variant')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchErr || !candidate) {
    return false;
  }

  const analysis = candidate as GameAnalysisRow;

  // Optimistic lock transition: pending -> sweeping
  const { data: locked, error: lockErr } = await supabase
    .from('game_analyses')
    .update({
      status: 'sweeping',
      attempts: (analysis.attempts || 0) + 1,
      locked_at: new Date().toISOString(),
    })
    .eq('id', analysis.id)
    .eq('status', 'pending')
    .select()
    .single();

  if (lockErr || !locked) {
    return false;
  }

  console.log(`[Worker] Started processing analysis ${analysis.id}`);

  let pgn = '';
  let eloBand: EloBand = analysis.elo_band || '1000_1400';
  let targetPlayer: string | undefined;

  try {
    // 1. Fetch source game
    if (analysis.source_game_id) {
      const { data: sourceData } = await supabase
        .from('source_games')
        .select('id, pgn, source, external_id, metadata')
        .eq('id', analysis.source_game_id)
        .single();

      const source = sourceData as SourceGameRow | null;
      const metadata = source?.metadata || {};
      const chesscomUser = (metadata['chesscom_username'] as string) || (source?.source === 'chesscom' ? source?.external_id : undefined);

      if (source?.pgn) {
        pgn = source.pgn;
      } else if (chesscomUser) {
        const fetched = await fetchRecentChessComGame(chesscomUser);
        pgn = fetched.pgn;
        eloBand = fetched.eloBand;
        targetPlayer = chesscomUser;

        if (source) {
          await supabase
            .from('source_games')
            .update({
              pgn,
              player_color: fetched.playerColor,
              white_player: fetched.playerColor === 'white' ? chesscomUser : fetched.opponentUsername,
              black_player: fetched.playerColor === 'black' ? chesscomUser : fetched.opponentUsername,
            })
            .eq('id', source.id);
        }
      }
    }

    if (!pgn) {
      throw new Error(`Analysis ${analysis.id} has no valid PGN or Chess.com username`);
    }

    // 2. Run Pipeline
    const result = await runAnalysisPipeline({
      pgn,
      targetPlayer,
      eloBand,
      analysisId: analysis.id,
      shareId: analysis.share_id || analysis.id,
      heroVariant: analysis.hero_variant,
      onStageChange: async (stage) => {
        await supabase
          .from('game_analyses')
          .update({ status: stage })
          .eq('id', analysis.id);
      },
      onMomentReady: async (_moment, allMoments) => {
        await supabase
          .from('game_analyses')
          .update({ moments: allMoments })
          .eq('id', analysis.id);
      },
    });

    // 3. Mark Completed
    await supabase
      .from('game_analyses')
      .update({
        status: 'completed',
        elo_band: eloBand,
        moments: result.report.moments,
        summary: result.report.summary,
        completed_at: new Date().toISOString(),
      })
      .eq('id', analysis.id);

    console.log(`[Worker] Analysis ${analysis.id} completed successfully in ${result.durationMs}ms with ${result.momentsCount} moments`);

    // 4. Emit PostHog Event
    posthog.capture({
      distinctId: analysis.user_id || `anon_${analysis.id}`,
      event: 'analysis_completed',
      properties: {
        analysis_id: analysis.id,
        duration_ms: result.durationMs,
        moments_count: result.momentsCount,
        cache_hit_rate: result.cacheHitRate,
      },
    });

    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker] Analysis ${analysis.id} failed:`, errorMsg);

    const attempts = (analysis.attempts || 0) + 1;
    const shouldRetry = attempts < 3;

    await supabase
      .from('game_analyses')
      .update({
        status: shouldRetry ? 'pending' : 'failed',
      })
      .eq('id', analysis.id);

    await supabase.from('analysis_errors').insert({
      analysis_id: analysis.id,
      stage: 'engine',
      message: errorMsg,
      metadata: { attempts, shouldRetry },
    });

    posthog.capture({
      distinctId: analysis.user_id || `anon_${analysis.id}`,
      event: 'analysis_failed',
      properties: {
        analysis_id: analysis.id,
        stage: 'worker_execution',
        attempts,
        error: errorMsg,
      },
    });

    return true;
  }
}

export async function startWorker(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  await enginePool.init();
  console.log(`[Worker] Background queue worker started with ${enginePool.totalCount} engine instances.`);

  while (isRunning) {
    try {
      const processed = await processNextJob();
      if (!processed) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error('[Worker] Loop exception:', err);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export function stopWorker(): void {
  isRunning = false;
}
