import { describe, it, expect } from 'vitest';
import {
  extractMoveFacts,
  buildTacticalContext,
  getAttacksFromSquare,
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
});
