import { EloBand, GameAnalysisReport, MomentReport } from '../types.js';
import { parsePgn } from './pgn.js';
import { sweepPositions } from './sweep.js';
import { selectCandidateMoments } from './select.js';
import { verifyCandidates } from './verify.js';
import {
  explainMoment,
  explainSummary,
  LlmUnavailableError,
  type ExplainRunStats,
} from './explain.js';

export interface PipelineOptions {
  pgn: string;
  targetPlayer?: string;
  eloBand?: EloBand;
  analysisId?: string;
  shareId?: string;
  heroVariant?: string;
  onStageChange?: (stage: 'sweeping' | 'verifying' | 'explaining' | 'completed' | 'failed') => void | Promise<void>;
  onMomentReady?: (moment: MomentReport, allMoments: MomentReport[]) => void | Promise<void>;
}

export interface PipelineResult {
  report: GameAnalysisReport;
  durationMs: number;
  cacheHitRate: number;
  momentsCount: number;
}

export async function runAnalysisPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const startTime = Date.now();
  const {
    pgn,
    targetPlayer,
    eloBand = '1000_1400',
    analysisId = 'local-test',
    shareId = 'share-test',
    heroVariant,
    onStageChange,
    onMomentReady,
  } = options;

  // 0. Parse PGN
  const parsedGame = parsePgn(pgn, targetPlayer);

  // 1. Stage 1: Fast Sweep (nodes 15000)
  if (onStageChange) await onStageChange('sweeping');
  let cacheHits = 0;
  let totalPositions = 0;

  const evalMap = await sweepPositions(parsedGame.positions, (progress) => {
    cacheHits = progress.cacheHits;
    totalPositions = progress.total;
  });

  const cacheHitRate = totalPositions > 0 ? cacheHits / totalPositions : 0;

  // 2. Stage 2: Moment Selection & Verification (depth 20)
  if (onStageChange) await onStageChange('verifying');
  const rawCandidates = selectCandidateMoments(parsedGame.positions, evalMap, parsedGame.playerColor);
  const verifiedCandidates = await verifyCandidates(rawCandidates);

  // 3. Stage 3: LLM Explanation
  if (onStageChange) await onStageChange('explaining');
  const completedMoments: MomentReport[] = [];
  let publication = Promise.resolve();

  // One moment failing is tolerable — the reader still gets real explanations
  // for the rest. A run where the model explained nothing is not a report at
  // all, which is what these totals track (see the abort below).
  const stats: ExplainRunStats = { unexplainedMoments: 0, creditsExhausted: false };

  const explainPromises = verifiedCandidates.map(async (candidate) => {
    let explained: MomentReport | undefined;
    try {
      explained = await explainMoment(
        candidate,
        eloBand,
        parsedGame.opponentName || 'opponent',
        analysisId,
        stats
      );
    } catch (err) {
      console.error(`[Pipeline] Explanation threw for ply ${candidate.ply}:`, err);
      stats.unexplainedMoments++;
    }
    if (explained) {
      completedMoments.push(explained);
      // Sort in ply order
      completedMoments.sort((a, b) => a.ply - b.ply);
      if (onMomentReady) {
        const snapshot = [...completedMoments];
        publication = publication.then(async () => { await onMomentReady(explained, snapshot); });
        await publication;
      }
    }
  });

  await Promise.all(explainPromises);

  // Ensure moments are sorted chronologically
  completedMoments.sort((a, b) => a.ply - b.ply);

  // Every candidate fell back to generic text (or the gateway refused the
  // account entirely). Publishing that would spend one of the player's analyses
  // on a report that says "the written explanation is unavailable" N times, so
  // throw instead: worker.ts retries the row, then marks it failed, and quota
  // checks ignore failed rows.
  if (
    verifiedCandidates.length > 0 &&
    (stats.creditsExhausted || stats.unexplainedMoments >= verifiedCandidates.length)
  ) {
    throw new LlmUnavailableError(
      'LLM explanation failed for all moments; aborting to prevent degraded completed report'
    );
  }
  if (stats.unexplainedMoments > 0) {
    console.warn(
      `[Pipeline] ${stats.unexplainedMoments}/${verifiedCandidates.length} moments fell back to generic text (analysis ${analysisId})`
    );
  }

  // Generate game summary
  // The summary may still degrade to fallback prose on its own: by this point
  // every published moment carries real explanations, so a generic headline is a
  // smaller loss than discarding them.
  const summary = await explainSummary(
    completedMoments,
    {
      result: parsedGame.result,
      playerColor: parsedGame.playerColor,
      playerName: parsedGame.playerName || 'You',
      opponentName: parsedGame.opponentName || 'opponent',
      moveCount: parsedGame.moveCount,
      timeControl: parsedGame.timeControl,
    },
    analysisId
  );

  // The caller publishes completion only when the full report is persisted.

  const durationMs = Date.now() - startTime;

  const report: GameAnalysisReport = {
    id: analysisId,
    share_id: shareId,
    status: 'completed',
    elo_band: eloBand,
    hero_variant: heroVariant,
    player_name: parsedGame.playerName,
    opponent_name: parsedGame.opponentName,
    player_color: parsedGame.playerColor,
    result: parsedGame.result,
    time_control: parsedGame.timeControl,
    move_count: parsedGame.moveCount,
    moments: completedMoments,
    summary,
    created_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
  };

  return {
    report,
    durationMs,
    cacheHitRate,
    momentsCount: completedMoments.length,
  };
}
