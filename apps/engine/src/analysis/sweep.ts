import { supabase } from '../db/supabase.js';
import { enginePool } from '../uci/engine-pool.js';
import { EngineEvalResult, PositionInfo } from '../types.js';

interface CacheRow {
  fen: string;
  profile_key: string;
  eval_pawns: number;
  best_move: string;
  pv: string;
  multipv: unknown;
}

export interface SweepProgress {
  total: number;
  completed: number;
  cacheHits: number;
}

export async function sweepPositions(
  positions: PositionInfo[],
  onProgress?: (progress: SweepProgress) => void
): Promise<Map<string, EngineEvalResult>> {
  // Collect unique FENs across all positions (both before and after)
  const uniqueFens = Array.from(
    new Set([
      ...positions.map((p) => p.fenBefore),
      ...positions.map((p) => p.fenAfter),
    ])
  );

  const evalMap = new Map<string, EngineEvalResult>();
  let cacheHits = 0;

  // 1. Query analysis_cache for pass1_15k
  try {
    const { data: cachedRows, error } = await supabase
      .from('analysis_cache')
      .select('fen, profile_key, eval_pawns, best_move, pv, multipv')
      .eq('profile_key', 'pass1_15k')
      .in('fen', uniqueFens);

    if (!error && cachedRows) {
      for (const row of cachedRows as CacheRow[]) {
        cacheHits++;
        evalMap.set(row.fen, {
          fen: row.fen,
          evalPawns: row.eval_pawns,
          bestMove: row.best_move,
          pv: row.pv,
          multipv: Array.isArray(row.multipv) ? row.multipv : [],
        });
      }
    }
  } catch (err) {
    console.warn('[Sweep] Error checking analysis_cache:', err);
  }

  // 2. Identify missing FENs to evaluate
  const missingFens = uniqueFens.filter((fen) => !evalMap.has(fen));
  let completed = uniqueFens.length - missingFens.length;

  if (onProgress) {
    onProgress({ total: uniqueFens.length, completed, cacheHits });
  }

  // 3. Evaluate missing FENs concurrently across engine pool
  const toCache: Array<{
    fen: string;
    profile_key: string;
    eval_pawns: number;
    best_move: string;
    pv: string;
    multipv: unknown;
  }> = [];

  const evalPromises = missingFens.map(async (fen) => {
    const result = await enginePool.evaluate(fen, { nodes: 15000, multiPv: 2 });
    evalMap.set(fen, result);
    toCache.push({
      fen: result.fen,
      profile_key: 'pass1_15k',
      eval_pawns: result.evalPawns,
      best_move: result.bestMove,
      pv: result.pv,
      multipv: result.multipv,
    });
    completed++;
    if (onProgress) {
      onProgress({ total: uniqueFens.length, completed, cacheHits });
    }
  });

  await Promise.all(evalPromises);

  // 4. Write back misses to analysis_cache in background
  if (toCache.length > 0) {
    Promise.resolve(
      supabase
        .from('analysis_cache')
        .upsert(toCache, { onConflict: 'fen,profile_key', ignoreDuplicates: true })
    )
      .then(({ error }) => {
        if (error) {
          console.warn('[Sweep] Failed to write cache rows:', error.message);
        }
      })
      .catch((err: unknown) => {
        console.warn('[Sweep] Background cache write exception:', err);
      });
  }

  return evalMap;
}
