import { describe, it, expect } from 'vitest';
import {
  extractMoveFacts,
  buildTacticalContext,
  getAttacksFromSquare,
  findMateThreats,
  explainMate,
} from '../src/analysis/chess-facts.js';

describe('Chess Facts Extraction', () => {
  it('identifies piece, origin, and threats before/after a retreat move', () => {
    // Move 14: 14...Nd7 retreat under attack by a5 pawn and b3 queen
    const fenBefore = '2kr3r/pp2qpp1/1npbp1p1/P2pN2n/3P4/1QP1P2P/1P1N1PPB/R3K2R b KQ - 0 14';
    const facts = extractMoveFacts(fenBefore, 'Nd7');

    expect(facts).not.toBeNull();
    expect(facts?.piece).toBe('Black knight');
    expect(facts?.from).toBe('b6');
    expect(facts?.to).toBe('d7');
    expect(facts?.attacked_before_move).toContain('White pawn on a5');
    expect(facts?.attacks_after_move).toContain('White knight on e5');
  });

  it('identifies best move counter-threats', () => {
    const fenBefore = '2kr3r/pp2qpp1/1npbp1p1/P2pN2n/3P4/1QP1P2P/1P1N1PPB/R3K2R b KQ - 0 14';
    const facts = extractMoveFacts(fenBefore, 'Nc4');

    expect(facts).not.toBeNull();
    expect(facts?.piece).toBe('Black knight');
    expect(facts?.from).toBe('b6');
    expect(facts?.to).toBe('c4');
    expect(facts?.attacks_after_move).toContain('White knight on d2');
    expect(facts?.attacks_after_move).toContain('White knight on e5');
  });

  it('builds complete tactical context for the prompt', () => {
    const fenBefore = '2kr3r/pp2qpp1/1npbp1p1/P2pN2n/3P4/1QP1P2P/1P1N1PPB/R3K2R b KQ - 0 14';
    const ctx = buildTacticalContext(fenBefore, '14...Nd7', 'Nc4', 'a6 Nxe5 dxe5');

    expect(ctx.played_move?.from).toBe('b6');
    expect(ctx.played_move?.to).toBe('d7');
    expect(ctx.best_move?.from).toBe('b6');
    expect(ctx.best_move?.to).toBe('c4');
    expect(ctx.opponent_refutation?.san).toBe('a6');
    expect(ctx.threat_summary).toContain('under attack');
  });

  it('handles checkmate move correctly and filters king from attacks_after_move', () => {
    const fenBefore = '3rrk2/R7/7R/8/1P2p2P/P2B2P1/5P2/6K1 w - - 0 44';
    const facts = extractMoveFacts(fenBefore, 'Rh8#');

    expect(facts).not.toBeNull();
    expect(facts?.is_checkmate).toBe(true);
    expect(facts?.description).toContain('checkmate');
    // F2: Must not report the opposing king as an attacked/capturable piece
    for (const attack of facts?.attacks_after_move || []) {
      expect(attack.toLowerCase()).not.toContain('king');
    }
  });

  it('correctly reports en passant captured square on original pawn rank (F1)', () => {
    // En passant: black d4 pawn takes white e4 pawn landing on e3
    const fenBefore = 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3';
    const facts = extractMoveFacts(fenBefore, 'dxe3');

    expect(facts).not.toBeNull();
    expect(facts?.from).toBe('d4');
    expect(facts?.to).toBe('e3');
    // Captured piece was on e4, NOT e3
    expect(facts?.captured).toBe('White pawn on e4');
    expect(facts?.description).toContain('capturing White pawn on e4');
  });

  it('accurately describes promotions and landing piece (F4)', () => {
    const fenBefore = 'rnbqkbnr/pPp1pppp/8/8/8/8/P1PPPPPP/RNBQKBNR w KQkq - 0 5';
    const facts = extractMoveFacts(fenBefore, 'bxa8=Q');

    expect(facts).not.toBeNull();
    expect(facts?.piece).toBe('White queen');
    expect(facts?.from).toBe('b7');
    expect(facts?.to).toBe('a8');
    expect(facts?.captured).toBe('Black rook on a8');
    expect(facts?.description).toContain('promoting to queen');
    expect(facts?.description).toContain('capturing Black rook on a8');
  });

  it('deduplicates attacks from square on capture-promotions (F3)', () => {
    const fenBefore = 'rnbqkbnr/pPp1pppp/8/8/8/8/P1PPPPPP/RNBQKBNR w KQkq - 0 5';
    const attacks = getAttacksFromSquare(fenBefore, 'b7');

    const uniqueAttacks = new Set(attacks);
    expect(attacks.length).toBe(uniqueAttacks.size);
    expect(attacks).toContain('Black rook on a8');
    expect(attacks).toContain('Black bishop on c8');
  });

  it('explains the quiet mating threat that makes the obvious escape fail', () => {
    // Production report 6992cfc4: 18...Ne3 19.Qxc5 Nxf1 20.Qc3. The explanation
    // never said why Black cannot just save the f1 knight: Qc3 lines up with the
    // a1 bishop and Qxg7 is mate. Only Qxc5 used to be annotated.
    const fenBefore = '2rq1rk1/p4ppp/2p1p3/2nn4/8/3P1BP1/P1Q3PP/BR3RK1 b - - 2 18';
    const ctx = buildTacticalContext(fenBefore, '18...Ne3', 'Nd7', 'Qxc5 Nxf1 Qc3');

    expect(ctx.refutation_moves.map((m) => m.san)).toEqual(['Qxc5', 'Nxf1', 'Qc3']);
    expect(ctx.refutation_moves[1].captured).toBe('White rook on f1');
    expect(ctx.refutation_moves[2].threatens_checkmate).toContain('Qxg7#');
    expect(ctx.after_refutation).toContain('Black knight on f1');
    expect(ctx.after_refutation).toMatch(/after N\w+, Qxg7# is checkmate/);
    expect(ctx.threat_summary).toContain('Qc3 threatens Qxg7#');
  });

  it('does not invent threats when the side to move is in check', () => {
    // White is in check from the e7 queen; a null move would be illegal.
    expect(findMateThreats('4k3/4q3/8/8/8/8/8/4K3 w - - 0 1', 'b')).toEqual([]);
  });

  // The next three cases scored low on "explains why" for every benchmarked
  // model (2026-09-23): the inputs lacked the reason, not the models.

  it("marks which side plays each move, so the player's own check is not credited to the opponent", () => {
    const ctx = buildTacticalContext('rn2kb1r/pp2qppp/2p2n2/4p1B1/2B1P3/1QN5/PPP2PPP/R3K2R b KQkq - 1 9', '9...b5', 'Kd8', 'Nxb5 Qb4+ Qxb4');

    expect(ctx.refutation_moves.map((m) => [m.san, m.by])).toEqual([
      ['Nxb5', 'opponent'],
      ['Qb4+', 'you'],
      ['Qxb4', 'opponent'],
    ]);
    expect(ctx.refutation_outcome).toBe('By the end of this line, you have lost a queen and a pawn and the opponent has lost nothing.');
  });

  it('says why a checkmate is mate', () => {
    const ctx = buildTacticalContext('r1b1kbnr/pppp1Npp/8/8/2Bnq3/8/PPPP1P1P/RNBQKR2 w Qkq - 0 7', '7.Be2', 'Qe2', 'Nf3#');
    const reason = ctx.refutation_moves[0].mate_reason!;

    expect(reason).toContain('White king on e1 is in check from the Black knight on f3');
    for (const sq of ['d1 (its own queen)', 'e2 (its own bishop)', 'f1 (its own rook)', 'd2 (its own pawn)', 'f2 (its own pawn)']) {
      expect(reason).toContain(sq);
    }
  });

  it('annotates the better line and what it wins, not just its first move', () => {
    const ctx = buildTacticalContext(
      'r1b4r/1pN1kpp1/p1np1q1p/2b1p3/2B1P3/3P1N2/PPP2PPP/R2QK2R w KQ - 1 10',
      '10.Nxa8',
      'Nd5+',
      'Kd8 c3 b5',
      'Nd5+ Kd8 Nxf6 gxf6'
    );

    expect(ctx.best_line_moves[0].is_check).toBe(true);
    expect(ctx.best_line_moves[0].attacks_after_move).toContain('Black queen on f6');
    expect(ctx.best_line_moves[2]).toMatchObject({ san: 'Nxf6', by: 'you', captured: 'Black queen on f6' });
    expect(ctx.best_line_outcome).toBe('By the end of this line, you have lost a knight and the opponent has lost a queen.');
  });

  it('explains a back-rank mate, and returns null for a position that is not mate', () => {
    expect(explainMate('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')).toBeNull();
    const mate = explainMate('R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1')!;
    expect(mate).toContain('Black king on g8 is in check from the White rook on a8');
    expect(mate).toContain('f7 (its own pawn)');
    // f8 and h8 are along the checking rank: covered, not free.
    expect(mate).toMatch(/f8 by the White rook on a8/);
    expect(mate).toMatch(/h8 by the White rook on a8/);
  });
});
