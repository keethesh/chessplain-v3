import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';

/**
 * Chess variants must be rejected with an explanation, never with a raw
 * chess-rules error.
 *
 * Found by the live acceptance gate on 2026-09-09: reviewing the most recent
 * game for Chess.com user 'erik' failed with "Invalid FEN: castling
 * availability is invalid". The game was Chess960 — a shuffled start position
 * whose castling rights use Shredder-FEN files ("GAga") rather than KQkq.
 * Standard chess rules reject that outright, so the pipeline died deep inside
 * analysis instead of saying what was wrong.
 */

const CHESS960_PGN = `[Event "Let's Play! - Chess960"]
[Variant "Chess960"]
[SetUp "1"]
[FEN "rnkbbqrn/pppppppp/8/8/8/8/PPPPPPPP/RNKBBQRN w GAga - 0 1"]
[White "erik"]
[Black "opponent"]
[Result "1-0"]

1. e4 e5 2. Qg4 1-0`;

const STANDARD_PGN = `[Event "Rated blitz game"]
[White "alice"]
[Black "bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

// Mirrors the guard in apps/engine/src/http/server.ts (POST /api/reports).
function detectUnsupportedVariant(pgn: string): string | null {
  const variant = pgn.match(/^\[Variant\s+"([^"]+)"/m)?.[1];
  if (variant && !/^(standard|chess)$/i.test(variant.trim())) return variant;
  return null;
}

// Mirrors the filter in apps/engine/src/analysis/chesscom.ts.
function isStandardGame(game: { pgn?: string; rules?: string }): boolean {
  return Boolean(game.pgn) && (game.rules ?? 'chess') === 'chess' && !/^\[Variant\s/m.test(game.pgn as string);
}

describe('variant handling', () => {
  it('confirms the Chess960 start position is genuinely unloadable', () => {
    // Establishes that the guards are load-bearing rather than defensive noise.
    expect(() => new Chess('rnkbbqrn/pppppppp/8/8/8/8/PPPPPPPP/RNKBBQRN w GAga - 0 1')).toThrow(/castling/i);
  });

  it('flags a pasted Chess960 PGN by name', () => {
    expect(detectUnsupportedVariant(CHESS960_PGN)).toBe('Chess960');
  });

  it('lets a standard PGN through', () => {
    expect(detectUnsupportedVariant(STANDARD_PGN)).toBeNull();
    const parsed = new Chess();
    parsed.loadPgn(STANDARD_PGN);
    expect(parsed.history().length).toBe(7);
  });

  it('treats a PGN carrying [Variant "Standard"] as standard', () => {
    expect(detectUnsupportedVariant(STANDARD_PGN.replace('[Event', '[Variant "Standard"]\n[Event'))).toBeNull();
  });

  it('skips variant games when picking a Chess.com game to review', () => {
    const archive = [
      { pgn: STANDARD_PGN, rules: 'chess' },
      { pgn: STANDARD_PGN, rules: 'chess' },
      { pgn: CHESS960_PGN, rules: 'chess960' }, // most recent, must be skipped
    ];

    const standard = archive.filter(isStandardGame);

    expect(standard.length).toBe(2);
    expect(standard[standard.length - 1].rules).toBe('chess');
  });

  it('excludes a variant game even when the rules field is missing', () => {
    expect(isStandardGame({ pgn: CHESS960_PGN })).toBe(false);
    expect(isStandardGame({ pgn: STANDARD_PGN })).toBe(true);
  });
});
