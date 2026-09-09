import { describe, expect, it, vi } from 'vitest';
import { explainSummary } from '../src/analysis/explain.js';

/**
 * A game where nothing crossed the review thresholds must not be summarised by
 * the LLM.
 *
 * SUMMARY_SYSTEM_PROMPT instructs the model that "story references at least two
 * moments by move number". With an empty moments array the only way to satisfy
 * that instruction is to invent move numbers, which is a factual error printed
 * at the top of the report. Selection thresholds (a -1.5 pawn swing, or a
 * -0.75 floor on the quiet-drift fallback) make zero-moment reports a normal
 * outcome for a steadily played game, not an edge case.
 */

const { createChatCompletion } = vi.hoisted(() => ({ createChatCompletion: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createChatCompletion } };
  },
}));

vi.mock('../src/db/supabase.js', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const META = {
  result: '1-0',
  playerColor: 'white' as const,
  playerName: 'Alice',
  opponentName: 'Bob',
  moveCount: 41,
  timeControl: '600+0',
};

describe('explainSummary with no moments', () => {
  it('never calls the LLM', async () => {
    createChatCompletion.mockClear();

    await explainSummary([], META);

    expect(createChatCompletion).not.toHaveBeenCalled();
  });

  it('cites no move numbers, since there are no moments to cite', async () => {
    const summary = await explainSummary([], META);
    const text = `${summary.headline} ${summary.story} ${summary.focus_habit}`;

    expect(text, 'invented a move number for a game with no moments').not.toMatch(/move \d+/i);
    expect(text).not.toMatch(/\d+\s*\./);
  });

  it('does not claim the player played perfectly', async () => {
    const summary = await explainSummary([], META);
    const text = `${summary.headline} ${summary.story}`.toLowerCase();

    // Accuracy guard: zero moments means nothing crossed our thresholds, which
    // is not the same claim as "every move was best".
    for (const overclaim of ['perfect', 'flawless', 'no mistakes', 'every move was best', 'mistake-free']) {
      expect(text, `overclaimed: "${overclaim}"`).not.toContain(overclaim);
    }
    expect(summary.story.length).toBeGreaterThan(80);
  });

  it('still returns a usable habit and the banned report vocabulary is absent', async () => {
    const summary = await explainSummary([], META);
    const text = `${summary.headline} ${summary.story} ${summary.focus_habit}`.toLowerCase();

    expect(summary.focus_habit.length).toBeGreaterThan(20);
    for (const banned of ['blunder', 'inaccuracy', 'centipawn', 'engine', 'accuracy']) {
      expect(text, `used banned report vocabulary: "${banned}"`).not.toContain(banned);
    }
  });
});
