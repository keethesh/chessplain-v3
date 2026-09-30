import { describe, expect, it, vi } from 'vitest';
import { verifyCandidates } from '../src/analysis/verify.js';
import type { CandidateMoment, EngineEvalResult } from '../src/types.js';

/**
 * Companion to best-move-not-a-mistake.test.ts, covering the second stage.
 *
 * `selectCandidateMoments` screens candidates against the shallow sweep's best
 * move, but `verifyCandidates` re-searches every position at depth 20 and
 * replaces `bestMoveUci` with that deeper answer. A move the sweep disliked can
 * turn out to be the engine's top choice at depth 20 — at which point the
 * candidate must be dropped, not re-labelled.
 */

const FEN_BEFORE = '4kb1r/p2r1ppp/4qn2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 2 15';
const FEN_AFTER = '4kb1r/p2B1ppp/4qn2/4p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 0 15';
const QUIET_FEN_BEFORE = '8/8/8/8/8/8/8/K6k w - - 0 1';
const QUIET_FEN_AFTER = '8/8/8/8/8/8/8/K6k b - - 1 1';
const QUIET_KEEP_FEN_BEFORE = '7k/8/8/8/8/8/6K1/7R w - - 0 1';
const QUIET_KEEP_FEN_AFTER = '7k/8/8/8/8/8/6K1/7R b - - 1 1';
const PLAYED_UCI = 'b5d7';

const flatEval = (fen: string, evalPawns: number, bestMove: string): EngineEvalResult => ({
  fen,
  evalPawns,
  bestMove,
  pv: '',
  multipv: [],
});

// No cached d20 rows: force the engine-pool path.
vi.mock('../src/db/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [] }) }) }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}));

const evaluate = vi.fn(async (fen: string) => {
  if (fen === FEN_BEFORE) return flatEval(fen, 3.0, PLAYED_UCI);
  if (fen === QUIET_FEN_BEFORE) return flatEval(fen, 1.0, 'a1a2');
  if (fen === QUIET_FEN_AFTER) return flatEval(fen, 0.7, 'h1h2');
  if (fen === QUIET_KEEP_FEN_BEFORE) return flatEval(fen, 1.0, 'h1h2');
  if (fen === QUIET_KEEP_FEN_AFTER) return flatEval(fen, 0.2, 'a1a2');
  return flatEval(fen, 2.0, 'e6e7');
});

vi.mock('../src/uci/engine-pool.js', () => ({
  enginePool: { evaluate: (fen: string) => evaluate(fen) },
}));

function candidate(overrides: Partial<CandidateMoment> = {}): CandidateMoment {
  return {
    ply: 29,
    moveNumber: 15,
    san: '15.Bxd7+',
    uci: PLAYED_UCI,
    fenBefore: FEN_BEFORE,
    fenAfter: FEN_AFTER,
    playerColor: 'white',
    evalBefore: 3.0,
    evalAfter: 2.0,
    swing: -1.0,
    bestMoveSan: 'Rxd7',
    bestMoveUci: 'd1d7', // what the shallow sweep thought
    refutationLineSan: '',
    bestLineSan: '',
    phase: 'middlegame',
    materialNote: '',
    candidateType: 'Turning point',
    ...overrides,
  };
}

describe('verifyCandidates', () => {
  it('drops a candidate whose depth-20 best move is the move played', async () => {
    const verified = await verifyCandidates([candidate()]);

    expect(
      verified.map((c) => `${c.san} (best: ${c.bestMoveSan})`),
      'kept a moment whose best move at depth 20 is the played move'
    ).toEqual([]);
  });

  it('keeps a candidate whose depth-20 best move differs from the move played', async () => {
    // Same position, but the player played something else entirely.
    const verified = await verifyCandidates([candidate({ uci: 'd1d7', san: '15.Rxd7' })]);

    expect(verified.length).toBe(1);
    expect(verified[0].bestMoveUci).toBe(PLAYED_UCI);
    expect(verified[0].verified).toBe(true);
  });
  it('drops a Quiet drift fallback when depth 20 finds only engine noise', async () => {
    const verified = await verifyCandidates([
      candidate({
        fenBefore: QUIET_FEN_BEFORE,
        fenAfter: QUIET_FEN_AFTER,
        uci: 'a1a2',
        candidateType: 'Quiet drift',
      }),
    ]);

    expect(verified).toEqual([]);
  });
  it('keeps Quiet drift at its intended depth-20 floor', async () => {
    const verified = await verifyCandidates([
      candidate({
        fenBefore: QUIET_KEEP_FEN_BEFORE,
        fenAfter: QUIET_KEEP_FEN_AFTER,
        uci: 'g2g3',
        candidateType: 'Quiet drift',
      }),
    ]);

    expect(verified).toHaveLength(1);
    expect(verified[0].swing).toBe(-0.8);
  });
});
