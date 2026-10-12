import { describe, expect, it, vi } from 'vitest';
import { explainSummary, opponentMoveCreditedToPlayer } from '../src/analysis/explain.js';
import type { MomentReport } from '../src/types.js';

/**
 * A summary once said "you played …Kf1" for a move the opponent played.
 * in_the_game already labels each move with `by`; the check rejects the
 * sentence that ignores it, which sends the summary through the existing retry.
 */

const { createChatCompletion } = vi.hoisted(() => ({ createChatCompletion: vi.fn() }));

vi.mock('../src/config.js', () => ({
  config: {
    llmApiBase: 'https://llm.test.invalid/v1',
    llmApiKey: 'test-llm-key',
    llmModel: 'test-model',
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    supabaseServiceRoleKey: '',
    posthogKey: '',
    posthogHost: 'https://posthog.test.invalid',
  },
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createChatCompletion } };
  },
}));

vi.mock('../src/db/supabase.js', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const reply = (content: string) => ({ choices: [{ message: { content } }] });

const moment: MomentReport = {
  ply: 47,
  move_number: 24,
  played: '24.Qe2',
  probable_thought: 'The queen steps aside.',
  what_actually_happens: 'The king on e1 stays on the file.',
  why_better: '24.Qd2 keeps the queen on the file.',
  concept_name: 'Hanging piece',
  concept_definition: 'a piece nothing defends',
  takeaway: 'Before moving the queen, look at the king.',
  severity_label: 'Turning point',
  fen_before: '8/8/8/8/8/8/8/4K3 w - - 0 24',
  fen_after: '8/8/8/8/8/8/8/4K3 b - - 1 24',
  player_color: 'white',
  best_move: 'Qd2',
  refutation_line: 'Kf1',
  eval_swing: -2,
  concept_id: 'hanging_piece',
  in_game: {
    next_moves: [{ move: '24...Kf1', by: 'opponent' }],
    refutation_moves_played: 0,
    game_over: false,
  },
};

const credited = (story: string) => ({
  headline: "You didn't lose this in the endgame.",
  story,
  focus_habit: 'Before moving the queen, look at the king.',
});

const META = {
  result: '0-1',
  playerColor: 'white' as const,
  playerName: 'Alice',
  opponentName: 'Bob',
  moveCount: 40,
};

describe('opponent move credited to the player', () => {
  it('flags "you played" for an opponent-only move, including the ellipsis form', () => {
    expect(opponentMoveCreditedToPlayer('Then you played ...Kf1 and the file opened.', [moment])).toBe('24...Kf1');
    expect(opponentMoveCreditedToPlayer('Then you played …Kf1 and the file opened.', [moment])).toBe('24...Kf1');
    expect(opponentMoveCreditedToPlayer('You played 24...Kf1.', [moment])).toBe('24...Kf1');
  });

  it('does not flag a later opponent move, or a SAN the player also played', () => {
    expect(opponentMoveCreditedToPlayer('You played 24.Qe2, and they answered ...Kf1.', [moment])).toBeNull();
    const both = {
      played: '13.Kf1',
      in_game: { next_moves: [{ move: '24...Kf1', by: 'opponent' as const }] },
    };
    expect(opponentMoveCreditedToPlayer('You played ...Kf1.', [both])).toBeNull();
  });

  it('retries a summary that credits the opponent move to the player', async () => {
    createChatCompletion.mockReset();
    const bad = credited('Move 24 left the king. Then you played ...Kf1 and the file opened. After that, Bob converted cleanly.');
    const good = credited('Move 24 left the king. Their king stepped to f1 and the file opened. After that, Bob converted cleanly.');
    createChatCompletion.mockResolvedValueOnce(reply(JSON.stringify(bad))).mockResolvedValueOnce(reply(JSON.stringify(good)));

    const summary = await explainSummary([moment], META);

    expect(createChatCompletion).toHaveBeenCalledTimes(2);
    expect(summary.story).toBe(good.story);
  });

  it('falls back when both summaries credit the opponent move to the player', async () => {
    createChatCompletion.mockReset();
    const bad = credited('Move 24 left the king. Then you played ...Kf1 and the file opened. After that, Bob converted cleanly.');
    createChatCompletion.mockResolvedValue(reply(JSON.stringify(bad)));

    const summary = await explainSummary([moment], META);

    expect(createChatCompletion).toHaveBeenCalledTimes(2);
    expect(summary.headline).toBe('Start your review at move 24.');
    expect(`${summary.headline} ${summary.story}`).not.toMatch(/you played/i);
  });
});
