import { supabase } from '../db/supabase.js';
import { enginePool } from '../uci/engine-pool.js';
import { CandidateMoment, EngineEvalResult } from '../types.js';
import { buildRefutationLine, uciToSan } from './select.js';

interface CacheRow {
  fen: string;
  profile_key: string;
  eval_pawns: number;
  best_move: string;
  pv: string;
  multipv: unknown;
}

export async function verifyCandidates(
  candidates: CandidateMoment[],
  onProgress?: (index: number, total: number) => void
): Promise<CandidateMoment[]> {
  if (candidates.length === 0) return [];

  const fensToVerify = new Set<string>();
  for (const c of candidates) {
    fensToVerify.add(c.fenBefore);
    fensToVerify.add(c.fenAfter);
  }

  const d20Map = new Map<string, EngineEvalResult>();

  // 1. Check analysis_cache for d20 profile
  try {
    const { data: cachedRows } = await supabase
      .from('analysis_cache')
      .select('fen, profile_key, eval_pawns, best_move, pv, multipv')
      .eq('profile_key', 'd20')
      .in('fen', Array.from(fensToVerify));

    if (cachedRows) {
      for (const row of cachedRows as CacheRow[]) {
        d20Map.set(row.fen, {
          fen: row.fen,
          evalPawns: row.eval_pawns,
          bestMove: row.best_move,
          pv: row.pv,
          multipv: Array.isArray(row.multipv) ? row.multipv : [],
        });
      }
    }
  } catch (err) {
    console.warn('[Verify] Error checking d20 cache:', err);
  }

  // 2. Evaluate remaining FENs in parallel at depth 20
  const missingFens = Array.from(fensToVerify).filter((fen) => !d20Map.has(fen));
  const toCache: Array<{
    fen: string;
    profile_key: string;
    eval_pawns: number;
    best_move: string;
    pv: string;
    multipv: unknown;
  }> = [];

  let completedCount = 0;
  const evalPromises = missingFens.map(async (fen) => {
    const result = await enginePool.evaluate(fen, { depth: 20, multiPv: 2 });
    d20Map.set(fen, result);
    toCache.push({
      fen: result.fen,
      profile_key: 'd20',
      eval_pawns: result.evalPawns,
      best_move: result.bestMove,
      pv: result.pv,
      multipv: result.multipv,
    });
    completedCount++;
    if (onProgress) {
      onProgress(completedCount, missingFens.length);
    }
  });

  await Promise.all(evalPromises);

  // Write back to cache
  if (toCache.length > 0) {
    Promise.resolve(
      supabase
        .from('analysis_cache')
        .upsert(toCache, { onConflict: 'fen,profile_key', ignoreDuplicates: true })
    )
      .then(() => {})
      .catch((err: unknown) => console.warn('[Verify] Failed to cache d20 results:', err));
  }

  // 3. Verify each candidate
  const verifiedList: CandidateMoment[] = [];
  const playerMultiplier = (playerColor: 'white' | 'black') => (playerColor === 'white' ? 1 : -1);

  for (const c of candidates) {
    const d20Before = d20Map.get(c.fenBefore);
    const d20After = d20Map.get(c.fenAfter);

    const mult = playerMultiplier(c.playerColor);
    const vEvalBefore = (d20Before?.evalPawns ?? c.evalBefore) * mult;
    const vEvalAfter = (d20After?.evalPawns ?? c.evalAfter) * mult;
    const vSwing = vEvalAfter - vEvalBefore;

    // Drop candidate if swing < 1.0 pawn, unless it is a Quiet drift single candidate
    // Plan contract: drop if verified swing < 1.0 pawn (signed — a d20-evaluated
    // positive swing means the depth-1.5k sweep disagreed, drop it too)
    if (vSwing > -1.0 && candidates.length > 1 && c.candidateType !== 'Quiet drift') {
      continue;
    }

    const bestUci = d20Before?.bestMove || c.bestMoveUci;
    const { san: bestSan } = uciToSan(c.fenBefore, bestUci);
    const refutationSan = buildRefutationLine(c.fenAfter, d20After?.pv || '');

    verifiedList.push({
      ...c,
      evalBefore: vEvalBefore,
      evalAfter: vEvalAfter,
      swing: vSwing,
      bestMoveSan: bestSan || c.bestMoveSan,
      bestMoveUci: bestUci,
      refutationLineSan: refutationSan || c.refutationLineSan,
      verified: true,
    });
  }

  // Fallback to initial candidate if all got dropped
  if (verifiedList.length === 0 && candidates.length > 0) {
    verifiedList.push({ ...candidates[0], verified: true });
  }

  return verifiedList;
}
