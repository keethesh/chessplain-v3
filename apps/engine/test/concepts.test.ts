import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { classifyMoment, missedChanceFact, type ConceptId } from '../src/analysis/concepts.js';
import { parsePgn } from '../src/analysis/pgn.js';
import { buildMomentPayload, MOMENT_MISSED_CHANCE_RULES, momentSystemPrompt } from '../src/analysis/prompts.js';
import { selectCandidateMoments } from '../src/analysis/select.js';
import type { CandidateMoment, EngineEvalResult, PositionInfo } from '../src/types.js';

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
    {
      id: 'hanging_piece',
      // Nd4 is defended by the e3 pawn, but a pawn takes it: cxd4 exd4 costs a knight for a pawn.
      fen: '4k3/8/8/2p5/8/1N2P3/8/4K3 w - - 0 1',
      played: 'Nd4',
      best: 'Kd2',
      line: 'cxd4 exd4',
    },
    {
      id: 'missed_chance',
      // Rxe5 wins the undefended knight; a3 lets it walk away (and hit the rook).
      fen: '7k/8/8/4n3/8/8/P7/4RK2 w - - 0 1',
      played: 'a3',
      best: 'Rxe5',
      line: 'Nd3',
    },
  ];

  it.each(cases)('$id: $played', ({ id, fen, played, best, line }) => {
    expect(classifyMoment(moment(fen, played, best, line))).toBe(id);
  });

  it('does not call an even trade on a defended square a hanging piece', () => {
    // Nd4 is taken by a knight and recaptured: nothing is lost.
    expect(classifyMoment(moment('4k3/8/8/8/5n2/1N2P3/8/4K3 w - - 0 1', 'Nd4', 'Kd2', 'Nxd4 exd4'))).toBeNull();
  });

  it('does not call a two-point win a missed chance', () => {
    // Bxe5 dxe5 wins only the exchange; at the stored line's length that is too often a line cut short.
    const exchange = moment('4k3/8/3p4/4r3/8/2B5/P7/5K2 w - - 0 1', 'a3', 'Bxe5', 'Re2');
    exchange.bestLineSan = 'Bxe5 dxe5';
    expect(classifyMoment(exchange)).toBeNull();
  });

  it('calls a forced mate given up a missed chance', () => {
    const quiet = moment(new Chess().fen(), 'e4', 'd4', 'e5');
    quiet.evalBefore = 95;
    quiet.evalAfter = 2;
    expect(classifyMoment(quiet)).toBe('missed_chance');
  });

  it('names nothing but a mate once the opponent has a forced mate', () => {
    // Real game (labelled set darkiall-37-064): hxg3+ takes the bishop with a pawn, but it starts mate in 5.
    const mated = moment('2kr2nN/ppp5/2np1p1b/8/Q1NPq2p/2P3BP/PP3KP1/R6R w - - 0 19', 'Rae1', 'Bxd6', 'hxg3+ Kf1 Qf4+');
    mated.bestLineSan = 'Bxd6 Qf5+ Kg1 Rd7';
    mated.evalBefore = 3.36;
    mated.evalAfter = -95;
    expect(classifyMoment(mated)).toBeNull();
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

  it('calls a piece lost to a cheaper attacker the Hanger, not a losing exchange', () => {
    // Kd1 captures nothing. Bxc3 Qxc3 wins the rook for a bishop: White never started a trade,
    // and the rook stood where a cheaper piece could take it.
    expect(
      classifyMoment(moment('4k3/8/8/b7/8/2R5/3Q4/4K3 w - - 0 1', 'Kd1', 'Qd3', 'Bxc3+ Qxc3'))
    ).toBe('hanging_piece');
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

describe('missedChanceFact', () => {
  it('names the piece a free capture would have won', () => {
    // Nxd4 takes the knight on d4; nothing attacks d4 afterwards. Kf2 Ke7 changes nothing.
    const free = moment('4k3/8/8/8/3n4/5N2/8/4K3 w - - 0 1', 'Kf2', 'Nxd4', 'Ke7');
    expect(missedChanceFact(free)).toBe('Nxd4 would have won a knight for nothing. Instead, Kf2 kept the material level.');
  });

  it('does not name a piece when the best line ends mid-exchange', () => {
    // The queen on d8 can still take on d4, so "a knight for nothing" would be false.
    const defended = moment('3qk3/8/8/8/3n4/5N2/8/4K3 w - - 0 1', 'Kf2', 'Nxd4', 'Ke7');
    expect(missedChanceFact(defended)).toBe('Nxd4 would have won material. Instead, Kf2 kept the material level.');
  });

  it('states a mate in N when the eval is the mate encoding', () => {
    // 95 is the engine's mate-in-5 score: 100 − 5.
    const gaveUp = moment(new Chess().fen(), 'e4', 'd4', 'e5');
    gaveUp.evalBefore = 95;
    gaveUp.evalAfter = 1;
    expect(missedChanceFact(gaveUp)).toBe('You had mate in 5 starting with d4. After e4, it is gone.');
  });

  it('states a forced mate without a length when the eval is not that encoding', () => {
    const gaveUp = moment(new Chess().fen(), 'e4', 'd4', 'e5');
    gaveUp.evalBefore = 80.4;
    gaveUp.evalAfter = 1;
    expect(missedChanceFact(gaveUp)).toBe('You had a forced mate starting with d4. After e4, it is gone.');
  });

  it('returns null for a hanging piece', () => {
    expect(missedChanceFact(moment('4k3/p7/8/4n3/8/5N2/P3B3/4K3 w - - 0 1', 'Ba6', 'Bd3', 'Nxf3'))).toBeNull();
  });
});

describe('moment payload', () => {
  it('sends code_concept only when the moment has a concept', () => {
    const hanging = moment('4k3/p7/8/4n3/8/5N2/P3B3/4K3 w - - 0 1', 'Ba6', 'Bd3', 'Nxf3');
    const payload = buildMomentPayload(hanging, '1000_1400', 'Sam');
    expect(payload.code_concept?.name).toBe('Hanging piece');

    const quiet = moment(new Chess().fen(), 'e4', 'd4', 'e5');
    quiet.concept_id = null;
    expect(buildMomentPayload(quiet, '1000_1400', 'Sam').code_concept).toBeUndefined();
  });

  it('tells the model whether a lost piece had a defender', () => {
    // The model cannot see defenders; without the fact it called defended pieces "undefended".
    const bare = buildMomentPayload(moment('4k3/p7/8/4n3/8/5N2/P3B3/4K3 w - - 0 1', 'Ba6', 'Bd3', 'Nxf3'), '1000_1400', 'Sam');
    expect(bare.code_concept?.fact).toBe('Your knight on f3 had no defender.');
    const guarded = buildMomentPayload(moment('4k3/8/8/2p5/8/1N2P3/8/4K3 w - - 0 1', 'Nd4', 'Kd2', 'cxd4 exd4'), '1000_1400', 'Sam');
    expect(guarded.code_concept?.fact).toBe('Your knight on d4 had 1 defender, but a cheaper piece (their pawn) could take it.');
  });

  it('sends the missed-chance fact and leaves out the refutation annotations', () => {
    const missed = moment('4k3/8/8/8/3n4/5N2/8/4K3 w - - 0 1', 'Kf2', 'Nxd4', 'Ke7');
    missed.inGame = { next_moves: [{ move: '1...Ke7', by: 'opponent' }], refutation_moves_played: 1, game_over: false };
    const payload = buildMomentPayload(missed, '1000_1400', 'Sam');
    expect(payload.code_concept?.fact).toBe('Nxd4 would have won a knight for nothing. Instead, Kf2 kept the material level.');
    expect(payload.tactical_context).not.toHaveProperty('opponent_refutation');
    expect(payload.tactical_context).not.toHaveProperty('refutation_moves');
    expect(payload.tactical_context).not.toHaveProperty('after_refutation');
    expect(payload.tactical_context).not.toHaveProperty('refutation_outcome');
    expect(payload.tactical_context).not.toHaveProperty('refutation_sequence');
    expect(payload.tactical_context).not.toHaveProperty('threat_summary');
    expect(payload).not.toHaveProperty('refutation_line');
    expect(payload.tactical_context.best_line_moves.length).toBeGreaterThan(0);
    expect(payload.tactical_context.best_line_outcome).toEqual(expect.any(String));
    expect(payload.in_the_game).toEqual(missed.inGame);
    expect(momentSystemPrompt(payload)).toContain(MOMENT_MISSED_CHANCE_RULES);

    const hanging = buildMomentPayload(moment('4k3/p7/8/4n3/8/5N2/P3B3/4K3 w - - 0 1', 'Ba6', 'Bd3', 'Nxf3'), '1000_1400', 'Sam');
    expect(hanging.tactical_context).toHaveProperty('refutation_moves');
    expect(hanging).toHaveProperty('refutation_line');
    expect(momentSystemPrompt(hanging)).not.toContain(MOMENT_MISSED_CHANCE_RULES);
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
