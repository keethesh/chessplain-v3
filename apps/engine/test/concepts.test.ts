import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { CONCEPT_IDS, CONCEPTS, classifyMoment, conceptInfo, type ConceptId } from '../src/analysis/concepts.js';
import { parsePgn } from '../src/analysis/pgn.js';
import { PROMPT_VERSION, buildMomentPayload } from '../src/analysis/prompts.js';
import { selectCandidateMoments } from '../src/analysis/select.js';
import type { CandidateMoment, EngineEvalResult, PositionInfo } from '../src/types.js';

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

/** Play `played` from `fen` and wrap a candidate the classifier can read. */
function moment(
  fen: string,
  played: string,
  best: string,
  refutation: string,
  color?: 'white' | 'black'
): CandidateMoment {
  const board = new Chess(fen);
  const move = board.move(played);
  if (!move) throw new Error(`illegal played move ${played} in ${fen}`);
  const playerColor = color ?? (move.color === 'w' ? 'white' : 'black');
  return {
    ply: 1,
    moveNumber: 1,
    san: played,
    uci: `${move.from}${move.to}`,
    fenBefore: fen,
    fenAfter: board.fen(),
    playerColor,
    evalBefore: 0,
    evalAfter: -3,
    swing: -3,
    bestMoveSan: best,
    bestMoveUci: 'a1a1',
    refutationLineSan: refutation,
    bestLineSan: best,
    phase: 'middlegame',
    materialNote: '',
    candidateType: 'Turning point',
  };
}

function fenAfter(moves: string[]): string {
  const board = new Chess();
  for (const san of moves) {
    if (!board.move(san)) throw new Error(`illegal setup move ${san}`);
  }
  return board.fen();
}

describe('concept catalogue', () => {
  it('names every concept with a short definition and a board check', () => {
    expect(CONCEPT_IDS).toEqual([
      'hanging_piece',
      'double_attack',
      'missed_mate_threat',
      'weak_back_rank',
      'losing_exchange',
    ]);
    for (const id of CONCEPT_IDS) {
      const info = CONCEPTS[id];
      expect(conceptInfo(id)).toEqual(info);
      expect(words(info.definition)).toBeLessThanOrEqual(14);
      expect(words(info.habit)).toBeLessThanOrEqual(22);
      expect(info.habit.startsWith('Before') || info.habit.startsWith('When')).toBe(true);
    }
    expect(CONCEPTS.hanging_piece.gremlin).toBe('The Hanger');
    expect(CONCEPTS.double_attack.gremlin).toBe('Double Trouble');
    expect(CONCEPTS.missed_mate_threat.gremlin).toBe('The Mate Misser');
    expect(CONCEPTS.weak_back_rank.gremlin).toBe('The Back-Rank Sleeper');
    expect(CONCEPTS.losing_exchange.gremlin).toBe('The Bad Trader');
    expect(conceptInfo(null)).toBeNull();
    expect(conceptInfo(undefined)).toBeNull();
  });
});

describe('classifyMoment', () => {
  const cases: Array<{ id: ConceptId; fen: string; played: string; best: string; line: string }> = [
    {
      id: 'hanging_piece',
      // Ba6 abandons the knight on f3. Ne5 takes it; nothing defends f3.
      fen: '4k3/p7/8/4n3/8/5N2/P3B3/4K3 w - - 0 1',
      played: 'Ba6',
      best: 'Bd3',
      line: 'Nxf3',
    },
    {
      id: 'double_attack',
      // a3 allows Nd4+, forking the king on c2 and the queen on e6, which falls.
      fen: 'k7/8/2n1Q3/8/8/8/P1K5/8 w - - 0 1',
      played: 'a3',
      best: 'Kd1',
      line: 'Nd4+ Kd3 Nxe6',
    },
    {
      id: 'missed_mate_threat',
      // Scholar's mate is not along the back rank: the queen mates from f7.
      fen: fenAfter(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4']),
      played: 'a6',
      best: 'Qe7',
      line: 'Qxf7#',
    },
    {
      id: 'weak_back_rank',
      // Nb5 leaves the first rank. Ra1# is a rook mate along that rank.
      fen: 'r5k1/8/8/8/8/N7/5PPP/6K1 w - - 0 1',
      played: 'Nb5',
      best: 'Kf1',
      line: 'Ra1#',
    },
    {
      id: 'losing_exchange',
      // Qxd5 takes a defended knight. cxd5 Bxd5: queen for a knight and a pawn.
      fen: '4k3/p7/2p5/3n4/2B5/8/P7/3QK3 w - - 0 1',
      played: 'Qxd5',
      best: 'Bb5',
      line: 'cxd5 Bxd5',
    },
  ];

  it.each(cases)('$id', ({ id, fen, played, best, line }) => {
    expect(classifyMoment(moment(fen, played, best, line))).toBe(id);
  });

  it('does not tag a back-rank threat the better line still allows', () => {
    // Qxb7 lets Qd3 threaten Qxf1#. e6 Qd3 still threatens that same mate.
    const still = moment(
      '5rk1/1p1Q1ppp/8/p2pP3/1P6/P1P3P1/3q2PP/5R1K w - - 5 36',
      'Qxb7',
      'e6',
      'Qd3 Rc1 axb4 Qxb4',
      'white'
    );
    still.bestLineSan = 'e6 Qd3 exf7+ Kh8';
    expect(classifyMoment(still)).toBeNull();
  });

  it('tags a back-rank mate threat the refutation move just created', () => {
    // Nb5 does not allow mate at once. Ra8 threatens Ra1# with the rook that just moved.
    const tagged = classifyMoment(
      moment('7r/6k1/8/8/8/N7/5PPP/6K1 w - - 0 1', 'Nb5', 'Kg2', 'Ra8')
    );
    expect(tagged).toBe('weak_back_rank');
  });

  it('does not call an opponent-started recapture a losing exchange', () => {
    // a3 captures nothing. Bxc3 Qxc3 wins the rook, but White never started the trade.
    expect(
      classifyMoment(moment('4k3/8/8/b7/8/2R5/3Q4/4K3 w - - 0 1', 'Kd1', 'Qd3', 'Bxc3+ Qxc3'))
    ).toBeNull();
  });

  it('does not call recaptures inside a sequence the opponent started a losing exchange', () => {
    // Real game (labelled set raziborneo-32-068): bxc5, then Qh5 h6 Bxf7+ Rxf7 Qxf7+.
    // Black's Rxf7 is a recapture in White's sequence on f7; the played capture on c5 was not recaptured.
    expect(
      classifyMoment(moment('r1bq1rk1/b2pnppp/ppp5/2P1P1N1/1P2P3/PB6/1B3PPP/R2Q1RK1 b - - 1 16', 'bxc5', 'Qe8', 'Qh5 h6 Bxf7+ Rxf7 Qxf7+'))
    ).toBeNull();
  });

  it('does not call a forced trade later in the line a losing exchange', () => {
    // Real game (ctrpolar-76-095): Nxe3 wins a pawn; Re1 then forces Qxe1+ Bxe1. The capture the player chose was on e3.
    expect(
      classifyMoment(moment('2r4r/5R2/2p1Qbpk/2Pn4/3PpP1p/4P2P/4qBP1/5RK1 b - - 15 38', 'Nxe3', 'Rhf8', 'Re1 Qxe1+ Bxe1 Bxd4'))
    ).toBeNull();
  });

  it('tags a queen capture on a defended square as a losing exchange, not a hanging piece', () => {
    // Qxd5 lands with no defender. cxd5 wins it; the queen was put there by the capture.
    expect(
      classifyMoment(moment('4k3/8/2p5/3p4/8/8/8/3QK3 w - - 0 1', 'Qxd5', 'Qd2', 'cxd5'))
    ).toBe('losing_exchange');
  });

  it('does not tag a back-rank mate when a forward flight square is empty', () => {
    // Ra1# mates, but d2 is empty (the bishop on e3 only covers it). f2 is empty too.
    expect(
      classifyMoment(moment('r6k/8/8/8/8/2N1b3/4P3/4K3 w - - 0 1', 'Nb5', 'Nd1', 'Ra1#'))
    ).toBe('missed_mate_threat');
  });

  it('returns null for a quiet move, a pawn grab, and a fork that does not win material', () => {
    const start = new Chess().fen();
    expect(classifyMoment(moment(start, 'e4', 'd4', 'e5'))).toBeNull();
    expect(classifyMoment(moment('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'Ke2', 'Kd2', 'dxe4'))).toBeNull();
    expect(
      classifyMoment(moment('k7/8/2n1Q3/8/8/8/P1K5/8 w - - 0 1', 'a3', 'Kd1', 'Nd4+'))
    ).toBeNull();
    expect(classifyMoment({ ply: 1 } as CandidateMoment)).toBeNull();
  });
});

describe('moment payload', () => {
  it('sends code_concept only when the moment has a concept', () => {
    expect(PROMPT_VERSION).toBe('2026-10-11.1');
    const hanging = moment('4k3/p7/8/4n3/8/5N2/P3B3/4K3 w - - 0 1', 'Ba6', 'Bd3', 'Nxf3');
    const payload = buildMomentPayload(hanging, '1000_1400', 'Sam');
    expect(payload.code_concept).toEqual({
      name: 'Hanging piece',
      definition: CONCEPTS.hanging_piece.definition,
    });

    const quiet = moment(new Chess().fen(), 'e4', 'd4', 'e5');
    quiet.concept_id = null;
    expect(buildMomentPayload(quiet, '1000_1400', 'Sam').code_concept).toBeUndefined();
  });
});

describe('selectCandidateMoments quietDriftFallback', () => {
  const pgn = `[Event "Paris"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`;

  function drifted(): { positions: PositionInfo[]; evalMap: Map<string, EngineEvalResult> } {
    const positions = parsePgn(pgn).positions;
    const target = positions.find((p) => p.san === '15.Bxd7+');
    if (!target) throw new Error('fixture missing 15.Bxd7+');
    const evalMap = new Map<string, EngineEvalResult>();
    const flat = (fen: string, evalPawns: number, bestMove = ''): EngineEvalResult => ({
      fen,
      evalPawns,
      bestMove,
      pv: '',
      multipv: [],
    });
    for (const pos of positions) {
      if (!evalMap.has(pos.fenBefore)) evalMap.set(pos.fenBefore, flat(pos.fenBefore, 0));
      if (!evalMap.has(pos.fenAfter)) evalMap.set(pos.fenAfter, flat(pos.fenAfter, 0));
    }
    // -0.9 is inside the quiet-drift band and below the normal -1.5 bar.
    evalMap.set(target.fenBefore, flat(target.fenBefore, 0, 'd1d7'));
    evalMap.set(target.fenAfter, flat(target.fenAfter, -0.9));
    return { positions, evalMap };
  }

  it('yields nothing for a small drift when the fallback is off', () => {
    const { positions, evalMap } = drifted();
    expect(selectCandidateMoments(positions, evalMap, 'white', { quietDriftFallback: false })).toEqual([]);
    const fallback = selectCandidateMoments(positions, evalMap, 'white');
    expect(fallback.map((c) => c.candidateType)).toEqual(['Quiet drift']);
  });
});
