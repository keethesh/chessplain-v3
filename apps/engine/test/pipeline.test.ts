import { describe, it, expect } from 'vitest';
import { parsePgn, computeGamePhase, computeMaterialNote } from '../src/analysis/pgn.js';
import { findBannedTokens, validateMomentJson, validateSummaryJson } from '../src/analysis/prompts.js';

const SAMPLE_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.08.31"]
[White "Player1"]
[Black "Player2"]
[Result "0-1"]
[WhiteElo "1150"]
[BlackElo "1180"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 0-1`;

describe('PGN Analysis', () => {
  it('parses PGN headers and moves', () => {
    const parsed = parsePgn(SAMPLE_PGN);
    expect(parsed.playerName).toBe('Player1');
    expect(parsed.opponentName).toBe('Player2');
    expect(parsed.positions.length).toBe(12);
    expect(parsed.positions[0].san).toBe('1.e4');
  });

  it('computes game phase correctly', () => {
    const openingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(computeGamePhase(openingFen)).toBe('opening');

    const endgameFen = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1';
    expect(computeGamePhase(endgameFen)).toBe('endgame');
  });

  it('computes material notes', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const note = computeMaterialNote(startFen, startFen, 'white');
    expect(note).toBe('Material was even.');
  });
});

describe('Prompts and Banned Tokens', () => {
  it('detects banned tokens correctly', () => {
    expect(findBannedTokens('This was a major blunder on move 5')).toContain('blunder');
    expect(findBannedTokens('An inaccuracy that cost the game')).toContain('inaccuracy');
    expect(findBannedTokens('Better was 31.Rd1')).toContain('Better was');
    expect(findBannedTokens('Stockfish evaluated this poorly')).toContain('Stockfish');
    expect(findBannedTokens('eval dropped by 3.5')).toContain('eval');
    expect(findBannedTokens('Your accuracy was 85%')).toContain('accuracy');

    // Clean text
    expect(findBannedTokens('You traded your bishop for a pawn.')).toHaveLength(0);
  });

  it('validates moment JSON successfully for gold standard output', () => {
    const goldMoment = {
      played: '23.Bxf7+',
      probable_thought: 'If I grab the pawn, my fork wins it straight back — I stay up material.',
      what_actually_happens: "The bishop gets kicked to h5 and never returns. From here on, you're defending the dark squares around your king with pieces that can't see them — that's why the position felt worse every move.",
      concept_name: 'Trapped piece',
      concept_definition: 'a piece with no safe squares left',
      takeaway: 'Next game, before taking a pawn: where does my piece land, and how does it come back?',
      severity_label: 'Turning point',
    };

    const result = validateMomentJson(goldMoment);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects moment JSON with invalid definition length or banned words', () => {
    const badMoment = {
      played: '23.Bxf7+',
      probable_thought: 'I made a huge blunder here.',
      what_actually_happens: 'The king takes the piece.',
      concept_name: 'Trapped piece',
      concept_definition: 'a piece with no safe squares left to move anywhere on board', // 11 words > 8
      takeaway: 'Think before moving.',
      severity_label: 'Turning point',
    };

    const result = validateMomentJson(badMoment);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('Banned tokens'))).toBe(true);
    expect(result.errors.some((e) => e.includes('exceeds 8 words'))).toBe(true);
  });

  it('validates summary JSON successfully', () => {
    const goldSummary = {
      headline: "You didn't lose this in the endgame.",
      story: 'Move 23 was the whole story. You traded your good bishop for a pawn, and the dark squares around your king stayed weak for the rest of the game. Move 31 was your last real chance — the rook lift was one tempo too slow. After that, Carlos converted cleanly.',
      focus_habit: 'Before taking a free pawn, trace where the piece lands and how it comes back.',
    };

    const result = validateSummaryJson(goldSummary);
    expect(result.isValid).toBe(true);
  });
});
