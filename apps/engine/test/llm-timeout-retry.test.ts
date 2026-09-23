import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A single slow LLM response must not cost the reader a real explanation.
 *
 * `AbortSignal.timeout(30_000)` caps the entire request, including the OpenAI
 * SDK's own `maxRetries`, so before this guard a timeout was terminal and the
 * moment silently degraded to `createFallbackMoment` prose. The 20-game live
 * run on 2026-09-09 hit it on 2 of ~50 moments (~4%).
 *
 * Credit exhaustion must NOT be retried — every attempt fails and the worker
 * records it as terminal.
 */

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

vi.mock('../src/db/supabase.js', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const abortError = () => Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
const creditError = () => new Error('not enough credits to complete this request');

const goodMomentJson = JSON.stringify({
  played: '15.Bxd7+',
  severity_label: 'Turning point',
  probable_thought: 'You wanted to trade into a calmer position after the pressure built up on the file.',
  what_actually_happens: 'The recapture arrives with tempo and the loose piece on the far side drops next move.',
  why_better: 'Keeping the rook on the file holds everything together.',
  concept_name: 'Loose piece',
  concept_definition: 'an undefended piece inviting capture',
  takeaway: 'Before trading, check which of your pieces is left undefended afterwards.',
});

const reply = (content: string) => ({ choices: [{ message: { content } }] });

const MOMENT = {
  ply: 29,
  moveNumber: 15,
  san: '15.Bxd7+',
  uci: 'b5d7',
  fenBefore: '4kb1r/p2r1ppp/4qn2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 2 15',
  fenAfter: '4kb1r/p2B1ppp/4qn2/4p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 0 15',
  playerColor: 'white' as const,
  evalBefore: 3.0,
  evalAfter: 1.0,
  swing: -2.0,
  bestMoveSan: 'Rxd7',
  bestMoveUci: 'd1d7',
  refutationLineSan: 'Rxd7 Qxd7',
  bestLineSan: 'Rxd7 Qxd7',
  phase: 'middlegame' as const,
  materialNote: '',
  candidateType: 'Turning point' as const,
};

describe('LLM timeout retry', () => {
  beforeEach(() => {
    create.mockReset();
    // explain.ts imports config.ts, which requires these and has no defaults
    // by design. Set them so the suite does not depend on a developer's local
    // apps/engine/.env — without this it passes on a laptop and fails in CI.
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retries once after a timeout and returns the real explanation', async () => {
    const { explainMoment } = await import('../src/analysis/explain.js');
    create.mockRejectedValueOnce(abortError()).mockResolvedValueOnce(reply(goodMomentJson));

    const result = await explainMoment(MOMENT, '1000_1400', 'analysis-1');

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.concept_name).toBe('Loose piece');
    expect(result.probable_thought).not.toContain('cannot be inferred');
  });

  it('gives up after the second timeout rather than looping', async () => {
    const { explainMoment } = await import('../src/analysis/explain.js');
    create.mockRejectedValue(abortError());

    const result = await explainMoment(MOMENT, '1000_1400', 'analysis-2');

    expect(create).toHaveBeenCalledTimes(2);
    // Degrades to the honest fallback rather than throwing.
    expect(result.probable_thought).toContain('cannot be inferred');
  });

  it('does not retry a credit-exhaustion failure', async () => {
    const { explainMoment } = await import('../src/analysis/explain.js');
    create.mockRejectedValue(creditError());

    await explainMoment(MOMENT, '1000_1400', 'analysis-3');

    expect(create, 'burned a second call on an error that fails every time').toHaveBeenCalledTimes(1);
  });
});
