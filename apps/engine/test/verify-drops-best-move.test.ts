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

const evaluate = vi.fn(async (fen: string) =>
  // At depth 20 the engine's best move at FEN_BEFORE *is* what the player played.
  fen === FEN_BEFORE ? flatEval(fen, 3.0, PLAYED_UCI) : flatEval(fen, 2.0, 'e6e7')
);

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
});
