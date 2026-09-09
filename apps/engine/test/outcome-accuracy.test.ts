import { describe, expect, it } from 'vitest';
import { validateSummaryJson } from '../src/analysis/prompts.js';

/**
 * The report must never contradict the result of the game.
 *
 * Observed on a real pipeline run: the Opera Game reviewed from White's side —
 * White mates on move 17 — produced "By move 17, the pressure had built into a
 * wall you couldn't climb. After that, Duke Karl converted cleanly." The player
 * had won by checkmate.
 *
 * Cause: SUMMARY_SYSTEM_PROMPT opened with "the first thing a player reads
 * after a loss" and its only gold-standard example ended with the opponent
 * converting, so every game was narrated as a defeat. Roughly half of a
 * player's games are wins.
 */

const base = {
  headline: 'This was closer than the result looks.',
  focus_habit: 'Before moving a centre knight, check which diagonal it stops covering.',
};

const summary = (story: string, headline = base.headline) => ({ ...base, headline, story });

describe('summary outcome accuracy', () => {
  it('rejects crediting the finish to the opponent when the player won', () => {
    const result = validateSummaryJson(
      summary(
        'Move 8 was the turning point. Move 14 gave more back. By move 17 the pressure had built into a wall. After that, Duke Karl converted cleanly.'
      ),
      'won'
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/WON but the summary credits the finish to the opponent/);
  });

  it('rejects telling a winner they lost', () => {
    const result = validateSummaryJson(
      summary('Move 12 slipped. Move 20 was the last chance and you lost the thread completely.'),
      'won'
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/WON but the summary says they lost/);
  });

  it('accepts a won game narrated as a win', () => {
    const result = validateSummaryJson(
      summary(
        'Move 14 handed back most of your advantage. Move 22 was the moment you took it back, trading into a rook endgame a pawn up. You closed it out from there, but the loose-centre habit nearly cost you.'
      ),
      'won'
    );

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('still accepts the opponent converting when the player actually lost', () => {
    const result = validateSummaryJson(
      summary(
        'Move 23 was the whole story. Move 31 was your last real chance. After that, Carlos converted cleanly.',
        'You didn’t lose this in the endgame.'
      ),
      'lost'
    );

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('rejects declaring a winner when the game was drawn', () => {
    const result = validateSummaryJson(
      summary('Move 30 was the turning point and you won the resulting endgame.'),
      'drew'
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/DRAW but the summary declares a winner/);
  });

  it('stays permissive when the outcome is unknown', () => {
    const result = validateSummaryJson(
      summary('Move 23 was the whole story. After that, Carlos converted cleanly.'),
      'unknown'
    );

    expect(result.isValid).toBe(true);
  });
});
