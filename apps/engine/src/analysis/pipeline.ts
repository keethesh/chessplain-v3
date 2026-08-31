import { EloBand, GameAnalysisReport, MomentReport } from '../types.js';
import { parsePgn } from './pgn.js';
import { sweepPositions } from './sweep.js';
import { selectCandidateMoments } from './select.js';
import { verifyCandidates } from './verify.js';
import { explainMoment, explainSummary } from './explain.js';

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

  const explainPromises = verifiedCandidates.map(async (candidate) => {
    const explained = await explainMoment(
      candidate,
      eloBand,
      parsedGame.opponentName || 'opponent',
      analysisId
    );
    if (explained) {
      completedMoments.push(explained);
      // Sort in ply order
      completedMoments.sort((a, b) => a.ply - b.ply);
      if (onMomentReady) {
        await onMomentReady(explained, completedMoments);
      }
    }
  });

  await Promise.all(explainPromises);

  // Ensure moments are sorted chronologically
  completedMoments.sort((a, b) => a.ply - b.ply);

  // Generate game summary
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

  if (onStageChange) await onStageChange('completed');

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
