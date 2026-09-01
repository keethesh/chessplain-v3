import { describe, it, expect } from 'vitest';
import { extractMoveFacts, buildTacticalContext } from '../src/analysis/chess-facts.js';

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

  it('handles checkmate move correctly', () => {
    const fenBefore = '3rrk2/R7/7R/8/1P2p2P/P2B2P1/5P2/6K1 w - - 0 44';
    const facts = extractMoveFacts(fenBefore, 'Rh8#');

    expect(facts).not.toBeNull();
    expect(facts?.is_checkmate).toBe(true);
    expect(facts?.description).toContain('checkmate');
  });
});
