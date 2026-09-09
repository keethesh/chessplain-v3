import { describe, expect, it } from 'vitest';
import { parsePgn } from '../src/analysis/pgn.js';
import { selectCandidateMoments } from '../src/analysis/select.js';
import type { EngineEvalResult, PositionInfo } from '../src/types.js';

/**
 * Regression: a report must never accuse the player of a move that the engine
 * itself considers best.
 *
 * Observed in production on 2026-09-09: the Opera Game reviewed from White's
 * side produced exactly one moment, `15.Bxd7+`, with `best_move: "Bxd7+"` —
 * the same move — labelled "Quiet drift" on a -0.38 swing, with a paragraph
 * explaining why the strongest move on the board was a lapse.
 *
 * Two independent defects made that possible:
 *   1. `selectCandidateMoments` manufactures a "Quiet drift" candidate from the
 *      player's worst move whenever *any* negative swing exists, with no floor.
 *   2. Nothing compares the engine's best move against the move played.
 */

const OPERA_PGN = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`;

/**
 * Build an eval map in which every position is level except the one position
 * named by `dipAtSan`, which drifts by `dipPawns` — and where the engine's best
 * move at that position is the move the player actually played.
 */
function buildEvalMap(
  positions: PositionInfo[],
  dipAtSan: string,
  dipPawns: number
): { evalMap: Map<string, EngineEvalResult>; target: PositionInfo } {
  const evalMap = new Map<string, EngineEvalResult>();
  const target = positions.find((p) => p.san === dipAtSan);
  if (!target) throw new Error(`fixture error: no position with san ${dipAtSan}`);

  const flat = (fen: string, evalPawns: number, bestMove = ''): EngineEvalResult => ({
    fen,
    evalPawns,
    bestMove,
    pv: '',
    multipv: [],
  });

  for (const p of positions) {
    if (!evalMap.has(p.fenBefore)) evalMap.set(p.fenBefore, flat(p.fenBefore, 0));
    if (!evalMap.has(p.fenAfter)) evalMap.set(p.fenAfter, flat(p.fenAfter, 0));
  }

  // The engine's best move here IS what the player played.
  evalMap.set(target.fenBefore, flat(target.fenBefore, 0, target.uci));
  evalMap.set(target.fenAfter, flat(target.fenAfter, dipPawns));

  return { evalMap, target };
}

describe('a moment is never the engine top choice', () => {
  it('does not report the played move as a mistake when it is the best move', () => {
    const parsed = parsePgn(OPERA_PGN); // no targetPlayer => White
    const { evalMap, target } = buildEvalMap(parsed.positions, '15.Bxd7+', -0.38);

    const candidates = selectCandidateMoments(parsed.positions, evalMap, 'white');

    // NB: compare on UCI, not SAN. `san` is move-numbered ("15.Bxd7+") while
    // `bestMoveSan` is bare ("Bxd7+"), so comparing those two strings never
    // matches — which is precisely why this bug shipped.
    const selfAccusing = candidates.filter((c) => c.bestMoveUci === target.uci);
    expect(
      selfAccusing.map((c) => `${c.san} (best: ${c.bestMoveSan})`),
      `reported "${target.san}" as a mistake while naming it the best move`
    ).toEqual([]);
  });

  it('does not invent a moment from a trivial sub-pawn drift', () => {
    const parsed = parsePgn(OPERA_PGN);
    // Best move differs from the played move, but the swing is negligible.
    const { evalMap, target } = buildEvalMap(parsed.positions, '15.Bxd7+', -0.38);
    evalMap.set(target.fenBefore, {
      fen: target.fenBefore,
      evalPawns: 0,
      bestMove: 'd1d7', // a different (legal) rook move
      pv: '',
      multipv: [],
    });

    const candidates = selectCandidateMoments(parsed.positions, evalMap, 'white');

    expect(candidates, 'a -0.38 drift is noise, not a teachable moment').toEqual([]);
  });

  it('still reports a genuine blunder', () => {
    const parsed = parsePgn(OPERA_PGN);
    const { evalMap, target } = buildEvalMap(parsed.positions, '15.Bxd7+', -4.5);
    evalMap.set(target.fenBefore, {
      fen: target.fenBefore,
      evalPawns: 0,
      bestMove: 'd1d7',
      pv: '',
      multipv: [],
    });

    const candidates = selectCandidateMoments(parsed.positions, evalMap, 'white');

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].san).toBe(target.san);
    expect(candidates[0].bestMoveSan).not.toBe(candidates[0].san);
  });
});
